import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 "Proxy" konvenció — a korábbi middleware.ts helyettese (M6.5, 2026-04-21).
// A függvénynév MUST be "proxy" (vagy default export), a matcher viselkedés változatlan.
// A `@/lib/supabase/middleware` hivatkozás saját helper-modul, NEM file-convention —
// annak neve szándékosan nem változott, hogy a Supabase SSR session-kezelő
// logikáját (updateSession) ne érintse ez az átnevezés.
export async function proxy(request: NextRequest) {
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
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|workbox-.*\\.js|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt|js|css|woff|woff2|ttf|otf|eot|map)$).*)',
  ],
}
