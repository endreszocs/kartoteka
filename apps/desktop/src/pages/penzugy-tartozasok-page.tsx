/**
 * Pénzügy → Tartozások oldal — `/penzugy/tartozasok` (2026-06-10 paritás A4).
 *
 * A MEGOSZTOTT `@kartoteka/ui-app` `DebtTab` komponenst renderli — azonos a
 * webbel. A tagok hátralékát a KÖZÖS motor (`computeJarulekForMemberYear`)
 * számolja, a desktop lokális adatából (tagok, egyházfenntartási befizetések,
 * felmentések, kedvezmények, évenkénti beállítások) → web == desktop.
 *
 * ⚠️ A hátralék-számokat a web számaihoz kell hitelesíteni (ugyanazon a
 * gyülekezeten ugyanaz jöjjön ki). A `debtCalcMode` itt 'akkori' (alapértelmezés
 * — a `tartozas_szamitas_mod` nincs a lokális cache-ben). A bérleti hátralék
 * (rentalDebtRows) egyelőre nincs (külön szinkron) — opcionális prop, elhagyva.
 */

import { useCallback, useEffect, useState } from 'react'
import { Scale } from 'lucide-react'

import { Label } from '@kartoteka/ui'
import {
  PageHero,
  DebtTab,
  type DebtRow,
  type JarulekPaymentLike,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile, getLocalMembersOfOwnCongregation } from '../lib/sync'
import { getLocalBefizetesek, pullBefizetesek } from '../lib/finance-sync'
import { pullFinanceCategories, getLocalBevCelMap } from '../lib/finance-categories-sync'
import { pullFinanceSettings, getLocalYearSettings, getLocalYearlyFees } from '../lib/finance-settings-sync'
import { pullDebtData, getLocalExemptions, getLocalDiscounts } from '../lib/finance-debt-sync'
import { buildDebtRows } from '../lib/finance-debt-compute'

export function PenzugyTartozasokPage() {
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const [debtRows, setDebtRows] = useState<DebtRow[]>([])
  const [yearlyFees, setYearlyFees] = useState<Record<number, number>>({})

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

      // Online-first best-effort: befizetés + kategóriák + beállítás + tartozás-adat.
      await Promise.allSettled([
        pullBefizetesek(congId, year),
        pullFinanceCategories(),
        pullFinanceSettings(congId, year),
        pullDebtData(congId),
      ])

      const [members, befizetesek, bevCelMap, exemptions, discounts, yearSettings, fees] = await Promise.all([
        getLocalMembersOfOwnCongregation(user.id, { onlyVisible: true }),
        getLocalBefizetesek(congId, year),
        getLocalBevCelMap(),
        getLocalExemptions(congId),
        getLocalDiscounts(congId),
        getLocalYearSettings(congId),
        getLocalYearlyFees(congId),
      ])

      // Egyházfenntartási (101.01) befizetések szűrése a kategória-térképpel,
      // a motor `JarulekPaymentLike` alakjára képezve (mint a web).
      const maintenancePayments: JarulekPaymentLike[] = befizetesek
        .filter((b) => (bevCelMap[b.id_befizetescel] || '').startsWith('101.01'))
        .map((b) => ({
          id_szemely: b.id_szemely ?? null,
          id_csalad: b.id_csalad ?? null,
          datum: b.datum ?? null,
          fizetettev: b.fizetettev ?? null,
          osszeg: b.osszeg,
        }))

      const rows = buildDebtRows({
        members: members.map((m) => ({
          id: m.id,
          csaladnev: m.csaladnev,
          k_nev: m.k_nev,
          sz_datum: m.sz_datum,
          foglalkozas: m.foglalkozas,
          meghalt: m.meghalt,
          member_status: m.member_status,
          family_id: m.family_id,
        })),
        maintenancePayments,
        exemptions,
        discounts,
        yearSettings,
        year,
        debtCalcMode: 'akkori',
      })

      setDebtRows(rows)
      setYearlyFees(fees)
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
          eyebrow="Pénzügy · Tartozások"
          title="Tartozások"
          description="A tagok egyházfenntartói járulék-hátraléka — ugyanazzal a számítással, mint a webfelületen. (Offline a legutóbb szinkronizált adatokat mutatja.)"
          Icon={Scale}
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
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Tartozások számítása…</div>
        ) : (
          <DebtTab
            debtRows={debtRows}
            yearlyFees={yearlyFees}
            currentYear={year}
            debtCalcMode="akkori"
          />
        )}
      </div>
    </DesktopShell>
  )
}
