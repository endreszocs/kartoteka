'use client'

import { useMemo } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ImportProfile, ColumnMapping } from '@/lib/import/import-profiles'

interface ColumnMappingStepProps {
  /** Az Excel fájlból detektált fejlécek */
  excelHeaders: string[]
  /** A választott profil (PROFILE_PERSONS vagy PROFILE_FAMILY_HEADS) */
  profile: ImportProfile
  /**
   * A felhasználó által felülírt mapping. Excel fejléc → DB oszlop.
   * Ha egy excelHeader nincs benne, az auto-suggestion használódik.
   */
  overrides: Record<string, string | null>
  onOverrideChange: (excelHeader: string, dbColumn: string | null) => void
  /** A profil választása váltható-e (csaladok.xml-nél: persons / family_heads) */
  availableProfiles?: ImportProfile[]
  selectedProfileKey?: string
  onProfileChange?: (key: string) => void
  /** Vissza/tovább gombok */
  onBack: () => void
  onContinue: () => void
}

interface ResolvedMapping {
  excelHeader: string
  /** Auto-vagy-felülírt DB oszlop (null = "kihagyás") */
  resolvedDbColumn: string | null
  /** A profil-beli columnMapping (ha az auto-suggestion talált) */
  matchedColumn: ColumnMapping | null
  /** Ki lett-e írva manuálisan */
  isOverride: boolean
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[.\s_-]+/g, '').trim()
}

function matchHeaderToProfile(header: string, profile: ImportProfile): ColumnMapping | null {
  const norm = normalizeForMatch(header)
  for (const col of profile.columnMap) {
    if (normalizeForMatch(col.excelHeader) === norm) return col
    if (col.excelAliases?.some((a) => normalizeForMatch(a) === norm)) return col
  }
  return null
}

export function ColumnMappingStep({
  excelHeaders,
  profile,
  overrides,
  onOverrideChange,
  availableProfiles,
  selectedProfileKey,
  onProfileChange,
  onBack,
  onContinue,
}: ColumnMappingStepProps) {
  // Mapping feloldás minden Excel-fejléchez
  const resolved = useMemo<ResolvedMapping[]>(() => {
    return excelHeaders.map((header) => {
      const matched = matchHeaderToProfile(header, profile)
      const userOverride = overrides[header]
      const resolvedDbColumn =
        userOverride !== undefined ? userOverride : matched?.dbColumn ?? null
      return {
        excelHeader: header,
        resolvedDbColumn,
        matchedColumn: matched,
        isOverride: userOverride !== undefined,
      }
    })
  }, [excelHeaders, profile, overrides])

  // Statisztikák
  const matchedCount = resolved.filter((r) => r.resolvedDbColumn !== null).length
  const skipCount = resolved.length - matchedCount

  // Hiányzó kötelező mezők
  const matchedDbCols = new Set(
    resolved.map((r) => r.resolvedDbColumn).filter((c): c is string => c !== null),
  )
  const missingRequired = profile.columnMap.filter(
    (c) => c.required && !matchedDbCols.has(c.dbColumn),
  )

  const canContinue = missingRequired.length === 0

  // SELECT opciók: összes profil-oszlop + "Kihagyás"
  const allColumnOptions = useMemo(() => {
    return [
      { value: '__skip__', label: '— Kihagyás —', column: null as ColumnMapping | null },
      ...profile.columnMap.map((c) => ({
        value: c.dbColumn,
        label: `${c.excelHeader}${c.required ? ' *' : ''}`,
        column: c,
      })),
    ]
  }, [profile])

  return (
    <div className="space-y-4">
      {/* Profil-váltó (csak ha több profil elérhető) */}
      {availableProfiles && availableProfiles.length > 1 && (
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Importálási profil
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Válaszd ki, milyen típusú adatokat szeretnél importálni — minden profil más
            DB-szerkezetbe ír.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {availableProfiles.map((p) => {
              const active = p.key === selectedProfileKey
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onProfileChange?.(p.key)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active
                      ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
                      : 'border-slate-200 bg-white/85 hover:border-emerald-200 hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        active ? 'text-emerald-700' : 'text-slate-800'
                      }`}
                    >
                      {p.label}
                    </p>
                    {active && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {p.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Áttekintés */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Felismert oszlopok"
          value={matchedCount}
          tone="emerald"
          icon={<Sparkles className="size-4" />}
        />
        <SummaryStat
          label="Kihagyott oszlopok"
          value={skipCount}
          tone="slate"
          icon={<ArrowRight className="size-4 rotate-45" />}
        />
        <SummaryStat
          label="Hiányzó kötelező"
          value={missingRequired.length}
          tone={missingRequired.length === 0 ? 'emerald' : 'amber'}
          icon={
            missingRequired.length === 0 ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )
          }
        />
      </div>

      {/* Hiányzó kötelező figyelmeztetés */}
      {missingRequired.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Hiányzó kötelező mező{missingRequired.length > 1 ? 'k' : ''}
          </p>
          <p className="mt-1 leading-relaxed">
            A következő DB-oszlop{missingRequired.length > 1 ? 'okhoz' : 'hoz'} egyetlen
            Excel-fejléc sem párosul. Válassz manuálisan vagy adj hozzá az Excel-ben:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missingRequired.map((c) => (
              <span
                key={c.dbColumn}
                className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                {c.excelHeader}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mapping táblázat */}
      <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-100 bg-emerald-50/60 text-left text-xs uppercase tracking-[0.16em] text-emerald-700/80">
                <th className="px-4 py-3 font-semibold">Excel fejléc</th>
                <th className="px-4 py-3 font-semibold">→</th>
                <th className="px-4 py-3 font-semibold">DB oszlop</th>
                <th className="px-4 py-3 font-semibold">Magyarázat</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((r) => {
                const isSkipped = r.resolvedDbColumn === null
                const matchedOption = allColumnOptions.find(
                  (o) => o.value === r.resolvedDbColumn,
                )
                return (
                  <tr key={r.excelHeader} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{r.excelHeader}</p>
                      {r.isOverride && (
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-600">
                          felhasználó által módosítva
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <ArrowRight className="size-4" />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.resolvedDbColumn ?? '__skip__'}
                        onChange={(e) => {
                          const v = e.target.value
                          onOverrideChange(r.excelHeader, v === '__skip__' ? null : v)
                        }}
                        className={`h-9 w-full max-w-[280px] rounded-xl border px-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                          isSkipped
                            ? 'border-slate-200 bg-slate-50 text-slate-500'
                            : 'border-emerald-200 bg-white text-slate-700'
                        }`}
                      >
                        {allColumnOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs leading-relaxed text-slate-500">
                      {matchedOption?.column?.hint ? (
                        <span className="flex items-start gap-1.5">
                          <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                          <span>{matchedOption.column.hint}</span>
                        </span>
                      ) : isSkipped ? (
                        <span className="italic text-slate-400">
                          Ez az oszlop nem kerül a DB-be.
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vissza / Tovább */}
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza a fájl-választáshoz
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább az előnézethez
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'emerald' | 'slate' | 'amber'
  icon: React.ReactNode
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    slate: 'bg-slate-50/80 text-slate-600 ring-slate-100',
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
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
