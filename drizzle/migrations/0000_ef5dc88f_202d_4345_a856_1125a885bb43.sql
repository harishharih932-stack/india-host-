-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_own_read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1) || '-' || substr(NEW.id::text, 1, 6),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- repositories
CREATE TABLE public.repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  language TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  file_count INTEGER NOT NULL DEFAULT 0,
  original_bytes BIGINT NOT NULL DEFAULT 0,
  compressed_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);
GRANT SELECT ON public.repositories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repositories TO authenticated;
GRANT ALL ON public.repositories TO service_role;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repos_public_read" ON public.repositories FOR SELECT USING (is_public OR auth.uid() = owner_id);
CREATE POLICY "repos_owner_insert" ON public.repositories FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "repos_owner_update" ON public.repositories FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "repos_owner_delete" ON public.repositories FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER repositories_updated_at BEFORE UPDATE ON public.repositories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- repo files
CREATE TABLE public.repo_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  encoding TEXT NOT NULL DEFAULT 'plain',
  original_bytes INTEGER NOT NULL DEFAULT 0,
  compressed_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repo_id, path)
);
GRANT SELECT ON public.repo_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_files TO authenticated;
GRANT ALL ON public.repo_files TO service_role;
ALTER TABLE public.repo_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repo_files_read" ON public.repo_files FOR SELECT USING (
  auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.is_public)
);
CREATE POLICY "repo_files_owner_insert" ON public.repo_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "repo_files_owner_update" ON public.repo_files FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "repo_files_owner_delete" ON public.repo_files FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER repo_files_updated_at BEFORE UPDATE ON public.repo_files
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- commits
CREATE TABLE public.commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  files_changed INTEGER NOT NULL DEFAULT 0,
  bytes_added INTEGER NOT NULL DEFAULT 0,
  bytes_removed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.commits TO anon;
GRANT SELECT, INSERT, DELETE ON public.commits TO authenticated;
GRANT ALL ON public.commits TO service_role;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commits_read" ON public.commits FOR SELECT USING (
  auth.uid() = author_id OR EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.is_public)
);
CREATE POLICY "commits_owner_insert" ON public.commits FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "commits_owner_delete" ON public.commits FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- deployments
CREATE TABLE public.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  build_log TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deployments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deployments TO authenticated;
GRANT ALL ON public.deployments TO service_role;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deployments_read" ON public.deployments FOR SELECT USING (
  auth.uid() = owner_id OR status = 'live'
);
CREATE POLICY "deployments_owner_insert" ON public.deployments FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "deployments_owner_update" ON public.deployments FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "deployments_owner_delete" ON public.deployments FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER deployments_updated_at BEFORE UPDATE ON public.deployments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- activity
CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_own_read" ON public.activity_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "activity_own_insert" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX activity_events_user_day_idx ON public.activity_events (user_id, day);

-- api keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_own_read" ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "api_keys_own_insert" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "api_keys_own_update" ON public.api_keys FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "api_keys_own_delete" ON public.api_keys FOR DELETE TO authenticated USING (auth.uid() = owner_id);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;