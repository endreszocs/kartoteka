'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  BadgeCheck,
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
import { getStartPathForScope } from '@/lib/auth/scope-start-path'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

/** Szekció-sorrend: a legszűkebb hatókörtől a legtágabbig. */
const SCOPE_ORDER: ProfileRoleScope[] = ['congregation', 'diocese', 'district', 'system']

/** Szekció-címkék a csoportosított nézethez (2026-08-09 redesign). */
const SCOPE_SECTION_LABELS: Record<ProfileRoleScope, string> = {
  congregation: 'Gyülekezeti szolgálat',
  diocese: 'Egyházmegyei',
  district: 'Egyházkerületi',
  system: 'Rendszergazdai',
}

/**
 * Hatókörönkénti azonosító-szín (2026-08-09 token-redesign).
 *
 * A gyülekezeti szint az élő téma accent-jét örökli (kert témában olíva),
 * a tágabb szintek fix azonosító-árnyalatot kapnak. Minden MEGJELENÍTETT
 * szín color-mix-szel származik ebből + a téma tokenjeiből (--card,
 * --foreground, --border), így a dark mód és mindhárom téma automatikusan
 * követve van.
 *
 * ⚠️ AA-kontraszt: tömör accent-háttér + fehér szöveg TILOS (az élő kert
 * témában mérve 3,75:1 — lásd profile-switcher NEUTRAL_FOCUS) — ezért
 * mindenhol tónusos felület + foreground-kevert szöveg megy.
 */
const SCOPE_COLOR: Record<ProfileRoleScope, string> = {
  congregation: 'var(--accent)',
  diocese: '#10b981',
  district: '#8b5cf6',
  system: '#6366f1',
}

/** 2 soros név-levágás tooltippel (a hosszú gyülekezetnevekhez). */
const LINE_CLAMP_2: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
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

function resolveScopeName(row: ProfileRoleRow, scopeNames: Record<string, string>): string {
  if (row.scope === 'system') return 'Teljes rendszer'
  if (!row.scope_id) return '—'
  return scopeNames[row.scope_id] || '—'
}

function roleLabelOf(row: ProfileRoleRow): string {
  return row.role === 'custom' ? row.custom_label || 'Egyedi szerepkör' : ROLE_LABELS[row.role]
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

  // Csoportosítás hatókör szerint; szekción belül név (hu), másodlagosan
  // szerepkör-név szerint rendezve. Üres szekció nem renderelődik.
  const sections = SCOPE_ORDER.map((scope) => ({
    scope,
    rows: profileRoles
      .filter((r) => r.scope === scope)
      .sort((a, b) => {
        const byName = resolveScopeName(a, scopeNames).localeCompare(
          resolveScopeName(b, scopeNames),
          'hu',
        )
        if (byName !== 0) return byName
        return roleLabelOf(a).localeCompare(roleLabelOf(b), 'hu')
      }),
  })).filter((s) => s.rows.length > 0)

  function handleChoose(roleId: string) {
    if (isPending) return
    setPendingId(roleId)
    startTransition(async () => {
      const result = await switchActiveProfileRole(roleId)
      // Sikerkor a server action NEXT_REDIRECT-tel dob — itt sose jutunk
      // tovább. Csak hibakor kapunk vissza return-t.
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
        setPendingId(null)
      }
    })
  }

  /**
   * Hover-re előmelegítjük a célút render-cache-ét, hogy a kattintás
   * utáni navigáció instant legyen. A Next.js App Router automatikusan
   * cache-eli a prefetch-et a session-en belül.
   */
  function handleHover(scope: ProfileRoleScope, role: string) {
    if (isPending) return
    const target = getStartPathForScope(scope, role)
    router.prefetch(target)
  }

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Üdvözlő hero — card-raised + token-blobok (AdminPageHeader-minta) */}
      <section className="card-raised relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="absolute -right-14 -top-14 size-48 rounded-full blur-3xl"
          style={{ background: 'color-mix(in oklab, var(--accent2) 30%, transparent)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-12 -left-12 size-40 rounded-full blur-3xl"
          style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }}
        />

        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-6 sm:text-left">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-[var(--primary-foreground)] shadow-md sm:size-20 sm:text-xl"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
          >
            {getInitials(fullName || '?')}
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                color: 'color-mix(in oklab, var(--primary) 65%, var(--muted-foreground))',
              }}
            >
              Profilválasztás
            </p>
            <h2 className="mt-1 font-heading text-2xl text-foreground sm:text-3xl md:text-4xl">
              Üdvözöljük{fullName ? `, ${fullName}` : ''}!
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:mx-0 sm:text-base">
              A nevéhez{' '}
              <span className="font-semibold text-foreground">
                {profileRoles.length} profil
              </span>{' '}
              van hozzárendelve. Válassza ki, melyikben szeretne most dolgozni — a
              fejléc menüjében később bármikor átválthat.
            </p>
          </div>
        </div>
      </section>

      {/* Hatókör-szekciók: gyülekezeti → egyházmegyei → egyházkerületi → rendszer */}
      {sections.map(({ scope, rows }) => {
        const Icon = SCOPE_ICONS[scope]
        const scopeColor = SCOPE_COLOR[scope]
        const headingId = `profil-szekcio-${scope}`

        return (
          <section key={scope} aria-labelledby={headingId} className="space-y-4">
            {/* Szekció-fejléc: ikon + eyebrow + darabszám + finom elválasztó */}
            <div
              className="flex items-center gap-2.5"
              style={{ '--scope-c': scopeColor } as React.CSSProperties}
            >
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: 'color-mix(in oklab, var(--scope-c) 14%, var(--card))',
                  color: 'color-mix(in oklab, var(--scope-c) 60%, var(--foreground))',
                  boxShadow:
                    'inset 0 0 0 1px color-mix(in oklab, var(--scope-c) 25%, transparent)',
                }}
              >
                <Icon className="size-4" />
              </span>
              <h3
                id={headingId}
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  color: 'color-mix(in oklab, var(--scope-c) 50%, var(--foreground))',
                }}
              >
                {SCOPE_SECTION_LABELS[scope]}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {rows.length}
              </span>
              <div aria-hidden className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {rows.map((row) => {
                const scopeName = resolveScopeName(row, scopeNames)
                const roleLabel = roleLabelOf(row)
                const isActive = row.id === activeProfileRoleId
                const isThisPending = pendingId === row.id
                const isOtherPending = pendingId !== null && pendingId !== row.id

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleChoose(row.id)}
                    onMouseEnter={() => handleHover(row.scope, row.role)}
                    onFocus={() => handleHover(row.scope, row.role)}
                    disabled={isPending}
                    aria-label={`${scopeName} — ${roleLabel}`}
                    style={{ '--scope-c': scopeColor } as React.CSSProperties}
                    className={`group relative flex min-h-44 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring ${
                      isThisPending
                        ? 'scale-[1.02] border-[color-mix(in_oklab,var(--scope-c)_45%,var(--border))] shadow-xl ring-2 ring-[color-mix(in_oklab,var(--scope-c)_35%,transparent)]'
                        : isOtherPending
                          ? 'pointer-events-none border-border opacity-40'
                          : 'hover:-translate-y-1 hover:shadow-xl hover:ring-2 hover:ring-[color-mix(in_oklab,var(--scope-c)_25%,transparent)]'
                    } ${
                      isActive && !isThisPending
                        ? 'border-[color-mix(in_oklab,var(--scope-c)_45%,var(--border))] ring-2 ring-[color-mix(in_oklab,var(--scope-c)_28%,transparent)]'
                        : !isThisPending && !isOtherPending
                          ? 'border-border hover:border-[color-mix(in_oklab,var(--scope-c)_40%,var(--border))]'
                          : ''
                    }`}
                  >
                    {/* Felső accent-csík — hatókör-színből halványuló gradiens */}
                    <div
                      aria-hidden
                      className="h-1.5 w-full"
                      style={{
                        background:
                          'linear-gradient(90deg, var(--scope-c), color-mix(in oklab, var(--scope-c) 40%, var(--card)))',
                      }}
                    />

                    <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex size-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                          style={{
                            background:
                              'color-mix(in oklab, var(--scope-c) 14%, var(--card))',
                            color:
                              'color-mix(in oklab, var(--scope-c) 65%, var(--foreground))',
                            boxShadow:
                              'inset 0 0 0 1px color-mix(in oklab, var(--scope-c) 22%, transparent)',
                          }}
                        >
                          <Icon className="size-6" />
                        </div>

                        {isActive && !isThisPending ? (
                          /* Aktív jelölés — tónusos felület, NEM fehér-accenten (AA) */
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background:
                                'color-mix(in oklab, var(--scope-c) 16%, var(--card))',
                              color:
                                'color-mix(in oklab, var(--scope-c) 50%, var(--foreground))',
                              boxShadow:
                                'inset 0 0 0 1px color-mix(in oklab, var(--scope-c) 30%, transparent)',
                            }}
                            title="Legutóbb ebben a profilban dolgozott"
                          >
                            <BadgeCheck className="size-3" />
                            Jelenlegi profil
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
                            {SCOPE_LABELS[row.scope]}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="font-heading text-lg font-semibold text-foreground sm:text-xl"
                          style={LINE_CLAMP_2}
                          title={scopeName}
                        >
                          {scopeName}
                        </p>
                        <p
                          className="mt-1 truncate text-sm font-medium"
                          style={{
                            color:
                              'color-mix(in oklab, var(--scope-c) 45%, var(--foreground))',
                          }}
                          title={roleLabel}
                        >
                          {roleLabel}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                        {isThisPending ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Belépés folyamatban…
                          </span>
                        ) : (
                          <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                            Belépés ebbe a profilba
                          </span>
                        )}
                        <ArrowRight
                          className={`size-4 transition-all ${
                            isThisPending
                              ? 'translate-x-1 text-foreground'
                              : 'text-muted-foreground/50 group-hover:translate-x-0.5 group-hover:text-foreground'
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="text-center text-xs text-muted-foreground">
        Tipp: a fejlécben az avatarra kattintva később is válthat profilt.
      </p>
    </div>
  )
}
