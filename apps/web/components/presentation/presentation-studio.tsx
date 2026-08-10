'use client'

/**
 * Presentation Studio — Éves beszámoló prezentációs felület + vezérlő.
 *
 * Bal: pillérek szerint csoportosított, behúzott slide-lista (elrejtés, saját dia).
 * Közép: aktuális slide (kattintásra szerkeszthető; hiányzó adat bekérése).
 * Jobb: beállítások (év, kiegészítők) + kivetítő/prezenter csatlakozás.
 *
 * Nézetmódok: Design mód · Vetítés mód (fullscreen). A vetítés kivihető
 * második ablakba, Wi-Fi kivetítőre (Presentation API), és telefonról/tabletről
 * vezérelhető (prezenter ablak, QR-párosítás).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Maximize2, Printer, Sparkles, TrendingUp,
  X, Eye, EyeOff, Plus, Trash2, Pencil, Info, MonitorPlay, Smartphone,
  ExternalLink, Wifi, MonitorX, Target,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import { saveGoals, type GoalRow } from '@/app/(dashboard)/eves-jelentes/prezentacio/goals-actions'
import {
  buildCategoryConclusions, CONCLUSION_CATEGORIES,
  type ConclusionCategory, type ConclusionHorizon,
} from '@/lib/annual-report/conclusions'
import { SLIDES, slideMissingInfo, PILLAR_LABELS, type PillarId } from './slides'
import { GOAL_METRICS, metricsForPillar, formatGoalValue, metricByKey } from './goal-metrics'
import { StaticRenderProvider } from './motion-primitives'
import {
  buildDeck, sectionOf, DeckRenderer, loadOptions, saveOptions, loadOverrides, saveOverrides,
  DEFAULT_OPTIONS, type DeckItem, type PresentationOptions, type TextOverrides, type CustomSlide,
} from './deck'
import {
  createPresentationSync, generateSessionCode, isSessionCodeFresh, type PresentationSync,
} from '@/lib/presentation/sync'

const SESSION_STORAGE_KEY = 'kartoteka-presentation-session'

/**
 * 2026-08-10 (P0 JAVÍTÁS — nyomtatás): a nyomtatási portál a kartoteka.css
 * szerint `display:none` a képernyőn. Emiatt
 *   (a) a recharts `ResponsiveContainer` 0×0-t mért → MINDEN diagram ÜRESEN
 *       nyomtatódott ki („Kor szerinti eloszlás" = fehér doboz), és
 *   (b) a `useInView`-ra váró számlálók sosem indultak el.
 * A `window.print()` szinkron, az IntersectionObserver/ResizeObserver viszont
 * aszinkron, ezért a @media print-beli `display:block` már késő volt.
 *
 * Megoldás: a portál nyomtatás előtt KÉPERNYŐN KÍVÜL, de MEGSZERKESZTVE
 * (`left:-20000px`, valós 297mm szélesség) jelenik meg — így a recharts mér és
 * rajzol —, nyomtatáskor pedig visszakerül a lap bal felső sarkába. A számokat
 * a StaticRenderProvider azonnal a végleges értékükre teszi.
 */
const PRINT_STAGE_CSS = `
.kartoteka-print-root.kt-print-stage {
  display: block !important;
  position: fixed !important;
  left: -20000px !important;
  top: 0 !important;
  width: 297mm !important;
  opacity: 0 !important;
  pointer-events: none !important;
  z-index: -1 !important;
}
@media print {
  body.kt-presentation-print .kartoteka-print-root.kt-print-stage {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    right: 0 !important;
    opacity: 1 !important;
    z-index: auto !important;
  }
  /* A hosszú listák (bevétel-tételek, névsorok, következtetések) ne vágódjanak
     le: a dia legalább egy teljes A4 lap, de ha kell, továbbfolyik a következőre.
     A flex-konténer gondoskodik róla, hogy a rövid diák továbbra is KITÖLTSÉK
     a lapot (a h-full önmagában auto-magasságú szülőnél összeesne). */
  body.kt-presentation-print .kartoteka-print-slide.kartoteka-print-slide {
    height: auto !important;
    min-height: 210mm !important;
    overflow: visible !important;
    display: flex !important;
  }
  body.kt-presentation-print .kartoteka-print-slide.kartoteka-print-slide > * {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }
}
`

/**
 * 2026-07-17 (F2-1): a prezentáció-nyomtatás print-CSS-e (kartoteka.css) mostantól
 * a body `kt-presentation-print` osztálya mögött él — különben a globális
 * „mindent elrejtünk" szabály az összes többi oldal ablakon belüli nyomtatását
 * (pl. nyugta) üres lapra vitte. Az @page A4 landscape szelektorral nem
 * scope-olható, ezért ideiglenes <style>-ként injektáljuk print idejére.
 */
function runBrowserPrint(onDone: () => void) {
  const PAGE_STYLE_ID = 'kt-presentation-page-style'
  document.body.classList.add('kt-presentation-print')
  let pageStyle = document.getElementById(PAGE_STYLE_ID)
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    pageStyle.id = PAGE_STYLE_ID
    pageStyle.textContent = '@media print { @page { size: A4 landscape; margin: 0; } }'
    document.head.appendChild(pageStyle)
  }
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.body.classList.remove('kt-presentation-print')
    document.getElementById(PAGE_STYLE_ID)?.remove()
    window.removeEventListener('afterprint', cleanup)
    onDone()
  }
  window.addEventListener('afterprint', cleanup)
  // Tartalék: ha az afterprint nem érkezne meg (egyes webview-k), késleltetett takarítás.
  window.setTimeout(cleanup, 60_000)
  window.print()
}

interface PresentationStudioProps {
  initialData: PresentationData
}

export function PresentationStudio({ initialData }: PresentationStudioProps) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [blackout, setBlackout] = useState(false)
  const [overrides, setOverrides] = useState<TextOverrides>({})
  const [options, setOptions] = useState<PresentationOptions>(DEFAULT_OPTIONS)
  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false)
  const [castDialogOpen, setCastDialogOpen] = useState(false)
  const [goalsDialogOpen, setGoalsDialogOpen] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [addPillar, setAddPillar] = useState<PillarId | null>(null)
  const [mounted, setMounted] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [session, setSession] = useState('')
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const syncRef = useRef<PresentationSync | null>(null)

  // 2026-08-10: a mentések (szövegek, rejtett diák, saját diák) ÉV + GYÜLEKEZET
  // szerint különülnek el — korábban egyetlen globális kulcs volt, ezért a 2025-re
  // írt kommentárok a 2024-es számok fölött jelentek meg.
  const storageScope = useMemo(
    () => ({ congregationId: initialData.congregation.id, year: initialData.year }),
    [initialData.congregation.id, initialData.year],
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
      setOverrides(loadOverrides(storageScope))
      const loadedOpts = loadOptions(storageScope)
      setOptions(loadedOpts)
      if (!loadedOpts.configuredAt) setOptionsDialogOpen(true)
      // Session-kód (a kivetítő/prezenter csatlakozáshoz).
      // 2026-08-10 (biztonsági javítás): a kód mostantól LEJÁR (12 óra) — eddig
      // egyszer generálódott és örökre megmaradt, így egy régen megosztott
      // kivetítő-link hónapok múlva is élő csatornát adott (a /eloadas útvonal
      // nem kér bejelentkezést, és a csatornán a teljes beszámoló megy át).
      let s = ''
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY) || ''
        if (raw.startsWith('{')) {
          const parsed = JSON.parse(raw) as { code?: string; createdAt?: string }
          if (parsed.code && isSessionCodeFresh(parsed.createdAt)) s = parsed.code
        }
        // A régi (időbélyeg nélküli) formátum lejártnak számít → új kód generálódik.
      } catch { /* ignore */ }
      if (!s) {
        s = generateSessionCode()
        try {
          localStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify({ code: s, createdAt: new Date().toISOString() }),
          )
        } catch { /* ignore */ }
      }
      setSession(s)
    }, 0)
    return () => clearTimeout(timer)
    // A `storageScope` a komponens élettartama alatt állandó (a page.tsx az
    // év + gyülekezet párra kulcsolja a Studiót, tehát évváltásnál újramountol).
  }, [storageScope])

  // A deck felépítése az adatot is figyelembe veszi (üres következtetés-dia nem
  // kerül bele); memoizálva, hogy a szerkesztés közbeni gépelés ne számolja újra.
  const deck = useMemo(() => buildDeck(options, data), [options, data])
  const deckCount = deck.length
  // 2026-08-10 (P2 JAVÍTÁS): ha MINDEN dia rejtve van, a `deck[Math.min(0,-1)]`
  // undefined lett — a fejléc „1 / 0"-t írt, a Vetítés gomb pedig némán
  // visszaesett tervező módba, miközben a böngésző teljes képernyőn maradt.
  const current = deckCount > 0 ? deck[Math.min(currentIndex, deckCount - 1)] : null

  // ── Vezérlő-szinkron: friss értékek ref-ben (a sync-handlerek ezt olvassák) ──
  const liveRef = useRef({ data, overrides, options, index: currentIndex, blackout })
  useEffect(() => { liveRef.current = { data, overrides, options, index: currentIndex, blackout } })

  function publishDeck() {
    const l = liveRef.current
    syncRef.current?.sendDeck({ year: l.data.year, data: l.data, overrides: l.overrides, options: l.options })
  }
  function publishState() {
    const l = liveRef.current
    syncRef.current?.sendState({ index: l.index, blackout: l.blackout })
  }

  // Sync létrehozása, ha kész a session
  useEffect(() => {
    if (!session) return
    const sync = createPresentationSync(session, {
      onRequest: () => { publishDeck(); publishState() },
      onState: (s) => { setCurrentIndex(s.index); setBlackout(s.blackout) }, // prezenter is vezérelhet
    })
    syncRef.current = sync
    return () => { sync.close(); syncRef.current = null }
  }, [session])

  // Tartalom-változás → deck újraküldése (debounce a sok billentyűleütés ellen)
  const deckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!mounted || !session) return
    if (deckTimer.current) clearTimeout(deckTimer.current)
    deckTimer.current = setTimeout(() => publishDeck(), 350)
  }, [overrides, options, data, session, mounted])

  // Index / elsötétítés → állapot küldése
  useEffect(() => {
    if (!mounted || !session) return
    publishState()
  }, [currentIndex, blackout, session, mounted])

  function persistOptions(next: PresentationOptions) { setOptions(next); saveOptions(next, storageScope) }
  function updateOptions(next: Partial<PresentationOptions>) {
    persistOptions({ ...options, ...next, configuredAt: new Date().toISOString() })
  }

  const goNext = useCallback(() => setCurrentIndex((i) => Math.min(i + 1, deckCount - 1)), [deckCount])
  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(i - 1, 0)), [])

  function toggleHidden(key: string) {
    const hidden = options.hidden.includes(key) ? options.hidden.filter((k) => k !== key) : [...options.hidden, key]
    persistOptions({ ...options, hidden, configuredAt: new Date().toISOString() })
    setCurrentIndex(0)
  }
  function addCustomSlide(pillar: PillarId, title: string, subtitle: string, body: string) {
    const key = `custom-${Date.now()}`
    const slide: CustomSlide = { key, pillar, title: title || 'Új dia', subtitle: subtitle || undefined, body }
    persistOptions({ ...options, customSlides: [...options.customSlides, slide], configuredAt: new Date().toISOString() })
  }
  function updateCustomSlide(key: string, patch: Partial<CustomSlide>) {
    persistOptions({ ...options, customSlides: options.customSlides.map((c) => (c.key === key ? { ...c, ...patch } : c)), configuredAt: new Date().toISOString() })
  }
  function deleteCustomSlide(key: string) {
    persistOptions({ ...options, customSlides: options.customSlides.filter((c) => c.key !== key), hidden: options.hidden.filter((k) => k !== key), configuredAt: new Date().toISOString() })
    setCurrentIndex(0)
  }

  function updateOverride(slideKey: string, field: 'title' | 'subtitle' | 'commentary', value: string) {
    const next = { ...overrides, [slideKey]: { ...(overrides[slideKey] || {}), [field]: value } }
    setOverrides(next)
    saveOverrides(next, storageScope)
  }

  // ── Nyomtatás: előbb kirendereljük a (statikus) diákat, csak utána print ──
  function startPrint() {
    if (printing) return
    setPrinting(true)
  }
  useEffect(() => {
    if (!printing) return
    // Két képkocka + rövid türelmi idő: ennyi kell, hogy a recharts
    // ResizeObserver-e lefusson és a diagramok (animáció nélkül) kirajzolódjanak.
    let cancelled = false
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelled) return
      window.setTimeout(() => {
        if (cancelled) return
        runBrowserPrint(() => setPrinting(false))
      }, 400)
    }))
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [printing])

  async function handleSaveGoals(rows: GoalRow[]) {
    const result = await saveGoals(data.year, rows)
    if (result.error) { toast.error(result.error); return }
    setData((d) => ({ ...d, goals: rows }))
    setGoalsDialogOpen(false)
    toast.success('Célok elmentve.')
  }

  // ── Fullscreen + blackout ──
  async function enterFullscreen() {
    setFullscreen(true)
    queueMicrotask(async () => {
      const el = fullscreenContainerRef.current
      if (el && document.fullscreenEnabled && !document.fullscreenElement) {
        try { await el.requestFullscreen({ navigationUI: 'hide' }) } catch { /* ablak-fullscreen marad */ }
      }
    })
  }
  async function exitFullscreen() {
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch { /* ignore */ } }
    setFullscreen(false)
  }
  useEffect(() => {
    function onChange() { if (!document.fullscreenElement && fullscreen) setFullscreen(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [fullscreen])
  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); goNext() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPrev() }
      else if (e.key === 'Escape') void exitFullscreen()
      else if (e.key.toLowerCase() === 'b') setBlackout((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, goNext, goPrev])

  // ── Kivetítő-csatlakozás ──
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const projectorUrl = session ? `${origin}/eloadas/${session}` : ''
  const remoteUrl = session ? `${origin}/eloadas/${session}/vezerlo` : ''

  function openSecondWindow() {
    if (!projectorUrl) return
    window.open(projectorUrl, 'kartoteka-vetito', 'noopener,width=1280,height=720')
  }
  function castViaWifi() {
    const w = window as unknown as { PresentationRequest?: new (urls: string[]) => { start: () => Promise<unknown> } }
    if (!w.PresentationRequest || !projectorUrl) { openSecondWindow(); return }
    try { void new w.PresentationRequest([projectorUrl]).start().catch(() => {}) } catch { openSecondWindow() }
  }

  if (!mounted) return <div className="p-8 text-center text-sm text-slate-500">Betöltés…</div>

  // ─── VETÍTÉS MÓD (helyi fullscreen) ───
  // 2026-08-10 (P2 JAVÍTÁS): ha MINDEN dia rejtve van, eddig némán visszaesett
  // tervező módba, miközben a böngésző teljes képernyőn maradt. Most kimondjuk,
  // mi történt, és van kilépő gomb.
  if (fullscreen && !current) {
    return (
      <div ref={fullscreenContainerRef} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-white">
        <p className="text-lg font-semibold">Minden dia el van rejtve — nincs mit vetíteni.</p>
        <p className="max-w-md text-sm text-white/60">Lépj vissza a szerkesztőbe, és a bal oldali lista „Elrejtett” szakaszából hozd vissza a diákat.</p>
        <Button variant="secondary" onClick={() => void exitFullscreen()}>Vissza a szerkesztőbe</Button>
      </div>
    )
  }
  if (fullscreen && current) {
    return (
      <div ref={fullscreenContainerRef} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
        {blackout && <div className="absolute inset-0 z-30 bg-black" onClick={() => setBlackout(false)} />}
        <button type="button" onClick={goPrev} disabled={currentIndex === 0}
          className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-30" aria-label="Előző">
          <ChevronLeft className="size-6" />
        </button>
        <button type="button" onClick={goNext} disabled={currentIndex === deckCount - 1}
          className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-30" aria-label="Következő">
          <ChevronRight className="size-6" />
        </button>
        <button type="button" onClick={() => setBlackout((v) => !v)}
          className="absolute right-16 top-4 z-40 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Elsötétítés (B)">
          <MonitorX className="size-5" />
        </button>
        <button type="button" onClick={() => void exitFullscreen()}
          className="absolute right-4 top-4 z-40 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Kilépés">
          <X className="size-5" />
        </button>
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80">{currentIndex + 1} / {deckCount}</div>
        <div className="h-[92vh] w-[92vw] max-w-[1800px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current.key} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="h-full w-full">
              <DeckRenderer item={current} data={data} overrides={overrides} options={options} projection />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  // ─── DESIGN MÓD ───
  const missing = current ? slideMissingInfo(current.key, data) : null
  const sectionHeaders: (string | null)[] = deck.map((item, i) => {
    const sec = sectionOf(item.key, item.pillar)
    const prevSec = i > 0 ? sectionOf(deck[i - 1].key, deck[i - 1].pillar) : null
    return !prevSec || prevSec.id !== sec.id ? sec.label : null
  })

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 lg:flex-row">
      {/* Slide-lista (pillérek szerint) */}
      <aside className="w-full rounded-[1.4rem] bg-white p-3 shadow-sm lg:w-72 lg:shrink-0">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-sm font-semibold text-slate-700">Diák</h2>
          <span className="text-[10px] font-medium text-slate-400">{deckCount} látható</span>
        </div>
        <div className="space-y-px pr-0.5">
          {deck.map((item, i) => {
            const headerLabel = sectionHeaders[i]
            const title = item.kind === 'builtin'
              ? (overrides[item.key]?.title || item.def.resolveTitle?.(data) || item.def.defaultTitle)
              : item.slide.title
            const itemMissing = slideMissingInfo(item.key, data)
            return (
              <div key={item.key}>
                {headerLabel && <p className="mt-1.5 px-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{headerLabel}</p>}
                <div className={cn('group flex items-center gap-1.5 rounded-md pl-1.5 pr-1 py-[3px] text-left text-[11px] transition',
                  i === currentIndex ? 'bg-violet-50 font-semibold text-violet-800' : 'text-slate-600 hover:bg-slate-50')}>
                  <button type="button" onClick={() => setCurrentIndex(i)} className="flex flex-1 items-center gap-1.5 truncate text-left">
                    <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                      i === currentIndex ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500')}>{i + 1}</span>
                    {item.kind === 'custom' && <Sparkles className="size-2.5 shrink-0 text-violet-400" />}
                    <span className="truncate">{title}</span>
                    {itemMissing && <Info className="size-2.5 shrink-0 text-amber-500" aria-label="Hiányzó adat" />}
                  </button>
                  {/* 2026-08-10: az ikonok fordítva voltak — az „Elrejtés" gombon
                      nyitott szem állt. Most a szokásos jelentés: áthúzott szem =
                      elrejtés, nyitott szem = megjelenítés. */}
                  <button type="button" onClick={() => toggleHidden(item.key)} title="Elrejtés" aria-label={`${title} elrejtése`}
                    className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-200/60 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100">
                    <EyeOff className="size-3" />
                  </button>
                  {item.kind === 'custom' && (
                    <button type="button" onClick={() => deleteCustomSlide(item.key)} title="Törlés"
                      className="shrink-0 rounded p-0.5 text-rose-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {options.hidden.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-1.5">
              <p className="px-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Elrejtett ({options.hidden.length})</p>
              {options.hidden.map((key) => {
                const def = SLIDES.find((s) => s.key === key)
                const custom = options.customSlides.find((c) => c.key === key)
                const label = def?.defaultTitle || custom?.title || key
                return (
                  <div key={key} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400">
                    <span className="flex-1 truncate line-through">{label}</span>
                    <button type="button" onClick={() => toggleHidden(key)} title="Megjelenítés" aria-label={`${label} megjelenítése`} className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700"><Eye className="size-3" /></button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-2 border-t border-slate-100 pt-1.5">
          <p className="px-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Saját dia hozzáadása</p>
          <div className="grid grid-cols-3 gap-1">
            {([1, 2, 3] as PillarId[]).map((p) => (
              <button key={p} type="button" onClick={() => setAddPillar(p)}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 px-1 py-1 text-[10px] font-medium text-slate-500 hover:border-violet-300 hover:text-violet-700">
                <Plus className="size-2.5" /> {p}.
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Központ */}
      <main className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center justify-between rounded-[1.2rem] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex === 0}><ChevronLeft className="size-4" /></Button>
            <span className="text-xs font-medium text-slate-600 tabular-nums">{deckCount === 0 ? 0 : currentIndex + 1} / {deckCount}</span>
            <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex >= deckCount - 1}><ChevronRight className="size-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setGoalsDialogOpen(true)}><Target className="mr-2 size-4" />Célok</Button>
            <Button variant="outline" size="sm" onClick={() => setOptionsDialogOpen(true)}><Sparkles className="mr-2 size-4" />Beállítások</Button>
            <Button variant="outline" size="sm" onClick={startPrint} disabled={printing || deckCount === 0}>
              <Printer className="mr-2 size-4" />{printing ? 'Előkészítés…' : 'Nyomtatás'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCastDialogOpen(true)}><MonitorPlay className="mr-2 size-4" />Kivetítő</Button>
            <Button size="sm" onClick={() => void enterFullscreen()} disabled={deckCount === 0}><Maximize2 className="mr-2 size-4" />Vetítés</Button>
          </div>
        </div>

        {/* 2026-08-10 (P1 JAVÍTÁS — mobil): az előnézet eddig a dia természetes
            méretében renderelt egy 16:9-es dobozba, ezért telefonon (375 px) a
            címek és a diagramok LEVÁGVA látszottak. Most — a kivetítő-fogadóval
            azonos módon — 1280×720-on rendereljük, és a dobozhoz skálázzuk. */}
        <ScaledSlidePreview
          disabled={!current}
          onOpen={() => current && setEditKey(current.key)}
          label={current ? 'Dia szerkesztése' : 'Nincs látható dia'}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current?.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="h-full w-full">
              {current
                ? <DeckRenderer item={current} data={data} overrides={overrides} options={options} projection />
                : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-50 text-center text-slate-400">
                    Minden dia el van rejtve — a bal oldali listában hozhatod vissza őket.
                  </div>
                )}
            </motion.div>
          </AnimatePresence>
        </ScaledSlidePreview>
        {current && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setEditKey(current.key)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Pencil className="size-3.5" /> Dia szerkesztése
            </button>
            {missing && (
              <button type="button" onClick={() => setEditKey(current.key)}
                className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow ring-2 ring-amber-200 transition hover:bg-amber-600">
                <Info className="size-4" /> {missing} — kattints a kézi kitöltéshez
              </button>
            )}
          </div>
        )}

        {/* 2026-08-10: a nyomtatási portál CSAK nyomtatáskor él. Korábban végig a
            DOM-ban volt, ezért a szerkesztő ablakban minden billentyűleütés
            újrarajzolt 25 diát (benne ~7 recharts-fát) — érezhetően akadt a
            gépelés. Ráadásul a `display:none` miatt a diagramok üresen és a
            számok 0-val nyomtatódtak; ezt a kt-print-stage + StaticRenderProvider
            párosa oldja meg. */}
        {printing && typeof window !== 'undefined' && createPortal(
          <div className="kartoteka-print-root kt-print-stage">
            <style href="kt-print-stage" precedence="high">{PRINT_STAGE_CSS}</style>
            <StaticRenderProvider>
              {deck.map((item, idx) => (
                <div key={item.key} className="kartoteka-print-slide" style={{ pageBreakAfter: idx < deckCount - 1 ? 'always' : 'auto' }}>
                  <DeckRenderer item={item} data={data} overrides={overrides} options={options} projection />
                </div>
              ))}
            </StaticRenderProvider>
          </div>, document.body,
        )}
      </main>

      {/* Jobb oldali beállítások */}
      <aside className="w-full rounded-[1.4rem] bg-white p-3 shadow-sm lg:w-56 lg:shrink-0">
        <div className="mb-2 border-b border-slate-100 pb-2"><h2 className="text-sm font-semibold text-slate-700">Beállítások</h2></div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="year-selector">Év</Label>
            {/* 2026-08-10: az érték ellenőrzötten kerül az URL-be — eddig bármi
                (pl. „abc”) átment rajta, és a szerveren 500-as hibát okozott. */}
            <Input id="year-selector" type="number" min={2000} max={2999} defaultValue={data.year}
              onBlur={(e) => {
                const y = Number.parseInt(e.target.value, 10)
                if (!Number.isFinite(y) || y < 1900 || y > 2999) { e.target.value = String(data.year); return }
                if (y !== data.year) router.push(`/eves-jelentes/prezentacio?year=${y}`)
              }} />
          </div>
          <button type="button" onClick={() => setCastDialogOpen(true)} className="flex w-full items-center gap-2 rounded-[0.8rem] bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">
            <MonitorPlay className="size-4" /> Kivetítő / Prezenter
          </button>
          <div className="rounded-[0.8rem] bg-violet-50 p-3 text-[11px] text-violet-900">
            <strong>💡 Tipp:</strong> a diára kattintva szerkesztheted; az áthúzott szem ikonnal elrejtheted. A „Kivetítő” gombbal másik képernyőre vagy telefonról is vezérelheted.
          </div>
        </div>
      </aside>

      <SlideEditDialog key={editKey ?? 'closed'} editKey={editKey} data={data} deck={deck} overrides={overrides} onClose={() => setEditKey(null)} onOverride={updateOverride} onCustomUpdate={updateCustomSlide} />
      <AddCustomDialog key={addPillar ?? 'none'} pillar={addPillar} onClose={() => setAddPillar(null)} onAdd={(p, t, s, b) => { addCustomSlide(p, t, s, b); setAddPillar(null) }} />
      <CastDialog open={castDialogOpen} onClose={() => setCastDialogOpen(false)} session={session} remoteUrl={remoteUrl}
        onSecondWindow={openSecondWindow} onCast={castViaWifi} onLocal={() => { setCastDialogOpen(false); void enterFullscreen() }} />
      <GoalsDialog key={goalsDialogOpen ? 'goals-open' : 'goals-closed'} open={goalsDialogOpen} onClose={() => setGoalsDialogOpen(false)} data={data} onSave={handleSaveGoals} />

      {/* Opciók dialog */}
      <ConclusionOptionsDialog
        open={optionsDialogOpen}
        onOpenChange={setOptionsDialogOpen}
        data={data}
        options={options}
        onChange={updateOptions}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Prezentáció kiegészítők — KATEGÓRIÁNKÉNT kipipálható következtetések
// (2026-08-10, a lelkészi kérés szerint)
//
// Korábban egyetlen „Következtetések" kapcsoló volt: mindent vagy semmit.
// Mostantól kategóriánként (12 terület) és időtávonként (rövid/hosszú) lehet
// kérni, és minden sor MEGMUTATJA, van-e hozzá elég adat — ahol nincs, a
// jelölőnégyzet le van tiltva, az okával együtt („Ehhez több év adata
// szükséges" / „A leltár még üres").
// ──────────────────────────────────────────────────────────────

function ConclusionOptionsDialog({
  open, onOpenChange, data, options, onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PresentationData
  options: PresentationOptions
  onChange: (patch: Partial<PresentationOptions>) => void
}) {
  // A teljes katalógus kiértékelése — így látszik soronként, mi áll rendelkezésre.
  const status = useMemo(() => {
    const all = buildCategoryConclusions(data, {
      goalActual: (metrika) => metricByKey(metrika)?.actual(data) ?? null,
    })
    return new Map(all.map((c) => [c.category, c]))
  }, [data])

  const selected = options.conclusionCategories
  const horizons = options.conclusionHorizons

  function toggleCategory(key: ConclusionCategory, on: boolean) {
    onChange({
      conclusionCategories: on ? [...new Set([...selected, key])] : selected.filter((c) => c !== key),
    })
  }
  function toggleHorizon(key: ConclusionHorizon, on: boolean) {
    onChange({ conclusionHorizons: on ? [...new Set([...horizons, key])] : horizons.filter((h) => h !== key) })
  }
  const availableKeys = CONCLUSION_CATEGORIES.filter((c) => status.get(c.key)?.available).map((c) => c.key)
  const allOn = availableKeys.every((k) => selected.includes(k))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Sparkles className="size-5" /></span>
            Prezentáció kiegészítők
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Válaszd ki, mely automatikus elemző diák kerüljenek a beszámolóba.</p>

          {/* Mester-kapcsolók */}
          <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
            <input type="checkbox" checked={options.includeConclusions} onChange={(e) => onChange({ includeConclusions: e.target.checked })} className="mt-0.5 size-4" />
            <div className="flex-1">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-600" /><span className="font-semibold text-slate-800">Következtetések</span></div>
              <p className="mt-0.5 text-xs text-slate-600">Pillérenként egy dia: kategóriánként rövid és hosszú távú tanulság, mindig a mögötte lévő számokkal.</p>
            </div>
          </label>

          {options.includeConclusions && (
            <div className="space-y-3 rounded-[1rem] border border-violet-200 bg-violet-50/40 p-3">
              {/* Időtáv */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Időtáv</span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" className="size-4" checked={horizons.includes('short')} onChange={(e) => toggleHorizon('short', e.target.checked)} />
                  Rövid táv <span className="text-xs text-slate-500">(mit jelent most)</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" className="size-4" checked={horizons.includes('long')} onChange={(e) => toggleHorizon('long', e.target.checked)} />
                  Hosszú táv <span className="text-xs text-slate-500">(mit vetít előre)</span>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-violet-200/70 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Kategóriák</span>
                <button
                  type="button"
                  onClick={() => onChange({ conclusionCategories: allOn ? [] : availableKeys })}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
                >
                  {allOn ? 'Egyik sem' : 'Mind kijelöl'}
                </button>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {CONCLUSION_CATEGORIES.map((cat) => {
                  const st = status.get(cat.key)
                  const disabled = !st?.available
                  return (
                    <label
                      key={cat.key}
                      className={cn(
                        'flex items-start gap-2 rounded-[0.8rem] border bg-white p-2.5',
                        disabled ? 'cursor-not-allowed border-slate-100 opacity-60' : 'cursor-pointer border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0"
                        disabled={disabled}
                        checked={!disabled && selected.includes(cat.key)}
                        onChange={(e) => toggleCategory(cat.key, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-slate-800">{cat.label}</span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {PILLAR_LABELS[cat.pillar as PillarId]}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          {disabled ? (st?.note || 'Ehhez nincs elég rögzített adat.') : cat.hint}
                        </span>
                        {!disabled && st?.long?.quality === 'insufficient' && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-amber-700">
                            Hosszú távú trendhez több év adata szükséges — csak a rövid távú tanulság jelenik meg.
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
            <input type="checkbox" checked={options.includeForecast} onChange={(e) => onChange({ includeForecast: e.target.checked })} className="mt-0.5 size-4" />
            <div className="flex-1">
              <div className="flex items-center gap-2"><TrendingUp className="size-4 text-emerald-600" /><span className="font-semibold text-slate-800">5 éves előrejelzés</span></div>
              <p className="mt-0.5 text-xs text-slate-600">Lineáris trend-becslés a következő 5 évre (bevétel, kiadás). Legalább 3 könyvelt év kell hozzá.</p>
            </div>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={() => onOpenChange(false)}>Rendben</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// Dia-előnézet — valós 1280×720-as render, a dobozhoz skálázva (2026-08-10)
// ──────────────────────────────────────────────────────────────

function ScaledSlidePreview({
  children, onOpen, disabled, label,
}: {
  children: React.ReactNode
  onOpen: () => void
  disabled?: boolean
  label: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / 1280)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={boxRef} className="group relative aspect-[16/9] w-full overflow-hidden rounded-[1.4rem] bg-white shadow-lg">
      <div
        aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
      {/* Billentyűzetről is elérhető szerkesztés (korábban sima div onClick volt,
          fókusz és aria-felirat nélkül). */}
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={label}
        title="Kattints a dia szerkesztéséhez"
        className="absolute inset-0 z-10 cursor-pointer rounded-[1.4rem] focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/70 disabled:cursor-default"
      />
      <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow ring-1 ring-slate-200 transition group-hover:opacity-100">
        <Pencil className="size-3.5" /> Szerkesztés
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Kivetítő / prezenter csatlakozás dialog
// ──────────────────────────────────────────────────────────────

/**
 * BIZTONSÁGI FIX 2026-08-11 (#12): helyben rajzolt QR-kód a prezenter-linkhez.
 *
 * Ami rossz volt: a `remoteUrl` (`/eloadas/<kód>/vezerlo`) az `api.qrserver.com`
 * GET query-stringjében ment ki egy külső szolgáltatóhoz. Ez az útvonal
 * hitelesítés NÉLKÜLI, és a benne lévő munkamenet-kód az EGYETLEN kulcs ahhoz
 * a Realtime-adáshoz, amely a gyülekezet taglétszám- és pénzügyi számait viszi.
 * A külső szolgáltató és minden útközbeni napló megkapta ezt az élő kulcsot.
 *
 * Miért jó a javítás: a QR-t a böngésző rajzolja meg (`uqr`), hálózati kérés
 * nélkül — ugyanaz a minta, mint a components/filing/csatolmany-panel.tsx-ben.
 */
function LocalQr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!url) { setSvg(null); return }
    let cancelled = false
    void (async () => {
      try {
        const { renderSVG } = await import('uqr')
        const markup = renderSVG(url, {
          ecc: 'M',
          border: 2,
          pixelSize: 8,
          whiteColor: '#ffffff',
          blackColor: '#111827',
        })
        if (!cancelled) setSvg(markup)
      } catch {
        // A QR csak kényelmi funkció — a link és a csatlakozási kód mellette olvasható.
        if (!cancelled) setSvg(null)
      }
    })()
    return () => { cancelled = true }
  }, [url])

  if (!svg) return null

  return (
    <div
      role="img"
      aria-label="QR-kód a prezenter ablakhoz"
      className="w-[120px] max-w-full shrink-0 rounded-xl bg-white p-1 ring-1 ring-slate-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      /* A QR-SVG a saját, épp legenerált kódunk (uqr) — nem külső tartalom. */
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function CastDialog({
  open, onClose, session, remoteUrl, onSecondWindow, onCast, onLocal,
}: {
  open: boolean
  onClose: () => void
  session: string
  remoteUrl: string
  onSecondWindow: () => void
  onCast: () => void
  onLocal: () => void
}) {
  const hasPresentationApi = typeof window !== 'undefined' && 'PresentationRequest' in window
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><MonitorPlay className="size-5" /></span>
            Kivetítő és prezenter
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Vetítési módok */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={onLocal} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-violet-300 hover:bg-violet-50/40">
              <Maximize2 className="size-6 text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">Ezen a gépen</span>
              <span className="text-[11px] text-slate-500">Teljes képernyős vetítés</span>
            </button>
            <button type="button" onClick={onSecondWindow} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-violet-300 hover:bg-violet-50/40">
              <ExternalLink className="size-6 text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">Második ablak</span>
              <span className="text-[11px] text-slate-500">Húzd a kivetítő képernyőre</span>
            </button>
            <button type="button" onClick={onCast} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-violet-300 hover:bg-violet-50/40">
              <Wifi className="size-6 text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">Wi-Fi kivetítő</span>
              <span className="text-[11px] text-slate-500">{hasPresentationApi ? 'Chromecast / okos-TV' : 'Második ablak (fallback)'}</span>
            </button>
          </div>

          {/* Prezenter telefonról */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2"><Smartphone className="size-4 text-violet-600" /><span className="font-semibold text-slate-800">Vezérlés telefonról / tabletről</span></div>
            <p className="mt-1 text-xs text-slate-600">Olvasd be a QR-kódot, vagy nyisd meg a linket a telefonon — a diákat onnan is lapozhatod.</p>
            <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-center">
              <LocalQr url={remoteUrl} />

              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Csatlakozási kód</p>
                  <p className="font-mono text-3xl font-bold tracking-widest text-violet-700">{session}</p>
                </div>
                <div className="truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{remoteUrl}</div>
                <a href={remoteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline">
                  <ExternalLink className="size-3.5" /> Megnyitás új lapon
                </a>
              </div>
            </div>
          </div>

          <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800">
            A kivetítő-ablakban a <kbd className="rounded bg-white px-1">B</kbd> billentyű elsötétít; a telefonos vezérlőn külön gomb van rá.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose}>Bezárás</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// Szerkesztő + saját dia dialógusok
// ──────────────────────────────────────────────────────────────

function SlideEditDialog({
  editKey, data, deck, overrides, onClose, onOverride, onCustomUpdate,
}: {
  editKey: string | null
  data: PresentationData
  deck: DeckItem[]
  overrides: TextOverrides
  onClose: () => void
  onOverride: (key: string, field: 'title' | 'subtitle' | 'commentary', value: string) => void
  onCustomUpdate: (key: string, patch: Partial<CustomSlide>) => void
}) {
  const item = deck.find((d) => d.key === editKey) || null
  const missing = item ? slideMissingInfo(item.key, data) : null
  const isCustom = item?.kind === 'custom'
  const isPillarIntro = !!item && item.key.startsWith('pillar-') && item.key.endsWith('-intro')

  // Helyi állapot (a komponens editKey-re kulcsolt → minden megnyitáskor friss) —
  // így a gépelés nem veszti el a fókuszt a szülő re-renderjei közben.
  const [title, setTitle] = useState(() =>
    item ? (item.kind === 'custom' ? item.slide.title : (overrides[item.key]?.title ?? '')) : '')
  const [subtitle, setSubtitle] = useState(() =>
    item ? (item.kind === 'custom' ? (item.slide.subtitle ?? '') : (overrides[item.key]?.subtitle ?? '')) : '')
  const [longText, setLongText] = useState(() =>
    item ? (item.kind === 'custom' ? item.slide.body : (overrides[item.key]?.commentary ?? '')) : '')

  function changeTitle(v: string) {
    setTitle(v)
    if (!item) return
    if (item.kind === 'custom') onCustomUpdate(item.key, { title: v })
    else onOverride(item.key, 'title', v)
  }
  function changeSubtitle(v: string) {
    setSubtitle(v)
    if (!item) return
    if (item.kind === 'custom') onCustomUpdate(item.key, { subtitle: v })
    else onOverride(item.key, 'subtitle', v)
  }
  function changeLong(v: string) {
    setLongText(v)
    if (!item) return
    if (item.kind === 'custom') onCustomUpdate(item.key, { body: v })
    else onOverride(item.key, 'commentary', v)
  }

  return (
    <Dialog open={!!editKey} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl"><Pencil className="size-5 text-violet-600" /> Dia szerkesztése</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-3">
            {missing && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span><strong>Hiányzó adat:</strong> {missing} Töltsd ki kézzel a kommentárt vagy egy saját diát.</span>
              </div>
            )}
            <Field label="Cím">
              <Input placeholder={isCustom ? 'A dia címe' : item.def.defaultTitle} value={title} onChange={(e) => changeTitle(e.target.value)} autoFocus />
            </Field>
            <Field label="Alcím">
              <Input placeholder={isCustom ? 'Opcionális' : (item.kind === 'builtin' ? item.def.defaultSubtitle || '' : '')} value={subtitle} onChange={(e) => changeSubtitle(e.target.value)} />
            </Field>
            {isCustom ? (
              <Field label="Tartalom (szabad szöveg)">
                <Textarea rows={6} value={longText} onChange={(e) => changeLong(e.target.value)} placeholder="A dia tartalma…" />
              </Field>
            ) : isPillarIntro ? (
              <Field label="🎯 Jövőbeli célok és tervek">
                <Textarea rows={4} value={longText} onChange={(e) => changeLong(e.target.value)} placeholder="Mit szeretnétek elérni ezen a területen a következő évben?" />
              </Field>
            ) : (
              <Field label="Lelkészi gondolat / kommentár">
                <Textarea rows={4} value={longText} onChange={(e) => changeLong(e.target.value)} placeholder="Amit a vetítéskor mondasz, vagy a hiányzó adat kézi kiegészítése…" />
              </Field>
            )}
            <p className="text-[11px] text-slate-400">A módosítások automatikusan mentődnek és élőben frissülnek a dián.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose}>Kész</Button></div>
      </DialogContent>
    </Dialog>
  )
}

function AddCustomDialog({
  pillar, onClose, onAdd,
}: {
  pillar: PillarId | null
  onClose: () => void
  onAdd: (pillar: PillarId, title: string, subtitle: string, body: string) => void
}) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [body, setBody] = useState('')
  return (
    <Dialog open={pillar !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl"><Plus className="size-5 text-violet-600" /> Saját dia — {pillar !== null ? PILLAR_LABELS[pillar] : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Cím"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pl. Köszönetnyilvánítás" autoFocus /></Field>
          <Field label="Alcím"><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Opcionális" /></Field>
          <Field label="Tartalom"><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="A dia szövege…" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Mégse</Button>
          <Button onClick={() => pillar !== null && onAdd(pillar, title, subtitle, body)} disabled={!title.trim() && !body.trim()}>Hozzáadás</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>
}

// ──────────────────────────────────────────────────────────────
// Jövőbeli célok szerkesztő (számszerű cél vs. tény, szerver-perzisztált)
// ──────────────────────────────────────────────────────────────

function GoalsDialog({
  open, onClose, data, onSave,
}: {
  open: boolean
  onClose: () => void
  data: PresentationData
  onSave: (rows: GoalRow[]) => Promise<void>
}) {
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    ;(data.goals || []).forEach((g) => { if (g.metrika && g.celertek != null) m[g.metrika] = String(g.celertek) })
    return m
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const rows: GoalRow[] = GOAL_METRICS
      .map((m) => ({ m, raw: targets[m.key] }))
      .filter(({ raw }) => raw != null && raw.trim() !== '' && !isNaN(Number(raw)))
      .map(({ m, raw }) => ({ piller: m.pillar, metrika: m.key, celertek: Number(raw), szoveg: null }))
    setSaving(true)
    await onSave(rows)
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm"><Target className="size-5" /></span>
            Célok — {data.year}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 2026-08-10 (P2 JAVÍTÁS): a szöveg „a következő évre" kért célt, a
              mentés viszont a TÁRGYÉVHEZ (data.year) írta, és a pillér-diák a
              tárgyév TÉNYÉVEL vetették össze — a lelkész jövő évi célja azonnal
              „nem teljesült"-ként jelent meg. A tárolás szemantikája a helyes
              (év szerinti cél); most a szöveg mondja ezt. */}
          <p className="text-sm text-slate-600">
            Adj meg <strong>számszerű célokat a(z) {data.year}. évre</strong> — a pillér-bevezető diákon a cél mellett a tényadat is megjelenik.
            A következő év céljaihoz állítsd át az <strong>Év</strong> mezőt, és ott töltsd ki. (A szöveges célokat a pillér diáján a „Szerkesztés” gombbal írhatod.)
          </p>
          {([1, 2, 3] as const).map((p) => (
            <div key={p} className="rounded-2xl border border-slate-200 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{PILLAR_LABELS[p]}</p>
              <div className="space-y-2">
                {metricsForPillar(p).map((m) => (
                  <div key={m.key} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{m.label}</p>
                      <p className="text-[11px] text-slate-400">jelenleg: {formatGoalValue(m.actual(data), m.unit)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="w-28"
                        placeholder="cél"
                        value={targets[m.key] ?? ''}
                        onChange={(e) => setTargets((t) => ({ ...t, [m.key]: e.target.value }))}
                      />
                      {m.unit && <span className="text-xs text-slate-400">{m.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Mégse</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Mentés…' : 'Mentés'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
