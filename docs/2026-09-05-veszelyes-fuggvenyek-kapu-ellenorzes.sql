-- ═══════════════════════════════════════════════════════════════════════════
--  A VESZÉLYES ANON-HÍVHATÓ FÜGGVÉNYEK KAPU-ELLENŐRZÉSE
--  2026-09-05  ·  3. lépés
--
--  ELŐZMÉNY: a triázs 89 anon-hívható SECURITY DEFINER függvényt talált.
--  A gépi besorolás azonban KÉT IRÁNYBAN is tévedett:
--    · TÚLJELÖLT: a trigger-függvényeket (pl. handle_new_user) a PostgREST
--      NEM teszi ki RPC-ként — nem hívhatók kívülről, csak a jog fölösleges;
--    · ALULJELÖLT: a „van hívó-ellenőrzés" csak azt jelenti, hogy a törzs
--      TARTALMAZ auth.uid()-ot — nem azt, hogy KAPUZ is vele.
--
--  Ez a lekérdezés a ROMBOLÓ és a SZEMÉLYES ADATOT VISSZAADÓ függvényeket
--  választja szét, kiírja a VISSZATÉRÉSI TÍPUST (trigger = nem hívható),
--  és megmutatja a törzs ELEJÉT — mert a kapu majdnem mindig ott van.
--
--  A „kapu_minta" oszlop a döntő: ha NINCS benne RAISE/RETURN-alapú
--  megtagadás, akkor a függvény nem véd, csak tartalmaz egy auth.uid()-ot.
--
--  CSAK OLVAS. EGYETLEN RÁCS — küldd vissza az egészet.
-- ═══════════════════════════════════════════════════════════════════════════

WITH cel AS (
  SELECT unnest(ARRAY[
    -- ROMBOLÓ / ÁLLAPOTVÁLTOZTATÓ
    'wipe_congregation_data',
    'wipe_finance_data',
    'purge_recycle_bin',
    'revert_family_link_batch',
    'transfer_approve',
    'resolve_cross_congregation_match',
    'soft_delete_document',
    'reopen_iktato_year',
    'next_bizonylat_szam',
    'next_iktato_sequence',
    'sync_iktato_sequence_pointer',
    'record_pastor_tenure_start',
    '_resolve_or_create_street',
    '_resolve_or_create_locality',
    -- SZEMÉLYES ADATOT VISSZAADÓ (orákulum-gyanú)
    'find_potential_cross_congregation_match',
    'get_cross_match_pastor_contacts',
    'get_profile_display_names',
    'get_record_audit',
    'district_member_counts',
    'get_congregation_officials',
    'get_diocese_officials',
    'list_family_link_batches',
    'szemely_kereszt_egyezesben_lathato',
    -- SZÁNDÉKOLTAN NYILVÁNOS (kontrollcsoport — ezeknek rendben kell lenniük)
    'public_site_stats',
    'public_site_tisztsegek',
    'qr_session_lookup'
  ]) AS nev
)
SELECT
  CASE
    WHEN p.prorettype = 'trigger'::regtype              THEN '0 · trigger (NEM hívható RPC-ként)'
    WHEN NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                                                        THEN '4 · anon NEM hívhatja'
    WHEN pg_get_functiondef(p.oid) ~* '(RAISE\s+EXCEPTION|RAISE\s+insufficient|RETURN\s+(NULL|false|QUERY\s+SELECT\s+WHERE\s+false)\s*;?\s*(--)?[^;]*)'
         AND pg_get_functiondef(p.oid) ~* '(auth\.uid\(\)|is_admin|is_master_admin|current_user_can_|current_user_has_|is_caller_)'
                                                        THEN '2 · van kapu-MINTA (át kell nézni)'
    ELSE                                                     '1 ⛔ NINCS kapu-minta'
  END                                                        AS itelet,
  p.proname                                                  AS fuggveny,
  pg_get_function_identity_arguments(p.oid)                  AS argumentumok,
  pg_get_function_result(p.oid)                              AS visszater,
  CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'IGEN' ELSE 'nem' END
                                                             AS anon_hivhatja,
  -- Kapuzik-e ténylegesen? A megtagadó minták jelenléte:
  CONCAT_WS(' + ',
    CASE WHEN pg_get_functiondef(p.oid) ~* 'RAISE\s+EXCEPTION' THEN 'RAISE' END,
    CASE WHEN pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)\s+IS\s+NULL' THEN 'uid IS NULL ág' END,
    CASE WHEN pg_get_functiondef(p.oid) ~* '(is_admin|is_master_admin|is_caller_admin)' THEN 'admin-ellenőrzés' END,
    CASE WHEN pg_get_functiondef(p.oid) ~* 'current_user_can_' THEN 'hatókör-ellenőrzés' END
  )                                                          AS kapu_minta,
  -- A törzs ELEJE: a kapu majdnem mindig itt van. A fejléc-kommenteket kivágjuk.
  left(
    regexp_replace(
      regexp_replace(pg_get_functiondef(p.oid), '^.*?\$function\$', '', 's'),
      '\s+', ' ', 'g'
    ), 700)                                                  AS torzs_eleje
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN cel c ON c.nev = p.proname
WHERE n.nspname = 'public'
ORDER BY 1, 2;
