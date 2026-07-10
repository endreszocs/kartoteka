-- ============================================================================
-- 2026-07-10 (#4/1) — DOCUMENT_SUBMISSIONS IDEMPOTENCIA-JAVÍTÁS
--
-- PROBLÉMA: a document_submissions_unique UNIQUE constraint
-- (congregation_id, year, document_type, modification_number) oszlopában a
-- modification_number NULLABLE, és Postgresben NULL ≠ NULL az egyedi indexben.
-- Emiatt a szamadas / alap-koltsegvetes (modification_number = NULL) beküldésnél
-- az upsert ON CONFLICT sosem talál egyezést → minden újra-beküldés ÚJ sort
-- szúr be (duplikátum) a meglévő frissítése helyett.
--
-- MEGOLDÁS (Postgres 15+, a projekt PG 17.6): UNIQUE ... NULLS NOT DISTINCT —
-- így a NULL modification_number-ű sorok is ütköznek, az upsert frissít.
--
-- HASZNÁLAT:
--   1. Futtasd az 1. DRY-RUN lekérdezést → megnézed, van-e már duplikátum.
--   2. Futtasd a 2. blokkot (tranzakcióban): dedup (a LEGUTOLSÓ submitted_at
--      marad) + constraint csere NULLS NOT DISTINCT-re.
--   3. A 3. ellenőrzés: nem maradhat duplikált csoport.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. DRY-RUN — jelenlegi duplikátumok (ha üres, a dedup lépés nem csinál semmit)
-- ────────────────────────────────────────────────────────────────────────────
select congregation_id, year, document_type, modification_number,
       count(*) as db,
       array_agg(id order by submitted_at desc)           as id_lista_ujabb_elol,
       array_agg(submitted_at order by submitted_at desc) as idopontok
from document_submissions
group by congregation_id, year, document_type, modification_number
having count(*) > 1
order by year, document_type;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. ÉLES — dedup + constraint csere (egy tranzakcióban)
-- ────────────────────────────────────────────────────────────────────────────
begin;

-- 2a. Dedup: csoportonként a LEGUTOLSÓ submitted_at-ú sor marad, a többi törlődik.
with rangsor as (
  select id,
         row_number() over (
           partition by congregation_id, year, document_type, modification_number
           order by submitted_at desc, id desc
         ) as rn
  from document_submissions
)
delete from document_submissions ds
using rangsor r
where ds.id = r.id and r.rn > 1;

-- 2b. A régi (NULL-t megkülönböztető) unique constraint eldobása…
alter table document_submissions
  drop constraint if exists document_submissions_unique;

-- 2c. …és újra létrehozása NULLS NOT DISTINCT-tel: a NULL modification_number
--     (= alap számadás/költségvetés) is ütközik → az upsert FRISSÍT, nem duplikál.
alter table document_submissions
  add constraint document_submissions_unique
  unique nulls not distinct (congregation_id, year, document_type, modification_number);

commit;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. ELLENŐRZÉS — nem maradhat duplikált csoport (0 sor az elvárt eredmény)
-- ────────────────────────────────────────────────────────────────────────────
select congregation_id, year, document_type, modification_number, count(*)
from document_submissions
group by congregation_id, year, document_type, modification_number
having count(*) > 1;
