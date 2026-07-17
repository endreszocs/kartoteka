'use client'

import { useMemo } from 'react'
import { AlertCircle, FileStack, Files, FolderArchive, Tags } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { FILING_DIRECTION_LABELS } from '@/lib/constants/filing'
import type { FilingEntry } from '@/lib/constants/filing'
import { FILING_UGYKOROK_MAP } from '@/lib/constants/filing-ugykorjegyzek'
import { HU_MONTHS, HU_MONTHS_SHORT } from '@/lib/constants/dashboard'

// hu számformázó a darabszámokhoz (ezreselválasztós, tizedes nélkül)
const NUM_HU = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

export interface FilingOverviewProps {
  /** A kiválasztott év ÖSSZES iktatott irata (nem csak a szűrt lista). */
  entries: FilingEntry[]
  /** A kiválasztott év — a fejlécekhez és az aktuális hónap kiemeléséhez. */
  year: number
}

/**
 * Az F6-migráció utáni opcionális mezők — a FilingEntry típus még nem
 * feltétlenül tartalmazza őket, ezért undefined-tűrően olvassuk. A
 * `csomo_id` csak a 2026-07-es iratcsomó-SQL lefuttatása után létezik
 * a `select('*')` eredményében; addig undefined → „nincs csomóban".
 */
type FilingEntryWithF6 = FilingEntry & { csomo_id?: string | null }

/** A hónap (0–11) kinyerése a kelt ISO-stringből; érvénytelen esetén -1. */
function monthIndexOf(kelt: string | null): number {
  if (!kelt) return -1
  const m = Number(kelt.slice(5, 7))
  if (Number.isInteger(m) && m >= 1 && m <= 12) return m - 1
  // Fallback: nem szabványos formátum → Date-parse próbálkozás
  const parsed = new Date(kelt)
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getMonth()
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  /** Alcím — bontás vagy magyarázat (pl. érkező/kimenő bontás). */
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
 * Iktató év-összkép (2026-07, F6 redesign — K3).
 *
 * Tisztán kliens-oldali számítás a kapott éves irat-listából
 * (a worklog-overview mintájára):
 *  - 4 stat-kártya (összes irat, elintézetlen, iratcsomóban, ügykörök),
 *  - 12 hónapos mini-oszlopdiagram chart-lib nélkül (token-színekkel).
 *
 * Mobile-first: a kártyák 2 oszlopban (md-n 4), a diagram 12 oszlopa
 * görgetés nélkül elfér telefonon is.
 */
export function FilingOverview({ entries, year }: FilingOverviewProps) {
  const stats = useMemo(() => {
    const live = (entries as FilingEntryWithF6[]).filter((e) => !e.deleted)

    // Irány szerinti bontás (az iktató-statisztika meglévő szemantikája)
    const incoming = live.filter((e) => e.direction === 'incoming').length
    const outgoing = live.filter((e) => e.direction === 'outgoing').length

    // Elintézetlen: se elintézési mód, se elintézési dátum nincs rögzítve
    const unresolved = live.filter((e) => !e.elintezes_ideje && !e.elintezes_modja).length

    // Iratcsomóban: csomo_id-s iratok — undefined-tűrő (a mező az F6 SQL után létezik)
    const inBundle = live.filter((e) => Boolean(e.csomo_id)).length

    // Ügykör-eloszlás a top-3 kártyához
    const byUgykor = new Map<string, number>()
    for (const e of live) {
      if (e.ugykor_kod) byUgykor.set(e.ugykor_kod, (byUgykor.get(e.ugykor_kod) ?? 0) + 1)
    }
    const topUgykorok = Array.from(byUgykor.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    // Havi darabszámok a mini-diagramhoz (a kelt dátum alapján)
    const monthly = Array.from({ length: 12 }, () => 0)
    for (const e of live) {
      const m = monthIndexOf(e.kelt)
      if (m >= 0) monthly[m] += 1
    }

    return {
      total: live.length,
      incoming,
      outgoing,
      unresolved,
      inBundle,
      ugykorCount: byUgykor.size,
      topUgykorok,
      monthly,
    }
  }, [entries])

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
            <Files className="size-6" aria-hidden />
          </div>
          <p className="mt-3 font-heading text-base text-foreground">
            {year}. évben még nincs iktatott irat
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Az év-összkép az első iktatott irat után jelenik meg — a stat-kártyák
            és a havi diagram automatikusan frissülnek.
          </p>
        </div>
      </div>
    )
  }

  // Top-3 ügykör alcím: „1. ×12 · 13/2. ×5 · 6/1. ×3" — a kódhoz rövid nevet fűzünk,
  // ha az ügykörjegyzékben szerepel (csak az első helyezettnél, hogy elférjen).
  const topUgykorSub = stats.topUgykorok
    .map(([kod, count]) => `${kod} ×${NUM_HU.format(count)}`)
    .join(' · ')
  const topUgykorNev = stats.topUgykorok[0]
    ? FILING_UGYKOROK_MAP[stats.topUgykorok[0][0]]?.nev ?? null
    : null

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 4 stat-kártya — mobilon 2, md-től 4 oszlop */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <StatCard
          icon={Files}
          label="Iratok összesen"
          value={NUM_HU.format(stats.total)}
          sub={`${FILING_DIRECTION_LABELS.incoming} ${NUM_HU.format(stats.incoming)} · ${FILING_DIRECTION_LABELS.outgoing} ${NUM_HU.format(stats.outgoing)}`}
        />
        <StatCard
          icon={AlertCircle}
          label="Elintézetlen"
          value={NUM_HU.format(stats.unresolved)}
          sub={
            stats.unresolved > 0
              ? `Az iratok ${Math.round((stats.unresolved / stats.total) * 100)}%-a vár elintézésre`
              : 'Minden irat elintézve'
          }
        />
        <StatCard
          icon={FolderArchive}
          label="Iratcsomóban"
          value={NUM_HU.format(stats.inBundle)}
          sub={
            stats.inBundle > 0
              ? `${NUM_HU.format(stats.total - stats.inBundle)} irat csomó nélkül`
              : 'Még nincs iratcsomóba sorolt irat'
          }
        />
        <StatCard
          icon={stats.ugykorCount > 0 ? Tags : FileStack}
          label="Ügykörök"
          value={stats.ugykorCount > 0 ? NUM_HU.format(stats.ugykorCount) : '—'}
          sub={
            stats.ugykorCount > 0
              ? `Top: ${topUgykorSub}${topUgykorNev ? ` — ${topUgykorNev}` : ''}`
              : 'Még nincs ügykör-besorolás'
          }
        />
      </div>

      {/* Havi mini-oszlopdiagram — tisztán CSS, chart-lib nélkül */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-foreground sm:text-base">
            Iktatott iratok havonta
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">{year}</span>
        </div>

        <div
          role="group"
          aria-label={`Iktatott iratok havi eloszlása, ${year}`}
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
                aria-label={`${HU_MONTHS[i]}: ${count} irat${isCurrent ? ' (aktuális hónap)' : ''}`}
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
