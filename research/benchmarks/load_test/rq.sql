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
