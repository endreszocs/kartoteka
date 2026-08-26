'use client'

// ── Agenda esemény-kártya (Claude Design widget, 2026-06-07) ──
import { Calendar, Clock, ArrowRight, MapPin, Repeat, Star, Flag, Check, Trash2, Globe } from 'lucide-react'
import { progColor, progLabel, ISMETLODES_LABELS } from '@/lib/constants/dashboard'
import type { Program, IsmetlodesTipus } from '@/lib/constants/dashboard'
import { fmtTime, fmtDateRange } from '@/lib/utils/program-day'
import { GlyphTile } from './program-icons'

function PriorityMark({ prioritas }: { prioritas: Program['prioritas'] }) {
  if (prioritas === 'kiemelt') {
    return (
      <span className="kt-prio kt-prio-kiemelt" title="Kiemelt prioritás">
        <Star size={12} strokeWidth={2} /> Kiemelt
      </span>
    )
  }
  if (prioritas === 'fontos') {
    return (
      <span className="kt-prio kt-prio-fontos" title="Fontos">
        <Flag size={12} strokeWidth={2} /> Fontos
      </span>
    )
  }
  return null
}

interface AgendaCardProps {
  p: Program
  isToday?: boolean
  /** A dátumot is mutassa (lista-nézet helyett a nap-agenda elrejti). */
  showDate?: boolean
  /** 2026-08-10: sűrűbb változat az irányítópult-csempéhez (kisebb ikonlap). */
  compact?: boolean
  onEdit: (p: Program) => void
  onToggleDone: (p: Program) => void
  onDelete: (p: Program) => void
}

export function AgendaCard({ p, isToday, showDate, compact, onEdit, onToggleDone, onDelete }: AgendaCardProps) {
  const color = progColor(p)
  const time = fmtTime(p)
  const multi = !!(p.datum_vege && p.datum_vege !== p.datum)
  const recur = p.ismetlodes_tipus && p.ismetlodes_tipus in ISMETLODES_LABELS
    ? ISMETLODES_LABELS[p.ismetlodes_tipus as IsmetlodesTipus]
    : null

  return (
    <div
      className={`kt-agenda-card${p.teljesitett ? ' is-done' : ''}${isToday ? ' is-today' : ''}${p.prioritas === 'kiemelt' ? ' is-kiemelt' : ''}`}
      style={{ ['--type-color' as string]: color }}
      onClick={() => onEdit(p)}
      role="button"
      tabIndex={0}
      aria-label={`${p.cim} szerkesztése`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(p)
        }
      }}
    >
      <span className="kt-agenda-bar" style={{ background: color }} />
      <GlyphTile p={p} size={compact ? 'sm' : 'md'} />
      <div className="kt-agenda-body">
        <div className="kt-agenda-titlerow">
          <span className="kt-agenda-title">{p.cim}</span>
        </div>
        <div className="kt-agenda-meta">
          {showDate && (
            <span className="kt-meta-item kt-meta-strong">
              <Calendar size={12} /> {fmtDateRange(p)}
            </span>
          )}
          {time && (
            <span className="kt-meta-item">
              <Clock size={12} /> {time}
            </span>
          )}
          {multi && !showDate && (
            <span className="kt-meta-item kt-meta-multi">
              <ArrowRight size={12} /> {fmtDateRange(p)}
            </span>
          )}
          {p.helyszin && (
            <span className="kt-meta-item">
              <MapPin size={12} /> {p.helyszin}
            </span>
          )}
        </div>
        <div className="kt-agenda-tags">
          <span
            className="kt-type-chip"
            style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}
          >
            {progLabel(p)}
          </span>
          {recur && (
            <span className="kt-recur-chip" title="Ismétlődő alkalom">
              <Repeat size={11} /> {recur}
            </span>
          )}
          {/* 2026-08-27 — a nyilvános jelölés LÁTSZÓDJON a listában is.
              Enélkül a „miért nem látszik a weboldalon?" kérdésre a
              határidőnaplóból nem lehetett válaszolni: a kapcsoló a
              szerkesztő-ablak alján, alapból kikapcsolva ült. */}
          {p.publikus && (
            <span className="kt-public-chip" title="Ez az alkalom megjelenik a gyülekezet nyilvános weboldalán és a letölthető naptárban.">
              <Globe size={11} /> weboldalon
            </span>
          )}
          <PriorityMark prioritas={p.prioritas} />
        </div>
      </div>
      <div className="kt-agenda-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`kt-done-toggle${p.teljesitett ? ' is-on' : ''}`}
          title={p.teljesitett ? 'Teljesítés visszavonása' : 'Teljesítettnek jelöl'}
          aria-label={p.teljesitett ? 'Teljesítés visszavonása' : 'Teljesítettnek jelöl'}
          onClick={() => onToggleDone(p)}
        >
          <Check size={16} strokeWidth={2.6} />
        </button>
        <button
          type="button"
          className="kt-row-btn kt-row-del"
          title="Törlés"
          aria-label="Törlés"
          onClick={() => onDelete(p)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
