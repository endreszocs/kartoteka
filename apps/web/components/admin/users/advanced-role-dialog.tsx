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
      <DialogContent className="max-w-xl bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800">
            Részletes szerepkör — {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* D6 banner pending user-nél */}
          {isUserPending && !pastorApprovalNeeded && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 flex items-start gap-2">
              <Info className="size-4 mt-0.5 shrink-0 text-amber-600" />
              <p className="leading-relaxed">
                Ennek a felhasználónak a fiókja még <strong>nincs aktiválva</strong>. A szerepkör kiosztása egyúttal aktiválja a fiókot is, és a felhasználó beléphet a rendszerbe.
              </p>
            </div>
          )}

          <div>
            <Label>Hatókör</Label>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['system', 'district', 'diocese', 'congregation'] as ProfileRoleScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScopeChange(s)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    scope === s
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {scope !== 'system' && (
            <div>
              <Label>
                {scope === 'congregation'
                  ? 'Gyülekezet'
                  : scope === 'diocese'
                    ? 'Egyházmegye'
                    : 'Egyházkerület'}
              </Label>
              <select
                value={scopeId || ''}
                onChange={(e) => setScopeId(e.target.value || null)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm"
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
            <Label>Szerepkör</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRoleType)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm"
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
              <Label>Egyedi szerepkör neve</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Pl.: Titkárnő, Pénztáros, Segédlelkész"
                className="mt-1"
                maxLength={64}
              />
            </div>
          )}

          <div>
            <Label>Indoklás (opcionális)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Miért kapja ezt a szerepkört?"
              className="mt-1"
            />
          </div>

          {pastorApprovalNeeded && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800">
              <strong>Lelkészi jóváhagyás szükséges</strong> — a hozzárendelés <em>jóváhagyásra vár</em> állapotban jön létre. A gyülekezet lelkésze a saját <code>/profile/kapcsolatok</code> oldalán hagyja jóvá vagy utasítja el.
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              (scope !== 'system' && !scopeId) ||
              (role === 'custom' && !customLabel.trim())
            }
            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Kiosztás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
