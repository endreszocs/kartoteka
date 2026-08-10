/**
 * DesktopBankTab — a megosztott `BankTab` desktop-bekötése (2026-06-11, paritás #5).
 *
 * A web `components/finance/bank-tab.tsx` wrapper tükre, webes server actionök
 * helyett desktop adatforrásokkal:
 *   - sztornó-visszavonás: core `undoStornoUseCase` + Excel újra-append (E3),
 *   - éves nyitó egyenleg: közvetlen Supabase (`bankszamla_nyito_egyenleg`),
 *   - sztornó / szerkesztés modal: meglévő desktop dialógusok,
 *   - bankszámla felvétel/szerkesztés: `DesktopBankAccountDialog`,
 *   - banki Excel-kivonat import: a desktopon DEDIKÁLT oldala van
 *     (`/bank-import`, bankszámla-kötéssel + Excel-írással) — a wizard-slot
 *     ide irányít át, nem duplikáljuk a webes wizardot.
 */

import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import { BankTab as SharedBankTab, type BankTabProps, type NyitoEgyenlegRow } from '@kartoteka/ui-app'
import { undoStornoUseCase } from '@kartoteka/core'

import { enqueueUndoStornoReappend } from '../lib/excel-enqueue'
import { isOnlineWithSession } from '../lib/use-session-online'
import { getDesktopSupabase } from '../lib/supabase'
import { errorMessage } from '../lib/error'
import { DesktopBankAccountDialog } from './bank-account-dialog'
import { DesktopStornoConfirmDialog } from './storno-confirm-dialog'
import { DesktopTransactionEditDialog } from './transaction-edit-dialog'

type DesktopBankTabProps = Pick<
  BankTabProps,
  | 'incomeRecords'
  | 'expenseRecords'
  | 'carryoverBank'
  // 2026-07-25 (F6.2 / G5-paritás): levezetett nyitó számlánként — enélkül a
  // kártyák „nincs rögzítve" feliratot mutattak, és egy számlára szűrve 0-ról
  // indult a nyitó, miközben az „Összes" már a feloldott értéket tartalmazta.
  | 'derivedNyitoRon'
  | 'bankAccounts'
  | 'bevCelMap'
  | 'kiaCelMap'
  | 'szamadasiCellek'
  | 'incomeCategories'
  | 'expenseCategories'
  | 'congregationId'
  | 'currentYear'
  | 'onTransactionChanged'
  | 'onBankAccountSaved'
  | 'onToast'
  // 2026-08-11 (5. kör, P0-követő): véglegesített (beküldött) évben a Bank
  // fülön se legyen szerkesztés — a web-fülön ugyanez a zár.
  | 'accountingFinalized'
> & {
  congregationId: string
  userId: string
}

export function DesktopBankTab({ congregationId, userId, ...props }: DesktopBankTabProps) {
  const navigate = useNavigate()

  return (
    <SharedBankTab
      {...props}
      congregationId={congregationId}
      onUndoStorno={async ({ type, id }) => {
        const result = await undoStornoUseCase(
          { congregationId, type, id },
          { supabase: getDesktopSupabase(), runtime: 'desktop', userId },
        )
        // E3: ha a sztornó tükör-sora az Excel-útvonalon volt, a visszavonás
        // az eredeti sort újra-appendeli (kioltja a tükröt) — mint a Kasszánál.
        if (result.success) {
          void enqueueUndoStornoReappend({ type, serverId: id, congregationId })
        }
        return { success: result.success, error: result.success ? null : result.error }
      }}
      onLoadNyitoEgyenleg={async (bankszamlaId, eve) => {
        // Online adat — internet + felhő-belépés nélkül nincs nyitó egyenleg
        // (a tranzakció-lista lokálisból így is megjelenik).
        if (!(await isOnlineWithSession())) {
          return { data: null, error: null }
        }
        try {
          const { data, error } = await getDesktopSupabase()
            .from('bankszamla_nyito_egyenleg')
            .select('*')
            .eq('bankszamla_id', bankszamlaId)
            .eq('eve', eve)
            .eq('congregation_id', congregationId)
            .maybeSingle()
          if (error) return { data: null, error: error.message }
          return { data: (data as NyitoEgyenlegRow | null) ?? null, error: null }
        } catch (e) {
          return { data: null, error: errorMessage(e) }
        }
      }}
      stornoConfirmDialogSlot={({ open, onOpenChange, type, id, summary, isInternalTransfer, onStornoed }) => (
        <DesktopStornoConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          type={type}
          id={id}
          summary={summary}
          isInternalTransfer={isInternalTransfer}
          onStornoed={onStornoed}
          congregationId={congregationId}
          userId={userId}
        />
      )}
      transactionEditDialogSlot={({ open, onOpenChange, type, id, initial, categories, onSaved }) => (
        <DesktopTransactionEditDialog
          open={open}
          onOpenChange={onOpenChange}
          type={type}
          id={id}
          initial={initial}
          categories={categories}
          onSaved={onSaved}
          congregationId={congregationId}
          userId={userId}
        />
      )}
      bankAccountDialogSlot={({ open, onOpenChange, account, congregationId: slotCongId, onSaved }) => (
        <DesktopBankAccountDialog
          open={open}
          onOpenChange={onOpenChange}
          account={account}
          congregationId={slotCongId || congregationId}
          onSaved={onSaved}
        />
      )}
      // A desktopon a banki kivonat importnak saját, teljes oldala van
      // (bankszámla-választóval + Excel-írással) — a wizard gomb oda visz.
      bcrImportWizardDialogSlot={({ open, onOpenChange }) => (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-violet-600" />
                Banki kivonat importálása
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-slate-600">
              Az asztali alkalmazásban a banki kivonat importálásának saját
              oldala van: ott kiválasztod a bankszámlát, betöltöd az Excel
              kivonatot, és a tételek a hivatalos könyvelés-fájlba is bekerülnek.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Mégse
              </Button>
              <Button
                className="bg-violet-600 text-white hover:bg-violet-700"
                onClick={() => {
                  onOpenChange(false)
                  navigate('/bank-import')
                }}
              >
                Tovább a Bank importra
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    />
  )
}
