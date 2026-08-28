'use client'

/**
 * 2026-07-11 (S6-#3): ÉVKEZDŐ (nyitó) egyenlegek szerkesztője — Gyülekezet
 * beállításai → Pénzügy → „Nyitó egyenlegek" al-fül.
 *
 * A legelső (vagy bármely) év január 1-i készpénz- és bankszámla-egyenlegei
 * itt rögzíthetők/javíthatók — ezekből számolja a rendszer az egyenleg-láncot
 * évről évre. Zárt (véglegesített) év nyitója nem szerkeszthető.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, Loader2, Lock, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getOpeningBalancesSettings,
  saveOpeningBalancesSettings,
  type OpeningBalancesSettings,
} from '@/app/(dashboard)/penzugy/nyito-egyenleg-settings-actions'

interface BankAccountLite {
  id: number
  bank_neve: string
  valuta: string | null
  aktiv: boolean | null
}

/** forrasa → emberi címke a kis badge-hez. */
const FORRASA_LABEL: Record<string, string> = {
  manual: 'kézzel rögzítve',
  import: 'importból',
  carryover: 'előző évből áthozva',
}

export function OpeningBalancesManager({
  bankAccounts,
  congregationId,
}: {
  bankAccounts: BankAccountLite[]
  /** 2026-07-17 (F4 guard): a hívó felület gyülekezete — a server action hangos
   *  hibát ad, ha eltér az effektív scope-tól (néma rossz-gyülekezet írás ellen). */
  congregationId?: string
}) {
  const [data, setData] = useState<OpeningBalancesSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [cash, setCash] = useState<string>('')
  const [bankVals, setBankVals] = useState<Record<number, string>>({})
  const [bankRates, setBankRates] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const activeBanks = useMemo(
    () => bankAccounts.filter((b) => b.aktiv !== false),
    [bankAccounts],
  )

  const load = useCallback(async () => {
    const res = await getOpeningBalancesSettings(congregationId)
    if (res.error || !res.data) {
      setLoadError(res.error || 'Ismeretlen hiba.')
      return
    }
    setLoadError(null)
    setData(res.data)
    setYear((y) => y ?? res.data!.earliestYear)
  }, [congregationId])

  useEffect(() => {
    void load()
  }, [load])

  // Év-váltáskor (és betöltés után) a mezők a tárolt értékekre állnak.
  useEffect(() => {
    if (!data || year == null) return
    const cashRow = data.cashRows.find((r) => r.eve === year)
    // 2026-08-27 (Endre 2. kérése): ha NINCS rögzített készpénz-nyitó erre az
    // évre, az előző év zárójából LEVEZETETT javaslattal töltjük ki — de csak
    // KIÍRJUK, nem mentjük magától. A nyitó a hivatalos számadás kiindulópontja;
    // egy magától keletkező szám, amit senki nem nézett meg, pontosan az a
    // hibaosztály, ami az Excelben is megvan.
    const javaslat = data.cashSuggestions?.find((x) => x.eve === year)
    setCash(
      cashRow
        ? String(cashRow.nyito_egyenleg)
        : javaslat
          ? String(javaslat.ertek)
          : '',
    )
    const vals: Record<number, string> = {}
    const rates: Record<number, string> = {}
    for (const b of activeBanks) {
      const row = data.bankRows.find((r) => r.bankszamla_id === b.id && r.eve === year)
      // 2026-08-28 (Endre döntése: EGY nyitó-egyenleg forrás): a BANK-mező is
      // előtöltődik a levezetett értékkel — ugyanúgy, ahogy a készpénz.
      // Eddig ÜRESEN állt rögzítetlen évben, miközben a Számadás és a Registru
      // Banca már a levezetett számmal dolgozott: a lelkész azt hihette, hogy
      // nincs nyitója. Ha ez „az egy hely", nem mutathat üreset olyan számhoz,
      // amivel a rendszer már számol. MENTENI továbbra is KÉZZEL kell.
      const bankJavaslat = data.bankSuggestions?.find(
        (x) => x.bankszamla_id === b.id && x.eve === year,
      )
      vals[b.id] = row
        ? String(row.nyito_egyenleg_valuta)
        : bankJavaslat
          ? String(bankJavaslat.ertek)
          : ''
      rates[b.id] = row?.arfolyam != null ? String(row.arfolyam) : ''
    }
    setBankVals(vals)
    setBankRates(rates)
  }, [data, year, activeBanks])

  if (loadError) {
    return (
      <div className="rounded-[1rem] border border-red-200 bg-red-50/70 px-3 py-2.5 text-sm text-red-700">
        A nyitó egyenlegek betöltése sikertelen: {loadError}
      </div>
    )
  }
  if (!data || year == null) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Nyitó egyenlegek betöltése…
      </div>
    )
  }

  const isFinalized = data.finalizedYears.includes(year)
  const cashRow = data.cashRows.find((r) => r.eve === year)
  // Javaslat CSAK akkor releváns, ha még nincs rögzített sor erre az évre.
  const cashJavaslat = cashRow ? null : data.cashSuggestions?.find((x) => x.eve === year)
  // 2026-08-28: számla-azonosító → javaslat, hogy a sor-render ne keressen újra.
  const bankJavaslatById: Record<number, { ertek: number; forrasEv: number | null }> = {}
  for (const x of data.bankSuggestions ?? []) {
    if (x.eve === year) bankJavaslatById[x.bankszamla_id] = { ertek: x.ertek, forrasEv: x.forrasEv }
  }
  const vanBankJavaslat = Object.keys(bankJavaslatById).length > 0

  async function handleSave() {
    if (year == null) return
    const cashNum = cash.trim() === '' ? null : Number(cash)
    if (cashNum != null && !Number.isFinite(cashNum)) {
      toast.error('Érvénytelen készpénz-nyitó összeg.')
      return
    }
    const bankok: Array<{ bankszamla_id: number; nyito_valuta: number; arfolyam?: number | null }> = []
    for (const b of activeBanks) {
      const raw = (bankVals[b.id] ?? '').trim()
      if (raw === '') continue // üresen hagyott számlát nem írunk
      const val = Number(raw)
      if (!Number.isFinite(val)) {
        toast.error(`Érvénytelen nyitó összeg: ${b.bank_neve}.`)
        return
      }
      const isRon = (b.valuta || 'RON') === 'RON'
      const rateRaw = (bankRates[b.id] ?? '').trim()
      const rate = rateRaw === '' ? null : Number(rateRaw)
      if (!isRon && (rate == null || !Number.isFinite(rate) || rate <= 0)) {
        toast.error(`Valutás számlánál (${b.bank_neve}, ${b.valuta}) az árfolyam is kötelező.`)
        return
      }
      bankok.push({ bankszamla_id: b.id, nyito_valuta: val, arfolyam: isRon ? 1 : rate })
    }
    if (cashNum == null && bankok.length === 0) {
      toast.error('Adj meg legalább egy nyitó egyenleget.')
      return
    }
    // 2026-07-17 (F4 guard): az induló egyenleget jellemzően EGYSZER, rendszer-
    // induláskor kell megadni — CSAK akkor kérünk felülírás-megerősítést, ha a
    // mentés ténylegesen ÉRINT egy már rögzített sort (első rögzítésnél nem riaszt).
    const cashOverwrite = cashNum != null && !!data?.cashRows.some((r) => r.eve === year)
    const bankOverwrite = bankok.some((b) =>
      !!data?.bankRows.some((r) => r.eve === year && r.bankszamla_id === b.bankszamla_id),
    )
    if (cashOverwrite || bankOverwrite) {
      // Fail-closed: ha nincs window (elvi SSR-ág), inkább NEM mentünk megerősítés nélkül.
      if (typeof window === 'undefined') return
      const ok = window.confirm(
        `A(z) ${year}. évre már van rögzített nyitó egyenleg, és a mentés felülírná. Biztosan folytatod? ` +
          'A mentés után minden kassza- és bankegyenleg (és az évek közti átvitel) újraszámolódik.',
      )
      if (!ok) return
    }
    setSaving(true)
    try {
      const res = await saveOpeningBalancesSettings({
        eve: year,
        keszpenz: cashNum,
        bankok,
        expectedCongregationId: congregationId,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Nyitó egyenlegek mentve a(z) ${year}. évre.`)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1rem] border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs leading-5 text-sky-900">
        <strong>ℹ️ Mit jelent ez?</strong> Az itt megadott <strong>január 1-i</strong> évkezdő
        egyenlegekből számolja a rendszer a kassza- és bankegyenleget, az évek közti átvitelt
        és a számadás nyitó sorait. A <strong>legelső év</strong> nyitója a legfontosabb —
        ebből épül az összes későbbi év. A későbbi évek nyitóját a rendszer általában magától
        hozza át az előző évi záróból; itt csak akkor írd át, ha biztosan tudod, hogy hibás.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Év:</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          {data.availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
              {y === data.earliestYear ? ' (legelső év)' : ''}
            </option>
          ))}
        </select>
        {isFinalized && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            <Lock className="size-3.5" />
            Véglegesített év — a nyitó nem szerkeszthető
          </span>
        )}
      </div>

      {/* Készpénz */}
      <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Wallet className="size-4 text-teal-600" />
          <h4 className="text-sm font-semibold text-slate-800">Készpénz (kassza) nyitó — {year}. január 1.</h4>
          {cashRow && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
              {FORRASA_LABEL[cashRow.forrasa] || cashRow.forrasa}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            value={cash}
            disabled={isFinalized}
            onChange={(e) => setCash(e.target.value)}
            placeholder="pl. 1250.50"
            className="max-w-56"
          />
          <span className="text-sm text-slate-500">RON</span>
        </div>
        {/* 2026-08-27 (Endre 2. kérése): „automatikusan hozza át a tavalyi évből,
            csak ellenőrzésképpen írja ki az értéket". A mező ELŐRE KI VAN TÖLTVE
            a levezetett értékkel, de a mentés a lelkész döntése — a nyitó a
            hivatalos számadás kiindulópontja, oda nem kerülhet olyan szám,
            amit senki nem nézett meg. */}
        {cashJavaslat && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <strong>Erre az évre még nincs rögzített készpénz-nyitó.</strong> A mezőbe a{' '}
            {cashJavaslat.forrasEv ? `${cashJavaslat.forrasEv}. évi` : 'korábbi'} záró egyenlegből
            levezetett <strong>{cashJavaslat.ertek.toLocaleString('hu-HU')} RON</strong> került —{' '}
            <strong>ellenőrizd, és ha egyezik, mentsd el.</strong> Amíg nem mented, a rendszer
            minden alkalommal újraszámolja.
          </p>
        )}
      </div>

      {/* Bankszámlák */}
      <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Landmark className="size-4 text-sky-600" />
          <h4 className="text-sm font-semibold text-slate-800">Bankszámla-nyitók — {year}. január 1.</h4>
        </div>
        {activeBanks.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nincs aktív bankszámla — előbb a Bankszámlák fülön vegyél fel egyet.
          </p>
        ) : (
          <div className="space-y-3">
            {activeBanks.map((b) => {
              const valuta = b.valuta || 'RON'
              const isRon = valuta === 'RON'
              const row = data.bankRows.find((r) => r.bankszamla_id === b.id && r.eve === year)
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-full text-sm font-medium text-slate-700 sm:w-48 sm:shrink-0">
                    {b.bank_neve}
                    {row && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">
                        {FORRASA_LABEL[row.forrasa] || row.forrasa}
                      </span>
                    )}
                    {/* 2026-08-28: ha nincs rögzített sor, a mezőben LEVEZETETT
                        érték áll — ezt meg kell különböztetni a mentetttől, különben
                        a lelkész azt hinné, hogy már jóváhagyta. */}
                    {!row && bankJavaslatById[b.id] && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-normal text-amber-800">
                        levezetett — mentsd el
                      </span>
                    )}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={bankVals[b.id] ?? ''}
                    disabled={isFinalized}
                    onChange={(e) => setBankVals((s) => ({ ...s, [b.id]: e.target.value }))}
                    placeholder="nyitó összeg"
                    className="max-w-44"
                  />
                  <span className="text-sm text-slate-500">{valuta}</span>
                  {!isRon && (
                    <>
                      <Input
                        type="number"
                        step="0.0001"
                        value={bankRates[b.id] ?? ''}
                        disabled={isFinalized}
                        onChange={(e) => setBankRates((s) => ({ ...s, [b.id]: e.target.value }))}
                        placeholder="árfolyam"
                        className="max-w-32"
                      />
                      <span className="text-xs text-slate-400">RON/{valuta}</span>
                    </>
                  )}
                </div>
              )
            })}
            {/* 2026-08-28 (Endre döntése: EGY nyitó-egyenleg forrás) — a készpénz-savval
                azonos minta. Ennélkül az előtöltött szám ugyanúgy nézne ki, mint egy
                mentett érték. */}
            {vanBankJavaslat && (
              <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                <strong>A sárgával jelölt számlákra még nincs rögzített nyitó.</strong> A
                mezőbe a korábbi záró egyenlegből <strong>levezetett</strong> érték került —
                ellenőrizd, és ha egyezik, mentsd el. Amíg nem mented, a rendszer minden
                alkalommal újraszámolja.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || isFinalized}>
          {saving ? 'Mentés…' : 'Nyitó egyenlegek mentése'}
        </Button>
      </div>
    </div>
  )
}
