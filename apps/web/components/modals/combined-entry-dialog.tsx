'use client'

/**
 * Összevont bevétel/kiadás rögzítő dialog — a hero „+ Tétel rögzítése" gomb.
 *
 * Egyetlen modal, Bevétel/Kiadás fülekkel; egyszerre több bevétel és kiadás
 * is rögzíthető, a Mentés dátum szerint rendez és mindent a helyére ír
 * (saveIncomeBatch + saveExpenseBatch).
 */

import { useEffect, useState } from 'react'
import {
  CombinedEntryBody,
  RogzitesBiztato,
  type CombinedEntryBodyProps,
  type IncomeCategory,
  type ExpenseCategory,
  type CombinedBankAccount,
} from '@kartoteka/ui-app'
// A mag (`finance-scope-core.ts`) import-mentes, ezért kliens-komponensben is
// biztonságos (a `finance-scope.ts` gazda-modul `server-only` láncot húzna be).
import type { FinanceScope } from '@/lib/auth/finance-scope-core'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  listExpensePartnerNames,
  listIncomePartnerNames,
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
  /**
   * 2026-09-02 (Endre 4.): a még pár nélkül álló belső mozgások — a rögzítő
   * ebből kínál választható „párját rögzítem" listát a belső mozgás soron.
   */
  unpairedMovements?: CombinedEntryBodyProps['unpairedMovements']
}

export function CombinedEntryDialog({ open, onOpenChange, incomeCategories, expenseCategories, bankAccounts, currentYear, congregationId, offerExpenseInventory, scope = 'congregation', unpairedMovements }: Props) {
  const gyulekezeti = scope === 'congregation'

  /**
   * 2026-09-02 (Endre): a gyülekezet ismert kiadás-partnerei — EGYSZER, a
   * rögzítő megnyitásakor. Ebből lesz a név melletti passzív „ismert"/„új"
   * jelzés, a soronkénti kattintgatás helyett.
   *
   * `undefined` amíg tölt → a jelzés NEM jelenik meg. Egy még be nem töltött
   * lista nem mondhatja egy régi partnerre, hogy „új".
   */
  /** 2026-09-02 (Endre 7.): a banki-import magyarázó buborék (érintésre is). */
  const [bankiSugoNyitva, setBankiSugoNyitva] = useState(false)
  const [ismertPartnerek, setIsmertPartnerek] = useState<string[] | undefined>(undefined)
  /** 2026-09-04 (Endre): a gyülekezet ismert BEVÉTELI cég-partnerei — a „cég" jelvényhez. */
  const [ismertCegek, setIsmertCegek] = useState<string[] | undefined>(undefined)
  useEffect(() => {
    if (!open || !gyulekezeti) return
    let ervenyes = true
    void listExpensePartnerNames()
      .then((nevek) => { if (ervenyes) setIsmertPartnerek(nevek) })
      // Hiba esetén marad `undefined` → nincs jelzés. Ez a helyes fail-safe:
      // egy sikertelen betöltés nem állíthatja minden partnerről, hogy „új".
      .catch(() => { if (ervenyes) setIsmertPartnerek(undefined) })
    // A két lista FÜGGETLEN: az egyik bukása ne vigye el a másik jelzését sem.
    void listIncomePartnerNames()
      .then((nevek) => { if (ervenyes) setIsmertCegek(nevek) })
      .catch(() => { if (ervenyes) setIsmertCegek(undefined) })
    return () => { ervenyes = false }
  }, [open, gyulekezeti])

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
                {/* 2026-09-02 (Endre 7.): a cím mondja ki, hogy ez a KÉSZPÉNZ útja —
                    a banki tételek kivonat-importból jönnek, nem itt. */}
                <DialogTitle className="font-heading text-lg flex flex-wrap items-center gap-1.5">
                  Készpénzes tételek rögzítése
                  <button
                    type="button"
                    onClick={() => setBankiSugoNyitva((v) => !v)}
                    aria-expanded={bankiSugoNyitva}
                    aria-label="Hogyan kerülnek be a banki tételek?"
                    title="A BANKI tételeket nem itt rögzítjük: azok a bankból exportált kivonatból (CSV/MT940) importálódnak — Pénzügy → Bank → Kivonat importálása. Így a banki sorok az eredeti bankadatból jönnek, elgépelés nélkül."
                    className="inline-flex size-5 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-[11px] font-bold text-teal-700 transition hover:bg-teal-100"
                  >
                    i
                  </button>
                </DialogTitle>
                {bankiSugoNyitva && (
                  <p className="mt-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs leading-relaxed text-teal-900">
                    <strong>A banki tételeket nem itt rögzítjük.</strong> Azok a bankból <strong>exportált
                    kivonatból</strong> (CSV / MT940) importálódnak: <strong>Pénzügy → Bank → Kivonat
                    importálása</strong>. Így a banki sorok az eredeti bankadatból jönnek, elgépelés nélkül —
                    itt csak a <strong>készpénzes</strong> (kassza) tételek helye van. Kivétel a
                    készpénzfelvétel/-letétel: ott bankszámlát is választani kell, mert a pénz a kassza és a
                    bank között mozog.
                  </p>
                )}
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
            {/* 2026-09-03 (Endre 2.): az igevers KÖZVETLENÜL az alcím alá került,
                a fejléc-blokkon BELÜLRE — eddig a fejléc alsó szegélye ALATT ült,
                vagyis vizuálisan a törzshöz tartozott, pedig a szövege az alcímre
                felel. A DialogHeader MÁSODIK gyerekeként teljes szélességű marad
                (a cím szöveg-oszlopába téve az ikon + gap miatt beljebb kezdődne
                és összezsugorodna).
                ⛔ SZÁNDÉKOSAN NEM kap a fejléc és a törzs közös új szülőt: a
                ragadó Bevétel/Kiadás fül-sáv (CombinedEntryBody `sticky top-0`)
                görgető-őse a DialogContent popupja. Egy közös wrapper bármilyen
                overflow/transform/filter osztállyal NÉMÁN megszüntetné a ragadást
                — hibaüzenet nélkül, zöld CI mellett. */}
            <div className="mt-3">
              <RogzitesBiztato />
            </div>
          </DialogHeader>
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
            knownExpensePartners={ismertPartnerek}
            knownIncomePartners={ismertCegek}
            unpairedMovements={unpairedMovements}
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
