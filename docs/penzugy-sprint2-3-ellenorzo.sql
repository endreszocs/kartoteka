-- ============================================================================
-- PÉNZÜGY SPRINT 2+3 — ELLENŐRZŐ SQL-EK (2026-07-10)  · read-only
-- Futtasd a Supabase SQL editorban; a <GYULEKEZET_UUID>-t cseréld ki.
-- ============================================================================

-- E1. KEDVEZMÉNY-SZABÁLYOK évre bontva (a beállítás-dialog és a wizard is ide ment):
select ev, tipus, sorrend, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras
from jarulek_kedvezmeny
where congregation_id = '<GYULEKEZET_UUID>'
order by ev desc, sorrend asc;

-- E2. CSOPORTNAPLÓ "Besorolatlan" előrejelzés: hány tétel NEM oldódik fel jogcím-kódra az évben?
--     (0+0 = a korábbi "üres előnézet" csak a folyó-hónap alapérték volt)
select 'bevetel' as tipus, count(*) as besorolatlan_db, coalesce(sum(b.osszeg),0) as osszeg
from befizetes b left join befizetescel bc on bc.id = b.id_befizetescel
where b.congregation_id = '<GYULEKEZET_UUID>' and b.deleted = false
  and b.belso_mozgas_xkey is null
  and b.datum >= '2026-01-01' and b.datum < '2027-01-01'
  and bc.id_szamadasicel is null
union all
select 'kiadas', count(*), coalesce(sum(k.osszeg),0)
from kiadas k left join kiadascel kc on kc.id = k.id_kiadascel
where k.congregation_id = '<GYULEKEZET_UUID>' and k.deleted = false
  and k.belso_mozgas_xkey is null
  and k.datum >= '2026-01-01' and k.datum < '2027-01-01'
  and kc.id_szamadasicel is null;

-- E3. STORNÓ-HATÁS: mennyi stornózott összeg volt eddig TÉVESEN a totálokban?
--     (ennyivel változnak a megjelenített összegek a javítás után — ez a HELYES irány)
select 'befizetes' as tabla, extract(year from datum)::int as ev,
       count(*) filter (where stornozott) as storno_db,
       coalesce(sum(osszeg) filter (where stornozott), 0) as storno_osszeg
from befizetes where congregation_id = '<GYULEKEZET_UUID>' and deleted = false
group by 2
union all
select 'kiadas', extract(year from datum)::int,
       count(*) filter (where stornozott),
       coalesce(sum(osszeg) filter (where stornozott), 0)
from kiadas where congregation_id = '<GYULEKEZET_UUID>' and deleted = false
group by 2
order by ev, tabla;

-- E4. ZÁRT ÉVEK áttekintése (ide mostantól SEMMILYEN úton nem mehet új tétel):
select congregation_id, id as ev, accounting_finalized, budget_finalized
from bealitas
where accounting_finalized = true or budget_finalized = true
order by congregation_id, id;

-- E5. (OPCIONÁLIS mélységi védelem) A koltsegvetes RLS-zár telepítése után:
--     futtasd a migration-docs/sql/2026-07-10-koltsegvetes-zar-rls.sql-t, majd:
select polname, cmd
from pg_policies
where tablename = 'koltsegvetes' and polname like 'koltsegvetes_no_%';
-- Elvárt: 3 sor (insert/update/delete).

-- E6. NYUGTAFIGYELŐ évhatár-próba: az előző év utolsó és a folyó év első
--     gyülekezeti sorszáma közti hézag = amit a folyó évi figyelő mutat.
with szamok as (
  select extract(year from datum)::int as ev,
         (regexp_match(nyugta, '(\d+)'))[1]::int as sorszam
  from befizetes
  where congregation_id = '<GYULEKEZET_UUID>' and deleted = false
    and belso_mozgas_xkey is null and bankszamla_id is null
    and nyugta is not null and nyugta <> iratszam
)
select
  (select max(sorszam) from szamok where ev = 2025) as elozo_ev_utolso,
  (select min(sorszam) from szamok where ev = 2026) as folyo_ev_elso,
  (select min(sorszam) from szamok where ev = 2026)
    - (select max(sorszam) from szamok where ev = 2025) - 1 as hianyzo_db_az_evhataron;
