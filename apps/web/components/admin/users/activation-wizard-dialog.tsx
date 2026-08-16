'use client'

/**
 * Felhasználó-aktiváló wizard (2026-07-11 admin-redesign 2. kör).
 *
 * A várakozó (pending) fiók FŐ akciója: kétlépéses „Elbírálás" dialógus.
 *
 *  1. lépés — „Kérelem áttekintése": a regisztrációkor megadott MINDEN adat
 *     (név, email, kért szerepkör, kaszkád kerület→megye→gyülekezet, telefonszám,
 *     indoklás, „honnan hallott rólunk", csatolt dokumentum, kérelem dátuma).
 *     Ha nincs access_request (pl. régi OAuth-regisztráló), a profil-adatok +
 *     figyelmeztetés látszik. Gombok: „Elutasítás…" | „Tovább: aktiválás →".
 *
 *  2. lépés — „Aktiválás és szerepkör": a kérelemből ELŐTÖLTVE a szerepkör +
 *     hatókör (módosítható). A megerősítés EGY lépésben aktivál + kiosztja a
 *     szerepkört.
 *
 * Rendszer-tény: az approveAccessRequest automatikusan CSAK lelkész/könyvelő
 * kérelemnél hoz létre gyülekezeti profile_role-t. A magasabb szerepeket
 * (esperes / egyházmegyei admin / egyházkerületi admin / egyházmegyei számvevő)
 * ezért a wizard 2. lépése hozza létre a megfelelő scope-pal (createProfileRole).
 */

import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Castle,
  Church,
  FileText,
  Info,
  Loader2,
  Phone,
  Sparkles,
  UserCheck,
  UserX,
} from 'lucide-react'
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

import {
  approveAccessRequest,
} from '@/app/(dashboard)/admin/access-requests-actions'
import { quickApproveUser, type UserWithScope } from '@/app/(dashboard)/admin/actions'
import { createProfileRole } from '@/app/(dashboard)/admin/profile-roles-actions'
import {
  ROLE_LABELS,
  SCOPE_LABELS,
  type ProfileRoleScope,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

import { formatRelativeTime } from './user-visuals'

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

interface ActivationWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserWithScope
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  /** Az „Elutasítás…" gomb a meglévő elutasító dialógust nyitja meg. */
  onReject: () => void
  /** A csatolt dokumentum megnyitása (signed URL). */
  onViewDocument?: (path: string) => void
  /** Sikeres aktiválás után: a lista újratöltése. */
  onDone: () => Promise<void>
}

// Token-alapú select-stílus (dark-safe) — az űrlap-selectekhez.
const SELECT_CLS =
  'mt-1 h-9 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30'

/** A kért szerepkörhöz tartozó alapértelmezett hatókör. */
function scopeForRole(role: ProfileRoleType): ProfileRoleScope {
  if (role === 'admin') return 'system'
  if (role === 'egyhazkeruleti_admin' || role === 'egyhazkeruleti_szamvevo') return 'district'
  if (role === 'esperes' || role === 'egyhazmegyei_admin' || role === 'egyhazmegyei_szamvevo')
    return 'diocese'
  return 'congregation' // lelkesz, konyvelo, custom
}

/** A kérelemből (vagy a profil elsődleges gyülekezetéből) előtöltött kezdőállapot. */
function computeInitial(user: UserWithScope): {
  scope: ProfileRoleScope
  role: ProfileRoleType
  scopeId: string | null
} {
  const req = user.pendingRequest
  if (req?.requestedRole) {
    const r = req.requestedRole as ProfileRoleType
    const sc = scopeForRole(r)
    return {
      scope: sc,
      role: r,
      scopeId:
        sc === 'system'
          ? null
          : sc === 'district'
            ? req.requestedDistrictId
            : sc === 'diocese'
              ? req.requestedDioceseId
              : req.requestedCongregationId,
    }
  }
  return { scope: 'congregation', role: 'lelkesz', scopeId: user.primary_congregation_id ?? null }
}

function roleOptionsForScope(scope: ProfileRoleScope): Array<{ value: ProfileRoleType; label: string }> {
  if (scope === 'system') return [{ value: 'admin', label: ROLE_LABELS.admin }]
  if (scope === 'district')
    return [
      { value: 'egyhazkeruleti_admin', label: ROLE_LABELS.egyhazkeruleti_admin },
      { value: 'egyhazkeruleti_szamvevo', label: ROLE_LABELS.egyhazkeruleti_szamvevo },
      { value: 'custom', label: 'Egyedi szerep' },
    ]
  if (scope === 'diocese')
    return [
      { value: 'esperes', label: ROLE_LABELS.esperes },
      { value: 'egyhazmegyei_admin', label: ROLE_LABELS.egyhazmegyei_admin },
      { value: 'egyhazmegyei_szamvevo', label: ROLE_LABELS.egyhazmegyei_szamvevo },
      { value: 'custom', label: 'Egyedi szerep' },
    ]
  return [
    { value: 'lelkesz', label: ROLE_LABELS.lelkesz },
    { value: 'konyvelo', label: ROLE_LABELS.konyvelo },
    { value: 'custom', label: 'Egyedi szerep (pl. titkárnő)' },
  ]
}

export function ActivationWizardDialog({
  open,
  onOpenChange,
  user,
  congregations,
  dioceses,
  districts,
  onReject,
  onViewDocument,
  onDone,
}: ActivationWizardDialogProps) {
  // A dialógust a szülő felhasználónként FRISSEN mountolja (feltételes render),
  // ezért a kérelemből előtöltött kezdőállapot lazy useState-initializerből jön —
  // nincs szükség setState-elő effektre (és annak cascading-render lintjére).
  const [step, setStep] = useState<1 | 2>(1)
  const [scope, setScope] = useState<ProfileRoleScope>(() => computeInitial(user).scope)
  const [scopeId, setScopeId] = useState<string | null>(() => computeInitial(user).scopeId)
  const [role, setRole] = useState<ProfileRoleType>(() => computeInitial(user).role)
  const [customLabel, setCustomLabel] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const req = user.pendingRequest
  const displayName = user.full_name || user.email

  function handleScopeChange(next: ProfileRoleScope) {
    setScope(next)
    setScopeId(null)
    const defaults: Record<ProfileRoleScope, ProfileRoleType> = {
      system: 'admin',
      district: 'egyhazkeruleti_admin',
      diocese: 'esperes',
      congregation: 'lelkesz',
    }
    setRole(defaults[next])
  }

  const scopeEntities: Array<{ id: string; name: string }> =
    scope === 'district'
      ? districts
      : scope === 'diocese'
        ? dioceses
        : scope === 'congregation'
          ? congregations
          : []

  const scopeReady = scope === 'system' || !!scopeId
  const customReady = role !== 'custom' || !!customLabel.trim()
  const pastorApprovalNeeded = scope === 'congregation' && role !== 'lelkesz' && role !== 'konyvelo'

  function handleActivate(withRole: boolean) {
    startTransition(async () => {
      // ── 1) Aktiválás ─────────────────────────────────────────────
      let approveSucceeded = false
      if (req) {
        const res = await approveAccessRequest({ id: req.accessRequestId })
        if (res.error) {
          // Fallback: kerületi admin (guard) vagy már 'approved' kérelem → sima
          // aktiválás, hogy a jóváhagyás ne akadjon el.
          const fb = await quickApproveUser(user.id)
          if ('error' in fb && fb.error) {
            toast.error(
              `A jóváhagyás nem sikerült: ${res.error} — az aktiválás is hibázott: ${fb.error}`,
              { duration: 12000 },
            )
            return
          }
        } else {
          approveSucceeded = true
          if (res.info) {
            toast.warning(`A kérelem jóváhagyva, DE: ${res.info}`, { duration: 12000 })
          }
        }
      } else {
        const res = await quickApproveUser(user.id)
        if ('error' in res && res.error) {
          toast.error(res.error)
          return
        }
      }

      // ── 2) Szerepkör-kiosztás ────────────────────────────────────
      // Az approveAccessRequest lelkész/könyvelő kérelemnél MÁR létrehozta a
      // gyülekezeti szerepet — ilyenkor nem duplázunk.
      const autoCreated =
        approveSucceeded &&
        !!req?.requestedCongregationId &&
        (req?.requestedRole === 'lelkesz' || req?.requestedRole === 'konyvelo')
      const selectedMatchesAuto =
        autoCreated &&
        scope === 'congregation' &&
        scopeId === req?.requestedCongregationId &&
        role === req?.requestedRole

      let roleWarning: string | null = null
      const didCreateRole = withRole && !selectedMatchesAuto && scopeReady && customReady
      if (didCreateRole) {
        const rr = await createProfileRole({
          profileId: user.id,
          scope,
          scopeId: scope === 'system' ? null : scopeId,
          role,
          customLabel: role === 'custom' ? customLabel.trim() : null,
          reason: reason.trim() || undefined,
        })
        if ('error' in rr && rr.error) roleWarning = rr.error
      }

      // A createProfileRole a gyülekezeti nem-lelkészi szerepet (könyvelő/egyedi)
      // a lelkész jóváhagyásáig FÜGGŐBEN hozza létre — a toast ezt tükrözi.
      const createdPending =
        didCreateRole && !roleWarning && scope === 'congregation' && role !== 'lelkesz'

      if (roleWarning) {
        toast.warning(
          `${displayName} fiókja aktiválva, de a szerepkör kiosztása nem sikerült: ${roleWarning}`,
          { duration: 12000 },
        )
      } else if (createdPending) {
        toast.success(
          `${displayName} aktiválva. A gyülekezeti szerep a lelkész jóváhagyására vár.`,
        )
      } else {
        toast.success(`Jóváhagyva és aktiválva: ${displayName}`)
      }

      await onDone()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 font-heading text-lg text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--primary)]">
              <UserCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">Kérelem elbírálása</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {displayName}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Lépés-jelző */}
        <div className="flex items-center gap-2 text-xs">
          <StepPill active={step === 1} done={step === 2} index={1} label="Áttekintés" />
          <span className="h-px flex-1 bg-border" aria-hidden />
          <StepPill active={step === 2} done={false} index={2} label="Aktiválás" />
        </div>

        <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
          {step === 1 ? (
            <>
              {req ? (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-[var(--primary)]" />
                    <p className="text-sm font-semibold text-foreground">Regisztrációs kérelem</p>
                    {req.requestedAt && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(req.requestedAt).toLocaleDateString('hu-HU')}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                    <ReviewField
                      icon={<UserCheck className="size-3.5 text-[var(--primary)]" />}
                      label="Kért szerepkör"
                      value={
                        req.requestedRole
                          ? ROLE_LABELS[req.requestedRole as ProfileRoleType] || req.requestedRole
                          : null
                      }
                    />
                    <ReviewField
                      icon={<Phone className="size-3.5 text-muted-foreground" />}
                      label="Telefonszám"
                      value={req.phone || user.phone}
                    />
                    <ReviewField
                      icon={<Castle className="size-3.5 text-muted-foreground" />}
                      label="Egyházkerület"
                      value={req.requestedDistrictName}
                    />
                    <ReviewField
                      icon={<Building2 className="size-3.5 text-muted-foreground" />}
                      label="Egyházmegye"
                      value={req.requestedDioceseName}
                    />
                    <ReviewField
                      icon={<Church className="size-3.5 text-muted-foreground" />}
                      label="Gyülekezet"
                      value={req.requestedCongregationName}
                    />
                    <ReviewField
                      icon={<Sparkles className="size-3.5 text-muted-foreground" />}
                      label="Honnan hallott rólunk"
                      value={req.referrer}
                    />
                  </div>
                  {req.justification && (
                    <div className="rounded-lg bg-card/70 px-3 py-2 text-xs text-foreground ring-1 ring-border">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                        Indoklás
                      </span>
                      &bdquo;{req.justification}&rdquo;
                    </div>
                  )}
                  {req.documentPath && onViewDocument && (
                    <button
                      type="button"
                      onClick={() => onViewDocument(req.documentPath!)}
                      className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-[var(--primary)] underline underline-offset-2 hover:opacity-80"
                    >
                      <FileText className="size-3.5" />
                      Csatolt dokumentum megtekintése
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="leading-relaxed">
                      Ehhez a fiókhoz <strong>nem tartozik regisztrációs kérelem</strong> (pl. régi
                      Google-belépés). Az alábbi profil-adatok alapján bírálja el, és a következő
                      lépésben kézzel válassza ki a szerepkört és a hatókört.
                    </p>
                  </div>
                  <div className="grid gap-x-4 gap-y-2.5 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 sm:p-4">
                    <ReviewField
                      icon={<Phone className="size-3.5 text-muted-foreground" />}
                      label="Telefonszám"
                      value={user.phone}
                    />
                    <ReviewField
                      icon={<Church className="size-3.5 text-muted-foreground" />}
                      label="Gyülekezet (megadott)"
                      value={user.congregation_text || user.primary_congregation_name}
                    />
                    <ReviewField
                      icon={<Building2 className="size-3.5 text-muted-foreground" />}
                      label="Egyházmegye"
                      value={user.primary_diocese_name}
                    />
                    <ReviewField
                      icon={<Castle className="size-3.5 text-muted-foreground" />}
                      label="Egyházkerület"
                      value={user.primary_district_name}
                    />
                  </div>
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                {user.created_at
                  ? `Regisztrált: ${new Date(user.created_at).toLocaleString('hu-HU')}`
                  : 'Regisztráció dátuma ismeretlen'}
                {' · '}
                Utoljára aktív: {formatRelativeTime(user.lastActiveAt)}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                <Info className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="leading-relaxed">
                  A megerősítés <strong>egy lépésben</strong> aktiválja a fiókot és kiosztja a
                  kiválasztott szerepkört. A felhasználó ezután azonnal beléphet.
                </p>
              </div>

              <div>
                <Label>Hatókör</Label>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['system', 'district', 'diocese', 'congregation'] as ProfileRoleScope[]).map(
                    (s) => (
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
                    ),
                  )}
                </div>
              </div>

              {scope !== 'system' && (
                <div>
                  <Label htmlFor="wizard-scope-id">
                    {scope === 'congregation'
                      ? 'Gyülekezet'
                      : scope === 'diocese'
                        ? 'Egyházmegye'
                        : 'Egyházkerület'}
                  </Label>
                  <select
                    id="wizard-scope-id"
                    value={scopeId || ''}
                    onChange={(e) => setScopeId(e.target.value || null)}
                    className={SELECT_CLS}
                  >
                    <option value="">— Válasszon —</option>
                    {scopeEntities.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="wizard-role">Szerepkör</Label>
                <select
                  id="wizard-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as ProfileRoleType)}
                  className={SELECT_CLS}
                >
                  {roleOptionsForScope(scope).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {role === 'custom' && (
                <div>
                  <Label htmlFor="wizard-custom-label">Egyedi szerepkör neve</Label>
                  <Input
                    id="wizard-custom-label"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Pl.: Titkárnő, Pénztáros, Segédlelkész"
                    className="mt-1"
                    maxLength={64}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="wizard-reason">Indoklás (opcionális)</Label>
                <Input
                  id="wizard-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Miért kapja ezt a szerepkört?"
                  className="mt-1"
                />
              </div>

              {pastorApprovalNeeded && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <strong>Lelkészi jóváhagyás szükséges</strong> — a gyülekezeti hozzárendelés{' '}
                  <em>jóváhagyásra vár</em> állapotban jön létre. A fiók aktiválódik, de a szerep a
                  gyülekezet lelkészének jóváhagyásáig nem lép életbe.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {step === 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onReject()
                }}
                disabled={isPending}
                className="min-h-9 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                <UserX className="size-4" />
                Elutasítás…
              </Button>
              <Button onClick={() => setStep(2)} className="min-h-9 gap-1.5">
                Tovább: aktiválás
                <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={isPending}
                className="min-h-9 gap-1.5"
              >
                <ArrowLeft className="size-4" />
                Vissza
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={() => handleActivate(false)}
                  disabled={isPending}
                  className="min-h-9 gap-1.5"
                  title="A fiók aktiválódik, szerepkör kiosztása nélkül — azt később is hozzárendelheti."
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Csak aktiválás
                </Button>
                <Button
                  onClick={() => handleActivate(true)}
                  disabled={isPending || !scopeReady || !customReady}
                  className="min-h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserCheck className="size-4" />
                  )}
                  Aktiválás és szerepkör
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepPill({
  active,
  done,
  index,
  label,
}: {
  active: boolean
  done: boolean
  index: number
  label: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${
        active
          ? 'bg-primary/10 text-foreground ring-1 ring-primary/25'
          : done
            ? 'text-[var(--primary)]'
            : 'text-muted-foreground'
      }`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
          active || done
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {index}
      </span>
      {label}
    </span>
  )
}

/** Egy sor a kérelem/profil adataiból (ikon + címke + érték). */
function ReviewField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block break-words text-sm font-medium text-foreground">
          {value || <span className="italic text-muted-foreground/70">nincs megadva</span>}
        </span>
      </span>
    </div>
  )
}
