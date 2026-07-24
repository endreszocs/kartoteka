'use client'

/**
 * Igazolás / hivatalos levél kiállító és iktató (2026-07, F6 redesign — K4).
 *
 * Lépéses felépítés (balra vezérlők, jobbra élő A4-előnézet; lg alatt fül-váltó):
 *  (a) sablon-választó — a meglévő iktató-sablonok + „Szabad levél" üres törzzsel,
 *  (b) személy-kereső — több személy (pl. házaspár) kiválasztható chip-listával,
 *      az anyakönyvi adatok (szemely-actions) automatikusan töltik a placeholdereket;
 *      a személyi kartonról nyitva az `initialPersonIds` prop előre betölti a tagot,
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
 * Tárgy-sor (2026-07, F8a): a „Szám: …" sor ALÁ a keret strukturálisan
 * beírja a „Tárgy: {tárgy}" sort az iktatókönyvi tárgy-mező értékével.
 * Duplikátum-őr: ha a törzs ELEJE már tartalmaz saját „Tárgy:" szöveget
 * (régi, DB-ben maradt seed-sablonok / egyedi sablonok), a keret kihagyja.
 *
 * WYSIWYG: az előnézet, a PDF és a nyomtatás UGYANAZT a HTML-t kapja
 * (fit-to-width A4 iframe, a worklog-print-dialog mintája szerint).
 *
 * 2026-07-25 (F8b — B4) két speciális mód:
 *  - ÉLETÚT-MÓD: a sablon-választó kiemelt „⭐ Életút- és családi igazolás"
 *    opciója — EGY személy, getEletutAdat betöltés, hiány-figyelmeztető panel
 *    nyomtatható TODO-listával (a kiállítás hiányok mellett is engedett,
 *    kitöltő-vonalakkal), kézi mezők (kérelmező/cél/sírhely/főgondnok), az
 *    előnézet a buildEletutIgazolasHtml háromnyelvű nyomtatványát mutatja,
 *    az iktatás a meglévő saveFilingEntry-úton történik.
 *  - ÁTADÁS-MÓD: az „Egyháztag átadása másik egyházközségnek" seed-sablon
 *    (név-alapú felismerés) cél-gyülekezet keresőt kap (searchCongregations,
 *    debounced) — a kiválasztott név a {{cel_gyulekezet}} placeholderbe kerül,
 *    sikeres iktatás után pedig a registerAtadas rögzíti az átadás tényét
 *    (tag-státusz „elköltözött" + átjelentkezési értesítés a cél-gyülekezetnek).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Download,
  ListChecks,
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
  seedDefaultFilingTemplates,
} from '@/app/(dashboard)/iktato/template-actions'
import {
  getCongregationHeader,
  getPersonCertificateData,
  searchPersonsForCertificate,
} from '@/app/(dashboard)/iktato/szemely-actions'
import { getEletutAdat } from '@/app/(dashboard)/iktato/eletut-actions'
import { registerAtadas, searchCongregations } from '@/app/(dashboard)/iktato/atadas-actions'
import {
  PLACEHOLDER_DOCS,
  buildAutoValues,
  escapeHtml,
  extractPlaceholders,
  formatHungarianDate,
  renderTemplate,
  type FilingTemplate,
  type TemplateType,
} from '@/lib/filing/templates'
import { buildLetterheadHtml, LETTERHEAD_LANGS } from '@/lib/iktato/letterheads'
import { buildEletutIgazolasHtml, buildEletutTodoHtml } from '@/lib/iktato/eletut-igazolas'
import type { EletutAdat, EletutHiany, EletutIgazolasData } from '@/lib/iktato/eletut-types'
import type { CongregationSearchHit } from '@/lib/iktato/atadas-types'
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

/** Az életút-/családi igazolás (F8b) speciális mód virtuális azonosítója. */
const ELETUT_ID = '__eletut_igazolas__'

/** Az egyháztag-átadás flow-t bekapcsoló seed-sablon neve (név-alapú felismerés). */
const ATADAS_SABLON_NEV = 'Egyháztag átadása másik egyházközségnek'

/** Az életút-igazolás alapértelmezett kiállítási célja (cél-záradék). */
const ELETUT_CEL_ALAPERTEK = 'hatósági felhasználás'

/**
 * Üres fejléc-fallback az életút-nyomtatványhoz: fejléc-betöltési hibánál a
 * nyomtatvány kitöltő-vonalas rovatokkal így is elkészül (a hibát a felület
 * külön jelzi) — a buildEletutIgazolasHtml kötelező header-paramétere miatt.
 */
const URES_FEJLEC: CongregationHeaderData = {
  hivatalosNev: '',
  nevHu: null,
  nevRo: null,
  nevEn: null,
  cimHu: null,
  cimRo: null,
  telefon: null,
  email: null,
  cif: null,
  web: null,
  cimerUrl: null,
}

/** Legfeljebb ennyi személy választható ki (pl. házaspár + 2 gyermek). */
const MAX_PERSONS = 4

/** Fit-to-page előnézet: A4 álló lap méretei képpontban (~96 dpi + ráhagyás). */
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
 * Életút-mód, még kiválasztott személy nélkül: A4-es tájékoztató lap az
 * előnézet-iframe-be (a fit-to-page méretezés így is helyesen működik).
 */
function eletutUresElonezetHtml(): string {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>Életút- és családi igazolás</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; background: #fff; }
  .lap { width: 210mm; min-height: 297mm; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 25mm; font-family: 'Times New Roman', Georgia, serif; font-size: 13pt; color: #64748b; text-align: center; }
</style>
</head>
<body data-sheet-count="1">
<div class="lap">Válassz ki egy egyháztagot a keresővel — a háromnyelvű életút-igazolás élő előnézete itt jelenik meg.</div>
</body>
</html>`
}

/**
 * Duplikátum-őr a keret Tárgy-sorához: ha a törzs ELEJÉN már van saját
 * „Tárgy:" szöveg (egyedi/régi sablonok), a keret NEM tesz rá másodikat.
 * A vizsgált ablak 400 karakter (nem ~200): a régi, DB-ben maradt
 * seed-sablonokban a belső Tárgy-címsor a nyitó div-ek inline stílusai
 * MIATT kb. a 240–250. karakternél kezdődik.
 */
function bodyHasOwnTargy(body: string): boolean {
  // Mindhárom fejléc-nyelv címkéjét felismerjük (régi/egyedi sablonok védelme).
  return /(Tárgy|Obiect|Subject)\s*:/i.test(body.slice(0, 400))
}

// A keret „Szám:" és „Tárgy:" címkéi a fejléc nyelvét követik (2026-07-25,
// user-visszajelzés): román irathoz „Nr. / Obiect", angolhoz „No. / Subject".
const KERET_CIMKEK: Record<LetterheadLang, { szam: string; targy: string }> = {
  hu: { szam: 'Szám', targy: 'Tárgy' },
  ro: { szam: 'Nr.', targy: 'Obiect' },
  en: { szam: 'No.', targy: 'Subject' },
}

/**
 * A dokumentum-sablon összeállítása a törzsből:
 *  - Szabad levélnél a plain-text törzs pre-wrap wrapperbe kerül,
 *  - „Szám: {{iratszam}}" sor, ha a törzsben nincs iratszám,
 *  - „Tárgy: {tárgy}" sor a „Szám: …" sor ALATT (2026-07, F8a) — az
 *    iktatókönyvi tárgy-mező értékével; a bodyHasOwnTargy-őr védi a
 *    duplázástól a saját Tárgy-sorral bíró (régi/egyedi) sablonokat,
 *  - automatikus záró blokk (helység+dátum+aláírás), ha nincs {{lelkipasztor}}.
 * Az eredmény MÉG placeholderes — a renderTemplate tölti ki.
 * ⚠️ A keret-részek átmennek a sanitizeFilingHtml-en → csak a whitelistelt
 * style-property-k használhatók bennük (padding, margin-top, font-*, …).
 */
function buildAssembledTemplate(
  body: string,
  opts: { szabad: boolean; hasLetterhead: boolean; targy: string; lang: LetterheadLang },
): string {
  const hasIratszam = /\{\{\s*iratszam\s*\}\}/.test(body)
  const hasClosing = /\{\{\s*lelkipasztor\s*\}\}/.test(body)
  const topPad = opts.hasLetterhead ? 8 : 36
  const cimkek = KERET_CIMKEK[opts.lang]

  const targyText = (opts.targy || '').trim()
  const wantsTargy = Boolean(targyText) && !bodyHasOwnTargy(body)
  // A törzs BELSEJÉBE fűzött változat a sablon-wrapper Times-betűjét örökli;
  // az önálló (keret-szintű) változat a „Szám:" keret-sor stílusát követi.
  const targyInBodyLine = `<div style="margin-top:4px;">${cimkek.targy}: ${escapeHtml(targyText)}</div>`
  const targyStandaloneLine = `<div style="padding:6px 50px 0;${TIMES_FONT}font-size:14px;">${cimkek.targy}: ${escapeHtml(targyText)}</div>`

  const parts: string[] = []
  if (!hasIratszam) {
    parts.push(
      `<div style="padding:${topPad}px 50px 0;${TIMES_FONT}font-size:14px;">${cimkek.szam}: {{iratszam}}</div>`,
    )
    if (wantsTargy) parts.push(targyStandaloneLine)
  }

  let assembledBody = body
  if (hasIratszam && wantsTargy) {
    // A sablon-törzs saját „Szám: {{iratszam}}" / „Nr.: {{iratszam}}" sora ALÁ
    // fűzzük a Tárgy-sort (a seed-sablonok egy-elemű div-sora). Ha a minta nem
    // illeszkedik (egyedi markup), a Tárgy-sor a törzs ELÉ kerül keret-sorként.
    const iratszamLine = /<div[^>]*>[^<]*\{\{\s*iratszam\s*\}\}[^<]*<\/div>/
    if (iratszamLine.test(assembledBody)) {
      // Csere-FÜGGVÉNNYEL, nem csere-stringgel: a tárgy-szöveg `$`-jeleit a
      // String.replace különben speciális mintaként ($&, $1, …) értelmezné.
      assembledBody = assembledBody.replace(iratszamLine, (m) => `${m}\n  ${targyInBodyLine}`)
    } else {
      parts.push(targyStandaloneLine)
    }
  }

  if (opts.szabad) {
    parts.push(
      `<div style="padding:24px 50px 0;${TIMES_FONT}line-height:1.6;font-size:14px;white-space:pre-wrap;">${assembledBody}</div>`,
    )
  } else {
    parts.push(assembledBody)
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
  /** 2026-07-24 (W2): megnyitáskor automatikusan betöltendő személy-id-k
   *  (pl. a személyi karton „Igazolás kiállítása" gombja a tag id-jét adja át).
   *  Hibánál toast — a kereső ilyenkor is üresen használható marad. */
  initialPersonIds?: number[]
}

export function CertificateIssueDialog({ open, onOpenChange, year, onIssued, initialPersonIds }: CertificateIssueDialogProps) {
  // (a) sablonok
  const [templates, setTemplates] = useState<FilingTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>(FREE_LETTER_ID)
  const [body, setBody] = useState('')
  // 2026-07-25 (éles teszt): az üres listánál futó automatikus seed nem
  // sikerült → diszkrét hint a választó alatt (nem hangos hiba).
  const [templateSeedFailed, setTemplateSeedFailed] = useState(false)

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

  // ── Életút-mód (F8b — B4): adat + hiányok + kézi mezők ───────────
  const [eletutAdat, setEletutAdat] = useState<EletutAdat | null>(null)
  const [eletutHianyok, setEletutHianyok] = useState<EletutHiany[]>([])
  const [eletutError, setEletutError] = useState<string | null>(null)
  const [eletutLoading, setEletutLoading] = useState(false)
  const [eletutKerelmezo, setEletutKerelmezo] = useState('')
  const [eletutCel, setEletutCel] = useState(ELETUT_CEL_ALAPERTEK)
  const [eletutSirhely, setEletutSirhely] = useState('')
  const [eletutFogondnok, setEletutFogondnok] = useState('')

  // ── Átadás-mód (F8b — B4): cél-egyházközség kereső ───────────────
  const [congQuery, setCongQuery] = useState('')
  const [congSearching, setCongSearching] = useState(false)
  const [congHits, setCongHits] = useState<CongregationSearchHit[]>([])
  const [congError, setCongError] = useState<string | null>(null)
  const [celCongregation, setCelCongregation] = useState<CongregationSearchHit | null>(null)

  // mobil fül-váltó + fókusz a lépés/fül-váltásnál (a11y)
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form')
  const formPanelRef = useRef<HTMLDivElement>(null)
  const previewPanelRef = useRef<HTMLDivElement>(null)

  const szabad = templateId === FREE_LETTER_ID
  const eletutMode = templateId === ELETUT_ID
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  )
  // Átadás-mód: NÉV-alapú felismerés a seed-sablonra (a régi, DB-ben maradt
  // példányok id-je gyülekezetenként más — a név viszont stabil).
  const atadasMode =
    !szabad && !eletutMode && (selectedTemplate?.nev || '').trim() === ATADAS_SABLON_NEV
  const docTitle = eletutMode
    ? 'Életút- és családi igazolás'
    : selectedTemplate?.nev || 'Szabad levél'
  const nevek = useMemo(() => joinNamesHu(persons.map((p) => p.teljesNev)), [persons])
  // Az életút-igazolás a 2. ügykörbe tartozik (anya- és családkönyvi igazolások).
  const ugykorKod: string | null = eletutMode
    ? '2.'
    : szabad
      ? '1.'
      : (selectedTemplate ? TIPUS_UGYKOR[selectedTemplate.tipus] ?? null : null)

  // 2026-07-24 (W2): a kezdeti személy-id-k STABIL kulcsa — a tömb-identitás
  // renderenként változhat (a szülő pl. inline `[member.id]`-t ad át), a
  // join-olt string nem, így a megnyitási reset-effekt NEM fut újra (és nem
  // resetel) minden szülő-rendernél, csak nyitáskor / tényleges id-váltásnál.
  const initialIdsKey = (initialPersonIds || [])
    .filter((n) => Number.isInteger(n))
    .join(',')

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
    setLoadingPersons(false) // zárás közben félbemaradt betöltés jelzője ne ragadjon be
    setTemplateSeedFailed(false) // az előző megnyitás seed-hintje ne ragadjon át
    // F8b: az életút- és átadás-mód állapota se ragadjon át az előző kiállításból.
    setEletutAdat(null)
    setEletutHianyok([])
    setEletutError(null)
    setEletutLoading(false)
    setEletutKerelmezo('')
    setEletutCel(ELETUT_CEL_ALAPERTEK)
    setEletutSirhely('')
    setEletutFogondnok('')
    setCongQuery('')
    setCongHits([])
    setCongError(null)
    setCongSearching(false)
    setCelCongregation(null)

    // 2026-07-24 (W2): személyi kartonról nyitva a kezdeti személy(ek)
    // betöltése a teljes reset UTÁN — hibánál toast, és a persons üres marad
    // (a kereső ettől még használható). A cancelled-őr a zárás/újranyitás
    // közben beérkező elavult választ dobja el.
    if (initialIdsKey) {
      const ids = initialIdsKey.split(',').map(Number)
      setLoadingPersons(true)
      void getPersonCertificateData(ids).then((res) => {
        if (cancelled) return
        setLoadingPersons(false)
        if (res.error) {
          toast.error(res.error)
          return
        }
        setPersons(res.persons)
      })
    }

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
      let tplList = tplRes.data || []
      let seedFailed = false

      // 2026-07-25 (éles teszt: üres sablon-lista): ha a gyülekezetben még
      // EGYETLEN sablon sincs (és a lekérés nem hibázott), a 11 alapsablont
      // automatikusan betöltjük, majd újratöltjük a listát — a kiállító ne
      // induljon üres választóval. Ha a seed nem sikerül (pl. jogosultság
      // híján), NEM hibázunk hangosan: diszkrét hint jelzi a választó alatt,
      // hogy a Sablonok fülön pótolható. Cancel-őr minden await után.
      if (!tplRes.error && tplList.length === 0) {
        const seedRes = await seedDefaultFilingTemplates()
        if (cancelled) return
        if (seedRes.error) {
          seedFailed = true
        } else {
          const reloadRes = await listFilingTemplates()
          if (cancelled) return
          if (!reloadRes.error && (reloadRes.data || []).length > 0) {
            tplList = reloadRes.data || []
            toast.success('A 11 alapsablon automatikusan betöltésre került.')
          } else {
            seedFailed = true
          }
        }
      }
      setTemplates(tplList)
      setTemplateSeedFailed(seedFailed)

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
  }, [open, initialIdsKey])

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

  // ── Életút-mód: a kiválasztott EGY személy teljes életútjának betöltése ──
  // A mezoId-séma és a hiány-lista a B1-kontraktusból (eletut-actions) jön;
  // a cancelled-őr a mód-/személy-váltás közben beérkező elavult választ dobja el.
  const eletutPersonId = eletutMode ? (persons[0]?.id ?? null) : null
  useEffect(() => {
    if (!open || eletutPersonId == null) {
      setEletutAdat(null)
      setEletutHianyok([])
      setEletutError(null)
      setEletutLoading(false)
      return
    }
    let cancelled = false
    setEletutLoading(true)
    setEletutError(null)
    void getEletutAdat(eletutPersonId).then((res) => {
      if (cancelled) return
      setEletutLoading(false)
      setEletutAdat(res.adat)
      setEletutHianyok(res.hianyok)
      setEletutError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [open, eletutPersonId])

  // ── Átadás-mód: debounced cél-egyházközség keresés (searchCongregations) ──
  // A személy-kereső sequence-mintáját követi (elavult/szellem-válasz védelem).
  const congSeq = useRef(0)
  useEffect(() => {
    if (!open || !atadasMode) {
      congSeq.current++
      return
    }
    const q = congQuery.trim()
    if (q.length < 2) {
      congSeq.current++
      setCongHits([])
      setCongSearching(false)
      setCongError(null)
      return
    }
    const mySeq = ++congSeq.current
    setCongSearching(true)
    const t = window.setTimeout(() => {
      void searchCongregations(q).then((res) => {
        if (mySeq !== congSeq.current) return // elavult válasz
        setCongHits(res.results)
        setCongError(res.error)
        setCongSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, atadasMode, congQuery])

  function selectCelCongregation(hit: CongregationSearchHit) {
    setCelCongregation(hit)
    // A kiválasztott név a {{cel_gyulekezet}} placeholderbe kerül (a mező-
    // űrlapon kézzel tovább finomítható, pl. hivatalos hosszú név).
    setManualValues((prev) => ({ ...prev, cel_gyulekezet: hit.nev }))
    setCongQuery('')
    setCongHits([])
  }

  function clearCelCongregation() {
    setCelCongregation(null)
    setManualValues((prev) => {
      const next = { ...prev }
      delete next.cel_gyulekezet
      return next
    })
  }

  async function addPerson(hit: CertificatePersonHit) {
    if (persons.some((p) => p.id === hit.id)) return
    // Életút-módban EGY személy választható: az új kiválasztás LECSERÉLI az
    // előzőt (az életút-adatokat a személy-váltásra figyelő effekt tölti újra).
    if (eletutMode) {
      setLoadingPersons(true)
      const res = await getPersonCertificateData([hit.id])
      setLoadingPersons(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setPersons(res.persons)
      setSearchQuery('')
      setHits([])
      return
    }
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
    setBody(nextId === FREE_LETTER_ID || nextId === ELETUT_ID ? '' : tpl?.tartalom || '')
    // Életút-módban EGY személy választható — a többes kiválasztásból az
    // 1. személy marad (az adat-betöltést a személy-figyelő effekt indítja).
    if (nextId === ELETUT_ID) setPersons((prev) => prev.slice(0, 1))
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
    // 2026-07 (F8a): az iktatókönyvi tárgy a keret „Tárgy: …" soraként a
    // dokumentumba is bekerül (a „Szám: …" sor alá) — lásd buildAssembledTemplate.
    () => buildAssembledTemplate(body, { szabad, hasLetterhead: Boolean(lang && header), targy: subject, lang: lang || 'hu' }),
    [body, szabad, lang, header, subject],
  )
  const placeholders = useMemo(() => extractPlaceholders(assembledRaw), [assembledRaw])
  const autoKeys = useMemo(() => {
    const set = new Set<string>()
    for (const p of PLACEHOLDER_DOCS) if (p.auto) set.add(p.key)
    return set
  }, [])

  // A sablon-alapú (nem-életút) dokumentum összeállítása ADOTT értékekkel —
  // a fullHtml memo ÉS az átadás-regisztráció (végleges, iratszámos példány)
  // is ezt hívja, így a kettő garantáltan ugyanazt a HTML-t kapja.
  const composeStandardHtml = useCallback(
    (values: Record<string, string>) => {
      // A sablon-törzs admin/lelkész által szerkesztett → sanitize (P1-3b minta);
      // az app-generált fejléc és a renderTemplate-escape-elt értékek megbízhatók.
      // Előnézet, PDF és nyomtatás UGYANEZT a HTML-t kapja (WYSIWYG).
      const sanitized = sanitizeFilingHtml(assembledRaw)
      const rendered = renderTemplate(sanitized, values)
      const letterhead =
        lang && header ? `<div style="padding:36px 50px 0;">${buildLetterheadHtml(lang, header)}</div>` : ''
      return `<!DOCTYPE html>
<html lang="${lang === 'ro' ? 'ro' : lang === 'en' ? 'en' : 'hu'}">
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
    },
    [assembledRaw, lang, header, docTitle],
  )

  // Az életút-igazolás B2-adatcsomagja: a betöltött adat + a kézi mezők.
  // A kézi sírhely-szöveg CSAK akkor kerül a nyomtatványra, ha a Sírhelyek
  // modul láncából nem jött strukturált érték (az adat-forrás az elsődleges).
  const eletutIgazolasData = useMemo<EletutIgazolasData | null>(() => {
    if (!eletutAdat) return null
    const sirhelyKezi = eletutSirhely.trim()
    const adat =
      !eletutAdat.sirhely && sirhelyKezi ? { ...eletutAdat, sirhely: sirhelyKezi } : eletutAdat
    return { adat, hianyok: eletutHianyok, kerelmezo: eletutKerelmezo, cel: eletutCel }
  }, [eletutAdat, eletutHianyok, eletutKerelmezo, eletutCel, eletutSirhely])

  const fullHtml = useMemo(() => {
    if (eletutMode) {
      if (!eletutIgazolasData) return eletutUresElonezetHtml()
      // A háromnyelvű nyomtatvány a saját (mindig magyar levélfej + 3-nyelvű
      // egyház-lánc) fejlécét építi — a (c) fejléc-választó itt nem érvényes.
      return buildEletutIgazolasHtml({
        data: eletutIgazolasData,
        header: header ?? URES_FEJLEC,
        iratszam: issuedIratszam, // null → kitöltő-vonal a nyomtatványon
        helyseg: autoValues.helyseg || '',
        datum: autoValues.datum || formatHungarianDate(),
        lelkipasztor: autoValues.lelkipasztor || '',
        fogondnok: eletutFogondnok.trim() || null,
      })
    }
    return composeStandardHtml(mergedValues)
  }, [
    eletutMode,
    eletutIgazolasData,
    header,
    issuedIratszam,
    autoValues,
    eletutFogondnok,
    composeStandardHtml,
    mergedValues,
  ])
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

  // ── Fit-to-page A4 előnézet ──────────────────────────────────────
  // 2026-07-25 (éles teszt): korábban csak a SZÉLESSÉGHEZ igazítottunk, így
  // az oldal alja kilógott és két irányban kellett görgetni. Most a panel
  // TÉNYLEGES belső méretét (contentRect: szélesség ÉS magasság, padding
  // nélkül) mérjük — a doboz fix magasságú, így a mérés nem körkörös. A
  // mobil fül-váltásnál a rejtett panel 0×0-t jelentene, azt eldobjuk.
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!open) return
    const el = previewBoxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        setBoxSize({ w: rect.width, h: rect.height })
      }
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

  // Fit-to-page: a lap a rendelkezésre álló szélesség ÉS magasság közül a
  // SZŰKEBBHEZ igazodik — egy A4 oldal MINDIG egészben látszik, vízszintes
  // scrollbar semmilyen méretnél nincs. A -4px a lap-wrapper 1px-es keretét
  // és a kerekítést fedezi. Többoldalas dokumentumnál a további oldalak a
  // külső panel FÜGGŐLEGES görgetésével jönnek, ugyanazon a scale-en.
  const availW = boxSize.w > 0 ? Math.max(0, boxSize.w - 4) : A4_PORTRAIT_W
  const availH = boxSize.h > 0 ? Math.max(0, boxSize.h - 4) : A4_PORTRAIT_H
  const scale = Math.min(1, availW / A4_PORTRAIT_W, availH / A4_PORTRAIT_H)
  const scaledW = Math.floor(A4_PORTRAIT_W * scale)
  const scaledH = Math.ceil(contentH * scale)

  // ── Átadás rögzítése iktatás után (F8b — B3 registerAtadas) ──────
  // Csak sikeres iktatás + visszaolvasott iratszám után hívjuk: a tag státusza
  // „elköltözött" lesz, a cél-gyülekezet átjelentkezési kérelmet + best-effort
  // részletes üzenetet kap (a warnings nem-blokkoló jelzések).
  async function runRegisterAtadas(iratszam: string) {
    const szemely = persons[0]
    const cel = celCongregation
    if (!szemely || !cel) return // a handleIssue-őr miatt nem fordulhat elő
    // A végleges (iratszámos) dokumentum szövege megy az értesítés törzsébe.
    const finalHtml = composeStandardHtml({
      ...autoValues,
      ...personValues,
      ...manualValues,
      iratszam,
    })
    const res = await registerAtadas({
      szemelyId: szemely.id,
      celCongregationId: cel.id,
      iktatoszam: iratszam,
      dokumentumHtml: finalHtml,
    })
    if (res.success) {
      toast.success(
        `Átadás rögzítve: ${szemely.teljesNev} státusza „elköltözött” lett, a(z) ${cel.nev} átjelentkezési értesítést kapott (${iratszam}).`,
      )
    } else {
      toast.error(
        res.error ||
          'Az átadás rögzítése sikertelen — az igazolás iktatva maradt, az átadást a Tagnyilvántartásban rögzítsd kézzel.',
      )
    }
    for (const w of res.warnings) toast.warning(w)
  }

  // ── Az életút-igazolás hiány-TODO-listájának nyomtatása ──────────
  async function handleTodoPrint() {
    if (eletutHianyok.length === 0) return
    setPrinting(true)
    try {
      await printToBrowser(buildEletutTodoHtml(eletutHianyok, persons[0]?.teljesNev || ''))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A TODO-lista nyomtatása nem indítható.')
    } finally {
      setPrinting(false)
    }
  }

  // ── Kiállítás és iktatás ─────────────────────────────────────────
  async function handleIssue() {
    if (issuing || issued) return // dupla-kattintás védelem
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) {
      toast.error('Az iktatókönyvi tárgy kötelező.')
      return
    }
    if (eletutMode && (!persons[0] || !eletutIgazolasData)) {
      toast.error('Az életút-igazoláshoz válassz ki egy egyháztagot, és várd meg az adatok betöltését.')
      return
    }
    if (atadasMode && (!persons[0] || !celCongregation)) {
      toast.error('Az átadási sablonhoz válaszd ki az átadott egyháztagot ÉS a cél-egyházközséget.')
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
        // Átadás-mód: az iktatószám birtokában rögzítjük az átadás tényét is.
        if (atadasMode) await runRegisterAtadas(iratszam)
      } else {
        toast.warning(
          'Az irat iktatva lett, de a kiosztott iratszámot nem sikerült visszaolvasni — ellenőrizd az iktatókönyvben, és írd be kézzel.',
        )
        if (atadasMode) {
          toast.warning(
            'Az átadás rögzítése iktatószám nélkül nem lehetséges — a cél-gyülekezet értesítése elmaradt; rögzítsd az átadást a Tagnyilvántartásban.',
          )
        }
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
                    {/* F8b: kiemelt speciális mód a sablonok ELŐTT. */}
                    <option value={ELETUT_ID}>⭐ Életút- és családi igazolás (3 nyelvű, hivatalos)</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nev}
                      </option>
                    ))}
                  </select>
                  {eletutMode ? (
                    <p className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-snug text-foreground">
                      Hivatalos, háromnyelvű (magyar–román–angol) igazolás egy egyháztag teljes
                      egyházi életútjáról és családjáról, anyakönyvi hivatkozásokkal — akár
                      hatósági/bírósági felhasználásra. A szerkezete kötött; a hiányzó rovatok
                      kitöltő-vonallal nyomtatódnak.
                    </p>
                  ) : null}
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {templateSeedFailed
                        ? 'Nincsenek sablonok — a Sablonok fülön pótolhatók.'
                        : 'Még nincsenek sablonok — a Sablonok fülön betöltheted az alapértelmezetteket, vagy írj szabad levelet.'}
                    </p>
                  ) : null}
                </section>

                {/* (b) Személyek */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {eletutMode ? '2. Egyháztag (egy személy)' : '2. Személyek (anyakönyvből)'}
                  </h3>
                  {eletutMode ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Az életút-igazolás EGY személyről szól — új kiválasztás lecseréli az előzőt.
                    </p>
                  ) : null}

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

                {/* (b/2) Átadás-mód: cél-egyházközség kereső (F8b — B4) */}
                {atadasMode ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      2/b. Cél-egyházközség (átadás)
                    </h3>

                    {celCongregation ? (
                      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted px-2.5 py-1.5 text-sm text-foreground">
                        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {celCongregation.nev}
                          {celCongregation.megye ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({celCongregation.megye})
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={clearCelCongregation}
                          aria-label="Cél-egyházközség törlése"
                          className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Building2
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
                          <Input
                            value={congQuery}
                            onChange={(e) => setCongQuery(e.target.value)}
                            placeholder="Gyülekezet neve (min. 2 betű)…"
                            aria-label="Cél-egyházközség keresése"
                            className="pl-9"
                          />
                        </div>
                        {congSearching ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Keresés…
                          </p>
                        ) : congError ? (
                          <p className="text-xs text-destructive">{congError}</p>
                        ) : congHits.length > 0 ? (
                          <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
                            {congHits.map((hit) => (
                              <li key={hit.id}>
                                <button
                                  type="button"
                                  onClick={() => selectCelCongregation(hit)}
                                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                                >
                                  <span className="min-w-0 truncate font-medium">{hit.nev}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {hit.megye || '—'}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : congQuery.trim().length >= 2 ? (
                          <p className="text-xs text-muted-foreground">Nincs találat.</p>
                        ) : null}
                      </>
                    )}

                    <p className="text-[11px] leading-snug text-muted-foreground">
                      A kiválasztott név a {'{{cel_gyulekezet}}'} mezőbe kerül. Az iktatás után a
                      rendszer rögzíti az átadás tényét: a tag státusza „elköltözött” lesz, a
                      cél-egyházközség lelkésze pedig átjelentkezési értesítést kap az
                      iktatószámmal.
                    </p>
                  </section>
                ) : null}

                {!eletutMode ? (
                  <>
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
                  </>
                ) : (
                  /* ── Életút-mód: hiány-panel + kézi mezők (a (c)/(d) helyett) ── */
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      3. Az igazolás adatai
                    </h3>

                    {!persons[0] ? (
                      <p className="text-xs text-muted-foreground">
                        Válassz ki egy egyháztagot a fenti keresővel — az életút-adatok
                        (keresztelés, konfirmáció, házasság, gyermekek, elhalálozás, sírhely)
                        automatikusan betöltődnek az anyakönyvi nyilvántartásból.
                      </p>
                    ) : eletutLoading ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Életút-adatok
                        betöltése…
                      </p>
                    ) : eletutError ? (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {eletutError}
                      </p>
                    ) : eletutAdat ? (
                      <>
                        {eletutHianyok.length > 0 ? (
                          <div className="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                              {eletutHianyok.length} hiányzó adat — az igazolás így is kiállítható
                              (a hiányzó rovatok kitöltő-vonallal nyomtatódnak), de érdemes előbb
                              pótolni:
                            </p>
                            <ul className="max-h-44 space-y-1 overflow-y-auto pl-1 text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/90">
                              {eletutHianyok.map((h) => (
                                <li key={h.mezoId}>
                                  <b>{h.cimke}</b> —{' '}
                                  <span className="opacity-80">{h.hovaVezesse}</span>
                                </li>
                              ))}
                            </ul>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => void handleTodoPrint()}
                              disabled={printing}
                            >
                              <ListChecks className="mr-1.5 size-4" aria-hidden />
                              TODO-lista nyomtatása
                            </Button>
                          </div>
                        ) : (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                            Minden kötelező adat megvan az anyakönyvi nyilvántartásban.
                          </p>
                        )}

                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-kerelmezo"
                              className="text-sm font-medium text-foreground"
                            >
                              Kérelmező neve
                            </label>
                            <Input
                              id="eletut-kerelmezo"
                              value={eletutKerelmezo}
                              onChange={(e) => setEletutKerelmezo(e.target.value)}
                              placeholder="Üresen: „nevezett / jogosult hozzátartozója”"
                            />
                          </div>
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-cel"
                              className="text-sm font-medium text-foreground"
                            >
                              A kiállítás célja
                            </label>
                            <Input
                              id="eletut-cel"
                              value={eletutCel}
                              onChange={(e) => setEletutCel(e.target.value)}
                              placeholder={ELETUT_CEL_ALAPERTEK}
                            />
                          </div>
                          {eletutAdat.szemely.elhunyt && !eletutAdat.sirhely ? (
                            <div className="space-y-1">
                              <label
                                htmlFor="eletut-sirhely"
                                className="text-sm font-medium text-foreground"
                              >
                                Sírhely (kézzel)
                              </label>
                              <Input
                                id="eletut-sirhely"
                                value={eletutSirhely}
                                onChange={(e) => setEletutSirhely(e.target.value)}
                                placeholder="pl. Református temető, A parcella, 3. sor, 12. sírhely"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                A Sírhelyek modulban nincs hozzárendelés — az itt megadott szöveg
                                kerül a nyomtatvány nyughely-rovatába.
                              </p>
                            </div>
                          ) : null}
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-fogondnok"
                              className="text-sm font-medium text-foreground"
                            >
                              Főgondnok neve (opcionális)
                            </label>
                            <Input
                              id="eletut-fogondnok"
                              value={eletutFogondnok}
                              onChange={(e) => setEletutFogondnok(e.target.value)}
                              placeholder="Üresen a vonal kézi aláírásra marad"
                            />
                          </div>
                        </div>
                      </>
                    ) : null}

                    {headerError ? (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {headerError} — a nyomtatvány fejléc-adatai kitöltő-vonallal készülnek.
                      </p>
                    ) : null}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Az igazolás mindig a hivatalos, háromnyelvű nyomtatványként készül (magyar
                      levélfej + HU/RO/EN mezőfeliratok) — a fejléc- és mező-beállítások itt nem
                      érvényesek.
                    </p>
                  </section>
                )}

                {/* Iktatás */}
                <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {eletutMode ? '4.' : '5.'} Kiállítás és iktatás
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
                          disabled={printing || loadingCtx || (eletutMode && !eletutIgazolasData)}
                        >
                          <Printer className="mr-1.5 size-4" aria-hidden />
                          Nyomtatás iktatás nélkül
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handlePdf()}
                          disabled={printing || loadingCtx || (eletutMode && !eletutIgazolasData)}
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
            {/* FIX magasságú panel (mobilon kisebb — ott a sticky fejléc +
                fül-váltó is helyet foglal): a ResizeObserver így a tényleges
                panel-magasságot méri, és az alap-zoom a teljes első oldalt
                mutatja. Belső scrollbar csak függőlegesen, több oldalnál. */}
            <div
              ref={previewBoxRef}
              className="h-[60vh] min-h-[280px] overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-muted p-3 lg:h-[72vh]"
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
