/**
 * Gyülekezeti ALDOMAIN feloldás (2026-08-27).
 *
 * Endre kérése: „Ha lehet, akkor legyen ennek külön domainja, pl.
 * baratosi-reformatus-egyhazkozseg.kartoteka.app".
 *
 * MIT CSINÁL
 * ──────────
 * A kérés gazdagépnevéből kiolvassa a gyülekezet slugját, és a `proxy.ts`
 * ez alapján a MÁR MEGLÉVŐ `/gy/<slug>/...` útvonalra ír át. Egyetlen
 * tartalom, két cím — nincs külön build, nincs másolt oldal.
 *
 * ⚠️ EZ CSAK A FÉL MUNKA: a DNS és a tanúsítvány NEM a kódban él.
 * A `*.kartoteka.app` wildcard rekordot és a Railway wildcard egyéni domainjét
 * kézzel kell felvenni (a részletes lépések:
 * docs/GYULEKEZETI-ALDOMAIN-BEALLITAS.md). Amíg az nincs meg, ez a modul
 * ártalmatlan: minden kérés a szokásos módon, a `/gy/<slug>` úton érkezik.
 *
 * BIZTONSÁG
 * ─────────
 *  · A slug ugyanazt a szigorú mintát követi, amit a betöltő vár — semmilyen
 *    más gazdagépnév nem tud útvonalat befolyásolni.
 *  · FENNTARTOTT ALDOMAINEK: a `www`, `mail`, `api` stb. SOHA nem gyülekezet.
 *    Enélkül egy jövőbeli `mail.kartoteka.app` némán a gyülekezeti oldalra
 *    esne — és a wildcard DNS pont akkor lép életbe, ha nincs explicit rekord.
 *  · Több szintű aldomain (`a.b.kartoteka.app`) NEM gyülekezet: a wildcard
 *    tanúsítvány sem fedi (nem ágyazható), tehát az ilyen kérés hibás.
 *  · A gyülekezeti aldomainen az app BELSŐ útvonalai (bejelentkezés,
 *    vezérlőpult) elérhetetlenek: minden út a `/gy/<slug>` alá íródik át, ami
 *    ott 404. Így egy gyülekezeti címen SOHA nem lehet bejelentkezni — az
 *    munkamenet-sütik felülete nem sokszorozódik meg a hosztok számával.
 */

/** A publikus oldal slug-mintája — AZONOS a site-loader ellenőrzésével. */
const SLUG_MINTA = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/

/**
 * Ezek a címkék sosem gyülekezetek. A `_acme-challenge` külön fontos: a
 * tanúsítvány-kibocsátás azon keresztül megy.
 */
const FENNTARTOTT = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'smtp', 'imap', 'pop', 'webmail',
  'ftp', 'cdn', 'static', 'assets', 'img', 'media', 'files',
  'dev', 'test', 'staging', 'preview', 'demo', 'beta',
  'status', 'docs', 'blog', 'shop', 'auth', 'login', 'id',
  '_acme-challenge', 'autodiscover', 'autoconfig', 'ns', 'ns1', 'ns2', 'mx',
])

/** Ezeket az útvonalakat NEM írjuk át (keretrendszer-belső / statikus). */
const ATIRAS_ALOL_KIVETT = ['/_next', '/__nextjs', '/favicon.ico', '/manifest.json', '/sw.js', '/robots.txt', '/sitemap.xml']

/** Az aldomainek alap-gazdagépe (pl. `kartoteka.app`). */
export function aldomainBazis(env: Record<string, string | undefined> = process.env): string | null {
  const nyers =
    env.GYULEKEZETI_ALDOMAIN_BAZIS?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://kartoteka.app'

  const hosztAlak = nyers.includes('://') ? nyers : `https://${nyers}`
  try {
    const host = new URL(hosztAlak).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

/** A gazdagépnévből leszedi a portot és kisbetűsíti. */
export function tisztitHoszt(host: string | null | undefined): string {
  if (!host) return ''
  // IPv6 („[::1]:3000") esetén a záró szögletes zárójel utáni port marad csak.
  const utolsoKettospont = host.lastIndexOf(':')
  const zaroSzogletes = host.lastIndexOf(']')
  const portNelkul =
    utolsoKettospont > zaroSzogletes && utolsoKettospont > -1
      ? host.slice(0, utolsoKettospont)
      : host
  return portNelkul.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * A gazdagépnév → gyülekezeti slug, vagy `null`, ha ez nem gyülekezeti
 * aldomain (az alap-domain maga, a `www`, egy fenntartott címke, egy több
 * szintű aldomain vagy egy idegen hoszt).
 */
export function aldomainSlug(
  host: string | null | undefined,
  bazis: string | null = aldomainBazis(),
): string | null {
  const tiszta = tisztitHoszt(host)
  if (!tiszta || !bazis) return null
  if (tiszta === bazis) return null
  if (!tiszta.endsWith(`.${bazis}`)) return null

  const elotag = tiszta.slice(0, -(bazis.length + 1))
  if (!elotag || elotag.includes('.')) return null // több szintű: nem gyülekezet
  if (FENNTARTOTT.has(elotag)) return null
  if (!SLUG_MINTA.test(elotag)) return null

  return elotag
}

/**
 * A gyülekezeti aldomainen kért útvonal → a valódi, belső útvonal.
 * `null`, ha nem kell átírni (keretrendszer-belső fájl, vagy már `/gy/…`).
 */
export function aldomainUtvonal(slug: string, pathname: string): string | null {
  if (ATIRAS_ALOL_KIVETT.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null
  // Már a kanonikus úton van (pl. belső hivatkozás a fejlécből) — hagyjuk.
  if (pathname === '/gy' || pathname.startsWith('/gy/')) return null

  const vege = pathname === '/' ? '' : pathname
  return `/gy/${slug}${vege}`
}
