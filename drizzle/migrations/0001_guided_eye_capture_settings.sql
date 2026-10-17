ALTER TABLE public.eye_images ADD COLUMN roi_storage_path text, ADD COLUMN guide_box jsonb, ADD COLUMN capture_checks jsonb;
CREATE TABLE public.settings (
 key text PRIMARY KEY,
 model_url text NOT NULL DEFAULT '/model/model.json',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT research_model_key CHECK (key = 'research_model'),
 CONSTRAINT safe_model_url CHECK (model_url = '/model/model.json' OR model_url ~ '^https://[^[:space:]]+$')
);
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research roles read settings" ON public.settings FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "admin insert settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update settings" ON public.settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));