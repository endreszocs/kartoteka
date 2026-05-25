'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  Building2,
  Church,
  Globe,
  Landmark,
  Loader2,
} from 'lucide-react'

import { switchActiveProfileRole } from '@/app/(dashboard)/profile/switch-context-action'
import {
  ROLE_LABELS,
  SCOPE_LABELS,
  type ProfileRoleRow,
  type ProfileRoleScope,
} from '@/lib/profile-roles/types'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

/**
 * Scope-onkénti vizuális paletta. A bg* a top-gradient csíkhoz, az icon* az
 * ikon-doboz alapszínéhez, a ring* a hover/active gyűrűhöz.
 */
const SCOPE_THEME: Record<
  ProfileRoleScope,
  {
    chip: string
    iconBg: string
    iconText: string
    iconBgHover: string
    iconTextHover: string
    accentBar: string
    activeRing: string
    activeBadge: string
    activeBorder: string
  }
> = {
  system: {
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    iconBg: 'bg-indigo-50',
    iconText: 'text-indigo-600',
    iconBgHover: 'group-hover:bg-indigo-100',
    iconTextHover: 'group-hover:text-indigo-700',
    accentBar: 'bg-gradient-to-r from-indigo-400 via-indigo-500 to-purple-500',
    activeRing: 'ring-indigo-200',
    activeBadge: 'bg-indigo-600',
    activeBorder: 'border-indigo-300',
  },
  district: {
    chip: 'bg-violet-50 text-violet-700 ring-violet-100',
    iconBg: 'bg-violet-50',
    iconText: 'text-violet-600',
    iconBgHover: 'group-hover:bg-violet-100',
    iconTextHover: 'group-hover:text-violet-700',
    accentBar: 'bg-gradient-to-r from-violet-400 via-purple-500 to-fuchsia-500',
    activeRing: 'ring-violet-200',
    activeBadge: 'bg-violet-600',
    activeBorder: 'border-violet-300',
  },
  diocese: {
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    iconBgHover: 'group-hover:bg-emerald-100',
    iconTextHover: 'group-hover:text-emerald-700',
    accentBar: 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500',
    activeRing: 'ring-emerald-200',
    activeBadge: 'bg-emerald-600',
    activeBorder: 'border-emerald-300',
  },
  congregation: {
    chip: 'bg-amber-50 text-amber-800 ring-amber-100',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-700',
    iconBgHover: 'group-hover:bg-amber-100',
    iconTextHover: 'group-hover:text-amber-800',
    accentBar: 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500',
    activeRing: 'ring-amber-200',
    activeBadge: 'bg-amber-600',
    activeBorder: 'border-amber-300',
  },
}

export interface ProfileChooserProps {
  profileRoles: ProfileRoleRow[]
  activeProfileRoleId: string | null
  scopeNames: Record<string, string>
  fullName: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ProfileChooser({
  profileRoles,
  activeProfileRoleId,
  scopeNames,
  fullName,
}: ProfileChooserProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  function handleChoose(roleId: string) {
    if (isPending) return
    setPendingId(roleId)
    startTransition(async () => {
      const result = await switchActiveProfileRole(roleId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        setPendingId(null)
        return
      }
      router.push(result.redirectTo || '/dashboard')
    })
  }

  // Scope szerinti rendezés: congregation → diocese → district → system,
  // hogy az "ismerős" gyülekezet legyen elöl. Másodlagosan a scope nevére.
  const SCOPE_ORDER: Record<ProfileRoleScope, number> = {
    congregation: 0,
    diocese: 1,
    district: 2,
    system: 3,
  }
  const sortedRoles = [...profileRoles].sort((a, b) => {
    const so = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]
    if (so !== 0) return so
    const an =
      a.scope === 'system'
        ? 'Teljes rendszer'
        : a.scope_id
          ? scopeNames[a.scope_id] || ''
          : ''
    const bn =
      b.scope === 'system'
        ? 'Teljes rendszer'
        : b.scope_id
          ? scopeNames[b.scope_id] || ''
          : ''
    return an.localeCompare(bn, 'hu')
  })

  return (
    <div className="space-y-8 md:space-y-12">
      {/* Üdvözlő blokk */}
      <div className="text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-lg font-semibold text-white shadow-lg shadow-indigo-200/50 sm:size-20 sm:text-xl">
          {getInitials(fullName || '?')}
        </div>
        <h2 className="font-heading text-2xl text-slate-800 sm:text-3xl md:text-4xl">
          Üdvözöljük{fullName ? `, ${fullName.split(' ')[0]}` : ''}!
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
          A nevéhez{' '}
          <span className="font-semibold text-slate-800">
            {profileRoles.length} profil
          </span>{' '}
          van hozzárendelve. Válassza ki, melyikben szeretne most dolgozni — a
          fejléc menüjében később bármikor átválthat.
        </p>
      </div>

      {/* Kártya grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {sortedRoles.map((row) => {
          const Icon = SCOPE_ICONS[row.scope]
          const theme = SCOPE_THEME[row.scope]
          const scopeName =
            row.scope === 'system'
              ? 'Teljes rendszer'
              : row.scope_id
                ? scopeNames[row.scope_id] || '—'
                : '—'
          const roleLabel =
            row.role === 'custom'
              ? row.custom_label || 'Egyedi szerepkör'
              : ROLE_LABELS[row.role]
          const isActive = row.id === activeProfileRoleId
          const isThisPending = pendingId === row.id

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => handleChoose(row.id)}
              disabled={isPending}
              aria-label={`${scopeName} — ${roleLabel}`}
              className={`group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm outline-none transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm ${
                isActive
                  ? `${theme.activeBorder} ring-2 ${theme.activeRing}`
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Scope-szín csík felül */}
              <div className={`h-1.5 w-full ${theme.accentBar}`} />

              <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
                {/* Felső sor: ikon + scope chip */}
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex size-12 items-center justify-center rounded-xl transition-colors ${theme.iconBg} ${theme.iconText} ${theme.iconBgHover} ${theme.iconTextHover}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${theme.chip}`}
                  >
                    {SCOPE_LABELS[row.scope]}
                  </span>
                </div>

                {/* Cím + szerepkör */}
                <div className="min-w-0 flex-1">
                  <p
                    className="font-heading text-lg font-semibold text-slate-800 sm:text-xl"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={scopeName}
                  >
                    {scopeName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 truncate" title={roleLabel}>
                    {roleLabel}
                  </p>
                </div>

                {/* Alsó sor: belépés indikátor */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  {isThisPending ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                      <Loader2 className="size-3.5 animate-spin" />
                      Belépés…
                    </span>
                  ) : (
                    <span className="font-medium">Belépés ebbe a profilba</span>
                  )}
                  <ArrowRight className="size-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-600" />
                </div>
              </div>

              {/* Aktív (utolsó) jelvény */}
              {isActive && (
                <span
                  className={`absolute right-3 top-3.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm ${theme.activeBadge}`}
                  title="Legutóbb ezt használtad"
                >
                  Legutóbbi
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Halk segéd-szöveg */}
      <p className="text-center text-xs text-slate-400">
        Tipp: a fejlécben az avatarra kattintva később is válthat profilt.
      </p>
    </div>
  )
}
