'use client'

/**
 * Éves hivatalos lelkészi jelentés — szerkesztő-dialógus + véglegesítő wizard (F5/J4).
 *
 * Szerkezet:
 *  - Nyitáskor getLelkesziJelentes(ev): auto-mezők élő adatból + mentett kézi
 *    értékek/felülírások/határozat. Véglegesített jelentésnél a befagyasztott
 *    snapshot jön — minden mező csak olvasható.
 *  - lg-től két oszlop: balra fejezetenként összecsukható szerkesztő (I–X),
 *    jobbra élő A4-előnézet (iframe srcDoc, fit-to-width scale — a
 *    worklog-print-dialog mintája); lg alatt fül-váltó (Szerkesztés / Előnézet).
 *  - Auto-mezők: readonly kijelzés + „Felülírás" (ceruza → input, a felülírt
 *    érték jelölve + visszaállítható). Kézi mezők: input / textarea.
 *  - Mentés: explicit gomb (kezi + felulirasok + hatarozat — teljes csere).
 *  - Véglegesítő wizard a dialóguson belül (a számadás-wizard lépés-mintája):
 *    áttekintés → ellenőrzések (nem blokkoló) → határozat-adatok → megerősítés
 *    → véglegesítés → opcionális beküldés az egyházmegyének → kész.
 *  - PDF-mentés + nyomtatás: print-engine-v2, A4 álló, pdfMargin [0,0]
 *    (WYSIWYG — a lap-margót a dokumentum saját paddingje adja).
 *
 * MOBILE-FIRST + token-stílus (border-border / bg-card / text-foreground …),
 * sötét témában is helyes; az oldal sosem görget vízszintesen.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Pencil,
  PenLine,
  Printer,
  RotateCcw,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  FEJEZET_CIMEK,
  JELENTES_MEZOK,
  mezoErtek,
  type HatarozatAdatok,
  type JelentesFejezet,
  type JelentesMezo,
  type LelkesziJelentesData,
} from '@/lib/lelkeszi-jelentes/types'
import { buildLelkesziJelentesHtml } from '@/lib/lelkeszi-jelentes/print'
import {
  finalizeLelkesziJelentes,
  getLelkesziJelentes,
  requestJelentesUnlock,
  saveLelkesziJelentes,
  submitLelkesziJelentes,
} from '@/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

// ─────────────────────────────────────────────────────────────────────────
// Statikus segédstruktúrák
// ─────────────────────────────────────────────────────────────────────────

const FEJEZETEK: JelentesFejezet[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

const MEZO_BY_ID = new Map<string, JelentesMezo>(JELENTES_MEZOK.map((m) => [m.id, m]))

const FEJEZET_MEZOK = (() => {
  const map = new Map<JelentesFejezet, JelentesMezo[]>()
  for (const f of FEJEZETEK) map.set(f, [])
  for (const mezo of JELENTES_MEZOK) map.get(mezo.fejezet)!.push(mezo)
  return map
})()

/** A címlap/határozat űrlap mezői (wizard 3. lépés). */
const HATAROZAT_MEZOK: Array<{
  key: keyof HatarozatAdatok
  label: string
  type?: 'date'
  placeholder?: string
}> = [
  { key: 'presbiteriSzam', label: 'Presbitériumi határozat száma', placeholder: 'pl. 12/2026' },
  { key: 'presbiteriDatum', label: 'Presbitériumi tárgyalás dátuma', type: 'date' },
  { key: 'kozgyulesiSzam', label: 'Közgyűlési határozat száma', placeholder: 'pl. 3/2026' },
  { key: 'kozgyulesiDatum', label: 'Közgyűlési tárgyalás dátuma', type: 'date' },
  { key: 'egyhazkozsegiIktatoszam', label: 'Egyházközségi iktatószám', placeholder: 'pl. 45/2026' },
  { key: 'egyhazmegyeiIktatoszam', label: 'Egyházmegyei iktatószám' },
  { key: 'lelkipasztor', label: 'Lelkipásztor neve' },
  { key: 'fogondnok', label: 'Főgondnok / gondnok neve' },
]

// A4 álló lap-szélesség képpontban (96 dpi, kis ráhagyással) — a fit-to-width
// előnézet skálázásához (a worklog-print-dialog mintája).
const A4_PORTRAIT_W = 812
const PREVIEW_MIN_H = 1100
const PREVIEW_DEBOUNCE_MS = 400

type NezetMod = 'szerkeszto' | 'wizard'
type WizardLepes = 'attekintes' | 'ellenorzes' | 'hatarozat' | 'megerosites' | 'kesz'
type MobilNezet = 'szerkesztes' | 'elonezet'

type Ertekek = Record<string, number | string | null>

// ─────────────────────────────────────────────────────────────────────────
// Érték-formázás + mentés-normalizálás
// ─────────────────────────────────────────────────────────────────────────

function fmtSzam(n: number): string {
  return n.toLocaleString('hu-HU', { maximumFractionDigits: 2 })
}

/** Egy mező megjelenítendő szövege a UI-ban (üres string = nincs érték). */
function displayErtek(mezo: JelentesMezo, v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return `${fmtSzam(v)}${mezo.egyseg ? ` ${mezo.egyseg}` : ''}`
  return mezo.tipus === 'szam' && mezo.egyseg ? `${v} ${mezo.egyseg}` : String(v)
}

/**
 * Szerkesztés közben nyers stringeket tárolunk — mentéskor normalizálunk:
 * üres érték kimarad, a szám-mezők parse-olt számmá válnak (hu vessző is jó),
 * a nem értelmezhető szöveg szövegként marad (a szerver-akció úgyis szűri).
 */
function normalizeForSave(rec: Ertekek): Ertekek {
  const out: Ertekek = {}
  for (const [id, v] of Object.entries(rec)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'number') {
      out[id] = v
      continue
    }
    const s = String(v).trim()
    if (s === '') continue
    const mezo = MEZO_BY_ID.get(id)
    if (mezo?.tipus === 'szam') {
      const n = Number(s.replace(/\s/g, '').replace(',', '.'))
      out[id] = Number.isFinite(n) ? n : s
    } else {
      out[id] = s
    }
  }
  return out
}


// ─────────────────────────────────────────────────────────────────────────
// A dialógus
// ─────────────────────────────────────────────────────────────────────────

export function LelkesziJelentesDialog({
  open,
  onOpenChange,
  year,
  congregationName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  year: number
  congregationName?: string
}) {
  const [isPending, startTransition] = useTransition()

  // Betöltés
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<LelkesziJelentesData | null>(null)
  const [unlockRequested, setUnlockRequested] = useState(false)

  // Szerkesztő-állapot (nyers értékek — mentéskor normalizálunk)
  const [kezi, setKezi] = useState<Ertekek>({})
  const [felulirasok, setFelulirasok] = useState<Ertekek>({})
  const [hatarozat, setHatarozat] = useState<Partial<HatarozatAdatok>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // Megnyitott (de még üres) felülírás-inputok
  const [overrideOpen, setOverrideOpen] = useState<Set<string>>(new Set())
  const [openChapters, setOpenChapters] = useState<Set<JelentesFejezet>>(new Set(['I']))

  // Nézetek
  const [mode, setMode] = useState<NezetMod>('szerkeszto')
  const [wizardStep, setWizardStep] = useState<WizardLepes>('attekintes')
  const [mobileView, setMobileView] = useState<MobilNezet>('szerkesztes')

  // Debounced előnézet-adat (a tényleges HTML a previewHtml memo-ban készül)
  const [previewData, setPreviewData] = useState<LelkesziJelentesData | null>(null)

  // Feloldás-kérés + beküldés + nyomtatás
  const [unlockFormOpen, setUnlockFormOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockSending, setUnlockSending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)

  const readOnly = data?.statusz === 'veglegesitve'

  // ── Betöltés nyitáskor (queueMicrotask: nincs szinkron setState az effectben) ──
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setLoadError(null)
      setData(null)
      setKezi({})
      setFelulirasok({})
      setHatarozat({})
      setDirty(false)
      setOverrideOpen(new Set())
      setOpenChapters(new Set(['I']))
      setMode('szerkeszto')
      setWizardStep('attekintes')
      setMobileView('szerkesztes')
      setUnlockFormOpen(false)
      setUnlockReason('')
      setSubmitted(false)
      // Az előnézetet is nullázzuk — újranyitáskor ne az előző (akár másik évi)
      // jelentés villanjon fel, és az első render azonnali legyen (debounce nélkül).
      setPreviewData(null)
      void getLelkesziJelentes(year).then((res) => {
        if (cancelled) return
        if (res.error || !res.data) {
          setLoadError(res.error || 'A jelentés betöltése nem sikerült.')
          setLoading(false)
          return
        }
        setData(res.data)
        setKezi({ ...res.data.kezi })
        setFelulirasok({ ...res.data.felulirasok })
        setHatarozat({ ...res.data.hatarozat })
        setUnlockRequested(res.unlockRequested === true)
        setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, year])

  /** Csendes újratöltés (véglegesítés/feloldás után) — a nézetet nem resetteli. */
  async function reload() {
    const res = await getLelkesziJelentes(year)
    if (res.error || !res.data) {
      if (res.error) toast.error(res.error)
      return
    }
    setData(res.data)
    setKezi({ ...res.data.kezi })
    setFelulirasok({ ...res.data.felulirasok })
    setHatarozat({ ...res.data.hatarozat })
    setUnlockRequested(res.unlockRequested === true)
    setDirty(false)
  }

  // ── Élő adat (a szerkesztő-állapottal) + debounced előnézet ──
  const currentData: LelkesziJelentesData | null = useMemo(() => {
    if (!data) return null
    return { ...data, kezi, felulirasok, hatarozat }
  }, [data, kezi, felulirasok, hatarozat])

  useEffect(() => {
    if (!currentData) return
    // Első betöltéskor azonnal, gépelésre ~400 ms-os debounce-szal frissül.
    const first = previewData === null
    const t = window.setTimeout(() => setPreviewData(currentData), first ? 0 : PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData])

  const previewHtml = useMemo(
    () => (previewData ? buildLelkesziJelentesHtml(previewData) : ''),
    [previewData],
  )

  // ── Fit-to-width előnézet (a worklog-print-dialog mintája) ──
  const previewRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    if (!open) return
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((obsEntries) => {
      const w = obsEntries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, loading, loadError, mode, mobileView])

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(PREVIEW_MIN_H)
  const measurePreview = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    if (h > 0) setContentH(h)
  }

  const targetW = boxW > 0 ? Math.max(0, boxW - 20) : A4_PORTRAIT_W
  const scale = Math.min(1, targetW / A4_PORTRAIT_W)
  const scaledW = Math.round(A4_PORTRAIT_W * scale)
  const scaledH = Math.round(contentH * scale)

  // ── Szerkesztő-műveletek ──

  function setKeziErtek(id: string, raw: string) {
    setDirty(true)
    setKezi((prev) => {
      const next = { ...prev }
      if (raw === '') delete next[id]
      else next[id] = raw
      return next
    })
  }

  function setFelulirasErtek(id: string, raw: string) {
    setDirty(true)
    setFelulirasok((prev) => {
      const next = { ...prev }
      if (raw === '') delete next[id]
      else next[id] = raw
      return next
    })
  }

  function startOverride(id: string) {
    setOverrideOpen((prev) => new Set(prev).add(id))
  }

  function resetOverride(id: string) {
    setDirty(true)
    setFelulirasok((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setOverrideOpen((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function toggleChapter(f: JelentesFejezet) {
    setOpenChapters((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  /** Mentés — teljes csere (kezi + felulirasok + hatarozat). */
  async function handleSave(silent = false): Promise<boolean> {
    setSaving(true)
    const res = await saveLelkesziJelentes(year, {
      kezi: normalizeForSave(kezi),
      felulirasok: normalizeForSave(felulirasok),
      hatarozat,
    })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return false
    }
    setDirty(false)
    if (!silent) toast.success('A lelkészi jelentés mentve.')
    return true
  }

  /** Véglegesítés (wizard 4. lépés): előbb mentünk, a snapshot a mentett sorból készül. */
  function handleFinalize() {
    startTransition(async () => {
      const saved = await handleSave(true)
      if (!saved) return
      const res = await finalizeLelkesziJelentes(year)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`A(z) ${year}. évi lelkészi jelentés véglegesítve.`, { duration: 5000 })
      setWizardStep('kesz')
      await reload()
    })
  }

  async function handleSubmitToDiocese() {
    setSubmitting(true)
    const res = await submitLelkesziJelentes(year)
    setSubmitting(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setSubmitted(true)
    toast.success('A jelentés beküldve az egyházmegyének.')
  }

  async function handleUnlockRequest() {
    setUnlockSending(true)
    const res = await requestJelentesUnlock(year, unlockReason.trim() || null)
    setUnlockSending(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setUnlockRequested(true)
    setUnlockFormOpen(false)
    toast.success('A feloldási kérelem elküldve az egyházmegyének.')
  }

  async function handlePdf() {
    if (!currentData) return
    setPrinting(true)
    try {
      await printToPdf(buildLelkesziJelentesHtml(currentData), `Lelkeszi_jelentes_${year}.pdf`, {
        orientation: 'portrait',
        // WYSIWYG: a lap-margót a dokumentum saját paddingje adja.
        margin: [0, 0],
        format: 'a4',
      })
      toast.success('A lelkészi jelentés PDF elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    if (!currentData) return
    setSendingToPrinter(true)
    try {
      await printToBrowser(buildLelkesziJelentesHtml(currentData))
      toast.success('A böngésző nyomtatási előnézete megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás indítása nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  /** Bezárás-őr: nem mentett módosításnál rákérdezünk. */
  function handleOpenChange(next: boolean) {
    if (!next && dirty && !readOnly) {
      if (!confirm('Nem mentett módosítások vannak — biztosan bezárja a jelentést?')) return
    }
    onOpenChange(next)
  }

  // ── Wizard-ellenőrzések (nem blokkolók) ──

  const hianyzoKeziMezok = useMemo(() => {
    if (!currentData) return []
    return JELENTES_MEZOK.filter((m) => !m.auto).filter((m) => {
      const v = mezoErtek(currentData, m.id)
      return v === null || v === undefined || String(v).trim() === ''
    })
  }, [currentData])

  const hianyzoAutoMezok = useMemo(() => {
    if (!currentData) return []
    return JELENTES_MEZOK.filter((m) => m.auto).filter((m) => mezoErtek(currentData, m.id) === null)
  }, [currentData])

  const zarszamadasHianyzik = useMemo(
    () => (currentData ? mezoErtek(currentData, 'VII.6') === null : false),
    [currentData],
  )

  /** Kulcsszám az áttekintéshez / megerősítéshez. */
  function statErtek(id: string): string {
    const mezo = MEZO_BY_ID.get(id)
    if (!mezo || !currentData) return '—'
    const s = displayErtek(mezo, mezoErtek(currentData, id))
    return s === '' ? '—' : s
  }

  function kitoltottseg(f: JelentesFejezet): { filled: number; total: number } {
    const mezok = FEJEZET_MEZOK.get(f) || []
    let filled = 0
    if (currentData) {
      for (const m of mezok) {
        const v = mezoErtek(currentData, m.id)
        if (v !== null && v !== undefined && String(v).trim() !== '') filled += 1
      }
    }
    return { filled, total: mezok.length }
  }

  // ── Mező-sorok (szerkesztő) ──

  function renderAutoMezo(mezo: JelentesMezo) {
    const autoV = data?.auto[mezo.id] ?? null
    const felulV = felulirasok[mezo.id]
    const vanFeluliras = felulV !== undefined && felulV !== null && felulV !== ''
    const overrideAktiv = vanFeluliras || overrideOpen.has(mezo.id)
    const autoText = displayErtek(mezo, autoV)

    return (
      <div key={mezo.id}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs leading-4 text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{mezo.id}</span> — {mezo.label}
          </Label>
          {vanFeluliras && (
            <Badge className="shrink-0 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
              felülírva
            </Badge>
          )}
        </div>
        {!overrideAktiv ? (
          <div className="mt-1 flex items-center gap-1.5">
            <div
              className={cn(
                'min-h-9 flex-1 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-sm tabular-nums',
                autoText === '' ? 'italic text-muted-foreground' : 'text-foreground',
              )}
            >
              {autoText === '' ? 'nincs adat' : autoText}
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${mezo.id} felülírása`}
                title="Felülírás kézi értékkel"
                onClick={() => startOverride(mezo.id)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-1">
            <div className="flex items-center gap-1.5">
              {mezo.tipus === 'szam' ? (
                <Input
                  value={felulV === undefined || felulV === null ? '' : String(felulV)}
                  onChange={(e) => setFelulirasErtek(mezo.id, e.target.value)}
                  inputMode="decimal"
                  placeholder={autoText === '' ? 'kézi érték' : autoText}
                  disabled={readOnly}
                  className="h-9 flex-1 border-amber-400/60 tabular-nums"
                />
              ) : (
                <Input
                  value={felulV === undefined || felulV === null ? '' : String(felulV)}
                  onChange={(e) => setFelulirasErtek(mezo.id, e.target.value)}
                  placeholder="kézi érték"
                  disabled={readOnly}
                  className="h-9 flex-1 border-amber-400/60"
                />
              )}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${mezo.id} felülírás visszaállítása`}
                  title="Vissza az automatikus értékre"
                  onClick={() => resetOverride(mezo.id)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Automatikus érték: {autoText === '' ? 'nincs adat' : autoText}
            </p>
          </div>
        )}
      </div>
    )
  }

  function renderKeziMezo(mezo: JelentesMezo) {
    const v = kezi[mezo.id]
    const value = v === undefined || v === null ? '' : String(v)
    const nagyTextarea = mezo.fejezet === 'IX' || mezo.fejezet === 'X'

    return (
      <div key={mezo.id}>
        <Label className="text-xs leading-4 text-muted-foreground">
          <span className="tabular-nums font-semibold text-foreground">{mezo.id}</span> — {mezo.label}
          {mezo.egyseg ? <span className="text-muted-foreground/70"> ({mezo.egyseg})</span> : null}
        </Label>
        {mezo.tipus === 'hosszu_szoveg' ? (
          <Textarea
            value={value}
            onChange={(e) => setKeziErtek(mezo.id, e.target.value)}
            rows={nagyTextarea ? 8 : 4}
            disabled={readOnly}
            className="mt-1"
            placeholder="Szabad szöveg…"
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => setKeziErtek(mezo.id, e.target.value)}
            inputMode={mezo.tipus === 'szam' ? 'decimal' : undefined}
            disabled={readOnly}
            className={cn('mt-1 h-9', mezo.tipus === 'szam' && 'tabular-nums')}
          />
        )}
      </div>
    )
  }

  // ── Wizard lépés-navigáció ──

  function wizardNext() {
    if (wizardStep === 'attekintes') setWizardStep('ellenorzes')
    else if (wizardStep === 'ellenorzes') setWizardStep('hatarozat')
    else if (wizardStep === 'hatarozat') setWizardStep('megerosites')
  }

  function wizardBack() {
    if (wizardStep === 'attekintes') setMode('szerkeszto')
    else if (wizardStep === 'ellenorzes') setWizardStep('attekintes')
    else if (wizardStep === 'hatarozat') setWizardStep('ellenorzes')
    else if (wizardStep === 'megerosites') setWizardStep('hatarozat')
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-6xl
          !h-[94vh] !max-h-[94vh]
          flex flex-col gap-0 overflow-hidden rounded-2xl p-0
        "
      >
        {/* ── Fejléc ─────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 border-b border-border bg-card/70 px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-3 font-heading text-lg text-foreground sm:text-xl">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ScrollText className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                Lelkészi jelentés — {year}
                {readOnly ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                    Véglegesítve
                  </Badge>
                ) : (
                  <Badge className="bg-muted text-muted-foreground hover:bg-muted">Szerkesztés alatt</Badge>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                {congregationName || data?.congregationName || 'Egyházközség'} — hivatalos éves jelentés (I–X. fejezet)
              </span>
            </span>
          </DialogTitle>

          {/* Wizard-progressz */}
          {mode === 'wizard' && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto text-xs">
              <StepDot active={wizardStep === 'attekintes'} done={wizardStep !== 'attekintes'}>
                1. Áttekintés
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot
                active={wizardStep === 'ellenorzes'}
                done={wizardStep === 'hatarozat' || wizardStep === 'megerosites' || wizardStep === 'kesz'}
              >
                2. Ellenőrzések
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot
                active={wizardStep === 'hatarozat'}
                done={wizardStep === 'megerosites' || wizardStep === 'kesz'}
              >
                3. Határozat
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot active={wizardStep === 'megerosites'} done={wizardStep === 'kesz'}>
                4. Megerősítés
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot active={wizardStep === 'kesz'} done={false}>
                5. Kész
              </StepDot>
            </div>
          )}
        </DialogHeader>

        {/* ── Törzs ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Loader2 className="mx-auto size-7 animate-spin" />
              <p className="mt-3 text-sm">A jelentés és az élő adatok betöltése…</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
              <AlertCircle className="mx-auto size-8 text-destructive" />
              <p className="mt-3 text-sm font-semibold text-foreground">A jelentés nem tölthető be</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
            </div>
          </div>
        ) : mode === 'wizard' ? (
          /* ── VÉGLEGESÍTŐ WIZARD ─────────────────────────────────────── */
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {wizardStep === 'attekintes' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-heading text-lg text-foreground">A jelentés véglegesítése</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        A wizard négy lépésben vezet végig: kulcsszámok áttekintése, kitöltöttség-ellenőrzés,
                        határozati adatok, majd a végső megerősítés. Véglegesítés után a jelentés befagy —
                        módosítani csak egyházmegyei feloldással lehet.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KulcsSzam label="Lélekszám (dec. 31.)" value={statErtek('I.10')} />
                  <KulcsSzam label="Keresztelt" value={statErtek('I.2c')} />
                  <KulcsSzam label="Temetett" value={statErtek('I.3c')} />
                  <KulcsSzam label="Esketés" value={statErtek('I.16')} />
                  <KulcsSzam label="Konfirmált" value={statErtek('V.7c')} />
                  <KulcsSzam label="Úrvacsoraosztás" value={statErtek('II.12')} />
                  <KulcsSzam label="Járulék az évben" value={statErtek('VII.1')} />
                  <KulcsSzam label="Persely az évben" value={statErtek('VII.3')} />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  A számok az élő adatokból és a kézi kitöltésből származnak — ha valami nem stimmel, lépjen
                  vissza a szerkesztőbe, és javítsa vagy írja felül az adott mezőt.
                </p>
              </div>
            )}

            {wizardStep === 'ellenorzes' && (
              <div className="mx-auto max-w-2xl space-y-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Az alábbi ellenőrzések <strong className="text-foreground">nem blokkolók</strong> — a
                      véglegesítés hiányos rubrikákkal is elvégezhető, de a hivatalos nyomtatványon üresen
                      („—”) jelennek meg.
                    </p>
                  </div>
                </div>

                {zarszamadasHianyzik && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                    <p className="text-sm font-semibold text-foreground">Hiányzó zárszámadás-adatok (VII. fejezet)</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Erre az évre nincs véglegesített számadás, ezért a VII.6–VII.8 (évi bevétel/kiadás/egyenleg)
                      üres. Véglegesítse előbb a számadást a Pénzügy modulban, vagy írja felül a mezőket kézzel.
                    </p>
                  </div>
                )}

                <EllenorzesLista
                  cim={`Kitöltetlen kézi mezők (${hianyzoKeziMezok.length} db)`}
                  ures="Minden kézi mező ki van töltve."
                  mezok={hianyzoKeziMezok}
                />
                <EllenorzesLista
                  cim={`Automatikus mezők adat nélkül (${hianyzoAutoMezok.length} db)`}
                  ures="Minden automatikus mező kapott értéket."
                  mezok={hianyzoAutoMezok}
                  megjegyzes="Ezekhez nincs élő adat (pl. üres munkanapló-kategória vagy hiányzó előző évi jelentés) — felülírással pótolhatók."
                />

                {hianyzoKeziMezok.length === 0 && hianyzoAutoMezok.length === 0 && !zarszamadasHianyzik && (
                  <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-center">
                    <CheckCircle2 className="mx-auto size-7 text-emerald-600 dark:text-emerald-400" />
                    <p className="mt-1 text-sm font-semibold text-foreground">Minden rubrika kitöltött — mehet a véglegesítés!</p>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 'hatarozat' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">Határozati és címlap-adatok</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    A jelentést a presbitérium és az egyházközségi közgyűlés tárgyalja — a határozatszámok, az
                    iktatószámok és az aláírók a jelentés címlapjára kerülnek.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {HATAROZAT_MEZOK.map((mezo) => (
                    <div key={mezo.key}>
                      <Label className="text-xs text-muted-foreground">{mezo.label}</Label>
                      <Input
                        type={mezo.type || 'text'}
                        value={hatarozat[mezo.key] || ''}
                        onChange={(e) => {
                          setDirty(true)
                          setHatarozat((prev) => ({ ...prev, [mezo.key]: e.target.value }))
                        }}
                        placeholder={mezo.placeholder}
                        className="mt-1 h-9"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 'megerosites' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 font-heading text-lg text-foreground">
                    <Send className="size-5 text-primary" />
                    Utolsó megerősítés
                  </h3>
                  <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-4 text-sm">
                    <SorPar label="Év" value={String(year)} />
                    <SorPar label="Egyházközség" value={congregationName || data?.congregationName || '—'} />
                    <SorPar label="Presbitériumi határozat" value={hatarozat.presbiteriSzam || '—'} />
                    <SorPar label="Presbitériumi tárgyalás" value={hatarozat.presbiteriDatum || '—'} />
                    <SorPar label="Közgyűlési határozat" value={hatarozat.kozgyulesiSzam || '—'} />
                    <SorPar label="Lelkipásztor" value={hatarozat.lelkipasztor || '—'} />
                    <SorPar label="Főgondnok / gondnok" value={hatarozat.fogondnok || '—'} />
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="mb-1 font-semibold text-foreground">Mi történik a megerősítés után?</p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        <li>
                          A jelentés adatai <strong className="text-foreground">befagynak</strong> (snapshot) — a nyomtatott és
                          beküldött változat bit-azonos lesz a tárolttal.
                        </li>
                        <li>A mezők a továbbiakban nem szerkeszthetők — feloldást az egyházmegyétől lehet kérni.</li>
                        <li>A véglegesítés után a jelentés opcionálisan beküldhető az egyházmegyének.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 'kesz' && (
              <div className="mx-auto max-w-xl py-10 text-center">
                <div className="mx-auto inline-flex size-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-10" />
                </div>
                <h3 className="mt-4 font-heading text-2xl text-foreground">A jelentés véglegesítve!</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  A(z) {year}. évi lelkészi jelentés lezárult. Beküldheti az egyházmegyének, illetve a
                  szerkesztőbe visszalépve PDF-be mentheti vagy kinyomtathatja.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {submitted ? (
                    <Badge className="bg-emerald-500/15 px-3 py-1.5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                      <CheckCircle2 className="mr-1 size-3.5" />
                      Beküldve az egyházmegyének
                    </Badge>
                  ) : (
                    <Button onClick={() => void handleSubmitToDiocese()} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Beküldés az egyházmegyének
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setMode('szerkeszto')}>
                    Vissza a jelentéshez
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── SZERKESZTŐ + ELŐNÉZET ──────────────────────────────────── */
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-6">
            {/* Véglegesítve-banner + feloldás-kérés */}
            {readOnly && (
              <div className="mb-3 shrink-0 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="min-w-0 flex-1 text-sm text-foreground">
                    <strong>Véglegesítve</strong>
                    {data?.veglegesitveAt ? ` (${data.veglegesitveAt.slice(0, 10)})` : ''} — a mezők nem
                    szerkeszthetők, feloldás kérhető az egyházmegyétől.
                  </p>
                  {unlockRequested ? (
                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                      Feloldási kérelem elküldve
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setUnlockFormOpen((v) => !v)}>
                      <ShieldAlert className="size-4" />
                      Feloldás kérése
                    </Button>
                  )}
                </div>
                {unlockFormOpen && !unlockRequested && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                    <Textarea
                      value={unlockReason}
                      onChange={(e) => setUnlockReason(e.target.value)}
                      rows={2}
                      placeholder="A feloldás indoklása (opcionális)…"
                      className="min-h-0 flex-1"
                    />
                    <Button size="sm" onClick={() => void handleUnlockRequest()} disabled={unlockSending}>
                      {unlockSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Kérelem küldése
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Mobil fül-váltó (lg-től mindkét panel látszik) */}
            <div className="mb-3 flex shrink-0 gap-1 rounded-xl border border-border bg-muted p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView('szerkesztes')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  mobileView === 'szerkesztes'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <PenLine className="size-4" />
                Szerkesztés
              </button>
              <button
                type="button"
                onClick={() => setMobileView('elonezet')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  mobileView === 'elonezet'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Eye className="size-4" />
                Előnézet
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 pb-3 lg:grid-cols-2">
              {/* Bal: fejezetenkénti szerkesztő */}
              <div
                className={cn(
                  'min-h-0 space-y-2.5 overflow-y-auto pb-2 pr-0.5 lg:block',
                  mobileView !== 'szerkesztes' && 'hidden',
                )}
              >
                {FEJEZETEK.map((fejezet) => {
                  const nyitva = openChapters.has(fejezet)
                  const mezok = FEJEZET_MEZOK.get(fejezet) || []
                  const { filled, total } = kitoltottseg(fejezet)
                  return (
                    <section key={fejezet} className="rounded-2xl border border-border bg-card">
                      <button
                        type="button"
                        onClick={() => toggleChapter(fejezet)}
                        aria-expanded={nyitva}
                        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 font-heading text-sm text-foreground sm:text-base">
                          {fejezet}. {FEJEZET_CIMEK[fejezet]}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {filled}/{total}
                        </span>
                        <ChevronDown
                          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', nyitva && 'rotate-180')}
                        />
                      </button>
                      {nyitva && (
                        <div className="space-y-3 border-t border-border px-4 py-3.5">
                          {mezok.map((mezo) => (mezo.auto ? renderAutoMezo(mezo) : renderKeziMezo(mezo)))}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>

              {/* Jobb: élő A4-előnézet (fit-to-width) */}
              <div
                ref={previewRef}
                className={cn(
                  'min-h-0 overflow-y-auto rounded-2xl border border-border bg-muted/50 p-2.5 lg:block',
                  mobileView !== 'elonezet' && 'hidden',
                )}
              >
                {previewHtml ? (
                  <div
                    className="mx-auto overflow-hidden rounded-lg border border-border bg-white shadow-sm"
                    style={{ width: scaledW, height: scaledH }}
                  >
                    <iframe
                      ref={iframeRef}
                      onLoad={measurePreview}
                      title={`Lelkészi jelentés előnézet — ${year}`}
                      srcDoc={previewHtml}
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
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">Előnézet készítése…</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Lábléc ─────────────────────────────────────────────────── */}
        {!loading && !loadError && mode === 'szerkeszto' && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePdf()}
              disabled={printing || !currentData}
            >
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              PDF-be mentés
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDirectPrint()}
              disabled={sendingToPrinter || !currentData}
            >
              {sendingToPrinter ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Nyomtatás
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dirty && !readOnly && (
                <span className="text-xs text-muted-foreground">Nem mentett módosítások</span>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Bezárás
              </Button>
              {readOnly ? (
                submitted ? (
                  <Badge className="bg-emerald-500/15 px-3 py-1.5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="mr-1 size-3.5" />
                    Beküldve
                  </Badge>
                ) : (
                  <Button size="sm" onClick={() => void handleSubmitToDiocese()} disabled={submitting}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Beküldés az egyházmegyének
                  </Button>
                )
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                    Mentés
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setWizardStep('attekintes')
                      setMode('wizard')
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    Véglegesítés…
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {!loading && !loadError && mode === 'wizard' && wizardStep !== 'kesz' && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={wizardBack} disabled={isPending}>
              <ArrowLeft className="size-4" />
              {wizardStep === 'attekintes' ? 'Vissza a szerkesztőbe' : 'Vissza'}
            </Button>
            {wizardStep !== 'megerosites' ? (
              <Button type="button" onClick={wizardNext} disabled={isPending}>
                Tovább
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleFinalize} disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Véglegesítés
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Segéd-komponensek
// ─────────────────────────────────────────────────────────────────────────

function StepDot({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px]',
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : done
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {done && !active && <CheckCircle2 className="size-2.5" />}
      {children}
    </span>
  )
}

function KulcsSzam({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

function SorPar({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}:</span>
      <strong className="min-w-0 truncate text-right text-foreground" title={value}>
        {value}
      </strong>
    </div>
  )
}

/** Nem blokkoló ellenőrzés-lista (kitöltetlen mezők) — görgethető, kompakt. */
function EllenorzesLista({
  cim,
  ures,
  mezok,
  megjegyzes,
}: {
  cim: string
  ures: string
  mezok: JelentesMezo[]
  megjegyzes?: string
}) {
  if (mezok.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {ures}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-foreground">{cim}</p>
      {megjegyzes && <p className="mt-1 text-xs leading-5 text-muted-foreground">{megjegyzes}</p>}
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 text-xs text-muted-foreground">
        {mezok.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{m.id}</span>
            <span className="min-w-0">{m.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
