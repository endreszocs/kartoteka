'use client'

/**
 * Választók névjegyzéke — Nyomtatási központ.
 *
 * A pénzügyi nyomtatási központ mintáját követi (finance-print-dialog.tsx):
 *   - Bal oldalon: sz≠rési opciók + akciógombok
 *   - Jobb oldalon: élő iframe előnézet
 *
 * 4 szűrés (jelölőnégyzetek):
 *   1. Előző évre teljesen fizettek  (paidPrevYearSum >= expectedPrevYear)
 *   2. Előző évre részlegesen fizettek (0 < paidPrevYearSum < expectedPrevYear)
 *   3. Erre az évre teljesen fizettek (paidCurrentYearSum >= expectedCurrentYear)
 *   4. Erre az évre részlegesen fizettek (0 < paidCurrentYearSum < expectedCurrentYear)
 *
 * Egy személy akkor kerül a névjegyzékbe, ha LEGALÁBB EGY bekapcsolt kritériumnak megfelel.
 */

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildVoterListReport } from '@/lib/members/voter-reporting'
import { printToBrowser } from '@/lib/utils/print-engine-v2'
import { getVoterPrintContext, type VoterRow } from '@/app/(dashboard)/tagnyilvantartas/voter-actions'
import { toast } from 'sonner'

interface VoterPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voters: VoterRow[]
  currentYear: number
}

export function VoterPrintDialog({
  open,
  onOpenChange,
  voters,
  currentYear,
}: VoterPrintDialogProps) {
  // 2026-07-24 (PR-12): KANONIKUS alapmód — a nyomtatvány alapból PONTOSAN a
  // Választók fül „Összes választó" számával (és az egyházmegyei beküldéssel)
  // egyező kört tartalmazza: jogosult ÉS (járulékot fizetett VAGY felmentett).
  // A korábbi alapszűrő (csak a TELJESEN fizetők) kihagyta a részlegesen
  // fizetőket → a nyomtatott létszám eltért a beküldöttől (292 ≠ 301).
  const [canonical, setCanonical] = useState(true)
  const [prevFull, setPrevFull] = useState(true)
  const [prevPartial, setPrevPartial] = useState(false)
  const [currFull, setCurrFull] = useState(true)
  const [currPartial, setCurrPartial] = useState(false)
  // 2026-07-17 (PR-2, D1+D2 döntés): a hivatalos névjegyzék alapból CSAK a
  // választói jogosultakat tartalmazza (18+, konfirmált, aktív, kézi
  // felülbírálással) — kikapcsolható; a felmentett fizetettnek számít.
  const [onlyEligible, setOnlyEligible] = useState(true)
  const [includeExempt, setIncludeExempt] = useState(true)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [congregationName, setCongregationName] = useState('Gyülekezet')
  // 2026-07-24 (PR-14): a román hivatalos név a fejlécbe (pl. Parohia Reformată Brateș)
  const [congregationNameRo, setCongregationNameRo] = useState<string | null>(null)
  const [cif, setCif] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [city, setCity] = useState<string | null>(null)
  // 2026-07-24 (PR-13): a címer adat-URL-ként — így a PDF-render és a direkt
  // nyomtatás is garantáltan látja (nincs CORS-/betöltés-időzítés kérdés).
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(false)

  // Első megnyitáskor — gyülekezet kontextus (fejléchez)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingCtx(true)
    void getVoterPrintContext().then(async ctx => {
      if (cancelled) return
      setCongregationName(ctx.congregationName)
      setCongregationNameRo(ctx.congregationNameRo)
      setCif(ctx.cif)
      setAddress(ctx.address)
      setPhone(ctx.phone)
      setCity(ctx.city)
      setLoadingCtx(false)
      if (ctx.cimerUrl) {
        try {
          const res = await fetch(ctx.cimerUrl)
          if (!res.ok) return
          const blob = await res.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          if (!cancelled) setLogoDataUrl(dataUrl)
        } catch {
          /* logó nélkül is teljes értékű a nyomtatvány */
        }
      }
    })
    return () => { cancelled = true }
  }, [open])

  const filteredVoters = useMemo(() => {
    // 2026-07-24 (PR-12): kanonikus mód — a névjegyzék-tagság kész flagje
    // (voter-actions.nevjegyzekTag), bit-egyezően a KPI-vel és a beküldéssel.
    if (canonical) return voters.filter(v => v.nevjegyzekTag)
    return voters.filter(v => {
      // Jogosultsági alapszűrő (D2: default BE, kikapcsolható)
      if (onlyEligible && !v.eligible) return false
      const prevFullMatch = prevFull && v.expectedPrevYear > 0 && v.paidPrevYearSum >= v.expectedPrevYear
      const prevPartialMatch = prevPartial && v.paidPrevYearSum > 0 && (v.expectedPrevYear === 0 || v.paidPrevYearSum < v.expectedPrevYear)
      const currFullMatch = currFull && v.expectedCurrentYear > 0 && v.paidCurrentYearSum >= v.expectedCurrentYear
      const currPartialMatch = currPartial && v.paidCurrentYearSum > 0 && (v.expectedCurrentYear === 0 || v.paidCurrentYearSum < v.expectedCurrentYear)
      // D1: a felmentett fizetettnek számít
      const exemptMatch = includeExempt && v.felmentett
      return prevFullMatch || prevPartialMatch || currFullMatch || currPartialMatch || exemptMatch
    })
  }, [voters, canonical, prevFull, prevPartial, currFull, currPartial, onlyEligible, includeExempt])

  // Hiányzó éves járulék-beállítás felismerése (üres-lista zsákutca magyarázata)
  const expectedPrev = voters[0]?.expectedPrevYear ?? 0
  const expectedCurr = voters[0]?.expectedCurrentYear ?? 0
  const missingYearSettings: number[] = []
  if (voters.length > 0 && expectedPrev === 0) missingYearSettings.push(currentYear - 1)
  if (voters.length > 0 && expectedCurr === 0) missingYearSettings.push(currentYear)

  const report = useMemo(() => {
    const voterData = filteredVoters.map(v => ({
      name: v.nev,
      occupation: v.foglalkozas || null,
      address: v.lakcim || null,
      settlement: v.lakhely || null,
    }))
    return buildVoterListReport({
      voters: voterData,
      year: currentYear,
      congregationName,
      congregationNameRo,
      cif,
      address,
      phone,
      city,
      logoUrl: logoDataUrl,
    })
  }, [filteredVoters, currentYear, congregationName, congregationNameRo, cif, address, phone, city, logoDataUrl])

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

  const anyFilter = canonical || prevFull || prevPartial || currFull || currPartial || includeExempt

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Választók névjegyzéke — Nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ── Bal oldal ──────────────────────────── */}
          <div className="space-y-4">
            {/* Évszám + szűrő checkbox-ok */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">Hivatalos nyomtatvány</p>
                <h3 className="font-heading text-xl text-slate-800">Választók névjegyzéke</h3>
                <p className="text-xs text-slate-500 mt-1">
                  A Kánon I. Rész 3. Fejezete 37 §§. szerinti névjegyzék.
                </p>
              </div>
            </div>

            {/* Szűrők */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Kiket számoljon bele?</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Egy személy szerepel a névjegyzékben, ha legalább egy bekapcsolt feltételnek megfelel.
                </p>
              </div>

              <div className="space-y-2">
                {/* 2026-07-24 (PR-12): kanonikus alapmód — a nyomtatvány egyezik a
                    Választók fül „Összes választó" számával és a beküldéssel. */}
                <label className="flex items-start gap-2 rounded-lg border-2 border-blue-300 bg-blue-50/60 p-2.5 cursor-pointer hover:border-blue-400 transition">
                  <input
                    type="checkbox"
                    checked={canonical}
                    onChange={e => setCanonical(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      <strong>Hivatalos névjegyzék</strong> (ajánlott)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Jogosult ÉS (járulékot fizetett VAGY felmentett) — pontosan a
                      Választók fül &bdquo;Összes választó&rdquo; száma; ez a kör kerül
                      beküldésre az egyházmegyének is. A részlegesen fizetők IS benne vannak.
                    </div>
                  </div>
                </label>

                {canonical && (
                  <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                    Az alábbi finomszűrők a hivatalos mód kikapcsolásával válnak elérhetővé.
                  </p>
                )}

                <div className={canonical ? 'pointer-events-none select-none space-y-2 opacity-45' : 'space-y-2'}>
                <label className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 cursor-pointer hover:border-emerald-300 transition">
                  <input
                    type="checkbox"
                    checked={onlyEligible}
                    disabled={canonical}
                    onChange={e => setOnlyEligible(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Csak <strong>választói jogosultak</strong>
                    </div>
                    <div className="text-[11px] text-slate-400">18+, konfirmált, aktív tag (a kézi felülbírálás szerint)</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 cursor-pointer hover:border-emerald-300 transition">
                  <input
                    type="checkbox"
                    checked={includeExempt}
                    disabled={canonical}
                    onChange={e => setIncludeExempt(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      <strong>Felmentettek</strong> is (fizetettnek számítanak)
                    </div>
                    <div className="text-[11px] text-slate-400">Érvényes felmentéssel rendelkezők befizetés nélkül is</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={prevFull}
                    disabled={canonical}
                    onChange={e => setPrevFull(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Előző évre ({currentYear - 1}) <strong>teljesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">Befizetés ≥ éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={prevPartial}
                    disabled={canonical}
                    onChange={e => setPrevPartial(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Előző évre ({currentYear - 1}) <strong>részlegesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">0 &lt; befizetés &lt; éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={currFull}
                    disabled={canonical}
                    onChange={e => setCurrFull(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Erre az évre ({currentYear}) <strong>teljesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">Befizetés ≥ éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={currPartial}
                    disabled={canonical}
                    onChange={e => setCurrPartial(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Erre az évre ({currentYear}) <strong>részlegesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">0 &lt; befizetés &lt; éves járulék</div>
                  </div>
                </label>
                </div>
              </div>
            </div>

            {/* Összegzés */}
            <div className="card-raised p-4 space-y-2">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-800">Év:</span> {currentYear} – {currentYear + 1}</div>
                <div><span className="font-semibold text-slate-800">Beleszámítottak száma:</span> {filteredVoters.length} fő</div>
                {/* 2026-07-24 (PR-12): a lapszám is látszik — a teljes névsor több
                    A4-lapra tördelődik, az előnézet görgethető. */}
                <div><span className="font-semibold text-slate-800">Terjedelem:</span> {report.sheetCount} A4-oldal (álló)</div>
                {loadingCtx && <div className="text-[11px] text-blue-600 mt-1">Gyülekezeti adatok betöltése...</div>}
              </div>

              {!anyFilter && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
                  Legalább egy szűrőt be kell kapcsolni a névjegyzékhez.
                </div>
              )}

              {missingYearSettings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
                  A(z) <strong>{missingYearSettings.join(', ')}</strong> évre nincs éves
                  járulék beállítva — a „teljesen fizette&rdquo; szűrők erre az évre nem
                  adnak találatot. A járulékot a Pénzügy → Beállítások (éves
                  beállítás) alatt rögzítheted.
                </div>
              )}

              {/* 2026-07-25 (PR-15, user-döntés): a PDF-mentés gomb kivezetve — a
                  böngésző BEÉPÍTETT (hibátlan, vektoros) PDF-készítője a kanonikus
                  út: Nyomtatás → Cél: „Mentés PDF-ként". */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900">
                <p className="font-semibold">💡 PDF-be mentés</p>
                <p className="mt-1">
                  Kattints a <strong>Nyomtatás</strong> gombra, majd a megjelenő
                  nyomtatási ablakban a <strong>Cél / Nyomtató</strong> listából
                  válaszd a <strong>&bdquo;Mentés PDF-ként&rdquo;</strong> lehetőséget —
                  így éles, kereshető szövegű, hibátlan PDF-et kapsz minden oldallal.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button
                  className="flex-[2]"
                  onClick={() => void handleDirectPrint()}
                  disabled={sendingToPrinter || !anyFilter || filteredVoters.length === 0}
                >
                  {sendingToPrinter ? 'Nyomtatás...' : 'Nyomtatás / Mentés PDF-ként'}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Jobb oldal: előnézet ──────────────── */}
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner">
            {/* 2026-07-24 (PR-12): egyértelmű jelzés, hogy az előnézet TÖBB lapos és
                görgethető — a user csak az 1. lap 22 sorát látta, és csonkának hitte. */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">
                {filteredVoters.length} fő · {report.sheetCount} oldal
              </span>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-700">
                ↓ Az előnézet görgethető — minden oldal itt van
              </span>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <iframe
                title={report.title}
                srcDoc={report.html}
                className="h-[74vh] min-h-[700px] w-full rounded-[22px] bg-white"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
