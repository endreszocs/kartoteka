'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetContent, SheetTitle,
} from '@/components/ui/sheet'
import {
  LayoutDashboard, Users, Wallet, BookOpen, ClipboardList,
  Package, FileText, Landmark, Sparkles, Building2, Castle,
  Settings, HelpCircle, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface SidebarProps {
  role: string
  isMasterAdmin: boolean
  isAdmin: boolean
  isEsperes: boolean
  hasCongregation: boolean
  isGodMode: boolean
  mobileOpen: boolean
  onMobileClose: () => void
}

interface MenuItem {
  label: string
  href: string
  icon: LucideIcon
  color: string        // aktív ikon gradient
  barColor: string     // bal oldali szín csík
}

const mainItems: MenuItem[] = [
  { label: 'Irányítópult', href: '/dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-blue-600', barColor: 'bg-blue-500' },
  { label: 'Tagnyilvántartás', href: '/tagnyilvantartas', icon: Users, color: 'from-emerald-500 to-emerald-600', barColor: 'bg-emerald-500' },
  { label: 'Pénzügy', href: '/penzugy', icon: Wallet, color: 'from-amber-500 to-amber-600', barColor: 'bg-amber-500' },
  { label: 'Anyakönyv', href: '/anyakonyv', icon: BookOpen, color: 'from-violet-500 to-violet-600', barColor: 'bg-violet-500' },
]

const operativeItems: MenuItem[] = [
  { label: 'Munkanapló', href: '/munkanaplo', icon: ClipboardList, color: 'from-cyan-500 to-cyan-600', barColor: 'bg-cyan-500' },
  { label: 'Leltár', href: '/leltar', icon: Package, color: 'from-orange-500 to-orange-600', barColor: 'bg-orange-500' },
  { label: 'Iktatás', href: '/iktato', icon: FileText, color: 'from-pink-500 to-pink-600', barColor: 'bg-pink-500' },
  { label: 'Sírhelyek', href: '/sirhelyek', icon: Landmark, color: 'from-slate-400 to-slate-500', barColor: 'bg-slate-400' },
]

const communityItems: MenuItem[] = [
  { label: 'Missziós Műhely', href: '/misszios-muhely', icon: Sparkles, color: 'from-fuchsia-500 to-fuchsia-600', barColor: 'bg-fuchsia-500' },
]

const dioceseItems: MenuItem[] = [
  { label: 'Egyházmegye', href: '/dashboard-egyhazmegye', icon: Building2, color: 'from-teal-500 to-teal-600', barColor: 'bg-teal-500' },
]

const districtItems: MenuItem[] = [
  { label: 'Egyházkerület', href: '/dashboard-kerulet', icon: Castle, color: 'from-indigo-500 to-indigo-600', barColor: 'bg-indigo-500' },
]

const adminItems: MenuItem[] = [
  { label: 'Admin Panel', href: '/admin', icon: Settings, color: 'from-red-500 to-red-600', barColor: 'bg-red-500' },
]

// ─── Közös menü tartalom ────────────────────────────────────

function SidebarNav({ isEsperes, isAdmin, isMasterAdmin, hasCongregation, isGodMode, onNavigate }: {
  isEsperes: boolean; isAdmin: boolean; isMasterAdmin: boolean; hasCongregation: boolean; isGodMode: boolean; onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          <Image src="/kartoteka-icon.png" alt="Kartotéka" width={32} height={32} className="rounded-lg" />
          <div>
            <h2 className="text-[14px] font-bold tracking-tight leading-tight text-white">Kartotéka</h2>
            <p className="text-[9px] text-slate-500 leading-tight">Egyházi Nyilvántartás</p>
          </div>
        </div>
      </div>

      {/* Menüpontok — kompakt, nincs scroll */}
      <nav className="flex-1 px-2 py-2 space-y-3">
        {hasCongregation && (
          <>
            <SidebarSection items={mainItems} pathname={pathname} onNavigate={onNavigate} />
            <div className="border-t border-white/[0.04] mx-2" />
            <SidebarSection items={operativeItems} pathname={pathname} onNavigate={onNavigate} />
            <div className="border-t border-white/[0.04] mx-2" />
            <SidebarSection items={communityItems} pathname={pathname} onNavigate={onNavigate} />
          </>
        )}
        {isEsperes && (
          <>
            <div className="border-t border-white/[0.04] mx-2" />
            <SidebarSection items={dioceseItems} pathname={pathname} onNavigate={onNavigate} />
          </>
        )}
        {isAdmin && <SidebarSection items={districtItems} pathname={pathname} onNavigate={onNavigate} />}
        {isMasterAdmin && (
          <>
            <div className="border-t border-white/[0.04] mx-2" />
            <SidebarSection items={adminItems} pathname={pathname} onNavigate={onNavigate} />
          </>
        )}
      </nav>

      {/* Alsó rész */}
      <div className="shrink-0 px-2 pb-2 space-y-1.5">
        <Link
          href="/support"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-slate-500 hover:bg-white/[0.04] hover:text-slate-300 transition-all"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Segítségkérés
        </Link>

        {isGodMode && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 flex items-center justify-center gap-1.5">
            <Zap className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-semibold text-red-400">God Mode</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Export ──────────────────────────────────────────────────

export function Sidebar({ isMasterAdmin, isAdmin, isEsperes, hasCongregation, isGodMode, mobileOpen, onMobileClose }: SidebarProps) {
  const navProps = { isEsperes, isAdmin, isMasterAdmin, hasCongregation, isGodMode }

  return (
    <>
      <aside className="hidden lg:flex w-[220px] bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0c1220] text-white min-h-screen flex-col shrink-0">
        <SidebarNav {...navProps} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(open) => { if (!open) onMobileClose() }}>
        <SheetContent side="left" showCloseButton={false} className="w-[260px] p-0 bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0c1220] border-r-0">
          <SheetTitle className="sr-only">Navigáció</SheetTitle>
          <SidebarNav {...navProps} onNavigate={onMobileClose} />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Szekció + menüpont ─────────────────────────────────────

function SidebarSection({ items, pathname, onNavigate }: { items: MenuItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-0.5">
      {items.map(item => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all duration-150',
              active
                ? 'bg-white/[0.08] text-white font-medium'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            )}
          >
            {/* Szín csík — bal oldalon */}
            <div className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-150',
              active ? `h-5 ${item.barColor}` : 'h-0'
            )} />

            <div className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150 shrink-0',
              active
                ? `bg-gradient-to-br ${item.color}`
                : 'bg-white/[0.05] group-hover:bg-white/[0.08]'
            )}
            style={active ? { boxShadow: '0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)' } : undefined}
            >
              <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300')} />
            </div>
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
