/**
 * OblioFileSystem interface — File System Access absztrakció
 * (Sprint Q F2.3, v0.7.9, 2026-04-26).
 *
 * A webes oldalon a `BrowserOblioFileSystem` adapter konkrét File System
 * Access API hívásokkal implementálja. iOS WKWebView-ban a Tauri-fs-mobile
 * plugin saját adapter-rel implementálja (jövőbeli).
 *
 * A `FileSystemDirectoryHandle` és `FileSystemFileHandle` TS-szinten globális
 * (lib.dom). iOS-mobile-on a typecheck OK, runtime-on a Tauri-fs adapter
 * saját proxy objektumot ad ezen interface-szel kompatibilis formában.
 *
 * A v0.7.9 sprint-ben a webes `oblio-folder.ts` 11 export-ja egy ilyen
 * interface mögé kerül. A shared `OblioEllenorzesTab` ezt prop-ként
 * kapja meg, és minden file-műveletet a runtime-on át hív.
 */

import type { OblioFolderStatus, OblioLocalFile } from './folder-types'

/**
 * Egy ZIP-feldolgozás eredménye — a `processAllZipsInFolder` visszatérése.
 */
export interface ZipProcessResult {
  zipName: string
  /** Kibontott XML fájlnevek. */
  extractedXmls: string[]
  /** Kibontott PDF fájlnevek. */
  extractedPdfs: string[]
  /** Ha hiba történt, itt jön a magyar üzenet. */
  error: string | null
}

/**
 * A `reprocessZipsFromArchive` visszatérési típusa.
 */
export interface ReprocessArchiveResult {
  deletedXmls: number
  deletedPdfs: number
  copiedZips: number
  results: ZipProcessResult[]
  error: string | null
}

/**
 * Mappa-művelet eredmények.
 */
export interface RemoveFilesResult {
  deleted: number
  errors: string[]
}

export interface RenameFileResult {
  success: boolean
  error?: string
}

/**
 * Az OblioEllenőrzésTab által használt teljes file-system API.
 *
 * Web: `BrowserOblioFileSystem` (File System Access API + jszip + DOMParser).
 * Desktop (Tauri 2): jövőbeli `TauriOblioFileSystem` adapter.
 * iOS (Tauri-mobile): jövőbeli `TauriMobileOblioFileSystem` adapter.
 *
 * MIND ugyanaz az interface — a tab nem tudja, melyik platformon fut.
 */
export interface OblioFileSystem {
  /** Mappa-állapot (támogatott-e a böngésző, van-e root, van-e permission). */
  getFolderStatus(congregationSlug: string): Promise<OblioFolderStatus>

  /** A `befogadott/` mappa megnyitása vagy létrehozása. */
  getBefogadottDir(
    congregationSlug: string,
  ): Promise<FileSystemDirectoryHandle | null>

  /** A `feldolgozva-zip/` mappa (audit-archívum). */
  getFeldolgozvaDir(
    congregationSlug: string,
  ): Promise<FileSystemDirectoryHandle | null>

  /** Egy mappa fájljainak listázása. */
  listFolderFiles(dir: FileSystemDirectoryHandle): Promise<OblioLocalFile[]>

  /** Egy file-handle szöveges tartalmának olvasása (UTF-8). */
  readFileAsText(handle: FileSystemFileHandle): Promise<string>

  /** Fájl(ok) törlése a mappából. */
  removeFilesFromFolder(
    dir: FileSystemDirectoryHandle,
    names: string[],
  ): Promise<RemoveFilesResult>

  /** Fájl átnevezése a mappán belül. */
  renameFileInFolder(
    dir: FileSystemDirectoryHandle,
    oldName: string,
    newName: string,
  ): Promise<RenameFileResult>

  /**
   * ZIP-ek kibontása a `befogadott/` mappából (XML + PDF).
   * A feldolgozott ZIP-eket átteszi a `feldolgozva-zip/` archívumba.
   */
  processAllZipsInFolder(
    befogadottDir: FileSystemDirectoryHandle,
    feldolgozvaDir: FileSystemDirectoryHandle,
  ): Promise<ZipProcessResult[]>

  /**
   * Újra-feldolgozás az archívum ZIP-ekből (a `befogadott/` régi
   * XML/PDF-eket törli, az archívumból visszamásolja a ZIP-eket
   * és újra kibontja).
   */
  reprocessZipsFromArchive(
    befogadottDir: FileSystemDirectoryHandle,
    feldolgozvaDir: FileSystemDirectoryHandle,
  ): Promise<ReprocessArchiveResult>

  /** Egy helyi fájl megnyitása új böngésző-ablakban (pl. PDF előnézet). */
  openLocalFileInBrowser(handle: FileSystemFileHandle): Promise<void>
}
