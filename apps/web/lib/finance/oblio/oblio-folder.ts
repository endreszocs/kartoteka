/**
 * Oblio ellenőrzés helyi mappa-kezelő.
 *
 * A meglévő `lib/offline/fs-handle-store.ts` infrastruktúrára épül:
 * a KARTOTEKA root mappa egy almappáját (`oblio-ellenorzes/<év>/befogadott/`)
 * használjuk az Oblio Wallet-ből letöltött ZIP/XML fájloknak.
 *
 * Felelősségi körök:
 *   - Almappák létrehozása / megnyitása
 *   - ZIP-ek kibontása (jszip)
 *   - XML-ek listázása + olvasása
 *   - PDF-ek listázása (Blob → új tab nyitás)
 *
 * Csak kliens-oldali (browser).
 */

import {
  getStoredRootHandle,
  getOrCreateKartotekaDir,
  ensurePermission,
  isFileSystemAccessSupported,
} from '@/lib/offline/fs-handle-store'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

// 2026-04-26 (Sprint Q F2.2, v0.7.8): a típusok átkerültek a shared
// `@kartoteka/ui-app/finance/oblio/folder-types.ts`-be — itt csak
// re-exportoljuk őket, hogy a meglévő import-helyek (pl. modal-ok,
// tab) változatlanul működjenek. A logika (a függvények alább)
// még webnél marad, a v0.7.9 sprint-ben kerül interface mögé.
import type {
  OblioFileSystem,
  OblioFolderStatus,
  OblioLocalFile,
  ZipProcessResult as SharedZipProcessResult,
} from '@kartoteka/ui-app'
export type { OblioFolderStatus, OblioLocalFile }
export type { ZipProcessResult as SharedZipProcessResult } from '@kartoteka/ui-app'

// ─────────────────────────────────────────────────────────────
// Almappa-műveletek
// ─────────────────────────────────────────────────────────────

const ELLENORZES_SUBDIR = 'oblio-ellenorzes'
const BEFOGADOTT_SUBDIR = 'befogadott'
const FELDOLGOZVA_SUBDIR = 'feldolgozva-zip'

/**
 * Az `<root>/KARTOTEKA/<congSlug>/oblio-ellenorzes/befogadott/` mappa
 * megnyitása vagy létrehozása.
 *
 * **ÁLLANDÓ útvonal** — év nélküli. A lelkész mindig ugyanide teszi a ZIP-et,
 * az évekre való bontás a `kiadas` oldali év-szűréssel valósul meg (a XML-ek
 * dátuma alapján). Az archívum (`feldolgozva-zip/`) ugyanakkor időbélyegzett
 * fájlneveket használ, hogy rekonstruálható legyen a történet.
 */
export async function getOblioBefogadottDir(
  congregationSlug: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null
  const root = await getStoredRootHandle()
  if (!root) return null
  const ok = await ensurePermission(root)
  if (!ok) return null

  const congDir = await getOrCreateKartotekaDir(root, congregationSlug)
  const ellenorzesDir = await congDir.getDirectoryHandle(ELLENORZES_SUBDIR, {
    create: true,
  })
  return ellenorzesDir.getDirectoryHandle(BEFOGADOTT_SUBDIR, { create: true })
}

/**
 * Az archív mappa (ahova a feldolgozott ZIP-eket tesszük), hogy a
 * `befogadott/` ne tartalmazzon redundáns ZIP+kibontott XML párokat.
 *
 * Szintén állandó útvonal. A feldolgozott ZIP fájlneveket `YYYY-MM-DD_`
 * prefixszel látjuk el a `processAllZipsInFolder`-ben, hogy audit-rend
 * legyen.
 */
export async function getOblioFeldolgozvaDir(
  congregationSlug: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null
  const root = await getStoredRootHandle()
  if (!root) return null
  const ok = await ensurePermission(root)
  if (!ok) return null

  const congDir = await getOrCreateKartotekaDir(root, congregationSlug)
  const ellenorzesDir = await congDir.getDirectoryHandle(ELLENORZES_SUBDIR, {
    create: true,
  })
  return ellenorzesDir.getDirectoryHandle(FELDOLGOZVA_SUBDIR, { create: true })
}

// ─────────────────────────────────────────────────────────────
// Mappa állapot lekérdezés (UI-hez)
// ─────────────────────────────────────────────────────────────

export async function getOblioFolderStatus(
  congregationSlug: string,
): Promise<OblioFolderStatus> {
  if (!isFileSystemAccessSupported()) {
    return {
      supported: false,
      hasRoot: false,
      rootName: null,
      hasPermission: false,
      ellenorzesDirReady: false,
      error:
        'A böngésző nem támogatja a File System Access API-t. Használj Chrome-ot vagy Edge-et.',
    }
  }

  const root = await getStoredRootHandle()
  if (!root) {
    return {
      supported: true,
      hasRoot: false,
      rootName: null,
      hasPermission: false,
      ellenorzesDirReady: false,
      error: null,
    }
  }

  // Permission ellenőrzés (NEM kérünk újat — csak query)
  // @ts-expect-error — queryPermission experimental API
  const permState: PermissionState = await root.queryPermission({ mode: 'readwrite' })
  if (permState !== 'granted') {
    return {
      supported: true,
      hasRoot: true,
      rootName: root.name,
      hasPermission: false,
      ellenorzesDirReady: false,
      error: null,
    }
  }

  // Próbáljuk megnyitni az almappát (ha még nincs, nem hiba — majd első use-kor jön létre)
  let ellenorzesDirReady = false
  try {
    const congDir = await getOrCreateKartotekaDir(root, congregationSlug)
    const ellenorzesDir = await congDir.getDirectoryHandle(ELLENORZES_SUBDIR, {
      create: true,
    })
    await ellenorzesDir.getDirectoryHandle(BEFOGADOTT_SUBDIR, { create: true })
    ellenorzesDirReady = true
  } catch (e) {
    return {
      supported: true,
      hasRoot: true,
      rootName: root.name,
      hasPermission: true,
      ellenorzesDirReady: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  return {
    supported: true,
    hasRoot: true,
    rootName: root.name,
    hasPermission: true,
    ellenorzesDirReady,
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────
// Fájlok listázása
// ─────────────────────────────────────────────────────────────

export async function listOblioFolderFiles(
  dir: FileSystemDirectoryHandle,
): Promise<OblioLocalFile[]> {
  const files: OblioLocalFile[] = []

  // @ts-expect-error — values() AsyncIterable, typing korlátos
  for await (const handle of dir.values()) {
    if (handle.kind !== 'file') continue
    const fileHandle = handle as FileSystemFileHandle
    let file: File
    try {
      file = await fileHandle.getFile()
    } catch {
      continue
    }
    const lower = handle.name.toLowerCase()
    let kind: OblioLocalFile['kind'] = 'other'
    if (lower.endsWith('.zip')) kind = 'zip'
    else if (lower.endsWith('.xml')) kind = 'xml'
    else if (lower.endsWith('.pdf')) kind = 'pdf'

    files.push({
      name: handle.name,
      relpath: handle.name,
      kind,
      size: file.size,
      lastModified: file.lastModified,
      handle: fileHandle,
    })
  }

  return files.sort((a, b) => a.name.localeCompare(b.name))
}

// ─────────────────────────────────────────────────────────────
// Fájl olvasás (Blob → szöveg vagy URL)
// ─────────────────────────────────────────────────────────────

export async function readFileAsText(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function readFileAsBlob(handle: FileSystemFileHandle): Promise<Blob> {
  return handle.getFile()
}

/**
 * Kinyit egy fájlt a böngésző alapértelmezett megtekintőjében (új tab).
 * - PDF → a böngésző PDF viewer-e
 * - XML → szöveges (a browser default)
 *
 * Az object URL-t 30 mp után visszavonjuk (memóriaszivárgás védelem).
 */
export async function openLocalFileInBrowser(
  handle: FileSystemFileHandle,
): Promise<void> {
  const blob = await handle.getFile()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Letölti egy fájl tartalmát a felhasználó letöltési mappájába (browser save).
 */
export async function downloadLocalFile(
  handle: FileSystemFileHandle,
  suggestedName?: string,
): Promise<void> {
  const blob = await handle.getFile()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName || handle.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

/**
 * Egy fájl törlése a megadott mappából. Idempotens — ha a fájl már nincs,
 * csendesen visszatér.
 */
export async function removeFileFromFolder(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  try {
    await dir.removeEntry(fileName)
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError') return
    throw e
  }
}

/**
 * Egy fájl átnevezése a mappán belül. A File System Access API-nak nincs
 * direct rename API-ja, ezért: olvas → új névvel ír → régit töröl.
 * Idempotens: ha az új név már létezik, a régit egyszerűen törli (nem
 * írja felül a meglévőt).
 */
export async function renameFileInFolder(
  dir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  if (oldName === newName) return { success: true }
  try {
    // Olvasás
    const oldHandle = await dir.getFileHandle(oldName, { create: false })
    const oldFile = await oldHandle.getFile()
    // Írás (ha az új név már foglalt, NEM írjuk felül)
    let exists = false
    try {
      await dir.getFileHandle(newName, { create: false })
      exists = true
    } catch {
      /* nem létezik, OK */
    }
    if (!exists) {
      const newHandle = await dir.getFileHandle(newName, { create: true })
      const writable = await newHandle.createWritable()
      await writable.write(oldFile)
      await writable.close()
    }
    // Régi törlése
    await dir.removeEntry(oldName)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Csoportos törlés — visszaadja, hány sikerült és milyen hibák voltak.
 */
export async function removeFilesFromFolder(
  dir: FileSystemDirectoryHandle,
  fileNames: string[],
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []
  for (const name of fileNames) {
    try {
      await removeFileFromFolder(dir, name)
      deleted++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${name}: ${msg}`)
    }
  }
  return { deleted, errors }
}

// ─────────────────────────────────────────────────────────────
// ZIP processzor — kibontja a ZIP-ben levő XML+PDF fájlokat a befogadott
// mappába, majd a ZIP-et átteszi a feldolgozva-zip-be (audit célra).
// ─────────────────────────────────────────────────────────────

// 2026-04-26 (Sprint Q F2.3, v0.7.9): a `ZipProcessResult` átkerült a
// shared `@kartoteka/ui-app/finance/oblio/oblio-filesystem.ts`-be.
// Itt re-exportoljuk a webes import-helyek kompatibilitása miatt.
export type ZipProcessResult = SharedZipProcessResult

/**
 * Kibontja az összes ZIP-et a `befogadott/` mappában.
 *
 * **PÁROSÍTÓ KIBONTÁS** — az ANAF SPV ZIP-ekben a XML és PDF fájlnevek
 * jellemzően teljesen mások (külön upload index és külön EFI render ID),
 * így fájlnév-alapú párosítás kibontás UTÁN nem működne. Ezért a
 * **kibontás során** egy ZIP-en belül az n-edik XML és n-edik PDF
 * párosul: a PDF-et átnevezzük, hogy az XML alap nevével egyezzen.
 *
 * Az aláírás XML-eket (`semnatura_*.xml` / `semnatura-*.xml`) NEM
 * bontjuk ki — ezek csak az ANAF digitális aláírás-blokkok, és csak
 * felesleges zajt okoznának a UI-ban.
 *
 * - Idempotens: ha a célnév már létezik, NEM írjuk felül.
 * - A feldolgozott ZIP a `feldolgozva-zip/`-be kerül `YYYY-MM-DD_` prefix-szel.
 */
export async function processAllZipsInFolder(
  befogadottDir: FileSystemDirectoryHandle,
  feldolgozvaDir: FileSystemDirectoryHandle,
): Promise<ZipProcessResult[]> {
  // jszip lazy import (csak amikor szükség van rá)
  const JSZipModule = await import('jszip')
  const JSZip = JSZipModule.default

  const results: ZipProcessResult[] = []
  const allFiles = await listOblioFolderFiles(befogadottDir)
  const zipFiles = allFiles.filter((f) => f.kind === 'zip')

  for (const zipFile of zipFiles) {
    const result: ZipProcessResult = {
      zipName: zipFile.name,
      extractedXmls: [],
      extractedPdfs: [],
      error: null,
    }

    try {
      const blob = await zipFile.handle.getFile()
      const arrayBuffer = await blob.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)

      // Külön gyűjtjük a fő XML-eket, az aláírás-XML-eket (kihagyjuk)
      // és a PDF-eket. A path-component csak a fájlnév (mappákat eldobjuk).
      type Entry = { baseName: string; entry: import('jszip').JSZipObject }
      const xmlEntries: Entry[] = []
      const pdfEntries: Entry[] = []

      for (const entryPath of Object.keys(zip.files)) {
        const entry = zip.files[entryPath]
        if (entry.dir) continue
        const baseName = entryPath.split(/[/\\]/).pop() || entryPath
        const lowerBase = baseName.toLowerCase()

        // Aláírás-XML kihagyása (semnatura_*.xml)
        if (/^semnatura[_-]/i.test(baseName)) continue

        if (lowerBase.endsWith('.xml')) {
          xmlEntries.push({ baseName, entry })
        } else if (lowerBase.endsWith('.pdf')) {
          pdfEntries.push({ baseName, entry })
        }
      }

      // Helper: idempotens fájlírás
      async function writeFile(name: string, data: Blob): Promise<'written' | 'skipped'> {
        try {
          await befogadottDir.getFileHandle(name, { create: false })
          return 'skipped' // már létezik
        } catch {
          /* nem létezik, OK */
        }
        const newHandle = await befogadottDir.getFileHandle(name, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(data)
        await writable.close()
        return 'written'
      }

      // PÁROSÍTÁS — két stratégiával:
      //
      //  1. **Fájlnév-minta alapján** (ANAF SPV jellemző):
      //     XML: `<beszállító>_<sorozat>_<UUID>.xml`
      //     PDF: `<UUID>_<sorozat>.pdf`
      //     → ha az XML utolsó 2 része megegyezik a PDF 2 részével
      //       (fordított sorrendben), biztos pár → PDF átnevezve XML
      //       alap nevére.
      //
      //  2. **1+1 ZIP fallback**: ha a fájlnév-minta nem ad egyezést, de
      //     pontosan 1 XML és 1 PDF van a ZIP-ben → biztos pár.
      //
      //  3. Egyébként eredeti néven (árva PDF — a felhasználó tartalom-
      //     elemzéssel vagy manuálisan párosíthatja később).

      const { extractIdsFromXmlName, extractIdsFromPdfName } = await import(
        './pdf-xml-name-matcher'
      )

      // Készítünk egy térképet az XML-ekhez ID-szerint
      type XmlIndexEntry = { entry: typeof xmlEntries[0]; ids: ReturnType<typeof extractIdsFromXmlName> }
      const xmlIndex: XmlIndexEntry[] = xmlEntries.map((e) => ({
        entry: e,
        ids: extractIdsFromXmlName(e.baseName),
      }))
      const usedXmlBaseNames = new Set<string>()

      // XML(ek) kibontása — eredeti névvel
      for (const xmlInfo of xmlEntries) {
        const data = await xmlInfo.entry.async('blob')
        const status = await writeFile(xmlInfo.baseName, data)
        if (status === 'skipped') {
          result.extractedXmls.push(xmlInfo.baseName + ' (skip — már létezik)')
        } else {
          result.extractedXmls.push(xmlInfo.baseName)
        }
      }

      const isSafePair = xmlEntries.length === 1 && pdfEntries.length === 1

      // PDF(ek) kibontása — minden PDF-re külön match-elünk
      for (const pdfInfo of pdfEntries) {
        let targetPdfName: string
        let renamingNote = ''

        // 1. Fájlnév-minta alapján
        const pdfIds = extractIdsFromPdfName(pdfInfo.baseName)
        let matchedXml: typeof xmlEntries[0] | null = null
        if (pdfIds) {
          const exactMatch = xmlIndex.find((x) => {
            if (!x.ids) return false
            if (usedXmlBaseNames.has(x.entry.baseName)) return false
            return x.ids.uuid === pdfIds.uuid && x.ids.series === pdfIds.series
          })
          if (exactMatch) matchedXml = exactMatch.entry
        }

        // 2. 1+1 fallback
        if (!matchedXml && isSafePair && xmlEntries.length === 1) {
          matchedXml = xmlEntries[0]
        }

        if (matchedXml) {
          usedXmlBaseNames.add(matchedXml.baseName)
          const xmlBase = matchedXml.baseName.replace(/\.xml$/i, '')
          targetPdfName = `${xmlBase}.pdf`
          if (targetPdfName !== pdfInfo.baseName) {
            renamingNote = ` (fájlnév-mintával átnevezve ← ${pdfInfo.baseName})`
          }
        } else {
          // Nincs egyezés — eredeti néven (későbbi tartalom-elemzéssel
          // vagy kézi párosítással kezelhető)
          targetPdfName = pdfInfo.baseName
          renamingNote = ` (nincs XML pár — árva PDF, későbbi tartalom-elemzéssel párosítható)`
        }

        const data = await pdfInfo.entry.async('blob')
        const status = await writeFile(targetPdfName, data)
        if (status === 'skipped') {
          result.extractedPdfs.push(targetPdfName + ' (skip — már létezik)')
        } else {
          result.extractedPdfs.push(targetPdfName + renamingNote)
        }
      }

      // ZIP áthelyezés a feldolgozva-zip mappába (másolás + törlés)
      // Fájlnév prefix: `YYYY-MM-DD_` — audit-rend + névkonfliktus elkerülése,
      // ha a felhasználó azonos nevű ZIP-et tölt be többször egy napon,
      // akkor a `_(n)` postfix számozunk.
      const zipBlob = await zipFile.handle.getFile()
      const dateStamp = new Date().toISOString().slice(0, 10)
      let archivedName = `${dateStamp}_${zipFile.name}`
      // Névütközés kezelése
      let suffix = 1
      while (true) {
        try {
          await feldolgozvaDir.getFileHandle(archivedName, { create: false })
          // létezik — új név
          archivedName = `${dateStamp}_${zipFile.name.replace(/\.zip$/i, '')}_(${suffix}).zip`
          suffix++
        } catch {
          break // nem létezik, OK
        }
      }
      const movedHandle = await feldolgozvaDir.getFileHandle(archivedName, {
        create: true,
      })
      const writable = await movedHandle.createWritable()
      await writable.write(zipBlob)
      await writable.close()
      // Eredeti ZIP törlése a befogadott-ból
      await befogadottDir.removeEntry(zipFile.name)
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }

    results.push(result)
  }

  return results
}

/**
 * Újra-feldolgozás az archívumból. Akkor hasznos, ha az új párosítás-logika
 * miatt a régi (rossz névvel kibontott) PDF-eket újra ki kell bontani.
 *
 * Lépések:
 *   1. Töröljük az ÖSSZES `.xml` és `.pdf` fájlt a `befogadott/`-ból
 *   2. A `feldolgozva-zip/`-ből minden ZIP-et **visszamásolunk** a
 *      `befogadott/`-ba (eredeti névre, a `YYYY-MM-DD_` prefix levágva)
 *   3. Lefuttatjuk a `processAllZipsInFolder`-t (új párosító logikával)
 *
 * Az archívumban a ZIP eredeti másolata megmarad — duplán biztos vagy.
 */
export async function reprocessZipsFromArchive(
  befogadottDir: FileSystemDirectoryHandle,
  feldolgozvaDir: FileSystemDirectoryHandle,
): Promise<{
  deletedXmls: number
  deletedPdfs: number
  copiedZips: number
  results: ZipProcessResult[]
  error: string | null
}> {
  try {
    // 1. Régi XML/PDF törlése
    const existing = await listOblioFolderFiles(befogadottDir)
    let deletedXmls = 0
    let deletedPdfs = 0
    for (const f of existing) {
      if (f.kind === 'xml') {
        try {
          await befogadottDir.removeEntry(f.name)
          deletedXmls++
        } catch {
          /* ignore */
        }
      } else if (f.kind === 'pdf') {
        try {
          await befogadottDir.removeEntry(f.name)
          deletedPdfs++
        } catch {
          /* ignore */
        }
      }
    }

    // 2. Archívum ZIP-ek visszamásolása a befogadott/-ba
    const archived = await listOblioFolderFiles(feldolgozvaDir)
    const archivedZips = archived.filter((f) => f.kind === 'zip')
    let copiedZips = 0
    for (const zip of archivedZips) {
      // YYYY-MM-DD_ prefix levágása (ha van) — visszanyerjük az eredeti nevet
      const originalName = zip.name.replace(/^\d{4}-\d{2}-\d{2}_/, '')
      // Ha már létezik a befogadott-ban (más prefix-szel), egyedi nevet adunk
      let targetName = originalName
      let suffix = 1
      while (true) {
        try {
          await befogadottDir.getFileHandle(targetName, { create: false })
          targetName = originalName.replace(/\.zip$/i, '') + `_(${suffix}).zip`
          suffix++
        } catch {
          break
        }
      }
      const file = await zip.handle.getFile()
      const newHandle = await befogadottDir.getFileHandle(targetName, { create: true })
      const writable = await newHandle.createWritable()
      await writable.write(file)
      await writable.close()
      copiedZips++
    }

    // 3. Újra-feldolgozás (a processAllZipsInFolder a frissen visszamásolt
    //    ZIP-eket az új párosító logikával bontja ki)
    const results = await processAllZipsInFolder(befogadottDir, feldolgozvaDir)

    return {
      deletedXmls,
      deletedPdfs,
      copiedZips,
      results,
      error: null,
    }
  } catch (e) {
    return {
      deletedXmls: 0,
      deletedPdfs: 0,
      copiedZips: 0,
      results: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// BrowserOblioFileSystem — a webes adapter (Sprint Q F2.3, v0.7.9, 2026-04-26)
//
// Az `OblioFileSystem` interface webes implementációja: a fenti exportált
// függvények egy adapter-objektumba aggregálva. A shared `OblioEllenorzesTab`
// ezt prop-ként kapja meg, és minden file-műveletet ezen át hív.
//
// Desktop (Tauri 2): külön adapter (Tauri-fs plugin alatt).
// iOS (Tauri-mobile, jövőbeli): saját adapter (Tauri-fs-mobile).
// ─────────────────────────────────────────────────────────────────────────

export const BrowserOblioFileSystem: OblioFileSystem = {
  getFolderStatus: getOblioFolderStatus,
  getBefogadottDir: getOblioBefogadottDir,
  getFeldolgozvaDir: getOblioFeldolgozvaDir,
  listFolderFiles: listOblioFolderFiles,
  readFileAsText,
  removeFilesFromFolder,
  renameFileInFolder,
  processAllZipsInFolder,
  reprocessZipsFromArchive,
  openLocalFileInBrowser,
}
