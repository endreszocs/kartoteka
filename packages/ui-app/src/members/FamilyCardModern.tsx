'use client'

/**
 * FamilyCardModern — a családi kartonok ÚJ kártyanézete (2026-06-11, Endre).
 *
 * A korábbi webes FamilyCardPreview-t váltja a rács-nézetben: vizuálisabb
 * (tag-avatarok átfedő sorban), tisztább hierarchia (családnév → cím →
 * tagok → lábléc-badge-ek), finom hover-animációk. Web és desktop ugyanazt
 * a komponenst rendereli (D-hullám első közös tagnyilvántartás-darabja).
 *
 * Járulék-tónusok a korábbi logikával egyezően: paid/partial/inactive/unknown.
 */

import { Crown, Heart, Home, MapPin, Printer, Users } from 'lucide-react'

import { MemberAvatar, MemberAvatarStack } from './MemberAvatar'

export type FamilyPaymentStatus = 'paid' | 'partial' | 'inactive' | 'unknown'

export interface FamilyCardMember {
  id: number
  name: string
  role: 'csaladfo' | 'hazastars' | 'gyerek'
  age?: number | null
  meghalt?: boolean
  kepUrl?: string | null
}

export interface FamilyCardModernData {
  familyId: number
  familyName: string | null
  members: FamilyCardMember[]
  street: string | null
  houseNumber: string | null
  districtName: string | null
  isActive?: boolean
  paymentStatus?: FamilyPaymentStatus
}

const TONE: Record<FamilyPaymentStatus, { label: string; pill: string; bar: string; glow: string }> = {
  paid: {
    label: 'Fizetett',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    bar: 'from-emerald-400 via-teal-400 to-emerald-500',
    glow: 'group-hover:shadow-emerald-200/60',
  },
  partial: {
    label: 'Részben fizetett',
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    bar: 'from-amber-400 via-orange-400 to-amber-500',
    glow: 'group-hover:shadow-amber-200/60',
  },
  inactive: {
    label: 'Nem fizetett',
    pill: 'bg-rose-100 text-rose-800 border-rose-200',
    bar: 'from-rose-400 via-pink-400 to-rose-500',
    glow: 'group-hover:shadow-rose-200/60',
  },
  unknown: {
    label: '',
    pill: '',
    bar: 'from-violet-400 via-purple-400 to-indigo-500',
    glow: 'group-hover:shadow-violet-200/60',
  },
}

const ROLE_ICON = { csaladfo: Crown, hazastars: Heart, gyerek: undefined } as const

export interface FamilyCardModernProps {
  data: FamilyCardModernData
  onClick?: () => void
  /** Opcionális karton-nyomtatás gomb (megjelenik a kártya hover-jén). */
  onPrint?: () => void
}

export function FamilyCardModern({ data, onClick, onPrint }: FamilyCardModernProps) {
  const isActive = data.isActive !== false
  const tone = TONE[data.paymentStatus ?? 'unknown']
  const adults = data.members.filter((m) => m.role !== 'gyerek')
  const children = data.members.filter((m) => m.role === 'gyerek')
  const address = [data.street, data.houseNumber].filter(Boolean).join(' ')

  return (
    <div
      className={[
        'group relative overflow-hidden rounded-2xl border bg-white shadow-sm',
        'transition-all duration-300 ease-out',
        isActive ? 'border-slate-200' : 'border-slate-200 opacity-70 saturate-50',
        onClick ? `cursor-pointer hover:-translate-y-1 hover:shadow-xl ${tone.glow}` : '',
      ].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {/* Felső szín-sáv — a járulék-státusz tónusa, hover-re „megnyúlik" */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${tone.bar} transition-all duration-300 group-hover:h-2`} />

      <div className="p-4">
        {/* Fejléc: avatar-stack + családnév + cím */}
        <div className="flex items-start gap-3">
          <MemberAvatarStack
            members={data.members.map((m) => ({ name: m.name, kepUrl: m.kepUrl, meghalt: m.meghalt }))}
            size={44}
            max={4}
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-lg font-semibold leading-tight text-slate-800">
              {data.familyName ? `${data.familyName} család` : 'Család'}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <Home className="size-3 shrink-0 text-slate-400" />
              {address || 'Cím nincs rögzítve'}
            </p>
          </div>
          {onPrint && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPrint()
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 opacity-0 transition-all duration-200 hover:border-teal-200 hover:text-teal-600 group-hover:opacity-100"
              title="Családi karton nyomtatása"
              aria-label="Családi karton nyomtatása"
            >
              <Printer className="size-3.5" />
            </button>
          )}
        </div>

        {/* Felnőttek név szerint (szerep-ikonnal) */}
        <div className="mt-3 space-y-1.5">
          {adults.map((m) => {
            const RoleIcon = ROLE_ICON[m.role]
            return (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <MemberAvatar name={m.name} kepUrl={m.kepUrl} meghalt={m.meghalt} size={22} />
                <span className={`truncate font-medium ${m.meghalt ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}>
                  {m.name}
                </span>
                {m.age != null && <span className="shrink-0 text-xs text-slate-400">({m.age})</span>}
                {RoleIcon && <RoleIcon className="size-3 shrink-0 text-violet-300" />}
                {m.meghalt && <span className="shrink-0 text-xs text-slate-400">†</span>}
              </div>
            )
          })}
          {adults.length === 0 && (
            <p className="text-sm italic text-slate-400">Nincs rögzített felnőtt tag.</p>
          )}
        </div>

        {/* Gyermekek — kompakt chip-sor */}
        {children.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-100 pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {children.length} gyermek
            </span>
            {children.slice(0, 4).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2 text-xs text-slate-600 ring-1 ring-slate-100"
              >
                <MemberAvatar name={c.name} kepUrl={c.kepUrl} meghalt={c.meghalt} size={18} />
                <span className="max-w-[9rem] truncate">{c.name.split(' ').slice(-1)[0]}</span>
                {c.age != null && <span className="text-slate-400">({c.age})</span>}
              </span>
            ))}
            {children.length > 4 && (
              <span className="text-xs text-slate-400">+{children.length - 4} további</span>
            )}
          </div>
        )}

        {/* Lábléc: körzet + státusz-badge-ek */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
            <MapPin className="size-3 shrink-0 text-slate-400" />
            <span className="truncate">{data.districtName || 'Körzet nélkül'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {!isActive && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                Lezárt
              </span>
            )}
            {tone.label && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.pill}`}>
                {tone.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
              <Users className="size-3" />
              {data.members.length}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
