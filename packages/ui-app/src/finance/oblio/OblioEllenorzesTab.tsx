'use client'

/**
 * Oblio ellenőrzés fül — shared package verzió
 * (Sprint Q F2.3, v0.7.9, 2026-04-26).
 *
 * Helyileg parse-olja az Oblio Wallet-ből letöltött befogadott e-Factura
 * UBL XML-eket, és összeveti a `kiadas` rekordokkal.
 *
 * Adatfolyam:
 *   1. Helyi mappa scan (`fileSystem.processAllZipsInFolder` → ZIP kibontás)
 *   2. UBL XML parse (`parseUblXml`)
 *   3. IndexedDB cache (`getCachedXml` / `putCachedXml`)
 *   4. Server-oldali párosítás (`onLoadMatchesAndKiadasok` callback)
 *   5. Pure matcher algoritmus (`matchXmlsToKiadas`)
 *   6. UI render
 *
 * Platform-függetlenség: a file-system műveletek a `OblioFileSystem`
 * runtime objektumon át mennek (web: `BrowserOblioFileSystem`,
 * desktop/iOS: jövőbeli Tauri-fs adapter).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Filter,
  Info,
  Link2,
  Link2Off,
  Loader2,
  PlusCircle,
  Printer,
  X,
} from 'lucide-react'

import { batchMatchPdfsToXmls, type ContentMatchResult } from './pdf-xml-content-matcher'
import { batchMatchPdfsToXmlsByName, type NameMatchResult } from './pdf-xml-name-matcher'
import {
  parseUblXml,
  extractAnafUuidFromFilename,
  normalizeFileBaseName,
  type UblInvoiceMeta,
} from './ubl-parser'
import { getCachedXml, putCachedXml, pruneCacheToActualFiles } from './oblio-cache'
import {
  matchXmlsToKiadas,
  type ExistingMatch,
  type MinimalKiadas,
  type XmlMatchResult,
  type UnmatchedXmlDiag,
} from './oblio-matcher'
import type { OblioFolderStatus, OblioLocalFile } from './folder-types'
import type { OblioFileSystem } from './oblio-filesystem'
import { OblioEllenorzesFolderCard } from './OblioEllenorzesFolderCard'
import { OblioEllenorzesWarnings, OblioFormatGuideCard } from './OblioEllenorzesWarnings'
import type { WizardXmlItem } from './OblioKiadasWizardDialogBody'

export type OblioTabToastKind = 'success' | 'error' | 'info' | 'warning'

/**
 * Az `oblio_kiadas_match` tábla soroknak megfelelő típus —
 * a server action visszatérési típusa.
 */
export interface OblioKiadasMatchRow {
  id: string
  kiadas_id: number
  anaf_uuid: string
  supplier_cui: string | null
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  local_file_relpath: string | null
  match_method: 'auto_cui' | 'auto_name_amount_date' | 'manual'
  match_confidence: 'high' | 'medium' | 'low'
  manual_note: string | null
  matched_at: string
}

export interface OblioMinimalKiadas {
  id: number
  datum: string
  osszeg: number
  kedvezmenyzett?: string | null
  atvevo?: string | null
  kedvezmenyezett_cui?: string | null
  iratszam?: string | null
}

/**
 * Egy auto-match perzisztálási input — a `bulkSaveOblioMatches`-nek átadva.
 */
export interface OblioBulkMatchInput {
  kiadasId: number
  anafUuid: string
  supplierCui: string | null
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  invoiceAmount: number | null
  localFileRelpath: string | null
  method: 'auto_cui' | 'auto_name_amount_date'
  confidence: 'high'
}

export interface OblioEllenorzesTabProps {
  congregationSlug: string
  congregationName: string
  /** Az aktuális év — a befogadott/<év>/ mappa kiválasztásához. */
  currentYear: number

  /** File-system runtime (web: `BrowserOblioFileSystem`, desktop: jövő). */
  fileSystem: OblioFileSystem

  /** Server actionök — a wrapper a webes `oblio-ellenorzes-actions.ts`-ből biz. */
  onLoadMatchesAndKiadasok: (year: number) => Promise<{
    matches?: OblioKiadasMatchRow[]
    kiadasok?: OblioMinimalKiadas[]
    utolsoLetoltes?: string | null
    error?: string
  }>
  onBulkSaveMatches: (
    inputs: OblioBulkMatchInput[],
  ) => Promise<{ success?: boolean; saved: number; errors: string[] }>
  /** Egy XML kézi/ akcept-elt párosítása (a diagnosztika dialógusból). */
  onSaveSingleMatch: (input: {
    kiadasId: number
    anafUuid: string
    supplierCui: string | null
    supplierName: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    invoiceAmount: number | null
    localFileRelpath: string | null
    method: 'manual'
    confidence: 'medium' | 'high'
    syncCuiToKiadas?: boolean
  }) => Promise<{ success?: boolean; error?: string }>
  onRemoveMatch: (matchId: string) => Promise<{ success?: boolean; error?: string }>
  onRecordDownloadNow: (timestamp: string) => Promise<{ error?: string }>

  /** UI-feedback. */
  onToast?: (msg: string, kind: OblioTabToastKind) => void

  /** Beállítások-megnyitás (web: `/profile?tab=offline` redirect). */
  onOpenSettings: () => void

  /** 4 modal slot (a Dialog shell webnél marad). */
  manualMatchDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    xml: UblInvoiceMeta | null
    fileRelpath: string | null
    kiadasok: OblioMinimalKiadas[]
    onSaved: () => void | Promise<void>
  }) => ReactNode

  invoicePrintDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    meta: UblInvoiceMeta | null
    pdfHandle: FileSystemFileHandle | null
    fileName: string
    congregationName: string
  }) => ReactNode

  matchDiagnosticDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    diagnostics: UnmatchedXmlDiag[]
    onManualMatch: (anafUuid: string) => void
    onAutoMatch: (
      anafUuid: string,
      kiadasId: number,
    ) => Promise<{ success?: boolean; error?: string }>
    onDismiss: (anafUuid: string) => void
  }) => ReactNode

  kiadasWizardDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    xmls: WizardXmlItem[]
    onCompleted: () => void | Promise<void>
  }) => ReactNode
}

type EnrichedXml = {
  meta: UblInvoiceMeta
  fileName: string
  fileLastModified: number
  /** A meta oldali kapcsolódó match (ha van) */
  match: XmlMatchResult
  /** A párosított kiadás (ha van) */
  kiadas: OblioMinimalKiadas | null
  /** Az XML fájl handle (megnyitáshoz). */
  xmlHandle: FileSystemFileHandle
  /** A kapcsolódó PDF fájl (ha van ugyanazon ANAF UUID-val). */
  pdfHandle: FileSystemFileHandle | null
}

type FilterMode = 'mind' | 'parositott' | 'hianyzo' | 'kiadas-nelkul'
type SortBy = 'datum' | 'beszallito' | 'szamlaszam' | 'brutto' | 'match'
type SortDir = 'asc' | 'desc'

export function OblioEllenorzesTab({
  congregationSlug,
  congregationName,
  currentYear,
  fileSystem,
  onLoadMatchesAndKiadasok,
  onBulkSaveMatches,
  onSaveSingleMatch,
  onRemoveMatch,
  onRecordDownloadNow,
  onToast,
  onOpenSettings,
  manualMatchDialogSlot,
  invoicePrintDialogSlot,
  matchDiagnosticDialogSlot,
  kiadasWizardDialogSlot,
}: OblioEllenorzesTabProps) {
  // Lokális toast helper-ek — a sonner-t lecseréli az `onToast` callback-re.
  // A meglévő hívási konvenció (`__toast_error('msg', { duration: ... })`)
  // megmarad, csak a duration argumentum elveszik (a callback nem kezeli).
  const __toast_error = useCallback(
    (msg: string, _opts?: { duration?: number }) => onToast?.(msg, 'error'),
    [onToast],
  )
  const __toast_success = useCallback(
    (msg: string, _opts?: { duration?: number }) => onToast?.(msg, 'success'),
    [onToast],
  )
  const __toast_info = useCallback(
    (msg: string, _opts?: { duration?: number }) => onToast?.(msg, 'info'),
    [onToast],
  )
  const __toast_warning = useCallback(
    (msg: string, _opts?: { duration?: number }) => onToast?.(msg, 'warning'),
    [onToast],
  )

  const [folderStatus, setFolderStatus] = useState<OblioFolderStatus | null>(null)
  const [files, setFiles] = useState<OblioLocalFile[]>([])
  const [enriched, setEnriched] = useState<EnrichedXml[]>([])
  const [matches, setMatches] = useState<OblioKiadasMatchRow[]>([])
  const [kiadasok, setKiadasok] = useState<OblioMinimalKiadas[]>([])
  const [utolsoLetoltes, setUtolsoLetoltes] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('mind')
  const [matchDialogXml, setMatchDialogXml] = useState<UblInvoiceMeta | null>(null)
  const [matchDialogRelpath, setMatchDialogRelpath] = useState<string | null>(null)
  /** Az ismeretlen formátumú fájlok (NEM zip/xml/pdf) — törlés ajánlott. */
  const [unknownFiles, setUnknownFiles] = useState<OblioLocalFile[]>([])
  /** Duplikált UUID-k: kulcs az UUID, érték a hozzá tartozó fájlnevek listája.
   *  A duplikátumokat csendben takarítjuk a refresh-ben — a `setDuplicateGroups`
   *  hívás megmarad audit-célra, de a `_duplicateGroups`-on jelölünk az unused-
   *  szabály kerüléséhez. */
  const [_duplicateGroups, setDuplicateGroups] = useState<Array<{ uuid: string; fileNames: string[] }>>([])
  void _duplicateGroups
  const [cleaningUp, setCleaningUp] = useState(false)
  /** A nyomtatási központ dialog állapota — egy konkrét XML-re/PDF-re. */
  const [printDialogTarget, setPrintDialogTarget] = useState<EnrichedXml | null>(null)
  /** Egyszer-volt auto-refresh flag — akkor fut, amikor a komponens először
   *  találkozik üzemkész mappa-állapottal. A `keepMounted` miatt a fül
   *  visszahívásakor ezt nem akarjuk újra futtatni. */
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false)
  /** Párosítatlan XML-ek diagnosztikája — a UI-n is megjeleníthető */
  const [unmatchedDiag, setUnmatchedDiag] = useState<UnmatchedXmlDiag[]>([])
  const [diagDialogOpen, setDiagDialogOpen] = useState(false)
  /** A felhasználó által „mellőzött" XML-ek (anaf_uuid) — localStorage-ben
   *  tárolva, hogy a következő szkenelésnél már ne jelenjenek meg. */
  const [dismissedUuids, setDismissedUuids] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('oblio-dismissed-uuids')
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })

  function persistDismissedUuids(next: Set<string>) {
    setDismissedUuids(new Set(next))
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('oblio-dismissed-uuids', JSON.stringify([...next]))
      } catch {
        /* storage quota exceeded — csendben */
      }
    }
  }
  /** Az archívumból újra-feldolgozás folyamatban van-e. */
  const [reprocessing, setReprocessing] = useState(false)
  /** Árva PDF-ek (ha NEM párosulnak XML-lel a fájlnév-gyök alapján) */
  const [orphanPdfs, setOrphanPdfs] = useState<OblioLocalFile[]>([])
  /** A tartalom-alapú párosítás folyamatban van-e (PDF.js elemzés). */
  const [contentMatching, setContentMatching] = useState(false)
  /** Az utolsó tartalom-párosítás eredménye (a UI-n megjelenik). */
  const [contentMatchResults, setContentMatchResults] = useState<ContentMatchResult[]>([])
  /** Az utolsó frissítés rendszerüzenete — duplikátum-takarítás eredménye. */
  const [systemMessage, setSystemMessage] = useState<{
    kind: 'duplicate-cleanup'
    deletedCount: number
    groupCount: number
  } | null>(null)
  /** A wizard nyitva van-e. */
  const [wizardOpen, setWizardOpen] = useState(false)

  // ─── 1. Folder status + DB load (kezdeti) ───
  const loadFolderStatus = useCallback(async () => {
    const st = await fileSystem.getFolderStatus(congregationSlug)
    setFolderStatus(st)
    return st
  }, [congregationSlug])

  const loadDbData = useCallback(async () => {
    const res = await onLoadMatchesAndKiadasok(currentYear)
    if (res.error) {
      __toast_error(`DB lekérés: ${res.error}`)
      return { matches: [], kiadasok: [] }
    }
    setMatches(res.matches ?? [])
    setKiadasok(res.kiadasok ?? [])
    setUtolsoLetoltes(res.utolsoLetoltes ?? null)
    return { matches: res.matches ?? [], kiadasok: res.kiadasok ?? [] }
  }, [currentYear])

  // ─── Inicializálás ───
  useEffect(() => {
    void Promise.all([loadFolderStatus(), loadDbData()])
  }, [loadFolderStatus, loadDbData])

  /** A UI-n megjelenített szűrt diagnosztika — a felhasználó által „mellőzött"
   *  XML-eket kihagyjuk. A dismissed listát localStorage-ban tároljuk. */
  const filteredDiag = useMemo(() => {
    return unmatchedDiag.filter((d) => !d.xmlAnafUuid || !dismissedUuids.has(d.xmlAnafUuid))
  }, [unmatchedDiag, dismissedUuids])

  // Auto-refresh: ha a mappa üzemkész és van permission, automatikusan
  // lefuttatjuk az első frissítést. Csak EGYSZER, hogy ne legyen loop.
  useEffect(() => {
    if (
      !hasAutoRefreshed &&
      folderStatus?.ellenorzesDirReady &&
      folderStatus?.hasPermission &&
      enriched.length === 0 &&
      !refreshing
    ) {
      setHasAutoRefreshed(true)
      void handleRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderStatus, hasAutoRefreshed, enriched.length, refreshing])

  // ─── 3. Frissítés: scan → ZIP kibontás → parse → cache → match ───
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      // 3.1 Folder status újra (esetleg permission kérés)
      const st = await loadFolderStatus()
      if (!st.supported) {
        __toast_error('A böngésző nem támogatja a File System Access API-t.')
        return
      }
      if (!st.hasRoot) {
        __toast_error('Először állítsd be a KARTOTEKA helyi mappát.')
        return
      }

      // 3.2 Mappa-handle-ek
      const befogadottDir = await fileSystem.getBefogadottDir(congregationSlug)
      const feldolgozvaDir = await fileSystem.getFeldolgozvaDir(congregationSlug)
      if (!befogadottDir || !feldolgozvaDir) {
        __toast_error('A mappák nem érhetők el. Ellenőrizd a permission-t.')
        return
      }

      // 3.3 ZIP-ek kibontása
      const zipResults = await fileSystem.processAllZipsInFolder(befogadottDir, feldolgozvaDir)
      const totalExtracted = zipResults.reduce(
        (sum, r) => sum + r.extractedXmls.length + r.extractedPdfs.length,
        0,
      )
      if (zipResults.length > 0) {
        const errs = zipResults.filter((r) => r.error)
        if (errs.length > 0) {
          __toast_warning(`${zipResults.length} ZIP feldolgozva, ${errs.length} hiba.`)
        } else if (totalExtracted > 0) {
          __toast_success(`${zipResults.length} ZIP kibontva (${totalExtracted} fájl).`)
        }
      }

      // 3.4 Aktuális fájl-lista
      const allFiles = await fileSystem.listFolderFiles(befogadottDir)
      setFiles(allFiles)

      // 3.4.b Ismeretlen formátumú fájlok detektálása (NEM zip/xml/pdf)
      const otherFiles = allFiles.filter((f) => f.kind === 'other')
      setUnknownFiles(otherFiles)
      if (otherFiles.length > 0) {
        __toast_warning(
          `${otherFiles.length} ismeretlen formátumú fájl van a mappában. ` +
            'A fenti figyelmeztető sávon törölheted őket.',
        )
      }

      // 3.5 XML-ek parse + cache (csak amelyikre nincs cache vagy a fájl változott)
      const xmlsRaw = allFiles.filter((f) => f.kind === 'xml')
      const cong = `cong:${congregationSlug}`
      const parsedXmls: { meta: UblInvoiceMeta; fileName: string; fileLastModified: number; xmlHandle: FileSystemFileHandle }[] = []

      for (const f of xmlsRaw) {
        const fallbackUuid = extractAnafUuidFromFilename(f.name) || f.name
        const cached = await getCachedXml(cong, fallbackUuid)
        if (
          cached &&
          cached.fileName === f.name &&
          cached.fileLastModified === f.lastModified
        ) {
          parsedXmls.push({
            meta: cached.meta,
            fileName: f.name,
            fileLastModified: f.lastModified,
            xmlHandle: f.handle,
          })
          continue
        }
        // Parse
        try {
          const text = await fileSystem.readFileAsText(f.handle)
          const meta = parseUblXml(text, fallbackUuid)
          // Ha a parse-er nem talált anafUuid-t, használjuk a fájlnévből kinyertet
          if (!meta.anafUuid) meta.anafUuid = fallbackUuid
          parsedXmls.push({
            meta,
            fileName: f.name,
            fileLastModified: f.lastModified,
            xmlHandle: f.handle,
          })
          if (meta.anafUuid) {
            await putCachedXml({
              congregationId: cong,
              anafUuid: meta.anafUuid,
              fileName: f.name,
              fileSize: f.size,
              fileLastModified: f.lastModified,
              meta,
            })
          }
        } catch (e) {
          console.warn('XML parse failed:', f.name, e)
        }
      }

      // 3.6 Cache prune (törölt fájlok kitisztítása)
      const actualNames = new Set(xmlsRaw.map((x) => x.name))
      await pruneCacheToActualFiles(cong, actualNames)

      // 3.6.b Duplikátumok detektálása + AUTOMATIKUS takarítás
      // Több XML ugyanazzal az ANAF UUID-val tipikusan azt jelenti, hogy
      // a felhasználó kétszer letöltötte ugyanazt a ZIP-et. Csendben
      // eltávolítjuk a duplikátumokat (csak az ELSŐ XML-t tartjuk meg
      // minden UUID-n), hogy a user 500 tételnél ne kelljen 500-szor
      // kattintgatnia.
      const uuidToFiles = new Map<string, string[]>()
      for (const p of parsedXmls) {
        const uuid = p.meta.anafUuid || p.fileName
        if (!uuidToFiles.has(uuid)) uuidToFiles.set(uuid, [])
        uuidToFiles.get(uuid)!.push(p.fileName)
      }
      const dupFilesToDelete: string[] = []
      let dupGroupCount = 0
      for (const [, names] of uuidToFiles.entries()) {
        if (names.length > 1) {
          dupGroupCount++
          // Az első fájlt megtartjuk, a többit töröljük
          dupFilesToDelete.push(...names.slice(1))
        }
      }
      if (dupFilesToDelete.length > 0) {
        try {
          const res = await fileSystem.removeFilesFromFolder(befogadottDir, dupFilesToDelete)
          if (res.deleted > 0) {
            __toast_success(
              `${res.deleted} duplikált fájl automatikusan eltávolítva ` +
                `(${dupGroupCount} csoport).`,
            )
            // Rendszerüzenet a fülön — addig látható, amíg a felhasználó be nem zárja
            setSystemMessage({
              kind: 'duplicate-cleanup',
              deletedCount: res.deleted,
              groupCount: dupGroupCount,
            })
          }
        } catch (e) {
          console.warn('[Oblio] Duplikátum auto-cleanup hiba:', e)
        }
      }
      // A duplikátum-figyelmeztető sávot tisztítjuk — a takarítás után
      // nincs mit mutatni
      setDuplicateGroups([])

      // Csak az UUID-nként ELSŐ XML kerül feldolgozásra
      const seenUuids = new Set<string>()
      const uniqueParsedXmls = parsedXmls.filter((p) => {
        const uuid = p.meta.anafUuid || p.fileName
        if (seenUuids.has(uuid)) return false
        seenUuids.add(uuid)
        return true
      })

      // 3.7 PDF-ek hozzárendelése — CSAK fájlnév-gyök alapján.
      //
      // Az UUID-alapú párosítás **eltávolítva**, mert az ANAF SPV-ben az XML
      // upload index és a PDF EFI render ID különböző azonosítók, így
      // az UUID-egyezés (ha véletlen lenne is) félrevezető és KEVERT
      // számlákhoz vezet.
      //
      // A fájlnév-gyök párosítás csak akkor sikerül, ha a `processAllZipsInFolder`
      // a kibontás során átnevezte a PDF-et az XML alap nevére (ez csak
      // 1 XML + 1 PDF esetén történik a ZIP-en belül — biztos pár).
      const pdfsByBaseName = new Map<string, FileSystemFileHandle>()
      const pdfFiles = allFiles.filter((f) => f.kind === 'pdf')
      for (const pdf of pdfFiles) {
        const base = normalizeFileBaseName(pdf.name)
        pdfsByBaseName.set(base, pdf.handle)
      }

      // 3.8 Friss DB adatok lekérdezése (a párosítások és a kiadások aktuális listája)
      const { matches: freshMatches, kiadasok: freshKiadasok } = await loadDbData()

      // 3.9 Matcher futtatás (a duplikátumokat már kiszűrtük)
      const xmlsForMatcher: UblInvoiceMeta[] = uniqueParsedXmls.map((p) => p.meta)
      const kiadasokForMatcher: MinimalKiadas[] = freshKiadasok.map((k) => ({
        id: k.id,
        datum: k.datum,
        osszeg: k.osszeg,
        kedvezmenyzett: k.kedvezmenyzett,
        atvevo: k.atvevo,
        kedvezmenyezett_cui: k.kedvezmenyezett_cui,
      }))
      const existingMatches: ExistingMatch[] = freshMatches.map((m) => ({
        kiadasId: m.kiadas_id,
        anafUuid: m.anaf_uuid,
      }))
      const { xmlResults, unmatchedDiag } = matchXmlsToKiadas(
        xmlsForMatcher,
        kiadasokForMatcher,
        existingMatches,
      )

      // 3.10 A nagy biztonságú auto-match-eket perzisztáljuk a DB-be:
      //   - auto_cui (high) — CUI egyezés + összeg + dátum
      //   - auto_name_amount_date (high) — substring név (pl. "Electrica" benne
      //     van "Societatea Electrica Furnizare"-ban) + összeg + dátum
      // A medium/low konfidens match-eket NEM perzisztáljuk — azokat a
      // felhasználónak kell megerősítenie a kézi match dialog-ban.
      const toPersist = xmlResults
        .filter(
          (r) =>
            r.confidence === 'high' &&
            r.kiadasId !== null &&
            (r.method === 'auto_cui' || r.method === 'auto_name_amount_date') &&
            !existingMatches.find((e) => e.anafUuid === r.anafUuid),
        )
        .map((r) => {
          const xml = uniqueParsedXmls.find((p) => p.meta.anafUuid === r.anafUuid)
          if (!xml) return null
          return {
            kiadasId: r.kiadasId!,
            anafUuid: r.anafUuid,
            supplierCui: xml.meta.supplier.cui,
            supplierName: xml.meta.supplier.name,
            invoiceNumber: xml.meta.invoiceNumber,
            invoiceDate: xml.meta.issueDate,
            invoiceAmount: xml.meta.amounts.brut,
            localFileRelpath: xml.fileName,
            method: r.method as 'auto_cui' | 'auto_name_amount_date',
            confidence: 'high' as const,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (toPersist.length > 0) {
        const persistRes = await onBulkSaveMatches(toPersist)
        if (persistRes.errors.length > 0) {
          __toast_warning(`${persistRes.saved} auto-match mentve, ${persistRes.errors.length} hiba.`)
        }
      }

      // Diagnosztikai összefoglaló — XML ↔ kiadás párosítás eredménye
      const matchedXmlCount = xmlResults.filter((r) => r.kiadasId !== null).length
      const unmatchedXmlCount = xmlResults.filter((r) => r.kiadasId === null).length
      // Mentjük a diagnosztikát a UI-hoz — a `dismissedUuids`-t itt szándékosan
      // NEM alkalmazzuk, a filter a rendereléskor történik (useMemo). Így ha a
      // felhasználó elrejt mellőzést (clearDismissed), az újra megjelenik.
      setUnmatchedDiag(unmatchedDiag)
      if (unmatchedXmlCount > 0 && freshKiadasok.length > 0) {
        __toast_info(
          `Párosítás: ${matchedXmlCount}/${xmlResults.length} XML összerendelve kiadáshoz. ${unmatchedXmlCount} maradt párosítatlan (${freshKiadasok.length} kiadásból). Kattints a „Párosítás-diagnosztika" gombra a részletekért.`,
          { duration: 10000 },
        )
      } else if (matchedXmlCount > 0) {
        __toast_success(
          `${matchedXmlCount}/${xmlResults.length} XML automatikusan párosítva kiadáshoz.`,
        )
      }

      // 3.11 Enriched lista összeállítása (a UI-hoz)
      const xmlResultByUuid = new Map(xmlResults.map((r) => [r.anafUuid, r]))
      const kiadasById = new Map(freshKiadasok.map((k) => [k.id, k]))

      let pdfMatchByBaseName = 0
      const built: EnrichedXml[] = uniqueParsedXmls.map((p) => {
        const match = xmlResultByUuid.get(p.meta.anafUuid || '') || {
          anafUuid: p.meta.anafUuid || '',
          kiadasId: null,
          method: 'none' as const,
          confidence: 'none' as const,
          explanation: '—',
        }
        // PDF párosítás — CSAK fájlnév-gyök alapján (a kibontás során
        // 1+1 ZIP-ekben átnevezett PDF-ek)
        const xmlBase = normalizeFileBaseName(p.fileName)
        const pdfHandle: FileSystemFileHandle | null = pdfsByBaseName.get(xmlBase) || null
        if (pdfHandle) pdfMatchByBaseName++
        return {
          meta: p.meta,
          fileName: p.fileName,
          fileLastModified: p.fileLastModified,
          match,
          kiadas: match.kiadasId !== null ? kiadasById.get(match.kiadasId) || null : null,
          xmlHandle: p.xmlHandle,
          pdfHandle,
        }
      })

      setEnriched(built)

      // Árva PDF-ek (nem rendeltek hozzá XML-hez) gyűjtése — külön szekcióban mutatjuk
      const usedPdfNames = new Set(
        built
          .map((b) => b.pdfHandle?.name)
          .filter((n): n is string => typeof n === 'string'),
      )
      setOrphanPdfs(pdfFiles.filter((p) => !usedPdfNames.has(p.handle.name)))

      // Diagnosztikai toast + console log
      if (pdfFiles.length > 0) {
        const orphanPdfs = pdfFiles.length - pdfMatchByBaseName
        const pdfBaseNames = pdfFiles.map((p) => normalizeFileBaseName(p.name))
        const xmlBaseNames = uniqueParsedXmls.map((p) => normalizeFileBaseName(p.fileName))
        console.log('[Oblio ellenőrzés] PDF párosítás (csak fájlnév-gyök):', {
          pdfDb: pdfFiles.length,
          xmlDb: uniqueParsedXmls.length,
          matched: pdfMatchByBaseName,
          orphan: orphanPdfs,
          pdfBaseNames,
          xmlBaseNames,
        })

        if (orphanPdfs > 0) {
          __toast_info(
            `${pdfFiles.length} PDF: ${pdfMatchByBaseName} biztos pár, ${orphanPdfs} árva PDF (a ZIP-ben több XML/PDF volt — automatikus párosítás kihagyva, hogy ne keveredjenek a számlák).`,
            { duration: 8000 },
          )
        } else if (pdfMatchByBaseName > 0) {
          __toast_success(`${pdfFiles.length} PDF mind biztosan párosítva.`)
        }
      } else if (uniqueParsedXmls.length > 0) {
        __toast_info(
          `${uniqueParsedXmls.length} XML feldolgozva, PDF nincs a mappában.`,
          { duration: 5000 },
        )
      }

      // 3.12 Utolsó letöltés rögzítése — CSAK ha ténylegesen új fájl érkezett
      //   - ZIP feldolgozás történt (zipResults.length > 0), VAGY
      //   - a jelenlegi fájlszám nagyobb, mint a korábban tárolt
      // A timestamp a legfrissebb XML tényleges lastModified értéke (nem most()),
      // így pontosan azt mutatja, amikor a ZIP/XML érkezett a gépre.
      const previousXmlCount = files.filter((f) => f.kind === 'xml').length
      const currentXmlCount = allFiles.filter((f) => f.kind === 'xml').length
      const hadNewFiles = zipResults.length > 0 || currentXmlCount > previousXmlCount

      if (hadNewFiles) {
        const xmlFilesNow = allFiles.filter((f) => f.kind === 'xml')
        const latestMtime = xmlFilesNow.length > 0
          ? Math.max(...xmlFilesNow.map((f) => f.lastModified))
          : Date.now()
        const latestIso = new Date(latestMtime).toISOString()
        const dlRes = await onRecordDownloadNow(latestIso)
        if (!dlRes.error) {
          setUtolsoLetoltes(latestIso)
        }
      }

      __toast_success(`Frissítve: ${built.length} XML, ${built.filter((b) => b.match.kiadasId !== null).length} párosítva.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      __toast_error(`Frissítés hiba: ${msg}`)
    } finally {
      setRefreshing(false)
    }
  }, [congregationSlug, currentYear, loadFolderStatus, loadDbData])

  // ─── Statisztika ───
  const stats = useMemo(() => {
    const total = enriched.length
    const matched = enriched.filter((e) => e.match.kiadasId !== null).length
    const unmatched = total - matched
    const withPdf = enriched.filter((e) => e.pdfHandle !== null).length
    const kiadasokWithSpv = new Set(
      matches.filter((m) => kiadasok.find((k) => k.id === m.kiadas_id)).map((m) => m.kiadas_id),
    )
    const kiadasWithoutSpv = kiadasok.filter((k) => !kiadasokWithSpv.has(k.id)).length
    return { total, matched, unmatched, withPdf, kiadasWithoutSpv }
  }, [enriched, matches, kiadasok])

  // ─── Szűrt lista ───
  const filtered = useMemo(() => {
    if (filter === 'parositott') return enriched.filter((e) => e.match.kiadasId !== null)
    if (filter === 'hianyzo') return enriched.filter((e) => e.match.kiadasId === null)
    return enriched
  }, [enriched, filter])

  // ─── Sortálás ─── (default: dátum desc — legfrissebb felül)
  const [sortBy, setSortBy] = useState<SortBy>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir(col === 'datum' ? 'desc' : 'asc')
    }
  }

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'datum':
          cmp = (a.meta.issueDate || '').localeCompare(b.meta.issueDate || '')
          break
        case 'beszallito':
          cmp = (a.meta.supplier.name || '').localeCompare(
            b.meta.supplier.name || '',
            'hu',
          )
          break
        case 'szamlaszam':
          cmp = (a.meta.invoiceNumber || '').localeCompare(
            b.meta.invoiceNumber || '',
            'hu',
            { numeric: true },
          )
          break
        case 'brutto':
          cmp = (a.meta.amounts.brut ?? 0) - (b.meta.amounts.brut ?? 0)
          break
        case 'match': {
          // Először a párosítottak, majd hiányzók
          const aHas = a.match.kiadasId !== null ? 1 : 0
          const bHas = b.match.kiadasId !== null ? 1 : 0
          cmp = aHas - bHas
          if (cmp === 0) {
            cmp = (a.kiadas?.kedvezmenyzett || a.kiadas?.atvevo || '').localeCompare(
              b.kiadas?.kedvezmenyzett || b.kiadas?.atvevo || '',
              'hu',
            )
          }
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortBy, sortDir])

  // ─── Akciók ───
  async function handleOpenXml(e: EnrichedXml) {
    try {
      await fileSystem.openLocalFileInBrowser(e.xmlHandle)
    } catch (err) {
      __toast_error(`Nem nyitható meg: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function handleOpenPrintCenter(e: EnrichedXml) {
    setPrintDialogTarget(e)
  }

  function handleManualMatch(e: EnrichedXml) {
    setMatchDialogXml(e.meta)
    setMatchDialogRelpath(e.fileName)
  }

  /**
   * Az ismeretlen formátumú fájlok törlése a `befogadott/` mappából
   * (a felhasználó megerősítésével).
   */
  async function handleDeleteUnknownFiles() {
    if (unknownFiles.length === 0) return
    const sample = unknownFiles
      .slice(0, 5)
      .map((f) => f.name)
      .join(', ')
    const more = unknownFiles.length > 5 ? ` (+${unknownFiles.length - 5} további)` : ''
    const ok = window.confirm(
      `Biztosan törlöd a következő ${unknownFiles.length} ismeretlen formátumú fájlt?\n\n${sample}${more}\n\n` +
        'Csak Oblio Wallet ZIP, vagy abból kibontott XML/PDF fájlok érvényesek.',
    )
    if (!ok) return

    setCleaningUp(true)
    try {
      const dir = await fileSystem.getBefogadottDir(congregationSlug)
      if (!dir) {
        __toast_error('A mappa nem érhető el.')
        return
      }
      const res = await fileSystem.removeFilesFromFolder(
        dir,
        unknownFiles.map((f) => f.name),
      )
      if (res.errors.length > 0) {
        __toast_warning(`${res.deleted} fájl törölve, ${res.errors.length} hiba.`)
      } else {
        __toast_success(`${res.deleted} ismeretlen fájl törölve.`)
      }
      setUnknownFiles([])
      // Lefuttatjuk a frissítést, hogy a UI is frissüljön
      void handleRefresh()
    } finally {
      setCleaningUp(false)
    }
  }

  /**
   * Árva PDF-ek párosítása — KÉT lépésben:
   *
   *  1. **Fájlnév-minta alapú** (deterministic, gyors) — az ANAF SPV
   *     konzisztens mintát használ:
   *       XML: `<beszállító>_<sorozat>_<UUID>.xml`
   *       PDF: `<UUID>_<sorozat>.pdf`
   *     Ha az XML utolsó 2 része egyezik a PDF 2 részével (fordított
   *     sorrendben), biztos pár.
   *
   *  2. **PDF tartalom-elemzés** (csak ha a fájlnév nem stimmel) —
   *     PDF.js-szel kinyerjük a CUI-t, összeget, és XML-lel összevetjük.
   *
   * Sikeres párosítás esetén a PDF-et fizikailag átnevezzük az XML alap
   * nevére → a következő frissítésnél már fájlnév-gyök alapján párosul.
   */
  async function handleContentMatchOrphanPdfs() {
    if (orphanPdfs.length === 0) {
      __toast_info('Nincsenek árva PDF-ek a feldolgozáshoz.')
      return
    }
    setContentMatching(true)
    setContentMatchResults([])
    try {
      const dir = await fileSystem.getBefogadottDir(congregationSlug)
      if (!dir) {
        __toast_error('A mappa nem érhető el.')
        return
      }

      const xmlFileNames = enriched.map((e) => e.fileName)
      const xmlsForContentMatching = enriched.map((e) => ({
        fileName: e.fileName,
        meta: e.meta,
      }))

      // ───────── 1. FÁJLNÉV-MINTA párosítás (deterministic) ─────────
      __toast_info(`Fájlnév-minta párosítás indul (${orphanPdfs.length} fájl)…`)
      const nameResults: NameMatchResult[] = batchMatchPdfsToXmlsByName(
        orphanPdfs.map((p) => p.name),
        xmlFileNames,
      )

      let renamedByName = 0
      let failed = 0
      const stillOrphan: typeof orphanPdfs = []
      for (let i = 0; i < orphanPdfs.length; i++) {
        const pdf = orphanPdfs[i]
        const r = nameResults[i]
        if (r.xmlFileName && (r.confidence === 'high' || r.confidence === 'medium')) {
          const xmlBase = r.xmlFileName.replace(/\.xml$/i, '')
          const newPdfName = `${xmlBase}.pdf`
          const renRes = await fileSystem.renameFileInFolder(dir, pdf.name, newPdfName)
          if (renRes.success) {
            renamedByName++
          } else {
            failed++
            console.warn('[Oblio] Átnevezés hiba:', pdf.name, renRes.error)
            stillOrphan.push(pdf)
          }
        } else {
          stillOrphan.push(pdf)
        }
      }

      console.log('[Oblio ellenőrzés] 1. lépés (fájlnév-minta):', nameResults)

      // ───────── 2. TARTALOM-elemzés (csak a megmaradt árvákon) ─────────
      let contentResults: ContentMatchResult[] = []
      let renamedByContent = 0
      if (stillOrphan.length > 0) {
        __toast_info(
          `Fájlnév-mintával ${renamedByName} pár létrejött. Tartalom-elemzés a maradék ${stillOrphan.length} PDF-en…`,
        )
        const orphanFiles = stillOrphan.map((p) => ({ name: p.name, handle: p.handle }))
        contentResults = await batchMatchPdfsToXmls(orphanFiles, xmlsForContentMatching)
        setContentMatchResults(contentResults)

        for (const r of contentResults) {
          if (r.xmlFileName && r.confidence !== 'low') {
            const xmlBase = r.xmlFileName.replace(/\.xml$/i, '')
            const newPdfName = `${xmlBase}.pdf`
            const renRes = await fileSystem.renameFileInFolder(dir, r.pdfName, newPdfName)
            if (renRes.success) {
              renamedByContent++
            } else {
              failed++
              console.warn('[Oblio] Tartalom-átnevezés hiba:', r.pdfName, renRes.error)
            }
          }
        }
        console.log('[Oblio ellenőrzés] 2. lépés (tartalom):', contentResults)
      }

      const lowMatches = contentResults.filter((r) => r.confidence === 'low').length
      const noMatches = contentResults.filter((r) => r.confidence === 'none').length
      const totalRenamed = renamedByName + renamedByContent

      let msg = `${totalRenamed} PDF párosítva (${renamedByName} fájlnév + ${renamedByContent} tartalom)`
      if (lowMatches > 0) msg += ` · ${lowMatches} gyenge egyezés`
      if (noMatches > 0) msg += ` · ${noMatches} maradt árva`
      if (failed > 0) msg += ` · ${failed} hiba`
      __toast_success(msg, { duration: 8000 })

      if (totalRenamed > 0) {
        setHasAutoRefreshed(false)
        void handleRefresh()
      }
    } finally {
      setContentMatching(false)
    }
  }

  /**
   * Az archív ZIP-ekből újra-feldolgozás. Akkor használja a felhasználó, ha
   * a régi (rossz névvel kibontott) PDF-ek nem jelennek meg, és az új
   * párosító logikával szeretné újra-bontani őket.
   */
  async function handleReprocessArchive() {
    const ok = window.confirm(
      'Újra-feldolgozás az archívumból:\n\n' +
        '1. Töröljük az ÖSSZES kibontott XML-t és PDF-et a `befogadott/` mappából\n' +
        '2. A `feldolgozva-zip/` archívumából minden ZIP-et visszamásolunk\n' +
        '3. Újra-bontjuk az új párosító logikával (a PDF-ek átnevezve az XML alap nevére)\n\n' +
        'Az archívumban a ZIP-ek megmaradnak — duplán biztos vagy. Folytatod?',
    )
    if (!ok) return

    setReprocessing(true)
    try {
      const befogadottDir = await fileSystem.getBefogadottDir(congregationSlug)
      const feldolgozvaDir = await fileSystem.getFeldolgozvaDir(congregationSlug)
      if (!befogadottDir || !feldolgozvaDir) {
        __toast_error('A mappák nem elérhetőek.')
        return
      }
      const res = await fileSystem.reprocessZipsFromArchive(befogadottDir, feldolgozvaDir)
      if (res.error) {
        __toast_error(`Újra-feldolgozás hiba: ${res.error}`)
        return
      }
      __toast_success(
        `${res.copiedZips} ZIP újra-feldolgozva. ` +
          `Régi: ${res.deletedXmls} XML + ${res.deletedPdfs} PDF törölve.`,
      )
      // Lefuttatjuk a fő frissítést a UI állapot frissítéséhez
      setHasAutoRefreshed(false) // hogy a refresh menjen
      void handleRefresh()
    } finally {
      setReprocessing(false)
    }
  }

  async function handleRemoveMatch(matchUuid: string) {
    const dbMatch = matches.find((m) => m.anaf_uuid === matchUuid)
    if (!dbMatch) {
      __toast_error('A párosítás nem található a DB-ben (csak helyileg auto-matched).')
      return
    }
    const ok = window.confirm('Biztosan törlöd a párosítást?')
    if (!ok) return
    const res = await onRemoveMatch(dbMatch.id)
    if (res.error) {
      __toast_error(res.error)
      return
    }
    __toast_success('Párosítás törölve.')
    await loadDbData()
    void handleRefresh()
  }

  // Hány "felső doboz" látható — dinamikus grid oszlopszámhoz
  const _unenteredCount = enriched.filter((e) => e.match.kiadasId === null).length
  const _showFormatGuide = !!folderStatus?.ellenorzesDirReady
  const _showWizardTrigger = _showFormatGuide && _unenteredCount > 0
  const _topBoxCount = 1 + (_showFormatGuide ? 1 : 0) + (_showWizardTrigger ? 1 : 0)
  // A grid XL-en annyi oszlop, ahány doboz van; mobil: 1, tablet: 2 ha van legalább 2
  const _topGridClass =
    _topBoxCount === 3
      ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
      : _topBoxCount === 2
        ? 'grid gap-4 md:grid-cols-2'
        : 'space-y-4'

  return (
    <div className="space-y-4">
      {/* Felső 3 doboz — egy sorban desktopon: Mappa állapot + Formátum-útmutató + Bevezetés-indító */}
      <div className={_topGridClass}>
        {/* Mappa állapot */}
        {folderStatus ? (
          <OblioEllenorzesFolderCard
            status={folderStatus}
            utolsoLetoltes={utolsoLetoltes}
            fileCount={files.length}
            isRefreshing={refreshing}
            onRefresh={handleRefresh}
            onOpenSettings={() => {
              onOpenSettings()
            }}
            onReprocessArchive={handleReprocessArchive}
            isReprocessing={reprocessing}
            congregationSlug={congregationSlug}
          />
        ) : (
          <div className="card-raised p-5 text-sm text-slate-500">
            Mappa állapot betöltése…
          </div>
        )}

        {/* Letöltési útmutató (kibontható) — mindig látható, hogy a lelkész
            biztos legyen, mit kell letölteni az Oblio-ból. */}
        {_showFormatGuide && <OblioFormatGuideCard />}

        {/* Bevezetés-indító — csak ha vannak be nem vezetett számlák */}
        {_showWizardTrigger && (
          <div className="card-raised border border-amber-200 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                <PlusCircle className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-amber-900">
                  {_unenteredCount} befogadott
                  számla még nincs bevezetve a könyvelésbe
                </p>
                <p className="text-sm text-slate-700 mt-0.5 leading-snug">
                  A KARTOTEKA végigvezet egy wizardon (kronológiai sorrendben),
                  ahol kiválasztható minden számlához a megfelelő költségvetési
                  kategória.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm w-full sm:w-auto sm:self-end"
            >
              <PlusCircle className="mr-1.5 size-4" /> Bevezetés indítása
            </button>
          </div>
        )}
      </div>

      {/* Rendszerüzenet — duplikátum-takarítás eredménye (dismissible) */}
      {systemMessage?.kind === 'duplicate-cleanup' && (
        <div className="card-raised border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Info className="size-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-emerald-900 text-sm">
              Duplikátum-takarítás eredménye
            </p>
            <p className="text-sm text-slate-700 mt-0.5">
              <strong>{systemMessage.deletedCount}</strong> duplikált fájl került
              eltávolításra ({systemMessage.groupCount} csoportból). A KARTOTEKA
              csoportonként az első XML-t megtartotta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSystemMessage(null)}
            className="shrink-0 inline-flex size-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100"
            title="Bezárás"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Árva PDF-ek — automatikus tartalom-elemzéssel megpróbáljuk párosítani */}
      {folderStatus?.ellenorzesDirReady && orphanPdfs.length > 0 && (
        <div className="card-raised border border-rose-200 bg-rose-50/40 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
            <div className="flex items-start gap-3 flex-1">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                📕
              </span>
              <div>
                <p className="font-semibold text-rose-900 text-sm">
                  {orphanPdfs.length} árva PDF — fájlnév alapján nem párosítva
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Indítsd el a <strong>tartalom-elemzést</strong> — a KARTOTEKA
                  PDF.js-szel kinyeri a CUI-t, összeget, számlaszámot a PDF
                  szövegéből, és automatikusan társítja a megfelelő XML-lel
                  (sikeres párosítás után fizikailag átnevezi a PDF-et).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleContentMatchOrphanPdfs}
              disabled={contentMatching}
              className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shrink-0 shadow-sm"
            >
              {contentMatching ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Elemzés…
                </>
              ) : (
                <>🔍 Tartalom-elemzés indítása</>
              )}
            </button>
          </div>

          {/* Eredmények */}
          {contentMatchResults.length > 0 && (
            <div className="space-y-1.5 mb-3 max-h-72 overflow-y-auto">
              {contentMatchResults.map((r) => {
                const colorMap = {
                  high: 'border-emerald-200 bg-emerald-50',
                  medium: 'border-amber-200 bg-amber-50',
                  low: 'border-orange-200 bg-orange-50',
                  none: 'border-slate-200 bg-white',
                }
                return (
                  <div
                    key={r.pdfName}
                    className={`rounded-xl border px-3 py-2 text-xs ${colorMap[r.confidence]}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-slate-700 break-all flex-1">
                        📕 {r.pdfName}
                      </span>
                      <span className="shrink-0 font-semibold">
                        {r.confidence === 'high'
                          ? '✓ Biztos'
                          : r.confidence === 'medium'
                            ? '⚠️ Közepes'
                            : r.confidence === 'low'
                              ? '? Gyenge'
                              : '✗ Nincs'}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.reason}</p>
                    {r.xmlFileName && (
                      <p className="mt-0.5 text-emerald-700 font-mono">
                        → {r.xmlFileName}
                      </p>
                    )}
                    {r.pdfMeta.cui && (
                      <p className="mt-0.5 text-slate-500">
                        PDF kinyert: CUI {r.pdfMeta.cui}
                        {r.pdfMeta.amount !== null
                          ? ` · ${r.pdfMeta.amount.toFixed(2)} RON`
                          : ''}
                        {r.pdfMeta.invoiceNumber ? ` · ${r.pdfMeta.invoiceNumber}` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Eredeti listázás (manuális megnyitás opció) */}
          {contentMatchResults.length === 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {orphanPdfs.map((pdf) => (
                <div
                  key={pdf.name}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-rose-100 bg-white/70 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-rose-900 break-all">📕 {pdf.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {(pdf.size / 1024).toFixed(1)} KB ·{' '}
                      {new Date(pdf.lastModified).toLocaleDateString('hu-HU')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileSystem.openLocalFileInBrowser(pdf.handle)}
                    className="inline-flex items-center justify-center whitespace-nowrap h-8 px-3 text-xs font-medium border bg-white rounded-lg transition-colors shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    Megnyitás új ablakban
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500">
            💡 <strong>Tipp</strong>: a tartalom-elemzés a PDF szövegéből kinyeri a
            beszállító CUI-ját és az összeget — ezek alapján <strong>automatikusan
            párosítja</strong> a megfelelő XML-lel és átnevezi a fájlt. Ha az
            elemzés után még mindig vannak árva PDF-ek, valószínűleg nincs hozzájuk
            tartozó XML — ezekre a következő frissítés után megjelenik egy &bdquo;Új
            kiadás bevezetés a PDF-ből&rdquo; gomb.
          </p>
        </div>
      )}

      {/* Párosítás-diagnosztika gomb — ha vannak párosítatlan XML-ek,
          rákattintva részletes nézet az összes jelölttel. A „mellőzött"
          XML-eket kiszűrjük, így a diagnosztika eltűnik, ha minden el van
          intézve (akár párosítva, akár mellőzve). */}
      {folderStatus?.ellenorzesDirReady && filteredDiag.length > 0 && (
        <div className="card-raised border border-orange-200 bg-orange-50/40 p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Info className="size-4 text-orange-600 shrink-0" />
            <p className="text-sm text-slate-700">
              <strong>{filteredDiag.length} párosítatlan XML</strong> — nézd meg,
              miért, és kézzel rendelheted hozzá a megfelelő kiadáshoz.
            </p>
            {dismissedUuids.size > 0 && (
              <button
                type="button"
                onClick={() => persistDismissedUuids(new Set())}
                className="text-xs text-slate-500 underline hover:text-slate-700"
                title="A mellőzött XML-ek újra megjelennek a diagnosztikában"
              >
                ({dismissedUuids.size} mellőzött visszaállítása)
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDiagDialogOpen(true)}
            className="inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-xl transition-colors shrink-0 border-orange-300 text-orange-800 hover:bg-orange-100"
          >
            🔍 Párosítás-diagnosztika
          </button>
        </div>
      )}

      {/* A Wizard trigger áthelyezve a felső 3-doboz sorba */}

      {/* Figyelmeztető sáv — csak az ismeretlen formátumú fájlokra.
          A duplikátumok automatikusan, csendben törlődnek a refresh végén. */}
      {folderStatus?.ellenorzesDirReady && (
        <OblioEllenorzesWarnings
          unknownFiles={unknownFiles}
          cleaningUp={cleaningUp}
          onDeleteUnknownFiles={handleDeleteUnknownFiles}
        />
      )}

      {/* Statisztikai sáv */}
      {folderStatus?.ellenorzesDirReady && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            color="cyan"
            label="Helyi XML összesen"
            value={stats.total}
            hint="Az Oblio mappában"
          />
          <StatCard
            color="emerald"
            label="Párosított"
            value={stats.matched}
            hint="Kiadáshoz rendelve"
          />
          <StatCard
            color="amber"
            label="Hiányzó kiadás"
            value={stats.unmatched}
            hint="SPV-ben van, KARTOTEKA-ban nincs"
          />
          <StatCard
            color="red"
            label="Nincs SPV-ben"
            value={stats.kiadasWithoutSpv}
            hint="Kifizetés előtt ellenőrizd!"
          />
        </div>
      )}

      {/* Szűrő */}
      {folderStatus?.ellenorzesDirReady && enriched.length > 0 && (
        <div className="card-raised flex flex-wrap items-center gap-2 p-3">
          <Filter className="size-4 text-slate-400" />
          <FilterChip active={filter === 'mind'} onClick={() => setFilter('mind')}>
            Mind ({enriched.length})
          </FilterChip>
          <FilterChip active={filter === 'parositott'} onClick={() => setFilter('parositott')}>
            Párosított ({stats.matched})
          </FilterChip>
          <FilterChip active={filter === 'hianyzo'} onClick={() => setFilter('hianyzo')}>
            Hiányzó match ({stats.unmatched})
          </FilterChip>
        </div>
      )}

      {/* Táblázat */}
      {folderStatus?.ellenorzesDirReady && (
        <>
          {sortedFiltered.length === 0 ? (
            <EmptyState
              hasAnyXml={enriched.length > 0}
              filter={filter}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="card-raised overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80">
                    <tr>
                      <SortableTh col="datum" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('datum')}>
                        Dátum
                      </SortableTh>
                      <SortableTh col="beszallito" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('beszallito')}>
                        Beszállító
                      </SortableTh>
                      <SortableTh col="szamlaszam" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('szamlaszam')} className="hidden md:table-cell">
                        Számlaszám
                      </SortableTh>
                      <SortableTh col="brutto" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('brutto')} align="right">
                        Bruttó
                      </SortableTh>
                      <SortableTh col="match" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('match')}>
                        Kiadás
                      </SortableTh>
                      <th className="p-3 text-right text-xs font-medium text-slate-500">Akciók</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedFiltered.map((e) => (
                      <Row
                        key={`${e.meta.anafUuid || 'unknown'}::${e.fileName}`}
                        e={e}
                        onOpenXml={() => handleOpenXml(e)}
                        onOpenPrintCenter={() => handleOpenPrintCenter(e)}
                        onManualMatch={() => handleManualMatch(e)}
                        onRemoveMatch={() => handleRemoveMatch(e.match.anafUuid)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Manuális match dialog (slot — a Dialog shell wrapper-ben) */}
      {manualMatchDialogSlot?.({
        open: matchDialogXml !== null,
        onOpenChange: (open) => {
          if (!open) {
            setMatchDialogXml(null)
            setMatchDialogRelpath(null)
          }
        },
        xml: matchDialogXml,
        fileRelpath: matchDialogRelpath,
        kiadasok,
        onSaved: async () => {
          await loadDbData()
          void handleRefresh()
        },
      })}

      {/* Nyomtatási központ dialog (slot) */}
      {invoicePrintDialogSlot?.({
        open: printDialogTarget !== null,
        onOpenChange: (open) => {
          if (!open) setPrintDialogTarget(null)
        },
        meta: printDialogTarget?.meta ?? null,
        pdfHandle: printDialogTarget?.pdfHandle ?? null,
        fileName: printDialogTarget?.fileName ?? '',
        congregationName,
      })}

      {/* Párosítás-diagnosztika dialog (slot) */}
      {matchDiagnosticDialogSlot?.({
        open: diagDialogOpen,
        onOpenChange: setDiagDialogOpen,
        diagnostics: filteredDiag,
        onManualMatch: (anafUuid) => {
          const enrichedItem = enriched.find((e) => e.meta.anafUuid === anafUuid)
          if (enrichedItem) {
            setMatchDialogXml(enrichedItem.meta)
            setMatchDialogRelpath(enrichedItem.fileName)
            setDiagDialogOpen(false)
          }
        },
        onAutoMatch: async (anafUuid, kiadasId) => {
          const enrichedItem = enriched.find((e) => e.meta.anafUuid === anafUuid)
          if (!enrichedItem) return { error: 'Az XML már nem található.' }
          const meta = enrichedItem.meta
          const res = await onSaveSingleMatch({
            kiadasId,
            anafUuid,
            supplierCui: meta.supplier.cui,
            supplierName: meta.supplier.name,
            invoiceNumber: meta.invoiceNumber,
            invoiceDate: meta.issueDate,
            invoiceAmount: meta.amounts.brut,
            localFileRelpath: enrichedItem.fileName,
            method: 'manual',
            confidence: 'medium',
          })
          if (res.success) {
            await loadDbData()
            setHasAutoRefreshed(false)
            void handleRefresh()
          }
          return { success: res.success, error: res.error }
        },
        onDismiss: (anafUuid) => {
          const next = new Set(dismissedUuids)
          next.add(anafUuid)
          persistDismissedUuids(next)
        },
      })}

      {/* Kiadás-bevezetés wizard (slot) */}
      {kiadasWizardDialogSlot?.({
        open: wizardOpen,
        onOpenChange: setWizardOpen,
        xmls: enriched
          .filter((e) => e.match.kiadasId === null)
          .map((e): WizardXmlItem => ({ meta: e.meta, fileName: e.fileName })),
        onCompleted: async () => {
          await loadDbData()
          setHasAutoRefreshed(false)
          void handleRefresh()
        },
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-komponensek
// ─────────────────────────────────────────────────────────────

function Row({
  e,
  onOpenXml,
  onOpenPrintCenter,
  onManualMatch,
  onRemoveMatch,
}: {
  e: EnrichedXml
  onOpenXml: () => void
  onOpenPrintCenter: () => void
  onManualMatch: () => void
  onRemoveMatch: () => void
}) {
  return (
    <tr className="hover:bg-cyan-50/40">
      <td className="p-3 text-slate-600 text-xs whitespace-nowrap">
        {e.meta.issueDate || '—'}
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-slate-800 truncate max-w-[240px]">
            {e.meta.supplier.name || '—'}
          </p>
          {e.pdfHandle && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
              title="Helyi PDF a mappában"
            >
              📕 PDF
            </span>
          )}
        </div>
        {e.meta.supplier.cui && (
          <p className="text-xs text-slate-400 font-mono">CUI: {e.meta.supplier.cui}</p>
        )}
      </td>
      <td className="p-3 hidden md:table-cell text-xs text-slate-500 font-mono">
        {e.meta.invoiceNumber || '—'}
      </td>
      <td className="p-3 text-right font-semibold text-slate-800 whitespace-nowrap">
        {e.meta.amounts.brut !== null
          ? `${e.meta.amounts.brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${e.meta.currency || 'RON'}`
          : '—'}
      </td>
      <td className="p-3">
        <MatchBadge e={e} />
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-1">
          {/* Nyomtatási központ — egységes belépési pont (mint a leltárnál):
              - ha van helyi PDF, közvetlenül a hivatalos ANAF-PDF-et mutatja
              - ha nincs PDF, a generált kétnyelvű HTML összefoglalót */}
          <ActionBtn
            title={
              e.pdfHandle
                ? 'Nyomtatási központ — eredeti ANAF PDF'
                : 'Nyomtatási központ — generált HTML összefoglaló'
            }
            onClick={onOpenPrintCenter}
            color={
              e.pdfHandle
                ? 'text-rose-600 hover:bg-rose-50'
                : 'text-blue-600 hover:bg-blue-50'
            }
          >
            <Printer className="size-4" />
          </ActionBtn>
          {/* XML megnyitás (raw) — csak gyors fejlesztői/audit eszköz */}
          <ActionBtn
            title="Helyi XML megnyitása új ablakban (raw)"
            onClick={onOpenXml}
            color="text-slate-500 hover:bg-slate-100"
          >
            <ExternalLink className="size-4" />
          </ActionBtn>
          {/* Match akció */}
          {e.match.kiadasId === null ? (
            <ActionBtn
              title="Kézi párosítás kiadáshoz"
              onClick={onManualMatch}
              color="text-cyan-600 hover:bg-cyan-50"
            >
              <Link2 className="size-4" />
            </ActionBtn>
          ) : (
            <ActionBtn
              title="Párosítás eltávolítása"
              onClick={onRemoveMatch}
              color="text-red-500 hover:bg-red-50"
            >
              <Link2Off className="size-4" />
            </ActionBtn>
          )}
        </div>
      </td>
    </tr>
  )
}

function MatchBadge({ e }: { e: EnrichedXml }) {
  if (e.match.kiadasId === null) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        <CircleAlert className="size-3 mr-1" />
        Nincs kiadás
      </span>
    )
  }

  const k = e.kiadas
  const partner = k ? k.kedvezmenyzett || k.atvevo || `#${k.id}` : `#${e.match.kiadasId}`
  const colors = {
    high: 'bg-emerald-100 text-emerald-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-orange-100 text-orange-800',
    none: 'bg-slate-100 text-slate-700',
  }
  const methodLabels = {
    auto_cui: 'CUI',
    auto_name_amount_date: 'név+ár',
    manual: 'kézi',
    none: '—',
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[e.match.confidence]}`}>
        <CheckCircle2 className="size-3 mr-1" />
        {partner.substring(0, 24)}
      </span>
      <span
        className="text-[10px] text-slate-400"
        title={e.match.explanation}
      >
        {methodLabels[e.match.method]} · {e.match.confidence === 'high' ? 'biztos' : e.match.confidence === 'medium' ? 'közepes' : 'gyenge'}
      </span>
    </div>
  )
}

function ActionBtn({
  title,
  onClick,
  color,
  children,
}: {
  title: string
  onClick: () => void
  color: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center size-7 rounded-lg ${color} transition-colors text-xs font-semibold`}
    >
      {children}
    </button>
  )
}

function StatCard({
  color,
  label,
  value,
  hint,
}: {
  color: 'cyan' | 'emerald' | 'amber' | 'red'
  label: string
  value: number
  hint: string
}) {
  const palettes = {
    cyan: { gradient: 'from-cyan-500 to-teal-600', text: 'text-cyan-700' },
    emerald: { gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-700' },
    amber: { gradient: 'from-amber-500 to-orange-600', text: 'text-amber-700' },
    red: { gradient: 'from-red-400 to-red-600', text: 'text-red-700' },
  }
  const p = palettes[color]
  return (
    <div className="card-raised p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <div className={`size-2.5 rounded-full bg-gradient-to-br ${p.gradient}`} />
      </div>
      <p className={`text-2xl font-bold mt-1 ${p.text}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  )
}

function SortableTh({
  col,
  sortBy,
  sortDir,
  onClick,
  className,
  align = 'left',
  children,
}: {
  col: SortBy
  sortBy: SortBy
  sortDir: SortDir
  onClick: () => void
  className?: string
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const active = sortBy === col
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'
  return (
    <th
      className={`p-3 text-${align} text-xs font-medium text-slate-500 ${className || ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${active ? 'text-cyan-700 font-semibold' : ''}`}
      >
        {children}
        <span className="text-[10px] opacity-60">{arrow}</span>
      </button>
    </th>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200'
          : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({
  hasAnyXml,
  filter,
  onRefresh,
}: {
  hasAnyXml: boolean
  filter: FilterMode
  onRefresh: () => void
}) {
  if (!hasAnyXml) {
    return (
      <div className="card-raised p-8 text-center">
        <FileSearch className="mx-auto mb-3 size-12 text-slate-200" />
        <p className="text-sm font-medium text-slate-600">
          Nincs még feldolgozott XML.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Tedd be az Oblio Wallet ZIP-et a helyi mappa <code className="font-mono bg-slate-100 px-1 rounded">befogadott/</code>
          almappájába, és kattints a &bdquo;Frissítés&rdquo; gombra.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-xl transition-colors mt-4 hover:bg-slate-50"
        >
          <Loader2 className="mr-1 size-4" /> Frissítés a mappából
        </button>
      </div>
    )
  }
  return (
    <div className="card-raised p-6 text-center">
      <p className="text-sm text-slate-500">
        A szűrőfeltételhez (<strong>{filter}</strong>) nem tartozik fájl. Próbálj más szűrőt.
      </p>
    </div>
  )
}
