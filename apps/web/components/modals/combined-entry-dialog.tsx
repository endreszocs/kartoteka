'use client'

/**
 * Összevont bevétel/kiadás rögzítő dialog — a hero „+ Tétel rögzítése" gomb.
 *
 * Egyetlen modal, Bevétel/Kiadás fülekkel; egyszerre több bevétel és kiadás
 * is rögzíthető, a Mentés dátum szerint rendez és mindent a helyére ír
 * (saveIncomeBatch + saveExpenseBatch).
 */

import {
  CombinedEntryBody,
  type IncomeCategory,
  type ExpenseCategory,
  type CombinedBankAccount,
} from '@kartoteka/ui-app'
// A mag (`finance-scope-core.ts`) import-mentes, ezért kliens-komponensben is
// biztonságos (a `finance-scope.ts` gazda-modul `server-only` láncot húzna be).
import type { FinanceScope } from '@/lib/auth/finance-scope-core'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RogzitesBiztato } from '@/components/finance/kassza-biztato'
import { ListPlus } from 'lucide-react'
import { checkSimilarBankEntries } from '@/app/(dashboard)/penzugy/hasonlo-tetel-actions'
import {
  saveIncomeBatch,
  saveExpenseBatch,
  saveInternalTransfer,
  ellenorizMentesElore,
  searchIncomePartners,
  searchExpensePartners,
  searchFamilies,
  getFamilyMembers,
  getFamilyMembersForPerson,
  getExpectedJarulek,
  getNextReceiptNumbers,
  checkReceiptDuplicate,
  getLastRecordedDate,
} from '@/app/(dashboard)/penzugy/actions'
import { toast } from 'sonner'

/** #Endre 2026-07-01: teljes-években vett életkor a születési dátumból (sz_datum). */
function ageFromBirth(szDatum: unknown): number | null {
  if (!szDatum) return null
  const b = new Date(String(szDatum))
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  bankAccounts: CombinedBankAccount[]
  currentYear: number
  /** Az aktív gyülekezet — az auto-vázlatmentés kulcsához (gyülekezet-specifikus). */
  congregationId?: string
  /** 2026-08-09: pénzügy→leltár híd — a leltár-köteles kiadás-jogcímeknél
   *  (205.01 / 201.12) „Leltárba vétel" al-űrlap; csak gyülekezeti módban. */
  offerExpenseInventory?: boolean
  /**
   * 2026-08-22 (5. pont / 5a): melyik SZINT könyvébe rögzítünk. A befizető-kereső
   * felső szinten nem személyeket, hanem JOGI SZEMÉLYEKET ajánl (gyülekezet /
   * egyházmegye) — a döntést a szerver hozza meg (`searchIncomePartners`), ez a
   * prop a GYÜLEKEZET-SPECIFIKUS al-funkciókat (családi nyugta, járulék-ajánló)
   * kapcsolja ki felső szinten. Alapértéke `'congregation'`, ezért a Dokumentumtár
   * gyülekezeti hívója változatlan marad.
   */
  scope?: FinanceScope
}

export function CombinedEntryDialog({ open, onOpenChange, incomeCategories, expenseCategories, bankAccounts, currentYear, congregationId, offerExpenseInventory, scope = 'congregation' }: Props) {
  const gyulekezeti = scope === 'congregation'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-5xl xl:max-w-[90vw] 2xl:max-w-[84vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
                <ListPlus className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Tétel rögzítése</DialogTitle>
                {/* 2026-07-10 (S2-#2): színkódolt jelmagyarázat — egyértelmű, hogy EGY mentéssel
                    bevétel (zöld) ÉS kiadás (piros) is rögzíthető, tömegesen. */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-zinc-400">
                  Egy mentéssel több
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />bevétel
                  </span>
                  és
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 font-medium text-rose-600">
                    <span className="inline-block size-1.5 rounded-full bg-rose-500" aria-hidden />kiadás
                  </span>
                  is rögzíthető — a Mentés dátum szerint rendez.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 2026-08-15 (Endre kérése): az igevers és a bátorítás a Kassza fülről
            IDE, a rögzítő ablakba költözött — kiemelten, mindjárt a fejléc alatt.
            (A Kassza fül párhuzamos sávja megszűnt: a gombja megkettőzte a hero
            „Tétel rögzítése" gombját.) */}
        <div className="px-6 pt-4">
          <RogzitesBiztato />
        </div>

        <div className="px-6 pb-6 pt-4">
          <CombinedEntryBody
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            bankAccounts={bankAccounts}
            currentYear={currentYear}
            onSaveIncomeBatch={async (rows) => {
              const res = await saveIncomeBatch(rows)
              // 2026-09-01: a köteg-index továbbadása — ebből a rögzítő megtalálja és
              // MEGJELÖLI a valódi űrlapsort, amelyiken a mentés elakadt.
              return {
                error: 'error' in res ? res.error ?? null : null,
                failedIndex: 'failedIndex' in res ? res.failedIndex : null,
              }
            }}
            onSaveExpenseBatch={async (rows) => {
              // D1: az átvevő a rögzítő kapuja miatt nem üres; a megosztott
              // sor-típus még string|null — a zod min(1) a szerveren backstopol.
              const res = await saveExpenseBatch(rows.map((r) => ({ ...r, kedvezmenyzett: r.kedvezmenyzett ?? '' })))
              return {
                error: 'error' in res ? res.error ?? null : null,
                failedIndex: 'failedIndex' in res ? res.failedIndex : null,
              }
            }}
            /* 2026-08-31: a mentés ELŐTTI, tisztán olvasó ellenőrzés — így nem
               keletkezhet félig elmentett állapot (nincs mit visszagörgetni). */
            onPreflightCheck={async (income, expense) => {
              const res = await ellenorizMentesElore(
                income,
                expense.map((r) => ({ ...r, kedvezmenyzett: r.kedvezmenyzett ?? '' })),
              )
              return {
                error: 'error' in res ? res.error ?? null : null,
                failedIndex: 'failedIndex' in res ? res.failedIndex : null,
                failedSide: 'failedSide' in res ? res.failedSide : null,
              }
            }}
            onSaveInternalTransfer={async (payload) => {
              const res = await saveInternalTransfer(payload)
              return { error: 'error' in res ? res.error ?? null : null }
            }}
            /* 2026-08-22 (5. pont / 5a): a befizető-kereső mostantól SCOPE-TUDATOS.
               Korábban a `searchMembersForFinance` volt bekötve, ami a
               `getProfileCongregation()`-ből jövő `effectiveCongregationId`-re szűr —
               az pedig FELSŐ SZINTŰ aktív profilnál definíció szerint `null`, tehát a
               megyei/kerületi rögzítő NÉMÁN üres listát kapott (nem hibaüzenetet).
               A `searchIncomePartners` a `getFinanceScope()`-ra épül: gyülekezetnél a
               MAI tag-keresőt adja (ugyanaz a törzs), megyénél a gyülekezeteket +
               lelkészeiket, kerületnél az egyházmegyéket + espereseiket. */
            onSearchMembers={async (query) => {
              const rows = await searchIncomePartners(query)
              return rows.map((h) => ({
                id: h.id,
                name: h.name,
                detail: h.detail ?? undefined,
                // Az életkor-badge SZEMÉLYNÉL marad (a szerver csak ott ad `szDatum`-ot).
                age: ageFromBirth(h.szDatum) ?? undefined,
                birthYear: h.szDatum ? String(h.szDatum).slice(0, 4) : undefined,
                kind: h.kind,
                refId: h.refId ?? undefined,
              }))
            }}
            onSearchExpensePartners={async (query) => await searchExpensePartners(query)}
            /* 2026-08-27 (Endre 8. kérése): mentés ELŐTT megnézzük, van-e már
               ugyanolyan összegű, hasonló nevű, ±3 napon belüli BANKI tétel.
               Ha igen, a rögzítő megerősítést kér — de nem tilt. */
            onCheckSimilarEntries={async (sorok) => {
              const res = await checkSimilarBankEntries(sorok)
              return res.talalatok
            }}
            /* A családi nyugta és a járulék-ajánló GYÜLEKEZETI fogalmak: a `csalad`,
               a `haztartas` és a járulék-beállítás mind gyülekezet-kötött. Felső szinten
               a hívásuk némán üres listát adna (a „Család csatolása" gomb nem csinálna
               semmit), ezért ott nem is adjuk át őket — a gomb el sem készül. */
            onSearchFamilies={gyulekezeti ? async (query) => await searchFamilies(query) : undefined}
            onGetFamilyMembers={gyulekezeti ? async (familyId) => await getFamilyMembers(familyId) : undefined}
            onGetFamilyMembersForPerson={gyulekezeti ? async (personId) => await getFamilyMembersForPerson(personId) : undefined}
            onGetExpectedJarulek={gyulekezeti ? async (personId, year, prospectiveDateIso) => await getExpectedJarulek(personId, year, prospectiveDateIso) : undefined}
            onGetNextReceiptNumbers={async (year) => await getNextReceiptNumbers(year)}
            onCheckReceiptDuplicate={async (iratszam) => await checkReceiptDuplicate(iratszam)}
            onGetLastRecordedDate={async () => await getLastRecordedDate()}
            offerExpenseInventory={offerExpenseInventory}
            onClose={() => onOpenChange(false)}
            onToast={(type, message) => {
              if (type === 'success') toast.success(message)
              else if (type === 'warning') toast.warning(message)
              else toast.error(message)
            }}
            /* A vázlat-kulcs GYÜLEKEZETNÉL VÁLTOZATLAN (`congregationId`). Felső szinten
               nincs `congregationId`, és a régi `'default'` helykitöltő MINDEN felső szintű
               profilnál ugyanaz volt: a megyei és a kerületi vázlat egymásra íródott volna. */
            draftStorageKey={`kartoteka:combined-entry-draft:${congregationId || (gyulekezeti ? 'default' : scope)}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
