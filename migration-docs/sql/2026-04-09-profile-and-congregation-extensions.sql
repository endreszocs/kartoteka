-- KARTOTÉKA profil- és gyülekezeti bővítések
-- Dátum: 2026-04-09

CREATE TABLE IF NOT EXISTS public.pastor_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_title text,
  photo_url text,
  address text,
  emergency_phone text,
  service_started_at date,
  previous_service_places text[] DEFAULT '{}',
  previous_roles text[] DEFAULT '{}',
  bio text,
  ministry_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.congregation_annual_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  eves_jarulek numeric NOT NULL DEFAULT 0,
  jarulek_kedvezmenyes numeric DEFAULT 0,
  jarulek_hatarid character varying DEFAULT '07-01',
  note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT congregation_annual_fees_unique UNIQUE (congregation_id, year)
);

ALTER TABLE public.ertesitesek
  ADD COLUMN IF NOT EXISTS admin_request_id uuid REFERENCES public.admin_access_requests(id);

CREATE INDEX IF NOT EXISTS idx_pastor_profiles_user_id ON public.pastor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_congregation_annual_fees_congregation_year ON public.congregation_annual_fees(congregation_id, year DESC);
