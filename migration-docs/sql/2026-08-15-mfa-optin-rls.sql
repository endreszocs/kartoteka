-- ═══════════════════════════════════════════════════════════════════════════
--  2FA OPT-IN RLS-KÉNYSZER (2026-08-15, 8. pont C szelet)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ENDRE 4. DÖNTÉSE: „a rendszer fiókonként tudja, és az RLS-policy (nem
--  csak a UI) tartatja be, API-megkerülés ellen is."
--
--  MIT CSINÁL: RESTRICTIVE (ÉS-kapcsolódó) policy a legérzékenyebb adat-
--  táblákra: ha a hívó fiókjának VAN ellenőrzött 2FA-faktora, az adathoz
--  CSAK aal2-es (kóddal megerősített) munkamenettel fér hozzá. Akinek NINCS
--  faktora, arra a feltétel automatikusan igaz (aal1 és aal2 is megengedett)
--  — az opt-in ígéret: nulla hatás a nem-bekapcsolókra.
--
--  MIÉRT BIZTONSÁGOS A BEVEZETÉS:
--   · faktor nélküli fiókra a policy MINDENT enged, amit az eddigi
--     (permissive) policyk engedtek — viselkedés-azonos;
--   · faktoros fióknál a web és a desktop belépési folyama MÁR aal2-re
--     emeli a munkamenetet (A+B szelet, élesben) — a policy csak a
--     kerülőutakat (nyers API-hívás aal1-es tokennel) zárja;
--   · mentőkódos belépésnél a faktor törlődik → a feltétel azonnal
--     visszaáll a megengedőre (a policy ÉLŐBEN olvassa az auth.mfa_factors-t).
--
--  ROLLBACK (ha bármi váratlan): futtasd újra ezt a fájlt úgy, hogy a
--  legalsó DO-blokkban a 'CREATE' szót 'DROP'-ra állítod — vagy egyszerűen:
--    DO $$ DECLARE t text; BEGIN
--      FOREACH t IN ARRAY (ARRAY['szemely','csalad','befizetes','kiadas',
--        'belsomozgas','munkanaplo','bealitas','lelkeszi_jelentes',
--        'leltar_tetelek','keresztseg','konfirmalas','hazassag','temetes',
--        'mfa_mentokodok'])
--      LOOP EXECUTE format('DROP POLICY IF EXISTS mfa_opt_in_aal2 ON public.%I', t); END LOOP;
--    END $$;
--
--  ⚠️ EGY TRANZAKCIÓ — újrafuttatható (DROP + CREATE).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  -- A védett adat-táblák. A profiles/profile_roles SZÁNDÉKOSAN NINCS itt:
  -- a belépési folyamat (cél-feloldás, profil-választó) a 2. lépcső ELŐTT
  -- is olvassa őket — ott a middleware aal-őre a védelem.
  tablak text[] := ARRAY[
    'szemely', 'csalad', 'befizetes', 'kiadas', 'belsomozgas',
    'munkanaplo', 'bealitas', 'lelkeszi_jelentes', 'leltar_tetelek',
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes', 'mfa_mentokodok'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tablak LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'mfa-optin-rls: a(z) % tábla nem létezik — kihagyva', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS mfa_opt_in_aal2 ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY mfa_opt_in_aal2 ON public.%I AS RESTRICTIVE TO authenticated
       USING (
         ARRAY[(SELECT auth.jwt() ->> ''aal'')] <@ (
           SELECT CASE WHEN count(id) > 0
                       THEN ARRAY[''aal2'']
                       ELSE ARRAY[''aal1'', ''aal2''] END
             FROM auth.mfa_factors
            WHERE user_id = (SELECT auth.uid()) AND status = ''verified''
         )
       )',
      t
    );
  END LOOP;
END;
$$;

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
-- Mind a 14 táblán ✅ kell legyen (ha egy tábla nem létezik, ❌-szel jelez).
WITH tablak(tabla) AS (
  VALUES ('szemely'), ('csalad'), ('befizetes'), ('kiadas'), ('belsomozgas'),
         ('munkanaplo'), ('bealitas'), ('lelkeszi_jelentes'), ('leltar_tetelek'),
         ('keresztseg'), ('konfirmalas'), ('hazassag'), ('temetes'), ('mfa_mentokodok')
)
SELECT t.tabla,
       CASE WHEN p.policyname IS NOT NULL AND p.permissive = 'RESTRICTIVE'
            THEN '✅' ELSE '❌ NINCS restrictive policy' END AS mfa_optin_policy
FROM tablak t
LEFT JOIN pg_policies p
       ON p.schemaname = 'public' AND p.tablename = t.tabla
      AND p.policyname = 'mfa_opt_in_aal2'
ORDER BY t.tabla;
