'use client'

/**
 * Bankszámla hozzáadás / szerkesztés dialog — a Pénzügy → Bank fülről indítva.
 *
 * Ez a modal egy egyszerűsített UI-t kínál a bankszámlák gyors kezeléséhez
 * közvetlenül a pénzügyi kontextusból, a Gyülekezet beállításokba való
 * átnavigálás nélkül.
 *
 * Funkciók:
 *   - Új bankszámla rögzítése (bármilyen devizában)
 *   - Létező bankszámla szerkesztése (név, IBAN, nyitó egyenleg, aktív)
 *   - Alapértelmezett megjelölés
 *   - Szín-választó (a kártyák színét adja)
 *
 * A háttér-művelethez a `saveCongregationBankAccount` akciót használjuk
 * (ugyanaz mint a Gyülekezet dialog).
 */

import { useEffect, useState } from 'react'
import { Loader2, Landmark, Building2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveCongregationBankAccount } from '@/app/(dashboard)/congregation/actions'
import type { BankAccount } from '@/lib/constants/finance'

/** Támogatott devizák — a leggyakoribbak elöl. */
const CURRENCIES = [
  { code: 'RON', label: 'RON (román lej)' },
  { code: 'EUR', label: 'EUR (euró)' },
  { code: 'HUF', label: 'HUF (magyar forint)' },
  { code: 'USD', label: 'USD (amerikai dollár)' },
  { code: 'CHF', label: 'CHF (svájci frank)' },
  { code: 'GBP', label: 'GBP (angol font)' },
]

/** Gyorsválasztó színek — a bankkártyák hátteréhez. */
const COLOR_SWATCHES = [
  '#206bc4', // kék
  '#059669', // zöld
  '#7c3aed', // lila
  '#d97706', // narancs
  '#dc2626', // piros
  '#0891b2', // cián
  '#4338ca', // indigó
  '#65a30d', // olíva
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadott: szerkesztési mód. */
  account?: BankAccount | null
  /** Az aktív gyülekezet ID-ja. */
  congregationId: string
  /** Sikeres mentés után. */
  onSaved?: () => void | Promise<void>
}

export function BankAccountDialog({
  open,
  onOpenChange,
  account,
  congregationId,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [bankNeve, setBankNeve] = useState('')
  const [iban, setIban] = useState('')
  const [valuta, setValuta] = useState('RON')
  const [nyitoEgyenleg, setNyitoEgyenleg] = useState<number | ''>(0)
  const [szin, setSzin] = useState('#206bc4')
  const [isDefault, setIsDefault] = useState(false)
  const [aktiv, setAktiv] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      // Betöltéskor: vagy szerkesztési adatokkal, vagy üres űrlappal
      if (account) {
        setBankNeve(account.bank_neve || '')
        setIban(account.iban || '')
        setValuta(account.valuta || 'RON')
        setNyitoEgyenleg(account.nyito_egyenleg ?? 0)
        setSzin(account.szin || '#206bc4')
        setIsDefault(account.is_default || false)
        setAktiv(account.aktiv !== false)
      } else {
        setBankNeve('')
        setIban('')
        setValuta('RON')
        setNyitoEgyenleg(0)
        setSzin('#206bc4')
        setIsDefault(false)
        setAktiv(true)
      }
    })
    return () => { cancelled = true }
  }, [open, account])

  async function handleSave() {
    if (!bankNeve.trim() || bankNeve.trim().length < 2) {
      toast.error('A bankszámla nevéhez legalább 2 karakter kell.')
      return
    }

    setSaving(true)
    const payload = {
      id: account?.id,
      bankNeve: bankNeve.trim(),
      iban: iban.trim() || undefined,
      valuta: valuta.trim().toUpperCase(),
      nyitoEgyenleg: typeof nyitoEgyenleg === 'number' ? nyitoEgyenleg : 0,
      szin,
      ikon: 'building-2',
      isDefault,
      aktiv,
    }

    const result = await saveCongregationBankAccount(congregationId, payload)
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(account ? 'Bankszámla frissítve.' : 'Bankszámla hozzáadva.')
    onOpenChange(false)
    if (onSaved) await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-xl
          max-h-[90vh] overflow-y-auto
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-violet-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm">
              <Landmark className="size-5" />
            </span>
            {account ? 'Bankszámla szerkesztése' : 'Új bankszámla hozzáadása'}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            A bankszámla a pénzügyi forgalom könyveléséhez szükséges. Többféle devizát
            is használhat egymás mellett.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-5">
          {/* Megnevezés */}
          <div className="space-y-1.5">
            <Label>Megnevezés *</Label>
            <Input
              value={bankNeve}
              onChange={(e) => setBankNeve(e.target.value)}
              placeholder="pl. BCR fő számla"
              className="h-11"
            />
            <p className="text-[11px] text-slate-500">
              Ez jelenik meg a bankkártyán (pl. &bdquo;BCR fő számla&rdquo;, &bdquo;OTP EUR&rdquo;).
            </p>
          </div>

          {/* IBAN + Deviza */}
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="RO00 XXXX 0000 0000 0000 0000"
                className="h-11 font-mono text-sm tracking-wide"
              />
              <p className="text-[11px] text-slate-500">Opcionális, de ajánlott banki importhoz.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Deviza *</Label>
              <select
                value={valuta}
                onChange={(e) => setValuta(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-background px-3 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nyitó egyenleg — a Bank fülön / banki import során ÉVENKÉNTI bontásban kezelt */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-1">
              💡 Nyitó egyenleget hol adhatod meg?
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              A bankszámla létrehozásakor NEM kötelező a nyitó egyenleg. Az első
              banki Excel import során (<strong>Pénzügy → Bank → Excel import</strong>)
              a wizard megkérdezi az <strong>év eleji nyitó egyenleget</strong> (évenként).
              Valutás számlánál <strong>RON ekvivalenst is</strong> megad (árfolyammal).
            </p>
            {account && (
              <p className="text-[11px] text-slate-500 mt-2">
                Szerkesztési módban: a korábban rögzített induló érték megmarad,
                az éves nyitók kezelése a Bank fülre költözött.
              </p>
            )}
          </div>

          {/* Szín */}
          <div className="space-y-1.5">
            <Label>Szín</Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSzin(c)}
                  className={`size-9 rounded-xl border-2 transition-all ${
                    szin === c ? 'border-slate-800 scale-110 shadow-md' : 'border-white hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Szín ${c}`}
                />
              ))}
              <Input
                type="color"
                value={szin}
                onChange={(e) => setSzin(e.target.value)}
                className="w-12 h-9 p-1"
              />
            </div>
          </div>

          {/* Kártya-előnézet */}
          <div className="card-raised p-4">
            <div className="text-[10px] uppercase text-slate-400 tracking-wider mb-2">
              Előnézet
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${szin}15` }}
              >
                <Building2 className="h-5 w-5" style={{ color: szin }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">
                  {bankNeve || 'Bankszámla neve'}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {iban || 'Nincs IBAN'} · {valuta}
                </p>
                <p className="text-[11px] text-slate-500">
                  Nyitó egyenleg:{' '}
                  {typeof nyitoEgyenleg === 'number'
                    ? nyitoEgyenleg.toLocaleString('hu-HU', { maximumFractionDigits: 2 })
                    : '0'}{' '}
                  {valuta}
                </p>
              </div>
            </div>
          </div>

          {/* Kapcsolók */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Legyen az alapértelmezett bankszámla
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={aktiv}
                onChange={(e) => setAktiv(e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Aktív (használatban)
            </label>
          </div>

          {/* Mentés / Mégse */}
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                </>
              ) : account ? (
                'Módosítások mentése'
              ) : (
                'Bankszámla hozzáadása'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
