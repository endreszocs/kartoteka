'use client'

/**
 * MonetaryTab — közös monetár (címlet-számoló) tab (Sprint Q F1, v0.7.0).
 *
 * Címletenkénti készpénz-számolás, eltérés-mutatás a könyvelt egyenleghez képest.
 * Callback-ek:
 *   - `loadSnapshot(year)` — lekérdezi az aktuális denomination + count snapshotot
 *   - `saveSnapshot(year, items)` — elmenti a számolt darabszámokat
 *   - `onToast(msg, kind)` — UI-feedback
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Calculator,
  CircleAlert,
  Coins,
  Landmark,
  Printer,
  Save,
  Wallet,
  X,
} from 'lucide-react'

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@kartoteka/ui'

import { formatCurrency } from './helpers'
import {
  TRANSFER_TYPE_LABELS,
  type BankAccount,
  type InternalTransferRow,
  type MonetaryDenomination,
} from './types'

export type MonetaryToastKind = 'success' | 'error' | 'info'

export interface MonetarySnapshotResult {
  denominations: MonetaryDenomination[]
  counts: Record<number, number>
  error?: string | null
}

export interface MonetarySaveResult {
  success?: boolean
  error?: string | null
}

export interface MonetaryTabProps {
  expectedCashBalance: number
  currentYear: number
  bankAccounts: BankAccount[]
  internalTransfers: InternalTransferRow[]
  loadSnapshot: (year: number) => Promise<MonetarySnapshotResult>
  saveSnapshot: (
    year: number,
    items: Array<{ denominationId: number; count: number }>,
  ) => Promise<MonetarySaveResult>
  onToast?: (message: string, kind: MonetaryToastKind) => void
  /** Gyülekezet neve a nyomtatott címletjegyzék fejlécéhez. */
  congregationName?: string
  /** Nyomtatás callback (web: printToBrowser / printToPdf). Ha hiányzik, nincs gomb. */
  onPrint?: (params: { mode: 'pdf' | 'browser'; html: string; filename?: string }) => Promise<void>
}

function formatRon(value: number) {
  return `${formatCurrency(value)} RON`
}

function escHtml(v: string): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Nyomtatható monetár (címletjegyzék) — tiszta, festéktakarékos A4 álló lap. */
function buildMonetarSheetHtml(params: {
  congregationName: string
  year: number
  dateIso: string
  banknotes: MonetaryDenomination[]
  coins: MonetaryDenomination[]
  counts: Record<number, number>
  countedTotal: number
  expected: number
}): string {
  const { congregationName, year, dateIso, banknotes, coins, counts, countedTotal, expected } = params
  const diff = countedTotal - expected
  const rowsFor = (items: MonetaryDenomination[]) =>
    items
      .map((it) => {
        const db = counts[it.id] || 0
        return `<tr><td>${escHtml(it.displayValue)}</td><td>${escHtml(it.name)}</td><td class="c">${db}</td><td class="r">${formatCurrency(db * it.value)}</td></tr>`
      })
      .join('')
  const sub = (items: MonetaryDenomination[]) => items.reduce((s, it) => s + (counts[it.id] || 0) * it.value, 0)
  const table = (title: string, items: MonetaryDenomination[]) => `
    <div class="blk-title">${title}</div>
    <table class="mt">
      <thead><tr>
        <th style="width:22%">Valoare<br>Címlet</th>
        <th>Denumire<br>Megnevezés</th>
        <th style="width:14%">Buc.<br>Darab</th>
        <th style="width:24%">Sumă (RON)<br>Összeg (RON)</th>
      </tr></thead>
      <tbody>${rowsFor(items) || `<tr><td colspan="4" class="c muted">Fără valori / Nincs címlet</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td colspan="3" class="r">Total / Összesen</td><td class="r">${formatCurrency(sub(items))}</td></tr></tfoot>
    </table>`
  const diffLabel =
    diff === 0
      ? 'Diferență (corespunde) / Eltérés (egyezik)'
      : diff > 0
        ? 'Diferență (plus) / Eltérés (többlet)'
        : 'Diferență (minus) / Eltérés (hiány)'
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"/>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; }
    @media screen { body { padding: 14mm; } }
    .title { text-align: center; font-size: 18px; font-weight: bold; }
    .title-ro { text-align: center; font-size: 13px; font-weight: bold; color: #333; }
    .sub { text-align: center; font-size: 12px; color: #444; margin: 4px 0 16px; }
    .blk-title { font-weight: bold; font-size: 12px; margin: 14px 0 4px; }
    table.mt { width: 100%; border-collapse: collapse; }
    .mt th, .mt td { border: 1px solid #4b5563; padding: 4px 8px; font-size: 11px; }
    .mt th { text-align: left; font-weight: bold; background: #fff; line-height: 1.25; }
    .mt .c { text-align: center; } .mt .r { text-align: right; }
    .mt .muted { color: #777; font-style: italic; }
    .mt .tot td { font-weight: bold; border-top: 2px solid #111; }
    .summary { margin-top: 16px; width: 100%; border-collapse: collapse; }
    .summary td { border: 1px solid #4b5563; padding: 6px 8px; font-size: 12px; }
    .summary .lbl { font-weight: bold; width: 60%; }
    .summary .val { text-align: right; font-weight: bold; }
    .sig { display: flex; justify-content: space-between; gap: 40px; margin-top: 44px; font-size: 12px; }
    .sig .col { flex: 1; text-align: center; }
    .sig .line { border-top: 1px solid #111; margin-top: 34px; padding-top: 4px; }
  </style></head>
  <body>
    <div class="title-ro">MONETAR — Borderou de numerar</div>
    <div class="title">Monetár — Pénztári címletjegyzék</div>
    <div class="sub">${escHtml(congregationName)} · ${year} · Data / Dátum: ${escHtml(dateIso)}</div>
    ${table('Bancnote și 1 RON / Bankjegyek és 1 RON', banknotes)}
    ${table('Monede / Érmék', coins)}
    <table class="summary">
      <tr><td class="lbl">Suma numărată fizic / Fizikailag számolt összeg</td><td class="val">${formatCurrency(countedTotal)} RON</td></tr>
      <tr><td class="lbl">Sold de casă conform evidenței / Szoftver szerinti készpénzegyenleg</td><td class="val">${formatCurrency(expected)} RON</td></tr>
      <tr><td class="lbl">${diffLabel}</td><td class="val">${formatCurrency(Math.abs(diff))} RON</td></tr>
    </table>
    <div class="sig">
      <div class="col"><div class="line">Casier / Pénztáros — semnătura / aláírás</div></div>
      <div class="col"><div class="line">Verificat / Ellenőrizte — semnătura / aláírás</div></div>
    </div>
  </body></html>`
}

export function MonetaryTab({
  expectedCashBalance,
  currentYear,
  bankAccounts,
  internalTransfers,
  loadSnapshot,
  saveSnapshot,
  onToast,
  congregationName = '',
  onPrint,
}: MonetaryTabProps) {
  const [denominations, setDenominations] = useState<MonetaryDenomination[]>([])
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await loadSnapshot(currentYear)
    if (result.error) {
      onToast?.(result.error, 'error')
      setLoading(false)
      return
    }
    setDenominations(result.denominations)
    setCounts(result.counts)
    setLoading(false)
  }, [currentYear, loadSnapshot, onToast])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const countedTotal = useMemo(
    () =>
      denominations.reduce(
        (sum, d) => sum + d.value * (counts[d.id] || 0),
        0,
      ),
    [counts, denominations],
  )

  const grouped = useMemo(
    () => ({
      bankjegy: denominations.filter((item) => item.category === 'bankjegy'),
      erme: denominations.filter((item) => item.category === 'erme'),
    }),
    [denominations],
  )

  const banknoteCount = useMemo(
    () => grouped.bankjegy.reduce((sum, item) => sum + (counts[item.id] || 0), 0),
    [counts, grouped.bankjegy],
  )
  const coinCount = useMemo(
    () => grouped.erme.reduce((sum, item) => sum + (counts[item.id] || 0), 0),
    [counts, grouped.erme],
  )

  const difference = countedTotal - expectedCashBalance
  const exchangeTransfers = internalTransfers.filter((row) => row.tipus === 'valutacsere')
  const latestTransfers = internalTransfers.slice(0, 4)
  const activeCurrencies = Array.from(
    new Set(bankAccounts.map((account) => account.valuta || 'RON')),
  )

  function updateCount(denominationId: number, value: string) {
    const parsed = Math.max(0, Math.floor(Number(value) || 0))
    setCounts((current) => ({ ...current, [denominationId]: parsed }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveSnapshot(
        currentYear,
        denominations.map((d) => ({
          denominationId: d.id,
          count: counts[d.id] || 0,
        })),
      )
      if (result.error) {
        onToast?.(result.error, 'error')
        return
      }
      onToast?.('A monetár ellenőrzés mentve lett.', 'success')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const printDateIso = new Date().toISOString().slice(0, 10)
  const printHtml = useMemo(
    () =>
      buildMonetarSheetHtml({
        congregationName,
        year: currentYear,
        dateIso: printDateIso,
        banknotes: grouped.bankjegy,
        coins: grouped.erme,
        counts,
        countedTotal,
        expected: expectedCashBalance,
      }),
    [congregationName, currentYear, printDateIso, grouped, counts, countedTotal, expectedCashBalance],
  )

  async function doPrint(mode: 'pdf' | 'browser') {
    if (!onPrint) return
    setPrinting(true)
    try {
      await onPrint({ mode, html: printHtml, filename: `Monetar_${currentYear}_${printDateIso}.pdf` })
      onToast?.(mode === 'pdf' ? 'A monetár PDF elkészült.' : 'Megnyílt a nyomtatási ablak.', 'success')
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'A nyomtatás nem sikerült.', 'error')
    } finally {
      setPrinting(false)
    }
  }

  if (loading) {
    return (
      <div className="card-raised py-12 text-center text-sm text-slate-400">
        Monetár összeállítása folyamatban...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Calculator className="size-4 text-teal-600" />
                  Monetár
                </CardTitle>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Bal oldalon adja meg címletenként, mennyi készpénz van ténylegesen a
                  pénztárban vagy a lelkésznél. A rendszer azonnal megmutatja, hogy ez
                  hogyan viszonyul a könyvelt készpénzegyenleghez.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {onPrint && (
                  <Button
                    variant="outline"
                    className="rounded-full px-5"
                    onClick={() => setPrintOpen(true)}
                  >
                    <Printer className="mr-2 size-4" />
                    Nyomtatás
                  </Button>
                )}
                <Button
                  className="rounded-full bg-teal-600 px-5 hover:bg-teal-700"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="mr-2 size-4" />
                  {saving ? 'Mentés...' : 'Monetár mentése'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Szoftver szerint"
                value={formatRon(expectedCashBalance)}
                tone="teal"
                hint="A könyvelt készpénzes tételek alapján"
              />
              <MetricCard
                label="Fizikailag számolt"
                value={formatRon(countedTotal)}
                tone="amber"
                hint="Az itt rögzített címletek összege"
              />
              <MetricCard
                label="Eltérés"
                value={formatRon(Math.abs(difference))}
                tone={difference === 0 ? 'emerald' : difference > 0 ? 'sky' : 'rose'}
                hint={
                  difference === 0
                    ? 'A pénztár pontosan egyezik.'
                    : difference > 0
                      ? 'Többlet látható a kasszában.'
                      : 'Hiány mutatkozik a kasszában.'
                }
              />
            </div>

            <DenominationTable
              title="Bankjegyek és 1 RON"
              icon={<Landmark className="size-4 text-emerald-600" />}
              items={grouped.bankjegy}
              counts={counts}
              onChange={updateCount}
            />

            <DenominationTable
              title="Érmék"
              icon={<Coins className="size-4 text-amber-600" />}
              items={grouped.erme}
              counts={counts}
              onChange={updateCount}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Wallet className="size-4 text-violet-600" />
                Megjegyzések és háttér
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricBox label="Aktív bankszámlák" value={`${bankAccounts.length} db`} />
                <MetricBox
                  label="Használt pénznemek"
                  value={activeCurrencies.join(', ') || 'RON'}
                />
                <MetricBox label="Valutacserék" value={`${exchangeTransfers.length} tétel`} />
                <MetricBox label="Költségvetési év" value={`${currentYear}. év`} />
                <MetricBox label="Bankjegyek és 1 RON" value={`${banknoteCount} db`} />
                <MetricBox label="Érmék" value={`${coinCount} db`} />
              </div>

              <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/85 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="space-y-1.5">
                    <p className="font-semibold">Mire való a Monetár?</p>
                    <p className="leading-6 text-amber-800/90">
                      Ez az ellenőrző felület segít egyeztetni a tényleges készpénzt a
                      könyvelt készpénzegyenleggel. Ha eltérés van, a pénztár azonnal további
                      vizsgálatot igényel.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-white/70 bg-white/88 p-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.16)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Gyors ellenőrzési rend
                </p>
                <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>1. Számolja meg külön a bankjegyeket és külön az érméket.</li>
                  <li>
                    2. Írja be darabra pontosan az egyes címleteket a bal oldali táblába.
                  </li>
                  <li>3. Nézze meg, hogy az eltérés nulla-e, többlet-e vagy hiány.</li>
                  <li>4. Mentse el a pillanatképet, hogy visszakereshető maradjon.</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-800">Legutóbbi belső mozgások</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {latestTransfers.length === 0 ? (
                <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-500">
                  Még nincs rögzített belső mozgás ebben az évben.
                </div>
              ) : (
                latestTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="rounded-[1.25rem] border border-white/70 bg-white/88 p-3 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.16)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {TRANSFER_TYPE_LABELS[transfer.tipus]}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {transfer.datum} · {transfer.forras} → {transfer.cel}
                        </p>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-700">
                        {formatRon(transfer.osszeg)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Nyomtatási előnézet ablak (mint a Nyomtatási központban) */}
      {printOpen && onPrint && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-6"
          onClick={() => setPrintOpen(false)}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="flex items-center gap-2 font-heading text-lg text-slate-800">
                <Printer className="size-5 text-teal-600" />
                Monetár nyomtatása — előnézet
              </h3>
              <button
                type="button"
                aria-label="Bezárás"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setPrintOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
              <div className="mx-auto w-full max-w-[800px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <iframe title="Monetár előnézet" srcDoc={printHtml} className="block h-[68vh] w-full bg-white" />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Bezárás
              </button>
              <button
                type="button"
                onClick={() => void doPrint('browser')}
                disabled={printing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-white px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer className="size-4" /> {printing ? 'Nyomtatás…' : 'Nyomtatás'}
              </button>
              <button
                type="button"
                onClick={() => void doPrint('pdf')}
                disabled={printing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
              >
                <Save className="size-4" /> PDF mentés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DenominationTable({
  title,
  icon,
  items,
  counts,
  onChange,
}: {
  title: string
  icon: ReactNode
  items: MonetaryDenomination[]
  counts: Record<number, number>
  onChange: (denominationId: number, value: string) => void
}) {
  const total = items.reduce((sum, item) => sum + item.value * (counts[item.id] || 0), 0)

  return (
    <div className="space-y-4 rounded-[1.45rem] border border-slate-200/70 bg-white/92 p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.14)]">
      <div className="flex items-center gap-2 text-slate-800">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-500">
          Ehhez a csoporthoz jelenleg nincs megjeleníthető címlet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[1.2rem] border border-slate-200/70 bg-white/90">
          <table className="min-w-[520px] w-full text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-50/90">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Címlet
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Megnevezés
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Darab
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Összesen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {item.displayValue}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{item.name}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={counts[item.id] || 0}
                      onChange={(event) => onChange(item.id, event.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {formatRon((counts[item.id] || 0) * item.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-[1.3rem] bg-slate-50/85 px-4 py-3 ring-1 ring-slate-200/70">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {title} összesen
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-800">{formatRon(total)}</p>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: 'teal' | 'amber' | 'emerald' | 'sky' | 'rose'
  hint: string
}) {
  const toneClass = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className={`rounded-[1.35rem] px-4 py-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs opacity-80">{hint}</p>
    </div>
  )
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] bg-slate-50/85 px-4 py-3 ring-1 ring-slate-200/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
