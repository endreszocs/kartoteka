-- ============================================================================
-- 2026-06-05n — Sor-szintű audit napló (F4b): "mi változott, ki és mikor"
-- ----------------------------------------------------------------------------
-- A #3 igazi lényege: a kulcstáblák (pénzügy, tagság, jogosultság) MINDEN
-- módosítása naplózódik a régi → új értékkel együtt, hogy visszakövethető
-- legyen, ki mit módosított — visszaélés-vizsgálathoz.
--
-- Minta: Supabase supa_audit — egyetlen generikus JSONB audit-tábla.
-- A naplót CSAK az audit-trigger írja (append-only, SECURITY DEFINER); a normál
-- szerepek nem írhatják/törölhetik. Olvasás: admin + az adott egyházmegye
-- számvevője + a gyülekezet lelkésze (a saját gyülekezetére).
--
-- AKTOR (ki módosított): a trigger réteges feloldással veszi:
--   COALESCE(app.actor_id GUC, request.jwt.claim.sub) — így a bejelentkezett
--   (session-kliens) írásoknál automatikusan a felhasználó kerül be. (A
--   service-role írásoknál opcionálisan injektálható az app.actor_id; enélkül
--   az aktor NULL = "rendszer/admin művelet".)
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

-- ── 1. Napló-tábla ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.record_version (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts            timestamptz NOT NULL DEFAULT now(),
  table_name    text NOT NULL,
  op            text NOT NULL,         -- INSERT | UPDATE | DELETE
  record_id     text,                  -- a sor 'id'-je (uuid vagy int, szövegként)
  actor_id      uuid,                  -- ki módosította (ha kideríthető)
  congregation_id uuid,                -- scope-oláshoz (ha a sornak van ilyen mezője)
  old_record    jsonb,
  new_record    jsonb
);

-- Indexek: idő-tartomány (BRIN, mert idő-rendben nő), + "ki/melyik gyülekezet/melyik tábla"
CREATE INDEX IF NOT EXISTS idx_arv_ts        ON audit.record_version USING brin (ts);
CREATE INDEX IF NOT EXISTS idx_arv_actor     ON audit.record_version (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_arv_cong      ON audit.record_version (congregation_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_arv_table     ON audit.record_version (table_name, ts DESC);

COMMENT ON TABLE audit.record_version IS
  'Sor-szintű audit napló (supa_audit minta): kulcstáblák minden módosítása old/new JSONB-vel + aktor. Append-only. 2026-06-05.';

-- ── 2. Trigger-függvény ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, audit
AS $$
DECLARE
  v_actor uuid;
  v_old jsonb;
  v_new jsonb;
  v_payload jsonb;
  v_rec_id text;
  v_cong uuid;
BEGIN
  -- Aktor: app.actor_id (service-role injektálható) VAGY a JWT sub (session-kliens)
  BEGIN
    v_actor := NULLIF(COALESCE(
      current_setting('app.actor_id', true),
      current_setting('request.jwt.claim.sub', true)
    ), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_payload := v_old;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW); v_payload := v_new;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_payload := v_new;
  END IF;

  v_rec_id := v_payload ->> 'id';
  -- congregation_id a sorból, vagy a congregations táblánál maga az id
  BEGIN
    IF TG_TABLE_NAME = 'congregations' THEN
      v_cong := NULLIF(v_payload ->> 'id', '')::uuid;
    ELSE
      v_cong := NULLIF(v_payload ->> 'congregation_id', '')::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_cong := NULL;
  END;

  INSERT INTO audit.record_version (table_name, op, record_id, actor_id, congregation_id, old_record, new_record)
  VALUES (TG_TABLE_NAME, TG_OP, v_rec_id, v_actor, v_cong, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 3. Trigger rákötése a kulcstáblákra ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'befizetes', 'kiadas', 'szemely', 'profiles', 'profile_roles',
    'congregations', 'bealitas', 'jarulek_kedvezmeny', 'felmentes'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION audit.log_change()',
        t);
    END IF;
  END LOOP;
END $$;

-- ── 4. RLS — olvasás: admin + egyházmegyei számvevő + a gyülekezet lelkésze ──
ALTER TABLE audit.record_version ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arv_select ON audit.record_version;
CREATE POLICY arv_select ON audit.record_version
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR congregation_id = public.current_user_congregation_id()
    OR (
      congregation_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.congregations c
        JOIN public.profiles me ON me.id = auth.uid()
        WHERE c.id = audit.record_version.congregation_id
          AND me.role = 'egyhazmegyei_szamvevo'
          AND c.diocese_id = me.diocese_id
      )
    )
  );

-- Írás CSAK a trigger-en keresztül (SECURITY DEFINER). A normál szerepek nem írhatnak.
GRANT USAGE ON SCHEMA audit TO authenticated, service_role;
GRANT SELECT ON audit.record_version TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON audit.record_version FROM authenticated;

-- ── 5. Lekérdező RPC (public — az audit séma nincs kitéve a PostgREST-nek) ───
-- Jogosultság-ellenőrzéssel adja vissza a naplót: admin mindent; a gyülekezet
-- lelkésze a sajátját; a számvevő a saját egyházmegyéje gyülekezeteit.
CREATE OR REPLACE FUNCTION public.get_record_audit(
  p_congregation_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_table text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS TABLE(
  id bigint, ts timestamptz, table_name text, op text, record_id text,
  actor_id uuid, actor_name text, congregation_id uuid, old_record jsonb, new_record jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, audit
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_my_cong uuid := public.current_user_congregation_id();
  v_role text;
  v_diocese uuid;
BEGIN
  SELECT role, diocese_id INTO v_role, v_diocese FROM public.profiles WHERE id = auth.uid();

  RETURN QUERY
  SELECT r.id, r.ts, r.table_name, r.op, r.record_id, r.actor_id,
         p.full_name AS actor_name, r.congregation_id, r.old_record, r.new_record
  FROM audit.record_version r
  LEFT JOIN public.profiles p ON p.id = r.actor_id
  WHERE
    (v_is_admin
     OR (r.congregation_id IS NOT NULL AND r.congregation_id = v_my_cong)
     OR (v_role = 'egyhazmegyei_szamvevo' AND r.congregation_id IN (
           SELECT c.id FROM public.congregations c WHERE c.diocese_id IS NOT DISTINCT FROM v_diocese)))
    AND (p_congregation_id IS NULL OR r.congregation_id = p_congregation_id)
    AND (p_actor_id IS NULL OR r.actor_id = p_actor_id)
    AND (p_table IS NULL OR r.table_name = p_table)
    AND (p_from IS NULL OR r.ts >= p_from)
    AND (p_to IS NULL OR r.ts <= p_to)
  ORDER BY r.ts DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 1000);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_record_audit(uuid, uuid, text, timestamptz, timestamptz, integer) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- Próba: módosíts egy befizetést, majd:
-- SELECT ts, table_name, op, actor_id, congregation_id FROM audit.record_version ORDER BY ts DESC LIMIT 10;
-- "Mit változtatott X felhasználó egy időszakban":
-- SELECT ts, table_name, op, old_record, new_record FROM audit.record_version
--   WHERE actor_id = '<user-uuid>' AND ts BETWEEN '2026-06-01' AND '2026-07-01' ORDER BY ts DESC;
