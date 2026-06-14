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
