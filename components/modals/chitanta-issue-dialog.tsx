'use client'

/**
 * Chitanță (papír nyugta) kiállítási dialog.
 *
 * Egy befizetés sorából indul (vagy üresen, manuális adatbevitellel).
 * Mentés után rögtön felkínálja a nyomtatást.
 */

import { useEffect, useState } from 'react'
import { Loader2, Printer, Receipt } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  issueChitanta,
  getChitantaConfig,
  getChitantaForPrint,
  type ChitantaPrintData,
} from '@/app/(dashboard)/penzugy/chitanta-actions'
import { ChitantaPrintTemplate } from '@/components/finance/chitanta-print-template'
import { amountInWordsHu } from '@/lib/utils/number-to-words'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Előtöltött adatok egy befizetés-sorból (opcionális). */
  prefill?: {
    befizetesId?: number
    nev?: string
    cim?: string
    cui?: string | null
    osszeg?: number
    datum?: string
    reprezentand?: string
  }
  onIssued?: () => void | Promise<void>
}

export function ChitantaIssueDialog({ open, onOpenChange, prefill, onIssued }: Props) {
  const [sorozat, setSorozat] = useState('')
  const [autoSzam, setAutoSzam] = useState(true)
  const [szam, setSzam] = useState<number | ''>('')
  const [datum, setDatum] = useState('')
  const [nev, setNev] = useState('')
  const [cim, setCim] = useState('')
  const [cui, setCui] = useState('')
  const [osszeg, setOsszeg] = useState<number | ''>('')
  const [reprezentand, setReprezentand] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)
  const [issued, setIssued] = useState<ChitantaPrintData | null>(null)

  // Megnyitáskor: config + prefill
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setIssued(null)

      Promise.resolve().then(async () => {
        const cfg = await getChitantaConfig()
        if (cancelled) return
        if (!('error' in cfg) && cfg.sorozat) {
          setSorozat(cfg.sorozat)
        } else {
          setSorozat('CHIT')
        }
      })

      setAutoSzam(true)
      setSzam('')
      setDatum(prefill?.datum?.split('T')[0] || new Date().toISOString().slice(0, 10))
      setNev(prefill?.nev || '')
      setCim(prefill?.cim || '')
      setCui(prefill?.cui || '')
      setOsszeg(prefill?.osszeg ?? '')
      setReprezentand(prefill?.reprezentand || '')
      setMegjegyzes('')
    })
    return () => { cancelled = true }
  }, [open, prefill])

  async function handleIssue() {
    if (!nev.trim()) {
      toast.error('Az átvevő neve kötelező.')
      return
    }
    if (!osszeg || Number(osszeg) <= 0) {
      toast.error('Adj meg pozitív összeget.')
      return
    }
    if (!autoSzam && (!szam || Number(szam) < 1)) {
      toast.error('Manuális szám esetén adj meg pozitív egész számot.')
      return
    }

    setSaving(true)
    const res = await issueChitanta({
      sorozat: sorozat.trim() || undefined,
      szam: autoSzam ? undefined : Number(szam),
      szamlaDatum: datum,
      klienesseg_nev: nev.trim(),
      klienesseg_cim: cim.trim() || undefined,
      klienesseg_cui: cui.trim() || undefined,
      osszeg_brut: Number(osszeg),
      reprezentand: reprezentand.trim() || undefined,
      befizetes_id: prefill?.befizetesId,
      megjegyzes: megjegyzes.trim() || undefined,
    })
    setSaving(false)

    if (res.error || !res.chitantaId) {
      toast.error(res.error || 'Ismeretlen hiba.')
      return
    }

    toast.success(`Nyugta ${res.sorozat} ${res.szam} kiállítva.`)

    // Lekérjük a print adatot
    const printData = await getChitantaForPrint(res.chitantaId)
    if (printData.data) {
      setIssued(printData.data)
    }

    if (onIssued) await onIssued()
  }

  function handlePrint() {
    // A sablon @media print stílusa elrejti a többi tartalmat
    window.print()
  }

  // Élő előnézet az „adică" mezőhöz
  const elozetes = osszeg && Number(osszeg) > 0 ? amountInWordsHu(Number(osszeg)) : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[90vh] overflow-y-auto
          border border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/40
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-amber-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
              <Receipt className="size-5" />
            </span>
            Nyugta kiállítás (Chitanță)
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Helyi papír nyugta — <strong>NEM megy</strong> az Oblio / e-Factura SPV-be.
            A KARTOTEKA számon tartja és újranyomtathatóvá teszi.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-5 chitanta-no-print">
          {!issued ? (
            <>
              {/* Sorozat + szám */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Sorozat *">
                  <Input
                    value={sorozat}
                    onChange={(e) => setSorozat(e.target.value.toUpperCase())}
                    placeholder="EREKC24"
                    className="h-10 font-mono uppercase"
                  />
                </Field>
                <Field label="Szám">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={szam}
                      onChange={(e) => setSzam(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={autoSzam}
                      placeholder="auto"
                      className="h-10"
                    />
                  </div>
                </Field>
                <Field label="Számozás">
                  <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 bg-slate-50/50 text-sm">
                    <input
                      type="checkbox"
                      checked={autoSzam}
                      onChange={(e) => setAutoSzam(e.target.checked)}
                      className="size-4"
                    />
                    Auto. (következő szám)
                  </label>
                </Field>
              </div>

              {/* Dátum + összeg */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Dátum *">
                  <Input
                    type="date"
                    value={datum}
                    onChange={(e) => setDatum(e.target.value)}
                    className="h-10"
                  />
                </Field>
                <Field label="Összeg (RON) *">
                  <Input
                    type="number"
                    step="0.01"
                    value={osszeg}
                    onChange={(e) => setOsszeg(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="420"
                    className="h-10"
                  />
                </Field>
              </div>

              {elozetes && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-900">
                  <span className="text-slate-500">adică / éspedig:</span>{' '}
                  <em>{elozetes}</em>
                </div>
              )}

              {/* Átvevő adatai */}
              <div className="space-y-4">
                <Field label="Átvevő (Am primit de la) *">
                  <Input
                    value={nev}
                    onChange={(e) => setNev(e.target.value)}
                    placeholder="pl. id. Szőcs Endre"
                    className="h-10"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cím (Adresa)">
                    <Input
                      value={cim}
                      onChange={(e) => setCim(e.target.value)}
                      placeholder="pl. Brates"
                      className="h-10"
                    />
                  </Field>
                  <Field label="CIF (cégnél)">
                    <Input
                      value={cui}
                      onChange={(e) => setCui(e.target.value)}
                      placeholder="opcionális"
                      className="h-10 font-mono"
                    />
                  </Field>
                </div>

                <Field label="Címen / Reprezentând *">
                  <Input
                    value={reprezentand}
                    onChange={(e) => setReprezentand(e.target.value)}
                    placeholder="pl. Egyházfenntartó járulék 2024-2026"
                    className="h-10"
                  />
                </Field>

                <Field label="Belső megjegyzés (nem jelenik meg a nyugtán)">
                  <Textarea
                    value={megjegyzes}
                    onChange={(e) => setMegjegyzes(e.target.value)}
                    rows={2}
                    placeholder="opcionális"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <Button
                  className="rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                  onClick={handleIssue}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                    </>
                  ) : (
                    <>
                      <Receipt className="mr-1.5 size-4" /> Nyugta kiállítása
                    </>
                  )}
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                  Mégse
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
                ✓ A nyugta <strong>{issued.sorozat} {issued.szam}</strong> elkészült.
                Ellenőrizd alább, és nyomtasd ki:
              </div>

              {/* Élő előnézet */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <ChitantaPrintTemplate data={issued} dualMode />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <Button
                  className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  onClick={handlePrint}
                >
                  <Printer className="mr-1.5 size-4" /> Nyomtatás
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
