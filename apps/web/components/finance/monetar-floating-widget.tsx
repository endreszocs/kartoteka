'use client'

/**
 * MonetarFloatingWidget — lebegő Monetár + Számológép widget (S3 #2, 2026-07-10).
 *
 * A Monetár fül MEGSZŰNT a Pénzügy fülsorban — helyette ez a jobb alsó sarokban
 * lebegő, kör alakú gomb nyitja a panelt, két nézettel:
 *   - "Monetár": a MEGLÉVŐ MonetaryTabV2 wrapper kompakt módban (compact prop),
 *     a teljes funkcionalitással (mentés, nyomtatás, belső-mozgás törlés).
 *   - "Számológép": egyszerű számológép (alapműveletek + %, RON-formázott
 *     kijelző, billentyűzet-támogatás).
 *
 * Csak a /penzugy oldalon renderelődik (a FinanceTabs mountolja, diocese
 * scope-ban NEM). A nyitást a FinanceTabs vezérli (controlled open prop),
 * így a bejövő `#monetary` hash / a régi 'finance-tab-switch' event is tudja
 * nyitni. A gomb percenként 3 mp-re finoman pulzál (nem idegesítő emlékeztető).
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Calculator, Coins, X } from 'lucide-react'
import type { BankAccount, InternalTransferRow } from '@/lib/constants/finance'

// A Monetár tartalom lazy — csak a panel első nyitásakor töltődik le.
const MonetaryTabV2 = dynamic(
  () => import('./monetary-tab-v2').then((m) => m.MonetaryTabV2),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> },
)

interface MonetarFloatingWidgetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expectedCashBalance: number
  currentYear: number
  bankAccounts: BankAccount[]
  internalTransfers: InternalTransferRow[]
  congregationName: string
  /** 2026-08-22 (6. pont): a hivatalos ROMÁN név a MONETAR fejlécéhez. */
  congregationNameRo?: string
}

/* ============================== Számológép ============================== */

// RON-formázás a kijelzőre: román csoportosítás (1.234,56), max 10 tizedes
// helyett 2-6 értelmes tizedes; a gépelés alatt álló tizedeseket nyersen fűzzük.
const ronFormatter = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatCalcDisplay(raw: string): string {
  if (raw === '' || raw === '-') return '0'
  if (raw === 'Hiba') return 'Hiba'
  // Gépelés alatt álló tizedesvessző ("12." / "12.50") — az egész részt
  // formázzuk, a tizedes részt betűhíven mutatjuk, hogy a "0" ne tűnjön el.
  if (raw.includes('.')) {
    const [int, dec] = raw.split('.')
    const intFormatted = ronFormatter.format(Math.abs(Number(int)) || 0)
    const sign = raw.startsWith('-') ? '-' : ''
    return `${sign}${intFormatted},${dec}`
  }
  const num = Number(raw)
  if (!Number.isFinite(num)) return 'Hiba'
  return ronFormatter.format(num)
}

type CalcOp = '+' | '-' | '*' | '/'

const OP_LABEL: Record<CalcOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

function applyCalcOp(a: number, b: number, op: CalcOp): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? NaN : a / b
  }
}

function SimpleCalculator() {
  // Azonnali-végrehajtású (immediate execution) számológép-modell:
  // acc = felhalmozott érték, entry = gépelés alatt álló szám (string),
  // op = függő művelet, justEvaluated = "=" után az új számjegy új bevitelt kezd.
  const [entry, setEntry] = useState('0')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<CalcOp | null>(null)
  const [justEvaluated, setJustEvaluated] = useState(false)

  function inputDigit(d: string) {
    // "=" után (justEvaluated) az új számjegy ÚJ bevitelt kezd — az equals()
    // már nullázta az acc/op-ot, itt csak a kijelzőt cseréljük.
    if (justEvaluated || entry === 'Hiba') {
      setJustEvaluated(false)
      setEntry(d)
      return
    }
    if (entry.replace(/[-.]/g, '').length >= 12) return // kijelző-limit
    setEntry(entry === '0' ? d : entry + d)
  }

  function inputDecimal() {
    if (justEvaluated || entry === 'Hiba' || entry === '') {
      setJustEvaluated(false)
      setEntry('0.')
      return
    }
    if (!entry.includes('.')) setEntry(entry + '.')
  }

  function chooseOp(nextOp: CalcOp) {
    const cur = Number(entry)
    if (entry === 'Hiba' || !Number.isFinite(cur)) return
    if (acc === null) {
      setAcc(cur)
    } else if (op !== null && entry !== '') {
      const result = applyCalcOp(acc, cur, op)
      if (!Number.isFinite(result)) { clearAll('Hiba'); return }
      setAcc(result)
    }
    setOp(nextOp)
    setEntry('')
    setJustEvaluated(false)
  }

  function equals() {
    if (op === null || acc === null) return
    const cur = entry === '' ? acc : Number(entry)
    const result = applyCalcOp(acc, cur, op)
    if (!Number.isFinite(result)) { clearAll('Hiba'); return }
    setEntry(String(result))
    setAcc(null)
    setOp(null)
    setJustEvaluated(true)
  }

  function percent() {
    const cur = Number(entry === '' ? '0' : entry)
    if (!Number.isFinite(cur) || entry === 'Hiba') return
    // Klasszikus viselkedés: összeadás/kivonás mellett az acc százaléka
    // (pl. 200 + 10% = 220), szorzás/osztás mellett sima /100.
    const next =
      acc !== null && (op === '+' || op === '-') ? (acc * cur) / 100 : cur / 100
    setEntry(String(next))
    setJustEvaluated(false)
  }

  function backspace() {
    if (justEvaluated || entry === 'Hiba' || entry === '') return
    const next = entry.slice(0, -1)
    setEntry(next === '' || next === '-' ? '0' : next)
  }

  function clearAll(display = '0') {
    setEntry(display)
    setAcc(null)
    setOp(null)
    setJustEvaluated(false)
  }

  // Billentyűzet-támogatás — csak amíg a számológép nézet él (mount alatt).
  // Ha a fókusz beviteli mezőn áll (pl. a Monetár darabszám-inputjai), nem
  // nyúlunk a billentyűkhöz.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); inputDigit(e.key); return }
      if (e.key === '.' || e.key === ',') { e.preventDefault(); inputDecimal(); return }
      if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault(); chooseOp(e.key as CalcOp); return
      }
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return }
      if (e.key === '%') { e.preventDefault(); percent(); return }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return }
      if (e.key === 'Delete') { e.preventDefault(); clearAll(); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, acc, op, justEvaluated])

  const displayValue = entry !== '' ? entry : acc !== null ? String(acc) : '0'

  const keyBase =
    'flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition select-none'
  const numKey = `${keyBase} bg-white text-slate-700 ring-1 ring-slate-200/80 hover:bg-slate-50 active:scale-95`
  const fnKey = `${keyBase} bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-200/70 active:scale-95`
  const opKey = (o: CalcOp) =>
    `${keyBase} ring-1 active:scale-95 ${
      op === o && entry === ''
        ? 'bg-teal-600 text-white ring-teal-600'
        : 'bg-teal-50 text-teal-700 ring-teal-200/80 hover:bg-teal-100'
    }`

  return (
    <div className="space-y-3 p-1">
      {/* Kijelző */}
      <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right shadow-inner">
        <p className="min-h-4 text-xs font-medium text-slate-400">
          {acc !== null && op !== null
            ? `${formatCalcDisplay(String(acc))} ${OP_LABEL[op]}`
            : ' '}
        </p>
        <p className="truncate text-3xl font-semibold tabular-nums text-white">
          {formatCalcDisplay(displayValue)}
          <span className="ml-1.5 text-sm font-medium text-slate-400">RON</span>
        </p>
      </div>

      {/* Gombok */}
      <div className="grid grid-cols-4 gap-2">
        <button type="button" className={fnKey} onClick={() => clearAll()} title="Törlés (Delete)">C</button>
        <button type="button" className={fnKey} onClick={backspace} title="Utolsó számjegy törlése (Backspace)">⌫</button>
        <button type="button" className={fnKey} onClick={percent} title="Százalék">%</button>
        <button type="button" className={opKey('/')} onClick={() => chooseOp('/')}>÷</button>

        <button type="button" className={numKey} onClick={() => inputDigit('7')}>7</button>
        <button type="button" className={numKey} onClick={() => inputDigit('8')}>8</button>
        <button type="button" className={numKey} onClick={() => inputDigit('9')}>9</button>
        <button type="button" className={opKey('*')} onClick={() => chooseOp('*')}>×</button>

        <button type="button" className={numKey} onClick={() => inputDigit('4')}>4</button>
        <button type="button" className={numKey} onClick={() => inputDigit('5')}>5</button>
        <button type="button" className={numKey} onClick={() => inputDigit('6')}>6</button>
        <button type="button" className={opKey('-')} onClick={() => chooseOp('-')}>−</button>

        <button type="button" className={numKey} onClick={() => inputDigit('1')}>1</button>
        <button type="button" className={numKey} onClick={() => inputDigit('2')}>2</button>
        <button type="button" className={numKey} onClick={() => inputDigit('3')}>3</button>
        <button type="button" className={opKey('+')} onClick={() => chooseOp('+')}>+</button>

        <button type="button" className={`${numKey} col-span-2`} onClick={() => inputDigit('0')}>0</button>
        <button type="button" className={numKey} onClick={inputDecimal}>,</button>
        <button
          type="button"
          className={`${keyBase} bg-teal-600 text-white ring-1 ring-teal-600 hover:bg-teal-700 active:scale-95`}
          onClick={equals}
          title="Eredmény (Enter)"
        >
          =
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Billentyűzetről is működik: számok, + − × ÷, %, Enter, Backspace.
      </p>
    </div>
  )
}

/* ================================ Widget ================================ */

export function MonetarFloatingWidget({
  open,
  onOpenChange,
  expectedCashBalance,
  currentYear,
  bankAccounts,
  internalTransfers,
  congregationName,
  congregationNameRo,
}: MonetarFloatingWidgetProps) {
  const [mode, setMode] = useState<'monetar' | 'szamologep'>('monetar')
  // Finom emlékeztető pulzálás: percenként 3 mp-ig animate-pulse — nyitott
  // panel mellett soha nem pulzál.
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    // Nyitott panelnél nem ütemezünk pulzálást — a render amúgy is
    // `pulsing && !open`-nel véd, így szinkron setState nem kell (lint-szabály).
    if (open) return
    let pulseTimeout: ReturnType<typeof setTimeout> | undefined
    const interval = setInterval(() => {
      setPulsing(true)
      pulseTimeout = setTimeout(() => setPulsing(false), 3000)
    }, 60_000)
    return () => {
      clearInterval(interval)
      if (pulseTimeout) clearTimeout(pulseTimeout)
    }
  }, [open])

  const toggleBase =
    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition'

  return (
    <>
      {/* Panel — jobb alulról nyílik, árnyékkal */}
      {open && (
        <div
          className="fixed bottom-24 right-4 z-50 flex max-h-[min(80vh,760px)] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-200 sm:right-6"
          role="dialog"
          aria-label="Monetár és számológép"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`${toggleBase} ${
                  mode === 'monetar'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-teal-700'
                }`}
                onClick={() => setMode('monetar')}
              >
                <Coins className="size-3.5" />
                Monetár
              </button>
              <button
                type="button"
                className={`${toggleBase} ${
                  mode === 'szamologep'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-teal-700'
                }`}
                onClick={() => setMode('szamologep')}
              >
                <Calculator className="size-3.5" />
                Számológép
              </button>
            </div>
            <button
              type="button"
              aria-label="Bezárás"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* A Monetár nézet CSS-sel rejtőzik (nem unmountol) — így a
                számológépre átváltva NEM vesznek el a beírt, még nem mentett
                darabszámok. A számológép state-vesztése triviális, az mountol. */}
            <div className={mode === 'monetar' ? 'block' : 'hidden'}>
              <MonetaryTabV2
                compact
                expectedCashBalance={expectedCashBalance}
                currentYear={currentYear}
                bankAccounts={bankAccounts}
                internalTransfers={internalTransfers}
                congregationName={congregationName}
                congregationNameRo={congregationNameRo}
              />
            </div>
            {mode === 'szamologep' && <SimpleCalculator />}
          </div>
        </div>
      )}

      {/* Lebegő kör gomb */}
      <div className="group fixed bottom-6 right-4 z-50 sm:right-6">
        {/* Tooltip — csak hoverre, a gombtól balra */}
        <span className="pointer-events-none absolute bottom-3 right-16 hidden whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
          Monetár és számológép
        </span>
        <button
          type="button"
          title="Monetár és számológép"
          aria-label="Monetár és számológép"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-[0_18px_38px_-14px_rgba(13,148,136,0.65)] transition hover:scale-105 hover:bg-teal-700 active:scale-95 ${
            pulsing && !open ? 'animate-pulse' : ''
          }`}
        >
          {open ? <X className="size-6" /> : <Coins className="size-6" />}
        </button>
      </div>
    </>
  )
}
