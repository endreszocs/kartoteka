'use client'

/**
 * Profilváltó — a fejléc BAL („kontextus-chip") legördülőjének TELJES tartalma.
 *
 * 2026-07-25 (G2/R2): a két legördülő SZÉTVÁLT. A bal chip mostantól KIZÁRÓLAG
 * a profilváltó (a Fiók/Gyülekezet/Kijelentkezés a jobb oldali mega menübe
 * került), és a lista GÖRGETÉS NÉLKÜL fér ki.
 *
 * ## Hogyan lesz görgetés nélküli — és miért ÍGY
 *
 * CSS többhasábos elrendezés (`columns-*`), NEM kézzel számolt hasáb-pakolás.
 * A kézi „hány sor fér egy hasábba" matek minden változatban ugyanabba a
 * hibaosztályba fut: ha a kapacitás-számítás és a hasábszám-küszöb nincs
 * levezetve egymásból, a lista NÉMÁN ELREJT szerepeket (mérve: 8 szerepnél,
 * 4 hatókörre szórva, egy szerep kiesett — és a kereső még be sem kapcsolt,
 * tehát a felhasználó nem is találhatta volna meg). A böngésző hasáb-kiegyenlítése
 * ezt a hibát fogalmilag zárja ki: minden sor MINDIG renderelődik.
 *
 * A hasábszám a SZŰRT találatszámból jön (nem a teljes szerepszámból), így
 * keresés közben a panel összehúzódik, nem marad két üres hasáb.
 *
 * ⚠️ A popup `overflow-y-auto`-ja SZÁNDÉKOSAN megmarad biztonsági hálóként:
 * szélsőséges esetben (nagyon sok szerep + alacsony ablak) inkább görgethető
 * legyen, mint hogy sorokat rejtsen el. „Görgetés nélkül" = a valós használatban
 * nincs görgetés, nem pedig „a kiférő rész le van vágva".
 *
 * ## Billentyűzet
 *
 * A sorok VALÓDI `DropdownMenuItem`-ek (`closeOnClick={false}`). A korábbi
 * `role="menuitem"`-es sima `<button>` hazug ARIA volt: a base-ui composite
 * listája csak a `Menu.Item`-ként regisztrált elemeket járja be, tehát a
 * nyíl-navigáció ÁTUGROTTA a profilváltó sorait.
 *
 * A keresőmező `stopPropagation`-je eddig az ArrowDown-t is elnyelte → a mezőből
 * nem lehetett a találatokra lépni (billentyűzet-zsákutca). Mostantól a
 * navigációs billentyűk ÁTMENNEK, a szövegszerkesztők (Home/End) nem.
 *
 * Minden adat prop-ként érkezik (profileRoles + scopeNames) — nincs új fetch.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Building2, Check, Church, Globe, Landmark, Loader2, Search, Users } from 'lucide-react'

import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
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

/** Kereső ennyi VÁLTHATÓ szereptől jelenik meg. */
const SEARCH_THRESHOLD = 8

/**
 * A base-ui Menu popup a nyomtatható billentyűket typeahead-ként lefoglalja,
 * ezért a mezőben `stopPropagation` kell. A NAVIGÁCIÓS billentyűket viszont át
 * KELL engedni, különben a keresőből nem lehet a találatokra lépni.
 * A Home/End szándékosan NEM megy át — az inputban kurzormozgatás a dolguk.
 */
const PASS_THROUGH_KEYS = new Set(['Escape', 'ArrowDown', 'ArrowUp', 'Tab'])

/**
 * Hasábszám a LÁTHATÓ (szűrt) sorok számából. A böngésző egyenlíti ki a
 * hasábokat, itt csak azt döntjük el, hány hasábot engedünk.
 */
export function switcherColumnCount(visibleRows: number): 1 | 2 | 3 {
  if (visibleRows <= 6) return 1
  if (visibleRows <= 14) return 2
  return 3
}

/**
 * A bal panel szélessége hasábszám szerint.
 *
 * ⚠️ A base-ui `Menu.Popup` alapból `w-(--anchor-width)`, azaz a TRIGGER
 * szélességét veszi fel — széles panelhez ezt KÖTELEZŐ felülírni, különben a
 * legördülő a chip szélességére szorul.
 */
export const SWITCHER_PANEL_WIDTH: Record<1 | 2 | 3, string> = {
  1: 'w-[min(23rem,calc(100vw-1.5rem))]',
  2: 'w-[min(36rem,calc(100vw-1.5rem))]',
  3: 'w-[min(50rem,calc(100vw-1.5rem))]',
}

/**
 * A base `DropdownMenuItem` fókusz-stílusa `bg-accent` + `text-accent-foreground`,
 * és a `**:text-accent-foreground` MINDEN leszármazottat átfest. Az élő `kert`
 * témában ez tömör olívazöld lap fehér szöveggel (mérve 3,75:1 — AA-bukás
 * normál méretű szövegen), a base-ui pedig egérre is ezt az állapotot állítja.
 * Ezért itt semleges, token-alapú kiemelést használunk, és a leszármazottakat
 * visszaengedjük öröklésre (a másodlagos sorok `!`-gal tartják a saját színüket).
 */
const NEUTRAL_FOCUS =
  'focus:bg-secondary focus:text-foreground not-data-[variant=destructive]:focus:**:text-inherit'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

/**
 * A panel szélességéhez a headernek is tudnia kell a hasábszámot, MIELŐTT a
 * switcher renderelne. Ez a segéd a szűretlen alapesetet adja (nyitáskor ez a
 * helyzet); szűrés közben a switcher belül szűkebb rácsot rajzol.
 */
export function switcherInitialColumns(profileRoles: ProfileRoleRow[]): 1 | 2 | 3 {
  return switcherColumnCount(Math.max(0, profileRoles.length - 1))
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
  const searching = query.trim().length > 0

  // A hasábszámba a csoportcímkék is beleszámítanak — egy 4 csoportra szórt
  // 8 elemű lista magasabb, mint egy 8 elemű egyblokkos.
  const columns = switcherColumnCount(visibleCount + groups.length)
  // `columns-[15rem]` = `column-width: 15rem` (NEM column-count): ez ÖNMAGÁBAN
  // reszponzív — a böngésző annyi hasábot nyit, ahány 15rem-es sáv befér, tehát
  // mobilon magától egyetlen hasáb marad, töréspont-szabályok nélkül.
  const columnClass = columns === 1 ? '' : 'columns-[15rem] gap-x-3'

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
    <div className="p-2" role="group" aria-label="Profilváltás">
      <SectionLabel>Aktív szolgálat</SectionLabel>
      <ActiveRow row={active} scopeName={resolveScopeName(active, scopeNames)} />

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <SectionLabel>Váltás másik szolgálatra</SectionLabel>
        <span className="text-[10.5px] text-muted-foreground">
          {searching ? `${visibleCount} / ${totalOthers}` : `${totalOthers} elérhető`}
        </span>
      </div>

      {totalOthers >= SEARCH_THRESHOLD && (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // A menü-primitív typeahead-je MINDEN nyomtatható billentyűt
            // preventDefault-ol a popupon — enélkül a mezőbe nem lehetne gépelni.
            // A navigációs billentyűket viszont ÁT KELL engedni, különben a
            // keresőből nem lehet a találatokra lépni (billentyűzet-zsákutca).
            onKeyDownCapture={(event) => {
              if (!PASS_THROUGH_KEYS.has(event.key)) event.stopPropagation()
            }}
            onKeyDown={(event) => {
              if (!PASS_THROUGH_KEYS.has(event.key)) event.stopPropagation()
            }}
            placeholder="Keresés gyülekezet vagy szerep szerint…"
            aria-label="Profil keresése"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[13px] outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      )}

      {visibleCount === 0 ? (
        <p
          role="status"
          className="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
        >
          Nincs találat erre: „{query}"
        </p>
      ) : (
        <>
          {/* CSS-hasábok: a böngésző egyenlíti ki őket, így SOHA nem esik ki sor.
              A DOM-sorrend hasábonként fentről lefelé halad — a base-ui composite
              dokumentum-pozíció szerint rendez, tehát a nyíl-navigáció is ezt követi. */}
          <div className={`mt-2 ${columnClass}`}>
            {groups.map((group) => (
              <div key={group.scope} className="mb-2 break-inside-avoid">
                <p className="px-1.5 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
                  {SCOPE_LABELS[group.scope]}
                </p>
                <div className="space-y-0.5">
                  {group.rows.map((row) => (
                    <SwitchRow
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
              </div>
            ))}
          </div>
          {searching && (
            <p aria-live="polite" className="sr-only">
              {visibleCount} találat
            </p>
          )}
        </>
      )}

      <DropdownMenuSeparator className="my-1.5" />
      <DropdownMenuItem
        onClick={() => router.push('/valassz-profilt')}
        className={`min-h-10 gap-2.5 rounded-xl px-2.5 py-2 ${NEUTRAL_FOCUS}`}
      >
        <Users className="size-4 text-primary" />
        <span className="flex-1 text-[13px]">Összes profil megnyitása</span>
        <ArrowRight className="size-3.5 text-muted-foreground!" />
      </DropdownMenuItem>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
        {children}
      </p>
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </div>
  )
}

function ActiveRow({ row, scopeName }: { row: ProfileRoleRow; scopeName: string }) {
  const Icon = SCOPE_ICONS[row.scope]
  return (
    <div
      role="note"
      aria-label={`Aktív szolgálat: ${scopeName}, ${roleLabelOf(row)}`}
      className="mt-1.5 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12">
        <Icon className="size-4.5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-[14.5px] font-semibold text-foreground">{scopeName}</p>
        <p className="truncate text-[11.5px] text-foreground/70">{roleLabelOf(row)}</p>
      </div>
      <Check className="size-4 shrink-0 text-primary" />
    </div>
  )
}

function SwitchRow({
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
    <DropdownMenuItem
      // A menü NEM zárul be a kattintásra: a server action redirect-je viszi
      // tovább a böngészőt, addig a pörgő a helyén marad.
      closeOnClick={false}
      onClick={onSwitch}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      // A ÉPPEN VÁLTÓ sort NEM tesszük disabled-dé: a base
      // `data-disabled:opacity-50` pont azt halványítaná el, amelyiken a pörgő fut.
      disabled={disabled && !pending}
      aria-busy={pending || undefined}
      className={`group min-h-11 w-full gap-2.5 rounded-xl px-2.5 py-2 ${NEUTRAL_FOCUS}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary transition group-focus:bg-primary/12">
        <Icon className="size-4 text-muted-foreground! transition group-focus:text-primary!" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{scopeName}</span>
        <span className="block truncate text-[11.5px] text-foreground/70!">{roleLabelOf(row)}</span>
      </span>
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary!" />
      ) : (
        <ArrowRight className="size-3.5 shrink-0 -translate-x-1 text-muted-foreground! opacity-0 transition group-focus:translate-x-0 group-focus:opacity-100" />
      )}
      {pending && <span className="sr-only">Váltás folyamatban…</span>}
    </DropdownMenuItem>
  )
}
