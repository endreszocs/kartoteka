/**
 * Excel-könyvelés beállítások — közös LS-kulcsok + bank→betű-lap párosítás (E3).
 *
 * Egyetlen igazság-forrás a `konyveles-panel.tsx` és az `excel-write-sync.ts`
 * worker számára. A bank-párosítás a tervezett E2 auto-javaslat (deviza-alapú)
 * + KÖTELEZŐ egyszeri felhasználói megerősítés modellt követi: a worker
 * megerősítetlen párosítással SOHA nem ír betű-lapra.
 */

import { excelDefaultFolder, excelFolderInfo } from './excel'

export const LS_FOLDER = 'kartoteka-excel-folder-v1'
export const LS_SYNC = 'kartoteka-excel-sync-v1'
export const LS_DIOCESE = 'kartoteka-excel-diocese-v1'
export const LS_LOGO = 'kartoteka-excel-logo-v1'
export const LS_BANKMAP = 'kartoteka-excel-bankmap-v1'

export function isExcelSyncEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(LS_SYNC) === '1'
}

export function setExcelSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_SYNC, enabled ? '1' : '0')
}

/**
 * Az Adatok_<év>.xlsx teljes útvonala (a mentett vagy az alapértelmezett
 * Könyvelés-mappából) — null, ha a mappa még nincs előkészítve.
 */
export async function getExcelAdatokPath(year: number): Promise<string | null> {
  try {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem(LS_FOLDER) : null
    const path = saved && saved.trim() ? saved : await excelDefaultFolder(year)
    const info = await excelFolderInfo(path)
    return info.exists ? info.adatokPath : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Bank → betű-lap párosítás
// ─────────────────────────────────────────────────────────────────────────

export interface BankMapEntry {
  /** Kartotéka `bankszamlak.id`. */
  bankszamlaId: number
  /** A bank megjelenített neve (a belső-mozgás szabad-szöveges feloldásához is). */
  bankNeve: string
  /** A bankszámla devizája (RON/EUR…) — a javaslat alapja. */
  valuta: string | null
  /** Az Excel betű-lap (A…T). */
  letter: string
}

export interface BankMap {
  /** A felhasználó megerősítette-e a párosítást (enélkül a worker nem ír bank-lapra). */
  confirmed: boolean
  entries: BankMapEntry[]
}

type BankMapStore = Record<string, BankMap>

function bankMapKey(congregationId: string, year: number): string {
  return `${congregationId}:${year}`
}

function loadStore(): BankMapStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LS_BANKMAP)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as BankMapStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getBankMap(congregationId: string, year: number): BankMap | null {
  return loadStore()[bankMapKey(congregationId, year)] ?? null
}

export function saveBankMap(
  congregationId: string,
  year: number,
  map: BankMap,
): void {
  if (typeof window === 'undefined') return
  const store = loadStore()
  store[bankMapKey(congregationId, year)] = map
  window.localStorage.setItem(LS_BANKMAP, JSON.stringify(store))
}

/** Betű-lap egy bankszámla-ID-hoz — csak MEGERŐSÍTETT párosításból. */
export function getConfirmedLetterForBankId(
  congregationId: string,
  year: number,
  bankszamlaId: number,
): string | null {
  const map = getBankMap(congregationId, year)
  if (!map?.confirmed) return null
  return map.entries.find((e) => e.bankszamlaId === bankszamlaId)?.letter ?? null
}

/**
 * Betű-lap egy szabad-szöveges bank-névhez (belső mozgás forrás/cél mezője) —
 * trim + kisbetűs egyezés, csak MEGERŐSÍTETT párosításból.
 */
export function getConfirmedLetterForBankName(
  congregationId: string,
  year: number,
  bankNeve: string,
): string | null {
  const map = getBankMap(congregationId, year)
  if (!map?.confirmed) return null
  const needle = bankNeve.trim().toLowerCase()
  if (!needle) return null
  return (
    map.entries.find((e) => e.bankNeve.trim().toLowerCase() === needle)?.letter ?? null
  )
}
