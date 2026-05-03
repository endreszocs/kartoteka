'use client'

/**
 * Admin "Frissítések" fül — broadcast üzenetek küldése és archívum.
 *
 * 3 szekció:
 *  1. Nem elküldött CHANGELOG bejegyzések — egy kattintással kiküldhetők
 *  2. Új üzenet form — kézi broadcast (címzés, tipus, email, hivatkozas)
 *  3. Korábbi broadcastok archív listája
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Bell,
  ChevronDown,
  Check,
  Clock,
  ExternalLink,
  Mail,
  MailWarning,
  MessageSquare,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

import {
  sendBroadcast,
  sendChangelogBroadcast,
  listBroadcasts,
  listChangelogEntries,
  listCongregationsForBroadcast,
  listDiocesesForBroadcast,
  listDistrictsForBroadcast,
} from '@/app/(dashboard)/admin/broadcasts-actions'

import { NewsletterComposeDialog } from './newsletter-compose-dialog'

import {
  BROADCAST_TARGET_SCOPE_LABELS,
  BROADCAST_TARGET_ROLE_LABELS,
  BROADCAST_TIPUS_LABELS,
  RELEASE_CATEGORY_LABELS,
  ROLE_OPTIONS,
  type BroadcastComposeInput,
  type BroadcastRow,
  type BroadcastTargetRole,
  type BroadcastTargetScope,
  type BroadcastTipus,
  type ChangelogEntry,
} from '@/lib/broadcasts/types'

interface CongLite { id: string; name: string; diocese_id: string | null }
interface DioceseLite { id: string; name: string; district_id: string | null }
interface DistrictLite { id: string; name: string }

export function BroadcastsTab() {
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)

  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([])
  const [congregations, setCongregations] = useState<CongLite[]>([])
  const [dioceses, setDioceses] = useState<DioceseLite[]>([])
  const [districts, setDistricts] = useState<DistrictLite[]>([])

  // Compose form
  const [cim, setCim] = useState('')
  const [uzenet, setUzenet] = useState('')
  const [tipus, setTipus] = useState<BroadcastTipus>('info')
  const [hivatkozas, setHivatkozas] = useState('')
  const [scope, setScope] = useState<BroadcastTargetScope>('all')
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>('lelkesz')
  const [selectedCongIds, setSelectedCongIds] = useState<string[]>([])
  const [selectedDioceseIds, setSelectedDioceseIds] = useState<string[]>([])
  const [selectedDistrictIds, setSelectedDistrictIds] = useState<string[]>([])
  const [sendEmail, setSendEmail] = useState(false)
  const [newsletterOpen, setNewsletterOpen] = useState(false)
  const [expandedEntryKeys, setExpandedEntryKeys] = useState<Set<string>>(new Set())

  async function fetchAll() {
    const [e, b, c, d, di] = await Promise.all([
      listChangelogEntries(),
      listBroadcasts(),
      listCongregationsForBroadcast(),
      listDiocesesForBroadcast(),
      listDistrictsForBroadcast(),
    ])
    return { e, b, c, d, di }
  }

  function applyAll(res: Awaited<ReturnType<typeof fetchAll>>) {
    if (res.e.data) setEntries(res.e.data)
    if (res.b.data) setBroadcasts(res.b.data)
    if (res.c.data) setCongregations(res.c.data)
    if (res.d.data) setDioceses(res.d.data)
    if (res.di.data) setDistricts(res.di.data)
  }

  function reload() {
    setLoading(true)
    fetchAll()
      .then(applyAll)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then((res) => {
        if (cancelled) return
        if (res.e.data) setEntries(res.e.data)
        if (res.b.data) setBroadcasts(res.b.data)
        if (res.c.data) setCongregations(res.c.data)
        if (res.d.data) setDioceses(res.d.data)
        if (res.di.data) setDistricts(res.di.data)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const unsentEntries = useMemo(() => entries.filter((e) => !e.alreadySent), [entries])

  function toggleEntry(key: string) {
    setExpandedEntryKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function resetForm() {
    setCim('')
    setUzenet('')
    setTipus('info')
    setHivatkozas('')
    setScope('all')
    setTargetRole('lelkesz')
    setSelectedCongIds([])
    setSelectedDioceseIds([])
    setSelectedDistrictIds([])
    setSendEmail(false)
  }

  function buildComposeInput(): BroadcastComposeInput {
    return {
      cim,
      uzenet,
      tipus,
      hivatkozas: hivatkozas.trim() || null,
      targetScope: scope,
      targetRole: scope === 'role' ? targetRole : null,
      targetCongregationIds: scope === 'congregation' ? selectedCongIds : undefined,
      targetDioceseIds: scope === 'diocese' ? selectedDioceseIds : undefined,
      targetDistrictIds: scope === 'district' ? selectedDistrictIds : undefined,
      sendEmail,
    }
  }

  function handleSend() {
    const input = buildComposeInput()
    startTransition(async () => {
      const result = await sendBroadcast(input)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Üzenet elküldve ${result.recipientCount} címzettnek.`)
      resetForm()
      reload()
    })
  }

  function handleChangelogSend(entry: ChangelogEntry, options?: { force?: boolean }) {
    const force = options?.force ?? false
    if (force) {
      const ok = window.confirm(
        `Az "${entry.title}" frissítést újra kiküldjük minden kiválasztott címzettnek` +
          (sendEmail ? ' (értesítés + e-mail)' : ' (csak értesítés)') +
          '. Folytatja?',
      )
      if (!ok) return
    }
    startTransition(async () => {
      const result = await sendChangelogBroadcast({
        changelogKey: entry.key,
        targetScope: scope,
        targetRole: scope === 'role' ? targetRole : null,
        targetCongregationIds: scope === 'congregation' ? selectedCongIds : undefined,
        targetDioceseIds: scope === 'diocese' ? selectedDioceseIds : undefined,
        targetDistrictIds: scope === 'district' ? selectedDistrictIds : undefined,
        sendEmail,
        hivatkozas: null,
        force,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      const verb = (result as { resent?: boolean }).resent ? 'újra elküldve' : 'közzétéve'
      toast.success(`Frissítés ${verb} ${result.recipientCount} címzettnek.`)
      reload()
    })
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400 animate-pulse">Adatok betöltése…</div>
  }

  return (
    <div className="space-y-6">
      {/* Bevezető */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
        <div className="flex items-start gap-3">
          <Bell className="size-5 text-indigo-600 mt-0.5" />
          <div>
            <h2 className="font-heading text-lg text-slate-800">Frissítések és broadcast üzenetek</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Innen értesíthetjük a lelkipásztorokat, egyházmegyei vezetőket vagy az egész egyházkerületet
              új fejlesztésekről, jogszabályi változásokról vagy egyéb fontos hírekről.
              A fejlesztések napló-bejegyzéseit a Claude automatikusan rögzíti a <code>docs/CHANGELOG.md</code>-ban,
              innen egy kattintással kiküldhetők.
            </p>
          </div>
        </div>
      </div>

      {/* 1. CHANGELOG bejegyzések */}
      <section className="card-raised overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4 bg-indigo-50/40">
          <Sparkles className="size-4 text-indigo-600" />
          <h3 className="font-heading text-base text-slate-800">Frissítések naplója</h3>
          <Badge className="bg-white text-slate-700 border-slate-200">
            {entries.length} összesen
          </Badge>
          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
            {unsentEntries.length} kiküldésre vár
          </Badge>
          <Button
            size="sm"
            onClick={() => setNewsletterOpen(true)}
            disabled={unsentEntries.length === 0}
            className="ml-auto rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm gap-1.5"
          >
            <Sparkles className="size-3.5" />
            Fejlesztési hírlevél
          </Button>
        </header>
        <div className="p-5">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              Még nincs rögzített CHANGELOG bejegyzés.
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {entries.map((e) => (
                <ChangelogEntryCard
                  key={e.key}
                  entry={e}
                  onSend={() => handleChangelogSend(e)}
                  onResend={() => handleChangelogSend(e, { force: true })}
                  isPending={isPending}
                  scopeLabel={describeScope(scope, targetRole, {
                    congs: selectedCongIds.length,
                    dioceses: selectedDioceseIds.length,
                    districts: selectedDistrictIds.length,
                  })}
                  sendEmail={sendEmail}
                  expanded={expandedEntryKeys.has(e.key)}
                  onToggle={() => toggleEntry(e.key)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. Új üzenet form */}
      <section className="card-raised overflow-hidden">
        <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 bg-slate-50/60">
          <Send className="size-4 text-slate-700" />
          <h3 className="font-heading text-base text-slate-800">Új broadcast üzenet</h3>
        </header>
        <div className="p-5 space-y-4">
          <ComposeForm
            cim={cim} setCim={setCim}
            uzenet={uzenet} setUzenet={setUzenet}
            tipus={tipus} setTipus={setTipus}
            hivatkozas={hivatkozas} setHivatkozas={setHivatkozas}
            sendEmail={sendEmail} setSendEmail={setSendEmail}
          />
          <TargetPicker
            scope={scope} setScope={setScope}
            targetRole={targetRole} setTargetRole={setTargetRole}
            congregations={congregations}
            dioceses={dioceses}
            districts={districts}
            selectedCongIds={selectedCongIds} setSelectedCongIds={setSelectedCongIds}
            selectedDioceseIds={selectedDioceseIds} setSelectedDioceseIds={setSelectedDioceseIds}
            selectedDistrictIds={selectedDistrictIds} setSelectedDistrictIds={setSelectedDistrictIds}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isPending}
            >
              Mégse
            </Button>
            <Button
              onClick={handleSend}
              disabled={isPending || !cim.trim() || !uzenet.trim()}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              <Send className="size-4" />
              Elküldés
            </Button>
          </div>
        </div>
      </section>

      {/* 3. Archívum */}
      <section className="card-raised overflow-hidden">
        <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 bg-slate-50/60">
          <Clock className="size-4 text-slate-700" />
          <h3 className="font-heading text-base text-slate-800">Korábbi üzenetek</h3>
          <span className="ml-auto text-xs text-slate-500">{broadcasts.length} db</span>
        </header>
        <div className="p-5 space-y-2">
          {broadcasts.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Még nincs elküldött üzenet.</p>
          ) : (
            broadcasts.map((b) => <BroadcastHistoryItem key={b.id} broadcast={b} />)
          )}
        </div>
      </section>

      {/* Fejlesztési hírlevél szerkesztő */}
      <NewsletterComposeDialog
        open={newsletterOpen}
        onOpenChange={setNewsletterOpen}
        unsentEntries={unsentEntries}
        onSent={reload}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Részek
// ---------------------------------------------------------------------------

function ChangelogEntryCard({
  entry,
  onSend,
  onResend,
  isPending,
  scopeLabel,
  sendEmail,
  expanded,
  onToggle,
}: {
  entry: ChangelogEntry
  onSend: () => void
  onResend: () => void
  isPending: boolean
  scopeLabel: string
  sendEmail: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const status = entry.broadcastStatus
  const cardClass = entry.alreadySent
    ? 'border-slate-200 bg-white'
    : 'border-indigo-200 bg-indigo-50/30'

  return (
    <div className={`rounded-xl border p-4 transition-colors ${cardClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-start gap-3 text-left"
        >
          <span className="rounded-lg bg-white px-2 py-1 text-xs font-mono text-indigo-700 ring-1 ring-indigo-100 shrink-0">
            {entry.date}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <span className="font-semibold text-slate-800">{entry.title}</span>
              <ChevronDown
                className={`mt-0.5 size-4 shrink-0 text-slate-400 transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {entry.version && (
                <Badge variant="outline" className="border-slate-200">v{entry.version}</Badge>
              )}
              {entry.category && (
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                  {RELEASE_CATEGORY_LABELS[entry.category]}
                </Badge>
              )}
              {entry.targetsHint && <span>{entry.targetsHint}</span>}
            </span>
            <span className="mt-3 flex flex-wrap items-center gap-2">
              <DeliveryBadge
                icon={entry.alreadySent ? Check : MessageSquare}
                label={entry.alreadySent ? 'Üzenet elküldve' : 'Üzenet nincs elküldve'}
                tone={entry.alreadySent ? 'success' : 'muted'}
              />
              <EmailDeliveryBadge entry={entry} />
              {status && (
                <span className="text-[11px] text-slate-500">
                  {formatBroadcastScope(status)} · {status.recipientCount} címzett · {formatDateTime(status.sentAt)}
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          {!entry.alreadySent ? (
            <>
              <Button
                size="sm"
                onClick={onSend}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              >
                <Send className="size-3.5" />
                Közzététel
              </Button>
              <span className="text-[10px] text-slate-400">
                {scopeLabel}{sendEmail ? ' + email' : ''}
              </span>
            </>
          ) : (
            <>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Közzétéve
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={onResend}
                disabled={isPending}
                className="gap-1.5 mt-1"
                title="Újra elküldjük a frissítést a kiválasztott címzetteknek (új értesítés + email)"
              >
                <Send className="size-3.5" />
                Újraküldés
              </Button>
              <span className="text-[10px] text-slate-400">
                {scopeLabel}{sendEmail ? ' + email' : ''}
              </span>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <pre className="whitespace-pre-wrap text-xs text-slate-600 leading-relaxed font-sans">
            {entry.bodyMarkdown || 'Ehhez a bejegyzéshez nincs részletes leírás.'}
          </pre>
        </div>
      )}
    </div>
  )
}

function DeliveryBadge({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon
  label: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    muted: 'bg-slate-100 text-slate-600 border-slate-200',
  }[tone]

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${toneClass}`}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}

function EmailDeliveryBadge({ entry }: { entry: ChangelogEntry }) {
  const status = entry.broadcastStatus
  if (!entry.alreadySent) {
    return (
      <DeliveryBadge
        icon={Mail}
        label="Email nincs elküldve"
        tone="muted"
      />
    )
  }

  if (!status?.sendEmail) {
    return (
      <DeliveryBadge
        icon={Mail}
        label="Email nem volt kérve"
        tone="muted"
      />
    )
  }

  if (status.emailError) {
    return (
      <DeliveryBadge
        icon={MailWarning}
        label="Email hiba"
        tone="danger"
      />
    )
  }

  if (status.emailSentAt) {
    return (
      <DeliveryBadge
        icon={Mail}
        label={`Email elküldve · ${formatDateTime(status.emailSentAt)}`}
        tone="success"
      />
    )
  }

  return (
    <DeliveryBadge
      icon={Clock}
      label="Email függőben"
      tone="warning"
    />
  )
}

function ComposeForm({
  cim, setCim,
  uzenet, setUzenet,
  tipus, setTipus,
  hivatkozas, setHivatkozas,
  sendEmail, setSendEmail,
}: {
  cim: string; setCim: (v: string) => void
  uzenet: string; setUzenet: (v: string) => void
  tipus: BroadcastTipus; setTipus: (v: BroadcastTipus) => void
  hivatkozas: string; setHivatkozas: (v: string) => void
  sendEmail: boolean; setSendEmail: (v: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Cím</Label>
        <Input
          value={cim}
          onChange={(e) => setCim(e.target.value)}
          placeholder="Pl.: Új funkció: automata számla-párosítás"
          maxLength={120}
          className="mt-1"
        />
      </div>
      <div>
        <Label>Üzenet</Label>
        <Textarea
          value={uzenet}
          onChange={(e) => setUzenet(e.target.value)}
          placeholder="A részletes üzenet szövege…"
          rows={5}
          className="mt-1"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Típus</Label>
          <select
            value={tipus}
            onChange={(e) => setTipus(e.target.value as BroadcastTipus)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {(Object.keys(BROADCAST_TIPUS_LABELS) as BroadcastTipus[]).map((t) => (
              <option key={t} value={t}>{BROADCAST_TIPUS_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Hivatkozás <span className="text-slate-400 font-normal">(opcionális)</span></Label>
          <Input
            value={hivatkozas}
            onChange={(e) => setHivatkozas(e.target.value)}
            placeholder="pl. /penzugy"
            className="mt-1"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="mt-1 size-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">
          <span className="font-medium inline-flex items-center gap-1.5">
            <Mail className="size-3.5" />
            Email értesítés is küldése
          </span>
          <span className="block text-xs text-slate-500">
            A címzettek a csengőben is látják, emellett email-ben is megkapják (Resend integráció).
          </span>
        </span>
      </label>
    </div>
  )
}

function TargetPicker({
  scope, setScope,
  targetRole, setTargetRole,
  congregations, dioceses, districts,
  selectedCongIds, setSelectedCongIds,
  selectedDioceseIds, setSelectedDioceseIds,
  selectedDistrictIds, setSelectedDistrictIds,
}: {
  scope: BroadcastTargetScope; setScope: (v: BroadcastTargetScope) => void
  targetRole: BroadcastTargetRole; setTargetRole: (v: BroadcastTargetRole) => void
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  selectedCongIds: string[]; setSelectedCongIds: (v: string[]) => void
  selectedDioceseIds: string[]; setSelectedDioceseIds: (v: string[]) => void
  selectedDistrictIds: string[]; setSelectedDistrictIds: (v: string[]) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-slate-600" />
        <Label className="mb-0">Címzettek</Label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
        {(Object.keys(BROADCAST_TARGET_SCOPE_LABELS) as BroadcastTargetScope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              scope === s
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
            }`}
          >
            {BROADCAST_TARGET_SCOPE_LABELS[s]}
          </button>
        ))}
      </div>

      {scope === 'role' && (
        <div>
          <Label>Szerepkör</Label>
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as BroadcastTargetRole)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {scope === 'congregation' && (
        <MultiSelectList
          label="Gyülekezet(ek) kiválasztása"
          items={congregations.map((c) => ({ id: c.id, label: c.name }))}
          selected={selectedCongIds}
          onChange={setSelectedCongIds}
        />
      )}

      {scope === 'diocese' && (
        <MultiSelectList
          label="Egyházmegyé(k) kiválasztása"
          items={dioceses.map((d) => ({ id: d.id, label: d.name }))}
          selected={selectedDioceseIds}
          onChange={setSelectedDioceseIds}
        />
      )}

      {scope === 'district' && (
        <MultiSelectList
          label="Egyházkerület(ek) kiválasztása"
          items={districts.map((d) => ({ id: d.id, label: d.name }))}
          selected={selectedDistrictIds}
          onChange={setSelectedDistrictIds}
        />
      )}
    </div>
  )
}

function MultiSelectList({
  label,
  items,
  selected,
  onChange,
}: {
  label: string
  items: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Keresés…"
        className="mt-1 h-9"
      />
      <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-slate-400 italic">Nincs találat.</p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="size-4 rounded border-slate-300"
              />
              <span className="flex-1 truncate">{item.label}</span>
            </label>
          ))
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">Kiválasztva: {selected.length}</p>
    </div>
  )
}

function BroadcastHistoryItem({ broadcast }: { broadcast: BroadcastRow }) {
  const sentDate = new Date(broadcast.sent_at).toLocaleString('hu-HU')
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={tipusBadgeClass(broadcast.tipus)}>{BROADCAST_TIPUS_LABELS[broadcast.tipus]}</Badge>
            <p className="font-medium text-sm text-slate-800 truncate">{broadcast.cim}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {sentDate} · {BROADCAST_TARGET_SCOPE_LABELS[broadcast.target_scope]} · {broadcast.recipient_count} címzett
            {broadcast.send_email && (
              broadcast.email_sent_at
                ? <> · <Mail className="inline size-3 text-emerald-600" /> email elküldve</>
                : broadcast.email_error
                  ? <> · <MailWarning className="inline size-3 text-rose-600" /> email hiba</>
                  : <> · <Mail className="inline size-3 text-slate-400" /> email függő</>
            )}
          </p>
          {broadcast.email_error && (
            <p className="mt-1 text-xs text-rose-600 italic">Email hiba: {broadcast.email_error}</p>
          )}
          {broadcast.hivatkozas && (
            <a
              href={broadcast.hivatkozas}
              className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              {broadcast.hivatkozas}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function tipusBadgeClass(t: BroadcastTipus): string {
  const map: Record<BroadcastTipus, string> = {
    info: 'bg-sky-100 text-sky-700 border-sky-200',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    danger: 'bg-rose-100 text-rose-700 border-rose-200',
    release: 'bg-violet-100 text-violet-700 border-violet-200',
  }
  return `${map[t]} border`
}

function describeScope(
  scope: BroadcastTargetScope,
  role: BroadcastTargetRole,
  counts: { congs: number; dioceses: number; districts: number },
): string {
  switch (scope) {
    case 'all':
      return 'Mindenkinek'
    case 'role':
      return `Szerep: ${role}`
    case 'congregation':
      return `${counts.congs} gyülekezet`
    case 'diocese':
      return `${counts.dioceses} egyházmegye`
    case 'district':
      return `${counts.districts} egyházkerület`
  }
}

function formatBroadcastScope(status: NonNullable<ChangelogEntry['broadcastStatus']>): string {
  if (status.targetScope === 'role' && status.targetRole) {
    return BROADCAST_TARGET_ROLE_LABELS[status.targetRole]
  }

  return BROADCAST_TARGET_SCOPE_LABELS[status.targetScope]
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
