-- =============================================================================
-- AZ ANAF 60 NAPOS CSENGŐ MEGJAVÍTÁSA  (átvilágítás P1, 2026-09-03)
-- =============================================================================
--
-- ⛔ A HIBA
--
-- A `public.check_oblio_deadline_for_user()` RPC (2026-04-16 óta él) két helyen
-- hivatkozik az `ertesitesek.megjegyzes` oszlopra:
--   · az idempotencia-ellenőrzésben (`megjegyzes::jsonb ->> 'kind'`),
--   · és az INSERT oszloplistájában.
-- Csakhogy az `ertesitesek` táblában NINCS ilyen oszlop — a függvény tehát
-- MINDIG 42703-mal (column does not exist) hasal el.
--
-- A hibát a hívólánc KÉTSZER elnyeli:
--   1. `checkOblioDeadline()` → `if (error) return { status: 'no_congregation' }`
--      (egy adatbázis-hibából „nincs gyülekezet" lett),
--   2. `penzugy/page.tsx` → `void checkOblioDeadline().catch(() => {})`.
--
-- KÖVETKEZMÉNY: a csengő SOHA nem szólalt meg. A lelkész sosem kapott
-- figyelmeztetést arról, hogy közeledik az ANAF SPV 60 napos letöltési
-- határideje — pedig azon túl a befogadott számlák MÁR NEM TÖLTHETŐK LE az
-- SPV-ből, csak a beszállítótól kérhetők el egyenként.
--
-- ── MIT MÉR A CSENGŐ (hogy tudd, mit fogsz látni) ───────────────────────────
-- Az `oblio_fiokok.utolso_xml_letoltes_at` óta eltelt napokat:
--   ·  < 50 nap → csend
--   · 50–54 nap → „Közeledik az ANAF SPV határidő" (figyelmeztetés)
--   · 55–59 nap → „Sürgős: ANAF SPV letöltés esedékes" (figyelmeztetés)
--   ·  ≥ 60 nap → „Lejárt az ANAF SPV letöltési határidő!" (veszély)
-- Vagyis IGEN: a csengő azt jelzi, hogy ideje letölteni és beolvasni a
-- befogadott számlákat.
--
-- ⚠️ AMIRE SZÁMÍTS A FUTTATÁS UTÁN
-- Amint egy érintett lelkész legközelebb megnyitja a Pénzügy oldalt, a
-- visszatartott értesítés AZONNAL létrejön. Ha több gyülekezetnél régóta nem
-- volt letöltés, egyszerre több értesítés is megjelenhet. Ez nem hiba — ezek a
-- figyelmeztetések eddig is esedékesek voltak, csak néma volt a csengő.
-- Felhasználónként és kategóriánként EGY sor keletkezik (az idempotencia-kapu
-- az utolsó letöltés óta egyszer engedi).
--
-- ⚠️ MEGJEGYZÉS: ha egy gyülekezetnek nincs AKTÍV Oblio-fiókja, vagy még soha
-- nem volt letöltés, a függvény `never_downloaded`/`no_congregation` státusszal
-- tér vissza, és NEM keletkezik értesítés. Tehát nem fog mindenki riasztást kapni.
--
-- BIZTONSÁGOS: idempotens, meglévő adatot nem ír felül, nem töröl. Az
-- `ertesitesek` tábla már be van sorolva a mentés-politikába, ÚJ
-- backup_table_policy sorra nincs szükség (meglévő táblát bővítünk).
--
-- Futtatás: Supabase SQL editor, egyben.
-- =============================================================================

BEGIN;

-- A hiányzó oszlop. `text`, mert az RPC `::text`-ként szúrja be a JSON-t, és az
-- idempotencia-ellenőrzés `::jsonb`-ra kasztol vissza.
ALTER TABLE public.ertesitesek
  ADD COLUMN IF NOT EXISTS megjegyzes text;

COMMENT ON COLUMN public.ertesitesek.megjegyzes IS
  'Gépi kiegészítő adat JSON-szövegként (pl. a 60 napos ANAF-csengő `kind`, '
  '`congregation_id`, `last_download_at`, `days_since` mezői). A felületen nem '
  'jelenik meg; az idempotencia-ellenőrzés olvassa. 2026-09-03: a '
  'check_oblio_deadline_for_user() RPC ezt várta, de az oszlop hiányzott, ezért '
  'a csengő soha nem szólalt meg.';

COMMIT;

-- =============================================================================
-- ELLENŐRZÉS (a COMMIT után külön futtatva)
-- =============================================================================
-- ⚠️ EGYETLEN lekérdezés, UNION ALL-lal: a Supabase SQL editor csak az UTOLSÓ
--    eredmény-rácsot mutatja.

SELECT * FROM (

  -- (A) Létrejött-e az oszlop?
  SELECT
    1 AS sorrend,
    'A · az oszlop' AS vizsgalat,
    'ertesitesek.megjegyzes' AS targy,
    coalesce(
      (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ertesitesek'
          AND column_name = 'megjegyzes'),
      'NINCS'
    ) AS reszlet,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ertesitesek'
         AND column_name = 'megjegyzes'
    ) THEN '✅ megvan — a csengő működhet'
      ELSE '⛔ HIÁNYZIK — az ALTER nem futott le'
    END AS allapot

  UNION ALL

  -- (B) Kiket fog érinteni? Aktív Oblio-fiókkal rendelkező gyülekezetek,
  --     az utolsó letöltés óta eltelt idővel. Ez MEGMUTATJA ELŐRE, hány
  --     értesítés fog keletkezni, és kinél.
  SELECT
    2,
    'B · érintett gyülekezetek',
    coalesce(c.nev_hu, o.congregation_id::text),
    CASE
      WHEN o.utolso_xml_letoltes_at IS NULL THEN 'még SOHA nem volt letöltés'
      ELSE (EXTRACT(EPOCH FROM (now() - o.utolso_xml_letoltes_at))::integer / 86400)::text || ' napja'
    END,
    CASE
      WHEN o.utolso_xml_letoltes_at IS NULL
        THEN 'ℹ️ nem keletkezik értesítés (never_downloaded)'
      WHEN EXTRACT(EPOCH FROM (now() - o.utolso_xml_letoltes_at))::integer / 86400 >= 60
        THEN '⛔ LEJÁRT — veszély-értesítést fog kapni'
      WHEN EXTRACT(EPOCH FROM (now() - o.utolso_xml_letoltes_at))::integer / 86400 >= 55
        THEN '⚠️ sürgős — figyelmeztetést fog kapni'
      WHEN EXTRACT(EPOCH FROM (now() - o.utolso_xml_letoltes_at))::integer / 86400 >= 50
        THEN '⚠️ közeledik — figyelmeztetést fog kapni'
      ELSE '✅ rendben, nem kap értesítést'
    END
  FROM public.oblio_fiokok o
  LEFT JOIN public.congregations c ON c.id = o.congregation_id
  WHERE o.aktiv = true

  UNION ALL

  -- (C) Összkép: hány aktív Oblio-fiók van egyáltalán?
  SELECT
    3,
    'C · összkép',
    'aktív Oblio-fiók',
    (SELECT count(*)::text FROM public.oblio_fiokok WHERE aktiv = true),
    CASE WHEN (SELECT count(*) FROM public.oblio_fiokok WHERE aktiv = true) = 0
      THEN 'ℹ️ nincs aktív Oblio-fiók — a csengő ma senkit nem érint, a javítás megelőző'
      ELSE 'a fenti B blokk mutatja, kinél mi fog történni'
    END

) AS ellenorzes
ORDER BY sorrend, targy;
