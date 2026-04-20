/**
 * Generált Supabase-típusok placeholder.
 *
 * **M1.5-ben** cseréljük le a valódi tipusokra:
 *   npx supabase gen types typescript \
 *     --project-id bjytiawckbibqmtlezfl \
 *     > packages/supabase-client/src/types.ts
 *
 * Addig a `Database = unknown` jelzi, hogy a `SupabaseClient` alap-típusát
 * használjuk — ez a mai állapot (a `apps/web/lib/supabase/*.ts` sem használ
 * generikus `SupabaseClient<Database>` típust a kódbázisban).
 */
export type Database = unknown
