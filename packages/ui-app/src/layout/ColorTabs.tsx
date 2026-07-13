'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'

/**
 * ColorTabs — szines pill-tab sor (web es desktop KOZOS, 2026-06-10 B-hullam).
 *
 * Eredet: apps/web/components/ui/color-tabs.tsx (verbatim atemeles — a web
 * mostantol innen re-exportalja). A FinanceTabs / RegistryTabs / desktop
 * egyseges Penzugy-oldal mind ezt hasznalja → azonos komponens = azonos pixel.
 */

interface ColorTab {
  value: string
  label: string
  color: string
  count?: number
}

interface ColorTabsProps {
  tabs: ColorTab[]
  active: string
  onChange: (value: string) => void
}

const colorClasses: Record<string, { active: string; inactive: string; bar: string }> = {
  blue:    { active: 'border-blue-200/80 bg-blue-50/90 text-blue-700 shadow-[0_16px_32px_-28px_rgba(37,99,235,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-blue-100 hover:bg-white/70 hover:text-blue-700', bar: 'bg-blue-600' },
  emerald: { active: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-[0_16px_32px_-28px_rgba(5,150,105,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-emerald-100 hover:bg-white/70 hover:text-emerald-700', bar: 'bg-emerald-600' },
  violet:  { active: 'border-violet-200/80 bg-violet-50/90 text-violet-700 shadow-[0_16px_32px_-28px_rgba(124,58,237,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-violet-100 hover:bg-white/70 hover:text-violet-700', bar: 'bg-violet-600' },
  amber:   { active: 'border-amber-200/80 bg-amber-50/90 text-amber-700 shadow-[0_16px_32px_-28px_rgba(217,119,6,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-amber-100 hover:bg-white/70 hover:text-amber-700', bar: 'bg-amber-600' },
  cyan:    { active: 'border-cyan-200/80 bg-cyan-50/90 text-cyan-700 shadow-[0_16px_32px_-28px_rgba(8,145,178,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-cyan-100 hover:bg-white/70 hover:text-cyan-700', bar: 'bg-cyan-600' },
  pink:    { active: 'border-pink-200/80 bg-pink-50/90 text-pink-700 shadow-[0_16px_32px_-28px_rgba(219,39,119,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-pink-100 hover:bg-white/70 hover:text-pink-700', bar: 'bg-pink-600' },
  orange:  { active: 'border-orange-200/80 bg-orange-50/90 text-orange-700 shadow-[0_16px_32px_-28px_rgba(234,88,12,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-orange-100 hover:bg-white/70 hover:text-orange-700', bar: 'bg-orange-600' },
  slate:   { active: 'border-slate-200/80 bg-slate-50/90 text-slate-700 shadow-[0_16px_32px_-28px_rgba(71,85,105,0.75)]', inactive: 'border-transparent text-slate-400 hover:border-slate-100 hover:bg-white/70 hover:text-slate-600', bar: 'bg-slate-600' },
  red:     { active: 'border-red-200/80 bg-red-50/90 text-red-700 shadow-[0_16px_32px_-28px_rgba(220,38,38,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-red-100 hover:bg-white/70 hover:text-red-700', bar: 'bg-red-600' },
  // 'red-prominent': vizuálisan FIGYELMEZTETŐ tab — inaktív állapotban is piros
  // háttér, hogy a felhasználó számára egyértelmű legyen a "veszélyes" jelleg
  // (pl. "Rendszergazdai importáló" fül a Tagnyilvántartás oldalon, 2026-05-25).
  'red-prominent': { active: 'border-red-300 bg-red-100/90 text-red-800 shadow-[0_16px_32px_-24px_rgba(220,38,38,0.85)]', inactive: 'border-red-200/70 bg-red-50/70 text-red-700 hover:bg-red-100/80 hover:border-red-300', bar: 'bg-red-600' },
  teal:    { active: 'border-teal-200/80 bg-teal-50/90 text-teal-700 shadow-[0_16px_32px_-28px_rgba(13,148,136,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-teal-100 hover:bg-white/70 hover:text-teal-700', bar: 'bg-teal-600' },
  indigo:  { active: 'border-indigo-200/80 bg-indigo-50/90 text-indigo-700 shadow-[0_16px_32px_-28px_rgba(79,70,229,0.75)]', inactive: 'border-transparent text-slate-500 hover:border-indigo-100 hover:bg-white/70 hover:text-indigo-700', bar: 'bg-indigo-600' },
}

export function ColorTabs({ tabs, active, onChange }: ColorTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeTab = tabListRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (!activeTab) return
    activeTab.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [active])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    if (!next) return
    onChange(next.value)
    requestAnimationFrame(() => {
      tabListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-value="${CSS.escape(next.value)}"]`)
        ?.focus()
    })
  }

  return (
    <div className="card-raised overflow-x-auto px-3 py-3 sm:px-4">
      <div ref={tabListRef} role="tablist" aria-label="Elérhető nézetek" className="flex w-max gap-2 md:w-auto md:flex-wrap">
        {tabs.map((tab, index) => {
          const isActive = active === tab.value
          const colors = colorClasses[tab.color] || colorClasses.blue
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-active={isActive}
              data-tab-value={tab.value}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`relative min-h-11 rounded-full border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-slate-100' : 'bg-slate-100/60'
                }`}>
                  {tab.count}
                </span>
              )}
              {/* Aktív alávonás */}
              {isActive && <span className={`absolute inset-x-4 -bottom-1 h-[3px] rounded-full ${colors.bar}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
