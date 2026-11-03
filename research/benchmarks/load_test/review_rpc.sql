\set d random(1, 5)
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0002-' || lpad(:d::text, 12, '0'), true);
SELECT count(*) FROM review_queue(20);
COMMIT;
