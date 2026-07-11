'use client'

/**
 * Elküldött üzenetek — archívum.
 *
 * 2026-07-11 admin-redesign:
 *  - a sorok kinyithatók, a teljes üzenet-törzs visszanézhető;
 *  - a hírlevél „(Hírlevél része)" technikai marker-sorai külön, összecsukott
 *    csoportba kerülnek, nem szemetelik tele a listát;
 *  - a hivatkozás csak biztonságos formátumnál (belső útvonal / https)
 *    jelenik meg linkként;
 *  - a 100-as listalimit jelzést kap.
 *
 * 2026-07-11 olvashatósági kör: a külső kártya-héjat a BroadcastSectionCard
 * adja; a sorok szerkezete: erős cím + visszafogott metaadat-sor (dátum ·
 * típus · címzés · darabszám), az Előnézet gomb pedig kinyitás nélkül,
 * közvetlenül a sorból elérhető.
 */

import { useState } from 'react'
import { ChevronDown, ExternalLink, Eye, Inbox, Newspaper } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'

import { BROADCAST_TIPUS_LABELS, type BroadcastRow } from '@/lib/broadcasts/types'
import {
  NEWSLETTER_MARKER_PREFIX,
  TIPUS_INTENT,
  describeBroadcastRowScope,
  formatDateTime,
  isSafeHivatkozas,
} from './format'
import { EmailStatusBadge } from './delivery-badges'
import { EmailPreviewDialog } from './email-preview-dialog'

/** A listBroadcasts szerver-oldali limitje — ennyinél többet nem kapunk. */
const LIST_LIMIT = 100

export function BroadcastArchive({ broadcasts }: { broadcasts: BroadcastRow[] }) {
  const mainItems = broadcasts.filter((b) => !b.cim.startsWith(NEWSLETTER_MARKER_PREFIX))
  const markerItems = broadcasts.filter((b) => b.cim.startsWith(NEWSLETTER_MARKER_PREFIX))

  // E-mail előnézet — egyetlen közös dialógus, a kiválasztott sorral.
  const [previewId, setPreviewId] = useState<string | null>(null)

  return (
    <div className="space-y-2.5">
      {broadcasts.length >= LIST_LIMIT && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          A lista a legutóbbi {LIST_LIMIT} bejegyzést mutatja — a régebbiek itt nem jelennek meg.
        </p>
      )}

      {mainItems.length === 0 ? (
        <AdminEmptyState
          icon={Inbox}
          title="Még nincs elküldött üzenet"
          hint="Az első kiküldés után itt jelenik meg, mikor, kinek és mit küldtél."
        />
      ) : (
        mainItems.map((b) => (
          <ArchiveItem key={b.id} broadcast={b} onPreview={() => setPreviewId(b.id)} />
        ))
      )}

      {markerItems.length > 0 && <NewsletterMarkerGroup items={markerItems} />}

      <EmailPreviewDialog
        open={!!previewId}
        onOpenChange={(o) => {
          if (!o) setPreviewId(null)
        }}
        broadcastId={previewId}
      />
    </div>
  )
}

function ArchiveItem({
  broadcast,
  onPreview,
}: {
  broadcast: BroadcastRow
  onPreview: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const showLink = !!broadcast.hivatkozas && isSafeHivatkozas(broadcast.hivatkozas)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 sm:px-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
              {broadcast.cim}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatDateTime(broadcast.sent_at)}</span>
              <StatusBadge intent={TIPUS_INTENT[broadcast.tipus]}>
                {BROADCAST_TIPUS_LABELS[broadcast.tipus]}
              </StatusBadge>
              <span>{describeBroadcastRowScope(broadcast)}</span>
              <span>· {broadcast.recipient_count} címzett</span>
            </span>
          </span>
          <ChevronDown
            className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <Button
          variant="outline"
          onClick={onPreview}
          className="min-h-9 shrink-0 gap-1.5"
          title="A kiküldött levél előnézete"
        >
          <Eye className="size-4" aria-hidden />
          <span className="hidden sm:inline">Előnézet</span>
          <span className="sr-only sm:hidden">Előnézet</span>
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <EmailStatusBadge
              requested={broadcast.send_email}
              sentAt={broadcast.email_sent_at}
              error={broadcast.email_error}
            />
            {broadcast.release_version && (
              <Badge variant="outline" className="border-border">
                v{broadcast.release_version}
              </Badge>
            )}
          </div>
          {broadcast.email_error && (
            <p className="text-xs italic text-rose-600 dark:text-rose-400">
              E-mail hiba: {broadcast.email_error}
            </p>
          )}
          <p className="max-w-prose whitespace-pre-wrap rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed text-foreground/90">
            {broadcast.uzenet || 'Ehhez az üzenethez nincs mentett szöveg.'}
          </p>
          {broadcast.hivatkozas &&
            (showLink ? (
              <a
                href={broadcast.hivatkozas}
                className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {broadcast.hivatkozas}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Hivatkozás (nem megnyitható formátum): {broadcast.hivatkozas}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

/**
 * A hírlevél technikai marker-sorai — csak azt rögzítik, hogy egy changelog-
 * bejegyzés része volt egy hírlevélnek. Összecsukva, a lista alján.
 */
function NewsletterMarkerGroup({ items }: { items: BroadcastRow[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        <Newspaper className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-muted-foreground">
          Hírlevélben kiküldött frissítések
        </span>
        <Badge className="border-border bg-muted text-muted-foreground">{items.length}</Badge>
        <span className="hidden text-xs text-muted-foreground/70 sm:inline">
          — technikai bejegyzések, a fő hírlevél-üzenet fent szerepel
        </span>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatDateTime(b.sent_at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {b.cim.replace(`${NEWSLETTER_MARKER_PREFIX} `, '')}
              </span>
              {b.release_version && (
                <Badge variant="outline" className="border-border text-[11px]">
                  v{b.release_version}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
