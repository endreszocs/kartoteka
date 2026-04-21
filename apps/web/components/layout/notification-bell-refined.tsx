'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Bell,
  BellDot,
  CheckCircle2,
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
}

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.info
}

export function NotificationBellRefined({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null)

  // Új értesítés észlelése → 1.4 sec-es shake animáció
  const prevCountRef = useRef(0)
  const firstLoadRef = useRef(true)
  const [shake, setShake] = useState(false)

  const loadNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('ertesitesek')
      .select('*')
      .eq('user_id', userId)
      .eq('olvasva', false)
      .order('created_at', { ascending: false })
      .limit(20)

    const rows = ((data || []) as unknown as Notification[]).map(notification => ({
      ...notification,
      admin_request_id:
        notification.admin_request_id ||
        (notification.hivatkozas?.startsWith('admin_access:')
          ? notification.hivatkozas.replace('admin_access:', '')
          : undefined),
    }))
    setNotifications(rows)
    setUnreadCount(rows.length)
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
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadNotifications, userId])

  // Új értesítés detektálása — shake animáció indítása
  // A shake akkor fut, ha az unreadCount nőtt az előző renderhez képest
  // (de nem az első load-kor, mert az a meglévő értesítések betöltése).
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevCountRef.current = unreadCount
      return
    }
    if (unreadCount > prevCountRef.current) {
      setShake(true)
      const timer = setTimeout(() => setShake(false), 1500)
      prevCountRef.current = unreadCount
      return () => clearTimeout(timer)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  async function markAsRead(notification: Notification) {
    const supabase = createClient()
    await supabase.from('ertesitesek').update({ olvasva: true }).eq('id', notification.id)
    setSelectedNotif(notification)
    setDetailOpen(true)
    setDropdownOpen(false)
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

  const hasUnread = unreadCount > 0

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          size="icon-lg"
          className={cn(
            'relative size-10 rounded-2xl border-white/70 transition-all duration-300 hover:bg-white',
            hasUnread ? 'bell-btn-glow border-amber-200/70' : 'bg-white/76 shadow-[0_14px_30px_-22px_rgba(16,70,63,0.38)]',
          )}
          onClick={() => setDropdownOpen((open) => !open)}
          aria-label={hasUnread ? `${unreadCount} olvasatlan értesítés` : 'Értesítések'}
        >
          {/* A csengő ikon: ha van olvasatlan → BellDot + pulse; ha új jön → shake */}
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
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-3 w-[22rem] overflow-hidden rounded-[1.6rem] border border-white/70 bg-[rgba(255,255,255,0.96)] shadow-[0_30px_60px_-28px_rgba(16,70,63,0.52)] backdrop-blur-xl">
            {/* Header gradient-es sávval */}
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
                    {hasUnread ? `${unreadCount} olvasatlan visszajelzés` : 'Minden elolvasva'}
                  </h3>
                </div>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 shadow-inner">
                  <CheckCircle2 className="size-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">Nincs új értesítés</p>
                <p className="mt-1 text-xs text-muted-foreground">Amikor új történik, itt rögtön megjelenik.</p>
              </div>
            ) : (
              <div className="max-h-[26rem] overflow-y-auto p-2.5">
                {notifications.map((notification) => {
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
                      key={notification.id}
                      type="button"
                      onClick={() => markAsRead(notification)}
                      className="group mb-1.5 flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-border/60 hover:bg-secondary/60 hover:shadow-sm last:mb-0"
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
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {dropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />}

      {/* Részletes megjelenítés — szebb, serif címmel + ornament-tel */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedNotif && (() => {
                const typeConfig = getTypeConfig(selectedNotif.tipus)
                const Icon = typeConfig.icon

                return (
                  <span className={`flex size-11 items-center justify-center rounded-2xl ${typeConfig.surface} ${typeConfig.color} shadow-inner`}>
                    <Icon className="size-5" />
                  </span>
                )
              })()}
              <span className="font-heading text-xl leading-tight">{selectedNotif?.cim}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-[1.2rem] border border-slate-100 bg-slate-50/50 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {selectedNotif?.uzenet}
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block size-1 rounded-full bg-muted-foreground" />
              {selectedNotif?.created_at
                ? new Date(selectedNotif.created_at).toLocaleString('hu', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </p>

            {selectedNotif?.admin_request_id && (
              <div className="flex gap-2 border-t border-border/70 pt-3">
                <Button className="flex-1" size="sm" onClick={handleApproveAdminAccess}>
                  Jóváhagyás
                </Button>
                <Button variant="destructive" className="flex-1" size="sm" onClick={handleDenyAdminAccess}>
                  Elutasítás
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
