-- ============================================================================
-- 2026-09-05 — ÉRTESÍTÉSEK (P3-utómunka): A RÉGI HOZZÁFÉRÉS-KÉRELEM SOROK
--               „VÁLASZRA VÁR" JELE + ertesites_felado_levezetes EXECUTE
-- ============================================================================
-- MIT AD
-- ──────
-- 1) EGYSZERI VISSZATÖLTÉS az `ertesitesek` azon sorain, amelyek hozzáférés-
--    kérelemre hivatkoznak (`admin_request_id`, vagy a régi sorokon a
--    `hivatkozas = 'admin_access:<uuid>'`), és a hivatkozott
--    `admin_access_requests` sor MÁR ELDŐLT — `status IN ('approved',
--    'denied', 'expired')`, FEHÉRLISTA, a TS `KERELEM_ELDOLT_ALLAPOTOK`
--    konstanssal azonos (uzenetek-shared.ts; a CHECK-en kívüli állapot nem dönt):
--        megoldva    = true
--        megoldva_at = coalesce(megoldva_at, <a döntés ideje>, now())
--
--    Ez a lelkész KÉRELEM-sorát (`warning`) ÉS a kérelmező DÖNTÉS-sorát
--    (`success`/`danger`, v0.9.227 óta admin_request_id-vel) egyaránt megjelöli —
--    az alkalmazás a döntés-sort 2026-09-05 (P3-utómunka) óta már beszúráskor
--    jelöli (notifications/actions.ts → insertErtesites: megoldva: true), így a
--    tárolt jel a futás előtt és után is EGY szabály szerint áll.
--
--    MIÉRT: a 2026-09-05 előtti döntések (jóváhagyás / elutasítás) a lelkész
--    kérelem-értesítését NEM jelölték meg — a „megoldva" jelölés csak az új
--    döntési úton történik (apps/web/app/(dashboard)/notifications/actions.ts →
--    kerelemErtesitesMegoldva). A felületen ezért a „Válaszra vár" pill és a
--    Jóváhagyás/Elutasítás gombpár SOSEM oldódott fel (a gombok már csak
--    „A kérelem már elbírálásra került." hibát adtak).
--
--    Az alkalmazás OLVASÁSKOR ettől függetlenül is a kérelem tényleges
--    állapotából vezeti le a jelet (apps/web/lib/notifications/uzenetek-shared.ts
--    → megoldasLevezetes; a lekérés apps/web/lib/notifications/uzenetek-actions.ts
--    → kerelemAllapotok). Ez a visszatöltés a TÁROLT jelölést hozza egy szintre
--    az igazsággal — egy igazságforrás, szűrhetőség, csengő.
--
--    A `megoldas_uzenet`-et SZÁNDÉKOSAN nem írjuk: a zöld sáv mondatát az
--    alkalmazás a kérelem állapotából vezeti le olvasáskor (egy szabály, nem
--    egy tárolt másolat, ami széthúzhatna).
--
-- 2) `ertesites_felado_levezetes(text,text,text,uuid,text)` — EXPLICIT
--    `GRANT EXECUTE` az `authenticated` és a `service_role` szerepnek.
--    Ma a BEFORE INSERT trigger a beszúró jogával fut és MŰKÖDIK (a
--    2026-09-05-ertesitesek-felado.sql `REVOKE ... FROM PUBLIC`-ja után a
--    tulajdonos-jog viszi). Az explicit jog a JÖVŐBELI közvetlen hívást védi
--    (pl. egy RPC-s újra-levezetés, vagy egy SECURITY INVOKER függvény), hogy
--    ne 42501-gyel hasaljon el. Az `anon` REVOKE-ja MARAD (megismételve).
--
-- 3) VERIFIKÁCIÓ egy UNION ALL rácsban (a Supabase-szerkesztő csak az UTOLSÓ
--    rácsot mutatja): a függőként jelölt, de ELDŐLT kérelmű sorok száma 0 KELL.
--
-- ELŐFELTÉTEL (fail-closed — a 0) lépés ellenőrzi, és MEGÁLL, ha hiányzik):
--   · 2026-08-11-ertesites-megoldva.sql (a `megoldva` / `megoldva_at` oszlop) —
--     a _RUN_LOG-ban NINCS bejegyzése. Ha az oszlop hiányzik, a fájl RAISE
--     EXCEPTION-nel megáll, és SEMMIT nem módosít (a Supabase-szerkesztő egy
--     tranzakcióban futtat) → előbb a 2026-08-11-es fájl, utána ez.
--   · 2026-09-05-ertesitesek-felado.sql (a levezető függvény) — lefutott.
--
-- NEM HOZ LÉTRE TÁBLÁT — MENTÉS-BESOROLÁS NEM KELL (backup_table_policy
-- érintetlen). Adatot NEM töröl; csak a `megoldva` / `megoldva_at` oszlopot
-- írja, és csak ott, ahol a jel még hiányzik.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl. IDEMPOTENS — a második futás
-- 0 sort érint (a WHERE a még jelöletlen sorokra szűkít: `megoldva IS DISTINCT
-- FROM true`), a GRANT/REVOKE ismételhető.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) ELŐFELTÉTEL-ŐR — fail-closed: ami hiányzik, azt nevén nevezi és MEGÁLL
-- ─────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
BEGIN
  IF to_regclass('public.ertesitesek') IS NULL
     OR to_regclass('public.admin_access_requests') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.ertesitesek / public.admin_access_requests tábla. Ez nem a Kartotéka éles adatbázisa.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'ertesitesek'
                   AND column_name = 'megoldva')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'ertesitesek'
                      AND column_name = 'megoldva_at') THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: az ertesitesek.megoldva / megoldva_at oszlop hiányzik — előbb a 2026-08-11-ertesites-megoldva.sql fusson le. Semmit nem módosítottam.';
  END IF;

  IF to_regprocedure('public.ertesites_felado_levezetes(text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.ertesites_felado_levezetes(text,text,text,uuid,text) — előbb a 2026-09-05-ertesitesek-felado.sql fusson le. Semmit nem módosítottam.';
  END IF;

  RAISE NOTICE '0) előfeltételek rendben — ertesitesek.megoldva megvan, a levezető függvény megvan.';
END
$elofeltetel$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) EGYSZERI VISSZATÖLTÉS — a már ELDŐLT kérelmek értesítés-sorai
--
-- ⚠️ MIÉRT A DÖNTÉS IDEJE ÉS NEM now(): a buborék zöld sávja ezt írja ki
--    („Ez a baj azóta elmúlt … (2026-06-01 12:00 — Bukarest)"); a now() azt
--    állítaná, hogy egy júniusi kérelem MA dőlt el. A now() csak végső
--    tartalék (ha a kérelem-soron nincs időbélyeg). A meglévő megoldva_at-ot
--    a coalesce MEGŐRZI — sosem írjuk felül.
--
-- ⚠️ MIÉRT `megoldva IS DISTINCT FROM true` és nem `= false`: NULL-biztos, és
--    ez az idempotencia kulcsa — a már jelölt sorhoz nem nyúlunk.
--
-- ⚠️ A RÉGI, hivatkozás-alapú sorok (`admin_access:<uuid>`, a 2026-04-09-i
--    admin_request_id oszlop ELŐTTI kor): CSAK szabályos UUID-alakot castolunk
--    (a rossz alak nem dönt és nem hasal el — 22P02 nincs). Az oszlop az első,
--    a hivatkozás a tartalék — ugyanaz a szabály, mint a TS `kerelemAzonosito`
--    (uzenetek-shared.ts: `UUID_MINTA_SZOVEG`, 8-4-4-4-12 hexa; a
--    selftest-ertesites-p3-sql.mjs abból méri ezt a regexet — két forrás nincs).
--    Az előtag 13 karakter → a substr a 14. pozíciótól indul.
--
-- ⚠️ `r.status IN ('approved','denied','expired')` és NEM `<> 'pending'`:
--    fehérlista (= TS `KERELEM_ELDOLT_ALLAPOTOK`), hogy egy a CHECK-en kívül
--    eső, ismeretlen állapot se számítson döntésnek — a TS és az SQL EGY szabály.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.ertesitesek e
SET megoldva    = true,
    megoldva_at = coalesce(
      e.megoldva_at,
      CASE r.status
        WHEN 'approved' THEN r.approved_at
        WHEN 'denied'   THEN r.denied_at
        WHEN 'expired'  THEN coalesce(r.expires_at, r.approved_at, r.denied_at)
        ELSE coalesce(r.approved_at, r.denied_at, r.expires_at)
      END,
      now()
    )
FROM public.admin_access_requests r
WHERE r.id = coalesce(
        e.admin_request_id,
        CASE WHEN e.hivatkozas ~ '^admin_access:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN substr(e.hivatkozas, 14)::uuid END
      )
  AND r.status IN ('approved', 'denied', 'expired')
  AND e.megoldva IS DISTINCT FROM true;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) EXPLICIT EXECUTE a levezető függvényre (anon: NEM)
-- ─────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) FROM anon;

-- ============================================================================
-- 3) VERIFIKÁCIÓ — EGY eredmény-rács (a 02. sornak „✅ 0" KELL lennie)
-- ============================================================================
WITH kerelem_sor AS (
  -- Ugyanaz a kapcsolás, mint a visszatöltésé: oszlop, vagy a régi hivatkozás.
  SELECT e.id, e.megoldva, e.megoldva_at, e.archived, r.status
  FROM public.ertesitesek e
  JOIN public.admin_access_requests r
    ON r.id = coalesce(
         e.admin_request_id,
         CASE WHEN e.hivatkozas ~ '^admin_access:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN substr(e.hivatkozas, 14)::uuid END
       )
)
SELECT lepes, allapot FROM (
  SELECT 1 AS sorrend, '01. ertesitesek.megoldva + megoldva_at oszlop' AS lepes,
    CASE WHEN (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ertesitesek'
                 AND column_name IN ('megoldva', 'megoldva_at')) = 2
         THEN '✅' ELSE '❌' END AS allapot
  UNION ALL
  SELECT 2, '02. függőként jelölt sor ELDŐLT kérelemmel (0 kell)',
    CASE WHEN (SELECT count(*) FROM kerelem_sor
               WHERE status IN ('approved', 'denied', 'expired') AND megoldva IS DISTINCT FROM true) = 0
         THEN '✅ 0'
         ELSE '❌ ' || (SELECT count(*) FROM kerelem_sor
                        WHERE status IN ('approved', 'denied', 'expired') AND megoldva IS DISTINCT FROM true)::text
    END
  UNION ALL
  SELECT 3, '03. megoldottnak jelölt kérelem-sor időbélyeg NÉLKÜL (0 kell)',
    CASE WHEN (SELECT count(*) FROM kerelem_sor
               WHERE megoldva = true AND megoldva_at IS NULL) = 0
         THEN '✅ 0'
         ELSE '❌ ' || (SELECT count(*) FROM kerelem_sor
                        WHERE megoldva = true AND megoldva_at IS NULL)::text
    END
  UNION ALL
  SELECT 4, '04. kérelem-sorok megoszlása (tájékoztató: kérelem-állapot=darab)',
    COALESCE((SELECT string_agg(status || '=' || db::text, ', ' ORDER BY db DESC)
              FROM (SELECT status, count(*) AS db FROM kerelem_sor GROUP BY status) x),
             'nincs kérelemre hivatkozó értesítés')
  UNION ALL
  SELECT 5, '05. még VALÓBAN függő kérelem-sor (tájékoztató — ezek jogosan „Válaszra vár")',
    (SELECT count(*) FROM kerelem_sor
     WHERE status = 'pending' AND megoldva IS DISTINCT FROM true AND archived IS DISTINCT FROM true)::text || ' sor'
  UNION ALL
  SELECT 6, '06. EXECUTE: authenticated',
    CASE WHEN has_function_privilege('authenticated',
           'public.ertesites_felado_levezetes(text,text,text,uuid,text)', 'EXECUTE')
         THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 7, '07. EXECUTE: service_role',
    CASE WHEN has_function_privilege('service_role',
           'public.ertesites_felado_levezetes(text,text,text,uuid,text)', 'EXECUTE')
         THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 8, '08. EXECUTE: anon (NEM szabad)',
    CASE WHEN has_function_privilege('anon',
           'public.ertesites_felado_levezetes(text,text,text,uuid,text)', 'EXECUTE')
         THEN '❌ az anon hívhatja' ELSE '✅ nincs joga' END
  UNION ALL
  SELECT 9, '09. a feladó-trigger továbbra is megvan (INSERT)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ertesitesek_felado_alapertelmezes')
         THEN '✅' ELSE '❌' END
) y ORDER BY sorrend;
