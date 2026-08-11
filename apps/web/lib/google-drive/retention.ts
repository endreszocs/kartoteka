import 'server-only'

/**
 * MEGŐRZÉS ÉS NYESÉS (2026-08-11).
 *
 * ─── A SZABÁLY ─────────────────────────────────────────────────────────────
 *   napi          14   az utolsó 14 nap minden `napi` futása
 *   heti           8   az utolsó 8 ISO-hét legfrissebb futása
 *   havi           6   az utolsó 6 hónap legfrissebb futása
 *   pre_restore   90 nap  — a nyesés NEM nyúl hozzá (ez az „undo")
 *   kezi          30 nap
 *
 * ─── HÁROM SZABÁLY, AMIT SOHA NEM SÉRTÜNK MEG ──────────────────────────────
 *  1) ⛔ `files.delete` — VÉGLEGES. SOHA `files.update(trashed=true)`:
 *     a Drive Kukája 30 napig őriz, és a 14 napos ígéret némán 44 nappá válna.
 *  2) Amit a nyeső NEM TUD BESOROLNI, azt SOHA nem törli — csak JELENTI.
 *     Egy ismeretlen fájl lehet a következő verzió mentése; a törlés
 *     visszafordíthatatlan, a jelentés nem.
 *  3) Nem töröl, ha utána 7-nél kevesebb IGAZOLT mentés maradna abban a
 *     hatókörben. A tárhely olcsó; az adat nem.
 *
 * ─── A MÉDIA-FÁJL ──────────────────────────────────────────────────────────
 * A fényképek külön fájlban vannak, és ha a tartalmuk nem változott, több napi
 * mentés UGYANARRA a Drive-fájlra hivatkozik. Ezért a média-fájl CSAK akkor
 * törölhető, ha EGYETLEN megtartott sor sem hivatkozik rá. Ennek elmulasztása
 * a legcsúnyább hibaosztály: a mentés „megvan", de a fényképek eltűntek belőle.
 *
 * ─── MIKOR NEM NYESÜNK ─────────────────────────────────────────────────────
 * Ha a MAI futásból van hibás vagy befejezetlen hatókör, aznap SEMMIT nem
 * törlünk. Régi mentést eldobni egy olyan napon, amikor az új nem sikerült,
 * pontosan az a lépés, ami az adatvesztést befejezetté teszi.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveBackupStorage, resolveBackupStorageByName } from '@/lib/backup/storage'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { bukarestiNap } from './health'
import { isMissingTableError, loadBackupSettingsView } from './settings'
import {
  KEZI_MEGORZES_NAP,
  MINIMUM_MEGTARTOTT,
  PRE_RESTORE_MEGORZES_NAP,
  RETENTION_DEFAULT,
  type DriveReconciliation,
  type PruneResult,
  type RetentionConfig,
} from './types'

interface PruneRow {
  id: number
  scope: 'gyulekezet' | 'globalis'
  congregation_id: string | null
  kind: 'napi' | 'kezi' | 'pre_restore'
  run_date: string
  started_at: string
  finished_at: string | null
  status: 'fut' | 'ok' | 'hiba'
  drive_verified_at: string | null
  storage_nev: string | null
  drive_file_id: string | null
  media_drive_file_id: string | null
  pruned_at: string | null
}

const PRUNE_COLUMNS =
  'id, scope, congregation_id, kind, run_date, started_at, finished_at, status, ' +
  'drive_verified_at, storage_nev, drive_file_id, media_drive_file_id, pruned_at'

/**
 * Biztonsági plafon a napló betöltésére. Efölött a nyesés HANGOS hibával áll
 * meg, mert egy RÉSZLEGES napló alapján törölni adatvesztés: a nem látott sorok
 * hivatkozásait nem tudnánk megvédeni.
 */
const PRUNE_MAX_ROWS = 200_000

/** ISO-8601 hétkulcs ('YYYY-Www') — a hét CSÜTÖRTÖKJE dönti el az évet. */
function isoHetKulcs(nap: string): string {
  const [y, m, d] = nap.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  const napSorszam = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - napSorszam)
  const evKezdet = Date.UTC(dt.getUTCFullYear(), 0, 1)
  const het = Math.ceil(((dt.getTime() - evKezdet) / 86_400_000 + 1) / 7)
  return `${dt.getUTCFullYear()}-W${String(het).padStart(2, '0')}`
}

function honapKulcs(nap: string): string {
  return nap.slice(0, 7)
}

function scopeKulcs(row: PruneRow): string {
  return row.scope === 'globalis' ? 'globalis' : `gy:${row.congregation_id ?? 'ismeretlen'}`
}

function napokKoraban(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

/**
 * A MEGTARTANDÓ napló-sorok azonosítói egy hatókörön belül.
 * Tiszta függvény — teszthető, és a szabály egyetlen helyen van leírva.
 */
export function megtartandoSorok(rows: PruneRow[], retention: RetentionConfig): Set<number> {
  const megtart = new Set<number>()

  // Nem igazolt / futó sorokat SOHA nem nyesünk: vagy épp most futnak, vagy
  // egy hiba bizonyítékai. A nyesés nem tünteti el a rossz híreket.
  for (const r of rows) {
    if (r.status !== 'ok' || !r.drive_verified_at) megtart.add(r.id)
  }

  const preRestore = rows.filter((r) => r.kind === 'pre_restore')
  for (const r of preRestore) {
    if (napokKoraban(r.finished_at ?? r.started_at) < PRE_RESTORE_MEGORZES_NAP) megtart.add(r.id)
  }

  const kezi = rows.filter((r) => r.kind === 'kezi')
  for (const r of kezi) {
    if (napokKoraban(r.finished_at ?? r.started_at) < KEZI_MEGORZES_NAP) megtart.add(r.id)
  }

  const napi = rows
    .filter((r) => r.kind === 'napi' && r.status === 'ok' && r.drive_verified_at)
    .sort((a, b) => (a.run_date < b.run_date ? 1 : a.run_date > b.run_date ? -1 : b.id - a.id))

  // 1) az utolsó N nap MINDEN futása
  const napok: string[] = []
  for (const r of napi) {
    if (!napok.includes(r.run_date)) napok.push(r.run_date)
  }
  const megtartottNapok = new Set(napok.slice(0, retention.napi))
  for (const r of napi) {
    if (megtartottNapok.has(r.run_date)) megtart.add(r.id)
  }

  // 2) hetente a legfrissebb, az utolsó N ISO-hétből
  const hetiElso = new Map<string, PruneRow>()
  for (const r of napi) {
    const k = isoHetKulcs(r.run_date)
    if (!hetiElso.has(k)) hetiElso.set(k, r)
  }
  for (const r of [...hetiElso.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, retention.heti)) {
    megtart.add(r[1].id)
  }

  // 3) havonta a legfrissebb, az utolsó N hónapból
  const haviElso = new Map<string, PruneRow>()
  for (const r of napi) {
    const k = honapKulcs(r.run_date)
    if (!haviElso.has(k)) haviElso.set(k, r)
  }
  for (const r of [...haviElso.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, retention.havi)) {
    megtart.add(r[1].id)
  }

  return megtart
}

export interface PruneOptions {
  /** true → semmit nem töröl, csak megmondja, mit törölne. */
  szarazFutas?: boolean
  /** Csak ezekre a hatókörökre (kerületi admin). `null` = mind. */
  congregationIds?: string[] | null
}

/**
 * A nyesés. Sorosan dolgozik, és a hibát NEM nyeli el: ha egy fájl törlése
 * elhasal, azt jelenti, de a többivel folytatja (a félbehagyott nyesés
 * legrosszabb esetben helyet foglal — a félbehagyott törlés adatot vesztene).
 */
export async function pruneOldBackups(options: PruneOptions = {}): Promise<PruneResult> {
  const supabase: SupabaseClient = getSupabaseAdminClient()
  const ures: PruneResult = { success: true, torolt: 0, megtartott: 0, ismeretlenFajlok: [] }

  const settings = await loadBackupSettingsView(supabase)
  if (settings.needsSql) {
    return { ...ures, success: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
  }
  if (settings.error || !settings.view) {
    return { ...ures, success: false, error: settings.error ?? 'A mentési beállítások nem olvashatók.' }
  }
  const retention = settings.view.retention ?? RETENTION_DEFAULT

  // ⚠️ A NYESÉS NEM DRIVE-SPECIFIKUS. Korábban itt „a Drive nincs összekötve"
  //    hibával kilépett — vagyis Drive nélkül a Supabase Storage-ba került
  //    mentések SOHA nem nyesődtek, a vödör pedig csendben hízott. A tároló-
  //    porton keresztül mindkét háttér ugyanúgy takarítható.
  let aktualisTarolo
  try {
    aktualisTarolo = await resolveBackupStorage()
  } catch (e: unknown) {
    return {
      ...ures,
      success: false,
      error: `A mentés-tároló nem érhető el: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`,
    }
  }

  // ── A mai nap ellenőrzése: bukott futás mellett SEMMIT nem törlünk ──
  const ma = bukarestiNap()
  const { data: maiSorok, error: maiHiba } = await supabase
    .from('backup_log')
    .select('status, drive_verified_at')
    .eq('run_date', ma)
    .eq('kind', 'napi')
  if (maiHiba && !isMissingTableError(maiHiba)) {
    return { ...ures, success: false, error: `A mai futás nem ellenőrizhető: ${maiHiba.message}` }
  }
  const maiBukott = (maiSorok ?? []).some(
    (r) => (r as { status: string }).status !== 'ok' || !(r as { drive_verified_at: string | null }).drive_verified_at,
  )
  if (maiBukott) {
    return {
      ...ures,
      megjegyzes:
        'A mai futásban van hibás vagy befejezetlen mentés, ezért ma SEMMIT nem törlünk. ' +
        'Előbb a hibát kell rendbe tenni.',
    }
  }

  // ── A teljes napló betöltése (a nyesés a TELJES előzményből dolgozik) ──
  //
  // ⚠️ LAPOZOTT OLVASÁS, KÖTELEZŐEN. A PostgREST 1000 sor fölött NÉMÁN csonkol,
  //    és pont ez az a hely, ahol a részleges listából TÖRLÜNK: a nem látott
  //    napló-sorok média-hivatkozásai nem kerülnének a védett halmazba, tehát
  //    egy még használatban lévő fényképfájlt véglegesen kitörölnénk. A
  //    „14 napos ablak" is a lista TETEJÉHEZ képest számolódna — ami a csonkolt
  //    listában 1000 sorral ezelőtti állapotot jelentene.
  let query = supabase.from('backup_log').select(PRUNE_COLUMNS)
  if (options.congregationIds != null) {
    if (options.congregationIds.length === 0) return ures
    query = query.in('congregation_id', options.congregationIds)
  }
  const paged = await selectAllPaged<PruneRow>(query, { maxRows: PRUNE_MAX_ROWS })
  if (paged.error) {
    if (isMissingTableError(paged.error as { message?: string; code?: string })) {
      return { ...ures, success: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
    }
    // A `truncated` ág is ITT végződik, és ez SZÁNDÉKOS: részleges naplóból
    // SOHA nem törlünk.
    return { ...ures, success: false, error: paged.error.message }
  }
  const rows = paged.data

  // ── Hatókörönként: mit tartunk meg ──
  const csoportok = new Map<string, PruneRow[]>()
  for (const r of rows) {
    const k = scopeKulcs(r)
    const lista = csoportok.get(k)
    if (lista) lista.push(r)
    else csoportok.set(k, [r])
  }

  const megtartAll = new Set<number>()
  const dobandoRows: PruneRow[] = []
  const megjegyzesek: string[] = []

  for (const [kulcs, csoportRows] of csoportok) {
    const megtart = megtartandoSorok(csoportRows, retention)
    const dobando = csoportRows.filter((r) => !megtart.has(r.id) && !r.pruned_at)
    const megmaradoIgazolt = csoportRows.filter(
      (r) => megtart.has(r.id) && r.status === 'ok' && r.drive_verified_at && !r.pruned_at,
    ).length

    if (dobando.length > 0 && megmaradoIgazolt < MINIMUM_MEGTARTOTT) {
      // Fék: inkább maradjon a régi, mint hogy 7 alá csússzunk.
      for (const r of csoportRows) megtartAll.add(r.id)
      megjegyzesek.push(
        `${kulcs}: a törlés után ${megmaradoIgazolt} igazolt mentés maradna (a minimum ${MINIMUM_MEGTARTOTT}), ezért itt nem töröltünk.`,
      )
      continue
    }

    for (const id of megtart) megtartAll.add(id)
    dobandoRows.push(...dobando)
  }

  // ── MÉDIA-FÁJL: csak akkor törölhető, ha SEMMI megtartott nem hivatkozik rá ──
  const megtartottMedia = new Set<string>()
  for (const r of rows) {
    if ((megtartAll.has(r.id) || r.pruned_at) && r.media_drive_file_id) {
      megtartottMedia.add(r.media_drive_file_id)
    }
  }

  // A törlendő fájlok TÁROLÓNKÉNT csoportosítva: a `fileId` jelentése
  // tárolónként más, ezért a törlést is a SAJÁT tárolójában kell elvégezni.
  const torlendoFajlok = new Map<string, Set<string>>()
  const felvesz = (tarolo: string | null, fileId: string) => {
    const kulcs = tarolo ?? ''
    const lista = torlendoFajlok.get(kulcs)
    if (lista) lista.add(fileId)
    else torlendoFajlok.set(kulcs, new Set([fileId]))
  }
  for (const r of dobandoRows) {
    if (r.drive_file_id) felvesz(r.storage_nev, r.drive_file_id)
    if (r.media_drive_file_id && !megtartottMedia.has(r.media_drive_file_id)) {
      felvesz(r.storage_nev, r.media_drive_file_id)
    }
  }
  const torlendoDarab = [...torlendoFajlok.values()].reduce((n, s) => n + s.size, 0)

  // ── ISMERETLEN FÁJLOK: felderítés, de SOHA nem törlés ──
  const ismeretlenFajlok: string[] = []
  try {
    const tarolt = await aktualisTarolo.listFiles()
    const ismertIdk = new Set<string>()
    for (const r of rows) {
      if (r.drive_file_id) ismertIdk.add(r.drive_file_id)
      if (r.media_drive_file_id) ismertIdk.add(r.media_drive_file_id)
    }
    for (const f of tarolt) {
      if (!ismertIdk.has(f.fileId)) ismeretlenFajlok.push(f.fileName)
    }
  } catch (e: unknown) {
    megjegyzesek.push(
      `A mentési mappa nem listázható, ezért az ismeretlen fájlok felderítése kimaradt: ${
        e instanceof Error ? e.message : 'ismeretlen hiba'
      }`,
    )
  }

  if (options.szarazFutas) {
    return {
      success: true,
      torolt: 0,
      megtartott: megtartAll.size,
      ismeretlenFajlok,
      megjegyzes:
        `Száraz futás: ${torlendoDarab} mentés-fájl törlődne, ${dobandoRows.length} napló-sor kerülne „nyesett" állapotba.` +
        (megjegyzesek.length ? ` ${megjegyzesek.join(' ')}` : ''),
    }
  }

  // ── TÖRLÉS — MINDIG ABBAN A TÁROLÓBAN, AHOVÁ A FÁJL KERÜLT ──
  let torolt = 0
  const torlesiHibak: string[] = []
  for (const [taroloNev, fajlok] of torlendoFajlok) {
    let tarolo
    try {
      tarolo = taroloNev ? await resolveBackupStorageByName(taroloNev) : aktualisTarolo
    } catch (e: unknown) {
      torlesiHibak.push(
        `a(z) „${taroloNev}" tároló nem érhető el: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`,
      )
      continue
    }
    for (const fileId of fajlok) {
      try {
        await tarolo.deleteFilePermanently(fileId)
        torolt += 1
      } catch (e: unknown) {
        torlesiHibak.push(e instanceof Error ? e.message : 'ismeretlen hiba')
      }
    }
  }

  // A napló-sor MEGMARAD (ő a mentések katalógusa), csak `pruned_at`-ot kap.
  // Így az előzmény olvasható marad, az egyeztetés pedig nem jelenti hiányzónak.
  //
  // ⚠️ CSAK HIBÁTLAN TÖRLÉS UTÁN. A `pruned_at` azt állítja, hogy a fájl MÁR
  //    NINCS — a letöltő végpont emiatt 410-et ad rá. Ha a törlés elhasalt, ez
  //    a jelölés HAZUDNA: a fájl ott lenne, a rendszer mégis megtagadná a
  //    letöltését. Inkább maradjon jelöletlen, és a következő nyesés próbálja újra.
  if (dobandoRows.length > 0 && torlesiHibak.length === 0) {
    const nyesettAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('backup_log')
      .update({ pruned_at: nyesettAt })
      .in(
        'id',
        dobandoRows.map((r) => r.id),
      )
    if (updateError) torlesiHibak.push(`a napló nyesett-jelölése nem sikerült: ${updateError.message}`)
  }

  const megjegyzes = [...megjegyzesek]
  if (ismeretlenFajlok.length > 0) {
    megjegyzes.push(
      `${ismeretlenFajlok.length} ismeretlen fájl van a mentési mappában — ezeket SOHA nem töröljük automatikusan.`,
    )
  }

  return {
    success: torlesiHibak.length === 0,
    error: torlesiHibak.length > 0 ? `Nem minden törlés sikerült: ${torlesiHibak.slice(0, 3).join('; ')}` : undefined,
    torolt,
    megtartott: megtartAll.size,
    ismeretlenFajlok: ismeretlenFajlok.slice(0, 50),
    megjegyzes: megjegyzes.length > 0 ? megjegyzes.join(' ') : undefined,
  }
}

/**
 * NAPLÓ ⇄ DRIVE EGYEZTETÉS.
 *
 * A `drive.file` hatókör mellett a kézzel elmozgatott vagy törölt fájl az
 * alkalmazás számára EGYSZERŰEN ELTŰNIK — hibaüzenet nélkül. Ez nem maradhat
 * néma: ha a napló szerint 28 fájlnak kell lennie és a Drive 19-et ad, azt
 * a felület és a riasztó e-mail is kimondja.
 */
export async function reconcileDrive(options: {
  congregationIds?: string[] | null
} = {}): Promise<DriveReconciliation> {
  const ures: DriveReconciliation = {
    futott: false,
    naploSzerint: 0,
    driveOn: 0,
    hianyzo: 0,
    ismeretlen: 0,
    hiba: null,
  }

  try {
    const supabase = getSupabaseAdminClient()
    const settings = await loadBackupSettingsView(supabase)
    if (settings.needsSql) return { ...ures, hiba: 'A mentés-rendszer SQL-migrációja még nem futott le.' }

    const tarolo = await resolveBackupStorage()

    // ⚠️ LAPOZOTT OLVASÁS: 1000 napló-sor fölött a PostgREST némán csonkolt
    //    volna, és az egyeztetés a NEM LÁTOTT fájlokat jelentette volna
    //    „ismeretlen"-nek — vagyis pont az a jelzés vált volna hazuggá, ami a
    //    kézzel elmozgatott fájlokat hivatott felderíteni. 60 gyülekezetnél ez
    //    kb. 17 nap alatt következik be.
    let query = supabase
      .from('backup_log')
      .select('id, storage_nev, drive_file_id, media_drive_file_id')
      .is('pruned_at', null)
      .not('drive_file_id', 'is', null)
    if (options.congregationIds != null) {
      if (options.congregationIds.length === 0) return { ...ures, futott: true }
      query = query.in('congregation_id', options.congregationIds)
    }
    const paged = await selectAllPaged<{
      id: number
      storage_nev: string | null
      drive_file_id: string | null
      media_drive_file_id: string | null
    }>(query, { maxRows: PRUNE_MAX_ROWS })
    if (paged.error) {
      if (isMissingTableError(paged.error as { message?: string; code?: string })) {
        return { ...ures, hiba: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
      }
      return { ...ures, hiba: paged.error.message }
    }

    // CSAK az AKTUÁLIS tárolóba írt sorokat vetjük össze a tároló tartalmával:
    // egy korábbi tárolóba írt fájl „hiánya" itt nem hiba, hanem a történet.
    const varhatoIdk = new Set<string>()
    const masTaroloban = new Set<string>()
    const hianyzoMedia = new Set<string>()
    for (const row of paged.data) {
      const sajat = !row.storage_nev || row.storage_nev === tarolo.nev
      if (row.drive_file_id) {
        if (sajat) varhatoIdk.add(row.drive_file_id)
        else masTaroloban.add(row.drive_file_id)
      }
      if (row.media_drive_file_id && sajat) varhatoIdk.add(row.media_drive_file_id)
    }

    const tarolt = await tarolo.listFiles()
    const taroltIdk = new Set(tarolt.map((f) => f.fileId))

    let hianyzo = 0
    for (const id of varhatoIdk) if (!taroltIdk.has(id)) hianyzo += 1
    // A MÉDIA-hiányt külön is számoljuk: az a mentéseket „zöldnek" hagyja, de a
    // visszaállítás (helyesen) meg fog tagadni — ezt külön kell kimondani.
    for (const row of paged.data) {
      if (
        row.media_drive_file_id &&
        (!row.storage_nev || row.storage_nev === tarolo.nev) &&
        !taroltIdk.has(row.media_drive_file_id)
      ) {
        hianyzoMedia.add(row.media_drive_file_id)
      }
    }
    let ismeretlen = 0
    for (const id of taroltIdk) if (!varhatoIdk.has(id)) ismeretlen += 1

    return {
      futott: true,
      naploSzerint: varhatoIdk.size,
      driveOn: taroltIdk.size,
      hianyzo,
      hianyzoMedia: hianyzoMedia.size,
      masTaroloban: masTaroloban.size,
      ismeretlen,
      hiba: null,
    }
  } catch (e: unknown) {
    return { ...ures, hiba: e instanceof Error ? e.message : 'Ismeretlen hiba az egyeztetés közben.' }
  }
}
