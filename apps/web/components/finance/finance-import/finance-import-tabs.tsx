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
import { cn } from '@/lib/utils'

type SectionId = 'kassza' | 'income' | 'danger'

interface FinanceImportTabsProps {
  congregationId: string
  congregationName: string
  /** Ha true, a pénzügyi adat-törlés veszélyzóna megjelenik (god mode). */
  showDanger?: boolean
  /** Külön importablakban a külső shell adja a kártyakeretet. */
  embedded?: boolean
}

interface NavItem {
  id: SectionId
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  danger?: boolean
}

export function FinanceImportTabs({
  congregationId,
  congregationName,
  showDanger = false,
  embedded = false,
}: FinanceImportTabsProps) {
  const [section, setSection] = useState<SectionId>('kassza')

  const items: NavItem[] = [
    {
      id: 'kassza',
      label: 'Hivatalos Kassza',
      description: 'Éves Kassza-xlsx (bevétel + kiadás + bankok)',
      icon: Wallet,
      iconClassName: 'bg-primary/10 text-primary',
    },
    {
      id: 'income',
      label: 'Bevétel-import',
      description: 'Bármely bevétel-kategória — kézi párosítás + egyeztetés',
      icon: Coins,
      iconClassName: 'bg-secondary text-secondary-foreground',
    },
  ]

  const activeItem =
    items.find((i) => i.id === section) ??
    (section === 'danger' ? null : items[0])

  return (
    <div className={cn(
      'overflow-hidden',
      !embedded && 'rounded-2xl border border-border bg-card shadow-sm',
    )}>
      <div className="flex flex-col md:flex-row">
        {/* ─── OLDALSÁV ─────────────────────────────────────────────── */}
        <aside className="shrink-0 border-b border-border bg-muted/30 p-3 md:w-72 md:border-b-0 md:border-r">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Importálás
          </p>
          <nav aria-label="Pénzügyi import műveletei">
            <div className="grid grid-cols-2 gap-2 md:block md:space-y-1">
              {items.map((item) => (
                <SidebarButton
                  key={item.id}
                  item={item}
                  active={section === item.id}
                  onClick={() => setSection(item.id)}
                />
              ))}
            </div>

            {showDanger && (
              <div className="mt-3 border-t border-border pt-3 md:mt-4 md:pt-0">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-destructive/70 md:pt-4">
                  Veszélyzóna
                </p>
                <SidebarButton
                  item={{
                    id: 'danger',
                    label: 'Adatok törlése',
                    description: 'Pénzügyi tételek végleges törlése (teszt)',
                    icon: ShieldAlert,
                    iconClassName: 'bg-destructive/10 text-destructive',
                    danger: true,
                  }}
                  active={section === 'danger'}
                  onClick={() => setSection('danger')}
                />
              </div>
            )}
          </nav>
        </aside>

        {/* ─── TARTALOM ─────────────────────────────────────────────── */}
        <section
          id="finance-import-panel"
          role="region"
          aria-labelledby={`finance-import-tab-${section}`}
          className="min-w-0 flex-1 p-3 sm:p-4 md:p-6"
        >
          {activeItem && (
            <header className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${activeItem.iconClassName}`}
              >
                <activeItem.icon className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-xl text-foreground">{activeItem.label}</h2>
                <p className="text-sm text-muted-foreground">{activeItem.description}</p>
              </div>
            </header>
          )}

          {section === 'kassza' && <PenzugyImportWizard />}
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
      id={`finance-import-tab-${item.id}`}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls="finance-import-panel"
      className={`group flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors md:gap-3 md:px-2.5 ${
        active
          ? item.danger
            ? 'bg-destructive/10 ring-1 ring-destructive/20'
            : 'bg-background shadow-sm ring-1 ring-border'
          : 'hover:bg-background/70'
      }`}
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.iconClassName}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold ${
            item.danger ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {item.label}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground md:block">{item.description}</p>
      </div>
      <ChevronRight
        className={`size-4 shrink-0 transition-opacity ${
          active ? 'opacity-100 text-muted-foreground' : 'opacity-0 group-hover:opacity-60'
        }`}
      />
    </button>
  )
}
