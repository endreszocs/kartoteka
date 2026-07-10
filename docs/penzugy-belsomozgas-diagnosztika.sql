-- ============================================================================
--  KARTOTÉKA PÉNZÜGY — BELSŐ MOZGÁS + TELJES KÓD-KÉP DIAGNOSZTIKA (2026-07-10)
--  Cél: MINDEN kódot és a xkey-párosítást átlátni (nem csak a belső kódokat).
--  Read-only. Futtasd a Supabase SQL editorban, add vissza az eredményeket.
-- ============================================================================


-- D1. TELJES belső-mozgás KATALÓGUS: minden szamadasicel, ami belső
--     (belsotetel flag VAGY 100/3xx/4xx kód). Nézd: type, nev, aktiv, belsotetel,
--     és hány befizetescel/kiadascel mutat rá.
select sc.id as kod, sc.type, sc.nev, sc.nevro, sc.belsotetel, sc.aktiv, sc.aktivevi, sc.sorszam,
       (select count(*) from befizetescel bc where bc.id_szamadasicel = sc.id) as befcel_db,
       (select count(*) from kiadascel    kc where kc.id_szamadasicel = sc.id) as kiacel_db
from szamadasicel sc
where sc.belsotetel is not null
   or sc.id like '100%' or sc.id like '300%' or sc.id like '301%'
   or sc.id like '400%' or sc.id like '401%' or sc.id like '402%'
order by sc.id;

-- D2. MINDEN BEFIZETÉS kódonként (a TELJES bevétel-kép, nem csak belső).
--     Így látszik, hol vannak a belső-mozgás bevétel-oldalak (300.01/301.01) a valós kódok között.
select sc.id as kod, sc.type, sc.nev,
       count(*)                                                as db,
       count(*) filter (where b.belso_mozgas_xkey is not null) as van_xkey,
       count(*) filter (where b.bankszamla_id is null)         as kassza_oldal,
       count(*) filter (where b.bankszamla_id is not null)     as bank_oldal,
       sum(b.osszeg)                                           as osszeg_sum
from befizetes b
join befizetescel bc on bc.id = b.id_befizetescel
join szamadasicel sc on sc.id = bc.id_szamadasicel
where b.deleted = false
group by sc.id, sc.type, sc.nev
order by sc.id;

-- D3. MINDEN KIADÁS kódonként (a TELJES kiadás-kép).
select sc.id as kod, sc.type, sc.nev,
       count(*)                                                as db,
       count(*) filter (where k.belso_mozgas_xkey is not null) as van_xkey,
       count(*) filter (where k.bankszamla_id is null)         as kassza_oldal,
       count(*) filter (where k.bankszamla_id is not null)     as bank_oldal,
       sum(k.osszeg)                                           as osszeg_sum
from kiadas k
join kiadascel kc on kc.id = k.id_kiadascel
join szamadasicel sc on sc.id = kc.id_szamadasicel
where k.deleted = false
group by sc.id, sc.type, sc.nev
order by sc.id;

-- D4. belsomozgas MESTER-tábla teljes képe: tipus szerint + a forras/cel értékek.
--     (Ezek a webről rögzített mozgások, amik NEM kerülnek befizetes/kiadas-ba.)
select tipus,
       count(*)                       as db,
       sum(osszeg)                    as osszeg_sum,
       min(datum)                     as legkorabbi,
       max(datum)                     as legkesobbi,
       array_agg(distinct forras)     as forras_ertekek,
       array_agg(distinct cel)        as cel_ertekek
from belsomozgas
where deleted = false
group by tipus
order by tipus;

-- D5. XKEY PÁROSÍTÁS-INTEGRITÁS ÖSSZESÍTŐ (a #1 észrevétel magja):
--     hány belső-mozgás xkey TELJES pár (van kassza ÉS bank oldal), és hány
--     "csak kassza, bankra várakozik" (letétel, aminek a banki fele még nincs importálva).
with x as (
  select belso_mozgas_xkey xk, osszeg, bankszamla_id
  from befizetes where belso_mozgas_xkey is not null and deleted = false
  union all
  select belso_mozgas_xkey, osszeg, bankszamla_id
  from kiadas where belso_mozgas_xkey is not null and deleted = false
),
agg as (
  select xk,
         count(*) filter (where bankszamla_id is null)     as kassza_db,
         count(*) filter (where bankszamla_id is not null) as bank_db,
         sum(osszeg) filter (where bankszamla_id is null)  as kassza_osszeg
  from x group by xk
)
select
  count(*)                                                     as xkey_ossz,
  count(*) filter (where kassza_db > 0 and bank_db > 0)        as teljes_par,
  count(*) filter (where kassza_db > 0 and bank_db = 0)        as csak_kassza_varakozik_bankra,
  count(*) filter (where kassza_db = 0 and bank_db > 0)        as csak_bank,
  sum(kassza_osszeg) filter (where kassza_db > 0 and bank_db = 0) as varakozo_osszeg
from agg;

-- D6. XKEY párok tételesen (ha nem túl sok): melyik xkey milyen oldalakból áll.
--     Ha a 'bank_oldal_db'=0, az a "várakozik banki egyeztetésre" tétel.
with x as (
  select belso_mozgas_xkey xk, 'bef' as forras_tabla, osszeg, bankszamla_id
  from befizetes where belso_mozgas_xkey is not null and deleted = false
  union all
  select belso_mozgas_xkey, 'kia', osszeg, bankszamla_id
  from kiadas where belso_mozgas_xkey is not null and deleted = false
)
select xk,
       count(*) filter (where forras_tabla='bef')          as bef_db,
       count(*) filter (where forras_tabla='kia')          as kia_db,
       count(*) filter (where bankszamla_id is null)       as kassza_oldal_db,
       count(*) filter (where bankszamla_id is not null)   as bank_oldal_db,
       sum(osszeg) filter (where bankszamla_id is null)    as kassza_osszeg,
       sum(osszeg) filter (where bankszamla_id is not null) as bank_osszeg
from x
group by xk
order by bank_oldal_db, xk;

-- D7. ÖSSZES belső-mozgás KÖLTSÉGVETÉSI SZÁM + MEGNEVEZÉS.
--     A belsotetel flag a definitív jelölő → minden belső variáns látszik (nem csak 400.01,
--     hanem pl. 400.02/401.02… bankszámlánként, ha vannak).
select id as koltsegvetesi_szam, type, nev as megnevezes, nevro, belsotetel, aktiv, aktivevi, sorszam
from szamadasicel
where belsotetel is not null
   or id like '100%' or id like '3%' or id like '4%'
order by id;

-- D8. TELJES költségvetési szám-katalógus (MINDEN szamadasicel kód + megnevezés),
--     hogy semmilyen belső (vagy félrekódolt) kód ne maradjon ki a képből.
select id as koltsegvetesi_szam, type, nev as megnevezes, belsotetel, aktiv
from szamadasicel
order by id;

-- D9. A ténylegesen HASZNÁLT belső kódok (van befizetes/kiadas tétel) + megnevezés + oldal.
--     Így látszik, mely belső kódok szerepelnek valós tételen, és melyik számlán (bankszamla_id).
select 'befizetes' as tabla, sc.id as kod, sc.nev as megnevezes, sc.type,
       b.bankszamla_id, count(*) as db, sum(b.osszeg) as osszeg
from befizetes b
join befizetescel bc on bc.id = b.id_befizetescel
join szamadasicel sc on sc.id = bc.id_szamadasicel
where b.deleted = false and (sc.belsotetel is not null or sc.id like '100%' or sc.id like '3%' or sc.id like '4%')
group by sc.id, sc.nev, sc.type, b.bankszamla_id
union all
select 'kiadas', sc.id, sc.nev, sc.type, k.bankszamla_id, count(*), sum(k.osszeg)
from kiadas k
join kiadascel kc on kc.id = k.id_kiadascel
join szamadasicel sc on sc.id = kc.id_szamadasicel
where k.deleted = false and (sc.belsotetel is not null or sc.id like '100%' or sc.id like '3%' or sc.id like '4%')
group by sc.id, sc.nev, sc.type, k.bankszamla_id
order by tabla, kod, bankszamla_id;

-- D10. (opcionális, a #10 FX-hez) deviza bankszámlák — a névoszlop: bank_neve
select id, bank_neve, valuta, aktiv, nyito_egyenleg
from bankszamlak
order by id;
