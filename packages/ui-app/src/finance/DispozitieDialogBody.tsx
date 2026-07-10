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
 *
 * 2026-07-10 (S4-decont): újradizájn —
 *  - látható (fehér, keretes) mezők fókusz-gyűrűvel,
 *  - szekcionált űrlap (Alapadatok / Összeg és dátum / Cél és kategória /
 *    igazolvány-blokk), elkülönülő alsó gombsáv,
 *  - mobil: az előnézet a form ALÁ (grid-cols-1 → lg:grid-cols-2),
 *  - előnézet: pixelhű, scroll-mentes A4 (fit-to-width, a
 *    FinancePrintDialogBody mintája),
 *  - incasare + új tétel: opcionális „Nyugta sorszáma (Irat sz.)" mező — a
 *    szerver (saveDispozitie.iratsz) a befizetes.nyugta-ba írja, így a
 *    Nyugtafigyelő „hiányzó" listájáról lekerül az utólag bevételezett nyugta.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /** 2026-07-10 (S4-decont, incasare): a bevételezett nyugta GYÜLEKEZETI sorszáma
   *  (Irat sz.) — a szerver a befizetes.nyugta-ba írja (a dispoziție saját DP-száma
   *  marad az iratszam-ban), így a Nyugtafigyelő hiányzó-listájáról lekerül. */
  iratsz?: string
}

export interface DispozitieDialogBodyProps {
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") — a fejléc 1. sora. */
  congregationNameRo?: string
  incomeCategories: DispozitieCategoryOption[]
  expenseCategories: DispozitieCategoryOption[]
  onGetNextNumber: (tipus: DispozitieTipus, year: number) => Promise<number>
  onListCashTransactions: (tipus: DispozitieTipus, year: number) => Promise<DispozitieKasszaOption[]>
  onSaveDispozitie: (input: DispozitieSaveInput) => Promise<{ success?: true; sorszam?: number; error?: string }>
  onPrint: (params: { mode: 'pdf' | 'browser'; html: string; filename?: string }) => Promise<void>
  onToast: DispozitieToastFn
  /** Alapértelmezett dátum (yyyy-mm-dd) — a kiválasztott költségvetési évre állítja a nyitó dátumot,
   *  így korábbi év (pl. 2025) egyeztetésénél a meglévő készpénzes tételek listája is arra szűr. */
  defaultDate?: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// 2026-07-10 (S4-decont): LÁTHATÓ mezők — fehér háttér, slate-300 keret,
// shadow-sm + amber fókusz-gyűrű (a régi bg-transparent beleolvadt a kártyába).
const inputClass =
  'flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-800 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50'

// A SearchableSelect belső inputja saját (bg-transparent) osztályt hordoz —
// a wrapperen keresztül tesszük láthatóvá.
const searchableFix = '[&_input]:rounded-lg [&_input]:border-slate-300 [&_input]:bg-white'

// ── Pixelhű A4 előnézet ──────────────────────────────────────
// 2026-07-10 (S4-decont): fit-to-width — a FinancePrintDialogBody mintája
// (ResizeObserver + docW=A4 px + transform:scale). Ide duplikálva, mert a
// feladat-szabály szerint új megosztott fájl nem hozható létre.
const A4_PREVIEW_W = 812 // 210mm ≈ 794px (96 dpi) + ráhagyás

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

export function DispozitieDialogBody({
  congregationName,
  congregationNameRo,
  incomeCategories,
  expenseCategories,
  onGetNextNumber,
  onListCashTransactions,
  onSaveDispozitie,
  onPrint,
  onToast,
  defaultDate,
}: DispozitieDialogBodyProps) {
  const [tipus, setTipus] = useState<DispozitieTipus>('plata')
  const [fromExisting, setFromExisting] = useState(false)
  const [date, setDate] = useState(defaultDate || todayIso())
  const [name, setName] = useState('')
  const [tisztseg, setTisztseg] = useState('')
  const [amount, setAmount] = useState('')
  const [cel, setCel] = useState('')
  const [ciTipus, setCiTipus] = useState('CI')
  const [ciSerie, setCiSerie] = useState('')
  const [ciNr, setCiNr] = useState('')
  // 2026-07-10 (S4-decont): incasare — a bevételezett nyugta gyülekezeti sorszáma (opcionális).
  const [iratsz, setIratsz] = useState('')
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
        congregationName,
        congregationNameRo,
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
    [congregationName, congregationNameRo, tipus, sorszam, date, name, tisztseg, amountNum, cel, ciTipus, ciSerie, ciNr],
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
        // 2026-07-10 (S4-decont): csak új incasare-nál értelmezett (befizetes.nyugta).
        iratsz: !isPlata && !fromExisting && iratsz.trim() ? iratsz.trim() : undefined,
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
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
          <button type="button" onClick={() => setTipus('plata')} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${isPlata ? 'bg-red-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Plată — Kifizetés</button>
          <button type="button" onClick={() => setTipus('incasare')} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!isPlata ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Încasare — Bevételezés</button>
        </div>
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
          <button type="button" onClick={() => setFromExisting(false)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!fromExisting ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Új tétel</button>
          <button type="button" onClick={() => setFromExisting(true)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${fromExisting ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Meglévő kassza-tételből</button>
        </div>
      </div>

      {/* 2026-07-10 (S4-decont): mobil = 1 oszlop (előnézet a form ALATT), lg-től 2 oszlop. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {fromExisting && (
            <Section title="Kassza-tétel">
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
            </Section>
          )}

          <Section title="Alapadatok">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Név (Numele şi prenumele) *" hint="Akinek fizetünk / akitől bevételezünk">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Tisztség (Funcţia)" hint="Pl. lelkész, gondnok, beszállító">
                <input className={inputClass} value={tisztseg} onChange={(e) => setTisztseg(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Összeg és dátum">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Összeg (RON) *" hint="A bizonylaton betűvel is megjelenik">
                <input className={inputClass} type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={fromExisting} />
              </Field>
              <Field label="Dátum *">
                <input className={inputClass} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} disabled={fromExisting} />
              </Field>
            </div>
            {amountNum > 0 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Betűvel: <span className="font-medium">{ronInWords(amountNum)}</span>
              </p>
            )}
          </Section>

          <Section title="Cél és kategória">
            <div className="grid gap-3">
              <Field label="Cél (Scopul plății / încasării)" hint="Mire/miből szól a tétel">
                <input className={inputClass} value={cel} onChange={(e) => setCel(e.target.value)} />
              </Field>
              {!fromExisting && (
                <Field label={isPlata ? 'Kiadás-kategória *' : 'Bevétel-kategória *'} hint="Ide könyvelődik — gépelj a kereséshez">
                  <SearchableSelect className={searchableFix} options={categoryOptions} value={categoryId} onChange={setCategoryId} />
                </Field>
              )}
              {!fromExisting && !isPlata && (
                // 2026-07-10 (S4-decont): utólagos bevételezésnél a nyugta gyülekezeti
                // sorszáma — a Nyugtafigyelő erről a számról veszi le a hiányzó nyugtát.
                <Field label="Nyugta sorszáma (Irat sz.)" hint="Nem kötelező — ha egy hiányzó gyülekezeti nyugtát bevételezel utólag, a Nyugtafigyelő ezt a sorszámot követi">
                  <input className={inputClass} value={iratsz} onChange={(e) => setIratsz(e.target.value)} placeholder="pl. 225" />
                </Field>
              )}
            </div>
          </Section>

          {isPlata && (
            <Section title="A pénz átvevőjének igazolványa (csak kifizetésnél)">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Igazolvány típ.">
                  <select className={inputClass} value={ciTipus} onChange={(e) => setCiTipus(e.target.value)}>
                    <option value="CI">CI</option>
                    <option value="BI">BI</option>
                    <option value="Pașaport">Pașaport</option>
                  </select>
                </Field>
                <Field label="Serie"><input className={inputClass} value={ciSerie} onChange={(e) => setCiSerie(e.target.value)} /></Field>
                <Field label="Nr"><input className={inputClass} value={ciNr} onChange={(e) => setCiNr(e.target.value)} /></Field>
              </div>
            </Section>
          )}

          {/* ── Elkülönülő alsó gombsáv ── */}
          <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
              <Save className="size-4" /> Mentés és könyvelés
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
            Nyomtatási előnézet — pixelhű A4 álló, két A5 példány (caserie + cotor)
          </p>
          <A4Preview html={previewHtml} title="Dispoziție előnézet" />
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
