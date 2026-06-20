'use client'

/**
 * Összevont bevétel/kiadás bevitel — egy modal, két fül (Bevétel / Kiadás).
 *
 * Csak KÉSZPÉNZES tételekre (a banki tételeket banki kivonatból importáljuk).
 * Egyszerre több bevétel ÉS több kiadás is rögzíthető; a „Mentés" mindkét fül
 * sorait dátum szerint rendezi és a helyére menti.
 *
 * Belső mozgás (készpénzfelvétel a bankból / készpénzletétel a bankba): ha a
 * sor kategóriája ilyen, megjelenik a BANKSZÁMLA-választó, és a sor belső
 * mozgásként könyvelődik (a kassza ÉS a bank oldalt is rendezi).
 *
 * Mobil-barát: kis/közepes képernyőn kártyák (nincs oldalirányú görgetés).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Save, Trash2, ArrowLeftRight, Users } from 'lucide-react'
import { formatRon } from './ron-in-words'
import { parseFlexibleDate } from './date-parse'
import { SearchableSelect } from './SearchableSelect'
import {
  FamilyReceiptModal,
  type CombinedFamilyHit,
  type CombinedFamilyMember,
} from './FamilyReceiptModal'
import type { IncomeCategory, SaveIncomeBatchRow } from './IncomeDialogBody'
import type { ExpenseCategory, SaveExpenseBatchRow } from './ExpenseDialogBody'

export type CombinedToastFn = (type: 'success' | 'error', message: string) => void

/** Irat (bizonylat) típusok — román megnevezéssel, a könyvelési gyakorlat szerint. */
const DOC_TYPES = ['Factură', 'Bon fiscal', 'Chitanță', 'Stat de plată', 'Ordin de plată', 'Altele'] as const

/**
 * Belső mozgás kódok. A készpénzes Tétel-rögzítőben CSAK a kassza↔bank
 * mozgások jelennek meg (bankszámla-választóval). A bank-bank átutalás
 * KI VAN ZÁRVA — az kizárólag a Bank fülön rögzíthető.
 */
// A kanonikus 2026-06-10 EREK-modellhez igazítva (forrás: a hivatalos
// Adatok_2025.xlsx → 2026-06-10-belso-mozgas-kodok-INSTALL.sql):
//   kassza → bank (letétel):  kassza-kiadás 400.01 + bank-bevétel 301.01
//   bank → kassza (felvétel):  bank-kiadás   401.01 + kassza-bevétel 300.01
//   bank ↔ bank:               402.02 (mindkét oldal)
const DEPOSIT_KODS = new Set(['400.01', '301.01']) // kassza → bank (letétel)
const WITHDRAW_KODS = new Set(['401.01', '300.01']) // bank → kassza (felvétel)
const BANKBANK_KODS = new Set(['402.02']) // bank ↔ bank — kizárva

function dirOfKod(kod: string | undefined): 'deposit' | 'withdraw' | null {
  if (!kod) return null
  if (DEPOSIT_KODS.has(kod)) return 'deposit'
  if (WITHDRAW_KODS.has(kod)) return 'withdraw'
  return null
}

export interface CombinedBankAccount {
  id: number
  bank_neve: string
}

export interface CombinedInternalTransferPayload {
  tipus: 'kassza_bank' | 'bank_kassza'
  datum: string
  forras: string
  cel: string
  osszeg: number
  megjegyzes: string
}

/** Tag-találat a Befizető-keresőhöz (B1, 2026-06-11). */
export interface CombinedMemberHit {
  id: number
  name: string
  /** Részletes másodlagos sor a találati listában (pl. „1980 · Brateș · Fő u. 12"). */
  detail?: string
}

export interface CombinedEntryBodyProps {
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  bankAccounts: CombinedBankAccount[]
  currentYear: number
  onSaveIncomeBatch: (rows: SaveIncomeBatchRow[]) => Promise<{ error?: string | null }>
  onSaveExpenseBatch: (rows: SaveExpenseBatchRow[]) => Promise<{ error?: string | null }>
  onSaveInternalTransfer: (payload: CombinedInternalTransferPayload) => Promise<{ error?: string | null }>
  onClose: () => void
  onToast: CombinedToastFn
  /**
   * B1 (2026-06-11, Endre): tag-keresés a „Befizető / forrás" mezőben — a
   * befizetés személyhez kapcsolásához (egyházfenntartás, adomány). Opcionális:
   * ha nincs megadva, a mező sima szövegmező marad (a web változatlan, amíg
   * be nem kötik). Min. 2 karaktertől hívódik.
   */
  onSearchMembers?: (query: string) => Promise<CombinedMemberHit[]>
  /**
   * Családi befizetéshez: a kiválasztott tag családjának feloldása.
   * Null = nincs család (a sor tag-szintű marad).
   */
  onResolveFamilyId?: (szemelyId: number) => Promise<number | null>
  /**
   * #5 (Endre, 2026-06-21): kiadás-partner autocomplete — a korábban már rögzített
   * átvevők (cég/személy) közül ajánl a kiadás fülön gépelés közben; kiválasztáskor
   * a nevet kitölti. Ha nincs megadva, a kiadás-partner sima szövegmező marad.
   */
  onSearchExpensePartners?: (query: string) => Promise<string[]>
  /**
   * #4b (Endre, 2026-06-20): családi nyugta. Ha MINDKETTŐ megadva, a Bevétel
   * fülön megjelenik a „Család" gomb → közös nyugtaszám + a család tagjainak
   * összegei → személyenként KÜLÖN bevétel-sor (közös alapszám + `/N` utótag,
   * mert a készpénzes iratszámra UNIQUE index van). Ha hiányzik, a gomb nem látszik.
   */
  onSearchFamilies?: (query: string) => Promise<CombinedFamilyHit[]>
  onGetFamilyMembers?: (familyId: number) => Promise<CombinedFamilyMember[]>
  /**
   * #3 (Endre, 2026-06-20): Chitanță választásakor a következő nyugtaszámok lekérése —
   * `keruleti` (kerülettől kapott/nyomdai → iratszam) és `gyulekezeti` (saját sorszám →
   * nyugta). Mindkettő +1-gyel lép az utolsó nyugtához képest, hézag nélkül. Ha nincs
   * megadva, nincs automatikus kitöltés (a felhasználó kézzel ír mindkettőt).
   */
  onGetNextReceiptNumbers?: (year: number) => Promise<{ keruleti: string; gyulekezeti: string }>
  /**
   * Beviteli őr P0 (Endre, 2026-06-20): a kerületi iratszám DUPLIKÁTUM-ellenőrzése mentés ELŐTT
   * (gépelés/elhagyás után). Igaz = már létezik ilyen iratszám a gyülekezetben. Csak bevételnél
   * (befizetés) hívjuk. Ha nincs megadva, nincs duplikátum-figyelmeztetés.
   */
  onCheckReceiptDuplicate?: (iratszam: string) => Promise<boolean>
  /**
   * Beviteli őr P1 (Endre, 2026-06-20): a legutóbb rögzített dátum lekérése — a rögzítő
   * figyelmeztet, ha az új tétel KORÁBBI (visszamenőleges) vagy JÖVŐBELI dátumú, hogy ne
   * maradjon ki / ne csússzon el a könyvelés. Ha nincs megadva, nincs dátum-figyelmeztetés.
   */
  onGetLastRecordedDate?: () => Promise<string | null>
  /**
   * #3 (Endre, 2026-06-21): auto-vázlatmentés kulcsa (pl. `combined-entry:<congregationId>`).
   * Ha megadva, a bevitt sorok GÉPELÉS KÖZBEN azonnal a böngésző localStorage-ába
   * mentődnek, és a dialóg újranyitásakor visszaállnak — így áramszünet / véletlen
   * bezárás / összeomlás esetén SEM vész el a (akár több száz) bevitt tétel.
   * Sikeres mentéskor vagy a vázlat elvetésekor törlődik. Ha nincs megadva, nincs mentés.
   */
  draftStorageKey?: string
}

type EntryRow = {
  id: string
  datum: string
  categoryId: number | ''
  partner: string
  docType: string
  /** #3 (Endre): a kerületi (nyomdai) szám — Chitanță esetén a kerülettől kapott szám (befizetes.iratszam). */
  iratszam: string
  /** #3 (Endre): a gyülekezeti saját sorszám — Chitanță esetén külön szám (befizetes.nyugta). */
  gyulekezetiSzam: string
  amount: string
  megjegyzes: string
  bankId: number | ''
  /** #1 (Endre): melyik évre szól a befizetés — alap az aktuális év, de visszamenőleges
   *  egyházfenntartói járulék is rögzíthető (csak bevételnél). */
  evre: string
  /** B1: a kiválasztott tag (kölcsönösen kizáró a csaladId-vel). */
  szemelyId: number | null
  /** B1: családi befizetésnél a család azonosítója. */
  csaladId: number | null
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const newRow = (year?: number): EntryRow => ({
  id: crypto.randomUUID(), datum: todayIso(), categoryId: '', partner: '', docType: '', iratszam: '', gyulekezetiSzam: '', amount: '', megjegyzes: '', bankId: '',
  evre: year != null ? String(year) : '',
  szemelyId: null, csaladId: null,
})

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

// Megbízhatóbb „tényleg látható-e" mint az offsetParent===null: a display:none-t (és a
// 0-méretű, másik-breakpointon rejtett cellát) a getClientRects/offset-méret méri — viszont
// NEM bukik a Base UI dialóg `transform: translate(-50%,-50%)` + `position:fixed` edge-case-ein,
// ahol a LÁTHATÓ input offsetParent-je is `null` lehet (ez fojtotta el korábban a keresőt).
function isElementVisible(el: HTMLElement | null): boolean {
  if (!el) return false
  if (el.getClientRects().length === 0) return false // display:none vagy nincs a DOM-ban
  return el.offsetWidth > 0 || el.offsetHeight > 0
}

export function CombinedEntryBody({
  incomeCategories, expenseCategories, bankAccounts, currentYear,
  onSaveIncomeBatch, onSaveExpenseBatch, onSaveInternalTransfer, onClose, onToast,
  onSearchMembers, onResolveFamilyId, onSearchExpensePartners,
  onSearchFamilies, onGetFamilyMembers, onGetNextReceiptNumbers,
  onCheckReceiptDuplicate, onGetLastRecordedDate, draftStorageKey,
}: CombinedEntryBodyProps) {
  const [tab, setTab] = useState<'income' | 'expense'>('income')
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>(() => [newRow(currentYear)])
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>(() => [newRow(currentYear)])
  const [busy, setBusy] = useState(false)
  /** #5: a Családi nyugta tag-választó melyik SORHOZ van nyitva (null = zárva). */
  const [familyPickerRowId, setFamilyPickerRowId] = useState<string | null>(null)
  /** #3 auto-vázlat: ha visszaállítottunk egy mentett vázlatot, ennek időpontja. */
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null)
  /** #2 (Endre): az utolsó automatikus mentés időpontja (null = nincs mentendő tartalom). */
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  /** Beviteli őr P1: a legutóbb rögzített dátum (ISO) — a korábbi/jövőbeli figyelmeztetéshez. */
  const [lastRecordedDate, setLastRecordedDate] = useState<string | null>(null)
  /** Beviteli őr P0: azon sorok id-jai, ahol a kerületi iratszám már létezik a DB-ben. */
  const [dupRowIds, setDupRowIds] = useState<Set<string>>(() => new Set())

  // Beviteli őr P1: a legutóbb rögzített dátum egyszeri betöltése (figyelmeztetés alapja).
  useEffect(() => {
    if (!onGetLastRecordedDate) return
    let cancelled = false
    void onGetLastRecordedDate()
      .then((d) => { if (!cancelled) setLastRecordedDate(d) })
      .catch(() => { /* nincs hálózat — a figyelmeztetés egyszerűen kimarad */ })
    return () => { cancelled = true }
  }, [onGetLastRecordedDate])

  // #3 auto-vázlat: van-e értelmes tartalom (üres sorokat nem mentünk).
  const rowHasContent = (r: EntryRow) =>
    !!(r.amount.trim() || r.partner.trim() || r.categoryId !== '' || r.iratszam.trim() || r.megjegyzes.trim())
  const anyContent = (rs: EntryRow[]) => rs.some(rowHasContent)

  function clearDraft() {
    if (draftStorageKey && typeof window !== 'undefined') {
      try { window.localStorage.removeItem(draftStorageKey) } catch { /* ignore */ }
    }
    setLastSavedAt(null)
  }

  // Vázlat VISSZAÁLLÍTÁSA a dialóg megnyitásakor (ha van mentett, nem üres vázlat).
  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      const d = JSON.parse(raw) as {
        incomeRows?: EntryRow[]; expenseRows?: EntryRow[]; tab?: 'income' | 'expense'; savedAt?: string
      }
      const inc = Array.isArray(d.incomeRows) ? d.incomeRows : []
      const exp = Array.isArray(d.expenseRows) ? d.expenseRows : []
      if (anyContent(inc) || anyContent(exp)) {
        if (inc.length) setIncomeRows(inc)
        if (exp.length) setExpenseRows(exp)
        if (d.tab === 'income' || d.tab === 'expense') setTab(d.tab)
        setDraftRestoredAt(d.savedAt || '')
      }
    } catch { /* sérült vázlat — kihagyjuk */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey])

  // Vázlat MENTÉSE minden változáskor (gépelés közben azonnal). Üres állapotnál törlünk.
  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined') return
    try {
      if (anyContent(incomeRows) || anyContent(expenseRows)) {
        const savedAt = new Date().toISOString()
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ incomeRows, expenseRows, tab, savedAt }),
        )
        setLastSavedAt(savedAt) // #2: a lábléc kijelzi az utolsó mentés idejét
      } else {
        window.localStorage.removeItem(draftStorageKey)
        setLastSavedAt(null) // #2: nincs mentendő adat
      }
    } catch { /* tárhely tele / letiltva — csendben kihagyjuk */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey, incomeRows, expenseRows, tab])

  function discardDraft() {
    setIncomeRows([newRow(currentYear)])
    setExpenseRows([newRow(currentYear)])
    setTab('income')
    setDraftRestoredAt(null)
    clearDraft()
  }

  const rows = tab === 'income' ? incomeRows : expenseRows
  const setRows = tab === 'income' ? setIncomeRows : setExpenseRows
  const partnerLabel = tab === 'income' ? 'Befizető / forrás' : 'Kedvezményezett'

  // Kód-lookup mindkét fülre (a belső mozgás iránya független a fültől).
  const incomeKod = useMemo(() => new Map<number, string>(incomeCategories.map((c) => [c.id, c.kod] as [number, string])), [incomeCategories])
  const expenseKod = useMemo(() => new Map<number, string>(expenseCategories.map((c) => [c.id, c.kod] as [number, string])), [expenseCategories])
  const dirFor = (tabName: 'income' | 'expense', r: EntryRow): 'deposit' | 'withdraw' | null => {
    if (r.categoryId === '') return null
    return dirOfKod((tabName === 'income' ? incomeKod : expenseKod).get(Number(r.categoryId)))
  }
  const belsoDir = (r: EntryRow) => dirFor(tab, r) // aktuális fül — a megjelenítéshez

  function rowValidIn(tabName: 'income' | 'expense', r: EntryRow): boolean {
    if (!(Number(r.amount) > 0 && r.categoryId !== '' && parseFlexibleDate(r.datum) != null)) return false
    if (dirFor(tabName, r) && r.bankId === '') return false // belső mozgáshoz bankszámla kell
    return true
  }
  const incomeValid = incomeRows.filter((r) => rowValidIn('income', r)).length
  const expenseValid = expenseRows.filter((r) => rowValidIn('expense', r)).length

  // A kategória-lista a bank-bank átutalást NEM tartalmazza (csak a Bank fülön).
  //
  // 2026-06-11 (Endre): a belső-mozgás opciók EGYÉRTELMŰ megnevezést kapnak —
  // a gyülekezet SAJÁT banki megnevezésével (pl. „Készpénzletétel a(z) BCR (RON)
  // számlára"), ha pontosan egy bankszámla van; több banknál irány-címkével
  // (a sor bank-választója dönti el, melyik számla). Ha NINCS rögzített
  // bankszámla, a belső-mozgás opciók el sem jelennek meg.
  // FONTOS: ez csak a UI-címke — a mentett kategória (és a hivatalos Excelbe
  // írt katalógus-név) változatlan.
  const cats = tab === 'income' ? incomeCategories : expenseCategories
  const categoryOptions = useMemo(() => {
    const hasBank = bankAccounts.length > 0
    const singleBank = bankAccounts.length === 1 ? bankAccounts[0] : null
    return cats
      .filter((c) => !BANKBANK_KODS.has(c.kod))
      .filter((c) => hasBank || !dirOfKod(c.kod))
      .map((c) => {
        const dir = dirOfKod(c.kod)
        if (!dir) return { id: c.id, label: c.nev }
        if (singleBank) {
          return {
            id: c.id,
            label:
              dir === 'deposit'
                ? `Készpénzletétel a(z) ${singleBank.bank_neve} számlára`
                : `Készpénzfelvétel a(z) ${singleBank.bank_neve} számláról`,
          }
        }
        return {
          id: c.id,
          label:
            dir === 'deposit'
              ? 'Készpénzletétel bankszámlára (kassza → bank)'
              : 'Készpénzfelvétel bankszámláról (bank → kassza)',
        }
      })
  }, [cats, bankAccounts])

  const tabTotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    // #4 (Endre): az új sor az ELŐZŐ sor dátumát örökli (tömeges rögzítésnél kényelmesebb).
    setRows((cur) => {
      const prev = cur[cur.length - 1]
      const r = newRow(currentYear)
      if (prev?.datum) r.datum = prev.datum
      return [...cur, r]
    })
  }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? [newRow(currentYear)] : cur.filter((r) => r.id !== id))) }

  function combinedIratszam(r: EntryRow): string | null {
    const parts = [r.docType.trim(), r.iratszam.trim()].filter(Boolean)
    return parts.length ? parts.join(' ') : null
  }

  // ── Beviteli őrök (P0 duplikátum + P1 dátum-sorrend) ─────────────────────
  // P1: a sor dátuma jövőbeli, vagy korábbi mint az utolsó rögzített → figyelmeztetés
  // (NEM blokkol — a visszamenőleges rögzítés jogos lehet, csak nehogy VÉLETLEN legyen).
  function dateWarning(r: EntryRow): string | null {
    const iso = parseFlexibleDate(r.datum)
    if (!iso) return null
    if (iso > todayIso()) return 'Jövőbeli dátum'
    if (lastRecordedDate && iso < lastRecordedDate) return `Korábbi, mint az utolsó rögzített (${lastRecordedDate})`
    return null
  }

  // In-batch: ugyanaz a kerületi iratszám szerepel-e MÁSIK sorban is (még mentés előtt).
  function inBatchDuplicate(r: EntryRow): boolean {
    const v = combinedIratszam(r)
    if (!v) return false
    return rows.filter((x) => combinedIratszam(x) === v).length > 1
  }

  // P0: a kerületi iratszám DB-duplikátum-ellenőrzése a mező elhagyásakor (csak bevétel).
  function checkRowDuplicate(r: EntryRow) {
    if (tab !== 'income' || !onCheckReceiptDuplicate) return
    const v = combinedIratszam(r)
    if (!v) {
      setDupRowIds((s) => { if (!s.has(r.id)) return s; const n = new Set(s); n.delete(r.id); return n })
      return
    }
    void onCheckReceiptDuplicate(v)
      .then((isDup) => {
        setDupRowIds((s) => {
          if (isDup === s.has(r.id)) return s
          const n = new Set(s)
          if (isDup) n.add(r.id); else n.delete(r.id)
          return n
        })
      })
      .catch(() => { /* hálózat nélkül a DB UNIQUE index úgyis véd mentéskor */ })
  }

  // Egy sor iratszám-figyelmeztetése (DB-duplikátum vagy in-batch ismétlődés).
  function receiptWarning(r: EntryRow): string | null {
    if (tab !== 'income') return null
    if (inBatchDuplicate(r)) return 'Ismétlődő iratszám ebben a listában'
    if (dupRowIds.has(r.id)) return 'Ez az iratszám már létezik'
    return null
  }

  // #3: irattípus-váltás — Chitanță (nyugta) választásakor a KÖVETKEZŐ nyugtaszámok
  // automatikus kitöltése: kerületi (iratszam) + gyülekezeti (nyugta), mindkettő +1.
  // Csak üres mezőt tölt (a kézzel beírtat nem írja felül).
  function handleDocTypeChange(r: EntryRow, value: string) {
    // Az irattípust AZONNAL beállítjuk (a vezérelt select ne ugorjon vissza a hálózati
    // lekérés alatt), a nyugtaszámokat utána, aszinkron töltjük.
    updateRow(r.id, { docType: value })
    const needsFill = !r.iratszam.trim() || !r.gyulekezetiSzam.trim()
    // Auto-szám CSAK a Bevétel fülön, Chitanță-nál, ha van üres kitöltendő mező.
    if (tab === 'income' && value === 'Chitanță' && onGetNextReceiptNumbers && needsFill) {
      // A gyülekezeti sorszám a NAPTÁRI évhez (datum) kötődik — nem a „melyik évre" mezőhöz.
      const year = Number(parseFlexibleDate(r.datum)?.slice(0, 4)) || currentYear
      void onGetNextReceiptNumbers(year)
        .then((next) => {
          if (!next) return
          // ÉLŐ állapot alapján töltünk (nem a befagyott `r`-ből): a lekérés alatt kézzel
          // átírt mezőt nem írunk felül, és ha közben más irattípusra váltottak, nem stempelünk.
          setIncomeRows((cur) =>
            cur.map((row) => {
              if (row.id !== r.id || row.docType !== 'Chitanță') return row
              const patch: Partial<EntryRow> = {}
              if (next.keruleti && !row.iratszam.trim()) patch.iratszam = next.keruleti
              if (next.gyulekezeti && !row.gyulekezetiSzam.trim()) patch.gyulekezetiSzam = next.gyulekezeti
              return Object.keys(patch).length ? { ...row, ...patch } : row
            }),
          )
        })
        .catch(() => onToast('error', 'A következő nyugtaszámot nem sikerült lekérni — írd be kézzel.'))
    }
  }

  // #5: a Családi nyugta tag-választó megerősítése — a SABLON-SORBÓL (ahonnan a „Család"
  // gombot nyomták) készít személyenként KÜLÖN bevétel-sort, a sor adataival (dátum, jogcím,
  // irattípus, melyik évre, megjegyzés). A kerületi iratszám soronként `/N` utótagot kap (a
  // készpénzes iratszámra UNIQUE index van → azonos szám ütközne), a gyülekezeti szám közös
  // (egy nyugta). Az ÖSSZEGEKET a felhasználó a táblázatban tölti ki tagonként.
  // Közös sor-generátor: a sablon-sorból (rowId) személyenként KÜLÖN bevétel-sort készít.
  // Egy nyugta: közös kerületi alapszám + /N (a készpénzes iratszámra UNIQUE index van),
  // közös gyülekezeti szám; az összegeket a felhasználó tölti tagonként. A sablon-sort
  // helyben lecseréljük a generált sorokra.
  function generateRowsFromTemplate(rowId: string, entries: Array<{ name: string; szemelyId: number | null }>) {
    if (!entries.length) return
    setIncomeRows((cur) => {
      const idx = cur.findIndex((r) => r.id === rowId)
      if (idx < 0) return cur
      const tmpl = cur[idx]
      const multi = entries.length > 1
      const base = tmpl.iratszam.trim()
      const generated: EntryRow[] = entries.map((e, i) => ({
        ...newRow(currentYear),
        datum: tmpl.datum,
        categoryId: tmpl.categoryId,
        docType: tmpl.docType,
        evre: tmpl.evre,
        iratszam: base ? (multi ? `${base}/${i + 1}` : base) : '',
        gyulekezetiSzam: tmpl.gyulekezetiSzam,
        partner: e.name,
        szemelyId: e.szemelyId,
        csaladId: null,
        megjegyzes: tmpl.megjegyzes,
      }))
      return [...cur.slice(0, idx), ...generated, ...cur.slice(idx + 1)]
    })
    setTab('income')
  }

  function handleFamilyConfirm(members: CombinedFamilyMember[]) {
    const rowId = familyPickerRowId
    setFamilyPickerRowId(null)
    if (!rowId || members.length === 0) return
    generateRowsFromTemplate(rowId, members.map((m) => ({ name: m.name, szemelyId: m.id })))
    onToast('success', `${members.length} családtag hozzáadva — töltsd ki az összegeket.`)
  }

  // #6 (Endre): a Befizető mezőben VESSZŐVEL elválasztott nevek → személyenként külön sor,
  // egy nyugtán (közös szám + /N). Szabad szövegként rögzít (nincs tag-kapcsolás — aki nem
  // egy regisztrált család, így is felvehető egy nyugtára).
  function handleSplitPartners(rowId: string, names: string[]) {
    const clean = names.map((n) => n.trim()).filter(Boolean)
    if (clean.length < 2) return
    generateRowsFromTemplate(rowId, clean.map((name) => ({ name, szemelyId: null })))
    onToast('success', `${clean.length} személy külön sorba bontva — töltsd ki az összegeket.`)
  }

  async function handleSave() {
    if (incomeValid === 0 && expenseValid === 0) {
      onToast('error', 'Legalább egy érvényes sor szükséges (összeg + kategória + dátum; belső mozgásnál bankszámla is).')
      return
    }

    // Belső mozgás sorok kigyűjtése (mindkét fülről)
    const transfers: CombinedInternalTransferPayload[] = []
    const incomeBatch: SaveIncomeBatchRow[] = []
    const expenseBatch: SaveExpenseBatchRow[] = []

    function pushTransfer(dir: 'deposit' | 'withdraw', datum: string, r: EntryRow) {
      if (dir === 'deposit') {
        transfers.push({ tipus: 'kassza_bank', datum, forras: 'kassza', cel: String(r.bankId), osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzletétel a bankba' })
      } else {
        transfers.push({ tipus: 'bank_kassza', datum, forras: String(r.bankId), cel: 'kassza', osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzfelvétel a bankból' })
      }
    }

    for (const r of incomeRows) {
      if (!rowValidIn('income', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('income', r)
      if (dir) { pushTransfer(dir, datum, r); continue }
      incomeBatch.push({
        datum, id_befizetescel: Number(r.categoryId), forrasa: r.partner.trim() || null,
        osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: 'Készpénz',
        // #3: a gyülekezeti saját sorszám (a kerületi = iratszam mellett) → befizetes.nyugta
        nyugta: r.gyulekezetiSzam.trim() || null,
        // #1: a kézzel megadott „melyik évre" (visszamenőleges járulék); ha üres, a dátum éve / aktuális év.
        fizetettev: Number(r.evre) || Number(datum.slice(0, 4)) || currentYear, megjegyzes: r.megjegyzes.trim() || null,
        // B1: tag- vagy család-kapcsolat (kölcsönösen kizáró)
        id_szemely: r.csaladId ? null : r.szemelyId,
        id_csalad: r.csaladId,
      })
    }
    for (const r of expenseRows) {
      if (!rowValidIn('expense', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('expense', r)
      if (dir) { pushTransfer(dir, datum, r); continue }
      expenseBatch.push({
        datum, id_kiadascel: Number(r.categoryId), kedvezmenyzett: r.partner.trim() || null,
        osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: 'Készpénz',
        megjegyzes: r.megjegyzes.trim() || null, is_inventory: false,
      })
    }

    incomeBatch.sort((a, b) => a.datum.localeCompare(b.datum))
    expenseBatch.sort((a, b) => a.datum.localeCompare(b.datum))

    setBusy(true)
    try {
      if (incomeBatch.length) {
        const res = await onSaveIncomeBatch(incomeBatch)
        if (res.error) { onToast('error', `Bevétel: ${res.error}`); return }
      }
      if (expenseBatch.length) {
        const res = await onSaveExpenseBatch(expenseBatch)
        if (res.error) { onToast('error', `Kiadás: ${res.error}`); return }
      }
      for (const t of transfers) {
        const res = await onSaveInternalTransfer(t)
        if (res.error) { onToast('error', `Belső mozgás: ${res.error}`); return }
      }
      const parts = []
      if (incomeBatch.length) parts.push(`${incomeBatch.length} bevétel`)
      if (expenseBatch.length) parts.push(`${expenseBatch.length} kiadás`)
      if (transfers.length) parts.push(`${transfers.length} belső mozgás`)
      onToast('success', `Mentve: ${parts.join(', ')} — dátum szerint rendezve.`)
      clearDraft() // #3: sikeres mentés után a vázlat törlődik
      onClose()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  const dateInvalid = (r: EntryRow) => r.datum.trim() !== '' && parseFlexibleDate(r.datum) == null

  // Dátum mező: szabadon beírható szöveg + naptár-választó (natív date input).
  function renderDateField(r: EntryRow) {
    return (
      <div className="flex items-center gap-1">
        <input
          className={`${inputClass} ${dateInvalid(r) ? 'border-red-400' : ''}`}
          value={r.datum}
          placeholder="pl. 2026.01.04"
          onChange={(e) => updateRow(r.id, { datum: e.target.value })}
        />
        <input
          type="date"
          aria-label="Dátum választása naptárból"
          title="Naptár"
          className="h-9 w-9 shrink-0 rounded-md border border-input bg-transparent px-1 text-transparent"
          value={parseFlexibleDate(r.datum) || ''}
          onChange={(e) => { if (e.target.value) updateRow(r.id, { datum: e.target.value }) }}
        />
      </div>
    )
  }

  function renderBankSelect(r: EntryRow) {
    const dir = belsoDir(r)
    if (!dir) return null
    return (
      <div className="mt-1 flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
        <ArrowLeftRight className="size-3.5 shrink-0" />
        <span className="shrink-0">{dir === 'deposit' ? 'Melyik bankszámlára:' : 'Melyik bankszámláról:'}</span>
        <select className={inputClass + ' h-7'} value={r.bankId} onChange={(e) => updateRow(r.id, { bankId: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">— Válassz —</option>
          {bankAccounts.map((b) => (<option key={b.id} value={b.id}>{b.bank_neve}</option>))}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Kiemelt fülek */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
        <button type="button" onClick={() => setTab('income')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'income' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
          Bevétel{incomeValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{incomeValid}</span>}
        </button>
        <button type="button" onClick={() => setTab('expense')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'expense' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
          Kiadás{expenseValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{expenseValid}</span>}
        </button>
      </div>
      <p className="text-xs text-slate-400">Csak készpénzes tételek — a banki tételeket banki kivonatból importáljuk. Készpénzfelvétel/-letétel esetén válaszd ki a bankszámlát is.</p>

      {/* #3 — visszaállított vázlat jelzése */}
      {draftRestoredAt !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            📝 <strong>Félbehagyott vázlat visszaállítva</strong>
            {draftRestoredAt ? ` (mentve: ${new Date(draftRestoredAt).toLocaleString('hu-HU')})` : ''} — folytathatod, ahol abbahagytad.
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-800 transition hover:bg-amber-100"
          >
            Vázlat elvetése
          </button>
        </div>
      )}

      {/* Nagy képernyő: táblázat */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Dátum</th>
              <th className="px-2 py-2 text-left">Irattípus</th>
              <th className="px-2 py-2 text-left">{tab === 'income' ? 'Kerületi sz.' : 'Irat sz.'}</th>
              {tab === 'income' && <th className="px-2 py-2 text-left">Gyül. sz.</th>}
              <th className="px-2 py-2 text-left">{partnerLabel}</th>
              <th className="px-2 py-2 text-left">Jogcím</th>
              {tab === 'income' && <th className="px-2 py-2 text-left">Melyik évre</th>}
              <th className="px-2 py-2 text-right">Összeg</th>
              <th className="px-2 py-2 text-left">Megjegyzés</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dir = belsoDir(r)
              const dWarn = dateWarning(r)
              const rWarn = receiptWarning(r)
              // #1: a kerületi + gyülekezeti szám-mező CSAK Chitanță (nyugta) esetén jelenik meg.
              const isChitanta = r.docType === 'Chitanță'
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5 w-[160px]">
                    {renderDateField(r)}
                    {dWarn && <div className="mt-0.5 text-[10px] leading-tight text-amber-600">⚠ {dWarn}</div>}
                  </td>
                  <td className="px-2 py-1.5 w-[130px]">
                    <select className={inputClass} value={r.docType} disabled={!!dir} onChange={(e) => void handleDocTypeChange(r, e.target.value)}>
                      <option value="">—</option>
                      {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-[100px]">
                    {dir || (tab === 'income' && !isChitanta) ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <>
                        <input
                          className={`${inputClass} ${rWarn ? 'border-red-400' : ''}`}
                          value={r.iratszam}
                          title={tab === 'income' ? 'Kerületi (nyomdai) szám — a kerülettől kapott szám' : undefined}
                          onChange={(e) => updateRow(r.id, { iratszam: e.target.value })}
                          onBlur={() => checkRowDuplicate(r)}
                        />
                        {rWarn && <div className="mt-0.5 text-[10px] leading-tight text-red-600">⚠ {rWarn}</div>}
                      </>
                    )}
                  </td>
                  {tab === 'income' && (
                    <td className="px-2 py-1.5 w-[100px]">
                      {dir || !isChitanta ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <input
                          className={inputClass}
                          value={r.gyulekezetiSzam}
                          title="Gyülekezeti saját sorszám (a nyugtán a kerületi szám mellett)"
                          onChange={(e) => updateRow(r.id, { gyulekezetiSzam: e.target.value })}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    {dir ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <PartnerCell
                        row={r}
                        mode={tab}
                        searchable={tab === 'income' ? !!onSearchMembers : !!onSearchExpensePartners}
                        onSearchMembers={onSearchMembers}
                        onResolveFamilyId={onResolveFamilyId}
                        onSearchExpense={onSearchExpensePartners}
                        onOpenFamily={
                          tab === 'income' && onSearchFamilies && onGetFamilyMembers
                            ? () => setFamilyPickerRowId(r.id)
                            : undefined
                        }
                        onSplitPartners={tab === 'income' ? (names) => handleSplitPartners(r.id, names) : undefined}
                        updateRow={updateRow}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                    {renderBankSelect(r)}
                  </td>
                  {tab === 'income' && (
                    <td className="px-2 py-1.5 w-[90px]">
                      {dir ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <input
                          className={inputClass + ' text-center'}
                          type="number"
                          inputMode="numeric"
                          value={r.evre ?? ''}
                          placeholder={String(currentYear)}
                          title="Melyik évre szól a befizetés (visszamenőleges járulék is)"
                          onChange={(e) => updateRow(r.id, { evre: e.target.value })}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5 w-[110px]"><input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Kis/közepes képernyő: kártyák */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r, i) => {
          const dir = belsoDir(r)
          const dWarn = dateWarning(r)
          const rWarn = receiptWarning(r)
          const isChitanta = r.docType === 'Chitanță'
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{i + 1}. tétel</span>
                <button type="button" aria-label="Sor törlése" className="text-slate-400 hover:text-red-500" onClick={() => removeRow(r.id)}><Trash2 className="size-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-slate-500">Kategória
                  <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                </label>
                {dir && (
                  <label className="col-span-2 text-xs text-sky-800">{dir === 'deposit' ? 'Melyik bankszámlára' : 'Melyik bankszámláról'}
                    <select className={inputClass} value={r.bankId} onChange={(e) => updateRow(r.id, { bankId: e.target.value ? Number(e.target.value) : '' })}>
                      <option value="">— Válassz —</option>
                      {bankAccounts.map((b) => (<option key={b.id} value={b.id}>{b.bank_neve}</option>))}
                    </select>
                  </label>
                )}
                <label className="text-xs text-slate-500">Dátum
                  {renderDateField(r)}
                  {dWarn && <span className="mt-0.5 block text-[10px] leading-tight text-amber-600">⚠ {dWarn}</span>}
                </label>
                <label className="text-xs text-slate-500">Összeg
                  <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} />
                </label>
                {tab === 'income' && !dir && (
                  <label className="text-xs text-slate-500">Melyik évre
                    <input className={inputClass} type="number" inputMode="numeric" value={r.evre ?? ''} placeholder={String(currentYear)} onChange={(e) => updateRow(r.id, { evre: e.target.value })} />
                  </label>
                )}
                {!dir && (
                  <>
                    <label className="col-span-2 text-xs text-slate-500">{partnerLabel}
                      <PartnerCell
                        row={r}
                        mode={tab}
                        searchable={tab === 'income' ? !!onSearchMembers : !!onSearchExpensePartners}
                        onSearchMembers={onSearchMembers}
                        onResolveFamilyId={onResolveFamilyId}
                        onSearchExpense={onSearchExpensePartners}
                        onOpenFamily={
                          tab === 'income' && onSearchFamilies && onGetFamilyMembers
                            ? () => setFamilyPickerRowId(r.id)
                            : undefined
                        }
                        onSplitPartners={tab === 'income' ? (names) => handleSplitPartners(r.id, names) : undefined}
                        updateRow={updateRow}
                      />
                    </label>
                    <label className="text-xs text-slate-500">Irattípus
                      <select className={inputClass} value={r.docType} onChange={(e) => void handleDocTypeChange(r, e.target.value)}>
                        <option value="">—</option>
                        {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </label>
                    {(tab === 'expense' || isChitanta) && (
                      <label className="text-xs text-slate-500">{tab === 'income' ? 'Kerületi sz.' : 'Irat sz.'}
                        <input
                          className={`${inputClass} ${rWarn ? 'border-red-400' : ''}`}
                          value={r.iratszam}
                          onChange={(e) => updateRow(r.id, { iratszam: e.target.value })}
                          onBlur={() => checkRowDuplicate(r)}
                        />
                        {rWarn && <span className="mt-0.5 block text-[10px] leading-tight text-red-600">⚠ {rWarn}</span>}
                      </label>
                    )}
                    {tab === 'income' && isChitanta && (
                      <label className="text-xs text-slate-500">Gyül. sz.
                        <input className={inputClass} value={r.gyulekezetiSzam} onChange={(e) => updateRow(r.id, { gyulekezetiSzam: e.target.value })} />
                      </label>
                    )}
                  </>
                )}
                <label className="col-span-2 text-xs text-slate-500">Megjegyzés
                  <input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} />
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent" onClick={addRow}>
          <Plus className="size-4" /> Új sor
        </button>
        <div className="text-sm">
          <span className="text-slate-500">{tab === 'income' ? 'Bevételek' : 'Kiadások'} összege:</span>{' '}
          <strong className={tab === 'income' ? 'text-emerald-600' : 'text-red-500'}>{formatRon(tabTotal)} RON</strong>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {draftStorageKey && (
          lastSavedAt ? (
            <span
              className="mr-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600"
              title="A bevitt adatok gépelés közben automatikusan mentődnek — áramszünet vagy véletlen bezárás esetén sem vesznek el."
            >
              <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-500" />
              💾 Vázlat mentve: {new Date(lastSavedAt).toLocaleTimeString('hu-HU')}
            </span>
          ) : (
            <span
              className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400"
              title="Amint adatot írsz be, automatikusan mentődik a böngészőben."
            >
              <span className="inline-block size-2 rounded-full bg-slate-300" />
              💾 Automatikus mentés bekapcsolva — még nincs mentendő adat
            </span>
          )
        )}
        <button type="button" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose} disabled={busy}>Mégse</button>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
          <Save className="size-4" /> Mentés ({incomeValid + expenseValid} tétel)
        </button>
      </div>

      {/* #5 — Családi nyugta: tag-választó az adott sorhoz (a sor adataival generál sorokat) */}
      {familyPickerRowId !== null && onSearchFamilies && onGetFamilyMembers && (() => {
        const tmpl = incomeRows.find((r) => r.id === familyPickerRowId)
        const ctx = tmpl
          ? [
              tmpl.datum && `Dátum: ${tmpl.datum}`,
              tmpl.iratszam && `Kerületi sz.: ${tmpl.iratszam}`,
              tmpl.gyulekezetiSzam && `Gyül. sz.: ${tmpl.gyulekezetiSzam}`,
            ].filter(Boolean).join(' · ')
          : ''
        return (
          <FamilyReceiptModal
            contextInfo={ctx || undefined}
            onSearchFamilies={onSearchFamilies}
            onGetFamilyMembers={onGetFamilyMembers}
            onConfirm={handleFamilyConfirm}
            onClose={() => setFamilyPickerRowId(null)}
          />
        )
      })()}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────
// PartnerCell — „Befizető / forrás" mező, opcionális tag-keresővel (B1)
//
// Ha nincs onSearchMembers (pl. a web, amíg be nem köti), sima szövegmező —
// byte-azonos a korábbi viselkedéssel. Kereső-módban: 2 karaktertől 300 ms
// debounce-szal keres a tagnyilvántartásban; a kiválasztott tag chipként
// jelenik meg (X-szel leválasztható), és kérhető a CSALÁDI mód — ilyenkor a
// befizetés a tag családjához kapcsolódik (kölcsönösen kizáró a taggal).
// ─────────────────────────────────────────────────────────────────────────

function PartnerCell({
  row,
  mode,
  searchable,
  onSearchMembers,
  onResolveFamilyId,
  onSearchExpense,
  onOpenFamily,
  onSplitPartners,
  updateRow,
}: {
  row: EntryRow
  mode: 'income' | 'expense'
  searchable: boolean
  onSearchMembers?: (query: string) => Promise<CombinedMemberHit[]>
  onResolveFamilyId?: (szemelyId: number) => Promise<number | null>
  onSearchExpense?: (query: string) => Promise<string[]>
  /** #5: ha megadva (bevétel), a partner-mezőnél „Család" gomb — tag-választó az adott sorhoz. */
  onOpenFamily?: () => void
  /** #6: vesszővel elválasztott nevek felbontása külön sorokra (egy nyugtán). */
  onSplitPartners?: (names: string[]) => void
  updateRow: (id: string, patch: Partial<EntryRow>) => void
}) {
  const [hits, setHits] = useState<CombinedMemberHit[]>([])
  const [open, setOpen] = useState(false)
  const [familyNote, setFamilyNote] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)
  // 2026-06-12 (Endre #2): a találati lista PORTÁLBAN, fix pozícióval nyílik —
  // a dialógus overflow-y-auto-ja korábban levágta (a felhasználó nem látta).
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dropRect, setDropRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const measure = () => {
    const el = inputRef.current
    // A párhuzamosan renderelt REJTETT cella (táblázat lg:block ⇄ mobil-kártya lg:hidden)
    // inputja display:none-os ősben van → isElementVisible=false → ne nyíljon fantom legördülő.
    // (NEM offsetParent: a Base UI dialóg transformja a látható cellán is null-t adhatna.)
    if (!isElementVisible(el)) {
      setDropRect(null)
      return
    }
    const r = el!.getBoundingClientRect()
    setDropRect({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  useEffect(() => {
    if (!open) return
    measure()
    // Görgetésre/átméretezésre újrapozicionálunk (capture: a dialóguson belüli
    // scroll-konténerek eseményeit is elkapjuk).
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // `hits`-re is újramérünk: ha a dialóg-animáció miatt a mérés korábban null-t adott,
    // a találatok beérkezésekor újrapozícionálunk (különben a lista nem nyílna ki).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits])

  // Debounce-os keresés gépeléskor (csak kereső-módban, kiválasztás előtt).
  // Bevételnél tag-keresés (onSearchMembers), kiadásnál korábbi-partner autocomplete
  // (onSearchExpense → névlista, amit a közös találat-formára képezünk).
  useEffect(() => {
    if (!searchable || row.szemelyId != null) return
    const q = row.partner.trim()
    if (q.length < 2) {
      setHits([])
      setOpen(false)
      return
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      // Csak a TÉNYLEGESEN látható cella keressen — a rejtett (másik breakpoint) ne.
      // (isElementVisible, NEM offsetParent — lásd a helper kommentjét.)
      if (!isElementVisible(inputRef.current)) return
      const p: Promise<CombinedMemberHit[]> =
        mode === 'income'
          ? (onSearchMembers ? onSearchMembers(q) : Promise.resolve([]))
          : onSearchExpense
            ? onSearchExpense(q).then((names) => names.map((n, i) => ({ id: -1 - i, name: n })))
            : Promise.resolve([])
      void p
        .then((res) => {
          setHits(res.slice(0, 8))
          setOpen(res.length > 0)
        })
        .catch(() => {
          setHits([])
          setOpen(false)
        })
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.partner, row.szemelyId, searchable, mode])

  if (!searchable) {
    return (
      <input
        className={inputClass}
        value={row.partner}
        onChange={(e) => updateRow(row.id, { partner: e.target.value })}
      />
    )
  }

  // Kiválasztott tag/család — chip nézet
  if (row.szemelyId != null || row.csaladId != null) {
    return (
      <div className="space-y-1">
        <div className="flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 text-sm text-emerald-900">
          <span className="min-w-0 flex-1 truncate" title={row.partner}>
            {row.partner}
            {row.csaladId != null && (
              <span className="ml-1 rounded bg-emerald-200/70 px-1 text-[10px] font-semibold uppercase">családi</span>
            )}
          </span>
          <button
            type="button"
            className="shrink-0 rounded px-1 text-emerald-700 hover:bg-emerald-100"
            title="Kapcsolat leválasztása (a név szövegként megmarad)"
            onClick={() => {
              updateRow(row.id, { szemelyId: null, csaladId: null })
              setFamilyNote(null)
            }}
          >
            ×
          </button>
        </div>
        {onResolveFamilyId && row.csaladId == null && (
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input
              type="checkbox"
              className="size-3"
              checked={false}
              onChange={() => {
                const szemelyId = row.szemelyId
                if (szemelyId == null) return
                void onResolveFamilyId(szemelyId)
                  .then((familyId) => {
                    if (familyId != null) {
                      updateRow(row.id, { csaladId: familyId })
                      setFamilyNote(null)
                    } else {
                      setFamilyNote('Ehhez a taghoz nincs család rögzítve.')
                    }
                  })
                  .catch(() => setFamilyNote('A család feloldása nem sikerült.'))
              }}
            />
            Családi befizetés
          </label>
        )}
        {row.csaladId != null && (
          <button
            type="button"
            className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
            onClick={() => updateRow(row.id, { csaladId: null })}
          >
            Vissza tag-szintűre
          </button>
        )}
        {familyNote && <p className="text-[11px] text-amber-700">{familyNote}</p>}
      </div>
    )
  }

  // Gépelés + találati lista (a lista PORTÁLBAN — sosem vágja le a dialógus)
  // #6: vesszővel elválasztott nevek darabolása (egy nyugtára több személy).
  const partnerParts = row.partner.split(',').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputClass}
        value={row.partner}
        placeholder={mode === 'income' ? 'Név (keresés a tagok közt) — több név vesszővel is' : 'Cég/személy (keresés a korábbiak közt) vagy szabad szöveg'}
        onChange={(e) => updateRow(row.id, { partner: e.target.value })}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => hits.length > 0 && setOpen(true)}
      />
      {(onOpenFamily || (onSplitPartners && partnerParts.length > 1)) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {onOpenFamily && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenFamily}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
              title="Családi nyugta — több családtag egy nyugtán (a sor adataival)"
            >
              <Users className="size-3" /> Család keresése
            </button>
          )}
          {onSplitPartners && partnerParts.length > 1 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSplitPartners(partnerParts)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline"
              title="A vesszővel elválasztott neveket külön sorokra bontja — egy nyugtán (közös szám), tagonként saját összeggel"
            >
              ✂ Felbontás {partnerParts.length} külön sorra
            </button>
          )}
        </div>
      )}
      {open && hits.length > 0 && dropRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl"
            style={{ left: dropRect.left, top: dropRect.top, width: Math.max(dropRect.width, 260) }}
          >
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-emerald-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (mode === 'income') updateRow(row.id, { partner: h.name, szemelyId: h.id, csaladId: null })
                  else updateRow(row.id, { partner: h.name })
                  setHits([])
                  setOpen(false)
                }}
              >
                <div className="text-sm font-medium text-slate-800">{h.name}</div>
                {h.detail && <div className="text-[11px] text-slate-400">{h.detail}</div>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
