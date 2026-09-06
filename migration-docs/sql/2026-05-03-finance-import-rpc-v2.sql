-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ EZT A FÁJLT NE FUTTASD ÚJRA — FELÜLÍRT FÜGGVÉNY-TÖRZSET HORDOZ       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Ez a migráció annak idején helyes volt, és a történetet dokumentálja — de
-- azóta biztonsági javítás írta felül az alábbi függvény(ek) törzsét. A
-- `CREATE OR REPLACE` NEM egyirányú: ha ezt a fájlt ma bárki újrafuttatja
-- (új környezet felállításakor, vagy egy másik hibát keresve), NÉMÁN
-- visszaveszi a javítást. Az adatbázis nem tiltakozik, a felület nem
-- változik, és a következő auditig senki nem veszi észre.
--
-- AMI ITT ELAVULT:
--   · import_finance_batch()
--     kanonikus törzs: migration-docs/sql/2026-09-04-auth-p0-javitasok-1.sql
--     ha mégis lefut: ⛔ P0: a jogosultság újra a KLIENS által küldött p_user_id-ből dőlne el, és a userid-napló is azt kapná
--
-- Az őrszem, ami ezt a szabályt őrzi: scripts/selftest-sql-kanonikus-torzs.mjs
-- (a „NE FUTTASD" jelölés adja a felmentést — ezért ne töröld ezt a fejlécet).

-- ===================================================================
-- Pénzügyi import RPC v2 — `belso_mozgas_xkey` támogatás
-- ===================================================================
--
-- 2026-05-03 — bővítés a felhasználói visszajelzés alapján
--
-- A v1 RPC (2026-05-02-finance-import-rpc.sql) `expense` és `income` ágában
-- nem volt `belso_mozgas_xkey` mező. Mostantól a kassza-oldali "várakozó"
-- belső mozgás tételek (pending-bank-deposit / pending-bank-withdrawal)
-- megkapnak egy `belso_mozgas_xkey` UUID-t, amit a Bank A/B import (v2)
-- később összeg + dátum alapján párba állít.
--
-- A meglévő rendszer (`computeReceiptHealth`, `getNextReceiptNumber`,
-- `deleteTransaction`) automatikusan helyesen kezeli ezeket a sorokat,
-- mert a `belso_mozgas_xkey IS NOT NULL` jelzi, hogy belső mozgás.
--
-- Ez a script CREATE OR REPLACE-szel felülírja a meglévő RPC-t.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.import_finance_batch(
  p_congregation_id uuid,
  p_user_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_kind text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_xkey uuid;
  v_idx integer := 0;
  v_belso_mozgas_xkey uuid;
  v_bankszamla_id integer;
BEGIN
  -- ─── Jogosultság-ellenőrzés ──────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p_user_id
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND (
        (pr.scope = 'system' AND pr.role = 'admin')
        OR
        (pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin')
        OR
        (pr.scope = 'congregation'
         AND pr.scope_id = p_congregation_id
         AND pr.role IN ('lelkesz', 'konyvelo'))
      )
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultsága az importáláshoz a megadott gyülekezetbe';
  END IF;

  -- ─── Tételek feldolgozása ────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    v_kind := v_item->>'kind';
    BEGIN
      v_xkey := gen_random_uuid();

      -- belso_mozgas_xkey: ha a kliens átadta (várakozó belső mozgás), használjuk;
      -- ha NULL, akkor sima bevétel/kiadás
      v_belso_mozgas_xkey := NULLIF(v_item->>'belso_mozgas_xkey', '')::uuid;

      -- bankszamla_id: NULL = kassza-oldal (alapértelmezett)
      v_bankszamla_id := NULLIF(v_item->>'bankszamla_id', '')::integer;

      -- ── 1. INCOME (bevétel) ────────────────────────────────────────
      IF v_kind = 'income' THEN
        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          id_szemely, id_csalad,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey,
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_befizetescel')::integer,
          coalesce(v_item->>'forrasa', ''),
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          coalesce((v_item->>'csalad')::boolean, false),
          (v_item->>'fizetettev')::integer,
          v_item->>'megjegyzes',
          NULLIF(v_item->>'id_szemely', '')::integer,
          NULLIF(v_item->>'id_csalad', '')::integer,
          v_bankszamla_id,
          v_belso_mozgas_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        );
        v_inserted := v_inserted + 1;

      -- ── 2. EXPENSE (kiadás) ────────────────────────────────────────
      ELSIF v_kind = 'expense' THEN
        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, atvevoid,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey,
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_kiadascel')::integer,
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          v_item->>'megjegyzes',
          v_item->>'atvevo',
          NULLIF(v_item->>'atvevoid', '')::integer,
          v_bankszamla_id,
          v_belso_mozgas_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        );
        v_inserted := v_inserted + 1;

      -- ── DEFAULT: ismeretlen kind ────────────────────────────────────
      ELSE
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'rowIndex', v_idx,
          'reason', 'Ismeretlen tételtípus: ' || coalesce(v_kind, '<null>')
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'rowIndex', v_idx,
        'reason', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_finance_batch(uuid, uuid, jsonb) TO authenticated;

-- ===================================================================
-- Ellenőrzés
-- ===================================================================

SELECT
  proname,
  pronargs,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'import_finance_batch'
  AND pronamespace = 'public'::regnamespace;
