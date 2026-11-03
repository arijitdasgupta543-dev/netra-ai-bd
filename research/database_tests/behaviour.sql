\set ON_ERROR_STOP 1
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-00000000000a','admin@x'),('00000000-0000-0000-0000-00000000000b','w1@x'),('00000000-0000-0000-0000-00000000000c','doc@x'),('00000000-0000-0000-0000-00000000000d','w2@x');
INSERT INTO user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-00000000000b','health_worker'),('00000000-0000-0000-0000-00000000000c','doctor'),('00000000-0000-0000-0000-00000000000d','health_worker');
-- worker 1 screens a patient
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-00000000000b';
INSERT INTO patients(id,age,sex,district,consent_given,consent_type) VALUES ('10000000-0000-0000-0000-000000000001',65,'female','Khagrachari',true,'written');
INSERT INTO patient_contacts(patient_id,full_name,phone,address,contact_consent) VALUES ('10000000-0000-0000-0000-000000000001','Test Name','+8801712345678','Village X',true);
INSERT INTO eye_images(id,patient_id,eye,storage_path,pupil_circle_confirmed) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','left','eyes/x.jpg',true);
INSERT INTO predictions(eye_image_id,model_url,threshold,score,positive) VALUES ('20000000-0000-0000-0000-000000000001','/model/model.json',0.5,0.91,true);
SELECT 'worker sees referral' t, reason, priority, status FROM referrals;
-- worker cannot change clinical type
DO $$ BEGIN UPDATE referrals SET referral_type='spectacles'; RAISE EXCEPTION 'FAIL: worker changed type'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok blocked: %', SQLERRM; END $$;
-- bad phone rejected
DO $$ BEGIN INSERT INTO patients(id,consent_given) VALUES ('10000000-0000-0000-0000-000000000009',true); INSERT INTO patient_contacts(patient_id,full_name,phone,contact_consent) VALUES ('10000000-0000-0000-0000-000000000009','A','01712',true); RAISE EXCEPTION 'FAIL phone'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok phone check'; END $$;
-- worker 2 cannot read worker 1 contacts
SET request.uid='00000000-0000-0000-0000-00000000000d';
SELECT 'w2 contacts visible (expect 0)' t, count(*) FROM patient_contacts;
-- doctor: blinded
SET request.uid='00000000-0000-0000-0000-00000000000c';
SELECT 'doctor predictions before review (expect 0)' t, count(*) FROM predictions;
SELECT 'doctor contacts (expect 1)' t, count(*) FROM patient_contacts;
INSERT INTO reviews(eye_image_id,diagnosis,confidence,referral) VALUES ('20000000-0000-0000-0000-000000000001','cataract_early',4,true);
SELECT 'doctor predictions after review (expect 1)' t, count(*) FROM predictions;
UPDATE referrals SET status='confirmed', hospital_id=(SELECT id FROM hospitals WHERE district='Chattogram' LIMIT 1);
SELECT 'after doctor confirm' t, status, doctor_id IS NOT NULL has_doc FROM referrals;
-- worker records outcome
SET request.uid='00000000-0000-0000-0000-00000000000b';
UPDATE referrals SET status='patient_informed'; UPDATE referrals SET status='reached';
SELECT 'outcome' t, status, informed_at IS NOT NULL inf, outcome_at IS NOT NULL outc FROM referrals;
-- random audit rate over 400 negative patients
DO $$ DECLARE i int; p uuid; e uuid; BEGIN FOR i IN 1..400 LOOP p := gen_random_uuid(); e := gen_random_uuid();
  INSERT INTO patients(id,consent_given) VALUES (p,true); INSERT INTO eye_images(id,patient_id,eye,storage_path) VALUES (e,p,'left','x');
  INSERT INTO predictions(eye_image_id,model_url,threshold,score,positive) VALUES (e,'/m',0.5,0.1,false); END LOOP; END $$;
SELECT 'worker visible audits (expect 0)' t, count(*) FROM referrals WHERE reason='random_audit';
RESET ROLE;
SELECT 'audit referrals of 400' t, count(*) FROM referrals WHERE reason='random_audit';
SELECT 'audit_log PII leak (expect 0)' t, count(*) FROM audit_log WHERE coalesce(new_data::text,'') LIKE '%Test Name%' OR coalesce(new_data::text,'') LIKE '%71234%';
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-00000000000c'; SELECT referral_stats();
-- field referral upgrades an audit row
RESET ROLE;
DO $$ DECLARE pid uuid; BEGIN SELECT patient_id INTO pid FROM referrals WHERE reason='random_audit' LIMIT 1;
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000b', true); SET LOCAL ROLE authenticated;
  PERFORM field_referral(pid,'low_vision','spectacles','routine'); END $$;
SELECT 'upgraded audit (expect 1)' t, count(*) FROM referrals WHERE reason='low_vision' AND patient_visible;
-- AI positive on a patient that already has a low_vision referral upgrades it (as worker)
DO $$ DECLARE pid uuid; e uuid := gen_random_uuid(); BEGIN SELECT patient_id INTO pid FROM referrals WHERE reason='low_vision' LIMIT 1;
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000b', true); SET LOCAL ROLE authenticated;
  INSERT INTO eye_images(id,patient_id,eye,storage_path) VALUES (e,pid,'right','x');
  INSERT INTO predictions(eye_image_id,model_url,threshold,score,positive) VALUES (e,'/m',0.5,0.9,true); END $$;
SELECT 'AI upgraded low_vision (expect ai_suspected urgent)' t, reason, priority FROM referrals WHERE referral_type='cataract' AND reason<>'doctor' ORDER BY updated_at DESC LIMIT 1;
-- worker cannot fake netra.system across statements (set_config local is per transaction; here check guard still blocks)
SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-00000000000b';
DO $$ BEGIN UPDATE referrals SET priority='audit' WHERE reason='ai_suspected'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL' THEN RAISE; END IF; RAISE NOTICE 'ok still blocked'; END $$;
-- review queue: doctor sees urgent referral eyes first, never ones they already labelled
RESET ROLE; UPDATE eye_images SET pupil_circle_confirmed = true; SET ROLE authenticated; SET request.uid='00000000-0000-0000-0000-00000000000c';
SELECT 'review_queue first row (expect urgent, not reviewed)' t, priority, (SELECT count(*) FROM reviews v WHERE v.eye_image_id = q.id AND v.doctor_id = auth.uid()) AS mine FROM review_queue(5) q LIMIT 1;
RESET ROLE;
