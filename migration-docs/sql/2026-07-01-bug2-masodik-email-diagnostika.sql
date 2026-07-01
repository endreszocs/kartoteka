-- =========================================================================
-- 2026-07-01 — BUG 2 DIAGNOSZTIKA: a második email nem látja az egyházközség adatait
-- =========================================================================
-- TÜNET (Endre): egy MÁSODIK emailt beregisztráltál UGYANAHHOZ az egyházközséghez,
-- de a második fiókkal belépve NEM jelennek meg az adatok (személyek, pénzügy stb.).
--
-- GYÖKÉROK (a kód-elemzésből):
--   Minden egyházközségi tábla RLS-e a `current_user_can_access_congregation()`
--   függvényen keresztül dönt, ami CSAK a HÍVÓ SAJÁT `profiles.congregation_id`
--   skalár mezőjét nézi (és a `status = 'active'`-ot):
--
--     current_user_congregation_id() =
--       SELECT congregation_id FROM profiles WHERE id = auth.uid() AND status='active';
--
--   A `profile_roles` (több-szerep) táblát az RLS NEM veszi figyelembe. Tehát a
--   második fiók CSAK akkor lát adatot, ha a SAJÁT `profiles.congregation_id`-ja
--   pontosan az egyházközségre mutat ÉS a `status = 'active'`.
--
--   A leggyakoribb csapda: az `admin_activate_user` RPC a congregation_id-t CSAK
--   akkor írja be, ha a profil épp `pending` volt (lásd 2026-05-04-admin-user-status-rpc.sql:117).
--   Ha a második fiók már `active` volt aktiváláskor (vagy a jóváhagyás NULL
--   egyházközséggel ment), a skalár NULL / rossz marad → az RLS semmit nem enged.
--
-- HASZNÁLAT: Supabase SQL editor (service_role). Töltsd ki a két emailt lent,
--   majd futtasd a blokkokat EGYENKÉNT (jelöld ki és Run).
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- A) PROFIL-ÖSSZEHASONLÍTÁS — a MŰKÖDŐ (első) és a HIBÁS (második) fiók egymás mellett
-- ─────────────────────────────────────────────────────────────────────────
WITH params AS (
  SELECT
    lower('elso@example.com')    AS mukodo_email,   -- <<< ÍRD IDE a MŰKÖDŐ (első) emailt
    lower('masodik@example.com') AS hibas_email     -- <<< ÍRD IDE a HIBÁS (második) emailt
)
SELECT
  CASE WHEN u.email = pr.mukodo_email THEN '1) MŰKÖDŐ' ELSE '2) HIBÁS' END AS fiok,
  u.email,
  p.id                AS profile_id,
  p.status,
  p.role,
  p.congregation_id,
  c.name              AS egyhazkozseg_nev,
  p.diocese_id,
  p.district_id,
  -- Ezt adná vissza az RLS current_user_congregation_id() a fiókra:
  CASE WHEN p.status = 'active' THEN p.congregation_id ELSE NULL END AS rls_latott_congregation_id
FROM params pr
JOIN auth.users u        ON lower(u.email) IN (pr.mukodo_email, pr.hibas_email)
LEFT JOIN public.profiles p     ON p.id = u.id
LEFT JOIN public.congregations c ON c.id = p.congregation_id
ORDER BY fiok;

-- VÁRT EREDMÉNY HA EZ A BAJ: a MŰKÖDŐ sor congregation_id-ja ki van töltve és status='active';
-- a HIBÁS sor congregation_id-ja NULL (vagy más), és/vagy status <> 'active'.


-- ─────────────────────────────────────────────────────────────────────────
-- B) PROFILE_ROLES — milyen szerepek vannak a két fiókon (a jóváhagyás/aktív állapot számít)
-- ─────────────────────────────────────────────────────────────────────────
WITH params AS (
  SELECT lower('elso@example.com') AS mukodo_email, lower('masodik@example.com') AS hibas_email
)
SELECT
  CASE WHEN u.email = pr.mukodo_email THEN '1) MŰKÖDŐ' ELSE '2) HIBÁS' END AS fiok,
  u.email,
  r.scope,
  r.scope_id,
  c.name AS scope_congregation_nev,
  r.role,
  r.approval_status,
  r.active
FROM params pr
JOIN auth.users u          ON lower(u.email) IN (pr.mukodo_email, pr.hibas_email)
LEFT JOIN public.profile_roles r ON r.profile_id = u.id
LEFT JOIN public.congregations c ON c.id = r.scope_id AND r.scope = 'congregation'
ORDER BY fiok, r.scope;

-- Megjegyzés: az app-réteg (effective-access.ts) a profile_roles congregation-scope-ját
-- IS használja, de az RLS NEM — ezért hiába van jó profile_role, ha a profiles.congregation_id
-- skalár nincs beállítva, a DB akkor is üres listát ad.


-- ─────────────────────────────────────────────────────────────────────────
-- C) LÉTEZIK-E EGYÁLTALÁN ADAT az egyházközségben? (a MŰKÖDŐ fiók egyházközsége alapján)
-- ─────────────────────────────────────────────────────────────────────────
WITH params AS (
  SELECT lower('elso@example.com') AS mukodo_email
),
cong AS (
  SELECT p.congregation_id AS id
  FROM params pr JOIN auth.users u ON lower(u.email) = pr.mukodo_email
  JOIN public.profiles p ON p.id = u.id
)
SELECT
  (SELECT id FROM cong)                                                      AS egyhazkozseg_id,
  (SELECT count(*) FROM public.szemely   s WHERE s.congregation_id = (SELECT id FROM cong)) AS szemely_db,
  (SELECT count(*) FROM public.befizetes b WHERE b.congregation_id = (SELECT id FROM cong) AND b.deleted = false) AS befizetes_db,
  (SELECT count(*) FROM public.kiadas    k WHERE k.congregation_id = (SELECT id FROM cong) AND k.deleted = false) AS kiadas_db;

-- Ha itt >0 a szám, az adat MEGVAN — a második fiók pusztán hozzáférési (RLS) okból
-- nem látja. A javítást lásd: 2026-07-01-bug2-masodik-email-javitas.sql
