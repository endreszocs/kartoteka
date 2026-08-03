'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
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

// ─── 2026-08-04 (PR-33): vonalvezetés ────────────────────────────────────────
/** Egységes törésponti sugár az ortogonális leágazásokon. */
const CORNER_R = 8
/**
 * A csatorna nem tapadhat a kártya-élhez: ennyi hely marad alatta/fölötte.
 * Legalább 2×CORNER_R, hogy a törésponti sugár MINDIG a teljes 8px legyen.
 */
const LANE_MARGIN = 16
/** Egy generáció-résben ennyi külön vízszintes sáv van; azon túl körbefordul. */
const MAX_LANES = 5
/** Két gerinc csak akkor kerülhet egy sávba, ha vízszintesen ennyire elválik. */
const LANE_PAD = 18
/** Vér szerinti szülő–gyermek: semleges szürke, folytonos. */
const COLOR_PARENT_LINE = 'rgb(148 163 184)'
const WIDTH_PARENT_LINE = 1.6
/** Pár-kapcsolat: rózsaszín (élettársnál szaggatott). */
const COLOR_SPOUSE_LINE = 'rgb(244 114 182)'
const WIDTH_SPOUSE_LINE = 2

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
 *  - Nyomtatás: ÖNÁLLÓ (self-contained) nyomtatvány külön ablakban — lásd
 *    `handlePrint`. Az élő DOM-ot NEM másoljuk, app-CSS-t NEM gyűjtünk.
 *  - Role-labels a kártyán (szülő, testvér, nagyszülő stb.)
 *  - Jelmagyarázat a vászon alján (szülő–gyermek / házastárs / élettárs)
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
  const NODE_H = showDetails ? NODE_H_DETAIL : NODE_H_BASE
  // 2026-08-04 (PR-33): a vonal-geometria KÖZÖS forrás — ugyanezt rajzolja a
  // képernyő és a nyomtatvány is (nincs duplikált geometria-logika).
  const geometry = useMemo(
    () => computeTreeGeometry(layout.positions, layout.edges, NODE_H),
    [layout, NODE_H],
  )

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
    // 2026-08-04 (PR-33) ÚJRAÍRVA — a korábbi nyomtatás ÜRES lapot adott.
    // Gyökérok: az élő DOM-ot másoltuk át, és mellé a `document.styleSheets`
    // TELJES alkalmazás-CSS-ét (Tailwind v4 @layer + téma-változók). Az app-CSS
    // felülírta a saját print-szabályokat, a kártyák natív méretben szétszórva
    // rendereltek, a lapra a rajz melletti üres terület esett.
    // Most: ÖNÁLLÓ nyomtatvány a MÁR KISZÁMOLT layoutból — saját HTML, saját
    // inline CSS, semmilyen külső stíluslap/betű/CSS-változó. A vonalak
    // geometriája ugyanaz a `computeTreeGeometry`, amit a képernyő is használ.
    if (typeof window === 'undefined') return
    if (data.members.length === 0) return

    // 1) A tartalom VALÓDI határai. (A layout.width nem mindig fedi le a
    //    testvér-sort az ego-top módban, ezért a pozíciókból számolunk.)
    let minX = 0
    let minY = 0
    let maxX = layout.width
    let maxY = layout.height
    for (const p of layout.positions.values()) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x + NODE_W > maxX) maxX = p.x + NODE_W
      if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
    }
    const PAD = 20
    const offX = PAD - minX
    const offY = PAD - minY
    const contentW = Math.max(1, maxX - minX + PAD * 2)
    const contentH = Math.max(1, maxY - minY + PAD * 2)

    // 2) A3 fekvő nyomtatható terület 96 dpi-n, 1,2 cm margóval
    const PAGE_W = Math.round(((42.0 - 2.4) / 2.54) * 96)
    const PAGE_H = Math.round(((29.7 - 2.4) / 2.54) * 96) - 104 // fejléc + jelmagyarázat
    const scale = Math.min(1, PAGE_W / contentW, PAGE_H / contentH)

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    // 3) Vonalak — pontosan a képernyőn látható geometria
    const parentPaths = geometry.parentLines
      .map(
        (l) =>
          `<path d="${l.d}" fill="none" stroke="${COLOR_PARENT_LINE}" stroke-width="${WIDTH_PARENT_LINE}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('')
    // A pár-élek SZÁNDÉKOSAN a gerincek után — semmi nem takarhatja őket
    const spousePaths = geometry.spouseLines
      .map(
        (s) =>
          `<line x1="${nr(s.x1)}" y1="${nr(s.y1)}" x2="${nr(s.x2)}" y2="${nr(s.y2)}" stroke="${COLOR_SPOUSE_LINE}" stroke-width="${WIDTH_SPOUSE_LINE}" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>` +
          `<circle cx="${nr(s.cx)}" cy="${nr(s.cy)}" r="5" fill="#ffffff" stroke="${COLOR_SPOUSE_LINE}" stroke-width="1.5"/>`,
      )
      .join('')
    const svg =
      `<svg class="lines" width="${contentW}" height="${contentH}" viewBox="0 0 ${contentW} ${contentH}" xmlns="http://www.w3.org/2000/svg">` +
      `<g transform="translate(${nr(offX)} ${nr(offY)})">${parentPaths}${spousePaths}</g></svg>`

    // 4) Kártyák — abszolút pozicionált div-ek, TISZTÁN inline stílussal
    const cards = data.members
      .map((m) => {
        const pos = layout.positions.get(m.id)
        if (!pos) return ''
        const isFemale = m.ferfi === false
        const isDead = !!m.meghalt
        const bg = m.isCenter ? '#fef3c7' : isFemale ? '#fff1f2' : '#f0f9ff'
        const bd = m.isCenter ? '#f59e0b' : isFemale ? '#fda4af' : '#7dd3fc'
        const roleColor = m.isCenter ? '#92400e' : isFemale ? '#9f1239' : '#075985'
        const name = `${m.csaladnev || ''} ${m.k_nev || ''}`.trim() || '—'
        const role = m.isCenter ? 'Központ' : m.roleLabel || ''
        const birth = birthNameLabel(m)
        const year = parseYear(m.sz_datum)
        const extras: string[] = []
        if (showDetails) {
          if (m.foglalkozas) extras.push(esc(m.foglalkozas))
          if (m.vallas) extras.push(esc(m.vallas))
          if (m.telefon) extras.push(esc(m.telefon))
        }
        const yearText = year
          ? `★ ${year}${isDead ? ' †' : ''}`
          : isDead
            ? 'elhunyt'
            : '—'
        return (
          `<div class="card${isDead ? ' dead' : ''}" style="left:${nr(pos.x + offX)}px;top:${nr(pos.y + offY)}px;width:${NODE_W}px;height:${NODE_H}px;background:${bg};border-color:${bd}">` +
          (role ? `<div class="role" style="color:${roleColor}">${esc(role)}</div>` : '') +
          `<div class="nm${isDead ? ' strike' : ''}">${esc(name)}</div>` +
          (birth ? `<div class="bn">${esc(birth)}</div>` : '') +
          `<div class="yr">${yearText}</div>` +
          (extras.length ? `<div class="ex">${extras.join(' · ')}</div>` : '') +
          `</div>`
        )
      })
      .join('')

    const swatch = (color: string, dashed: boolean) =>
      `<svg width="20" height="8" viewBox="0 0 20 8" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="4" x2="19" y2="4" stroke="${color}" stroke-width="2" stroke-linecap="round"${dashed ? ' stroke-dasharray="5 3"' : ''}/></svg>`

    const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
<title>Családfa</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 16px; }
  @page { size: A3 landscape; margin: 1.2cm; }
  @media print { body { padding: 0; } .toolbar { display: none !important; } }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #1e3a5f; color: #ffffff; padding: 8px 16px; border-radius: 8px; margin-bottom: 14px; }
  .toolbar span { font-size: 13px; font-weight: 600; }
  .tb-btn { border: 0; cursor: pointer; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 600; }
  .tb-print { background: #ffffff; color: #1e3a5f; }
  .tb-close { background: rgba(255,255,255,.18); color: #ffffff; margin-left: 6px; }
  .head { border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 8px; }
  .head h1 { font-size: 18px; font-weight: 700; color: #1e293b; }
  .head p { font-size: 11px; color: #64748b; margin-top: 3px; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 10px; color: #64748b; margin-bottom: 10px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .frame { width: ${Math.ceil(contentW * scale)}px; height: ${Math.ceil(contentH * scale)}px; }
  .scale { position: relative; width: ${contentW}px; height: ${contentH}px; transform: scale(${scale}); transform-origin: top left; }
  .lines { position: absolute; left: 0; top: 0; }
  .card { position: absolute; border: 1px solid #cbd5e1; border-radius: 10px; padding: 5px 8px; overflow: hidden; }
  .card.dead { opacity: .72; }
  .role { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
  .nm { font-size: 12px; font-weight: 700; color: #0f172a; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm.strike { text-decoration: line-through; text-decoration-color: #94a3b8; }
  .bn { font-size: 9px; font-style: italic; color: #64748b; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yr { font-size: 10px; color: #475569; margin-top: 2px; }
  .ex { font-size: 9px; color: #64748b; line-height: 1.3; margin-top: 3px; padding-top: 3px; border-top: 1px solid #e2e8f0; }
</style></head><body>
<div class="toolbar">
  <span>Családfa — nyomtatási nézet</span>
  <span>
    <button type="button" class="tb-btn tb-print" onclick="window.print()">Nyomtatás</button>
    <button type="button" class="tb-btn tb-close" onclick="window.close()">Bezárás</button>
  </span>
</div>
<div class="head">
  <h1>Családfa</h1>
  <p>Nyomtatva: ${esc(new Date().toLocaleDateString('hu-HU'))} · ${data.members.length} személy · ${summary.gens} generáció${scale < 1 ? ` · ${Math.round(scale * 100)}%-ra kicsinyítve` : ''}</p>
</div>
<div class="legend">
  <span>${swatch(COLOR_PARENT_LINE, false)} szülő–gyermek</span>
  <span>${swatch(COLOR_SPOUSE_LINE, false)} házastárs</span>
  <span>${swatch(COLOR_SPOUSE_LINE, true)} élettárs</span>
</div>
<div class="frame"><div class="scale">${svg}${cards}</div></div>
</body></html>`

    const printWin = window.open('', '_blank', 'width=1280,height=900')
    if (!printWin) {
      alert('Engedélyezd a felugró ablakokat a nyomtatáshoz!')
      return
    }
    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()

    // A nyomtatás a betöltés UTÁN indul, dupla indítás ellen védve. (Nincs
    // külső erőforrás, ezért rövid késleltetés is elég.)
    const startPrint = () => {
      const flag = printWin as unknown as { __printed?: boolean }
      if (flag.__printed) return
      flag.__printed = true
      printWin.focus()
      printWin.print()
    }
    // Ha az `afterprint` megjön, magától bezárjuk; ha nem (blokkolt nyomtatás),
    // az ablak nyitva marad a fenti eszközsorral — így sosem ragad üresen.
    printWin.addEventListener('afterprint', () => {
      try {
        printWin.close()
      } catch {
        /* a felhasználó közben bezárhatta */
      }
    })
    if (printWin.document.readyState === 'complete') setTimeout(startPrint, 150)
    else printWin.addEventListener('load', () => setTimeout(startPrint, 150))
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
            {/* SVG vonalak — a geometria a computeTreeGeometry-ből jön (közös a
                nyomtatvánnyal). Sorrend SZÁMÍT: előbb a szülő-gerincek, utána
                a pár-élek, hogy azokat semmi ne takarja. */}
            <svg
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute inset-0"
              style={{ overflow: 'visible' }}
            >
              {/* Vér szerinti szülő–gyermek: szülő-páronként külön csatorna */}
              {geometry.parentLines.map((l) => (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  stroke={COLOR_PARENT_LINE}
                  strokeWidth={WIDTH_PARENT_LINE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {/* Pár-élek — 2026-08-04 (PR-27): élettárs = szaggatott vonal */}
              {geometry.spouseLines.map((s) => (
                <g key={s.key}>
                  <line
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke={COLOR_SPOUSE_LINE}
                    strokeWidth={WIDTH_SPOUSE_LINE}
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                  >
                    <title>{s.title}</title>
                  </line>
                  <circle
                    cx={s.cx}
                    cy={s.cy}
                    r={5}
                    fill="white"
                    stroke={COLOR_SPOUSE_LINE}
                    strokeWidth={1.5}
                  />
                </g>
              ))}
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

        {/* 2026-08-04 (PR-33): JELMAGYARÁZAT — a vászon alján, diszkrét pill-sor.
            A zoom-rétegen KÍVÜL van, ezért nagyításnál is olvasható marad. */}
        <div className="pointer-events-none absolute bottom-2 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
          <LegendPill color={COLOR_PARENT_LINE} label="szülő–gyermek" />
          <LegendPill color={COLOR_SPOUSE_LINE} label="házastárs" />
          <LegendPill color={COLOR_SPOUSE_LINE} label="élettárs" dashed />
        </div>

        {/* Subtle floating help text bottom-right */}
        <div className="pointer-events-none absolute bottom-2 right-3 hidden text-[10px] text-slate-400 sm:block">
          Ctrl+görgő = zoom
        </div>
      </div>
    </div>
  )
}

/** 2026-08-04 (PR-33): egy jelmagyarázat-elem (vonal-minta + felirat). */
function LegendPill({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 shadow-sm ring-1 ring-slate-200/70">
      <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
        <line
          x1="1"
          y1="4"
          x2="17"
          y2="4"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={dashed ? '5 3' : undefined}
        />
      </svg>
      {label}
    </span>
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
  const szuletesiNev = birthNameLabel(member)

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

/**
 * 2026-08-04 (PR-31): leánykori (születési) név felirat — csak ha van, és
 * tényleg ELTÉR a viselt családnévtől (különben felesleges ismétlés lenne).
 * 2026-08-04 (PR-33): kiemelve, mert a nyomtatvány is ezt használja.
 */
function birthNameLabel(member: FamilyTreeMember): string | null {
  const szcs = (member.szcs_nev || '').trim()
  if (!szcs) return null
  const viselt = (member.csaladnev || '').trim()
  if (szcs.localeCompare(viselt, 'hu', { sensitivity: 'base' }) === 0) return null
  return `szül. ${szcs} ${member.k_nev || ''}`.trim()
}

function summarize(members: FamilyTreeMember[]) {
  const gens = new Set(members.map((m) => m.generation))
  return { total: members.length, gens: gens.size }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// ─── VONAL-GEOMETRIA (2026-08-04, PR-33) ─────────────────────────────────────

/** Egy kirajzolható szülő–gyermek szakasz (kész SVG path-adat). */
interface TreeLine {
  key: string
  d: string
}

/** Egy pár-él (házastárs / élettárs) a közepén ülő kis körrel. */
interface TreeSpouseLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  /** A közepén ülő kör középpontja */
  cx: number
  cy: number
  dashed: boolean
  title: string
}

interface TreeGeometry {
  parentLines: TreeLine[]
  spouseLines: TreeSpouseLine[]
}

/** Kerekítés 2 tizedesre — rövidebb path-adat, azonos képernyőn és papíron. */
function nr(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Ortogonális leágazás egységes, ~8px-es lekerekített sarokkal:
 * függőleges (x, startY) → (x, endY), majd vízszintes (endX, endY).
 * A törésponton negyedkör-szerű quadratic ív ül.
 */
function elbowPath(x: number, startY: number, endX: number, endY: number): string {
  const dx = endX - x
  const dy = endY - startY
  // Ha a vízszintes szakasz elhanyagolható, sima függőleges vonal
  if (Math.abs(dx) < 0.75) return `M ${nr(x)} ${nr(startY)} L ${nr(x)} ${nr(endY)}`
  const r = Math.max(0, Math.min(CORNER_R, Math.abs(dy) / 2, Math.abs(dx)))
  const sy = Math.sign(dy) || 1
  const sx = Math.sign(dx)
  return (
    `M ${nr(x)} ${nr(startY)} ` +
    `L ${nr(x)} ${nr(endY - sy * r)} ` +
    `Q ${nr(x)} ${nr(endY)} ${nr(x + sx * r)} ${nr(endY)} ` +
    `L ${nr(endX)} ${nr(endY)}`
  )
}

/**
 * 2026-08-04 (PR-33) — A KAPCSOLATI VONALAK ÚJRATERVEZÉSE.
 *
 * Régi baj: generációnként EGYETLEN hosszú vízszintes gerincsín futott a
 * generációk közti rés közepén, amiből minden leágazás átfutott a szomszédos
 * kártyák mögött; a 2. és 3. generáció vonalai ugyanabba a sávba estek.
 *
 * Új algoritmus:
 *  1. A gyerekeket a SZÜLŐ-HALMAZUK szerint csoportosítjuk („sibship"). Minden
 *     csoport SAJÁT vízszintes csatornát (gerincet) kap — nem egy közöset.
 *  2. A gerinc horgonya (`anchorX`) a szülők vízszintes közepeinek átlaga, azaz
 *     pontosan a pár-él alatt/fölött van. Minden szülő és minden gyerek a saját
 *     kártyája KÖZEPÉBŐL indít egy függőlegest a gerinc y-jáig, majd egyetlen
 *     ~8px-es lekerekített sarokkal fordul a horgony felé.
 *  3. Sávkiosztás: az ugyanabban a generáció-résben futó gerinceket a vízszintes
 *     kiterjedésük (min x, max x) szerint rendezzük, és greedy módon sávokba
 *     osztjuk — átfedő intervallum SOSEM kerül azonos y-ra. Legfeljebb MAX_LANES
 *     sáv van, azon túl körbefordul.
 *
 * Tiszta függvény (nem hook): a képernyő ÉS a nyomtatvány is ezt hívja.
 */
function computeTreeGeometry(
  positions: Map<number, { x: number; y: number }>,
  edges: FamilyTreeEdge[],
  nodeH: number,
): TreeGeometry {
  const parentLines: TreeLine[] = []
  const spouseLines: TreeSpouseLine[] = []

  // 1) Kinek kik a (kirajzolható) szülei?
  const parentsOf = new Map<number, number[]>()
  for (const e of edges) {
    if (e.type !== 'parent-child') continue
    if (!positions.has(e.from) || !positions.has(e.to)) continue
    const arr = parentsOf.get(e.to)
    if (arr) {
      if (!arr.includes(e.from)) arr.push(e.from)
    } else {
      parentsOf.set(e.to, [e.from])
    }
  }

  // 2) Csoportosítás szülő-halmaz + gyerek-sor szerint (egy csoport = egy gerinc)
  const groups = new Map<string, { parents: number[]; children: number[] }>()
  for (const [childId, pids] of parentsOf) {
    const childY = Math.round(positions.get(childId)!.y)
    const sorted = [...pids].sort((a, b) => a - b)
    const key = `${sorted.join('.')}@${childY}`
    const g = groups.get(key)
    if (g) g.children.push(childId)
    else groups.set(key, { parents: sorted, children: [childId] })
  }

  interface Bus {
    key: string
    parents: number[]
    children: number[]
    /** A szülő-kártya azon éle, ahonnan a függőleges indul */
    parentEdgeY: number
    /** A gyerek-kártya azon éle, ahová a függőleges érkezik */
    childEdgeY: number
    /** true = a gyermekek a szülők ALATT vannak (normál irány) */
    childBelow: boolean
    gapStart: number
    gapEnd: number
    anchorX: number
    minX: number
    maxX: number
    y: number
  }

  const buses: Bus[] = []
  for (const [key, g] of groups) {
    const childY = positions.get(g.children[0])!.y
    // Adathiba esetén (több sorban lévő szülők) a gyerektől LEGTÁVOLABBI
    // szülő-sor a mérvadó — így a rés biztosan a két sor közé esik.
    let parentY = positions.get(g.parents[0])!.y
    for (const p of g.parents) {
      const py = positions.get(p)!.y
      if (Math.abs(py - childY) > Math.abs(parentY - childY)) parentY = py
    }
    // Ego-top módban a felmenők a központ ALATT vannak → a gyerek FÖLÜL van
    const childBelow = childY >= parentY
    const parentEdgeY = childBelow ? parentY + nodeH : parentY
    const childEdgeY = childBelow ? childY : childY + nodeH
    const gapStart = Math.min(parentEdgeY, childEdgeY)
    const gapEnd = Math.max(parentEdgeY, childEdgeY)

    const parentXs = g.parents.map((p) => positions.get(p)!.x + NODE_W / 2)
    const childXs = g.children.map((c) => positions.get(c)!.x + NODE_W / 2)
    const anchorX = parentXs.reduce((s, x) => s + x, 0) / parentXs.length
    const allXs = [...parentXs, ...childXs, anchorX]

    buses.push({
      key,
      parents: g.parents,
      children: g.children,
      parentEdgeY,
      childEdgeY,
      childBelow,
      gapStart,
      gapEnd,
      anchorX,
      minX: Math.min(...allXs),
      maxX: Math.max(...allXs),
      y: (gapStart + gapEnd) / 2,
    })
  }

  // 3) Sávkiosztás generáció-résenként (greedy intervallum-színezés)
  const byGap = new Map<string, Bus[]>()
  for (const b of buses) {
    const k = `${Math.round(b.gapStart)}:${Math.round(b.gapEnd)}`
    const list = byGap.get(k)
    if (list) list.push(b)
    else byGap.set(k, [b])
  }
  for (const list of byGap.values()) {
    list.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX)
    /** Sávonként az eddigi legnagyobb x — ide már nem fér be átfedő gerinc. */
    const laneEnd: number[] = []
    const laneOf: number[] = []
    let overflow = 0
    for (const bus of list) {
      let lane = laneEnd.findIndex((end) => bus.minX > end + LANE_PAD)
      if (lane === -1) {
        if (laneEnd.length < MAX_LANES) {
          lane = laneEnd.length
          laneEnd.push(bus.maxX)
        } else {
          // Elfogytak a sávok → körbefordulunk (nagyon sűrű fa)
          lane = overflow % MAX_LANES
          overflow += 1
          laneEnd[lane] = Math.max(laneEnd[lane], bus.maxX)
        }
      } else {
        laneEnd[lane] = Math.max(laneEnd[lane], bus.maxX)
      }
      laneOf.push(lane)
    }
    const laneCount = Math.max(1, laneEnd.length)
    const gapSize = list[0].gapEnd - list[0].gapStart
    const usable = Math.max(0, gapSize - 2 * LANE_MARGIN)
    const step = laneCount > 1 ? usable / (laneCount - 1) : 0
    list.forEach((bus, i) => {
      bus.y =
        laneCount > 1
          ? bus.gapStart + LANE_MARGIN + laneOf[i] * step
          : bus.gapStart + gapSize / 2
    })
  }

  // 4) Path-ok: minden szülő és minden gyerek a KÁRTYA KÖZEPÉBŐL a gerincre
  for (const bus of buses) {
    // Elfajult rés (a két sor gyakorlatilag egymáson) → egyszerű egyenes
    const degenerate = bus.gapEnd - bus.gapStart < 2
    for (const p of bus.parents) {
      const pp = positions.get(p)
      if (!pp) continue
      const x = pp.x + NODE_W / 2
      // 2026-08-04 (review-fix): a vonal MINDIG a saját kártya éléből induljon.
      // Korábban a sibship EGYETLEN parentEdgeY-át használtuk minden szülőre —
      // ha a két szülő eltérő sorban van (adathiba), a közelebbi szülő vonala a
      // levegőben kezdődött, és a saját kártyáján át fordult.
      const startY = bus.childBelow ? pp.y + nodeH : pp.y
      parentLines.push({
        key: `bus-p-${bus.key}-${p}`,
        d: Math.abs(x - bus.anchorX) < 0.5
          ? `M ${nr(x)} ${nr(startY)} L ${nr(bus.anchorX)} ${nr(bus.y)}`
          : elbowPath(x, startY, bus.anchorX, bus.y),
      })
    }
    for (const c of bus.children) {
      const x = positions.get(c)!.x + NODE_W / 2
      parentLines.push({
        key: `bus-c-${bus.key}-${c}`,
        d: degenerate
          ? `M ${nr(x)} ${nr(bus.childEdgeY)} L ${nr(bus.anchorX)} ${nr(bus.y)}`
          : elbowPath(x, bus.childEdgeY, bus.anchorX, bus.y),
      })
    }
  }

  // 5) Pár-élek (a hívó KÉSŐBB rajzolja őket, hogy semmi ne takarja)
  for (const e of edges) {
    if (e.type !== 'spouse') continue
    const fromPos = positions.get(e.from)
    const toPos = positions.get(e.to)
    if (!fromPos || !toPos) continue
    const [a, b] = fromPos.x <= toPos.x ? [fromPos, toPos] : [toPos, fromPos]
    const x1 = a.x + NODE_W
    const y1 = a.y + nodeH / 2
    const x2 = b.x
    const y2 = b.y + nodeH / 2
    spouseLines.push({
      key: `sp-${e.from}-${e.to}`,
      x1: nr(x1),
      y1: nr(y1),
      x2: nr(x2),
      y2: nr(y2),
      cx: nr((x1 + x2) / 2),
      cy: nr((y1 + y2) / 2),
      dashed: e.partnership === 'elettars',
      title: e.partnership === 'elettars' ? 'Élettársi kapcsolat' : 'Házastársak',
    })
  }

  return { parentLines, spouseLines }
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
