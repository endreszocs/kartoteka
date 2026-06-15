/**
 * Desktop Oblio e-Factura ellenőrzés fül (2026-06-14).
 *
 * A web `OblioEllenorzesTab` desktop megfelelője — de a fájlkezelést a Rust-réteg
 * végzi (nem a böngésző File System Access API-ja), és a munkafolyamat tisztább:
 *
 *   BEDOBÓ mappa (befogadott/) ── Beolvasás ──▶ FELDOLGOZOTT mappa (feldolgozott/)
 *   A lelkész a letöltött Oblio ZIP-et a befogadott/ mappába teszi. Beolvasáskor a
 *   rendszer kibontja/áthelyezi a fájlokat a feldolgozott/ tárba, a ZIP-et a
 *   zip-arhivum/-ba archiválja, és a befogadott/ mappa KIÜRÜL — így a lelkész látja,
 *   mit olvasott már be, és a mappa tiszta marad.
 *
 * A párosítás a megosztott, tesztelt logikát használja (parseUblXml +
 * matchXmlsToKiadas). A kiadások és a perzisztált párosítások online (Supabase)
 * jönnek/kerülnek mentésre; offline a beolvasott számlák listája akkor is látszik.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { openPath } from '@tauri-apps/plugin-opener'
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileArchive,
  FileSearch,
  FolderOpen,
  Link2,
  Link2Off,
  Loader2,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'
// PDF.js worker — a Vite lokálisan bundle-öli, így offline (asztali) appban is
// működik a tartalom-elemzés (a CDN-es worker offline nem érhető el).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Button, Input } from '@kartoteka/ui'
import {
  parseUblXml,
  extractAnafUuidFromFilename,
  normalizeFileBaseName,
  matchXmlsToKiadas,
  batchMatchPdfsToXmls,
  type UblInvoiceMeta,
  type MinimalKiadas,
  type XmlMatchResult,
  type OblioMinimalKiadas,
  type OblioKiadasMatchRow,
  type ExpenseCategory,
  type BankAccount,
  type OrphanPdfFile,
  type ContentMatchResult,
} from '@kartoteka/ui-app'
import { saveExpenseUseCase } from '@kartoteka/core'

import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { excelOpenFolder } from '../lib/excel'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import { getLocalKiadasok } from '../lib/finance-sync'
import {
  oblioFolderInfo,
  oblioIngest,
  oblioListProcessed,
  oblioReadText,
  oblioReadBase64,
  oblioRenameProcessed,
  oblioSetupFolder,
  type OblioFolderInfo,
  type OblioFileEntry,
} from '../lib/oblio'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface DesktopOblioTabProps {
  congregationId: string
  userId: string
  currentYear: number
  /** Kiadás-kategóriák a „Bevezetés kiadásként” varázslóhoz. */
  expenseCategories: ExpenseCategory[]
  /** Aktív bankszámlák (banki fizetési mód választásához). */
  bankAccounts: BankAccount[]
  onToast: (msg: string, kind: ToastKind) => void
}

type Enriched = {
  meta: UblInvoiceMeta
  fileName: string
  xmlPath: string | null
  pdfPath: string | null
  match: XmlMatchResult
  kiadas: OblioMinimalKiadas | null
}

const NONE_MATCH = (uuid: string): XmlMatchResult => ({
  anafUuid: uuid,
  kiadasId: null,
  method: 'none',
  confidence: 'none',
  explanation: '—',
})

// ── #2 Offline párosítás-sor (localStorage) ──
// Offline rögzített KÉZI párosítások itt várnak a hálózat visszatértére, akkor
// a loadData felflusheli a Supabase-be. (Az auto-párosítások nem igényelnek
// sort: a matcher minden frissítésnél újraszámolja, és online perzisztálja őket.)
type PendingMatch = {
  kiadasId: number
  anafUuid: string
  supplierCui: string | null
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  invoiceAmount: number | null
  localFileRelpath: string | null
}

function pendingKey(congregationId: string): string {
  return `oblio-pending-matches::${congregationId}`
}

function loadPendingMatches(congregationId: string): PendingMatch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(pendingKey(congregationId))
    return raw ? (JSON.parse(raw) as PendingMatch[]) : []
  } catch {
    return []
  }
}

function savePendingMatches(congregationId: string, list: PendingMatch[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(pendingKey(congregationId), JSON.stringify(list))
  } catch {
    /* storage quota — csendben */
  }
}

/** A várakozó párosítások felflushelése a Supabase-be; a sikertelenek maradnak. */
async function flushPendingMatches(
  congregationId: string,
  list: PendingMatch[],
  userId: string,
): Promise<PendingMatch[]> {
  if (list.length === 0) return []
  const supabase = getDesktopSupabase()
  const nowIso = new Date().toISOString()
  const still: PendingMatch[] = []
  for (const p of list) {
    try {
      const { error } = await supabase.from('oblio_kiadas_match').upsert(
        {
          congregation_id: congregationId,
          kiadas_id: p.kiadasId,
          anaf_uuid: p.anafUuid,
          supplier_cui: p.supplierCui,
          supplier_name: p.supplierName,
          invoice_number: p.invoiceNumber,
          invoice_date: p.invoiceDate,
          invoice_amount: p.invoiceAmount,
          local_file_relpath: p.localFileRelpath,
          match_method: 'manual',
          match_confidence: 'high',
          matched_by: userId,
          matched_at: nowIso,
        },
        { onConflict: 'congregation_id,anaf_uuid' },
      )
      if (error) still.push(p)
    } catch {
      still.push(p)
    }
  }
  savePendingMatches(congregationId, still)
  return still
}

/** base64 → Blob (a PDF tartalom-elemzéshez a webview-ban). */
function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export function DesktopOblioTab({
  congregationId,
  userId,
  currentYear,
  expenseCategories,
  bankAccounts,
  onToast,
}: DesktopOblioTabProps) {
  const [folder, setFolder] = useState<OblioFolderInfo | null>(null)
  const [enriched, setEnriched] = useState<Enriched[]>([])
  const [matches, setMatches] = useState<OblioKiadasMatchRow[]>([])
  const [kiadasok, setKiadasok] = useState<OblioMinimalKiadas[]>([])
  const [online, setOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [ingesting, setIngesting] = useState(false)
  const [filter, setFilter] = useState<'mind' | 'parositott' | 'hianyzo'>('mind')
  const [manualFor, setManualFor] = useState<Enriched | null>(null)
  const [wizardFor, setWizardFor] = useState<Enriched | null>(null)
  const [wizardBusy, setWizardBusy] = useState(false)
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([])
  const [orphanPdfs, setOrphanPdfs] = useState<OblioFileEntry[]>([])
  const [contentMatching, setContentMatching] = useState(false)
  const [contentResults, setContentResults] = useState<ContentMatchResult[]>([])

  // ── Adatbetöltés: feldolgozott XML-ek parse + online kiadások/párosítások + match ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Online törzsadatok (kiadások + perzisztált párosítások) — best-effort.
      let kRows: OblioMinimalKiadas[] = []
      let mRows: OblioKiadasMatchRow[] = []
      const isOnline = await isOnlineWithSession()
      setOnline(isOnline)

      // #2: a várakozó (offline rögzített) kézi párosítások betöltése + flush online.
      let pending = loadPendingMatches(congregationId)
      if (isOnline && pending.length > 0) {
        pending = await flushPendingMatches(congregationId, pending, userId)
      }

      if (isOnline) {
        try {
          const supabase = getDesktopSupabase()
          const [matchesRes, kiadasokRes] = await Promise.all([
            supabase
              .from('oblio_kiadas_match')
              .select(
                'id, kiadas_id, anaf_uuid, supplier_cui, supplier_name, invoice_number, invoice_date, invoice_amount, local_file_relpath, match_method, match_confidence, manual_note, matched_at',
              )
              .eq('congregation_id', congregationId),
            supabase
              .from('kiadas')
              .select('*')
              .eq('congregation_id', congregationId)
              .eq('deleted', false)
              .gte('datum', `${currentYear}-01-01`)
              .lte('datum', `${currentYear}-12-31`)
              .order('datum', { ascending: false }),
          ])
          if (!matchesRes.error && matchesRes.data) mRows = matchesRes.data as OblioKiadasMatchRow[]
          if (!kiadasokRes.error && kiadasokRes.data) {
            kRows = (kiadasokRes.data as Record<string, unknown>[]).map((r) => ({
              id: Number(r.id),
              datum: String(r.datum ?? '').slice(0, 10),
              osszeg: Number(r.osszeg) || 0,
              kedvezmenyzett: (r.kedvezmenyzett as string | null) ?? null,
              atvevo: (r.atvevo as string | null) ?? null,
              kedvezmenyezett_cui: (r.kedvezmenyezett_cui as string | null) ?? null,
              iratszam: (r.iratszam as string | null) ?? null,
            }))
          }
        } catch {
          /* online törzsadat nélkül a lokális tükörből dolgozunk (lentebb) */
        }
      }

      // Offline (vagy ha az online lekérés elbukott): a kiadások a LOKÁLIS
      // SQLite-tükörből — így offline is lehet párosítani (a match a sorba kerül).
      if (kRows.length === 0) {
        try {
          const local = await getLocalKiadasok(congregationId, currentYear)
          kRows = local.map((r) => ({
            id: r.id,
            datum: String(r.datum ?? '').slice(0, 10),
            osszeg: r.osszeg,
            kedvezmenyzett: null,
            atvevo: r.atvevo,
            kedvezmenyezett_cui: r.kedvezmenyezett_cui,
            iratszam: r.iratszam,
          }))
        } catch {
          /* nincs lokális tükör — üres lista */
        }
      }

      setMatches(mRows)
      setKiadasok(kRows)
      setPendingMatches(pending)

      // 2. Feldolgozott fájlok beolvasása + parse.
      const files = await oblioListProcessed()
      const xmlFiles = files.filter((f) => f.kind === 'xml')
      const pdfFiles = files.filter((f) => f.kind === 'pdf')

      const parsed: { meta: UblInvoiceMeta; fileName: string; xmlPath: string }[] = []
      for (const f of xmlFiles) {
        try {
          const text = await oblioReadText(f.name)
          const fallback = extractAnafUuidFromFilename(f.name) || f.name
          const meta = parseUblXml(text, fallback)
          if (!meta.anafUuid) meta.anafUuid = fallback
          parsed.push({ meta, fileName: f.name, xmlPath: f.path })
        } catch {
          /* hibás XML — kihagyjuk */
        }
      }

      // Duplikátumok kiszűrése (UUID-nként az első).
      const seen = new Set<string>()
      const unique = parsed.filter((p) => {
        const uuid = p.meta.anafUuid || p.fileName
        if (seen.has(uuid)) return false
        seen.add(uuid)
        return true
      })

      // 3. Párosítás (a megosztott matcher).
      const kiadasokForMatcher: MinimalKiadas[] = kRows.map((k) => ({
        id: k.id,
        datum: k.datum,
        osszeg: k.osszeg,
        kedvezmenyzett: k.kedvezmenyzett,
        atvevo: k.atvevo,
        kedvezmenyezett_cui: k.kedvezmenyezett_cui,
      }))
      // A matcher „existing" listája: a DB-párosítások ÉS a még szinkronra váró
      // (offline) kézi párosítások — így az utóbbiak is párosítottként látszanak.
      const existing = [
        ...mRows.map((m) => ({ kiadasId: m.kiadas_id, anafUuid: m.anaf_uuid })),
        ...pending.map((p) => ({ kiadasId: p.kiadasId, anafUuid: p.anafUuid })),
      ]
      const { xmlResults } = matchXmlsToKiadas(
        unique.map((u) => u.meta),
        kiadasokForMatcher,
        existing,
      )
      const resultByUuid = new Map(xmlResults.map((r) => [r.anafUuid, r]))

      // 4. Magas-konfidens auto-párosítások perzisztálása (online, best-effort).
      if (isOnline) {
        const toPersist = xmlResults.filter(
          (r) =>
            r.confidence === 'high' &&
            r.kiadasId !== null &&
            (r.method === 'auto_cui' || r.method === 'auto_name_amount_date') &&
            !existing.find((e) => e.anafUuid === r.anafUuid),
        )
        if (toPersist.length > 0) {
          const nowIso = new Date().toISOString()
          const payloads = toPersist
            .map((r) => {
              const u = unique.find((x) => x.meta.anafUuid === r.anafUuid)
              if (!u) return null
              return {
                congregation_id: congregationId,
                kiadas_id: r.kiadasId,
                anaf_uuid: r.anafUuid,
                supplier_cui: u.meta.supplier.cui,
                supplier_name: u.meta.supplier.name,
                invoice_number: u.meta.invoiceNumber,
                invoice_date: u.meta.issueDate,
                invoice_amount: u.meta.amounts.brut,
                local_file_relpath: u.fileName,
                match_method: r.method,
                match_confidence: 'high',
                matched_by: userId,
                matched_at: nowIso,
              }
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
          try {
            const supabase = getDesktopSupabase()
            await supabase
              .from('oblio_kiadas_match')
              .upsert(payloads, { onConflict: 'congregation_id,anaf_uuid' })
          } catch {
            /* a párosítás a UI-ban így is látszik; a mentés a következő frissítésnél újrapróbálható */
          }
        }
      }

      // 5. Enriched lista (PDF-párosítás fájlnév-gyök alapján).
      const kiadasById = new Map(kRows.map((k) => [k.id, k]))
      const pdfByBase = new Map(pdfFiles.map((p) => [normalizeFileBaseName(p.name), p.path]))
      const built: Enriched[] = unique.map((u) => {
        const match = resultByUuid.get(u.meta.anafUuid || '') || NONE_MATCH(u.meta.anafUuid || '')
        return {
          meta: u.meta,
          fileName: u.fileName,
          xmlPath: u.xmlPath,
          pdfPath: pdfByBase.get(normalizeFileBaseName(u.fileName)) || null,
          match,
          kiadas: match.kiadasId !== null ? kiadasById.get(match.kiadasId) || null : null,
        }
      })
      setEnriched(built)

      // Árva PDF-ek: a feldolgozott PDF-ek, amelyek fájlnév-gyöke egyetlen XML-ével
      // sem egyezik (tartalom-elemzéssel párosíthatók).
      const xmlBases = new Set(unique.map((u) => normalizeFileBaseName(u.fileName)))
      setOrphanPdfs(pdfFiles.filter((p) => !xmlBases.has(normalizeFileBaseName(p.name))))
    } finally {
      setLoading(false)
    }
  }, [congregationId, userId, currentYear])

  useEffect(() => {
    void oblioFolderInfo().then(setFolder).catch(() => setFolder(null))
    void loadData()
  }, [loadData])

  // ── Beolvasás: ZIP/fájlok áthelyezése + a bedobó mappa kiürítése ──
  async function handleIngest() {
    setIngesting(true)
    try {
      const r = await oblioIngest()
      const newCount =
        r.extractedXml + r.extractedPdf + r.movedXml + r.movedPdf
      const parts: string[] = []
      if (newCount > 0) parts.push(`${newCount} új fájl beolvasva`)
      if (r.archivedZips > 0) parts.push(`${r.archivedZips} ZIP archiválva`)
      if (r.skipped > 0) parts.push(`${r.skipped} már korábban beolvasva`)
      if (r.befogadottRemaining > 0) parts.push(`${r.befogadottRemaining} ismeretlen fájl maradt a mappában`)
      onToast(
        parts.length > 0 ? `Beolvasás kész — ${parts.join(' · ')}.` : 'Beolvasás kész — nem volt új fájl a bedobó mappában.',
        r.errors.length > 0 ? 'warning' : 'success',
      )
      if (r.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('[Oblio ingest] hibák:', r.errors)
      }
      // 60 napos ANAF-határidő: új fájl érkezésekor frissítjük az utolsó letöltés
      // időpontját (a csengő-emlékeztető ez alapján számol). Best-effort, online.
      if (newCount > 0) {
        try {
          const supabase = getDesktopSupabase()
          const nowIso = new Date().toISOString()
          const { data: cur } = await supabase
            .from('oblio_fiokok')
            .select('utolso_xml_letoltes_at')
            .eq('congregation_id', congregationId)
            .eq('aktiv', true)
            .maybeSingle()
          if (
            !cur?.utolso_xml_letoltes_at ||
            new Date(cur.utolso_xml_letoltes_at).getTime() < new Date(nowIso).getTime()
          ) {
            await supabase
              .from('oblio_fiokok')
              .update({ utolso_xml_letoltes_at: nowIso })
              .eq('congregation_id', congregationId)
              .eq('aktiv', true)
          }
        } catch {
          /* offline / nincs Oblio-config — a beolvasás így is sikeres */
        }
      }
      setFolder(await oblioFolderInfo().catch(() => null))
      await loadData()
    } catch (e) {
      onToast(
        `Beolvasás hiba: ${e instanceof Error ? e.message : String(e)}. (Csak a letöltött asztali appban érhető el.)`,
        'error',
      )
    } finally {
      setIngesting(false)
    }
  }

  async function handleOpenFolder() {
    try {
      const info = folder?.exists ? folder : await oblioSetupFolder()
      setFolder(info)
      await excelOpenFolder(info.folderPath)
    } catch (e) {
      onToast(`A mappa megnyitása nem sikerült: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  async function handleOpenLocal(path: string | null) {
    if (!path) return
    try {
      await openPath(path)
    } catch (e) {
      onToast(`A fájl megnyitása nem sikerült: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  async function handleRemoveMatch(anafUuid: string) {
    // Várakozó (offline) párosítás? Akkor csak a sorból vesszük ki — nincs DB-művelet.
    if (pendingMatches.some((p) => p.anafUuid === anafUuid)) {
      if (!window.confirm('Biztosan törlöd a (még szinkronra váró) párosítást?')) return
      const next = pendingMatches.filter((p) => p.anafUuid !== anafUuid)
      savePendingMatches(congregationId, next)
      setPendingMatches(next)
      onToast('Várakozó párosítás törölve.', 'success')
      await loadData()
      return
    }
    const dbMatch = matches.find((m) => m.anaf_uuid === anafUuid)
    if (!dbMatch) {
      onToast('A párosítás csak helyileg (auto) létezik — frissíts a véglegesítéshez.', 'info')
      return
    }
    if (!window.confirm('Biztosan törlöd a párosítást?')) return
    try {
      const supabase = getDesktopSupabase()
      const { error } = await supabase
        .from('oblio_kiadas_match')
        .delete()
        .eq('id', dbMatch.id)
        .eq('congregation_id', congregationId)
      if (error) {
        onToast(error.message, 'error')
        return
      }
      onToast('Párosítás törölve.', 'success')
      await loadData()
    } catch (e) {
      onToast(`Törlés hiba: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  async function handleSaveManual(target: Enriched, kiadasId: number) {
    if (!target.meta.anafUuid) {
      onToast('Hiányzó ANAF UUID — a számla nem párosítható.', 'error')
      return
    }
    const pendingPayload: PendingMatch = {
      kiadasId,
      anafUuid: target.meta.anafUuid,
      supplierCui: target.meta.supplier.cui,
      supplierName: target.meta.supplier.name,
      invoiceNumber: target.meta.invoiceNumber,
      invoiceDate: target.meta.issueDate,
      invoiceAmount: target.meta.amounts.brut,
      localFileRelpath: target.fileName,
    }

    // #2 Offline: a párosítás a sorba kerül, és a hálózat visszatértekor szinkronizál.
    if (!online) {
      const next = [
        ...pendingMatches.filter((p) => p.anafUuid !== pendingPayload.anafUuid),
        pendingPayload,
      ]
      savePendingMatches(congregationId, next)
      setPendingMatches(next)
      onToast('Párosítás elmentve — szinkronizálódik, amint újra online vagy.', 'success')
      setManualFor(null)
      await loadData()
      return
    }

    try {
      const supabase = getDesktopSupabase()
      const { error } = await supabase.from('oblio_kiadas_match').upsert(
        {
          congregation_id: congregationId,
          kiadas_id: pendingPayload.kiadasId,
          anaf_uuid: pendingPayload.anafUuid,
          supplier_cui: pendingPayload.supplierCui,
          supplier_name: pendingPayload.supplierName,
          invoice_number: pendingPayload.invoiceNumber,
          invoice_date: pendingPayload.invoiceDate,
          invoice_amount: pendingPayload.invoiceAmount,
          local_file_relpath: pendingPayload.localFileRelpath,
          match_method: 'manual',
          match_confidence: 'high',
          matched_by: userId,
          matched_at: new Date().toISOString(),
        },
        { onConflict: 'congregation_id,anaf_uuid' },
      )
      if (error) {
        onToast(error.message, 'error')
        return
      }
      onToast('Párosítás mentve.', 'success')
      setManualFor(null)
      await loadData()
    } catch (e) {
      onToast(`Mentés hiba: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  // ── Számla bevezetése új kiadásként (a megosztott saveExpenseUseCase-szel) ──
  // A létrehozott kiadás a számla CUI-jával + összegével + dátumával jön létre,
  // így a következő frissítéskor a matcher AUTOMATIKUSAN párosítja vele.
  async function handleIntroduceExpense(
    target: Enriched,
    idKiadascel: number,
    paymentType: 'Készpénz' | 'Banki',
    bankszamlaId: number | null,
  ) {
    const brut = target.meta.amounts.brut
    if (brut === null || brut <= 0) {
      onToast('A számla bruttó összege hiányzik vagy érvénytelen — nem vezethető be.', 'error')
      return
    }
    const datum = (target.meta.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10)
    const partner = target.meta.supplier.name?.trim() || 'Ismeretlen beszállító'
    const cui = target.meta.supplier.cui?.trim().slice(0, 32) || null
    const iratszam = target.meta.invoiceNumber?.trim().slice(0, 50) || null
    const uuid = target.meta.anafUuid || ''

    setWizardBusy(true)
    try {
      const supabase = getDesktopSupabase()
      const result = await saveExpenseUseCase(
        {
          congregationId,
          osszeg: brut,
          datum,
          id_kiadascel: idKiadascel,
          atvevoid: null,
          atvevo: partner,
          kedvezmenyezett_cui: cui,
          iratszam,
          irattipus: paymentType,
          bankszamla_id: paymentType === 'Banki' ? bankszamlaId : null,
          megjegyzes: `Oblio bevezetés — ANAF UUID: ${uuid}${
            target.meta.invoiceNumber ? ` (${target.meta.invoiceNumber})` : ''
          }`,
          vonatkozo_idoszak: null,
        },
        { supabase, runtime: 'desktop', userId, isOnline: true },
      )
      if (!result.success) {
        onToast(`Bevezetés hiba: ${result.error}`, 'error')
        return
      }
      // Hivatalos Excelbe is (várólistán át) — mint a tétel-rögzítőnél.
      if (result.data.id > 0) {
        void enqueueEntryExcelRow({
          type: 'kiadas',
          serverId: result.data.id,
          congregationId,
          datum,
          iratszam: result.data.iratszam,
          irattipus: paymentType,
          nev: partner,
          osszeg: brut,
          celId: idKiadascel,
          megjegyzes: `Oblio: ${uuid}`,
        })
      }
      onToast('Kiadás bevezetve — a frissítés automatikusan párosítja a számlával.', 'success')
      setWizardFor(null)
      await loadData()
    } catch (e) {
      onToast(`Bevezetés hiba: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setWizardBusy(false)
    }
  }

  // ── #1 Árva-PDF tartalom-elemzés (PDF.js) ──
  // A fájlnév alapján nem párosított PDF-ekből kinyerjük a CUI-t/összeget, és a
  // megfelelő XML-lel társítjuk; sikeres (biztos/közepes) találatnál a PDF-et az
  // XML alapnevére nevezzük át → a következő frissítésnél fájlnév-gyök alapján párosul.
  async function handleContentMatch() {
    if (orphanPdfs.length === 0) return
    setContentMatching(true)
    setContentResults([])
    try {
      // A PDF.js worker-t a lokálisan bundle-ölt URL-re állítjuk (offline is megy).
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

      const orphanFiles: OrphanPdfFile[] = []
      for (const p of orphanPdfs) {
        try {
          const b64 = await oblioReadBase64(p.name)
          const blob = base64ToBlob(b64, 'application/pdf')
          orphanFiles.push({
            name: p.name,
            // A matcher csak `handle.getFile()`-t hív — fake handle elég.
            handle: { getFile: async () => blob } as unknown as FileSystemFileHandle,
          })
        } catch {
          /* olvasási hiba — ezt a PDF-et kihagyjuk */
        }
      }

      const xmlsForContentMatch = enriched.map((e) => ({ fileName: e.fileName, meta: e.meta }))
      const results = await batchMatchPdfsToXmls(orphanFiles, xmlsForContentMatch)
      setContentResults(results)

      let renamed = 0
      for (const r of results) {
        if (r.xmlFileName && (r.confidence === 'high' || r.confidence === 'medium')) {
          const newPdfName = `${r.xmlFileName.replace(/\.xml$/i, '')}.pdf`
          try {
            await oblioRenameProcessed(r.pdfName, newPdfName)
            renamed += 1
          } catch {
            /* ütközés / hiba — marad árva */
          }
        }
      }

      const low = results.filter((r) => r.confidence === 'low').length
      const none = results.filter((r) => r.confidence === 'none').length
      let msg = `${renamed} PDF tartalom alapján párosítva`
      if (low > 0) msg += ` · ${low} gyenge egyezés (kézi ellenőrzés ajánlott)`
      if (none > 0) msg += ` · ${none} maradt árva`
      onToast(msg, renamed > 0 ? 'success' : 'info')
      if (renamed > 0) await loadData()
    } catch (e) {
      onToast(`Tartalom-elemzés hiba: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setContentMatching(false)
    }
  }

  // ── Statisztika + szűrt lista ──
  const stats = useMemo(() => {
    const total = enriched.length
    const matched = enriched.filter((e) => e.match.kiadasId !== null).length
    const matchedKiadasIds = new Set(
      enriched.filter((e) => e.match.kiadasId !== null).map((e) => e.match.kiadasId as number),
    )
    const kiadasWithoutSpv = kiadasok.filter((k) => !matchedKiadasIds.has(k.id)).length
    return { total, matched, unmatched: total - matched, kiadasWithoutSpv }
  }, [enriched, kiadasok])

  const filtered = useMemo(() => {
    if (filter === 'parositott') return enriched.filter((e) => e.match.kiadasId !== null)
    if (filter === 'hianyzo') return enriched.filter((e) => e.match.kiadasId === null)
    return enriched
  }, [enriched, filter])

  return (
    <div className="space-y-4">
      {/* Bedobó mappa + Beolvasás */}
      <div className="card-raised border border-cyan-100 bg-cyan-50/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <FileArchive className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">Befogadott e-Factura beolvasása</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                Tedd a letöltött Oblio ZIP-et (vagy a kibontott XML/PDF-eket) a{' '}
                <strong>befogadott</strong> mappába, majd kattints a{' '}
                <strong>„Beolvasás”</strong> gombra. A rendszer feldolgozza és áthelyezi a
                fájlokat — a bedobó mappa <strong>kiürül</strong>, így látod, mit olvasott már be.
              </p>
              {folder && (
                <p className="mt-1.5 break-all font-mono text-[11px] text-slate-400">
                  {folder.folderPath}
                  {folder.exists
                    ? ` · most a mappában: ${folder.zipCount} ZIP, ${folder.xmlCount} XML, ${folder.pdfCount} PDF`
                    : ' · még nincs előkészítve'}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void handleIngest()} disabled={ingesting}>
              {ingesting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Beolvasás
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleOpenFolder()}>
              <FolderOpen className="mr-1.5 size-4" />
              Bedobó mappa
            </Button>
          </div>
        </div>
      </div>

      {!online && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Nincs aktív kapcsolat — offline is párosíthatsz (a kiadások a helyi tükörből jönnek); a
          párosítások a sorba kerülnek, és a hálózat visszatértekor automatikusan szinkronizálnak.
        </div>
      )}

      {pendingMatches.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="size-4 shrink-0" />
            {pendingMatches.length} párosítás vár szinkronra (offline rögzítve).
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadData()}
            disabled={!online || loading}
          >
            <RefreshCw className="mr-1.5 size-4" /> Szinkron most
          </Button>
        </div>
      )}

      {/* Statisztika */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard color="cyan" label="Beolvasott XML" value={stats.total} hint="A feldolgozott tárban" />
        <StatCard color="emerald" label="Párosított" value={stats.matched} hint="Kiadáshoz rendelve" />
        <StatCard color="amber" label="Hiányzó kiadás" value={stats.unmatched} hint="SPV-ben van, könyvelésben nincs" />
        <StatCard color="red" label="Nincs SPV-ben" value={stats.kiadasWithoutSpv} hint="Kifizetés előtt ellenőrizd!" />
      </div>

      {/* Árva PDF-ek — tartalom-elemzéssel párosíthatók */}
      {orphanPdfs.length > 0 && (
        <div className="card-raised border border-rose-200 bg-rose-50/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                📕
              </span>
              <div>
                <p className="text-sm font-semibold text-rose-900">
                  {orphanPdfs.length} árva PDF — fájlnév alapján nem párosítva
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Indítsd a <strong>tartalom-elemzést</strong> — a rendszer a PDF szövegéből kinyeri a
                  CUI-t/összeget, és a megfelelő XML-lel társítja (sikeres párosításnál átnevezi a fájlt).
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleContentMatch()}
              disabled={contentMatching}
              className="shrink-0"
            >
              {contentMatching ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <FileSearch className="mr-1.5 size-4" />
              )}
              Tartalom-elemzés
            </Button>
          </div>

          {contentResults.length > 0 && (
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {contentResults.map((r) => {
                const colorMap: Record<string, string> = {
                  high: 'border-emerald-200 bg-emerald-50',
                  medium: 'border-amber-200 bg-amber-50',
                  low: 'border-orange-200 bg-orange-50',
                  none: 'border-slate-200 bg-white',
                }
                const label =
                  r.confidence === 'high'
                    ? '✓ Biztos'
                    : r.confidence === 'medium'
                      ? '⚠️ Közepes'
                      : r.confidence === 'low'
                        ? '? Gyenge'
                        : '✗ Nincs'
                return (
                  <div key={r.pdfName} className={`rounded-xl border px-3 py-2 text-xs ${colorMap[r.confidence]}`}>
                    <div className="flex items-start gap-2">
                      <span className="flex-1 break-all font-mono text-slate-700">📕 {r.pdfName}</span>
                      <span className="shrink-0 font-semibold">{label}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.reason}</p>
                    {r.xmlFileName && <p className="mt-0.5 font-mono text-emerald-700">→ {r.xmlFileName}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Szűrő */}
      {enriched.length > 0 && (
        <div className="card-raised flex flex-wrap items-center gap-2 p-3">
          <FilterChip active={filter === 'mind'} onClick={() => setFilter('mind')}>
            Mind ({enriched.length})
          </FilterChip>
          <FilterChip active={filter === 'parositott'} onClick={() => setFilter('parositott')}>
            Párosított ({stats.matched})
          </FilterChip>
          <FilterChip active={filter === 'hianyzo'} onClick={() => setFilter('hianyzo')}>
            Hiányzó ({stats.unmatched})
          </FilterChip>
        </div>
      )}

      {/* Táblázat */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Betöltés…</div>
      ) : filtered.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <FileArchive className="mx-auto mb-3 size-12 text-slate-200" />
          <p className="text-sm font-medium text-slate-600">
            {enriched.length === 0
              ? 'Még nincs beolvasott számla.'
              : 'A szűrőfeltételhez nem tartozik számla.'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Tedd az Oblio ZIP-et a bedobó mappába, és kattints a „Beolvasás” gombra.
          </p>
        </div>
      ) : (
        <div className="card-raised overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Dátum</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Beszállító</th>
                  <th className="hidden p-3 text-left text-xs font-medium text-slate-500 md:table-cell">Számlaszám</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Bruttó</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Kiadás</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Akciók</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={`${e.meta.anafUuid || 'x'}::${e.fileName}`} className="hover:bg-cyan-50/40">
                    <td className="whitespace-nowrap p-3 text-xs text-slate-600">{e.meta.issueDate || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <p className="max-w-[220px] truncate font-medium text-slate-800">
                          {e.meta.supplier.name || '—'}
                        </p>
                        {e.pdfPath && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">
                            📕 PDF
                          </span>
                        )}
                      </div>
                      {e.meta.supplier.cui && (
                        <p className="font-mono text-xs text-slate-400">CUI: {e.meta.supplier.cui}</p>
                      )}
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-slate-500 md:table-cell">
                      {e.meta.invoiceNumber || '—'}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold text-slate-800">
                      {e.meta.amounts.brut !== null
                        ? `${e.meta.amounts.brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${e.meta.currency || 'RON'}`
                        : '—'}
                    </td>
                    <td className="p-3">
                      <MatchBadge e={e} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {e.pdfPath && (
                          <IconBtn title="PDF megnyitása" color="text-rose-600 hover:bg-rose-50" onClick={() => void handleOpenLocal(e.pdfPath)}>
                            📕
                          </IconBtn>
                        )}
                        <IconBtn title="XML megnyitása" color="text-slate-500 hover:bg-slate-100" onClick={() => void handleOpenLocal(e.xmlPath)}>
                          <ExternalLink className="size-4" />
                        </IconBtn>
                        {e.match.kiadasId === null ? (
                          <>
                            <IconBtn
                              title="Bevezetés új kiadásként"
                              color="text-emerald-600 hover:bg-emerald-50"
                              onClick={() => setWizardFor(e)}
                              disabled={!online || expenseCategories.length === 0}
                            >
                              <PlusCircle className="size-4" />
                            </IconBtn>
                            <IconBtn
                              title="Kézi párosítás meglévő kiadáshoz"
                              color="text-cyan-600 hover:bg-cyan-50"
                              onClick={() => setManualFor(e)}
                            >
                              <Link2 className="size-4" />
                            </IconBtn>
                          </>
                        ) : (
                          <IconBtn title="Párosítás eltávolítása" color="text-red-500 hover:bg-red-50" onClick={() => void handleRemoveMatch(e.match.anafUuid)}>
                            <Link2Off className="size-4" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {manualFor && (
        <ManualMatchModal
          target={manualFor}
          kiadasok={kiadasok}
          onClose={() => setManualFor(null)}
          onSelect={(kiadasId) => void handleSaveManual(manualFor, kiadasId)}
        />
      )}

      {wizardFor && (
        <IntroduceExpenseModal
          target={wizardFor}
          expenseCategories={expenseCategories}
          bankAccounts={bankAccounts}
          busy={wizardBusy}
          onClose={() => setWizardFor(null)}
          onSubmit={(idKiadascel, paymentType, bankId) =>
            void handleIntroduceExpense(wizardFor, idKiadascel, paymentType, bankId)
          }
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Kézi párosítás modal
// ───────────────────────────────────────────────────────────────────────────

function ManualMatchModal({
  target,
  kiadasok,
  onClose,
  onSelect,
}: {
  target: Enriched
  kiadasok: OblioMinimalKiadas[]
  onClose: () => void
  onSelect: (kiadasId: number) => void
}) {
  const [q, setQ] = useState('')
  const brut = target.meta.amounts.brut
  const issue = target.meta.issueDate

  const ranked = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const scored = kiadasok.map((k) => {
      const partner = (k.kedvezmenyzett || k.atvevo || `#${k.id}`).toString()
      const amountDelta = brut !== null ? Math.abs(k.osszeg - brut) : Number.POSITIVE_INFINITY
      const dateDelta =
        issue && k.datum
          ? Math.abs((new Date(k.datum).getTime() - new Date(issue).getTime()) / 86_400_000)
          : Number.POSITIVE_INFINITY
      return { k, partner, amountDelta, dateDelta }
    })
    const filteredList = needle
      ? scored.filter(
          (s) => s.partner.toLowerCase().includes(needle) || String(s.k.osszeg).includes(needle),
        )
      : scored
    return filteredList
      .sort((a, b) => a.amountDelta - b.amountDelta || a.dateDelta - b.dateDelta)
      .slice(0, 40)
  }, [kiadasok, q, brut, issue])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 p-4">
          <p className="font-heading text-lg text-slate-800">Kézi párosítás</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {target.meta.supplier.name || 'Ismeretlen beszállító'}
            {brut !== null ? ` · ${brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${target.meta.currency || 'RON'}` : ''}
            {issue ? ` · ${issue}` : ''}
          </p>
          <Input
            className="mt-3 h-9"
            placeholder="Keresés partner vagy összeg szerint…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {ranked.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">Nincs találat.</p>
          ) : (
            ranked.map((s) => (
              <button
                key={s.k.id}
                type="button"
                onClick={() => onSelect(s.k.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-cyan-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{s.partner}</span>
                  <span className="block text-xs text-slate-400">
                    {s.k.datum?.slice(0, 10)}
                    {s.k.kedvezmenyezett_cui ? ` · CUI ${s.k.kedvezmenyezett_cui}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold text-slate-700">
                    {s.k.osszeg.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}
                  </span>
                  {Number.isFinite(s.amountDelta) && (
                    <span className={`block text-[10px] ${s.amountDelta < 1 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      Δ {s.amountDelta.toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 p-3">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Mégse
          </Button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Bevezetés kiadásként modal
// ───────────────────────────────────────────────────────────────────────────

function IntroduceExpenseModal({
  target,
  expenseCategories,
  bankAccounts,
  busy,
  onClose,
  onSubmit,
}: {
  target: Enriched
  expenseCategories: ExpenseCategory[]
  bankAccounts: BankAccount[]
  busy: boolean
  onClose: () => void
  onSubmit: (idKiadascel: number, paymentType: 'Készpénz' | 'Banki', bankId: number | null) => void
}) {
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [payment, setPayment] = useState<'Készpénz' | 'Banki'>('Készpénz')
  const [bankId, setBankId] = useState<number | ''>(() => {
    const def = bankAccounts.find((b) => b.is_default) || bankAccounts[0]
    return def ? def.id : ''
  })
  const [q, setQ] = useState('')

  const brut = target.meta.amounts.brut
  const filteredCats = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return expenseCategories
    return expenseCategories.filter(
      (c) => c.nev.toLowerCase().includes(needle) || c.kod.toLowerCase().includes(needle),
    )
  }, [expenseCategories, q])

  const canSave =
    categoryId !== '' &&
    (payment === 'Készpénz' || (payment === 'Banki' && bankId !== '')) &&
    !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 p-4">
          <p className="font-heading text-lg text-slate-800">Számla bevezetése kiadásként</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {target.meta.supplier.name || 'Ismeretlen beszállító'}
            {brut !== null
              ? ` · ${brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${target.meta.currency || 'RON'}`
              : ''}
            {target.meta.issueDate ? ` · ${target.meta.issueDate}` : ''}
            {target.meta.invoiceNumber ? ` · ${target.meta.invoiceNumber}` : ''}
          </p>
          {target.meta.supplier.cui && (
            <p className="mt-0.5 font-mono text-xs text-slate-400">CUI: {target.meta.supplier.cui}</p>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Költségvetési kategória</label>
            <Input
              className="mt-1 h-9"
              placeholder="Keresés kód vagy név szerint…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.currentTarget.value ? Number(e.currentTarget.value) : '')}
            >
              <option value="">— válassz kategóriát —</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kod} · {c.nev}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Fizetési mód</label>
            <div className="mt-1 flex gap-2">
              {(['Készpénz', 'Banki'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPayment(p)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    payment === p
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p === 'Készpénz' ? 'Kassza (készpénz)' : 'Bankszámla'}
                </button>
              ))}
            </div>
            {payment === 'Banki' && (
              <select
                className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={bankId}
                onChange={(e) => setBankId(e.currentTarget.value ? Number(e.currentTarget.value) : '')}
              >
                <option value="">— válassz bankszámlát —</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_neve} ({b.valuta})
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            A kiadás a számla összegével, dátumával és a beszállító adószámával (CUI) jön létre — így a
            következő frissítés automatikusan párosítja ezzel a számlával. A hivatalos Excel-könyvelésbe
            is bekerül (ha a szinkron be van kapcsolva).
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
          <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={busy}>
            Mégse
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() => {
              if (categoryId === '') return
              onSubmit(categoryId, payment, payment === 'Banki' && bankId !== '' ? bankId : null)
            }}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-1.5 size-4" />
            )}
            Bevezetés
          </Button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-komponensek
// ───────────────────────────────────────────────────────────────────────────

function MatchBadge({ e }: { e: Enriched }) {
  if (e.match.kiadasId === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <CircleAlert className="mr-1 size-3" />
        Nincs kiadás
      </span>
    )
  }
  const k = e.kiadas
  const partner = k ? k.kedvezmenyzett || k.atvevo || `#${k.id}` : `#${e.match.kiadasId}`
  const colors: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-orange-100 text-orange-800',
    none: 'bg-slate-100 text-slate-700',
  }
  const methodLabels: Record<string, string> = {
    auto_cui: 'CUI',
    auto_name_amount_date: 'név+ár',
    manual: 'kézi',
    none: '—',
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[e.match.confidence]}`}>
        <CheckCircle2 className="mr-1 size-3" />
        {partner.substring(0, 24)}
      </span>
      <span className="text-[10px] text-slate-400" title={e.match.explanation}>
        {methodLabels[e.match.method]} ·{' '}
        {e.match.confidence === 'high' ? 'biztos' : e.match.confidence === 'medium' ? 'közepes' : 'gyenge'}
      </span>
    </div>
  )
}

function IconBtn({
  title,
  color,
  onClick,
  disabled,
  children,
}: {
  title: string
  color: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex size-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${color}`}
    >
      {children}
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200' : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
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
  const palettes: Record<string, { gradient: string; text: string }> = {
    cyan: { gradient: 'from-cyan-500 to-teal-600', text: 'text-cyan-700' },
    emerald: { gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-700' },
    amber: { gradient: 'from-amber-500 to-orange-600', text: 'text-amber-700' },
    red: { gradient: 'from-red-400 to-red-600', text: 'text-red-700' },
  }
  const p = palettes[color]
  return (
    <div className="card-raised p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">{label}</p>
        <div className={`size-2.5 rounded-full bg-gradient-to-br ${p.gradient}`} />
      </div>
      <p className={`mt-1 text-2xl font-bold ${p.text}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>
    </div>
  )
}
