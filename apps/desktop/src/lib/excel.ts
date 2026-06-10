/**
 * Excel-könyvelés híd (E0, 2026-06-11) — a Rust `excel.rs` commandok TS-burka.
 *
 * A hivatalos EREK Excel-könyvelésbe (Adatok_<év>.xlsx) ír/olvas a Rust-rétegen
 * át (umya-spreadsheet). A `Kassza` (készpénz) és az `A`/`B`/`C`… (bankszámla)
 * lapok azonos D–L oszlop-sémájúak, ezért ugyanaz az append-mechanizmus célozható
 * bármelyik lapra a `sheet` paraméterrel.
 *
 * Ezek a hívások CSAK Tauri-ablakban működnek (sima böngészőben hibára futnak —
 * a hívó UI try/catch-csel kezeli, mint a `local-db.ts`-nél).
 *
 * E0: csak az alap-infrastruktúra (append + lap-lista). A tényleges write-through
 * bekötés (DB→Excel), a backup-menedzsment és a beállítás-UI a következő fázisok.
 */

import { invoke } from '@tauri-apps/api/core'

/** Egy Kassza/bank-lap adatsor — a D–L oszlopok. */
export interface KasszaRow {
  /** D — Dátum (YYYY-MM-DD) */
  datum: string
  /** E — Iratszám */
  iratszam: string
  /** F — Irattíp (Chit./Extr/OP/Fact.…) */
  irattip: string
  /** G — Név */
  nev: string
  /** H — Bevétel összeg */
  bevOsszeg?: number | null
  /** I — Bevétel kód (szöveges név) */
  bevKod?: string | null
  /** J — Kiadás összeg */
  kiadOsszeg?: number | null
  /** K — Kiadás kód (szöveges név) */
  kiadKod?: string | null
  /** L — Megjegyzés */
  megjegyzes: string
}

export interface AppendReport {
  /** Hány sort fűztünk hozzá. */
  appended: number
  /** Az első beírt sor (1-alapú Excel-sorszám). */
  firstRow: number
  /** A művelet előtti biztonsági másolat útvonala. */
  backupPath: string
}

/** A munkafüzet lapjainak nevei (a Kassza + A/B/C… bank-lapok felismeréséhez). */
export async function excelListSheets(filePath: string): Promise<string[]> {
  return invoke<string[]>('excel_list_sheets', { filePath })
}

/**
 * Sorok hozzáfűzése a megadott lap (Kassza / A / B …) D–L oszlopaihoz.
 * Backup → első üres sor → beírás → atomikus mentés → fullCalcOnLoad patch.
 */
export async function excelAppendRows(
  filePath: string,
  sheet: string,
  rows: KasszaRow[],
): Promise<AppendReport> {
  return invoke<AppendReport>('excel_append_rows', { filePath, sheet, rows })
}
