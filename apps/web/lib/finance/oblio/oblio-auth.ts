/**
 * Oblio API autentikáció — token-cache + refresh.
 *
 * Az Oblio REST API Bearer tokent igényel, amelyet az email + api_secret
 * párossal kérünk a `/api/authorize/token` végpontról.
 *
 * A token élettartama kb. 1 óra (az `expires_in` mezőből). A cache-ben
 * tároljuk, és a lejárat előtt 5 perccel automatikusan frissítjük.
 *
 * Server-oldalon fut (server action-ökben).
 */

import 'server-only'
import type { OblioTokenResponse } from './oblio-types'
import { createHash } from 'node:crypto'

import { OblioError, oblioErrorFromStatus, oblioNetworkError } from './oblio-errors'

const OBLIO_API_BASE = 'https://www.oblio.eu'
const TOKEN_URL = `${OBLIO_API_BASE}/api/authorize/token`
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 perc a lejárat előtt

// ─────────────────────────────────────────────────────────────
// In-memory token cache (server-side, per-process)
// ─────────────────────────────────────────────────────────────

interface CachedToken {
  accessToken: string
  expiresAt: number // unix ms
}

const tokenCache = new Map<string, CachedToken>()

/**
 * A cache KULCSA: e-mail + a titok UJJLENYOMATA.
 *
 * ⚠️ 2026-09-03 (átvilágítás P0): a kulcs korábban CSAK az e-mail volt. Ez két
 * módon tudott hazudni:
 *  1. Ha két gyülekezet ugyanazt az Oblio e-mailt használja MÁS titokkal (pl.
 *     ugyanaz a könyvelő szolgálja ki mindkettőt), a második hívás az ELSŐ
 *     gyülekezet ÉLŐ Bearer tokenjével futott — idegen CIF-lista és idegen
 *     kintlévőség szivároghatott át.
 *  2. Titok-cserénél a régi token a lejáratáig érvényben maradt.
 *
 * A titok maga SOSEM kerül a kulcsba (memória-dump / hibaüzenet kockázat) —
 * csak egy rövidített SHA-256 ujjlenyomat, ami a szétválasztáshoz elég.
 */
function titokUjjlenyomat(apiSecret: string): string {
  return createHash('sha256').update(apiSecret, 'utf8').digest('hex').slice(0, 16)
}

function cacheElotag(email: string): string {
  return `oblio:${encodeURIComponent(email)}:`
}

function cacheKey(email: string, apiSecret: string): string {
  return cacheElotag(email) + titokUjjlenyomat(apiSecret)
}

function isTokenValid(cached: CachedToken | undefined): cached is CachedToken {
  if (!cached) return false
  return Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS
}

/**
 * Bearer token lekérése — cache-ből vagy friss token az Oblio-tól.
 *
 * @param email Az Oblio fiók emailje
 * @param apiSecret A visszafejtett API secret (plain text)
 * @returns A Bearer token string
 * @throws {OblioError} Ha a hitelesítés sikertelen
 */
export async function getOblioToken(
  email: string,
  apiSecret: string,
): Promise<string> {
  const key = cacheKey(email, apiSecret)
  const cached = tokenCache.get(key)

  if (isTokenValid(cached)) {
    return cached.accessToken
  }

  // Friss token igénylése
  let resp: Response
  try {
    resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: email,
        client_secret: apiSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw oblioNetworkError(err)
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw oblioErrorFromStatus(resp.status, body)
  }

  let json: OblioTokenResponse
  try {
    json = (await resp.json()) as OblioTokenResponse
  } catch {
    throw new OblioError('UNKNOWN', 'Az Oblio válasz nem JSON formátumú.')
  }

  if (!json.access_token) {
    throw new OblioError('AUTH_FAILED', 'Az Oblio nem adott vissza tokent.')
  }

  const expiresInMs = (json.expires_in || 3600) * 1000
  tokenCache.set(key, {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresInMs,
  })

  return json.access_token
}

/**
 * Token cache törlése (pl. ha a user új API secret-et ad meg, vagy 401 jött).
 *
 * Az e-mailhez tartozó ÖSSZES bejegyzést törli — a hívó csak az e-mailt ismeri,
 * és titok-cserénél épp az a cél, hogy a RÉGI titokhoz tartozó token se éljen
 * tovább. (A kulcs a titok ujjlenyomatát is tartalmazza, ezért előtag szerint
 * kell takarítani, nem egyetlen kulcsra.)
 */
export function clearTokenCache(email: string): void {
  const elotag = cacheElotag(email)
  for (const k of [...tokenCache.keys()]) {
    if (k.startsWith(elotag)) tokenCache.delete(k)
  }
}

/**
 * Az Oblio API alap URL-je.
 */
export const OBLIO_BASE_URL = OBLIO_API_BASE
