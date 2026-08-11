/**
 * Sync Orchestrator — a KARTOTEKA offline-first PWA szinkron koordinátora.
 *
 * Egyetlen singleton fut a kliensben, ami:
 *  1. `navigator.onLine` + `visibilitychange` eventeket figyeli
 *  2. Periodikusan pull-t hajt végre (2 perc ha aktív tab, 15 perc ha háttér)
 *  3. A mutation_queue-ből push-ol változtatásokat
 *  4. Exponential backoff a hibás push-okra (1s, 4s, 16s, 1min, 5min, max 30min)
 *  5. Event bus: a UI komponensek (status bar, konfliktus dialog) feliratkozhatnak
 *
 * FÁZIS 0 STÁTUSZ: Ez egy skeleton. A pull és push konkrét logikáját a Fázis 1-2
 * tölti meg. Most csak a kapcsoló-váz és az event bus.
 */

import { getDb, setSyncMeta } from './db'
import { resetStuckSyncing } from './mutation-queue'
import { pullAllTables, pullByTableName } from './pull'
import { pushBatch } from './push'
import { checkRestoreEpoch, quarantineAndResync } from './restore-epoch'

/**
 * A SZINKRON IDŐZÍTÉSE — EGYETLEN IGAZSÁGFORRÁS (2026-08-11).
 *
 * A fejléc szinkron-panelje ezeket a számokat írja ki a lelkésznek („2
 * percenként frissül…"). Ha a panel saját, bemásolt konstansokból dolgozna,
 * előbb-utóbb mást mondana, mint amit a rendszer tesz — pontosan az a néma
 * széthúzás, amit ez a projekt már többször megszenvedett. Ezért a timer-ek ÉS
 * a felület UGYANEBBŐL az objektumból olvasnak.
 */
export const SYNC_IDOZITES = {
  /** Periodikus letöltés, ha a fül látható. */
  aktivPullMs: 2 * 60 * 1000,
  /** Periodikus letöltés, ha a fül háttérben van. */
  hatterPullMs: 15 * 60 * 1000,
  /** A helyi módosítások feltöltésének gyakorisága. */
  pushMs: 30 * 1000,
  /**
   * EGY letöltési kör felső időkorlátja. Ennek letelte után a kör megszakad.
   * ⚠️ Enélkül a „Szinkronizálás folyamatban…" ÖRÖKRE beragadhatott: a láncban
   * sehol nem volt `AbortController` vagy időkorlát, és egyetlen soha nem
   * rendeződő `fetch` (gyenge térerő) elég volt hozzá.
   */
  pullKorIdokorlatMs: 4 * 60 * 1000,
  /** EGY feltöltési kör felső időkorlátja. */
  pushKorIdokorlatMs: 90 * 1000,
} as const

/**
 * „Vagy megjön, vagy időkorlát." Nem szakítja meg a mögöttes műveletet — csak
 * garantálja, hogy a HÍVÓ nem vár rá örökké. Ott használjuk, ahol a megszakítás
 * több kárt okozna, mint a várakozás (lásd `pushAll` kommentje).
 */
function ezVagyIdotullepes<T>(
  muvelet: Promise<T>,
  idokorlatMs: number,
  uzenet: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const idozito = setTimeout(() => reject(new Error(uzenet)), idokorlatMs)
    muvelet.then(
      (ertek) => {
        clearTimeout(idozito)
        resolve(ertek)
      },
      (hiba) => {
        clearTimeout(idozito)
        reject(hiba)
      },
    )
  })
}

// M6.3 (2026-04-22): a portable standalone kivezetésével együtt eltávolítva
// a sync-orchestrator STANDALONE fast-path-e. Az eddig "no-op standalone
// módban" ágak mind normál pull/push-t csinálnak — a web kliens mindig
// Dexie ↔ Supabase sync-et futtat, a desktop pedig Tauri-oldali SQLCipher-t
// használ (NEM ezt az orchestrator-t).

// ─────────────────────────────────────────────────────────────────
// Event típusok
// ─────────────────────────────────────────────────────────────────

export type SyncEventType =
  | 'pull_started'
  | 'pull_completed'
  | 'pull_error'
  | 'push_started'
  | 'push_completed'
  | 'push_error'
  | 'conflict_detected'
  | 'online'
  | 'offline'
  | 'scope_changed'
  /** A rendszergazda visszaállította a gyülekezet adatait — teljes újratöltés. */
  | 'restore_detected'

export interface SyncEvent {
  type: SyncEventType
  table?: string
  rowId?: string
  error?: string
  /**
   * A KÖR TÁBLA-SZINTŰ HIBÁI (2026-08-11).
   *
   * ⚠️ MIÉRT KELL: a `pullAll` korábban előbb kiemittelte az összes
   * `pull_error`-t, majd KÖZVETLENÜL utána MINDIG `pull_completed`-et. A jelző
   * a `completed` ágon `setLastError(null)`-t hívott, tehát a gondosan magyarul
   * megfogalmazott hibaüzenetek EGYETLEN render-ciklust sem éltek meg — a
   * lelkész sosem tudta meg, hogy a helyi másolata hiányos. Mostantól a
   * `pull_completed` MAGÁVAL VISZI a hibákat, és a felület ez alapján dönt.
   */
  errors?: Array<{ table: string; error: string }>
  timestamp: number
}

export type SyncEventListener = (event: SyncEvent) => void

// ─────────────────────────────────────────────────────────────────
// Orchestrator állapot
// ─────────────────────────────────────────────────────────────────

interface OrchestratorState {
  /** Jelenleg aktív — pull/push művelet fut */
  active: boolean
  /** Kliens offline vagy online */
  online: boolean
  /** Periodikus pull timer ID (setInterval) */
  pullTimer: number | null
  /** Periodikus push timer ID */
  pushTimer: number | null
  /** Jelenlegi congregation scope (wipe-re használjuk) */
  congregationId: string | null
  /** Periódus ms-ben — aktív tab */
  activePullIntervalMs: number
  /** Periódus ms-ben — háttér tab */
  backgroundPullIntervalMs: number
}

// ─────────────────────────────────────────────────────────────────
// Orchestrator osztály
// ─────────────────────────────────────────────────────────────────

class SyncOrchestrator {
  private state: OrchestratorState = {
    active: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : false,
    pullTimer: null,
    pushTimer: null,
    congregationId: null,
    activePullIntervalMs: SYNC_IDOZITES.aktivPullMs,
    backgroundPullIntervalMs: SYNC_IDOZITES.hatterPullMs,
  }

  private listeners = new Set<SyncEventListener>()

  /**
   * RE-ENTRANCIA-ŐRSZEM (2026-08-11).
   *
   * ⚠️ MIÉRT: egy teljes letöltési kör (27 tábla, lapozva) egy nagy
   * gyülekezetnél vagy lassú hálózaton TOVÁBB tarthat 2 percnél. A timer
   * ilyenkor egy MÁSODIK kört is elindított, és az elsőként befejeződő kör
   * `pull_completed`-je lekapcsolta a jelzőt — miközben még futott egy másik.
   * A jelző így MINDKÉT irányba tudott hazudni: késznek látszott futás közben,
   * és futónak látszott, amikor már semmi nem futott.
   */
  private pullFut = false
  private pushFut = false

  /** Az utolsó letöltési kör INDULÁSA (ms). A fül-visszatérés dönt belőle. */
  private utolsoPullKezdet = 0

  // ─────────────────────────────────────────────────────────────
  // Event bus
  // ─────────────────────────────────────────────────────────────

  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error('[sync-orchestrator] listener error:', e)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Indítás / leállítás
  // ─────────────────────────────────────────────────────────────

  /**
   * Elindítja az orchestrator-t egy adott congregation scope-hoz.
   * Ha a scope változik, előbb wipe-oljuk a cache-t, aztán pull-t csinálunk.
   */
  async start(congregationId: string | null): Promise<void> {
    if (typeof window === 'undefined') return

    // Scope változás? → wipe
    if (this.state.congregationId && this.state.congregationId !== congregationId) {
      const { wipeDb } = await import('./db')
      await wipeDb()
      this.emit({ type: 'scope_changed', timestamp: Date.now() })
    }

    // 2026-08-10 (biztonsági takarítás): a korábbi nyitott RLS-policy-k miatt a
    // temetői táblák MINDEN gyülekezet sorát letöltötték a helyi cache-be —
    // ezt egyszeri, jelölővel védett ürítéssel takarítjuk (lásd db.ts).
    try {
      const { purgeLeakedOfflineCaches } = await import('./db')
      await purgeLeakedOfflineCaches()
    } catch {
      /* nem kritikus — a szinkron induljon el akkor is */
    }

    // BERAGADT FELTÖLTÉSEK HELYREÁLLÍTÁSA. Indításkor definíció szerint egyetlen
    // push sem lehet folyamatban, tehát minden 'syncing' sor árva: egy korábbi
    // fül bezárása / összeomlása hagyta ott. Enélkül a lelkész helyi módosítása
    // ÖRÖKRE ott ragadt, és a felület zöldet mutatott (néma adatvesztés).
    try {
      const visszaallitva = await resetStuckSyncing()
      if (visszaallitva > 0) {
        console.warn(
          `[sync-orchestrator] ${visszaallitva} félbeszakadt feltöltést visszaállítottunk.`,
        )
      }
    } catch (e) {
      console.error('[sync-orchestrator] a beragadt feltöltések visszaállítása nem sikerült:', e)
    }

    this.state.congregationId = congregationId
    this.state.active = true

    // Browser event handlers
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)

    // Periodikus pull + push
    this.schedulePull()
    this.schedulePush()

    // Azonnal futtassuk az első pull-t (ha online)
    if (this.state.online) {
      void this.pullAll()
    }
  }

  /** Leállítja az orchestrator-t (pl. logout, scope szerep vesztés). */
  stop(): void {
    if (typeof window === 'undefined') return
    this.state.active = false
    if (this.state.pullTimer !== null) {
      window.clearInterval(this.state.pullTimer)
      this.state.pullTimer = null
    }
    if (this.state.pushTimer !== null) {
      window.clearInterval(this.state.pushTimer)
      this.state.pushTimer = null
    }
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  // ─────────────────────────────────────────────────────────────
  // Event handlerek
  // ─────────────────────────────────────────────────────────────

  private handleOnline = (): void => {
    this.state.online = true
    this.emit({ type: 'online', timestamp: Date.now() })
    // Azonnal pumpáljuk a queue-t…
    void this.pushAll()
    // …és LE IS TÖLTÜNK. Korábban a visszatérés a hálózatra CSAK feltöltést
    // indított: a lelkész visszaért a térerőbe, és a képernyőn továbbra is a
    // kapcsolat előtti, elavult adat volt, amíg a 2 perces timer el nem sült.
    void this.pullAll()
  }

  private handleOffline = (): void => {
    this.state.online = false
    this.emit({ type: 'offline', timestamp: Date.now() })
  }

  private handleVisibilityChange = (): void => {
    // Ha visszatér a user a tabra → újra schedule aktív intervallal.
    this.schedulePull()
    // ⚠️ A `schedulePull` NULLÁZZA a visszaszámlálást. Egy sokat fülváltogató
    //    felhasználónál emiatt a periodikus letöltés SOHA nem sült el. Ezért:
    //    ha a fül láthatóvá válik és az utolsó kör régebbi az aktív
    //    periódusnál, AZONNAL letöltünk.
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      this.state.online &&
      this.state.active &&
      Date.now() - this.utolsoPullKezdet > this.state.activePullIntervalMs
    ) {
      void this.pullAll()
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Timer ütemezés
  // ─────────────────────────────────────────────────────────────

  private schedulePull(): void {
    if (this.state.pullTimer !== null) {
      window.clearInterval(this.state.pullTimer)
    }
    const interval =
      document.visibilityState === 'visible'
        ? this.state.activePullIntervalMs
        : this.state.backgroundPullIntervalMs
    this.state.pullTimer = window.setInterval(() => {
      if (this.state.online && this.state.active) {
        void this.pullAll()
      }
    }, interval)
  }

  private schedulePush(): void {
    if (this.state.pushTimer !== null) {
      window.clearInterval(this.state.pushTimer)
    }
    // Push gyakran, hogy ne várjon a user — 30s
    this.state.pushTimer = window.setInterval(() => {
      if (this.state.online && this.state.active) {
        void this.pushAll()
      }
    }, 30 * 1000)
  }

  // ─────────────────────────────────────────────────────────────
  // Pull (Fázis 1-ben tölt meg)
  // ─────────────────────────────────────────────────────────────

  /**
   * Lekéri az összes regisztrált tábla delta-ját (updated_at > lastPullAt).
   */
  async pullAll(): Promise<void> {
    if (!this.state.online || !this.state.congregationId) return
    // Re-entrancia: ha még fut egy kör, NEM indítunk másodikat (lásd `pullFut`).
    if (this.pullFut) return
    this.pullFut = true
    this.utolsoPullKezdet = Date.now()

    // IDŐKORLÁT. A kör végén MINDIG törlődik — se szivárgó timer, se örökké
    // pörgő jelző.
    const vezerlo = new AbortController()
    const idozito = setTimeout(() => vezerlo.abort(), SYNC_IDOZITES.pullKorIdokorlatMs)

    try {
      // ⚠️ A VISSZAÁLLÍTÁS-ŐR MINDIG A PULL ELŐTT FUT. Ha közben a rendszergazda
      //    visszaállított egy korábbi mentést, a helyi másolatot EL KELL DOBNI —
      //    különben a delta-pull (`updated_at > lastPullAt`) sosem venné észre a
      //    régi időbélyegű, visszaállított sorokat.
      await this.ensureRestoreEpoch()

      this.emit({ type: 'pull_started', timestamp: Date.now() })

      const result = await pullAllTables(this.state.congregationId, vezerlo.signal)

      // Ha volt hiba legalább egy táblán, event is mennie kell
      for (const err of result.errors) {
        this.emit({
          type: 'pull_error',
          table: err.table,
          error: err.error,
          timestamp: Date.now(),
        })
      }

      // ⚠️ A `pull_completed` MAGÁVAL VISZI a hibákat. Enélkül a felület a
      //    „kész" jelzésre törölte a hibát, és a hibaüzenet sosem látszott.
      this.emit({
        type: 'pull_completed',
        errors: result.errors.length > 0 ? result.errors : undefined,
        timestamp: Date.now(),
      })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.emit({ type: 'pull_error', error, timestamp: Date.now() })
    } finally {
      clearTimeout(idozito)
      this.pullFut = false
    }
  }

  /**
   * Egyetlen tábla delta pull-ja (pl. egy modul megnyitásakor friss frissítés).
   */
  async pullTable(table: string): Promise<void> {
    if (!this.state.online || !this.state.congregationId) return

    this.emit({ type: 'pull_started', table, timestamp: Date.now() })

    try {
      const result = await pullByTableName(table, this.state.congregationId)
      if (result.error) {
        this.emit({
          type: 'pull_error',
          table,
          error: result.error,
          timestamp: Date.now(),
        })
        await this.markError(table, result.error)
      } else {
        this.emit({ type: 'pull_completed', table, timestamp: Date.now() })
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.emit({ type: 'pull_error', table, error, timestamp: Date.now() })
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Push (Fázis 2-ben tölt meg)
  // ─────────────────────────────────────────────────────────────

  /**
   * A mutation_queue-ből feldolgozza a pending mutation-öket.
   *
   * FONTOS: Csak online fut. A push sorrend FIFO (clientTimestamp szerint).
   * Exponential backoff az ismételt hibáknál, 5 retry után dead letter.
   */
  async pushAll(): Promise<void> {
    if (!this.state.online || !this.state.congregationId) return
    if (this.pushFut) return
    this.pushFut = true

    try {
      const db = getDb()
      // ⚠️ A SORREND SZÁNDÉKOS: ELŐBB nézzük meg, van-e egyáltalán mit
      //    feltölteni. A visszaállítás-őr hálózati kört jelent; korábban a
      //    pending-ellenőrzés ELŐTT futott, ezért óránként ~120 fölösleges
      //    lekérdezést küldött fülönként, nulla várakozó mutáció mellett is.
      //
      //    HOGY EZ NE VEGYEN EL SEMMIT: a visszaállítás ÉSZLELÉSE nem múlik a
      //    push-on — a `pullAll` FELTÉTEL NÉLKÜL futtatja az őrt minden
      //    letöltési kör elején (2 percenként). Vagyis üres mutációs sor mellett
      //    is kiderül a visszaállítás, csak nem 30, hanem 2 percen belül.
      const pending = await db._mutation_queue
        .where('status')
        .anyOf(['pending', 'failed'])
        .toArray()

      if (pending.length === 0) return

      // ⛔ FAIL CLOSED. A PUSH a veszélyes irány: a helyi, ÚJABB `updated_at`-tal
      //    bíró sorok felülírnák a frissen visszaállított adatot, és a
      //    visszaállítás némán részlegesen visszacsinálódna. Ha az epoch-ot nem
      //    tudjuk ellenőrizni, INKÁBB NEM KÜLDÜNK — a helyi munka a mutációs
      //    sorban megmarad, és a következő körben megy.
      const orszem = await this.ensureRestoreEpoch()
      if (!orszem) {
        this.emit({
          type: 'push_error',
          error:
            'A visszaállítás-állapot nem ellenőrizhető, ezért a helyi módosításokat nem küldjük fel. ' +
            'A munkád megvan, a következő szinkron újrapróbálja.',
          timestamp: Date.now(),
        })
        return
      }

      this.emit({ type: 'push_started', timestamp: Date.now() })

      // IDŐKORLÁT a feltöltési körre.
      // ⚠️ BEVALLOTT KORLÁT: itt nincs `AbortController` (a push több, egymás
      //    utáni kis kérésből áll), ezért az időkorlát a FELÜLET állapotát
      //    szabadítja fel, nem magát a kérést szakítja meg. Ez SZÁNDÉKOS: egy
      //    időtúllépett, de a háttérben mégis sikerülő beszúrás újraküldése
      //    duplikált sort okozna. A 'syncing'-ben maradt mutációkat a panel
      //    KIÍRJA, és a következő indításkor a `resetStuckSyncing` visszaállítja.
      const result = await ezVagyIdotullepes(
        pushBatch(20), // egyszerre max 20 mutation
        SYNC_IDOZITES.pushKorIdokorlatMs,
        'A feltöltés túllépte az időkorlátot. A módosításaid megvannak, a következő szinkron újrapróbálja.',
      )

      // Konfliktusok event-re
      if (result.conflicts > 0) {
        this.emit({ type: 'conflict_detected', timestamp: Date.now() })
      }

      // Hiba event a sikertelen push-oknál
      if (result.failed > 0) {
        this.emit({
          type: 'push_error',
          error: `${result.failed} helyi módosítás feltöltése nem sikerült — a rendszer újrapróbálja.`,
          timestamp: Date.now(),
        })
      }

      this.emit({ type: 'push_completed', timestamp: Date.now() })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.emit({ type: 'push_error', error, timestamp: Date.now() })
    } finally {
      this.pushFut = false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Visszaállítás-őr (restore_epoch) — a 4. fázis
  // ─────────────────────────────────────────────────────────────

  /**
   * Összeveti a szerver `restore_epoch`-ját a helyben ismerttel, és eltérésnél
   * KARANTÉNBA teszi a helyi mutációkat + teljes újratöltést kényszerít.
   *
   * @returns `true`, ha az állapot IGAZOLTAN rendben van (a push mehet).
   *          `false`, ha nem tudtuk ellenőrizni — ilyenkor a push TILOS.
   */
  private async ensureRestoreEpoch(): Promise<boolean> {
    const congregationId = this.state.congregationId
    if (!congregationId) return false

    let ellenorzes
    try {
      ellenorzes = await checkRestoreEpoch(congregationId)
    } catch (e) {
      console.error('[sync-orchestrator] a visszaállítás-őr hibára futott:', e)
      return false
    }
    if (!ellenorzes.ok) {
      console.error('[sync-orchestrator] a visszaállítás-őr nem tudott dönteni:', ellenorzes.hiba)
      return false
    }
    if (!ellenorzes.valtozott) return true

    // VISSZAÁLLÍTÁS TÖRTÉNT. A helyi másolat ELAVULT és VESZÉLYES.
    try {
      const eredmeny = await quarantineAndResync(congregationId, ellenorzes.epoch)
      this.emit({
        type: 'restore_detected',
        error:
          `A rendszergazda visszaállította a gyülekezet adatait egy korábbi mentésből. ` +
          `A helyi másolat teljesen újratöltődik (${eredmeny.uritettTablak} tábla), és ` +
          `${eredmeny.karantenozott} el nem küldött helyi módosítás KARANTÉNBA került — ` +
          'nem veszett el, de nem is került fel. Nézd át őket.',
        timestamp: Date.now(),
      })
      return true
    } catch (e) {
      console.error('[sync-orchestrator] az újratöltés előkészítése nem sikerült:', e)
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Status queries
  // ─────────────────────────────────────────────────────────────

  isOnline(): boolean {
    return this.state.online
  }

  isActive(): boolean {
    return this.state.active
  }

  /**
   * Fut-e ÉPPEN letöltés vagy feltöltés.
   *
   * ⚠️ Ez a VALÓSÁG, nem egy esemény-visszhang. A felület komponensei korábban
   * mind saját `useState(syncing)`-et vezettek az eseményekből, és ha egy
   * komponens a kör KÖZBEN mountolt (pl. a panel megnyitásakor), hamisan
   * „kész"-t mutatott. Innen le tudják kérdezni az igazi állapotot.
   */
  isSyncing(): boolean {
    return this.pullFut || this.pushFut
  }

  getCongregationId(): string | null {
    return this.state.congregationId
  }

  async getPendingCount(): Promise<number> {
    if (typeof window === 'undefined') return 0
    const db = getDb()
    return await db._mutation_queue
      .where('status')
      .anyOf(['pending', 'failed'])
      .count()
  }

  async getConflictCount(): Promise<number> {
    if (typeof window === 'undefined') return 0
    const db = getDb()
    return await db._conflicts.where('resolved').equals(0).count()
  }

  /** Manuális sync-trigger a user "Szinkronizálás most" gombjához. */
  async syncNow(): Promise<void> {
    if (!this.state.online) {
      this.emit({ type: 'pull_error', error: 'Nincs internet', timestamp: Date.now() })
      return
    }
    await this.pullAll()
    await this.pushAll()
  }

  /** Jelzett hiba beírása a sync_meta-ba (utolsó hiba diagnosztikához). */
  async markError(table: string, error: string): Promise<void> {
    const { getSyncMeta } = await import('./db')
    const meta = await getSyncMeta(table, this.state.congregationId)
    meta.lastError = error
    await setSyncMeta(meta)
  }
}

// ─────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────

let orchestratorInstance: SyncOrchestrator | null = null

/**
 * Singleton elérés. Csak 'use client' komponensekből vagy kliens-oldali
 * lib-ekből hívható.
 */
export function getSyncOrchestrator(): SyncOrchestrator {
  if (typeof window === 'undefined') {
    throw new Error(
      'SyncOrchestrator csak a kliens-oldalon használható (nincs window objektum).',
    )
  }
  if (!orchestratorInstance) {
    orchestratorInstance = new SyncOrchestrator()
  }
  return orchestratorInstance
}
