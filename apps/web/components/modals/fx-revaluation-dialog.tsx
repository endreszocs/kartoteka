'use client'

import { useEffect, useMemo, useState } from 'react'
import { Coins, Download, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import {
  fetchBnrRateAction,
  getBankCurrencyBalance,
  saveFxRevaluation,
} from '@/app/(dashboard)/penzugy/actions'
import {
  formatCurrency,
  type BankAccount,
} from '@/lib/constants/finance'
import { calculateFxRevaluation } from '@/lib/finance/bank-balance'

interface FxRevaluationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccount: BankAccount | null
  onSaved?: () => void | Promise<void>
}

export function FxRevaluationDialog({
  open,
  onOpenChange,
  bankAccount,
  onSaved,
}: FxRevaluationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [bnrLoading, setBnrLoading] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Form state
  const currentYear = new Date().getFullYear()
  const [ev, setEv] = useState(currentYear - 1) // Általában az előző évet könyveljük
  const [devizaEgyenleg, setDevizaEgyenleg] = useState<number | ''>('')
  const [regiRonErtek, setRegiRonErtek] = useState<number | ''>('')
  const [ujArfolyam, setUjArfolyam] = useState<number | ''>('')
  const [arfolyamDatum, setArfolyamDatum] = useState(`${currentYear - 1}-12-31`)
  const [arfolyamForras, setArfolyamForras] = useState<'BNR' | 'manual'>('manual')
  const [megjegyzes, setMegjegyzes] = useState('')

  // Derived (kalkuláció)
  const calcResult = useMemo(() => {
    if (
      typeof devizaEgyenleg !== 'number'
      || typeof regiRonErtek !== 'number'
      || typeof ujArfolyam !== 'number'
      || ujArfolyam <= 0
    ) {
      return null
    }
    return calculateFxRevaluation({
      devizaEgyenleg,
      regiRonErtek,
      ujArfolyam,
    })
  }, [devizaEgyenleg, regiRonErtek, ujArfolyam])

  // BNR fetch state — info badge
  const [bnrBadge, setBnrBadge] = useState<string | null>(null)
  const [bnrError, setBnrError] = useState<string | null>(null)

  // Egyenleg auto-betöltés modal nyitáskor
  useEffect(() => {
    if (!open || !bankAccount) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      // Reset
      setEv(currentYear - 1)
      setDevizaEgyenleg('')
      setRegiRonErtek('')
      setUjArfolyam('')
      setArfolyamDatum(`${currentYear - 1}-12-31`)
      setArfolyamForras('manual')
      setMegjegyzes('')
      setBnrBadge(null)
      setBnrError(null)
    })

    // Aktuális egyenleg lekérdezése (a megadott év végéig)
    setBalanceLoading(true)
    void getBankCurrencyBalance(bankAccount.id, `${currentYear - 1}-12-31`).then(res => {
      if (cancelled) return
      setBalanceLoading(false)
      if (res.result) {
        setDevizaEgyenleg(res.result.balance)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, bankAccount, currentYear])

  async function handleBnrFetch() {
    if (!bankAccount) return
    setBnrLoading(true)
    setBnrError(null)
    try {
      const res = await fetchBnrRateAction()
      if (res.error) {
        setBnrError(res.error)
        toast.error(`BNR árfolyam lekérése sikertelen: ${res.error}. Add meg manuálisan.`)
        return
      }
      const valuta = bankAccount.valuta || 'EUR'
      const rate = valuta === 'EUR' ? res.eur : valuta === 'HUF' ? res.huf : null
      if (!rate) {
        toast.warning(`A BNR nem ad árfolyamot ${valuta}-ra. Add meg manuálisan.`)
        return
      }
      setUjArfolyam(rate)
      setArfolyamDatum(res.date || `${currentYear - 1}-12-31`)
      setArfolyamForras('BNR')
      setBnrBadge(`BNR ${res.date || ''} • 1 ${valuta} = ${rate} RON`)
      toast.success('BNR árfolyam betöltve.')
    } finally {
      setBnrLoading(false)
    }
  }

  async function handleSubmit() {
    if (!bankAccount) return
    if (!bankAccount.valuta || bankAccount.valuta === 'RON') {
      toast.error('Az átértékelés csak deviza bankszámlára vonatkozhat.')
      return
    }
    if (typeof devizaEgyenleg !== 'number' || devizaEgyenleg <= 0) {
      toast.error('A devizaegyenleg pozitív szám kell legyen.')
      return
    }
    if (typeof regiRonErtek !== 'number' || regiRonErtek < 0) {
      toast.error('A régi RON érték nem lehet negatív.')
      return
    }
    if (typeof ujArfolyam !== 'number' || ujArfolyam <= 0) {
      toast.error('Az árfolyam pozitív szám kell legyen.')
      return
    }

    setLoading(true)
    const result = await saveFxRevaluation({
      bankszamla_id: bankAccount.id,
      ev,
      valuta: bankAccount.valuta,
      deviza_egyenleg: devizaEgyenleg,
      regi_ron_ertek: regiRonErtek,
      uj_arfolyam: ujArfolyam,
      arfolyam_datum: arfolyamDatum,
      arfolyam_forras: arfolyamForras,
      megjegyzes: megjegyzes.trim() || null,
    })
    setLoading(false)

    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }

    const tipusLabel =
      result.tipus === 'nyereseg'
        ? `Árfolyam-nyereség: +${formatCurrency(result.kulonbozet || 0)} RON`
        : result.tipus === 'veszteseg'
        ? `Árfolyam-veszteség: -${formatCurrency(Math.abs(result.kulonbozet || 0))} RON`
        : 'Nincs változás (nulla különbözet)'
    toast.success(`Átértékelés rögzítve. ${tipusLabel}`)
    onOpenChange(false)
    if (onSaved) await onSaved()
  }

  if (!bankAccount) return null

  const valuta = bankAccount.valuta || 'EUR'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                <Coins className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  Devizás átértékelés
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {bankAccount.bank_neve} • {valuta}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Magyarázó box */}
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs text-cyan-800">
            Az év végi {valuta} bankszámla átértékelése a BNR (vagy manuálisan
            megadott) árfolyamon. Az árfolyam-nyereség a 103.04, a veszteség a
            203.03 számadási cél kódra kerül.
          </div>

          {/* Év */}
          <ModalField label="Év" required hint="Általában az előző év (utólag könyvelünk).">
            <Input
              type="number"
              value={ev}
              onChange={e => {
                const newYear = parseInt(e.target.value, 10) || currentYear - 1
                setEv(newYear)
                setArfolyamDatum(`${newYear}-12-31`)
              }}
              min={2020}
              max={2050}
            />
          </ModalField>

          {/* Devizaegyenleg */}
          <ModalField
            label={`Aktuális ${valuta} egyenleg`}
            required
            hint="Auto-kalkulált a belső mozgásokból. Felülbírálható, ha a banki kivonatod más értéket mutat."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={devizaEgyenleg}
              onChange={e => setDevizaEgyenleg(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={balanceLoading ? 'Betöltés...' : '0.00'}
              disabled={balanceLoading}
            />
          </ModalField>

          {/* Régi RON érték */}
          <ModalField
            label="Régi (könyvi) RON érték"
            required
            hint="A bankszámla aktuális RON-ban kifejezett értéke a könyvelésben (a banki kivonat alapján)."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={regiRonErtek}
              onChange={e => setRegiRonErtek(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0.00"
            />
          </ModalField>

          {/* Új árfolyam + BNR fetch */}
          <ModalField
            label={`Új árfolyam (1 ${valuta} = X RON)`}
            required
          >
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={ujArfolyam}
                onChange={e => {
                  setUjArfolyam(e.target.value === '' ? '' : Number(e.target.value))
                  setArfolyamForras('manual')
                  setBnrBadge(null)
                }}
                placeholder="4.9532"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBnrFetch}
                disabled={bnrLoading}
                className="rounded-xl whitespace-nowrap border-cyan-200 text-cyan-700 hover:bg-cyan-50"
              >
                <Download className="mr-1 size-3.5" />
                {bnrLoading ? 'Töltés...' : 'BNR'}
              </Button>
            </div>
            {bnrBadge && (
              <Badge variant="secondary" className="mt-1.5 bg-cyan-100 text-cyan-800 text-[11px]">
                {bnrBadge}
              </Badge>
            )}
            {bnrError && (
              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <span>{bnrError}</span>
              </div>
            )}
          </ModalField>

          {/* Árfolyam dátuma */}
          <ModalField
            label="Árfolyam dátuma"
            hint="Általában az év utolsó BNR-publikáció napja (dec. 31. vagy az előtti munkanap)."
          >
            <Input
              type="date"
              value={arfolyamDatum}
              onChange={e => setArfolyamDatum(e.target.value)}
            />
          </ModalField>

          {/* Preview */}
          {calcResult && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Számított eredmény
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Új RON érték</p>
                  <p className="font-semibold text-slate-800">
                    {formatCurrency(calcResult.ujRonErtek)} RON
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Régi árfolyam (becsült)</p>
                  <p className="text-slate-600">
                    {calcResult.regiArfolyam > 0 ? `${calcResult.regiArfolyam.toFixed(4)} RON/${valuta}` : '—'}
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-2 flex items-center gap-2">
                {calcResult.tipus === 'nyereseg' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    <TrendingUp className="mr-1 size-3" />
                    Árfolyam-nyereség: +{formatCurrency(calcResult.kulonbozet)} RON
                  </Badge>
                ) : calcResult.tipus === 'veszteseg' ? (
                  <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                    <TrendingDown className="mr-1 size-3" />
                    Árfolyam-veszteség: −{formatCurrency(Math.abs(calcResult.kulonbozet))} RON
                  </Badge>
                ) : (
                  <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">
                    <Minus className="mr-1 size-3" />
                    Nincs változás
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Mentéskor a rendszer egy {' '}
                {calcResult.tipus === 'nyereseg' ? (
                  <strong>befizetés (103.04)</strong>
                ) : calcResult.tipus === 'veszteseg' ? (
                  <strong>kiadás (203.03)</strong>
                ) : (
                  <strong>üres rekord</strong>
                )} sort hoz létre {ev}-12-31 dátummal.
              </p>
            </div>
          )}

          {/* Megjegyzés */}
          <ModalField label="Megjegyzés">
            <Textarea
              value={megjegyzes}
              onChange={e => setMegjegyzes(e.target.value)}
              placeholder={'Pl. „Év végi BNR átértékelés a presbiteri ülés döntése alapján."'}
              rows={2}
              maxLength={500}
            />
          </ModalField>

          {/* Mentés / Mégse */}
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-cyan-600 hover:bg-cyan-700"
              onClick={handleSubmit}
              disabled={loading || !calcResult}
            >
              {loading ? 'Mentés...' : 'Átértékelés rögzítése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
