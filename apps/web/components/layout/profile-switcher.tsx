'use client'

/**
 * Profilváltó — a fejléc mega menüjében (2026-07-25, G2 újratervezés).
 *
 * Korábban lapos gomblista volt, csoportosítás és keresés nélkül — sok
 * szerepnél átláthatatlanul hosszú. Mostantól:
 *   - scope szerint CSOPORTOSÍTVA (Gyülekezet / Egyházmegye / Egyházkerület / Rendszer),
 *   - 5-nél több szerepnél KERESŐ (a scope-névre és a szerep-címkére szűr),
 *   - hover/fókusz PREFETCH a jósolt célútra (a /valassz-profilt mintája —
 *     a fejlécből eddig hiányzott, ez a legolcsóbb érzékelt-sebesség nyereség),
 *   - OPTIMISTA visszajelzés: a kiválasztott sor azonnal pörgőt kap
 *     (a server action NEXT_REDIRECT-tel tér vissza, a navigáció beérkezéséig
 *     a pending állapot él).
 *
 * Minden adat prop-ként érkezik (profileRoles + scopeNames) — nincs új fetch.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Check, Church, Globe, Landmark, Loader2, Search } from 'lucide-react'

import { switchActiveProfileRole } from '@/app/(dashboard)/profile/switch-context-action'
import { getStartPathForScope } from '@/lib/auth/scope-start-path'
import {
  ROLE_LABELS,
  SCOPE_LABELS,
  type ProfileRoleRow,
  type ProfileRoleScope,
} from '@/lib/profile-roles/types'

export interface ProfileSwitcherProps {
  /** Az aktív profile_role ID-ja (null ha nincs kiválasztva — a default-ot használja) */
  activeProfileRoleId: string | null
  /** Az összes approved profile_roles sor */
  profileRoles: ProfileRoleRow[]
  /** A scope + scope_id alapján feloldott név (pl. gyülekezet/egyházmegye neve) */
  scopeNames: Record<string, string>
}

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

/** Csoport-sorrend: a legszűkebb hatókörtől a legtágabbig. */
const SCOPE_ORDER: ProfileRoleScope[] = ['congregation', 'diocese', 'district', 'system']

/** Kereső ennyi szereptől jelenik meg. */
const SEARCH_THRESHOLD = 5

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function roleLabelOf(row: ProfileRoleRow): string {
  return row.role === 'custom' ? row.custom_label || 'Egyedi szerep' : ROLE_LABELS[row.role]
}

function resolveScopeName(row: ProfileRoleRow, scopeNames: Record<string, string>): string {
  if (row.scope === 'system') return 'Teljes rendszer'
  if (!row.scope_id) return '—'
  return scopeNames[row.scope_id] || '—'
}

export function ProfileSwitcher({
  activeProfileRoleId,
  profileRoles,
  scopeNames,
}: ProfileSwitcherProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const router = useRouter()

  const active = profileRoles.find((r) => r.id === activeProfileRoleId) || profileRoles[0]

  // A csoportosítás/szűrés a hookok UTÁN sem lehet feltételes — a korai
  // visszatérés ezért a hookok mögé kerül (react-hooks/rules-of-hooks).
  const groups = useMemo(() => {
    const q = normalize(query.trim())
    const others = profileRoles.filter((r) => r.id !== active?.id)
    const filtered = q
      ? others.filter(
          (r) =>
            normalize(resolveScopeName(r, scopeNames)).includes(q) ||
            normalize(roleLabelOf(r)).includes(q) ||
            normalize(SCOPE_LABELS[r.scope] || '').includes(q),
        )
      : others
    return SCOPE_ORDER.map((scope) => ({
      scope,
      rows: filtered
        .filter((r) => r.scope === scope)
        .sort((a, b) =>
          resolveScopeName(a, scopeNames).localeCompare(resolveScopeName(b, scopeNames), 'hu'),
        ),
    })).filter((group) => group.rows.length > 0)
  }, [profileRoles, active?.id, scopeNames, query])

  if (profileRoles.length <= 1 || !active) return null

  const totalOthers = profileRoles.length - 1
  const visibleCount = groups.reduce((sum, group) => sum + group.rows.length, 0)

  function handleSwitch(profileRoleId: string) {
    if (profileRoleId === active.id || pendingId) return
    setPendingId(profileRoleId)
    startTransition(async () => {
      // A server action sikerkor server-side redirect()-tel dob NEXT_REDIRECT
      // signal-t → a böngésző automatikusan navigál. Csak hibakor kapunk vissza
      // return value-t (ilyenkor a pending állapotot fel kell oldani).
      const result = await switchActiveProfileRole(profileRoleId)
      if (result && 'error' in result && result.error) {
        setPendingId(null)
        toast.error(result.error)
      }
    })
  }

  /** Hover/fókusz: a jósolt célút előtöltése — a váltás így érezhetően gyorsabb. */
  function prefetchFor(row: ProfileRoleRow) {
    try {
      router.prefetch(getStartPathForScope(row.scope, row.role))
    } catch {
      /* a prefetch legfeljebb kimarad — nem hiba */
    }
  }

  return (
    <div className="space-y-2" role="group" aria-label="Profilváltás">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Aktív profil
      </p>
      <ActiveRow row={active} scopeName={resolveScopeName(active, scopeNames)} />

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Váltás másik szerepre
        </p>
        <span className="text-[10px] text-muted-foreground">{totalOthers} elérhető</span>
      </div>

      {totalOthers >= SEARCH_THRESHOLD && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          {/* A menü-primitív „typeahead"-je MINDEN nyomtatható billentyűt
              preventDefault-ol a popupon — a stopPropagation nélkül a mezőbe nem
              lehetne gépelni, és az első betűre a fókusz kiugrana egy menüpontra.
              Az Escape-et szándékosan ÁTENGEDJÜK (menü-zárás). */}
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDownCapture={(event) => {
              if (event.key !== 'Escape') event.stopPropagation()
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') event.stopPropagation()
            }}
            placeholder="Keresés gyülekezet vagy szerep szerint…"
            aria-label="Profil keresése"
            className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-xs outline-none transition focus:border-primary/60"
          />
        </div>
      )}

      {visibleCount === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          Nincs találat erre: „{query}”
        </p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
          {groups.map((group) => (
            <div key={group.scope} className="space-y-1">
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {SCOPE_LABELS[group.scope]}
              </p>
              {group.rows.map((row) => (
                <SwitchButton
                  key={row.id}
                  row={row}
                  scopeName={resolveScopeName(row, scopeNames)}
                  onSwitch={() => handleSwitch(row.id)}
                  onPrefetch={() => prefetchFor(row)}
                  pending={pendingId === row.id}
                  disabled={isPending || pendingId != null}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActiveRow({ row, scopeName }: { row: ProfileRoleRow; scopeName: string }) {
  const Icon = SCOPE_ICONS[row.scope]
  return (
    <div
      aria-current="true"
      className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2"
    >
      <Icon className="size-4 shrink-0 text-indigo-700" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{scopeName}</p>
        <p className="truncate text-xs text-indigo-700">{roleLabelOf(row)}</p>
      </div>
      <Check className="size-4 shrink-0 text-indigo-600" />
    </div>
  )
}

function SwitchButton({
  row,
  scopeName,
  onSwitch,
  onPrefetch,
  pending,
  disabled,
}: {
  row: ProfileRoleRow
  scopeName: string
  onSwitch: () => void
  onPrefetch: () => void
  pending: boolean
  disabled: boolean
}) {
  const Icon = SCOPE_ICONS[row.scope]
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSwitch}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      disabled={disabled}
      // min-h-10: 40px-es érintőfelület telefonon (mobil-first követelmény)
      className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-transparent bg-card/60 px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40 disabled:opacity-60"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{scopeName}</p>
        <p className="truncate text-xs text-muted-foreground">{roleLabelOf(row)}</p>
      </div>
      {pending && <Loader2 className="size-4 animate-spin text-indigo-500" />}
    </button>
  )
}
