-- ===================================================================
-- Pénzügyi import RPC v4 — FINOMÍTOTT dedup-kulcs (2026-06-20)
-- ===================================================================
-- HIBA (Endre, valós adat): a v3 dedup-kulcs a bevételnél a
--   congregation_id + datum + osszeg + id_befizetescel + iratszam + forrasa + bankszamla_id
-- kulcsot nézte, de a NYUGTÁT és a FIZETETTÉV-et NEM — így:
--   • a HÁTRALÉKOS egyházfenntartás (ugyanaz a nyugta, de MÁS Befizetett év), és
--   • az AZONOS összegű, külön nyugtás befizetések (más személy, ua. nap/összeg)
-- tévesen duplikátumnak látszottak és KIMARADTAK. (101.01: −1 240 RON a valós importnál.)
-- A kiadásnál két azonos összegű/dátumú, külön bizonylatú banki díj (203.03) eshetett össze (−4,47).
--
-- v4 JAVÍTÁS — a dedup-kulcs kibővül a STABIL, FÁJLBÓL jövő természetes azonosítókkal:
--   • bevétel: + `nyugta` (bizonylatszám — minden befizetés egyedi) + `fizetettev` (hátralék-év)
--   • kiadás:  + `nyugta` (bizonylatszám)
-- Szándékosan NEM a `megjegyzes` a megkülönböztető: a belső-mozgás sorok megjegyzése
-- generált szöveg, ami verzióváltáskor elcsúszhat → újraimportkor hamis nem-duplikátum
-- (15+ banki letét megduplázódna). A `nyugta`/`fizetettev` a fájl stabil értékei →
-- az újraimport idempotens MARAD, a hiányzó (eddig összevont) sorok mégis bekerülnek.
--
-- TEENDŐ a hiányzó sorok pótlásához: futtatás UTÁN importáld ÚJRA a fájlt — a meglévő sorok
-- kulcsa (nyugta+fizetettev) változatlan → kimaradnak (nincs duplikálás); a korábban tévesen
-- összevont sorok most külön bizonylat/év alapján beszúródnak.
--
-- CREATE OR REPLACE — felülírja a v3-at.
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
  v_nyugta text;
  v_fizetettev integer;
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
      v_nyugta := coalesce(v_item->>'nyugta', '');
      v_fizetettev := coalesce((v_item->>'fizetettev')::integer, 0);

      -- ── 1. INCOME (bevétel) ────────────────────────────────────────
      IF v_kind = 'income' THEN
        v_id_befizetescel := (v_item->>'id_befizetescel')::integer;

        -- Dup-check: ugyanaz a sor már létezik-e? (v4: + nyugta + fizetettev)
        SELECT EXISTS (
          SELECT 1 FROM public.befizetes b
          WHERE b.congregation_id = p_congregation_id
            AND b.datum = v_datum
            AND b.osszeg = v_osszeg
            AND b.id_befizetescel = v_id_befizetescel
            AND coalesce(b.iratszam, '') = v_iratszam
            AND coalesce(b.forrasa, '') = v_forrasa
            AND coalesce(b.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
            AND coalesce(b.nyugta, '') = v_nyugta
            AND coalesce(b.fizetettev, 0) = v_fizetettev
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
          v_nyugta,
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

        -- Dup-check (v4: + nyugta — bizonylatszám, az azonos összegű díjak elkülönítése)
        SELECT EXISTS (
          SELECT 1 FROM public.kiadas k
          WHERE k.congregation_id = p_congregation_id
            AND k.datum = v_datum
            AND k.osszeg = v_osszeg
            AND k.id_kiadascel = v_id_kiadascel
            AND coalesce(k.iratszam, '') = v_iratszam
            AND coalesce(k.atvevo, '') = v_atvevo
            AND coalesce(k.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
            AND coalesce(k.nyugta, '') = v_nyugta
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
          v_nyugta,
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
