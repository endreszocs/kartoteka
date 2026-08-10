import { NextResponse, type NextRequest } from 'next/server'

import { buildCalendarIcs } from '@/lib/calendar/ics'
import { buildPastoralEvents, type PastoralFeedPayload } from '@/lib/calendar/pastoral-events'
import { isMissingRpcError } from '@/lib/profiles/officials'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

/**
 * LELKÉSZI (PRIVÁT) naptár-feed — 2026-08-11.
 *
 * GET /api/calendar/lelkeszi/<token>  → text/calendar
 *   ?szul=0        — születésnapok nélkül
 *   ?nevnap=0      — névnapok nélkül
 *   ?hazassag=0    — házassági évfordulók nélkül
 *   ?konfirmacio=0 — konfirmációi évfordulók nélkül
 *   ?konfirmacio=mind — MINDEN konfirmációi évforduló (alap: csak a kerek, 5-tel oszthatók)
 *   ?unnepek=1     — a református ünnepek is (alap: NEM, mert a gyülekezeti
 *                    feed már tartalmazza őket — kétszer felvéve duplán látszanának)
 *
 * BIZTONSÁG
 * ─────────
 *  · A token a `lelkeszi_naptar_token` táblából jön (uuid v4, ~122 bit entrópia),
 *    és SEMMILYEN kapcsolatban nincs a nyilvános `calendar_feed_token`-nel.
 *  · A hatókört (melyik gyülekezet) a `lelkeszi_naptar_feed` SECURITY DEFINER
 *    RPC oldja fel a token TULAJDONOSÁBÓL, kérésenként. A kliens semmit nem
 *    mondhat meg róla. Ha a hatókör nincs meg vagy nem egyértelmű → fail-closed
 *    (409), nem üres, de „működőnek látszó" naptár.
 *  · Az RPC-t csak a `service_role` hívhatja, ezért itt (kivételesen) az
 *    admin-kliens megy — az `anon` PostgREST-felületén ez a függvény nem létezik.
 *  · `Cache-Control: private, no-store` — a nyilvános feed 1 órás CDN-cache-t
 *    kap, EZ NEM KAPHAT: a visszavonásnak AZONNAL hatályba kell lépnie, egy
 *    gyorsítótárazott válasz viszont a törlés után is kiszolgálná a névsort.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Minden válasz gyorsítótár-mentes — a visszavonás azonnal hasson. */
const NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!UUID_RE.test(token)) {
    return errorJson('Érvénytelen naptár-hivatkozás.', 400)
  }

  let supabase
  try {
    supabase = getSupabaseAdminClient()
  } catch (error: unknown) {
    console.error(
      '[api/calendar/lelkeszi] admin-kliens hiba:',
      error instanceof Error ? error.message : 'ismeretlen',
    )
    return errorJson('A lelkészi naptár most nem érhető el (szerver-beállítás hiányzik).', 503)
  }

  const { data, error } = await supabase.rpc('lelkeszi_naptar_feed', { p_token: token })
  if (error) {
    if (isMissingRpcError(error, 'lelkeszi_naptar_feed')) {
      return errorJson(
        'A lelkészi naptár még nincs bekapcsolva az adatbázisban. ' +
          'Futtasd le a migration-docs/sql/2026-08-11-lelkeszi-naptar-token.sql fájlt.',
        503,
      )
    }
    console.error('[api/calendar/lelkeszi] feed RPC hiba:', error.message)
    return errorJson('A lelkészi naptár most nem érhető el. Próbáld később.', 503)
  }

  const payload = data as PastoralFeedPayload | null
  const status = payload?.status
  if (status === 'no_scope') {
    return errorJson(
      'Ehhez a naptár-hivatkozáshoz nem tartozik gyülekezet. Kérd meg a rendszergazdát, ' +
        'hogy rendelje hozzá a profilodat egy gyülekezethez, majd hozz létre új hivatkozást.',
      409,
    )
  }
  if (status === 'ambiguous_scope') {
    return errorJson(
      'Több gyülekezethez is van jóváhagyott szerepköröd, ezért a lelkészi naptár nem tudja ' +
        'eldönteni, melyik gyülekezet évfordulóit mutassa. Biztonságból nem szolgálunk ki adatot.',
      409,
    )
  }
  if (!payload || status !== 'ok') {
    // Ismeretlen VAGY visszavont token — szándékosan ugyanaz a válasz, hogy a
    // két eset ne legyen megkülönböztethető kívülről.
    return errorJson('Ismeretlen vagy visszavont naptár-hivatkozás.', 404)
  }

  const q = request.nextUrl.searchParams
  const currentYear = new Date().getFullYear()
  const konfirmacioParam = (q.get('konfirmacio') || '').toLowerCase()

  const events = buildPastoralEvents(payload, {
    fromYear: currentYear - 1,
    toYear: currentYear + 1,
    includeBirthdays: q.get('szul') !== '0',
    includeNamedays: q.get('nevnap') !== '0',
    includeWeddings: q.get('hazassag') !== '0',
    confirmations:
      konfirmacioParam === '0' ? 'nem' : konfirmacioParam === 'mind' ? 'mind' : 'kerek',
  })

  const congregationName = payload.congregation_name || 'Gyülekezet'
  const ics = buildCalendarIcs({
    congregationName,
    calendarName: `${congregationName} — lelkészi naptár`,
    programs: [],
    fromYear: currentYear - 1,
    toYear: currentYear + 1,
    includeHolidays: q.get('unnepek') === '1',
    events,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lelkeszi-naptar.ics"',
      ...NO_STORE,
    },
  })
}
