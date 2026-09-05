import { NextResponse, type NextRequest } from 'next/server'

import { createPublicServerClient } from '@/lib/supabase/public-server'
import { buildCalendarIcs } from '@/lib/calendar/ics'
import type { Program } from '@/lib/constants/dashboard'

/**
 * Nyilvános gyülekezeti naptár-feed (ICS) — 2026-08-02 (PR-20).
 *
 * GET /api/calendar/<token>            → text/calendar (programok + ünnepek)
 * GET /api/calendar/<token>?unnepek=0  → csak a programok
 *
 * A tokent a congregations.calendar_feed_token adja (kitalálhatatlan uuid);
 * az adatokat az anon-kulcsos kliens a public_calendar_feed SECURITY DEFINER
 * RPC-n át kapja (2026-08-02-pr20-naptar-feed.sql) — bázistábla-olvasás nincs.
 * A Google Naptár „URL alapján" felvéve előfizetésként kezeli és pár óránként
 * automatikusan frissíti.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface FeedPayload {
  status?: string
  congregation_name?: string
  /** 2026-08-26 (5. kör): a gyülekezet kérte-e a megjegyzéses (teljes) feedet.
   *  Régi RPC-válaszban hiányzik → alapértelmezés: NEM (biztonságos irány). */
  reszletes?: boolean
  programs?: Program[]
}

/**
 * A HIBA-ágak fejléce (2026-09-05).
 *
 * A siker-ág szándékosan CDN-cache-elhető (`s-maxage=3600`), a hibák viszont
 * NEM: a 2026-09-05-naptar-feed-kapuk.sql óta a `status='active'` kapu ÚJ
 * 404-eket termelhet (inaktívvá vált gyülekezet), és egy közbeeső CDN órákig
 * kiszolgálná a 404-et azután is, hogy a gyülekezet visszakerült aktívba.
 * A lelkészi feed (`lelkeszi/[token]/route.ts`) már így csinálja minden ágon.
 */
const HIBA_FEJLEC = { 'Cache-Control': 'no-store' } as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { error: 'Érvénytelen naptár-hivatkozás.' },
      { status: 400, headers: HIBA_FEJLEC },
    )
  }

  const supabase = createPublicServerClient()
  const { data, error } = await supabase.rpc('public_calendar_feed', { p_token: token })
  if (error) {
    console.error('[api/calendar] feed RPC hiba:', error.message)
    return NextResponse.json(
      { error: 'A naptár most nem érhető el. (Lefutott már a 2026-08-02-es naptár-feed adatbázis-migráció?)' },
      { status: 503, headers: HIBA_FEJLEC },
    )
  }

  const payload = data as FeedPayload | null
  if (!payload || payload.status !== 'ok') {
    return NextResponse.json(
      { error: 'Ismeretlen naptár-hivatkozás.' },
      { status: 404, headers: HIBA_FEJLEC },
    )
  }

  const includeHolidays = request.nextUrl.searchParams.get('unnepek') !== '0'
  const currentYear = new Date().getFullYear()
  const ics = buildCalendarIcs({
    congregationName: payload.congregation_name || 'Gyülekezet',
    programs: (payload.programs || []) as Program[],
    fromYear: currentYear - 1,
    toYear: currentYear + 1,
    includeHolidays,
    // 2026-08-26 (5. kör): a leírás/megjegyzés csak a gyülekezet kifejezett
    // opt-injével megy ki — a token külső naptár-szolgáltatóra szinkronizál.
    includeNotes: payload.reszletes === true,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="gyulekezeti-naptar.ics"',
      // A naptár-szolgáltatók amúgy is ritkán kérdeznek — 1 óra CDN-cache elég
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      'X-Robots-Tag': 'noindex',
    },
  })
}
