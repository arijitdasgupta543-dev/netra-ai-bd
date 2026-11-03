\set w random(1, 50)
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0001-' || lpad(:w::text, 12, '0'), true);
SELECT count(*) FROM (SELECT p.id, p.study_id FROM patients p ORDER BY p.created_at DESC LIMIT 20 OFFSET 0) q;
COMMIT;
