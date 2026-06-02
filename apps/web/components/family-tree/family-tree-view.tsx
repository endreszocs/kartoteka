'use client'

import { useMemo, useState } from 'react'
import { Crown, Heart, User, UserMinus, ZoomIn, ZoomOut } from 'lucide-react'
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

const NODE_W = 188
const NODE_H = 84
const GAP_X = 22
const GAP_Y = 78
const SPOUSE_GAP = 14 // házastársak közötti rövidebb gap

/**
 * 2026-06-02: Családfa vizuális komponens.
 *
 * Layout: minden generáció külön y-szinten, x-tengelyen sorba rendezve.
 * Konvenció: a központ (gen 0) középen, a férfi balra, nő jobbra; szülők
 * felül; gyermekek alul. SVG overlay a vonalakhoz, divek a person card-okhoz.
 *
 * Zoom: 50–150% (a sok generációhoz kényelmes).
 */
export function FamilyTreeView({
  data,
  onMemberClick,
}: {
  data: FamilyTreeData
  /** 2026-06-02: ha megadva, a node-okra kattintva meghívódik az ID-vel. */
  onMemberClick?: (id: number) => void
}) {
  const [zoom, setZoom] = useState(1)

  // Hooks szabály miatt mindig sorrendben — a korai return UTÁN nem szabad
  // useMemo-t hívni.
  const layout = useMemo(() => buildLayout(data), [data])
  const summary = useMemo(() => summarize(data.members), [data])

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
    <div className="space-y-3">
      {/* Vezérlősor + legenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/50 px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-slate-600">
          <LegendDot tone="amber" label="Központ" />
          <LegendDot tone="rose" label="Házastárs" />
          <LegendLine label="Szülő → gyermek" />
          <span className="text-slate-400">·</span>
          <span><strong className="text-slate-700">{summary.total}</strong> személy · {summary.gens} generáció</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
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
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            className="flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Nagyítás"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      {/* A fa konténer — vízszintesen scroll-olható ha nagy */}
      <div className="relative overflow-auto rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/40 via-white to-slate-50/30 p-6 shadow-inner">
        <div
          className="relative origin-top-left transition-transform duration-200"
          style={{ width: layout.width + 16, height: layout.height + 16, transform: `scale(${zoom})` }}
        >
          {/* SVG vonalak */}
          <svg
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute inset-0"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <marker
                id="ft-arrow"
                viewBox="0 0 8 8"
                refX="4"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <circle cx="4" cy="4" r="2.5" fill="rgb(148 163 184)" />
              </marker>
            </defs>

            {/* Először a szülő-gyermek vonalak (alul) */}
            {layout.edges
              .filter((e) => e.type === 'parent-child')
              .map((e) => {
                const fromPos = layout.positions.get(e.from)
                const toPos = layout.positions.get(e.to)
                if (!fromPos || !toPos) return null
                const x1 = fromPos.x + NODE_W / 2
                const y1 = fromPos.y + NODE_H
                const x2 = toPos.x + NODE_W / 2
                const y2 = toPos.y
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

            {/* Házastárs vonalak (fölül) */}
            {layout.edges
              .filter((e) => e.type === 'spouse')
              .map((e) => {
                const fromPos = layout.positions.get(e.from)
                const toPos = layout.positions.get(e.to)
                if (!fromPos || !toPos) return null
                // Mindig balról jobbra rajzolunk
                const [a, b] = fromPos.x < toPos.x ? [fromPos, toPos] : [toPos, fromPos]
                const y = a.y + NODE_H / 2
                return (
                  <g key={`sp-${e.from}-${e.to}`}>
                    <line
                      x1={a.x + NODE_W}
                      y1={y}
                      x2={b.x}
                      y2={y}
                      stroke="rgb(244 114 182)"
                      strokeWidth={2}
                    />
                    {/* Mini szív az ív közepén */}
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
                <PersonCard member={m} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PersonCard({ member }: { member: FamilyTreeMember }) {
  const isFemale = member.ferfi === false
  const isDead = member.meghalt
  const year = parseYear(member.sz_datum)
  const displayName = `${member.csaladnev || ''} ${member.k_nev || ''}`.trim() || '—'

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col justify-between rounded-xl border px-3 py-2 transition-all',
        'shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_14px_rgba(15,23,42,0.1)] hover:-translate-y-0.5',
        member.isCenter
          ? 'border-amber-300/80 bg-gradient-to-br from-amber-50 to-amber-100/40 ring-2 ring-amber-300/40'
          : isFemale
            ? 'border-rose-200/80 bg-gradient-to-br from-rose-50/60 to-white'
            : 'border-sky-200/80 bg-gradient-to-br from-sky-50/60 to-white',
        isDead && 'opacity-65',
      )}
    >
      {/* Felső sor: ikon + név */}
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
            member.isCenter
              ? 'bg-amber-400 text-white'
              : isFemale
                ? 'bg-rose-400 text-white'
                : 'bg-sky-500 text-white',
          )}
        >
          {member.isCenter ? (
            <Crown className="size-3" />
          ) : isDead ? (
            <UserMinus className="size-3" />
          ) : isFemale ? (
            <Heart className="size-3" />
          ) : (
            <User className="size-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-[12.5px] font-semibold leading-tight',
              member.isCenter ? 'text-amber-900' : 'text-slate-800',
              isDead && 'line-through decoration-slate-400/60',
            )}
            title={displayName}
          >
            {displayName}
          </div>
        </div>
      </div>

      {/* Alsó sor: év / státusz */}
      <div className="flex items-center justify-between text-[10.5px] text-slate-500">
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
        {member.isCenter && (
          <span className="rounded-full bg-amber-200/60 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-800">
            Központ
          </span>
        )}
      </div>
    </div>
  )
}

function LegendDot({ tone, label }: { tone: 'amber' | 'rose' | 'sky'; label: string }) {
  const colorClass = tone === 'amber' ? 'bg-amber-400' : tone === 'rose' ? 'bg-rose-400' : 'bg-sky-500'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block size-2.5 rounded-full', colorClass)} />
      <span>{label}</span>
    </span>
  )
}

function LegendLine({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-px w-5 bg-slate-400" />
      <span>{label}</span>
    </span>
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

/**
 * A teljes layout: minden person-ra (x, y) pozíció, generáció-szintenként.
 * Egyszerű approach: minden generáció külön sorban, egyenletes spacing.
 * A központi férj+feleség középre kerül; a többi person az alapján
 * sorolódik, hogy melyik generációban vannak — férfiak balra, nők jobbra,
 * név szerint stabil.
 */
function buildLayout(data: FamilyTreeData): {
  positions: Map<number, { x: number; y: number }>
  edges: FamilyTreeEdge[]
  width: number
  height: number
} {
  const byGen = new Map<number, FamilyTreeMember[]>()
  for (const m of data.members) {
    if (!byGen.has(m.generation)) byGen.set(m.generation, [])
    byGen.get(m.generation)!.push(m)
  }

  const gens = Array.from(byGen.keys()).sort((a, b) => a - b)

  // Maximális szélesség kiszámítása
  let maxRowCount = 0
  for (const gen of gens) {
    const items = byGen.get(gen)!
    if (items.length > maxRowCount) maxRowCount = items.length
  }
  const totalWidth = Math.max(1, maxRowCount) * NODE_W + Math.max(0, maxRowCount - 1) * GAP_X

  const positions = new Map<number, { x: number; y: number }>()

  gens.forEach((gen, gIdx) => {
    const items = byGen.get(gen)!

    // Sortolás: férfi balra, nő jobbra, name stable
    items.sort((a, b) => {
      if (a.ferfi && !b.ferfi) return -1
      if (!a.ferfi && b.ferfi) return 1
      const an = `${a.csaladnev || ''} ${a.k_nev || ''}`
      const bn = `${b.csaladnev || ''} ${b.k_nev || ''}`
      return an.localeCompare(bn, 'hu')
    })

    // A központi sorban (gen 0) próbáljuk a házastárs-vonalakat tömöríteni —
    // a férj-feleség pár között kisebb gap legyen
    const rowWidth = items.length * NODE_W + (items.length - 1) * GAP_X
    const startX = (totalWidth - rowWidth) / 2

    items.forEach((m, mIdx) => {
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

