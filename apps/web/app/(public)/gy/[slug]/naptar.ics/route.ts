import { NextResponse, type NextRequest } from 'next/server'

import { buildCalendarIcs, type CalendarFeedProgram } from '@/lib/calendar/ics'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { loadPublicEvProgram } from '@/lib/public-site/tisztsegek-events-loader'

/**
 * A gyülekezet NYILVÁNOS éves programja naptár-fájlként (2026-08-27).
 *
 *   GET /gy/<slug>/naptar.ics?ev=2026  → text/calendar
 *
 * Endre kérése: „le is tölthető a teljes éves program". A nyomtatás mellé ez
 * az, amit a gyülekezeti tag ténylegesen használ: felveszi az alkalmakat a
 * telefonja naptárába.
 *
 * BIZTONSÁG
 * ─────────
 *  · NINCS token és nincs bejelentkezés — de nincs is mit védeni: pontosan
 *    azok az alkalmak kerülnek ki, amiket a gyülekezet a határidőnaplóban
 *    TUDATOSAN nyilvánosnak jelölt, és amiket a weboldal amúgy is mutat.
 *    A kaput a `public_site_events_v2` SECURITY DEFINER RPC tartja (publikált
 *    oldal + aktív gyülekezet + `show_events` + programonkénti `publikus`).
 *  · A BELSŐ `megjegyzes` mező ide sem jut el: a betöltő nem is olvassa, és
 *    a lentebbi leképezés kifejezetten `null`-t ad — így az `includeNotes`
 *    kapcsoló legfeljebb a nyilvánosnak szánt LEÍRÁST engedi ki.
 *  · A fájl tartalma megegyezik azzal, amit az Alkalmaink oldal mutat: az
 *    ünnepnapokat ide sem tesszük bele (`includeHolidays: false`), hogy a
 *    letöltött naptár ne mondjon többet a látott oldalnál.
 *
 * A nem létező / nem publikált gyülekezet 404-et kap — ugyanazt, amit a
 * weboldala is adna.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Az évablak megegyezik az Alkalmaink oldaléval (előző–jelen–következő). */
function biztonsagosEv(nyers: string | null): number {
  const most = new Date().getFullYear()
  if (!nyers) return most
  const ev = Number.parseInt(nyers, 10)
  if (!Number.isInteger(ev)) return most
  return ev >= most - 1 && ev <= most + 1 ? ev : most
}

/** Fájlnév-barát slug (ASCII, ékezet nélkül). */
function fajlnev(slug: string, ev: number): string {
  const tiszta = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'gyulekezet'
  return `${tiszta}-${ev}-program.ics`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) {
    return new NextResponse('Nincs ilyen gyülekezeti oldal.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const ev = biztonsagosEv(request.nextUrl.searchParams.get('ev'))
  const esemenyek = await loadPublicEvProgram(site.slug, ev)

  // A sorozatokat a betöltő MÁR kibontotta (az oldallal azonos alkalmakra),
  // ezért itt `ismetlodes_tipus: null` megy — az ICS-építő nem bontja újra.
  const programok: CalendarFeedProgram[] = esemenyek.map((e, idx) => ({
    id: `${site.slug}-${ev}-${idx}`,
    cim: e.cim,
    leiras: e.leiras,
    datum: e.datum,
    datum_vege: e.datum_vege,
    ido_kezdes: e.ido_kezdes,
    ido_befejezes: e.ido_befejezes,
    helyszin: e.helyszin,
    tipus: e.tipus,
    prioritas: 'normal',
    ismetlodes_tipus: null,
    ismetlodes_vege: null,
    egyedi_tipus_nev: e.egyedi_tipus_nev,
    egyedi_emoji: e.egyedi_emoji,
    // ⚠️ A belső jegyzet SOHA nem hagyja el a rendszert — lásd a fejlécet.
    megjegyzes: null,
    teljesitett: false,
    teljesites_datum: null,
    letrehozta_id: null,
    letrehozta_nev: null,
    congregation_id: null,
    created_at: '',
    updated_at: '',
  }) as unknown as CalendarFeedProgram)

  const ics = buildCalendarIcs({
    congregationName: site.display_name,
    programs: programok,
    fromYear: ev,
    toYear: ev,
    includeHolidays: false,
    includeNotes: true,
    calendarName: `${site.display_name} — ${ev}. évi program`,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fajlnev(site.slug, ev)}"`,
      // A nyilvános tartalom cache-elhető, de rövid ideig: egy új alkalom
      // felvétele után ne kelljen órákat várni.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
