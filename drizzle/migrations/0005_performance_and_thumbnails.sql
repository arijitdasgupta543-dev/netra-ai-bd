ALTER TABLE public.eye_images ADD COLUMN thumb_path text;
ALTER TABLE public.eye_images ADD COLUMN circle_method text;
COMMENT ON COLUMN public.eye_images.thumb_path IS '160x160 pupil-only thumbnail for lists';
COMMENT ON COLUMN public.eye_images.circle_method IS 'auto | manual | auto-then-edited';

CREATE INDEX idx_eye_images_patient ON public.eye_images (patient_id);
CREATE INDEX idx_eye_images_created ON public.eye_images (created_at);
CREATE INDEX idx_reviews_eye_image ON public.reviews (eye_image_id);
CREATE INDEX idx_reviews_doctor ON public.reviews (doctor_id);
CREATE INDEX idx_patients_site ON public.patients (site_id);
CREATE INDEX idx_patients_created ON public.patients (created_at);
CREATE INDEX idx_patients_study_id ON public.patients (study_id);
CREATE INDEX idx_user_roles_user ON public.user_roles (user_id);

CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT has_any_role(auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  WITH cons AS (
    SELECT r.eye_image_id, r.diagnosis, count(*) AS n
    FROM reviews r GROUP BY 1, 2
  ),
  maj AS (
    SELECT c.eye_image_id, c.diagnosis FROM cons c
    WHERE c.n > (SELECT count(*) / 2.0 FROM reviews r WHERE r.eye_image_id = c.eye_image_id)
      AND NOT EXISTS (SELECT 1 FROM cons c2 WHERE c2.eye_image_id = c.eye_image_id AND c2.diagnosis <> c.diagnosis AND c2.n >= c.n)
  )
  SELECT jsonb_build_object(
    'patients', (SELECT count(*) FROM patients),
    'eyes', (SELECT count(*) FROM eye_images),
    'reviewed', (SELECT count(DISTINCT eye_image_id) FROM reviews),
    'pass', coalesce((SELECT avg((quality_status = 'good')::int) FROM eye_images), 0),
    'sex', coalesce((SELECT jsonb_object_agg(coalesce(sex, '?'), n) FROM (SELECT sex, count(*) n FROM patients GROUP BY sex) s), '{}'::jsonb),
    'age', coalesce((SELECT jsonb_object_agg(g, n) FROM (SELECT CASE WHEN age IS NULL THEN '?' WHEN age < 18 THEN '0–17' WHEN age < 40 THEN '18–39' WHEN age < 60 THEN '40–59' WHEN age < 75 THEN '60–74' ELSE '75+' END g, count(*) n FROM patients GROUP BY 1) a), '{}'::jsonb),
    'sites', coalesce((SELECT jsonb_object_agg(coalesce(s.name, '?'), x.n) FROM (SELECT p.site_id, count(*) n FROM eye_images e JOIN patients p ON p.id = e.patient_id GROUP BY 1) x LEFT JOIN sites s ON s.id = x.site_id), '{}'::jsonb),
    'labels', coalesce((SELECT jsonb_object_agg(diagnosis, n) FROM (SELECT diagnosis, count(*) n FROM maj GROUP BY diagnosis) l), '{}'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;

DROP POLICY IF EXISTS "role read eye photos" ON storage.objects;
CREATE POLICY "role read eye photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'eye-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_any_role(auth.uid()) AND (
    name IN (SELECT pupil_roi_path FROM public.eye_images WHERE pupil_roi_path IS NOT NULL)
    OR name IN (SELECT thumb_path FROM public.eye_images WHERE thumb_path IS NOT NULL)
  ))
));