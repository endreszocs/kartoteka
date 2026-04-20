-- Publikus oldal statisztikák beállításai
ALTER TABLE public.public_sites
  ADD COLUMN IF NOT EXISTS show_member_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_presbyter_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_family_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_age_distribution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_member_count integer,
  ADD COLUMN IF NOT EXISTS override_presbyter_count integer,
  ADD COLUMN IF NOT EXISTS override_family_count integer;
