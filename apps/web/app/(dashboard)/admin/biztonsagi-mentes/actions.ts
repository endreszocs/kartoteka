'use server'

/**
 * BIZTONSÁGI MENTÉS — ADMIN SZERVER-AKCIÓK (2026-08-11).
 *
 * ⚠️ MINDEN `'use server'` export ÉLŐ POST-VÉGPONT. Az, hogy a felület elrejti
 * a gombot, SEMMIT nem véd. Ezért mindegyik függvény ELSŐ sora egy saját
 * `requireAdminAccess` kapu, és a gyülekezet-hatókör (`getScopedCongregationIds`)
 * fail-closed: `null` = korlátlan (master/admin), üres tömb = SEMMI.
 *
 * ⚠️ AMI SOHA NEM HAGYJA EL A SZERVERT: a mentési jelszó, a Drive refresh token,
 * a szerver-kulcs — sem az értékük, sem a hosszuk. A felület a jelszóról
 * kizárólag egy `boolean`-t kap: „be van állítva".
 *
 * ⚠️ ZÖLD CSAK BIZONYÍTVA. A `status='ok'` önmagában nem elég: a felület
 * kizárólag a `drive_verified_at` (visszaolvasva, hash egyezett) alapján
 * mutat sikeres állapotot.
 */

import { revalidatePath } from 'next/cache'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { getScopedCongregationIds } from '@/lib/auth/admin-scope'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { sendDriveFailureAlert } from '@/lib/google-drive/alerts'
import {
  JELSZO_MIN_HOSSZ,
  loadRecoveryKeyMaterial,
  setBackupPassphrase,
} from '@/lib/google-drive/backup-passphrase'
import { clearDriveTokenCache, testDriveConnection } from '@/lib/google-drive/drive-client'
import {
  computeBackupHealth,
  computeBannerHealth,
  computeCoverage,
  loadScopedCongregations,
  congregationNev,
} from '@/lib/google-drive/health'
import { pruneOldBackups, reconcileDrive } from '@/lib/google-drive/retention'
import {
  clearDriveConnection,
  isMissingTableError,
  loadBackupSettingsView,
  saveAlertEmail,
  saveRetention,
} from '@/lib/google-drive/settings'
import { RETENTION_DEFAULT, type BackupLogRow } from '@/lib/google-drive/types'
import type {
  BackupListFilter,
  BackupListResult,
  DriveTestEredmeny,
  EgyszeruEredmeny,
  RiasztasTesztEredmeny,
} from './shared'
import type { BackupOverview } from '@/lib/google-drive/types'

const FELULET_UT = '/admin/biztonsagi-mentes'

type Access = Awaited<ReturnType<typeof requireAdminAccess>>

/** A hatókör feloldása. `null` = korlátlan. Üres tömb = SEMMI (fail-closed). */
async function scopeOf(access: Access): Promise<string[] | null> {
  return getScopedCongregationIds(access)
}

function hibaUzenet(e: unknown, alap: string): string {
  return e instanceof Error ? e.message : alap
}

// ─────────────────────────────────────────────────────────────────────────────
// ÁTTEKINTŐ — a kérdés: „TEGNAP VALÓDI VOLT-E A MENTÉS?"
// ─────────────────────────────────────────────────────────────────────────────

export async function getBackupOverviewAction(): Promise<BackupOverview> {
  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e: unknown) {
    return ureAttekinto(hibaUzenet(e, 'Nincs jogosultság.'))
  }

  const congregationIds = await scopeOf(access)
  const master = access.accessLevel === 'master'
  // A kerületi admin a `globalis` (rendszerszintű) mentést nem látja, ezért
  // nem is várjuk el tőle — különben minden nap „1 hiányzik"-ot mutatnánk neki.
  const globalisIsVarhato = congregationIds === null

  const supabase = getSupabaseAdminClient()
  const settings = await loadBackupSettingsView(supabase)

  const driveHiba =
    settings.view?.drive.tokenAllapot === 'hiba'
      ? (settings.view.drive.tokenHiba ?? 'A Google-kapcsolat megszakadt.')
      : !settings.view?.drive.osszekotve
        ? 'A Google Drive nincs összekötve — a mentések sehová nem kerülnek fel.'
        : null

  const [egeszseg, lefedettseg] = await Promise.all([
    computeBackupHealth(supabase, { congregationIds }, driveHiba),
    computeCoverage(supabase, { congregationIds }, globalisIsVarhato),
  ])

  // ⚠️ A TÉNYLEGES TÁROLÓ NEVE, nem a Drive-token megléte. A felület korábban
  //    „Google Drive összekötve"-t mutatott, miközben minden fájl ugyanabba a
  //    Supabase-fiókba ment, ahol az adatbázis is van.
  const taroloNev = settings.view?.drive.osszekotve ? 'google-drive' : 'supabase-storage'

  // A kulcs-letét megléte: enélkül a napi mentések csak a szerver-kulccsal
  // nyílnak, és a kulcs elvesztése az egész archívumot elviszi.
  const helyreallito = await loadRecoveryKeyMaterial()

  // Az egyeztetés hálózati hívás — csak a rendszergazdának futtatjuk, és a
  // hibája SOHA nem boríthatja az oldalt (a `reconcileDrive` nem dob).
  const egyeztetes =
    master && settings.view?.drive.osszekotve
      ? await reconcileDrive({ congregationIds })
      : { futott: false, naploSzerint: 0, driveOn: 0, hianyzo: 0, ismeretlen: 0, hiba: null }

  const needsSql = settings.needsSql || egeszseg.needsSql || lefedettseg.needsSql

  return {
    needsSql,
    error: settings.error ?? egeszseg.error ?? lefedettseg.error,
    health: egeszseg.health,
    tegnap: lefedettseg.tegnap,
    ma: lefedettseg.ma,
    pulzus: lefedettseg.pulzus,
    drive: settings.view?.drive ?? {
      osszekotve: false,
      fiokEmail: null,
      mappaId: null,
      osszekotveAt: null,
      tokenAllapot: 'nincs',
      tokenHiba: null,
    },
    taroloNev,
    egyeztetes,
    jelszoBeallitva: settings.view?.jelszoBeallitva ?? false,
    jelszoBeallitvaAt: settings.view?.jelszoBeallitvaAt ?? null,
    helyreallitoKulcs: helyreallito.publicRaw !== null && helyreallito.wrappedPrivate !== null,
    retention: settings.view?.retention ?? RETENTION_DEFAULT,
    maxFileMb: settings.view?.maxFileMb ?? 50,
    riasztasEmail: settings.view?.alertEmail ?? null,
    master,
    accessLevel: access.accessLevel,
  }
}

function ureAttekinto(error: string): BackupOverview {
  return {
    error,
    health: {
      allapot: 'nincs_mentes',
      utolsoIgazoltAt: null,
      oraSzam: null,
      driveHiba: null,
      mondat: 'Az állapot nem állapítható meg.',
    },
    tegnap: { nap: '', varhato: 0, igazolt: 0, hibas: 0, befejezetlen: 0, hianyzik: 0, problemasNevek: [] },
    ma: { nap: '', varhato: 0, igazolt: 0, hibas: 0, befejezetlen: 0, hianyzik: 0, problemasNevek: [] },
    pulzus: [],
    drive: {
      osszekotve: false,
      fiokEmail: null,
      mappaId: null,
      osszekotveAt: null,
      tokenAllapot: 'nincs',
      tokenHiba: null,
    },
    taroloNev: 'ismeretlen',
    egyeztetes: { futott: false, naploSzerint: 0, driveOn: 0, hianyzo: 0, ismeretlen: 0, hiba: null },
    jelszoBeallitva: false,
    jelszoBeallitvaAt: null,
    helyreallitoKulcs: false,
    retention: RETENTION_DEFAULT,
    maxFileMb: 50,
    riasztasEmail: null,
    master: false,
    accessLevel: 'district_admin',
  }
}

/**
 * A FIGYELMEZTETŐ SÁV adata — ez fut MINDEN oldalbetöltésen, ezért a lehető
 * legolcsóbb: EGYETLEN sor a naplóból, plusz a Drive-kapcsolat állapota.
 *
 * ⚠️ EZ MAGA AZ ŐRSZEM. Nem attól függ, hogy a mentő kód lefutott-e — a
 * HIÁNYBÓL számol. Ha a cron törlődik, ha a deploy elromlik, ha a route
 * 500-at ad, a sáv AKKOR IS megjelenik.
 *
 * Nem-adminnak `null`-t ad (a sáv nem jelenik meg): a lelkész nem tudja
 * megjavítani a rendszerszintű mentést, és a saját gyülekezetéről külön
 * felület tájékoztatja.
 */
export async function getBackupBannerStateAction(): Promise<{
  health: BackupOverview['health']
  ut: string
} | null> {
  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch {
    return null
  }

  try {
    const congregationIds = await scopeOf(access)
    const supabase = getSupabaseAdminClient()
    const settings = await loadBackupSettingsView(supabase)
    if (settings.needsSql) return null // A telepítés hiánya külön teendő, nem napi riadó.

    const driveHiba =
      settings.view?.drive.tokenAllapot === 'hiba'
        ? (settings.view.drive.tokenHiba ?? 'A Google-kapcsolat megszakadt.')
        : !settings.view?.drive.osszekotve
          ? 'A Google Drive nincs összekötve — a mentések sehová nem kerülnek fel.'
          : null

    // ⚠️ A SÁV A LEFEDETTSÉGBŐL SZÁMOL, nem egyetlen `max(finished_at)`-ból.
    //    Enélkül EGYETLEN igazolt mentés (akár egy „Mentés most" kattintás)
    //    48 órán át zölden tartotta volna a sávot, miközben a napi cron halott,
    //    és gyülekezetek tucatjainak nincs mentése.
    const globalisIsVarhato = congregationIds === null
    const { health, needsSql } = await computeBannerHealth(
      supabase,
      { congregationIds },
      globalisIsVarhato,
      driveHiba,
    )
    if (needsSql) return null
    return { health, ut: FELULET_UT }
  } catch {
    // A sáv SOHA nem boríthatja az oldalt. Ha nem tudunk semmit, nem állítunk semmit.
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTA
// ─────────────────────────────────────────────────────────────────────────────

interface RawLogRow {
  id: number
  scope: 'gyulekezet' | 'globalis'
  congregation_id: string | null
  congregation_nev: string | null
  kind: 'napi' | 'kezi' | 'pre_restore'
  run_date: string
  started_at: string
  finished_at: string | null
  status: 'fut' | 'ok' | 'hiba'
  failure_stage: string | null
  failure_message: string | null
  row_counts: unknown
  row_counts_delta: unknown
  total_rows: number | null
  ciphertext_bytes: number | null
  sha256: string | null
  env: string | null
  drive_file_id: string | null
  drive_file_name: string | null
  drive_verified_at: string | null
  media_drive_file_id: string | null
  media_bytes: number | null
  figyelmeztetesek: unknown
  pruned_at: string | null
}

const LOG_COLUMNS =
  'id, scope, congregation_id, congregation_nev, kind, run_date, started_at, finished_at, status, ' +
  'failure_stage, failure_message, row_counts, row_counts_delta, total_rows, ciphertext_bytes, ' +
  'sha256, env, drive_file_id, drive_file_name, drive_verified_at, media_drive_file_id, media_bytes, ' +
  'figyelmeztetesek, pruned_at'

function szamMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function mapLogRow(r: RawLogRow): BackupLogRow {
  return {
    id: r.id,
    scope: r.scope,
    congregationId: r.congregation_id,
    congregationNev: r.congregation_nev,
    kind: r.kind,
    runDate: r.run_date,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    failureStage: r.failure_stage,
    failureMessage: r.failure_message,
    rowCounts: szamMap(r.row_counts),
    rowCountsDelta: r.row_counts_delta ? szamMap(r.row_counts_delta) : null,
    totalRows: Number(r.total_rows ?? 0),
    ciphertextBytes: r.ciphertext_bytes,
    sha256: r.sha256,
    env: r.env === 'test' ? 'test' : 'prod',
    driveFileId: r.drive_file_id,
    driveFileName: r.drive_file_name,
    driveVerifiedAt: r.drive_verified_at,
    mediaDriveFileId: r.media_drive_file_id,
    mediaBytes: r.media_bytes,
    figyelmeztetesek: Array.isArray(r.figyelmeztetesek)
      ? (r.figyelmeztetesek as unknown[]).map((x) => String(x)).slice(0, 20)
      : [],
    prunedAt: r.pruned_at,
  }
}

export async function listBackupsAction(filter: BackupListFilter = {}): Promise<BackupListResult> {
  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e: unknown) {
    return { error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const congregationIds = await scopeOf(access)
  // FAIL-CLOSED: üres hatókör = üres lista. NEM „nincs szűrő, mutass mindent".
  if (congregationIds !== null && congregationIds.length === 0) {
    return { rows: [], gyulekezetek: [] }
  }

  const supabase = getSupabaseAdminClient()

  let gyulekezetek: Array<{ id: string; nev: string }> = []
  try {
    gyulekezetek = (await loadScopedCongregations(supabase, { congregationIds }))
      .map((c) => ({ id: c.id, nev: congregationNev(c) }))
      .sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
  } catch {
    gyulekezetek = []
  }

  const limit = Math.min(Math.max(Number(filter.limit ?? 100), 1), 500)
  let query = supabase
    .from('backup_log')
    .select(LOG_COLUMNS)
    .order('run_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (congregationIds !== null) {
    query = query.in('congregation_id', congregationIds)
  }
  if (filter.congregationId) {
    // Hatókörön KÍVÜLI gyülekezet kérése → üres lista, nem hiba-szivárgás.
    if (congregationIds !== null && !congregationIds.includes(filter.congregationId)) {
      return { rows: [], gyulekezetek }
    }
    query = query.eq('congregation_id', filter.congregationId)
  }
  if (filter.nap) query = query.eq('run_date', filter.nap)
  if (filter.csakHibas) query = query.neq('status', 'ok')

  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) return { needsSql: true, gyulekezetek }
    return { error: error.message, gyulekezetek }
  }

  return { rows: ((data ?? []) as unknown as RawLogRow[]).map(mapLogRow), gyulekezetek }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE DRIVE — teszt / szétkapcsolás
// ─────────────────────────────────────────────────────────────────────────────

export async function testDriveConnectionAction(): Promise<DriveTestEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  try {
    const eredmeny = await testDriveConnection()
    revalidatePath(FELULET_UT)
    return {
      success: eredmeny.success,
      error: eredmeny.error,
      fiokEmail: eredmeny.fiokEmail ?? null,
      szabadBajt: eredmeny.szabadBajt ?? null,
      lepesek: eredmeny.lepesek,
      uzenet: eredmeny.success ? 'A kapcsolat működik: a próbafájl fel-, vissza- és letörlődött.' : undefined,
    }
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'A kapcsolat tesztelése nem sikerült.') }
  }
}

export async function disconnectDriveAction(): Promise<EgyszeruEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const eredmeny = await clearDriveConnection()
  clearDriveTokenCache()
  revalidatePath(FELULET_UT)
  if (!eredmeny.success) return { success: false, error: eredmeny.error }
  return {
    success: true,
    uzenet:
      'A Google-hozzáférés törölve. A MÁR FELTÖLTÖTT fájlok a Drive-on maradnak — ' +
      'azokat a Google felületén tudod kezelni. Új mentés addig nem készül, amíg újra össze nem kötöd.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENTÉSI JELSZÓ (write-only)
// ─────────────────────────────────────────────────────────────────────────────

export async function setBackupPassphraseAction(
  regiJelszo: string | null,
  ujJelszo: string,
): Promise<EgyszeruEredmeny> {
  let access: Access
  try {
    access = await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  if (typeof ujJelszo !== 'string' || ujJelszo.trim().length < JELSZO_MIN_HOSSZ) {
    return { success: false, error: `A mentési jelszó legyen legalább ${JELSZO_MIN_HOSSZ} karakter.` }
  }

  const eredmeny = await setBackupPassphrase({
    regiJelszo: regiJelszo && regiJelszo.length > 0 ? regiJelszo : null,
    ujJelszo,
    actorProfileId: access.userId,
  })
  if (!eredmeny.success) return { success: false, error: eredmeny.error }

  revalidatePath(FELULET_UT)
  return {
    success: true,
    uzenet:
      'A mentési jelszó beállítva. A rendszer NEM tárolja és NEM tudja megmondani — ' +
      'írd le, és tedd oda, ahol a fontos iratokat tartod.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEGŐRZÉS ÉS RIASZTÁS-CÍM
// ─────────────────────────────────────────────────────────────────────────────

export async function setRetentionAction(
  napi: number,
  heti: number,
  havi: number,
): Promise<EgyszeruEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const ell = (n: unknown, nev: string, min: number, max: number): number | string => {
    const v = Math.floor(Number(n))
    if (!Number.isFinite(v) || v < min || v > max) return `A(z) „${nev}" értéke ${min} és ${max} között lehet.`
    return v
  }
  const n = ell(napi, 'napi', 7, 60)
  const h = ell(heti, 'heti', 4, 52)
  const m = ell(havi, 'havi', 3, 36)
  for (const v of [n, h, m]) if (typeof v === 'string') return { success: false, error: v }

  const eredmeny = await saveRetention({ napi: n as number, heti: h as number, havi: m as number })
  if (!eredmeny.success) return { success: false, error: eredmeny.error }
  revalidatePath(FELULET_UT)
  return { success: true, uzenet: 'A megőrzési szabály elmentve.' }
}

export async function setAlertEmailAction(email: string): Promise<EgyszeruEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const tisztitott = (email ?? '').trim()
  if (tisztitott.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tisztitott)) {
    return { success: false, error: 'Ez nem érvényes e-mail cím.' }
  }
  const eredmeny = await saveAlertEmail(tisztitott.length > 0 ? tisztitott : null)
  if (!eredmeny.success) return { success: false, error: eredmeny.error }
  revalidatePath(FELULET_UT)
  return {
    success: true,
    uzenet: tisztitott
      ? `A hibajelző levelek ide mennek: ${tisztitott}`
      : 'Törölve — a hibajelző levelek a BACKUP_ALERT_EMAIL / MASTER_ADMIN_EMAIL címre mennek.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NYESÉS / EGYEZTETÉS
// ─────────────────────────────────────────────────────────────────────────────

export async function pruneBackupsAction(szarazFutas: boolean): Promise<EgyszeruEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const eredmeny = await pruneOldBackups({ szarazFutas })
  revalidatePath(FELULET_UT)

  if (!eredmeny.success) {
    // A nyesés hibája RIASZTÁS-ÉRTÉKŰ: ha nem tudunk törölni, a Drive megtelik,
    // és onnantól az ÚJ mentés bukik el. Csendben nem hagyhatjuk.
    await sendDriveFailureAlert({
      kind: 'nyeses',
      reszlet: eredmeny.error ?? 'A régi mentések takarítása hibára futott.',
    })
    return { success: false, error: eredmeny.error }
  }

  const reszek: string[] = []
  reszek.push(
    szarazFutas
      ? (eredmeny.megjegyzes ?? 'Száraz futás: nem törlődött semmi.')
      : `${eredmeny.torolt} Drive-fájl véglegesen törölve, ${eredmeny.megtartott} mentés megtartva.`,
  )
  if (!szarazFutas && eredmeny.megjegyzes) reszek.push(eredmeny.megjegyzes)
  return { success: true, uzenet: reszek.join(' ') }
}

export async function reconcileDriveAction(): Promise<EgyszeruEredmeny> {
  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const congregationIds = await scopeOf(access)
  const eredmeny = await reconcileDrive({ congregationIds })
  revalidatePath(FELULET_UT)

  if (eredmeny.hiba) return { success: false, error: eredmeny.hiba }
  if (eredmeny.hianyzo > 0) {
    await sendDriveFailureAlert({
      kind: 'egyeztetes',
      reszlet: `A napló szerint ${eredmeny.naploSzerint} mentés-fájlnak kellene lennie, a Drive-on ${eredmeny.driveOn} található — ${eredmeny.hianyzo} hiányzik.`,
    })
    return {
      success: false,
      error:
        `A napló szerint ${eredmeny.naploSzerint} fájl kellene, a Drive-on ${eredmeny.driveOn} található. ` +
        `${eredmeny.hianyzo} fájl HIÁNYZIK — valószínűleg kézzel elmozgatták vagy törölték őket.`,
    }
  }
  return {
    success: true,
    uzenet:
      `Egyeztetve: a napló szerinti ${eredmeny.naploSzerint} fájl mind megvan a Drive-on.` +
      (eredmeny.ismeretlen > 0
        ? ` Ezen felül ${eredmeny.ismeretlen} ismeretlen fájl van a mappában — ezeket a rendszer SOHA nem törli automatikusan.`
        : ''),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// „MENTÉS MOST" — a mentés-motor meghívása
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tényleges kimentést a belső worker-végpont végzi
 * (`POST /api/internal/backup`, Bearer + `timingSafeEqual`). Ez az akció csak
 * ELINDÍTJA — így a napi automatikus és a kézi futás UGYANAZT a kódot használja,
 * és nem keletkezik két, egymástól elsodródó mentési út.
 *
 * Ha a motor még nincs telepítve, azt KIMONDJUK. A néma „elindítottuk" a
 * legrosszabb válasz: a felhasználó azt hinné, készül a mentés.
 */
export async function runBackupNowAction(): Promise<EgyszeruEredmeny> {
  try {
    await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const secret = process.env.BACKUP_WORKER_SECRET?.trim() ?? ''
  if (secret.length < 32) {
    return {
      success: false,
      error:
        'A mentés-motor nincs konfigurálva: hiányzik vagy túl rövid a BACKUP_WORKER_SECRET ' +
        '(legalább 32 karakter). Nézd meg a Railway környezeti változóit.',
    }
  }

  const explicit = process.env.BACKUP_WORKER_ENDPOINT?.trim()
  let endpoint: string
  if (explicit) {
    endpoint = explicit
  } else {
    const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || '').replace(/\/+$/, '')
    if (!base) {
      return {
        success: false,
        error:
          'A mentés-motor címe nem állapítható meg (hiányzik a BACKUP_WORKER_ENDPOINT és a NEXT_PUBLIC_APP_URL).',
      }
    }
    endpoint = `${base}/api/internal/backup`
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ forras: 'admin-felulet' }),
      cache: 'no-store',
      // ⚠️ NEM követjük az átirányítást. Ha a proxy mégis /login-ra terelne, a
      //    `fetch` alapból KÖVETNÉ, a bejelentkező oldal 200-at adna HTML-lel,
      //    és ez az akció ZÖLDET jelentene egy le sem futott mentésre.
      redirect: 'manual',
      signal: AbortSignal.timeout(900_000),
    })

    if (response.status === 404) {
      return {
        success: false,
        error:
          'A mentés-motor (/api/internal/backup) még nincs telepítve ebben a verzióban. ' +
          'A felület már működik, de mentést még nem tud indítani.',
      }
    }

    // FAIL CLOSED — átirányítás = a mentés EL SEM INDULT.
    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        error:
          'A mentés-motort a bejelentkezési kapu elterelte (átirányítás érkezett JSON helyett). ' +
          'Az `/api/internal/*` útvonalakat a proxy-nak át kell engednie — enélkül a napi ' +
          'automatikus mentés SEM fut le. Egyetlen sor sem került mentésre.',
      }
    }

    // FAIL CLOSED — nem JSON válasz = nem a worker felelt.
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error:
          `A mentés-motor nem JSON választ adott (${response.status}, „${contentType || 'ismeretlen típus'}"). ` +
          'Valószínűleg egy HTML oldal (bejelentkezés vagy hibaoldal) érkezett. Mentés NEM készült.',
      }
    }

    type WorkerValasz = {
      ok?: boolean
      sikeres?: number
      sikertelen?: number
      kihagyva?: number
      error?: string
    }
    let torzs: WorkerValasz | null = null
    try {
      torzs = (await response.json()) as WorkerValasz
    } catch {
      torzs = null
    }
    if (!torzs || typeof torzs !== 'object' || typeof torzs.ok !== 'boolean') {
      return {
        success: false,
        error:
          'A mentés-motor válasza értelmezhetetlen (hiányzik az „ok" mező). ' +
          'Nem tudjuk igazolni, hogy készült mentés — ezért NEM mondjuk, hogy készült.',
      }
    }

    revalidatePath(FELULET_UT)

    if (!response.ok || torzs.ok === false) {
      return {
        success: false,
        error:
          torzs.error ??
          `A mentés futása nem sikerült (${torzs.sikertelen ?? '?'} hatókör bukott el). Nézd meg a lista hibás sorait.`,
      }
    }
    // ⚠️ A „kihagyva" IS KIMONDANDÓ. A napi kulcs miatt egy aznap már igazolt
    //    hatókör nem fut újra — enélkül a felhasználó egy „0 hatókör igazolva"
    //    üzenetet kapna, és azt hinné, semmi nem működik.
    const kihagyva = Number(torzs.kihagyva ?? 0)
    return {
      success: true,
      uzenet:
        `A mentés lefutott: ${torzs.sikeres ?? '?'} hatókör igazolva` +
        (kihagyva > 0
          ? `, ${kihagyva} hatókör kihagyva (ma már készült róluk igazolt mentés).`
          : '.'),
    }
  } catch (e: unknown) {
    return { success: false, error: `A mentés-motor nem érhető el: ${hibaUzenet(e, 'ismeretlen hiba')}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RIASZTÁS-PRÓBA — mind a HÁROM csatorna kipróbálása
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tulajdonos SAJÁT KÉRÉSÉRE küld egy próba-riasztást: e-mail + harang.
 * (A harmadik csatorna, a figyelmeztető sáv, nem küldhető — az a hiányból
 * számolódik minden oldalbetöltésnél.)
 *
 * Miért kell: egy riasztási csatorna, amit sosem próbáltak ki, nem csatorna.
 * A Brevo feladó-domain, az IP-allowlist és a `MASTER_ADMIN_EMAIL` beállítás
 * mind NÉMÁN tud rosszul állni — pont akkor derülne ki, amikor baj van.
 */
export async function sendAlertTestAction(): Promise<RiasztasTesztEredmeny> {
  try {
    await requireAdminAccess({ requireMaster: true })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const eredmeny = await sendDriveFailureAlert({
    kind: 'elavult',
    reszlet:
      'PRÓBA-ÉRTESÍTÉS — ezt te magad kérted a mentés-felületről. Nem történt hiba. ' +
      'Ha ezt a levelet megkaptad és a harangban is látod, a riasztási csatornák működnek.',
    dedupKulcs: `${FELULET_UT}?riasztas-proba=${Date.now()}`,
  })

  const bajok: string[] = []
  if (!eredmeny.emailKuldve) bajok.push(`e-mail: ${eredmeny.emailHiba ?? 'nem ment el'}`)
  if (eredmeny.harangHiba) bajok.push(`harang: ${eredmeny.harangHiba}`)

  return {
    success: eredmeny.emailKuldve && !eredmeny.harangHiba,
    error: bajok.length > 0 ? `A próba részben elhasalt — ${bajok.join('; ')}` : undefined,
    uzenet:
      bajok.length === 0
        ? `Elküldve: e-mail + ${eredmeny.harangSorok} harang-értesítés. Nézd meg a postafiókot és a harangot.`
        : undefined,
    emailKuldve: eredmeny.emailKuldve,
    emailHiba: eredmeny.emailHiba,
    harangSorok: eredmeny.harangSorok,
    harangHiba: eredmeny.harangHiba,
  }
}
