'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'

import {
  getCongregationPastors,
  type CongregationPastorRow,
  getOpenTransfer,
  initiateCongregationTransfer,
  approveTransfer,
  addTransferRemark,
  completeTransfer,
  type OpenTransfer,
} from '@/app/(dashboard)/congregation/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

/**
 * PastorTransferManager — a „Lelkészi szolgálati napló" (read-only lista) +
 * a „Gyülekezet átadása másik lelkésznek" panel (F3a indítás / F3b felülvizsgálat /
 * F3c véglegesítés) ÖNÁLLÓ komponensként.
 *
 * A `congregation-dialog-v2.tsx` „Lelkészek" fő-tabjának 1:1 kiemelése:
 * saját state, saját betöltés (mountkor + minden action után `loadData`),
 * saját toast-ok (sonner). A szerver-actionök változatlanul a meglévő
 * `@/app/(dashboard)/congregation/actions` modulból jönnek.
 *
 * A megjelenés AZONOS a dialog-v2 jelenlegi paneljével (a className-ek másolva).
 */
export function PastorTransferManager({ congregationId }: { congregationId: string }) {
  const activeCongregationId = congregationId

  // 2026-06-05: lelkészi szolgálati napló
  const [pastors, setPastors] = useState<CongregationPastorRow[]>([])
  const [pastorsSchemaReady, setPastorsSchemaReady] = useState(true)
  // 2026-06-05: gyülekezet-átadás indítása
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring] = useState(false)
  // 2026-06-05 (F3b): nyitott átadás felülvizsgálata
  const [openTransfer, setOpenTransfer] = useState<OpenTransfer | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  // 2026-06-05 (F3c): véglegesítés (bejövő lelkész)
  const [incomingEmail, setIncomingEmail] = useState('')
  const [completing, setCompleting] = useState(false)

  // A dialog-v2 loadData mintájára, de csak a lelkész-részre szűkítve:
  // a naplót (getCongregationPastors) + a nyitott átadást (getOpenTransfer) tölti be.
  const loadData = useCallback(async () => {
    if (!congregationId) return

    const [pastorResult, transferResult] = await Promise.all([
      getCongregationPastors(congregationId),
      getOpenTransfer(congregationId),
    ])

    setPastors(pastorResult.rows || [])
    setPastorsSchemaReady(pastorResult.schemaReady !== false)
    if (pastorResult.error) toast.error(pastorResult.error)
    setOpenTransfer(transferResult.transfer)
  }, [congregationId])

  useEffect(() => {
    if (!congregationId) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadData()
    })
    return () => {
      cancelled = true
    }
  }, [congregationId, loadData])

  async function handleInitiateTransfer() {
    setTransferring(true)
    try {
      const res = await initiateCongregationTransfer({
        congregationId: activeCongregationId,
        reason: transferReason,
      })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      if (res.alreadyOpen) {
        toast.info('Ehhez a gyülekezethez már folyamatban van egy átadás.')
      } else {
        toast.success(
          res.auditorsNotified && res.auditorsNotified > 0
            ? 'Átadás elindítva — a rendszergazda és az egyházmegyei számvevő értesítve.'
            : 'Átadás elindítva — a rendszergazda értesítve (az egyházmegyében nincs számvevő).',
        )
      }
      await loadData()
    } finally {
      setTransferring(false)
    }
  }

  async function handleApproveTransfer() {
    if (!openTransfer) return
    setReviewBusy(true)
    try {
      const res = await approveTransfer(openTransfer.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.status === 'ready'
          ? 'Jóváhagyva — az átadás készen áll a véglegesítésre.'
          : 'A jóváhagyásod rögzítve. A másik fél jóváhagyására várunk.',
      )
      await loadData()
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleAddRemark() {
    if (!openTransfer || !remarkText.trim()) return
    setReviewBusy(true)
    try {
      const res = await addTransferRemark(openTransfer.id, remarkText)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Meghagyás rögzítve — az átadás a rendezésig blokkolva.')
      setRemarkText('')
      await loadData()
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleCompleteTransfer() {
    if (!openTransfer || !incomingEmail.trim()) return
    setCompleting(true)
    try {
      const res = await completeTransfer({
        transferId: openTransfer.id,
        incomingEmail: incomingEmail,
        congregationId: activeCongregationId,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.needsRegistration) {
        toast.info('A bejövő lelkész még nincs a rendszerben — meghívó emailt küldtünk. Miután regisztrált és jóváhagytad a hozzáférését, véglegesítheted.')
      } else {
        toast.success('Az átadás véglegesítve — az új lelkész hozzáfér a gyülekezethez.')
        setIncomingEmail('')
        await loadData()
      }
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Lelkészi szolgálati napló">
        <p className="mb-3 text-sm text-slate-600">
          A gyülekezetben szolgáló (és korábban szolgált) lelkészek, a szolgálat
          pontos időpontjaival. A lista automatikusan bővül a jóváhagyásokkor és a
          lelkészcsere-átadásokkor.
        </p>
        {!pastorsSchemaReady ? (
          <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
            A lelkészi napló adatbázis-táblája még nincs telepítve. Futtasd le a
            <code className="mx-1">2026-06-05e-congregation-pastor-history.sql</code> fájlt.
          </div>
        ) : pastors.length === 0 ? (
          <p className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-500">
            Még nincs rögzített lelkészi szolgálat ehhez a gyülekezethez.
          </p>
        ) : (
          <ul className="space-y-2">
            {pastors.map((p) => {
              const fmt = (d: string | null) =>
                d
                  ? new Date(d).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
                  : null
              const isCurrent = !p.ended_at
              return (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-[1rem] border px-3 py-2.5 ${
                    isCurrent ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{p.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {fmt(p.started_at)} –{' '}
                      {isCurrent ? (
                        <span className="font-medium text-emerald-700">jelenleg is szolgál</span>
                      ) : (
                        <>
                          {fmt(p.ended_at)}
                          {p.end_reason === 'transfer' && ' · átadás'}
                          {p.end_reason === 'deletion' && ' · fiók törölve'}
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isCurrent ? 'Aktív' : 'Korábbi'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Gyülekezet átadása másik lelkésznek">
        {openTransfer ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-3 text-amber-900">
              <p className="font-semibold">Folyamatban lévő átadás</p>
              <p className="mt-1 text-amber-800">
                Indította: <strong>{openTransfer.from_full_name || 'a lelkész'}</strong>
                {' · '}Állapot:{' '}
                <strong>
                  {(({
                    requested: 'felülvizsgálatra vár',
                    review: 'felülvizsgálat alatt',
                    blocked_by_remarks: 'meghagyások miatt blokkolva',
                    ready: 'jóváhagyva — véglegesítésre kész',
                  }) as Record<string, string>)[openTransfer.status] || openTransfer.status}
                </strong>
              </p>
              {openTransfer.reason && (
                <p className="mt-1 text-amber-800">Indok: {openTransfer.reason}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${openTransfer.admin_approved_at ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {openTransfer.admin_approved_at ? '✓ Rendszergazda jóváhagyta' : 'Rendszergazda: várakozik'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${openTransfer.auditor_approved_at ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {openTransfer.auditor_approved_at ? '✓ Számvevő jóváhagyta' : 'Számvevő: várakozik'}
              </span>
            </div>

            {openTransfer.remarks.length > 0 && (
              <div className="rounded-[1rem] border border-rose-200 bg-rose-50/50 p-3">
                <p className="mb-1 text-xs font-semibold text-rose-800">Meghagyások</p>
                <ul className="space-y-1.5">
                  {openTransfer.remarks.map((r) => (
                    <li key={r.id} className="text-xs text-rose-900">
                      <span className="font-medium">
                        {r.author_role === 'admin' ? 'Rendszergazda' : 'Számvevő'}:
                      </span>{' '}
                      {r.szoveg}
                      {r.resolved && <span className="ml-1 text-emerald-700">(rendezve)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openTransfer.my_review_role && openTransfer.status !== 'ready' ? (
              <div className="space-y-2 rounded-[1rem] border border-sky-200 bg-sky-50/50 p-3">
                <p className="text-xs text-sky-900">
                  Te{' '}
                  <strong>
                    {openTransfer.my_review_role === 'admin' ? 'rendszergazdaként' : 'számvevőként'}
                  </strong>{' '}
                  vizsgálhatod felül. Nézd át a gyülekezet adatait a többi fülön, majd hagyd
                  jóvá, vagy rögzíts meghagyást.
                </p>
                <Button
                  type="button"
                  onClick={handleApproveTransfer}
                  disabled={reviewBusy}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Áttekintés rendben — jóváhagyom
                </Button>
                <Field label="Meghagyás / észrevétel (ha valami nincs rendben)">
                  <textarea
                    value={remarkText}
                    onChange={(e) => setRemarkText(e.target.value)}
                    rows={2}
                    placeholder="pl. A 2024-es számadás hiányzik a pénzügynél."
                    className="w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm"
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddRemark}
                  disabled={reviewBusy || !remarkText.trim()}
                >
                  Meghagyás rögzítése
                </Button>
              </div>
            ) : openTransfer.status === 'ready' ? (
              openTransfer.my_review_role === 'admin' ? (
                <div className="space-y-2 rounded-[1rem] border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="text-xs text-emerald-900">
                    Mindkét fél jóváhagyta. Add meg a <strong>bejövő lelkész email-címét</strong>,
                    és véglegesítsd az átadást. Ha még nincs a rendszerben, meghívó emailt küldünk neki.
                  </p>
                  <Field label="Bejövő lelkész email-címe">
                    <Input
                      type="email"
                      value={incomingEmail}
                      onChange={(e) => setIncomingEmail(e.target.value)}
                      placeholder="uj.lelkesz@example.com"
                    />
                  </Field>
                  <Button
                    type="button"
                    onClick={handleCompleteTransfer}
                    disabled={completing || !incomingEmail.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {completing ? 'Véglegesítés…' : 'Átadás véglegesítése'}
                  </Button>
                </div>
              ) : (
                <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-emerald-900">
                  Mindkét fél jóváhagyta. Az átadást a <strong>rendszergazda</strong> véglegesíti — ő
                  adja meg az új lelkésznek a hozzáférést.
                </div>
              )
            ) : (
              <p className="text-xs text-slate-500">
                A felülvizsgálók (rendszergazda + egyházmegyei számvevő) jóváhagyására vár.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Ha másik gyülekezetbe távozol, itt indíthatod el a gyülekezet
              <strong> átadását</strong>. Az indítással a <strong>rendszergazda</strong> és az
              egyházmegye <strong>számvevője</strong> értesül; átnézik a gyülekezet adatait,
              és jóváhagyják az átadást vagy meghagyásokat rögzítenek. A gyülekezet adatai
              nem vesznek el — csak a felelős lelkész változik.
            </p>
            <Field label="Indok / megjegyzés (opcionális)">
              <textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                placeholder="pl. Másik gyülekezetbe helyeztek át 2026 szeptemberétől."
                className="w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </Field>
            <div className="mt-3">
              <Button
                type="button"
                onClick={handleInitiateTransfer}
                disabled={transferring}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {transferring ? 'Indítás…' : 'Gyülekezet átadásának indítása'}
              </Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}

// ── Al-komponensek (a dialog-v2-ből 1:1 másolva, hogy a panel önálló legyen) ──

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-raised p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
