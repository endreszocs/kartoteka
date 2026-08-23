'use client'

/**
 * Kiadási kísérőív nyomtatási dialógus — a leltár/pénzügyi nyomtatási központ mintáját követve.
 * Bal oldal: info + forrás-választó + gombok, jobb oldal: iframe előnézet.
 *
 * 2026-07-17 (F3, Q10): FORRÁS-VÁLASZTÓ — a kísérőív készülhet a nap ÖSSZES
 * kiadásáról, csak a kassza (készpénz) tételeiről, vagy bankszámlánként külön.
 * Minden forrás KÜLÖN sorozatot futtat: az oldalszám (pg.) az év elejétől csak az
 * adott forrás kiadásos napjait számolja. A stornózott tétel egyik forrásba sem
 * számít bele.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildKiadasiKiseroiv } from '@/lib/finance/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { BankAccount, KiadasRow, SzamadasiCel } from '@/lib/constants/finance'

// 2026-07-10 (ÚJ #7b): A4 álló szélesség képpontban (96 dpi) + kis ráhagyás,
// hogy a mm-alapú lap biztosan elférjen az iframe-ben — a FinancePrintDialogBody
// mintáját követve (210mm≈794px, ráhagyással 812).
const A4_PORTRAIT_W = 812
const PREVIEW_BOX_H = 820

type KiseroivSource = 'mind' | 'kassza' | `bank:${number}`

interface KiseroivPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string
  /** Az év ÖSSZES kiadása — a forrásonkénti sorszámozáshoz kell a teljes lista. */
  allExpenses: KiadasRow[]
  bankAccounts: BankAccount[]
  congregationName: string
  /** 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve — a BORDEROU DE
   *  PLĂȚI fejlécébe (a magyar név mellé). Ha nincs, csak a magyar áll ott. */
  congregationNameRo?: string
  kiaCelMap: Record<number, string>
  cellek: SzamadasiCel[]
}

function matchesSource(r: KiadasRow, source: KiseroivSource): boolean {
  if (source === 'mind') return true
  if (source === 'kassza') return r.bankszamla_id == null
  return r.bankszamla_id === Number(source.slice('bank:'.length))
}

export function KiseroivPrintDialog({
  open,
  onOpenChange,
  date,
  allExpenses,
  bankAccounts,
  congregationName,
  congregationNameRo,
  kiaCelMap,
  cellek,
}: KiseroivPrintDialogProps) {
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [source, setSource] = useState<KiseroivSource>('mind')

  const sourceLabel = useMemo(() => {
    if (source === 'mind') return 'Minden kiadás'
    if (source === 'kassza') return 'Kassza'
    const id = Number(source.slice('bank:'.length))
    const bank = bankAccounts.find((b) => b.id === id)
    return bank ? `${bank.bank_neve} bankszámla` : 'Bankszámla'
  }, [source, bankAccounts])

  // A kiválasztott forrás aznapi tételei (stornó nélkül)
  const expenses = useMemo(
    () =>
      allExpenses
        .filter(
          (r) =>
            !r.deleted &&
            !r.stornozott &&
            (r.datum || '').split('T')[0] === date &&
            matchesSource(r, source),
        )
        .sort((a, b) => a.id - b.id),
    [allExpenses, date, source],
  )

  // Forrásonkénti sorozat: az év elejétől az adott forrásban kiadásos napok sorszáma
  const pageNumber = useMemo(() => {
    const days = new Set<string>()
    for (const r of allExpenses) {
      if (!r.deleted && !r.stornozott && matchesSource(r, source)) {
        days.add((r.datum || '').split('T')[0])
      }
    }
    const sorted = [...days].sort()
    const idx = sorted.indexOf(date)
    return idx >= 0 ? idx + 1 : sorted.filter((d) => d < date).length + 1
  }, [allExpenses, date, source])

  const report = useMemo(
    () =>
      buildKiadasiKiseroiv({
        expenses,
        date,
        pageNumber,
        congregationName,
        congregationNameRo,
        kiaCelMap,
        cellek,
        sourceLabel,
      }),
    [expenses, date, pageNumber, congregationName, congregationNameRo, kiaCelMap, cellek, sourceLabel],
  )

  // 2026-07-17 (F3): RON-ekvivalens összeg — bit-azonos a nyomtatvány ronOf-jával
  // (devizás banki kiadásnál a nyers `osszeg` félrevezető volt).
  const total = expenses.reduce((s, r) => s + (Number(r.osszeg_ron ?? r.osszeg) || 0), 0)

  // 2026-07-10 (ÚJ #7b): Fit-to-width előnézet — a konténer szélességét mérjük
  // (ResizeObserver), és az A4-es lapot arányosan lekicsinyítjük, hogy a TELJES
  // irat scroll nélkül, pixelhűen látszódjon (mint a FinancePrintDialogBody-ban).
  const previewRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Az iframe tartalmának valódi magasságát betöltéskor mérjük meg, így a
  // (kicsinyített) lap teljes magasságában látszik — nincs belső görgetés.
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(PREVIEW_BOX_H)
  const measurePreview = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    if (h > 0) setContentH(h)
  }

  const docW = A4_PORTRAIT_W
  // A dokumentumot a konténernél kicsivel keskenyebbre méretezzük, hogy
  // legyen levegő a szélén (ne lógjon ki a széléig).
  const targetW = boxW > 0 ? Math.max(0, boxW - 24) : docW
  const scale = Math.min(1, targetW / docW)
  const scaledW = Math.round(docW * scale)
  const scaledH = Math.round(contentH * scale)

  async function handlePdf() {
    setPrinting(true)
    try {
      // Margó [0,0]: a margót a dokumentum .page paddingje (10mm) adja — a
      // print-központ WYSIWYG konvenciója (korábban a dupla margó eltérő PDF-et adott).
      await printToPdf(report.html, report.filename, {
        orientation: 'portrait',
        margin: [0, 0],
        format: 'a4',
      })
      toast.success('Kiadási kísérőív PDF elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    setSendingToPrinter(true)
    try {
      await printToBrowser(report.html)
      toast.success('Nyomtatási előnézet megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  const formattedDate = date.replace(/-/g, '.')
  const noExpenses = expenses.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Kiadási kísérőív — {formattedDate}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Bal oldal */}
          <div className="space-y-4">
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">Kiadási bizonylat</p>
                <h3 className="font-heading text-xl text-slate-800">Kísérőív nyomtatása</h3>
              </div>

              {/* Q10: forrás-választó — forrásonként külön sorozat */}
              <div className="space-y-1">
                <label htmlFor="kiseroiv-source" className="text-xs font-semibold text-slate-600">
                  Forrás
                </label>
                <select
                  id="kiseroiv-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value as KiseroivSource)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none"
                >
                  <option value="mind">Minden kiadás (kassza + bank)</option>
                  <option value="kassza">Csak kassza (készpénz)</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={`bank:${b.id}`}>
                      {b.bank_neve} bankszámla{b.valuta ? ` (${b.valuta})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
                <div><span className="font-semibold text-slate-800">Dátum:</span> {formattedDate}</div>
                <div><span className="font-semibold text-slate-800">Forrás:</span> {sourceLabel}</div>
                <div><span className="font-semibold text-slate-800">Sorszám:</span> pg. {pageNumber} <span className="text-xs text-slate-400">(a(z) „{sourceLabel}” sorozatban)</span></div>
                <div><span className="font-semibold text-slate-800">Tételek:</span> {expenses.length} db</div>
                <div><span className="font-semibold text-slate-800">Összeg:</span> {total.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 álló</div>
              </div>

              {noExpenses ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-800">
                  Ebből a forrásból nincs (nem stornózott) kiadás ezen a napon — válassz másik forrást.
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-xs leading-5 text-slate-600">
                  A kísérőív a kiválasztott forrás aznapi kiadásait tartalmazza egyetlen bizonylaton;
                  minden forrás saját, év elejétől futó sorszámozást kap.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleDirectPrint()} disabled={sendingToPrinter || noExpenses}>
                  {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
                </Button>
                <Button className="flex-1" onClick={() => void handlePdf()} disabled={printing || noExpenses}>
                  {printing ? 'PDF készül...' : 'PDF-be mentés'}
                </Button>
              </div>
            </div>
          </div>

          {/* Jobb oldal: előnézet — 2026-07-10 (ÚJ #7b): fit-to-width, scroll-mentes A4 kép */}
          <div
            ref={previewRef}
            className="max-h-[80dvh] overflow-y-auto rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner"
          >
            <div
              className="mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              style={{ width: scaledW, height: scaledH }}
            >
              <iframe
                ref={iframeRef}
                onLoad={measurePreview}
                title="Kiadási kísérőív"
                srcDoc={report.html}
                style={{
                  width: docW,
                  height: contentH,
                  border: '0',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  background: '#fff',
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
