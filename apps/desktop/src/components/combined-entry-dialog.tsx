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
  type CombinedIncomeBatchRow,
  type CombinedExpenseBatchRow,
  type CombinedInternalTransferPayload,
} from '@kartoteka/ui-app'
import {
  assertYearNotFinalizedOffline,
  assertYearsNotFinalizedForCreate,
  checkExpenseReceiptDuplicatesBatchUseCase,
  checkReceiptDuplicatesBatchUseCase,
  saveExpenseUseCase,
  saveIncomeUseCase,
  searchMembersForFinanceUseCase,
} from '@kartoteka/core'
import {
  saveExpenseInputSchema,
  saveIncomeInputSchema,
  type SaveExpenseInput,
  type SaveIncomeInput,
} from '@kartoteka/validations'

import { errorMessage } from '../lib/error'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import {
  nextReceiptNumbersOnline,
  similarBankEntriesOnline,
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

  // ── KÖZÖS input-építés: a MENTÉS és az ELŐELLENŐRZÉS ugyanebből dolgozik ──
  // ⛔ Ha a kettő külön építené az inputot, az előellenőrzés MÁST vizsgálna, mint
  //    amit a mentés kiír — éppen az a néma széthúzás, ami miatt a felemás mentés
  //    egyáltalán előfordulhat. EGY forrás, két felhasználó.
  function bevetelInput(row: CombinedIncomeBatchRow, isOnline: boolean): SaveIncomeInput {
    return {
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
      // P4-30 (audit 2026-08-28): banki bizonylatnál (OP) a bankszámla.
      bankszamla_id: row.bankszamla_id ?? null,
    }
  }

  function kiadasInput(row: CombinedExpenseBatchRow, isOnline: boolean): SaveExpenseInput {
    return {
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
      // P4-30 (audit 2026-08-28): banki bizonylatnál (OP) a bankszámla.
      bankszamla_id: row.bankszamla_id ?? null,
    }
  }

  // ── Bevétel-batch → soronként saveIncomeUseCase (online + offline) ──
  // A desktop SORONKÉNT ír (offline is), és az első hibás sornál megáll — az
  // addigiak VÉGLEGESEN bent maradnak a könyvben. 2026-08-31: ezért minden
  // sikeres sor forrás-azonosítóját VISSZAADJUK (`savedRowIds`), így a rögzítő
  // meg tudja jelölni őket „elmentve”-ként. Enélkül jelöletlenül maradnának, és
  // az újramentés MÁSODSZOR is elkönyvelné őket (dupla könyvelés).
  //
  // 2026-06-11 fix: az online-döntés SESSION-tudatos (isOnlineWithSession) —
  // PIN-es munkamenetben működő internettel is az offline (tárcás) ág fut,
  // különben a kérés anon-szerepkörrel menne („permission denied”).
  async function handleIncomeBatch(
    rows: CombinedIncomeBatchRow[],
  ): Promise<{ error?: string | null; savedRowIds?: string[]; failedIndex?: number | null }> {
    const supabase = getDesktopSupabase()
    const isOnline = await isOnlineWithSession()
    const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()
    const savedRowIds: string[] = []

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      try {
        const result = await saveIncomeUseCase(bevetelInput(row, isOnline), {
          supabase,
          runtime: 'desktop',
          userId,
          isOnline,
          offlineBackend,
        })
        if (!result.success) {
          // 2026-09-01: a „N. bevétel-sor" ELŐTAG ELMARAD — az `i` a RENDEZETT és
          // befizetőnként szétbontott köteg indexe, amit a felhasználó sehol nem lát.
          // A rögzítő a `failedIndex` → `sourceRowId` úton a VALÓDI sorra hivatkozik.
          return {
            error: result.error,
          }
        }
        if (row.sourceRowId) savedRowIds.push(row.sourceRowId)
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
        return { error: errorMessage(err), savedRowIds, failedIndex: i }
      }
    }
    return { error: null, savedRowIds }
  }

  // ── Kiadás-batch → soronként saveExpenseUseCase (online + offline) ──
  async function handleExpenseBatch(
    rows: CombinedExpenseBatchRow[],
  ): Promise<{ error?: string | null; savedRowIds?: string[]; failedIndex?: number | null }> {
    const supabase = getDesktopSupabase()
    const isOnline = await isOnlineWithSession()
    const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()
    const savedRowIds: string[] = []

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      try {
        const result = await saveExpenseUseCase(kiadasInput(row, isOnline), {
          supabase,
          runtime: 'desktop',
          userId,
          isOnline,
          offlineBackend,
        })
        if (!result.success) {
          return { error: result.error, savedRowIds, failedIndex: i }
        }
        if (row.sourceRowId) savedRowIds.push(row.sourceRowId)
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
        return { error: errorMessage(err), savedRowIds, failedIndex: i }
      }
    }
    return { error: null, savedRowIds }
  }

  // ── ELŐELLENŐRZÉS (2026-08-31) — a részleges mentés MEGELŐZÉSE ───────
  //
  // A web ugyanezt szerver-akcióként teszi (`ellenorizMentesElore`). A desktopon
  // nincs tranzakció és nincs szerver-oldali visszavonás sem, ezért itt még
  // fontosabb: MINDEN ÍRÁS ELŐTT végigfuttatjuk a köteg minden során ugyanazokat
  // a kapukat, amelyeken a mentés elbukna. Ha bármi hibás, a mentés EL SEM INDUL.
  //
  // ⛔ TISZTÁN OLVASÓ: itt SOHA nem hívunk mentő use-case-t, nem foglalunk
  //    iratszámot a tárcából, és nem írunk a lokális adatbázisba sem.
  // ⚠️ ELOELLENORZES-FAIL-OPEN: ha maga az ellenőrzés elhasal, a mentés a régi
  //    úton megy tovább (a hívó CombinedEntryBody kapja el) — kényelem, nem védelem.
  async function handlePreflight(
    income: CombinedIncomeBatchRow[],
    expense: CombinedExpenseBatchRow[],
  ): Promise<{
    error?: string | null
    failedIndex?: number | null
    failedSide?: 'income' | 'expense' | null
  }> {
    const supabase = getDesktopSupabase()
    const isOnline = await isOnlineWithSession()
    const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()

    // 1) Zod — pontosan az a séma, amelyen a use-case is átengedi a sort.
    for (let i = 0; i < income.length; i += 1) {
      const parsed = saveIncomeInputSchema.safeParse(bevetelInput(income[i], isOnline))
      if (!parsed.success) {
        // 2026-09-01: a köteg-index visszaadva (a rögzítő a LÁTHATÓ sorra fordítja).
        return {
          error: parsed.error.issues[0]?.message || 'Érvénytelen adat.',
          failedIndex: i,
          failedSide: 'income',
        }
      }
    }
    for (let i = 0; i < expense.length; i += 1) {
      const parsed = saveExpenseInputSchema.safeParse(kiadasInput(expense[i], isOnline))
      if (!parsed.success) {
        return {
          error: parsed.error.issues[0]?.message || 'Érvénytelen adat.',
          failedIndex: i,
          failedSide: 'expense',
        }
      }
    }

    // 2) Kötegen BELÜLI iratszám-ütközés — ezt a mentés csak a MÁSODIK sornál
    //    venné észre, amikor az első már bent van (pont a felemás állapot).
    const utkozes = (
      sorok: Array<{ iratszam: string | null }>,
      cimke: string,
    ): { error: string; failedIndex: number } | null => {
      const latott = new Set<string>()
      for (let i = 0; i < sorok.length; i += 1) {
        const szam = (sorok[i].iratszam ?? '').trim()
        if (!szam) continue
        if (latott.has(szam)) {
          // A MÁSODIK (ütköző) tételre mutatunk: az elsőt nem kell javítani.
          return {
            error: `A(z) „${szam}” iratszám a kötegben KÉTSZER szerepel (${cimke}) — a második sor elbukna, az első már bent lenne. Javítsd, mielőtt mentesz.`,
            failedIndex: i,
          }
        }
        latott.add(szam)
      }
      return null
    }
    const incUtkozes = utkozes(income, 'bevétel')
    if (incUtkozes) return { ...incUtkozes, failedSide: 'income' }
    const expUtkozes = utkozes(expense, 'kiadás')
    if (expUtkozes) return { ...expUtkozes, failedSide: 'expense' }

    if (!isOnline) {
      // 3/a) OFFLINE kapuk — ugyanazok, mint a use-case offline ágán.
      if (!offlineBackend) {
        return { error: 'A rögzítéshez most internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.' }
      }
      const bankiSor = [...income, ...expense].find(
        (r) => r.bankszamla_id != null && !/észpénz/i.test(r.irattipus),
      )
      if (bankiSor) {
        return { error: 'Offline módban csak KÉSZPÉNZES tételt rögzíthetsz — a banki tételek a kivonatból jönnek be online-mód alatt. Vedd ki a banki sorokat, vagy csatlakozz a hálózatra.' }
      }
      // Offline év-zár a lokális tükörből (a use-case is ezt hívja).
      const evek = new Set<number>()
      for (const r of [...income, ...expense]) evek.add(new Date(r.datum).getFullYear())
      for (const ev of evek) {
        const zar = await assertYearNotFinalizedOffline(
          offlineBackend.isYearFinalizedLocal?.bind(offlineBackend),
          congregationId,
          ev,
        )
        if (zar) return { error: zar }
      }
      // Elég sorszám van-e a tárcában? (Az utolsó sornál elfogyó tárca az egyik
      // legvalószínűbb ok, amitől a köteg félúton megállna.)
      const kell = new Map<string, number>()
      const szamol = (sorok: Array<{ datum: string }>, tipus: 'befizetes' | 'kiadas') => {
        for (const r of sorok) {
          const kulcs = `${tipus}:${new Date(r.datum).getFullYear()}`
          kell.set(kulcs, (kell.get(kulcs) ?? 0) + 1)
        }
      }
      szamol(income, 'befizetes')
      szamol(expense, 'kiadas')
      for (const [kulcs, db] of kell) {
        const [tipus, evStr] = kulcs.split(':')
        const allapot = await offlineBackend.getIratszamWalletStatus(
          congregationId,
          tipus as 'befizetes' | 'kiadas',
          Number(evStr),
        )
        if (allapot.availableCount < db) {
          return {
            error: `Nincs elég offline sorszám: a(z) ${evStr}-es ${tipus === 'befizetes' ? 'bevételekhez' : 'kiadásokhoz'} ${db} kellene, a tárcában ${allapot.availableCount} van. Tölts fel sorszámot (Iratszám-tárca panel → +10 szám), vagy csatlakozz a hálózatra.`,
          }
        }
      }
      return { error: null }
    }

    // 3/b) ONLINE kapuk — év-zár + iratszám-duplikátum (a use-case ugyanezeket futtatja).
    const datumok = [...income, ...expense].map((r) => r.datum)
    const evZar = await assertYearsNotFinalizedForCreate(supabase, congregationId, datumok)
    if (evZar) return { error: evZar }

    // KÖTEGESEN: soronként egy-egy kör-út több száz soros rögzítésnél percekig
    // tartana. A köteges változat UGYANAZZAL a szűrő-lánccal dolgozik (közös
    // core-fájl), csak 80-asával kérdez.
    const ctx = { supabase, runtime: 'desktop' as const }
    const incSzamok = income.map((r) => (r.iratszam ?? '').trim()).filter(Boolean)
    if (incSzamok.length > 0) {
      const dup = await checkReceiptDuplicatesBatchUseCase({ congregationId, iratszamok: incSzamok }, ctx)
      if (dup.success && dup.duplicates.length > 0) {
        const utkozo = dup.duplicates[0]
        return {
          error: `A(z) „${utkozo}” iratszám már létezik a bevételeknél. Válassz másik számot.`,
          failedIndex: income.findIndex((r) => (r.iratszam ?? '').trim() === utkozo),
          failedSide: 'income',
        }
      }
    }
    const expSzamok = expense.map((r) => (r.iratszam ?? '').trim()).filter(Boolean)
    if (expSzamok.length > 0) {
      const dup = await checkExpenseReceiptDuplicatesBatchUseCase({ congregationId, iratszamok: expSzamok }, ctx)
      if (dup.success && dup.duplicates.length > 0) {
        const utkozo = dup.duplicates[0]
        return {
          error: `A(z) „${utkozo}” iratszám már létezik a kiadásoknál. Válassz másik számot.`,
          failedIndex: expense.findIndex((r) => (r.iratszam ?? '').trim() === utkozo),
          failedSide: 'expense',
        }
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
              return res.members.map((m) => {
                // #Endre 2026-07-01: életkor (teljes évek) a találati badge-hez (web-azonos).
                let age: number | undefined
                const b = m.sz_datum ? new Date(String(m.sz_datum)) : null
                if (b && !Number.isNaN(b.getTime())) {
                  const now = new Date()
                  let a = now.getFullYear() - b.getFullYear()
                  const mo = now.getMonth() - b.getMonth()
                  if (mo < 0 || (mo === 0 && now.getDate() < b.getDate())) a--
                  if (a >= 0 && a < 130) age = a
                }
                return {
                  id: m.id,
                  name: `${m.csaladnev ?? ''} ${m.k_nev ?? ''}`.trim() || `#${m.id}`,
                  detail: m.cim_nev ?? undefined,
                  age,
                  birthYear: m.sz_datum ? String(m.sz_datum).slice(0, 4) : undefined,
                }
              })
            }}
            // 2026-06-21: ONLINE lekérdezések (a desktop offline ezekre üres/null-t ad → nincs auto-kitöltés).
            // A járulék-számítás magja KÖZÖS a webbel (computeJarulekForMemberYear) → az összeg sosem tér el.
            onSearchFamilies={async (query) => await searchFamiliesOnline(congregationId, query)}
            onGetFamilyMembers={async (familyId) => await familyMembersOnline(congregationId, familyId)}
            onGetFamilyMembersForPerson={async (personId) => await familyMembersForPersonOnline(congregationId, personId)}
            onGetNextReceiptNumbers={async (year) => await nextReceiptNumbersOnline(congregationId, year)}
            /* 2026-08-27 (Endre 8. kérése): mentés ELŐTT jelezzük, ha ugyanolyan
               összegű, hasonló nevű, ±3 napon belüli BANKI tétel már van.
               A döntés magja közös a webbel (@kartoteka/core). Offline néma. */
            onCheckSimilarEntries={async (sorok) => await similarBankEntriesOnline(congregationId, sorok)}
            onGetExpectedJarulek={async (personId, year, prospectiveDateIso) => await expectedJarulekOnline(congregationId, personId, year, prospectiveDateIso)}
            onSaveIncomeBatch={handleIncomeBatch}
            onSaveExpenseBatch={handleExpenseBatch}
            /* 2026-08-31: a desktop soronként ment — az előellenőrzés MINDEN ÍRÁS
               ELŐTT végigfut, hogy ne keletkezhessen félig elmentett köteg. */
            onPreflightCheck={handlePreflight}
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
