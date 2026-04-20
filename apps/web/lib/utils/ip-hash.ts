/**
 * IP-hash utility — GDPR-kompatibilis rate-limit spam-védelemhez.
 *
 * Az IP-t NEM tároljuk el közvetlenül, csak SHA-256 hash-ét. A hash reverzibilis
 * volna brute-force-olással (csak ~4.3 milliárd IPv4 kombináció), ezért **sót**
 * is hozzáadunk, ami az env var-ból jön.
 *
 * Használat: publikus űrlapok spam-védelmeként (access-request, feedback, stb.)
 */

import { createHash } from 'node:crypto'

/**
 * Visszaadja a request-ből az IP-címet. A Railway / Cloudflare / Vercel
 * különböző headerekkel jelzi. Fallback: 'unknown'.
 */
export function getClientIp(headers: Headers): string | null {
  // Cloudflare
  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  // Railway / standard proxy
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    // Az első IP az eredeti klienszé (utána a proxy-k IP-jei)
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }

  // Direct connect (dev)
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return null
}

/**
 * SHA-256 hash az IP-címről, só hozzáadásával.
 *
 * A só a `IP_HASH_SALT` env var-ból jön. Ha nincs, egy fix fallback-ot használ
 * (dev-módban OK, production-ben MINDENKÉPP be kell állítani).
 *
 * Visszaadja a hex-string hash-t (64 karakter) vagy null, ha nincs IP.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const salt = process.env.IP_HASH_SALT || 'kartoteka-dev-salt-please-set-env'
  const hash = createHash('sha256')
  hash.update(salt)
  hash.update(ip)
  return hash.digest('hex')
}

/**
 * Kombinált helper: headers → IP → hash.
 */
export function hashClientIp(headers: Headers): string | null {
  const ip = getClientIp(headers)
  return hashIp(ip)
}
