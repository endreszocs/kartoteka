'use client'

import { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ArrowLeftRight,
  ChevronDown,
  Church,
  HardDrive,
  HelpCircle,
  Landmark,
  LifeBuoy,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  Trash2,
  User,
} from 'lucide-react'
import { SupportDialog } from '@/components/layout/support-dialog'
import { SettingsDialog } from '@/components/modals/settings-dialog'

import { signOut } from '@/app/(dashboard)/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Profile } from '@/lib/types/auth'

import { NotificationBellRefined } from './notification-bell-refined'
import { OfflineMenuItemBadge } from '@/components/offline/offline-menu-item-badge'
import { ProfileSwitcher, SWITCHER_PANEL_WIDTH, switcherInitialColumns } from './profile-switcher'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'

interface HeaderProps {
  profile: Profile
  /** 2026-07-10 (S4-avatar): a beállított profilfotó URL-je — ha van, a monogram
   *  helyett a fotó jelenik meg az avatárban. */
  avatarUrl?: string | null
  congregationName: string | null
  congregationLogo: string | null
  /** A gyülekezet egyházmegyéjének neve — congregation scope-ban a chip secondary felirata. */
  congregationDioceseName?: string | null
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  /** Az aktív UI-kontextus scope-ja (multi-role rendszer Fázis 4).
   *  A bal-felső chip felirata ehhez igazodik:
   *  - system → "Rendszergazdai felület" / "Kartotéka rendszer"
   *  - district → "Egyházkerületi felület" / "Erdélyi Református Egyházkerület"
   *  - diocese → egyházmegye neve / "Erdélyi Református Egyházkerület"
   *  - congregation (vagy null) → congregationName / "Erdélyi Református Egyházkerület"
   */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** Az aktív kontextus scope_id-jához tartozó név (egyházmegye esetén). */
  activeScopeName?: string | null
  /** Optional: gyülekezeti publikus oldal állapota a Beállítások dialog-hoz */
  publicSiteUrl?: string | null
  publicSiteEnabled?: boolean
  onOpenProfile?: () => void
  onOpenCongregation?: () => void
  onOpenGodMode?: () => void
  onToggleMobileMenu: () => void
  /** Sidebar collapse/expand toggle — a Kartotéka-ikonra kattintásra. */
  onToggleSidebar?: () => void
}

/**
 * 2026-07-25 (G2/R2): A KÉT LEGÖRDÜLŐ SZÉTVÁLT.
 *
 * Korábban a kontextus-chip és az avatár UGYANAZT a függőleges menüt nyitotta.
 * Mostantól:
 *   - BAL (kontextus-chip) → csak PROFILVÁLTÓ, görgetés nélkül (lásd profile-switcher.tsx)
 *   - JOBB (avatár)        → VÍZSZINTES mega menü: egymás melletti hasábok + képes
 *                            identitás-panel, és két ÚJ belépési pont (Súgó, Megjelenés)
 *
 * ## Miért kell felülírni a popup alaposztályát
 *
 * A base-ui `Menu.Popup` alapból `w-(--anchor-width)` (a trigger szélessége!),
 * `ring-1 ring-foreground/10` és `rounded-lg`. Szélesebb panelhez a `w-`-t KÖTELEZŐ
 * felülírni; a `border` mellé pedig `ring-0` kell, különben DUPLA kontúr lesz.
 */
const PANEL_SHELL =
  'overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-popover p-0 ring-0 ' +
  'shadow-[0_28px_70px_-32px_rgba(28,42,38,0.55)] overscroll-contain'

/** A jobb oldali mega menü szélessége (a base-ui `w-(--anchor-width)`-et írja felül). */
const MEGA_PANEL_WIDTH = 'w-[min(56rem,calc(100vw-1.5rem))]'

/**
 * A base `DropdownMenuItem` fókusz-állapota `bg-accent` + `text-accent-foreground`,
 * és a `**:text-accent-foreground` minden leszármazottat átfest. Az élő `kert`
 * témában ez tömör olívazöld lap fehér szöveggel (3,75:1 — AA-bukás normál
 * szövegen), és a base-ui egérre is ezt az állapotot állítja. Semlegesítjük.
 *
 * 2026-08-11 (P2 #23): ez a minta AZÓTA bekerült magába az alap primitívbe
 * (`packages/ui/src/components/dropdown-menu.tsx`), a látható fókuszt ott egy
 * 2px-es belső akcentus-gyűrű adja. Az itteni konstans ezzel megegyezik, csak
 * a mega menü egyedi sorain marad explicit — a `cn()` merge miatt nem ütközik.
 */
const NEUTRAL_FOCUS =
  'focus:bg-secondary focus:text-foreground not-data-[variant=destructive]:focus:**:text-inherit'

function getRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    admin: 'Kerületi admin',
    esperes: 'Esperes',
    master_admin: 'Főadmin',
    pastor: 'Lelkipásztor',
    user: 'Felhasználó',
  }

  return roleLabels[role] || role.replace(/_/g, ' ')
}

// 2026-08-11 — hidratálás-érzékelés `useSyncExternalStore`-ral (lásd lentebb).
// Modul szintű konstansok, hogy a hook ne kapjon minden renderben új függvényt.
const subscribeNoop = () => () => {}
const getHydratedSnapshot = () => true
const getServerSnapshot = () => false

export function HeaderRefinedV3({
  profile,
  avatarUrl = null,
  congregationName,
  congregationLogo,
  congregationDioceseName = null,
  profileRoles = [],
  activeProfileRoleId = null,
  scopeNames = {},
  activeScope = null,
  activeScopeName = null,
  publicSiteUrl = null,
  publicSiteEnabled = false,
  onOpenProfile,
  onOpenCongregation,
  onOpenGodMode,
  onToggleMobileMenu,
  onToggleSidebar,
}: HeaderProps) {
  const hasMultipleRoles = profileRoles.length > 1
  const [signingOut, setSigningOut] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  // next-themes: a szerveren nincs téma — a gomb feliratát csak hidratálás után
  // szabad kiírni, különben hydration-eltérés lenne.
  //
  // 2026-08-11: a korábbi `useState(false)` + `useEffect(() => setMounted(true))`
  // páros effect-ben hívott setState volt (react-hooks/set-state-in-effect →
  // kaszkádoló újrarender). A `useSyncExternalStore` pontosan erre való: a
  // szerver-pillanatkép `false`, a kliens-pillanatkép `true`, feliratkozás
  // nincs (a hidratáltság sosem változik vissza). Nem elnyomás, hanem a
  // React 19 erre szánt API-ja.
  const mounted = useSyncExternalStore(subscribeNoop, getHydratedSnapshot, getServerSnapshot)

  const isDark = mounted && resolvedTheme === 'dark'

  const fullName = profile.full_name || profile.email || 'Lelkipásztor'
  const initials = fullName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
  const roleLabel = getRoleLabel(profile.role)

  // Scope-tudatos chip-felirat (bal-felső sarok). Endre kérése (2026-05-03):
  // az admin felületen NE "Várakozás a jóváhagyásra" / "Erdélyi Református
  // Egyházkerület" jelenjen meg — hanem a tényleges aktív kontextus.
  const contextChip = (() => {
    if (activeScope === 'system') {
      return {
        primary: 'Rendszergazdai felület',
        secondary: 'Kartotéka rendszer',
      }
    }
    if (activeScope === 'district') {
      return {
        primary: 'Egyházkerületi felület',
        secondary: activeScopeName || 'Református Egyházkerület',
      }
    }
    if (activeScope === 'diocese') {
      return {
        primary: activeScopeName || 'Egyházmegyei felület',
        secondary: 'Református Egyházkerület',
      }
    }
    // congregation (vagy null) — gyülekezet neve / egyházmegye neve
    // (Endre kérése 2026-05-03: a kerület helyett a gyülekezet egyházmegyéje
    // szerepeljen másodlagosként, mert lelkészi nézetben ez a releváns.)
    return {
      primary: congregationName || 'Várakozás a jóváhagyásra',
      secondary: congregationDioceseName || 'Református Egyházmegye',
    }
  })()

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  const chipFace = (
    <>
      <div
        className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ background: 'var(--accent)' }}
      >
        {congregationLogo ? (
          <div
            aria-hidden="true"
            className="size-full bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${congregationLogo})` }}
          />
        ) : (
          <Church className="size-5 text-white" />
        )}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate font-heading text-[14.5px] font-semibold text-foreground">
          {contextChip.primary}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{contextChip.secondary}</div>
      </div>
    </>
  )

  const chipClass =
    'flex min-w-0 items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-1.5 text-left'

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border bg-background/74 backdrop-blur-2xl">
      <div className="flex h-full items-center justify-between gap-3.5 px-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* Mobile-only Kartotéka-ikonos menu-toggle. A Kartotéka oldalakon a
              sidebar desktop-on állandóan látszik (lg:flex), így itt nincs
              szükség desktop toggle-re — ezért `lg:hidden`. */}
          <button
            onClick={onToggleMobileMenu}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition hover:bg-muted/70 lg:hidden"
            aria-label="Menü megnyitása"
            title="Menü megnyitása"
          >
            <Image
              src="/kartoteka-logo.png"
              alt="Kartotéka"
              width={24}
              height={24}
              className="size-6 object-contain"
              priority
            />
          </button>

          {/* Gyülekezet-chip — címer + 2 sor szöveg.
              2026-07-25 (R2): a chip CSAK AKKOR legördülő, ha tényleg van mit
              választani. Egyetlen szerepnél a régi kód is menüt nyitott, ami üres
              gesztus volt; most sima, nem interaktív felirat marad. */}
          {hasMultipleRoles ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`${chipClass} group/chip outline-none transition hover:border-primary/40 hover:bg-muted/50`}
                aria-label={`${contextChip.primary} — szolgálat váltása`}
                title="Szolgálat váltása"
              >
                {chipFace}
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition group-data-[popup-open]/chip:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className={`${PANEL_SHELL} ${SWITCHER_PANEL_WIDTH[switcherInitialColumns(profileRoles)]}`}
              >
                <ProfileSwitcher
                  activeProfileRoleId={activeProfileRoleId}
                  profileRoles={profileRoles}
                  scopeNames={scopeNames}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className={chipClass}>{chipFace}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-[10px] bg-muted text-foreground transition hover:bg-muted/70"
            aria-label="Segítség és támogatás"
            title="Segítség és támogatás"
          >
            <HelpCircle className="size-[17px]" />
          </button>

          <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />

          <NotificationBellRefined userId={profile.id} />

          <DropdownMenu>
            <DropdownMenuTrigger className="group/avatar flex items-center gap-2.5 rounded-xl bg-muted px-2.5 py-1.5 transition outline-none hover:bg-muted/70">
              <Avatar className="h-8 w-8">
                {/* 2026-07-10 (S4-avatar): a beállított profilfotó — eddig CSAK a
                    monogram renderelődött, a fotó soha. Ha a kép nem tölt be,
                    az AvatarFallback (monogram) automatikusan visszajön. */}
                {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
                {/* 2026-08-11 (P2 #23): a monogram eddig hardkódolt `text-white`
                    volt a `var(--accent)` olívazöld körön — mérve 3,75:1, AA-bukás.
                    Most a téma saját `--accent-foreground` tokenjét használja, amit
                    ugyanezen a napon sötétítettünk (kert: 4,72:1). Hardkódolt szín
                    helyett token — így a téma-váltás is helyesen viszi tovább. */}
                <AvatarFallback
                  className="text-[13px] font-semibold"
                  style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-[12.5px] font-semibold text-foreground">{fullName}</p>
                <p className="text-[10.5px] text-muted-foreground">{roleLabel}</p>
              </div>
              <ChevronDown className="hidden size-3.5 text-muted-foreground transition group-data-[popup-open]/avatar:rotate-180 sm:block" />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className={`${PANEL_SHELL} ${MEGA_PANEL_WIDTH}`}
            >
              {/* ── VÍZSZINTES MEGA MENÜ ────────────────────────────────────
                  Desktopon: képes identitás-panel BALRA (teljes magasság), mellette
                  három hasáb EGYMÁS MELLETT, alattuk teljes szélességű zárósáv.
                  Mobilon: minden egymás alá csúszik, a képpanel alacsony sávvá válik. */}
              {/* FLEX, nem grid: a vízszintes elrendezéshez itt egy rögzített
                  szélességű képpanel + egy rugalmas tartalomoszlop kell, amit a
                  flex sima alaputility-kkel (`lg:w-64`, `flex-1`) ad meg —
                  szemben egy `grid-cols-[16.5rem_minmax(0,1fr)]` arbitrary
                  értékkel, ami törékenyebb. Mobilon a `lg:` prefix miatt
                  visszaáll blokk-elrendezésre, tehát egymás alá csúszik. */}
              <div className="lg:flex lg:items-stretch">
                <IdentityPanel
                  fullName={fullName}
                  initials={initials}
                  avatarUrl={avatarUrl}
                  roleLabel={roleLabel}
                  email={profile.email}
                  contextPrimary={contextChip.primary}
                  hasMultipleRoles={hasMultipleRoles}
                />

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="grid gap-x-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
                    <MenuColumn title="Fiók">
                      <MegaItem
                        icon={User}
                        label="Profil"
                        hint="Adatok, fotó, jelszó"
                        onClick={onOpenProfile}
                      />
                      <MegaItem
                        icon={Settings}
                        label="Beállítások"
                        hint="Megjelenés, értesítések"
                        onClick={() => setSettingsOpen(true)}
                      />
                      <MegaItem
                        icon={HardDrive}
                        label="Offline mentés"
                        hint="Munka internet nélkül"
                        onClick={() => router.push('/offline')}
                        trailing={<OfflineMenuItemBadge />}
                      />
                    </MenuColumn>

                    <MenuColumn title="Gyülekezet">
                      <MegaItem
                        icon={Church}
                        label="Gyülekezetünk"
                        hint="Adatlap megtekintése"
                        onClick={onOpenCongregation}
                      />
                      <MegaItem
                        icon={Landmark}
                        label="Gyülekezet-beállítás"
                        hint="Alapadatok, cím, bank"
                        // A varázsló a DashboardShell-lel window-eventen kommunikál — a híd marad.
                        onClick={() => {
                          window.dispatchEvent(new Event('kartoteka:open-congregation-setup-wizard'))
                        }}
                      />
                      <MegaItem
                        icon={Trash2}
                        label="Kuka"
                        hint="Törölt tételek visszaállítása"
                        onClick={() => router.push('/kuka')}
                      />
                    </MenuColumn>

                    <MenuColumn title="Segítség és megjelenés">
                      <MegaItem
                        icon={LifeBuoy}
                        label="Súgó és támogatás"
                        hint="Útmutatók, hibabejelentés"
                        onClick={() => setSupportOpen(true)}
                      />
                      <MegaItem
                        icon={isDark ? Sun : Moon}
                        label={isDark ? 'Világos mód' : 'Sötét mód'}
                        hint="Váltás azonnal"
                        // A menü NYITVA marad, hogy a váltás azonnal látható legyen.
                        closeOnClick={false}
                        onClick={() => setTheme(isDark ? 'light' : 'dark')}
                      />
                      {onOpenGodMode && (
                        <MegaItem
                          icon={Shield}
                          label="Rendszergazdai mód"
                          hint="Teljes rendszer-hozzáférés"
                          onClick={onOpenGodMode}
                          tone="danger"
                        />
                      )}
                    </MenuColumn>
                  </div>

                  <DropdownMenuSeparator className="mx-2 my-0" />

                  <div className="flex items-center justify-between gap-2 p-2">
                    <p className="hidden min-w-0 truncate pl-1.5 text-[11px] text-muted-foreground sm:block">
                      {profile.email}
                    </p>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      closeOnClick={false}
                      className="ml-auto min-h-11 shrink-0 self-stretch gap-2 rounded-xl px-3 py-2 text-[13px] font-medium"
                    >
                      <LogOut className="size-4" />
                      {signingOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
                    </DropdownMenuItem>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        publicSiteUrl={publicSiteUrl}
        publicSiteEnabled={publicSiteEnabled}
        userEmail={profile.email}
      />
    </header>
  )
}

/**
 * A mega menü képes identitás-panelje.
 *
 * ⚠️ A FÁJLNÉV FÉLREVEZETŐ: a `coll-bible.jpg` NEM Biblia, hanem az ALKONYI
 * LÁMPÁS fotó (gyertyaláng, sziluettes fák) — a készletben a `coll-bible.jpg`
 * és a `coll-lantern.jpg` tartalma FEL VAN CSERÉLVE. Ne „javítsd" a nevet a
 * tartalom ellenőrzése nélkül.
 *
 * A panel a FELHASZNÁLÓT mutatja (név, szerep, e-mail) — szándékosan NEM a
 * gyülekezetet, mert az már ott van a fejléc bal chipjén 60 pixerre innen;
 * a kép így új információt keretez, nem ismétel.
 */
function IdentityPanel({
  fullName,
  initials,
  avatarUrl,
  roleLabel,
  email,
  contextPrimary,
  hasMultipleRoles,
}: {
  fullName: string
  initials: string
  avatarUrl: string | null
  roleLabel: string
  email: string | null
  contextPrimary: string
  hasMultipleRoles: boolean
}) {
  return (
    // A háttérszín a fotó alatti placeholder (a menü csak nyitáskor mountol, a
    // kép ekkor kezd tölteni) — ezért NEM téma-token, hanem a fotó alkonyi kékje.
    <div className="relative isolate shrink-0 overflow-hidden bg-[#1b2733] p-4 lg:w-64 lg:p-5">
      <Image
        src="/misszios-muhely/coll-bible.jpg"
        alt=""
        aria-hidden="true"
        fill
        sizes="(min-width: 1024px) 264px, 100vw"
        // A lámpás a kép bal harmadában áll — a kivágást oda húzzuk, hogy
        // keskeny (portré-arányú) panelben is képben maradjon.
        className="-z-10 object-cover object-[35%_50%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/30"
      />

      <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-0">
        <Avatar className="size-11 shrink-0 ring-2 ring-white/25 lg:mb-3 lg:size-14">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
          <AvatarFallback className="bg-white/15 text-[15px] font-semibold text-white backdrop-blur-sm">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="truncate font-heading text-[16px] font-semibold text-white lg:text-[18px]">
            {fullName}
          </p>
          <p className="truncate text-[12px] text-white/75">{roleLabel}</p>
        </div>
      </div>

      {email && <p className="mt-2 hidden truncate text-[11.5px] text-white/60 lg:block">{email}</p>}

      {hasMultipleRoles && (
        <div className="mt-3 hidden items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 backdrop-blur-sm lg:flex">
          <ArrowLeftRight className="size-3.5 shrink-0 text-white/80" />
          <span className="min-w-0 truncate text-[11px] text-white/85">
            {contextPrimary}
          </span>
        </div>
      )}
      {hasMultipleRoles && (
        <p className="mt-1.5 hidden text-[10.5px] leading-snug text-white/55 lg:block">
          Másik szolgálatra a bal felső gyülekezet-gombbal válthatsz.
        </p>
      )}
    </div>
  )
}

function MenuColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 p-1">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
          {title}
        </p>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-gradient-to-r from-border to-transparent"
        />
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function MegaItem({
  icon: Icon,
  label,
  hint,
  onClick,
  trailing,
  tone = 'default',
  closeOnClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  onClick?: () => void
  trailing?: React.ReactNode
  tone?: 'default' | 'danger'
  closeOnClick?: boolean
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      closeOnClick={closeOnClick}
      className={`group min-h-11 gap-2.5 rounded-xl px-2 py-2 ${NEUTRAL_FOCUS}`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition ${
          tone === 'danger'
            ? 'bg-destructive/10 group-focus:bg-destructive/15'
            : 'bg-secondary group-focus:bg-primary/12'
        }`}
      >
        <Icon
          className={`size-4 transition ${
            tone === 'danger'
              ? 'text-destructive!'
              : 'text-muted-foreground! group-focus:text-primary!'
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-medium ${
            tone === 'danger' ? 'text-destructive!' : ''
          }`}
        >
          {label}
        </span>
        {hint && (
          <span className="block truncate text-[11px] text-foreground/70!">{hint}</span>
        )}
      </span>
      {trailing}
    </DropdownMenuItem>
  )
}
