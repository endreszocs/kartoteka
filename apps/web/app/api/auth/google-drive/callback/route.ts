import { NextResponse, type NextRequest } from 'next/server'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import {
  clearDriveTokenCache,
  deleteFilePermanently,
  downloadFile,
  ensureBackupFolder,
  getDriveAbout,
  uploadFile,
} from '@/lib/google-drive/drive-client'
import { exchangeCodeForTokens, loadGoogleOAuthConfig, verifyOAuthState } from '@/lib/google-drive/oauth'
import { loadDriveRefreshToken, saveDriveConnection } from '@/lib/google-drive/settings'
import { getPublicOrigin } from '@/lib/utils/public-origin'

/**
 * GOOGLE DRIVE ÖSSZEKÖTÉS — 2. lépés: a visszatérés (2026-08-11).
 *
 * GET /api/auth/google-drive/callback?code=…&state=…
 *
 * A LÉPÉSEK, ÉS MIÉRT ÉPP EZEK
 * ────────────────────────────
 *  1) `requireAdminAccess({ requireMaster: true })` — a `state` önmagában nem
 *     elég: a session jogosultsága IS kell (a state csak azt köti, hogy UGYANAZ
 *     az ember indította).
 *  2) `state` ellenőrzés — CSRF: enélkül bárki, aki ismeri a callback címet,
 *     rácsatolhatná a saját Drive-ját.
 *  3) Kód → token csere. Refresh token nélküli válasz = HIBA, nem „részsiker":
 *     az `access_type=offline` + `prompt=consent` nélküli összekötés egy órán
 *     belül némán elhalna.
 *  4) A célmappa létrehozása — ⚠️ AZ ALKALMAZÁS hozza létre. A `drive.file`
 *     hatókör a KÉZZEL készített mappát NEM LÁTJA.
 *  5) Próbafájl fel → vissza → törlés. Egy kapcsolat, amit sosem próbáltak ki,
 *     nem kapcsolat, hanem remény.
 *  6) A refresh token TITKOSÍTVA a `backup_settings`-be.
 *
 * ⚠️ SOHA NEM NAPLÓZUNK ÉS SOHA NEM TESZÜNK URL-BE: `code`, `access_token`,
 *    `refresh_token`, `client_secret` — sem értéket, sem hosszt, sem előtagot.
 *    A visszairányítás csak egy RÖVID KÓDOT visz, amit a felület fordít le.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Kimenetel =
  | 'ok'
  | 'nincs-jogosultsag'
  | 'megszakitva'
  | 'ervenytelen-allapot'
  | 'nincs-kod'
  | 'token-csere'
  | 'mappa'
  | 'proba'
  | 'mentes'

function iranyit(request: NextRequest, kimenetel: Kimenetel): NextResponse {
  // A KIFELÉ látható origó — Railway mögött a nextUrl.origin a belső
  // localhost:8080 lenne (lásd lib/utils/public-origin.ts).
  const url = new URL('/admin/biztonsagi-mentes', getPublicOrigin(request))
  url.searchParams.set('google', kimenetel === 'ok' ? 'ok' : 'hiba')
  url.searchParams.set('ok', kimenetel)
  const response = NextResponse.redirect(url)
  response.headers.set('cache-control', 'no-store')
  return response
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 1) Jogosultság ──
  let actorId: string
  try {
    const access = await requireAdminAccess({ requireMaster: true })
    if (!access.userId) return iranyit(request, 'nincs-jogosultsag')
    actorId = access.userId
  } catch {
    return iranyit(request, 'nincs-jogosultsag')
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) {
    // A felhasználó a Google oldalán megszakította — ez nem hiba, csak nem-döntés.
    return iranyit(request, 'megszakitva')
  }

  // ── 2) `state` ──
  if (!(await verifyOAuthState(params.get('state'), actorId))) {
    return iranyit(request, 'ervenytelen-allapot')
  }

  const code = params.get('code')
  if (!code) return iranyit(request, 'nincs-kod')

  // ── 3) Token-csere ──
  let refreshToken: string
  let accessToken: string
  try {
    const config = loadGoogleOAuthConfig()
    const tokens = await exchangeCodeForTokens(config, code)
    if (!tokens.refreshToken) return iranyit(request, 'token-csere')
    refreshToken = tokens.refreshToken
    accessToken = tokens.accessToken
  } catch (error: unknown) {
    console.error(
      '[google-drive] a token-csere nem sikerült:',
      error instanceof Error ? error.message : 'ismeretlen hiba',
    )
    return iranyit(request, 'token-csere')
  }

  // ── 4) Célmappa ──
  let folderId: string
  try {
    const meglevo = await loadDriveRefreshToken()
    folderId = await ensureBackupFolder(accessToken, meglevo.folderId)
  } catch (error: unknown) {
    console.error(
      '[google-drive] a mentési mappa nem hozható létre:',
      error instanceof Error ? error.message : 'ismeretlen hiba',
    )
    return iranyit(request, 'mappa')
  }

  // ── 5) Próbafájl: fel → vissza → törlés ──
  try {
    const tartalom = Buffer.from(
      `KARTOTEKA - a kapcsolat letrejott ${new Date().toISOString()}\n` +
        'Ez a fajl automatikusan torlodik, es nem tartalmaz szemelyes adatot.\n',
      'utf8',
    )
    const proba = await uploadFile(accessToken, {
      folderId,
      name: `kartoteka-kapcsolat-${Date.now()}.txt`,
      content: new Uint8Array(tartalom),
      mimeType: 'text/plain',
    })
    const vissza = await downloadFile(accessToken, proba.id)
    const egyezik = Buffer.from(vissza).equals(tartalom)
    await deleteFilePermanently(accessToken, proba.id).catch(() => undefined)
    if (!egyezik) return iranyit(request, 'proba')
  } catch (error: unknown) {
    console.error(
      '[google-drive] a próbafájl-teszt elhasalt:',
      error instanceof Error ? error.message : 'ismeretlen hiba',
    )
    return iranyit(request, 'proba')
  }

  // ── 6) Mentés (titkosítva) ──
  let fiokEmail: string | null = null
  try {
    fiokEmail = (await getDriveAbout(accessToken)).email
  } catch {
    // A fiók-cím csak megjelenítés — a hiánya nem akadálya az összekötésnek.
    fiokEmail = null
  }

  const mentes = await saveDriveConnection({ refreshToken, folderId, accountEmail: fiokEmail })
  if (!mentes.success) {
    console.error('[google-drive] a kapcsolat mentése nem sikerült:', mentes.error ?? 'ismeretlen hiba')
    return iranyit(request, 'mentes')
  }

  clearDriveTokenCache()
  return iranyit(request, 'ok')
}
