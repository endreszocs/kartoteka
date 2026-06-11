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

// ───────────────────────────────────────────────────────────────────────────
// Koltsegvetes-fejléc (2026-06-11, Endre #1): egyházmegye + egyházközség
// ───────────────────────────────────────────────────────────────────────────

/**
 * A hivatalos `Adatok_2026.xlsx` Koltsegvetes lapjának fejléc-cellái.
 * A B78 lenyílójának forrása a lapon belüli X1:X24 lista (24 egyházmegye) —
 * a B88 képlet `UPPER(B78&" REFORMÁTUS EGYHÁZMEGYE")`-t, a B90 pedig
 * `TRIM(UPPER(B79&" Református Egyházközség"))`-et képez belőlük; e kettő
 * kitöltése nélkül a fájl kategória-lenyílói üresek (kézzel nem szerkeszthető).
 */
export const KOLTSEGVETES_SHEET = 'Koltsegvetes'
export const KOLTSEGVETES_MEGYE_CELL = 'B78'
export const KOLTSEGVETES_EGYHAZKOZSEG_CELL = 'B79'

/** A sablon X1:X24 listája — a B78-ba CSAK ezek egyike írható (byte-pontosan). */
export const EXCEL_EGYHAZMEGYEK = [
  'Brassói', 'Dési', 'Erdővidéki', 'Görgényi', 'Hunyadi', 'Kalotaszegi',
  'Kézdi-Orbai', 'Kolozsvári', 'Küküllői', 'Marosi', 'Maros-Mezőségi',
  'Nagyenyedi', 'Sepsi', 'Székelyudvarhelyi', 'Tordai', 'Aradi', 'Bihari',
  'Érmelléki', 'Nagybányai', 'Nagykárolyi', 'Szatmári', 'Szilágysomlyói',
  'Temesvári', 'Zilahi',
] as const

/** Ékezet-toleráns, kisbetűs összevetési alak. */
function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A DB-beli egyházmegye-névből (pl. „Kolozsvári Református Egyházmegye")
 * javaslat a sablon 24 hivatalos rövid neve közül. Nincs egyezés → null
 * (a panel kézi választást kér — NEM találgatunk).
 */
export function suggestExcelMegye(dbName: string | null | undefined): string | null {
  if (!dbName) return null
  const cleaned = foldName(
    dbName.replace(/református/gi, '').replace(/egyházmegye/gi, ''),
  )
  if (!cleaned) return null
  for (const hivatalos of EXCEL_EGYHAZMEGYEK) {
    if (foldName(hivatalos) === cleaned) return hivatalos
  }
  return null
}

/**
 * Az egyházközség nevének sablon-alakja: a gyülekezet nevéből a „Református"
 * és „Egyházközség" szavak nélkül (a B90 képlet fűzi vissza őket).
 */
export function suggestExcelEgyhazkozsegNev(dbName: string | null | undefined): string {
  if (!dbName) return ''
  return dbName
    .replace(/református/gi, ' ')
    .replace(/egyházközség/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
