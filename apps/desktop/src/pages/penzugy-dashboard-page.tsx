/**
 * Pénzügy → Áttekintés oldal — `/penzugy/attekintes` (2026-06-10 paritás A2).
 *
 * Desktop↔web paritás: ez az oldal a MEGOSZTOTT `@kartoteka/ui-app`
 * `FinanceDashboard` komponenst renderli — pontosan ugyanazt, amit a web is
 * használ. A desktop a lokális SQLite cache-ből táplálja (offline-first):
 *   - bevétel/kiadás sorok: finance-sync + finance-adapters
 *   - kategória-térképek: finance-categories-sync
 *   - egyenlegek: a megosztott `calculateBalances` helper (carryover az előző
 *     évi lokális rekordokból)
 *
 * Read-only — nem érinti az offline írási utat. A `settings` prop a megosztott
 * komponensben nincs használva (csak a típus követeli meg), ezért a gyülekezet-
 * cache-ből épített minimál `BealitasRow`-t adunk át.
 *
 * Megjegyzés: a web a TVA-plafon figyelőt a `tvaPlafonSlot` prop-ba mountolja —
 * ennek desktop-megfelelője külön lépés (B-hullám); itt egyelőre elhagyva.
 */

import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { Label } from '@kartoteka/ui'
import {
  PageHero,
  FinanceDashboard,
  calculateBalances,
  type BefitetesRow,
  type KiadasRow,
  type FinanceBalances,
  type BealitasRow,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile, getLocalOwnCongregation } from '../lib/sync'
import {
  getLocalBefizetesek,
  getLocalKiadasok,
  pullBefizetesek,
  pullKiadasok,
} from '../lib/finance-sync'
import {
  pullFinanceCategories,
  getLocalBevCelMap,
  getLocalKiaCelMap,
} from '../lib/finance-categories-sync'
import { toBefitetesRow, toKiadasRow } from '../lib/finance-adapters'

const EMPTY_BALANCES: FinanceBalances = {
  cashBalance: 0,
  bankBalance: 0,
  totalIncome: 0,
  totalExpense: 0,
}

export function PenzugyDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const [income, setIncome] = useState<BefitetesRow[]>([])
  const [expense, setExpense] = useState<KiadasRow[]>([])
  const [bevCelMap, setBevCelMap] = useState<Record<number, string>>({})
  const [kiaCelMap, setKiaCelMap] = useState<Record<number, string>>({})
  const [balances, setBalances] = useState<FinanceBalances>(EMPTY_BALANCES)
  const [settings, setSettings] = useState<BealitasRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getDesktopSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
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

      // Online-first best-effort: idei + előző évi (carryover) + kategóriák.
      await Promise.allSettled([
        pullBefizetesek(congId, year),
        pullKiadasok(congId, year),
        pullBefizetesek(congId, year - 1),
        pullKiadasok(congId, year - 1),
        pullFinanceCategories(),
      ])

      const cong = await getLocalOwnCongregation(user.id)

      const [befLocal, kiaLocal, prevBefLocal, prevKiaLocal, bevMap, kiaMap] = await Promise.all([
        getLocalBefizetesek(congId, year),
        getLocalKiadasok(congId, year),
        getLocalBefizetesek(congId, year - 1),
        getLocalKiadasok(congId, year - 1),
        getLocalBevCelMap(),
        getLocalKiaCelMap(),
      ])

      const incomeRows = befLocal.map(toBefitetesRow)
      const expenseRows = kiaLocal.map(toKiadasRow)

      // Carryover = az előző évi záró egyenleg (a megosztott helperrel, mint a web).
      const prevBalances = calculateBalances(
        prevBefLocal.map(toBefitetesRow),
        prevKiaLocal.map(toKiadasRow),
        0,
        0,
      )
      const yearBalances = calculateBalances(
        incomeRows,
        expenseRows,
        prevBalances.cashBalance,
        prevBalances.bankBalance,
      )

      setIncome(incomeRows)
      setExpense(expenseRows)
      setBevCelMap(bevMap)
      setKiaCelMap(kiaMap)
      setBalances(yearBalances)
      // A FinanceDashboard a `settings`-et nem használja — minimál stub a
      // gyülekezet-cache-ből (eves_jarulek stb.), a flageket default-oljuk.
      setSettings({
        id: String(year),
        congregation_id: congId,
        eves_jarulek: cong?.eves_jarulek ?? null,
        jarulek_kedvezmenyes: cong?.jarulek_kedvezmenyes ?? null,
        jarulek_hatarid: cong?.jarulek_hatarid ?? null,
        budget_finalized: false,
        accounting_finalized: false,
        unlock_requested: false,
        unlock_reason: null,
        accounting_unlock_requested: false,
        accounting_unlock_reason: null,
        szamadas_zaro_adatok: null,
      })
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
          eyebrow="Pénzügy · Áttekintés"
          title="Pénzügyi áttekintés"
          description="A gyülekezet éves bevételei, kiadásai és egyenlege — ugyanaz a nézet, mint a webfelületen. (Offline a legutóbb szinkronizált adatokat mutatja.)"
          Icon={LayoutDashboard}
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
          <div className="py-12 text-center text-sm text-slate-400">Pénzügyi adatok betöltése…</div>
        ) : (
          <FinanceDashboard
            balances={balances}
            incomeRecords={income}
            expenseRecords={expense}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            settings={settings}
          />
        )}
      </div>
    </DesktopShell>
  )
}
