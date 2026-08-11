import { NextResponse, type NextRequest } from 'next/server'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { resolveBackupStorageByName } from '@/lib/backup/storage'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { hashClientIp } from '@/lib/utils/ip-hash'
import { verifyBackupPassphrase } from '@/lib/google-drive/backup-passphrase'
import { isMissingTableError } from '@/lib/google-drive/settings'
import { sendRestoreAlert } from '@/lib/restore/alerts'

/**
 * MENTÉS LETÖLTÉSE (2026-08-11).
 *
 * POST /api/admin/backup/download   { backupLogId, jelszo }
 *
 * ⚠️ MIÉRT POST ÉS SOHA NEM GET
 * ─────────────────────────────
 * A mentési jelszó SOHA nem kerülhet URL-be: a query string bekerül a
 * proxy-naplókba, a böngésző-előzménybe és a `Referer` fejlécbe. Egy GET-es
 * letöltő végpont a jelszót három helyen szórná szét — ezért nincs GET.
 *
 * ⚠️ MIT AD VISSZA
 * ────────────────
 * A NYERS, TITKOSÍTOTT `.kbk` konténert. A rendszer SZÁNDÉKOSAN nem fejti
 * vissza a szerveren: a visszafejtés a `kartoteka-mentes-megnyitas.mjs`
 * szkripttel történik a saját gépeden, a mentési jelszóval. Így a nyílt adat
 * SOHA nem megy át a hálózaton, és a letöltött fájl elvesztése önmagában nem
 * adatvédelmi incidens.
 *
 * ⚠️ HÁROM KAPU
 * ─────────────
 *  1) `requireAdminAccess({ requireMaster: true })` — a letöltés a teljes
 *     gyülekezeti adatállományt viszi; ez nem kerületi admin jogosultság.
 *  2) mentési jelszó (sebességfékkel, hibás próbálkozás naplózásával),
 *  3) `backup_restore_log` bejegyzés — a letöltés NYOMOT HAGY, és a napló
 *     csak hozzáfűzhető, tehát a letöltő nem tudja eltüntetni.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function nemTarolhato(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
  })
}

interface Kérés {
  backupLogId?: unknown
  jelszo?: unknown
  /** true → a média- (fénykép-) fájlt tölti le az adat-fájl helyett. */
  media?: unknown
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let actorId: string | null = null
  let actorEmail: string | null = null
  try {
    const access = await requireAdminAccess({ requireMaster: true })
    actorId = access.userId
    actorEmail = access.user?.email ?? null
  } catch {
    return nemTarolhato(
      { ok: false, error: 'Ehhez a művelethez fő rendszergazdai jogosultság szükséges.' },
      403,
    )
  }

  let body: Kérés
  try {
    body = (await request.json()) as Kérés
  } catch {
    return nemTarolhato({ ok: false, error: 'Hibás kérés.' }, 400)
  }

  const backupLogId = Number(body.backupLogId)
  const jelszo = typeof body.jelszo === 'string' ? body.jelszo : ''
  const mediat = body.media === true

  if (!Number.isFinite(backupLogId) || backupLogId <= 0) {
    return nemTarolhato({ ok: false, error: 'Hiányzik a letöltendő mentés azonosítója.' }, 400)
  }
  if (jelszo.length === 0) {
    return nemTarolhato({ ok: false, error: 'A letöltéshez add meg a mentési jelszót.' }, 400)
  }

  const ipHash = hashClientIp(request.headers)

  // ── 2. kapu: mentési jelszó ──
  const ellenorzes = await verifyBackupPassphrase({
    jelszo,
    actorProfileId: actorId,
    actorEmail,
    actorIpHash: ipHash,
  })
  if (!ellenorzes.ok) {
    return nemTarolhato({ ok: false, error: ellenorzes.error ?? 'A mentési jelszó nem helyes.' }, ellenorzes.fek ? 429 : 401)
  }

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('backup_log')
    .select(
      'id, congregation_id, congregation_nev, run_date, kind, scope, status, storage_nev, drive_file_id, drive_file_name, media_drive_file_id, sha256, pruned_at',
    )
    .eq('id', backupLogId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return nemTarolhato({ ok: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }, 503)
    }
    return nemTarolhato({ ok: false, error: 'A mentés nem található.' }, 500)
  }
  if (!data) return nemTarolhato({ ok: false, error: 'A mentés nem található.' }, 404)

  const sor = data as {
    id: number
    congregation_id: string | null
    congregation_nev: string | null
    run_date: string
    kind: string
    scope: string
    status: string
    storage_nev: string | null
    drive_file_id: string | null
    drive_file_name: string | null
    media_drive_file_id: string | null
    sha256: string | null
    pruned_at: string | null
  }

  const fileId = mediat ? sor.media_drive_file_id : sor.drive_file_id
  if (!fileId) {
    return nemTarolhato(
      {
        ok: false,
        error: mediat
          ? 'Ehhez a mentéshez nem tartozik külön fénykép-fájl.'
          : 'Ehhez a mentéshez nem tartozik letölthető fájl (a futás nem jutott el a feltöltésig).',
      },
      404,
    )
  }
  if (sor.pruned_at) {
    return nemTarolhato(
      { ok: false, error: 'Ez a mentés a megőrzési idő letelte után már törlődött a Drive-ról.' },
      410,
    )
  }

  // ── 3. kapu: NYOM. A „started" sor a letöltés ELŐTT íródik. ──
  const naploSor = await supabase
    .from('backup_restore_log')
    .insert({
      tipus: 'download',
      actor_profile_id: actorId,
      actor_email: actorEmail,
      actor_ip_hash: ipHash,
      congregation_id: sor.congregation_id,
      congregation_nev: sor.congregation_nev,
      backup_log_id: sor.id,
      backup_run_date: sor.run_date,
      backup_sha256: sor.sha256,
      outcome: 'indult',
    })
    .select('id')
    .maybeSingle()

  let tartalom: Uint8Array
  try {
    // ⚠️ A TÁROLÓ-PORTON keresztül, a napló-sorban rögzített `storage_nev`
    //    alapján. A korábbi változat közvetlenül a Drive-klienst hívta — ha a
    //    fájl a Supabase Storage-ban volt (márpedig Drive-bekötés nélkül ott
    //    van), a Drive 404-et adott, a felhasználó pedig egy 502-t kapott,
    //    miközben a fájl megvolt. Az írás és az olvasás így nem tud széthúzni.
    const storage = await resolveBackupStorageByName(sor.storage_nev)
    tartalom = new Uint8Array(await storage.downloadFile(fileId))
  } catch (e: unknown) {
    const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
    if (naploSor.data?.id) {
      await supabase
        .from('backup_restore_log')
        .update({ outcome: 'failed', finished_at: new Date().toISOString(), error_message: uzenet.slice(0, 300) })
        .eq('id', naploSor.data.id)
    }
    return nemTarolhato({ ok: false, error: `A mentés nem tölthető le: ${uzenet}` }, 502)
  }

  // ── 4. kapu: ÖNÉRTESÍTÉS ──
  // ⚠️ AKKOR IS ELMEGY, HA A LETÖLTŐ MAGA A CÍMZETT. Ez nem redundancia: egy
  //    ELLOPOTT MUNKAMENET pontosan így válik láthatóvá. Aki megszerezte a
  //    mesteradmin-fiókot ÉS a mentési jelszót, most a teljes gyülekezeti
  //    adatállományt viszi el — enélkül nyom nélkül, egy naplósorral, amit
  //    senki nem néz meg.
  const riasztas = await sendRestoreAlert({
    kind: 'letoltes',
    congregationId: sor.congregation_id,
    congregationNev: sor.congregation_nev || sor.scope || 'rendszerszintű mentés',
    backupRunDate: sor.run_date,
    actorEmail,
    restoreLogId: naploSor.data?.id ?? null,
  })

  if (naploSor.data?.id) {
    await supabase
      .from('backup_restore_log')
      .update({
        outcome: 'ok',
        finished_at: new Date().toISOString(),
        // Ha maga az értesítés hasalt el, AZ IS a naplóba kerül — a riasztás
        // elvesztése maga is riasztás.
        figyelmeztetesek: riasztas,
      })
      .eq('id', naploSor.data.id)
  }

  // A fájlnév ASCII-ra szűkítve: a `content-disposition` fejléc ékezetes
  // karaktereken böngészőnként eltérően viselkedik, és a `"` bezárása is
  // védendő. A gyülekezet neve itt CSAK a letöltő saját gépére kerül.
  const gyulekezet = (sor.congregation_nev || sor.scope || 'rendszer')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const fajlnev = `kartoteka-${gyulekezet || 'mentes'}-${sor.run_date}${mediat ? '-fenykepek' : ''}.kbk`

  return new NextResponse(new Uint8Array(tartalom), {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(tartalom.byteLength),
      'content-disposition': `attachment; filename="${fajlnev}"`,
      'cache-control': 'no-store',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
    },
  })
}
