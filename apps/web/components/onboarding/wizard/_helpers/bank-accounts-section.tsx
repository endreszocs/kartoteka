'use client'

/**
 * Multi-bankszámla szakasz a Welcome wizard Step 2-ben (2026-05-05).
 *
 * Több bankszámla rögzítését teszi lehetővé. Mentés a `bankszamlak` táblába
 * (a pénzügyi modul saját bankszámla-táblája) történik a `completeWizard()`-ban.
 *
 * UX:
 *   - Üres állapotban: egyszerű "+ Új bankszámla hozzáadása" gomb
 *   - Hozzáadás után: kártya a számla mezőivel (bank, IBAN, valuta) +
 *     "Fő számla" radio + törlés gomb
 *   - A "Fő számla" globális — egyetlen lehet, radio-szerűen működik
 *   - Először mindig a első hozzáadott számla az alapértelmezett "Fő"
 */

import { Banknote, Star, Coins } from 'lucide-react'

import {
  WizardSectionCard,
  WizardField,
  WizardListItem,
  WizardAddButton,
  WizardInputGrid,
  Input,
} from './wizard-ui'

export interface BankAccountSlot {
  bank_neve: string
  iban: string
  valuta: 'RON' | 'EUR' | 'USD' | 'HUF'
  is_default: boolean
  /** Stable client-side ID a React key-hez (mentésnél nem küldjük) */
  _clientKey: string
}

export function createEmptyBankAccount(isDefault = false): BankAccountSlot {
  return {
    bank_neve: '',
    iban: '',
    valuta: 'RON',
    is_default: isDefault,
    _clientKey: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
}

interface BankAccountsSectionProps {
  accounts: BankAccountSlot[]
  onChange: (next: BankAccountSlot[]) => void
}

export function BankAccountsSection({ accounts, onChange }: BankAccountsSectionProps) {
  function addAccount() {
    const isFirst = accounts.length === 0
    onChange([...accounts, createEmptyBankAccount(isFirst)])
  }

  function removeAccount(idx: number) {
    const removed = accounts[idx]
    const next = accounts.filter((_, i) => i !== idx)
    // Ha a törölt volt a fő számla, az első maradót jelöljük fő-nak
    if (removed.is_default && next.length > 0) {
      next[0] = { ...next[0], is_default: true }
    }
    onChange(next)
  }

  function updateAccount(idx: number, patch: Partial<BankAccountSlot>) {
    onChange(accounts.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }

  function setDefault(idx: number) {
    onChange(accounts.map((a, i) => ({ ...a, is_default: i === idx })))
  }

  return (
    <WizardSectionCard
      icon={Banknote}
      iconColor="text-emerald-600"
      iconBg="bg-emerald-50"
      title="Banki adatok (opcionális)"
      description="Több bankszámla is rögzíthető — pl. egy fő RON-számla és egy valutás (EUR) számla. Később a Pénzügy menüben bővíthető."
    >
      {accounts.length === 0 ? (
        <p className="text-xs text-slate-500">
          Most nincs banki számla felvéve. Ha van — kattints az alábbi gombra a
          hozzáadáshoz. Ezt a lépést későbbre is halaszthatod.
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc, idx) => (
            <WizardListItem
              key={acc._clientKey}
              title={
                acc.bank_neve ||
                (acc.iban ? `IBAN: ${acc.iban.slice(0, 8)}…` : `Új bankszámla #${idx + 1}`)
              }
              subtitle={
                acc.is_default
                  ? `🟢 Fő számla • ${acc.valuta}`
                  : `${acc.valuta} számla`
              }
              onRemove={() => removeAccount(idx)}
            >
              <WizardInputGrid cols={2}>
                <WizardField id={`bank-name-${idx}`} label="Bank neve" required>
                  <Input
                    id={`bank-name-${idx}`}
                    placeholder="pl. Banca Transilvania"
                    value={acc.bank_neve}
                    onChange={e => updateAccount(idx, { bank_neve: e.target.value })}
                  />
                </WizardField>
                <WizardField
                  id={`bank-currency-${idx}`}
                  label="Valuta"
                  required
                >
                  <select
                    id={`bank-currency-${idx}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={acc.valuta}
                    onChange={e =>
                      updateAccount(idx, {
                        valuta: e.target.value as BankAccountSlot['valuta'],
                      })
                    }
                  >
                    <option value="RON">RON — Román lej</option>
                    <option value="EUR">EUR — Euró</option>
                    <option value="USD">USD — Amerikai dollár</option>
                    <option value="HUF">HUF — Magyar forint</option>
                  </select>
                </WizardField>
              </WizardInputGrid>

              <WizardField
                id={`bank-iban-${idx}`}
                label="IBAN"
                hint="A bankszámla nemzetközi azonosítója — a bankszámla-kivonaton vagy az online bankban található."
              >
                <Input
                  id={`bank-iban-${idx}`}
                  placeholder="RO49 AAAA 1B31 0075 9384 0000"
                  value={acc.iban}
                  onChange={e => updateAccount(idx, { iban: e.target.value })}
                />
              </WizardField>

              <button
                type="button"
                onClick={() => setDefault(idx)}
                disabled={acc.is_default}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  acc.is_default
                    ? 'cursor-default border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-700'
                }`}
              >
                <Star
                  className={`size-4 ${acc.is_default ? 'fill-amber-500 text-amber-500' : ''}`}
                />
                <span>
                  {acc.is_default
                    ? 'Ez a fő számla'
                    : 'Beállítás fő számlának'}
                </span>
              </button>
            </WizardListItem>
          ))}
        </div>
      )}

      <WizardAddButton
        onClick={addAccount}
        label={accounts.length === 0 ? 'Új bankszámla hozzáadása' : 'További bankszámla hozzáadása'}
      />

      {accounts.length > 1 && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Coins className="size-3.5" />
          <span>
            {accounts.length} bankszámla rögzítve. A fő számla a bizonylatokon
            szerepel; a többi a valutás vagy elkülönített befizetésekhez használható.
          </span>
        </p>
      )}
    </WizardSectionCard>
  )
}
