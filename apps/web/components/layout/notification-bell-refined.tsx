'use client'

/**
 * Header — értesítés-csengő és üzenet-panel.
 *
 * 2026-08-10 (kör-4 dizájn): a panel teljes vizuális újratervezése. A logika
 * (Supabase realtime, olvasatlan + 24 órán belül olvasott szekciók, megnyitáskori
 * olvasottá jelölés, archiválás, admin hozzáférés-kérelem jóváhagyás/elutasítás,
 * badge-szám, rázás-animáció) VÁLTOZATLAN — csak a megjelenés újult meg:
 *
 *   • típusonkénti vizuális identitás (ikon + halvány, típusszínű felület),
 *     minden szín light/dark párban, AA-kontraszttal;
 *   • kártya-alapú sorok: ikon-chip, cím (2 sor), üzenet (2 sor + „Tovább"),
 *     magyar relatív idő, olvasatlan-pötty és bal oldali hangsúly-csík;
 *   • letisztult panel-fejléc (számláló + „Összes olvasottnak jelölése"),
 *     ragadós szekció-fejlécek („Új" / „Korábbi"), barátságos üres állapot;
 *   • token-alapú felületek (bg-popover / border-border / text-foreground),
 *     így a sötét téma is helyes — a korábbi hardkódolt fehér/slate helyett;
 *   • mobilon a panel a képernyő szélességéhez igazodik, vízszintesen SOHA
 *     nem lóg ki; a gomb és minden művelet legalább 44 px magas.
 *
 * A csengő gomb mostantól a header többi ikongombjának (segítség, avatár)
 * formanyelvét követi; olvasatlan üzenetnél borostyán gyűrűt kap. A figyelem-
 * felkeltő animáció (rázás + badge-pulzálás) CSAK valóban új üzenet érkezésekor
 * fut le, nem folyamatosan.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Bell,
  BellDot,
  CheckCheck,
  CheckCircle2,
  Clock,
  Info,
  Inbox,
  LifeBuoy,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
  X,
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

// ──────────────────────────────────────────────────────────────────────────
// Típusonkénti vizuális identitás (2026-08-10)
//
// Minden `ertesitesek.tipus` saját ikont, magyar címkét és halvány, színezett
// felületet kap. A színek `-500/xx` alfás változatok, mert a `-50` osztályokat
// a `kartoteka.css` sötét blokkja `!important`-tal felülírja — így a light és a
// dark megjelenés is kiszámítható marad. A szövegszínek `-700` (light) és
// `-300` (dark) párban futnak, mindkét irányban AA-kontraszttal.
// ⚠️ Az olívazöld accent SOHA nem kap fehér szöveget (lásd projekt-memória).
// ──────────────────────────────────────────────────────────────────────────

interface TypeVisual {
  icon: LucideIcon
  /** Rövid, lelkész-barát magyar címke a kártya lábában. */
  label: string
  /** Ikon-chip: halvány felület + azonos színcsaládú ikon és gyűrű. */
  chip: string
  /** Bal oldali hangsúly-csík az olvasatlan kártyán. */
  bar: string
  /** Apró típuscímke a kártya lábában. */
  pill: string
}

const TYPE_VISUALS: Record<string, TypeVisual> = {
  info: {
    icon: Info,
    label: 'Tájékoztatás',
    chip: 'bg-sky-500/12 text-sky-700 ring-sky-500/20 dark:text-sky-300 dark:ring-sky-400/25',
    bar: 'bg-sky-500',
    pill: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  success: {
    icon: CheckCircle2,
    label: 'Sikeres',
    chip: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Figyelem',
    chip: 'bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-400/25',
    bar: 'bg-amber-500',
    pill: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  danger: {
    icon: ShieldAlert,
    label: 'Fontos',
    chip: 'bg-rose-500/12 text-rose-700 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-400/25',
    bar: 'bg-rose-500',
    pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  support_reply: {
    icon: LifeBuoy,
    label: 'Támogatás',
    chip: 'bg-violet-500/12 text-violet-700 ring-violet-500/20 dark:text-violet-300 dark:ring-violet-400/25',
    bar: 'bg-violet-500',
    pill: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  registration: {
    icon: UserRoundPlus,
    label: 'Regisztráció',
    chip: 'bg-indigo-500/12 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-400/25',
    bar: 'bg-indigo-500',
    pill: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  release: {
    icon: Sparkles,
    label: 'Újdonság',
    chip: 'bg-teal-500/12 text-teal-700 ring-teal-500/20 dark:text-teal-300 dark:ring-teal-400/25',
    bar: 'bg-teal-500',
    pill: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
}

function getTypeVisual(tipus?: string | null): TypeVisual {
  return (tipus && TYPE_VISUALS[tipus]) || TYPE_VISUALS.info
}

// ──────────────────────────────────────────────────────────────────────────
// Magyar relatív idő (2026-08-10)
//
// „az imént" → „12 perce" → „3 órája" → „tegnap" → „4 napja" → „2 hete" →
// azon túl konkrét dátum. Szándékosan helyi helper: a `components/admin/users/
// user-visuals.ts` `formatRelativeTime` szövegei az admin felhasználó-listához
// kötöttek („még nem lépett be"), és nem szeretnénk, ha a header az admin
// modultól függene.
// ──────────────────────────────────────────────────────────────────────────

function relativHuIdo(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 0) return 'az imént'

  const perc = Math.floor(diff / 60_000)
  if (perc < 1) return 'az imént'
  if (perc < 60) return `${perc} perce`

  const ora = Math.floor(perc / 60)
  if (ora < 24) return `${ora} órája`

  const nap = Math.floor(ora / 24)
  if (nap === 1) return 'tegnap'
  if (nap < 7) return `${nap} napja`
  if (nap < 30) {
    const het = Math.floor(nap / 7)
    return het === 1 ? 'egy hete' : `${het} hete`
  }

  const d = new Date(t)
  const ideiEv = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('hu-HU', {
    year: ideiEv ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function teljesHuIdo(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleString('hu', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Az értesítéshez tartozó megnyitható hivatkozás. Az `admin_access:<id>` alakú
 * érték NEM link (az a jóváhagyás-kérelem azonosítója), a többi belső útvonal
 * vagy külső http(s) cím lehet.
 */
function notificationLink(
  notification?: Notification | null,
): { href: string; external: boolean } | null {
  const raw = notification?.hivatkozas?.trim()
  if (!raw || raw.startsWith('admin_access:')) return null
  if (raw.startsWith('/')) return { href: raw, external: false }
  if (/^https?:\/\//i.test(raw)) return { href: raw, external: true }
  return null
}

const READ_RETENTION_HOURS = 24
/** Ennél hosszabb üzenetnél jelenik meg a „Tovább" kinyitó. */
const LONG_MESSAGE_CHARS = 120
/** Meddig fusson a badge figyelem-pulzálás egy új üzenet érkezése után. */
const NEW_ARRIVAL_MS = 8_000

export function NotificationBellRefined({ userId }: { userId: string }) {
  const router = useRouter()

  const [unread, setUnread] = useState<Notification[]>([])
  const [recentRead, setRecentRead] = useState<Notification[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null)
  const [archivePending, setArchivePending] = useState<string | null>(null)
  const [markAllPending, setMarkAllPending] = useState(false)

  const prevCountRef = useRef(0)
  const firstLoadRef = useRef(true)
  const [shake, setShake] = useState(false)
  const [justArrived, setJustArrived] = useState(false)

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

  // Rázás + rövid badge-pulzálás — CSAK valóban új értesítésnél (2026-08-10)
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevCountRef.current = unread.length
      return
    }
    if (unread.length > prevCountRef.current) {
      setShake(true)
      setJustArrived(true)
      prevCountRef.current = unread.length
      const shakeTimer = setTimeout(() => setShake(false), 1500)
      const pulseTimer = setTimeout(() => setJustArrived(false), NEW_ARRIVAL_MS)
      return () => {
        clearTimeout(shakeTimer)
        clearTimeout(pulseTimer)
      }
    }
    prevCountRef.current = unread.length
  }, [unread.length])

  // Escape → panel bezárása (2026-08-10)
  useEffect(() => {
    if (!dropdownOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dropdownOpen])

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

  /** Összes olvasatlan egy mozdulattal olvasottá (2026-08-10). */
  async function markAllAsRead() {
    const ids = unread.map((n) => n.id)
    if (ids.length === 0) return
    setMarkAllPending(true)
    const supabase = createClient()
    await supabase.from('ertesitesek').update({ olvasva: true }).in('id', ids)
    setMarkAllPending(false)
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
  const badgeLabel = unread.length > 99 ? '99+' : String(unread.length)
  const selectedVisual = getTypeVisual(selectedNotif?.tipus)
  const SelectedIcon = selectedVisual.icon
  const selectedLink = notificationLink(selectedNotif)

  const headline = hasUnread
    ? `${unread.length} olvasatlan üzenet`
    : recentRead.length > 0
      ? 'Minden üzenetet elolvastál'
      : 'Nincs új értesítés'

  return (
    <>
      <div className="relative">
        {/* Csengő gomb — a header többi ikongombjának formanyelvét követi */}
        <button
          type="button"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-label={hasUnread ? `${unread.length} olvasatlan értesítés` : 'Értesítések'}
          aria-expanded={dropdownOpen}
          aria-haspopup="dialog"
          title="Értesítések"
          className={cn(
            'relative inline-flex size-10 items-center justify-center rounded-[10px] transition',
            'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            // Egyetlen ring-szélesség + ring-szín osztály állapotonként, hogy a
            // Tailwind-osztályok ne ütközzenek egymással (2026-08-10).
            hasUnread
              ? cn(
                  'bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
                  dropdownOpen
                    ? 'ring-2 ring-amber-500/55'
                    : 'ring-1 ring-amber-500/35 dark:ring-amber-400/35',
                )
              : cn(
                  'bg-muted text-foreground hover:bg-muted/70',
                  dropdownOpen && 'ring-2 ring-ring/45',
                ),
          )}
        >
          <span
            className={cn(
              'inline-flex size-[18px] items-center justify-center',
              shake && 'bell-shake',
            )}
          >
            {hasUnread ? <BellDot className="size-[18px]" /> : <Bell className="size-[17px]" />}
          </span>
          {hasUnread && (
            <span
              className={cn(
                'absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white shadow-sm',
                justArrived && 'badge-pulse',
              )}
            >
              {badgeLabel}
            </span>
          )}
        </button>

        {dropdownOpen && (
          <>
            {/* Kívülre kattintás → bezárás. Mobilon finom sötétítés is, hogy a
                panel „lapként" váljon el a háttértől.
                ⚠️ A header `backdrop-blur`-t használ, ezért ő a containing block
                a fixed pozíciójú gyerekeknek — az `inset-0` csak a 64 px magas
                fejlécet fedné le. Explicit `h-screen w-screen` kell (2026-08-10). */}
            <div
              className="fixed left-0 top-0 z-40 h-screen w-screen bg-foreground/15 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
              onClick={() => setDropdownOpen(false)}
              aria-hidden
            />

            <div
              role="dialog"
              aria-label="Értesítések"
              className={cn(
                'z-50 flex flex-col overflow-hidden',
                // Mobil: a fejléc alatt teljes szélességű lap, 12-12 px margóval —
                // így vízszintesen SOHA nem lóg ki (a csengő nem a jobb szélen ül,
                // ezért a jobbra igazított popover kilógna a bal oldalon).
                'fixed left-3 right-3 top-[4.5rem]',
                // sm-től: a csengőhöz horgonyzott popover
                'sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[26rem]',
                'rounded-2xl border border-border bg-popover text-popover-foreground',
                'shadow-[0_28px_70px_-32px_rgba(28,42,38,0.55)]',
              )}
            >
              {/* ── Panel-fejléc ──────────────────────────────────────────── */}
              <div className="shrink-0 border-b border-border/70 bg-gradient-to-b from-secondary/70 to-popover px-4 pb-3 pt-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 dark:text-foreground">
                    <Bell className="size-[17px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Értesítések
                    </p>
                    <h3 className="truncate font-heading text-[15px] leading-tight text-foreground">
                      {headline}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(false)}
                    aria-label="Panel bezárása"
                    className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {hasUnread && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      disabled={markAllPending}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
                    >
                      <CheckCheck className="size-3.5" />
                      {markAllPending ? 'Jelölés…' : 'Összes olvasottnak jelölése'}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Görgethető lista ──────────────────────────────────────── */}
              {totalCount === 0 ? (
                <NotificationEmptyState />
              ) : (
                <div className="max-h-[min(28rem,56vh)] overflow-y-auto overscroll-contain px-2.5 pb-2.5">
                  {unread.length > 0 && (
                    <NotificationSection
                      title="Új"
                      count={unread.length}
                      notifications={unread}
                      onSelect={markAsRead}
                    />
                  )}

                  {recentRead.length > 0 && (
                    <NotificationSection
                      title="Korábbi"
                      hint="24 órán belül olvasva"
                      count={recentRead.length}
                      notifications={recentRead}
                      onSelect={reopenNotification}
                      onArchive={archiveNotification}
                      archivePendingId={archivePending}
                      isReadSection
                    />
                  )}
                </div>
              )}

              {/* ── Panel-lábléc ──────────────────────────────────────────── */}
              <div className="shrink-0 border-t border-border/70 bg-secondary/40 px-3 py-2">
                <Link
                  href="/notifications"
                  onClick={() => setDropdownOpen(false)}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
                >
                  <Inbox className="size-3.5" />
                  Átjelentkezési kérelmek megnyitása
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Részletes megjelenítés — reszponzív, scrollozható */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,720px)] max-w-none flex-col overflow-hidden bg-popover p-0 sm:w-[min(94vw,720px)] sm:max-w-none">
          <DialogHeader className="shrink-0 gap-3 border-b border-border/70 bg-gradient-to-b from-secondary/60 to-popover px-5 py-4 sm:px-6">
            <DialogTitle className="flex items-start gap-3 pr-8">
              {selectedNotif && (
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1',
                    selectedVisual.chip,
                  )}
                >
                  <SelectedIcon className="size-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg leading-tight text-foreground sm:text-xl">
                  {selectedNotif?.cim}
                </span>
                <span
                  className={cn(
                    'mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]',
                    selectedVisual.pill,
                  )}
                >
                  {selectedVisual.label}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {selectedNotif?.uzenet}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {selectedNotif?.created_at && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Érkezett: {teljesHuIdo(selectedNotif.created_at)} (
                  {relativHuIdo(selectedNotif.created_at)})
                </span>
              )}
              {selectedNotif?.read_at && (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3" />
                  Olvasva: {relativHuIdo(selectedNotif.read_at)}
                </span>
              )}
            </div>

            {/* Hivatkozás — belső útvonal vagy külső cím megnyitása */}
            {selectedLink &&
              (selectedLink.external ? (
                <a
                  href={selectedLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/92"
                >
                  Megnyitás
                  <ArrowUpRight className="size-4" />
                </a>
              ) : (
                <Button
                  size="lg"
                  onClick={() => {
                    setDetailOpen(false)
                    router.push(selectedLink.href)
                  }}
                  className="gap-1.5"
                >
                  Megnyitás
                  <ArrowUpRight className="size-4" />
                </Button>
              ))}

            {selectedNotif?.admin_request_id && (
              <div className="flex gap-2 border-t border-border/70 pt-3">
                <Button className="h-10 flex-1" onClick={handleApproveAdminAccess}>
                  Jóváhagyás
                </Button>
                <Button
                  variant="destructive"
                  className="h-10 flex-1"
                  onClick={handleDenyAdminAccess}
                >
                  Elutasítás
                </Button>
              </div>
            )}
          </div>

          {/* Footer — archiválás opció (olvasottnál) */}
          {selectedNotif?.olvasva && !selectedNotif.archived && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-secondary/40 px-5 py-3 sm:px-6">
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
                className="h-9 gap-1.5"
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
// Üres állapot
// ──────────────────────────────────────────────────────────────────────────

function NotificationEmptyState() {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25">
        <CheckCircle2 className="size-6" />
      </div>
      <p className="mt-3.5 text-sm font-semibold text-foreground">Tiszta a postaláda</p>
      <p className="mx-auto mt-1 max-w-[19rem] text-xs leading-relaxed text-muted-foreground">
        Nincs olvasatlan üzeneted. Ha új történik a gyülekezet körül, itt jelezzük.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Szekció a panelben („Új" / „Korábbi") — ragadós fejléccel
// ──────────────────────────────────────────────────────────────────────────

function NotificationSection({
  title,
  hint,
  count,
  notifications,
  onSelect,
  onArchive,
  archivePendingId,
  isReadSection = false,
}: {
  title: string
  hint?: string
  count: number
  notifications: Notification[]
  onSelect: (n: Notification) => void
  onArchive?: (n: Notification, e?: React.MouseEvent) => void
  archivePendingId?: string | null
  isReadSection?: boolean
}) {
  return (
    <section>
      <div className="sticky top-0 z-10 -mx-2.5 flex items-baseline gap-2 bg-popover/95 px-4 pb-1.5 pt-2.5 backdrop-blur supports-backdrop-filter:bg-popover/85">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/70">
          {title}
        </p>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold leading-[15px] text-muted-foreground">
          {count}
        </span>
        {hint && <span className="truncate text-[10px] text-muted-foreground">· {hint}</span>}
      </div>
      <div className="space-y-1.5 pt-0.5">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onSelect={() => onSelect(notification)}
            onArchive={onArchive ? (e) => onArchive(notification, e) : undefined}
            isArchivePending={archivePendingId === notification.id}
            isRead={isReadSection}
          />
        ))}
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Egy értesítés-kártya
// ──────────────────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onSelect,
  onArchive,
  isArchivePending,
  isRead,
}: {
  notification: Notification
  onSelect: () => void
  onArchive?: (e: React.MouseEvent) => void
  isArchivePending: boolean
  isRead: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const visual = getTypeVisual(notification.tipus)
  const Icon = visual.icon
  const message = notification.uzenet || ''
  const isLong = message.length > LONG_MESSAGE_CHARS
  const link = notificationLink(notification)

  return (
    // A sor `div` + `role="button"` (nem `<button>`), hogy a benne lévő
    // „Tovább" / „Archiválás" gombok érvényes HTML-t adjanak (2026-08-10).
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex min-h-11 w-full cursor-pointer items-start gap-3 overflow-hidden rounded-xl border border-transparent py-2.5 pl-3.5 pr-2.5 text-left transition',
        'hover:border-border hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isRead ? 'opacity-85 hover:opacity-100' : 'bg-secondary/35',
      )}
    >
      {/* Bal oldali hangsúly-csík — csak olvasatlannál */}
      {!isRead && (
        <span
          aria-hidden
          className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full', visual.bar)}
        />
      )}

      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105',
          visual.chip,
        )}
      >
        <Icon className="size-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={cn(
              'line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-foreground',
              isRead ? 'font-medium' : 'font-semibold',
            )}
          >
            {notification.cim}
          </p>
          {!isRead && (
            <span
              aria-label="Olvasatlan"
              className="mt-1 size-2 shrink-0 rounded-full bg-primary ring-2 ring-primary/20"
            />
          )}
        </div>

        {message && (
          <p
            className={cn(
              'mt-1 text-xs leading-relaxed text-muted-foreground',
              !expanded && 'line-clamp-2',
            )}
          >
            {message}
          </p>
        )}

        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="mt-0.5 inline-flex min-h-6 items-center rounded text-[11px] font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
          >
            {expanded ? 'Kevesebb' : 'Tovább'}
          </button>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 font-medium',
              visual.pill,
            )}
          >
            {visual.label}
          </span>
          <time
            dateTime={notification.created_at}
            title={teljesHuIdo(notification.created_at)}
            className="tabular-nums"
          >
            {relativHuIdo(notification.created_at)}
          </time>
          {link && (
            <span className="inline-flex items-center gap-0.5 text-primary dark:text-foreground">
              <ArrowUpRight className="size-3" />
              Megnyitható
            </span>
          )}
        </div>
      </div>

      {onArchive && (
        <button
          type="button"
          onClick={onArchive}
          aria-label="Archiválás"
          title="Archiválás"
          className={cn(
            'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100',
            isArchivePending && 'animate-pulse opacity-100',
          )}
        >
          <Archive className="size-3.5" />
        </button>
      )}
    </div>
  )
}
