\set d random(1, 5)
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0002-' || lpad(:d::text, 12, '0'), true);
SELECT count(*) FROM (SELECT r.id, p.study_id, e.id FROM referrals r JOIN patients p ON p.id = r.patient_id JOIN eye_images e ON e.patient_id = p.id
  WHERE r.status = 'awaiting_doctor' AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.eye_image_id = e.id AND v.doctor_id = auth.uid())
  ORDER BY r.priority_rank, r.created_at LIMIT 50) q;
SELECT count(*) FROM referrals WHERE status = 'awaiting_doctor' AND priority = 'urgent';
COMMIT;
