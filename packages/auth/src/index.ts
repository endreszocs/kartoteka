/**
 * @kartoteka/auth — közös RBAC és scope helper-ek.
 *
 * M6.1 skeleton (2026-04-21). Tartalom az M6 során kerül át az apps/web/lib/auth/
 * alól:
 *   - roles.ts          (isAdminRole, isEsperesRole, canReadFinancial, canEditTvaFlags…)
 *   - finance-scope.ts  (pénzügyi scope-builder kerület/megye/gyülekezet szerint)
 *   - effective-access.ts (tényleges hozzáférés számítás)
 *   - profile-roles.ts  (multi-role + profilváltás)
 *
 * Szerep-hierarchia:
 *   lelkesz → esperes → egyhazmegyei_admin → egyhazkeruleti_admin → admin
 *   (+ konyvelo, egyhazmegyei_szamvevo — WC-7-ben bevezetve)
 *
 * FONTOS ALAPELV (memory: feedback_szerepkor_kiosztas):
 *   A kliens-oldali RBAC csak UI-szintű ergonomikus védelem. A valódi biztonság
 *   a Supabase RLS + SECURITY DEFINER helper fn-eken alapszik:
 *     - current_user_congregation_id()
 *     - current_user_has_global_access()
 *     - current_user_can_access_congregation(target_cong_id)
 *
 * Szerepkör-kiosztás: csak admin és egyházkerületi admin oszthat új szerepet;
 * egyházmegyei admin és esperes NEM. Audit trail kötelező (audit_log tábla).
 */
export {}
