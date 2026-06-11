/**
 * DesktopBankAccountDialog — a megosztott `BankTab.bankAccountDialogSlot`
 * desktop megvalósítása (2026-06-11, paritás #5).
 *
 * A web `components/modals/bank-account-dialog.tsx` tükre: megnevezés, IBAN,
 * deviza, szín, alapértelmezett/aktív kapcsolók + kártya-előnézet. A mentés a
 * web `saveCongregationBankAccount` action logikáját követi közvetlen
 * Supabase-hívással (is_default reset → insert/update), és — a B6 biztonsági
 * elvnek megfelelően — csak hitelesített felhő-munkamenettel fut
 * (`getVerifiedSession`), mert a bankszámla-törzs online adat.
 */

import { useEffect, useState } from 'react'
import { Building2, Landmark, Loader2 } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@kartoteka/ui'
import type { BankAccount } from '@kartoteka/ui-app'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getVerifiedSession } from '../lib/verified-session'

/** Támogatott devizák — a web dialóggal egyező lista. */
const CURRENCIES = [
  { code: 'RON', label: 'RON (román lej)' },
  { code: 'EUR', label: 'EUR (euró)' },
  { code: 'HUF', label: 'HUF (magyar forint)' },
  { code: 'USD', label: 'USD (amerikai dollár)' },
  { code: 'CHF', label: 'CHF (svájci frank)' },
  { code: 'GBP', label: 'GBP (angol font)' },
]

/** Gyorsválasztó színek — a web dialóggal egyező paletta. */
const COLOR_SWATCHES = [
  '#206bc4', '#059669', '#7c3aed', '#d97706',
  '#dc2626', '#0891b2', '#4338ca', '#65a30d',
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadott: szerkesztési mód. */
  account?: BankAccount | null
  congregationId: string
  onSaved?: () => void | Promise<void>
}

export function DesktopBankAccountDialog({
  open,
  onOpenChange,
  account,
  congregationId,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bankNeve, setBankNeve] = useState('')
  const [iban, setIban] = useState('')
  const [valuta, setValuta] = useState('RON')
  const [szin, setSzin] = useState('#206bc4')
  const [isDefault, setIsDefault] = useState(false)
  const [aktiv, setAktiv] = useState(true)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (account) {
      setBankNeve(account.bank_neve || '')
      setIban(account.iban || '')
      setValuta(account.valuta || 'RON')
      setSzin(account.szin || '#206bc4')
      setIsDefault(account.is_default || false)
      setAktiv(account.aktiv !== false)
    } else {
      setBankNeve('')
      setIban('')
      setValuta('RON')
      setSzin('#206bc4')
      setIsDefault(false)
      setAktiv(true)
    }
  }, [open, account])

  async function handleSave() {
    if (!bankNeve.trim() || bankNeve.trim().length < 2) {
      setError('A bankszámla nevéhez legalább 2 karakter kell.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // B6: bankszámla-törzs írása csak igazolt felhő-belépéssel.
      const verified = await getVerifiedSession()
      if (!verified.ok) {
        setError(verified.message)
        return
      }

      const supabase = getDesktopSupabase()
      const record = {
        congregation_id: congregationId,
        bank_neve: bankNeve.trim(),
        iban: iban.trim() || null,
        valuta: valuta.trim().toUpperCase(),
        aktiv,
        // A nyitó egyenleg ÉVENKÉNT a Bank fülön / import-wizardban kezelt —
        // itt (a webbel egyezően) megőrizzük a meglévő értéket, újnál 0.
        nyito_egyenleg: account?.nyito_egyenleg ?? 0,
        szin: szin || '#206bc4',
        ikon: 'building-2',
        is_default: isDefault,
      }

      // A webes save-action logikája: default-jelölésnél előbb minden számláról
      // levesszük a default flaget.
      if (isDefault) {
        const reset = await supabase
          .from('bankszamlak')
          .update({ is_default: false })
          .eq('congregation_id', congregationId)
        if (reset.error) {
          setError(reset.error.message)
          return
        }
      }

      const result = account?.id
        ? await supabase.from('bankszamlak').update(record).eq('id', account.id).eq('congregation_id', congregationId)
        : await supabase.from('bankszamlak').insert(record)

      if (result.error) {
        setError(result.error.message)
        return
      }

      onOpenChange(false)
      if (onSaved) await onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30 sm:w-full sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-heading text-xl text-slate-800">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm">
              <Landmark className="size-5" />
            </span>
            {account ? 'Bankszámla szerkesztése' : 'Új bankszámla hozzáadása'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Megnevezés *</Label>
            <Input
              value={bankNeve}
              onChange={(e) => setBankNeve(e.target.value)}
              placeholder="pl. BCR fő számla"
              className="h-11"
            />
            <p className="text-[11px] text-slate-500">
              Ez jelenik meg a bankkártyán (pl. „BCR fő számla", „OTP EUR").
            </p>
          </div>

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

          <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
              💡 Nyitó egyenleget hol adhatod meg?
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600">
              A bankszámla létrehozásakor NEM kötelező a nyitó egyenleg. Az éves
              nyitó egyenlegeket a Bank fül / banki Excel-import kezeli (évenként,
              valutás számlánál RON-ekvivalenssel).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Szín</Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSzin(c)}
                  className={`size-9 rounded-xl border-2 transition-all ${
                    szin === c ? 'scale-110 border-slate-800 shadow-md' : 'border-white hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Szín ${c}`}
                />
              ))}
              <Input
                type="color"
                value={szin}
                onChange={(e) => setSzin(e.target.value)}
                className="h-9 w-12 p-1"
              />
            </div>
          </div>

          <div className="card-raised p-4">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">Előnézet</div>
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
              </div>
            </div>
          </div>

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

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-violet-600 text-white shadow-sm hover:bg-violet-700"
              onClick={() => void handleSave()}
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
