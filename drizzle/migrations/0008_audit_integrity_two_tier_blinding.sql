-- 0008: fixes found during design verification (see paper, Section "Verification findings").
--  (1) Two-tier AI thresholds: "refer" (urgent) and "review" (doctor looks, routine). The band is computed in
--      the database from the registered model run, so a stale or modified client cannot change it.
--  (2) Audit-sample integrity: the random-audit draw is recorded permanently (audit_sampled, audit_p) and can
--      never be changed by later upgrades, so the stratified (Horvitz-Thompson) sensitivity estimate stays unbiased.
--      The audit rate is configurable (pilot 10%, lower at scale).
--  (3) Blinded research grading: a separate grading queue in pseudo-random order that does not reveal the AI
--      band, referral reason or priority; reviews record whether they were made blinded.
--  (4) Guard hardening: the referral guard no longer trusts a session setting (netra.system); it relies on the
--      executing role, which an API client cannot change.

-- ---------- 1. Configuration ----------
CREATE TABLE public.screening_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  audit_rate double precision NOT NULL DEFAULT 0.10 CHECK (audit_rate > 0 AND audit_rate <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.screening_config (id, audit_rate) VALUES (1, 0.10);
GRANT SELECT, UPDATE ON public.screening_config TO authenticated;
GRANT ALL ON public.screening_config TO service_role;
ALTER TABLE public.screening_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config read" ON public.screening_config FOR SELECT TO authenticated USING ((SELECT public.has_any_role((SELECT auth.uid()))));
CREATE POLICY "config admin update" ON public.screening_config FOR UPDATE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()),'admin'))) WITH CHECK ((SELECT public.has_role((SELECT auth.uid()),'admin')));

-- ---------- 2. Two-tier thresholds ----------
ALTER TABLE public.model_runs ADD COLUMN review_threshold double precision CHECK (review_threshold IS NULL OR (review_threshold > 0 AND review_threshold < 1));
ALTER TABLE public.model_runs ADD CONSTRAINT review_not_above_refer CHECK (review_threshold IS NULL OR review_threshold <= threshold);
-- v3: refer at the conventional 0.5; review band down to the validation rule (sensitivity >= 0.95). No predictions
-- had been stored with v3 when this was set.
UPDATE public.model_runs SET threshold = 0.5, review_threshold = 0.0691,
  notes = coalesce(notes, '') || ' Two-tier from 0008: refer >= 0.5 (urgent), review >= 0.0691 (routine doctor review).'
  WHERE version = 'v3.0-pupil-crop';

ALTER TABLE public.predictions ADD COLUMN band text CHECK (band IN ('refer','review','negative'));
UPDATE public.predictions SET band = CASE WHEN positive THEN 'refer' ELSE 'negative' END WHERE band IS NULL;
ALTER TABLE public.predictions ALTER COLUMN band SET NOT NULL;
ALTER TABLE public.predictions ALTER COLUMN band SET DEFAULT 'negative'; -- always overwritten by the trigger below

CREATE OR REPLACE FUNCTION public.predictions_band() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mr public.model_runs%ROWTYPE;
BEGIN
  IF NEW.model_run_id IS NOT NULL THEN SELECT * INTO mr FROM model_runs WHERE id = NEW.model_run_id; END IF;
  IF mr.id IS NULL THEN SELECT * INTO mr FROM model_runs WHERE active AND model_url = NEW.model_url; END IF;
  IF mr.id IS NOT NULL THEN
    NEW.model_run_id := mr.id;
    NEW.threshold := mr.threshold;
    NEW.positive := NEW.score >= mr.threshold;
    NEW.band := CASE WHEN NEW.score >= mr.threshold THEN 'refer'
                     WHEN mr.review_threshold IS NOT NULL AND NEW.score >= mr.review_threshold THEN 'review'
                     ELSE 'negative' END;
  ELSE
    NEW.band := CASE WHEN NEW.positive THEN 'refer' ELSE 'negative' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER predictions_band BEFORE INSERT ON public.predictions FOR EACH ROW EXECUTE FUNCTION public.predictions_band();

-- ---------- 3. Referrals: audit integrity + borderline reason ----------
ALTER TABLE public.referrals ADD COLUMN audit_sampled boolean NOT NULL DEFAULT false;
ALTER TABLE public.referrals ADD COLUMN audit_p double precision CHECK (audit_p IS NULL OR (audit_p > 0 AND audit_p <= 1));
ALTER TABLE public.referrals ADD COLUMN ai_band text CHECK (ai_band IN ('refer','review','negative'));
UPDATE public.referrals SET audit_sampled = true, audit_p = 0.05 WHERE reason = 'random_audit';
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_reason_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_reason_check CHECK (reason IN ('ai_suspected','ai_borderline','low_vision','random_audit','doctor','worker'));

-- Guard: SECURITY INVOKER, so current_user is the API role ('authenticated') for client updates and the function
-- owner for updates made inside SECURITY DEFINER system functions (AI trigger, field_referral).
CREATE OR REPLACE FUNCTION public.referrals_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  -- the audit draw is a permanent fact; nobody may change it
  NEW.audit_sampled := OLD.audit_sampled;
  NEW.audit_p := OLD.audit_p;
  IF current_user IN ('authenticated','anon') AND public.has_role(auth.uid(),'health_worker') AND NOT public.has_role(auth.uid(),'admin') THEN
    IF NEW.referral_type IS DISTINCT FROM OLD.referral_type OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       OR NEW.doctor_note IS DISTINCT FROM OLD.doctor_note OR NEW.patient_visible IS DISTINCT FROM OLD.patient_visible
       OR NEW.ai_band IS DISTINCT FROM OLD.ai_band
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

CREATE OR REPLACE FUNCTION public.auto_refer_from_prediction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; existing public.referrals%ROWTYPE; r double precision; rsn text; pri text;
BEGIN
  SELECT e.patient_id INTO pid FROM public.eye_images e WHERE e.id = NEW.eye_image_id;
  IF pid IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO existing FROM public.referrals WHERE patient_id = pid;
  IF NEW.band IN ('refer','review') THEN
    rsn := CASE WHEN NEW.band = 'refer' THEN 'ai_suspected' ELSE 'ai_borderline' END;
    pri := CASE WHEN NEW.band = 'refer' THEN 'urgent' ELSE 'routine' END;
    IF NOT FOUND THEN
      INSERT INTO public.referrals (patient_id, reason, referral_type, priority, patient_visible, ai_band, created_by)
      VALUES (pid, rsn, 'cataract', pri, true, NEW.band, NEW.created_by);
    ELSIF existing.status = 'awaiting_doctor'
          AND (existing.reason IN ('random_audit','low_vision') OR (existing.reason = 'ai_borderline' AND NEW.band = 'refer')) THEN
      UPDATE public.referrals SET reason = rsn, referral_type = 'cataract', priority = pri, patient_visible = true, ai_band = NEW.band
        WHERE id = existing.id;
    END IF;
  ELSIF NOT FOUND
        AND NOT EXISTS (SELECT 1 FROM public.predictions p JOIN public.eye_images e ON e.id = p.eye_image_id
                        WHERE e.patient_id = pid AND p.id <> NEW.id) THEN
    SELECT audit_rate INTO r FROM public.screening_config WHERE id = 1;
    r := coalesce(r, 0.05);
    IF random() < r THEN
      INSERT INTO public.referrals (patient_id, reason, referral_type, priority, patient_visible, audit_sampled, audit_p, ai_band, created_by)
      VALUES (pid, 'random_audit', 'none', 'audit', false, true, r, 'negative', NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END $$;

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
    -- audit_sampled/audit_p are kept by the guard: the patient stays in the audit stratum for estimation
    UPDATE referrals SET reason = _reason, referral_type = _type, priority = _priority, patient_visible = true WHERE id = existing.id;
  END IF;
END $$;

-- ---------- 4. Blinded research grading ----------
ALTER TABLE public.reviews ADD COLUMN blinded boolean NOT NULL DEFAULT false;

-- Eyes of the research sample (AI refer/review, random audit, field referrals) in a pseudo-random order that is
-- stable per doctor; returns no AI band, reason or priority. SECURITY INVOKER: normal RLS applies.
CREATE OR REPLACE FUNCTION public.grading_queue(_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, eye text, storage_path text, pupil_roi_path text, pupil_circle_confirmed boolean,
               circle_cx double precision, circle_cy double precision, circle_r double precision,
               study_id text, age integer, sex text, remaining bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  pool AS (
    SELECT e.id, e.eye, e.storage_path, e.pupil_roi_path, e.pupil_circle_confirmed, e.circle_cx, e.circle_cy, e.circle_r,
           p.study_id, p.age, p.sex, md5(e.id::text || me.uid::text) AS k
    FROM referrals r JOIN patients p ON p.id = r.patient_id JOIN eye_images e ON e.patient_id = p.id, me
    WHERE e.pupil_circle_confirmed
      AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.eye_image_id = e.id AND v.doctor_id = me.uid)
  )
  SELECT id, eye, storage_path, pupil_roi_path, pupil_circle_confirmed, circle_cx, circle_cy, circle_r, study_id, age, sex,
         (SELECT count(*) FROM pool)
  FROM pool ORDER BY k LIMIT greatest(1, least(_limit, 100))
$$;
GRANT EXECUTE ON FUNCTION public.grading_queue(integer) TO authenticated;

-- ---------- 5. Field sensitivity estimate (stratified Horvitz-Thompson) ----------
-- Patient-level. Screen-positive = any eye in band refer/review. Reference = any eye labelled cataract by a doctor
-- (blinded labels only when _blinded_only). AI-negative patients with a field referral (low vision / worker) are
-- all reviewed (weight 1); other AI-negative patients enter only through the random audit (weight 1/audit_p).
CREATE OR REPLACE FUNCTION public.audit_sensitivity(_blinded_only boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor')) THEN RAISE EXCEPTION 'not allowed'; END IF;
  WITH pat AS (
    SELECT p.id,
           bool_or(pr.band IN ('refer','review')) AS screen_pos,
           r.audit_sampled, r.audit_p, r.reason
    FROM patients p JOIN eye_images e ON e.patient_id = p.id JOIN predictions pr ON pr.eye_image_id = e.id
    LEFT JOIN referrals r ON r.patient_id = p.id
    GROUP BY p.id, r.audit_sampled, r.audit_p, r.reason
  ), ref AS (
    SELECT e.patient_id AS id,
           bool_or(v.diagnosis IN ('cataract_early','cataract_advanced')) AS cataract,
           bool_and(v.diagnosis = 'ungradable') AS all_ungradable
    FROM reviews v JOIN eye_images e ON e.id = v.eye_image_id
    WHERE (NOT _blinded_only OR v.blinded)
    GROUP BY e.patient_id
  ), j AS (
    SELECT pat.*, ref.cataract, ref.all_ungradable,
           (pat.reason IN ('low_vision','worker')) AS field_ref
    FROM pat LEFT JOIN ref ON ref.id = pat.id
  )
  SELECT jsonb_build_object(
    'tp', count(*) FILTER (WHERE screen_pos AND cataract),
    'screen_pos_reviewed', count(*) FILTER (WHERE screen_pos AND cataract IS NOT NULL),
    'screen_pos_total', count(*) FILTER (WHERE screen_pos),
    'fn_field_stratum', count(*) FILTER (WHERE NOT screen_pos AND field_ref AND cataract),
    'fn_audit_weighted', coalesce(sum(1.0 / audit_p) FILTER (WHERE NOT screen_pos AND NOT field_ref AND audit_sampled AND cataract), 0),
    'audit_reviewed', count(*) FILTER (WHERE NOT screen_pos AND NOT field_ref AND audit_sampled AND cataract IS NOT NULL),
    'audit_total', count(*) FILTER (WHERE NOT screen_pos AND NOT field_ref AND audit_sampled),
    'negatives_total', count(*) FILTER (WHERE NOT screen_pos),
    'sensitivity_hat', CASE WHEN count(*) FILTER (WHERE screen_pos AND cataract) = 0 THEN NULL ELSE
       count(*) FILTER (WHERE screen_pos AND cataract)::numeric /
       (count(*) FILTER (WHERE screen_pos AND cataract)
        + count(*) FILTER (WHERE NOT screen_pos AND field_ref AND cataract)
        + coalesce(sum(1.0 / audit_p) FILTER (WHERE NOT screen_pos AND NOT field_ref AND audit_sampled AND cataract), 0)) END,
    'blinded_only', _blinded_only
  ) INTO res FROM j;
  RETURN res;
END $$;
GRANT EXECUTE ON FUNCTION public.audit_sensitivity(boolean) TO authenticated;

-- ---------- 6. Audit-log coverage for the new configuration table ----------
CREATE TRIGGER audit_screening_config AFTER INSERT OR UPDATE OR DELETE ON public.screening_config FOR EACH ROW EXECUTE FUNCTION public.write_audit();
