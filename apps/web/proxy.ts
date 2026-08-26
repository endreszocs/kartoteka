import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { aldomainSlug, aldomainUtvonal } from '@/lib/public-site/aldomain'

// Next.js 16 "Proxy" konvenció — a korábbi middleware.ts helyettese (M6.5, 2026-04-21).
// A függvénynév MUST be "proxy" (vagy default export), a matcher viselkedés változatlan.
// A `@/lib/supabase/middleware` hivatkozás saját helper-modul, NEM file-convention —
// annak neve szándékosan nem változott, hogy a Supabase SSR session-kezelő
// logikáját (updateSession) ne érintse ez az átnevezés.
export async function proxy(request: NextRequest) {
  // ── Gyülekezeti aldomain (2026-08-27) ────────────────────────────────────
  // Endre kérése: „legyen ennek külön domainja, pl.
  // baratosi-reformatus-egyhazkozseg.kartoteka.app".
  //
  // A `<slug>.kartoteka.app` kérés a MÁR MEGLÉVŐ `/gy/<slug>/…` útvonalra
  // íródik át. Ez ÁTÍRÁS, nem átirányítás: a látogató végig a gyülekezet
  // saját címén marad.
  //
  // ⚠️ MIÉRT ITT, ÉS MIÉRT AZONNAL VISSZATÉRVE: a `/gy/…` útvonal publikus,
  // az `updateSession` amúgy is átengedi (isPublicCongregationRoute) — csak
  // épp az EREDETI, átírás előtti útvonalat (`/`) látná, amit viszont
  // bejelentkezést igénylőnek hinne, és a látogatót a `/login`-ra dobná.
  // Ezért a gyülekezeti aldomainen a munkamenet-kezelő ki is marad; és mivel
  // MINDEN út a `/gy/<slug>` alá kerül, az app belső felületei (bejelentkezés,
  // vezérlőpult) ezen a címen elérhetetlenek — szándékosan.
  // A gazdagépnév a fordított proxy mögött az `x-forwarded-host`-ban jön
  // (Railway); enélkül a sima `host`. A `nextUrl.host` a végső tartalék.
  const slug = aldomainSlug(
    request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      request.nextUrl.host,
  )
  if (slug) {
    const celUtvonal = aldomainUtvonal(slug, request.nextUrl.pathname)
    if (celUtvonal) {
      const cel = request.nextUrl.clone()
      cel.pathname = celUtvonal
      return NextResponse.rewrite(cel)
    }
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    // Minden útvonal KIVÉVE:
    //   - Next.js belső asset-ek: _next/static, _next/image
    //   - Favicon: favicon.ico
    //   - PWA fájlok: manifest.json, sw.js, workbox-*.js, robots.txt, sitemap.xml
    //   - Minden fájl-kiterjesztéssel végződő URL (képek, JSON, XML, TXT, JS, CSS, fontok)
    //
    // FONTOS: a manifest.json és a statikus assetek kizárása megakadályozza,
    // hogy a Supabase updateSession proxy HTML-t adjon vissza JSON helyett
    // (auth redirect esetén), ami „Manifest: Line: 1, column: 1, Syntax error"
    // hibát okozna a böngészőben.
    //
    // 2026-08-25 — `nincs-internet.html`: UGYANEZ A CSAPDA, csak rosszabb
    // véggel. Ez az offline tartalék lap (app/sw.ts `fallbacks`), amit a
    // service worker a TELEPÍTÉSEKOR tölt le a precache-be. A telepítés
    // tipikusan a bejelentkezés ELŐTT fut le, tehát user nélkül: a
    // `updateSession` ilyenkor a `/login`-ra irányítana, és a lemezre a
    // BEJELENTKEZŐ OLDAL kerülne offline tartaléknak — némán, hibaüzenet
    // nélkül. A lap szándékosan bejelentkezés nélkül is kiszolgálható:
    // adatmentes, statikus, semmilyen tárolót nem olvas.
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|nincs-internet\\.html|sw\\.js|workbox-.*\\.js|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt|js|css|woff|woff2|ttf|otf|eot|map)$).*)',
  ],
}
