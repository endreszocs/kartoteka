'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  AlertTriangle,
  Bell,
  BellDot,
  CheckCircle2,
  Clock,
  Headphones,
  Info,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  tipus: string
  cim: string
  uzenet: string
  olvasva: boolean
  created_at: string
  read_at?: string | null
  archived?: boolean
  archived_at?: string | null
  admin_request_id?: string
  hivatkozas?: string | null
}

const TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; surface: string }> = {
  success: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    surface: 'bg-emerald-50',
  },
  danger: {
    icon: ShieldAlert,
    color: 'text-red-600',
    surface: 'bg-red-50',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    surface: 'bg-amber-50',
  },
  support_reply: {
    icon: Headphones,
    color: 'text-violet-600',
    surface: 'bg-violet-50',
  },
  registration: {
    icon: UserRoundPlus,
    color: 'text-sky-600',
    surface: 'bg-sky-50',
  },
  info: {
    icon: Info,
    color: 'text-primary',
    surface: 'bg-secondary/75',
  },
  release: {
    icon: Sparkles,
    color: 'text-violet-600',
    surface: 'bg-violet-50',
  },
}

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.info
}

const READ_RETENTION_HOURS = 24

export function NotificationBellRefined({ userId }: { userId: string }) {
  const [unread, setUnread] = useState<Notification[]>([])
  const [recentRead, setRecentRead] = useState<Notification[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null)
  const [archivePending, setArchivePending] = useState<string | null>(null)

  const prevCountRef = useRef(0)
  const firstLoadRef = useRef(true)
  const [shake, setShake] = useState(false)

  const loadNotifications = useCallback(async () => {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - READ_RETENTION_HOURS * 60 * 60 * 1000).toISOString()

    // Olvasatlan ÉS nem-archivált
    const unreadQuery = supabase
      .from('ertesitesek')
      .select('*')
      .eq('user_id', userId)
      .eq('olvasva', false)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false })
      .limit(30)

    // Olvasott + 24 órán belül + nem-archivált
    const recentQuery = supabase
      .from('ertesitesek')
      .select('*')
      .eq('user_id', userId)
      .eq('olvasva', true)
      .or('archived.is.null,archived.eq.false')
      .gte('read_at', cutoff)
      .order('read_at', { ascending: false })
      .limit(30)

    const [unreadRes, recentRes] = await Promise.all([unreadQuery, recentQuery])

    const mapRow = (row: Notification): Notification => ({
      ...row,
      admin_request_id:
        row.admin_request_id ||
        (row.hivatkozas?.startsWith('admin_access:')
          ? row.hivatkozas.replace('admin_access:', '')
          : undefined),
    })

    const unreadRows = ((unreadRes.data || []) as unknown as Notification[]).map(mapRow)
    const readRows = ((recentRes.data || []) as unknown as Notification[]).map(mapRow)

    setUnread(unreadRows)
    setRecentRead(readRows)
  }, [userId])

  useEffect(() => {
    loadNotifications()

    const supabase = createClient()
    const channel = supabase
      .channel('notifications-refined')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ertesitesek',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadNotifications()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadNotifications, userId])

  // Shake animáció új értesítésnél
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevCountRef.current = unread.length
      return
    }
    if (unread.length > prevCountRef.current) {
      setShake(true)
      const timer = setTimeout(() => setShake(false), 1500)
      prevCountRef.current = unread.length
      return () => clearTimeout(timer)
    }
    prevCountRef.current = unread.length
  }, [unread.length])

  async function markAsRead(notification: Notification) {
    const supabase = createClient()
    // A trigger automatikusan beállítja a read_at-ot
    if (!notification.olvasva) {
      await supabase.from('ertesitesek').update({ olvasva: true }).eq('id', notification.id)
    }
    setSelectedNotif(notification)
    setDetailOpen(true)
    setDropdownOpen(false)
    loadNotifications()
  }

  function reopenNotification(notification: Notification) {
    // Már olvasott — csak újra megnyitjuk a részletes ablakban
    setSelectedNotif(notification)
    setDetailOpen(true)
    setDropdownOpen(false)
  }

  async function archiveNotification(notification: Notification, e?: React.MouseEvent) {
    e?.stopPropagation()
    setArchivePending(notification.id)
    const supabase = createClient()
    await supabase
      .from('ertesitesek')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('id', notification.id)
    setArchivePending(null)
    loadNotifications()
  }

  async function handleApproveAdminAccess() {
    if (!selectedNotif?.admin_request_id) return
    const { approveAdminAccess } = await import('@/app/(dashboard)/notifications/actions')
    const result = await approveAdminAccess(selectedNotif.admin_request_id)
    const { toast } = await import('sonner')
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Hozzáférés jóváhagyva.')
    setDetailOpen(false)
    loadNotifications()
  }

  async function handleDenyAdminAccess() {
    if (!selectedNotif?.admin_request_id) return
    const { denyAdminAccess } = await import('@/app/(dashboard)/notifications/actions')
    const result = await denyAdminAccess(selectedNotif.admin_request_id)
    const { toast } = await import('sonner')
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Hozzáférés elutasítva.')
    setDetailOpen(false)
    loadNotifications()
  }

  const hasUnread = unread.length > 0
  const totalCount = unread.length + recentRead.length

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          size="icon-lg"
          className={cn(
            'relative size-10 rounded-2xl border-white/70 transition-all duration-300 hover:bg-white',
            hasUnread
              ? 'bell-btn-glow border-amber-200/70'
              : 'bg-white/76 shadow-[0_14px_30px_-22px_rgba(16,70,63,0.38)]',
          )}
          onClick={() => setDropdownOpen((open) => !open)}
          aria-label={hasUnread ? `${unread.length} olvasatlan értesítés` : 'Értesítések'}
        >
          <span
            className={cn(
              'inline-flex size-[18px] items-center justify-center',
              hasUnread && !shake && 'bell-active',
              shake && 'bell-shake',
            )}
          >
            {hasUnread ? (
              <BellDot className="size-[18px] text-amber-600" />
            ) : (
              <Bell className="size-[18px] text-primary" />
            )}
          </span>
          {hasUnread && (
            <span className="badge-pulse absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-3 w-[min(95vw,28rem)] overflow-hidden rounded-[1.6rem] border border-border bg-popover shadow-lg backdrop-blur-xl">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-white to-teal-50 px-4 py-3.5 border-b border-border/70">
              <div className="absolute -right-4 -top-4 size-20 rounded-full bg-amber-200/30 blur-2xl" />
              <div className="absolute -left-4 -bottom-4 size-16 rounded-full bg-teal-200/30 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary/70">
                    Értesítések
                  </p>
                  <h3 className="font-heading text-base leading-tight text-slate-800">
                    {hasUnread
                      ? `${unread.length} olvasatlan visszajelzés`
                      : recentRead.length > 0
                        ? `${recentRead.length} friss üzenet`
                        : 'Minden elolvasva'}
                  </h3>
                </div>
              </div>
            </div>

            {totalCount === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 shadow-inner">
                  <CheckCircle2 className="size-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">Nincs új értesítés</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Amikor új történik, itt rögtön megjelenik.
                </p>
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto p-2.5 space-y-3">
                {/* Olvasatlan szekció */}
                {unread.length > 0 && (
                  <NotificationSection
                    title="Új"
                    count={unread.length}
                    accent="amber"
                    notifications={unread}
                    onSelect={markAsRead}
                  />
                )}

                {/* Olvasott (24h) szekció */}
                {recentRead.length > 0 && (
                  <NotificationSection
                    title="Friss (24 órán belül olvasva)"
                    count={recentRead.length}
                    accent="slate"
                    notifications={recentRead}
                    onSelect={reopenNotification}
                    onArchive={archiveNotification}
                    archivePendingId={archivePending}
                    isReadSection
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {dropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
      )}

      {/* Részletes megjelenítés — reszponzív, scrollozható */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-white p-0 overflow-hidden w-[min(96vw,720px)] sm:w-[min(94vw,720px)] max-w-none sm:max-w-none max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-gradient-to-br from-amber-50/40 via-white to-teal-50/40 shrink-0">
            <DialogTitle className="flex items-center gap-3">
              {selectedNotif &&
                (() => {
                  const typeConfig = getTypeConfig(selectedNotif.tipus)
                  const Icon = typeConfig.icon
                  return (
                    <span
                      className={`flex size-11 items-center justify-center rounded-2xl ${typeConfig.surface} ${typeConfig.color} shadow-inner shrink-0`}
                    >
                      <Icon className="size-5" />
                    </span>
                  )
                })()}
              <span className="font-heading text-lg sm:text-xl leading-tight">
                {selectedNotif?.cim}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div className="rounded-[1.2rem] border border-slate-100 bg-slate-50/50 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {selectedNotif?.uzenet}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {selectedNotif?.created_at && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Érkezett:{' '}
                  {new Date(selectedNotif.created_at).toLocaleString('hu', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              {selectedNotif?.read_at && (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3" />
                  Olvasva:{' '}
                  {new Date(selectedNotif.read_at).toLocaleString('hu', {
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {selectedNotif?.admin_request_id && (
              <div className="flex gap-2 border-t border-border/70 pt-3">
                <Button className="flex-1" size="sm" onClick={handleApproveAdminAccess}>
                  Jóváhagyás
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  size="sm"
                  onClick={handleDenyAdminAccess}
                >
                  Elutasítás
                </Button>
              </div>
            )}
          </div>

          {/* Footer — archiválás opció (olvasottnál) */}
          {selectedNotif?.olvasva && !selectedNotif.archived && (
            <div className="border-t border-slate-100 bg-slate-50/40 px-5 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-muted-foreground">
                Az olvasott üzenetek 24 órán át maradnak elérhetők.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await archiveNotification(selectedNotif)
                  setDetailOpen(false)
                }}
                disabled={archivePending === selectedNotif.id}
                className="gap-1.5"
              >
                <Archive className="size-3.5" />
                Archiválás
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Section a dropdown-ban (Új / Friss)
// ──────────────────────────────────────────────────────────────────────────

function NotificationSection({
  title,
  count,
  accent,
  notifications,
  onSelect,
  onArchive,
  archivePendingId,
  isReadSection = false,
}: {
  title: string
  count: number
  accent: 'amber' | 'slate'
  notifications: Notification[]
  onSelect: (n: Notification) => void
  onArchive?: (n: Notification, e?: React.MouseEvent) => void
  archivePendingId?: string | null
  isReadSection?: boolean
}) {
  const accentText = accent === 'amber' ? 'text-amber-700' : 'text-slate-500'

  return (
    <div>
      <p
        className={`px-2 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${accentText}`}
      >
        {title} ({count})
      </p>
      <div className="space-y-1.5">
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onSelect={() => onSelect(notification)}
            onArchive={onArchive ? (e) => onArchive(notification, e) : undefined}
            isArchivePending={archivePendingId === notification.id}
            faded={isReadSection}
          />
        ))}
      </div>
    </div>
  )
}

function NotificationRow({
  notification,
  onSelect,
  onArchive,
  isArchivePending,
  faded,
}: {
  notification: Notification
  onSelect: () => void
  onArchive?: (e: React.MouseEvent) => void
  isArchivePending: boolean
  faded: boolean
}) {
  const typeConfig = getTypeConfig(notification.tipus)
  const Icon = typeConfig.icon
  const timestamp = new Date(notification.created_at)
  const now = new Date()
  const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60)
  const timeLabel =
    diffHours < 1
      ? 'most'
      : diffHours < 24
        ? `${Math.floor(diffHours)} órája`
        : diffHours < 168
          ? `${Math.floor(diffHours / 24)} napja`
          : timestamp.toLocaleDateString('hu')

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-border/60 hover:bg-secondary/60 hover:shadow-sm',
        faded && 'opacity-75 hover:opacity-100',
      )}
    >
      <div
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl ${typeConfig.surface} ${typeConfig.color} shadow-inner transition-transform group-hover:scale-110`}
      >
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-800">
            {notification.cim}
          </p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {timeLabel}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {notification.uzenet}
        </p>
      </div>
      {onArchive && (
        <span
          role="button"
          tabIndex={0}
          onClick={onArchive}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onArchive(e as unknown as React.MouseEvent)
            }
          }}
          aria-label="Archiválás"
          title="Archiválás"
          className={cn(
            'shrink-0 inline-flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition opacity-0 group-hover:opacity-100',
            isArchivePending && 'opacity-100 animate-pulse',
          )}
        >
          <Archive className="size-3.5" />
        </span>
      )}
    </button>
  )
}
