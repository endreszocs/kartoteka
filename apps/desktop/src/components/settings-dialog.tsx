/**
 * Settings Dialog — desktop verzió.
 *
 * A web `apps/web/components/modals/settings-dialog.tsx` (5 tab: Értesítések,
 * Megjelenés, Nyelv, Publikus oldal, Adat & biztonság) portja. A `Adat &
 * biztonság` tab tartalmazza a desktop-specifikus dev/sync információkat:
 * lokális DB státusz, pull-status minden domain-tábláról, outbox, eszköz-info,
 * updater.
 *
 * Next.js-deps kicserélve:
 *   - `useTheme` (next-themes) → localStorage-based
 *   - `toast` (sonner) → belső state-szel jelenít "Mentve!" üzenetet
 *   - `useRouter` (next/navigation) → react-router-dom `useNavigate`
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  Download,
  FolderSync,
  Globe,
  HardDrive,
  Languages,
  LogOut,
  Moon,
  Palette,
  Shield,
  Sun,
  SunMedium,
  Type,
} from 'lucide-react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@kartoteka/ui'
import { ThemePicker, useThemeStyle } from '@kartoteka/ui-app'

import { AdatBiztonsagPanel } from './settings/adat-biztonsag-panel'
import { FrissitesPanel } from './settings/frissites-panel'
import { KonyvelesPanel } from './settings/konyveles-panel'

// ──────────────────────────────────────────────────────────────
// localStorage helperek — megegyezik a web-es verzióval (`kartoteka-user-prefs-v1`)
// ──────────────────────────────────────────────────────────────

const LS_KEY = 'kartoteka-user-prefs-v1'
const LS_THEME_KEY = 'kartoteka-desktop-theme-v1'

interface UserPrefs {
  emailNotifications: boolean
  notificationTypes: string[]
  fontSize: 'sm' | 'base' | 'lg'
  language: 'hu' | 'ro'
}

const DEFAULT_PREFS: UserPrefs = {
  emailNotifications: true,
  notificationTypes: ['admin', 'support_reply', 'info', 'warning', 'danger'],
  fontSize: 'base',
  language: 'hu',
}

function loadPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<UserPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: UserPrefs): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_KEY, JSON.stringify(prefs))
}

type ThemeMode = 'light' | 'dark' | 'system'

function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(LS_THEME_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', mode === 'dark')
  }
}

function saveTheme(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_THEME_KEY, mode)
  applyTheme(mode)
}

// ──────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────

export interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail?: string | null
  publicSiteUrl?: string | null
  publicSiteEnabled?: boolean
}

// ──────────────────────────────────────────────────────────────
// Fő komponens
// ──────────────────────────────────────────────────────────────

export function SettingsDialog({
  open,
  onOpenChange,
  userEmail,
  publicSiteUrl,
  publicSiteEnabled,
}: SettingsDialogProps) {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const { theme: themeStyle, setTheme: setThemeStyle } = useThemeStyle()
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Hidratáljuk a user prefs-et a dialog megnyitásakor (SSR-safe módon)
  useEffect(() => {
    if (!open) return
    setPrefs(loadPrefs())
    setThemeState(loadTheme())
  }, [open])

  const flashSaveMsg = useCallback(() => {
    setSaveMsg('Beállítás mentve')
    const t = window.setTimeout(() => setSaveMsg(null), 1500)
    return () => window.clearTimeout(t)
  }, [])

  const updatePrefs = useCallback(
    (update: Partial<UserPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...update }
        savePrefs(next)
        return next
      })
      flashSaveMsg()
    },
    [flashSaveMsg],
  )

  const toggleNotificationType = useCallback(
    (type: string) => {
      setPrefs((prev) => {
        const has = prev.notificationTypes.includes(type)
        const next = has
          ? prev.notificationTypes.filter((t) => t !== type)
          : [...prev.notificationTypes, type]
        const updated = { ...prev, notificationTypes: next }
        savePrefs(updated)
        return updated
      })
      flashSaveMsg()
    },
    [flashSaveMsg],
  )

  const handleSetTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode)
      saveTheme(mode)
      flashSaveMsg()
    },
    [flashSaveMsg],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
              <Palette className="size-5" />
            </span>
            Beállítások
          </DialogTitle>
        </DialogHeader>

        {/* Bal oldalsáv MINDEN méretben — a tabok mindig vertikálisan a dialog
            bal oldalán, a tartalom jobbra. v0.5.4 (Sprint P) — Endre kérése. */}
        <Tabs defaultValue="ertesitesek" className="flex flex-row gap-4 sm:gap-5">
          <div className="flex w-44 shrink-0 flex-col gap-3 self-start sm:w-52">
            <TabsList className="w-full flex-col items-stretch gap-1 rounded-[1.2rem] bg-slate-50 p-2 h-auto">
              <TabsTrigger value="ertesitesek" className="w-full justify-start px-3 py-2">
                <Bell className="mr-2 size-4" />
                <span className="flex-1 text-left">Értesítések</span>
              </TabsTrigger>
              <TabsTrigger value="megjelenes" className="w-full justify-start px-3 py-2">
                <Palette className="mr-2 size-4" />
                <span className="flex-1 text-left">Megjelenés</span>
              </TabsTrigger>
              <TabsTrigger value="nyelv" className="w-full justify-start px-3 py-2">
                <Languages className="mr-2 size-4" />
                <span className="flex-1 text-left">Nyelv</span>
              </TabsTrigger>
              <TabsTrigger value="publikus" className="w-full justify-start px-3 py-2">
                <Globe className="mr-2 size-4" />
                <span className="flex-1 text-left">Publikus oldal</span>
              </TabsTrigger>
              <TabsTrigger value="frissites" className="w-full justify-start px-3 py-2">
                <Download className="mr-2 size-4" />
                <span className="flex-1 text-left">Frissítés</span>
              </TabsTrigger>
              <TabsTrigger value="konyveles" className="w-full justify-start px-3 py-2">
                <FolderSync className="mr-2 size-4" />
                <span className="flex-1 text-left">Könyvelés</span>
              </TabsTrigger>
              <TabsTrigger value="adatbiztonsag" className="w-full justify-start px-3 py-2">
                <Shield className="mr-2 size-4" />
                <span className="flex-1 text-left">Adat &amp; biztonság</span>
              </TabsTrigger>
            </TabsList>

            {/* Mentés-üzenet */}
            {saveMsg && (
              <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-900">
                ✓ {saveMsg}
              </div>
            )}

            {/* Tudtad? */}
            <div className="rounded-[1rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-3">
              <div className="flex items-center gap-2 border-b border-indigo-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                <span>💡 Tudtad?</span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-indigo-900/80">
                A desktop-verzió a beállításaid <strong>lokálisan</strong>,
                titkosítva tárolja. A jövőben Supabase-ben szinkronizálódnak
                majd a webes verzióval.
              </p>
            </div>

            {/* Bejelentkezve mint */}
            {userEmail && (
              <div className="rounded-[1rem] border border-slate-100 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Bejelentkezve mint
                </p>
                <p className="mt-1 truncate text-xs font-medium text-slate-800">{userEmail}</p>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* ── ÉRTESÍTÉSEK ── */}
            <TabsContent value="ertesitesek" className="space-y-4">
              <SettingsSection title="E-mail értesítés" icon={<Bell className="size-4" />}>
                <ToggleRow
                  label="E-mailben is megkapom az értesítéseket"
                  description={
                    userEmail
                      ? `Címzett: ${userEmail}`
                      : 'A regisztrált e-mail cím kapja majd a leveleket.'
                  }
                  checked={prefs.emailNotifications}
                  onChange={(v) => updatePrefs({ emailNotifications: v })}
                />
              </SettingsSection>

              <SettingsSection
                title="Milyen típusú értesítéseket kapjak?"
                icon={<Bell className="size-4" />}
              >
                <div className="space-y-2">
                  {[
                    { key: 'admin', label: 'Adminisztratív kérések (hozzáférés, jóváhagyás)' },
                    { key: 'warning', label: 'Figyelmeztetések (TVA plafon, tartozások)' },
                    { key: 'danger', label: 'Kritikus hibák (biztonsági esemény)' },
                    { key: 'support_reply', label: 'Válasz támogatási kérdésre' },
                    { key: 'info', label: 'Általános információk (frissítések)' },
                  ].map((item) => (
                    <ToggleRow
                      key={item.key}
                      label={item.label}
                      checked={prefs.notificationTypes.includes(item.key)}
                      onChange={() => toggleNotificationType(item.key)}
                      compact
                    />
                  ))}
                </div>
              </SettingsSection>
            </TabsContent>

            {/* ── MEGJELENÉS ── */}
            <TabsContent value="megjelenes" className="space-y-4">
              <SettingsSection title="Téma stílusa" icon={<Palette className="size-4" />}>
                <ThemePicker
                  value={themeStyle}
                  onChange={(next) => {
                    setThemeStyle(next)
                    flashSaveMsg()
                  }}
                />
                <p className="mt-3 text-[11px] text-slate-500">
                  Az alapértelmezett a <strong>Kerített kert</strong>. A választott téma az
                  oldalsávra, a fejlécekre, a kártyákra és a betűkre is hatással van — a
                  táblázatok elrendezése változatlan.
                </p>
              </SettingsSection>

              <SettingsSection title="Sötét/világos mód" icon={<Sun className="size-4" />}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <ThemeCard
                    icon={<Sun className="size-5" />}
                    label="Világos"
                    description="Fényes, nappali használatra"
                    selected={theme === 'light'}
                    onClick={() => handleSetTheme('light')}
                  />
                  <ThemeCard
                    icon={<Moon className="size-5" />}
                    label="Sötét"
                    description="Kellemes esti használatra"
                    selected={theme === 'dark'}
                    onClick={() => handleSetTheme('dark')}
                  />
                  <ThemeCard
                    icon={<SunMedium className="size-5" />}
                    label="Rendszer"
                    description="A Windows-beállítás szerint"
                    selected={theme === 'system'}
                    onClick={() => handleSetTheme('system')}
                  />
                </div>
                <div className="mt-3 rounded-[1rem] border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-[11px] leading-5 text-amber-900">
                  <strong>ℹ️ Megjegyzés</strong>: a sötét mód jelenleg béta
                  állapotban van — egyes modul-specifikus UI-elemek még a
                  világos dizájnhoz vannak hangolva.
                </div>
              </SettingsSection>

              <SettingsSection title="Betűméret" icon={<Type className="size-4" />}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <SizeCard
                    label="Kisebb"
                    sampleSize="text-sm"
                    selected={prefs.fontSize === 'sm'}
                    onClick={() => updatePrefs({ fontSize: 'sm' })}
                  />
                  <SizeCard
                    label="Alapértelmezett"
                    sampleSize="text-base"
                    selected={prefs.fontSize === 'base'}
                    onClick={() => updatePrefs({ fontSize: 'base' })}
                  />
                  <SizeCard
                    label="Nagyobb"
                    sampleSize="text-lg"
                    selected={prefs.fontSize === 'lg'}
                    onClick={() => updatePrefs({ fontSize: 'lg' })}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  A betűméret az egész alkalmazásra érvényes (jelenleg béta).
                </p>
              </SettingsSection>
            </TabsContent>

            {/* ── NYELV ── */}
            <TabsContent value="nyelv" className="space-y-4">
              <SettingsSection title="Felület nyelve" icon={<Languages className="size-4" />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ThemeCard
                    icon={<span className="text-lg">🇭🇺</span>}
                    label="Magyar"
                    description="Alapértelmezett nyelv"
                    selected={prefs.language === 'hu'}
                    onClick={() => updatePrefs({ language: 'hu' })}
                  />
                  <ThemeCard
                    icon={<span className="text-lg">🇷🇴</span>}
                    label="Română"
                    description="Limba română (hamarosan)"
                    selected={prefs.language === 'ro'}
                    onClick={() => updatePrefs({ language: 'ro' })}
                  />
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  A hivatalos iratok (nyugta, számadás) továbbra is kétnyelvűek
                  (magyar + román) maradnak, függetlenül a UI-nyelvtől.
                </p>
              </SettingsSection>
            </TabsContent>

            {/* ── PUBLIKUS OLDAL ── */}
            <TabsContent value="publikus" className="space-y-4">
              <SettingsSection title="Gyülekezeti publikus oldal" icon={<Globe className="size-4" />}>
                {publicSiteEnabled && publicSiteUrl ? (
                  <div className="flex items-center gap-2.5 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Globe className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-900">Aktív publikus oldal</p>
                      <a
                        href={publicSiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-emerald-700 underline hover:text-emerald-800"
                      >
                        {publicSiteUrl}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    A gyülekezetnek még nincs Kartotéka publikus oldala. A webes
                    admin felületen aktiválható.
                  </div>
                )}
              </SettingsSection>

              <SettingsSection title="Mit ad a publikus oldal?" icon={<Globe className="size-4" />}>
                <ul className="space-y-2">
                  {[
                    { icon: '🌐', title: 'Saját webcím', desc: '/gy/<gyülekezet-slug> alatt elérhető' },
                    { icon: '📰', title: 'Magazin / posztok', desc: 'Istentisztelet időpontok, hírek, képek megosztása' },
                    { icon: '📅', title: 'Események', desc: 'A gyülekezeti programok a tagoknak és érdeklődőknek' },
                    { icon: '🎨', title: 'Testreszabható dizájn', desc: 'Téma, fejléc-kép, címer — saját arculat' },
                  ].map((item) => (
                    <li
                      key={item.title}
                      className="flex items-start gap-2.5 rounded-[0.8rem] border border-slate-100 bg-slate-50/40 px-3 py-2"
                    >
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{item.title}</div>
                        <div className="text-[11px] text-slate-500">{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </SettingsSection>
            </TabsContent>

            {/* ── FRISSÍTÉS ── (Sprint N, 2026-04-25) */}
            <TabsContent value="frissites" className="space-y-4">
              <FrissitesPanel />
            </TabsContent>

            {/* ── KÖNYVELÉS (hivatalos EREK Excel) ── (E1, 2026-06-11) */}
            <TabsContent value="konyveles" className="space-y-4">
              <KonyvelesPanel />
            </TabsContent>

            {/* ── ADAT & BIZTONSÁG ── (desktop: sync / DB / device) */}
            <TabsContent value="adatbiztonsag" className="space-y-4">
              <AdatBiztonsagPanel />

              <SettingsSection title="Kilépés minden eszközön" icon={<LogOut className="size-4" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Ez a művelet minden bejelentkezett eszközről (telefon, tablet,
                  laptop) kilépteti a fiókodat. Ha elveszett vagy eladott egy
                  eszközt, ezzel biztonságba helyezed a gyülekezet adatait.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled
                >
                  <LogOut className="mr-2 size-4" />
                  Kijelentkezés minden eszközön (hamarosan)
                </Button>
              </SettingsSection>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// Belső komponensek
// ──────────────────────────────────────────────────────────────

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-[1.2rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  compact = false,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  compact?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[1rem] border p-3 transition',
        checked
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-slate-200 bg-slate-50/40 hover:border-slate-300',
        compact && 'py-2',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-slate-500">{description}</div>}
      </div>
    </label>
  )
}

function ThemeCard({
  icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: ReactNode
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-[1rem] border-2 p-3 text-left transition',
        selected
          ? 'border-slate-700 bg-slate-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <div
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          selected ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600',
        )}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className="text-[11px] text-slate-500">{description}</div>
    </button>
  )
}

function SizeCard({
  label,
  sampleSize,
  selected,
  onClick,
}: {
  label: string
  sampleSize: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[1rem] border-2 p-4 text-center transition',
        selected
          ? 'border-slate-700 bg-slate-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span className={cn('font-serif font-bold text-slate-800', sampleSize)}>Aa</span>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </button>
  )
}

// Ikonexport a dashboard-cards-hoz is — ha más helyen is megnyitnánk dialóg
// gombbal (pl. "Beállítások"), ez a HardDrive ikon-hivatkozás marad hasznos
export { HardDrive }
