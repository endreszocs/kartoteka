import 'server-only'

/**
 * A NAPI MENTÉS-FUTÁS (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ EGYSÉG A GYÜLEKEZET
 * ════════════════════════════════════════════════════════════════════════════
 * Nincs egyetlen óriási országos fájl. Ha a 43. gyülekezetnél elszáll a futás,
 * az eredmény nem „az országos mentés talán jó", hanem: 42 IGAZOLT és 18
 * HIÁNYZIK, NÉVVEL. Ez az egyetlen jelentés, amiből a tulajdonos tud cselekedni.
 *
 * A „rendszergazdai teljes mentés" = az adott nap ÖSSZES gyülekezeti fájlja
 * PLUSZ egy `globalis` fájl (referencia-adat + bérlő-váz).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * IDEMPOTENCIA — NAP-KULCCSAL, NEM ZÁR-TÁNCCAL
 * ════════════════════════════════════════════════════════════════════════════
 * A `backup_log` egyedi indexe (`scope`, `congregation_id`, `run_date`, ahol
 * `kind='napi'`) miatt egy napra hatókörönként EGY sor lehet. A második futás
 * vagy KIHAGYJA a hatókört (ha már van igazolt mentés), vagy ÚJRAPRÓBÁLJA
 * (ha a korábbi elhasalt). Nem kell claim/lease/heartbeat hármas, nem kell
 * árva-seprés: a napi kulcs mindkettőt kiváltja.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A NAPLÓNAK EGYETLEN ÍRÓJA VAN — EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Az `export.ts` semmit nem ír a `backup_log`-ba. Így a hibaágon SEM maradhat
 * lezáratlan „fut" sor: a claim és a lezárás ugyanabban a `try/finally`-ban él.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

import { sendBackupFailureAlert } from './alerts'
import { exportScope, type RecoveryEscrow } from './export'
import {
  assertInventoryClassified,
  computeSchemaFingerprint,
  loadTableInventory,
} from './inventory'
import { loadBackupKey } from './keys'
import { bucharestRunDate } from './payload'
import { STORAGE_DRIVE, resolveBackupStorage } from './storage'
import type {
  BackupAlerter,
  BackupFailureStage,
  BackupKind,
  BackupScope,
  BackupScopeResult,
  BackupStorage,
  BackupWorkerResult,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Riasztó-port — az `alerts.ts` köti be magát
// ─────────────────────────────────────────────────────────────────────────────

let alerter: BackupAlerter | null = null

/**
 * Felülírja az alapértelmezett riasztót. ⚠️ CSAK TESZTHEZ.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11 JAVÍTÁS — MIÉRT NEM VÁRUNK TÖBBÉ BEKÖTÉSRE
 * ════════════════════════════════════════════════════════════════════════════
 * A korábbi terv szerint valakinek meg kellett volna hívnia egyszer a
 * `setBackupAlerter(...)`-t a valódi riasztóval.
 * Ezt SENKI nem hívta meg. Az eredmény: minden bukott mentés csendben maradt —
 * se e-mail, se harang —, és a hibáról szóló mondat annak a napló-sornak a
 * `figyelmeztetesek` mezőjébe került, amelyik éppen bukott. Vagyis a riasztás
 * arról, hogy nincs riasztás, ott lakott, ahová senki nem néz.
 *
 * Ezért az ALAPÉRTELMEZÉS mostantól a valódi, működő riasztó
 * (`./alerts.ts → sendBackupFailureAlert`), és ez a beállító csak felülír.
 */
export function setBackupAlerter(fn: BackupAlerter): void {
  alerter = fn
}

/** Visszaáll az ALAPÉRTELMEZETT (valódi) riasztóra. */
export function clearBackupAlerter(): void {
  alerter = null
}

/** A ténylegesen használandó riasztó. Soha nem `null`. */
function aktivRiaszto(): BackupAlerter {
  return alerter ?? sendBackupFailureAlert
}

// ─────────────────────────────────────────────────────────────────────────────
// Napló-műveletek
// ─────────────────────────────────────────────────────────────────────────────

interface ClaimResult {
  backupLogId: number
  /** `true`, ha aznap MÁR VAN igazolt mentés — a hatókört kihagyjuk. */
  kihagyva: boolean
}

interface PreviousRun {
  rowCounts: Record<string, number>
  mediaSha256: string | null
  mediaDriveFileId: string | null
  mediaBytes: number
}

function scopeFilter(query: unknown, congregationId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  return congregationId === null
    ? q.is('congregation_id', null)
    : q.eq('congregation_id', congregationId)
}

/** Az előző IGAZOLT futás — a napi különbséghez és a média újrahivatkozásához. */
async function loadPreviousRun(
  admin: SupabaseClient,
  scope: BackupScope,
  congregationId: string | null,
  runDate: string,
): Promise<PreviousRun | null> {
  const { data, error } = await scopeFilter(
    admin
      .from('backup_log')
      .select('row_counts, media_sha256, media_drive_file_id, media_bytes')
      .eq('scope', scope)
      .eq('status', 'ok')
      .not('drive_verified_at', 'is', null)
      // `lte`, nem `lt`: egy visszaállítás előtti mentés ugyanazon a napon fut,
      // mint a napi — `lt`-vel a reggeli média-fájlt nem ismerné fel, és
      // fölöslegesen újra feltöltené a gyülekezet ÖSSZES fényképét.
      .lte('run_date', runDate),
    congregationId,
  )
    .order('run_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const row = data as {
    row_counts: Record<string, number> | null
    media_sha256: string | null
    media_drive_file_id: string | null
    media_bytes: number | null
  }
  return {
    rowCounts: row.row_counts ?? {},
    mediaSha256: row.media_sha256,
    mediaDriveFileId: row.media_drive_file_id,
    mediaBytes: row.media_bytes ?? 0,
  }
}

/**
 * Lefoglalja (vagy újrahasznosítja) a napi napló-sort.
 *
 * A `napi` futásnál az egyedi index a kapu; a `kezi` és `pre_restore` futásból
 * naponta több is indítható, ezért azok mindig ÚJ sort kapnak.
 */
async function claimBackupLog(
  admin: SupabaseClient,
  args: {
    scope: BackupScope
    congregationId: string | null
    congregationNev: string | null
    kind: BackupKind
    runDate: string
  },
): Promise<ClaimResult> {
  if (args.kind === 'napi') {
    const { data: existing } = await scopeFilter(
      admin
        .from('backup_log')
        .select('id, status, drive_verified_at')
        .eq('scope', args.scope)
        .eq('kind', 'napi')
        .eq('run_date', args.runDate),
      args.congregationId,
    )
      .limit(1)
      .maybeSingle()

    if (existing) {
      const row = existing as { id: number; status: string; drive_verified_at: string | null }
      if (row.status === 'ok' && row.drive_verified_at) {
        return { backupLogId: row.id, kihagyva: true }
      }
      // Korábban elhasalt (vagy félbeszakadt) — ÚJRAPRÓBÁLJUK ugyanabban a sorban.
      const { error } = await admin
        .from('backup_log')
        .update({
          status: 'fut',
          started_at: new Date().toISOString(),
          finished_at: null,
          failure_stage: null,
          failure_message: null,
          congregation_nev: args.congregationNev,
        })
        .eq('id', row.id)
      if (error) throw new Error(`A napló-sor újranyitása sikertelen: ${error.message}`)
      return { backupLogId: row.id, kihagyva: false }
    }
  }

  const { data, error } = await admin
    .from('backup_log')
    .insert({
      scope: args.scope,
      congregation_id: args.congregationId,
      congregation_nev: args.congregationNev,
      kind: args.kind,
      run_date: args.runDate,
      status: 'fut',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = az egyedi index fogott: egy másik futás közben lefoglalta.
    if (error.code === '23505') {
      const { data: raced } = await scopeFilter(
        admin
          .from('backup_log')
          .select('id')
          .eq('scope', args.scope)
          .eq('kind', args.kind)
          .eq('run_date', args.runDate),
        args.congregationId,
      )
        .limit(1)
        .maybeSingle()
      if (raced) {
        return { backupLogId: (raced as { id: number }).id, kihagyva: true }
      }
    }
    throw new Error(`A napló-sor létrehozása sikertelen: ${error.message}`)
  }

  return { backupLogId: (data as { id: number }).id, kihagyva: false }
}

/** Táblánkénti különbség az előző igazolt futáshoz képest. */
function computeDelta(
  mostani: Record<string, number>,
  elozo: Record<string, number>,
): Record<string, number> {
  const delta: Record<string, number> = {}
  const tablak = new Set([...Object.keys(mostani), ...Object.keys(elozo)])
  for (const t of tablak) {
    const d = (mostani[t] ?? 0) - (elozo[t] ?? 0)
    if (d !== 0) delta[t] = d
  }
  return delta
}

async function finishOk(
  admin: SupabaseClient,
  backupLogId: number,
  result: BackupScopeResult,
  semaUjjlenyomat: string,
  delta: Record<string, number>,
  storageNev: string,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('backup_log')
    .update({
      status: 'ok',
      finished_at: now,
      // ⚠️ CSAK EZ jelenti, hogy a mentés IGAZOLT. Egy „ok" sor drive_verified_at
      //    nélkül a felületen PIROS — és ezt a mezőt kizárólag az igazolás után írjuk.
      drive_verified_at: now,
      failure_stage: null,
      failure_message: null,
      row_counts: result.rowCounts,
      row_counts_delta: delta,
      total_rows: result.totalRows,
      schema_fingerprint: semaUjjlenyomat,
      ciphertext_bytes: result.ciphertextBytes,
      sha256: result.sha256,
      key_id: loadBackupKey().keyId,
      // ⚠️ A `drive_file_id` jelentése TÁROLÓFÜGGŐ (Drive: files.id, Supabase
      //    Storage: objektum-útvonal). A `storage_nev` nélkül egy későbbi
      //    tároló-váltás az ÖSSZES korábbi sort elárvítaná: a felületen zöld
      //    maradna, a fájl viszont megnyithatatlan és letörölhetetlen lenne.
      storage_nev: storageNev,
      drive_file_id: result.fileId,
      drive_file_name: result.fileName,
      media_drive_file_id: result.mediaFileId,
      media_sha256: result.mediaSha256,
      media_bytes: result.mediaBytes,
      figyelmeztetesek: result.figyelmeztetesek,
    })
    .eq('id', backupLogId)
  if (error) {
    throw new Error(
      `A mentés elkészült és IGAZOLT, de a napló lezárása sikertelen: ${error.message}. ` +
        'A fájl a tárolóban van, a felület viszont hiányzónak fogja mutatni.',
    )
  }
}

async function finishError(
  admin: SupabaseClient,
  backupLogId: number,
  stage: BackupFailureStage | null,
  uzenet: string,
  figyelmeztetesek: string[],
): Promise<void> {
  // Szándékosan NEM dobunk innen: a hiba-lezárás bukása nem takarhatja el az
  // EREDETI hibát. Naplózzuk, és megyünk tovább a következő gyülekezetre.
  const { error } = await admin
    .from('backup_log')
    .update({
      status: 'hiba',
      finished_at: new Date().toISOString(),
      failure_stage: stage,
      // A szöveget vágjuk: egy hosszú driver-üzenet nem tehet olvashatatlanná
      // egy napló-sort, és a részletek úgyis a szerver-naplóban vannak.
      failure_message: uzenet.slice(0, 2000),
      figyelmeztetesek,
    })
    .eq('id', backupLogId)
  if (error) {
    console.error('[backup] A hiba-lezárás naplózása sikertelen.', error.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A futás
// ─────────────────────────────────────────────────────────────────────────────

export interface RunBackupWorkerOptions {
  kind?: BackupKind
  /** Ha meg van adva, CSAK ezek a gyülekezetek futnak (kézi mentés, elő-mentés). */
  congregationIds?: string[]
  /** `false` esetén a `globalis` hatókör kimarad (kézi, egy-gyülekezetes futásnál). */
  includeGlobal?: boolean
  /** Interaktív futásnál a begépelt mentési jelszó — ettől lesz a fájl jelszóval nyitható. */
  passphrase?: string | null
  storage?: BackupStorage
  runDate?: string
}

interface CongregationRow {
  id: string
  name: string | null
  nev_hu: string | null
}

/**
 * Végigmegy az aktív gyülekezeteken és a globális hatókörön, SOROSAN.
 *
 * Miért sorosan: a Railway memóriája véges, és egy gyülekezet teljes tartalma
 * a memóriában áll össze. Párhuzamosítva 5-10 gyülekezet is elférne, de az első
 * nagy gyülekezetnél OOM-ra futnánk — és az OOM a legrosszabb hibafajta, mert
 * nem hagy maga után napló-bejegyzést sem.
 */
export async function runBackupWorker(
  opts: RunBackupWorkerOptions = {},
): Promise<BackupWorkerResult> {
  const admin = getSupabaseAdminClient()
  const kind: BackupKind = opts.kind ?? 'napi'
  const runDate = opts.runDate ?? bucharestRunDate()
  const figyelmeztetesek: string[] = []

  // ── 0) Kulcs — FAIL CLOSED, MINDEN más előtt.
  loadBackupKey()

  // ── 1) LELTÁR — besorolatlan élő tábla → az EGÉSZ futás azonnal hiba.
  const inventory = await loadTableInventory(admin)
  const osztalyozas = assertInventoryClassified(inventory)
  if (osztalyozas.retegNelkul.length > 0) {
    figyelmeztetesek.push(
      `${osztalyozas.retegNelkul.length} tábla MENTÉSRE kerül, de visszaállítani nem lehet ` +
        `(nincs rétege): ${osztalyozas.retegNelkul.slice(0, 15).join(', ')}` +
        (osztalyozas.retegNelkul.length > 15 ? ' …' : ''),
    )
  }
  const semaUjjlenyomat = computeSchemaFingerprint(inventory)

  // ── 2) TÁROLÓ. A választás automatikus (Drive, ha össze van kötve), és a
  //      TÉNYT kimondjuk: ha nem a Drive-ra megy, az nem „részletkérdés" —
  //      a mentés fő értéke az, hogy MÁSHOL van, mint az adatbázis.
  const storage = opts.storage ?? (await resolveBackupStorage())
  if (storage.nev !== STORAGE_DRIVE) {
    figyelmeztetesek.push(
      `A mentés NEM a Google Drive-ra kerül, hanem ide: „${storage.nev}". ` +
        'Ez ugyanabban a felhő-fiókban van, mint az adatbázis — egyetlen fiók-szintű baleset ' +
        'mindkettőt viszi. Kösd össze a Google Drive-ot (Admin → Biztonsági mentés).',
    )
  }

  // ── 2/b) HELYREÁLLÍTÓ KULCS-LETÉT. Enélkül a felügyelet nélküli futás
  //      fájljait KIZÁRÓLAG a BACKUP_ENCRYPTION_KEY nyitja — vagyis a kulcs
  //      elvesztése az egész archívumot olvashatatlanná tenné.
  let recovery: RecoveryEscrow | null = null
  {
    const { loadRecoveryKeyMaterial } = await import('@/lib/google-drive/backup-passphrase')
    const anyag = await loadRecoveryKeyMaterial()
    if (anyag.publicRaw && anyag.wrappedPrivate) {
      recovery = { publicRaw: anyag.publicRaw, wrappedPrivate: anyag.wrappedPrivate }
    } else {
      figyelmeztetesek.push(
        'NINCS HELYREÁLLÍTÓ KULCS: a ma készülő fájlokat KIZÁRÓLAG a szerver kulcsa ' +
          '(BACKUP_ENCRYPTION_KEY) nyitja. Ha az a kulcs elveszik, minden mentés olvashatatlan ' +
          'marad. Állíts be MENTÉSI JELSZÓT (Admin → Biztonsági mentés) — az hozza létre a ' +
          'helyreállító kulcspárt.' +
          (anyag.error ? ` (Részlet: ${anyag.error})` : ''),
      )
    }
  }

  // ── 3) HATÓKÖRÖK
  const hatokorok: Array<{
    scope: BackupScope
    congregationId: string | null
    congregationNev: string | null
  }> = []

  if (opts.congregationIds && opts.congregationIds.length > 0) {
    const lista = await selectAllPaged<CongregationRow>(
      admin.from('congregations').select('id, name, nev_hu').in('id', opts.congregationIds),
    )
    if (lista.error) {
      throw new Error(`A gyülekezetek listája nem tölthető be: ${lista.error.message}`)
    }
    for (const c of lista.data) {
      hatokorok.push({
        scope: 'gyulekezet',
        congregationId: c.id,
        congregationNev: c.nev_hu || c.name || null,
      })
    }
    if (opts.includeGlobal) {
      hatokorok.push({ scope: 'globalis', congregationId: null, congregationNev: null })
    }
  } else {
    const lista = await selectAllPaged<CongregationRow>(
      admin.from('congregations').select('id, name, nev_hu').eq('status', 'active'),
    )
    if (lista.error) {
      throw new Error(`A gyülekezetek listája nem tölthető be: ${lista.error.message}`)
    }
    for (const c of lista.data) {
      hatokorok.push({
        scope: 'gyulekezet',
        congregationId: c.id,
        congregationNev: c.nev_hu || c.name || null,
      })
    }
    if (opts.includeGlobal !== false) {
      hatokorok.push({ scope: 'globalis', congregationId: null, congregationNev: null })
    }
  }

  // ── 4) A TEGNAPI ELLENŐRZÉS. Ha tegnap nem volt igazolt mentés, AZONNAL
  //      jelezzük — nem várunk 48 órát a felületi sávra. (A sáv csak akkor
  //      látszik, ha valaki belép; ez a jelzés akkor is elmegy, ha senki.)
  const tegnap = new Date(`${runDate}T12:00:00Z`)
  tegnap.setUTCDate(tegnap.getUTCDate() - 1)
  const tegnapiDatum = tegnap.toISOString().slice(0, 10)
  const { data: tegnapiSor } = await admin
    .from('backup_log')
    .select('id')
    .eq('status', 'ok')
    .not('drive_verified_at', 'is', null)
    .eq('run_date', tegnapiDatum)
    .limit(1)
    .maybeSingle()
  if (!tegnapiSor && kind === 'napi') {
    figyelmeztetesek.push(
      `TEGNAP (${tegnapiDatum}) EGYETLEN igazolt mentés sem készült. Ha ez nem az első ` +
        'futás, akkor a mentés napok óta nem működik.',
    )
  }

  // ── 5) FUTÁS, hatókörönként, sorosan
  const eredmenyek: BackupScopeResult[] = []
  let sikeres = 0
  let sikertelen = 0
  let kihagyva = 0

  for (const h of hatokorok) {
    const claim = await claimBackupLog(admin, {
      scope: h.scope,
      congregationId: h.congregationId,
      congregationNev: h.congregationNev,
      kind,
      runDate,
    })

    if (claim.kihagyva) {
      kihagyva++
      eredmenyek.push({
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        kind,
        runDate,
        ok: true,
        kihagyva: true,
        backupLogId: claim.backupLogId,
        stage: null,
        hiba: null,
        rowCounts: {},
        totalRows: 0,
        ciphertextBytes: 0,
        sha256: null,
        fileId: null,
        fileName: null,
        mediaFileId: null,
        mediaSha256: null,
        mediaBytes: 0,
        figyelmeztetesek: [],
        durationMs: 0,
      })
      continue
    }

    const elozo = await loadPreviousRun(admin, h.scope, h.congregationId, runDate)

    try {
      const result = await exportScope({
        admin,
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        kind,
        runDate,
        inventory,
        semaUjjlenyomat,
        storage,
        passphrase: opts.passphrase ?? null,
        recovery,
        elozoMedia:
          elozo?.mediaSha256 && elozo.mediaDriveFileId
            ? {
                sha256: elozo.mediaSha256,
                fileId: elozo.mediaDriveFileId,
                bytes: elozo.mediaBytes,
              }
            : null,
      })
      result.backupLogId = claim.backupLogId

      await finishOk(
        admin,
        claim.backupLogId,
        result,
        semaUjjlenyomat,
        computeDelta(result.rowCounts, elozo?.rowCounts ?? {}),
        storage.nev,
      )
      sikeres++
      eredmenyek.push(result)
    } catch (e: unknown) {
      sikertelen++
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      // A stage-et az exportScope a hibán kívül nem adja vissza — a szöveg
      // viszont mindig megnevezi a lépést, ezért a naplóban is az áll.
      const stage: BackupFailureStage | null = detectStage(uzenet)
      const scopeFigyelmeztetesek: string[] = []

      // RIASZTÁS — MINDIG. A riasztó nem „bekötendő" többé (lásd a fenti
      // magyarázatot): alapértelmezésben a valódi, e-mail + harang csatorna fut.
      const alertResult = await aktivRiaszto()({
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        runDate,
        backupLogId: claim.backupLogId,
        stage,
        uzenet,
      }).catch((err: unknown) => ({
        ok: false,
        csatornak: [] as string[],
        hiba: err instanceof Error ? err.message : 'ismeretlen',
      }))
      if (!alertResult.ok) {
        scopeFigyelmeztetesek.push(
          `A riasztás NEM ment ki: ${alertResult.hiba || 'ismeretlen ok'}.`,
        )
      } else {
        scopeFigyelmeztetesek.push(`Riasztás elküldve: ${alertResult.csatornak.join(', ')}.`)
      }

      console.error(
        `[backup] ${h.scope}/${h.congregationNev ?? 'globalis'} (${runDate}) SIKERTELEN:`,
        uzenet,
      )
      await finishError(admin, claim.backupLogId, stage, uzenet, scopeFigyelmeztetesek)

      eredmenyek.push({
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        kind,
        runDate,
        ok: false,
        kihagyva: false,
        backupLogId: claim.backupLogId,
        stage,
        hiba: uzenet,
        rowCounts: {},
        totalRows: 0,
        ciphertextBytes: 0,
        sha256: null,
        fileId: null,
        fileName: null,
        mediaFileId: null,
        mediaSha256: null,
        mediaBytes: 0,
        figyelmeztetesek: scopeFigyelmeztetesek,
        durationMs: 0,
      })
    }
  }

  // ── 6) TAKARÍTÁS: a 24 óránál régebbi visszaállítási staging sorok.
  //      Személyes adatot tartalmaznak — nem maradhatnak ott a végtelenségig.
  const { error: cleanupError } = await admin.rpc('backup_restore_cleanup', {
    p_session: '00000000-0000-0000-0000-000000000000',
  })
  if (cleanupError) {
    figyelmeztetesek.push(
      `A visszaállítási átmeneti tár takarítása sikertelen: ${cleanupError.message}`,
    )
  }

  return {
    futott: hatokorok.length,
    sikeres,
    sikertelen,
    kihagyva,
    runDate,
    semaUjjlenyomat,
    figyelmeztetesek,
    hatokorok: eredmenyek,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EGY GYÜLEKEZET — a kézi mentés és a visszaállítás-előtti mentés belépője
// ─────────────────────────────────────────────────────────────────────────────

export interface SingleCongregationBackupResult {
  ok: boolean
  /** ⚠️ CSAK akkor `true`, ha feltöltve ÉS visszaolvasva ÉS a sorszámok egyeztek. */
  igazolt: boolean
  backupLogId: number | null
  finishedAt: string | null
  totalRows: number
  figyelmeztetesek: string[]
  error?: string
}

/**
 * Egyetlen gyülekezet mentése — kézi indításra vagy visszaállítás ELŐTT.
 *
 * ⚠️ A PÁRHUZAMOSAN DOLGOZÓ ÜGYNÖKÖKNEK: a `lib/restore/backup-port.ts`
 *    `runPreRestoreBackup()`-ja és az admin „Mentés most" gombja EZT hívja —
 *    nem közvetlenül az `exportScope()`-ot. Ez a függvény intézi a napló-sort,
 *    a leltárt, a tárolót és a séma-ujjlenyomatot is.
 *
 * ⚠️ A visszaállítás előfeltétele SQL-oldalon is ki van kényszerítve
 *    (`backup_restore_apply` 30 percnél frissebb, IGAZOLT `pre_restore` sort
 *    követel) — vagyis ha ez a függvény bármiért hazudna, a visszaállítás
 *    AKKOR SEM indulna el. A két kapu szándékosan független.
 *
 * A `globalis` hatókör SZÁNDÉKOSAN kimarad: a bérlő-váz és a referencia-adat
 * helyreállítása runbook, nem gomb — nincs értelme minden kézi mentésnél
 * ~54 000 címsort újra lementeni.
 */
export async function runSingleCongregationBackup(args: {
  congregationId: string
  kind: Extract<BackupKind, 'kezi' | 'pre_restore'>
  /** Ha a felhasználó BEGÉPELTE a mentési jelszót, a fájl azzal is nyitható lesz. */
  passphrase?: string | null
  storage?: BackupStorage
}): Promise<SingleCongregationBackupResult> {
  try {
    const result = await runBackupWorker({
      kind: args.kind,
      congregationIds: [args.congregationId],
      includeGlobal: false,
      passphrase: args.passphrase ?? null,
      storage: args.storage,
    })

    const scope = result.hatokorok.find((h) => h.congregationId === args.congregationId)
    if (!scope) {
      return {
        ok: false,
        igazolt: false,
        backupLogId: null,
        finishedAt: null,
        totalRows: 0,
        figyelmeztetesek: result.figyelmeztetesek,
        error:
          'A megadott gyülekezet nem található (vagy nincs hozzá hozzáférés). ' +
          'Mentés NEM készült.',
      }
    }

    // FAIL CLOSED: a „kihagyva" NEM igazolás. Egy visszaállítás előtti mentésnek
    // MOST kell elkészülnie — egy reggeli fájl nem védi meg a délutáni munkát.
    const igazolt = scope.ok && !scope.kihagyva && scope.sha256 !== null
    return {
      ok: igazolt,
      igazolt,
      backupLogId: scope.backupLogId,
      finishedAt: igazolt ? new Date().toISOString() : null,
      totalRows: scope.totalRows,
      figyelmeztetesek: [...result.figyelmeztetesek, ...scope.figyelmeztetesek],
      error: igazolt
        ? undefined
        : scope.hiba ||
          'A mentés nem lett igazolva (feltöltés + visszaolvasás + sorszám-egyeztetés).',
    }
  } catch (e: unknown) {
    return {
      ok: false,
      igazolt: false,
      backupLogId: null,
      finishedAt: null,
      totalRows: 0,
      figyelmeztetesek: [],
      error: e instanceof Error ? e.message : 'A mentés nem sikerült.',
    }
  }
}

/**
 * A hibaüzenetből kiolvassa, MELYIK lépésnél hasaltunk el.
 *
 * Miért szövegből: az `exportScope` dobással jelez (hogy egyetlen hibaág legyen),
 * és a dobott `Error` nem hordoz típusos mezőt. A szövegek viszont a mi
 * kezünkben vannak, és mindegyik megnevezi a lépést. A `null` (ismeretlen)
 * teljesen elfogadható — a `failure_message` akkor is ott van.
 */
function detectStage(uzenet: string): BackupFailureStage | null {
  const m = uzenet.toLowerCase()
  if (m.includes('leltár') || m.includes('besorolatlan')) return 'leltar'
  if (m.includes('megszámolása')) return 'szamlalas'
  // ⚠️ A „visszaolvas" ELŐBB, mint a „dump": a „VISSZAOLVASÁSA sikertelen"
  //    szövegben BENNE VAN az „olvasása sikertelen" részlet, tehát fordított
  //    sorrendben az igazolási hiba dump-hibaként naplózódna — és a tulajdonos
  //    az adatbázist keresné, miközben a tárolóval van baj.
  if (
    m.includes('visszaolvas') ||
    m.includes('igazolás') ||
    m.includes('sorszám-eltérés') ||
    m.includes('tartalom-eltérés')
  ) {
    return 'igazolas'
  }
  if (m.includes('olvasása sikertelen') || m.includes('lapozása')) return 'dump'
  if (m.includes('feltöltése') || m.includes('vödör')) return 'feltoltes'
  if (m.includes('kulcs') || m.includes('titkosít')) return 'titkositas'
  return null
}
