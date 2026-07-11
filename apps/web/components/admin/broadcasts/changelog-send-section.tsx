'use client'

/**
 * Fejlesztések kiküldése — CHANGELOG-bejegyzések értesítésként / hírlevélként.
 *
 * 2026-07-11 admin-redesign + KÖTELEZŐ BUGFIX:
 *  - a „Mind kijelölése" alapból CSAK a még el nem küldött bejegyzéseket
 *    jelöli ki (korábban a már elküldötteket is, amiket a tömeges küldés
 *    némán force-újraküldött);
 *  - a megerősítő szöveg szétbontja: X új kiküldés + Y újraküldés, és
 *    explicit leírja az újraküldés következményét;
 *  - újraküldés csak tudatos, egyenkénti kijelöléssel (vagy az Újraküldés
 *    gombbal) lehetséges.
 *  - A célzás-állapot a szekció SAJÁTJA — nem szivárog át az „Új üzenet"
 *    űrlapba és vissza.
 */

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  ChevronDown,
  Clock,
  Inbox,
  RotateCcw,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'

import { sendChangelogBroadcast } from '@/app/(dashboard)/admin/broadcasts-actions'
import {
  RELEASE_CATEGORY_LABELS,
  type ChangelogEntry,
} from '@/lib/broadcasts/types'

import {
  DEFAULT_TARGET,
  TargetPicker,
  describeTarget,
  targetIsIncomplete,
  targetToActionArgs,
  type CongLite,
  type DioceseLite,
  type DistrictLite,
  type TargetSelection,
} from './broadcast-target-picker'
import { EmailOptIn } from './email-opt-in'
import { EmailStatusBadge, NotificationStatusBadge } from './delivery-badges'
import { formatBroadcastScope, formatDateTime } from './format'

export function ChangelogSendSection({
  entries,
  congregations,
  dioceses,
  districts,
  onReload,
  onOpenNewsletter,
}: {
  entries: ChangelogEntry[]
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  onReload: () => void
  onOpenNewsletter: () => void
}) {
  const [isPending, startTransition] = useTransition()

  // Szekció-saját címzés (nem közös az „Új üzenet" űrlappal)
  const [target, setTarget] = useState<TargetSelection>(DEFAULT_TARGET)
  const [sendEmail, setSendEmail] = useState(false)
  const [targetingOpen, setTargetingOpen] = useState(false)

  const [expandedEntryKeys, setExpandedEntryKeys] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [confirmState, setConfirmState] = useState<{
    title: string
    description: ReactNode
    confirmLabel: string
    onYes: () => void
  } | null>(null)

  const activeEntries = useMemo(() => entries.filter((e) => !e.readMarked), [entries])
  const archivedEntries = useMemo(() => entries.filter((e) => e.readMarked), [entries])
  const unsentEntries = useMemo(
    () => entries.filter((e) => !e.alreadySent && !e.readMarked),
    [entries],
  )

  const scopeLabel = describeTarget(target)
  const incompleteTarget = targetIsIncomplete(target)

  function toggleEntry(key: string) {
    setExpandedEntryKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelected(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** BUGFIX: alapból csak a még el nem küldött bejegyzéseket jelöljük ki. */
  function selectAllUnsent() {
    setSelectedKeys(new Set(unsentEntries.map((e) => e.key)))
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  function handleBulkSend() {
    if (selectedKeys.size === 0) return
    const selectedEntries = entries.filter((e) => selectedKeys.has(e.key))
    const newOnes = selectedEntries.filter((e) => !e.alreadySent)
    const resends = selectedEntries.filter((e) => e.alreadySent)

    setConfirmState({
      title: 'Kijelölt frissítések kiküldése',
      description: (
        <div className="space-y-2">
          <p>
            Címzettek: <strong>{scopeLabel}</strong>
            {sendEmail ? ' (értesítés + e-mail)' : ' (csak értesítés)'}.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {newOnes.length > 0 && (
              <li>
                <strong>{newOnes.length} új frissítés</strong> kiküldése.
              </li>
            )}
            {resends.length > 0 && (
              <li>
                <strong>{resends.length} már korábban elküldött frissítés újraküldése.</strong>
              </li>
            )}
          </ul>
          {resends.length > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Figyelem: az újraküldött frissítésekről a korábbi címzettek <strong>ismét</strong>{' '}
              kapnak értesítést{sendEmail ? ' és e-mailt' : ''} — ez duplán jelenik meg náluk.
            </p>
          )}
          {selectedEntries.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Minden kijelölt frissítés külön üzenetként megy ki ({selectedEntries.length} üzenet).
              Több bejegyzéshez a <strong>hírlevél</strong> a kíméletesebb: egyetlen szép e-mailben
              foglalja össze őket.
            </p>
          )}
        </div>
      ),
      confirmLabel:
        resends.length > 0 ? 'Kiküldés (újraküldéssel együtt)' : 'Kiküldés',
      onYes: runBulkSend,
    })
  }

  function runBulkSend() {
    if (selectedKeys.size === 0) return
    startTransition(async () => {
      let totalRecipients = 0
      let succeeded = 0
      let failed = 0
      for (const e of entries.filter((x) => selectedKeys.has(x.key))) {
        const result = await sendChangelogBroadcast({
          changelogKey: e.key,
          ...targetToActionArgs(target),
          sendEmail,
          hivatkozas: null,
          force: e.alreadySent, // már elküldöttet csak tudatos kijelöléssel lehet ide betenni
        })
        if ('error' in result && result.error) {
          failed++
          toast.error(`„${e.title}": ${result.error}`)
        } else {
          succeeded++
          totalRecipients += result.recipientCount || 0
        }
      }
      if (succeeded > 0) {
        toast.success(`${succeeded} frissítés elküldve ${totalRecipients} címzettnek.`)
      }
      if (failed > 0) {
        toast.error(`${failed} frissítés küldése sikertelen.`)
      }
      clearSelection()
      onReload()
    })
  }

  function handleSingleSend(entry: ChangelogEntry, options?: { force?: boolean }) {
    const force = options?.force ?? false
    if (force) {
      setConfirmState({
        title: 'Frissítés újraküldése',
        description: (
          <div className="space-y-2">
            <p>
              Az „<strong>{entry.title}</strong>” frissítést újra kiküldjük:{' '}
              <strong>{scopeLabel}</strong>
              {sendEmail ? ' (értesítés + e-mail)' : ' (csak értesítés)'}.
            </p>
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              A korábbi címzettek <strong>ismét</strong> kapnak értesítést
              {sendEmail ? ' és e-mailt' : ''} erről a frissítésről.
            </p>
          </div>
        ),
        confirmLabel: 'Újraküldés',
        onYes: () => runSingleSend(entry, true),
      })
      return
    }
    runSingleSend(entry, false)
  }

  function runSingleSend(entry: ChangelogEntry, force: boolean) {
    startTransition(async () => {
      const result = await sendChangelogBroadcast({
        changelogKey: entry.key,
        ...targetToActionArgs(target),
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
      onReload()
    })
  }

  const selectedResendCount = entries.filter(
    (e) => selectedKeys.has(e.key) && e.alreadySent,
  ).length

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="border-b border-border bg-muted/40 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <h3 className="font-heading text-base text-foreground">Fejlesztések kiküldése</h3>
          <Badge className="border-border bg-card text-muted-foreground">
            {entries.length} összesen
          </Badge>
          {unsentEntries.length > 0 && (
            <StatusBadge intent="warning">{unsentEntries.length} kiküldésre vár</StatusBadge>
          )}
          {selectedKeys.size > 0 && (
            <StatusBadge intent="info">{selectedKeys.size} kijelölve</StatusBadge>
          )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Az új fejlesztéseket a rendszer a fejlesztési naplóból (CHANGELOG) olvassa ki. Jelölj ki
          egyet vagy többet és küldd ki értesítésként, vagy állíts össze belőlük egy szép{' '}
          <strong>hírlevelet</strong> (ott magadnak is küldhetsz tesztet).
        </p>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Címzés — összecsukható, hogy a lista maradjon a főszereplő */}
        <div className="overflow-hidden rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setTargetingOpen((v) => !v)}
            aria-expanded={targetingOpen}
            className="flex min-h-11 w-full items-center gap-2 bg-muted/40 px-3 py-2.5 text-left transition hover:bg-muted/60"
          >
            <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-medium">Címzés:</span>{' '}
              <span className="text-muted-foreground">
                {scopeLabel}
                {sendEmail ? ' · értesítés + e-mail' : ' · csak értesítés'}
              </span>
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${targetingOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {targetingOpen && (
            <div className="space-y-3 border-t border-border p-3">
              <TargetPicker
                value={target}
                onChange={setTarget}
                congregations={congregations}
                dioceses={dioceses}
                districts={districts}
              />
              <EmailOptIn checked={sendEmail} onChange={setSendEmail} />
            </div>
          )}
        </div>

        {incompleteTarget && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            A kiválasztott címzés-módhoz még nincs kijelölt{' '}
            {target.scope === 'congregation'
              ? 'gyülekezet'
              : target.scope === 'diocese'
                ? 'egyházmegye'
                : 'egyházkerület'}{' '}
            — a küldés addig nem indítható.
          </p>
        )}

        {/* Műveletsor */}
        {activeEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {unsentEntries.length > 0 && (
              <Button
                variant="outline"
                onClick={selectedKeys.size > 0 ? clearSelection : selectAllUnsent}
                disabled={isPending}
              >
                {selectedKeys.size > 0
                  ? 'Kijelölés törlése'
                  : 'Még nem küldöttek kijelölése'}
              </Button>
            )}
            <Button
              onClick={handleBulkSend}
              disabled={isPending || selectedKeys.size === 0 || incompleteTarget}
              className="gap-1.5"
            >
              <Send className="size-3.5" aria-hidden />
              Kijelöltek küldése{sendEmail ? ' + e-mail' : ''}
            </Button>
            {selectedResendCount > 0 && (
              <StatusBadge intent="warning" icon={RotateCcw}>
                {selectedResendCount} újraküldés a kijelöltek közt
              </StatusBadge>
            )}
            <Button
              variant="outline"
              onClick={onOpenNewsletter}
              disabled={unsentEntries.length === 0}
              className="gap-1.5 sm:ml-auto"
            >
              <Sparkles className="size-3.5 text-primary" aria-hidden />
              Hírlevél összeállítása
            </Button>
          </div>
        )}

        {activeEntries.length === 0 ? (
          <AdminEmptyState
            icon={entries.length === 0 ? Inbox : Sparkles}
            title={
              entries.length === 0
                ? 'Még nincs rögzített fejlesztési bejegyzés'
                : 'Nincs kiküldésre váró frissítés'
            }
            hint={
              entries.length === 0
                ? 'Új CHANGELOG-bejegyzés után itt jelennek meg a kiküldhető frissítések.'
                : 'A korábbi bejegyzések archiváltak — lent visszanézhetők.'
            }
          />
        ) : (
          <div className="grid gap-3 2xl:grid-cols-2">
            {activeEntries.map((e) => (
              <ChangelogEntryCard
                key={e.key}
                entry={e}
                selected={selectedKeys.has(e.key)}
                onToggleSelected={() => toggleSelected(e.key)}
                onSend={() => handleSingleSend(e)}
                onResend={() => handleSingleSend(e, { force: true })}
                isPending={isPending}
                sendDisabled={incompleteTarget}
                scopeLabel={scopeLabel}
                sendEmail={sendEmail}
                expanded={expandedEntryKeys.has(e.key)}
                onToggle={() => toggleEntry(e.key)}
              />
            ))}
          </div>
        )}

        {archivedEntries.length > 0 && (
          <ArchivedEntriesGroup
            entries={archivedEntries}
            expandedKeys={expandedEntryKeys}
            onToggle={toggleEntry}
          />
        )}
      </div>

      <AdminConfirmDialog
        open={!!confirmState}
        onOpenChange={(o) => !o && setConfirmState(null)}
        title={confirmState?.title || ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel || 'Megerősítés'}
        loading={isPending}
        onConfirm={() => {
          confirmState?.onYes()
          setConfirmState(null)
        }}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------

function ChangelogEntryCard({
  entry,
  selected,
  onToggleSelected,
  onSend,
  onResend,
  isPending,
  sendDisabled,
  scopeLabel,
  sendEmail,
  expanded,
  onToggle,
}: {
  entry: ChangelogEntry
  selected: boolean
  onToggleSelected: () => void
  onSend: () => void
  onResend: () => void
  isPending: boolean
  sendDisabled: boolean
  scopeLabel: string
  sendEmail: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const status = entry.broadcastStatus
  // Kijelölt + már elküldött = tudatos ÚJRAKÜLDÉS → borostyán jelzés
  const cardClass = selected
    ? entry.alreadySent
      ? 'border-amber-400/60 bg-amber-50/50 ring-2 ring-amber-300/50 dark:border-amber-700 dark:bg-amber-950/30 dark:ring-amber-800/40'
      : 'border-primary/40 bg-primary/5 ring-2 ring-primary/25'
    : entry.alreadySent
      ? 'border-border bg-card'
      : 'border-primary/25 bg-primary/5'

  return (
    <div className={`rounded-xl border p-4 transition-all ${cardClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <label
          className="flex min-h-11 shrink-0 cursor-pointer items-start pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            className="size-4 cursor-pointer rounded border-input accent-[var(--primary)]"
            aria-label={
              entry.alreadySent
                ? 'Kijelölés ÚJRAKÜLDÉSRE (a címzettek ismét értesítést kapnak)'
                : 'Kijelölés a tömeges küldéshez'
            }
          />
        </label>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="shrink-0 rounded-lg bg-muted px-2 py-1 font-mono text-xs text-foreground ring-1 ring-border">
            {entry.date}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <span className="font-semibold text-foreground">{entry.title}</span>
              <ChevronDown
                className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {entry.version && (
                <Badge variant="outline" className="border-border">
                  v{entry.version}
                </Badge>
              )}
              {entry.category && (
                <Badge className="border-border bg-muted text-muted-foreground">
                  {RELEASE_CATEGORY_LABELS[entry.category]}
                </Badge>
              )}
              {entry.targetsHint && <span>{entry.targetsHint}</span>}
            </span>
            <span className="mt-3 flex flex-wrap items-center gap-2">
              <NotificationStatusBadge sent={entry.alreadySent} />
              <EmailStatusBadge
                requested={!!status?.sendEmail}
                sentAt={status?.emailSentAt ?? null}
                error={status?.emailError ?? null}
                notSentLabel={
                  entry.alreadySent ? 'E-mail nem volt kérve' : 'E-mail nincs elküldve'
                }
              />
              {status && (
                <span className="text-[11px] text-muted-foreground">
                  {formatBroadcastScope(status)} · {status.recipientCount} címzett ·{' '}
                  {formatDateTime(status.sentAt)}
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          {!entry.alreadySent ? (
            <>
              <Button
                onClick={onSend}
                disabled={isPending || sendDisabled}
                className="gap-1.5"
              >
                <Send className="size-3.5" aria-hidden />
                Kiküldés
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {scopeLabel}
                {sendEmail ? ' + e-mail' : ''}
              </span>
            </>
          ) : (
            <>
              <StatusBadge intent="success">Kiküldve</StatusBadge>
              <Button
                variant="outline"
                onClick={onResend}
                disabled={isPending || sendDisabled}
                className="mt-1 gap-1.5"
                title="Újra elküldjük a frissítést a kiválasztott címzetteknek — a korábbi címzettek ismét értesítést kapnak"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Újraküldés
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {scopeLabel}
                {sendEmail ? ' + e-mail' : ''}
              </span>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
            {entry.bodyMarkdown || 'Ehhez a bejegyzéshez nincs részletes leírás.'}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * Archivált (küszöb előtti) bejegyzések — összecsukható, csak-olvasható csoport.
 */
function ArchivedEntriesGroup({
  entries,
  expandedKeys,
  onToggle,
}: {
  entries: ChangelogEntry[]
  expandedKeys: Set<string>
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-muted-foreground">
          Archivált korábbi bejegyzések
        </span>
        <Badge className="border-border bg-muted text-muted-foreground">{entries.length}</Badge>
        <span className="hidden text-xs text-muted-foreground/70 sm:inline">
          — ezeket nem küldjük ki hírlevélben
        </span>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {entries.map((e) => {
            const expanded = expandedKeys.has(e.key)
            return (
              <div key={e.key} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onToggle(e.key)}
                  aria-expanded={expanded}
                  className="flex min-h-11 w-full items-start gap-2 text-left"
                >
                  <span className="shrink-0 rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border">
                    {e.date}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">{e.title}</span>
                  <ChevronDown
                    className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {expanded && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 font-sans text-xs leading-relaxed text-muted-foreground">
                    {e.bodyMarkdown || 'Nincs részletes leírás.'}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
