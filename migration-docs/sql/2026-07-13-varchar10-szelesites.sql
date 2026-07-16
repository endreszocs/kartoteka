-- ============================================================================
-- 2026-07-13 — „value too long for type character varying(10)" javítása
--
-- OK: néhány oszlop a legacy adatbázisban varchar(10), de a rendszer HOSSZABB
--   értéket ír bele:
--     • monetar.source   = 'congregation_cash_check' (23 karakter)  → Monetár mentés
--     • monetar.sourceid = '<gyülekezet-uuid>:<év>'  (~41 karakter) → Monetár mentés
--     • befizetes/kiadas.irattipus — a „Tétel rögzítése" bizonylattípusai közt
--       van 13-14 karakteres is: „Stat de plată", „Ordin de plată".
--
-- MEGOLDÁS: az érintett oszlopokat `text` típusúra SZÉLESÍTJÜK. Ez BIZTONSÁGOS
--   (a text minden meglévő értéket elfogad, nincs csonkolás, nincs tábla-újraírás),
--   és megegyezik a séma-dokumentációval (Database_schema.sql ezeket text-ként
--   írja le — az éles DB maradt a régi varchar(10)-en).
--
-- FUTTATÁS: Supabase SQL editor. Biztonságosan újra-futtatható.
-- ============================================================================

-- ── 1) DIAGNOSZTIKA: mely oszlopok korlátozottak ténylegesen? ────────────────
select table_name, column_name, data_type, character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and table_name in ('monetar', 'befizetes', 'kiadas')
  and data_type = 'character varying'
  and character_maximum_length is not null
order by character_maximum_length, table_name, column_name;

-- ── 2) SZÉLESÍTÉS text-re (csak akkor változtat, ha még nem text) ────────────
alter table public.monetar   alter column source    type text;
alter table public.monetar   alter column sourceid  type text;
alter table public.befizetes alter column irattipus type text;
alter table public.kiadas    alter column irattipus type text;

-- ── 3) ELLENŐRZÉS: a fenti oszlopoknak már NEM lehet hosszkorlátja ───────────
select table_name, column_name, data_type, character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'monetar'   and column_name in ('source', 'sourceid'))
    or (table_name in ('befizetes', 'kiadas') and column_name = 'irattipus'))
order by table_name, column_name;
