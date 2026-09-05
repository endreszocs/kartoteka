import { NextResponse, type NextRequest } from 'next/server'

import { DESKTOP_KAPCSOLAS_SUTI, DESKTOP_KAPCSOLAS_SUTI_MP } from '@/lib/desktop-kapcsolas/szerver'
import { getPublicOrigin } from '@/lib/utils/public-origin'
import { KAPCSOLAS_ID_MINTA } from '@kartoteka/supabase-client'

/**
 * ASZTALI ESZKÖZ-KAPCSOLÁS — 2. lépés: ezt a címet nyitja meg az asztali app
 * a rendszer-böngészőben (2026-09-05).
 *
 * GET /api/desktop-kapcsolas/nyit?id=<kérés-azonosító>
 *
 * A kérés-azonosító NEM titok. Sütibe tesszük (httpOnly, 15 perc), és a
 * jóváhagyó oldalra irányítunk. A süti azért kell, mert a bejelentkezés
 * (jelszó VAGY Google) után a rendszer a kezdőlapra visz — a süti alapján ott
 * egy sáv emlékeztet: „az asztali alkalmazás jóváhagyásra vár", és onnan a
 * lelkész visszajut ide. A jóváhagyás/elutasítás törli a sütit.
 *
 * ⚠️ AZ ÁTIRÁNYÍTÁS CÉLJA A KIFELÉ LÁTHATÓ ORIGÓBÓL ÉPÜL (`getPublicOrigin`),
 * NEM a `request.nextUrl.origin`-ből: Railway mögött az utóbbi a BELSŐ
 * `localhost:8080`, és a lelkész rendszer-böngészője oda menne — a jóváhagyó
 * oldal soha nem nyílna meg. Ez az asztali kapcsolás EGYETLEN böngésző-
 * belépési pontja; a hibaosztály dokumentálva: lib/utils/public-origin.ts.
 * Őrszem: scripts/selftest-desktop-kapcsolas.mjs N1/N1n.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const cel = new URL('/desktop-kapcsolas', getPublicOrigin(request))
  if (!KAPCSOLAS_ID_MINTA.test(id)) {
    cel.searchParams.set('hiba', 'azonosito')
    return NextResponse.redirect(cel)
  }
  const valasz = NextResponse.redirect(cel)
  valasz.cookies.set(DESKTOP_KAPCSOLAS_SUTI, id.toLowerCase(), {
    httpOnly: true,
    sameSite: 'lax',
    // Ugyanabból a forrásból, mint a cél: élesben https → secure süti.
    secure: cel.protocol === 'https:',
    path: '/',
    maxAge: DESKTOP_KAPCSOLAS_SUTI_MP,
  })
  valasz.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return valasz
}
