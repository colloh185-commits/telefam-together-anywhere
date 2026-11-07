-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 60),
  username text NOT NULL CHECK (username ~ '^[a-z0-9_.]{3,24}$'),
  phone_country text NOT NULL CHECK (phone_country ~ '^[A-Z]{2}$'),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  gender text NOT NULL CHECK (gender IN ('male','female','other','prefer_not')),
  date_of_birth date NOT NULL,
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 150),
  location_label text CHECK (location_label IS NULL OR char_length(location_label) <= 120),
  location_lat numeric(6,2),
  location_lng numeric(6,2),
  avatar_media_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_idx ON public.profiles (lower(username));

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Age + timestamps validation (time-dependent, so trigger not CHECK)
CREATE OR REPLACE FUNCTION public.profiles_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date_of_birth > (current_date - interval '13 years')::date THEN
    RAISE EXCEPTION 'age_requirement' USING ERRCODE = '22023';
  END IF;
  IF NEW.date_of_birth < (current_date - interval '120 years')::date THEN
    RAISE EXCEPTION 'invalid_dob' USING ERRCODE = '22023';
  END IF;
  NEW.username := lower(NEW.username);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_validate_trg BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_validate();

-- Username availability without exposing other profiles
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(_username) AND id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO authenticated, service_role;

-- Media assets (fingerprinted, id-renamed)
CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('avatar')),
  storage_path text NOT NULL UNIQUE,
  mime text NOT NULL,
  bytes integer NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  sha256 text NOT NULL,
  dhash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_owner_idx ON public.media_assets(owner_id);
CREATE INDEX media_assets_sha_idx ON public.media_assets(sha256);
CREATE INDEX media_assets_dhash_idx ON public.media_assets(dhash);
GRANT SELECT ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own media" ON public.media_assets FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Activity log (server-written)
CREATE TABLE public.activity_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid,
  event text NOT NULL CHECK (char_length(event) <= 64),
  ip_hash text,
  device_hash text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_user_idx ON public.activity_logs(user_id, created_at DESC);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own activity" ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Throttle state (server-only)
CREATE TABLE public.auth_throttle (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  last_hit timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);
GRANT ALL ON public.auth_throttle TO service_role;
ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;

-- Atomic throttle check. mode 'ladder' uses OTP resend ladder, mode 'window' uses fixed limit per window.
CREATE OR REPLACE FUNCTION public.throttle_hit(_key text, _mode text, _limit integer, _window_seconds integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.auth_throttle%ROWTYPE;
  now_ts timestamptz := now();
  cooldown integer;
BEGIN
  INSERT INTO public.auth_throttle(key, hits, window_start, last_hit)
  VALUES (_key, 0, now_ts, now_ts)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO r FROM public.auth_throttle WHERE key = _key FOR UPDATE;

  IF r.blocked_until IS NOT NULL AND r.blocked_until > now_ts THEN
    RETURN GREATEST(1, ceil(extract(epoch FROM (r.blocked_until - now_ts)))::integer);
  END IF;

  IF r.window_start < now_ts - make_interval(secs => _window_seconds) THEN
    r.hits := 0;
    r.window_start := now_ts;
  END IF;

  IF _mode = 'window' AND r.hits >= _limit THEN
    UPDATE public.auth_throttle SET blocked_until = r.window_start + make_interval(secs => _window_seconds) WHERE key = _key;
    RETURN GREATEST(1, ceil(extract(epoch FROM (r.window_start + make_interval(secs => _window_seconds) - now_ts)))::integer);
  END IF;

  r.hits := r.hits + 1;

  IF _mode = 'ladder' THEN
    cooldown := CASE WHEN r.hits <= 3 THEN 60 WHEN r.hits = 4 THEN 900 WHEN r.hits = 5 THEN 3600 ELSE 86400 END;
    UPDATE public.auth_throttle
      SET hits = r.hits, window_start = r.window_start, last_hit = now_ts,
          blocked_until = now_ts + make_interval(secs => cooldown)
      WHERE key = _key;
    RETURN -cooldown; -- negative = allowed, value = cooldown applied
  END IF;

  UPDATE public.auth_throttle SET hits = r.hits, window_start = r.window_start, last_hit = now_ts, blocked_until = NULL WHERE key = _key;
  RETURN 0;
END $$;
REVOKE ALL ON FUNCTION public.throttle_hit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.throttle_hit(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.throttle_reset(_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.auth_throttle WHERE key = _key;
$$;
REVOKE ALL ON FUNCTION public.throttle_reset(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.throttle_reset(text) TO service_role;

-- Storage: owners read their own avatars folder; writes only via server
CREATE POLICY "Owners read own avatars" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);