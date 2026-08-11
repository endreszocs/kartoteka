import { NextResponse, type NextRequest } from 'next/server'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { buildAuthorizationUrl, issueOAuthState, loadGoogleOAuthConfig } from '@/lib/google-drive/oauth'
import { hasServerBackupKey } from '@/lib/google-drive/keys'

/**
 * GOOGLE DRIVE ÖSSZEKÖTÉS — 1. lépés: átirányítás a Google engedélyező oldalára
 * (2026-08-11).
 *
 * GET /api/auth/google-drive/start
 *
 * ⚠️ CSAK a FŐ RENDSZERGAZDA (master) indíthatja. A Drive-fiók a tulajdonosé,
 * és az összekötés a MENTÉSEK CÉLHELYÉT dönti el — ha ezt bárki más átállíthatná,
 * az egész rendszer adatai egy idegen felhőbe kerülnének.
 *
 * A `state` egy 10 perces, AZ AKTORHOZ kötött JWT. Enélkül bárki, aki ismeri a
 * callback címet, rácsatolhatná a saját Drive-ját a rendszerre.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hibaraIranyit(request: NextRequest, kod: string): NextResponse {
  const url = new URL('/admin/biztonsagi-mentes', request.nextUrl.origin)
  url.searchParams.set('google', 'hiba')
  url.searchParams.set('ok', kod)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let actorId: string
  try {
    const access = await requireAdminAccess({ requireMaster: true })
    if (!access.userId) return hibaraIranyit(request, 'nincs-jogosultsag')
    actorId = access.userId
  } catch {
    return hibaraIranyit(request, 'nincs-jogosultsag')
  }

  // Fail-closed: kulcs nélkül a refresh tokent nem tudnánk titkosítva tárolni,
  // tehát el sem indítjuk a folyamatot. Inkább semmi, mint sima szövegű titok.
  if (!hasServerBackupKey()) {
    return hibaraIranyit(request, 'nincs-kulcs')
  }

  try {
    const config = loadGoogleOAuthConfig()
    const state = await issueOAuthState(actorId)
    return NextResponse.redirect(buildAuthorizationUrl(config, state))
  } catch {
    // A hibaüzenet SOHA nem kerül a query stringbe (proxy-napló, előzmény,
    // Referer) — csak egy kód, a felület fordítja emberi mondattá.
    return hibaraIranyit(request, 'nincs-konfiguracio')
  }
}
