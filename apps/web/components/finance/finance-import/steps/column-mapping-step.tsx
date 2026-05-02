'use client'

/**
 * 3. lépés — oszlop-párosítás (Kassza fejléc → DB virtuális mező).
 *
 * A `PROFILE_KASSZA` fix oszlop-listát ad: 10 mező (datum, iratszam, irattipus,
 * _donor_string, _bev_osszeg, _bev_cel_nev, _kia_osszeg, _kia_cel_nev,
 * megjegyzes, _szamadasicel_kod). A wizard automatikus mapping-et ajánl, és
 * a felhasználó manuálisan felülírhatja.
 *
 * A v1-ben a Kassza fejléc nagyon stabil — Endre csak ránéz, hogy minden
 * kötelező mező párosul, és tovább megy.
 *
 * 2026-05-02 (Fázis 4): első verzió, a tagnyilvántartás-import column-mapping
 * mintájáról adaptálva, de egyszerűbb (egyetlen profil, kevesebb opció).
 */

import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  PROFILE_KASSZA,
  type ColumnMapping,
  type ImportProfile,
} from '@/lib/import/import-profiles'

interface ColumnMappingStepProps {
  /** A Kassza fülön detektált fejlécek */
  excelHeaders: string[]
  /**
   * Felhasználó által felülírt mapping. Excel-fejléc → DB-oszlop (virtuális).
   * Ha egy header nincs benne, az auto-suggestion használódik.
   */
  overrides: Record<string, string | null>
  onOverrideChange: (excelHeader: string, dbColumn: string | null) => void
  onBack: () => void
  onContinue: () => void
}

interface ResolvedMapping {
  excelHeader: string
  resolvedDbColumn: string | null
  matchedColumn: ColumnMapping | null
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
  overrides,
  onOverrideChange,
  onBack,
  onContinue,
}: ColumnMappingStepProps) {
  const profile = PROFILE_KASSZA

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

  const matchedCount = resolved.filter((r) => r.resolvedDbColumn !== null).length
  const skipCount = resolved.length - matchedCount

  const matchedDbCols = new Set(
    resolved.map((r) => r.resolvedDbColumn).filter((c): c is string => c !== null),
  )
  const missingRequired = profile.columnMap.filter(
    (c) => c.required && !matchedDbCols.has(c.dbColumn),
  )

  const canContinue = missingRequired.length === 0

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
      {/* Profil-fejléc */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Importálási profil
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-800">
          {profile.label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {profile.description}
        </p>
      </div>

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
            A következő DB-mező{missingRequired.length > 1 ? 'khöz' : 'höz'} egyetlen
            Excel-fejléc sem párosul. Válassz manuálisan, vagy ellenőrizd a fájlt:
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
                <th className="px-4 py-3 font-semibold">DB mező</th>
                <th className="px-4 py-3 font-semibold">Magyarázat</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((r) => {
                const isSkipped = r.resolvedDbColumn === null
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
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.matchedColumn?.hint ? (
                        <span className="flex items-start gap-1.5">
                          <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                          {r.matchedColumn.hint}
                        </span>
                      ) : isSkipped ? (
                        <span className="text-slate-400">Nem kerül importba</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profil-tippek */}
      {profile.hints.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 text-xs text-emerald-800">
          <p className="flex items-start gap-2 font-semibold">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            Tudnivalók
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
            {profile.hints.map((h, idx) => (
              <li key={idx}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Vissza/Tovább */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="rounded-full text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább a sor-szétválasztáshoz
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}

interface SummaryStatProps {
  label: string
  value: number
  tone: 'emerald' | 'slate' | 'amber'
  icon: React.ReactNode
}

function SummaryStat({ label, value, tone, icon }: SummaryStatProps) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 bg-emerald-50/80 ring-emerald-100'
      : tone === 'amber'
        ? 'text-amber-700 bg-amber-50/80 ring-amber-100'
        : 'text-slate-700 bg-slate-50/80 ring-slate-100'
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
