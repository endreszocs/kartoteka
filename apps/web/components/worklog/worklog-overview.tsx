'use client'

import { useMemo } from 'react'
import { CalendarDays, CalendarRange, HandCoins, Users, Wine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { categorizeWorklogEntry, formatRon, WORKLOG_CATEGORY_LABELS } from '@/lib/constants/worklog'
import type { WorklogCategory, WorklogEntry } from '@/lib/constants/worklog'
import { HU_MONTHS, HU_MONTHS_SHORT } from '@/lib/constants/dashboard'

// hu számformázó a DARABSZÁMOKHOZ (ezreselválasztós); a pénz-kiírás a közös
// formatRon helperrel megy (egységes '1 234,56' kimenet a munkanaplóban).
const NUM_HU = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

export interface WorklogOverviewProps {
  /** A kiválasztott év ÖSSZES munkanapló-bejegyzése (nem csak egy hónapé). */
  yearEntries: WorklogEntry[]
  /** A kiválasztott év — a fejlécekhez és az aktuális hónap kiemeléséhez. */
  year: number
}

/** A hónap (0–11) kinyerése az idopont ISO-stringből; érvénytelen esetén -1. */
function monthIndexOf(idopont: string | null): number {
  if (!idopont) return -1
  const m = Number(idopont.slice(5, 7))
  if (Number.isInteger(m) && m >= 1 && m <= 12) return m - 1
  // Fallback: nem szabványos formátum → Date-parse próbálkozás
  const parsed = new Date(idopont)
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getMonth()
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  /** Alcím — bontás vagy magyarázat (pl. kategória-bontás, ffi/nő átlag) */
  sub?: string
}

/** Kis stat-kártya — token-alapú, világos és sötét témában is kontrasztos. */
function StatCard({ icon: Icon, label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </div>
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-heading text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">{sub}</p>
      ) : null}
    </div>
  )
}

/**
 * Munkanapló év-összkép (2026-07-11, F2 redesign — W2).
 *
 * Tisztán kliens-oldali számítás a kapott éves bejegyzés-listából:
 *  - 4 stat-kártya (alkalmak, átlagjelenlét, persely, úrvacsorázók),
 *  - 12 hónapos mini-oszlopdiagram chart-lib nélkül (token-színekkel).
 *
 * Mobile-first: a kártyák 2 oszlopban (md-n 4), a diagram 12 oszlopa
 * görgetés nélkül elfér telefonon is.
 */
export function WorklogOverview({ yearEntries, year }: WorklogOverviewProps) {
  const stats = useMemo(() => {
    const entries = yearEntries.filter((e) => !e.deleted)

    // Kategória-bontás (a közös categorizeWorklogEntry helperrel)
    const byCategory: Record<WorklogCategory, number> = { szolgalat: 0, katekezis: 0, latogatas: 0 }
    for (const e of entries) byCategory[categorizeWorklogEntry(e)] += 1

    // Átlagjelenlét — csak a szolgálat-kategóriájú alkalmakra értelmezett
    const szolgalatEntries = entries.filter((e) => categorizeWorklogEntry(e) === 'szolgalat')
    const attendanceSum = szolgalatEntries.reduce((sum, e) => sum + (e.jelenlet_osszesen || 0), 0)
    const ffiSum = szolgalatEntries.reduce((sum, e) => sum + (e.jelenlet_ferfi || 0), 0)
    const noSum = szolgalatEntries.reduce((sum, e) => sum + (e.jelenlet_no || 0), 0)
    const szolgalatCount = szolgalatEntries.length

    // Persely éves összeg
    const perselySum = entries.reduce((sum, e) => sum + Number(e.persely || 0), 0)

    // Úrvacsorázók — az F2-migráció új oszlopai; régi/offline sorokon hiányozhatnak
    const hasUvData = entries.some((e) => e.uv_templomban != null || e.uv_betegnel != null)
    const uvTemplom = entries.reduce((sum, e) => sum + (e.uv_templomban ?? 0), 0)
    const uvBeteg = entries.reduce((sum, e) => sum + (e.uv_betegnel ?? 0), 0)

    // Havi darabszámok a mini-diagramhoz
    const monthly = Array.from({ length: 12 }, () => 0)
    for (const e of entries) {
      const m = monthIndexOf(e.idopont)
      if (m >= 0) monthly[m] += 1
    }

    return {
      total: entries.length,
      byCategory,
      szolgalatCount,
      avgAttendance: szolgalatCount > 0 ? Math.round(attendanceSum / szolgalatCount) : null,
      avgFfi: szolgalatCount > 0 ? Math.round(ffiSum / szolgalatCount) : null,
      avgNo: szolgalatCount > 0 ? Math.round(noSum / szolgalatCount) : null,
      perselySum,
      hasUvData,
      uvTemplom,
      uvBeteg,
      monthly,
    }
  }, [yearEntries])

  // Az aktuális hónap kiemelése — csak ha a nézett év a folyó év
  const now = new Date()
  const highlightMonth = year === now.getFullYear() ? now.getMonth() : -1
  const maxMonthly = Math.max(...stats.monthly)

  // Üres év → elegáns üres-állapot a teljes áttekintő helyén
  if (stats.total === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-10">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <CalendarRange className="size-6" aria-hidden />
          </div>
          <p className="mt-3 font-heading text-base text-foreground">
            {year}. évben még nincs bejegyzés
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Az év-összkép az első rögzített munkanapló-bejegyzés után jelenik meg —
            a stat-kártyák és a havi diagram automatikusan frissülnek.
          </p>
        </div>
      </div>
    )
  }

  const categorySub = (Object.keys(stats.byCategory) as WorklogCategory[])
    .filter((cat) => stats.byCategory[cat] > 0)
    .map((cat) => `${WORKLOG_CATEGORY_LABELS[cat]} ${NUM_HU.format(stats.byCategory[cat])}`)
    .join(' · ')

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 4 stat-kártya — mobilon 2, md-től 4 oszlop */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Alkalmak száma"
          value={NUM_HU.format(stats.total)}
          sub={categorySub || undefined}
        />
        <StatCard
          icon={Users}
          label="Átlagjelenlét"
          value={stats.avgAttendance != null ? NUM_HU.format(stats.avgAttendance) : '—'}
          sub={
            stats.avgAttendance != null
              ? `Ø férfi ${NUM_HU.format(stats.avgFfi ?? 0)} · nő ${NUM_HU.format(stats.avgNo ?? 0)}`
              : 'Nincs szolgálati alkalom'
          }
        />
        <StatCard
          icon={HandCoins}
          label="Persely összesen"
          value={`${formatRon(stats.perselySum)} RON`}
          sub={`${NUM_HU.format(stats.szolgalatCount)} szolgálati alkalomból`}
        />
        <StatCard
          icon={Wine}
          label="Úrvacsorázók"
          value={stats.hasUvData ? NUM_HU.format(stats.uvTemplom + stats.uvBeteg) : '—'}
          sub={
            stats.hasUvData
              ? `Templomban ${NUM_HU.format(stats.uvTemplom)} · betegeknél ${NUM_HU.format(stats.uvBeteg)}`
              : 'Még nincs rögzített adat'
          }
        />
      </div>

      {/* Havi mini-oszlopdiagram — tisztán CSS, chart-lib nélkül */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-foreground sm:text-base">
            Alkalmak havonta
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">{year}</span>
        </div>

        <div
          role="group"
          aria-label={`Alkalmak havi eloszlása, ${year}`}
          className="mt-3 grid grid-cols-12 gap-1 sm:gap-2"
        >
          {stats.monthly.map((count, i) => {
            const isCurrent = i === highlightMonth
            // A legmagasabb oszlop 100%, a többi arányosan; nem nulla érték
            // legalább 6%-ot kap, hogy látható maradjon.
            const heightPct = count > 0 && maxMonthly > 0 ? Math.max((count / maxMonthly) * 100, 6) : 0
            return (
              <div
                key={i}
                role="img"
                aria-label={`${HU_MONTHS[i]}: ${count} alkalom${isCurrent ? ' (aktuális hónap)' : ''}`}
                className="flex min-w-0 flex-col items-center"
              >
                {/* Darabszám az oszlop felett — fix magasság, hogy a sávok egy vonalból induljanak */}
                <span
                  aria-hidden
                  className={cn(
                    'h-4 text-[10px] leading-4 tabular-nums',
                    isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground',
                  )}
                >
                  {count > 0 ? count : ''}
                </span>
                <div aria-hidden className="flex h-20 w-full items-end sm:h-24">
                  {count > 0 ? (
                    <div
                      className={cn(
                        'w-full rounded-t-md transition-colors',
                        isCurrent ? 'bg-primary' : 'bg-muted-foreground/30',
                      )}
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : (
                    // Üres hónap: vékony alapvonal-csonk, hogy a rács olvasható maradjon
                    <div className="h-0.5 w-full rounded-full bg-muted" />
                  )}
                </div>
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 max-w-full truncate text-[9px] sm:text-[10px]',
                    isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground',
                  )}
                >
                  {HU_MONTHS_SHORT[i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
