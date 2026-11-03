BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.uid', '00000000-0000-0000-0002-000000000001', true);
SELECT dashboard_stats(); SELECT referral_stats();
COMMIT;
