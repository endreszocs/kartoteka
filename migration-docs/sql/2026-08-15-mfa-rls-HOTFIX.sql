-- ═══════════════════════════════════════════════════════════════════════════
--  ⛔ SÜRGŐS HOTFIX — a 2026-08-15-mfa-optin-rls.sql 403-leállásához
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI TÖRTÉNT: a `mfa_opt_in_aal2` policy az `auth.mfa_factors` táblából
--  olvassa, van-e a fióknak 2FA-faktora. A policy viszont a lekérdező
--  (`authenticated`) szerep NEVÉBEN fut, és annak NINCS olvasási joga az
--  auth sémára → a policy kiértékelése SQL-hibára fut → a PostgREST MINDEN
--  lekérdezésre 403-at ad → az app leáll.
--
--  A GYÓGYSZER: egyetlen célzott GRANT. Ez NEM nyit adat-kaput a felhasználók
--  felé: a PostgREST kizárólag a public sémát szolgálja ki, az auth séma
--  REST-en át így sem érhető el — a jog csak a policy belső subquery-jének
--  kell.
--
--  FUTTATÁS UTÁN: frissítsd az appot (Ctrl+Shift+R) — azonnal élednie kell.
-- ═══════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.mfa_factors TO authenticated;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
SELECT
  CASE WHEN has_schema_privilege('authenticated', 'auth', 'USAGE')
       THEN '✅' ELSE '❌' END AS auth_sema_usage,
  CASE WHEN has_table_privilege('authenticated', 'auth.mfa_factors', 'SELECT')
       THEN '✅' ELSE '❌' END AS mfa_factors_select;

-- ═══════════════════════════════════════════════════════════════════════════
--  VÉSZ-VISSZAVONÁS — CSAK ha a fenti GRANT után az app MÉG MINDIG hibás:
--  jelöld ki és futtasd az alábbi blokkot (leszedi mind a 14 policyt,
--  minden visszaáll a tegnapi állapotra):
--
--  DO $$ DECLARE t text; BEGIN
--    FOREACH t IN ARRAY ARRAY['szemely','csalad','befizetes','kiadas',
--      'belsomozgas','munkanaplo','bealitas','lelkeszi_jelentes',
--      'leltar_tetelek','keresztseg','konfirmalas','hazassag','temetes',
--      'mfa_mentokodok']
--    LOOP EXECUTE format('DROP POLICY IF EXISTS mfa_opt_in_aal2 ON public.%I', t); END LOOP;
--  END $$;
-- ═══════════════════════════════════════════════════════════════════════════
