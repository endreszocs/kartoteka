'use client'

/**
 * Egyházmegyei dashboard — Kérelmek fül.
 *
 * Tisztelettel és a gyülekezeti autonómia elve mellett kezeli a beérkező kérelmeket:
 *  1. Javítási kérelmek (a lelkész kérte, az egyházmegye bírálja)
 *  2. Hozzáférési kérelmek (admin/master kéri, a lelkész bírálja — itt csak információ)
 *  3. Szerepkör hozzárendelési kérelmek (függő — a lelkész jóváhagyására vár)
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  Clock,
  HandHeart,
  Inbox,
  Info,
  X,
} from 'lucide-react'
import {
  approveUnlockRequest,
  rejectUnlockRequest,
} from '@/app/(dashboard)/dashboard-egyhazmegye/actions'
import type { UnlockRequest } from '@/lib/constants/documents'
import type { AssignmentRow } from '@/app/(dashboard)/admin/profile-congregations-actions'

const TYPE_LABELS: Record<string, string> = {
  budget: 'Költségvetés',
  accounting: 'Számadás',
  inventory: 'Vagyonleltár',
  // 2026-07-17 (F5): a hivatalos lelkészi jelentés feloldás-kérelme
  jelentes: 'Lelkészi jelentés',
}

const TYPE_TONES: Record<string, { bg: string; text: string; border: string }> = {
  budget: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  accounting: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  inventory: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  jelentes: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
}

interface RequestsSectionProps {
  unlockRequests: UnlockRequest[]
  pendingAssignments: AssignmentRow[]
}

export function RequestsSection({
  unlockRequests,
  pendingAssignments,
}: RequestsSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)

  function handleApprove(req: UnlockRequest) {
    const id = `${req.congregationId}-${req.year}-${req.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await approveUnlockRequest(req.congregationId, req.year, req.type)
      setProcessingId(null)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${req.congregationName} — ${TYPE_LABELS[req.type] || req.type} feloldva. ` +
        `A lelkész értesül a csengőben.`,
      )
    })
  }

  function handleReject(req: UnlockRequest) {
    const id = `${req.congregationId}-${req.year}-${req.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await rejectUnlockRequest(req.congregationId, req.year, req.type)
      setProcessingId(null)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${req.congregationName} — ${TYPE_LABELS[req.type] || req.type} kérelme elutasítva.`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Üdvözlő hangulat — Endre kérése: tiszteletteljes UX */}
      <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/40 to-white p-5">
        <div className="flex items-start gap-3">
          <HandHeart className="size-5 text-rose-600 mt-0.5" />
          <div>
            <h2 className="font-heading text-lg text-slate-800">Beérkezett kérelmek</h2>
            <p className="mt-1 text-sm text-slate-600">
              A gyülekezetek felelős vezetői kérelmeznek itt segítséget. Bírálja el körültekintően —
              minden döntésről a kérelmező értesül a csengőben.
            </p>
          </div>
        </div>
      </div>

      {/* 1. JAVÍTÁSI KÉRELMEK */}
      <Section
        icon={<AlertCircle className="size-4 text-rose-600" />}
        title="Javítási kérelmek"
        subtitle="A lelkész utólagos hibajavítást kér — Önök engedélyezhetik a szerkesztést."
        count={unlockRequests.length}
        accent="rose"
      >
        {unlockRequests.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-8 text-slate-300" />}
            label="Nincs bírálatra váró javítási kérelem."
            hint="Amikor egy lelkész javítást kér, itt jelenik meg."
          />
        ) : (
          <div className="space-y-2">
            {unlockRequests.map((req) => {
              const id = `${req.congregationId}-${req.year}-${req.type}`
              const isProc = isPending && processingId === id
              const tone = TYPE_TONES[req.type] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }
              return (
                <div
                  key={id}
                  className={`rounded-xl border ${tone.border} bg-white p-4 transition hover:shadow-sm`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${tone.bg} ${tone.text} ${tone.border} border`}>
                          {TYPE_LABELS[req.type] || req.type}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-800">
                          {req.congregationName}
                        </span>
                        <span className="text-xs text-slate-400">{req.year}. év</span>
                      </div>
                      {req.reason && (
                        <p className="mt-2 text-sm text-slate-600 italic">
                          „{req.reason}”
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() => handleReject(req)}
                        disabled={isProc}
                      >
                        <X className="mr-1 size-3.5" />
                        Elutasít
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 rounded-full bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleApprove(req)}
                        disabled={isProc}
                      >
                        <Check className="mr-1 size-3.5" />
                        Jóváhagy
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* 2. SZEREPKÖR KÉRELMEK (info — lelkész dönti el) */}
      <Section
        icon={<Clock className="size-4 text-amber-600" />}
        title="Függő szerepkör hozzárendelések"
        subtitle="Önök által kezdeményezett, de a lelkész jóváhagyására váró hozzáférések."
        count={pendingAssignments.length}
        accent="amber"
      >
        {pendingAssignments.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-8 text-slate-300" />}
            label="Nincs függő hozzárendelés."
            hint="Új könyvelő/számvevő hozzárendelés a Szerepkörök fülön indítható."
          />
        ) : (
          <div className="space-y-2">
            {pendingAssignments.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-amber-200 bg-amber-50/30 p-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {a.profile_full_name || a.profile_email || 'Ismeretlen felhasználó'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.role_scope === 'konyvelo' ? 'Könyvelő' : 'Egyházmegyei számvevő'}
                    {a.congregation_name ? ` · ${a.congregation_name}` : ''}
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  Lelkészi jóváhagyásra vár
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. INFORMÁCIÓ */}
      <Section
        icon={<Info className="size-4 text-sky-600" />}
        title="Hozzáférési kérelmek (információ)"
        subtitle="Az adminisztrátori hozzáférési kérelmeket közvetlenül a gyülekezet lelkészei bírálják el."
        count={null}
        accent="sky"
      >
        <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-4 text-sm text-slate-600 leading-relaxed">
          <p>
            <strong className="text-sky-800">Gyülekezeti autonómia.</strong> A rendszergazdai
            hozzáférést a gyülekezet lelkésze hagyja jóvá saját profilján.
            Az egyházmegyei vezetés ezekbe a kérelmekbe nem szól bele,
            de értesítést kap, ha rendszergazda fér hozzá az egyik gyülekezetéhez.
          </p>
        </div>
      </Section>
    </div>
  )
}

function Section({
  icon,
  title,
  subtitle,
  count,
  accent,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  count: number | null
  accent: 'rose' | 'amber' | 'sky' | 'emerald'
  children: React.ReactNode
}) {
  const accentClasses: Record<string, string> = {
    rose: 'border-rose-200 text-rose-700 bg-rose-50',
    amber: 'border-amber-200 text-amber-700 bg-amber-50',
    sky: 'border-sky-200 text-sky-700 bg-sky-50',
    emerald: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  }
  return (
    <section className="card-raised overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/40">
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <h3 className="font-heading text-base text-slate-800 leading-tight">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {count !== null && (
          <Badge className={`border ${accentClasses[accent]}`}>
            {count}
          </Badge>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function EmptyState({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      {icon}
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">{hint}</p>
    </div>
  )
}
