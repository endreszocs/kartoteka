'use client'

import {
  AlertCircle,
  Crown,
  Heart,
  Home,
  MapPin,
  Sparkles,
  User,
  Users,
} from 'lucide-react'

/**
 * 2026-06-02 v2 — Családi karton: design-os, átlátható, papír-szerű.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │ Kovács család           ✨    [Fizetett] │  ← név + státusz pill
 *   │ ────────────────────────────────────     │
 *   │  Templom utca 3                          │  ← cím (pecsét-szerűen)
 *   │                                          │
 *   │  ♂ Családfő   Kovács Pista (55)          │  ← felnőttek 2 sorban
 *   │  ♀ Házastárs  Tóth Mária (53)            │
 *   │                                          │
 *   │  3 gyermek                               │  ← gyermek-összesítő
 *   │  • Kovács Anna (25)                      │
 *   │  • Kovács Béla (22)                      │
 *   │                                          │
 *   │  📍 Körzet: 3. Templomszer               │
 *   │                                          │
 *   │  ⚠ Hiányzik: utca, házszám               │  ← inline figyelmeztetés
 *   └──────────────────────────────────────────┘
 *
 * Színek:
 *   - Fizetett (paid):     emerald — minden járulék rendben
 *   - Részben (partial):   amber  — fizetett valamit, de nem mindent
 *   - Nem fizetett:        rose   — soha vagy idén nem
 *   - Ismeretlen:          slate  — adat-státusz nincs feldolgozva
 */

interface FamilyMember {
  id: number
  name: string
  age?: number | null
  meghalt?: boolean
}

export type PaymentStatus = 'paid' | 'partial' | 'inactive' | 'unknown'

export interface FamilyCardData {
  familyName: string | null
  husband: FamilyMember | null
  wife: FamilyMember | null
  children: FamilyMember[]
  street: string | null
  houseNumber: string | null
  districtName: string | null
  /** Élő előnézet jelzés (a form-dialog jobb oldali panelén). */
  isPreview?: boolean
  /** Aktív háztartás? false = lezárt/archív. */
  isActive?: boolean
  /** Egyházfenntartó járulék-státusz (új, a régi „aktív/inaktív" helyett). */
  paymentStatus?: PaymentStatus
}

interface FamilyCardPreviewProps {
  data: FamilyCardData
  compact?: boolean
  onClick?: () => void
}

const PAYMENT_TONE: Record<PaymentStatus, {
  label: string
  pill: string
  accent: string
  description: string
}> = {
  paid: {
    label: 'Fizetett',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    accent: 'from-emerald-50/60 via-white to-white',
    description: 'Idei egyházfenntartói járulék rendezve',
  },
  partial: {
    label: 'Részben fizetett',
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    accent: 'from-amber-50/60 via-white to-white',
    description: 'Részben fizette az idei egyházfenntartói járulékot',
  },
  inactive: {
    label: 'Nem fizetett',
    pill: 'bg-rose-100 text-rose-800 border-rose-200',
    accent: 'from-rose-50/40 via-white to-white',
    description: 'Idén még nem fizetett egyházfenntartói járulékot',
  },
  unknown: {
    label: 'Ismeretlen',
    pill: 'bg-slate-100 text-slate-600 border-slate-200',
    accent: 'from-slate-50 via-white to-white',
    description: 'A járulék-státusz még nincs lekérdezve',
  },
}

export function FamilyCardPreview({ data, compact, onClick }: FamilyCardPreviewProps) {
  const isActive = data.isActive !== false
  const missing = collectMissingFields(data)
  const hasMissing = missing.length > 0
  const tone = PAYMENT_TONE[data.paymentStatus ?? 'unknown']

  const padding = compact ? 'p-4' : 'p-5'
  const wrapClasses = [
    'group relative rounded-2xl border bg-gradient-to-br shadow-sm transition-all',
    isActive ? `border-slate-200 ${tone.accent}` : 'border-slate-200 from-slate-100 via-white to-slate-50 opacity-70',
    onClick ? 'cursor-pointer hover:shadow-lg hover:border-violet-300 hover:-translate-y-0.5' : '',
    padding,
  ].join(' ')

  return (
    <div className={wrapClasses} onClick={onClick} role={onClick ? 'button' : undefined}>
      {/* Fejléc: család neve + státusz */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3
            className={`font-heading font-semibold leading-tight text-slate-800 ${
              compact ? 'text-base' : 'text-lg'
            }`}
            title={data.familyName ? `${data.familyName} család` : 'névtelen család'}
          >
            {data.familyName ? (
              <>
                {data.familyName}{' '}
                <span className="font-normal text-slate-500">család</span>
              </>
            ) : (
              <span className="italic text-slate-400">— névtelen család —</span>
            )}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {data.isPreview && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              <Sparkles className="size-2.5" />
              élő
            </span>
          )}
          {data.paymentStatus && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.pill}`}
              title={tone.description}
            >
              {tone.label}
            </span>
          )}
        </div>
      </div>

      {/* Cím (pecsét-szerűen) */}
      <div
        className={`inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs shadow-sm border ${
          data.street || data.houseNumber ? 'border-violet-100 text-slate-600' : 'border-amber-200 text-amber-700'
        }`}
      >
        <MapPin className="size-3 shrink-0" />
        {data.street || data.houseNumber ? (
          <span>
            {data.street ?? <em>utca?</em>}
            {data.houseNumber ? ` ${data.houseNumber}` : ''}
          </span>
        ) : (
          <em>Cím hiányzik</em>
        )}
      </div>

      {/* Tagok blokk */}
      <div className="mt-3 space-y-1">
        {/* Családfő */}
        {data.husband || data.wife ? (
          <MemberLine
            role="csaladfo"
            label="Családfő"
            member={data.husband ?? data.wife!}
            compact={compact}
          />
        ) : (
          <MissingLine label="Családfő" tone="missing" compact={compact} />
        )}
        {/* Házastárs — csak ha mindkettő megvan, vagy ha mindkettő hiányzik (akkor opcionálisan jelezzük) */}
        {data.husband && data.wife ? (
          <MemberLine
            role="hazastars"
            label="Házastárs"
            member={data.wife}
            compact={compact}
          />
        ) : (
          (data.husband || data.wife) && (
            <MissingLine label="Házastárs" tone="optional" compact={compact} />
          )
        )}
      </div>

      {/* Gyermekek */}
      {data.children.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
            <Users className="size-3 text-slate-500" />
            {data.children.length} gyermek
          </div>
          <ul className="space-y-0.5">
            {data.children.slice(0, compact ? 3 : 5).map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1.5 text-xs text-slate-700"
              >
                <User className="size-2.5 text-slate-400" />
                <span className={c.meghalt ? 'text-slate-400 line-through' : ''}>
                  {c.meghalt && '† '}
                  {c.name}
                  {c.age != null && (
                    <span className="text-slate-400"> ({c.age})</span>
                  )}
                </span>
              </li>
            ))}
            {data.children.length > (compact ? 3 : 5) && (
              <li className="text-[11px] text-slate-400 italic pl-4">
                + még {data.children.length - (compact ? 3 : 5)} gyermek…
              </li>
            )}
          </ul>
        </div>
      ) : null}

      {/* Körzet */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        <Home className="size-3 text-slate-400" />
        {data.districtName ? (
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 border border-violet-100">
            {data.districtName}
          </span>
        ) : (
          <span className="text-slate-400 italic">körzet nincs hozzárendelve</span>
        )}
      </div>

      {/* Hiányzó adatok — diszkrét */}
      {hasMissing && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-700/85">
          <AlertCircle className="size-3 mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Hiányzik:</strong> {missing.join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Alkomponensek

function MemberLine({
  role,
  label,
  member,
  compact,
}: {
  role: 'csaladfo' | 'hazastars'
  label: string
  member: FamilyMember
  compact?: boolean
}) {
  const isHead = role === 'csaladfo'
  const Icon = isHead ? Crown : Heart
  const iconColor = isHead ? 'text-amber-600' : 'text-rose-500'
  const labelColor = isHead ? 'text-amber-800' : 'text-rose-700'

  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className={`inline-flex items-center justify-center size-5 rounded-full bg-white border border-slate-200 shadow-sm shrink-0 ${iconColor}`}>
        <Icon className="size-3" />
      </span>
      <span className={`font-medium ${labelColor} w-16 shrink-0`}>{label}</span>
      <span
        className={`truncate ${member.meghalt ? 'text-slate-400 line-through' : 'text-slate-800'}`}
        title={member.name}
      >
        {member.meghalt && '† '}
        {member.name}
        {member.age != null && (
          <span className="text-slate-400 font-normal"> ({member.age})</span>
        )}
      </span>
    </div>
  )
}

function MissingLine({
  label,
  tone,
  compact,
}: {
  label: string
  tone: 'missing' | 'optional'
  compact?: boolean
}) {
  const isMissing = tone === 'missing'
  const Icon = label === 'Családfő' ? Crown : Heart
  return (
    <div
      className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} ${
        isMissing ? 'text-amber-700' : 'text-slate-400'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center size-5 rounded-full border shrink-0 ${
          isMissing
            ? 'bg-amber-50 border-amber-200 text-amber-500'
            : 'bg-white border-dashed border-slate-300 text-slate-300'
        }`}
      >
        <Icon className="size-3" />
      </span>
      <span className="font-medium w-16 shrink-0">{label}</span>
      <span className="italic text-slate-400">
        {isMissing ? 'hiányzik' : 'nincs megadva'}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Hiányzó adatok detektálás
function collectMissingFields(data: FamilyCardData): string[] {
  const missing: string[] = []
  if (!data.husband && !data.wife) missing.push('családfő/házastárs')
  if (!data.street) missing.push('utca')
  if (!data.houseNumber) missing.push('házszám')
  if (!data.districtName) missing.push('körzet')
  return missing
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: FamilyRow → FamilyCardData
import type { FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'

export function familyRowToCardData(
  row: FamilyRow,
  opts?: {
    districtMap?: Map<number, string>
    paymentStatus?: PaymentStatus
  },
): FamilyCardData {
  const yearNow = new Date().getFullYear()
  const ageOf = (d: string | null | undefined) =>
    d ? yearNow - new Date(d).getFullYear() : null

  const familyName = row.ferfi?.csaladnev || row.no?.csaladnev || null

  return {
    familyName,
    husband: row.ferfi
      ? {
          id: row.ferfi.id,
          name: `${row.ferfi.csaladnev} ${row.ferfi.k_nev}`.trim(),
          age: ageOf(row.ferfi.sz_datum),
          meghalt: row.ferfi.meghalt,
        }
      : null,
    wife: row.no
      ? {
          id: row.no.id,
          name: `${row.no.csaladnev} ${row.no.k_nev}`.trim(),
          age: ageOf(row.no.sz_datum),
          meghalt: row.no.meghalt,
        }
      : null,
    children: [],
    street: row.utca?.name ?? null,
    houseNumber: row.c_szam,
    districtName:
      row.id_csoport != null && opts?.districtMap
        ? opts.districtMap.get(row.id_csoport) ?? null
        : null,
    isActive: row.isaktiv,
    paymentStatus: opts?.paymentStatus,
  }
}

export function districtsToMap(districts: DistrictRow[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const d of districts) m.set(d.id, d.nev)
  return m
}
