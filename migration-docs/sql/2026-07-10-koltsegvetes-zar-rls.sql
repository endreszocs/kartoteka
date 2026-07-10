-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-10 (S3-#4): koltsegvetes ÍRÁS-zár RLS-szinten (mélységi védelem)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- HÁTTÉR: a webes budget-tab korábban KLIENS-oldali supabase-szel írta a
-- `koltsegvetes` táblát, így a `bealitas.budget_finalized` zár csak UI-szintű
-- volt (böngésző-konzolból megkerülhető). Az app-oldali javítás (a mentés
-- szerver-akcióra költözött: saveBudgetRowsAction / saveBudgetModificationAction,
-- apps/web/app/(dashboard)/penzugy/actions.ts) már ellenőrzi a zárat, de az
-- IGAZI védelem az adatbázisban van: ez a policy-készlet RLS-szinten tiltja a
-- véglegesített év költségvetés-sorainak írását — akkor is, ha egy régi kliens
-- vagy egy közvetlen PostgREST-hívás próbálkozik.
--
-- FUTTATÁS: Supabase SQL editor. NEM lett lefuttatva automatikusan —
-- futtatás előtt ellenőrizd a meglévő koltsegvetes-policykat:
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'koltsegvetes';
-- Ha van már megengedő (permissive) INSERT/UPDATE/DELETE policy, ez a
-- RESTRICTIVE készlet AZOK MELLETT szigorít (AND-kapcsolat), nem ütközik.
--
-- MEGJEGYZÉS: a bealitas.id a év STRINGKÉNT ('2026'), a koltsegvetes éve a
-- `bealitasid` oszlopban van (szintén string) — a join ezen megy.
-- A budget_modN_finalized flageket NEM vonjuk be ide: a módosítási körök
-- (modositott / osszeg_mod_2 / osszeg_mod_3 oszlopok) sor-szinten nem
-- különíthetők el RLS-sel (az RLS sor-, nem oszlop-granularitású); azokat a
-- szerver-akció védi. A fő zár (budget_finalized) viszont a teljes sor-írást
-- tiltja — a véglegesített alap-költségvetés RLS-szinten is védett.

-- ── 1) Segédfüggvény: zárt-e az adott gyülekezeti év költségvetése ──────────
-- SECURITY DEFINER, hogy a bealitas-olvasás ne függjön a hívó bealitas-RLS-étől.
create or replace function public.is_koltsegvetes_locked(
  p_congregation_id uuid,
  p_bealitasid text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select b.budget_finalized
      from public.bealitas b
      where b.congregation_id = p_congregation_id
        and b.id = p_bealitasid
      limit 1
    ),
    false
  );
$$;

comment on function public.is_koltsegvetes_locked(uuid, text) is
  '2026-07-10 (S3-#4): true, ha a gyülekezeti év költségvetése véglegesítve van (bealitas.budget_finalized).';

-- ── 2) RESTRICTIVE policyk: zárt évre nincs INSERT / UPDATE / DELETE ────────
-- RESTRICTIVE = a meglévő permissive policykkal AND-kapcsolatban szűkít.

drop policy if exists koltsegvetes_no_insert_when_finalized on public.koltsegvetes;
create policy koltsegvetes_no_insert_when_finalized
  on public.koltsegvetes
  as restrictive
  for insert
  to authenticated
  with check (not public.is_koltsegvetes_locked(congregation_id, bealitasid));

drop policy if exists koltsegvetes_no_update_when_finalized on public.koltsegvetes;
create policy koltsegvetes_no_update_when_finalized
  on public.koltsegvetes
  as restrictive
  for update
  to authenticated
  using (not public.is_koltsegvetes_locked(congregation_id, bealitasid))
  with check (not public.is_koltsegvetes_locked(congregation_id, bealitasid));

drop policy if exists koltsegvetes_no_delete_when_finalized on public.koltsegvetes;
create policy koltsegvetes_no_delete_when_finalized
  on public.koltsegvetes
  as restrictive
  for delete
  to authenticated
  using (not public.is_koltsegvetes_locked(congregation_id, bealitasid));

-- ── 3) Ellenőrzés ───────────────────────────────────────────────────────────
-- a) A policyk léteznek:
--   select policyname, cmd from pg_policies where tablename = 'koltsegvetes'
--   and policyname like 'koltsegvetes_no_%';
-- b) Funkcionális teszt (egy TESZT-gyülekezeten!):
--   update bealitas set budget_finalized = true
--     where congregation_id = '<teszt-cong-uuid>' and id = '2026';
--   -- ezután authenticated kliensből:
--   --   insert/update a koltsegvetes-be a ('2026', <teszt-cong-uuid>) kulcsra
--   --   → "new row violates row-level security policy" hibát KELL adjon.
--   update bealitas set budget_finalized = false
--     where congregation_id = '<teszt-cong-uuid>' and id = '2026';
--   -- → az írás újra működik.
--
-- ROLLBACK (ha vissza kell vonni):
--   drop policy if exists koltsegvetes_no_insert_when_finalized on public.koltsegvetes;
--   drop policy if exists koltsegvetes_no_update_when_finalized on public.koltsegvetes;
--   drop policy if exists koltsegvetes_no_delete_when_finalized on public.koltsegvetes;
--   drop function if exists public.is_koltsegvetes_locked(uuid, text);
