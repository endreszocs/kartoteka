import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMinutesList } from './actions'
import { MinutesList } from '@/components/minutes/minutes-list'
import { InvitationSection } from '@/components/minutes/invitation-section'
import { MinutesPrintSelector } from '@/components/minutes/minutes-print-selector'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { Plus, BookOpen, FileText, Gavel } from 'lucide-react'

const MINUTES_IMPORT_PROFILES = [
  {
    value: 'jegyzokonyv',
    label: 'Jegyzőkönyvek',
    description: 'Korábbi presbiteri vagy közgyűlési jegyzőkönyvek importálása Excel fájlból.',
    columns: ['datum', 'tipus', 'hely', 'elnok_neve', 'jegyzo_neve', 'hitelesito1', 'hitelesito2'],
    hints: [
      'Minden sor egy jegyzőkönyv fejléce.',
      'A "tipus" oszlop: presbiteri vagy kozgyulesi.',
      'A napirendi pontokat és határozatokat külön fülön importáld.',
    ],
  },
  {
    value: 'hatarozatok',
    label: 'Határozatok',
    description: 'Határozatok tömeges importálása Excel/CSV fájlból.',
    columns: ['sorszam', 'ev', 'szoveg', 'felelos', 'hatarido'],
    hints: [
      'Minden sor egy határozat.',
      'A sorszám és év kötelező.',
      'A határozat szövege kötelező.',
    ],
  },
]

export default async function JegyzokonyvekPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!access.effectiveCongregationId) redirect('/dashboard')

  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('minutes')
  const currentYear = new Date().getFullYear()
  const minutes = await getMinutesList(currentYear)

  // Statisztikák
  const totalMinutes = minutes.length
  const draftCount = minutes.filter((m: { allapot: string }) => m.allapot === 'draft').length
  const finalizedCount = minutes.filter((m: { allapot: string }) => m.allapot === 'veglegesitett' || m.allapot === 'hitelesitett').length

  return (
    <ModuleAdminWorkspace
      moduleKey="minutes"
      moduleLabel="Jegyzőkönyvek"
      mainTabLabel="Jegyzőkönyv munkafelület"
      importTitle="Jegyzőkönyv labor-importáló"
      importDescription="Korábbi presbiteri vagy közgyűlési jegyzőkönyvek, határozatok Excel/CSV alapú importja."
      congregationName={access.congregationName}
      isGodMode={godMode.active}
      isDelegatedImport={delegatedImport.active}
      delegatedExpiresAt={delegatedImport.expiresAt}
      hideTabsUntilPrivileged
      profiles={MINUTES_IMPORT_PROFILES}
    >
      <div className="space-y-5">
        {/* Hero fejléc */}
        <div className="card-raised relative overflow-hidden p-5 sm:p-6">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-indigo-200/35 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-violet-200/30 blur-3xl" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700/70">Presbitérium és közgyűlés</p>
              <h2 className="font-heading text-3xl text-slate-800">Jegyzőkönyvek</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Presbiteri és közgyűlési jegyzőkönyvek, meghívók, határozatok kezelése — diktálás, keresés, nyomtatás, iktatás egy helyen.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <MinutesPrintSelector
                minutes={minutes as Array<{ id: string; ev: number; ules_sorszam: number; datum: string; allapot: string }>}
                congregationName={access.congregationName || 'Református Egyházközség'}
                inline
              />
              <Link
                href="/jegyzokonyvek/uj"
                className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <Plus className="size-4" />
                Jegyzőkönyv rögzítése
              </Link>
            </div>
          </div>
        </div>

        {/* KPI kártyák */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <BookOpen className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalMinutes}</p>
                <p className="text-xs text-slate-500">Összes jegyzőkönyv ({currentYear})</p>
              </div>
            </div>
          </div>
          <div className="card-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{draftCount}</p>
                <p className="text-xs text-slate-500">Piszkozat</p>
              </div>
            </div>
          </div>
          <div className="card-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Gavel className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{finalizedCount}</p>
                <p className="text-xs text-slate-500">Véglegesített</p>
              </div>
            </div>
          </div>
        </div>

        {/* Meghívó generálás */}
        <InvitationSection congregationName={access.congregationName || undefined} />

        {/* Jegyzőkönyv lista + keresés */}
        <MinutesList
          initialMinutes={minutes as Array<{ id: string; ev: number; ules_sorszam: number; datum: string; hely: string | null; allapot: string; elnok_neve: string | null }>}
          currentYear={currentYear}
          congregationName={access.congregationName || undefined}
        />
      </div>
    </ModuleAdminWorkspace>
  )
}
