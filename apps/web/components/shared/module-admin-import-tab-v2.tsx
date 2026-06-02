'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileSpreadsheet,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { activateDelegatedImport, deactivateDelegatedImport } from '@/app/(dashboard)/delegated-import/actions'
import { wipeFamilyStructure } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSheetImport } from '@/components/shared/multi-sheet-import'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

export interface ModuleImportProfile {
  value: string
  label: string
  description: string
  columns: string[]
  hints: string[]
}

interface ModuleAdminImportTabV2Props {
  moduleKey: string
  moduleLabel: string
  title: string
  description: string
  congregationName: string | null
  isGodMode: boolean
  isDelegatedImport: boolean
  delegatedExpiresAt?: number | null
  profiles: ModuleImportProfile[]
  /** Új multi-sheet import profilok (ha megadva, a fájl feltöltésnél a multi-sheet rendszer indul) */
  importProfiles?: ImportProfile[]
  /** Modul kulcs az import rendszerhez */
  importModule?: ImportModule
}

function getExtension(fileName: string) {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? `.${parts.pop()}` : ''
}

function downloadTemplate(moduleLabel: string, profile: ModuleImportProfile) {
  const rows = [
    profile.columns.join(';'),
    profile.columns.map((column) => `<${column}>`).join(';'),
  ]
  const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${moduleLabel.toLowerCase().replace(/\s+/g, '_')}_${profile.value}_minta.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatRemaining(expiresAt?: number | null) {
  if (!expiresAt) return null
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60000))
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    return `${hours} óra ${rem} perc`
  }
  return `${minutes} perc`
}

export function ModuleAdminImportTabV2({
  moduleKey,
  moduleLabel,
  title,
  description,
  congregationName,
  isGodMode,
  isDelegatedImport,
  delegatedExpiresAt,
  profiles,
  importProfiles,
  importModule,
}: ModuleAdminImportTabV2Props) {
  const router = useRouter()
  const [selectedProfile, setSelectedProfile] = useState(profiles[0]?.value ?? '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 2026-06-02: „Veszélyzóna" — családi struktúra törlése
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false)
  const [wipeConfirmation, setWipeConfirmation] = useState('')
  const [wiping, setWiping] = useState(false)

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.value === selectedProfile) || profiles[0],
    [profiles, selectedProfile],
  )

  const canImport = isGodMode || isDelegatedImport
  const accessMode = isGodMode ? 'god' : isDelegatedImport ? 'delegated' : 'locked'
  const extension = selectedFile ? getExtension(selectedFile.name) : ''
  const supported = ['.xlsx', '.xls', '.csv'].includes(extension)
  const ready = canImport && !!selectedFile && supported
  const remainingLabel = formatRemaining(delegatedExpiresAt)

  if (!activeProfile) return null

  async function handleActivateDelegatedImport(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const result = await activateDelegatedImport(moduleKey, pin)
    setSubmitting(false)

    if ('error' in result) {
      setError(typeof result.error === 'string' ? result.error : 'Ismeretlen hiba történt.')
      return
    }

    if (result.warning) {
      toast.warning(result.warning)
    } else {
      toast.success('A helyszíni delegált import munkamenet aktiválva lett.')
    }

    setPin('')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleWipeFamilyStructure() {
    setWiping(true)
    const result = await wipeFamilyStructure(wipeConfirmation)
    setWiping(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (result as any).stats
    toast.success(
      `Családi struktúra törölve! (${stats?.csalad ?? 0} család, ${stats?.haztartas ?? 0} háztartás, ${stats?.szemely_kapcsolat ?? 0} kapcsolat)`,
      { duration: 6000 },
    )
    setWipeDialogOpen(false)
    setWipeConfirmation('')
    router.refresh()
  }

  async function handleDeactivateDelegatedImport() {
    setDeactivating(true)
    const result = (await deactivateDelegatedImport(moduleKey)) as { success?: boolean; error?: string }
    setDeactivating(false)

    if ('error' in result) {
      toast.error(typeof result.error === 'string' ? result.error : 'Nem sikerült lezárni a munkamenetet.')
      return
    }

    toast.success('A delegált import munkamenet lezárult.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="card-raised relative overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-red-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-700/70">Rendszergazdai importáló</p>
            <h3 className="font-heading text-3xl text-slate-800">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ImportStat label="Modul" value={moduleLabel} />
            <ImportStat label="Profilok" value={profiles.length} />
            <ImportStat
              label="Állapot"
              value={accessMode === 'god' ? 'rendszergazdai' : accessMode === 'delegated' ? 'delegált' : 'zárolt'}
            />
          </div>
        </div>
      </div>

      <div
        className={`rounded-[1.4rem] border p-4 text-sm leading-relaxed ${
          accessMode === 'locked'
            ? 'border-amber-200 bg-amber-50/85 text-amber-900'
            : accessMode === 'delegated'
              ? 'border-sky-200 bg-sky-50/85 text-sky-900'
              : 'border-emerald-200 bg-emerald-50/85 text-emerald-800'
        }`}
      >
        <div className="flex items-start gap-2">
          {accessMode === 'god' ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="space-y-3">
            <div>
              <p className="font-semibold">
                {accessMode === 'god'
                  ? 'A teljes rendszergazdai import jelenleg engedélyezett.'
                  : accessMode === 'delegated'
                    ? 'A helyszíni delegált import jelenleg engedélyezett.'
                    : 'Az importfelület még védett állapotban van.'}
              </p>
              <p className="mt-1">
                {accessMode === 'god'
                  ? 'Ebben a munkamenetben a rendszergazdai mód teljes hozzáférést ad a modul importfelületéhez.'
                  : accessMode === 'delegated'
                    ? `A lelkipásztor jóváhagyásával ezen az eszközön ideiglenesen megnyílt az import ehhez a modulhoz.${remainingLabel ? ` Hátralévő idő: ${remainingLabel}.` : ''}`
                    : 'Ha helyszínen dolgozol a lelkipásztorral, itt lehet ideiglenesen megnyitni az adott modul importját a jelenlegi gyülekezethez.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {accessMode === 'locked' && (
                <Button type="button" className="rounded-full" onClick={() => setDialogOpen(true)}>
                  Helyszíni delegált import engedélyezése
                </Button>
              )}
              {accessMode === 'delegated' && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleDeactivateDelegatedImport}
                  disabled={deactivating}
                >
                  {deactivating ? 'Lezárás...' : 'Delegált munkamenet lezárása'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_1.18fr]">
        <div className="card-raised p-5">
          <h4 className="text-sm font-semibold text-slate-800">Importprofil választása</h4>
          <div className="mt-4 grid gap-3">
            {profiles.map((profile) => {
              const active = profile.value === selectedProfile
              return (
                <button
                  key={profile.value}
                  type="button"
                  onClick={() => {
                    setSelectedProfile(profile.value)
                    setSelectedFile(null)
                  }}
                  className={`rounded-[1.2rem] border p-4 text-left transition ${
                    active
                      ? 'border-red-200 bg-red-50/80 shadow-[0_20px_40px_-34px_rgba(220,38,38,0.28)]'
                      : 'border-white/70 bg-white/85 hover:border-slate-200 hover:bg-slate-50/80'
                  }`}
                >
                  <p className={`text-sm font-semibold ${active ? 'text-red-700' : 'text-slate-800'}`}>{profile.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{profile.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card-raised p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Aktív importprofil</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-800">{activeProfile.label}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{activeProfile.description}</p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => downloadTemplate(moduleLabel, activeProfile)}
            >
              Minta CSV letöltése
            </Button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="rounded-[1.2rem] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cél gyülekezet</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{congregationName || 'Aktív gyülekezet'}</p>
                <p className="mt-1 text-sm text-slate-500">Az import mindig az aktuális munkameneti gyülekezethez kötődik.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Excel vagy CSV fájl</label>
                <label className="flex h-12 cursor-pointer items-center justify-between rounded-[1.2rem] border border-dashed border-slate-300 bg-white/85 px-4 text-sm text-slate-600 transition hover:border-red-300 hover:bg-red-50/40">
                  <span className="truncate pr-3">
                    {selectedFile ? selectedFile.name : 'Válassz .xlsx, .xls vagy .csv fájlt'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <Upload className="size-3.5" />
                    Tallózás
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    disabled={!canImport}
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ReadyState
                  label="Fájlformátum"
                  state={!canImport ? 'warning' : selectedFile ? (supported ? 'ready' : 'warning') : 'idle'}
                  description={
                    !canImport
                      ? 'Az importmunkamenet még nincs megnyitva.'
                      : selectedFile
                        ? supported
                          ? 'A fájlformátum elfogadható.'
                          : 'Nem támogatott fájlformátum.'
                        : 'Még nincs kiválasztott fájl.'
                  }
                />
                <ReadyState
                  label="Importkészség"
                  state={ready ? 'ready' : canImport ? 'warning' : 'idle'}
                  description={
                    ready
                      ? 'Az előkészítés rendben van a következő importkörhöz.'
                      : canImport
                        ? 'Még hiányzik egy támogatható fájl.'
                        : 'Előbb engedélyezni kell a helyszíni vagy rendszergazdai importot.'
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.2rem] border border-slate-200/80 bg-white/88 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Elvárt oszlopok</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeProfile.columns.map((column) => (
                    <span key={column} className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      {column}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-slate-200/80 bg-white/88 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Előzetes ellenőrzési pontok</p>
                <div className="mt-3 space-y-2">
                  {activeProfile.hints.map((hint) => (
                    <div key={hint} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Multi-sheet Excel import ──────────────────────── */}
      {importProfiles && importModule && canImport && (
        <MultiSheetImport
          module={importModule}
          profiles={importProfiles}
          moduleLabel={moduleLabel}
          canImport={canImport}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <LockKeyhole className="size-5 text-red-600" />
              Helyszíni delegált import engedélyezése
            </DialogTitle>
            <DialogDescription>
              A lelkipásztor ezzel ideiglenesen jóváhagyja, hogy a jelenlegi gyülekezethez ezen az eszközön
              megnyíljon a tömeges import a(z) {moduleLabel.toLowerCase()} modulban.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleActivateDelegatedImport} className="space-y-4">
            <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              A jóváhagyás 2 órára szól, és csak az aktuális gyülekezet importfelületét nyitja meg.
            </div>

            {error && (
              <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`delegated-import-pin-${moduleKey}`}>Rendszergazdai PIN</Label>
              <Input
                id={`delegated-import-pin-${moduleKey}`}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 számjegy"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Mégse
              </Button>
              <Button type="submit" disabled={submitting || pin.length !== 6}>
                {submitting ? 'Engedélyezés...' : 'Delegált import megnyitása'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2026-06-02: VESZÉLYZÓNA — csak a tagnyilvántartás modulnál + god-mode */}
      {moduleKey === 'tagnyilvantartas' && isGodMode && (
        <div className="rounded-[1.4rem] border-2 border-red-300 bg-red-50/50 p-5">
          <div className="flex items-start gap-3 mb-3">
            <ShieldAlert className="size-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-heading text-lg font-semibold text-red-800">
                Veszélyzóna
              </h4>
              <p className="text-sm text-red-700/85 mt-1">
                Visszaállítási műveletek a tisztább újra-importáláshoz. A személyek,
                anyakönyvek és befizetések <strong>nem törlődnek</strong>, csak a
                családi struktúra (családok, háztartások, kapcsolatok).
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Családi struktúra törlése
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Törli: <code className="bg-slate-100 px-1 rounded">csalad</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">gyerek</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">haztartas</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">haztartas_tag</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">szemely_kapcsolat</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">cim</code>
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setWipeDialogOpen(true)}
                className="rounded-full bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
              >
                <ShieldAlert className="size-4 mr-1.5" />
                Családi struktúra törlése
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Megerősítés-dialog a családi struktúra törléséhez */}
      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="size-5" />
              Családi struktúra törlése
            </DialogTitle>
            <DialogDescription>
              Ez a művelet <strong>visszafordíthatatlan</strong>. Az összes család,
              háztartás, családi-tagsági és rokoni kapcsolat törlődik a
              gyülekezetben.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <p>
                <strong>✓ Megmarad:</strong> személyi adatok, anyakönyvi rekordok
                (keresztelő, esketés, temetés), befizetések, családlátogatási napló.
              </p>
              <p className="mt-1">
                <strong>✗ Törlődik:</strong> a teljes családi struktúra (régi és új modell).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wipe-confirmation">
                Megerősítés: írd be a <code className="bg-slate-100 px-1 rounded text-red-700 font-bold">TÖRLÉS</code> szót
              </Label>
              <Input
                id="wipe-confirmation"
                value={wipeConfirmation}
                onChange={(e) => setWipeConfirmation(e.target.value)}
                placeholder="TÖRLÉS"
                className="bg-white shadow-sm border-slate-300 font-mono"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setWipeDialogOpen(false); setWipeConfirmation('') }}>
                Mégse
              </Button>
              <Button
                type="button"
                onClick={handleWipeFamilyStructure}
                disabled={wiping || wipeConfirmation !== 'TÖRLÉS'}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {wiping ? 'Törlés…' : 'Törlés véglegesen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ImportStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.25rem] bg-white/78 px-4 py-3 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-800">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <FileSpreadsheet className="size-5" />
        </div>
      </div>
    </div>
  )
}

function ReadyState({
  label,
  state,
  description,
}: {
  label: string
  state: 'idle' | 'ready' | 'warning'
  description: string
}) {
  const stateMap = {
    idle: 'bg-slate-50 text-slate-700',
    ready: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  } as const

  const labelMap = {
    idle: 'Várakozik',
    ready: 'Kész',
    warning: 'Figyelem',
  } as const

  return (
    <div className={`rounded-[1.2rem] px-4 py-3 ${stateMap[state]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">{labelMap[state]}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed opacity-85">{description}</p>
    </div>
  )
}
