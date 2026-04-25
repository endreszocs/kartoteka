/**
 * @kartoteka/supabase-client — közös Supabase kliens-factory.
 *
 * M1.1 placeholder → M1.3-ban feltöltve valós tartalommal.
 *
 * Exportált API:
 *   - createKartotekaBrowserClient(config) → browser-oldali Supabase kliens
 *   - SupabaseBrowserConfig típus (url + anonKey)
 *   - Database típus (M1.5-ben generáljuk a Supabase-séma alapján)
 *
 * A csomag **nem olvas environment változót** — a caller (Next.js / Vite)
 * adja át az URL-t és az anon kulcsot explicit, hogy platform-függetlenek
 * legyünk.
 *
 * **Nem exportálunk** itt szerver-oldali klienseket (SSR, admin/service_role),
 * mert azok Next.js-specifikusak (cookies(), server-only). Azok az
 * `apps/web/lib/supabase/` alatt maradnak.
 */

export {
  createKartotekaBrowserClient,
  type SupabaseAuthStorage,
  type SupabaseBrowserConfig,
} from './browser'

export type { Database } from './types'
