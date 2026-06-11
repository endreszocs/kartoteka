/**
 * Pénzügy → Számadás oldal — `/penzugy/szamadas` (2026-06-10 paritás A5).
 *
 * A MEGOSZTOTT `@kartoteka/ui-app` `AccountingTab` komponenst renderli — azonos
 * a webbel. A desktop a lokális SQLite-ból táplálja:
 *   - bevétel/kiadás + kategória-térképek + számadási kódlista (finance-sync,
 *     finance-categories-sync, finance-adapters)
 *   - beállítások (BealitasRow) + költségvetési tervek (budgetData):
 *     finance-settings-sync
 *
 * READ-ONLY: a callback-prop-okat (onRequestUnlock / onRefresh / onToast /
 * finalizeWizardSlot) NEM adjuk át — így a véglegesítő/feloldó gombok rejtve
 * maradnak, a tab csak megjelenít. Az írási út (véglegesítés) a C-hullám része.
 */

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'

import { Label } from '@kartoteka/ui'
import {
  PageHero,
  AccountingTab,
  type BefitetesRow,
  type KiadasRow,
  type SzamadasiCel,
  type BealitasRow,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopUser } from '../lib/desktop-user'
import { getLocalOwnProfile } from '../lib/sync'
import { getLocalBefizetesek, getLocalKiadasok, pullBefizetesek, pullKiadasok } from '../lib/finance-sync'
import {
  pullFinanceCategories,
  getLocalBevCelMap,
  getLocalKiaCelMap,
  getLocalSzamadasiCellek,
} from '../lib/finance-categories-sync'
import { pullFinanceSettings, getLocalBealitas, getLocalBudgetData } from '../lib/finance-settings-sync'
import { toBefitetesRow, toKiadasRow } from '../lib/finance-adapters'

function settingsStub(congId: string, year: number): BealitasRow {
  return {
    id: String(year),
    congregation_id: congId,
    eves_jarulek: null,
    jarulek_kedvezmenyes: null,
    jarulek_hatarid: null,
    budget_finalized: false,
    accounting_finalized: false,
    unlock_requested: false,
    unlock_reason: null,
    accounting_unlock_requested: false,
    accounting_unlock_reason: null,
    szamadas_zaro_adatok: null,
  }
}

export function PenzugySzamadasPage() {
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const [income, setIncome] = useState<BefitetesRow[]>([])
  const [expense, setExpense] = useState<KiadasRow[]>([])
  const [bevCelMap, setBevCelMap] = useState<Record<number, string>>({})
  const [kiaCelMap, setKiaCelMap] = useState<Record<number, string>>({})
  const [szamadasiCellek, setSzamadasiCellek] = useState<SzamadasiCel[]>([])
  const [settings, setSettings] = useState<BealitasRow | null>(null)
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const user = await getDesktopUser()
      if (!user) {
        setLoading(false)
        return
      }
      const profile = await getLocalOwnProfile(user.id)
      const congId = profile?.congregation_id ?? null
      if (!congId) {
        setLoading(false)
        return
      }

      await Promise.allSettled([
        pullBefizetesek(congId, year),
        pullKiadasok(congId, year),
        pullFinanceCategories(),
        pullFinanceSettings(congId, year),
      ])

      const [bef, kia, bevMap, kiaMap, cells, beal, budget] = await Promise.all([
        getLocalBefizetesek(congId, year),
        getLocalKiadasok(congId, year),
        getLocalBevCelMap(),
        getLocalKiaCelMap(),
        getLocalSzamadasiCellek(),
        getLocalBealitas(congId, year),
        getLocalBudgetData(congId, year),
      ])

      setIncome(bef.map(toBefitetesRow))
      setExpense(kia.map(toKiadasRow))
      setBevCelMap(bevMap)
      setKiaCelMap(kiaMap)
      setSzamadasiCellek(cells)
      setSettings(beal ?? settingsStub(congId, year))
      setBudgetData(budget)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const years = (() => {
    const cur = new Date().getFullYear()
    return [cur, cur - 1, cur - 2, cur - 3, cur - 4, cur - 5]
  })()

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Számadás"
          title="Számadás"
          description="Az éves számadás — bevételek és kiadások a költségvetési terv tükrében, ugyanaz a nézet, mint a webfelületen. (Offline a legutóbb szinkronizált adatokat mutatja; a véglegesítés a webfelületen érhető el.)"
          Icon={ClipboardCheck}
          actions={
            <>
              <Label htmlFor="year-select" className="text-xs text-slate-500">
                Év:
              </Label>
              <select
                id="year-select"
                className="rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          }
        />
        {loading || !settings ? (
          <div className="py-12 text-center text-sm text-slate-400">Számadás betöltése…</div>
        ) : (
          <AccountingTab
            szamadasiCellek={szamadasiCellek}
            incomeRecords={income}
            expenseRecords={expense}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            settings={settings}
            currentYear={year}
            budgetData={budgetData}
            loading={false}
          />
        )}
      </div>
    </DesktopShell>
  )
}
