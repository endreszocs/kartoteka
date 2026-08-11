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
  MentesFutasEredmeny,
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
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EGY HÍVÁS = EGY SZELET (2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 * 784 hatókör EGY kérésbe nem fér bele (nagyságrendileg 150 000 adatbázis-
 * körfordulás, órákban mérve). Ez az akció ezért egy SZELETET futtat le, és
 * megmondja, MENNYI MARADT (`hatralevo`). A felület addig hívja újra, amíg
 * `futottVegig` nem lesz — a napi kulcs miatt minden újabb szelet pontosan ott
 * folytatja, ahol az előző abbahagyta, és A MÁR ELKÉSZÜLT MENTÉSEK MEGMARADNAK.
 *
 * ⚠️ MIÉRT NEM EGY HOSSZÚ HÍVÁS. Egy 15 percig nyitva tartott szerver-akció
 *    alatt a böngésző kapcsolata elhal, a service worker `no-response` hibát
 *    dob, és a felhasználó SEMMILYEN visszajelzést nem kap — miközben a szerver
 *    esetleg dolgozik tovább. Rövid szeletekkel a haladás LÁTHATÓ, és bármikor
 *    megszakítható anélkül, hogy a kész munka elveszne.
 */
export async function runBackupNowAction(): Promise<MentesFutasEredmeny> {
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
      // A felületről indított szelet 4 percre van tervezve (`KEZI_IDOKERET_MS`);
      // 6 perc bőven elég a rendezett megállásra és a válasz összeállítására.
      // ⚠️ NEM emelendő 15 percre: egy negyed óráig nyitva tartott kapcsolat
      //    alatt a böngésző oldali kérés elhal, és a service worker
      //    `no-response` hibát dob — a felhasználó pedig SEMMIT nem lát.
      signal: AbortSignal.timeout(360_000),
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

    // ⚠️ 2026-08-11 JAVÍTÁS — ITT VESZETT EL A DIAGNÓZIS.
    //    A korábbi `WorkerValasz` típus CSAK az `ok`/`sikeres`/`sikertelen`/
    //    `kihagyva`/`error` mezőket ismerte. A végpont közben a `reszlet`
    //    mezőben elküldte a VALÓDI hibát („BESOROLATLAN ÉLŐ TÁBLA (17 db): …"),
    //    a `figyelmeztetesek`-et és a hatókörönkénti hibákat is — a
    //    `response.json()` után mind némán a szemétbe ment, és a tulajdonos
    //    csak ennyit látott: „A biztonsági mentés futása sikertelen."
    //    Egy MENTÉS-funkciónál ez a legrosszabb hibaosztály.
    type WorkerValasz = {
      /** A SZELET elvégezte a dolgát (haladt). NEM azt jelenti, hogy minden sikerült. */
      ok?: boolean
      /** MINDEN hatókör sikerült ebben a szeletben. Ebből lesz a piros jelentés. */
      mindenSikeres?: boolean
      sikeres?: number
      sikertelen?: number
      kihagyva?: number
      osszes?: number
      feldolgozva?: number
      hatralevo?: number
      futottVegig?: boolean
      error?: string
      reszlet?: string
      teendo?: string
      sqlFajl?: string | null
      lepesek?: MentesLepes[]
      figyelmeztetesek?: string[]
      hatokorok?: Array<{
        scope?: string
        nev?: string | null
        ok?: boolean
        kihagyva?: boolean
        stage?: string | null
        hiba?: string | null
        teendo?: string | null
        lepesek?: MentesLepes[]
      }>
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

    // A bukott hatókörök NÉVVEL — nem UUID-vel. A gyülekezet azonosítója belső
    // adat és a lelkésznek zaj; a NÉV az, amiből cselekedni lehet.
    const bukottak = (torzs.hatokorok ?? [])
      .filter((h) => h && h.ok !== true && h.kihagyva !== true)
      .map((h) => ({
        scope: String(h.scope ?? 'gyulekezet'),
        nev: h.nev ?? null,
        stage: h.stage ?? null,
        hiba: h.hiba ?? null,
        teendo: h.teendo ?? null,
        lepesek: h.lepesek,
      }))

    const sikertelen = Number(torzs.sikertelen ?? 0)
    const kozos = {
      lepesek: torzs.lepesek,
      reszlet: torzs.reszlet,
      teendo: torzs.teendo,
      sqlFajl: torzs.sqlFajl ?? null,
      osszes: torzs.osszes,
      sikeres: torzs.sikeres,
      sikertelen: torzs.sikertelen,
      kihagyva: torzs.kihagyva,
      hatralevo: torzs.hatralevo,
      futottVegig: torzs.futottVegig,
      // ⚠️ 2026-08-11: a végpont KÉT külön kérdésre válaszol. Az `ok` = „a szelet
      //    elvégezte a dolgát" (ebből dönt a felület a FOLYTATÁSRÓL), a
      //    `mindenSikeres` = „minden hatókör sikerült" (ebből lesz a piros
      //    jelentés). A régi kód a kettőt összemosta, és egyetlen bukott
      //    gyülekezet megállította a maradék ~700 mentését.
      mindenSikeres: torzs.mindenSikeres ?? sikertelen === 0,
      figyelmeztetesek: torzs.figyelmeztetesek,
      bukottak: bukottak.length > 0 ? bukottak : undefined,
    }

    // ⚠️ CSAK a SZELET bukása állítja meg a futást (hitelesítés, előkészítő fázis,
    //    vagy „a szelet semmit nem vitt el"). A hatókör-hibák NEM: azokat a
    //    jelentés mutatja, de a következő szelet elindul.
    if (!response.ok || torzs.ok === false) {
      return {
        ...kozos,
        success: false,
        error:
          torzs.error ??
          `A mentés futása nem sikerült (${torzs.sikertelen ?? '?'} hatókör bukott el). Nézd meg alább, melyik.`,
      }
    }

    // ⚠️ A „kihagyva" IS KIMONDANDÓ. A napi kulcs miatt egy aznap már igazolt
    //    hatókör nem fut újra — enélkül a felhasználó egy „0 hatókör igazolva"
    //    üzenetet kapna, és azt hinné, semmi nem működik.
    // ⚠️ A „hátravan" IS KIMONDANDÓ. Egy szelet a 784-ből csak részt visz el;
    //    ha ezt elhallgatnánk, a tulajdonos késznek hinné a mentést.
    // ⚠️ A „bukott" IS KIMONDANDÓ — a szelet attól még lefutott.
    const kihagyva = Number(torzs.kihagyva ?? 0)
    const hatralevo = Number(torzs.hatralevo ?? 0)
    return {
      ...kozos,
      success: true,
      uzenet:
        `${torzs.sikeres ?? '?'} hatókör igazolva` +
        (kihagyva > 0 ? `, ${kihagyva} kihagyva (ma már készült róluk igazolt mentés)` : '') +
        (sikertelen > 0 ? `, ${sikertelen} ELBUKOTT` : '') +
        (hatralevo > 0
          ? `. MÉG ${hatralevo} HATÓKÖR HÁTRAVAN — a folytatás ott veszi fel a fonalat, ahol ez abbahagyta.`
          : `. Ez a futás VÉGIGMENT mind a ${torzs.osszes ?? '?'} hatókörön.`),
    }
  } catch (e: unknown) {
    // Időtúllépés és hálózati bukás: a mentés állapota ISMERETLEN — a szerver
    // esetleg dolgozik tovább. Ezt KIMONDJUK, nem hallgatjuk el.
    const idotullepes = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      success: false,
      error: idotullepes
        ? 'A mentés-motor nem válaszolt időben. A futás állapota ISMERETLEN — lehet, hogy a ' +
          'szerveren tovább dolgozik. Frissítsd az oldalt, és nézd meg a „Mentési előzmény" ' +
          'listát: ami elkészült, ott IGAZOLTKÉNT látszik.'
        : `A mentés-motor nem érhető el: ${hibaUzenet(e, 'ismeretlen hiba')}`,
      teendo: idotullepes
        ? 'Várj egy percet, nyomd meg a „Frissítés" gombot, majd indítsd újra a mentést — a már ' +
          'elkészült hatóköröket kihagyja.'
        : undefined,
    }
  }
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
