/**
 * write-sync-registry — a desktop ÖSSZES push-erének EGYETLEN indító- és
 * triggerkészlete (2026-09-05, desk-sync-2 / desk-sync-17 / desk-sync-18 /
 * desk-sync-20).
 *
 * MI VOLT A HIBA: nyolc push-er (nyugta, befizetés, kiadás, tag, család,
 * gyermek, Excel, klasszikus outbox) NYOLC külön `online` listenert és nyolc
 * külön 30 mp-es intervalt tartott; a tag/család/gyermek push-er ráadásul CSAK
 * a megfelelő oldal mountján indult el — aki offline vett fel egy tagot, majd
 * online indította az appot és a főoldalon maradt, annak a tagja a gépén
 * maradt. Egy lokális mentés után SEMMI nem indított azonnali felküldést.
 *
 * A JAVÍTÁS: itt él az egyetlen trigger-készlet — boot (az AuthGate hívja a
 * tükör-tulajdonos ellenőrzés UTÁN), `online` esemény, 30 mp-es poll,
 * `notifyLocalWriteCommitted()` (minden lokális mentés után, 1,5 mp-es
 * összevonással). A push-erek `run*SyncGuarded()` / `run*SyncManually()`
 * függvényei megmaradtak (idempotensek, saját `FutoOr` őrrel — az őr a
 * futás TÉNYLEGES végéig tart, nem az időkorlátig), de a listener/interval
 * NEM náluk van többé.
 *
 * MIÉRT DINAMIKUS IMPORT: a push-erek a `sync.ts`-t (és egymást) importálják,
 * a `sync.ts` viszont innen veszi a tiszta segédeket (hiba-osztályozó, időkorlát,
 * 0-sor-szelep döntés). A dinamikus import megtöri a statikus kört, és a
 * modulnak így NINCS statikus függősége — ezért a `selftest-desktop-szinkron`
 * be tudja tölteni és mutánsokkal futtatni.
 *
 * ENGEDÉLY-KAPU: a futtatók csak akkor dolgoznak, ha az AuthGate az adott
 * userre `startAllWriteSyncs(userId)`-dal engedélyezte őket — a
 * tükör-tulajdonos ellenőrzés ALATT (session-váltáskor) `felfuggesztWriteSyncs()`
 * null-ra állítja, így az előző user függő sora sosem megy fel az új user
 * nevében (desk-sync-20).
 */

// ─────────────────────────────────────────────────────────────────────────
//  Tiszta segédek (nincs importjuk — a selftest közvetlenül futtatja őket)
// ─────────────────────────────────────────────────────────────────────────

/** Minden push/pull hálózati kör felső időkorlátja (desk-sync-18). */
export const SYNC_TIMEOUT_MS = 30_000

export class SyncTimeoutError extends Error {
  constructor(cimke: string, ms: number) {
    super(`${cimke}: időtúllépés (${Math.round(ms / 1000)} mp) — a hálózat nem válaszolt.`)
    this.name = 'SyncTimeoutError'
  }
}

/**
 * Egy szinkron-kör időkorlátja a HÍVÓ várakozására. Ha a hálózati hívás
 * beragad, a hívó nem vár a végtelenségig: SyncTimeoutError-t kap, ami a
 * felületen látszik.
 *
 * ⚠️ Az időkorlát NEM szakítja meg a belső kérést (a Supabase query-nek itt
 * nincs AbortSignal-ja) — a push/pull a háttérben TOVÁBB FUT. Ezért a hívó
 * „fut-e még" őrét SOHA nem az időkorláthoz, hanem az ígéret TÉNYLEGES
 * lezárulásához kell kötni: lásd `FutoOr` alább.
 */
export function withSyncTimeout<T>(
  p: PromiseLike<T>,
  cimke: string,
  ms: number = SYNC_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new SyncTimeoutError(cimke, ms)), ms)
    // PromiseLike (a Supabase query-builder csak thenable, nem Promise).
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * FUTÓ-ŐR — egy push-er / pull EGYETLEN futó példánya, a TÉNYLEGES
 * befejezéshez kötött őrrel (2026-09-05, a bíráló P1-e a desk-sync-18-hoz).
 *
 * MI VOLT A HIBA: a push-erek `inFlight = true … finally { inFlight = false }`
 * mintája a `withSyncTimeout` köré épült. Az időkorlát 30 mp után a HÍVÓT
 * engedte tovább, de a belső Supabase-kérés nem szakadt meg — a `finally`
 * mégis feloldotta az őrt. A következő kör (30 mp-es poll, `online` esemény,
 * egy másik mentés utáni `notifyLocalWriteCommitted`) ugyanazokat a még
 * `pending` sorokat olvasta a helyi táblából, és ÚJRA felküldte őket, míg az
 * előző futás még a szerver válaszát várta. A tag/család/gyermek insertnek
 * nincs idempotencia-kulcsa → hetek offline után, lassú hálózaton, egy 30
 * mp-nél hosszabb köteg 31–40. sora KÉTSZER került a szerverre. A pull-oldalon
 * ugyanez két párhuzamos DELETE+INSERT-et jelentett ugyanarra a táblára.
 *
 * A JAVÍTÁS (a `processOutbox` mintája): a futó ígéretet TÁROLJUK; amíg le
 * nem zárul (siker VAGY hiba), új futás nem indul — aki közben hív, ugyanazt
 * az ígéretet kapja. Az időkorlát csak a hívó várakozását szabja meg: a hívó
 * SyncTimeoutError-t kap (látszik), de a duplikálás kizárt.
 *
 * Nincs importja — a selftest közvetlenül futtatja (F1–F3).
 */
export class FutoOr<T> {
  private futo: Promise<T> | null = null

  /** Fut-e még egy példány (időtúllépés UTÁN is igaz, amíg le nem zárul). */
  get fut(): boolean {
    return this.futo !== null
  }

  /**
   * Ha fut, ugyanazt az ígéretet adja vissza (az `indit` NEM hívódik);
   * különben elindítja, és a lezárásig őrzi. Az `onKesz` a TÉNYLEGES sikeres
   * befejezéskor fut (időtúllépés után is) — az eredmény-cache ebből frissül.
   */
  futtat(indit: () => Promise<T>, onKesz?: (eredmeny: T) => void): Promise<T> {
    if (this.futo) return this.futo
    const p = indit()
    this.futo = p
    const lezar = () => {
      if (this.futo === p) this.futo = null
    }
    p.then(
      (v) => {
        onKesz?.(v)
        lezar()
      },
      lezar,
    )
    return p
  }
}

export type SzinkronHibaOsztaly = 'atmeneti' | 'vegleges'

/**
 * Hiba-osztályozó a klasszikus outboxhoz (desk-sync-1, D9).
 *
 * ÁTMENETI (a sor `pending` marad, exponenciális újrapróbálás):
 *   hálózati hiba (`TypeError: Failed to fetch`, `network`, `ECONNREFUSED`),
 *   megszakítás / időtúllépés (`AbortError`, `SyncTimeoutError`), HTTP 0 / 408 /
 *   425 / 429 / 5xx, PostgREST séma-cache (`PGRST002`, „schema cache"), 503.
 * VÉGLEGES (a sor `failed`, a felületen látszik, kézi döntés kell):
 *   Postgres-kódok (23505 duplikátum, 23503 FK, 23514 CHECK, 22P02 érvénytelen
 *   szöveg, 42501 RLS/jogosultság, 42P01 hiányzó tábla, 42703 hiányzó oszlop),
 *   HTTP 4xx (a 408/425/429 kivételével), revision-ütközés (`conflict:`),
 *   érvénytelen JSON, minden más ismeretlen hiba (fail-closed: az ismeretlen
 *   hibát nem ismételgetjük a végtelenségig).
 */
export function osztalyozSzinkronHiba(err: unknown): SzinkronHibaOsztaly {
  if (err instanceof SyncTimeoutError) return 'atmeneti'
  const obj = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name : ''
  const code = typeof obj.code === 'string' ? obj.code : ''
  const statusRaw = obj.status ?? obj.statusCode
  const status = typeof statusRaw === 'number' ? statusRaw : Number(statusRaw)
  const message =
    typeof err === 'string'
      ? err
      : typeof obj.message === 'string'
        ? obj.message
        : ''
  const szoveg = `${name} ${code} ${message}`.toLowerCase()

  // Végleges osztályok ELŐBB — egy 23505 üzenete tartalmazhat „network" szót is.
  if (/^(23505|23503|23514|22p02|42501|42p01|42703|22001|23502)$/i.test(code)) return 'vegleges'
  if (/^conflict:/i.test(message)) return 'vegleges'
  if (/érvénytelen json/i.test(message)) return 'vegleges'

  if (name === 'AbortError' || name === 'TimeoutError') return 'atmeneti'
  if (/pgrst002|schema cache/i.test(szoveg)) return 'atmeneti'
  if (Number.isFinite(status)) {
    if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) {
      return 'atmeneti'
    }
    if (status >= 400 && status < 500) return 'vegleges'
  }
  if (
    /failed to fetch|networkerror|network request failed|econnrefused|econnreset|enotfound|etimedout|load failed|fetch failed|időtúllépés|timeout|network/i.test(
      szoveg,
    )
  ) {
    return 'atmeneti'
  }
  return 'vegleges'
}

/** A klasszikus outbox: ennyi ÁTMENETI kudarc után lesz a sor végleg `failed`. */
export const OUTBOX_MAX_PROBA = 5

/** Exponenciális visszalépés az N. átmeneti kudarc után (30 mp → 8 perc). */
export const OUTBOX_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 480_000] as const

export function outboxBackoffMs(retryCount: number): number {
  if (retryCount <= 0) return 0
  return OUTBOX_BACKOFF_MS[Math.min(retryCount, OUTBOX_BACKOFF_MS.length) - 1]
}

/**
 * Sorra kerülhet-e most az outbox-sor? (A visszalépés a `last_attempt_at`
 * és a `retry_count` alapján — JS-oldalon, hogy ne az SQLite dátum-értelmezésén
 * múljon.) Hiányzó vagy értelmezhetetlen időbélyeg = azonnal próbálható.
 */
export function outboxUjraprobalhato(
  row: { retry_count: number; last_attempt_at: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (!row.last_attempt_at || row.retry_count <= 0) return true
  const last = Date.parse(row.last_attempt_at)
  if (!Number.isFinite(last)) return true
  return nowMs - last >= outboxBackoffMs(row.retry_count)
}

/**
 * 0-SOR-SZELEP döntés a TRUNCATE+INSERT pull-okhoz (desk-sync-4, D8).
 *
 * Ha a szerver 0 sort adott, de a helyi tükörben VAN adat a hatókörben, és a
 * válasz NEM igazoltan üres (a hívó nem tudja bizonyítani, hogy tényleg nincs
 * adat), akkor a cserét KIHAGYJUK: egy RLS-anomália / anon-válasz / inaktív
 * státusz különben kiürítené a helyi tükröt. Minden más esetben csere.
 */
export function szelepDontes(input: {
  szerverSorok: number
  lokalisSorok: number
  igazoltanUres?: boolean
}): 'csere' | 'kihagy' {
  if (input.szerverSorok === 0 && input.lokalisSorok > 0 && !input.igazoltanUres) return 'kihagy'
  return 'csere'
}

// ─────────────────────────────────────────────────────────────────────────
//  A regiszter
// ─────────────────────────────────────────────────────────────────────────

/** A regiszter által ismert push-erek — a selftest EZT a listát őrzi. */
export const WRITE_SYNC_PUSHEREK = [
  'chitanta',
  'befizetes',
  'kiadas',
  'szemely',
  'csalad',
  'gyerek',
  'excel',
  'outbox',
] as const
export type WriteSyncPusher = (typeof WRITE_SYNC_PUSHEREK)[number]

/** Egy futás mérlege — a felület összesítő sávjának. */
export interface WriteSyncRegistryStatus {
  engedelyezettUserId: string | null
  running: boolean
  lastRunAt: string | null
  /** Push-erenként az utolsó futás hibaszövege (null = rendben). */
  hibak: Partial<Record<WriteSyncPusher, string | null>>
}

const POLL_MS = 30_000
const LOKALIS_IRAS_DEBOUNCE_MS = 1_500

/** A lokális mentés utáni, összevont szinkron-kérés eseménye (az orchestrator hallgatja). */
export const SYNC_KERELEM_ESEMENY = 'kartoteka:sync-kerelem'

let engedelyezettUserId: string | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let running = false
let lastRunAt: string | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const hibak: WriteSyncRegistryStatus['hibak'] = {}

export function getWriteSyncRegistryStatus(): WriteSyncRegistryStatus {
  return { engedelyezettUserId, running, lastRunAt, hibak: { ...hibak } }
}

/**
 * Session-váltás / tükör-tulajdonos ellenőrzés ALATT: a push-erek nem
 * dolgozhatnak. Az AuthGate hívja, amint egy másik user sessionje jelenik meg.
 */
export function felfuggesztWriteSyncs(): void {
  engedelyezettUserId = null
}

async function szemelyCongregationId(userId: string): Promise<string | null> {
  try {
    const { getLocalOwnProfile } = await import('./sync')
    const profile = await getLocalOwnProfile(userId)
    return profile?.congregation_id ?? null
  } catch {
    return null
  }
}

/**
 * A nyolc push-er EGY körben, sorban (a párhuzamos futás az outbox közös
 * tábláján és a tárcákon versenyhelyzetet szülne). `most=true` = a
 * visszalépést ignoráló, kézi jellegű futás (belépés, online-esemény,
 * lokális mentés); `most=false` = a 30 mp-es poll, a push-erek saját
 * visszalépésével.
 *
 * Sosem dob — minden hiba push-erenként a `hibak` térképbe kerül, hogy a
 * felület kiírhassa (néma elnyelés TILOS).
 */
async function futtatMind(most: boolean): Promise<void> {
  const uid = engedelyezettUserId
  if (!uid) return
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  running = true
  try {
    const lepes = async (nev: WriteSyncPusher, fn: () => Promise<unknown>) => {
      // Ha közben felfüggesztették (session-váltás), a hátralévők kimaradnak.
      if (engedelyezettUserId !== uid) return
      try {
        await fn()
        hibak[nev] = null
      } catch (err) {
        hibak[nev] = err instanceof Error ? err.message : String(err)
        console.warn(`[write-sync] ${nev} push-er hiba:`, hibak[nev])
      }
    }

    const [chitanta, befizetes, kiadas, szemely, csalad, gyerek, excel, sync] = await Promise.all([
      import('./chitanta-sync'),
      import('./befizetes-write-sync'),
      import('./kiadas-write-sync'),
      import('./szemely-write-sync'),
      import('./csalad-write-sync'),
      import('./gyerek-write-sync'),
      import('./excel-write-sync'),
      import('./sync'),
    ])

    await lepes('outbox', () => (most ? sync.processOutbox({ ignoreBackoff: true }) : sync.runOutboxSyncGuarded()))
    await lepes('chitanta', () => (most ? chitanta.runChitantaSyncManually() : chitanta.runChitantaSyncGuarded()))
    await lepes('befizetes', () => (most ? befizetes.runBefizetesSyncManually() : befizetes.runBefizetesSyncGuarded()))
    await lepes('kiadas', () => (most ? kiadas.runKiadasSyncManually() : kiadas.runKiadasSyncGuarded()))
    await lepes('csalad', () => (most ? csalad.runCsaladSyncManually() : csalad.runCsaladSyncGuarded()))
    await lepes('gyerek', () => (most ? gyerek.runGyerekSyncManually() : gyerek.runGyerekSyncGuarded()))
    await lepes('szemely', async () => {
      // Az új-tag push-er gyülekezethez kötött — a LOKÁLIS profilból oldjuk fel,
      // nem az oldal mountjától függ (desk-sync-2).
      const congregationId = await szemelyCongregationId(uid)
      if (!congregationId) return
      if (most) await szemely.runSzemelySyncManually(congregationId)
      else await szemely.runSzemelySyncGuarded(congregationId)
    })
    await lepes('excel', () => (most ? excel.runExcelWriteSyncManually() : excel.runExcelWriteSyncGuarded()))
    lastRunAt = new Date().toISOString()
  } finally {
    running = false
  }
}

/** A 30 mp-es poll köre — a push-erek saját visszalépésével. */
export function runAllWriteSyncsGuarded(): Promise<void> {
  return futtatMind(false)
}

/**
 * MINDEN függő írás felküldése MOST (a visszalépést ignorálva): belépés,
 * online-esemény, lokális mentés után. Az AuthGate és az `online` listener
 * ezt hívja — nem a nyolc külön push-ert.
 */
export function runAllWriteSyncsNow(): Promise<void> {
  return futtatMind(true)
}

/**
 * A triggerkészlet beállítása az adott userre. Idempotens: a listener és a
 * poll egyszer jön létre, a user-id frissül. A hívás után azonnal egy
 * „most" kör indul — annak a Promise-át adja vissza (a hívó megvárhatja;
 * a selftest is ezt teszi).
 */
export function startAllWriteSyncs(userId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  engedelyezettUserId = userId

  if (!onlineListenerAttached) {
    window.addEventListener('online', () => {
      // Visszatért a hálózat → a várakozók azonnal, visszalépés nélkül.
      void runAllWriteSyncsNow()
    })
    onlineListenerAttached = true
  }
  if (!pollInterval) {
    pollInterval = setInterval(() => {
      void runAllWriteSyncsGuarded()
    }, POLL_MS)
  }
  return runAllWriteSyncsNow()
}

/**
 * Minden lokális mentés után hívható (Endre: „a rendszer folyamatosan
 * szinkronizáljon minden mentéssel"). 1,5 mp-es összevonás, aztán az összes
 * push-er „most" köre, majd egy szinkron-kérés esemény az orchestratornak
 * (light pull — a szerver-oldali változatszám/id visszakerül a tükörbe).
 */
export function notifyLocalWriteCommitted(): void {
  if (typeof window === 'undefined') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runAllWriteSyncsNow().finally(() => {
      window.dispatchEvent(new CustomEvent(SYNC_KERELEM_ESEMENY, { detail: { ok: 'lokalis-iras' } }))
    })
  }, LOKALIS_IRAS_DEBOUNCE_MS)
}
