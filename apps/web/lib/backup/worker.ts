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
// ⚠️ A `health.ts` NEM hív Google-API-t: napló- és beállítás-olvasás. Azért
//    innen jön, mert a rendszer korát a SÁV és a MOTOR is UGYANABBÓL a
//    forrásból kell hogy olvassa (lásd a 4) szakasz kommentjét).
import { loadMentesSzuletes } from '@/lib/google-drive/health'

import {
  RIASZTAS_NEVESITETT_MAX,
  feloldMentesOsszesito,
  feloldMentesRiasztas,
  sendBackupFailureAlert,
  sendMentesOsszesitoRiasztas,
} from './alerts'
import { napEletkora } from './mentes-kora'
import {
  ALAP_IDOKERET_MS,
  berletHatarIso,
  ferBeleUjabbHatokor,
  korlatokBeolvasasa,
  scopeKulcs,
  tervezFutas,
} from './batch'
import { exportScope, type RecoveryEscrow } from './export'
import {
  assertInventoryClassified,
  computeSchemaFingerprint,
  loadTableInventory,
} from './inventory'
import { loadBackupKey } from './keys'
import { bucharestRunDate } from './payload'
import { jelolLepes, mentesTeendo, ujFutasLepesek, vagd } from './steps'
import { STORAGE_DRIVE, resolveBackupStorage } from './storage'
import type {
  BackupAlerter,
  BackupFailureStage,
  BackupKind,
  BackupRunStep,
  BackupScope,
  BackupScopeResult,
  BackupStorage,
  BackupWorkerResult,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// A BESZÉDES HIBA — a futás lépés-listáját VISZI MAGÁVAL (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Az előkészítő fázis hibája, a lépés-listával és a TEENDŐVEL együtt.
 *
 * ⚠️ MIÉRT KELL SAJÁT HIBAOSZTÁLY. 2026-08-11-én a tulajdonos ennyit látott:
 *    „A biztonsági mentés futása sikertelen." — se lépés, se ok, se teendő.
 *    Közben a szerver PONTOSAN tudta a hibát. A baj az volt, hogy a dobott
 *    `Error` semmit nem hordozott a KONTEXTUSBÓL: a hívó nem tudta megmondani,
 *    a hat előkészítő lépés MELYIKÉNÉL álltunk meg. Ez az osztály viszi.
 *
 * ⛔ A `message` és a `reszlet` továbbra is TITOKMENTES: a forrás-hibák már
 *    tisztított szöveget adnak (`safeDbError` = üzenet + kód, `driveError` =
 *    a Google szabványos üzenete 200 karakterre vágva).
 */
export class BackupWorkerError extends Error {
  readonly lepesek: BackupRunStep[]
  readonly teendo: string
  readonly teendoId: string
  readonly sqlFajl: string | null

  constructor(uzenet: string, lepesek: BackupRunStep[]) {
    super(uzenet)
    this.name = 'BackupWorkerError'
    this.lepesek = lepesek
    const t = mentesTeendo(uzenet)
    this.teendo = t.szoveg
    this.teendoId = t.id
    this.sqlFajl = t.sql
  }
}

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
  backupLogId: number | null
  /** `true`, ha aznap MÁR VAN igazolt mentés — a hatókört kihagyjuk. */
  kihagyva: boolean
  /**
   * `true`, ha a hatókört EGY MÁSIK, ÉPPEN FUTÓ mentés tartja (élő bérlet).
   *
   * ⚠️ EZ NEM KÉSZ ÉS NEM HIBA. Ehhez a hatókörhöz MI nem nyúlunk hozzá, de
   *    HÁTRALÉVŐNEK számít — különben a futás késznek mondaná magát, miközben
   *    egy gyülekezetnek nincs mentése.
   */
  foglalt: boolean
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
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11 JAVÍTÁS — A FOGLALÁS MOSTANTÓL FELTÉTELES (BÉRLET)
 * ════════════════════════════════════════════════════════════════════════════
 * Korábban itt egy feltétel NÉLKÜLI `SELECT` → `UPDATE status='fut'` állt. Az
 * egyedi index csak azt garantálja, hogy naponta hatókörönként EGY SOR legyen —
 * azt NEM, hogy egy FUTÁS. Vagyis ha a felület és az éjszakai cron egyszerre
 * indult (vagy a tulajdonos a hibaüzenet tanácsára újrakattintott, miközben a
 * szerver még dolgozott), két futás UGYANAZT a gyülekezetet mentette le
 * párhuzamosan. A következmény nem adatvesztés, hanem ÁRVA FÁJL: minden futás
 * új `kb-<uuid>.kbk` nevet kap (`export.ts`), a napló viszont csak az UTOLSÓ
 * `drive_file_id`-t őrzi meg. Az árvát az egyeztetés „ismeretlen fájlként"
 * jelenti, és a rendszer SOHA nem törli — a Drive pedig lassan megtelik.
 *
 * Mostantól a foglalás egyetlen FELTÉTELES `UPDATE`, és az ÉRINTETT SOROK
 * SZÁMÁT is megnézzük:
 *   · 1 sor  → miénk a hatókör,
 *   · 0 sor  → valaki más MÁR dolgozik rajta, élő bérlettel → `foglalt`.
 * Ugyanez a kapu fogja el az `INSERT` versenyt is (23505).
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
        return { backupLogId: row.id, kihagyva: true, foglalt: false }
      }
      // Korábban elhasalt (vagy félbeszakadt) — ÚJRAPRÓBÁLJUK ugyanabban a sorban,
      // DE CSAK akkor, ha nincs rajta ÉLŐ bérlet (nem `fut`, vagy a foglalás
      // 15 percnél régebbi). A `select()` visszaadja az ÉRINTETT sorokat: nulla
      // sor = valaki más éppen dolgozik rajta.
      const { data: frissitett, error } = await admin
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
        .or(`status.neq.fut,started_at.is.null,started_at.lt.${berletHatarIso()}`)
        .select('id')
      if (error) throw new Error(`A napló-sor újranyitása sikertelen: ${error.message}`)
      if (!frissitett || frissitett.length === 0) {
        return { backupLogId: row.id, kihagyva: false, foglalt: true }
      }
      return { backupLogId: row.id, kihagyva: false, foglalt: false }
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
    // 23505 = az egyedi index fogott: egy másik futás EBBEN A MÁSODPERCBEN
    // lefoglalta. ⚠️ EZ NEM „KÉSZ": a másik futás még csak most kezdte. Ha
    // késznek jelentenénk, a napi lefedettség hazudna. `foglalt` → hátralévő.
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
      return {
        backupLogId: raced ? (raced as { id: number }).id : null,
        kihagyva: false,
        foglalt: true,
      }
    }
    throw new Error(`A napló-sor létrehozása sikertelen: ${error.message}`)
  }

  return { backupLogId: (data as { id: number }).id, kihagyva: false, foglalt: false }
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
  /**
   * A hatókör-ciklus időkerete. Lejáratkor RENDEZETTEN megállunk, és a
   * maradékot `hatralevo`-ként jelentjük — a következő indítás onnan folytatja.
   * Alap: `ALAP_IDOKERET_MS` (10 perc), felső korlát 14 perc.
   */
  maxFutasiIdoMs?: number
  /** Ennyi hatökört dolgozunk fel EBBEN a szeletben. `0` = nincs darab-korlát. */
  maxHatokor?: number
  /**
   * „Álljunk meg?" — a hatókörök KÖZÖTT kérdezzük meg, minden kör elején.
   *
   * ⚠️ MIÉRT KÖZÖTTÜK, ÉS MIÉRT NEM KÖZBEN (2026-08-11). A FUTÓ hatókört SOHA
   *    nem szakítjuk félbe: az „fut" állapotban ragadt napló-sort hagyna maga
   *    után, ami a felületen sem késznek, sem hibásnak nem látszik — és a
   *    tárolóban ott maradhatna egy fél fájl, amit soha senki nem takarít el.
   *    Egy hatókör ~18 másodperc, tehát a leállítás így is azonnalinak érződik.
   *
   * ⚠️ MIÉRT NEM `AbortSignal`. A megállás itt RENDEZETT: a maradékot
   *    HALASZTOTTNAK jelentjük, nem hibának, és a napló minden sora lezárt
   *    marad. Egy megszakítás-jel ezt nem tudja garantálni.
   */
  megallj?: () => boolean
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

  // ── LÉPÉS-LISTA. Minden előkészítő lépés CSAK a sikere után kap pipát, ezért
  //    egy dobásnál az ELSŐ jelöletlen lépés PONTOSAN a bukás helye. Ez a
  //    könyvelés így nem tud elcsúszni a valóságtól.
  const lepesek = ujFutasLepesek()

  const korlatok = korlatokBeolvasasa({
    nyersIdo: opts.maxFutasiIdoMs ?? process.env.BACKUP_MAX_RUN_MS,
    nyersDarab: opts.maxHatokor ?? process.env.BACKUP_MAX_SCOPES,
    alapIdoMs: ALAP_IDOKERET_MS,
  })

  let inventory: Awaited<ReturnType<typeof loadTableInventory>>
  let semaUjjlenyomat: string
  let storage: BackupStorage
  let recovery: RecoveryEscrow | null = null
  const hatokorok: Array<{
    scope: BackupScope
    congregationId: string | null
    congregationNev: string | null
  }> = []
  const keszKulcsok = new Set<string>()

  try {
    // ── 0) Kulcs — FAIL CLOSED, MINDEN más előtt.
    loadBackupKey()
    jelolLepes(lepesek, 'kulcs', true)

    // ── 1) LELTÁR — besorolatlan élő tábla → az EGÉSZ futás azonnal hiba.
    inventory = await loadTableInventory(admin)
    jelolLepes(lepesek, 'leltar', true, `${inventory.length} tábla`)

    const osztalyozas = assertInventoryClassified(inventory)
    jelolLepes(
      lepesek,
      'besorolas',
      true,
      `${osztalyozas.gyulekezet.length} gyülekezeti + ${osztalyozas.globalis.length} globális tábla`,
    )
    if (osztalyozas.retegNelkul.length > 0) {
      figyelmeztetesek.push(
        `${osztalyozas.retegNelkul.length} tábla MENTÉSRE kerül, de visszaállítani nem lehet ` +
          `(nincs rétege): ${osztalyozas.retegNelkul.slice(0, 15).join(', ')}` +
          (osztalyozas.retegNelkul.length > 15 ? ' …' : ''),
      )
    }
    // ── 2026-08-15 (egyházmegyei szint, S3/S4): FEDETLEN MEGYEI SOROK ──
    // A scope-oszlopos táblák (diocese_id oszloppal) megyei sorai a gyülekezeti
    // szűrőn kívül esnek; a globalis_predikatum nélkül EGYIK fájlba sem
    // kerülnének. Szándékosan NEM állítjuk le a futást (az minden gyülekezet
    // napi mentését vinné el) — de a hiány HANGOS, névvel és teendővel.
    if (osztalyozas.dioceseFedetlen.length > 0) {
      figyelmeztetesek.push(
        `⚠️ MEGYEI SOROK MENTÉS NÉLKÜL: ${osztalyozas.dioceseFedetlen.join(', ')} — ` +
          'ezekben a táblákban egyházmegyei sorok is lehetnek (diocese_id), de nincs ' +
          'mentés-szűrőjük (backup_table_policy.globalis_predikatum), így a megyei sorok ' +
          'EGYIK mentés-fájlba sem kerülnek. Futtasd le a ' +
          'migration-docs/sql/2026-08-15-egyhazmegyei-iktato-leltar-s4.sql fájlt.',
      )
    }
    // ── 2026-08-22 (egyházkerületi szint, S7): FEDETLEN KERÜLETI SOROK ──
    // Ugyanaz a hibaosztály eggyel feljebb. MA nem sül el (az S5a mind a 6
    // scope-oszlopos táblán kitöltötte a predikátumot) — az őr egy JÖVŐBELI
    // kerületi scope-oszlopos táblát fog elkapni. Nélküle a mentés
    // „sikeresnek" látszana, a kerületi sorok viszont nem lennének a fájlban,
    // és ez CSAK visszaállításkor derülne ki, amikor már késő.
    // ⚠️ Itt sem állítjuk le a futást: a fedetlenség figyelmeztetés, nem kapu
    //    (az egyetlen megállító ok a besorolatlan tábla marad).
    if (osztalyozas.districtFedetlen.length > 0) {
      figyelmeztetesek.push(
        `⚠️ KERÜLETI SOROK MENTÉS NÉLKÜL: ${osztalyozas.districtFedetlen.join(', ')} — ` +
          'ezekben a táblákban egyházkerületi sorok is lehetnek (district_id), de nincs ' +
          'mentés-szűrőjük (backup_table_policy.globalis_predikatum), így a kerületi sorok ' +
          'EGYIK mentés-fájlba sem kerülnek. Mintát a ' +
          'migration-docs/sql/2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql fájl ad.',
      )
    }
    semaUjjlenyomat = computeSchemaFingerprint(inventory)

    // ── 2) TÁROLÓ. A választás automatikus (Drive, ha össze van kötve), és a
    //      TÉNYT kimondjuk: ha nem a Drive-ra megy, az nem „részletkérdés" —
    //      a mentés fő értéke az, hogy MÁSHOL van, mint az adatbázis.
    storage = opts.storage ?? (await resolveBackupStorage())
    jelolLepes(lepesek, 'tarolo', true, storage.nev)
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
    {
      const { loadRecoveryKeyMaterial } = await import('@/lib/google-drive/backup-passphrase')
      const anyag = await loadRecoveryKeyMaterial()
      if (anyag.publicRaw && anyag.wrappedPrivate) {
        recovery = { publicRaw: anyag.publicRaw, wrappedPrivate: anyag.wrappedPrivate }
        jelolLepes(lepesek, 'helyreallito', true, 'van kulcs-letét')
      } else {
        // ⚠️ 2026-08-11 JAVÍTÁS: ez `false` volt — vagyis a felület PIROS
        //    KERESZTET rajzolt rá „ITT HIBÁZOTT" képernyőolvasó-szöveggel, egy
        //    egyébként SIKERES, ZÖLD futás jelentésében. A hiányzó mentési
        //    jelszó nem bukás: a mentés a szerver kulcsával elkészül. A súlyt a
        //    `figyelmeztetesek` tömb viszi (külön, sárga blokkban látszik), a
        //    lépés pedig a saját, egyértelmű állapotát kapja.
        jelolLepes(lepesek, 'helyreallito', 'figyelmeztetes', 'nincs mentési jelszó')
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
    jelolLepes(lepesek, 'hatokorok', true, `${hatokorok.length} hatókör`)

    // ── 3/b) A FOLYTATÁSI PONT. Egyetlen lekérdezésből megtudjuk, MELYIK
    //      hatókörről van MA már igazolt mentés — ezekhez hozzá sem nyúlunk.
    //      Nem kell külön „folytatási token": a napi kulcs maga az.
    if (kind === 'napi') {
      const kesz = await selectAllPaged<{ scope: string; congregation_id: string | null }>(
        admin
          .from('backup_log')
          .select('scope, congregation_id')
          .eq('kind', 'napi')
          .eq('run_date', runDate)
          .eq('status', 'ok')
          .not('drive_verified_at', 'is', null),
      )
      if (kesz.error) {
        throw new Error(`A mai napló-sorok nem olvashatók: ${kesz.error.message}`)
      }
      for (const sor of kesz.data) keszKulcsok.add(scopeKulcs(sor.scope, sor.congregation_id))
    }
  } catch (e: unknown) {
    // ── AZ ELŐKÉSZÍTŐ FÁZIS BUKÁSA ────────────────────────────────────────
    // Itt EGYETLEN hatókör sem futott le, tehát NINCS napló-sor, amibe a hibát
    // beleírhatnánk. Korábban emiatt ez a hibafajta TELJESEN néma volt: se
    // napló, se riasztás, se érthető felületi üzenet. Mindhárom pótolva.
    const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
    const bukott = lepesek.find((l) => l.ok === null)
    if (bukott) bukott.ok = false

    console.error('[backup] Az ELŐKÉSZÍTŐ fázis elhasalt.', uzenet)

    // RIASZTÁS — a napi cron éjjel fut, és e nélkül reggelig senki nem tudná meg.
    await aktivRiaszto()({
      scope: 'globalis',
      congregationId: null,
      congregationNev: null,
      runDate,
      backupLogId: null,
      stage: detectStage(uzenet),
      uzenet: `A mentés EL SEM INDULT (előkészítő fázis): ${vagd(uzenet, 400)}`,
    }).catch(() => undefined)

    throw new BackupWorkerError(uzenet, lepesek)
  }

  // ── 4) A TEGNAPI ELLENŐRZÉS. Ha tegnap nem volt igazolt mentés, AZONNAL
  //      jelezzük — nem várunk 48 órát a felületi sávra. (A sáv csak akkor
  //      látszik, ha valaki belép; ez a jelzés akkor is elmegy, ha senki.)
  //
  // ⚠️ 2026-08-11 JAVÍTÁS — A HEDGELÉS MEGSZŰNT, NEM ÁTKÖLTÖZÖTT.
  //    Itt korábban ez állt: „…HA EZ NEM AZ ELSŐ FUTÁS, akkor a mentés napok
  //    óta nem működik." A mondat helyes volt, mert a szerzője TUDTA, hogy nem
  //    tudja eldönteni. Mostantól TUDJA: a `MentesSzuletes` (a napló legkorábbi
  //    sora + a Drive-összekötés + a mentési jelszó közül a LEGKORÁBBI) megmondja,
  //    létezett-e egyáltalán a rendszer tegnap. UGYANEZ az adat hajtja a felső
  //    figyelmeztető sávot is (`lib/google-drive/health.ts` → `savDontes`), ezért
  //    a kettő nem tud széthúzni — korábban két külön lekérdezésből két külön
  //    mondatot mondtak ugyanarról a napról.
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
    const szuletes = await loadMentesSzuletes(admin)
    const kor = napEletkora(tegnapiDatum, szuletes)
    figyelmeztetesek.push(
      kor === 'eles'
        ? `TEGNAP (${tegnapiDatum}) EGYETLEN igazolt mentés sem készült — a mentés napok óta ` +
            'nem működik. Ez NEM az első futás.'
        : `Tegnap (${tegnapiDatum}) még nem volt igazolt mentés, de nem is lehetett: a ` +
            `mentés-rendszer ${szuletes.telepitesNap ?? runDate}-én indult. Ez a bejáratási ` +
            `időszak — ${szuletes.elsoSzamonkertNap ?? runDate}-tól a hiányzó előző nap már hiba.`,
    )
  }

  // ── 5) SZELET-TERV: mit hagyunk ki, mivel dolgozunk, mi marad későbbre.
  const terv = tervezFutas({
    hatokorok,
    kulcs: (h) => scopeKulcs(h.scope, h.congregationId),
    keszKulcsok,
    maxHatokor: korlatok.maxHatokor,
  })

  // ── 6) FUTÁS, hatókörönként, sorosan
  const eredmenyek: BackupScopeResult[] = []
  let sikeres = 0
  let sikertelen = 0
  let kihagyva = 0
  let feldolgozva = 0
  let foglalt = 0
  let idoMiattHalasztott = 0
  let leallitasMiattHalasztott = 0
  const ciklusKezdet = Date.now()

  // ── A RIASZTÁS-KORLÁT KÖNYVELÉSE (2026-08-11) ────────────────────────────
  // Lásd `lib/backup/alerts.ts` → „A TÖMEGES BUKÁS ÖSSZESÍTŐJE". Az első
  // `RIASZTAS_NEVESITETT_MAX` bukás NEVESÍTVE megy ki, a többi helyett a futás
  // végén EGYETLEN összesítő. A napló-sorba MINDEN bukás bekerül.
  let nevesitettRiasztas = 0
  const bukottNevek: string[] = []
  const bukottHibak: string[] = []

  // A MA MÁR IGAZOLT hatókörök: nulla adatbázis-írás, nulla Drive-hívás. Egy
  // folytatásnál ez a 700+ hatókör másodpercek alatt átfut.
  for (const h of terv.kihagyando) {
    kihagyva++
    eredmenyek.push(uresEredmeny(h, kind, runDate, { kihagyva: true }))
  }

  for (let i = 0; i < terv.futtatando.length; i++) {
    const h = terv.futtatando[i]

    // ── LEÁLLÍTÁS-KÉRÉS. Ugyanaz a rendezett megállás, mint az időkeretnél:
    //    a maradék HALASZTOTT lesz, nem hibás, és minden napló-sor lezárva
    //    marad. A most futó hatókört SOHA nem szakítjuk félbe (lásd `megallj`).
    if (opts.megallj?.()) {
      leallitasMiattHalasztott = terv.futtatando.length - i
      break
    }

    // ── IDŐKERET. Rendezett megállás: a maradék HALASZTOTT lesz, nem hibás.
    //    Az `atlagosHatokorMs` miatt nem indítunk el olyan hatökört, ami
    //    várhatóan átlógna a HTTP-korláton — az átlógás nem megállás, hanem
    //    elvágódás, és „fut" állapotban ragadt napló-sort hagy maga után.
    const eltelt = Date.now() - ciklusKezdet
    const atlag = feldolgozva > 0 ? eltelt / feldolgozva : null
    if (
      !ferBeleUjabbHatokor({
        elteltMs: eltelt,
        maxFutasiIdoMs: korlatok.maxFutasiIdoMs,
        atlagosHatokorMs: atlag,
        // 2026-08-11: a paraméter neve `feldolgozott` (lásd batch.ts). A helyi
        // számláló `feldolgozva` — rövidítéssel átadva a mező NEM létező néven
        // ment volna át, és a `feldolgozott === 0` haladás-garancia némán
        // kimaradt volna.
        feldolgozott: feldolgozva,
      })
    ) {
      idoMiattHalasztott = terv.futtatando.length - i
      break
    }

    // A napló-sor lefoglalása HATÓKÖRÖNKÉNT hibázhat — és NEM viheti magával az
    // egész országos futást. (Korábban a `claim` a try-on KÍVÜL volt: egyetlen
    // napló-írási hiba a legelső gyülekezetnél mind a 784-et megölte.)
    let claim: ClaimResult
    try {
      claim = await claimBackupLog(admin, {
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        kind,
        runDate,
      })
    } catch (e: unknown) {
      sikertelen++
      feldolgozva++
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      console.error(
        `[backup] ${h.scope}/${h.congregationNev ?? 'globalis'} (${runDate}) napló-foglalás SIKERTELEN:`,
        uzenet,
      )
      eredmenyek.push(uresEredmeny(h, kind, runDate, { ok: false, hiba: uzenet }))
      continue
    }

    if (claim.kihagyva) {
      kihagyva++
      const sor = uresEredmeny(h, kind, runDate, { kihagyva: true })
      sor.backupLogId = claim.backupLogId
      eredmenyek.push(sor)
      continue
    }

    // ── ÉLŐ BÉRLET: egy MÁSIK futás dolgozik ezen a hatökörön.
    //    NEM nyúlunk hozzá (különben két fájl kerülne fel ugyanarról a napról),
    //    és NEM is jelentjük késznek — hátralévő marad, a következő szelet
    //    újrapróbálja. Napló-sort SEM írunk: az a másik futásé.
    if (claim.foglalt || claim.backupLogId === null) {
      foglalt++
      continue
    }
    const backupLogId = claim.backupLogId

    feldolgozva++
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
      result.backupLogId = backupLogId

      await finishOk(
        admin,
        backupLogId,
        result,
        semaUjjlenyomat,
        computeDelta(result.rowCounts, elozo?.rowCounts ?? {}),
        storage.nev,
      )
      sikeres++

      // ── A BAJ ELMÚLT: A KORÁBBI RIASZTÁST VISSZAVONJUK ────────────────────
      // ⚠️ 2026-08-11. A tulajdonos 21:09-kor kapott egy harangot arról, hogy a
      //    „Biharvajda" mentése sikertelen. 22:16-kor mind a 784 elkészült — az
      //    üzenet mégis változatlanul ott állt, mert SEMMI nem vonta vissza.
      //    Egy rendszer, ami csak panaszkodni tud, de azt nem tudja mondani,
      //    hogy „azóta rendben", előbb-utóbb hiteltelenné teszi a panaszait is.
      //    SOHA NEM DOB: a visszavonás elmaradása nem boríthatja a mentést.
      //    ⚠️ A `kind` ÁTADÁSA NEM FORMASÁG: csak a NAPI futás oldhat fel napi
      //    hibát. Egy `pre_restore` siker korábban „azóta rendben"-nek jelölt egy
      //    napi bukást, amit a sáv másnap változatlanul számonkért.
      await feloldMentesRiasztas({
        runDate,
        kind,
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
      }).catch(() => undefined)

      eredmenyek.push(result)
    } catch (e: unknown) {
      sikertelen++
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      // A stage-et az exportScope a hibán kívül nem adja vissza — a szöveg
      // viszont mindig megnevezi a lépést, ezért a naplóban is az áll.
      const stage: BackupFailureStage | null = detectStage(uzenet)
      const scopeFigyelmeztetesek: string[] = []

      bukottNevek.push(h.congregationNev ?? 'Rendszerszintű (globális) mentés')
      bukottHibak.push(uzenet)

      // ── RIASZTÁS — KORLÁTOZOTT KIMENŐ FORGALOMMAL (2026-08-11) ────────────
      //
      // ⚠️ MIÉRT NEM MINDEN BUKÁSRÓL MEGY KÜLÖN LEVÉL. A dedup-kulcs
      //    HATÓKÖRÖNKÉNT egyedi, tehát a tömeges bukást NEM fogta meg: egy
      //    lejárt Drive-token esetén mind a 784 hatókör ugyanott bukik, és a
      //    motor 784 KÜLÖN e-mailt indított volna el ugyanabból a Brevo-fiókból,
      //    amelyik a jelszó-visszaállítást és a meghívókat is viszi — plusz 784
      //    harang-sort a master 200 elemű postaládájába. A riasztás maga vált
      //    volna kieséssé.
      //
      //    Az első `RIASZTAS_NEVESITETT_MAX` bukás NEVESÍTVE megy ki (abból
      //    lehet tanulni), a többiről a futás végén EGYETLEN összesítő szól.
      //    ⛔ A NAPLÓ-SOR MINDEGYIKRŐL ELKÉSZÜL — a „minden bukásról tudni kell"
      //    elv nem sérül, csak nem a postafiókon keresztül teljesül.
      if (nevesitettRiasztas < RIASZTAS_NEVESITETT_MAX) {
        nevesitettRiasztas += 1
        const alertResult = await aktivRiaszto()({
          scope: h.scope,
          congregationId: h.congregationId,
          congregationNev: h.congregationNev,
          runDate,
          backupLogId,
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
      } else {
        scopeFigyelmeztetesek.push(
          `Erről a hatókörről NEM ment külön riasztás: ez a futás már ${RIASZTAS_NEVESITETT_MAX} ` +
            'bukást nevesítve jelentett, a többiről a futás végén EGY összesítő szól ' +
            '(különben a levelezés maga válna a hiba részévé). A hiba ITT, a naplóban van.',
        )
      }

      console.error(
        `[backup] ${h.scope}/${h.congregationNev ?? 'globalis'} (${runDate}) SIKERTELEN:`,
        uzenet,
      )
      await finishError(admin, backupLogId, stage, uzenet, scopeFigyelmeztetesek)

      eredmenyek.push({
        scope: h.scope,
        congregationId: h.congregationId,
        congregationNev: h.congregationNev,
        kind,
        runDate,
        ok: false,
        kihagyva: false,
        backupLogId,
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

  // ⚠️ A FOGLALT HATÓKÖR IS HÁTRAVAN. Egy másik futás dolgozik rajta — lehet,
  //    hogy sikerülni fog, lehet, hogy nem. Amíg nincs IGAZOLT mentése, addig
  //    nem kész. Ha ezt kihagynánk a `hatralevo`-ból, a futás késznek mondaná
  //    magát, miközben gyülekezetek maradtak mentés nélkül — pontosan az a
  //    néma féligazság, ami ellen az egész napló-szerződés szól.
  const hatralevo =
    terv.halasztott.length + idoMiattHalasztott + leallitasMiattHalasztott + foglalt
  const futottVegig = hatralevo === 0
  jelolLepes(
    lepesek,
    'mentes',
    // ⚠️ 2026-08-11 JAVÍTÁS — A NORMÁL MŰKÖDÉS NEM KAPHAT PIROS KERESZTET.
    //    Korábban itt `futottVegig && sikertelen === 0` állt, vagyis a lépés
    //    `false`-t kapott MINDEN köztes szeletnél — ami 784 hatókörnél a
    //    TERVEZETT, egészséges állapot (7+ szelet). A felület emiatt egy
    //    hibátlan, haladó futásra rajzolt keresztet, „ITT HIBÁZOTT"
    //    képernyőolvasó-szöveggel, nulla hiba mellett.
    //
    //    A helyes szerződés:
    //      · van bukott hatókör            → `false`  (ez és csak ez a hiba),
    //      · nincs bukás, de maradt hátra  → `'folyamatban'` (több szelet kell),
    //      · nincs bukás és végigmentünk   → `true`.
    //    A „még hátravan" tényt a `reszlet` és a `figyelmeztetesek` mondja ki —
    //    a felület tehát TOVÁBBRA SEM mutat zöldet egy félkész mentésre.
    sikertelen > 0 ? false : futottVegig ? true : 'folyamatban',
    `${sikeres} igazolt, ${kihagyva} kihagyva, ${sikertelen} hibás, ${hatralevo} hátravan` +
      (foglalt > 0 ? ` (ebből ${foglalt} másik futásnál van)` : ''),
  )
  if (!futottVegig) {
    figyelmeztetesek.push(
      `Ez a futás NEM végzett mindennel: ${hatralevo} hatókör hátravan (idő- vagy darab-korlát). ` +
        'Az elkészült mentések MEGVANNAK — indítsd újra a futást, az onnan folytatja, ahol ' +
        'abbahagyta (a ma már igazolt hatóköröket kihagyja).',
    )
  }
  if (foglalt > 0) {
    figyelmeztetesek.push(
      `${foglalt} hatókört EGY MÁSIK, éppen futó mentés tartott a kezében, ezért ez a futás ` +
        'hozzájuk nem nyúlt (így nem kerül két fájl ugyanarról a napról a tárolóba). ' +
        'A következő szelet újrapróbálja őket.',
    )
  }

  // ── 6/b) A TÖMEGES BUKÁS ÖSSZESÍTŐJE (2026-08-11) ────────────────────────
  //
  // EGY levél és EGY harang-sor a futás egészéről, ha a nevesített keretnél
  // több hatókör bukott. A dedup-kulcs NAPI (nem hatókörönkénti), tehát a
  // további szeletek összesítője kihagyásra kerül — így egy teljesen elszállt
  // éjszakából 784 levél helyett néhány darab lesz. SOHA NEM DOB.
  if (sikertelen > nevesitettRiasztas) {
    const gyakori = leggyakoribbHiba(bukottHibak)
    const osszesito = await sendMentesOsszesitoRiasztas({
      runDate,
      bukottDarab: sikertelen,
      elsoNevek: bukottNevek.slice(0, RIASZTAS_NEVESITETT_MAX),
      gyakoriHiba: gyakori,
    }).catch(() => ({ ok: false, csatornak: [] as string[], hiba: 'ismeretlen' }))
    figyelmeztetesek.push(
      osszesito.ok
        ? `${sikertelen} bukott hatókörről ÖSSZESÍTŐ riasztás ment ki (${osszesito.csatornak.join(', ') || 'nincs csatorna'}) — ` +
            `nevesítve csak az első ${nevesitettRiasztas}, hogy a levelezés maga ne váljon a hiba részévé.`
        : `Az összesítő riasztás NEM ment ki: ${osszesito.hiba || 'ismeretlen ok'}. ` +
            'A bukások a naplóban akkor is mind megvannak.',
    )
  }

  // ── 6/c) „A NAP VÉGÜL RENDBE JÖTT" — az összesítő visszavonása.
  //      Csak a NAPI futás oldhat fel napi riasztást, és csak akkor, ha ez a
  //      szelet tényleg mindennel végzett, hiba nélkül.
  if (kind === 'napi' && sikertelen === 0 && futottVegig) {
    await feloldMentesOsszesito(runDate).catch(() => undefined)
  }

  // ── 7) TAKARÍTÁS: a 24 óránál régebbi visszaállítási staging sorok.
  //      Személyes adatot tartalmaznak — nem maradhatnak ott a végtelenségig.
  const { error: cleanupError } = await admin.rpc('backup_restore_cleanup', {
    p_session: '00000000-0000-0000-0000-000000000000',
  })
  if (cleanupError) {
    // ⚠️ 2026-08-11 JAVÍTÁS: ez `false` volt. A takarítás bukása csak
    //    figyelmeztetés (a mentés elkészült, a staging sorok maradnak egy napig)
    //    — mégis piros keresztet kapott egy sikeres futás jelentésében.
    jelolLepes(lepesek, 'takaritas', 'figyelmeztetes', cleanupError.message)
    figyelmeztetesek.push(
      `A visszaállítási átmeneti tár takarítása sikertelen: ${cleanupError.message}`,
    )
  } else {
    jelolLepes(lepesek, 'takaritas', true)
  }

  return {
    futott:
      terv.futtatando.length -
      idoMiattHalasztott -
      leallitasMiattHalasztott +
      terv.kihagyando.length,
    sikeres,
    sikertelen,
    kihagyva,
    runDate,
    semaUjjlenyomat,
    figyelmeztetesek,
    hatokorok: eredmenyek,
    osszes: hatokorok.length,
    feldolgozva,
    hatralevo,
    foglalt,
    futottVegig,
    lepesek,
  }
}

/**
 * A LEGGYAKORIBB hibaüzenet a bukott hatókörök közül.
 *
 * Miért kell: ha 784 hatókör bukik, azoknak szinte biztosan EGY közös okuk van
 * (lejárt Google-kapcsolat, tele tároló, hálózat). Az összesítő riasztás ezt az
 * egy mondatot viszi ki — enélkül a tulajdonos csak egy darabszámot kapna, és a
 * valódi ok a naplóban maradna.
 *
 * ⛔ NEM tartalmazhat mentett adatot: a bemenet a motor SAJÁT hibaüzenete.
 */
function leggyakoribbHiba(uzenetek: string[]): string | null {
  if (uzenetek.length === 0) return null
  const darab = new Map<string, number>()
  for (const u of uzenetek) {
    // Az első 120 karakter a „fajta"; a hosszú farok (azonosítók, méretek) nem
    // számít bele, különben minden üzenet külön csoport lenne.
    const kulcs = u.slice(0, 120)
    darab.set(kulcs, (darab.get(kulcs) ?? 0) + 1)
  }
  let nyertes: string | null = null
  let max = 0
  for (const [kulcs, n] of darab) {
    if (n > max) {
      max = n
      nyertes = kulcs
    }
  }
  return nyertes
}

/**
 * Üres (kihagyott vagy meg sem kezdett) hatókör-eredmény.
 *
 * Miért külön függvény: a `BackupScopeResult` húsz mezős, és háromszor kellene
 * kézzel kitölteni. Egy elfelejtett mező itt csendes féligazságot jelentene a
 * felületen — pont az a hibaosztály, ami ellen ez az egész kör szól.
 */
function uresEredmeny(
  h: { scope: BackupScope; congregationId: string | null; congregationNev: string | null },
  kind: BackupKind,
  runDate: string,
  allapot: { ok?: boolean; kihagyva?: boolean; hiba?: string },
): BackupScopeResult {
  return {
    scope: h.scope,
    congregationId: h.congregationId,
    congregationNev: h.congregationNev,
    kind,
    runDate,
    ok: allapot.ok ?? true,
    kihagyva: allapot.kihagyva ?? false,
    backupLogId: null,
    stage: allapot.hiba ? detectStage(allapot.hiba) : null,
    hiba: allapot.hiba ?? null,
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
    // A BESZÉDES HIBA ide is átjön: ha az előkészítő fázis bukott, a hívó
    // (visszaállítás előtti mentés) megkapja a TEENDŐT is, nem csak a tényt.
    const teendo = e instanceof BackupWorkerError ? ` ${e.teendo}` : ''
    return {
      ok: false,
      igazolt: false,
      backupLogId: null,
      finishedAt: null,
      totalRows: 0,
      figyelmeztetesek: [],
      error: (e instanceof Error ? e.message : 'A mentés nem sikerült.') + teendo,
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
