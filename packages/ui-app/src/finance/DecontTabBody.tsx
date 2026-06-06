'use client'

/**
 * Decont (elszámolás) tab body — HIVATALOS sablon (Elszamolas_2026.xlsx).
 *
 * Az utólag előkerülő számlák összegyűjtése egy számozott elszámolási lapra.
 * A tételek mentéskor VALÓDI kiadás rekordot is létrehoznak az AKTUÁLIS
 * (decont) dátumra — a számla saját (régi) dátuma csak a dokumentumon látszik.
 *
 * Kitöltés közben minden mezőnél MAGYAR magyarázat; a nyomtatott dokumentum
 * (élő előnézet jobb oldalon) ROMÁN/kétnyelvű, a hivatalos elrendezés szerint.
 *
 * NEM importál környezet-függő modult — minden a callback-pattern-en megy be.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus, Printer, Save, Trash2 } from 'lucide-react'
import { buildDecontHtml, type DecontDocItem } from './official-documents'
import { formatRon } from './ron-in-words'
import { parseFlexibleDate } from './date-parse'
import { SearchableSelect } from './SearchableSelect'

// ── Típusok ──────────────────────────────────────────────────

export type DecontToastFn = (type: 'success' | 'error', message: string) => void

export interface DecontCategoryOption {
  id: number
  kod: string
  nev: string
}

export interface DecontSaveInput {
  date: string
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  defaultCategoryId: number
  items: Array<DecontDocItem & { id_kiadascel?: number | null }>
}

export interface DecontTabBodyProps {
  congregationName: string
  /** Kiadás-kategóriák a könyveléshez (id_kiadascel). */
  categories: DecontCategoryOption[]
  /** A következő decont-sorszám lekérése (megtekintés). */
  onGetNextNumber: (year: number) => Promise<number>
  /** Mentés: rögzíti a decont-ot + könyveli a tételeket kiadásként. */
  onSaveDecont: (input: DecontSaveInput) => Promise<{ success?: true; sorszam?: number; error?: string }>
  /** Nyomtatás callback (web: printToBrowser/printToPdf). */
  onPrint: (params: { mode: 'pdf' | 'browser'; html: string; filename?: string }) => Promise<void>
  onToast: DecontToastFn
}

type Row = {
  id: string
  actNr: string
  actType: string
  actDate: string
  issuer: string
  explanation: string
  amount: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function createRow(): Row {
  return { id: crypto.randomUUID(), actNr: '', actType: 'Fact', actDate: todayIso(), issuer: '', explanation: '', amount: '' }
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

// ── UI ────────────────────────────────────────────────────────

export function DecontTabBody({
  congregationName,
  categories,
  onGetNextNumber,
  onSaveDecont,
  onPrint,
  onToast,
}: DecontTabBodyProps) {
  const [personName, setPersonName] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [advance, setAdvance] = useState('0')
  const [jelleg, setJelleg] = useState('')
  const [dateRaw, setDateRaw] = useState(todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [rows, setRows] = useState<Row[]>([createRow()])
  const [sorszam, setSorszam] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const date = useMemo(() => parseFlexibleDate(dateRaw) || '', [dateRaw])
  const year = useMemo(() => (date ? Number(date.slice(0, 4)) : new Date().getFullYear()), [date])
  const categoryOptions = useMemo(() => categories.map((c) => ({ id: c.id, label: c.nev })), [categories])

  useEffect(() => {
    let active = true
    onGetNextNumber(year)
      .then((n) => { if (active) setSorszam(n) })
      .catch(() => { if (active) setSorszam(null) })
    return () => { active = false }
  }, [year, onGetNextNumber])

  const docItems: DecontDocItem[] = useMemo(
    () =>
      rows
        .filter((r) => Number(r.amount) > 0 || r.explanation.trim() || r.issuer.trim())
        .map((r) => ({
          actNr: r.actNr,
          actType: r.actType,
          actDate: r.actDate,
          issuer: r.issuer,
          explanation: r.explanation,
          amount: Number(r.amount) || 0,
        })),
    [rows],
  )

  const total = docItems.reduce((s, r) => s + r.amount, 0)
  const advanceNum = Number(advance) || 0
  const diff = total - advanceNum

  const previewHtml = useMemo(
    () =>
      buildDecontHtml({
        congregationName,
        sorszam: sorszam ?? '—',
        date,
        personName,
        jelleg,
        approvedBy,
        advance: advanceNum,
        items: docItems,
      }),
    [congregationName, sorszam, date, personName, jelleg, approvedBy, advanceNum, docItems],
  )

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, createRow()]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? cur : cur.filter((r) => r.id !== id))) }

  async function handleSave() {
    if (!personName.trim()) { onToast('error', 'Az elszámoló neve kötelező.'); return }
    if (!date) { onToast('error', 'A decont dátuma nem értelmezhető.'); return }
    if (!categoryId) { onToast('error', 'Válassz kiadás-kategóriát a könyveléshez.'); return }
    if (docItems.length === 0) { onToast('error', 'Legalább egy tétel szükséges.'); return }

    setBusy(true)
    try {
      const result = await onSaveDecont({
        date,
        personName,
        jelleg,
        approvedBy,
        advance: advanceNum,
        defaultCategoryId: Number(categoryId),
        items: docItems.map((r) => ({ ...r, id_kiadascel: Number(categoryId) })),
      })
      if (result.error) { onToast('error', result.error); return }
      if (result.sorszam) setSorszam(result.sorszam)
      setSaved(true)
      onToast('success', `Decont #${result.sorszam} mentve — a tételek kiadásként könyvelve (${formatRon(total)} RON).`)
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A decont mentése nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePrint(mode: 'pdf' | 'browser') {
    setBusy(true)
    try {
      await onPrint({ mode, html: previewHtml, filename: `Decont_${sorszam ?? ''}_${date}.pdf` })
      onToast('success', mode === 'pdf' ? 'A decont PDF elkészült.' : 'Megnyílt a nyomtatási előnézet.')
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A nyomtatás nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700/70">Decont / Elszámolás</p>
        <h3 className="font-heading text-xl sm:text-2xl text-slate-800">Utólag előkerülő számlák hivatalos rögzítése</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          A könyvelés nem enged korábbi dátumra rögzíteni. A decont segít: a tételek a <strong>mai (decont) dátumra</strong> kerülnek
          könyvelésre, miközben a számla saját régi dátuma a nyomtatott dokumentumon megjelenik. Mentéskor minden tétel
          <strong> kiadásként is könyvelődik</strong>. A lap sorszáma évente 1-től nő.
          {sorszam != null && <> Jelenlegi sorszám: <strong>#{sorszam}/{year}</strong>.</>}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        {/* ── Kitöltés (magyar magyarázattal) — bal oldal ── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Elszámoló neve *" hint="Aki az előleget felvette / a számlákat hozza">
              <input className={inputClass} value={personName} onChange={(e) => setPersonName(e.target.value)} />
            </Field>
            <Field label="Jóváhagyta" hint="Aki jóváhagyja (pl. gondnok, lelkész)">
              <input className={inputClass} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />
            </Field>
            <Field label="Elszámolás jellege" hint="Pl. „karbantartási kiadások”">
              <input className={inputClass} value={jelleg} onChange={(e) => setJelleg(e.target.value)} />
            </Field>
            <Field label="Kapott előleg (RON)" hint="0, ha nem volt előleg">
              <input className={inputClass} type="number" min={0} step={0.01} value={advance} onChange={(e) => setAdvance(e.target.value)} />
            </Field>
            <Field label="Decont dátum *" hint={date ? `Értelmezve: ${date} — erre a napra könyvelődnek a tételek` : 'Bármilyen formátum (pl. 2026.01.04)'}>
              <input className={`${inputClass} ${dateRaw.trim() && !date ? 'border-red-400' : ''}`} value={dateRaw} placeholder="pl. 2026.01.04" onChange={(e) => setDateRaw(e.target.value)} />
            </Field>
            <Field label="Kiadás-kategória *" hint="Ide könyveli a tételeket — gépelj a kereséshez">
              <SearchableSelect options={categoryOptions} value={categoryId} onChange={setCategoryId} />
            </Field>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">Irat sz.</th>
                  <th className="px-2 py-2 text-left">Típus</th>
                  <th className="px-2 py-2 text-left">Számla dátuma</th>
                  <th className="px-2 py-2 text-left">Kiállító</th>
                  <th className="px-2 py-2 text-left">Magyarázat</th>
                  <th className="px-2 py-2 text-right">Összeg</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5"><input className={inputClass} value={r.actNr} onChange={(e) => updateRow(r.id, { actNr: e.target.value })} /></td>
                    <td className="px-2 py-1.5">
                      <select className={inputClass} value={r.actType} onChange={(e) => updateRow(r.id, { actType: e.target.value })}>
                        <option value="Fact">Fact — Számla</option>
                        <option value="chit">chit — Nyugta</option>
                        <option value="bon">bon — Bizonylat</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><input className={inputClass} type="date" value={r.actDate} onChange={(e) => updateRow(r.id, { actDate: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={inputClass} value={r.issuer} onChange={(e) => updateRow(r.id, { issuer: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={inputClass} value={r.explanation} onChange={(e) => updateRow(r.id, { explanation: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} /></td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent" onClick={addRow}>
              <Plus className="size-4" /> Új sor
            </button>
            <div className="text-sm">
              <span className="text-slate-500">Összesen:</span> <strong className="text-slate-800">{formatRon(total)} RON</strong>
              <span className="ml-3 text-slate-500">{diff >= 0 ? 'Kifizetni' : 'Visszafizetni'}:</span>{' '}
              <strong className={diff >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatRon(Math.abs(diff))} RON</strong>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
              <Save className="size-4" /> {saved ? 'Mentve ✓ — újra menthető' : 'Mentés és könyvelés'}
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50" onClick={() => void handlePrint('browser')} disabled={busy}>
              <Printer className="size-4" /> Nyomtatás
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50" onClick={() => void handlePrint('pdf')} disabled={busy}>
              <Save className="size-4" /> PDF
            </button>
          </div>
        </div>

        {/* ── Élő előnézet (a tényleges nyomtatott dokumentum) — jobb oldal ── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 xl:sticky xl:top-2">
          <p className="px-1 pb-2 text-xs font-medium text-slate-500">Nyomtatási előnézet — a teljes A4-es dokumentum</p>
          <div className="mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <iframe title="Decont előnézet" srcDoc={previewHtml} className="block h-[860px] w-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium leading-none text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
