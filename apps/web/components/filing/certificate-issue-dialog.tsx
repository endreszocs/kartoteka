'use client'

/**
 * Igazolás / hivatalos levél kiállító és iktató (2026-07, F6 redesign — K4).
 *
 * Lépéses felépítés (balra vezérlők, jobbra élő A4-előnézet; lg alatt fül-váltó):
 *  (a) sablon-választó — a meglévő iktató-sablonok + „Szabad levél" üres törzzsel,
 *  (b) személy-kereső — több személy (pl. házaspár) kiválasztható chip-listával,
 *      az anyakönyvi adatok (szemely-actions) automatikusan töltik a placeholdereket,
 *  (c) fejléc-választó — többnyelvű hivatalos levélfej (letterheads.buildLetterheadHtml),
 *  (d) placeholder-űrlap + szerkeszthető törzs-szöveg.
 *
 * „Kiállítás és iktatás": a saveFilingEntry-t hívja (atomikus next_iktato_sequence
 * RPC-vel — NEM duplikáljuk az iktatási logikát), majd a ténylegesen kiosztott
 * iratszám kerül a dokumentum {{iratszam}} helyére, és az IKTATOTT példány
 * nyomtatható/PDF-ezhető. Iktatás NÉLKÜLI nyomtatás is lehetséges (figyelmeztetéssel).
 *
 * TÖBB SZEMÉLY — dokumentált konvenció:
 *  - a szám nélküli placeholderek ({{nev}}, {{szul_datum}}, …) mindig az
 *    1. kiválasztott személy adatai,
 *  - a 2. személy adatai a `_2` végű placeholderekbe kerülnek ({{nev_2}}, …),
 *  - {{nevek}} = az összes kiválasztott név „és"-sel összefűzve,
 *  - {{ferj_nev}} / {{feleseg_nev}} a kiválasztottak közül nem szerint töltődik,
 *  - {{eskuvo_datuma}} = az első ismert egyházi házasság-dátum a kiválasztottak közül.
 *
 * Záró blokk / iratszám-sor heurisztika: ha a törzs NEM tartalmaz
 * {{lelkipasztor}} placeholdert, a dokumentum végére automatikus záró blokk
 * kerül (helység + dátum + aláírás); ha nem tartalmaz {{iratszam}}-ot, az
 * elejére „Szám: {{iratszam}}" sor kerül — így a seed-sablonok (amelyekben
 * mindkettő benne van) nem duplázódnak, a Szabad levél viszont teljes.
 *
 * WYSIWYG: az előnézet, a PDF és a nyomtatás UGYANAZT a HTML-t kapja
 * (fit-to-width A4 iframe, a worklog-print-dialog mintája szerint).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  Loader2,
  Printer,
  Search,
  Stamp,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { saveFilingEntry } from '@/app/(dashboard)/iktato/actions'
import {
  generateNextIratszam,
  getAutoPlaceholderContext,
  listFilingTemplates,
} from '@/app/(dashboard)/iktato/template-actions'
import {
  getCongregationHeader,
  getPersonCertificateData,
  searchPersonsForCertificate,
} from '@/app/(dashboard)/iktato/szemely-actions'
import {
  PLACEHOLDER_DOCS,
  buildAutoValues,
  extractPlaceholders,
  formatHungarianDate,
  renderTemplate,
  type FilingTemplate,
  type TemplateType,
} from '@/lib/filing/templates'
import { buildLetterheadHtml, LETTERHEAD_LANGS } from '@/lib/iktato/letterheads'
import type {
  CertificatePersonHit,
  CongregationHeaderData,
  LetterheadLang,
  PersonCertData,
} from '@/lib/iktato/certificate-types'
import {
  formatUgykorLabel,
  getRetentionForUgykor,
} from '@/lib/constants/filing-ugykorjegyzek'
import { sanitizeFilingHtml } from '@/lib/public-site/sanitize'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

// ─────────────────────────────────────────────────────────────────
// Konstansok, segédek
// ─────────────────────────────────────────────────────────────────

/** A „Szabad levél" virtuális sablon-azonosítója a select-ben. */
const FREE_LETTER_ID = '__szabad_level__'

/** Legfeljebb ennyi személy választható ki (pl. házaspár + 2 gyermek). */
const MAX_PERSONS = 4

/** Fit-to-width előnézet: A4 álló lap-szélesség képpontban (~96 dpi + ráhagyás). */
const A4_PORTRAIT_W = 812
const A4_PORTRAIT_H = 1123

/**
 * Sablon-típus → jellemző EREK 2024-es ügykör-kód. Az igazolások a 2. pontba
 * (Anya- és családkönyvi levelezés — „keresztelési és konfirmációi igazolások"),
 * a levelek/meghívók az 1. pontba (Levelezés) tartoznak. A többi típusnál nem
 * találgatunk — ott az iktatás ügykör nélkül történik, utólag besorolható.
 */
const TIPUS_UGYKOR: Partial<Record<TemplateType, string>> = {
  igazolas: '2.',
  level: '1.',
  meghivo: '1.',
}

/** Az anyakönyvből automatikusan kezelt placeholder-kulcsok (törléshez/hinthez). */
const PERSON_MANAGED_KEYS = new Set<string>([
  'nev', 'szul_datum', 'apja_neve', 'anyja_neve', 'vallas',
  'kereszteles_datuma', 'keresztszulok', 'kereszteles_helye',
  'konfirmalas_datuma', 'hazastars_nev',
  'nev_2', 'szul_datum_2', 'apja_neve_2', 'anyja_neve_2', 'vallas_2',
  'kereszteles_datuma_2', 'keresztszulok_2', 'kereszteles_helye_2',
  'konfirmalas_datuma_2', 'hazastars_nev_2',
  'nevek', 'ferj_nev', 'feleseg_nev', 'eskuvo_datuma',
])

/** A mai nap LOKÁLIS dátuma ISO formában (a toISOString UTC-csúszása nélkül). */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO dátum (YYYY-MM-DD…) → magyar forma („1990. május 12."); hibásnál az eredeti. */
function fmtDateHu(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return iso
  return formatHungarianDate(d)
}

/** Nevek magyaros összefűzése: „A", „A és B", „A, B és C". */
function joinNamesHu(names: string[]): string {
  const list = names.map((n) => (n || '').trim()).filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} és ${list[list.length - 1]}`
}

/**
 * A kiválasztott személyek → placeholder-értékek (lásd a fejléc-kommentben
 * dokumentált konvenciót: szám nélkül = 1. személy, `_2` = 2. személy).
 */
function buildPersonValues(persons: PersonCertData[]): Record<string, string> {
  const v: Record<string, string> = {}
  const set = (key: string, val: string | null | undefined) => {
    const s = (val || '').trim()
    if (s) v[key] = s
  }
  persons.slice(0, 2).forEach((p, i) => {
    const s = i === 0 ? '' : '_2'
    set(`nev${s}`, p.teljesNev)
    set(`szul_datum${s}`, fmtDateHu(p.szuletesiDatum))
    set(`apja_neve${s}`, p.apjaNeve)
    set(`anyja_neve${s}`, p.anyjaNeve)
    set(`vallas${s}`, p.vallas)
    set(`kereszteles_datuma${s}`, fmtDateHu(p.keresztelesDatum))
    set(`keresztszulok${s}`, p.keresztszulok)
    set(`kereszteles_helye${s}`, p.keresztelesHelye)
    set(`konfirmalas_datuma${s}`, fmtDateHu(p.konfirmalasDatum))
    set(`hazastars_nev${s}`, p.hazastarsNev)
  })
  set('nevek', joinNamesHu(persons.map((p) => p.teljesNev)))
  set('ferj_nev', persons.find((p) => p.nem === 'ferfi')?.teljesNev)
  set('feleseg_nev', persons.find((p) => p.nem === 'no')?.teljesNev)
  set('eskuvo_datuma', fmtDateHu(persons.map((p) => p.hazassagDatum).find(Boolean) || null))
  return v
}

/** Placeholder-címke a katalógusból (PLACEHOLDER_DOCS), különben maga a kulcs. */
function placeholderLabel(key: string): string {
  return PLACEHOLDER_DOCS.find((p) => p.key === key)?.label || key
}

const TIMES_FONT = "font-family:'Times New Roman',serif;"

/**
 * A dokumentum-sablon összeállítása a törzsből:
 *  - Szabad levélnél a plain-text törzs pre-wrap wrapperbe kerül,
 *  - „Szám: {{iratszam}}" sor, ha a törzsben nincs iratszám,
 *  - automatikus záró blokk (helység+dátum+aláírás), ha nincs {{lelkipasztor}}.
 * Az eredmény MÉG placeholderes — a renderTemplate tölti ki.
 */
function buildAssembledTemplate(body: string, opts: { szabad: boolean; hasLetterhead: boolean }): string {
  const hasIratszam = /\{\{\s*iratszam\s*\}\}/.test(body)
  const hasClosing = /\{\{\s*lelkipasztor\s*\}\}/.test(body)
  const topPad = opts.hasLetterhead ? 8 : 36

  const parts: string[] = []
  if (!hasIratszam) {
    parts.push(
      `<div style="padding:${topPad}px 50px 0;${TIMES_FONT}font-size:14px;">Szám: {{iratszam}}</div>`,
    )
  }
  if (opts.szabad) {
    parts.push(
      `<div style="padding:24px 50px 0;${TIMES_FONT}line-height:1.6;font-size:14px;white-space:pre-wrap;">${body}</div>`,
    )
  } else {
    parts.push(body)
  }
  if (!hasClosing) {
    parts.push(
      `<div style="padding:0 50px 50px;${TIMES_FONT}font-size:14px;line-height:1.6;">
        <div style="margin-top:56px;display:flex;justify-content:space-between;gap:24px;">
          <div>{{helyseg}}, {{datum}}</div>
          <div style="text-align:center;">_______________________<br>{{lelkipasztor}}<br>lelkipásztor</div>
        </div>
      </div>`,
    )
  }
  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────────
// Komponens
// ─────────────────────────────────────────────────────────────────

export interface CertificateIssueDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Az iktató-nézetben kiválasztott év — csak tájékoztatáshoz (az iktatás mindig a MAI kelttel történik). */
  year: number
  /** Sikeres iktatás után hívódik (a szülő frissítheti a listát). */
  onIssued: () => void
}

export function CertificateIssueDialog({ open, onOpenChange, year, onIssued }: CertificateIssueDialogProps) {
  // (a) sablonok
  const [templates, setTemplates] = useState<FilingTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>(FREE_LETTER_ID)
  const [body, setBody] = useState('')

  // (b) személyek
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<CertificatePersonHit[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [persons, setPersons] = useState<PersonCertData[]>([])
  const [loadingPersons, setLoadingPersons] = useState(false)

  // (c) fejléc
  const [lang, setLang] = useState<LetterheadLang | ''>('hu')
  const [header, setHeader] = useState<CongregationHeaderData | null>(null)
  const [headerError, setHeaderError] = useState<string | null>(null)

  // (d) értékek
  const [autoValues, setAutoValues] = useState<Record<string, string>>({})
  const [manualValues, setManualValues] = useState<Record<string, string>>({})
  const [previewIratszam, setPreviewIratszam] = useState('')
  const [loadingCtx, setLoadingCtx] = useState(false)

  // iktatás
  const [subject, setSubject] = useState('')
  const [subjectTouched, setSubjectTouched] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState(false)
  const [issuedIratszam, setIssuedIratszam] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  // mobil fül-váltó + fókusz a lépés/fül-váltásnál (a11y)
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form')
  const formPanelRef = useRef<HTMLDivElement>(null)
  const previewPanelRef = useRef<HTMLDivElement>(null)

  const szabad = templateId === FREE_LETTER_ID
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  )
  const docTitle = selectedTemplate?.nev || 'Szabad levél'
  const nevek = useMemo(() => joinNamesHu(persons.map((p) => p.teljesNev)), [persons])
  const ugykorKod: string | null = szabad
    ? '1.'
    : (selectedTemplate ? TIPUS_UGYKOR[selectedTemplate.tipus] ?? null : null)

  // ── Megnyitáskor: állapot-reset + kontextus-betöltés ─────────────
  useEffect(() => {
    if (!open) return
    let cancelled = false

    // Teljes reset (a beágyazott állapot ne ragadjon át az előző kiállításból).
    setTemplateId(FREE_LETTER_ID)
    setBody('')
    setSearchQuery('')
    setHits([])
    setSearchError(null)
    setPersons([])
    setLang('hu')
    setManualValues({})
    setSubject('')
    setSubjectTouched(false)
    setIssuing(false)
    setIssued(false)
    setIssuedIratszam(null)
    setMobileView('form')
    setContentH(A4_PORTRAIT_H) // az előző kiállítás előnézet-magassága ne ragadjon át

    setLoadingCtx(true)
    void (async () => {
      const issueYear = new Date().getFullYear()
      const [tplRes, headerRes, ctxRes, iratszamRes] = await Promise.all([
        listFilingTemplates(),
        getCongregationHeader(),
        getAutoPlaceholderContext(),
        generateNextIratszam(issueYear),
      ])
      if (cancelled) return

      if (tplRes.error) toast.error(tplRes.error)
      setTemplates(tplRes.data || [])

      setHeader(headerRes.header)
      setHeaderError(headerRes.error)

      // Az előnézeti szám (nem-atomikus MAX+1 becslés) szándékosan NEM kerül
      // az autoValues közé — a dokumentumban csak az iktatáskor kiosztott
      // valódi szám jelenhet meg (lásd iratszamValue), a preview csak hint.
      setPreviewIratszam(iratszamRes.iratszam || '')
      setAutoValues(
        buildAutoValues({
          gyulekezet: ctxRes.data?.gyulekezet,
          lelkipasztor: ctxRes.data?.lelkipasztor,
          helyseg: ctxRes.data?.helyseg,
        }),
      )
      setLoadingCtx(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  // ── (b) debounced személy-keresés ────────────────────────────────
  const searchSeq = useRef(0)
  useEffect(() => {
    if (!open) {
      // Zárás után beérkező (úton lévő) válasz se írhasson vissza találatot.
      searchSeq.current++
      return
    }
    const q = searchQuery.trim()
    if (q.length < 2) {
      // A rövid/üres lekérdezés az úton lévő válaszokat is érvényteleníti —
      // különben egy megkésett válasz üres keresőmező mellett is visszahozná
      // az elavult (szellem-)találati listát.
      searchSeq.current++
      setHits([])
      setSearching(false)
      setSearchError(null)
      return
    }
    const mySeq = ++searchSeq.current
    setSearching(true)
    const t = window.setTimeout(() => {
      void searchPersonsForCertificate(q).then((res) => {
        if (mySeq !== searchSeq.current) return // elavult válasz
        setHits(res.results)
        setSearchError(res.error)
        setSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, searchQuery])

  async function addPerson(hit: CertificatePersonHit) {
    if (persons.some((p) => p.id === hit.id)) return
    if (persons.length >= MAX_PERSONS) {
      toast.info(`Legfeljebb ${MAX_PERSONS} személy választható ki.`)
      return
    }
    setLoadingPersons(true)
    const nextIds = [...persons.map((p) => p.id), hit.id]
    const res = await getPersonCertificateData(nextIds)
    setLoadingPersons(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setPersons(res.persons)
    // A személy-kezelt kulcsok kézi felülírásait töröljük, hogy az új
    // kiválasztás adatai érvényesüljenek (a nem-személy mezők megmaradnak).
    setManualValues((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) if (!PERSON_MANAGED_KEYS.has(k)) next[k] = v
      return next
    })
    setSearchQuery('')
    setHits([])
  }

  function removePerson(id: number) {
    setPersons((prev) => prev.filter((p) => p.id !== id))
  }

  // ── Sablon-váltás: törzs + iktatási tárgy frissítése ─────────────
  function handleTemplateChange(nextId: string) {
    setTemplateId(nextId)
    const tpl = templates.find((t) => t.id === nextId) || null
    setBody(nextId === FREE_LETTER_ID ? '' : tpl?.tartalom || '')
    // A már iktatott állapot új dokumentumnál nem érvényes.
    setIssued(false)
    setIssuedIratszam(null)
  }

  // Az iktatókönyvi tárgy automatikus követése, amíg a user nem írta át.
  const autoSubject = useMemo(
    () => `${docTitle}${nevek ? ` — ${nevek}` : ''}`,
    [docTitle, nevek],
  )
  useEffect(() => {
    if (!subjectTouched) setSubject(autoSubject)
  }, [autoSubject, subjectTouched])

  // ── Értékek + dokumentum összeállítása ───────────────────────────
  const personValues = useMemo(() => buildPersonValues(persons), [persons])
  // Iktatás ELŐTT a dokumentumba NEM kerülhet a nem-atomikus előnézeti szám
  // (a következő valódi iktatás ugyanazt a számot MÁSIK iratnak osztaná ki) —
  // helyette kitöltetlen vonal. A previewIratszam csak tájékoztató hint.
  const iratszamValue = issuedIratszam ?? manualValues.iratszam ?? '__________'
  const mergedValues = useMemo<Record<string, string>>(
    () => ({ ...autoValues, ...personValues, ...manualValues, iratszam: iratszamValue }),
    [autoValues, personValues, manualValues, iratszamValue],
  )

  const assembledRaw = useMemo(
    () => buildAssembledTemplate(body, { szabad, hasLetterhead: Boolean(lang && header) }),
    [body, szabad, lang, header],
  )
  const placeholders = useMemo(() => extractPlaceholders(assembledRaw), [assembledRaw])
  const autoKeys = useMemo(() => {
    const set = new Set<string>()
    for (const p of PLACEHOLDER_DOCS) if (p.auto) set.add(p.key)
    return set
  }, [])

  const fullHtml = useMemo(() => {
    // A sablon-törzs admin/lelkész által szerkesztett → sanitize (P1-3b minta);
    // az app-generált fejléc és a renderTemplate-escape-elt értékek megbízhatók.
    // Előnézet, PDF és nyomtatás UGYANEZT a HTML-t kapja (WYSIWYG).
    const sanitized = sanitizeFilingHtml(assembledRaw)
    const rendered = renderTemplate(sanitized, mergedValues)
    const letterhead =
      lang && header ? `<div style="padding:36px 50px 0;">${buildLetterheadHtml(lang, header)}</div>` : ''
    return `<!DOCTYPE html>
<html lang="${lang === 'ro' ? 'ro' : 'hu'}">
<head>
  <meta charset="utf-8" />
  <title>${docTitle}</title>
  <style>
    /* WYSIWYG-elv (official-journal/iratcsomó-leltár minta): @page margin 0,
       a lap-margót a tartalom saját 50px-es paddingje adja — 15mm-es @page
       margóval a böngészős nyomtatás máshol tördelt volna, mint az
       előnézet és a PDF (html2canvas, margó nélkül). */
    @page { size: A4 portrait; margin: 0; }
    body { margin: 0; background: #fff; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${letterhead}
  ${rendered}
</body>
</html>`
  }, [assembledRaw, mergedValues, lang, header, docTitle])
  // Gépelés közbeni render-vihar ellen IDŐ-alapú debounce: az iframe
  // srcDoc-cseréje teljes dokumentum-újraparszolást + layoutot indít, és a
  // useDeferredValue ezt leütésenként átengedte (nem debounce) — lassú
  // mobilon a billentyűzet-visszajelzés is akadozott. A nyomtatás/PDF a
  // friss fullHtml-t kapja, így az soha nem lehet elavult.
  const [iframeHtml, setIframeHtml] = useState(fullHtml)
  useEffect(() => {
    const t = window.setTimeout(() => setIframeHtml(fullHtml), 300)
    return () => window.clearTimeout(t)
  }, [fullHtml])

  // ── Fit-to-width A4 előnézet (worklog-print-dialog minta) ────────
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    if (!open) return
    const el = previewBoxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(A4_PORTRAIT_H)
  const measurePreview = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    // Viewport-FÜGGETLEN mérés: a documentElement.scrollHeight sosem kisebb
    // az iframe aktuális magasságánál (= contentH), így azzal a magasság csak
    // nőni tudott volna („racsni") — rövidebb dokumentumra (sablonváltás,
    // újranyitás) több képernyőnyi üres lap maradt volna az előnézetben.
    const h = Math.ceil(doc.body?.getBoundingClientRect().height || 0)
    setContentH(Math.max(h, A4_PORTRAIT_H))
  }, [])

  const targetW = boxW > 0 ? Math.max(0, boxW - 24) : A4_PORTRAIT_W
  const scale = Math.min(1, targetW / A4_PORTRAIT_W)
  const scaledW = Math.round(A4_PORTRAIT_W * scale)
  const scaledH = Math.round(contentH * scale)

  // ── Kiállítás és iktatás ─────────────────────────────────────────
  async function handleIssue() {
    if (issuing || issued) return // dupla-kattintás védelem
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) {
      toast.error('Az iktatókönyvi tárgy kötelező.')
      return
    }
    setIssuing(true)
    try {
      const kelt = todayIso()
      const res = await saveFilingEntry({
        direction: 'outgoing',
        kelt,
        subject: trimmedSubject,
        sender_or_recipient: nevek || null,
        targykivonat: null,
        elintezes_ideje: kelt,
        elintezes_modja: 'Kiállítva',
        ugykor_kod: ugykorKod,
        retention_type: ugykorKod ? getRetentionForUgykor(ugykorKod) : null,
        has_duplicate: false,
      })
      if (res?.error) {
        toast.error(res.error)
        return
      }
      setIssued(true)
      // Az iratszám a saveFilingEntry által visszaadott, atomikusan kiosztott
      // sorszámból képződik. (A korábbi (tárgy + kelt) alapú getFilingEntries-
      // visszakeresés versenyhelyzetben MÁSIK irat számát találhatta meg, a
      // néma-üres hibaelnyelése mellett pedig az elavult előnézeti szám maradt.)
      if (res && 'sequenceNumber' in res && typeof res.sequenceNumber === 'number') {
        const iratszam = `${res.year}/${res.sequenceNumber}`
        setIssuedIratszam(iratszam)
        toast.success(`Iktatva: ${iratszam} — a szám bekerült a dokumentumba.`)
      } else {
        toast.warning(
          'Az irat iktatva lett, de a kiosztott iratszámot nem sikerült visszaolvasni — ellenőrizd az iktatókönyvben, és írd be kézzel.',
        )
      }
      onIssued()
    } finally {
      setIssuing(false)
    }
  }

  // ── Nyomtatás / PDF ──────────────────────────────────────────────
  function safeFilename(): string {
    const base = `${docTitle}${nevek ? ` - ${nevek}` : ''}`
    return `${base.replaceAll(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_ -]/g, '_')}.pdf`
  }

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(fullHtml, safeFilename(), { orientation: 'portrait' })
      toast.success('PDF letöltve.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A PDF exportálás sikertelen.')
    } finally {
      setPrinting(false)
    }
  }

  async function handlePrint() {
    setPrinting(true)
    try {
      await printToBrowser(fullHtml)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható.')
    } finally {
      setPrinting(false)
    }
  }

  // ── Mobil fül-váltás fókusz-kezeléssel (a11y) ────────────────────
  function switchMobileView(next: 'form' | 'preview') {
    setMobileView(next)
    // A panel headingjére visszük a fókuszt, hogy a felolvasó is kövesse.
    window.setTimeout(() => {
      const el = next === 'form' ? formPanelRef.current : previewPanelRef.current
      el?.focus()
    }, 0)
  }

  const issueYearNow = new Date().getFullYear()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stamp className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-heading text-lg text-foreground">
                Igazolás / levél kiállítása
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Sablonból vagy szabad levélként, anyakönyvi adatokkal előtöltve — kiállítás után
                automatikus iktatással.
              </DialogDescription>
            </div>
          </div>

          {/* lg alatt nézet-váltó: űrlap ⇄ előnézet. Szándékosan aria-pressed-es
              toggle-gombpár (az iratcsomó-leltár mód-váltó mintája), NEM ARIA
              tab-minta — a role='tab' teljes APG-szerződést kívánna
              (aria-controls + tabpanel + nyílbillentyű-navigáció), a csonka
              változat a felolvasónak többet ártott, mint használt. */}
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 lg:hidden" role="group" aria-label="Szerkesztés vagy előnézet">
            {([
              ['form', 'Szerkesztés'],
              ['preview', 'Előnézet'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mobileView === key}
                onClick={() => switchMobileView(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  mobileView === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── BAL: vezérlők (a)–(d) + iktatás ─────────────────── */}
          <div
            ref={formPanelRef}
            tabIndex={-1}
            aria-label="Kiállítás beállításai"
            className={cn(
              'space-y-5 border-border p-4 outline-none sm:p-5 lg:block lg:border-r',
              mobileView === 'form' ? 'block' : 'hidden',
            )}
          >
            {loadingCtx ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adatok betöltése…
              </div>
            ) : (
              <>
                {/* (a) Sablon */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    1. Sablon
                  </h3>
                  <select
                    value={templateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    aria-label="Sablon kiválasztása"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={FREE_LETTER_ID}>Szabad levél (üres törzs)</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nev}
                      </option>
                    ))}
                  </select>
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Még nincsenek sablonok — a Sablonok fülön betöltheted az alapértelmezetteket,
                      vagy írj szabad levelet.
                    </p>
                  ) : null}
                </section>

                {/* (b) Személyek */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    2. Személyek (anyakönyvből)
                  </h3>

                  {persons.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Kiválasztott személyek">
                      {persons.map((p, i) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-muted py-1 pl-2.5 pr-1 text-xs text-foreground"
                        >
                          <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                          <span>
                            {p.teljesNev}
                            <span className="ml-1 text-muted-foreground">({i + 1}. személy)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removePerson(p.id)}
                            aria-label={`${p.teljesNev} eltávolítása`}
                            className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Név keresése (min. 2 betű)…"
                      aria-label="Személy keresése az anyakönyvben"
                      className="pl-9"
                    />
                  </div>

                  {searching ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Keresés…
                    </p>
                  ) : searchError ? (
                    <p className="text-xs text-destructive">{searchError}</p>
                  ) : hits.length > 0 ? (
                    <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
                      {hits.map((hit) => {
                        const already = persons.some((p) => p.id === hit.id)
                        return (
                          <li key={hit.id}>
                            <button
                              type="button"
                              disabled={already || loadingPersons}
                              onClick={() => void addPerson(hit)}
                              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
                            >
                              <span className="min-w-0 truncate font-medium">{hit.nev}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {[fmtDateHu(hit.szuletesiDatum), hit.anyjaNeve ? `a.n.: ${hit.anyjaNeve}` : '']
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : searchQuery.trim().length >= 2 ? (
                    <p className="text-xs text-muted-foreground">Nincs találat.</p>
                  ) : null}

                  {persons.length > 1 ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Több személynél a szám nélküli mezők az <b>1. személy</b> adatai, a 2. személyé
                      a <code>_2</code> végű placeholderek ({'{{nev_2}}'}…); a {'{{nevek}}'} az összes
                      név összefűzve.
                    </p>
                  ) : null}
                </section>

                {/* (c) Fejléc */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    3. Hivatalos fejléc
                  </h3>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as LetterheadLang | '')}
                    aria-label="Fejléc nyelve"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {LETTERHEAD_LANGS.map((l) => (
                      <option key={l.value} value={l.value}>
                        Fejléc: {l.label}
                      </option>
                    ))}
                    <option value="">Fejléc nélkül</option>
                  </select>
                  {headerError ? (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {headerError} — a dokumentum fejléc nélkül készül.
                    </p>
                  ) : null}
                </section>

                {/* (d) Placeholder-űrlap */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    4. Mezők
                  </h3>
                  {placeholders.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      A dokumentumban nincsenek kitöltendő mezők.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {placeholders.map((key) => {
                        const isIratszam = key === 'iratszam'
                        const fromPerson = key in personValues && !(key in manualValues)
                        const isAuto = autoKeys.has(key)
                        const value = isIratszam ? iratszamValue : (mergedValues[key] ?? '')
                        const hint = isIratszam
                          ? issuedIratszam
                            ? 'Iktatott, végleges iratszám'
                            : previewIratszam
                              ? `Várható szám iktatáskor: ${previewIratszam} — a dokumentumba csak a tényleges iktatáskor kerül szám`
                              : 'A szám a tényleges iktatáskor kerül a dokumentumba'
                          : fromPerson
                            ? 'Anyakönyvből előtöltve — szerkeszthető'
                            : isAuto
                              ? 'Automatikusan előtöltve — szerkeszthető'
                              : undefined
                        return (
                          <div key={key} className="space-y-1">
                            <label
                              htmlFor={`cert-ph-${key}`}
                              className="text-sm font-medium text-foreground"
                            >
                              {placeholderLabel(key)}
                            </label>
                            <input
                              id={`cert-ph-${key}`}
                              type="text"
                              value={value}
                              readOnly={isIratszam && Boolean(issuedIratszam)}
                              onChange={(e) =>
                                setManualValues((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder={`(${key})`}
                              className={cn(
                                'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                                isIratszam && issuedIratszam && 'bg-muted text-muted-foreground',
                              )}
                            />
                            {hint ? (
                              <p className="text-[11px] text-muted-foreground">{hint}</p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Törzs-szöveg */}
                  <div className="space-y-1">
                    <label htmlFor="cert-body" className="text-sm font-medium text-foreground">
                      {szabad ? 'Törzs-szöveg' : 'Törzs-szöveg (HTML, placeholderekkel)'}
                    </label>
                    <textarea
                      id="cert-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={szabad ? 8 : 10}
                      placeholder={
                        szabad
                          ? 'Írd ide a levél szövegét… (a {{nev}}, {{datum}} típusú placeholderek itt is működnek)'
                          : ''
                      }
                      className={cn(
                        'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                        !szabad && 'font-mono text-xs',
                      )}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {szabad
                        ? 'A „Szám: …” sor és a záró blokk (keltezés + aláírás) automatikusan a dokumentumra kerül.'
                        : 'A sablon szerkesztése csak erre a kiállításra érvényes — a mentett sablont nem módosítja.'}
                    </p>
                  </div>
                </section>

                {/* Iktatás */}
                <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    5. Kiállítás és iktatás
                  </h3>

                  <div className="space-y-1">
                    <label htmlFor="cert-subject" className="text-sm font-medium text-foreground">
                      Tárgy az iktatókönyvbe
                    </label>
                    <Input
                      id="cert-subject"
                      value={subject}
                      onChange={(e) => {
                        setSubject(e.target.value)
                        setSubjectTouched(true)
                      }}
                      disabled={issued}
                    />
                  </div>

                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Kimenő iratként, a mai kelttel ({fmtDateHu(todayIso())}) kerül iktatásra
                    {ugykorKod ? <> — ügykör: {formatUgykorLabel(ugykorKod)}</> : null}.
                    {year !== issueYearNow ? (
                      <> Az iktatás mindig az aktuális ({issueYearNow}) évi iktatókönyvbe történik.</>
                    ) : null}
                  </p>

                  {issued ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 rounded-xl border border-border bg-primary/10 p-3 text-sm text-foreground"
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>
                        {issuedIratszam ? (
                          <>
                            Iktatva: <b>{issuedIratszam}</b> — az iratszám bekerült a dokumentumba.
                            Most nyomtasd ki vagy mentsd PDF-be az iktatott példányt.
                          </>
                        ) : (
                          <>
                            Az irat iktatva lett, de a kiosztott számot nem sikerült visszaolvasni —
                            ellenőrizd az iktatókönyvben, és írd be kézzel az „Iratszám” mezőbe.
                          </>
                        )}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {!issued ? (
                      <Button
                        onClick={() => void handleIssue()}
                        disabled={issuing || loadingCtx}
                        className="w-full rounded-xl"
                      >
                        {issuing ? (
                          <>
                            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                            Iktatás folyamatban…
                          </>
                        ) : (
                          <>
                            <Stamp className="mr-1.5 size-4" aria-hidden />
                            Kiállítás és iktatás
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => void handlePrint()}
                          disabled={printing}
                        >
                          <Printer className="mr-1.5 size-4" aria-hidden />
                          Nyomtatás
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() => void handlePdf()}
                          disabled={printing}
                        >
                          <Download className="mr-1.5 size-4" aria-hidden />
                          PDF letöltése
                        </Button>
                      </div>
                    )}
                  </div>

                  {!issued ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                        Az alábbi gombokkal iktatás NÉLKÜL nyomtathatsz — az irat így nem kerül az
                        iktatókönyvbe, és nem kap hivatalos iratszámot.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handlePrint()}
                          disabled={printing || loadingCtx}
                        >
                          <Printer className="mr-1.5 size-4" aria-hidden />
                          Nyomtatás iktatás nélkül
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handlePdf()}
                          disabled={printing || loadingCtx}
                        >
                          <Download className="mr-1.5 size-4" aria-hidden />
                          PDF iktatás nélkül
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </div>

          {/* ── JOBB: élő A4 előnézet (fit-to-width) ─────────────── */}
          <div
            ref={previewPanelRef}
            tabIndex={-1}
            aria-label="Élő A4 előnézet"
            className={cn(
              'p-4 outline-none sm:p-5 lg:block',
              mobileView === 'preview' ? 'block' : 'hidden',
            )}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Élő előnézet (A4 álló)
            </p>
            <div
              ref={previewBoxRef}
              className="max-h-[72vh] min-h-[280px] overflow-y-auto rounded-2xl border border-border bg-muted p-3"
            >
              <div
                className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
                style={{ width: scaledW || undefined, height: scaledH || undefined }}
              >
                <iframe
                  ref={iframeRef}
                  onLoad={measurePreview}
                  title="Dokumentum előnézet"
                  srcDoc={iframeHtml}
                  style={{
                    width: A4_PORTRAIT_W,
                    height: contentH,
                    border: '0',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    background: '#fff',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
