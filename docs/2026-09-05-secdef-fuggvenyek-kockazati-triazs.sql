-- ═══════════════════════════════════════════════════════════════════════════
--  SECURITY DEFINER FÜGGVÉNYEK — KOCKÁZATI TRIÁZS
--  2026-09-05  ·  folytatás a nyilvános réteg állapotfelméréséhez
--
--  ELŐZMÉNY: az állapotfelmérés 7. sora szerint 89 SECURITY DEFINER függvényt
--  hívhat a PUBLIC vagy az anon szerep. A 8. sor csak az első 60 NEVET adta —
--  a név viszont nem mond semmit a kockázatról.
--
--  EZ A LEKÉRDEZÉS MIND A 89-ET kilistázza, és a FÜGGVÉNY TÖRZSE ALAPJÁN
--  osztályozza: hozzányúl-e személyes adathoz, és ellenőrzi-e a hívót.
--
--    ⛔ P0  — személyes adathoz nyúl ÉS nincs benne hívó-ellenőrzés
--    ⚠️ P1  — személyes adathoz nyúl, van valamilyen ellenőrzés (át kell nézni)
--    ·  OK  — nem nyúl személyes adathoz
--
--  ⚠️ A besorolás GÉPI HEURISZTIKA, nem ítélet. A ⛔ sorokat egyenként kell
--     átnézni — de a sorrendet ez adja meg.
--
--  CSAK OLVAS. Egyetlen sort sem ír.
--  EGYETLEN LEKÉRDEZÉS, EGYETLEN RÁCS — jelöld ki az egészet, futtasd,
--  és a teljes táblázatot küldd vissza.
-- ═══════════════════════════════════════════════════════════════════════════

WITH anon_secdef AS (
  SELECT
    p.oid,
    p.proname                                        AS fuggveny,
    pg_get_function_identity_arguments(p.oid)        AS argumentumok,
    pg_get_functiondef(p.oid)                        AS torzs,
    -- Ki hívhatja?
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_hivhatja,
    (p.proacl IS NULL)                               AS orokolt_public_jog
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR p.proacl IS NULL
      OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    )
),
jelolt AS (
  SELECT
    a.*,
    -- Nyúl-e SZEMÉLYES ADATOT tartalmazó táblához?
    (a.torzs ~* '\m(szemely|csalad|gyerek|haztartas|profiles|auth\.users|keresztelo|konfirmacio|hazassag|temetes|elhunyt|befizetes|kiadas|adomany|presbiter|tisztseg)\M')
      AS erint_szemelyes_adatot,
    -- Van-e benne BÁRMILYEN hívó-ellenőrzés?
    (a.torzs ~* '(auth\.uid\(\)|current_user_can_|current_user_has_|current_user_is_|is_admin|is_master_admin|is_user_approved|is_current_user_approved|is_caller_)')
      AS van_hivo_ellenorzes,
    -- Token/titok-alapú kapu (ez legitim lehet anon-nál)
    (a.torzs ~* '(token|p_slug|p_token)') AS token_vagy_slug_kapu
  FROM anon_secdef a
)
SELECT
  CASE
    WHEN j.erint_szemelyes_adatot AND NOT j.van_hivo_ellenorzes THEN '1 ⛔ P0'
    WHEN j.erint_szemelyes_adatot                                THEN '2 ⚠️ P1'
    ELSE                                                              '3 ·  OK'
  END                                                        AS kockazat,
  j.fuggveny,
  COALESCE(NULLIF(j.argumentumok, ''), '(nincs paraméter)')   AS argumentumok,
  CASE WHEN j.anon_hivhatja THEN 'anon' ELSE '' END
    || CASE WHEN j.orokolt_public_jog THEN ' +PUBLIC(örökölt)' ELSE '' END
                                                             AS ki_hivhatja,
  CASE WHEN j.erint_szemelyes_adatot THEN 'IGEN' ELSE 'nem' END AS szemelyes_adat,
  CASE WHEN j.van_hivo_ellenorzes    THEN 'van'  ELSE 'NINCS' END AS hivo_ellenorzes,
  CASE WHEN j.token_vagy_slug_kapu   THEN 'token/slug' ELSE '' END AS egyeb_kapu,
  -- Mely PII-táblákat érinti konkrétan? (a triázs indoklása)
  COALESCE(NULLIF(ARRAY_TO_STRING(ARRAY(
    SELECT t FROM unnest(ARRAY[
      'szemely','csalad','gyerek','haztartas','profiles','auth.users',
      'keresztelo','konfirmacio','hazassag','temetes','befizetes','kiadas',
      'adomany','presbiter','tisztseg'
    ]) AS t
    WHERE j.torzs ILIKE '%' || t || '%'
  ), ', '), ''), '—')                                        AS erintett_tablak,
  length(j.torzs)                                            AS torzs_hossz
FROM jelolt j
ORDER BY 1, 2;
