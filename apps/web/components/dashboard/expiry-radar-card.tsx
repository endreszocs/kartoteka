import Link from 'next/link'
import { AlertTriangle, CalendarClock, FileWarning, Landmark, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ExpiryItem, ExpiryRadarResult } from '@/lib/dashboard/expiry-radar'

/**
 * LEJÁRAT-RADAR kártya az irányítópulton — 2026-08-11.
 *
 * A `bottom-stats.tsx` mintáját követi: szerver-komponens, csak propokat kap,
 * `card-raised` + `icon-raised` csempék. Mobil-first: telefonon 1 oszlop, a
 * számláló-csempék 2 oszlopban; sm-től 3 csempe, lg-től a lista két hasábban.
 *
 * A HIBÁT LÁTHATÓVÁ TESSZÜK: ha a radar nem tudott betölteni, NEM a „nincs
 * lejáró tétel" megnyugtató üzenet jelenik meg, hanem piros figyelmeztetés.
 * Egy némán üres radar rosszabb, mint a semmi.
 */

interface CounterDef {
  key: 'lejart' | 'd90' | 'd180'
  label: string
  Icon: LucideIcon
  gradient: string
  emphasis: string
}

const COUNTERS: CounterDef[] = [
  {
    key: 'lejart',
    label: 'Már lejárt',
    Icon: ShieldAlert,
    gradient: 'from-red-500 to-rose-600',
    emphasis: 'text-red-600',
  },
  {
    key: 'd90',
    label: '90 napon belül',
    Icon: CalendarClock,
    gradient: 'from-amber-400 to-amber-500',
    emphasis: 'text-amber-600',
  },
  {
    key: 'd180',
    label: '91–180 nap',
    Icon: FileWarning,
    gradient: 'from-teal-500 to-teal-600',
    emphasis: 'text-teal-700',
  },
]

/** Hány tételt mutatunk a kártyán, mielőtt „+N további"-ra váltunk. */
const VISIBLE_ITEMS = 6

function huDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${m}. ${d}.`
}

function napokLabel(napok: number): string {
  if (napok < 0) return `${Math.abs(napok)} napja lejárt`
  if (napok === 0) return 'ma jár le'
  return `${napok} nap múlva`
}

function ItemRow({ item }: { item: ExpiryItem }) {
  const Icon = item.kind === 'sirhely' ? Landmark : FileWarning
  const tone =
    item.bucket === 'lejart'
      ? 'text-red-600'
      : item.bucket === 'd90'
        ? 'text-amber-600'
        : 'text-muted-foreground'

  return (
    <Link
      href={item.href}
      aria-label={`${item.cim} — ${napokLabel(item.napok)}, megnyitás`}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2 transition hover:bg-muted/50"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{item.cim}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.kind === 'sirhely' ? 'Sírhely-bérlet' : 'Bérleti szerződés'}
          {item.reszlet ? ` · ${item.reszlet}` : ''}
          {item.osszeg != null ? ` · ${item.osszeg.toLocaleString('hu')} RON` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-xs font-semibold ${tone}`}>{napokLabel(item.napok)}</span>
        <span className="block text-[11px] text-muted-foreground">{huDate(item.lejarat)}</span>
      </span>
    </Link>
  )
}

export function ExpiryRadarCard({ result }: { result: ExpiryRadarResult }) {
  if (result.error || !result.radar) {
    return (
      <div className="card-raised p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="icon-raised size-9 shrink-0 bg-gradient-to-br from-red-500 to-rose-600"
          >
            <AlertTriangle className="size-4 text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Lejárat-figyelő</p>
            <p className="mt-1 text-sm leading-6 text-red-600">
              {result.error || 'A lejárat-figyelő most nem érhető el.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Amíg ez a hiba áll fenn, NE tekintsd úgy, hogy nincs lejáró bérlet vagy szerződés.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { items, counts } = result.radar
  const values: Record<CounterDef['key'], number> = {
    lejart: counts.lejart,
    d90: counts.d90,
    d180: counts.d180,
  }
  const visible = items.slice(0, VISIBLE_ITEMS)
  const rest = items.length - visible.length

  return (
    <div className="card-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="icon-raised size-9 bg-gradient-to-br from-amber-400 to-amber-500"
          >
            <CalendarClock className="size-4 text-white" />
          </span>
          <div>
            <p className="font-heading text-lg text-foreground">Lejárat-figyelő</p>
            <p className="text-xs text-muted-foreground">
              Sírhely-bérletek és bérleti szerződések a következő fél évben
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {counts.sirhely} sírhely · {counts.berlet} szerződés
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {COUNTERS.map((c) => {
          const Icon = c.Icon
          const value = values[c.key]
          return (
            <div
              key={c.key}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-3 text-center"
            >
              <div className={`icon-raised mx-auto size-8 bg-gradient-to-br ${c.gradient}`}>
                <Icon className="size-4 text-white" />
              </div>
              <p className={`mt-2 text-lg font-bold ${value > 0 ? c.emphasis : 'text-muted-foreground'}`}>
                {value.toLocaleString('hu')}
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.label}
              </p>
            </div>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
          Nincs lejáró sírhely-bérlet vagy bérleti szerződés a következő 180 napban.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {visible.map((item) => (
              <ItemRow key={item.key} item={item} />
            ))}
          </div>
          {rest > 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              …és további {rest.toLocaleString('hu')} tétel. Részletek:{' '}
              <Link href="/sirhelyek" className="font-medium text-primary underline-offset-2 hover:underline">
                Sírhelyek
              </Link>{' '}
              ·{' '}
              <Link href="/penzugy#rental" className="font-medium text-primary underline-offset-2 hover:underline">
                Bérleti szerződések
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}
