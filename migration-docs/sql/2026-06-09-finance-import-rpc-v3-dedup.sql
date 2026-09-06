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
-- Pénzügyi import RPC v3 — IDEMPOTENS (duplikáció-szűréssel)
-- ===================================================================
--
-- 2026-06-09 — P0 hibajavítás.
--
-- A v2 RPC (2026-05-03-finance-import-rpc-v2.sql) VAKON beszúrt minden tételt,
-- ezért a hivatalos Kassza-xlsx kétszeri importja MINDEN tételt duplikálta.
-- Ez okozta, hogy a teszt-időszakban rengeteg fölösleges sor halmozódott fel.
--
-- A v3 minden tétel beszúrása ELŐTT természetes-kulcs alapú dup-check-et végez:
--   - bevétel:  congregation_id + datum + osszeg + id_befizetescel
--               + coalesce(iratszam,'') + coalesce(forrasa,'')
--               + coalesce(bankszamla_id,-1), deleted=false
--   - kiadás:   congregation_id + datum + osszeg + id_kiadascel
--               + coalesce(iratszam,'') + coalesce(atvevo,'')
--               + coalesce(bankszamla_id,-1), deleted=false
--
-- Egyezésnél a tétel KIMARAD (nem hiba), és külön `skippedDuplicates` számlálóba kerül.
-- Így ugyanazon fájl tetszőlegesszer újraimportálható duplikáció nélkül.
--
-- A `belso_mozgas_xkey` és `bankszamla_id` (banki sorok) változatlanul támogatott.
-- CREATE OR REPLACE — felülírja a v2-t.
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
  v_duplicates integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_xkey uuid;
  v_idx integer := 0;
  v_belso_mozgas_xkey uuid;
  v_bankszamla_id integer;
  v_datum date;
  v_osszeg numeric;
  v_iratszam text;
  v_forrasa text;
  v_atvevo text;
  v_id_befizetescel integer;
  v_id_kiadascel integer;
  v_is_dup boolean;
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
      v_belso_mozgas_xkey := NULLIF(v_item->>'belso_mozgas_xkey', '')::uuid;
      v_bankszamla_id := NULLIF(v_item->>'bankszamla_id', '')::integer;
      v_datum := (v_item->>'datum')::date;
      v_osszeg := (v_item->>'osszeg')::numeric;
      v_iratszam := coalesce(v_item->>'iratszam', '');
      v_forrasa := coalesce(v_item->>'forrasa', '');
      v_atvevo := coalesce(v_item->>'atvevo', '');

      -- ── 1. INCOME (bevétel) ────────────────────────────────────────
      IF v_kind = 'income' THEN
        v_id_befizetescel := (v_item->>'id_befizetescel')::integer;

        -- Dup-check: ugyanaz a sor már létezik-e?
        SELECT EXISTS (
          SELECT 1 FROM public.befizetes b
          WHERE b.congregation_id = p_congregation_id
            AND b.datum = v_datum
            AND b.osszeg = v_osszeg
            AND b.id_befizetescel = v_id_befizetescel
            AND coalesce(b.iratszam, '') = v_iratszam
            AND coalesce(b.forrasa, '') = v_forrasa
            AND coalesce(b.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
            AND b.deleted = false
        ) INTO v_is_dup;

        IF v_is_dup THEN
          v_duplicates := v_duplicates + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          id_szemely, id_csalad,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey, v_datum, v_osszeg, v_id_befizetescel, v_forrasa,
          coalesce(v_item->>'nyugta', ''),
          v_iratszam,
          coalesce(v_item->>'irattipus', ''),
          coalesce((v_item->>'csalad')::boolean, false),
          (v_item->>'fizetettev')::integer,
          v_item->>'megjegyzes',
          NULLIF(v_item->>'id_szemely', '')::integer,
          NULLIF(v_item->>'id_csalad', '')::integer,
          v_bankszamla_id, v_belso_mozgas_xkey,
          p_congregation_id, p_user_id,
          now(), false, false
        );
        v_inserted := v_inserted + 1;

      -- ── 2. EXPENSE (kiadás) ────────────────────────────────────────
      ELSIF v_kind = 'expense' THEN
        v_id_kiadascel := (v_item->>'id_kiadascel')::integer;

        SELECT EXISTS (
          SELECT 1 FROM public.kiadas k
          WHERE k.congregation_id = p_congregation_id
            AND k.datum = v_datum
            AND k.osszeg = v_osszeg
            AND k.id_kiadascel = v_id_kiadascel
            AND coalesce(k.iratszam, '') = v_iratszam
            AND coalesce(k.atvevo, '') = v_atvevo
            AND coalesce(k.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
            AND k.deleted = false
        ) INTO v_is_dup;

        IF v_is_dup THEN
          v_duplicates := v_duplicates + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, atvevoid,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey, v_datum, v_osszeg, v_id_kiadascel,
          coalesce(v_item->>'nyugta', ''),
          v_iratszam,
          coalesce(v_item->>'irattipus', ''),
          v_item->>'megjegyzes',
          v_atvevo,
          NULLIF(v_item->>'atvevoid', '')::integer,
          v_bankszamla_id, v_belso_mozgas_xkey,
          p_congregation_id, p_user_id,
          now(), false, false
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
    'skippedDuplicates', v_duplicates,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_finance_batch(uuid, uuid, jsonb) TO authenticated;

-- ===================================================================
-- Ellenőrzés
-- ===================================================================
SELECT proname, pronargs, prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'import_finance_batch'
  AND pronamespace = 'public'::regnamespace;
