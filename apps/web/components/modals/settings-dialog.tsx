'use client'

/**
 * Settings Dialog — rendszerbeállítások modal.
 *
 * 5 tab:
 *   1. Értesítések  — e-mail értesítés kapcsoló, típus-szűrés
 *   2. Megjelenés   — világos / sötét / rendszer mód, betűméret
 *   3. Nyelv        — UI nyelv (HU / RO) — jelenleg placeholder
 *   4. Publikus oldal  — gyors link + státusz
 *   5. Adat & biztonság — offline gyorstár, kijelentkezés minden eszközön
 *
 * Az MVP szinten a beállítások localStorage-ben vannak tárolva. Később egy
 * `user_preferences` SQL táblát vezetünk be (2026-04-21k SQL).
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Shield,
  Sun,
  SunMedium,
  Trash2,
  Type,
} from 'lucide-react'
import { toast } from 'sonner'
import { ThemePicker, useThemeStyle } from '@kartoteka/ui-app'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { updatePassword, eraseMyAccount } from '@/app/(dashboard)/profile/actions'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  publicSiteUrl?: string | null
  publicSiteEnabled?: boolean
  userEmail?: string | null
}

// ──────────────────────────────────────────────────────────────
// localStorage helperek
// ──────────────────────────────────────────────────────────────

const LS_KEY = 'kartoteka-user-prefs-v1'

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
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<UserPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: UserPrefs): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))
}

// ──────────────────────────────────────────────────────────────

export function SettingsDialog({
  open,
  onOpenChange,
  publicSiteUrl,
  publicSiteEnabled,
  userEmail,
}: SettingsDialogProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { theme: themeStyle, setTheme: setThemeStyle } = useThemeStyle()
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [mounted, setMounted] = useState(false)

  // SSR-safe hydration — a setState-eket setTimeout callback-jén belül hívjuk,
  // hogy ne legyen synchronous setState effect body-ban (react-hooks lint).
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
      setPrefs(loadPrefs())
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  function updatePrefs(update: Partial<UserPrefs>) {
    const next = { ...prefs, ...update }
    setPrefs(next)
    savePrefs(next)
    toast.success('Beállítás mentve', { duration: 1500 })
  }

  function toggleNotificationType(type: string) {
    const has = prefs.notificationTypes.includes(type)
    const next = has
      ? prefs.notificationTypes.filter((t) => t !== type)
      : [...prefs.notificationTypes, type]
    updatePrefs({ notificationTypes: next })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
              <Palette className="size-5" />
            </span>
            Beállítások
          </DialogTitle>
        </DialogHeader>

        {/* Bal oldalsáv MINDEN méretben — Endre kérése (v0.5.4 paritás): a tabok mindig
            vertikálisan a dialog bal oldalán, a tartalom jobbra.
            2026-05-02 (v0.9.34) — explicit `grid grid-cols-[240px_1fr]` a parent DialogContent
            `grid grid-cols-1` felülírására. A `flex flex-row` korábban nem hatott át
            a Radix Tabs.Root display-jén. */}
        <Tabs defaultValue="ertesitesek" className="grid grid-cols-[200px_1fr] gap-5 sm:grid-cols-[240px_1fr] sm:gap-7">
          <div className="flex flex-col gap-3 self-start min-w-0">
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
              <TabsTrigger value="adatbiztonsag" className="w-full justify-start px-3 py-2">
                <Shield className="mr-2 size-4" />
                <span className="flex-1 text-left">Adat &amp; biztonság</span>
              </TabsTrigger>
            </TabsList>

            {/* Tipp-doboz az oldalsáv alatt */}
            <div className="rounded-[1rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-3">
              <div className="flex items-center gap-2 border-b border-indigo-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                <span>💡 Tudtad?</span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-indigo-900/80">
                A beállításaid jelenleg <strong>a böngészőben</strong> tárolódnak.
                Más eszközön újra be kell állítanod. A jövőben Supabase-ben perzisztálódnak majd.
              </p>
            </div>

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
            {/* ─── ÉRTESÍTÉSEK ─── */}
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

              <SettingsSection title="Milyen típusú értesítéseket kapjak?" icon={<Bell className="size-4" />}>
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

            {/* ─── MEGJELENÉS ─── */}
            <TabsContent value="megjelenes" className="space-y-4">
              <SettingsSection title="Téma stílusa" icon={<Palette className="size-4" />}>
                <ThemePicker
                  value={themeStyle}
                  onChange={(next) => {
                    setThemeStyle(next)
                    toast.success('Téma mentve. A kinézet azonnal frissül.')
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
                    selected={mounted && theme === 'light'}
                    onClick={() => setTheme('light')}
                  />
                  <ThemeCard
                    icon={<Moon className="size-5" />}
                    label="Sötét"
                    description="Kellemes esti használatra"
                    selected={mounted && theme === 'dark'}
                    onClick={() => setTheme('dark')}
                  />
                  <ThemeCard
                    icon={<SunMedium className="size-5" />}
                    label="Rendszer"
                    description="A készülék beállítása szerint"
                    selected={mounted && theme === 'system'}
                    onClick={() => setTheme('system')}
                  />
                </div>
                <div className="mt-3 rounded-[1rem] border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-[11px] leading-5 text-amber-900">
                  <strong>ℹ️ Megjegyzés</strong>: a sötét mód jelenleg béta állapotban van — egyes
                  modul-specifikus UI-elemek még a világos dizájnhoz vannak hangolva. Ha valami rosszul
                  jelenik meg, jelezd a Támogatás oldalon.
                </div>
              </SettingsSection>

              <SettingsSection title="Betűméret" icon={<Type className="size-4" />}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <SizeCard
                    label="Kisebb"
                    sample="Aa"
                    sampleSize="text-sm"
                    selected={prefs.fontSize === 'sm'}
                    onClick={() => updatePrefs({ fontSize: 'sm' })}
                  />
                  <SizeCard
                    label="Alapértelmezett"
                    sample="Aa"
                    sampleSize="text-base"
                    selected={prefs.fontSize === 'base'}
                    onClick={() => updatePrefs({ fontSize: 'base' })}
                  />
                  <SizeCard
                    label="Nagyobb"
                    sample="Aa"
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

            {/* ─── NYELV ─── */}
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
                  A hivatalos iratok (nyugta, számadás) továbbra is kétnyelvűek (magyar + román)
                  maradnak, függetlenül a UI-nyelvtől.
                </p>
              </SettingsSection>

              <SettingsSection title="Hivatalos iratok nyelve" icon={<Languages className="size-4" />}>
                <div className="space-y-2">
                  <div className="rounded-[1rem] border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-sm font-medium text-slate-800">🇷🇴 Román (kötelező)</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Minden hivatalos irat (nyugta, számadás, éves jelentés) román nyelven is
                      elérhető. A romániai állami hatóságok felé a román verzió a kötelező.
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-sm font-medium text-slate-800">🇭🇺 Magyar (gyülekezeti)</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      A gyülekezet belső használatára minden irat magyar nyelven is kiállítható
                      — a lelkészi hivatalos levéltárhoz, a presbitériumi iratok archívumához.
                    </p>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection title="Fordítási készültség" icon={<Languages className="size-4" />}>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'UI (magyar)', pct: 100, color: 'bg-emerald-500' },
                    { label: 'UI (román)', pct: 15, color: 'bg-amber-500' },
                    { label: 'Iratok (HU/RO)', pct: 100, color: 'bg-emerald-500' },
                    { label: 'E-mail sablonok (RO)', pct: 40, color: 'bg-amber-500' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[0.8rem] border border-slate-100 bg-white p-2.5">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-semibold text-slate-800">{item.pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsSection>
            </TabsContent>

            {/* ─── PUBLIKUS OLDAL ─── */}
            <TabsContent value="publikus" className="space-y-4">
              <SettingsSection title="Gyülekezeti publikus oldal" icon={<Globe className="size-4" />}>
                {publicSiteEnabled && publicSiteUrl ? (
                  <div className="space-y-3">
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
                  </div>
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    A gyülekezetnek még nincs Kartotéka publikus oldala.
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    onOpenChange(false)
                    router.push('/publikus-oldal')
                  }}
                >
                  <Globe className="mr-2 size-4" />
                  Publikus oldal beállítások megnyitása
                </Button>
              </SettingsSection>

              <SettingsSection title="Mit ad a publikus oldal?" icon={<Globe className="size-4" />}>
                <ul className="space-y-2">
                  {[
                    { icon: '🌐', title: 'Saját webcím', desc: '/gy/<gyülekezet-slug> alatt elérhető' },
                    { icon: '📰', title: 'Magazin / posztok', desc: 'Istentisztelet időpontok, hírek, képek megosztása' },
                    { icon: '📅', title: 'Események', desc: 'A gyülekezeti programok a tagoknak és érdeklődőknek' },
                    { icon: '🎨', title: 'Testreszabható dizájn', desc: 'Téma, fejléc-kép, címer — saját arculat' },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-2.5 rounded-[0.8rem] border border-slate-100 bg-slate-50/40 px-3 py-2">
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

            {/* ─── ADAT & BIZTONSÁG ─── */}
            <TabsContent value="adatbiztonsag" className="space-y-4">
              {/* JELSZÓ — v0.9.40, 2026-05-02
                  A felhasználó kérése: "aki Google-loginnal jött és nincs jelszava,
                  állíthasson be egy jelszót, amit a beállításoknál meg is változtathat" */}
              <SettingsSection title="Jelszó beállítása vagy módosítása" icon={<KeyRound className="size-4" />}>
                <PasswordChangeForm />
              </SettingsSection>

              <SettingsSection title="Offline gyorstár" icon={<HardDrive className="size-4" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Az offline gyorstár lehetővé teszi, hogy az adatok elérhetők legyenek
                  internet-kapcsolat nélkül is.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false)
                    router.push('/offline')
                  }}
                >
                  <HardDrive className="mr-2 size-4" />
                  Offline gyorstár kezelése
                </Button>
              </SettingsSection>

              <SettingsSection title="Kilépés minden eszközön" icon={<LogOut className="size-4" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Ez a művelet minden bejelentkezett eszközről (telefon, tablet, laptop) kilépteti
                  a fiókodat. Ha elveszetted vagy eladott egy eszközt, ezzel biztonságba helyezed
                  a gyülekezet adatait.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    toast.info('Ez a funkció hamarosan elérhető lesz.')
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Kijelentkezés minden eszközön (hamarosan)
                </Button>
              </SettingsSection>

              <SettingsSection title="Profil végleges törlése" icon={<Trash2 className="size-4" />}>
                <SelfDeleteSection />
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
  icon: React.ReactNode
  children: React.ReactNode
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
  icon: React.ReactNode
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
  sample,
  sampleSize,
  selected,
  onClick,
}: {
  label: string
  sample: string
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
      <span className={cn('font-serif font-bold text-slate-800', sampleSize)}>{sample}</span>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Saját profil végleges törlése (2026-06-05)
// ──────────────────────────────────────────────────────────────────────────

function SelfDeleteSection() {
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = confirmText.trim() === 'TÖRLÉS'

  async function handle() {
    if (!ready || busy) return
    setBusy(true)
    const res = await eraseMyAccount(reason)
    if (res.error) {
      setBusy(false)
      toast.error(res.error)
      return
    }
    toast.success('A fiókod törölve. Kijelentkeztetünk.')
    // A session már érvénytelen — teljes újratöltés a login-ra.
    setTimeout(() => {
      window.location.href = '/login'
    }, 1200)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[1rem] border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900">
        <p className="font-semibold">Ez a művelet visszafordíthatatlan!</p>
        <p className="mt-1 text-rose-800">
          A <strong>személyes adataid</strong> (név, e-mail, telefon) véglegesen anonimizálódnak,
          és a <strong>belépésed megszűnik</strong>. A gyülekezet adatai (tagok, pénzügy, anyakönyv)
          NEM törlődnek — de a gyülekezet <strong>felelős lelkész nélkül marad</strong>, amíg a
          rendszergazda új lelkészt nem rendel hozzá. A rendszergazda értesítést kap.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="self-delete-reason">Indok (opcionális)</Label>
        <Input
          id="self-delete-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="pl. Nyugdíjba vonultam."
          disabled={busy}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="self-delete-confirm">
          A megerősítéshez írd be: <strong>TÖRLÉS</strong>
        </Label>
        <Input
          id="self-delete-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <Button
        type="button"
        onClick={handle}
        disabled={!ready || busy}
        className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Profilom végleges törlése
      </Button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Jelszó-megváltoztatás komponens (v0.9.40, 2026-05-02)
// ──────────────────────────────────────────────────────────────────────────
//
// Egyforma flow Google-OAuth user-eknek (akinek nincs még jelszava) és sima
// jelszavas user-eknek (jelszó megváltoztatás):
//   - 2 mező: új jelszó + megerősítés
//   - eye-icon megjelenítés/elrejtés
//   - Inline validáció: min 8, max 72, mezők egyezése
//   - Submit → updatePassword server action → toast
//   - A jelenlegi jelszót NEM kérjük (a Supabase session-token önmagában
//     hitelesít — ha valaki idegen rászakad a fiókra, már így is hozzáfér)

function PasswordChangeForm() {
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const tooShort = pwd.length > 0 && pwd.length < 8
  const mismatch = pwd2.length > 0 && pwd !== pwd2
  const canSubmit = pwd.length >= 8 && pwd === pwd2 && !busy

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const res = await updatePassword(pwd)
    setBusy(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('A jelszó sikeresen frissítve. A következő bejelentkezésnél már ezzel léphet be.')
    setPwd('')
    setPwd2('')
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <p className="text-sm text-slate-600">
        Ha még nem volt jelszava (pl. Google-fiókkal lépett be), itt állíthat be egyet.
        Ezután akár Google-fiókkal, akár email + jelszó kombinációval is be tud lépni.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="settings-password">Új jelszó</Label>
        <div className="relative">
          <Input
            id="settings-password"
            type={show ? 'text' : 'password'}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Min. 8 karakter"
            autoComplete="new-password"
            className={cn('pr-10', tooShort && 'border-rose-400 focus:border-rose-500')}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            aria-label={show ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {tooShort && <p className="text-xs text-rose-600">A jelszó legalább 8 karakter legyen.</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="settings-password-confirm">Új jelszó megerősítése</Label>
        <Input
          id="settings-password-confirm"
          type={show ? 'text' : 'password'}
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          placeholder="Írja be újra a jelszót"
          autoComplete="new-password"
          className={mismatch ? 'border-rose-400 focus:border-rose-500' : ''}
          disabled={busy}
        />
        {mismatch && <p className="text-xs text-rose-600">A két jelszó nem egyezik.</p>}
      </div>

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <KeyRound className="mr-2 size-4" />
        )}
        Jelszó mentése
      </Button>
    </form>
  )
}
