/**
 * DesktopCombinedEntryDialog — összevont bevétel/kiadás rögzítő (C-hullám C1).
 *
 * A web `combined-entry-dialog.tsx` PONTOS desktop megfelelője: egyetlen modal,
 * Bevétel/Kiadás fülekkel, a megosztott `CombinedEntryBody`-val (azonos komponens
 * = azonos pixel). A különbség kizárólag a callback-bekötésben van: a web szerver-
 * akciókat hív, a desktop a SAJÁT, bizonyított offline/online írási útját
 * (`saveIncomeUseCase` / `saveExpenseUseCase` / `saveInternalTransferUseCase`) —
 * pontosan azt, amit a `befizetes-page` / `kiadas-page` egyesével már használ.
 *
 * Írási elv ("pénzügyekkel nem lehet viccelni"):
 *   - Online: a tételek a Supabase-be mennek azonnal (mint a webben).
 *   - Offline: KÉSZPÉNZES tételek az iratszám-tárcából kapnak sorszámot és a
 *     `*_pending_local` táblába kerülnek, outbox-on át sync-re várva. Banki
 *     tétel offline NEM rögzíthető — a use-case `offlineNotSupported`-ot ad,
 *     amit soron továbbítunk (sosem néma).
 *   - Belső mozgás (kassza ↔ bank) csak ONLINE — offline egyértelmű üzenet a
 *     dedikált Pénzügy → Belső mozgás oldalra irányít.
 *   - Minden sor a SAJÁT iratszámát + validációját kapja (a use-case adja); egy
 *     sor hibája nem nyeli el a többit — a hibás sorok száma + indoka látszik.
 *
 * Szándékos, biztonságos eltérés a webtől: a desktop a kiadáshoz KÖTELEZŐVÉ
 * teszi az átvevő megadását (a `saveExpenseUseCase` `atvevoid || atvevo` szabálya
 * — teljesebb kiadás-nyilvántartás). Üres átvevőnél a sor egyértelmű hibát ad.
 */

import { useState } from 'react'
import { AlertCircle, CheckCircle2, ListPlus } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import {
  CombinedEntryBody,
  type IncomeCategory,
  type ExpenseCategory,
  type CombinedBankAccount,
  type SaveIncomeBatchRow,
  type SaveExpenseBatchRow,
  type CombinedInternalTransferPayload,
} from '@kartoteka/ui-app'
import {
  saveExpenseUseCase,
  saveIncomeUseCase,
  searchMembersForFinanceUseCase,
} from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import {
  nextReceiptNumbersOnline,
  searchFamiliesOnline,
  familyMembersOnline,
  familyMembersForPersonOnline,
  expectedJarulekOnline,
} from '../lib/finance-entry-lookups'
import { getDesktopSupabase } from '../lib/supabase'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'
import { isOnlineWithSession } from '../lib/use-session-online'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  bankAccounts: CombinedBankAccount[]
  currentYear: number
  congregationId: string
  userId: string
}

type ToastState = { kind: 'success' | 'error'; msg: string } | null

export function DesktopCombinedEntryDialog({
  open,
  onOpenChange,
  incomeCategories,
  expenseCategories,
  bankAccounts,
  currentYear,
  congregationId,
  userId,
}: Props) {
  const [toast, setToast] = useState<ToastState>(null)

  // ── Bevétel-batch → soronként saveIncomeUseCase (online + offline) ──
  // A web `saveIncomeBatch` mintájára: az ELSŐ hibás sornál megállunk és a sor
  // sorszámával jelezzük (a már mentett sorok bent maradnak — azonos a web
  // viselkedésével, mert a megosztott komponens hibánál nyitva hagyja a modalt).
  //
  // 2026-06-11 fix: az online-döntés SESSION-tudatos (isOnlineWithSession) —
  // PIN-es munkamenetben működő internettel is az offline (tárcás) ág fut,
  // különben a kérés anon-szerepkörrel menne („permission denied").
  async function handleIncomeBatch(
    rows: SaveIncomeBatchRow[],
  ): Promise<{ error?: string | null }> {
    const supabase = getDesktopSupabase()
    const isOnline = await isOnlineWithSession()
    const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      try {
        const result = await saveIncomeUseCase(
          {
            congregationId,
            osszeg: row.osszeg,
            datum: row.datum,
            id_befizetescel: row.id_befizetescel,
            // B1: a rögzítő tag-keresőjéből (kölcsönösen kizáró pár)
            id_szemely: row.id_szemely ?? null,
            id_csalad: row.id_csalad ?? null,
            forrasa: row.forrasa,
            // Offline-ban a backend a tárcából választ iratszámot.
            iratszam: isOnline ? row.iratszam : null,
            // #3 (Endre): gyülekezeti saját sorszám → befizetes.nyugta (a kerületi mellett).
            nyugta: row.nyugta ?? null,
            irattipus: row.irattipus,
            fizetettev: row.fizetettev,
            megjegyzes: row.megjegyzes,
          },
          { supabase, runtime: 'desktop', userId, isOnline, offlineBackend },
        )
        if (!result.success) {
          return { error: `${i + 1}. bevétel-sor: ${result.error}` }
        }
        // E3: online mentés sikerkor a hivatalos Excelbe is (várólistán át).
        // Offline tételt a push-sync enqueue-ol, amikor már van szerver-id.
        if (!result.pending && result.data.id > 0) {
          void enqueueEntryExcelRow({
            type: 'befizetes',
            serverId: result.data.id,
            congregationId,
            datum: row.datum,
            iratszam: result.data.iratszam,
            irattipus: row.irattipus,
            nev: row.forrasa ?? '',
            osszeg: row.osszeg,
            celId: row.id_befizetescel,
            megjegyzes: row.megjegyzes,
            ev: row.fizetettev,
          })
        }
      } catch (err) {
        return { error: `${i + 1}. bevétel-sor: ${errorMessage(err)}` }
      }
    }
    return { error: null }
  }

  // ── Kiadás-batch → soronként saveExpenseUseCase (online + offline) ──
  async function handleExpenseBatch(
    rows: SaveExpenseBatchRow[],
  ): Promise<{ error?: string | null }> {
    const supabase = getDesktopSupabase()
    const isOnline = await isOnlineWithSession()
    const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      try {
        const result = await saveExpenseUseCase(
          {
            congregationId,
            osszeg: row.osszeg,
            datum: row.datum,
            id_kiadascel: row.id_kiadascel,
            atvevoid: null,
            // A web batch a `kedvezmenyzett`-et szövegként rögzíti → desktop `atvevo`.
            // A desktop `saveExpenseUseCase` kötelezővé teszi az átvevőt (teljesebb
            // kiadás-nyilvántartás) — üres átvevőnél a sor egyértelmű hibát ad.
            atvevo: row.kedvezmenyzett,
            kedvezmenyezett_cui: null,
            iratszam: isOnline ? row.iratszam : null,
            irattipus: row.irattipus,
            megjegyzes: row.megjegyzes,
            vonatkozo_idoszak: null,
          },
          { supabase, runtime: 'desktop', userId, isOnline, offlineBackend },
        )
        if (!result.success) {
          return { error: `${i + 1}. kiadás-sor: ${result.error}` }
        }
        // E3: online mentés sikerkor a hivatalos Excelbe is (várólistán át).
        if (!result.pending && result.data.id > 0) {
          void enqueueEntryExcelRow({
            type: 'kiadas',
            serverId: result.data.id,
            congregationId,
            datum: row.datum,
            iratszam: result.data.iratszam,
            irattipus: row.irattipus,
            nev: row.kedvezmenyzett ?? '',
            osszeg: row.osszeg,
            celId: row.id_kiadascel,
            megjegyzes: row.megjegyzes,
          })
        }
      } catch (err) {
        return { error: `${i + 1}. kiadás-sor: ${errorMessage(err)}` }
      }
    }
    return { error: null }
  }

  // ── Belső mozgás (kassza ↔ bank) → a dedikált Belső mozgás oldalra irányít ──
  // A `CombinedEntryBody` a belső-mozgás soroknál a `forras`/`cel`-t a bankszámla
  // ID-jával tölti (`String(bankId)`), míg a desktop `saveInternalTransferUseCase`
  // SZÖVEGES forrás/cél nevet vár (mint a Belső mozgás oldal). A névfeloldáshoz a
  // banklista kell — ez a C2 BankTab hulláma. Addig a belső mozgást a dedikált,
  // helyes oldalra irányítjuk (sosem rögzítünk hibás forrás/cél nevet).
  async function handleInternalTransfer(
    _payload: CombinedInternalTransferPayload,
  ): Promise<{ error?: string | null }> {
    return {
      error:
        'A belső mozgást (kassza ↔ bank) a Pénzügy → Belső mozgás oldalon rögzítsd — ott a banki forrás/cél pontosan megadható.',
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100%-1rem)] overflow-y-auto p-0 sm:max-w-5xl xl:max-w-[90vw] 2xl:max-w-[84vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
                <ListPlus className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Tétel rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Bevételek és kiadások egyszerre, tömegesen — a Mentés dátum szerint rendez.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">
          {toast && (
            <div
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={`mb-3 rounded-md border px-3 py-2 text-sm ${
                toast.kind === 'error'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
              }`}
            >
              {toast.kind === 'error' ? (
                <AlertCircle className="mr-1.5 inline-block size-4" />
              ) : (
                <CheckCircle2 className="mr-1.5 inline-block size-4" />
              )}
              {toast.msg}
            </div>
          )}

          <CombinedEntryBody
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            bankAccounts={bankAccounts}
            currentYear={currentYear}
            // B1 (2026-06-11): tag-keresés a Befizető mezőben + családi mód
            onSearchMembers={async (query) => {
              const res = await searchMembersForFinanceUseCase(
                { congregationId, query, limit: 8 },
                { supabase: getDesktopSupabase(), runtime: 'desktop' },
              )
              if (!res.success) return []
              return res.members.map((m) => ({
                id: m.id,
                name: `${m.csaladnev ?? ''} ${m.k_nev ?? ''}`.trim() || `#${m.id}`,
              }))
            }}
            // 2026-06-21: ONLINE lekérdezések (a desktop offline ezekre üres/null-t ad → nincs auto-kitöltés).
            // A járulék-számítás magja KÖZÖS a webbel (computeJarulekForMemberYear) → az összeg sosem tér el.
            onSearchFamilies={async (query) => await searchFamiliesOnline(congregationId, query)}
            onGetFamilyMembers={async (familyId) => await familyMembersOnline(congregationId, familyId)}
            onGetFamilyMembersForPerson={async (personId) => await familyMembersForPersonOnline(congregationId, personId)}
            onGetNextReceiptNumbers={async (year) => await nextReceiptNumbersOnline(congregationId, year)}
            onGetExpectedJarulek={async (personId, year) => await expectedJarulekOnline(congregationId, personId, year)}
            onSaveIncomeBatch={handleIncomeBatch}
            onSaveExpenseBatch={handleExpenseBatch}
            onSaveInternalTransfer={handleInternalTransfer}
            onClose={() => onOpenChange(false)}
            onToast={(type, message) =>
              setToast({ kind: type === 'success' ? 'success' : 'error', msg: message })
            }
            draftStorageKey={`kartoteka:combined-entry-draft:${congregationId}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
