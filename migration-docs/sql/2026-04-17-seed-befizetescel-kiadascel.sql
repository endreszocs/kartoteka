-- =========================================================================
-- befizetescel + kiadascel SEEDING a szamadasicel-ből
-- (KARTOTEKA — 2026-04-17)
--
-- A `befizetescel` és `kiadascel` táblák junction-szerepet töltenek be:
-- meghatározzák, hogy a globális szamadasicel chart mely celláit használhatja
-- a rendszer bevétel ill. kiadás-rögzítéshez. A `befizetes.id_befizetescel` és
-- `kiadas.id_kiadascel` FK-ok EZEKRE hivatkoznak (nem közvetlenül a szamadasicel-re).
--
-- Probléma, amit ez a migráció old:
--   - A két tábla üres lehet (soha nem lett seedelve)
--   - Ezért a bevétel/kiadás/BCR-import dialogokban nem jelennek meg kategóriák
--   - A felhasználó nem tud tételt rögzíteni (üres dropdown)
--
-- Amit ez a migráció csinál:
--   1. Beszúr minden hiányzó `befizetescel` sort a `szamadasicel` type='B' cellákból
--   2. Ugyanezt a `kiadascel`-re type='K'
--   3. INSERT + UPDATE RLS policy-t ad authenticated felhasználóknak
--      (mert a junction táblákat bármikor bővíthetjük, ha új szamadasicel jön)
--
-- FUTTATÁS:
--   A Supabase SQL editor-ben futtasd le egyszer. Idempotens: nem duplikál.
-- =========================================================================

-- 1. BEFIZETESCEL seed
INSERT INTO public.befizetescel (id_szamadasicel, nev, nevro, aktiv, belsotetel, parentid)
SELECT
  s.id,
  COALESCE(s.nev, s.id),
  COALESCE(s.nevro, s.nev, s.id),
  TRUE,
  s.belsotetel,
  NULL
FROM public.szamadasicel s
LEFT JOIN public.befizetescel bc ON bc.id_szamadasicel = s.id
WHERE s.type = 'B'
  AND bc.id IS NULL;

-- 2. KIADASCEL seed
INSERT INTO public.kiadascel (id_szamadasicel, nev, nevro, aktiv, belsotetel, parentid)
SELECT
  s.id,
  COALESCE(s.nev, s.id),
  COALESCE(s.nevro, s.nev, s.id),
  TRUE,
  s.belsotetel,
  NULL
FROM public.szamadasicel s
LEFT JOIN public.kiadascel kc ON kc.id_szamadasicel = s.id
WHERE s.type = 'K'
  AND kc.id IS NULL;

-- 3. RLS policy-k: authenticated user INSERT/UPDATE
--    (A read már engedélyezett a korábbi `befizetescel_read` / `kiadascel_read`-ben)

DO $$ BEGIN
  CREATE POLICY befizetescel_write ON public.befizetescel
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY befizetescel_update ON public.befizetescel
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY kiadascel_write ON public.kiadascel
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY kiadascel_update ON public.kiadascel
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Ellenőrző lekérdezés (futtatás után)
-- SELECT
--   (SELECT COUNT(*) FROM public.szamadasicel WHERE type = 'B') AS szamadasi_B,
--   (SELECT COUNT(*) FROM public.befizetescel) AS befizetescel_count,
--   (SELECT COUNT(*) FROM public.szamadasicel WHERE type = 'K') AS szamadasi_K,
--   (SELECT COUNT(*) FROM public.kiadascel) AS kiadascel_count;
