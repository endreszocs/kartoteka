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

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { SLIDES, slideMissingInfo, PILLAR_LABELS, type PillarId } from './slides'
import { GOAL_METRICS, metricsForPillar, formatGoalValue } from './goal-metrics'
import {
  buildDeck, sectionOf, DeckRenderer, loadOptions, saveOptions, loadOverrides, saveOverrides,
  DEFAULT_OPTIONS, type DeckItem, type PresentationOptions, type TextOverrides, type CustomSlide,
} from './deck'
import {
  createPresentationSync, generateSessionCode, type PresentationSync,
} from '@/lib/presentation/sync'

const SESSION_STORAGE_KEY = 'kartoteka-presentation-session'

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
  const [session, setSession] = useState('')
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const syncRef = useRef<PresentationSync | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
      setOverrides(loadOverrides())
      const loadedOpts = loadOptions()
      setOptions(loadedOpts)
      if (!loadedOpts.configuredAt) setOptionsDialogOpen(true)
      // Session-kód (a kivetítő/prezenter csatlakozáshoz)
      let s = ''
      try { s = localStorage.getItem(SESSION_STORAGE_KEY) || '' } catch { /* ignore */ }
      if (!s) { s = generateSessionCode(); try { localStorage.setItem(SESSION_STORAGE_KEY, s) } catch { /* ignore */ } }
      setSession(s)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const deck = buildDeck(options)
  const deckCount = deck.length
  const current = deck[Math.min(currentIndex, deckCount - 1)]

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

  function persistOptions(next: PresentationOptions) { setOptions(next); saveOptions(next) }
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
    saveOverrides(next)
  }

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
              <DeckRenderer item={current} data={data} overrides={overrides} projection />
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
                  <button type="button" onClick={() => toggleHidden(item.key)} title="Elrejtés"
                    className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-200/60 hover:text-slate-700 group-hover:opacity-100">
                    <Eye className="size-3" />
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
                    <button type="button" onClick={() => toggleHidden(key)} title="Megjelenítés" className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700"><EyeOff className="size-3" /></button>
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
            <span className="text-xs font-medium text-slate-600">{currentIndex + 1} / {deckCount}</span>
            <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex === deckCount - 1}><ChevronRight className="size-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setGoalsDialogOpen(true)}><Target className="mr-2 size-4" />Célok</Button>
            <Button variant="outline" size="sm" onClick={() => setOptionsDialogOpen(true)}><Sparkles className="mr-2 size-4" />Beállítások</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 size-4" />Nyomtatás</Button>
            <Button variant="outline" size="sm" onClick={() => setCastDialogOpen(true)}><MonitorPlay className="mr-2 size-4" />Kivetítő</Button>
            <Button size="sm" onClick={() => void enterFullscreen()}><Maximize2 className="mr-2 size-4" />Vetítés</Button>
          </div>
        </div>

        <div
          className="group relative aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-[1.4rem] shadow-lg"
          onClick={() => current && setEditKey(current.key)}
          title="Kattints a dia szerkesztéséhez"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current?.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="h-full w-full">
              {current && <DeckRenderer item={current} data={data} overrides={overrides} />}
            </motion.div>
          </AnimatePresence>

          {current && (
            <span
              className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow ring-1 ring-slate-200 transition group-hover:opacity-100">
              <Pencil className="size-3.5" /> Szerkesztés
            </span>
          )}
          {missing && (
            <button type="button" onClick={() => setEditKey(current!.key)}
              className="absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-lg ring-2 ring-amber-200 transition hover:bg-amber-600">
              <Info className="size-4" /> {missing} — kattints a kézi kitöltéshez
            </button>
          )}
        </div>

        {mounted && typeof window !== 'undefined' && createPortal(
          <div className="kartoteka-print-root">
            {deck.map((item, idx) => (
              <div key={item.key} className="kartoteka-print-slide" style={{ pageBreakAfter: idx < deckCount - 1 ? 'always' : 'auto' }}>
                <DeckRenderer item={item} data={data} overrides={overrides} projection />
              </div>
            ))}
          </div>, document.body,
        )}
      </main>

      {/* Jobb oldali beállítások */}
      <aside className="w-full rounded-[1.4rem] bg-white p-3 shadow-sm lg:w-56 lg:shrink-0">
        <div className="mb-2 border-b border-slate-100 pb-2"><h2 className="text-sm font-semibold text-slate-700">Beállítások</h2></div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="year-selector">Év</Label>
            <Input id="year-selector" type="number" min={2000} max={2999} defaultValue={data.year}
              onBlur={(e) => { const y = Number(e.target.value); if (y && y !== data.year) router.push(`/eves-jelentes/prezentacio?year=${y}`) }} />
          </div>
          <button type="button" onClick={() => setCastDialogOpen(true)} className="flex w-full items-center gap-2 rounded-[0.8rem] bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">
            <MonitorPlay className="size-4" /> Kivetítő / Prezenter
          </button>
          <div className="rounded-[0.8rem] bg-violet-50 p-3 text-[11px] text-violet-900">
            <strong>💡 Tipp:</strong> a diára húzva megjelenik a „Szerkesztés” gomb; a szemre kattintva elrejtheted. A „Kivetítő” gombbal másik képernyőre vagy telefonról is vezérelheted.
          </div>
        </div>
      </aside>

      <SlideEditDialog key={editKey ?? 'closed'} editKey={editKey} data={data} deck={deck} overrides={overrides} onClose={() => setEditKey(null)} onOverride={updateOverride} onCustomUpdate={updateCustomSlide} />
      <AddCustomDialog key={addPillar ?? 'none'} pillar={addPillar} onClose={() => setAddPillar(null)} onAdd={(p, t, s, b) => { addCustomSlide(p, t, s, b); setAddPillar(null) }} />
      <CastDialog open={castDialogOpen} onClose={() => setCastDialogOpen(false)} session={session} remoteUrl={remoteUrl}
        onSecondWindow={openSecondWindow} onCast={castViaWifi} onLocal={() => { setCastDialogOpen(false); void enterFullscreen() }} />
      <GoalsDialog key={goalsDialogOpen ? 'goals-open' : 'goals-closed'} open={goalsDialogOpen} onClose={() => setGoalsDialogOpen(false)} data={data} onSave={handleSaveGoals} />

      {/* Opciók dialog */}
      <Dialog open={optionsDialogOpen} onOpenChange={setOptionsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Sparkles className="size-5" /></span>
              Prezentáció kiegészítők
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Válaszd ki, melyik automatikus elemző slide-ok kerüljenek be.</p>
            <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
              <input type="checkbox" checked={options.includeConclusions} onChange={(e) => updateOptions({ includeConclusions: e.target.checked })} className="mt-0.5 size-4" />
              <div className="flex-1">
                <div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-600" /><span className="font-semibold text-slate-800">Következtetések</span></div>
                <p className="mt-0.5 text-xs text-slate-600">Automatikus év/év elemzés — pénzügy, anyakönyv, egyházfenntartás.</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50">
              <input type="checkbox" checked={options.includeForecast} onChange={(e) => updateOptions({ includeForecast: e.target.checked })} className="mt-0.5 size-4" />
              <div className="flex-1">
                <div className="flex items-center gap-2"><TrendingUp className="size-4 text-emerald-600" /><span className="font-semibold text-slate-800">5 éves előrejelzés</span></div>
                <p className="mt-0.5 text-xs text-slate-600">Lineáris trend-becslés a következő 5 évre (bevétel, kiadás).</p>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={() => setOptionsDialogOpen(false)}>Rendben</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Kivetítő / prezenter csatlakozás dialog
// ──────────────────────────────────────────────────────────────

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
  const qrSrc = remoteUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(remoteUrl)}` : ''
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
              {qrSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc} alt="QR-kód a prezenter ablakhoz" width={120} height={120} className="rounded-xl bg-white p-1 ring-1 ring-slate-200" />
              )}
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
            Jövőbeli célok — {data.year}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Adj meg <strong>számszerű célokat</strong> a következő évre. A rendszer a pillér-bevezető diákon a <strong>cél melletti tényadatot</strong> is megjeleníti. (A szöveges célokat a pillér diáján a „Szerkesztés” gombbal írhatod.)
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
