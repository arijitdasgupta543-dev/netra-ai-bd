-- 0006: patient contacts (PII, separated), AI predictions with model versions,
-- automatic referrals (+5% random audit of negatives), hospitals, vision tests,
-- SMS log, audit log, and blinding of AI scores until a doctor has labelled.
-- Design rule: research data (patients, eye_images, reviews, predictions) stays
-- de-identified; names/phones/addresses live ONLY in patient_contacts.

-- ---------- 0. Study ID overflow fix ----------
-- lpad(n, 4) TRUNCATES numbers above 9999 ('10000' -> '1000'), so the 10,000th patient would collide
-- with NETRA-1000 and every later insert would fail. Keep 4-digit padding for small numbers only.
CREATE OR REPLACE FUNCTION public.next_study_id() RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'NETRA-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END FROM (SELECT nextval('public.study_id_seq') AS n) s
$$;
GRANT EXECUTE ON FUNCTION public.next_study_id() TO authenticated, service_role;
ALTER TABLE public.patients ALTER COLUMN study_id SET DEFAULT public.next_study_id();

-- ---------- 1. Contacts (PII) ----------
CREATE TABLE public.patient_contacts (
  patient_id uuid PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR phone ~ '^\+8801[3-9][0-9]{8}$'),
  address text CHECK (address IS NULL OR length(address) <= 300),
  contact_consent boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_consent_required CHECK (contact_consent = true)
);
GRANT SELECT, INSERT, UPDATE ON public.patient_contacts TO authenticated;
GRANT ALL ON public.patient_contacts TO service_role;
ALTER TABLE public.patient_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts read: admin, doctor, creator" ON public.patient_contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR created_by = auth.uid());
CREATE POLICY "contacts insert: worker/admin" ON public.patient_contacts FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'health_worker') OR public.has_role(auth.uid(),'admin')) AND created_by = auth.uid());
CREATE POLICY "contacts update: admin or creator" ON public.patient_contacts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR created_by = auth.uid());

-- District is structured now (was free text in area) so hospitals can be matched.
ALTER TABLE public.patients ADD COLUMN district text;
CREATE INDEX idx_patients_district ON public.patients (district);

-- Doctors can opt in to SMS alerts.
ALTER TABLE public.profiles ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^\+8801[3-9][0-9]{8}$');
ALTER TABLE public.profiles ADD COLUMN notify_sms boolean NOT NULL DEFAULT false;

-- ---------- 2. Model versions + predictions ----------
CREATE TABLE public.model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  model_url text NOT NULL CHECK (model_url = '/model/model.json' OR model_url ~ '^https://[^[:space:]]+$'),
  threshold double precision NOT NULL CHECK (threshold > 0 AND threshold < 1),
  input_spec text NOT NULL DEFAULT 'pupil crop 2.5r, 224px, RGB 0-255',
  data_hash text,
  metrics jsonb,
  git_commit text,
  notes text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_model ON public.model_runs (active) WHERE active;
GRANT SELECT, INSERT, UPDATE ON public.model_runs TO authenticated;
GRANT ALL ON public.model_runs TO service_role;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_runs read" ON public.model_runs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "model_runs admin write" ON public.model_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Bundled research model (public/model). Threshold chosen on validation for sensitivity >= 0.95.
INSERT INTO public.model_runs (version, model_url, threshold, metrics, notes, active) VALUES
 ('v3.0-pupil-crop', '/model/model.json', 0.0691,
  '{"test_auc":0.958,"val_auc":0.896,"test_n":34,"sens_test":"18/18","spec_test":"3/16","data":"web images, research only"}',
  'MobileNetV2 on pupil crops (2.5r). Not validated on patients.', true);

CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eye_image_id uuid NOT NULL REFERENCES public.eye_images(id) ON DELETE CASCADE,
  model_run_id uuid REFERENCES public.model_runs(id),
  model_url text NOT NULL,
  threshold double precision NOT NULL,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  positive boolean NOT NULL,
  inference_ms integer,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (eye_image_id, model_url)
);
CREATE INDEX idx_predictions_eye ON public.predictions (eye_image_id);
GRANT SELECT, INSERT ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
-- BLINDING: doctors see a score only after they saved their own label for that eye.
CREATE POLICY "predictions read (blinded for doctors)" ON public.predictions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(),'health_worker')
    OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.eye_image_id = predictions.eye_image_id AND r.doctor_id = auth.uid())
  );
CREATE POLICY "predictions insert by creator of image" ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.eye_images e WHERE e.id = eye_image_id AND e.created_by = auth.uid()));

-- ---------- 3. Hospitals ----------
CREATE TABLE public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_bn text NOT NULL,
  district text NOT NULL,
  division text,
  address_en text,
  address_bn text,
  phone text,
  services text[] NOT NULL DEFAULT '{}', -- cataract_surgery | spectacles | eye_opd | emergency
  cost_note_bn text,
  verified boolean NOT NULL DEFAULT false, -- admin confirmed phone/services by calling
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT ALL ON public.hospitals TO service_role;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hospitals read" ON public.hospitals FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "hospitals admin write" ON public.hospitals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed: names/locations only. Phones and services MUST be confirmed by the admin (verified=false).
INSERT INTO public.hospitals (name_en, name_bn, district, division, address_en, address_bn, services) VALUES
 ('Khagrachari District Sadar Hospital', 'খাগড়াছড়ি জেলা সদর হাসপাতাল', 'Khagrachari', 'Chattogram', 'Khagrachari Sadar', 'খাগড়াছড়ি সদর', '{eye_opd}'),
 ('Chittagong Eye Infirmary and Training Complex', 'চট্টগ্রাম চক্ষু হাসপাতাল ও প্রশিক্ষণ কমপ্লেক্স', 'Chattogram', 'Chattogram', 'Foy''s Lake Approach Road, Pahartali, Chattogram', 'ফয়েজ লেক অ্যাপ্রোচ রোড, পাহাড়তলী, চট্টগ্রাম', '{cataract_surgery,spectacles,eye_opd}'),
 ('Chittagong Medical College Hospital – Eye Department', 'চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল – চক্ষু বিভাগ', 'Chattogram', 'Chattogram', 'K.B. Fazlul Kader Road, Chattogram', 'কে.বি. ফজলুল কাদের রোড, চট্টগ্রাম', '{cataract_surgery,eye_opd,emergency}'),
 ('National Institute of Ophthalmology & Hospital', 'জাতীয় চক্ষুবিজ্ঞান ইনস্টিটিউট ও হাসপাতাল', 'Dhaka', 'Dhaka', 'Sher-e-Bangla Nagar, Dhaka', 'শেরে বাংলা নগর, ঢাকা', '{cataract_surgery,spectacles,eye_opd,emergency}');

-- ---------- 4. Vision tests (Tumbling E + contrast) ----------
CREATE TABLE public.vision_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  eye text NOT NULL CHECK (eye IN ('left','right')),
  method text NOT NULL DEFAULT 'tumbling_e',
  distance_m double precision NOT NULL,
  logmar double precision, -- best line passed; NULL = could not see the largest line
  snellen text,
  contrast_log_cs double precision, -- experimental
  pinhole_improves boolean,
  px_per_mm double precision,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, eye, method)
);
GRANT SELECT, INSERT ON public.vision_tests TO authenticated;
GRANT ALL ON public.vision_tests TO service_role;
ALTER TABLE public.vision_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vision read" ON public.vision_tests FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "vision insert" ON public.vision_tests FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'health_worker') OR public.has_role(auth.uid(),'admin')) AND created_by = auth.uid());

-- ---------- 5. Referrals ----------
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('ai_suspected','low_vision','random_audit','doctor','worker')),
  referral_type text NOT NULL DEFAULT 'cataract' CHECK (referral_type IN ('cataract','spectacles','other','none')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('urgent','routine','audit')),
  status text NOT NULL DEFAULT 'awaiting_doctor' CHECK (status IN ('awaiting_doctor','confirmed','not_needed','patient_informed','reached','not_reached','unknown')),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  doctor_id uuid,
  doctor_note text,
  patient_visible boolean NOT NULL DEFAULT true, -- false for random_audit until a doctor confirms
  informed_at timestamptz,
  outcome_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_status ON public.referrals (status, priority, created_at);
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals read" ON public.referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
         OR (public.has_role(auth.uid(),'health_worker') AND patient_visible));
CREATE POLICY "referrals insert worker/doctor" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND (reason IN ('worker','doctor','low_vision')));
CREATE POLICY "referrals update" ON public.referrals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
         OR (public.has_role(auth.uid(),'health_worker') AND patient_visible))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
         OR (public.has_role(auth.uid(),'health_worker') AND patient_visible));

-- Health workers may only move the outcome forward (informed/reached/not reached), never the clinical decision.
CREATE OR REPLACE FUNCTION public.referrals_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  -- system changes (AI trigger, field_referral) set netra.system for the current transaction
  IF coalesce(current_setting('netra.system', true), '') <> 'on' AND public.has_role(auth.uid(),'health_worker') AND NOT public.has_role(auth.uid(),'admin') THEN
    IF NEW.referral_type IS DISTINCT FROM OLD.referral_type OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       OR NEW.doctor_note IS DISTINCT FROM OLD.doctor_note OR NEW.patient_visible IS DISTINCT FROM OLD.patient_visible
       OR NEW.status NOT IN ('patient_informed','reached','not_reached','unknown', OLD.status) THEN
      RAISE EXCEPTION 'health workers can only record patient outcome';
    END IF;
  END IF;
  IF NEW.status = 'patient_informed' AND OLD.status IS DISTINCT FROM 'patient_informed' THEN NEW.informed_at := now(); END IF;
  IF NEW.status IN ('reached','not_reached') AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.outcome_at := now(); END IF;
  IF NEW.status IN ('confirmed','not_needed') AND public.has_role(auth.uid(),'doctor') THEN
    NEW.doctor_id := auth.uid();
    IF NEW.status = 'confirmed' THEN NEW.patient_visible := true; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER referrals_guard BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.referrals_guard();

-- Automatic referral when the AI flags an eye; 5% of negative patients go to a hidden audit queue
-- so that missed cataracts (sensitivity) can still be measured.
CREATE OR REPLACE FUNCTION public.auto_refer_from_prediction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; existing public.referrals%ROWTYPE;
BEGIN
  SELECT e.patient_id INTO pid FROM public.eye_images e WHERE e.id = NEW.eye_image_id;
  IF pid IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO existing FROM public.referrals WHERE patient_id = pid;
  IF NEW.positive THEN
    IF NOT FOUND THEN
      INSERT INTO public.referrals (patient_id, reason, referral_type, priority, patient_visible, created_by)
      VALUES (pid, 'ai_suspected', 'cataract', 'urgent', true, NEW.created_by);
    ELSIF existing.reason IN ('random_audit','low_vision') AND existing.status = 'awaiting_doctor' THEN
      PERFORM set_config('netra.system', 'on', true);
      UPDATE public.referrals SET reason = 'ai_suspected', referral_type = 'cataract', priority = 'urgent', patient_visible = true WHERE id = existing.id;
      PERFORM set_config('netra.system', '', true);
    END IF;
  ELSIF NOT FOUND
        AND NOT EXISTS (SELECT 1 FROM public.predictions p JOIN public.eye_images e ON e.id = p.eye_image_id
                        WHERE e.patient_id = pid AND p.id <> NEW.id)
        AND random() < 0.05 THEN
    INSERT INTO public.referrals (patient_id, reason, referral_type, priority, patient_visible, created_by)
    VALUES (pid, 'random_audit', 'none', 'audit', false, NEW.created_by);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER predictions_auto_refer AFTER INSERT ON public.predictions FOR EACH ROW EXECUTE FUNCTION public.auto_refer_from_prediction();


-- Field referral from the phone (low vision / worker judgement). Upgrades a hidden random-audit
-- row instead of being silently dropped; never downgrades an AI or doctor referral.
CREATE OR REPLACE FUNCTION public.field_referral(_patient uuid, _reason text, _type text, _priority text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.referrals%ROWTYPE;
BEGIN
  IF _reason NOT IN ('low_vision','worker') OR _type NOT IN ('cataract','spectacles','other') OR _priority NOT IN ('urgent','routine') THEN
    RAISE EXCEPTION 'invalid referral';
  END IF;
  IF NOT (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'health_worker') AND EXISTS (SELECT 1 FROM patients p WHERE p.id = _patient AND p.created_by = auth.uid()))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO existing FROM referrals WHERE patient_id = _patient;
  IF NOT FOUND THEN
    INSERT INTO referrals (patient_id, reason, referral_type, priority, patient_visible, created_by) VALUES (_patient, _reason, _type, _priority, true, auth.uid());
  ELSIF existing.reason = 'random_audit' AND existing.status = 'awaiting_doctor' THEN
    PERFORM set_config('netra.system', 'on', true);
    UPDATE referrals SET reason = _reason, referral_type = _type, priority = _priority, patient_visible = true, updated_at = now() WHERE id = existing.id;
    PERFORM set_config('netra.system', '', true);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.field_referral(uuid, text, text, text) TO authenticated;

-- ---------- 6. SMS log (no message bodies with names) ----------
CREATE TABLE public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  recipient text NOT NULL CHECK (recipient IN ('patient','doctor')),
  recipient_user uuid,
  phone_last4 text,
  status text NOT NULL CHECK (status IN ('sent','failed','not_configured')),
  provider_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referral_id, recipient, recipient_user)
);
GRANT SELECT ON public.sms_log TO authenticated;
GRANT ALL ON public.sms_log TO service_role;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_log read admin/doctor" ON public.sms_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));

-- ---------- 7. Audit log ----------
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid DEFAULT auth.uid(),
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.write_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
        n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
  -- never copy PII into the audit trail
  IF TG_TABLE_NAME = 'patient_contacts' THEN
    o := CASE WHEN o IS NULL THEN NULL ELSE jsonb_build_object('patient_id', o->'patient_id') END;
    n := CASE WHEN n IS NULL THEN NULL ELSE jsonb_build_object('patient_id', n->'patient_id') END;
  END IF;
  INSERT INTO public.audit_log (table_name, row_id, action, old_data, new_data)
  VALUES (TG_TABLE_NAME, coalesce(n->>'id', o->>'id', n->>'patient_id', o->>'patient_id'), TG_OP, o, n);
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER audit_patients AFTER INSERT OR UPDATE OR DELETE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_eye_images AFTER INSERT OR UPDATE OR DELETE ON public.eye_images FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_reviews AFTER INSERT OR UPDATE OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_referrals AFTER INSERT OR UPDATE OR DELETE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON public.patient_contacts FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_model_runs AFTER INSERT OR UPDATE OR DELETE ON public.model_runs FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- ---------- 8. Referral metrics for the dashboard / Paper 2 ----------
CREATE OR REPLACE FUNCTION public.referral_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor')) THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN jsonb_build_object(
    'by_status', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM referrals GROUP BY 1) s), '{}'::jsonb),
    'by_reason', coalesce((SELECT jsonb_object_agg(reason, n) FROM (SELECT reason, count(*) n FROM referrals GROUP BY 1) s), '{}'::jsonb),
    'by_type', coalesce((SELECT jsonb_object_agg(referral_type, n) FROM (SELECT referral_type, count(*) n FROM referrals GROUP BY 1) s), '{}'::jsonb),
    'median_hours_to_doctor', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (updated_at - created_at))/3600)
                               FROM referrals WHERE status NOT IN ('awaiting_doctor')),
    'completion_rate', (SELECT avg((status = 'reached')::int) FROM referrals WHERE status IN ('reached','not_reached'))
  );
END $$;
GRANT EXECUTE ON FUNCTION public.referral_stats() TO authenticated;

-- ---------- 9. Restore ROI read check (open issue from 0005) ----------
DROP POLICY IF EXISTS "role read eye photos" ON storage.objects;
CREATE POLICY "role read eye photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'eye-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_any_role(auth.uid()) AND name LIKE 'pupil-roi/%' AND (
    EXISTS (SELECT 1 FROM public.eye_images e WHERE e.pupil_roi_path = storage.objects.name AND e.pupil_circle_confirmed)
    OR EXISTS (SELECT 1 FROM public.eye_images e WHERE e.thumb_path = storage.objects.name AND e.pupil_circle_confirmed)
  ))
));
