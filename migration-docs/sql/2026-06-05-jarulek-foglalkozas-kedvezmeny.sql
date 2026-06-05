-- ============================================================================
-- 2026-06-05 — Foglalkozás-alapú egyházfenntartási kedvezmény
-- ----------------------------------------------------------------------------
-- A welcome wizard (Step 4 – Pénzügy) mostantól foglalkozás-alapú kedvezményt
-- is tud rögzíteni (pl. "tanuló/diák → nem fizet", "nyugdíjas → 60 RON").
--
-- A `jarulek_kedvezmeny` tábla `tipus` mezője eddig csak az
--   'idoszak' | 'kor' | 'jovedelem'
-- értékeket engedte. Ezt bővítjük 'foglalkozas'-szal.
--
-- Az új 'foglalkozas' sorok mezőkiosztása (meglévő oszlopok újrahasznosítása):
--   jov_leiras  = a foglalkozás-kulcsszavak vesszővel elválasztva
--                 (pl. "tanuló, diák, egyetemista"). A rendszer a tag
--                 `szemely.foglalkozas` mezőjét ezekhez hasonlítja
--                 (kis/nagybetű- és ékezet-érzéketlenül, teljes szó egyezés).
--   fix_osszeg  = ennyit kell fizetnie a tagnak (0 = nem fizet / mentesül)
--   szazalek    = VAGY: százalékos kedvezmény (pl. 50 = a fele jár)
--   kor_tol/hatarid/kedv_osszeg = nem használt a 'foglalkozas' tipusnál
--
-- A kalkuláció a kapott összegek MINIMUMÁT veszi (a legkedvezőbb szabály nyer).
-- ============================================================================

ALTER TABLE public.jarulek_kedvezmeny
  DROP CONSTRAINT IF EXISTS jarulek_kedvezmeny_tipus_check;

ALTER TABLE public.jarulek_kedvezmeny
  ADD CONSTRAINT jarulek_kedvezmeny_tipus_check
  CHECK (tipus = ANY (ARRAY['idoszak'::text, 'kor'::text, 'jovedelem'::text, 'foglalkozas'::text]));

-- Ellenőrzés:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.jarulek_kedvezmeny'::regclass
--     AND conname = 'jarulek_kedvezmeny_tipus_check';
