\set d random(1, 5)
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0002-' || lpad(:d::text, 12, '0'), true);
SELECT count(*) FROM (SELECT e.id, e.eye, p.study_id, (SELECT json_agg(r.doctor_id) FROM reviews r WHERE r.eye_image_id = e.id) FROM eye_images e JOIN patients p ON p.id = e.patient_id WHERE e.pupil_circle_confirmed ORDER BY e.created_at) q;
COMMIT;
