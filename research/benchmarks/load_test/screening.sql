\set w random(1, 50)
\set pos random(1, 4)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0001-' || lpad(:w::text, 12, '0'), true);
SELECT gen_random_uuid() AS pid, gen_random_uuid() AS e1, gen_random_uuid() AS e2 \gset
INSERT INTO patients(id, age, sex, district, consent_given, consent_type, created_by) VALUES (':pid'::uuid, 62, 'female', 'Khagrachari', true, 'verbal', auth.uid());
INSERT INTO patient_contacts(patient_id, full_name, phone, address, contact_consent, created_by) VALUES (':pid'::uuid, 'Test', '+8801712345678', 'Village', true, auth.uid());
INSERT INTO eye_images(id, patient_id, eye, storage_path, pupil_roi_path, thumb_path, pupil_circle_confirmed, created_by) VALUES (':e1'::uuid, ':pid'::uuid, 'left', 'eyes/a.jpg', 'pupil-roi/a.jpg', 'pupil-roi/t/a.jpg', true, auth.uid()), (':e2'::uuid, ':pid'::uuid, 'right', 'eyes/b.jpg', 'pupil-roi/b.jpg', 'pupil-roi/t/b.jpg', true, auth.uid());
INSERT INTO predictions(eye_image_id, model_url, threshold, score, positive, created_by) VALUES (':e1'::uuid, '/model/model.json', 0.0691, 0.5, :pos = 1, auth.uid()), (':e2'::uuid, '/model/model.json', 0.0691, 0.02, false, auth.uid());
INSERT INTO vision_tests(patient_id, eye, distance_m, logmar, snellen, px_per_mm, created_by) VALUES (':pid'::uuid, 'left', 2, 0.3, '6/12', 15, auth.uid());
COMMIT;
