/**
 * Pénzügy → Tranzakciók oldal — `/penzugy/tranzakciok` (2026-06-10).
 *
 * Desktop↔web paritás A-hullám: ez az oldal a MEGOSZTOTT `@kartoteka/ui-app`
 * `TransactionsTab` komponenst renderli — pontosan ugyanazt, amit a web is
 * használ. A desktop a lokális SQLite cache-ből táplálja (offline-first):
 * a befizetés/kiadás sorokat a `finance-adapters` képezi le a megosztott
 * típusokra, a kategória-térképeket a `finance-categories-sync` adja.
 *
 * Read-only nézet — nem érinti az offline írási utat (a bevitel a meglévő
 * Bevétel/Kiadás oldalakon marad a C-hullámig).
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'

import {
  PageHero,
  TransactionsTab,
  type BefitetesRow,
  type KiadasRow,
  type SzamadasiCel,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopUser } from '../lib/desktop-user'
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
  getLocalSzamadasiCellek,
} from '../lib/finance-categories-sync'
import { toBefitetesRow, toKiadasRow } from '../lib/finance-adapters'

export function PenzugyTranzakciokPage() {
  const [loading, setLoading] = useState(true)
  const [income, setIncome] = useState<BefitetesRow[]>([])
  const [expense, setExpense] = useState<KiadasRow[]>([])
  const [bevCelMap, setBevCelMap] = useState<Record<number, string>>({})
  const [kiaCelMap, setKiaCelMap] = useState<Record<number, string>>({})
  const [szamadasiCellek, setSzamadasiCellek] = useState<SzamadasiCel[]>([])
  const [congregationName, setCongregationName] = useState('')
  const year = new Date().getFullYear()

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

      // Online-first best-effort frissítés; offline esetén a lokális cache marad.
      await Promise.allSettled([
        pullBefizetesek(congId, year),
        pullKiadasok(congId, year),
        pullFinanceCategories(),
      ])

      const cong = await getLocalOwnCongregation(user.id)
      setCongregationName(cong?.nev_hu || cong?.name || '')

      const [bef, kia, bevMap, kiaMap, cells] = await Promise.all([
        getLocalBefizetesek(congId, year),
        getLocalKiadasok(congId, year),
        getLocalBevCelMap(),
        getLocalKiaCelMap(),
        getLocalSzamadasiCellek(),
      ])
      setIncome(bef.map(toBefitetesRow))
      setExpense(kia.map(toKiadasRow))
      setBevCelMap(bevMap)
      setKiaCelMap(kiaMap)
      setSzamadasiCellek(cells)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Tranzakciók"
          title="Tranzakciók"
          description="A gyülekezet bevételei és kiadásai egy listában — kategóriánként, kereshetően. Ugyanaz a nézet, mint a webfelületen. (Offline a legutóbb szinkronizált adatokat mutatja.)"
          Icon={ArrowLeftRight}
        />
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Tranzakciók betöltése…</div>
        ) : (
          <TransactionsTab
            incomeRecords={income}
            expenseRecords={expense}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            congregationName={congregationName}
            onRefresh={() => void load()}
          />
        )}
      </div>
    </DesktopShell>
  )
}
