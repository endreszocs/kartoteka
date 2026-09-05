/**
 * AutoSyncOrchestrator — automatikus háttér-szinkronizáció (Sprint M, 2026-04-25;
 * v0.5.4 data-version bővítés; 2026-09-05 ŐSZINTE jelentés + session-őr).
 *
 * Cél: a lelkész **bármikor megnyitja az appot, naprakész adatokat lát**.
 * - Indításkor (mount): teljes pull (full bundle).
 * - Percenként (60 s): light bundle — a leggyakrabban változó táblák.
 * - 5 percenként: full bundle (a stabil referencia-táblák is).
 * - `online` event: azonnal újrapull (offline → online átmenet).
 * - `offline` event: állapot frissítése, sync szüneteltetése.
 * - `kartoteka:sync-kerelem` (a `write-sync-registry.notifyLocalWriteCommitted`
 *   után): light pull — a lokális mentés szerver-oldali változatszáma/id-ja
 *   visszakerül a tükörbe.
 *
 * A „light" vs. „full" szétválasztás indoka: 14 db pull percenként túl sok
 * Supabase-hívás (rate-limit, mobil-net forgalom). A leggyakrabban változó
 * táblák (members, families, worklog, programs, profile, congregation) elég
 * percenként — a lassan változó referencia-táblák (anyakönyv, leltár, iktató,
 * jegyzőkönyvek, sírhelyek, éves jelentés, adrlocality) elég 5 percenként.
 *
 * A hook idempotens — ha a `userId` null, semmit sem csinál (pl. login screen).
 *
 * **2026-09-05 — MI VOLT A HIBA (desk-sync-3 / desk-sync-4):**
 * a bundle-ök `Promise.allSettled` eredményét eldobták, a `catch` holt kód volt
 * → MINDEN pull-hiba után zöld „Friss adatok" + `bumpDataVersion`. Session
 * nélkül (PIN-mód) is futott: anon kéréssel, és a TRUNCATE+INSERT pull-ok
 * kiürítették a tükröt. A JAVÍTÁS: (1) minden pull `PullJelentes`-t ad, bármely
 * bukás → `'partial'`/`'error'` + a bukott táblák neve + az első hiba szövege;
 * (2) `bumpDataVersion` csak ≥1 sikeres tábla után; (3) a kör ELEJÉN
 * `getVerifiedSession()` — session nélkül NINCS pull (`'offline-pin'` /
 * `'no-session'` állapot); (4) minden pull 30 mp-es időkorláttal; (5) a
 * 0-sor-szelep figyelmeztetése (`figyelmeztetes`) `'partial'`-ként látszik.
 *
 * **v0.5.4 — Data-version (offline-first auto-reload):**
 * Egy globális `dataVersion` counter minden sikeres pull után növekszik. A
 * `useDataVersion()` hook segítségével az oldalak (HomePage, MembersPage,
 * FamiliesPage stb.) feliratkozhatnak — ha a verzió változik, az oldal
 * automatikusan újratölti a lokális cache-ből az adatokat.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { isOfflineMode } from './auth-pin'
import { pullNevnapCatalog } from './nevnap-sync'
import {
  pullAdrlocalityCatalog,
  pullAnnualReportsOfOwnCongregation,
  pullCemeteriesOfOwnCongregation,
  pullFamiliesOfOwnCongregation,
  pullFilingOfOwnCongregation,
  pullGyerekOfOwnCongregation,
  pullInventoryOfOwnCongregation,
  pullMembersOfOwnCongregation,
  pullMinutesOfOwnCongregation,
  pullOwnCongregation,
  pullOwnProfile,
  pullProgramsOfOwnCongregation,
  pullRegistryOfOwnCongregation,
  pullWorklogOfOwnCongregation,
} from './sync'
import { getVerifiedSession } from './verified-session'
import { FutoOr, SYNC_KERELEM_ESEMENY, withSyncTimeout } from './write-sync-registry'

/**
 * - `success`     minden tábla frissült
 * - `partial`     legalább egy tábla frissült, de volt bukás / szelep-kihagyás
 * - `error`       egyetlen tábla sem frissült (vagy fiók-eltérés)
 * - `offline`     nincs hálózat
 * - `offline-pin` PIN-es (helyi) munkamenet — nincs felhő-belépés, nincs pull
 * - `no-session`  nincs session és nincs PIN-mód sem (a kapu mindjárt terel)
 */
export type SyncState =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'error'
  | 'offline'
  | 'offline-pin'
  | 'no-session'

/** Egy pull mérlege — a bundle-ök ezt adják vissza pull-onként. */
export interface PullJelentes {
  kulcs: string
  /** Ember-olvasható tábla-név (a sávra és a listába). */
  cimke: string
  ok: boolean
  sorok?: number
  hiba?: string
  /** Sikeres kör, de a 0-sor-szelep kihagyta a cserét (a helyi adat megmaradt). */
  figyelmeztetes?: string
}

export interface SzinkronKorEredmeny {
  state: Exclude<SyncState, 'idle' | 'syncing'>
  jelentesek: PullJelentes[]
  bukottTablak: string[]
  /** Az első hiba (vagy figyelmeztetés) szövege — a sáv ezt mutatja. */
  elsoHiba: string | null
  /** Legalább egy tábla sikeresen frissült → a data-version léphet. */
  voltSiker: boolean
}

export interface AutoSyncStatus {
  state: SyncState
  lastSyncAt: number | null
  lastError: string | null
  isOnline: boolean
  /** Az utolsó kör bukott (vagy szelep-kihagyott) tábláinak nevei. */
  bukottTablak: string[]
  /** Az utolsó kör teljes pull-jelentése (a részletező listának). */
  jelentesek: PullJelentes[]
}

export interface AutoSyncControls extends AutoSyncStatus {
  triggerManualSync: () => Promise<void>
}

const LIGHT_TICK_MS = 60_000 // 1 perc
const FULL_INTERVAL_MS = 5 * 60_000 // 5 perc

// ── Globális data-version mechanizmus (offline-first auto-reload) ───────
let dataVersion = 0
const dataVersionListeners = new Set<(v: number) => void>()

/** Minden sikeres pull után növekszik — a `useDataVersion`-listenerek értesülnek. */
function bumpDataVersion(): void {
  dataVersion += 1
  for (const listener of dataVersionListeners) {
    listener(dataVersion)
  }
}

/** Manuális kívülről jövő bump (pl. user-WRITE után — invalidálja a cache-et). */
export function notifyLocalDataChanged(): void {
  bumpDataVersion()
}

/**
 * Hook: feliratkozás a data-version counter-re. Az oldalak így automatikusan
 * újratöltik az adatokat sikeres háttér-pull után.
 *
 * Használat: `useEffect(() => { void loadData() }, [userId, dataVersion])`
 */
export function useDataVersion(): number {
  const [v, setV] = useState(dataVersion)
  useEffect(() => {
    const listener = (next: number) => setV(next)
    dataVersionListeners.add(listener)
    return () => {
      dataVersionListeners.delete(listener)
    }
  }, [])
  return v
}

// ── Pull-futtató: egy pull → egy jelentés (időkorláttal, sosem dob) ─────
type PullEredmeny = {
  pulledRows?: number | Record<string, number>
  figyelmeztetes?: string
  skipped?: string
}

function sorokSzama(res: PullEredmeny | void): number | undefined {
  if (!res || res.pulledRows === undefined) return undefined
  if (typeof res.pulledRows === 'number') return res.pulledRows
  return Object.values(res.pulledRows).reduce((a, b) => a + (Number(b) || 0), 0)
}

/**
 * Kulcsonként a még futó pull őre (bíráló P1 a desk-sync-18-hoz, 2026-09-05).
 *
 * MIÉRT: az időkorlát a HÍVÓT engedi tovább, a pull a háttérben fut tovább
 * (nincs AbortSignal). A hook `isSyncingRef`-je a kör végén felszabadult, a
 * következő kör (60 mp) ugyanarra a táblára egy MÁSODIK TRUNCATE+INSERT-et
 * indított, párhuzamosan az elsővel — legalábbis hamis „hiba" jelentéssel,
 * rosszabb esetben félig üres tükörrel. Most a második kör a MÉG FUTÓ pull
 * ígéretére csatlakozik (nem indít újat), és ha az közben végez, a kör
 * sikert jelent.
 */
const futoPullok = new Map<string, FutoOr<PullEredmeny | void>>()

async function futtatPull(
  kulcs: string,
  cimke: string,
  fn: () => Promise<PullEredmeny | void>,
): Promise<PullJelentes> {
  try {
    let or = futoPullok.get(kulcs)
    if (!or) {
      or = new FutoOr<PullEredmeny | void>()
      futoPullok.set(kulcs, or)
    }
    const res = await withSyncTimeout(or.futtat(fn), `${cimke} letöltése`)
    const jel: PullJelentes = { kulcs, cimke, ok: true, sorok: sorokSzama(res) }
    if (res && typeof res === 'object' && res.figyelmeztetes) jel.figyelmeztetes = res.figyelmeztetes
    return jel
  } catch (err) {
    return { kulcs, cimke, ok: false, hiba: err instanceof Error ? err.message : String(err) }
  }
}

// ── Light bundle: percenként ─────────────────────────────────────────────
export async function syncLightBundle(userId: string): Promise<PullJelentes[]> {
  return Promise.all([
    futtatPull('profil', 'Profil', () => pullOwnProfile(userId)),
    futtatPull('gyulekezet', 'Gyülekezet', () => pullOwnCongregation(userId)),
    futtatPull('tagok', 'Tagok', () => pullMembersOfOwnCongregation(userId)),
    futtatPull('csaladok', 'Családok', () => pullFamiliesOfOwnCongregation(userId)),
    futtatPull('munkanaplo', 'Munkanapló', () => pullWorklogOfOwnCongregation(userId)),
    futtatPull('programok', 'Programok', () => pullProgramsOfOwnCongregation(userId)),
  ])
}

// P3-7 (audit 2026-08-28): a PÉNZÜGYI tükör (befizetes/kiadas/bealitas) is
// frissül a háttérben — eddig csak az oldal-betöltés pull-olt, így a nyitva
// hagyott desktop-oldal egy webes módosítás után tartósan a régi egyenleget
// mutatta, a bealitas-tükör (évzárás-állapot!) pedig napokig elavult lehetett.
// Dinamikus importtal (a finance-sync nem kerül a light-út bundle-jébe); a
// folyó ÉV a tükör hatóköre — mint az oldal-load pullja.
// 2026-09-05: a KÉTRÉTEGŰ elnyelés megszűnt — minden ág külön jelentést ad.
async function pullFinanceOfOwnCongregation(userId: string): Promise<PullJelentes[]> {
  const { getLocalOwnProfile } = await import('./sync')
  const profile = await getLocalOwnProfile(userId)
  const congregationId = profile?.congregation_id
  if (!congregationId) return []
  const ev = new Date().getFullYear()
  const [financeSync, settingsSync] = await Promise.all([
    import('./finance-sync'),
    import('./finance-settings-sync'),
  ])
  // A pénzügyi pull-ok NEM dobnak — `{success:false, error}`-t adnak; ezt itt
  // jelentés-bukássá alakítjuk (eddig a `success:false` némán elveszett).
  const eredmenybol = async (r: Promise<{ success: boolean; pulled?: number; error?: string }>) => {
    const x = await r
    if (!x.success) throw new Error(x.error ?? 'ismeretlen hiba')
    return { pulledRows: x.pulled ?? 0 }
  }
  return Promise.all([
    futtatPull('befizetesek', 'Befizetések', () =>
      eredmenybol(financeSync.pullBefizetesek(congregationId, ev)),
    ),
    futtatPull('kiadasok', 'Kiadások', () => eredmenybol(financeSync.pullKiadasok(congregationId, ev))),
    futtatPull('bealitas', 'Pénzügyi beállítás', () =>
      eredmenybol(settingsSync.pullFinanceSettings(congregationId, ev)),
    ),
  ])
}

// ── Full bundle: 5 percenként + indításkor ───────────────────────────────
export async function syncFullBundle(userId: string): Promise<PullJelentes[]> {
  const light = await syncLightBundle(userId)
  const [fullRes, penzugyRes] = await Promise.all([
    Promise.all([
      futtatPull('gyerekek', 'Gyermekek', () => pullGyerekOfOwnCongregation(userId)),
      futtatPull('anyakonyv', 'Anyakönyv', () => pullRegistryOfOwnCongregation(userId)),
      futtatPull('leltar', 'Leltár', () => pullInventoryOfOwnCongregation(userId)),
      futtatPull('iktato', 'Iktató', () => pullFilingOfOwnCongregation(userId)),
      futtatPull('jegyzokonyvek', 'Jegyzőkönyvek', () => pullMinutesOfOwnCongregation(userId)),
      futtatPull('sirhelyek', 'Sírhelyek', () => pullCemeteriesOfOwnCongregation(userId)),
      futtatPull('eves-jelentes', 'Éves jelentés', () =>
        pullAnnualReportsOfOwnCongregation(userId),
      ),
      futtatPull('adrlocality', 'Település-katalógus', () => pullAdrlocalityCatalog()),
      // 2026-06-12 (Endre #5): névnap-katalógus — `{success:false}`-t ad hiba
      // helyett; 2026-09-05 óta ezt is jelentéssé alakítjuk (eddig senki nem olvasta).
      futtatPull('nevnap', 'Névnap-katalógus', async () => {
        const r = await pullNevnapCatalog()
        if (!r.success) throw new Error(r.error ?? 'ismeretlen hiba')
        return { pulledRows: r.pulled }
      }),
    ]),
    // A pénzügyi ág profil-feloldása maga is bukhat — az is jelentés, nem néma.
    pullFinanceOfOwnCongregation(userId).catch(
      (err): PullJelentes[] => [
        {
          kulcs: 'penzugy',
          cimke: 'Pénzügy',
          ok: false,
          hiba: err instanceof Error ? err.message : String(err),
        },
      ],
    ),
  ])
  return [...light, ...fullRes, ...penzugyRes]
}

/** A jelentések kiértékelése — tiszta függvény (a selftest ezt futtatja). */
export function ertekelJelenteseket(jelentesek: PullJelentes[]): SzinkronKorEredmeny {
  const bukott = jelentesek.filter((j) => !j.ok)
  const figyelmeztetett = jelentesek.filter((j) => j.ok && j.figyelmeztetes)
  const sikeres = jelentesek.filter((j) => j.ok)
  const bukottTablak = [...bukott, ...figyelmeztetett].map((j) => j.cimke)
  const elsoHiba = bukott[0]?.hiba ?? figyelmeztetett[0]?.figyelmeztetes ?? null
  let state: SzinkronKorEredmeny['state']
  if (bukott.length === 0 && figyelmeztetett.length === 0) state = 'success'
  else if (sikeres.length === 0) state = 'error'
  else state = 'partial'
  return { state, jelentesek, bukottTablak, elsoHiba, voltSiker: sikeres.length > 0 }
}

/**
 * EGY szinkron-kör — a hooktól függetlenül is hívható (a varázsló első
 * szinkronja, a selftest). Sosem dob.
 *
 * Sorrend: hálózat → hitelesített és fiók-egyező session (`getVerifiedSession`)
 * → bundle → kiértékelés. Session nélkül EGYETLEN pull sem indul: a
 * TRUNCATE+INSERT tükrök különben anon válaszból ürülnének ki.
 */
export async function futtatSzinkronKor(
  userId: string,
  forceFull: boolean,
): Promise<SzinkronKorEredmeny> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'offline', jelentesek: [], bukottTablak: [], elsoHiba: null, voltSiker: false }
  }
  const verified = await getVerifiedSession()
  if (!verified.ok) {
    if (verified.reason === 'user-mismatch') {
      return {
        state: 'error',
        jelentesek: [],
        bukottTablak: [],
        elsoHiba: verified.message,
        voltSiker: false,
      }
    }
    return {
      state: isOfflineMode() ? 'offline-pin' : 'no-session',
      jelentesek: [],
      bukottTablak: [],
      elsoHiba: null,
      voltSiker: false,
    }
  }
  if (verified.session.user.id !== userId) {
    return {
      state: 'error',
      jelentesek: [],
      bukottTablak: [],
      elsoHiba: 'A bejelentkezett fiók nem az, akihez a gépen tárolt adatok tartoznak — a szinkron szünetel.',
      voltSiker: false,
    }
  }
  const jelentesek = forceFull ? await syncFullBundle(userId) : await syncLightBundle(userId)
  return ertekelJelenteseket(jelentesek)
}

export function useAutoSyncOrchestrator(userId: string | null): AutoSyncControls {
  const [status, setStatus] = useState<AutoSyncStatus>(() => ({
    state: 'idle',
    lastSyncAt: null,
    lastError: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    bukottTablak: [],
    jelentesek: [],
  }))

  const lastFullSyncRef = useRef<number>(0)
  const isSyncingRef = useRef<boolean>(false)
  const userIdRef = useRef<string | null>(userId)

  // Tartsuk friss a userId-t a long-lived listener-ek számára
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const sync = useCallback(async (forceFull: boolean) => {
    const uid = userIdRef.current
    if (!uid) return
    if (isSyncingRef.current) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus((s) => ({ ...s, state: 'offline', isOnline: false }))
      return
    }

    isSyncingRef.current = true
    setStatus((s) => ({ ...s, state: 'syncing', isOnline: true }))

    try {
      const needsFull = forceFull || Date.now() - lastFullSyncRef.current > FULL_INTERVAL_MS
      const eredmeny = await futtatSzinkronKor(uid, needsFull)
      if (needsFull && eredmeny.voltSiker) lastFullSyncRef.current = Date.now()
      setStatus((s) => ({
        state: eredmeny.state,
        // A „friss adatok" ideje csak akkor lép, ha tényleg frissült valami.
        lastSyncAt: eredmeny.voltSiker ? Date.now() : s.lastSyncAt,
        lastError: eredmeny.elsoHiba,
        isOnline: true,
        bukottTablak: eredmeny.bukottTablak,
        jelentesek: eredmeny.jelentesek,
      }))
      // Az oldalak csak akkor töltsenek újra a cache-ből, ha legalább egy
      // tábla frissült — egy teljes bukás után nincs mit újraolvasni.
      if (eredmeny.voltSiker) bumpDataVersion()
    } catch (e) {
      setStatus((s) => ({
        ...s,
        state: 'error',
        lastError: e instanceof Error ? e.message : String(e),
      }))
    } finally {
      isSyncingRef.current = false
    }
  }, [])

  // Mount / userId-váltás → azonnali full sync
  useEffect(() => {
    if (!userId) return
    void sync(true)
  }, [userId, sync])

  // Periodikus light-tick (60 s)
  useEffect(() => {
    if (!userId) return
    const id = window.setInterval(() => {
      void sync(false)
    }, LIGHT_TICK_MS)
    return () => window.clearInterval(id)
  }, [userId, sync])

  // Online/offline esemény + lokális mentés utáni szinkron-kérés +
  // láthatóvá válás (a gép alvásból ébred → friss adat)
  useEffect(() => {
    const onOnline = () => {
      setStatus((s) => ({ ...s, isOnline: true }))
      // Picivel várunk, hogy a hálózat „beálljon"
      window.setTimeout(() => void sync(false), 800)
    }
    const onOffline = () => {
      setStatus((s) => ({ ...s, isOnline: false, state: 'offline' }))
    }
    const onSyncKerelem = () => {
      void sync(false)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(SYNC_KERELEM_ESEMENY, onSyncKerelem)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(SYNC_KERELEM_ESEMENY, onSyncKerelem)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync])

  const triggerManualSync = useCallback(() => sync(true), [sync])

  return {
    ...status,
    triggerManualSync,
  }
}
