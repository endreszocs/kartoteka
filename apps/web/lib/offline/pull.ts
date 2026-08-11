/**
 * Pull sync — Supabase → Dexie delta sync.
 *
 * Minden sync-tracked táblára működik:
 *  1. Lekérjük a lastPullAt cursor-t a _sync_meta-ból
 *  2. Supabase query: WHERE updated_at > lastPullAt AND congregation_id = scope
 *  3. LAPOZOTT olvasás (.order('id').range(...)), oldalanként bulk upsert
 *     Dexie-be (minden rekordnál `_syncStatus = 'clean'`)
 *  4. A cursor-t CSAK akkor léptetjük, ha a lapozás bizonyítottan végigért
 *
 * Fontos: a kliens-oldali Supabase client az `@supabase/ssr` createBrowserClient-tel
 * készül — automatikusan használja a session cookie-t, RLS-sel védve.
 *
 * ─────────────────────────────────────────────────────────────────
 * 2026-08-11 (P1-perf/adatvesztés) — lapozás + explicit oszloplista
 * ─────────────────────────────────────────────────────────────────
 * A korábbi implementáció EGYETLEN, lapozatlan `select(entry.select || '*')`
 * kérést küldött. Két külön hibát okozott:
 *
 *  (1) NÉMA CSONKOLÁS: a PostgREST alapértelmezett 1000 soros plafonja
 *      hibaüzenet nélkül levágta a választ, a `pulledCount` 1000-et jelentett,
 *      a `setSyncMeta({ lastPullAt: cursorTo })` viszont ELŐRELÉPTETTE a
 *      kurzort a soha le nem töltött sorok fölött. Egy 2500 fős gyülekezet
 *      1500 tagja így VÉGLEG kimaradt az offline nyilvántartásból, mert a
 *      következő delta-pull már csak az azóta módosult sorokat kérte.
 *      Ez pontosan az a hibaosztály, amit 2026-08-10-én a temetői táblák
 *      hatókör-szivárgásánál is javítottunk: a szinkron csendben ROSSZ
 *      adathalmazt tárolt, és semmi nem jelezte.
 *  (2) MÉRET: `SELECT *` minden táblán — a `szemely`-nél a base64 fényképet
 *      tároló `kep` oszloppal együtt (lásd table-registry.ts).
 *
 * Mostantól: oldalanként `PULL_PAGE_SIZE` sor, determinisztikus `id` sorrend,
 * és a kurzor CSAK a rövid (= utolsó) oldal után lép. Ha a biztonsági
 * sorlimit elfogy, a művelet HIBÁVAL tér vissza és a kurzor marad — a
 * következő szinkron ugyanonnan folytatja (fail-closed).
 */

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { getDb, getSyncMeta, setSyncMeta, type SyncTrackedRecord } from './db'
import {
  TABLE_REGISTRY,
  getTableEntry,
  type TableRegistryEntry,
} from './table-registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface PullResult {
  table: string
  pulledCount: number
  cursorFrom: string | null
  cursorTo: string
  error?: string
}

/**
 * Egy lapozási oldal mérete. A PostgREST alapértelmezett `max-rows` plafonja
 * 1000, ezért ennél NAGYOBB értéket nem szabad megadni: a szerver csendben
 * levágná az oldalt, és a „rövid oldal = vége" feltétel hamisan teljesülne.
 */
const PULL_PAGE_SIZE = 1000

/**
 * Szerveroldali biztonsági sorlimit egy táblára, egy pull-ciklusban.
 * Ha elfogy, inkább hibázunk (és NEM léptetjük a kurzort), mint hogy
 * hiányos állapotot rögzítsünk késznek. Ugyanaz a minta, mint a
 * `registry-list-actions.ts` MAX_SERVER_SCAN_ROWS őre.
 */
const MAX_PULL_ROWS = 200_000

// ─────────────────────────────────────────────────────────────────
// Egyetlen tábla pull-olása
// ─────────────────────────────────────────────────────────────────

/**
 * Egyetlen tábla delta pull-ja. Visszaadja, hány új/módosult rekord jött le.
 *
 * Ha `lastPullAt` null (első pull), a teljes táblát letölti.
 * Egyébként: csak a `updated_at > lastPullAt` rekordokat.
 *
 * Idempotens — ismételt futtatás ugyanazzal a cursor-ral ugyanazt adja.
 */
export async function pullTable(
  entry: TableRegistryEntry,
  congregationId: string,
  /**
   * IDŐKORLÁT-JEL (2026-08-11). Az orchestrator körönként EGY
   * `AbortController`-t ad; ha a kör túllépi az időkorlátot, minden még futó
   * kérés megszakad. Enélkül egyetlen beragadt `fetch` (gyenge térerő, alagút,
   * halott Wi-Fi) ÖRÖKRE „Szinkronizálás folyamatban…" állapotban hagyta a
   * jelzőt — a `navigator.onLine` ilyenkor is `true`-t mond, mert az csak
   * interfész-szintű.
   */
  signal?: AbortSignal,
): Promise<PullResult> {
  const db = getDb()
  const supabase = createBrowserSupabase()

  const meta = await getSyncMeta(entry.dexieTable, congregationId)
  const cursorFrom = meta.lastPullAt
  const cursorTo = new Date().toISOString()
  const dexieTable = db.table(entry.dexieTable)

  let pulledCount = 0
  let completed = false

  // Lapozott olvasás: determinisztikus `id` sorrend + `.range()`.
  // A `for` fejléce maga a biztonsági sorlimit — végtelen ciklus kizárva.
  for (let from = 0; from < MAX_PULL_ROWS; from += PULL_PAGE_SIZE) {
    // Query felépítése (oldalanként újra, mert a PostgREST builder láncolt)
    let query = supabase.from(entry.supabaseTable).select(entry.select || '*')

    if (entry.scopeFilter === 'congregation_id') {
      query = query.eq('congregation_id', congregationId)
    }

    if (cursorFrom) {
      query = query.gt('updated_at', cursorFrom)
    }

    // Soft-delete is szinkronizálódik (a kliens oldalon kell tudni)
    // NEM szűrünk a deleted=false-ra — hagyjuk, hogy a Dexie-be kerüljön,
    // hogy a Kuka view is lássa őket

    let lapozott = query.order('id', { ascending: true }).range(from, from + PULL_PAGE_SIZE - 1)
    if (signal) lapozott = lapozott.abortSignal(signal)

    const { data, error } = await lapozott

    if (error) {
      // HIBA: a kurzort NEM léptetjük — a következő szinkron ugyanonnan indul.
      // (Ha az oszloplista sodródott el a sémától, a PostgREST 42703-at ad;
      // az üzenet a „Kapcsolat nélküli mód" panelen lastError-ként látszik.)
      await setSyncMeta({ ...meta, lastError: error.message })
      return {
        table: entry.dexieTable,
        pulledCount,
        cursorFrom,
        cursorTo,
        error: error.message,
      }
    }

    const rows = (data || []) as unknown as Array<Record<string, unknown>>

    if (rows.length > 0) {
      // Dexie upsert — minden rekord `_syncStatus = 'clean'`-nel.
      // Oldalanként írunk, hogy egy megszakadt pull is hagyjon hasznos adatot.
      const enriched = rows.map(row => ({
        ...row,
        _syncStatus: 'clean' as const,
        _baseRevision: (row.revision as number) || 0,
      }))

      await db.transaction('rw', dexieTable, async () => {
        await dexieTable.bulkPut(enriched as unknown as SyncTrackedRecord[])
      })

      pulledCount += rows.length
    }

    // RÖVID OLDAL = a lekérdezés végigért. Csak ilyenkor teljes a pull.
    if (rows.length < PULL_PAGE_SIZE) {
      completed = true
      break
    }
  }

  if (!completed) {
    // A biztonsági sorlimit elfogyott — a kurzort SZÁNDÉKOSAN nem léptetjük,
    // különben pont azt a néma adatvesztést állítanánk vissza, amit javítunk.
    const message =
      `A(z) „${entry.label}" tábla letöltése nem fejeződött be: ` +
      `a biztonsági sorlimit (${MAX_PULL_ROWS}) elfogyott. ` +
      `A helyi másolat hiányos, a szinkron a következő futáskor újrapróbálja.`
    await setSyncMeta({ ...meta, lastError: message })
    return { table: entry.dexieTable, pulledCount, cursorFrom, cursorTo, error: message }
  }

  // Cursor frissítés — CSAK a bizonyítottan teljes lapozás után
  await setSyncMeta({
    ...meta,
    lastPullAt: cursorTo,
    lastError: null,
  })

  return { table: entry.dexieTable, pulledCount, cursorFrom, cursorTo }
}

// ─────────────────────────────────────────────────────────────────
// Minden tábla pull-ja (orchestrator hívja)
// ─────────────────────────────────────────────────────────────────

export interface PullAllResult {
  totalPulled: number
  byTable: PullResult[]
  errors: Array<{ table: string; error: string }>
}

export async function pullAllTables(
  congregationId: string,
  signal?: AbortSignal,
): Promise<PullAllResult> {
  const byTable: PullResult[] = []
  const errors: Array<{ table: string; error: string }> = []
  let totalPulled = 0

  // Prioritás szerint (szemely előbb, mint befizetes — az FK miatt)
  const sorted = [...TABLE_REGISTRY].sort((a, b) => a.priority - b.priority)

  for (const entry of sorted) {
    // Ha a kör időkorlátja lejárt, NEM kezdünk új táblát, és NEM gyártunk
    // 27 egyforma hibaüzenetet — egyetlen, emberi mondat megy a felületre.
    if (signal?.aborted) {
      errors.push({
        table: entry.dexieTable,
        error:
          'A letöltés túllépte az időkorlátot, ezért megszakítottuk. ' +
          'A már letöltött adatok megvannak, a többit a következő szinkron pótolja.',
      })
      break
    }
    const result = await pullTable(entry, congregationId, signal)
    byTable.push(result)
    if (result.error) {
      errors.push({ table: entry.dexieTable, error: result.error })
    } else {
      totalPulled += result.pulledCount
    }
  }

  return { totalPulled, byTable, errors }
}

// ─────────────────────────────────────────────────────────────────
// Egy konkrét tábla pull-olása név alapján
// ─────────────────────────────────────────────────────────────────

export async function pullByTableName(
  tableName: string,
  congregationId: string,
  signal?: AbortSignal,
): Promise<PullResult> {
  const entry = getTableEntry(tableName)
  if (!entry) {
    return {
      table: tableName,
      pulledCount: 0,
      cursorFrom: null,
      cursorTo: new Date().toISOString(),
      error: `Ismeretlen tábla: ${tableName}`,
    }
  }
  return await pullTable(entry, congregationId, signal)
}
