-- ============================================================================
--  KARTOTÉKA PÉNZÜGY — ELLENŐRZŐ SQL (2026-07-10)
--  Cél: a #2/#3/#4 diagnózist a VALÓS adaton igazolni (nem kódból tippelve).
--  Read-only. Futtasd a Supabase SQL editorban, és add vissza az eredményeket.
--  Egyetlen gyülekezet (Barátosi) → a legtöbb query nem szűr congregation_id-re.
--  Ahol év kell, a 2025-öt használom — írd át, ha más évet nézünk.
-- ============================================================================


-- ############################################################################
-- #3 — BELSŐ MOZGÁS: KATALÓGUS (milyen kódok/nevek/flag-ek léteznek)
-- ############################################################################

-- Q1. Belső-mozgás jellegű számadási célok (100.xx pénztármaradvány + 3xx/4xx).
--     Nézd: milyen 'nev', 'type' (B/K), 'aktiv', és be van-e állítva a 'belsotetel' flag.
--     VÁRT (hivatalos modell): csak 300.01/301.01/400.01/401.01/402.02 aktív;
--     a 100.01/100.02/100.51/100.52 legacy (ideális esetben aktiv=false vagy nincs is).
select id as kod, type, nev, nevro, aktiv, aktivevi, iscel, belsotetel, sorszam, szint
from szamadasicel
where id like '100%' or id like '300%' or id like '301%'
   or id like '400%' or id like '401%' or id like '402%'
order by id;

-- Q2. A befizetescel/kiadascel katalógus-sorok, amik ezekre a kódokra mutatnak
--     (ezek id-jait használják a befizetes/kiadas rekordok). belsotetel flag itt is.
select 'befizetescel' as tabla, bc.id, bc.nev, bc.id_szamadasicel as kod,
       bc.aktiv, bc.belsotetel, sc.type
from befizetescel bc
join szamadasicel sc on sc.id = bc.id_szamadasicel
where bc.id_szamadasicel like '100%' or bc.id_szamadasicel like '3%' or bc.id_szamadasicel like '4%'
union all
select 'kiadascel', kc.id, kc.nev, kc.id_szamadasicel,
       kc.aktiv, kc.belsotetel, sc.type
from kiadascel kc
join szamadasicel sc on sc.id = kc.id_szamadasicel
where kc.id_szamadasicel like '100%' or kc.id_szamadasicel like '3%' or kc.id_szamadasicel like '4%'
order by tabla, kod;


-- ############################################################################
-- #3 — BELSŐ MOZGÁS: VALÓS TÉTELEK (befizetes/kiadas) belső kóddal
--       → ezek szivárognak a számadásba, és a /^[34]/ szűrő a 100.xx-et NEM fogja
-- ############################################################################

-- Q3. BEFIZETÉS-ek belső-mozgás kóddal, kódonként; van-e belso_mozgas_xkey-ük.
--     KRITIKUS: a 'nincs_xkey' + 100.xx sorok EGYSZERRE beszámítanak a totalIncome-ba
--     ÉS megjelennek "Belső mozgás — ..." tételként a számadásban (mert a filter kihagyja őket).
select sc.id as kod, sc.nev, sc.type,
       count(*)                                          as db,
       count(*) filter (where b.belso_mozgas_xkey is not null) as van_xkey,
       count(*) filter (where b.belso_mozgas_xkey is null)     as nincs_xkey,
       count(*) filter (where b.bankszamla_id is null)         as kassza_oldal,
       count(*) filter (where b.bankszamla_id is not null)     as bank_oldal,
       sum(b.osszeg)                                     as osszeg_sum
from befizetes b
join befizetescel bc on bc.id = b.id_befizetescel
join szamadasicel sc on sc.id = bc.id_szamadasicel
where b.deleted = false
  and (sc.id like '100%' or sc.id like '3%' or sc.id like '4%')
group by sc.id, sc.nev, sc.type
order by sc.id;

-- Q4. KIADÁS-ok belső-mozgás kóddal, kódonként (ua. logika).
select sc.id as kod, sc.nev, sc.type,
       count(*)                                          as db,
       count(*) filter (where k.belso_mozgas_xkey is not null) as van_xkey,
       count(*) filter (where k.belso_mozgas_xkey is null)     as nincs_xkey,
       count(*) filter (where k.bankszamla_id is null)         as kassza_oldal,
       count(*) filter (where k.bankszamla_id is not null)     as bank_oldal,
       sum(k.osszeg)                                     as osszeg_sum
from kiadas k
join kiadascel kc on kc.id = k.id_kiadascel
join szamadasicel sc on sc.id = kc.id_szamadasicel
where k.deleted = false
  and (sc.id like '100%' or sc.id like '3%' or sc.id like '4%')
group by sc.id, sc.nev, sc.type
order by sc.id;

-- Q5. FÓKUSZ: kifejezetten a legacy 100.xx (a #3 tünet) — VAN-E egyáltalán ilyen valós tétel?
--     Ha db=0 → a "Belső mozgás — készpénz/banki" sorok CSAK üres katalógus-kategóriák
--     (a képernyős szűrő rajzolja ki őket 0/0-val). Ha db>0 → valós adat is szivárog.
select 'befizetes' as tabla, sc.id as kod, sc.nev, count(*) as db, sum(b.osszeg) as osszeg
from befizetes b join befizetescel bc on bc.id=b.id_befizetescel join szamadasicel sc on sc.id=bc.id_szamadasicel
where b.deleted=false and sc.id in ('100.01','100.02','100.51','100.52')
group by sc.id, sc.nev
union all
select 'kiadas', sc.id, sc.nev, count(*), sum(k.osszeg)
from kiadas k join kiadascel kc on kc.id=k.id_kiadascel join szamadasicel sc on sc.id=kc.id_szamadasicel
where k.deleted=false and sc.id in ('100.01','100.02','100.51','100.52')
group by sc.id, sc.nev
order by tabla, kod;


-- ############################################################################
-- #3 — BELSŐ MOZGÁS SZÁMOLÁS: mester-tábla vs befizetes/kiadas párok
--       HIPOTÉZIS: a webről rögzített belső mozgás CSAK a belsomozgas mesterbe kerül,
--       a calculateBalances viszont csak befizetes/kiadas-t lát → egyenleg hibás.
-- ############################################################################

-- Q6. A két reprezentáció darabszáma egymás mellett.
--     Ha belsomozgas_master_kp_bank > 0 ÉS befizetes/kiadas_xkey ~ 0 →
--     a mester-táblás út az élő, tehát a kassza/bank EGYENLEG nem mozdul (bug MEGERŐSÍTVE).
select
  (select count(*) from belsomozgas where deleted=false)                                          as belsomozgas_master_ossz,
  (select count(*) from belsomozgas where deleted=false and tipus in ('kassza_bank','bank_kassza')) as belsomozgas_kp_bank,
  (select count(*) from belsomozgas where deleted=false and tipus='valutacsere')                   as belsomozgas_valutacsere,
  (select count(*) from belsomozgas where deleted=false and tipus='bank_bank')                     as belsomozgas_bank_bank,
  (select count(*) from befizetes where deleted=false and belso_mozgas_xkey is not null)           as befizetes_xkey_par,
  (select count(*) from kiadas    where deleted=false and belso_mozgas_xkey is not null)           as kiadas_xkey_par;

-- Q7. belsomozgas mester bontása tipus + év szerint (mekkora összeg "hiányzik" az egyenlegből).
select tipus, extract(year from datum) as ev, count(*) as db, sum(osszeg) as osszeg_sum,
       min(datum) as legkorabbi, max(datum) as legkesobbi
from belsomozgas
where deleted = false
group by tipus, extract(year from datum)
order by ev, tipus;

-- Q8. A "money conservation" próba 2025-re: a befizetes/kiadas-ból számolt nettó kassza- és bank-
--     forgalom (ahogy a calculateBalances teszi, nyitó NÉLKÜL), + külön a mester-táblás belső
--     mozgás nettó, ami KIMARAD. Ha a mester kp_bank összeg > 0, az a kassza/bank megosztásból hiányzik.
with p as (select date '2025-01-01' d1, date '2026-01-01' d2)
select
  (select coalesce(sum(osszeg),0) from befizetes,p where deleted=false and bankszamla_id is null     and datum>=d1 and datum<d2) as kassza_bevetel,
  (select coalesce(sum(osszeg),0) from kiadas,p    where deleted=false and bankszamla_id is null     and datum>=d1 and datum<d2) as kassza_kiadas,
  (select coalesce(sum(osszeg),0) from befizetes,p where deleted=false and bankszamla_id is not null and datum>=d1 and datum<d2) as bank_bevetel,
  (select coalesce(sum(osszeg),0) from kiadas,p    where deleted=false and bankszamla_id is not null and datum>=d1 and datum<d2) as bank_kiadas,
  (select coalesce(sum(osszeg),0) from belsomozgas,p where deleted=false and tipus='kassza_bank'     and datum>=d1 and datum<d2) as mester_letetel_kassza_bank,
  (select coalesce(sum(osszeg),0) from belsomozgas,p where deleted=false and tipus='bank_kassza'     and datum>=d1 and datum<d2) as mester_felvetel_bank_kassza;


-- ############################################################################
-- #2 — NYITÓ EGYENLEG (kezdő egyenlegek auto-kitöltés forrása)
-- ############################################################################

-- Q9. Létezik-e egyáltalán a keszpenz_nyito_egyenleg tábla? (a séma-dumpban NEM szerepel!)
--     NULL = nincs ilyen tábla → a kassza-nyitó csak a bealitas.nyito_keszpenz-ben él.
select to_regclass('public.keszpenz_nyito_egyenleg') as keszpenz_nyito_tabla,
       to_regclass('public.bankszamla_nyito_egyenleg') as bank_nyito_tabla;

-- Q10. bealitas éves nyitó egyenlegek + finalize flag-ek (ez a #2 elsődleges tárolóhelye).
select id as ev, nyito_keszpenz, nyito_bank,
       budget_finalized, accounting_finalized,
       (szamadas_zaro_adatok = '{}'::jsonb) as zaro_snapshot_ures
from bealitas
order by id;

-- Q11. bankszamla_nyito_egyenleg tábla tartalma (ha létezik) — forrás lánc (manual/import/carryover).
select bankszamla_id, eve, nyito_egyenleg_ron, forrasa
from bankszamla_nyito_egyenleg
order by eve, bankszamla_id;

-- Q12. Van-e előző évi TÉNY per-kód a koltsegvetes.osszeg_teny-ben (a #2 szürke referenciához)?
--      Ha mindenütt 0 → nincs tárolt tény, külön aggregálás kell a befizetes/kiadas-ból.
select bealitasid as ev, count(*) as sorok,
       count(*) filter (where coalesce(osszeg,0)      <> 0) as van_terv,
       count(*) filter (where coalesce(osszeg_teny,0) <> 0) as van_teny
from koltsegvetes
group by bealitasid
order by bealitasid;


-- ############################################################################
-- #4 — BEKÜLDŐ (document_submissions): idempotencia / duplikátum / snapshot
-- ############################################################################

-- Q13. DUPLIKÁTUM-ellenőrzés (a nullable modification_number miatti nem-idempotencia tünete).
--      Ha bármely csoport db>1 → az újra-beküldés duplikált (nem frissített).
select congregation_id, year, document_type, modification_number, count(*) as db,
       array_agg(status order by submitted_at) as statuszok,
       array_agg(submitted_at order by submitted_at) as idopontok
from document_submissions
group by congregation_id, year, document_type, modification_number
having count(*) > 1
order by year, document_type;

-- Q14. Minden beküldés áttekintése (státusz, mod-szám, snapshot üres-e).
select year, document_type, modification_number, status,
       submitted_at, received_at, finalized_at, forwarded_to_kerulet,
       (snapshot_data = '{}'::jsonb) as snapshot_ures,
       jsonb_object_keys_count(snapshot_data) as snapshot_kulcsok
from (
  select *, (select count(*) from jsonb_object_keys(snapshot_data)) as jsonb_object_keys_count
  from document_submissions
) t
order by year, document_type, submitted_at;

-- Q15. A document_submissions egyedi indexei (van-e NULLS NOT DISTINCT a modification_number-en?).
--      Ha a modification_number nullable és nincs NULLS NOT DISTINCT → a NULL≠NULL miatt duplikálhat.
select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='document_submissions';

-- Q16. A bealitas lokális záró-snapshot (szamadas_zaro_adatok) kulcs-alakja — INT vagy kód kulcs?
--      (Agent-4 szerint a beküldött és a lokális snapshot ELTÉRŐ kulcsú/összegű.)
select id as ev,
       left(szamadas_zaro_adatok::text, 300) as zaro_snapshot_eleje
from bealitas
where szamadas_zaro_adatok <> '{}'::jsonb
order by id;
