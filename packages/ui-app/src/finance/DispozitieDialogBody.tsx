'use client'

/**
 * Dispoziție de plată / încasare — dialog body (Dispozitie de plata_2026.xlsx).
 *
 *  - plata    → mentéskor automatikusan KIADÁST könyvel
 *  - incasare → mentéskor automatikusan BEVÉTELT könyvel
 *
 * Két mód: önálló kitöltés (új kassza-tételt is létrehoz), vagy meglévő
 * készpénzes kassza-tételből generálás (csak a számozott bizonylat).
 *
 * Kitöltés közben magyar magyarázat; a nyomtatott bizonylat (élő előnézet)
 * román nyelvű, kétpéldányos, román betűs összegkiírással.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Printer, Save } from 'lucide-react'
import { buildDispozitieHtml } from './official-documents'
import { formatRon, ronInWords } from './ron-in-words'
import { SearchableSelect } from './SearchableSelect'

export type DispozitieTipus = 'plata' | 'incasare'
export type DispozitieToastFn = (type: 'success' | 'error', message: string) => void

export interface DispozitieCategoryOption {
  id: number
  kod: string
  nev: string
}

export interface DispozitieKasszaOption {
  id: number
  datum: string
  osszeg: number
  partner: string
  iratszam: string
}

export interface DispozitieSaveInput {
  tipus: DispozitieTipus
  date: string
  name: string
  tisztseg: string
  amount: number
  cel: string
  ciTipus?: string
  ciSerie?: string
  ciNr?: string
  categoryId: number
  fromKasszaId?: number | null
}

export interface DispozitieDialogBodyProps {
  congregationName: string
  incomeCategories: DispozitieCategoryOption[]
  expenseCategories: DispozitieCategoryOption[]
  onGetNextNumber: (tipus: DispozitieTipus, year: number) => Promise<number>
  onListCashTransactions: (tipus: DispozitieTipus, year: number) => Promise<DispozitieKasszaOption[]>
  onSaveDispozitie: (input: DispozitieSaveInput) => Promise<{ success?: true; sorszam?: number; error?: string }>
  onPrint: (params: { mode: 'pdf' | 'browser'; html: string; filename?: string }) => Promise<void>
  onToast: DispozitieToastFn
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function DispozitieDialogBody({
  congregationName,
  incomeCategories,
  expenseCategories,
  onGetNextNumber,
  onListCashTransactions,
  onSaveDispozitie,
  onPrint,
  onToast,
}: DispozitieDialogBodyProps) {
  const [tipus, setTipus] = useState<DispozitieTipus>('plata')
  const [fromExisting, setFromExisting] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [name, setName] = useState('')
  const [tisztseg, setTisztseg] = useState('')
  const [amount, setAmount] = useState('')
  const [cel, setCel] = useState('')
  const [ciTipus, setCiTipus] = useState('CI')
  const [ciSerie, setCiSerie] = useState('')
  const [ciNr, setCiNr] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [kasszaOptions, setKasszaOptions] = useState<DispozitieKasszaOption[]>([])
  const [fromKasszaId, setFromKasszaId] = useState<number | ''>('')
  const [sorszam, setSorszam] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const year = useMemo(() => Number(date.slice(0, 4)), [date])
  const isPlata = tipus === 'plata'
  const categories = isPlata ? expenseCategories : incomeCategories
  const categoryOptions = useMemo(() => categories.map((c) => ({ id: c.id, label: c.nev })), [categories])

  useEffect(() => {
    let active = true
    onGetNextNumber(tipus, year).then((n) => { if (active) setSorszam(n) }).catch(() => { if (active) setSorszam(null) })
    return () => { active = false }
  }, [tipus, year, onGetNextNumber])

  useEffect(() => {
    if (!fromExisting) return
    let active = true
    onListCashTransactions(tipus, year).then((opts) => { if (active) setKasszaOptions(opts) }).catch(() => {})
    return () => { active = false }
  }, [fromExisting, tipus, year, onListCashTransactions])

  const amountNum = Number(amount) || 0

  const previewHtml = useMemo(
    () =>
      buildDispozitieHtml({
        congregationName: `Parohia Reformată ${congregationName}`,
        tipus,
        sorszam: sorszam ?? '—',
        date,
        name,
        tisztseg,
        amount: amountNum,
        cel,
        ciTipus,
        ciSerie,
        ciNr,
      }),
    [congregationName, tipus, sorszam, date, name, tisztseg, amountNum, cel, ciTipus, ciSerie, ciNr],
  )

  function applyKasszaSelection(id: number) {
    const opt = kasszaOptions.find((o) => o.id === id)
    if (!opt) return
    setAmount(String(opt.osszeg))
    setName(opt.partner)
    setDate(opt.datum)
  }

  async function handleSave() {
    if (!name.trim()) { onToast('error', 'A név kötelező.'); return }
    if (!(amountNum > 0)) { onToast('error', 'Az összeg pozitív szám kell legyen.'); return }
    if (!fromExisting && !categoryId) { onToast('error', 'Válassz kategóriát a könyveléshez.'); return }
    if (fromExisting && !fromKasszaId) { onToast('error', 'Válassz egy kassza-tételt.'); return }

    setBusy(true)
    try {
      const result = await onSaveDispozitie({
        tipus,
        date,
        name,
        tisztseg,
        amount: amountNum,
        cel,
        ciTipus: isPlata ? ciTipus : undefined,
        ciSerie: isPlata ? ciSerie : undefined,
        ciNr: isPlata ? ciNr : undefined,
        categoryId: categoryId ? Number(categoryId) : 0,
        fromKasszaId: fromExisting ? Number(fromKasszaId) : null,
      })
      if (result.error) { onToast('error', result.error); return }
      if (result.sorszam) setSorszam(result.sorszam)
      const booked = fromExisting ? 'hozzárendelve a meglévő tételhez' : isPlata ? 'kiadásként könyvelve' : 'bevételként könyvelve'
      onToast('success', `Dispoziție #${result.sorszam} mentve — ${booked} (${formatRon(amountNum)} RON).`)
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePrint(mode: 'pdf' | 'browser') {
    setBusy(true)
    try {
      await onPrint({ mode, html: previewHtml, filename: `Dispozitie_${tipus}_${sorszam ?? ''}_${date}.pdf` })
      onToast('success', mode === 'pdf' ? 'A bizonylat PDF elkészült.' : 'Megnyílt a nyomtatási előnézet.')
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A nyomtatás nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700/70">Dispoziție de plată / încasare</p>
        <h3 className="font-heading text-xl sm:text-2xl text-slate-800">Kifizetési / bevételezési rendelvény a kasszának</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          A <strong>plată</strong> (kifizetés) mentéskor <strong>kiadásként</strong>, az <strong>încasare</strong> (bevételezés)
          <strong> bevételként</strong> könyvelődik. Választhatsz: új tétel rögzítése, vagy egy meglévő készpénzes
          kassza-tételhez számozott bizonylat generálása.
          {sorszam != null && <> Sorszám: <strong>#{sorszam}/{year}</strong>.</>}
        </p>
      </div>

      {/* Típus + mód váltók */}
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setTipus('plata')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${isPlata ? 'bg-red-500 text-white' : 'text-slate-600'}`}>Plată — Kifizetés</button>
          <button type="button" onClick={() => setTipus('incasare')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${!isPlata ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}>Încasare — Bevételezés</button>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setFromExisting(false)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${!fromExisting ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>Új tétel</button>
          <button type="button" onClick={() => setFromExisting(true)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${fromExisting ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>Meglévő kassza-tételből</button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          {fromExisting && (
            <Field label="Kassza-tétel *" hint="Készpénzes tétel, amelyhez még nincs bizonylat">
              <select
                className={inputClass}
                value={fromKasszaId}
                onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ''; setFromKasszaId(id); if (id) applyKasszaSelection(Number(id)) }}
              >
                <option value="">— Válassz —</option>
                {kasszaOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.datum} · {formatRon(o.osszeg)} RON · {o.partner || o.iratszam}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Név (Numele şi prenumele) *" hint="Akinek fizetünk / akitől bevételezünk">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Tisztség (Funcţia)" hint="Pl. lelkész, gondnok, beszállító">
              <input className={inputClass} value={tisztseg} onChange={(e) => setTisztseg(e.target.value)} />
            </Field>
            <Field label="Összeg (RON) *" hint="A bizonylaton betűvel is megjelenik">
              <input className={inputClass} type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={fromExisting} />
            </Field>
            <Field label="Dátum *">
              <input className={inputClass} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} disabled={fromExisting} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Cél (Scopul plății / încasării)" hint="Mire/miből szól a tétel">
                <input className={inputClass} value={cel} onChange={(e) => setCel(e.target.value)} />
              </Field>
            </div>
            {!fromExisting && (
              <div className="sm:col-span-2">
                <Field label={isPlata ? 'Kiadás-kategória *' : 'Bevétel-kategória *'} hint="Ide könyvelődik — gépelj a kereséshez">
                  <SearchableSelect options={categoryOptions} value={categoryId} onChange={setCategoryId} />
                </Field>
              </div>
            )}
          </div>

          {isPlata && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Igazolvány típ." hint="Csak kifizetésnél">
                <select className={inputClass} value={ciTipus} onChange={(e) => setCiTipus(e.target.value)}>
                  <option value="CI">CI</option>
                  <option value="BI">BI</option>
                  <option value="Pașaport">Pașaport</option>
                </select>
              </Field>
              <Field label="Serie"><input className={inputClass} value={ciSerie} onChange={(e) => setCiSerie(e.target.value)} /></Field>
              <Field label="Nr"><input className={inputClass} value={ciNr} onChange={(e) => setCiNr(e.target.value)} /></Field>
            </div>
          )}

          {amountNum > 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Betűvel: <span className="text-slate-700">{ronInWords(amountNum)}</span></p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
              <Save className="size-4" /> Mentés és könyvelés
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50" onClick={() => void handlePrint('browser')} disabled={busy}>
              <Printer className="size-4" /> Nyomtatás
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50" onClick={() => void handlePrint('pdf')} disabled={busy}>
              <Save className="size-4" /> PDF
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 xl:sticky xl:top-2">
          <p className="px-1 pb-2 text-xs font-medium text-slate-500">Nyomtatási előnézet — A4 álló, két A5 példány (caserie + cotor)</p>
          <div className="mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <iframe title="Dispoziție előnézet" srcDoc={previewHtml} className="block h-[860px] w-full bg-white" />
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
