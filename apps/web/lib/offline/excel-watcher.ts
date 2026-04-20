/**
 * Excel File Watcher — a lokális KARTOTEKA mappában figyeli az Excel
 * fájlok változását, és eventet emittál, ha a user Excel-ben módosított.
 *
 * Működés:
 *  1. 60s-enként (ha tab visible) végignézi az összes modul-fájlt
 *  2. Összeveti a `file.lastModified`-ot a _sync_meta-ban tárolt utolsó
 *     "saját write" időbélyeggel
 *  3. Ha `lastModified > lastOwnWrite + grace`, eventet emittál (user módosított)
 *
 * Grace period: 5 másodperc — ennyit várunk, hogy a fájlrendszer stabilizáljon,
 * és ne észleljük a saját write-ot user-módosításnak.
 *
 * A watcher NEM automatikusan alkalmazza a változásokat — csak emittál eventet,
 * a user a `/offline/import` oldalon dönti el mit tart meg.
 */

import { getDb } from './db'
import {
  getStoredRootHandle,
  getOrCreateKartotekaDir,
  isFileSystemAccessSupported,
} from './fs-handle-store'
import { getAllExcelSchemas } from './excel-schema/registry'

// ─────────────────────────────────────────────────────────────────
// Állapot
// ─────────────────────────────────────────────────────────────────

interface WatcherState {
  active: boolean
  timerId: number | null
  intervalMs: number
  congregationSlug: string | null
  /** Event listener callback-ek */
  listeners: Set<(event: WatcherEvent) => void>
  /** Utolsó saját write időbélyeg modulonként — ignoráljuk ezeket */
  lastOwnWrites: Map<string, number>
}

export interface WatcherEvent {
  type: 'excel_changed' | 'excel_error'
  fileName: string
  module: string
  lastModified?: number
  error?: string
}

export type WatcherEventListener = (event: WatcherEvent) => void

const GRACE_PERIOD_MS = 5_000

// ─────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────

class ExcelWatcher {
  private state: WatcherState = {
    active: false,
    timerId: null,
    intervalMs: 60_000, // 60s
    congregationSlug: null,
    listeners: new Set(),
    lastOwnWrites: new Map(),
  }

  subscribe(listener: WatcherEventListener): () => void {
    this.state.listeners.add(listener)
    return () => this.state.listeners.delete(listener)
  }

  private emit(event: WatcherEvent): void {
    for (const l of this.state.listeners) {
      try {
        l(event)
      } catch (e) {
        console.error('[excel-watcher]', e)
      }
    }
  }

  /**
   * A sync-orchestrator / excel-writer hívja, amikor SAJÁT write történt.
   * A watcher ignorálja a változást a következő GRACE_PERIOD_MS-ig.
   */
  markOwnWrite(moduleKey: string): void {
    this.state.lastOwnWrites.set(moduleKey, Date.now())
  }

  async start(congregationSlug: string, intervalMs = 60_000): Promise<void> {
    if (typeof window === 'undefined') return
    if (!isFileSystemAccessSupported()) return
    if (this.state.active) return

    this.state.active = true
    this.state.congregationSlug = congregationSlug
    this.state.intervalMs = intervalMs

    // Első azonnali scan, aztán időnként újra
    await this.scan()

    this.state.timerId = window.setInterval(() => {
      // Csak aktív tab-nál
      if (document.visibilityState !== 'visible') return
      void this.scan()
    }, intervalMs)
  }

  stop(): void {
    if (this.state.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.state.timerId)
      this.state.timerId = null
    }
    this.state.active = false
    this.state.listeners.clear()
  }

  async scanNow(): Promise<void> {
    return this.scan()
  }

  // ─────────────────────────────────────────────────────────────
  // A fő scan — minden regisztrált modulfájlt ellenőriz
  // ─────────────────────────────────────────────────────────────

  private async scan(): Promise<void> {
    if (!this.state.congregationSlug) return

    const rootHandle = await getStoredRootHandle()
    if (!rootHandle) return

    // Permission ellenőrzés (nem kérjük újra a promptot — a scan háttér)
    // @ts-expect-error — queryPermission experimental typing
    const perm: PermissionState = await rootHandle.queryPermission({
      mode: 'readwrite',
    })
    if (perm !== 'granted') return

    let congDir: FileSystemDirectoryHandle
    try {
      congDir = await getOrCreateKartotekaDir(
        rootHandle,
        this.state.congregationSlug,
      )
    } catch {
      // A mappa nem elérhető — elhagyjuk
      return
    }

    const now = Date.now()

    for (const schema of getAllExcelSchemas()) {
      try {
        const fileHandle = await congDir.getFileHandle(schema.fileName, {
          create: false,
        })
        const file = await fileHandle.getFile()

        const lastModified = file.lastModified
        const lastOwnWrite = this.state.lastOwnWrites.get(schema.module) || 0

        // Ha a `lastModified` <= lastOwnWrite + grace → saját write, ignoráljuk
        if (lastModified <= lastOwnWrite + GRACE_PERIOD_MS) continue

        // Tárolt "utolsó észlelt lastModified" a _sync_meta-ban (külön key-szel)
        const metaKey = `excel_watch_${schema.module}`
        const db = getDb()
        const existing = await db._sync_meta.get(metaKey)
        const lastSeen = existing?.lastPullAt
          ? parseInt(existing.lastPullAt, 10) || 0
          : 0

        if (lastModified <= lastSeen) continue // már láttuk

        // Új változás → emittál
        this.emit({
          type: 'excel_changed',
          fileName: schema.fileName,
          module: schema.module,
          lastModified,
        })

        // Mentsük el, hogy ne emitteljük újra ugyanezt
        await db._sync_meta.put({
          table: metaKey,
          lastPullAt: String(lastModified),
          lastPushAt: String(now),
          lastError: null,
          congregationId: null,
          schemaVersion: schema.schemaVersion,
          dirty: false,
        })
      } catch (e) {
        // NotFoundError = a fájl nem létezik → első export előtt, OK
        if (e instanceof Error && e.name === 'NotFoundError') continue
        this.emit({
          type: 'excel_error',
          fileName: schema.fileName,
          module: schema.module,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────

let instance: ExcelWatcher | null = null

export function getExcelWatcher(): ExcelWatcher {
  if (!instance) instance = new ExcelWatcher()
  return instance
}
