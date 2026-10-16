CREATE TYPE public.app_role AS ENUM ('admin','health_worker','doctor');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "own or admin read profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_any_role(auth.uid()));
CREATE POLICY "own update profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own insert profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "own or admin read roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND user_id <> auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role read sites" ON public.sites FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "admin manage sites" ON public.sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.sites (name) VALUES ('Medical Centre 1');

CREATE SEQUENCE public.study_id_seq START 1;
GRANT USAGE ON SEQUENCE public.study_id_seq TO authenticated, service_role;

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id text NOT NULL UNIQUE DEFAULT ('NETRA-' || lpad(nextval('public.study_id_seq')::text, 4, '0')),
  age integer,
  sex text CHECK (sex IN ('male','female','other')),
  area text,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  consent_given boolean NOT NULL,
  consent_type text CHECK (consent_type IN ('verbal','written')),
  consent_photo_path text,
  screening_date date NOT NULL DEFAULT current_date,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_required CHECK (consent_given = true)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role read patients" ON public.patients FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "worker insert patients" ON public.patients FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'health_worker') OR public.has_role(auth.uid(),'admin')) AND created_by = auth.uid());
CREATE POLICY "admin delete patients" ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.eye_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  eye text NOT NULL CHECK (eye IN ('left','right')),
  storage_path text NOT NULL,
  circle_cx double precision,
  circle_cy double precision,
  circle_r double precision,
  flash_used boolean,
  lighting text,
  phone_model text,
  blur_score double precision,
  brightness double precision,
  glare_fraction double precision,
  quality_status text,
  visual_acuity text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, eye)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eye_images TO authenticated;
GRANT ALL ON public.eye_images TO service_role;
ALTER TABLE public.eye_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role read images" ON public.eye_images FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "worker insert images" ON public.eye_images FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'health_worker') OR public.has_role(auth.uid(),'admin')) AND created_by = auth.uid());
CREATE POLICY "admin delete images" ON public.eye_images FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eye_image_id uuid NOT NULL REFERENCES public.eye_images(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL DEFAULT auth.uid(),
  diagnosis text NOT NULL CHECK (diagnosis IN ('normal','cataract_early','cataract_advanced','other','ungradable')),
  other_text text,
  confidence integer CHECK (confidence BETWEEN 1 AND 5),
  referral boolean,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (eye_image_id, doctor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role read reviews" ON public.reviews FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "doctor insert review" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin')) AND doctor_id = auth.uid());
CREATE POLICY "doctor update own review" ON public.reviews FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
CREATE POLICY "admin delete reviews" ON public.reviews FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "role read eye photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'eye-photos' AND public.has_any_role(auth.uid()));
CREATE POLICY "worker upload eye photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eye-photos' AND (public.has_role(auth.uid(),'health_worker') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "admin delete eye photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'eye-photos' AND public.has_role(auth.uid(),'admin'));