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
-- Pénzügyi import RPC: import_finance_batch
-- ===================================================================
--
-- 2026-05-02 (Fázis 3, Pénzügyi import-wizard)
--
-- A pénzügyi import-wizard végén a wizard egy JSONB tömböt küld a server
-- action-nek, ami ezt az RPC-t hívja egyetlen tranzakcióban. Az RPC:
--   - tételenként végigmegy a tömbön
--   - kind szerint INSERT a `befizetes` / `kiadas` / `belsomozgas`-ba
--   - belso_mozgas tételek esetén közös `belso_mozgas_xkey`-vel páros
--     `befizetes` + `kiadas` rekordot hoz létre
--   - hibás tétel esetén az adott sor `skipped`, a többi tovább megy
--   - visszaad: { inserted, skipped, errors }
--
-- BIZTONSÁG:
--   - SECURITY DEFINER (a hívó user JWT-jén keresztül azonosítjuk)
--   - admin / egyhazkeruleti_admin / lelkesz / konyvelo szerepkör
--     (csak `approval_status = approved` és `active = true`)
--   - rendszergazda (`scope = system, role = admin`) bármely gyülekezetre
--   - lelkesz / konyvelo csak a saját scope_id-ű gyülekezetére
--   - egyhazkeruleti_admin a kerülete alá tartozó gyülekezetekre (district scope)
--
-- INPUT formátum (p_items):
-- [
--   {
--     "kind": "income",
--     "datum": "2025-01-08",
--     "osszeg": 130,
--     "id_befizetescel": 12,
--     "forrasa": "Beder Győzőné Elvira - Főút 27",
--     "id_szemely": 4521,
--     "iratszam": "20",
--     "nyugta": "20",
--     "irattipus": "Chit.",
--     "fizetettev": 2025,
--     "megjegyzes": ""
--   },
--   {
--     "kind": "expense",
--     "datum": "2025-01-13",
--     "osszeg": 181.65,
--     "id_kiadascel": 21,
--     "atvevo": "INTERNATIONAL PAPER BUSINESS SRL",
--     "iratszam": "117",
--     "irattipus": "Fact.+Bon.",
--     "fizetettev": 2025
--   },
--   {
--     "kind": "internal-transfer-out",
--     "datum": "2025-01-09",
--     "osszeg": 7680,
--     "forrasa": "Készpénzletétel a(z) A számlára",
--     "iratszam": "",
--     "irattipus": "",
--     "fizetettev": 2025,
--     "belso_forras": "kassza",
--     "belso_cel_bankszamla_id": 5
--   }
-- ]
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
  v_belso_xkey uuid;
  v_idx integer := 0;
  v_kassza_oldal_id integer;
  v_bank_oldal_id integer;
  v_belso_forras text;
  v_belso_cel_bankszamla_id integer;
BEGIN
  -- ─── Jogosultság-ellenőrzés ──────────────────────────────────────────
  -- A pénzügyi import csak admin / egyhazkeruleti_admin / lelkesz / konyvelo
  -- szerepkörrel engedélyezett, és csak ha aktív + approved.
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p_user_id
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND (
        -- Rendszergazda (system scope, admin role) — bármely gyülekezetre
        (pr.scope = 'system' AND pr.role = 'admin')
        OR
        -- Egyházkerületi admin — district scope (jelenleg minden kerület-szintűt elfogadunk)
        (pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin')
        OR
        -- Lelkész / könyvelő — csak a saját gyülekezetére
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
      -- ── 1. INCOME ───────────────────────────────────────────────────
      IF v_kind = 'income' THEN
        v_xkey := gen_random_uuid();
        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          id_szemely, id_csalad,
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
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        );
        v_inserted := v_inserted + 1;

      -- ── 2. EXPENSE ──────────────────────────────────────────────────
      ELSIF v_kind = 'expense' THEN
        v_xkey := gen_random_uuid();
        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, atvevoid,
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
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        );
        v_inserted := v_inserted + 1;

      -- ── 3. INTERNAL TRANSFER OUT (kassza → bank) ────────────────────
      ELSIF v_kind = 'internal-transfer-out' THEN
        -- Páros tétel: kassza-oldal kiadás + bank-oldal befizetés
        -- Mindkettő közös belso_mozgas_xkey-vel
        v_belso_xkey := gen_random_uuid();
        v_belso_cel_bankszamla_id := NULLIF(v_item->>'belso_cel_bankszamla_id', '')::integer;

        -- Kassza-oldal kiadás (bankszamla_id NULL = kassza)
        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          gen_random_uuid(),
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_kiadascel')::integer,
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          v_item->>'megjegyzes',
          coalesce(v_item->>'forrasa', ''),
          NULL,
          v_belso_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        ) RETURNING id INTO v_kassza_oldal_id;

        -- Bank-oldal bevétel (a cél bankszámlán jelenik meg)
        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          gen_random_uuid(),
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_befizetescel')::integer,
          coalesce(v_item->>'forrasa', 'Készpénzletétel a kasszából'),
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          false,
          (v_item->>'fizetettev')::integer,
          v_item->>'megjegyzes',
          v_belso_cel_bankszamla_id,
          v_belso_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        ) RETURNING id INTO v_bank_oldal_id;

        -- belsomozgas audit-rekord
        INSERT INTO public.belsomozgas (
          congregation_id, datum, tipus, forras, cel,
          osszeg, megjegyzes, created_by, deleted
        ) VALUES (
          p_congregation_id,
          (v_item->>'datum')::date,
          'kassza_bank',
          'kassza',
          coalesce(v_item->>'belso_cel_bankszamla_id', ''),
          (v_item->>'osszeg')::numeric,
          coalesce(v_item->>'megjegyzes', ''),
          p_user_id,
          false
        );

        v_inserted := v_inserted + 2; -- befizetes + kiadas

      -- ── 4. INTERNAL TRANSFER IN (bank → kassza) ─────────────────────
      ELSIF v_kind = 'internal-transfer-in' THEN
        v_belso_xkey := gen_random_uuid();
        v_belso_forras := coalesce(v_item->>'belso_forras_bankszamla_id', '');
        v_belso_cel_bankszamla_id := NULLIF(v_item->>'belso_forras_bankszamla_id', '')::integer;

        -- Bank-oldal kiadás
        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          gen_random_uuid(),
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_kiadascel')::integer,
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          v_item->>'megjegyzes',
          coalesce(v_item->>'forrasa', ''),
          v_belso_cel_bankszamla_id,
          v_belso_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        ) RETURNING id INTO v_bank_oldal_id;

        -- Kassza-oldal bevétel (bankszamla_id NULL = kassza)
        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          gen_random_uuid(),
          (v_item->>'datum')::date,
          (v_item->>'osszeg')::numeric,
          (v_item->>'id_befizetescel')::integer,
          coalesce(v_item->>'forrasa', 'Készpénzfelvétel bankszámláról'),
          coalesce(v_item->>'nyugta', ''),
          coalesce(v_item->>'iratszam', ''),
          coalesce(v_item->>'irattipus', ''),
          false,
          (v_item->>'fizetettev')::integer,
          v_item->>'megjegyzes',
          NULL,
          v_belso_xkey,
          p_congregation_id,
          p_user_id,
          now(),
          false,
          false
        ) RETURNING id INTO v_kassza_oldal_id;

        -- belsomozgas audit-rekord
        INSERT INTO public.belsomozgas (
          congregation_id, datum, tipus, forras, cel,
          osszeg, megjegyzes, created_by, deleted
        ) VALUES (
          p_congregation_id,
          (v_item->>'datum')::date,
          'bank_kassza',
          v_belso_forras,
          'kassza',
          (v_item->>'osszeg')::numeric,
          coalesce(v_item->>'megjegyzes', ''),
          p_user_id,
          false
        );

        v_inserted := v_inserted + 2;

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
  prosecdef AS security_definer,
  proacl
FROM pg_proc
WHERE proname = 'import_finance_batch'
  AND pronamespace = 'public'::regnamespace;
