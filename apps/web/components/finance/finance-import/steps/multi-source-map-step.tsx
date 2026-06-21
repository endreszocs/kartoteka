'use client'

/**
 * Több-forrású hozzárendelés lépés (2026-06-20) — kötegelt import.
 *
 * A felhasználó EGYSZERRE olvassa be a Kasszát (készpénz, automatikus) ÉS az összes
 * bankszámla-lapot (A–F). Minden bank-laphoz hozzárendel egy bankszámlát; majd a
 * rendszer az összeset egyben elemzi, belső-mozgás kereszt-ellenőrzéssel, és egyetlen
 * import gombbal minden a helyére kerül.
 */

import { Landmark, Wallet, ArrowRight, ArrowLeft } from 'lucide-react'

import type { FinanceSheetPreview, BankszamlaOption } from '@/app/(dashboard)/penzugy/finance-import-types'

function ron(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

export function MultiSourceMapStep({
  sheets,
  bankszamlak,
  sheetBankMap,
  onSetMapping,
  onContinue,
  onBack,
  isLoading,
}: {
  sheets: FinanceSheetPreview[]
  bankszamlak: BankszamlaOption[]
  /** bank lapnév → bankszámla id (vagy null = kihagyva). */
  sheetBankMap: Record<string, number | null>
  onSetMapping: (sheetName: string, bankszamlaId: number | null) => void
  onContinue: () => void
  onBack: () => void
  isLoading: boolean
}) {
  const kassza = sheets.find((s) => s.isKasszaSheet)
  const banks = sheets.filter((s) => s.isBankSheet)
  const unassignedBanks = banks.filter((b) => sheetBankMap[b.sheetName] == null)
  // Egy bankszámlát ne lehessen két laphoz is rendelni
  const usedIds = new Set(
    Object.values(sheetBankMap).filter((v): v is number => typeof v === 'number'),
  )

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
      <h2 className="font-serif text-xl text-slate-800">Mit olvassunk be?</h2>
      <p className="mt-1 text-sm text-slate-500">
        A fájl több főkönyvi lapot tartalmaz. A <strong>készpénzt (Kassza)</strong> automatikusan
        beolvassuk; minden <strong>bankszámla-laphoz</strong> rendeld hozzá a megfelelő számládat.
        A végén egyetlen gombbal minden a helyére kerül — a belső mozgásokat is ellenőrizzük.
      </p>

      <ul className="mt-4 space-y-2">
        {kassza && (
          <li className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">Készpénz (Kassza)</p>
              <p className="text-xs text-slate-500">
                {kassza.rowCount} tétel
                {kassza.closingBalance != null && ` · év végi ${ron(kassza.closingBalance)}`} · automatikusan beolvasva
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              ✓ benne
            </span>
          </li>
        )}

        {banks.map((b) => {
          const assigned = sheetBankMap[b.sheetName] ?? null
          return (
            <li key={b.sheetName} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                  <Landmark className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">Bankszámla — {b.sheetName} lap</p>
                  <p className="text-xs text-slate-500">
                    {b.rowCount} tétel
                    {b.closingBalance != null && ` · év végi ${ron(b.closingBalance)}`}
                  </p>
                </div>
                {assigned == null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                    kihagyva
                  </span>
                )}
              </div>
              <div className="mt-2 pl-13">
                {bankszamlak.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Nincs felvett bankszámlád. Hozz létre egyet a Pénzügy → Bankszámlák menüben, majd
                    térj vissza.
                  </p>
                ) : (
                  <select
                    value={assigned ?? ''}
                    onChange={(e) => onSetMapping(b.sheetName, e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="">— hagyd ki ezt a lapot —</option>
                    {bankszamlak.map((acc) => (
                      <option
                        key={acc.id}
                        value={acc.id}
                        disabled={usedIds.has(acc.id) && assigned !== acc.id}
                      >
                        {acc.bank_neve}
                        {acc.iban ? ` · ${acc.iban}` : ''}
                        {acc.valuta && acc.valuta !== 'RON' ? ` · ${acc.valuta}` : ''}
                        {usedIds.has(acc.id) && assigned !== acc.id ? ' (már hozzárendelve)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {unassignedBanks.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          ⚠ {unassignedBanks.length} bankszámla-lap nincs hozzárendelve — ezeket kihagyjuk. Ha a
          belső mozgások párját is rögzíteni akarod, rendeld hozzá mindet.
        </p>
      )}

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
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Beolvasás…' : 'Az összes beolvasása'} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
