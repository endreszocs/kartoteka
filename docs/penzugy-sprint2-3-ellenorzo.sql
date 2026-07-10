-- ============================================================================
-- PÉNZÜGY SPRINT 2+3 — ELLENŐRZŐ SQL-EK (2026-07-10)  · read-only
-- Futtasd a Supabase SQL editorban — NINCS kézi behelyettesítés: a gyülekezetet
-- a lekérdezés magától megtalálja (egyetlen gyülekezet van az adatbázisban).
-- ============================================================================

-- E1. KEDVEZMÉNY-SZABÁLYOK évre bontva (a beállítás-dialog és a wizard is ide ment):
select ev, tipus, sorrend, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras
from jarulek_kedvezmeny
where congregation_id = (select id from congregations order by created_at limit 1)
order by ev desc, sorrend asc;

-- E2. CSOPORTNAPLÓ "Besorolatlan" előrejelzés: hány tétel NEM oldódik fel jogcím-kódra az évben?
--     (0+0 = a korábbi "üres előnézet" csak a folyó-hónap alapérték volt)
select 'bevetel' as tipus, count(*) as besorolatlan_db, coalesce(sum(b.osszeg),0) as osszeg
from befizetes b left join befizetescel bc on bc.id = b.id_befizetescel
where b.congregation_id = (select id from congregations order by created_at limit 1) and b.deleted = false
  and b.belso_mozgas_xkey is null
  and b.datum >= '2026-01-01' and b.datum < '2027-01-01'
  and bc.id_szamadasicel is null
union all
select 'kiadas', count(*), coalesce(sum(k.osszeg),0)
from kiadas k left join kiadascel kc on kc.id = k.id_kiadascel
where k.congregation_id = (select id from congregations order by created_at limit 1) and k.deleted = false
  and k.belso_mozgas_xkey is null
  and k.datum >= '2026-01-01' and k.datum < '2027-01-01'
  and kc.id_szamadasicel is null;

-- E3. STORNÓ-HATÁS: mennyi stornózott összeg volt eddig TÉVESEN a totálokban?
--     (ennyivel változnak a megjelenített összegek a javítás után — ez a HELYES irány)
select 'befizetes' as tabla, extract(year from datum)::int as ev,
       count(*) filter (where stornozott) as storno_db,
       coalesce(sum(osszeg) filter (where stornozott), 0) as storno_osszeg
from befizetes where congregation_id = (select id from congregations order by created_at limit 1) and deleted = false
group by 2
union all
select 'kiadas', extract(year from datum)::int,
       count(*) filter (where stornozott),
       coalesce(sum(osszeg) filter (where stornozott), 0)
from kiadas where congregation_id = (select id from congregations order by created_at limit 1) and deleted = false
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
  where congregation_id = (select id from congregations order by created_at limit 1) and deleted = false
    and belso_mozgas_xkey is null and bankszamla_id is null
    and nyugta is not null and nyugta <> iratszam
)
select
  (select max(sorszam) from szamok where ev = 2025) as elozo_ev_utolso,
  (select min(sorszam) from szamok where ev = 2026) as folyo_ev_elso,
  (select min(sorszam) from szamok where ev = 2026)
    - (select max(sorszam) from szamok where ev = 2025) - 1 as hianyzo_db_az_evhataron;

-- ============================================================================
-- E7 — NYITÓ-CARRYOVER ellenőrzés (2026-07-10): számlánként az előző évi
-- záró (rögzített nyitó + forgalom) vs a rákövetkező évi rögzített nyitó.
-- A carryover-számítás PONTOSAN ezt a képletet használja:
--   záró(N-1) = nyito_egyenleg(N-1) + banki bevételek(N-1) − banki kiadások(N-1)
--   (deleted=false, stornozott=false; a belső mozgás bank-lába BELESZÁMÍT)
-- Az "elteres" oszlopnak 0-nak kell lennie ott, ahol az N. évi nyitót a
-- rendszer hozta át (forrasa='carryover').
-- ============================================================================
with cong as (select id from congregations order by created_at limit 1),
evek as (select distinct eve from bankszamla_nyito_egyenleg where congregation_id = (select id from cong)),
forgalom as (
  select b.bankszamla_id, extract(year from b.datum)::int as ev,
         sum(b.osszeg) as bev, 0::numeric as kiad
  from befizetes b
  where b.congregation_id = (select id from cong)
    and b.bankszamla_id is not null and b.deleted = false and b.stornozott = false
  group by 1, 2
  union all
  select k.bankszamla_id, extract(year from k.datum)::int as ev,
         0::numeric, sum(k.osszeg)
  from kiadas k
  where k.congregation_id = (select id from cong)
    and k.bankszamla_id is not null and k.deleted = false and k.stornozott = false
  group by 1, 2
)
select
  bs.bank_neve, bs.valuta, n_prev.eve as elozo_ev,
  n_prev.nyito_egyenleg_ron as elozo_nyito,
  coalesce(f.bev, 0) as elozo_bevetel,
  coalesce(f.kiad, 0) as elozo_kiadas,
  round(n_prev.nyito_egyenleg_ron + coalesce(f.bev, 0) - coalesce(f.kiad, 0), 2) as szamolt_zaro,
  n_next.nyito_egyenleg_ron as kovetkezo_evi_rogzitett_nyito,
  n_next.forrasa,
  round((n_prev.nyito_egyenleg_ron + coalesce(f.bev, 0) - coalesce(f.kiad, 0))
        - coalesce(n_next.nyito_egyenleg_ron, 0), 2) as elteres
from bankszamla_nyito_egyenleg n_prev
join bankszamlak bs on bs.id = n_prev.bankszamla_id
left join (
  select bankszamla_id, ev, sum(bev) as bev, sum(kiad) as kiad
  from forgalom group by 1, 2
) f on f.bankszamla_id = n_prev.bankszamla_id and f.ev = n_prev.eve
left join bankszamla_nyito_egyenleg n_next
  on n_next.bankszamla_id = n_prev.bankszamla_id
 and n_next.congregation_id = n_prev.congregation_id
 and n_next.eve = n_prev.eve + 1
where n_prev.congregation_id = (select id from cong)
order by bs.bank_neve, n_prev.eve;
