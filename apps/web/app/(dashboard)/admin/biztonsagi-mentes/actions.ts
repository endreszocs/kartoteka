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
import { resolveMegjelenitesiHatokor } from '@/lib/auth/display-scope'
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
  BackupBannerState,
  BackupListFilter,
  BackupListResult,
  DriveTestEredmeny,
  EgyszeruEredmeny,
  MentesBefejezesOka,
  MentesFutasAllapot,
  MentesFutasEredmeny,
  MentesHaladas,
  MentesLepes,
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
 * A FIGYELMEZTETŐ SÁV adata — ez fut MINDEN oldalbetöltésen.
 *
 * ⚠️ EZ MAGA AZ ŐRSZEM. Nem attól függ, hogy a mentő kód lefutott-e — a
 * HIÁNYBÓL számol. Ha a cron törlődik, ha a deploy elromlik, ha a route
 * 500-at ad, a sáv AKKOR IS megjelenik.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11 — HÁROM JAVÍTÁS EGYSZERRE
 * ════════════════════════════════════════════════════════════════════════════
 * 1) HATÓKÖR A BEKAPCSOLT PROFILBÓL (a tulajdonos kérése). A `scopeOf` a
 *    mögöttes JOGOSULTSÁGOT nézi: a master mindig `null`-t (korlátlan) kap,
 *    ezért a sáv a barátosi lelkészi profilban is 784 hatókört és idegen
 *    gyülekezet-neveket sorolt fel. Mostantól a hatókör
 *    `metszet(jogosultság, bekapcsolt profil)` — SOHA nem tágít, csak szűkít,
 *    és a feloldás bármely hibája a SZŰKEBB (üres) ágra fut.
 *    ⚠️ A biztonsági kapu (`requireAdminAccess`) VÁLTOZATLAN — ez megjelenítési
 *    igazítás, nem jogosultság-módosítás.
 *
 * 2) NEM HALLGAT EL. Az öt korábbi `return null` ág megkülönböztethetetlen
 *    volt; mostantól `ok: 'nincs_jog' | 'nincs_sql' | 'hiba' | 'allapot'`.
 *
 * 3) RÖVID GYORSÍTÓTÁR. Országos hatókörben ez a hívás ~783 gyülekezetet és
 *    14 nap × ~784 napló-sort lapoz végig MINDEN oldalbetöltésen. Egy lassú
 *    vagy időtúllépő hívás maga okozta a hiányzó sávot. 60 másodperces,
 *    hatókörre kulcsolt memória-gyorsítótár — a napi riadó felbontásához bőven
 *    elég, és a kulcsban benne van a teljes hatókör, tehát nem szivároghat át
 *    egyik felhasználóról a másikra.
 */
export async function getBackupBannerStateAction(): Promise<BackupBannerState> {
  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch {
    return { ok: 'nincs_jog' }
  }

  try {
    // A JOGOSULTSÁGI hatókör (fail-closed) — ez marad a felső korlát.
    const jogosultsagi = await scopeOf(access)

    // A BEKAPCSOLT PROFIL scope-ja HÁROM ÁLLAPOTTAL.
    // ⚠️ Ha a `profile_roles` lekérdezés HIBÁZOTT, az `activeProfileRole` `null`,
    //    de az NEM azt jelenti, hogy nincs bekapcsolt profil — csak azt, hogy nem
    //    tudjuk. A `null`-ra a metsző a jogosultsági (ORSZÁGOS) ágra futna, tehát
    //    egy tranziens adatbázis-hiba némán visszahozná a 784 hatókört a barátosi
    //    profilban. Az `'ismeretlen'` ezt fail-closed üres hatókörre viszi.
    const aktivScope = access.profileRolesFeloldhato
      ? (access.activeProfileRole?.scope ?? null)
      : 'ismeretlen'

    // …metszve a BEKAPCSOLT PROFIL hatókörével.
    const hatokor = await resolveMegjelenitesiHatokor({
      supabase: access.supabase,
      jogosultsagi,
      aktivScope,
      aktivScopeId: access.activeProfileRole?.scopeId ?? null,
      effectiveCongregationId: access.effectiveCongregationId,
    })

    const congregationIds = hatokor.congregationIds
    // Üres hatókör → NINCS sáv. Szándékosan nem piros „nincs hatókör" riadó:
    // az a felhasználónak megoldhatatlan, tehát csak zajt csinálna.
    if (congregationIds !== null && congregationIds.length === 0) {
      return { ok: 'nincs_jog' }
    }

    // A „Megnézem, mi a baj" gomb CSAK oda mutathat, ahová a felhasználó
    // tényleg be is jut. Az `/admin` layout gyülekezeti/egyházmegyei profilban
    // elteríti a /dashboard-ra (admin/layout.tsx) — ilyenkor a gomb elmarad,
    // különben a sáv egy visszapattanó linket kínálna.
    const adminFeluletElerheto =
      aktivScope === null ||
      aktivScope === 'system' ||
      (aktivScope === 'district' && access.egyhazkeruletiAdmin)

    const gyorsitoKulcs = JSON.stringify({
      c: congregationIds === null ? null : [...congregationIds].sort(),
      g: hatokor.globalisIsVarhato,
    })
    const gyorsitott = bannerGyorsitoOlvas(gyorsitoKulcs)
    if (gyorsitott) {
      return {
        ...gyorsitott,
        ut: gyorsitott.ok === 'allapot' && adminFeluletElerheto ? FELULET_UT : null,
      }
    }

    const supabase = getSupabaseAdminClient()
    const settings = await loadBackupSettingsView(supabase)
    // A telepítés hiánya külön teendő, nem napi riadó.
    if (settings.needsSql) return bannerGyorsitoIr(gyorsitoKulcs, { ok: 'nincs_sql' })

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
    const { health, needsSql } = await computeBannerHealth(
      supabase,
      { congregationIds },
      hatokor.globalisIsVarhato,
      driveHiba,
    )
    if (needsSql) return bannerGyorsitoIr(gyorsitoKulcs, { ok: 'nincs_sql' })

    const allapot = bannerGyorsitoIr(gyorsitoKulcs, { ok: 'allapot', health })
    return { ...allapot, ut: adminFeluletElerheto ? FELULET_UT : null }
  } catch (e: unknown) {
    // A sáv SOHA nem boríthatja az oldalt — de NEM is hallgat el. A felület
    // egy visszafogott „most nem ellenőrizhető" sort mutat, mert egy néma
    // riasztórendszer rosszabb a semminél.
    console.error('[mentes-sav] az állapot lekérdezése elbukott:', e)
    return { ok: 'hiba', hibaUzenet: hibaUzenet(e, 'ismeretlen hiba') }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A sáv rövid életű memória-gyorsítótára
//
// Szándékosan folyamat-memóriában (nem `unstable_cache`): a sáv adata
// felhasználó-hatókörhöz kötött, és nem szabad a Next.js adat-gyorsítótárába
// perzisztálni. A kulcs a TELJES hatókör, ezért két különböző hatókörű
// felhasználó SOHA nem kaphatja meg egymás eredményét.
// ─────────────────────────────────────────────────────────────────────────────

const BANNER_TTL_MS = 60_000
const bannerGyorsito = new Map<string, { lejar: number; ertek: BackupBannerState }>()

function bannerGyorsitoOlvas(kulcs: string): BackupBannerState | null {
  const sor = bannerGyorsito.get(kulcs)
  if (!sor) return null
  if (sor.lejar < Date.now()) {
    bannerGyorsito.delete(kulcs)
    return null
  }
  return sor.ertek
}

function bannerGyorsitoIr(kulcs: string, ertek: BackupBannerState): BackupBannerState {
  // Egyszerű felső korlát, hogy sok hatókör mellett se nőjön korlátlanul.
  if (bannerGyorsito.size > 200) bannerGyorsito.clear()
  bannerGyorsito.set(kulcs, { lejar: Date.now() + BANNER_TTL_MS, ertek })
  return ertek
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
// „MENTÉS MOST" — EGY KATTINTÁS, ÉS A SZERVER VÉGIGVISZI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT NEM A KÉRÉSBEN FUT A MENTÉS (2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 * A korábbi „Mentés most" egy olyan szerver-akciót hívott, ami a MUNKÁT is
 * elvégezte: a böngésző végig nyitva tartotta a kérést, és a felület
 * négypercenként újrahívta. Élesben ez 15 hatókör után elvágódott, ezzel az
 * angol mondattal: „An unexpected response was received from the server."
 *
 * A mondat a Next.js SAJÁT kliens-kódjából jön, és pontosan akkor, ha a böngésző
 * KAPOTT egy választ, csak nem `text/x-component` típusút — vagyis nem a mi
 * szerver-akciónk felelt, hanem a Railway edge-proxyja a saját hibaoldalával.
 * A Railway egy HTTP-kérést 15 percig enged élni, DE CSAK ha közben adat mozog;
 * ha nincs adatforgalom, 300 másodperc után lezárja. Egy szerver-akció a munka
 * teljes ideje alatt nulla bájtot küld, tehát ránk MINDIG a 300 másodperc
 * vonatkozik. 784 hatókör × ~18 másodperc ≈ 4 óra — ez semmilyen kérésbe nem fér
 * bele, és nem is fog.
 *
 * Ezért a mentés MOSTANTÓL NEM A KÉRÉSBEN LAKIK:
 *   · `startBackupRunAction()`     — elindítja, és ezredmásodpercek alatt visszatér,
 *   · `getBackupRunStatusAction()` — megmondja, hol tart (a naplóból),
 *   · `stopBackupRunAction()`      — kéri a leállítást.
 *
 * A tulajdonos EGYSZER nyom gombot. Bezárhatja a fület, elveszítheti a
 * hálózatot, lezárhatja a telefonját — a futás a szerveren megy tovább.
 *
 * ⚠️ BEVALLOTT KORLÁT: egy telepítés (deploy) vagy folyamat-újraindulás megöli a
 *    futó ciklust. Ilyenkor SEMMI nem vész el — minden kész hatókörnek megvan az
 *    igazolt napló-sora —, de nincs, aki folytassa: újra kell indítani, vagy
 *    megvárni az éjszakai cront. A felület ezt kimondja.
 */

/** A haladás-számokat és a felületi jelentést EGY helyen állítjuk elő. */
async function futasAllapotOsszeallitas(): Promise<MentesFutasAllapot> {
  const [{ getBackupRunAllapot }, { loadNapiHaladas }, { bucharestRunDate }] = await Promise.all([
    import('@/lib/backup/supervisor'),
    import('@/lib/backup/progress'),
    import('@/lib/backup/payload'),
  ])

  let access: Access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e: unknown) {
    return { fut: false, voltFutas: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const sup = getBackupRunAllapot()
  const maiNap = bucharestRunDate()

  const congregationIds = await scopeOf(access)
  const haladasNyers = await loadNapiHaladas(getSupabaseAdminClient(), {
    congregationIds,
    // A kerületi admin a rendszerszintű mentést nem látja — de ide el sem jut
    // (`allowDistrictAdmin: false`), ezért a korlátlan hatókör a helyes alap.
    globalisIsVarhato: congregationIds === null,
    // ⚠️ A FUTÁS SAJÁT NAPJA, NEM A MAI (2026-08-11). A felügyelő az indításkor
    //    rögzítette, melyik napra készül a mentés, és minden szelet ezt kapja.
    //    Ha itt frissen kérdeznénk a bukaresti napot, egy 22 órakor indított
    //    futás haladása ÉJFÉLKOR visszaugrana nullára: a sáv 100%-ról 0%-ra
    //    esne, a szöveg pedig „KÉSZ" után újra „FUT, 3 / 784"-re váltana. A
    //    tulajdonos így egy befejezett mentést látna elveszni.
    nap: sup.runDate ?? undefined,
  })

  const haladas: MentesHaladas = {
    nap: haladasNyers.nap,
    varhato: haladasNyers.varhato,
    igazolt: haladasNyers.igazolt,
    hibas: haladasNyers.hibas,
    fut: haladasNyers.fut,
    erintetlen: haladasNyers.erintetlen,
  }

  return {
    fut: sup.fut,
    voltFutas: sup.indultAt !== null,
    indultAt: sup.indultAt,
    vegzettAt: sup.vegzettAt,
    szelet: sup.szelet,
    megallitasKerve: sup.megallitasKerve,
    befejezesOka: sup.befejezesOka,
    haladas,
    needsSql: haladasNyers.needsSql,
    error: haladasNyers.error,
    jelentes: futasJelentes(sup, haladas, haladasNyers.error, maiNap),
  }
}

/** Amit a jelentés a felügyelőtől megkap. */
interface FutasJelentesForras {
  fut: boolean
  indultAt: string | null
  szelet: number
  sikeres: number
  /** Az UTOLSÓ szelet bukott hatóköreinek száma — a „nem halad" ág ebből mond igazat. */
  sikertelen: number
  foglalt: number
  megallitasKerve: boolean
  befejezesOka: MentesBefejezesOka | null
  utolsoHiba: string | null
  lepesek: MentesLepes[] | null
  figyelmeztetesek: string[]
  bukottak: Array<{ scope: string; nev: string | null; stage: string | null; hiba: string | null }>
}

/**
 * A felületnek szánt jelentés — a NAPLÓ számaiból, nem a futás emlékezetéből.
 *
 * ⚠️ MIÉRT A NAPLÓBÓL. A haladás-jelző soha nem mondhat mást, mint a „Mentési
 *    előzmény" lista. Ha a futás saját számlálójából dolgoznánk, a kettő egy
 *    folyamat-újraindulás után némán széthúzna — és a felügyeleti kijelző, ami
 *    tévedhet, rosszabb a semminél.
 *
 * ⚠️ A NAPVÁLTÁST KIMONDJUK (2026-08-11). A számok a futás SAJÁT napjáról
 *    szólnak (`haladas.nap`). Ha közben elmúlt a bukaresti éjfél, akkor a
 *    „mai" szó már nem igaz — ezt nem hallgatjuk el, hanem a mondat elejére
 *    tesszük. Némán elcsúszott dátum = a felület tippel.
 */
function futasJelentes(
  sup: FutasJelentesForras,
  haladas: MentesHaladas,
  lekerdezesHiba: string | undefined,
  maiNap: string,
): MentesFutasEredmeny | null {
  const j = futasJelentesBelso(sup, haladas, lekerdezesHiba)
  if (!j || haladas.nap === maiNap) return j

  const elotag =
    `ÉJFÉL ELMÚLT — ez a jelentés a ${haladas.nap} napi futásról szól, közben viszont ` +
    `már ${maiNap} van. A MAI napra a rendszer KÜLÖN mentést készít (az éjszakai ` +
    'automatika, vagy egy új indítás). '
  return {
    ...j,
    uzenet: j.uzenet ? elotag + j.uzenet : undefined,
    error: j.error ? elotag + j.error : undefined,
  }
}

function futasJelentesBelso(
  sup: FutasJelentesForras,
  haladas: MentesHaladas,
  lekerdezesHiba: string | undefined,
): MentesFutasEredmeny | null {
  if (!sup.fut && sup.indultAt === null) return null

  const hatralevo = Math.max(0, haladas.varhato - haladas.igazolt)
  const kesz = haladas.varhato > 0 && hatralevo === 0

  const kozos = {
    osszes: haladas.varhato,
    // A haladás-sáv `sikeres + kihagyva` összeget rajzol — ez PONTOSAN a napló
    // szerinti mai igazolt darabszám. A bontás csak annyit mond meg, mennyi
    // készült EBBEN a futásban, és mennyi volt már azelőtt kész.
    sikeres: Math.min(sup.sikeres, haladas.igazolt),
    kihagyva: Math.max(0, haladas.igazolt - sup.sikeres),
    sikertelen: haladas.hibas,
    hatralevo,
    futottVegig: kesz,
    mindenSikeres: haladas.hibas === 0,
    lepesek: sup.lepesek ?? undefined,
    figyelmeztetesek: sup.figyelmeztetesek.length > 0 ? sup.figyelmeztetesek : undefined,
    bukottak:
      sup.bukottak.length > 0
        ? sup.bukottak.map((b) => ({
            scope: b.scope,
            nev: b.nev,
            stage: b.stage,
            hiba: b.hiba,
            teendo: null,
          }))
        : undefined,
    reszlet: sup.utolsoHiba ?? lekerdezesHiba,
  }

  // ── MÉG FUT ────────────────────────────────────────────────────────────────
  if (sup.fut) {
    return {
      ...kozos,
      success: true,
      uzenet:
        (sup.megallitasKerve
          ? 'LEÁLLÍTÁS KÉRVE — a most futó gyülekezet mentése még befejeződik, hogy ne maradjon félbehagyott munka. '
          : 'A mentés FUT a szerveren. ') +
        `${haladas.igazolt} / ${haladas.varhato} hatókörnek van mai, ellenőrzött mentése` +
        (haladas.hibas > 0 ? `, ${haladas.hibas} elbukott` : '') +
        '.',
      // ⚠️ A BEVALLOTT KORLÁTOT ITT MONDJUK KI (2026-08-11). Korábban ez a
      //    mondat annyit ígért, hogy „ha később visszajössz, ez az oldal
      //    megmutatja, hol tart" — csakhogy egy TELEPÍTÉS vagy folyamat-
      //    újraindulás megöli a ciklust, és utána a felügyelő üres állapotra
      //    áll: a visszatérő tulajdonos SEMMIT nem látna a megölt futásból.
      //    Az ígéretet ezért szűkítjük arra, ami igaz.
      teendo: sup.megallitasKerve
        ? undefined
        : 'Nyugodtan bezárhatod ezt az oldalt, sőt a böngészőt is: a mentés a SZERVEREN fut, nem ' +
          'ebben az ablakban. Ha később visszajössz, ez az oldal megmutatja, hol tart. Egy dolgot ' +
          'tudnod kell: ha közben az alkalmazás FRISSÜL (telepítés) vagy a szerver újraindul, a ' +
          'futás megszakad — az addig elkészült mentések MEGMARADNAK, de a maradékhoz újra meg ' +
          'kell nyomnod a „Mentés most" gombot.',
    }
  }

  // ── KÉSZ ───────────────────────────────────────────────────────────────────
  if (kesz) {
    return {
      ...kozos,
      success: true,
      uzenet:
        `KÉSZ: mind a ${haladas.varhato} hatókörnek van mai (${haladas.nap}), ellenőrzött ` +
        'biztonsági mentése — a rendszer mindegyiket vissza is olvasta a tárolóból.',
    }
  }

  // ── VÉGET ÉRT, DE MARADT HÁTRA ─────────────────────────────────────────────
  const kozosVege =
    `${haladas.igazolt} / ${haladas.varhato} hatókör kész` +
    (haladas.hibas > 0 ? `, ${haladas.hibas} ELBUKOTT` : '') +
    `, ${hatralevo} hátravan.`

  switch (sup.befejezesOka) {
    // ⚠️ „KÉSZ", DE MÉGIS MARADT HÁTRA. A motor MINDEN hatókörhöz hozzáért
    //    (`futottVegig`), viszont némelyik mentése elbukott — azoknak nincs mai,
    //    ellenőrzött mentésük. Ez NEM „elfogyott a futási korlát", és külön
    //    ágat érdemel: a teendő is más (a bukás okát kell megnézni, nem újra
    //    indítani a futást).
    case 'kesz':
      return {
        ...kozos,
        success: false,
        error:
          `A futás MINDEN hatókörhöz hozzáért, de ${hatralevo} hatókörnek mégsem lett mai, ` +
          `ellenőrzött mentése` +
          (haladas.hibas > 0 ? ` (${haladas.hibas} elbukott)` : '') +
          `. ${haladas.igazolt} / ${haladas.varhato} kész.`,
        teendo:
          'Nyisd le a „Részletek" blokkot: ott NÉVVEL látszik, melyik gyülekezetnél mi történt. ' +
          'Utána nyomd meg újra a „Mentés most" gombot — a bukott hatóköröket újrapróbálja, a ' +
          'kész mentéseket nem bántja.',
      }
    case 'leallitva':
      return {
        ...kozos,
        success: true,
        uzenet: `LEÁLLÍTVA. ${kozosVege} Az elkészült mentések MEGMARADTAK.`,
        teendo:
          'Nyomd meg újra a „Mentés most" gombot — a folytatás onnan veszi fel a fonalat, ahol ' +
          'abbahagytuk, a ma már kész hatóköröket kihagyja.',
      }
    case 'hiba':
      return {
        ...kozos,
        success: false,
        error: `A mentés MEGÁLLT egy hiba miatt. ${kozosVege}`,
        teendo:
          'Nyomd meg a „Kész-e a mentésre?" gombot — az két másodperc alatt megmondja, melyik ' +
          'előfeltétel hiányzik, mentés indítása nélkül.',
      }
    // ⚠️ KÉT, GYÖKERESEN KÜLÖNBÖZŐ ESET EGY OK ALATT (2026-08-11). A `nem_halad`
    //    azt jelenti, hogy az utolsó szelet EGYETLEN hatókört sem vitt ELŐRE.
    //    Ez kétféleképpen történhet, és a kettőnek MÁS a teendője:
    //      · hozzá sem tudtunk nyúlni (mindet egy másik futás tartja) — várni kell,
    //      · hozzányúltunk, de MIND elbukott — rendszerszintű baj, keresni kell.
    //    Ha mindkettőre azt írnánk, hogy „hozzá sem nyúlt", a második esetben a
    //    felület HAZUDNA: a tulajdonos a foglalást keresné ott, ahol valójában a
    //    tároló vagy a token halott.
    case 'nem_halad':
      if (sup.sikertelen > 0) {
        return {
          ...kozos,
          success: false,
          error:
            `A mentés MEGÁLLT: az utolsó szeletben ${sup.sikertelen} hatókör mentése ` +
            `MEGPRÓBÁLKOZOTT, és MIND elbukott — egyetlen sem készült el. ${kozosVege}`,
          teendo:
            'Ha EGYETLEN hatókör sem sikerül, az SOHA nem egy gyülekezet gondja, hanem ' +
            'rendszerszintű: lejárt Google-token, tele Drive, halott hálózat vagy adatbázis. ' +
            'A rendszer ezért állt meg — így nem küld több száz riasztó levelet, és nem terheli ' +
            'órákig az adatbázist reménytelen újrapróbálkozással. Nyomd meg a „Kész-e a mentésre?" ' +
            'gombot: az két másodperc alatt megnevezi a hiányzó előfeltételt. A „Részletek" ' +
            'blokkban NÉVVEL látod, melyik gyülekezetnél melyik lépés bukott.',
        }
      }
      return {
        ...kozos,
        success: false,
        error:
          `A mentés MEGÁLLT: egyetlen újabb hatókörhöz sem tudott hozzányúlni. ${kozosVege}` +
          (sup.foglalt > 0
            ? ` A hátralévőkből ${sup.foglalt} hatókört egy MÁSIK, éppen futó mentés tart a kezében.`
            : ''),
        teendo:
          sup.foglalt > 0
            ? 'Ez általában azt jelenti, hogy az éjszakai automatikus mentés éppen dolgozik rajtuk. ' +
              'Ha viszont egy korábbi futás megszakadt (telepítés, újraindulás), a foglalás magától ' +
              'felszabadul 15 perc után. Várj negyed órát, nyomd meg a „Frissítés" gombot, és ' +
              'indítsd újra a mentést.'
            : 'Ez rendszerszintű baj (tároló, hálózat vagy adatbázis), nem egy gyülekezet gondja. ' +
              'Nyomd meg a „Kész-e a mentésre?" gombot — az megnevezi a hiányzó előfeltételt.',
      }
    default:
      return {
        ...kozos,
        success: false,
        error: `A mentés elérte a futási korlátját, mielőtt végzett volna. ${kozosVege}`,
        teendo:
          'Nyomd meg újra a „Mentés most" gombot — a folytatás a ma már kész hatóköröket kihagyja.',
      }
  }
}

/**
 * ELINDÍTJA a teljes mentést a szerveren, és AZONNAL visszatér.
 *
 * ⚠️ NEM VÁRJA MEG a futást. Ez a lényeg: a kérés ezredmásodpercek alatt lezárul,
 *    tehát semmilyen proxy-időkorlátba nem ütközhet, a munka pedig a szerver
 *    folyamatában megy tovább akkor is, ha a böngésző eltűnik.
 */
export async function startBackupRunAction(): Promise<MentesFutasAllapot> {
  try {
    await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e: unknown) {
    return { fut: false, voltFutas: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const { startBackupRun } = await import('@/lib/backup/supervisor')
  // ⚠️ A visszatérési érték `indult` mezőjét SZÁNDÉKOSAN nem használjuk külön
  //    üzenetre: ha már futott, a felhasználó ugyanazt akarja látni — hol tart.
  //    Egy második kattintás így NEM indít második futást (és a `backup_log`
  //    sorára tett bérlet miatt egy MÁSIK folyamatból érkező indítás sem tudná
  //    ugyanazt a hatókört még egyszer lementeni).
  startBackupRun()
  revalidatePath(FELULET_UT)
  return futasAllapotOsszeallitas()
}

/** Hol tart a futás? A számok a `backup_log`-ból jönnek, nem emlékezetből. */
export async function getBackupRunStatusAction(): Promise<MentesFutasAllapot> {
  return futasAllapotOsszeallitas()
}

/**
 * Leállítást kér.
 *
 * ⚠️ A FUTÓ HATÓKÖR BEFEJEZŐDIK. Egy félbeszakított hatókör „fut" állapotban
 *    ragadt napló-sort hagyna maga után, ami a felületen sem késznek, sem
 *    hibásnak nem látszik — pontosan az a homály, amit ez a rendszer kerül.
 */
export async function stopBackupRunAction(): Promise<MentesFutasAllapot> {
  try {
    await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e: unknown) {
    return { fut: false, voltFutas: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const { requestBackupRunStop } = await import('@/lib/backup/supervisor')
  requestBackupRunStop()
  return futasAllapotOsszeallitas()
}

// ─────────────────────────────────────────────────────────────────────────────
// „KÉSZ-E A RENDSZER A MENTÉSRE?" — 2 másodperces próba, MENTÉS NÉLKÜL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Végigméri a mentés ELŐFELTÉTELEIT anélkül, hogy egyetlen bájtot is írna.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT (2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos aznap megnyomta a „Mentés most" gombot, és ennyit kapott:
 * „A biztonsági mentés futása sikertelen." A hiba az ELŐKÉSZÍTŐ fázisban
 * történt — vagyis pontosan az, amit ez a próba 2 másodperc alatt, NÉVVEL és
 * TEENDŐVEL megmutatott volna, mielőtt bárki 784 hatókörre elindít bármit.
 *
 * ⚠️ SEMMIT NEM ÍR. Nem foglal napló-sort, nem tölt fel fájlt, nem nyes.
 *    Ezért bármikor, bármennyiszer megnyomható — a mentés állapotát nem
 *    változtatja meg.
 */
export async function checkBackupReadinessAction(): Promise<MentesFutasEredmeny> {
  try {
    await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e: unknown) {
    return { success: false, error: hibaUzenet(e, 'Nincs jogosultság.') }
  }

  const { loadBackupKey } = await import('@/lib/backup/keys')
  const { classifyInventory, loadTableInventory } = await import('@/lib/backup/inventory')
  const { STORAGE_DRIVE, resolveBackupStorage } = await import('@/lib/backup/storage')
  const { jelolLepes, mentesTeendo, ujFutasLepesek, vagd } = await import('@/lib/backup/steps')

  const lepesek = ujFutasLepesek()
  const figyelmeztetesek: string[] = []

  try {
    loadBackupKey()
    jelolLepes(lepesek, 'kulcs', true)

    const inventory = await loadTableInventory(getSupabaseAdminClient())
    jelolLepes(lepesek, 'leltar', true, `${inventory.length} élő tábla`)

    // ⚠️ NEM az `assertInventoryClassified`-ot hívjuk, mert az az ELSŐ bajnál
    //    dob — itt viszont MINDEN bajt egyszerre akarunk megmutatni. Egy próba,
    //    ami csak az első hibáig lát, három körben derítené ki ugyanazt.
    const c = classifyInventory(inventory)
    const bajok: string[] = []
    if (c.besorolatlan.length > 0) {
      bajok.push(
        `BESOROLATLAN ÉLŐ TÁBLA (${c.besorolatlan.length} db): ${c.besorolatlan.join(', ')}`,
      )
    }
    if (c.szuroNelkul.length > 0) {
      bajok.push(
        `GYÜLEKEZETI TÁBLA ÉRVÉNYES SZŰRŐ NÉLKÜL (${c.szuroNelkul.length} db): ${c.szuroNelkul.join(', ')}`,
      )
    }
    if (bajok.length > 0) {
      jelolLepes(lepesek, 'besorolas', false, `${c.besorolatlan.length + c.szuroNelkul.length} tábla`)
      const uzenet = bajok.join(' — ')
      return {
        success: false,
        lepesek,
        error: 'A rendszer JELENLEG NEM TUD MENTENI: a tábla-besorolás hiányos.',
        reszlet: vagd(uzenet, 900),
        teendo: mentesTeendo(uzenet).szoveg,
        sqlFajl: mentesTeendo(uzenet).sql,
      }
    }
    jelolLepes(
      lepesek,
      'besorolas',
      true,
      `${c.gyulekezet.length} gyülekezeti + ${c.globalis.length} globális + ${c.kizart.length} kizárt tábla`,
    )
    if (c.retegNelkul.length > 0) {
      figyelmeztetesek.push(
        `${c.retegNelkul.length} tábla MENTÉSRE kerülne, de visszaállítani nem lehetne ` +
          `(nincs rétege): ${c.retegNelkul.slice(0, 15).join(', ')}` +
          (c.retegNelkul.length > 15 ? ' …' : ''),
      )
    }

    const storage = await resolveBackupStorage()
    jelolLepes(lepesek, 'tarolo', true, storage.nev)
    if (storage.nev !== STORAGE_DRIVE) {
      figyelmeztetesek.push(
        `A mentés NEM a Google Drive-ra menne, hanem ide: „${storage.nev}" — ugyanabba a ` +
          'felhő-fiókba, ahol az adatbázis is van. Kösd össze a Google Drive-ot.',
      )
    }

    const anyag = await loadRecoveryKeyMaterial()
    const vanLetet = anyag.publicRaw !== null && anyag.wrappedPrivate !== null
    // ⚠️ 2026-08-11 JAVÍTÁS: a hiányzó letét `false`-t kapott, vagyis a felület
    //    PIROS KERESZTET rajzolt rá „ITT HIBÁZOTT" szöveggel — egy ZÖLD dobozban,
    //    aminek a fejléce közben azt mondta: „A rendszer KÉSZ a mentésre".
    //    Két, egymásnak ellentmondó állítás egy dobozban. A hiányzó mentési
    //    jelszó nem akadálya a mentésnek, csak a jelszavas MEGNYITÁSNAK — ezért
    //    figyelmeztetés, nem bukás. A súlyt a `figyelmeztetesek` tömb viszi.
    jelolLepes(
      lepesek,
      'helyreallito',
      vanLetet ? true : 'figyelmeztetes',
      vanLetet ? 'van kulcs-letét' : 'nincs mentési jelszó',
    )
    if (!vanLetet) {
      figyelmeztetesek.push(
        'NINCS HELYREÁLLÍTÓ KULCS: a mentések KIZÁRÓLAG a szerver kulcsával nyílnának. ' +
          'Állíts be MENTÉSI JELSZÓT — az hozza létre a helyreállító kulcspárt.',
      )
    }

    const supabase = getSupabaseAdminClient()
    const { count, error: congError } = await supabase
      .from('congregations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    if (congError) {
      jelolLepes(lepesek, 'hatokorok', false, congError.message)
      return {
        success: false,
        lepesek,
        figyelmeztetesek,
        error: 'A gyülekezetek listája nem olvasható.',
        reszlet: vagd(congError.message, 400),
        teendo: mentesTeendo(`gyülekezetek listája: ${congError.message}`).szoveg,
      }
    }
    const osszes = (count ?? 0) + 1 // + a rendszerszintű (globális) hatókör
    jelolLepes(lepesek, 'hatokorok', true, `${osszes} hatókör`)

    // A két utolsó lépés a VALÓDI futásé — itt szándékosan jelöletlen marad.
    return {
      success: true,
      lepesek,
      figyelmeztetesek: figyelmeztetesek.length > 0 ? figyelmeztetesek : undefined,
      osszes,
      uzenet:
        `A rendszer KÉSZ a mentésre: ${osszes} hatókör, ${c.gyulekezet.length + c.globalis.length} ` +
        `mentendő tábla, tároló: ${storage.nev}.` +
        (figyelmeztetesek.length > 0
          ? ` ${figyelmeztetesek.length} figyelmeztetés van — nézd meg őket.`
          : ''),
    }
  } catch (e: unknown) {
    const uzenet = hibaUzenet(e, 'ismeretlen hiba')
    const bukott = lepesek.find((l) => l.ok === null)
    if (bukott) bukott.ok = false
    return {
      success: false,
      lepesek,
      figyelmeztetesek: figyelmeztetesek.length > 0 ? figyelmeztetesek : undefined,
      error: 'A rendszer JELENLEG NEM TUD MENTENI.',
      reszlet: vagd(uzenet, 900),
      teendo: mentesTeendo(uzenet).szoveg,
      sqlFajl: mentesTeendo(uzenet).sql,
    }
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
