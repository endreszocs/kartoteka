/**
 * AutoSyncOrchestrator — automatikus háttér-szinkronizáció (Sprint M, 2026-04-25;
 * v0.5.4 data-version bővítés).
 *
 * Cél: a lelkész **bármikor megnyitja az appot, naprakész adatokat lát**.
 * - Indításkor (mount): teljes pull (full bundle).
 * - Percenként (60 s): light bundle — a leggyakrabban változó táblák.
 * - 5 percenként: full bundle (a stabil referencia-táblák is).
 * - `online` event: azonnal újrapull (offline → online átmenet).
 * - `offline` event: állapot frissítése, sync szüneteltetése.
 *
 * A „light" vs. „full" szétválasztás indoka: 14 db pull percenként túl sok
 * Supabase-hívás (rate-limit, mobil-net forgalom). A leggyakrabban változó
 * táblák (members, families, worklog, programs, profile, congregation) elég
 * percenként — a lassan változó referencia-táblák (anyakönyv, leltár, iktató,
 * jegyzőkönyvek, sírhelyek, éves jelentés, adrlocality) elég 5 percenként.
 *
 * A hook idempotens — ha a `userId` null, semmit sem csinál (pl. login screen).
 *
 * **v0.5.4 — Data-version (offline-first auto-reload):**
 * Egy globális `dataVersion` counter minden sikeres pull után növekszik. A
 * `useDataVersion()` hook segítségével az oldalak (HomePage, MembersPage,
 * FamiliesPage stb.) feliratkozhatnak — ha a verzió változik, az oldal
 * automatikusan újratölti a lokális cache-ből az adatokat. Így a felhasználó
 * SEMMIT NEM ÉRZ MEG az online szinkronból, csak azt, hogy „lám, a számok
 * frissek". Eltünteti a manuális „Frissítés" gomb szükségességét.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

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

export type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'offline'

export interface AutoSyncStatus {
  state: SyncState
  lastSyncAt: number | null
  lastError: string | null
  isOnline: boolean
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

// ── Light bundle: percenként ─────────────────────────────────────────────
async function syncLightBundle(userId: string): Promise<void> {
  await Promise.allSettled([
    pullOwnProfile(userId),
    pullOwnCongregation(userId),
    pullMembersOfOwnCongregation(userId),
    pullFamiliesOfOwnCongregation(userId),
    pullWorklogOfOwnCongregation(userId),
    pullProgramsOfOwnCongregation(userId),
  ])
}

// P3-7 (audit 2026-08-28): a PÉNZÜGYI tükör (befizetes/kiadas/bealitas) is
// frissül a háttérben — eddig csak az oldal-betöltés pull-olt, így a nyitva
// hagyott desktop-oldal egy webes módosítás után tartósan a régi egyenleget
// mutatta, a bealitas-tükör (évzárás-állapot!) pedig napokig elavult lehetett.
// Best-effort, dinamikus importtal (a finance-sync nem kerül a light-út
// bundle-jébe); a folyó ÉV a tükör hatóköre — mint az oldal-load pullja.
async function pullFinanceOfOwnCongregation(userId: string): Promise<void> {
  try {
    const { getLocalOwnProfile } = await import('./sync')
    const profile = await getLocalOwnProfile(userId)
    const congregationId = profile?.congregation_id
    if (!congregationId) return
    const ev = new Date().getFullYear()
    const [financeSync, settingsSync] = await Promise.all([
      import('./finance-sync'),
      import('./finance-settings-sync'),
    ])
    await Promise.allSettled([
      financeSync.pullBefizetesek(congregationId, ev),
      financeSync.pullKiadasok(congregationId, ev),
      settingsSync.pullFinanceSettings(congregationId, ev),
    ])
  } catch {
    /* best-effort — a pénzügyi pull hibája nem buktatja a bundle-t */
  }
}

// ── Full bundle: 5 percenként + indításkor ───────────────────────────────
async function syncFullBundle(userId: string): Promise<void> {
  await syncLightBundle(userId)
  await Promise.allSettled([
    pullGyerekOfOwnCongregation(userId),
    pullRegistryOfOwnCongregation(userId),
    pullInventoryOfOwnCongregation(userId),
    pullFilingOfOwnCongregation(userId),
    pullMinutesOfOwnCongregation(userId),
    pullCemeteriesOfOwnCongregation(userId),
    pullAnnualReportsOfOwnCongregation(userId),
    // P3-7: pénzügyi tükör-frissítés (befizetes + kiadas + bealitas, folyó év)
    pullFinanceOfOwnCongregation(userId),
    pullAdrlocalityCatalog(),
    // 2026-06-12 (Endre #5): névnap-katalógus a dashboard „Ma köszöntjük" kártyához
    pullNevnapCatalog(),
  ])
}

export function useAutoSyncOrchestrator(userId: string | null): AutoSyncControls {
  const [status, setStatus] = useState<AutoSyncStatus>(() => ({
    state: 'idle',
    lastSyncAt: null,
    lastError: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
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
      if (needsFull) {
        await syncFullBundle(uid)
        lastFullSyncRef.current = Date.now()
      } else {
        await syncLightBundle(uid)
      }
      setStatus({
        state: 'success',
        lastSyncAt: Date.now(),
        lastError: null,
        isOnline: true,
      })
      // Sikeres pull → értesítjük az oldalakat, hogy újratölthetnek a cache-ből
      bumpDataVersion()
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

  // Online/offline esemény
  useEffect(() => {
    const onOnline = () => {
      setStatus((s) => ({ ...s, isOnline: true }))
      // Picivel várunk, hogy a hálózat „beálljon"
      window.setTimeout(() => void sync(false), 800)
    }
    const onOffline = () => {
      setStatus((s) => ({ ...s, isOnline: false, state: 'offline' }))
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [sync])

  const triggerManualSync = useCallback(() => sync(true), [sync])

  return {
    ...status,
    triggerManualSync,
  }
}
