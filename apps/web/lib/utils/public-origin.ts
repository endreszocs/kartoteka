/**
 * A KIFELÉ LÁTHATÓ origó (séma + gazdagép) — EGYETLEN közös helyen (2026-09-05).
 *
 * 2026-04-28 KRITIKUS FIX (az auth/callback útvonalból ide emelve): Railway
 * proxy mögött a Next.js Node-szerver belső címe `localhost:8080`. A route-
 * handler `request.url`-je és `request.nextUrl.origin`-je EBBŐL épül
 * (next-server.js `attachRequestMeta`: `${protocol}://${fetchHostname}:${port}…`),
 * ezért egy `new URL('/valami', request.nextUrl.origin)` alakú átirányítás a
 * böngészőt `https://localhost:8080/valami`-ra küldi — ami a lelkész gépén
 * „nem érhető el". Ez okozta az „OAuth Google flow → localhost:8080" hibát
 * (Endre 1+ napig a Supabase Dashboardban kereste, pedig a saját callback-
 * route-ban volt), és 2026-09-05-én UGYANEZ a hibaosztály bukkant fel az
 * asztali eszköz-kapcsolás `nyit` útvonalán. LOKÁLISAN NEM REPRODUKÁLHATÓ
 * (fejlesztői gépen az origó helyes) — ezért őrzi selftest
 * (scripts/selftest-desktop-kapcsolas.mjs O1–O4 + N1).
 *
 * PRIORITÁS:
 *   1. NEXT_PUBLIC_APP_URL (Railway env-változó)
 *   2. X-Forwarded-Host + X-Forwarded-Proto (proxy-szabvány; láncolt proxyknál
 *      csak az ELSŐ tag számít)
 *   3. Host fejléc — proxy nélkül (fejlesztés) a séma a kérés URL-jéből jön,
 *      mert ilyenkor az a valódi
 *   4. a kérés URL-jének origója (csak lokális fejlesztésben helyes)
 *
 * ⚠️ MIÉRT NEM az `app/(public)/gy/[slug]/tagi-portal/public-origin.ts`
 * `resolvePublicAppOrigin`-je az egyetlen segéd: az az E-MAILBE kerülő linket
 * építi, és élesben env nélkül SZÁNDÉKOSAN `null`-t ad (host-header-poisoning:
 * idegen link kerülhetne a megerősítő levélbe). Ez a segéd UGYANANNAK a
 * kérésnek a válaszát irányítja át — a fejlécet a böngésző nem hamisíthatja
 * a saját kárára, a fail-closed pedig itt „nem működő bejelentkezést"
 * jelentene. Két szerződés, két segéd — szándékosan, dokumentálva.
 *
 * Hivatkozás: https://github.com/supabase/supabase/issues/27614
 */
export function getPublicOrigin(request: Pick<Request, 'headers' | 'url'>): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envOrigin) {
    try {
      return new URL(envOrigin).origin
    } catch {
      // érvénytelen env-érték → tovább a fejlécekre
    }
  }

  const forwardedProto = elsoTag(request.headers.get('x-forwarded-proto'))
  const forwardedHost = elsoTag(request.headers.get('x-forwarded-host'))
  if (forwardedHost) {
    // Proxy mögött vagyunk: a séma alapból https (a Railway/Cloudflare mindig
    // https-en szolgál ki, a proto-fejléc hiánya nem jelent http-t).
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }

  const host = elsoTag(request.headers.get('host'))
  if (host) {
    // Nincs proxy-fejléc → a kérés URL-jének sémája a valódi (dev: http).
    return `${forwardedProto || keresSema(request.url)}://${host}`
  }

  return new URL(request.url).origin
}

/** Láncolt proxyk vesszővel fűzik a fejlécet („a, b") — az első az eredeti. */
function elsoTag(ertek: string | null): string {
  return (ertek ?? '').split(',')[0]?.trim() ?? ''
}

function keresSema(url: string): string {
  try {
    const sema = new URL(url).protocol.replace(/:$/, '')
    return sema === 'http' || sema === 'https' ? sema : 'https'
  } catch {
    return 'https'
  }
}
