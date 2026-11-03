DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$q$authenticated$q$) THEN CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE anon NOLOGIN; END IF; END $$;
CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.uid', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE SCHEMA storage; CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
