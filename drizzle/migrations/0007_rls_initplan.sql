-- 0007: make RLS checks run once per query instead of once per row.
-- Postgres re-evaluates has_role(auth.uid(), ...) for every row it scans unless the call is wrapped
-- in a scalar sub-select, which the planner turns into a one-time InitPlan. Same rules, much faster
-- on large tables (see drizzle/tests/bench_results.md).
ALTER POLICY "role read patients" ON public.patients USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "worker insert patients" ON public.patients WITH CHECK (((SELECT public.has_role((SELECT auth.uid()),'health_worker')) OR (SELECT public.has_role((SELECT auth.uid()),'admin'))) AND created_by = (SELECT auth.uid()));
ALTER POLICY "role read images" ON public.eye_images USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "worker insert images" ON public.eye_images WITH CHECK (((SELECT public.has_role((SELECT auth.uid()),'health_worker')) OR (SELECT public.has_role((SELECT auth.uid()),'admin'))) AND created_by = (SELECT auth.uid()));
ALTER POLICY "role read reviews" ON public.reviews USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "doctor insert review" ON public.reviews WITH CHECK (((SELECT public.has_role((SELECT auth.uid()),'doctor')) OR (SELECT public.has_role((SELECT auth.uid()),'admin'))) AND doctor_id = (SELECT auth.uid()));
ALTER POLICY "role read sites" ON public.sites USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "research roles read settings" ON public.settings USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "model_runs read" ON public.model_runs USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "hospitals read" ON public.hospitals USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "vision read" ON public.vision_tests USING ((SELECT public.has_any_role((SELECT auth.uid()))));
ALTER POLICY "vision insert" ON public.vision_tests WITH CHECK (((SELECT public.has_role((SELECT auth.uid()),'health_worker')) OR (SELECT public.has_role((SELECT auth.uid()),'admin'))) AND created_by = (SELECT auth.uid()));
ALTER POLICY "contacts read: admin, doctor, creator" ON public.patient_contacts
  USING ((SELECT public.has_role((SELECT auth.uid()),'admin')) OR (SELECT public.has_role((SELECT auth.uid()),'doctor')) OR created_by = (SELECT auth.uid()));
ALTER POLICY "contacts insert: worker/admin" ON public.patient_contacts
  WITH CHECK (((SELECT public.has_role((SELECT auth.uid()),'health_worker')) OR (SELECT public.has_role((SELECT auth.uid()),'admin'))) AND created_by = (SELECT auth.uid()));
ALTER POLICY "predictions read (blinded for doctors)" ON public.predictions USING (
  (SELECT public.has_role((SELECT auth.uid()),'admin')) OR created_by = (SELECT auth.uid()) OR (SELECT public.has_role((SELECT auth.uid()),'health_worker'))
  OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.eye_image_id = predictions.eye_image_id AND r.doctor_id = (SELECT auth.uid())));
ALTER POLICY "predictions insert by creator of image" ON public.predictions
  WITH CHECK (created_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.eye_images e WHERE e.id = eye_image_id AND e.created_by = (SELECT auth.uid())));
ALTER POLICY "referrals read" ON public.referrals USING (
  (SELECT public.has_role((SELECT auth.uid()),'admin')) OR (SELECT public.has_role((SELECT auth.uid()),'doctor'))
  OR ((SELECT public.has_role((SELECT auth.uid()),'health_worker')) AND patient_visible));
ALTER POLICY "referrals update" ON public.referrals
  USING ((SELECT public.has_role((SELECT auth.uid()),'admin')) OR (SELECT public.has_role((SELECT auth.uid()),'doctor')) OR ((SELECT public.has_role((SELECT auth.uid()),'health_worker')) AND patient_visible))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()),'admin')) OR (SELECT public.has_role((SELECT auth.uid()),'doctor')) OR ((SELECT public.has_role((SELECT auth.uid()),'health_worker')) AND patient_visible));

-- Review queue: open referrals by clinical order without sorting the whole table.
ALTER TABLE public.referrals ADD COLUMN priority_rank smallint GENERATED ALWAYS AS (CASE priority WHEN 'urgent' THEN 0 WHEN 'audit' THEN 1 ELSE 2 END) STORED;
CREATE INDEX idx_referrals_queue ON public.referrals (priority_rank, created_at) WHERE status = 'awaiting_doctor';
CREATE INDEX idx_reviews_doctor_eye ON public.reviews (doctor_id, eye_image_id);

-- Doctor review queue computed in the database (was: download every confirmed photo to the phone).
-- Urgent AI referrals first, then the hidden audit sample, then other referrals, then unreferred photos (oldest first).
-- SECURITY INVOKER: normal RLS applies to the caller.
CREATE OR REPLACE FUNCTION public.review_queue(_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, eye text, storage_path text, pupil_roi_path text, pupil_circle_confirmed boolean,
               circle_cx double precision, circle_cy double precision, circle_r double precision,
               study_id text, age integer, sex text, priority text, referral_status text, pending_referrals bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  lim AS (SELECT greatest(1, least(_limit, 100)) AS n),
  -- 1) eyes of patients with an open referral, in clinical order (uses idx_referrals_queue)
  ref AS (
    SELECT e.id, e.eye, e.storage_path, e.pupil_roi_path, e.pupil_circle_confirmed, e.circle_cx, e.circle_cy, e.circle_r,
           p.study_id, p.age, p.sex, r.priority, r.status, r.priority_rank AS rank, r.created_at AS t
    FROM referrals r JOIN patients p ON p.id = r.patient_id JOIN eye_images e ON e.patient_id = p.id, me
    WHERE r.status = 'awaiting_doctor' AND e.pupil_circle_confirmed
      AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.eye_image_id = e.id AND v.doctor_id = me.uid)
    ORDER BY r.priority_rank, r.created_at LIMIT (SELECT n FROM lim)
  ),
  -- 2) then other confirmed photos for the research labels, oldest first (uses idx_eye_images_created)
  rest AS (
    SELECT e.id, e.eye, e.storage_path, e.pupil_roi_path, e.pupil_circle_confirmed, e.circle_cx, e.circle_cy, e.circle_r,
           p.study_id, p.age, p.sex, NULL::text, NULL::text, 3::smallint, e.created_at
    FROM eye_images e JOIN patients p ON p.id = e.patient_id, me
    WHERE e.pupil_circle_confirmed
      AND NOT EXISTS (SELECT 1 FROM referrals r WHERE r.patient_id = p.id AND r.status = 'awaiting_doctor')
      AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.eye_image_id = e.id AND v.doctor_id = me.uid)
    ORDER BY e.created_at LIMIT (SELECT n FROM lim)
  )
  SELECT x.id, x.eye, x.storage_path, x.pupil_roi_path, x.pupil_circle_confirmed, x.circle_cx, x.circle_cy, x.circle_r, x.study_id, x.age, x.sex,
         x.priority, x.status, (SELECT count(*) FROM referrals WHERE status = 'awaiting_doctor')
  FROM (SELECT * FROM ref UNION ALL SELECT * FROM rest) x ORDER BY x.rank, x.t LIMIT (SELECT n FROM lim)
$$;
GRANT EXECUTE ON FUNCTION public.review_queue(integer) TO authenticated;
