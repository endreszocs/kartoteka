'use client'

/**
 * Presentation Studio — Éves beszámoló prezentációs felület.
 *
 * Bal oldalon: slide-lista (navigáció)
 * Középen: aktuális slide (tervezéshez)
 * Jobb oldalon: beállítások (szöveg szerkesztése, év váltás)
 *
 * Nézetmódok:
 *   - Design mód (default) — szerkesztés, előnézet
 *   - Vetítés mód — fullscreen, billentyűzettel lapozható
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Printer,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import { SLIDES, type SlideDefinition } from './slides'

interface PresentationStudioProps {
  initialData: PresentationData
}

const STORAGE_KEY = 'kartoteka-presentation-overrides-v1'
const OPTIONS_STORAGE_KEY = 'kartoteka-presentation-options-v1'

interface TextOverrides {
  [slideKey: string]: {
    title?: string
    subtitle?: string
    commentary?: string
  }
}

interface PresentationOptions {
  includeConclusions: boolean
  includeForecast: boolean
  /** Már megjelent-e a setup dialog (első futásnál auto-megnyitás) */
  configuredAt: string | null
}

const DEFAULT_OPTIONS: PresentationOptions = {
  includeConclusions: true,
  includeForecast: true,
  configuredAt: null,
}

function loadOptions(): PresentationOptions {
  if (typeof window === 'undefined') return DEFAULT_OPTIONS
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY)
    return raw ? { ...DEFAULT_OPTIONS, ...JSON.parse(raw) } : DEFAULT_OPTIONS
  } catch {
    return DEFAULT_OPTIONS
  }
}

function saveOptions(options: PresentationOptions) {
  if (typeof window === 'undefined') return
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options))
}

function loadOverrides(): TextOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TextOverrides) : {}
  } catch {
    return {}
  }
}

function saveOverrides(overrides: TextOverrides) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function PresentationStudio({ initialData }: PresentationStudioProps) {
  const router = useRouter()
  const [data] = useState(initialData)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [overrides, setOverrides] = useState<TextOverrides>({})
  const [options, setOptions] = useState<PresentationOptions>(DEFAULT_OPTIONS)
  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
      setOverrides(loadOverrides())
      const loadedOpts = loadOptions()
      setOptions(loadedOpts)
      // Első futásnál automatikusan megnyitjuk a beállítás-dialógot
      if (!loadedOpts.configuredAt) {
        setOptionsDialogOpen(true)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // A visible (látható) SLIDES — az opcionálisokat kiszűrjük, ha nincs bekapcsolva
  const visibleSlides: SlideDefinition[] = SLIDES.filter((s) => {
    if (s.key === 'conclusions') return options.includeConclusions
    if (s.key === 'forecast') return options.includeForecast
    return true
  })

  const slide = visibleSlides[currentIndex]

  function updateOptions(next: Partial<PresentationOptions>) {
    const updated = { ...options, ...next, configuredAt: new Date().toISOString() }
    setOptions(updated)
    saveOptions(updated)
    // Ha a kiválasztás módosította a slide-listát, és a currentIndex túl magas, reset
    if (currentIndex >= visibleSlides.length) {
      setCurrentIndex(0)
    }
  }

  const visibleCount = visibleSlides.length
  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, visibleCount - 1))
  }, [visibleCount])
  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  // Igazi böngésző-fullscreen API — amikor a user "Vetítés" gombra kattint
  async function enterFullscreen() {
    setFullscreen(true)
    // A DOM-state frissítése után kell requestFullscreen-t hívnunk a container-en
    // Elég egy queueMicrotask — a React commit végén a container már a DOM-ban van
    queueMicrotask(async () => {
      const el = fullscreenContainerRef.current
      if (el && document.fullscreenEnabled && !document.fullscreenElement) {
        try {
          await el.requestFullscreen({ navigationUI: 'hide' })
        } catch {
          // A böngésző visszautasította (pl. user activation hiány) — OK,
          // maradunk az ablak-fullscreen-nél (z-50, inset-0).
        }
      }
    })
  }

  async function exitFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        // ignore
      }
    }
    setFullscreen(false)
  }

  // Ha a user ESC-re vagy F11-re kilép a fullscreen-ből, az állapot szinkronizálása
  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement && fullscreen) {
        setFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [fullscreen])

  // Billentyűzet-navigáció vetítés módban
  useEffect(() => {
    if (!fullscreen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'Escape') {
        void exitFullscreen()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fullscreen, goNext, goPrev])

  function updateOverride(slideKey: string, field: 'title' | 'subtitle' | 'commentary', value: string) {
    const next = {
      ...overrides,
      [slideKey]: { ...(overrides[slideKey] || {}), [field]: value },
    }
    setOverrides(next)
    saveOverrides(next)
  }

  function getOverride(slideKey: string, field: 'title' | 'subtitle' | 'commentary'): string | undefined {
    return overrides[slideKey]?.[field]
  }

  function handlePrint() {
    window.print()
  }

  if (!mounted) {
    return <div className="p-8 text-center text-sm text-slate-500">Betöltés…</div>
  }

  // ─── VETÍTÉS MÓD ───
  // Az `enterFullscreen` a böngésző fullscreen API-t hívja ezen a containeren,
  // így a teljes képernyőt (monitor) kihasználja, nem csak az ablakot.
  if (fullscreen) {
    return (
      <div
        ref={fullscreenContainerRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
      >
        {/* Navigációs gombok */}
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-30"
          aria-label="Előző"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === visibleCount - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-30"
          aria-label="Következő"
        >
          <ChevronRight className="size-6" />
        </button>
        <button
          type="button"
          onClick={() => void exitFullscreen()}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Kilépés"
        >
          <X className="size-5" />
        </button>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80">
          {currentIndex + 1} / {visibleCount}
        </div>

        {/* A nagy slide — a viewport 92%-át használja (fullscreen API-val a monitor) */}
        <div className="h-[92vh] w-[92vw] max-w-[1800px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide.key}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              <SlideRenderer
                slide={slide}
                data={data}
                getOverride={getOverride}
                projection
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  // ─── DESIGN MÓD ───
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 lg:flex-row">
      {/* Slide-lista (sidebar) */}
      <aside className="w-full rounded-[1.4rem] bg-white p-3 shadow-sm lg:w-64 lg:shrink-0">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-sm font-semibold text-slate-700">Slide-ok</h2>
          <span className="text-[10px] font-medium text-slate-400">
            {visibleCount} db
          </span>
        </div>
        <div className="max-h-[calc(100vh-14rem)] space-y-1 overflow-y-auto">
          {visibleSlides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition',
                i === currentIndex
                  ? 'bg-violet-50 font-semibold text-violet-800'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                i === currentIndex ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500',
              )}>
                {i + 1}
              </span>
              <span className="truncate">{s.defaultTitle}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Központi slide + vezérlés */}
      <main className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center justify-between rounded-[1.2rem] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex === 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-medium text-slate-600">
              {currentIndex + 1} / {visibleCount}
            </span>
            <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex === visibleCount - 1}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOptionsDialogOpen(true)}>
              <Sparkles className="mr-2 size-4" />
              Beállítások
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 size-4" />
              Nyomtatás
            </Button>
            <Button size="sm" onClick={() => void enterFullscreen()}>
              <Maximize2 className="mr-2 size-4" />
              Vetítés
            </Button>
          </div>
        </div>

        {/* Aktuális slide (képernyőn látható) */}
        <div className="aspect-[16/9] w-full overflow-hidden rounded-[1.4rem] shadow-lg">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              <SlideRenderer slide={slide} data={data} getOverride={getOverride} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* PRINT-only: Portal a document.body-ra — így a parent-fa print-rejtése
            nem érinti (a dashboard-shell @media print rejtései kimaradnak) */}
        {mounted && typeof window !== 'undefined' && createPortal(
          <div className="kartoteka-print-root">
            {visibleSlides.map((s, idx) => (
              <div
                key={s.key}
                className="kartoteka-print-slide"
                style={{ pageBreakAfter: idx < visibleCount - 1 ? 'always' : 'auto' }}
              >
                <SlideRenderer slide={s} data={data} getOverride={getOverride} projection />
              </div>
            ))}
          </div>,
          document.body,
        )}

        {/* Szerkesztő */}
        <div className="rounded-[1.2rem] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Slide szerkesztése</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`title-${slide.key}`}>Cím</Label>
              <Input
                id={`title-${slide.key}`}
                placeholder={slide.defaultTitle}
                value={getOverride(slide.key, 'title') ?? ''}
                onChange={(e) => updateOverride(slide.key, 'title', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`subtitle-${slide.key}`}>Alcím</Label>
              <Input
                id={`subtitle-${slide.key}`}
                placeholder={slide.defaultSubtitle || ''}
                value={getOverride(slide.key, 'subtitle') ?? ''}
                onChange={(e) => updateOverride(slide.key, 'subtitle', e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`commentary-${slide.key}`}>Személyes kommentár / lelkészi gondolat</Label>
              <Input
                id={`commentary-${slide.key}`}
                placeholder="Amit a vetítéskor mondasz, vagy amit a közösség kiemeltnek lát..."
                value={getOverride(slide.key, 'commentary') ?? ''}
                onChange={(e) => updateOverride(slide.key, 'commentary', e.target.value)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Évváltás panel */}
      <aside className="w-full rounded-[1.4rem] bg-white p-3 shadow-sm lg:w-56 lg:shrink-0">
        <div className="mb-2 border-b border-slate-100 pb-2">
          <h2 className="text-sm font-semibold text-slate-700">Beállítások</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="year-selector">Év</Label>
            <Input
              id="year-selector"
              type="number"
              min={2000}
              max={2999}
              defaultValue={data.year}
              onBlur={(e) => {
                const y = Number(e.target.value)
                if (y && y !== data.year) {
                  router.push(`/eves-jelentes/prezentacio?year=${y}`)
                }
              }}
            />
          </div>
          <div className="rounded-[0.8rem] bg-violet-50 p-3 text-[11px] text-violet-900">
            <strong>💡 Tipp:</strong> a szerkesztett szövegek a böngészőben tárolódnak.
            Nyomtatáshoz vagy vetítéshez használd a felső gombokat.
          </div>
        </div>
      </aside>

      {/* Opciók dialog — következtetések + előrejelzés kiegészítők */}
      <Dialog open={optionsDialogOpen} onOpenChange={setOptionsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <Sparkles className="size-5" />
              </span>
              Prezentáció kiegészítők
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              A gyülekezet év-végi beszámolójához a rendszer <strong>automatikus elemzést</strong> is képes
              készíteni. Válaszd ki, melyik slide-ok kerüljenek be a prezentációba.
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={options.includeConclusions}
                onChange={(e) => updateOptions({ includeConclusions: e.target.checked })}
                className="mt-0.5 size-4"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-violet-600" />
                  <span className="font-semibold text-slate-800">Következtetések</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Automatikus szöveges elemzés az előző évekkel összehasonlítva — pénzügyi változások,
                  anyakönyvi trend, egyházfenntartás-teljesítés.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={options.includeForecast}
                onChange={(e) => updateOptions({ includeForecast: e.target.checked })}
                className="mt-0.5 size-4"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-600" />
                  <span className="font-semibold text-slate-800">5 éves előrejelzés</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Lineáris trend-alapú becslés a következő 5 évre (bevétel, kiadás). A rendszer
                  az elmúlt 5 év adatain matematikai extrapolációt végez — **nem jóslás**, hanem
                  tájékoztató jelzés.
                </p>
              </div>
            </label>

            <div className="rounded-[1rem] border border-amber-100 bg-amber-50/60 p-3 text-[11px] leading-5 text-amber-900">
              <strong>⚠️ Megjegyzés:</strong> Ezek az elemzések automatikusan generálódnak a rendszer
              adataiból. A pontosságuk az adatok teljességétől függ. A lelkészi értelmezés
              és a Szentlélek bizonysága felülmúlja a számokat.
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button onClick={() => setOptionsDialogOpen(false)}>Rendben</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Slide renderelő
// ──────────────────────────────────────────────────────────────

function SlideRenderer({
  slide,
  data,
  getOverride,
  projection = false,
}: {
  slide: SlideDefinition
  data: PresentationData
  getOverride: (slideKey: string, field: 'title' | 'subtitle' | 'commentary') => string | undefined
  projection?: boolean
}) {
  const title = getOverride(slide.key, 'title') || slide.resolveTitle?.(data) || slide.defaultTitle
  const subtitle = getOverride(slide.key, 'subtitle') || slide.resolveSubtitle?.(data) || slide.defaultSubtitle
  const commentary = getOverride(slide.key, 'commentary')

  const SlideContent = slide.component
  return (
    <SlideContent
      data={data}
      title={title}
      subtitle={subtitle}
      commentary={commentary}
      projection={projection}
    />
  )
}
