'use client'

/**
 * Rendszergazdai pénzügyi import — Apple-beállítások stílusú OLDALSÁVOS nézet.
 *
 * Bal oldalon választható lista (mit akarsz importálni), jobb oldalon a kiválasztott
 * felület. A „Veszélyzóna" (pénzügyi adatok végleges törlése) külön, piros szekcióként
 * a lista alján (csak god mode-ban).
 *
 * 2026-06-09 — sidebar-redesign (felhasználói kérés).
 */

import { useState } from 'react'
import { Wallet, Coins, ShieldAlert, ChevronRight } from 'lucide-react'

import { PenzugyImportWizard } from './penzugy-import-wizard'
import { IncomeImportSection } from './income/income-import-section'
import { FinanceDataDangerZone } from './finance-data-danger-zone'

type SectionId = 'kassza' | 'income' | 'danger'

interface FinanceImportTabsProps {
  congregationId: string
  congregationName: string
  /** Ha true, a pénzügyi adat-törlés veszélyzóna megjelenik (god mode). */
  showDanger?: boolean
  /** P3-9 (audit 2026-08-28): sikeres import után a Pénzügy-fülek listáinak
   *  frissítése — enélkül a felhasználó a RÉGI listát látta, és azt hihette,
   *  az import nem csinált semmit (a dokumentált fülváltás-hibaosztály). */
  onImported?: () => void
}

interface NavItem {
  id: SectionId
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  danger?: boolean
}

export function FinanceImportTabs({
  congregationId,
  congregationName,
  showDanger = false,
  onImported,
}: FinanceImportTabsProps) {
  const [section, setSection] = useState<SectionId>('kassza')

  const items: NavItem[] = [
    {
      id: 'kassza',
      label: 'Hivatalos Kassza',
      description: 'Éves Kassza-xlsx (bevétel + kiadás + bankok)',
      icon: Wallet,
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    },
    {
      id: 'income',
      label: 'Bevétel-import',
      description: 'Bármely bevétel-kategória — kézi párosítás + egyeztetés',
      icon: Coins,
      iconBg: 'bg-gradient-to-br from-violet-500 to-indigo-600',
    },
  ]

  const activeItem =
    items.find((i) => i.id === section) ??
    (section === 'danger' ? null : items[0])

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col md:flex-row">
        {/* ─── OLDALSÁV ─────────────────────────────────────────────── */}
        <aside className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-3 md:w-72 md:border-b-0 md:border-r">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Importálás
          </p>
          <nav className="space-y-1">
            {items.map((item) => (
              <SidebarButton
                key={item.id}
                item={item}
                active={section === item.id}
                onClick={() => setSection(item.id)}
              />
            ))}
          </nav>

          {showDanger && (
            <>
              <p className="px-2 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                Veszélyzóna
              </p>
              <nav className="space-y-1">
                <SidebarButton
                  item={{
                    id: 'danger',
                    label: 'Adatok törlése',
                    description: 'Pénzügyi tételek végleges törlése (teszt)',
                    icon: ShieldAlert,
                    iconBg: 'bg-gradient-to-br from-red-500 to-rose-600',
                    danger: true,
                  }}
                  active={section === 'danger'}
                  onClick={() => setSection('danger')}
                />
              </nav>
            </>
          )}
        </aside>

        {/* ─── TARTALOM ─────────────────────────────────────────────── */}
        <section className="min-w-0 flex-1 p-4 sm:p-6">
          {activeItem && (
            <header className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${activeItem.iconBg}`}
              >
                <activeItem.icon className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-xl text-slate-800">{activeItem.label}</h2>
                <p className="text-sm text-slate-500">{activeItem.description}</p>
              </div>
            </header>
          )}

          {section === 'kassza' && <PenzugyImportWizard onImported={onImported} />}
          {section === 'income' && <IncomeImportSection />}
          {section === 'danger' && showDanger && (
            <FinanceDataDangerZone
              congregationId={congregationId}
              congregationName={congregationName}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function SidebarButton({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
        active
          ? item.danger
            ? 'bg-red-100/80 ring-1 ring-red-200'
            : 'bg-white shadow-sm ring-1 ring-slate-200'
          : 'hover:bg-white/70'
      }`}
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${item.iconBg}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold ${
            item.danger ? 'text-red-700' : 'text-slate-800'
          }`}
        >
          {item.label}
        </p>
        <p className="truncate text-xs text-slate-500">{item.description}</p>
      </div>
      <ChevronRight
        className={`size-4 shrink-0 transition-opacity ${
          active ? 'opacity-100 text-slate-400' : 'opacity-0 group-hover:opacity-60'
        }`}
      />
    </button>
  )
}
