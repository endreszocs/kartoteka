-- KARTOTÉKA God Mode és gyülekezeti pénzügyi bővítések
-- Dátum: 2026-04-09

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.system_settings (key, value)
VALUES ('god_mode_pin', '258456')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.bankszamlak
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ikon text DEFAULT 'building-2';

CREATE UNIQUE INDEX IF NOT EXISTS idx_bankszamlak_default_one_per_congregation
  ON public.bankszamlak (congregation_id)
  WHERE is_default = true AND aktiv = true;

CREATE TABLE IF NOT EXISTS public.jarulek_kedvezmeny (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  ev integer NOT NULL,
  tipus text NOT NULL CHECK (tipus = ANY (ARRAY['idoszak'::text, 'kor'::text, 'jovedelem'::text])),
  sorrend integer DEFAULT 0,
  aktiv boolean DEFAULT true,
  hatarid text,
  kedv_osszeg numeric,
  kor_tol integer,
  szazalek numeric,
  fix_osszeg numeric,
  jov_leiras text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarulek_kedvezmeny_congregation_ev
  ON public.jarulek_kedvezmeny (congregation_id, ev DESC, sorrend ASC);
