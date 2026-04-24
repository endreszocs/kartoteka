-- KARTOTEKA — M8.1 polish: szemely CNP szerver-oldali UNIQUE védelem
-- Dátum: 2026-04-24
-- Futtatja: Endre (feedback_supabase_access szerint)
--
-- Kontextus:
--   Az M8.1 desktop "új tag" flow kliens-oldali CNP-dupláció-check-et csinál
--   a `szemely_local` + `szemely_pending_local` kombinált ismeretéből, DE a
--   szerver oldalon NINCS UNIQUE constraint a (congregation_id, cnp) párra.
--   Ez azt jelenti, hogy ha két lelkész egyszerre akarja felvenni ugyanazt a
--   CNP-t (pl. egyik online, másik offline), akkor a second szinkron NEM ütközik
--   automatikusan, és duplikát sor keletkezhet a DB-ben.
--
-- Ez a migráció egy **PARTIAL UNIQUE INDEX**-et hoz létre a `szemely` táblára:
--   UNIQUE (congregation_id, cnp) WHERE isvisible = true
--
-- Miért PARTIAL:
--   - A soft-delete (isvisible=false) esetén a CNP "szabadon használható"
--     újra — pl. ha a rejtett tagot újra felveszik egy újabb család-kontextusban
--   - A halott tagok CNP-je továbbra is egyedi marad (meghalt=true de isvisible=true)
--   - A rejtett/töröltek CNP-je nem ütközik
--
-- Hatás:
--   - Az INSERT-eket amelyeknél (congregation_id, cnp) + isvisible=true már
--     létezik, a Supabase elutasítja 23505 error-code-dal
--   - A desktop `szemely-write-sync.ts` már kezeli a 23505-öt → conflict
--   - A desktop `createSzemelyEntry` szintén 23505 → duplicateCnp flag
--
-- Ellenőrzés:
--   Az utolsó SELECT lekérdezi a létező duplikátumokat (isvisible=true párokat
--   azonos CNP-vel ugyanabban a gyülekezetben). Ha már vannak, a CREATE INDEX
--   hibát dob — akkor előbb a duplikátumokat kell rendezni.

BEGIN;

-- 1. Duplikátum-detektálás — FUTTATÁS ELŐTT ELLENŐRIZNI!
DO $$
DECLARE
    dup_count bigint;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT congregation_id, cnp
        FROM public.szemely
        WHERE isvisible = true
          AND cnp IS NOT NULL
          AND cnp <> ''
        GROUP BY congregation_id, cnp
        HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'A szemely táblában % duplikált (congregation_id, cnp) pár található. '
            'Futtasd a végén lévő SELECT-et, és rendezd őket kézzel (meghalt/rejtett flag-gel) '
            'mielőtt a UNIQUE INDEX-et létrehozod.', dup_count;
    END IF;
END$$;

-- 2. PARTIAL UNIQUE INDEX
-- CONCURRENTLY nem használható a tranzakcióban; ha a tábla nagy és a lock
-- problémát jelent, külön-futó migrációba kell emelni (akkor BEGIN/COMMIT
-- nélkül, csak CREATE INDEX CONCURRENTLY).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_szemely_cnp_congregation_visible
    ON public.szemely (congregation_id, cnp)
    WHERE isvisible = true;

COMMENT ON INDEX public.uniq_szemely_cnp_congregation_visible IS
    'M8.1 polish — védi a desktop "új tag" flow-t a párhuzamos kliensek duplikátuma ellen. '
    'Rejtett (isvisible=false) tagok CNP-je nem ütközik, így a soft-delete után újra felvehető.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Ellenőrző lekérdezések (futtasd, ha a fenti hibára futott)
-- ─────────────────────────────────────────────────────────────────────────

-- Meglévő duplikátumok listája (isvisible=true, ugyanabban a gyülekezetben)
SELECT
    s.congregation_id,
    s.cnp,
    s.id,
    s.csaladnev,
    s.k_nev,
    s.sz_datum,
    s.meghalt,
    s.member_status,
    s.created,
    s.updated_at
FROM public.szemely s
WHERE s.isvisible = true
  AND s.cnp IS NOT NULL
  AND s.cnp <> ''
  AND EXISTS (
      SELECT 1
      FROM public.szemely s2
      WHERE s2.congregation_id = s.congregation_id
        AND s2.cnp = s.cnp
        AND s2.isvisible = true
        AND s2.id <> s.id
  )
ORDER BY s.congregation_id, s.cnp, s.created;

-- Ellenőrzés: az index valóban létrejött?
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'szemely'
  AND indexname = 'uniq_szemely_cnp_congregation_visible';
