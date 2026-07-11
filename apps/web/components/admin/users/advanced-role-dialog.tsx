'use client'

import { useMemo, useState, useTransition } from 'react'
import { Info, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { createProfileRole } from '@/app/(dashboard)/admin/profile-roles-actions'
import {
  SCOPE_LABELS,
  type ProfileRoleScope,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

interface CongLite {
  id: string
  name: string
  diocese_id: string | null
}
interface DioceseLite {
  id: string
  name: string
  district_id: string | null
}
interface DistrictLite {
  id: string
  name: string
}

interface AdvancedRoleDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: { id: string; full_name: string | null; email: string | null; status?: string | null }
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  onSaved: () => Promise<void>
}

// Token-alapú select-stílus (dark-safe) — az űrlap-selectekhez.
const SELECT_CLS =
  'mt-1 h-9 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30'

export function AdvancedRoleDialog({
  open,
  onOpenChange,
  user,
  congregations,
  dioceses,
  districts,
  onSaved,
}: AdvancedRoleDialogProps) {
  const [scope, setScope] = useState<ProfileRoleScope>('congregation')
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [role, setRole] = useState<ProfileRoleType>('konyvelo')
  const [customLabel, setCustomLabel] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const isUserPending = user.status === 'pending'

  const roleOptions = useMemo(() => {
    if (scope === 'system') return [{ value: 'admin' as ProfileRoleType, label: 'Rendszergazda' }]
    if (scope === 'district')
      return [
        { value: 'egyhazkeruleti_admin' as ProfileRoleType, label: 'Egyházkerületi admin' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep' },
      ]
    if (scope === 'diocese')
      return [
        { value: 'esperes' as ProfileRoleType, label: 'Esperes' },
        { value: 'egyhazmegyei_admin' as ProfileRoleType, label: 'Egyházmegyei admin' },
        { value: 'egyhazmegyei_szamvevo' as ProfileRoleType, label: 'Egyházmegyei számvevő' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep' },
      ]
    return [
      { value: 'lelkesz' as ProfileRoleType, label: 'Lelkipásztor' },
      { value: 'konyvelo' as ProfileRoleType, label: 'Könyvelő' },
      { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep (pl. titkárnő)' },
    ]
  }, [scope])

  function handleScopeChange(next: ProfileRoleScope) {
    setScope(next)
    setScopeId(null)
    const defaults: Record<ProfileRoleScope, ProfileRoleType> = {
      system: 'admin',
      district: 'egyhazkeruleti_admin',
      diocese: 'egyhazmegyei_admin',
      congregation: 'konyvelo',
    }
    setRole(defaults[next])
  }

  const scopeOptions = useMemo<Array<{ id: string; name: string }>>(() => {
    if (scope === 'system') return []
    if (scope === 'district') return districts
    if (scope === 'diocese') return dioceses
    if (scope === 'congregation') return congregations
    return []
  }, [scope, congregations, dioceses, districts])

  function handleSave() {
    startTransition(async () => {
      const result = await createProfileRole({
        profileId: user.id,
        scope,
        scopeId: scope === 'system' ? null : scopeId,
        role,
        customLabel: role === 'custom' ? customLabel : null,
        reason: reason.trim() || undefined,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (result.accountActivated) {
        toast.success('Szerepkör kiosztva, és a fiók aktiválva.')
      } else {
        toast.success('Szerepkör kiosztva.')
      }
      setScopeId(null)
      setCustomLabel('')
      setReason('')
      await onSaved()
    })
  }

  const pastorApprovalNeeded = scope === 'congregation' && role !== 'lelkesz'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8 font-heading text-lg text-foreground">
            Részletes szerepkör — {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto">
          {/* D6 banner pending user-nél */}
          {isUserPending && !pastorApprovalNeeded && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="leading-relaxed">
                Ennek a felhasználónak a fiókja még <strong>nincs aktiválva</strong>. A szerepkör
                kiosztása egyúttal aktiválja a fiókot is, és a felhasználó beléphet a rendszerbe.
              </p>
            </div>
          )}

          <div>
            <Label>Hatókör</Label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['system', 'district', 'diocese', 'congregation'] as ProfileRoleScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScopeChange(s)}
                  aria-pressed={scope === s}
                  className={`min-h-9 rounded-xl border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    scope === s
                      ? 'border-[var(--primary)] bg-primary/10 font-medium text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] hover:text-foreground'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {scope !== 'system' && (
            <div>
              <Label htmlFor="advanced-scope-id">
                {scope === 'congregation'
                  ? 'Gyülekezet'
                  : scope === 'diocese'
                    ? 'Egyházmegye'
                    : 'Egyházkerület'}
              </Label>
              <select
                id="advanced-scope-id"
                value={scopeId || ''}
                onChange={(e) => setScopeId(e.target.value || null)}
                className={SELECT_CLS}
              >
                <option value="">— Válasszon —</option>
                {scopeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="advanced-role">Szerepkör</Label>
            <select
              id="advanced-role"
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRoleType)}
              className={SELECT_CLS}
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {role === 'custom' && (
            <div>
              <Label htmlFor="advanced-custom-label">Egyedi szerepkör neve</Label>
              <Input
                id="advanced-custom-label"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Pl.: Titkárnő, Pénztáros, Segédlelkész"
                className="mt-1"
                maxLength={64}
              />
            </div>
          )}

          <div>
            <Label htmlFor="advanced-reason">Indoklás (opcionális)</Label>
            <Input
              id="advanced-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Miért kapja ezt a szerepkört?"
              className="mt-1"
            />
          </div>

          {pastorApprovalNeeded && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>Lelkészi jóváhagyás szükséges</strong> — a hozzárendelés{' '}
              <em>jóváhagyásra vár</em> állapotban jön létre. A gyülekezet lelkésze a saját{' '}
              <code>/profile/kapcsolatok</code> oldalán hagyja jóvá vagy utasítja el.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="min-h-9"
          >
            Mégse
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              (scope !== 'system' && !scopeId) ||
              (role === 'custom' && !customLabel.trim())
            }
            className="min-h-9 gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Kiosztás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
