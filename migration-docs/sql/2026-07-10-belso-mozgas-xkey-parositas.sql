-- ============================================================================
-- 2026-07-10 (#3/D) — BELSŐ MOZGÁS XKEY-PÁROSÍTÁS BACKFILL
--
-- PROBLÉMA (SQL-igazolt, D5/D6): a belső mozgás kassza- és bank-oldala LÉTEZIK
-- (az egyenleg helyes), de a két oldal KÜLÖN belso_mozgas_xkey alatt van
-- (teljes_par = 0). Emiatt az xkey-alapú páros törlés (deleteTransaction) csak
-- az egyik oldalt törölné → árva sor; és a "párosítva" státusz nem az xkey-ből,
-- hanem törékeny összeg+dátum heurisztikából jön.
--
-- MEGOLDÁS: az azonos összegű, ellentétes oldalú (kassza↔bank), időben közeli,
-- párosítatlan feleket KÖZÖS xkey alá vonjuk (a kassza-oldal xkey-e a kanonikus).
--
-- HASZNÁLAT:
--   1. FUTTASD az 1A + 1B DRY-RUN lekérdezést → nézd át, mit kötne össze!
--   2. Ha minden pár helyes, futtasd a 2A + 2B UPDATE blokkot (tranzakcióban).
--   3. A 3. ellenőrző query eredménye: teljes_par = az összes belső mozgás.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1A. DRY-RUN — LETÉTEL párok (kassza-KIADÁS 400.01 ↔ bank-BEVÉTEL 301.01)
--     Azonos összeg, dátum-eltérés ≤ 31 nap, mindkét fél párosítatlan.
--     Azonos összegű többszörös mozgásoknál dátum-sorrend szerinti 1:1 rang-párosítás.
-- ────────────────────────────────────────────────────────────────────────────
with kassza_fel as (
  select k.id, k.congregation_id, k.belso_mozgas_xkey as xk, k.osszeg,
         k.datum::date as d,
         row_number() over (partition by k.congregation_id, k.osszeg order by k.datum, k.id) as rn
  from kiadas k
  where k.deleted = false
    and k.belso_mozgas_xkey is not null
    and k.bankszamla_id is null
    and not exists (
      select 1 from befizetes p
      where p.belso_mozgas_xkey = k.belso_mozgas_xkey
        and p.bankszamla_id is not null and p.deleted = false
    )
),
bank_fel as (
  select b.id, b.congregation_id, b.belso_mozgas_xkey as xk, b.osszeg,
         b.datum::date as d, b.bankszamla_id,
         row_number() over (partition by b.congregation_id, b.osszeg order by b.datum, b.id) as rn
  from befizetes b
  where b.deleted = false
    and b.belso_mozgas_xkey is not null
    and b.bankszamla_id is not null
    and not exists (
      select 1 from kiadas p
      where p.belso_mozgas_xkey = b.belso_mozgas_xkey
        and p.bankszamla_id is null and p.deleted = false
    )
)
select 'LETETEL' as irany,
       k.id as kassza_kiadas_id, k.d as kassza_datum, k.osszeg,
       b.id as bank_befizetes_id, b.d as bank_datum, b.bankszamla_id,
       abs(b.d - k.d) as datum_elteres_nap,
       k.xk as kanonikus_xkey, b.xk as felulirt_bank_xkey
from kassza_fel k
join bank_fel b
  on b.congregation_id = k.congregation_id
 and b.osszeg = k.osszeg
 and b.rn = k.rn
where abs(b.d - k.d) <= 31
order by k.d, k.osszeg;

-- ────────────────────────────────────────────────────────────────────────────
-- 1B. DRY-RUN — FELVÉTEL párok (bank-KIADÁS 401.01 ↔ kassza-BEVÉTEL 300.01)
-- ────────────────────────────────────────────────────────────────────────────
with kassza_fel as (
  select b.id, b.congregation_id, b.belso_mozgas_xkey as xk, b.osszeg,
         b.datum::date as d,
         row_number() over (partition by b.congregation_id, b.osszeg order by b.datum, b.id) as rn
  from befizetes b
  where b.deleted = false
    and b.belso_mozgas_xkey is not null
    and b.bankszamla_id is null
    and not exists (
      select 1 from kiadas p
      where p.belso_mozgas_xkey = b.belso_mozgas_xkey
        and p.bankszamla_id is not null and p.deleted = false
    )
),
bank_fel as (
  select k.id, k.congregation_id, k.belso_mozgas_xkey as xk, k.osszeg,
         k.datum::date as d, k.bankszamla_id,
         row_number() over (partition by k.congregation_id, k.osszeg order by k.datum, k.id) as rn
  from kiadas k
  where k.deleted = false
    and k.belso_mozgas_xkey is not null
    and k.bankszamla_id is not null
    and not exists (
      select 1 from befizetes p
      where p.belso_mozgas_xkey = k.belso_mozgas_xkey
        and p.bankszamla_id is null and p.deleted = false
    )
)
select 'FELVETEL' as irany,
       kf.id as kassza_befizetes_id, kf.d as kassza_datum, kf.osszeg,
       bf.id as bank_kiadas_id, bf.d as bank_datum, bf.bankszamla_id,
       abs(bf.d - kf.d) as datum_elteres_nap,
       kf.xk as kanonikus_xkey, bf.xk as felulirt_bank_xkey
from kassza_fel kf
join bank_fel bf
  on bf.congregation_id = kf.congregation_id
 and bf.osszeg = kf.osszeg
 and bf.rn = kf.rn
where abs(bf.d - kf.d) <= 31
order by kf.d, kf.osszeg;


-- ────────────────────────────────────────────────────────────────────────────
-- 2A. ÉLES UPDATE — LETÉTEL: a bank-oldali befizetés xkey-e = a kassza-oldali
--     kiadás xkey-e. CSAK az 1A dry-run átnézése UTÁN futtasd!
-- ────────────────────────────────────────────────────────────────────────────
begin;

with kassza_fel as (
  select k.id, k.congregation_id, k.belso_mozgas_xkey as xk, k.osszeg,
         k.datum::date as d,
         row_number() over (partition by k.congregation_id, k.osszeg order by k.datum, k.id) as rn
  from kiadas k
  where k.deleted = false and k.belso_mozgas_xkey is not null and k.bankszamla_id is null
    and not exists (
      select 1 from befizetes p
      where p.belso_mozgas_xkey = k.belso_mozgas_xkey
        and p.bankszamla_id is not null and p.deleted = false
    )
),
bank_fel as (
  select b.id, b.congregation_id, b.osszeg, b.datum::date as d,
         row_number() over (partition by b.congregation_id, b.osszeg order by b.datum, b.id) as rn
  from befizetes b
  where b.deleted = false and b.belso_mozgas_xkey is not null and b.bankszamla_id is not null
    and not exists (
      select 1 from kiadas p
      where p.belso_mozgas_xkey = b.belso_mozgas_xkey
        and p.bankszamla_id is null and p.deleted = false
    )
),
parok as (
  select b.id as bank_id, k.xk as kanonikus_xkey
  from kassza_fel k
  join bank_fel b
    on b.congregation_id = k.congregation_id
   and b.osszeg = k.osszeg
   and b.rn = k.rn
  where abs(b.d - k.d) <= 31
)
update befizetes bf
set belso_mozgas_xkey = parok.kanonikus_xkey
from parok
where bf.id = parok.bank_id;

-- 2B. ÉLES UPDATE — FELVÉTEL: a bank-oldali kiadás xkey-e = a kassza-oldali
--     befizetés xkey-e. CSAK az 1B dry-run átnézése UTÁN!
with kassza_fel as (
  select b.id, b.congregation_id, b.belso_mozgas_xkey as xk, b.osszeg,
         b.datum::date as d,
         row_number() over (partition by b.congregation_id, b.osszeg order by b.datum, b.id) as rn
  from befizetes b
  where b.deleted = false and b.belso_mozgas_xkey is not null and b.bankszamla_id is null
    and not exists (
      select 1 from kiadas p
      where p.belso_mozgas_xkey = b.belso_mozgas_xkey
        and p.bankszamla_id is not null and p.deleted = false
    )
),
bank_fel as (
  select k.id, k.congregation_id, k.osszeg, k.datum::date as d,
         row_number() over (partition by k.congregation_id, k.osszeg order by k.datum, k.id) as rn
  from kiadas k
  where k.deleted = false and k.belso_mozgas_xkey is not null and k.bankszamla_id is not null
    and not exists (
      select 1 from befizetes p
      where p.belso_mozgas_xkey = k.belso_mozgas_xkey
        and p.bankszamla_id is null and p.deleted = false
    )
),
parok as (
  select bf.id as bank_id, kf.xk as kanonikus_xkey
  from kassza_fel kf
  join bank_fel bf
    on bf.congregation_id = kf.congregation_id
   and bf.osszeg = kf.osszeg
   and bf.rn = kf.rn
  where abs(bf.d - kf.d) <= 31
)
update kiadas ki
set belso_mozgas_xkey = parok.kanonikus_xkey
from parok
where ki.id = parok.bank_id;

commit;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. ELLENŐRZÉS (a D5 megismétlése) — az elvárt eredmény: teljes_par = az
--    összes belső mozgás, csak_kassza/csak_bank ~ 0 (kivéve valóban friss,
--    még nem importált letételek).
-- ────────────────────────────────────────────────────────────────────────────
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
         count(*) filter (where bankszamla_id is not null) as bank_db
  from x group by xk
)
select
  count(*)                                              as xkey_ossz,
  count(*) filter (where kassza_db > 0 and bank_db > 0) as teljes_par,
  count(*) filter (where kassza_db > 0 and bank_db = 0) as csak_kassza,
  count(*) filter (where kassza_db = 0 and bank_db > 0) as csak_bank
from agg;
