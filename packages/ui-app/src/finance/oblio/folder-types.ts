/**
 * Folder-státusz és helyi-fájl típusok az OblioEllenőrzés-modulhoz
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * A típusok a sharedba kerültek, hogy a `OblioEllenorzesFolderCard` +
 * `OblioEllenorzesWarnings` sub-komp-ok használhassák. A logika
 * (a `oblio-folder.ts` File System Access API-val) MÉG webnél marad —
 * a v0.7.9 sprintben kerül `OblioFileSystem` interface mögé
 * (iOS-future-proof).
 */

export interface OblioFolderStatus {
  /** A böngésző támogatja-e a File System Access API-t. */
  supported: boolean
  /** A KARTOTEKA root mappa be van-e már állítva. */
  hasRoot: boolean
  /** A KARTOTEKA root mappa neve (csak a leaf, nem a teljes út). */
  rootName: string | null
  /** Megvan-e a readwrite jogosultság. */
  hasPermission: boolean
  /** Az `oblio-ellenorzes/` almappa kész-e. */
  ellenorzesDirReady: boolean
  /** Hibaüzenet, ha valami nem ment. */
  error: string | null
}

export interface OblioLocalFile {
  /** A fájl neve (pl. "4214783.xml"). */
  name: string
  /** Relatív útvonal a `befogadott/<év>/` alól (pl. "4214783.xml"). */
  relpath: string
  /** Fájl típusa. */
  kind: 'zip' | 'xml' | 'pdf' | 'other'
  /** Fájlméret byte-ban. */
  size: number
  /** Utoljára módosítva. */
  lastModified: number
  /**
   * A File System Access API handle, hogy később megnyithassuk.
   * iOS WKWebView-ban ez `undefined`-ra ér — a v0.7.9 interface
   * absztrakcióval kezeli a platform-különbséget.
   */
  handle: FileSystemFileHandle
}
