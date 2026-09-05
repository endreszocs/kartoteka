'use client'

// ── Agenda esemény-kártya (Claude Design widget, 2026-06-07) ──
import {
  Calendar, Clock, ArrowRight, MapPin, Repeat, Star, Flag, Check, Trash2, Globe,
  BookMarked, Link2, Unlink, ExternalLink, Cake, Flower,
} from 'lucide-react'
import { progColor, progLabel, ISMETLODES_LABELS, isAnyakonyviProgramTipus } from '@/lib/constants/dashboard'
import type { Program, IsmetlodesTipus } from '@/lib/constants/dashboard'
import { fmtTime, fmtDateRange } from '@/lib/utils/program-day'
import { GlyphTile, RetegGlyphTile } from './program-icons'
import type { NaptarNapTetel, ProgramAnyakonyvLink } from '@/lib/calendar/naptar-retegek-osszefesules'
import { anyakonyvEmoji, anyakonyvSzin, programAnyakonyvezve } from '@/lib/calendar/naptar-retegek-osszefesules'
import { ANYAKONYV_TABLA_CIMKE, ISMETLODO_SOROZAT_ANYAKONYV_HIBA } from '@/lib/calendar/naptar-retegek-types'
import type { AnyakonyviEsemeny } from '@/lib/calendar/naptar-retegek-types'

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
  p: ProgramAnyakonyvLink
  isToday?: boolean
  /** A dátumot is mutassa (lista-nézet helyett a nap-agenda elrejti). */
  showDate?: boolean
  /** 2026-08-10: sűrűbb változat az irányítópult-csempéhez (kisebb ikonlap). */
  compact?: boolean
  onEdit: (p: Program) => void
  onToggleDone: (p: Program) => void
  onDelete: (p: Program) => void
  /**
   * 2026-09-05 (D1/D12): anyakönyvi típusú, még NEM kötött programnál az
   * „Anyakönyvezés" gomb — a megfelelő anyakönyvi dialógust nyitja a program
   * napjával; mentés után a program megkapja a kapcsolatot.
   */
  onAnyakonyvezes?: (p: ProgramAnyakonyvLink) => void
  /** Kötött programnál a kapcsolat bontása (a program és a bejegyzés is marad). */
  onBontas?: (p: ProgramAnyakonyvLink) => void
}

export function AgendaCard({
  p, isToday, showDate, compact, onEdit, onToggleDone, onDelete, onAnyakonyvezes, onBontas,
}: AgendaCardProps) {
  const color = progColor(p)
  const time = fmtTime(p)
  const multi = !!(p.datum_vege && p.datum_vege !== p.datum)
  const recur = p.ismetlodes_tipus && p.ismetlodes_tipus in ISMETLODES_LABELS
    ? ISMETLODES_LABELS[p.ismetlodes_tipus as IsmetlodesTipus]
    : null
  const anyakonyvi = isAnyakonyviProgramTipus(p.tipus)
  const kotott = programAnyakonyvezve(p)
  // A bejegyzés fülének útvonala: /anyakonyv#<tábla> (RegistryTabs hash-routing).
  const bejegyzesUrl = kotott ? `/anyakonyv#${p.anyakonyv_tabla}` : null

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
          {/* 2026-09-05 (D12): a kötött anyakönyvi program jelzése. */}
          {kotott && (
            <span className="kt-anyakonyv-chip" title="A programhoz anyakönyvi bejegyzés tartozik — a név és a részletek az anyakönyvből olvashatók.">
              <Check size={11} /> anyakönyvezve
            </span>
          )}
          <PriorityMark prioritas={p.prioritas} />
        </div>
        {/* 2026-09-05 (D1/D12): anyakönyvi program → az anyakönyvezés innen indul,
            vagy — ha már kötött — a bejegyzés nyitható / a kapcsolat bontható.
            A gombok a kártya kattintását NEM továbbítják (stopPropagation),
            különben a szerkesztő is felugrana. */}
        {anyakonyvi && (onAnyakonyvezes || onBontas || kotott) && (
          <div className="kt-agenda-linkrow" onClick={(e) => e.stopPropagation()}>
            {!kotott && onAnyakonyvezes && (
              <button
                type="button"
                className="kt-linkbtn kt-linkbtn-primary"
                onClick={() => onAnyakonyvezes(p)}
                // 2026-09-05 (P3-utómunka): ismétlődő sorozatnál a gomb marad (a lelkész
                // lássa, hogy van ilyen művelet), a címke viszont az okot mondja — a
                // kattintás a scheduler kapuján ugyanazt toastolja.
                title={p.ismetlodes_tipus ? ISMETLODO_SOROZAT_ANYAKONYV_HIBA : 'A megfelelő anyakönyvi bejegyzés rögzítése ezzel a dátummal; mentés után a program megkapja a kapcsolatot.'}
              >
                <BookMarked size={13} /> Anyakönyvezés
              </button>
            )}
            {kotott && bejegyzesUrl && (
              <a className="kt-linkbtn" href={bejegyzesUrl} title="Az anyakönyv megfelelő fülének megnyitása">
                <ExternalLink size={13} /> Bejegyzés megnyitása
              </a>
            )}
            {kotott && onBontas && (
              <button
                type="button"
                className="kt-linkbtn kt-linkbtn-muted"
                onClick={() => onBontas(p)}
                title="A kapcsolat bontása — a program és az anyakönyvi bejegyzés is megmarad."
              >
                <Unlink size={13} /> Bontás
              </button>
            )}
          </div>
        )}
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

/**
 * 2026-09-05: RÉTEG-kártya a napi agendában — anyakönyvi TÉNY, születésnap
 * vagy névnap. NEM szerkeszthető és NEM törölhető a csempéről (D12): az
 * anyakönyv sora a tény, a tag a személy; ezek a saját füleiken módosíthatók.
 * A kártya kattintás nélküli (nincs `role=button`), csak a „Megnyitás" link visz tovább.
 */
export function RetegAgendaCard({ tetel, compact }: { tetel: Exclude<NaptarNapTetel, { reteg: 'program' }>; compact?: boolean }) {
  const size = compact ? 'sm' : 'md'
  if (tetel.reteg === 'anyakonyv') {
    const e: AnyakonyviEsemeny = tetel.esemeny
    const szin = anyakonyvSzin(e.tabla)
    return (
      <div className="kt-agenda-card kt-agenda-card--reteg" style={{ ['--type-color' as string]: szin, cursor: 'default' }}>
        <span className="kt-agenda-bar" style={{ background: szin }} />
        <RetegGlyphTile reteg="anyakonyv" szin={szin} emoji={anyakonyvEmoji(e.tabla)} size={size} />
        <div className="kt-agenda-body">
          <div className="kt-agenda-titlerow">
            <span className="kt-agenda-title">{e.cim}</span>
          </div>
          {(e.lelkesz || e.nevek.length > 1) && (
            <div className="kt-agenda-meta">
              {e.nevek.length > 1 && (
                <span className="kt-meta-item" title={e.nevek.join(', ')}>{e.nevek.length} fő</span>
              )}
              {e.lelkesz && <span className="kt-meta-item">Lelkész: {e.lelkesz}</span>}
            </div>
          )}
          <div className="kt-agenda-tags">
            <span className="kt-type-chip" style={{ color: szin, background: `color-mix(in oklab, ${szin} 12%, transparent)` }}>
              {ANYAKONYV_TABLA_CIMKE[e.tabla]} · anyakönyv
            </span>
            <span className="kt-anyakonyv-chip" title="Megtörtént, anyakönyvezett esemény — az anyakönyvből olvasva.">
              <Link2 size={11} /> bejegyzés
            </span>
          </div>
          <div className="kt-agenda-linkrow">
            <a className="kt-linkbtn" href={`/anyakonyv#${e.tabla}`} title="Az anyakönyv megfelelő fülének megnyitása">
              <ExternalLink size={13} /> Bejegyzés megnyitása
            </a>
          </div>
        </div>
      </div>
    )
  }
  if (tetel.reteg === 'szuletesnap') {
    const e = tetel.esemeny
    return (
      <div className="kt-agenda-card kt-agenda-card--reteg kt-agenda-card--szuletesnap" style={{ cursor: 'default' }}>
        <span className="kt-agenda-bar kt-agenda-bar--szuletesnap" />
        <RetegGlyphTile reteg="szuletesnap" Icon={Cake} size={size} />
        <div className="kt-agenda-body">
          <div className="kt-agenda-titlerow">
            <span className="kt-agenda-title">{e.nev}</span>
          </div>
          <div className="kt-agenda-tags">
            <span className="kt-type-chip kt-type-chip--szuletesnap">🎂 {e.kor}. születésnap</span>
          </div>
        </div>
      </div>
    )
  }
  const e = tetel.esemeny
  return (
    <div className="kt-agenda-card kt-agenda-card--reteg kt-agenda-card--nevnap" style={{ cursor: 'default' }}>
      <span className="kt-agenda-bar kt-agenda-bar--nevnap" />
      <RetegGlyphTile reteg="nevnap" Icon={Flower} size={size} />
      <div className="kt-agenda-body">
        <div className="kt-agenda-titlerow">
          <span className="kt-agenda-title">{e.nev}</span>
        </div>
        <div className="kt-agenda-tags">
          <span className="kt-type-chip kt-type-chip--nevnap">💐 névnap — {e.nevnapNev}{e.elsodleges ? '' : ' (másodnév)'}</span>
        </div>
      </div>
    </div>
  )
}
