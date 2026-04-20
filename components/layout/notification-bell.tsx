'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  tipus: string
  cim: string
  uzenet: string
  olvasva: boolean
  created_at: string
  // Admin hozzáférés kérelem ID (ha van)
  admin_request_id?: string
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  success: { icon: '✅', color: 'text-green-600' },
  danger: { icon: '🔴', color: 'text-red-600' },
  warning: { icon: '⚠️', color: 'text-amber-600' },
  support_reply: { icon: '🎧', color: 'text-purple-600' },
  registration: { icon: '👤', color: 'text-blue-600' },
  info: { icon: 'ℹ️', color: 'text-blue-600' },
}

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null)

  const loadNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('ertesitesek').select('*')
      .eq('user_id', userId).eq('olvasva', false)
      .order('created_at', { ascending: false }).limit(20)
    const notifs = (data || []) as unknown as Notification[]
    setNotifications(notifs)
    setUnreadCount(notifs.length)
  }, [userId])

  useEffect(() => {
    loadNotifications()

    // Supabase Realtime
    const supabase = createClient()
    const channel = supabase.channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'ertesitesek',
        filter: `user_id=eq.${userId}`,
      }, () => { loadNotifications() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, loadNotifications])

  async function markAsRead(notif: Notification) {
    const supabase = createClient()
    await supabase.from('ertesitesek').update({ olvasva: true }).eq('id', notif.id)
    setSelectedNotif(notif)
    setDetailOpen(true)
    setDropdownOpen(false)
    loadNotifications()
  }

  const cfg = (tipus: string) => TYPE_CONFIG[tipus] || TYPE_CONFIG.info

  return (
    <>
      {/* Csengő gomb */}
      <div className="relative">
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0" onClick={() => setDropdownOpen(!dropdownOpen)}>
          🔔
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-red-500 text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
            <div className="p-3 border-b font-semibold text-sm">Értesítések</div>
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nincs olvasatlan értesítés</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="p-3 border-b hover:bg-slate-50 cursor-pointer" onClick={() => markAsRead(n)}>
                  <div className="flex items-start gap-2">
                    <span className={cfg(n.tipus).color}>{cfg(n.tipus).icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.cim}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.uzenet?.substring(0, 80)}{(n.uzenet?.length || 0) > 80 ? '...' : ''}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString('hu')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Kívülre kattintás → bezárás */}
      {dropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />}

      {/* Részletes modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={cfg(selectedNotif?.tipus || 'info').color}>{cfg(selectedNotif?.tipus || 'info').icon}</span>
              {selectedNotif?.cim}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">{selectedNotif?.uzenet}</p>
            <p className="text-xs text-muted-foreground">{selectedNotif?.created_at ? new Date(selectedNotif.created_at).toLocaleString('hu') : ''}</p>

            {/* H4: Admin hozzáférés jóváhagyás/elutasítás gombok */}
            {selectedNotif?.admin_request_id && (
              <div className="flex gap-2 pt-2 border-t">
                <Button className="flex-1 bg-green-600 hover:bg-green-700" size="sm" onClick={async () => {
                  const { approveAdminAccess } = await import('@/app/(dashboard)/notifications/actions')
                  const r = await approveAdminAccess(selectedNotif.admin_request_id!)
                  if (r.error) { const { toast } = await import('sonner'); toast.error(r.error) }
                  else { const { toast } = await import('sonner'); toast.success('Hozzáférés jóváhagyva!'); setDetailOpen(false); loadNotifications() }
                }}>✅ Jóváhagyás (24 óra)</Button>
                <Button variant="destructive" className="flex-1" size="sm" onClick={async () => {
                  const { denyAdminAccess } = await import('@/app/(dashboard)/notifications/actions')
                  const r = await denyAdminAccess(selectedNotif.admin_request_id!)
                  if (r.error) { const { toast } = await import('sonner'); toast.error(r.error) }
                  else { const { toast } = await import('sonner'); toast.success('Hozzáférés elutasítva.'); setDetailOpen(false); loadNotifications() }
                }}>❌ Elutasítás</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
