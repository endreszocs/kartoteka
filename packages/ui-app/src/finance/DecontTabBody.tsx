'use client'

/**
 * Decont (elszámolás) tab body — Sprint Q F3.1 (v0.7.10).
 *
 * A webes `apps/web/components/finance/decont-tab.tsx`-ből kiemelve a sharedba,
 * iOS-future-proof módon (callback prop-pattern). A nyomtatási logika
 * (`printToBrowser` / `printToPdf`) callback prop-ként megy be — a webes
 * implementáció a `lib/utils/print-engine-v2`-t hívja, a desktop oldalon
 * majd egy Tauri-natív nyomtatási adapter.
 *
 * Sablon-alapú elszámolási bizonylat: kapott előleg + tételek listája,
 * automata kifizetendő/visszafizetendő különbözet-számítás.
 *
 * NEM importál: `next/*`, `@/components/ui/*`, sonner — minden környezet-
 * függőség callback-pattern-rel megy be.
 */

import { useMemo, useState } from 'react'
import { Plus, Printer, Save } from 'lucide-react'

// ── Típusok ──────────────────────────────────────────────────

type DecontRow = {
  id: string
  actNr: string
  actType: string
  actDate: string
  issuer: string
  explanation: string
  amount: string
}

export type DecontToastFn = (type: 'success' | 'error', message: string) => void

export interface DecontTabBodyProps {
  congregationName: string
  /**
   * Nyomtatás callback. A `mode` szerint a wrapper a webes `printToBrowser`
   * vagy `printToPdf` függvényt hívja. A `filename` csak PDF-mode-ban kell.
   */
  onPrint: (params: {
    mode: 'pdf' | 'browser'
    html: string
    filename?: string
  }) => Promise<void>
  /** Toast callback — a wrapper sonner / Tauri-toast / natív iOS UIAlertController-rel implementálja. */
  onToast: DecontToastFn
}

// ── Helper-ek ────────────────────────────────────────────────

function createRow(): DecontRow {
  return {
    id: crypto.randomUUID(),
    actNr: '',
    actType: 'fact',
    actDate: new Date().toISOString().slice(0, 10),
    issuer: '',
    explanation: '',
    amount: '',
  }
}

function buildDecontHtml(params: {
  congregationName: string
  personName: string
  approvedBy: string
  advanceAmount: number
  settlementNature: string
  issueNumber: string
  issueDate: string
  rows: Array<{ actNr: string; actType: string; actDate: string; issuer: string; explanation: string; amount: number }>
}) {
  const total = params.rows.reduce((sum, row) => sum + row.amount, 0)
  const difference = total - params.advanceAmount
  const rows = params.rows
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${row.actNr || '—'}</td>
          <td>${row.actType}</td>
          <td>${row.actDate || '—'}</td>
          <td>${row.issuer || '—'}</td>
          <td>${row.explanation || '—'}</td>
          <td class="right">${row.amount.toFixed(2)}</td>
        </tr>`,
    )
    .join('')

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; }
          .page { width: 186mm; margin: 0 auto; }
          .title { text-align: center; font-size: 20px; font-weight: 700; margin: 8px 0 2px; }
          .subtitle { text-align: center; font-size: 12px; color: #475569; margin-bottom: 12px; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-bottom: 12px; }
          .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
          th { background: #f8fafc; text-align: left; }
          .right { text-align: right; }
          .summary { margin-top: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .summary .box strong { display: block; font-size: 17px; margin-top: 6px; }
          .footer { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .sign { margin-top: 48px; border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="title">DECONT DE CHELTUIELI / ELSZÁMOLÁS</div>
          <div class="subtitle">${params.congregationName}</div>
          <div class="meta">
            <div class="box"><strong>Név</strong><br/>${params.personName || '—'}</div>
            <div class="box"><strong>Jóváhagyta</strong><br/>${params.approvedBy || '—'}</div>
            <div class="box"><strong>Elszámolás jellege</strong><br/>${params.settlementNature || '—'}</div>
            <div class="box"><strong>Irat sz. / dátum</strong><br/>${params.issueNumber || '—'} / ${params.issueDate || '—'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sz.</th>
                <th>Irat sz.</th>
                <th>Irat</th>
                <th>Irat dátum</th>
                <th>Kiállító</th>
                <th>Magyarázat</th>
                <th>Összeg</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7">Nincs rögzített tétel.</td></tr>'}</tbody>
          </table>
          <div class="summary">
            <div class="box">Kapott előleg<strong>${params.advanceAmount.toFixed(2)} RON</strong></div>
            <div class="box">Összes költség<strong>${total.toFixed(2)} RON</strong></div>
            <div class="box">${difference >= 0 ? 'Kifizetendő különbözet' : 'Visszafizetendő különbözet'}<strong>${Math.abs(difference).toFixed(2)} RON</strong></div>
          </div>
          <div class="footer">
            <div class="sign">Elszámolta (aláírás)</div>
            <div class="sign">Jóváhagyta</div>
          </div>
        </div>
      </body>
    </html>
  `
}

// ── UI komponens ─────────────────────────────────────────────

export function DecontTabBody({ congregationName, onPrint, onToast }: DecontTabBodyProps) {
  const [personName, setPersonName] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('0')
  const [settlementNature, setSettlementNature] = useState('Utólagos elszámolás')
  const [issueNumber, setIssueNumber] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<DecontRow[]>([createRow()])
  const [busy, setBusy] = useState(false)

  const normalizedRows = useMemo(
    () =>
      rows
        .filter(row => row.explanation.trim() || Number(row.amount) > 0)
        .map(row => ({
          ...row,
          amount: Number(row.amount) || 0,
        })),
    [rows],
  )

  const totalAmount = normalizedRows.reduce((sum, row) => sum + row.amount, 0)
  const difference = totalAmount - (Number(advanceAmount) || 0)

  function updateRow(id: string, patch: Partial<DecontRow>) {
    setRows(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows(current => [...current, createRow()])
  }

  function removeRow(id: string) {
    setRows(current => (current.length === 1 ? current : current.filter(row => row.id !== id)))
  }

  async function handlePrint(mode: 'pdf' | 'browser') {
    if (!personName.trim()) {
      onToast('error', 'Az elszámoló személy neve kötelező.')
      return
    }

    const html = buildDecontHtml({
      congregationName,
      personName,
      approvedBy,
      advanceAmount: Number(advanceAmount) || 0,
      settlementNature,
      issueNumber,
      issueDate,
      rows: normalizedRows,
    })

    setBusy(true)
    try {
      if (mode === 'pdf') {
        await onPrint({ mode: 'pdf', html, filename: `Elszamolas_${issueDate || 'dokumentum'}.pdf` })
        onToast('success', 'Az elszámolás PDF elkészült.')
      } else {
        await onPrint({ mode: 'browser', html })
        onToast('success', 'Megnyílt a nyomtatási előnézet.')
      }
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Az elszámolás nyomtatása nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ' +
    'transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium ' +
    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 ' +
    'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="space-y-4">
      <div className="card-raised p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700/70">Decont / Elszámolás</p>
        <h3 className="font-heading text-2xl text-slate-800">Utólagos hiánypótlás és előleg-elszámolás</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Akkor hasznos, ha egy nyugta vagy számla utólag kerül elő, vagy ha valaki előleget vett fel, és abból több tételt kell hivatalosan elszámolni.
          A lap az `Elszamolas_2026.xlsx` mintája szerint vezeti végig az iratokat, a különbözetet és a jóváhagyást.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <div className="card-raised space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Elszámoló neve *</label>
              <input className={inputClass} value={personName} onChange={event => setPersonName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Jóváhagyta</label>
              <input className={inputClass} value={approvedBy} onChange={event => setApprovedBy(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Elszámolás jellege</label>
              <input className={inputClass} value={settlementNature} onChange={event => setSettlementNature(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Kapott előleg (RON)</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={advanceAmount} onChange={event => setAdvanceAmount(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Irat sz.</label>
              <input className={inputClass} value={issueNumber} onChange={event => setIssueNumber(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Dátum</label>
              <input className={inputClass} type="date" value={issueDate} onChange={event => setIssueDate(event.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left">Irat sz.</th>
                  <th className="px-3 py-3 text-left">Irat típusa</th>
                  <th className="px-3 py-3 text-left">Irat dátum</th>
                  <th className="px-3 py-3 text-left">Kiállító</th>
                  <th className="px-3 py-3 text-left">Magyarázat</th>
                  <th className="px-3 py-3 text-right">Összeg</th>
                  <th className="px-3 py-3 text-right">Művelet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2"><input className={inputClass} value={row.actNr} onChange={event => updateRow(row.id, { actNr: event.target.value })} /></td>
                    <td className="px-3 py-2">
                      <select value={row.actType} onChange={event => updateRow(row.id, { actType: event.target.value })} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
                        <option value="fact">Számla</option>
                        <option value="chit">Nyugta</option>
                        <option value="bon">Bizonylat</option>
                      </select>
                    </td>
                    <td className="px-3 py-2"><input className={inputClass} type="date" value={row.actDate} onChange={event => updateRow(row.id, { actDate: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className={inputClass} value={row.issuer} onChange={event => updateRow(row.id, { issuer: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className={inputClass} value={row.explanation} onChange={event => updateRow(row.id, { explanation: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className={inputClass} type="number" min={0} step={0.01} value={row.amount} onChange={event => updateRow(row.id, { amount: event.target.value })} /></td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 hover:bg-accent hover:text-accent-foreground"
                        onClick={() => removeRow(row.id)}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
              onClick={addRow}
            >
              <Plus className="size-4" />
              Új sor
            </button>
            <div className="text-xs text-slate-500">A hivatalos mintában egy lapra kb. 20 sor fér. Ha több van, új elszámolási lapot érdemes nyitni.</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-raised p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Összesítés</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">Kapott előleg</div>
                <div className="mt-2 text-2xl font-semibold text-slate-800">{(Number(advanceAmount) || 0).toFixed(2)} RON</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">Összes költség</div>
                <div className="mt-2 text-2xl font-semibold text-slate-800">{totalAmount.toFixed(2)} RON</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">{difference >= 0 ? 'Kifizetendő' : 'Visszafizetendő'} különbözet</div>
                <div className={`mt-2 text-2xl font-semibold ${difference >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {Math.abs(difference).toFixed(2)} RON
                </div>
              </div>
            </div>
          </div>

          <div className="card-raised space-y-3 p-5">
            <h4 className="font-heading text-lg text-slate-800">Használati logika</h4>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>1. Itt az utólag érkező számlák és nyugták egyetlen elszámolási lapra gyűjthetők össze.</li>
              <li>2. A kapott előleg és az összes költség különbözete alapján látszik, hogy kifizetni vagy visszafizetni kell.</li>
              <li>3. A nyomtatási előnézetből PDF is készíthető, vagy egyből átadható a nyomtatónak.</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                onClick={() => void handlePrint('browser')}
                disabled={busy}
              >
                <Printer className="size-4" />
                Nyomtatás
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50"
                onClick={() => void handlePrint('pdf')}
                disabled={busy}
              >
                <Save className="size-4" />
                PDF mentés
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
