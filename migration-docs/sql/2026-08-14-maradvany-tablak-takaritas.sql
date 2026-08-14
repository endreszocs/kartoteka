-- ═══════════════════════════════════════════════════════════════════════════
--  MARADVÁNY-TÁBLÁK TAKARÍTÁSA (2026-08-14) — OPCIONÁLIS, ENDRE DÖNTÉSE
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ELŐZMÉNY: a réteg nélküli táblák feltérképezése (2026-08-14) megnyugtató
--  eredménnyel zárult — réteg nélküli MENTETT tábla NINCS, mind a 15 találat
--  szándékosan kizárt tábla volt. Közben viszont a lista kirajzolt HÁROM
--  maradvány-táblát, amelyek eldobását MAGUK A POLICY-SORAIK javasolják:
--
--   1) `_merge_run_log` — egyszeri adatjavító szkript (2026-04-26, merge-spouses
--      v4) segédtáblája, amit a szkript saját fejléce szerint a futás végén
--      DROP-olni kellett volna. Az eredménye a mentett csalad/szemely táblákban van.
--   2) `event` — üres, PK NÉLKÜLI legacy tábla a Supabase előtti alkalmazásból;
--      a kódbázis sehol nem hivatkozik rá.
--   3) `bealitas_zaro_adatok_mentes_20260811` — a záró-pillanatkép átalakításának
--      IDEIGLENES visszavonó táblája. ⚠️ CSAK AKKOR dobható el, ha a
--      2026-08-11-i záró-pillanatkép-egyesítés VÉGLEGESNEK tekinthető —
--      ez a te döntésed, ezért ez a rész alapból KI VAN KOMMENTEZVE.
--
--  ⚠️ EZ A FÁJL TÖRÖL (DROP TABLE). Futtatás előtt olvasd el; az A) rész
--  csak olvas — ha az eredménye meglep, ÁLLJ MEG és jelezd.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── A) ELLENŐRZÉS (CSAK OLVAS) — futtasd ELŐSZÖR, külön ───────────────────
-- Várt eredmény: _merge_run_log sorai az egyszeri futás nyomai; event = 0 sor;
-- a mentes_20260811 a 2026-08-11-i pillanatkép-átalakítás előtti állapot.
SELECT '_merge_run_log' AS tabla, count(*) AS sorok FROM public._merge_run_log
UNION ALL SELECT 'event', count(*) FROM public.event
UNION ALL SELECT 'bealitas_zaro_adatok_mentes_20260811', count(*)
  FROM public.bealitas_zaro_adatok_mentes_20260811;


-- ─── B) TAKARÍTÁS — az 1) és 2) tábla eldobása (a policy-sorukkal együtt) ──
-- Egy tranzakcióban: vagy minden megtörténik, vagy semmi.
BEGIN;

DROP TABLE IF EXISTS public._merge_run_log;
DELETE FROM public.backup_table_policy WHERE tabla = '_merge_run_log';

DROP TABLE IF EXISTS public.event;
DELETE FROM public.backup_table_policy WHERE tabla = 'event';

COMMIT;

-- Ellenőrzés a B) után — mindkét sornak 'nincs' kell legyen:
SELECT t.nev,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = t.nev
       ) THEN 'MÉG LÉTEZIK ❌' ELSE 'nincs ✅' END AS allapot
FROM (VALUES ('_merge_run_log'), ('event')) AS t(nev);


-- ─── C) A visszavonó tábla — CSAK HA A PILLANATKÉP VÉGLEGES (a te döntésed) ─
-- A 2026-08-11-zaro-pillanatkep-egyesites.sql visszavonó táblája. Ha a
-- záró-pillanatkép azóta rendben szolgál (a részszámadás és a lelkészi
-- jelentés VII. fejezete jó számokat ad), a visszavonás forrására nincs
-- többé szükség. HA ELDOBOD, A 2026-08-11-I ÁTALAKÍTÁS TÖBBÉ NEM VONHATÓ
-- VISSZA. Vedd ki a kommentjelet, ha így döntesz:
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.bealitas_zaro_adatok_mentes_20260811;
-- DELETE FROM public.backup_table_policy
--  WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811';
-- COMMIT;
