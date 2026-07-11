-- ============================================================================
-- 2026-07-11 (S10) — Monetár címlettörzs (nom_cimlet) feltöltése + önjavító RPC
--
-- HIBA: a Monetár (címletszámláló) MENTÉSE hibával állt le („A címlettörzs
-- hiányos…"), mert a GLOBÁLIS `nom_cimlet` tábla ÜRES volt ezen a telepítésen,
-- és az RLS csak SELECT-et enged (a szerver-akció nem tud beszúrni).
--
-- MEGOLDÁS:
--   1) feltöltjük a 12 hivatalos RON címletet (idempotens — ha már van, kihagyja);
--   2) készítünk egy SECURITY DEFINER függvényt (`ensure_cash_denominations`),
--      amit a szerver-akció hívhat: az RLS-t megkerülve, biztonságosan pótolja a
--      hiányzó címleteket — így a Monetár a jövőben ÖNJAVÍTÓ (a tábla véletlen
--      kiürülése esetén is magától helyreáll).
--
-- FUTTATÁS: Supabase SQL editor. Biztonságos újra-futtatni.
-- A `nom_cimlet` érték = val / divide (pl. 50/100 = 0.5 = 50 bani).
-- ============================================================================

-- ── 1) SECURITY DEFINER önjavító függvény ───────────────────────────────────
create or replace function public.ensure_cash_denominations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.nom_cimlet (name, val, divide, deleted)
  select d.name, d.val, d.divide, false
  from (values
    ('500 lejes bankjegy', 500, 1),
    ('200 lejes bankjegy', 200, 1),
    ('100 lejes bankjegy', 100, 1),
    ('50 lejes bankjegy',   50, 1),
    ('20 lejes bankjegy',   20, 1),
    ('10 lejes bankjegy',   10, 1),
    ('5 lejes bankjegy',     5, 1),
    ('1 lejes címlet',       1, 1),
    ('50 banis érme',       50, 100),
    ('10 banis érme',       10, 100),
    ('5 banis érme',         5, 100),
    ('1 banis érme',         1, 100)
  ) as d(name, val, divide)
  where not exists (
    select 1 from public.nom_cimlet n
    where n.val = d.val and n.divide = d.divide and n.deleted is not true
  );
end;
$$;

grant execute on function public.ensure_cash_denominations() to authenticated;

-- ── 2) Azonnali feltöltés (a függvényt közvetlenül is meghívjuk) ─────────────
select public.ensure_cash_denominations();

-- ── 3) Ellenőrzés (várt: 12 sor, deleted=false) ─────────────────────────────
select id, name, val, divide, (val::numeric / greatest(divide, 1)) as ertek_ron
from public.nom_cimlet
where deleted is not true
order by (val::numeric / greatest(divide, 1)) desc;
