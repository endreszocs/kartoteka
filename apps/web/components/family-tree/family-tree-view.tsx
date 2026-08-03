'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  ChevronDown,
  Church,
  Crown,
  Eye,
  EyeOff,
  Hand,
  Heart,
  Maximize2,
  Phone,
  Printer,
  TriangleAlert,
  User,
  UserMinus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { MemberAvatar } from '@kartoteka/ui-app'
import { cn } from '@/lib/utils'
import type {
  FamilyTreeData,
  FamilyTreeEdge,
  FamilyTreeMember,
} from '@/lib/family-tree/types'

export type {
  FamilyTreeData,
  FamilyTreeEdge,
  FamilyTreeMember,
} from '@/lib/family-tree/types'

const NODE_W = 198
const NODE_H_BASE = 86
const NODE_H_DETAIL = 130
const GAP_X = 24
const GAP_Y_BASE = 84
const GAP_Y_DETAIL = 110

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2

/**
 * 2026-06-02 v3 — Családfa komponens.
 *
 * Modeok:
 *  - `couple` (default): klasszikus tier-by-tier layout. Felül legidősebb
 *    (nagyszülők), alul a legfiatalabb (unokák). Egy házaspár van a központban.
 *  - `ego-top`: a kiválasztott személy felül, alá MIND a felmenő (bal szárny)
 *    és lemenő (jobb szárny) generációk. A személyi karton családfája ezt
 *    használja.
 *
 * Funkciók:
 *  - Pan & zoom: drag-gel mozgatás, wheel/pinch nagyítás 30–200%
 *  - "Több info" toggle: telefon, foglalkozás, vallás megjelenítése
 *  - Nyomtatás: `window.print()` print-only CSS-szel
 *  - Role-labels a kártyán (szülő, testvér, nagyszülő stb.) — nem jelmagyarázat
 *  - Kattintás → onMemberClick callback
 */
export function FamilyTreeView({
  data,
  onMemberClick,
  layoutMode = 'couple',
}: {
  data: FamilyTreeData
  onMemberClick?: (id: number) => void
  layoutMode?: 'couple' | 'ego-top'
}) {
  // Vezérlő state-ek
  const [zoom, setZoom] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [showDetails, setShowDetails] = useState(false)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const layout = useMemo(
    () => buildLayout(data, layoutMode, showDetails),
    [data, layoutMode, showDetails],
  )
  const summary = useMemo(() => summarize(data.members), [data])

  // Tartalom közepre-fit a betöltéskor + mode/details váltáskor
  useEffect(() => {
    if (!containerRef.current || layout.width === 0) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = (rect.width - layout.width * zoom) / 2
    const cy = 12
    setTranslate({ x: Math.max(cx, 0), y: cy })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height, layoutMode, showDetails, data])

  // Drag pan
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    // Ha klikk egy node-on van, NE drag (klikk-handlinget a node csinálja)
    const target = e.target as HTMLElement
    if (target.closest('[data-tree-node]')) return
    setDragging(true)
    startRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging || !startRef.current) return
    setTranslate({
      x: startRef.current.tx + (e.clientX - startRef.current.x),
      y: startRef.current.ty + (e.clientY - startRef.current.y),
    })
  }
  function handleMouseUp() {
    setDragging(false)
    startRef.current = null
  }
  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 8) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setZoom((z) => clamp(+(z + delta).toFixed(2), MIN_ZOOM, MAX_ZOOM))
  }

  // Touch — egy ujjas pan
  const touchStateRef = useRef<{ x: number; y: number; tx: number; ty: number; pinchDist?: number; pinchZ?: number } | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-tree-node]')) return
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchStateRef.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchStateRef.current = {
        x: 0, y: 0, tx: translate.x, ty: translate.y,
        pinchDist: Math.hypot(dx, dy),
        pinchZ: zoom,
      }
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStateRef.current) return
    if (e.touches.length === 1 && touchStateRef.current.pinchDist == null) {
      const t = e.touches[0]
      setTranslate({
        x: touchStateRef.current.tx + (t.clientX - touchStateRef.current.x),
        y: touchStateRef.current.ty + (t.clientY - touchStateRef.current.y),
      })
    } else if (e.touches.length === 2 && touchStateRef.current.pinchDist != null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / touchStateRef.current.pinchDist
      setZoom(clamp((touchStateRef.current.pinchZ || 1) * ratio, MIN_ZOOM, MAX_ZOOM))
    }
  }
  function handleTouchEnd() {
    touchStateRef.current = null
  }

  function handlePrint() {
    // 2026-08-04 (PR-28) ÁTÍRVA — a nyomtatás ÜRES lapot adott. Ok: a fa
    // natív méretében (gyakran több ezer px széles) került a lapra, a belső
    // elemek pedig abszolút pozicionáltak, ezért a böngésző nem tördelte és
    // nem is kicsinyítette — a lapra a rajz melletti üres terület esett.
    // Most: a tartalmat a lap méretére SKÁLÁZZUK, a témát világosra
    // kényszerítjük (a sötét téma fehér lapon olvashatatlan), és a nyomtatást
    // a stíluslapok betöltése UTÁN indítjuk.
    if (typeof window === 'undefined') return
    const canvas = containerRef.current?.querySelector('.family-tree-canvas-inner') as HTMLElement | null
    if (!canvas) return

    const contentW = Math.max(1, layout.width + 16)
    const contentH = Math.max(1, layout.height + 16)
    // A3 fekvő nyomtatható terület 96 dpi-n, 1,2 cm margóval
    const PAGE_W = Math.round((42.0 - 2.4) / 2.54 * 96)
    const PAGE_H = Math.round((29.7 - 2.4) / 2.54 * 96) - 90 // fejléc helye
    const scale = Math.min(1, PAGE_W / contentW, PAGE_H / contentH)

    // CSS gyűjtés (a saját origin stíluslapjai olvashatók)
    const cssParts: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        if (sheet.cssRules) {
          for (const rule of Array.from(sheet.cssRules)) cssParts.push(rule.cssText)
        }
      } catch {
        // CORS-védett (külső) stíluslap — átugorjuk
      }
    }

    // A téma-osztályok kellenek a színváltozókhoz, de a sötét mód nem
    const htmlClass = document.documentElement.className
      .split(/\s+/).filter((c) => c && c !== 'dark').join(' ')

    const printWin = window.open('', '_blank', 'width=1280,height=900')
    if (!printWin) {
      alert('Engedélyezd a felugró ablakokat a nyomtatáshoz!')
      return
    }

    const html = `<!DOCTYPE html>
<html lang="hu" class="${htmlClass}" data-theme="light" style="color-scheme:light">
<head>
<meta charset="utf-8">
<title>Családfa</title>
<style>
${cssParts.join('\n')}
  html, body { background: #fff !important; }
  body { margin: 0; padding: 18px; font-family: Inter, system-ui, sans-serif; color: #0f172a; }
  .print-header { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
  .print-header h1 { margin: 0; font-size: 20px; color: #1e293b; }
  .print-header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
  /* A külső doboz a KICSINYÍTETT méretet foglalja, a belső skálázódik */
  .print-frame { width: ${Math.ceil(contentW * scale)}px; height: ${Math.ceil(contentH * scale)}px; overflow: visible; }
  .print-scale { transform: scale(${scale}); transform-origin: top left; width: ${contentW}px; height: ${contentH}px; }
  .print-scale .family-tree-canvas-inner { transform: none !important; }
  @page { size: A3 landscape; margin: 1.2cm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="print-header">
    <h1>Családfa</h1>
    <p>Nyomtatva: ${new Date().toLocaleDateString('hu-HU')} · ${data.members.length} személy · ${summary.gens} generáció${scale < 1 ? ` · ${Math.round(scale * 100)}%-ra kicsinyítve` : ''}</p>
  </div>
  <div class="print-frame"><div class="print-scale">${canvas.outerHTML}</div></div>
</body>
</html>`

    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()
    // A stíluslapok/betűk betöltése után nyomtatunk. A load esemény a
    // document.close() UTÁN is elsülhet, ezért mindkét utat lefedjük.
    const startPrint = () => {
      // dupla indítás ellen
      if ((printWin as unknown as { __printed?: boolean }).__printed) return
      ;(printWin as unknown as { __printed?: boolean }).__printed = true
      printWin.focus()
      printWin.print()
      setTimeout(() => { try { printWin.close() } catch { /* a felhasználó bezárhatta */ } }, 500)
    }
    if (printWin.document.readyState === 'complete') setTimeout(startPrint, 350)
    else printWin.addEventListener('load', () => setTimeout(startPrint, 350))
  }

  function handleResetView() {
    setZoom(1)
    if (containerRef.current && layout.width > 0) {
      const rect = containerRef.current.getBoundingClientRect()
      setTranslate({ x: Math.max((rect.width - layout.width) / 2, 0), y: 12 })
    }
  }

  if (data.members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
        <User className="size-12 opacity-30" />
        <div>
          <p className="text-sm font-medium text-slate-700">Még nincs családfa adat</p>
          <p className="mt-1 text-xs text-slate-500">
            A családfához rögzítsd a szülő-gyermek és házastárs kapcsolatokat<br />
            az anyakönyvi modulban (keresztelés, esketés).
          </p>
        </div>
      </div>
    )
  }

  const NODE_H = showDetails ? NODE_H_DETAIL : NODE_H_BASE

  return (
    <div className="family-tree-root space-y-3">
      {/* 2026-08-02 (PR-21): KERESZTHIBA-SÁV — az ellentmondó rokonsági adatot
          nem rajzoljuk némán: érthetően megmondjuk, kinél és mit kell javítani */}
      {(data.conflicts?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0 text-sm leading-5 text-amber-900 dark:text-amber-100">
              <p className="font-semibold">
                Ellentmondó rokonsági adatok ({data.conflicts!.length}) — a fa emiatt hibásan mutathat kapcsolatokat
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5">
                {data.conflicts!.slice(0, 6).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
                {data.conflicts!.length > 6 && (
                  <li>… és további {data.conflicts!.length - 6} ellentmondás.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* Vezérlősor */}
      <div className="family-tree-toolbar flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/50 px-3 py-2 shadow-sm sm:px-4 sm:py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
          <span><strong className="text-slate-700">{summary.total}</strong> személy · {summary.gens} generáció</span>
          <span className="hidden sm:inline text-slate-400">·</span>
          <span className="hidden sm:flex items-center gap-1 text-slate-500">
            <Hand className="size-3" /> húzd a mozgatáshoz
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition',
              showDetails
                ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
            title={showDetails ? 'Részletek elrejtése' : 'Több információ megjelenítése'}
          >
            {showDetails ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="hidden sm:inline">{showDetails ? 'Kevesebb' : 'Több info'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-200"
            title="Nyomtatás"
          >
            <Printer className="size-3.5" />
            <span className="hidden sm:inline">Nyomtatás</span>
          </button>
          <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(+(z - 0.1).toFixed(2), MIN_ZOOM, MAX_ZOOM))}
            className="flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Kicsinyítés"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-[3rem] text-center text-[11px] font-medium tabular-nums text-slate-600">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(+(z + 0.1).toFixed(2), MIN_ZOOM, MAX_ZOOM))}
            className="flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Nagyítás"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Nézet visszaállítása"
            title="Nézet visszaállítása"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* A fa konténer — pan/zoom */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          'family-tree-canvas relative h-[480px] overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/40 via-white to-slate-50/30 shadow-inner select-none sm:h-[560px]',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.05) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        <div
          className="absolute origin-top-left will-change-transform"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`,
            transition: dragging ? 'none' : 'transform 100ms ease-out',
          }}
        >
          <div
            className="family-tree-canvas-inner relative"
            style={{ width: layout.width + 16, height: layout.height + 16 }}
          >
            {/* SVG vonalak */}
            <svg
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute inset-0"
              style={{ overflow: 'visible' }}
            >
              {/* Szülő-gyermek vonalak */}
              {layout.edges
                .filter((e) => e.type === 'parent-child')
                .map((e) => {
                  const from = layout.positions.get(e.from)
                  const to = layout.positions.get(e.to)
                  if (!from || !to) return null
                  const x1 = from.x + NODE_W / 2
                  const y1 = from.y + NODE_H
                  const x2 = to.x + NODE_W / 2
                  const y2 = to.y
                  const midY = (y1 + y2) / 2
                  return (
                    <path
                      key={`pc-${e.from}-${e.to}`}
                      d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                })}
              {/* Házastárs vonalak */}
              {layout.edges
                .filter((e) => e.type === 'spouse')
                .map((e) => {
                  const fromPos = layout.positions.get(e.from)
                  const toPos = layout.positions.get(e.to)
                  if (!fromPos || !toPos) return null
                  const [a, b] = fromPos.x < toPos.x ? [fromPos, toPos] : [toPos, fromPos]
                  const y = a.y + NODE_H / 2
                  return (
                    <g key={`sp-${e.from}-${e.to}`}>
                      {/* 2026-08-04 (PR-27): élettársi kapcsolat = szaggatott vonal */}
                      <line
                        x1={a.x + NODE_W}
                        y1={y}
                        x2={b.x}
                        y2={y}
                        stroke="rgb(244 114 182)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray={e.partnership === 'elettars' ? '6 4' : undefined}
                      >
                        <title>{e.partnership === 'elettars' ? 'Élettársi kapcsolat' : 'Házastársak'}</title>
                      </line>
                      <circle
                        cx={(a.x + NODE_W + b.x) / 2}
                        cy={y}
                        r={5}
                        fill="white"
                        stroke="rgb(244 114 182)"
                        strokeWidth={1.5}
                      />
                    </g>
                  )
                })}
            </svg>

            {/* Person card-ok */}
            {data.members.map((m) => {
              const pos = layout.positions.get(m.id)
              if (!pos) return null
              const handleClick = onMemberClick ? () => onMemberClick(m.id) : undefined
              return (
                <div
                  key={m.id}
                  data-tree-node="true"
                  className={cn('absolute', handleClick && 'cursor-pointer')}
                  style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                  onClick={handleClick}
                  role={handleClick ? 'button' : undefined}
                  tabIndex={handleClick ? 0 : undefined}
                  onKeyDown={
                    handleClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleClick()
                          }
                        }
                      : undefined
                  }
                  title={handleClick ? 'Személyi karton megnyitása' : undefined}
                >
                  <PersonCard member={m} showDetails={showDetails} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Subtle floating help text bottom-right */}
        <div className="pointer-events-none absolute bottom-2 right-3 hidden text-[10px] text-slate-400 sm:block">
          Ctrl+görgő = zoom
        </div>
      </div>

      {/* Print CSS — csak a fa-tartalmat mutatja, vezérlők elrejtve */}
      <style jsx global>{`
        @media print {
          /* Mindent elrejtünk amit nem a fa */
          body * { visibility: hidden !important; }
          .family-tree-root, .family-tree-root * { visibility: visible !important; }
          .family-tree-toolbar { display: none !important; }
          .family-tree-canvas {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            border: 0 !important;
            box-shadow: none !important;
            background: white !important;
            overflow: visible !important;
          }
          .family-tree-canvas > div {
            transform: scale(0.7) !important;
            transform-origin: top left !important;
            position: relative !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}

function PersonCard({
  member,
  showDetails,
}: {
  member: FamilyTreeMember
  showDetails: boolean
}) {
  const isFemale = member.ferfi === false
  const isDead = member.meghalt
  const year = parseYear(member.sz_datum)
  const displayName = `${member.csaladnev || ''} ${member.k_nev || ''}`.trim() || '—'
  // 2026-08-04 (PR-31): leánykori név — csak ha van, és tényleg ELTÉR a viselt
  // családnévtől (különben felesleges ismétlés lenne)
  const szuletesiNev = (() => {
    const szcs = (member.szcs_nev || '').trim()
    if (!szcs) return null
    const viselt = (member.csaladnev || '').trim()
    if (szcs.localeCompare(viselt, 'hu', { sensitivity: 'base' }) === 0) return null
    return `szül. ${szcs} ${member.k_nev || ''}`.trim()
  })()

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col rounded-xl border px-3 py-2 transition-all',
        'shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_14px_rgba(15,23,42,0.12)] hover:-translate-y-0.5',
        member.isCenter
          ? 'border-amber-400/80 bg-gradient-to-br from-amber-50 to-amber-100/40 ring-2 ring-amber-300/50'
          : isFemale
            ? 'border-rose-200/80 bg-gradient-to-br from-rose-50/60 to-white'
            : 'border-sky-200/80 bg-gradient-to-br from-sky-50/60 to-white',
        isDead && 'opacity-70',
      )}
    >
      {/* Role-label felül kis pill */}
      {(member.roleLabel || member.isCenter) && (
        <div className="mb-1 flex items-center justify-between gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide',
              member.isCenter
                ? 'bg-amber-300/70 text-amber-900'
                : isFemale
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-sky-100 text-sky-700',
            )}
          >
            {member.isCenter ? 'Központ' : member.roleLabel}
          </span>
          {member.isCenter && <Crown className="size-3 text-amber-600" />}
        </div>
      )}

      {/* Név + avatar (2026-06-12, Endre: ha van profilkép, az látszik a fán) */}
      <div className="flex items-start gap-1.5">
        {member.kep ? (
          <span className="mt-0.5 shrink-0">
            <MemberAvatar name={displayName} kepUrl={member.kep} meghalt={isDead} size={22} />
          </span>
        ) : (
          <span
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
              isFemale ? 'bg-rose-400 text-white' : 'bg-sky-500 text-white',
            )}
          >
            {isDead ? (
              <UserMinus className="size-3" />
            ) : isFemale ? (
              <Heart className="size-3" />
            ) : (
              <User className="size-3" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-[12.5px] font-semibold leading-tight',
              member.isCenter ? 'text-amber-900' : 'text-slate-800',
              isDead && 'line-through decoration-slate-400/60',
            )}
            title={szuletesiNev ? `${displayName} (${szuletesiNev})` : displayName}
          >
            {displayName}
          </div>
        </div>
      </div>

      {/* Leánykori név (PR-31) — a viselt név alatt, halványabban */}
      {szuletesiNev && (
        <div className="truncate text-[9.5px] italic leading-tight text-slate-500" title={szuletesiNev}>
          {szuletesiNev}
        </div>
      )}

      {/* Alsó sor: év */}
      <div className="mt-1 flex items-center text-[10.5px] text-slate-500">
        <span className="tabular-nums">
          {year ? (
            <>
              <span className="text-slate-400">★</span> {year}
              {isDead && <span className="ml-1 text-slate-400">†</span>}
            </>
          ) : isDead ? (
            <span className="italic">elhunyt</span>
          ) : (
            <span className="italic text-slate-400">—</span>
          )}
        </span>
      </div>

      {/* Több info — kompakt iconok rövid szöveggel */}
      {showDetails && (
        <div className="mt-1.5 space-y-0.5 border-t border-slate-200/70 pt-1.5 text-[10.5px] text-slate-600">
          {member.foglalkozas && (
            <div className="flex items-center gap-1 truncate" title={member.foglalkozas}>
              <Briefcase className="size-2.5 shrink-0 text-slate-400" />
              <span className="truncate">{member.foglalkozas}</span>
            </div>
          )}
          {member.vallas && (
            <div className="flex items-center gap-1 truncate" title={member.vallas}>
              <Church className="size-2.5 shrink-0 text-slate-400" />
              <span className="truncate">{member.vallas}</span>
            </div>
          )}
          {member.telefon && (
            <div className="flex items-center gap-1 truncate" title={member.telefon}>
              <Phone className="size-2.5 shrink-0 text-slate-400" />
              <span className="truncate">{member.telefon}</span>
            </div>
          )}
          {!member.foglalkozas && !member.vallas && !member.telefon && (
            <div className="italic text-slate-400">Nincs extra adat</div>
          )}
        </div>
      )}
    </div>
  )
}

function parseYear(sz_datum: string | null): string | null {
  if (!sz_datum) return null
  const m = sz_datum.match(/(\d{4})/)
  return m ? m[1] : null
}

function summarize(members: FamilyTreeMember[]) {
  const gens = new Set(members.map((m) => m.generation))
  return { total: members.length, gens: gens.size }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * Layout-építő. Két mód:
 *  - 'couple': klasszikus tier-by-tier, generation sortolva (fent legidősebb)
 *  - 'ego-top': a center (gen=0) FELÜL, alá két szárny — bal a felmenők
 *    (gen<0), jobb a lemenők (gen>0). A 0-szintű testvérek/házastárs a
 *    center körül.
 */
function buildLayout(
  data: FamilyTreeData,
  mode: 'couple' | 'ego-top',
  showDetails: boolean,
): {
  positions: Map<number, { x: number; y: number }>
  edges: FamilyTreeEdge[]
  width: number
  height: number
} {
  const NODE_H = showDetails ? NODE_H_DETAIL : NODE_H_BASE
  const GAP_Y = showDetails ? GAP_Y_DETAIL : GAP_Y_BASE

  if (mode === 'ego-top') {
    return buildEgoTopLayout(data, NODE_H, GAP_Y)
  }

  // ─── COUPLE MODE — eredeti tier-by-tier ────────────────────────────────
  const byGen = new Map<number, FamilyTreeMember[]>()
  for (const m of data.members) {
    if (!byGen.has(m.generation)) byGen.set(m.generation, [])
    byGen.get(m.generation)!.push(m)
  }

  const gens = Array.from(byGen.keys()).sort((a, b) => a - b)

  let maxRowCount = 0
  for (const gen of gens) {
    const items = byGen.get(gen)!
    if (items.length > maxRowCount) maxRowCount = items.length
  }
  const totalWidth = Math.max(1, maxRowCount) * NODE_W + Math.max(0, maxRowCount - 1) * GAP_X

  const positions = new Map<number, { x: number; y: number }>()

  // 2026-07-24 (PR-5b F8.2): házaspár-csoportosítás — a soron belül a
  // házastársak EGYMÁS MELLÉ kerülnek. A korábbi „férfiak balra, aztán
  // névsor" rendezésnél a házaspár-vonal az egész soron átívelt, és több
  // generációnál (az új 5 szintes mélységgel) olvashatatlanná vált.
  const spousePartner = new Map<number, number>()
  for (const e of data.edges) {
    if (e.type !== 'spouse') continue
    if (!spousePartner.has(e.from)) spousePartner.set(e.from, e.to)
    if (!spousePartner.has(e.to)) spousePartner.set(e.to, e.from)
  }

  // 2026-07-25 (PR-18): ág-igazítás (barycenter) — a gyerek a MÁR ELHELYEZETT
  // szülei átlagos x-e alá kerül (házastársnál a párja/annak szülei horgonyoznak).
  // A korábbi nem-szerinti+névsoros rendezésnél a szülő-gyerek élek a teljes
  // vásznon átívelve keresztezték egymást — így az ágak tisztán követhetők.
  const parentsOf = new Map<number, number[]>()
  for (const e of data.edges) {
    if (e.type !== 'parent-child') continue
    if (!parentsOf.has(e.to)) parentsOf.set(e.to, [])
    parentsOf.get(e.to)!.push(e.from)
  }

  const positionsRef = () => positions // a lenti bary a felső sorok kész x-eit olvassa

  gens.forEach((gen, gIdx) => {
    const items = byGen.get(gen)!
    const baseCompare = (a: FamilyTreeMember, b: FamilyTreeMember) => {
      if (a.ferfi && !b.ferfi) return -1
      if (!a.ferfi && b.ferfi) return 1
      const an = `${a.csaladnev || ''} ${a.k_nev || ''}`
      const bn = `${b.csaladnev || ''} ${b.k_nev || ''}`
      return an.localeCompare(bn, 'hu')
    }
    const bary = (m: FamilyTreeMember): number | null => {
      const pos = positionsRef()
      const xs = (parentsOf.get(m.id) ?? [])
        .map((p) => pos.get(p)?.x)
        .filter((x): x is number => x != null)
      if (xs.length > 0) return xs.reduce((s, x) => s + x, 0) / xs.length
      const partnerId = spousePartner.get(m.id)
      if (partnerId != null) {
        const px = pos.get(partnerId)?.x
        if (px != null) return px
        const pxs = (parentsOf.get(partnerId) ?? [])
          .map((p) => pos.get(p)?.x)
          .filter((x): x is number => x != null)
        if (pxs.length > 0) return pxs.reduce((s, x) => s + x, 0) / pxs.length
      }
      return null
    }
    if (gIdx === 0) {
      items.sort(baseCompare)
    } else {
      const anchor = new Map<number, number | null>()
      for (const m of items) anchor.set(m.id, bary(m))
      items.sort((a, b) => {
        const ba = anchor.get(a.id) ?? null
        const bb = anchor.get(b.id) ?? null
        if (ba != null && bb != null && ba !== bb) return ba - bb
        if (ba != null && bb == null) return -1
        if (ba == null && bb != null) return 1
        return baseCompare(a, b)
      })
    }

    // Pár-csoportosítás: a rendezett sorrendben haladva a személy után rögtön
    // a (még el nem helyezett) házastársa következik.
    const placed = new Set<number>()
    const ordered: typeof items = []
    for (const m of items) {
      if (placed.has(m.id)) continue
      ordered.push(m)
      placed.add(m.id)
      const partnerId = spousePartner.get(m.id)
      if (partnerId && !placed.has(partnerId)) {
        const partner = items.find((x) => x.id === partnerId)
        if (partner) {
          ordered.push(partner)
          placed.add(partner.id)
        }
      }
    }

    const rowWidth = ordered.length * NODE_W + (ordered.length - 1) * GAP_X
    const startX = (totalWidth - rowWidth) / 2

    ordered.forEach((m, mIdx) => {
      positions.set(m.id, {
        x: startX + mIdx * (NODE_W + GAP_X),
        y: gIdx * (NODE_H + GAP_Y),
      })
    })
  })

  return {
    positions,
    edges: data.edges,
    width: totalWidth,
    height: gens.length * (NODE_H + GAP_Y) - GAP_Y,
  }
}

/**
 * Ego-top layout:
 *  - sor 0 (felül): a center (gen=0, isCenter=true) — egyetlen node, középen
 *  - sor 1: 0-szintű testvérek és házastárs a center mellett
 *  - sor 2+: a felmenők (gen<0) BAL szárnyon + lemenők (gen>0) JOBB szárnyon
 *    — abs(gen) szerint egyre lentebb
 */
function buildEgoTopLayout(
  data: FamilyTreeData,
  NODE_H: number,
  GAP_Y: number,
): {
  positions: Map<number, { x: number; y: number }>
  edges: FamilyTreeEdge[]
  width: number
  height: number
} {
  const positions = new Map<number, { x: number; y: number }>()

  // Csoportok:
  const center = data.members.find((m) => m.isCenter)
  const siblings = data.members.filter((m) => m.generation === 0 && !m.isCenter)
  // upper-jobb és lemenő-bal
  const upByLevel = new Map<number, FamilyTreeMember[]>() // 1, 2, 3
  const downByLevel = new Map<number, FamilyTreeMember[]>()
  for (const m of data.members) {
    if (m.isCenter) continue
    if (m.generation < 0) {
      const lv = -m.generation
      if (!upByLevel.has(lv)) upByLevel.set(lv, [])
      upByLevel.get(lv)!.push(m)
    } else if (m.generation > 0) {
      const lv = m.generation
      if (!downByLevel.has(lv)) downByLevel.set(lv, [])
      downByLevel.get(lv)!.push(m)
    }
  }
  const maxUp = upByLevel.size > 0 ? Math.max(...upByLevel.keys()) : 0
  const maxDown = downByLevel.size > 0 ? Math.max(...downByLevel.keys()) : 0
  const totalLevelsDown = Math.max(maxUp, maxDown)

  // Layout strategy:
  // y=0: center + siblings (egy sor, center balra/középre, testvérek mellette)
  // y=1: szülők (felmenő-1) BAL OLDALON + gyermekek (lemenő-1) JOBB OLDALON
  // y=2: nagyszülők BAL + unokák JOBB
  // ...
  // A nézet KÉT-szárnyú: bal x-tartomány = felmenők, jobb x-tartomány = lemenők

  // 1. Egész szélesség becslés
  // Minden szinten max(felmenők, lemenők) hossz alapján
  let maxLeftCount = 1
  let maxRightCount = 1
  for (let lv = 1; lv <= totalLevelsDown; lv++) {
    const left = (upByLevel.get(lv) || []).length
    const right = (downByLevel.get(lv) || []).length
    if (left > maxLeftCount) maxLeftCount = left
    if (right > maxRightCount) maxRightCount = right
  }

  // A center sorának kell egy szélesség: center + max 3 sibling melle
  const sibCount = siblings.length
  const topRowCount = 1 + sibCount

  // Két szárny szélessége (külön)
  const leftWidth = maxLeftCount * NODE_W + Math.max(0, maxLeftCount - 1) * GAP_X
  const rightWidth = maxRightCount * NODE_W + Math.max(0, maxRightCount - 1) * GAP_X
  const wingGap = 60 // szárnyak közötti hézag

  // Ha nincs egyik szárny sem (nincs felmenő/lemenő), akkor csak a top row
  const haveWings = totalLevelsDown > 0
  const wingsWidth = haveWings ? leftWidth + wingGap + rightWidth : 0
  const topRowWidth = topRowCount * NODE_W + Math.max(0, topRowCount - 1) * GAP_X
  const width = Math.max(topRowWidth, wingsWidth)

  // 2. Center + siblings y=0
  const centerXBase = haveWings
    ? leftWidth + wingGap / 2 - NODE_W / 2 // pont a két szárny között
    : (width - topRowWidth) / 2 + (sibCount > 0 ? 0 : 0)
  if (center) {
    positions.set(center.id, { x: Math.max(0, centerXBase), y: 0 })
  }
  // Siblings: a center jobb oldalán, ha lenne hely; de még simpler: a center
  // bal oldalán beljebb tegyük (a "Te" és testvérei egy sorban)
  if (siblings.length > 0) {
    // Sorba rendezzük név szerint
    siblings.sort((a, b) => {
      const an = `${a.csaladnev || ''} ${a.k_nev || ''}`
      const bn = `${b.csaladnev || ''} ${b.k_nev || ''}`
      return an.localeCompare(bn, 'hu')
    })
    // A center mellett vannak. Ha lenne hely a centertől balra, oda; ha a jobb
    // oldalon kevesebb felmenő van, ott. Egyszerű: a centertől JOBBRA tegyük.
    siblings.forEach((s, i) => {
      positions.set(s.id, {
        x: (positions.get(center?.id || -1)?.x || 0) + (i + 1) * (NODE_W + GAP_X),
        y: 0,
      })
    })
  }

  // 3. Bal szárny (felmenők) — lv 1, 2, ...
  for (let lv = 1; lv <= maxUp; lv++) {
    const items = (upByLevel.get(lv) || []).slice()
    items.sort((a, b) => {
      if (a.ferfi && !b.ferfi) return -1
      if (!a.ferfi && b.ferfi) return 1
      return 0
    })
    const rowWidth = items.length * NODE_W + Math.max(0, items.length - 1) * GAP_X
    const startX = (leftWidth - rowWidth) / 2
    items.forEach((m, i) => {
      positions.set(m.id, {
        x: startX + i * (NODE_W + GAP_X),
        y: lv * (NODE_H + GAP_Y),
      })
    })
  }

  // 4. Jobb szárny (lemenők)
  for (let lv = 1; lv <= maxDown; lv++) {
    const items = (downByLevel.get(lv) || []).slice()
    items.sort((a, b) => {
      if (a.ferfi && !b.ferfi) return -1
      if (!a.ferfi && b.ferfi) return 1
      return 0
    })
    const rowWidth = items.length * NODE_W + Math.max(0, items.length - 1) * GAP_X
    const startX = leftWidth + wingGap + (rightWidth - rowWidth) / 2
    items.forEach((m, i) => {
      positions.set(m.id, {
        x: startX + i * (NODE_W + GAP_X),
        y: lv * (NODE_H + GAP_Y),
      })
    })
  }

  const height = (totalLevelsDown + 1) * (NODE_H + GAP_Y) - GAP_Y

  return {
    positions,
    edges: data.edges,
    width: Math.max(width, NODE_W),
    height,
  }
}
