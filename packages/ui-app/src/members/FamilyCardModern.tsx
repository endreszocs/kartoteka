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
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    bar: 'from-emerald-500 via-teal-500 to-amber-400',
    glow: 'group-hover:shadow-emerald-900/10',
  },
  partial: {
    label: 'Részben fizetett',
    pill: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    bar: 'from-amber-500 via-amber-400 to-teal-500',
    glow: 'group-hover:shadow-amber-900/10',
  },
  inactive: {
    label: 'Nem fizetett',
    pill: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
    bar: 'from-rose-500 via-rose-400 to-amber-400',
    glow: 'group-hover:shadow-rose-900/10',
  },
  unknown: {
    label: '',
    pill: '',
    bar: 'from-primary via-teal-500 to-amber-400',
    glow: 'group-hover:shadow-primary/10',
  },
}

const ROLE_ICON = { csaladfo: Crown, hazastars: Heart, gyerek: undefined } as const
const ROLE_ICON_TONE = {
  csaladfo: 'text-amber-600 dark:text-amber-400',
  hazastars: 'text-primary/70',
  gyerek: '',
} as const

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

  const familyLabel = data.familyName ? `${data.familyName} család` : `${data.familyId}. család`

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-[1.35rem] border bg-gradient-to-br from-card via-card to-amber-50/35 shadow-[0_14px_40px_-28px_rgba(15,67,61,0.55)] dark:to-amber-950/10',
        'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none',
        isActive ? 'border-border/85' : 'border-border/70 opacity-75 saturate-50',
        onClick ? `hover:border-primary/25 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-28px_rgba(15,67,61,0.48)] ${tone.glow}` : '',
      ].join(' ')}
    >
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="absolute inset-0 z-0 cursor-pointer rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`${familyLabel} családi kartonjának megnyitása`}
        />
      )}
      <div className={`h-1 w-full bg-gradient-to-r ${tone.bar} motion-safe:transition-all motion-safe:duration-300 group-hover:h-1.5 motion-reduce:transition-none`} />

      <div className={`relative z-[1] p-4 sm:p-5 ${onClick ? 'pointer-events-none' : ''}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
            Családi karton · #{data.familyId}
          </span>
          {!isActive && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lezárt
            </span>
          )}
        </div>

        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-2xl bg-primary/6 p-1.5 ring-1 ring-primary/10">
            <MemberAvatarStack
              members={data.members.map((member) => ({
                name: member.name,
                kepUrl: member.kepUrl,
                meghalt: member.meghalt,
              }))}
              size={42}
              max={4}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-lg font-semibold leading-tight text-foreground sm:text-xl">
              {data.familyName ? `${data.familyName} család` : 'Család'}
            </h3>
            <p className={`mt-1 flex items-center gap-1.5 truncate text-xs ${address ? 'text-muted-foreground' : 'font-medium text-amber-700 dark:text-amber-300'}`}>
              <Home className="size-3.5 shrink-0" />
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
              className="pointer-events-auto relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm motion-safe:transition-all motion-safe:duration-200 hover:border-primary/25 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none"
              title="Családi karton nyomtatása"
              aria-label="Családi karton nyomtatása"
            >
              <Printer className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-4 space-y-2 rounded-2xl border border-border/70 bg-card/65 p-2.5 shadow-sm">
          {adults.map((member) => {
            const RoleIcon = ROLE_ICON[member.role]
            return (
              <div key={member.id} className="flex min-h-8 items-center gap-2 rounded-xl px-1.5 py-1 text-sm transition-colors hover:bg-primary/5 motion-reduce:transition-none">
                <MemberAvatar name={member.name} kepUrl={member.kepUrl} meghalt={member.meghalt} size={25} />
                <span className={`min-w-0 flex-1 truncate font-semibold ${member.meghalt ? 'text-muted-foreground line-through decoration-border' : 'text-foreground'}`}>
                  {member.name}
                </span>
                {member.age != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{member.age} év</span>}
                {RoleIcon && <RoleIcon className={`size-3.5 shrink-0 ${ROLE_ICON_TONE[member.role]}`} />}
                {member.meghalt && <span className="shrink-0 text-xs text-muted-foreground">†</span>}
              </div>
            )
          })}
          {adults.length === 0 && (
            <p className="px-1.5 py-1 text-sm italic text-muted-foreground">Nincs rögzített felnőtt tag.</p>
          )}
        </div>

        {children.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {children.length} gyermek
            </span>
            {children.slice(0, 4).map((child) => (
              <span
                key={child.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/5 py-0.5 pl-0.5 pr-2 text-xs text-foreground"
              >
                <MemberAvatar name={child.name} kepUrl={child.kepUrl} meghalt={child.meghalt} size={18} />
                <span className="max-w-[9rem] truncate">{child.name.split(' ').slice(-1)[0]}</span>
                {child.age != null && <span className="tabular-nums text-muted-foreground">{child.age}</span>}
              </span>
            ))}
            {children.length > 4 && (
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">+{children.length - 4} további</span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
          <span className={`flex min-w-0 items-center gap-1.5 text-xs ${data.districtName ? 'text-muted-foreground' : 'font-medium text-amber-700 dark:text-amber-300'}`}>
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{data.districtName || 'Körzet nélkül'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {tone.label && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.pill}`}>
                {tone.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/7 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Users className="size-3" />
              {data.members.length}
            </span>
          </span>
        </div>
      </div>
    </article>
  )
}
