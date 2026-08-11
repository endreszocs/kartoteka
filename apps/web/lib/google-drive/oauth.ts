import 'server-only'

/**
 * GOOGLE OAUTH — a mentés-rendszer Drive-kapcsolata (2026-08-11).
 *
 * NULLA ÚJ FÜGGŐSÉG: nyers `fetch` a Google végpontjaira. A `googleapis`
 * csomag ~50 MB és több száz tranzitív függőség — egyetlen ember által
 * karbantartott rendszerben ez önmagában kockázat.
 *
 * HATÓKÖR: KIZÁRÓLAG `drive.file`.
 * ⛔ SEMMI `drive`, SEMMI `drive.readonly` — azok „restricted" kategóriájúak,
 *    külső CASA-auditot vonnak maguk után, és a tulajdonos MINDEN Drive-fájljához
 *    hozzáférést adnának. A `drive.file` csak azokat a fájlokat látja, amiket
 *    maga az alkalmazás hozott létre. Ennek ÁRA is van, és ezt a felület
 *    kimondja: kézzel létrehozott mappát az alkalmazás NEM lát, és a kézzel
 *    elmozgatott fájl számára egyszerűen eltűnik.
 *
 * A `state` egy 10 perces, az AKTORHOZ kötött `jose` JWT. Enélkül bárki,
 * aki ismeri a callback URL-t, rácsatolhatná a SAJÁT Drive-ját a rendszerre.
 *
 * ⚠️ SOHA NEM NAPLÓZUNK: `code`, `access_token`, `refresh_token`, `id_token`,
 *    `client_secret` — sem az értéküket, sem a hosszukat, sem az előtagjukat.
 */

import { hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

import { loadServerBackupKey } from './keys'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_MAPPA_NEV = 'KARTOTEKA mentesek'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const STATE_ELETTARTAM = '10m'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Fail-closed konfiguráció-betöltés. Hiányzó env → beszédes hiba, ami MEGNEVEZI
 * a hiányzó változót (a változó NEVE nem titok; az ÉRTÉKE az).
 */
export function loadGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ?? ''
  if (!clientId || !clientSecret) {
    throw new Error(
      'A Google Drive kapcsolat nincs konfigurálva: hiányzik a GOOGLE_DRIVE_CLIENT_ID ' +
        'vagy a GOOGLE_DRIVE_CLIENT_SECRET környezeti változó.',
    )
  }
  return { clientId, clientSecret, redirectUri: getRedirectUri() }
}

/**
 * A visszatérési cím. A Google Cloud „Authorized redirect URIs" listájában
 * BETŰRE ugyanennek kell szerepelnie, különben `redirect_uri_mismatch`.
 */
export function getRedirectUri(): string {
  const explicit = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim()
  if (explicit) return explicit
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://kartoteka.app').replace(/\/+$/, '')
  return `${base}/api/auth/google-drive/callback`
}

// ─────────────────────────────────────────────────────────────────────────────
// `state` — CSRF-védelem, az aktorhoz kötve
// ─────────────────────────────────────────────────────────────────────────────

function stateKey(): Uint8Array {
  // ⚠️ A `state` aláírókulcsa HKDF-fel SZÁRMAZTATOTT, NEM maga a szerver-kulcs.
  // Ugyanazt a kulcsanyagot titkosításra ÉS aláírásra használni felesleges
  // kockázat: két különböző célra használt kulcsból a támadó a keresztkapcsolat
  // miatt többet tanulhat, mint bármelyikből külön. Egy sor, és nincs ilyen.
  const master = loadServerBackupKey()
  return new Uint8Array(
    hkdfSync('sha256', master, Buffer.from('kartoteka-oauth-state-v1'), 'kartoteka-oauth-state-v1', 32),
  )
}

export async function issueOAuthState(actorProfileId: string): Promise<string> {
  return new SignJWT({ cel: 'google-drive-osszekotes' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actorProfileId)
    .setIssuedAt()
    .setExpirationTime(STATE_ELETTARTAM)
    .sign(stateKey())
}

/** `null`, ha a state hiányzik, lejárt, hamis, vagy MÁS aktorhoz tartozik. */
export async function verifyOAuthState(
  state: string | null,
  actorProfileId: string,
): Promise<boolean> {
  if (!state) return false
  try {
    const { payload } = await jwtVerify(state, stateKey())
    return payload.sub === actorProfileId && payload.cel === 'google-drive-osszekotes'
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Az engedélyező URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ `access_type=offline` + `prompt=consent` NÉLKÜL a Google NEM ad refresh
 * tokent (második összekötésnél `prompt=consent` nélkül sem). Ez a Drive-
 * integrációk leggyakoribb néma kudarca — ezért a gomb MINDIG így hív.
 */
export function buildAuthorizationUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Token-csere és -frissítés
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenExchangeResult {
  accessToken: string
  refreshToken: string | null
  /** Másodperc. */
  expiresIn: number
  /** A Google által ténylegesen megadott hatókörök — ELLENŐRIZZÜK. */
  scope: string
}

/**
 * A Google hibaválaszának BIZTONSÁGOS összefoglalása.
 * A nyers törzs visszhangozhat kérés-paramétereket — ezért csak a szabványos
 * `error` / `error_description` mezőket engedjük tovább, rövidítve.
 */
async function safeGoogleError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text()
    const parsed = JSON.parse(text) as { error?: string; error_description?: string }
    const code = typeof parsed.error === 'string' ? parsed.error : ''
    const desc = typeof parsed.error_description === 'string' ? parsed.error_description : ''
    const joined = [code, desc].filter(Boolean).join(' — ')
    return joined ? `${fallback} (Google: ${joined.slice(0, 200)})` : `${fallback} (HTTP ${response.status})`
  } catch {
    return `${fallback} (HTTP ${response.status})`
  }
}

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
): Promise<TokenExchangeResult> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(await safeGoogleError(response, 'A Google nem fogadta el az engedélyt'))
  }

  const json = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  if (!json.access_token) {
    throw new Error('A Google válaszából hiányzik a hozzáférési token.')
  }
  if (!json.refresh_token) {
    // Ez a 12. lépés csapdája: `prompt=consent` nélkül a Google másodszorra
    // már nem ad refresh tokent — a mentés egy órán belül némán elhalna.
    throw new Error(
      'A Google nem adott tartós hozzáférést (refresh token). Ez akkor fordul elő, ha a fiók ' +
        'már korábban engedélyezte az alkalmazást. Vond vissza a hozzáférést a Google-fiók ' +
        'biztonsági beállításaiban, majd kösd össze újra.',
    )
  }

  const scope = json.scope ?? ''
  if (!scope.split(/\s+/).includes(DRIVE_SCOPE)) {
    throw new Error(
      'A megadott engedély nem tartalmazza a szükséges Drive-hozzáférést. ' +
        'Az engedélyező képernyőn a jelölőnégyzetet be kell pipálni.',
    )
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600,
    scope,
  }
}

export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    // A `invalid_grant` a 8. lépés csapdája: „Testing" állapotú EXTERNAL
    // alkalmazás refresh tokenje 7 nap után érvénytelen. Ezt KI KELL MONDANI.
    const message = await safeGoogleError(response, 'A Google-kapcsolat megszakadt')
    if (message.includes('invalid_grant')) {
      throw new Error(
        'A Google-kapcsolat lejárt vagy visszavonták. Ha az OAuth-alkalmazás „Testing" ' +
          'állapotban van, a hozzáférés 7 naponta lejár — tedd „In production" állapotba, ' +
          'majd kösd össze újra a Drive-ot.',
      )
    }
    throw new Error(message)
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) {
    throw new Error('A Google válaszából hiányzik a hozzáférési token.')
  }
  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600,
  }
}
