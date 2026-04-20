'use client'

import { useState } from 'react'
import { Bell, BookOpen, Lightbulb, MessageCircle, X, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

interface WhatsNewItem {
  type: 'material' | 'idea' | 'comment'
  id: string
  title: string
  author: string
  date: string
  parentId?: string
}

interface MuhelyWhatsNewProps {
  items: WhatsNewItem[]
  lastVisit: string | null
}

const TYPE_CONFIG = {
  material: { icon: BookOpen, label: 'Új segédanyag', color: 'text-emerald-600 bg-emerald-50', href: '/misszios-muhely/segedanyagok' },
  idea: { icon: Lightbulb, label: 'Új fórum téma', color: 'text-violet-600 bg-violet-50', href: '/misszios-muhely/forum' },
  comment: { icon: MessageCircle, label: 'Új hozzászólás', color: 'text-sky-600 bg-sky-50', href: '/misszios-muhely/forum' },
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000)
  if (diffH < 1) return 'Az imént'
  if (diffH < 24) return `${diffH} órája`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} napja`
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
}

export function MuhelyWhatsNew({ items, lastVisit }: MuhelyWhatsNewProps) {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (dismissed || items.length === 0) return null

  const visibleItems = expanded ? items : items.slice(0, 3)
  const hasMore = items.length > 3

  return (
    <div className="rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50/50 border border-sky-100/60 p-5 relative">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
          <Bell className="w-4 h-4 text-sky-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Újdonságok az utolsó belépésed óta
          </h3>
          {lastVisit && (
            <p className="text-[10px] text-slate-400">
              Utolsó belépés: {new Date(lastVisit).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-sky-500 text-white text-xs font-bold">
          {items.length}
        </span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {visibleItems.map((item, i) => {
          const config = TYPE_CONFIG[item.type]
          const Icon = config.icon
          const [textColor, bgColor] = config.color.split(' ')
          const href = item.type === 'comment' && item.parentId
            ? `/misszios-muhely/forum/${item.parentId}`
            : item.type === 'idea'
            ? `/misszios-muhely/forum/${item.id}`
            : config.href

          return (
            <Link
              key={`${item.type}-${item.id}-${i}`}
              href={href}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white/60 hover:bg-white/90 transition-colors"
            >
              <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                <Icon className={`w-3.5 h-3.5 ${textColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 truncate">{item.title}</div>
                <div className="text-[10px] text-slate-400">{item.author} · {formatRelative(item.date)}</div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${bgColor} ${textColor} shrink-0`}>
                {config.label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Show more/less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-sky-600 font-medium mt-2 mx-auto hover:text-sky-700 transition-colors"
        >
          {expanded ? (
            <>Kevesebb <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Még {items.length - 3} újdonság <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}
    </div>
  )
}
