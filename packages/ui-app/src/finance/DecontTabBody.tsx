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
 *
 * 2026-07-10 (S4-decont): újradizájn —
 *  - látható (fehér, keretes) mezők fókusz-gyűrűvel minden inputon/selecten,
 *  - szekcionált űrlap: Alapadatok / Dátum és kategória / Tételek,
 *  - tétel-tábla: fejléc-háttér + zebra-sorok + kiemelt összesítő-sor,
 *  - a gombsor elkülönülő alsó sávban,
 *  - mobil: az előnézet a form ALÁ kerül (grid-cols-1 → lg:grid-cols-2),
 *  - előnézet: pixelhű, scroll-mentes A4 (fit-to-width, ResizeObserver +
 *    transform:scale — a FinancePrintDialogBody mintája).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { decontElolegUzenet } from '@kartoteka/core'
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
  /** 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`) — a
   *  DECONT „Unitate" sávjába, a magyar név mellé. OPCIONÁLIS: a desktop hívói
   *  e nélkül is fordulnak, ott csak a magyar név áll az íven. */
  congregationNameRo?: string
  /** Kiadás-kategóriák a könyveléshez (id_kiadascel). */
  categories: DecontCategoryOption[]
  /** A következő decont-sorszám lekérése (megtekintés). */
  onGetNextNumber: (year: number) => Promise<number>
  /** Mentés: rögzíti a decont-ot + könyveli a tételeket kiadásként. */
  onSaveDecont: (input: DecontSaveInput) => Promise<{ success?: true; sorszam?: number; error?: string }>
  /** Nyomtatás callback (web: printToBrowser/printToPdf). */
  onPrint: (params: { mode: 'pdf' | 'browser'; html: string; filename?: string }) => Promise<void>
  onToast: DecontToastFn
  /** #Endre 2026-07-01: előtöltés (pl. a Nyugtafigyelő „hiányzó nyugták" gombjából). */
  prefill?: DecontPrefill
}

/** Előtöltő adatok a Decont ablakhoz — pl. a hiányzó nyugták utólagos elszámolásához. */
export interface DecontPrefill {
  /** Elszámolási (könyvelési) dátum — alap: ma. */
  date?: string
  personName?: string
  jelleg?: string
  /** Kiadás-kategória (id_kiadascel). */
  categoryId?: number
  /** Előtöltött tétel-sorok Irat sz.-ai (pl. a hiányzó nyugták: 24, 225, 313). */
  actNumbers?: string[]
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

// 2026-07-10 (S4-decont): LÁTHATÓ mezők — fehér háttér, slate-300 keret,
// shadow-sm + violet fókusz-gyűrű (a régi bg-transparent beleolvadt a kártyába).
const inputClass =
  'flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-800 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

// A tétel-tábla celláiba kompaktabb (h-8) változat.
const cellInputClass =
  'flex h-8 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30'

// A SearchableSelect belső inputja saját (bg-transparent) osztályt hordoz —
// a wrapperen keresztül tesszük láthatóvá (a komponens másik agens-szabály
// miatt nem módosítható innen).
const searchableFix = '[&_input]:rounded-lg [&_input]:border-slate-300 [&_input]:bg-white'

// ── Pixelhű A4 előnézet ──────────────────────────────────────
// 2026-07-10 (S4-decont): fit-to-width — a FinancePrintDialogBody mintája
// (ResizeObserver + docW=A4 px + transform:scale). Ide duplikálva, mert a
// feladat-szabály szerint új megosztott fájl nem hozható létre.
// 210mm ≈ 794px (96 dpi) + ráhagyás, hogy a mm-alapú lap biztosan elférjen.
const A4_PREVIEW_W = 812

function A4Preview({ html, title }: { html: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [contentH, setContentH] = useState(1123) // A4 magasság px-ben (297mm)

  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const measure = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    if (h > 0) setContentH(h)
  }

  // srcDoc-váltás után újramérés (a betűtípus-betöltés miatt kis késleltetéssel is).
  useEffect(() => {
    const t = setTimeout(() => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
      if (h > 0) setContentH(h)
    }, 120)
    return () => clearTimeout(t)
  }, [html])

  const targetW = boxW > 0 ? Math.max(0, boxW - 16) : A4_PREVIEW_W
  const scale = Math.min(1, targetW / A4_PREVIEW_W)
  const scaledW = Math.round(A4_PREVIEW_W * scale)
  const scaledH = Math.round(contentH * scale)

  return (
    <div ref={boxRef} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md"
        style={{ width: scaledW, height: scaledH }}
      >
        <iframe
          ref={iframeRef}
          onLoad={measure}
          title={title}
          srcDoc={html}
          style={{
            width: A4_PREVIEW_W,
            height: contentH,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#fff',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

// ── UI ────────────────────────────────────────────────────────

export function DecontTabBody({
  congregationName,
  congregationNameRo,
  categories,
  onGetNextNumber,
  onSaveDecont,
  onPrint,
  onToast,
  prefill,
}: DecontTabBodyProps) {
  const [personName, setPersonName] = useState(prefill?.personName ?? '')
  const [approvedBy, setApprovedBy] = useState('')
  const [advance, setAdvance] = useState('0')
  const [jelleg, setJelleg] = useState(prefill?.jelleg ?? '')
  const [dateRaw, setDateRaw] = useState(prefill?.date || todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>(prefill?.categoryId ?? '')
  const [rows, setRows] = useState<Row[]>(
    // #Endre 2026-07-01: előtöltött Irat sz.-ok (hiányzó nyugták) → minden szám egy külön sor.
    prefill?.actNumbers?.length
      ? prefill.actNumbers.map((n) => ({ ...createRow(), actNr: n }))
      : [createRow()],
  )
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
        congregationNameRo,
        sorszam: sorszam ?? '—',
        date,
        personName,
        jelleg,
        approvedBy,
        advance: advanceNum,
        items: docItems,
      }),
    [congregationName, congregationNameRo, sorszam, date, personName, jelleg, approvedBy, advanceNum, docItems],
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

      {/* 2026-07-10 (S4-decont): mobil = 1 oszlop (előnézet a form ALATT), lg-től 2 oszlop. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* ── Kitöltés (magyar magyarázattal) — bal oldal ── */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <Section title="Alapadatok">
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
            </div>
            {/* 2026-08-14 (Endre kérése, „Változások 2026"): elszámolási előleg
                készpénzben legfeljebb 1 000 lej/nap/személy — figyelmeztet,
                nem blokkol (a közös szabály a @kartoteka/core-ban). */}
            {(() => {
              const w = decontElolegUzenet(advanceNum)
              if (!w) return null
              return (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p>{w.uzenet}</p>
                </div>
              )
            })()}
          </Section>

          <Section title="Dátum és kategória">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Decont dátum *" hint={date ? `Értelmezve: ${date} — erre a napra könyvelődnek a tételek` : 'Bármilyen formátum (pl. 2026.01.04)'}>
                <input className={`${inputClass} ${dateRaw.trim() && !date ? '!border-red-400 focus:!ring-red-500/30' : ''}`} value={dateRaw} placeholder="pl. 2026.01.04" onChange={(e) => setDateRaw(e.target.value)} />
              </Field>
              <Field label="Kiadás-kategória *" hint="Ide könyveli a tételeket — gépelj a kereséshez">
                <SearchableSelect className={searchableFix} options={categoryOptions} value={categoryId} onChange={setCategoryId} />
              </Field>
            </div>
          </Section>

          <Section title="Tételek">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-2 py-2.5 text-left">Irat sz.</th>
                    <th className="px-2 py-2.5 text-left">Típus</th>
                    <th className="px-2 py-2.5 text-left">Számla dátuma</th>
                    <th className="px-2 py-2.5 text-left">Kiállító</th>
                    <th className="px-2 py-2.5 text-left">Magyarázat</th>
                    <th className="px-2 py-2.5 text-right">Összeg</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    // Zebra-sorok: páros sorok halvány háttérrel.
                    <tr key={r.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
                      <td className="px-2 py-1.5"><input className={cellInputClass} value={r.actNr} onChange={(e) => updateRow(r.id, { actNr: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <select className={cellInputClass} value={r.actType} onChange={(e) => updateRow(r.id, { actType: e.target.value })}>
                          <option value="Fact">Fact — Számla</option>
                          <option value="chit">chit — Nyugta</option>
                          <option value="bon">bon — Bizonylat</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input className={cellInputClass} type="date" value={r.actDate} onChange={(e) => updateRow(r.id, { actDate: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className={cellInputClass} value={r.issuer} onChange={(e) => updateRow(r.id, { issuer: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className={cellInputClass} value={r.explanation} onChange={(e) => updateRow(r.id, { explanation: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className={cellInputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Kiemelt összesítő-sor */}
                <tfoot>
                  <tr className="border-t-2 border-violet-200 bg-violet-50/70">
                    <td colSpan={4} className="px-2 py-2 text-right text-xs text-slate-500">
                      Kapott előleg: {formatRon(advanceNum)} RON
                    </td>
                    <td className="px-2 py-2 text-sm font-semibold text-slate-800">Összesen</td>
                    <td className="px-2 py-2 text-right text-sm font-bold text-violet-700">{formatRon(total)} RON</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100" onClick={addRow}>
                <Plus className="size-4" /> Új sor
              </button>
              <div
                className={`rounded-lg border px-4 py-2 text-sm font-medium shadow-sm ${
                  diff >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'
                }`}
              >
                {diff >= 0 ? 'Kifizetni' : 'Visszafizetni'}: <strong>{formatRon(Math.abs(diff))} RON</strong>
              </div>
            </div>
          </Section>

          {/* ── Elkülönülő alsó gombsáv ── */}
          <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
              <Save className="size-4" /> {saved ? 'Mentve ✓ — újra menthető' : 'Mentés és könyvelés'}
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50" onClick={() => void handlePrint('browser')} disabled={busy}>
              <Printer className="size-4" /> Nyomtatás
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50" onClick={() => void handlePrint('pdf')} disabled={busy}>
              <Save className="size-4" /> PDF
            </button>
          </div>
        </div>

        {/* ── Élő előnézet — pixelhű, scroll-mentes A4 (jobb oldal / mobilon alul) ── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-4 lg:sticky lg:top-2">
          <p className="px-1 pb-2 text-xs font-medium text-slate-500">
            Nyomtatási előnézet — pixelhű A4 (pontosan ez kerül papírra / PDF-be)
          </p>
          <A4Preview html={previewHtml} title="Decont előnézet" />
        </div>
      </div>
    </div>
  )
}

/** 2026-07-10 (S4-decont): halvány szekció-kártya — a fehér mezők így láthatóan elválnak. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
      <h4 className="mb-3 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h4>
      {children}
    </section>
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
