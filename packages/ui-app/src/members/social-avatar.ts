/**
 * Közösségi profil-link → avatar-kép feloldás (2026-06-11, Endre kérése).
 *
 * KUTATÁSI EREDMÉNY (gyakorlati tesztekkel igazolva, 2026-06-11):
 *   - A Facebook Graph `https://graph.facebook.com/{NUMERIKUS_ID}/picture`
 *     végpont token NÉLKÜL működik (302 → kép), és a `?redirect=false` JSON
 *     `is_silhouette` flagje megmondja, valódi kép jött-e. USERNAME-mel NEM
 *     megy (2018 óta csak numerikus ID).
 *   - Az Instagram/Facebook HTML `og:image` scrape login-falba ütközik
 *     (datacenter ÉS lakossági IP-ről is bizonytalan) — best-effort próba.
 *   - Aggregátorok (unavatar.io): 25 kérés/nap/IP + 403 bot-szűrés → élesre
 *     alkalmatlan.
 *   - A közösségi CDN-képek (fbcdn/cdninstagram) ALÁÍRT, LEJÁRÓ URL-ek —
 *     hotlinkelni TILOS: a képet le kell tölteni és saját Storage-ba menteni.
 *
 * KÖVETKEZMÉNY (a UI-nak): a link-alapú letöltés kényelmi funkció, ami
 * `facebook.com/profile.php?id=…` linkeknél megbízható, másnál best-effort;
 * a KÉZI képfeltöltés mindig elérhető út.
 */

export type SocialProvider = 'facebook-id' | 'facebook-username' | 'instagram' | 'unknown'

export interface ParsedSocialUrl {
  provider: SocialProvider
  /** Numerikus FB-ID (facebook-id) vagy felhasználónév (a többi). */
  identifier: string | null
  /** Normalizált, tárolható profil-URL. */
  normalizedUrl: string
}

/**
 * Profil-link értelmezése. Elfogadott formák:
 *   - facebook.com/profile.php?id=100012345678  → facebook-id (MEGBÍZHATÓ út)
 *   - facebook.com/john.doe.9 · fb.com/... · m.facebook.com/...
 *   - instagram.com/username · instagr.am/username
 */
export function parseSocialProfileUrl(raw: string): ParsedSocialUrl {
  const trimmed = (raw || '').trim()
  const fallback: ParsedSocialUrl = { provider: 'unknown', identifier: null, normalizedUrl: trimmed }
  if (!trimmed) return fallback

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return fallback
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^web\./, '')

  if (host === 'facebook.com' || host === 'fb.com' || host === 'fb.me') {
    // profile.php?id=NUMERIKUS — az egyetlen token nélkül is biztos út
    const idParam = url.searchParams.get('id')
    if (url.pathname.replace(/\/+$/, '') === '/profile.php' && idParam && /^\d{5,}$/.test(idParam)) {
      return {
        provider: 'facebook-id',
        identifier: idParam,
        normalizedUrl: `https://www.facebook.com/profile.php?id=${idParam}`,
      }
    }
    const seg = url.pathname.split('/').filter(Boolean)[0] ?? ''
    if (seg && !['profile.php', 'people', 'groups', 'pages'].includes(seg)) {
      return {
        provider: 'facebook-username',
        identifier: seg,
        normalizedUrl: `https://www.facebook.com/${seg}`,
      }
    }
    return { ...fallback, normalizedUrl: url.toString() }
  }

  if (host === 'instagram.com' || host === 'instagr.am') {
    const seg = url.pathname.split('/').filter(Boolean)[0] ?? ''
    if (seg && !['p', 'reel', 'reels', 'stories', 'explore'].includes(seg)) {
      return {
        provider: 'instagram',
        identifier: seg,
        normalizedUrl: `https://www.instagram.com/${seg}/`,
      }
    }
    return { ...fallback, normalizedUrl: url.toString() }
  }

  return { ...fallback, normalizedUrl: url.toString() }
}

/** A Graph picture JSON-végpont (is_silhouette ellenőrzéshez). */
export function graphPictureJsonUrl(numericId: string): string {
  return `https://graph.facebook.com/${numericId}/picture?type=large&width=512&height=512&redirect=false`
}

/** A Graph picture kép-végpont (302 → fbcdn kép-bytes). */
export function graphPictureUrl(numericId: string): string {
  return `https://graph.facebook.com/${numericId}/picture?type=large&width=512&height=512`
}

/** og:image kinyerése egy letöltött HTML-ből (best-effort scrape-hez). */
export function extractOgImage(html: string): string | null {
  const m =
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i.exec(html)
  if (!m) return null
  // HTML-entitások a query-ben (&amp;)
  return m[1].replace(/&amp;/g, '&')
}

/** A Graph JSON válasz értelmezése: valódi kép URL-je vagy null (sziluett/hiba). */
export function realPictureUrlFromGraphJson(json: unknown): string | null {
  const data = (json as { data?: { url?: string; is_silhouette?: boolean } })?.data
  if (!data?.url) return null
  if (data.is_silhouette) return null
  return data.url
}

/** Storage-útvonal egy személy avatarjához (felülírható, stabil név). */
export function avatarStoragePath(congregationId: string, szemelyId: number): string {
  return `${congregationId}/szemely-${szemelyId}.jpg`
}
