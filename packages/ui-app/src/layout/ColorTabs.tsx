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

// 2026-08-14 (9. pont, BLOKKOLÓ-javítás): SÖTÉT MÓD variánsok minden színhez.
// Korábban az aktív fül sötét módban is világos pasztell pirula maradt világos
// szöveggel — a 9 fő modul fülsora olvashatatlan volt. A dark: változat
// áttetsző színes hátteret + világos (300-as) szöveget ad; a slate és a
// red-prominent külön kezelt. GÉPI generálás — új színnél tartsd a mintát.
const colorClasses: Record<string, { active: string; inactive: string; bar: string }> = {
  blue:    { active: 'border-blue-200/80 bg-blue-50/90 text-blue-700 shadow-[0_16px_32px_-28px_rgba(37,99,235,0.75)] dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300', inactive: 'border-transparent text-slate-500 hover:border-blue-100 hover:bg-white/70 hover:text-blue-700 dark:text-slate-400 dark:hover:border-blue-400/20 dark:hover:bg-white/5 dark:hover:text-blue-300', bar: 'bg-blue-600 dark:bg-blue-400' },
  emerald: { active: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-[0_16px_32px_-28px_rgba(5,150,105,0.75)] dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300', inactive: 'border-transparent text-slate-500 hover:border-emerald-100 hover:bg-white/70 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-400/20 dark:hover:bg-white/5 dark:hover:text-emerald-300', bar: 'bg-emerald-600 dark:bg-emerald-400' },
  violet:  { active: 'border-violet-200/80 bg-violet-50/90 text-violet-700 shadow-[0_16px_32px_-28px_rgba(124,58,237,0.75)] dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-300', inactive: 'border-transparent text-slate-500 hover:border-violet-100 hover:bg-white/70 hover:text-violet-700 dark:text-slate-400 dark:hover:border-violet-400/20 dark:hover:bg-white/5 dark:hover:text-violet-300', bar: 'bg-violet-600 dark:bg-violet-400' },
  amber:   { active: 'border-amber-200/80 bg-amber-50/90 text-amber-700 shadow-[0_16px_32px_-28px_rgba(217,119,6,0.75)] dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300', inactive: 'border-transparent text-slate-500 hover:border-amber-100 hover:bg-white/70 hover:text-amber-700 dark:text-slate-400 dark:hover:border-amber-400/20 dark:hover:bg-white/5 dark:hover:text-amber-300', bar: 'bg-amber-600 dark:bg-amber-400' },
  cyan:    { active: 'border-cyan-200/80 bg-cyan-50/90 text-cyan-700 shadow-[0_16px_32px_-28px_rgba(8,145,178,0.75)] dark:border-cyan-400/30 dark:bg-cyan-400/15 dark:text-cyan-300', inactive: 'border-transparent text-slate-500 hover:border-cyan-100 hover:bg-white/70 hover:text-cyan-700 dark:text-slate-400 dark:hover:border-cyan-400/20 dark:hover:bg-white/5 dark:hover:text-cyan-300', bar: 'bg-cyan-600 dark:bg-cyan-400' },
  pink:    { active: 'border-pink-200/80 bg-pink-50/90 text-pink-700 shadow-[0_16px_32px_-28px_rgba(219,39,119,0.75)] dark:border-pink-400/30 dark:bg-pink-400/15 dark:text-pink-300', inactive: 'border-transparent text-slate-500 hover:border-pink-100 hover:bg-white/70 hover:text-pink-700 dark:text-slate-400 dark:hover:border-pink-400/20 dark:hover:bg-white/5 dark:hover:text-pink-300', bar: 'bg-pink-600 dark:bg-pink-400' },
  orange:  { active: 'border-orange-200/80 bg-orange-50/90 text-orange-700 shadow-[0_16px_32px_-28px_rgba(234,88,12,0.75)] dark:border-orange-400/30 dark:bg-orange-400/15 dark:text-orange-300', inactive: 'border-transparent text-slate-500 hover:border-orange-100 hover:bg-white/70 hover:text-orange-700 dark:text-slate-400 dark:hover:border-orange-400/20 dark:hover:bg-white/5 dark:hover:text-orange-300', bar: 'bg-orange-600 dark:bg-orange-400' },
  slate:   { active: 'border-slate-200/80 bg-slate-50/90 text-slate-700 shadow-[0_16px_32px_-28px_rgba(71,85,105,0.75)] dark:border-slate-500/40 dark:bg-slate-400/15 dark:text-slate-200', inactive: 'border-transparent text-slate-400 hover:border-slate-100 hover:bg-white/70 hover:text-slate-600 dark:text-slate-500 dark:hover:border-slate-500/30 dark:hover:bg-white/5 dark:hover:text-slate-300', bar: 'bg-slate-600 dark:bg-slate-400' },
  red:     { active: 'border-red-200/80 bg-red-50/90 text-red-700 shadow-[0_16px_32px_-28px_rgba(220,38,38,0.75)] dark:border-red-400/30 dark:bg-red-400/15 dark:text-red-300', inactive: 'border-transparent text-slate-500 hover:border-red-100 hover:bg-white/70 hover:text-red-700 dark:text-slate-400 dark:hover:border-red-400/20 dark:hover:bg-white/5 dark:hover:text-red-300', bar: 'bg-red-600 dark:bg-red-400' },
  // 'red-prominent': vizuálisan FIGYELMEZTETŐ tab — inaktív állapotban is piros
  // háttér, hogy a felhasználó számára egyértelmű legyen a "veszélyes" jelleg
  // (pl. "Rendszergazdai importáló" fül a Tagnyilvántartás oldalon, 2026-05-25).
  'red-prominent': { active: 'border-red-300 bg-red-100/90 text-red-800 shadow-[0_16px_32px_-24px_rgba(220,38,38,0.85)] dark:border-red-400/40 dark:bg-red-400/20 dark:text-red-300', inactive: 'border-red-200/70 bg-red-50/70 text-red-700 hover:bg-red-100/80 hover:border-red-300 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300 dark:hover:bg-red-400/20', bar: 'bg-red-600 dark:bg-red-400' },
  teal:    { active: 'border-teal-200/80 bg-teal-50/90 text-teal-700 shadow-[0_16px_32px_-28px_rgba(13,148,136,0.75)] dark:border-teal-400/30 dark:bg-teal-400/15 dark:text-teal-300', inactive: 'border-transparent text-slate-500 hover:border-teal-100 hover:bg-white/70 hover:text-teal-700 dark:text-slate-400 dark:hover:border-teal-400/20 dark:hover:bg-white/5 dark:hover:text-teal-300', bar: 'bg-teal-600 dark:bg-teal-400' },
  indigo:  { active: 'border-indigo-200/80 bg-indigo-50/90 text-indigo-700 shadow-[0_16px_32px_-28px_rgba(79,70,229,0.75)] dark:border-indigo-400/30 dark:bg-indigo-400/15 dark:text-indigo-300', inactive: 'border-transparent text-slate-500 hover:border-indigo-100 hover:bg-white/70 hover:text-indigo-700 dark:text-slate-400 dark:hover:border-indigo-400/20 dark:hover:bg-white/5 dark:hover:text-indigo-300', bar: 'bg-indigo-600 dark:bg-indigo-400' },
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
                  isActive ? 'bg-slate-100 dark:bg-white/10' : 'bg-slate-100/60 dark:bg-white/10'
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
