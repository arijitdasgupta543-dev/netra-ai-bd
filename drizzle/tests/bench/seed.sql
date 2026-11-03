-- 50 workers, 5 doctors; 200,000 patients (~10 field days at 1,000 workers x 20 patients), 2 eyes each
INSERT INTO auth.users(id,email) SELECT ('00000000-0000-0000-0001-'||lpad(g::text,12,'0'))::uuid, 'w'||g FROM generate_series(1,50) g;
INSERT INTO user_roles(user_id,role) SELECT ('00000000-0000-0000-0001-'||lpad(g::text,12,'0'))::uuid,'health_worker' FROM generate_series(1,50) g;
INSERT INTO auth.users(id,email) SELECT ('00000000-0000-0000-0002-'||lpad(g::text,12,'0'))::uuid, 'd'||g FROM generate_series(1,5) g;
INSERT INTO user_roles(user_id,role) SELECT ('00000000-0000-0000-0002-'||lpad(g::text,12,'0'))::uuid,'doctor' FROM generate_series(1,5) g;
ALTER TABLE patients DISABLE TRIGGER audit_patients; ALTER TABLE eye_images DISABLE TRIGGER audit_eye_images;
INSERT INTO patients(id,age,sex,district,consent_given,consent_type,created_by,created_at)
SELECT gen_random_uuid(), 40+(g%45), CASE WHEN g%2=0 THEN 'female' ELSE 'male' END, 'Khagrachari', true,'verbal',
 ('00000000-0000-0000-0001-'||lpad((1+g%50)::text,12,'0'))::uuid, now() - (g||' seconds')::interval FROM generate_series(1,200000) g;
INSERT INTO eye_images(patient_id,eye,storage_path,pupil_roi_path,thumb_path,pupil_circle_confirmed,created_by,created_at)
SELECT p.id, e, 'eyes/x.jpg', 'pupil-roi/'||p.id||e||'.jpg', 'pupil-roi/t'||p.id||e||'.jpg', true, p.created_by, p.created_at FROM patients p CROSS JOIN (VALUES ('left'),('right')) v(e) WHERE NOT EXISTS (SELECT 1 FROM eye_images x WHERE x.patient_id=p.id);
-- ~25% AI-positive referrals; 30% of them already reviewed
INSERT INTO referrals(patient_id,reason,referral_type,priority,status,created_by)
SELECT id,'ai_suspected','cataract','urgent', CASE WHEN random()<0.3 THEN 'confirmed' ELSE 'awaiting_doctor' END, created_by FROM patients p WHERE random()<0.25 AND NOT EXISTS (SELECT 1 FROM referrals r WHERE r.patient_id=p.id);
ALTER TABLE patients ENABLE TRIGGER audit_patients; ALTER TABLE eye_images ENABLE TRIGGER audit_eye_images;
ANALYZE;
