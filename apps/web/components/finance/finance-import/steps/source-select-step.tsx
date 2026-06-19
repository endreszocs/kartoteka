'use client'

/**
 * Forrás-választó lépés (2026-06-20) — a hivatalos Adatok_YYYY.xlsx több főkönyvi
 * lapot tartalmaz: „Kassza" (készpénz) + „A"–„F" (bankszámlák). Itt a felhasználó
 * kiválasztja, MELYIK lapot importálja, és bank-lap esetén MELYIK bankszámlához köti.
 */

import { Landmark, Wallet, ArrowRight, ArrowLeft } from 'lucide-react'

import type { FinanceSheetPreview, BankszamlaOption } from '@/app/(dashboard)/penzugy/finance-import-types'

function ron(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

export function SourceSelectStep({
  sheets,
  bankszamlak,
  selectedSheet,
  onSelectSheet,
  selectedBankszamlaId,
  onSelectBankszamla,
  onContinue,
  onBack,
  isLoading,
}: {
  /** A főkönyvi lapok (Kassza + A–F bankszámlák, amelyeken van adat). */
  sheets: FinanceSheetPreview[]
  bankszamlak: BankszamlaOption[]
  selectedSheet: string | null
  onSelectSheet: (sheetName: string) => void
  selectedBankszamlaId: number | null
  onSelectBankszamla: (id: number | null) => void
  onContinue: () => void
  onBack: () => void
  isLoading: boolean
}) {
  const selected = sheets.find((s) => s.sheetName === selectedSheet)
  const selectedIsBank = !!selected?.isBankSheet
  const canContinue = !!selected && (!selectedIsBank || selectedBankszamlaId != null)

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
      <h2 className="font-serif text-xl text-slate-800">Melyik könyvelést importálod?</h2>
      <p className="mt-1 text-sm text-slate-500">
        A fájl több főkönyvi lapot tartalmaz. Válaszd ki a forrást — a készpénzt (Kassza) vagy
        egy bankszámlát (A–F). Bankszámlánál válaszd ki, melyik számládhoz tartozik.
      </p>

      <ul className="mt-4 space-y-2">
        {sheets.map((s) => {
          const isSel = s.sheetName === selectedSheet
          const bank = !!s.isBankSheet
          return (
            <li key={s.sheetName}>
              <button
                type="button"
                onClick={() => onSelectSheet(s.sheetName)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                  isSel
                    ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    bank ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {bank ? <Landmark className="size-5" /> : <Wallet className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">
                    {bank ? `Bankszámla — „${s.sheetName}" lap` : 'Készpénz (Kassza)'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.rowCount} tétel
                    {s.openingBalance != null && ` · nyitó ${ron(s.openingBalance)}`}
                    {s.closingBalance != null && ` · év végi ${ron(s.closingBalance)}`}
                  </p>
                </div>
                <span
                  className={`size-4 shrink-0 rounded-full border-2 ${
                    isSel ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                  }`}
                />
              </button>

              {isSel && bank && (
                <div className="mt-2 ml-13 rounded-xl bg-sky-50/70 p-3 ring-1 ring-sky-100">
                  <label className="block text-xs font-medium text-sky-900">
                    Melyik bankszámládhoz tartozik ez a lap? <span className="text-rose-500">*</span>
                  </label>
                  {bankszamlak.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Még nincs felvett bankszámlád. Előbb hozz létre egyet a Pénzügy → Bankszámlák
                      menüben, majd térj vissza ide.
                    </p>
                  ) : (
                    <select
                      value={selectedBankszamlaId ?? ''}
                      onChange={(e) => onSelectBankszamla(e.target.value ? Number(e.target.value) : null)}
                      className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400"
                    >
                      <option value="">— válassz bankszámlát —</option>
                      {bankszamlak.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank_neve}
                          {b.iban ? ` · ${b.iban}` : ''}
                          {b.valuta && b.valuta !== 'RON' ? ` · ${b.valuta}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" /> Vissza
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || isLoading}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Elemzés…' : 'Tovább az áttekintésre'} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
