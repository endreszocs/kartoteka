/**
 * Desktop (Tauri + Vite) Supabase-kliens.
 *
 * Az M1.3-ban bevezetett közös `@kartoteka/supabase-client` csomagot
 * használja — ez ugyanaz, amit a web-oldal is.
 *
 * **Lazy-init**: a klienst csak akkor hozzuk létre, amikor ténylegesen kérjük,
 * így ha a `.env` nincs kitöltve, a frontend még betölthető (csak a
 * Supabase-hívások fognak tiszta hibát dobni).
 *
 * Env-beállítás:
 *   - `apps/desktop/.env` (vagy `.env.local`) — létrehozandó az `.env.example`
 *     alapján. A Vite a `VITE_` prefixű változókat inline-olja a build-be.
 *
 * ⛔ TÖRTÉNET (2026-09-05): 2026-04-22 és 2026-09-05 között a közös kliens-gyár
 * a `@supabase/ssr` createBrowserClient-jét hívta, amely az itt átadott
 * keyring-adaptert a SAJÁT süti-tárolójára cserélte — a munkamenet a WebView2
 * sütijében élt, az alábbi adapter és a Rust `auth.rs` halott kód volt,
 * miközben a dokumentáció az ellenkezőjét állította. Az asztali ág azóta a
 * nyers supabase-js `createClient`-et használja
 * (packages/supabase-client/src/browser.ts), tehát az adapter MOST ÉL, és a
 * session EGYETLEN tárolója az OS-kulcstár. Az örökölt sütit a
 * `torolOrokoltSutiket()` egyszer eltakarítja (D10: nincs süti→kulcstár
 * átvezetés; a frissítés után egyszer újra össze kell kapcsolni).
 */

import { invoke } from '@tauri-apps/api/core'
import {
  createKartotekaBrowserClient,
  type SupabaseAuthStorage,
  type SupabaseBrowserConfig,
} from '@kartoteka/supabase-client'

type SupabaseClient = ReturnType<typeof createKartotekaBrowserClient>

let cached: SupabaseClient | null = null

function readViteEnv(): Pick<SupabaseBrowserConfig, 'url' | 'anonKey'> {
  const env = import.meta.env
  const url = (env.VITE_SUPABASE_URL ?? '') as string
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '') as string

  if (!url || !anonKey) {
    throw new Error(
      'Nincsenek beállítva a Supabase környezeti változók a desktop appban. ' +
        'Hozz létre egy `apps/desktop/.env` fájlt a `.env.example` alapján, ' +
        'és töltsd ki a VITE_SUPABASE_URL és VITE_SUPABASE_ANON_KEY értékeket.',
    )
  }
  return { url, anonKey }
}

// ───────────────────────────────────────────────────────────────────────────
// Kulcstár-hiba állapot (2026-09-05)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Az utolsó kulcstár-hiba — a session-status-indicator (vagy bármely felület)
 * ebből mutathatja, hogy a munkamenet NEM perzisztál.
 *
 * MIÉRT nem elég a console.error: a Windows Credential Manager 2560 bájtos
 * plafonja (`TooLong`) miatt a mentés hónapokig NÉMÁN bukott volna — a konzolt
 * a lelkész nem látja, a tünet („minden indításnál újra kell kapcsolni") pedig
 * másra mutat. Az állapot a látható jelzés hordozója; a felületbe kötés külön
 * kör (itt csak az állapot és a lekérdező él).
 */
export type KulcstarHiba = {
  muvelet: 'getItem' | 'setItem' | 'removeItem'
  /** A Supabase-kulcs (az `auth-` prefix nélkül). */
  kulcs: string
  /** A Rust oldal magyar hibaszövege (a Tauri invoke string-gel utasít el). */
  uzenet: string
  /** Date.now() a hiba pillanatában. */
  mikor: number
  /** Hányadik kulcstár-hiba a folyamat indulása óta. */
  darab: number
}

/** Window-esemény, amelyet az ELSŐ kulcstár-hiba egyszer kivált (a felület feliratkozhat rá). */
export const KULCSTAR_HIBA_ESEMENY = 'kartoteka:kulcstar-hiba'

let utolsoKulcstarHiba: KulcstarHiba | null = null
let kulcstarHibaDarab = 0

/** Az utolsó kulcstár-hiba, vagy null, ha a folyamat indulása óta nem volt. */
export function getUtolsoKulcstarHiba(): KulcstarHiba | null {
  return utolsoKulcstarHiba
}

function hibaSzoveg(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function jegyezKulcstarHibat(muvelet: KulcstarHiba['muvelet'], kulcs: string, e: unknown): void {
  kulcstarHibaDarab += 1
  utolsoKulcstarHiba = {
    muvelet,
    kulcs,
    uzenet: hibaSzoveg(e),
    mikor: Date.now(),
    darab: kulcstarHibaDarab,
  }
  // A konzol-üzenet MARAD (fejlesztői nyom) — az állapot a látható jelzés hordozója.
  console.error(`[auth] keyring ${muvelet}('${kulcs}') sikertelen:`, e)
  if (kulcstarHibaDarab === 1 && typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    // Egyszeri jelzés: az első hibánál egy window-esemény, hogy a felület
    // azonnal reagálhasson, ne csak lekérdezéskor.
    window.dispatchEvent(new CustomEvent(KULCSTAR_HIBA_ESEMENY, { detail: utolsoKulcstarHiba }))
  }
}

/**
 * Tauri keyring-alapú storage adapter a Supabase session-höz (M6.6, 2026-04-22;
 * ÉL 2026-09-05 óta — ld. a fejléc történetét).
 *
 * Minden kulcs egy OS-szintű keyring entry (Windows Credential Manager DPAPI,
 * macOS Keychain, Linux Secret Service). A kulcsokra `auth-` prefixet tesz,
 * hogy a Rust oldal engedje (biztonsági korlátozás — a többi slot (SQLCipher,
 * device privkey) nem írható ezen az úton).
 *
 * A Windows 2560 bájtos bejegyzés-plafonja miatt a Rust oldal (auth.rs) az
 * értéket ÁTLÁTSZÓAN darabolja ('<key>.n' fejléc + '<key>.0…' darabok) — az
 * adapter erről nem tud, egy kulcs = egy érték marad.
 *
 * localStorage → keyring mapping:
 *   - getItem('sb-abc-auth-token')   → invoke('auth_read_item', { key: 'auth-sb-abc-auth-token' })
 *   - setItem('sb-abc-auth-token', x) → invoke('auth_store_item', { key: 'auth-...', value: x })
 *   - removeItem(...)                 → invoke('auth_clear_item', { key: 'auth-...' })
 *
 * Hiba esetén az adapter nem dob (a supabase-js egy dobó tárolótól maga is
 * elakadna), de NEM néma: `jegyezKulcstarHibat` → `getUtolsoKulcstarHiba()`.
 */
const tauriKeyringStorage: SupabaseAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await invoke<string | null>('auth_read_item', { key: `auth-${key}` })
      return value ?? null
    } catch (e) {
      jegyezKulcstarHibat('getItem', key, e)
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await invoke('auth_store_item', { key: `auth-${key}`, value })
    } catch (e) {
      jegyezKulcstarHibat('setItem', key, e)
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await invoke('auth_clear_item', { key: `auth-${key}` })
    } catch (e) {
      jegyezKulcstarHibat('removeItem', key, e)
    }
  },
}

// ───────────────────────────────────────────────────────────────────────────
// Örökölt süti takarítása (2026-09-05, D10)
// ───────────────────────────────────────────────────────────────────────────

/** localStorage-jelző: a takarítás lefutott, és utána nem maradt örökölt süti. */
const SUTI_TAKARITAS_JELZO = 'kartoteka-suti-takaritas-v1'

/**
 * Az örökölt @supabase/ssr sütik neve: `sb-<ref>-auth-token`, a darabolt
 * `sb-<ref>-auth-token.0`, `.1`, … és a PKCE-s `sb-<ref>-auth-token-code-verifier`.
 * MIÉRT nem a projekt-ref-re szűr: egy régi/másik projekt-ref sütije ugyanúgy
 * szemét, és a takarításnak env nélkül is futnia kell.
 */
function orokoltSutiNev(nev: string): boolean {
  return nev.startsWith('sb-') && nev.includes('-auth-token')
}

function sutiNevek(): string[] {
  return document.cookie
    .split(';')
    .map((s) => s.trim().split('=')[0] ?? '')
    .filter((n) => n.length > 0)
}

/**
 * Egyszeri örökölt-süti takarítás: a 2026-09-05 előtti asztali munkamenet a
 * WebView2 sütijében élt (400 napos refresh tokennel). A kulcstárra váltás
 * után ez a süti csak szemét — és biztonsági teher — a gépen, ezért a kliens
 * létrehozása ELŐTT töröljük.
 *
 * Idempotens: a localStorage-jelző után nem ír többé; ha a törlés után mégis
 * maradna örökölt süti (pl. más path-tal írták), a jelző NEM áll be, és a
 * következő indításkor újra próbál. Nem dob — a kliens létrehozását nem
 * akaszthatja meg —, de a hibát a konzolra írja.
 */
export function torolOrokoltSutiket(): { torolt: string[]; maradt: string[] } {
  const ures = { torolt: [] as string[], maradt: [] as string[] }
  if (typeof document === 'undefined') return ures
  try {
    if (localStorage.getItem(SUTI_TAKARITAS_JELZO)) return ures
  } catch {
    // localStorage nélkül is fusson — a jelző csak gyorsítás, a törlés idempotens.
  }
  try {
    const torolt = sutiNevek().filter(orokoltSutiNev)
    for (const nev of torolt) {
      // path=/ és domain nélkül — az ssr így írta (DEFAULT_COOKIE_OPTIONS), a
      // törlésnek ugyanoda kell céloznia; lejárat a múltban + max-age=0.
      document.cookie = `${nev}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/`
    }
    const maradt = sutiNevek().filter(orokoltSutiNev)
    if (maradt.length === 0) {
      try {
        localStorage.setItem(SUTI_TAKARITAS_JELZO, new Date().toISOString())
      } catch {
        // jelző nélkül a következő indításkor újra fut — idempotens
      }
    } else {
      console.warn(
        '[auth] örökölt Supabase-süti maradt a törlés után (a következő indításkor újra próbáljuk):',
        maradt,
      )
    }
    if (torolt.length > 0) console.info('[auth] örökölt Supabase-süti törölve (a munkamenet a kulcstárban él):', torolt)
    return { torolt, maradt }
  } catch (e) {
    console.warn('[auth] az örökölt sütik takarítása nem futott le:', e)
    return ures
  }
}

/**
 * A desktop Supabase-kliens singleton.
 * Első híváskor hozza létre a klienst és cache-eli.
 *
 * Az auth session **NEM** localStorage-ba és NEM sütibe kerül, hanem a fenti
 * `tauriKeyringStorage` adapteren keresztül az OS-szintű keyring-be (a Rust
 * oldal darabolásával — ld. auth.rs).
 */
export function getDesktopSupabase(): SupabaseClient {
  if (cached) return cached
  const env = readViteEnv()
  // Az örökölt (2026-09-05 előtti) ssr-süti takarítása a kliens ELŐTT: a friss
  // kliens tiszta tárolóval indul, és a WebView2-profilban nem marad egy
  // 400 napos refresh token. Egyszeri, idempotens.
  torolOrokoltSutiket()
  cached = createKartotekaBrowserClient({
    url: env.url,
    anonKey: env.anonKey,
    authOptions: {
      storage: tauriKeyringStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Desktop — a Tauri webview soha nem kap OAuth redirect-et URL-en át.
      detectSessionInUrl: false,
    },
  })
  return cached
}
