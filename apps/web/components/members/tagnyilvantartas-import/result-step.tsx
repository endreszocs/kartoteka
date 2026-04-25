'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

export type RowIssueSeverity = 'error' | 'warning' | 'info'

export interface RowIssueItem {
  row: number
  message: string
  severity?: RowIssueSeverity
  name?: string
}

export interface ResultData {
  /** Összes sikeresen beszúrt sor (szemely + csalad együtt, vagy csak szemely) */
  insertedTotal: number
  /** Bontás (opcionális, csak family_heads profilnál) */
  insertedSzemely?: number
  insertedCsalad?: number
  /** Hány sor lett kihagyva (csak az 'error' severity-jű sorokat számolja) */
  skippedCount: number
  /** Sor-szintű jegyek: severity szerint csoportosíthatók */
  errors: RowIssueItem[]
}

interface ResultStepProps {
  result: ResultData
  onNewImport: () => void
  onClose?: () => void
  /** Opcionális CTA — pl. családszerkezet összeállítása az import után */
  extraAction?: React.ReactNode
}

export function ResultStep({ result, onNewImport, onClose, extraAction }: ResultStepProps) {
  // Severity szerinti bontás
  const { errors, warnings, infos } = useMemo(() => {
    const errs: RowIssueItem[] = []
    const wrns: RowIssueItem[] = []
    const inf: RowIssueItem[] = []
    for (const item of result.errors) {
      const sev = item.severity ?? 'error'
      if (sev === 'error') errs.push(item)
      else if (sev === 'warning') wrns.push(item)
      else inf.push(item)
    }
    return { errors: errs, warnings: wrns, infos: inf }
  }, [result.errors])

  const isSuccess = result.insertedTotal > 0
  const hasIssues = errors.length + warnings.length + infos.length > 0

  return (
    <div className="space-y-4">
      {/* Fő státusz banner */}
      <div
        className={`rounded-[1.75rem] p-6 ring-1 ${
          isSuccess
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 ring-emerald-200'
            : 'bg-amber-50/80 ring-amber-200'
        }`}
      >
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div
            className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-white ${
              isSuccess
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]'
                : 'bg-amber-500'
            }`}
          >
            {isSuccess ? <CheckCircle2 className="size-7" /> : <AlertTriangle className="size-7" />}
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-slate-800 sm:text-2xl">
              {isSuccess ? 'Sikeres importálás!' : 'Egyetlen sor sem importálódott'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {isSuccess
                ? `${result.insertedTotal} sor sikeresen bekerült az adatbázisba.`
                : 'A fájl egyetlen sorát sem sikerült feldolgozni — nézd át a hibákat alább.'}
              {result.skippedCount > 0 && isSuccess && (
                <>
                  {' '}
                  <span className="text-amber-700">
                    {result.skippedCount} sor kihagyva
                  </span>
                  .
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Statisztikák — első sor: insertálási számok */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Beszúrt rekordok"
          value={result.insertedTotal}
          tone="emerald"
          icon={<Sparkles className="size-4" />}
        />
        {result.insertedSzemely !== undefined && (
          <StatCard
            label="Új személyek"
            value={result.insertedSzemely}
            tone="indigo"
          />
        )}
        {result.insertedCsalad !== undefined && (
          <StatCard
            label="Új családok"
            value={result.insertedCsalad}
            tone="violet"
          />
        )}
        {result.insertedSzemely === undefined && (
          <>
            <StatCard
              label="Kihagyott sorok"
              value={result.skippedCount}
              tone={result.skippedCount > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Hibák"
              value={errors.length}
              tone={errors.length > 0 ? 'rose' : 'slate'}
            />
          </>
        )}
      </div>

      {/* Második sor: severity-bontás */}
      {result.insertedSzemely !== undefined && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Hibák (kihagyva)"
            value={errors.length}
            tone={errors.length > 0 ? 'rose' : 'slate'}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            label="Figyelmeztetések"
            value={warnings.length}
            tone={warnings.length > 0 ? 'amber' : 'slate'}
            icon={<ShieldAlert className="size-4" />}
          />
          <StatCard
            label="Tájékoztató jegyek"
            value={infos.length}
            tone={infos.length > 0 ? 'sky' : 'slate'}
            icon={<Info className="size-4" />}
          />
        </div>
      )}

      {/* Hibák (összecsukható) — piros */}
      {errors.length > 0 && (
        <IssueSection
          title="Hibás sorok (kihagyva)"
          count={errors.length}
          items={errors}
          tone="rose"
          icon={<AlertTriangle className="size-4 text-rose-500" />}
          description="Ezek a sorok nem kerültek be az adatbázisba — kötelező mezők hiányoznak."
        />
      )}

      {/* Figyelmeztetések (összecsukható) — sárga */}
      {warnings.length > 0 && (
        <IssueSection
          title="Figyelmeztetések — kérjük, ellenőrizd!"
          count={warnings.length}
          items={warnings}
          tone="amber"
          icon={<ShieldAlert className="size-4 text-amber-600" />}
          description="Ezek a sorok beszúrásra kerültek, de hiányos adat miatt érdemes átnézni őket."
        />
      )}

      {/* Tájékoztató jegyek (összecsukható) — kék */}
      {infos.length > 0 && (
        <IssueSection
          title="Tájékoztató jegyek"
          count={infos.length}
          items={infos}
          tone="sky"
          icon={<Info className="size-4 text-sky-600" />}
          description="Automatikus következtetések — ezek a sorok hiányos adatokkal érkeztek, de a rendszer biztosan ki tudta tölteni."
        />
      )}

      {/* Akció gombok */}
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} className="rounded-full">
            Bezárás
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onNewImport}
          className="rounded-full"
        >
          <RefreshCw className="mr-1.5 size-4" />
          Új import indítása
        </Button>
        {extraAction}
      </div>

      {!hasIssues && isSuccess && (
        <div className="rounded-2xl bg-emerald-50/60 p-4 text-sm text-emerald-800 ring-1 ring-emerald-100">
          Tiszta import! Egyetlen figyelmeztetés vagy hiba sem jelentkezett.
        </div>
      )}
    </div>
  )
}

// ─── Helper komponensek ────────────────────────────────────────────────

function IssueSection({
  title,
  count,
  items,
  tone,
  icon,
  description,
}: {
  title: string
  count: number
  items: RowIssueItem[]
  tone: 'rose' | 'amber' | 'sky'
  icon: React.ReactNode
  description: string
}) {
  const [expanded, setExpanded] = useState(tone === 'rose') // hibák alapból nyitva

  const toneClasses = {
    rose: {
      ring: 'ring-rose-100',
      bg: 'bg-rose-50/30',
      header: 'hover:bg-rose-50/50',
      title: 'text-rose-700',
      text: 'text-rose-700',
      shadow: 'shadow-[0_18px_40px_-30px_rgba(225,29,72,0.25)]',
    },
    amber: {
      ring: 'ring-amber-100',
      bg: 'bg-amber-50/30',
      header: 'hover:bg-amber-50/50',
      title: 'text-amber-800',
      text: 'text-amber-800',
      shadow: 'shadow-[0_18px_40px_-30px_rgba(217,119,6,0.25)]',
    },
    sky: {
      ring: 'ring-sky-100',
      bg: 'bg-sky-50/30',
      header: 'hover:bg-sky-50/50',
      title: 'text-sky-700',
      text: 'text-sky-700',
      shadow: 'shadow-[0_18px_40px_-30px_rgba(2,132,199,0.25)]',
    },
  } as const

  const cls = toneClasses[tone]

  return (
    <div className={`overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ${cls.ring} ${cls.shadow}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition ${cls.header}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <p className={`text-sm font-semibold ${cls.title}`}>
            {title} ({count})
          </p>
        </div>
        {expanded ? (
          <ChevronDown className={`size-4 ${cls.title}`} />
        ) : (
          <ChevronRight className={`size-4 ${cls.title}`} />
        )}
      </button>
      {expanded && (
        <div className={`max-h-80 overflow-y-auto border-t ${cls.ring} ${cls.bg} px-4 py-3`}>
          <p className="mb-3 text-xs italic text-slate-600">{description}</p>
          <ul className="space-y-1.5">
            {items.map((e, idx) => (
              <li key={idx} className={`text-xs leading-relaxed ${cls.text}`}>
                <span className="font-mono font-semibold">[sor {e.row}]</span>
                {e.name && <span className="font-medium"> ({e.name})</span>}{' '}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'rose' | 'indigo' | 'violet' | 'sky'
  icon?: React.ReactNode
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50/80 ring-emerald-100 text-emerald-700',
    amber: 'bg-amber-50/80 ring-amber-100 text-amber-700',
    slate: 'bg-slate-50/80 ring-slate-100 text-slate-700',
    rose: 'bg-rose-50/80 ring-rose-100 text-rose-700',
    indigo: 'bg-indigo-50/80 ring-indigo-100 text-indigo-700',
    violet: 'bg-violet-50/80 ring-violet-100 text-violet-700',
    sky: 'bg-sky-50/80 ring-sky-100 text-sky-700',
  } as const

  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
