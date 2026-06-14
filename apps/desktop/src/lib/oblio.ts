/**
 * Befogadott e-Factura (Oblio) mappa — a Rust `excel.rs` Oblio-commandjainak
 * TS-burka (2026-06-14).
 *
 * A böngésző File System Access mappaválasztója sok hibalehetőséget hordoz
 * (rossz mappa, megtagadott engedély, felhő-szinkronizált hely). Az asztali
 * (offline) appban a RENDSZER birtokolja a mappát: egy fix, ismert helyen a
 * Dokumentumok-ban (`…\Documents\Kartoteka\Oblio\befogadott`), amit a Rust-réteg
 * hoz létre és nyit meg. A lelkész ide teszi az Oblio Wallet-ből letöltött ZIP-et.
 *
 * Ezek a hívások CSAK Tauri-ablakban működnek (sima böngészőben hibára futnak —
 * a hívó UI try/catch-csel kezeli).
 */

import { invoke } from '@tauri-apps/api/core'

export interface OblioFolderInfo {
  /** A befogadott e-Factura mappa teljes útvonala. */
  folderPath: string
  /** Létezik-e már a mappa. */
  exists: boolean
  /** A mappában talált ZIP fájlok száma. */
  zipCount: number
  /** A kibontott XML fájlok száma. */
  xmlCount: number
  /** A kibontott PDF fájlok száma. */
  pdfCount: number
}

/** A befogadott e-Factura mappa alapértelmezett útvonala (létrehozás nélkül). */
export async function oblioDefaultFolder(): Promise<string> {
  return invoke<string>('oblio_default_folder')
}

/** A mappa állapota (létezik-e + ZIP/XML/PDF darabszám) — másolás nélkül. */
export async function oblioFolderInfo(): Promise<OblioFolderInfo> {
  return invoke<OblioFolderInfo>('oblio_folder_info')
}

/** A mappa előkészítése: létrehozza (a szülőkkel együtt), ha még nincs. Idempotens. */
export async function oblioSetupFolder(): Promise<OblioFolderInfo> {
  return invoke<OblioFolderInfo>('oblio_setup_folder')
}

/** Egy fájl a feldolgozott tárban. */
export interface OblioFileEntry {
  name: string
  /** Teljes útvonal (megnyitáshoz). */
  path: string
  size: number
  /** Utolsó módosítás (ms az epoch óta). */
  mtimeMs: number
  /** "xml" | "pdf" | "other". */
  kind: 'xml' | 'pdf' | 'other'
}

/** A beolvasás összesítője. */
export interface OblioIngestReport {
  extractedXml: number
  extractedPdf: number
  movedXml: number
  movedPdf: number
  archivedZips: number
  /** Már korábban beolvasott (kihagyott) fájlok száma. */
  skipped: number
  /** A bedobó mappában maradt (ismeretlen formátumú) fájlok száma. */
  befogadottRemaining: number
  errors: string[]
}

/**
 * BEOLVASÁS: a bedobó (`befogadott`) mappa ZIP-jeinek kibontása + a lazán
 * bedobott XML/PDF áthelyezése a belső (`feldolgozott`) tárba. A bedobó mappa
 * beolvasás után KIÜRÜL — így a lelkész látja, mit olvasott már be a rendszer.
 */
export async function oblioIngest(): Promise<OblioIngestReport> {
  return invoke<OblioIngestReport>('oblio_ingest')
}

/** A feldolgozott mappa fájljainak listája (név szerint rendezve). */
export async function oblioListProcessed(): Promise<OblioFileEntry[]> {
  return invoke<OblioFileEntry[]>('oblio_list_processed')
}

/** Egy feldolgozott fájl szöveges tartalma (UBL XML parse-hoz) — fájlnév alapján. */
export async function oblioReadText(name: string): Promise<string> {
  return invoke<string>('oblio_read_text', { name })
}
