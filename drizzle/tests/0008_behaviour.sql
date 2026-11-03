-- Behaviour tests for migration 0008 (run after 0000-0008 on the shimmed database, see supabase_shim.sql).
\set ON_ERROR_STOP 1
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000a1','admin8@x'),('00000000-0000-0000-0000-0000000000b1','w8@x'),('00000000-0000-0000-0000-0000000000c1','doc8@x')
  ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000b1','health_worker'),('00000000-0000-0000-0000-0000000000c1','doctor')
  ON CONFLICT DO NOTHING;
CREATE TEMP TABLE t8 (name text, ok boolean, detail text);
GRANT ALL ON t8 TO authenticated;
SELECT id AS run FROM model_runs WHERE active \gset

-- T1 review band -> borderline routine referral visible to the worker; client "positive" is not trusted
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-0000000000b1';
INSERT INTO patients(id,consent_given) VALUES ('81000000-0000-0000-0000-000000000001',true);
INSERT INTO eye_images(id,patient_id,eye,storage_path,pupil_circle_confirmed) VALUES
 ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','left','x',true),
 ('82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','right','x',true);
INSERT INTO predictions(eye_image_id,model_run_id,model_url,threshold,score,positive) VALUES ('82000000-0000-0000-0000-000000000001',:'run','/model/model.json',0.01,0.30,true);
INSERT INTO t8 SELECT 'T1 band=review, positive overridden to false, threshold from registry', band='review' AND NOT positive AND threshold=0.5, band||' '||positive||' '||threshold FROM predictions WHERE eye_image_id='82000000-0000-0000-0000-000000000001';
INSERT INTO t8 SELECT 'T1 borderline referral visible to worker', reason='ai_borderline' AND priority='routine', reason||' '||priority FROM referrals WHERE patient_id='81000000-0000-0000-0000-000000000001';
-- T2 refer band on the other eye upgrades to urgent
INSERT INTO predictions(eye_image_id,model_run_id,model_url,threshold,score,positive) VALUES ('82000000-0000-0000-0000-000000000002',:'run','/model/model.json',0.5,0.80,true);
INSERT INTO t8 SELECT 'T2 upgraded to ai_suspected urgent', reason='ai_suspected' AND priority='urgent' AND ai_band='refer', reason||' '||priority FROM referrals WHERE patient_id='81000000-0000-0000-0000-000000000001';

-- T3 audit sampling at the configured rate (10%) over 1,000 AI-negative patients; draw recorded permanently
RESET ROLE;
DO $$ DECLARE i int; p uuid; e uuid; run uuid; BEGIN SELECT id INTO run FROM model_runs WHERE active;
  PERFORM set_config('request.uid','00000000-0000-0000-0000-0000000000b1', true); SET LOCAL ROLE authenticated;
  FOR i IN 1..1000 LOOP p := gen_random_uuid(); e := gen_random_uuid();
    INSERT INTO patients(id,consent_given,area) VALUES (p,true,'t8'); INSERT INTO eye_images(id,patient_id,eye,storage_path,pupil_circle_confirmed) VALUES (e,p,'left','x',true);
    INSERT INTO predictions(eye_image_id,model_run_id,model_url,threshold,score,positive) VALUES (e,run,'/model/model.json',0.5,0.02,false); END LOOP; END $$;
INSERT INTO t8 SELECT 'T3 audit rate near 10% of 1000 (60-140)', count(*) BETWEEN 60 AND 140, count(*)::text FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE p.area='t8' AND r.audit_sampled AND r.audit_p=0.10;

-- T4 field referral upgrades an audit row but the draw stays recorded
DO $$ DECLARE pid uuid; BEGIN SELECT r.patient_id INTO pid FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE p.area='t8' AND r.reason='random_audit' LIMIT 1;
  PERFORM set_config('request.uid','00000000-0000-0000-0000-0000000000b1', true); SET LOCAL ROLE authenticated;
  PERFORM field_referral(pid,'low_vision','spectacles','routine');
  PERFORM set_config('t8.pid', pid::text, false); END $$;
INSERT INTO t8 SELECT 'T4 upgraded to low_vision, audit_sampled kept', reason='low_vision' AND audit_sampled AND audit_p=0.10, reason||' '||audit_sampled FROM referrals WHERE patient_id=current_setting('t8.pid')::uuid;

-- T5 nobody can rewrite the audit draw (admin update is silently reverted)
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-0000000000a1';
UPDATE referrals SET audit_sampled=false, audit_p=NULL WHERE patient_id=current_setting('t8.pid')::uuid;
INSERT INTO t8 SELECT 'T5 admin cannot erase audit draw', audit_sampled AND audit_p=0.10, audit_sampled::text FROM referrals WHERE patient_id=current_setting('t8.pid')::uuid;

-- T6 a worker who sets the old bypass flag is still blocked
SET request.uid='00000000-0000-0000-0000-0000000000b1';
SELECT set_config('netra.system','on',false);
DO $$ BEGIN UPDATE referrals SET priority='audit' WHERE patient_id='81000000-0000-0000-0000-000000000001';
  INSERT INTO t8 VALUES ('T6 bypass flag ignored', false, 'update went through');
EXCEPTION WHEN raise_exception THEN INSERT INTO t8 VALUES ('T6 bypass flag ignored', true, SQLERRM); END $$;
SELECT set_config('netra.system','',false);

-- T7 blinded grading queue: no AI band / reason / priority columns, not ordered by priority
RESET ROLE; SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-0000000000c1';
INSERT INTO t8 SELECT 'T7 grading_queue exposes no priority/reason/band', NOT EXISTS (
  SELECT 1 FROM information_schema.routines r JOIN information_schema.parameters a ON a.specific_name=r.specific_name
  WHERE r.routine_name='grading_queue' AND a.parameter_name IN ('priority','reason','band','ai_band','referral_status')), 'columns checked';
INSERT INTO t8 SELECT 'T7 queue holds AI-flagged and audit eyes (remaining = pool size)',
  (SELECT max(remaining) FROM grading_queue(1)) = (SELECT count(*) FROM referrals r JOIN eye_images e ON e.patient_id=r.patient_id
     WHERE e.pupil_circle_confirmed AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.eye_image_id=e.id AND v.doctor_id=auth.uid())),
  'remaining=' || (SELECT max(remaining) FROM grading_queue(1));

-- T8 stratified estimator: build a known scenario and compare with a hand computation
RESET ROLE;
DO $$ DECLARE i int; p uuid; e uuid; run uuid; BEGIN SELECT id INTO run FROM model_runs WHERE active;
  -- 10 screen-positive patients: 8 cataract, 2 normal (blinded labels)
  FOR i IN 1..10 LOOP p := gen_random_uuid(); e := gen_random_uuid();
    PERFORM set_config('request.uid','00000000-0000-0000-0000-0000000000b1', true);
    INSERT INTO patients(id,consent_given,area,created_by) VALUES (p,true,'t8b','00000000-0000-0000-0000-0000000000b1');
    INSERT INTO eye_images(id,patient_id,eye,storage_path,pupil_circle_confirmed,created_by) VALUES (e,p,'left','x',true,'00000000-0000-0000-0000-0000000000b1');
    INSERT INTO predictions(eye_image_id,model_run_id,model_url,threshold,score,positive,created_by) VALUES (e,run,'/model/model.json',0.5,0.9,true,'00000000-0000-0000-0000-0000000000b1');
    INSERT INTO reviews(eye_image_id,doctor_id,diagnosis,blinded) VALUES (e,'00000000-0000-0000-0000-0000000000c1', CASE WHEN i<=8 THEN 'cataract_early' ELSE 'normal' END, true);
  END LOOP; END $$;
-- label every audit-sampled t8 patient: make exactly 3 of the non-field audit patients cataract, the field-referred one cataract too
DO $$ DECLARE rec record; n int := 0; BEGIN
  FOR rec IN SELECT r.patient_id, r.reason FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE p.area='t8' AND r.audit_sampled ORDER BY r.reason DESC, r.patient_id LOOP
    INSERT INTO reviews(eye_image_id,doctor_id,diagnosis,blinded)
      SELECT e.id,'00000000-0000-0000-0000-0000000000c1', CASE WHEN rec.reason='low_vision' OR n < 3 THEN 'cataract_early' ELSE 'normal' END, true
      FROM eye_images e WHERE e.patient_id=rec.patient_id;
    IF rec.reason <> 'low_vision' THEN n := n + 1; END IF;
  END LOOP; END $$;
-- expected over all data from 0006 tests too: compute by hand in SQL with the same definitions
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-0000000000c1';
SELECT audit_sensitivity(true) AS est \gset
RESET ROLE;
WITH pat AS (SELECT p.id, bool_or(pr.band IN ('refer','review')) sp, max(r.reason) reason, bool_or(coalesce(r.audit_sampled,false)) aud, max(r.audit_p) ap
             FROM patients p JOIN eye_images e ON e.patient_id=p.id JOIN predictions pr ON pr.eye_image_id=e.id LEFT JOIN referrals r ON r.patient_id=p.id GROUP BY p.id),
     lab AS (SELECT e.patient_id id, bool_or(v.diagnosis LIKE 'cataract%') cat FROM reviews v JOIN eye_images e ON e.id=v.eye_image_id WHERE v.blinded GROUP BY 1),
     j AS (SELECT * FROM pat JOIN lab USING (id)),
     h AS (SELECT count(*) FILTER (WHERE sp AND cat) tp,
                  count(*) FILTER (WHERE NOT sp AND reason IN ('low_vision','worker') AND cat) fnf,
                  coalesce(sum(1/ap) FILTER (WHERE NOT sp AND coalesce(reason,'') NOT IN ('low_vision','worker') AND aud AND cat),0) fna FROM j)
INSERT INTO t8 SELECT 'T8 estimator equals hand computation', abs((:'est'::jsonb->>'sensitivity_hat')::numeric - (tp/(tp+fnf+fna))::numeric) < 1e-9,
  'db=' || (:'est'::jsonb->>'sensitivity_hat') || ' hand=' || round((tp/(tp+fnf+fna))::numeric,6) || ' tp=' || tp || ' fn_field=' || fnf || ' fn_audit_w=' || fna FROM h;

-- T9 only admin/doctor may call the estimator
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN PERFORM audit_sensitivity(true); INSERT INTO t8 VALUES ('T9 worker blocked from estimator', false, 'allowed');
EXCEPTION WHEN raise_exception THEN INSERT INTO t8 VALUES ('T9 worker blocked from estimator', true, SQLERRM); END $$;

-- T10 audit rate configurable by admin only
DO $$ BEGIN UPDATE screening_config SET audit_rate = 0.5; IF (SELECT audit_rate FROM screening_config) = 0.5 THEN INSERT INTO t8 VALUES ('T10 worker cannot change audit rate', false, 'changed'); ELSE INSERT INTO t8 VALUES ('T10 worker cannot change audit rate', true, 'unchanged (RLS)'); END IF; END $$;
SET request.uid='00000000-0000-0000-0000-0000000000a1';
UPDATE screening_config SET audit_rate = 0.05;
INSERT INTO t8 SELECT 'T10 admin can change audit rate', audit_rate = 0.05, audit_rate::text FROM screening_config;
RESET ROLE;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM t8 ORDER BY name;
SELECT CASE WHEN bool_and(ok) THEN 'ALL 0008 TESTS PASSED' ELSE 'SOME 0008 TESTS FAILED' END FROM t8;
