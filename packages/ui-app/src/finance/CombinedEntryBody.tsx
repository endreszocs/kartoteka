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

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Save, Trash2, ArrowLeftRight, Users, ChevronRight } from 'lucide-react'
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
   * Okos „Család csatolása" (Endre, 2026-06-21): ha a sorban MÁR ki van választva egy regisztrált
   * befizető, az ő családtagjait EGY lépésben az almenübe tesszük (ablak nélkül). Ha nincs megadva
   * (vagy nincs kiválasztott személy / nincs család), a család-kereső ablakra esünk vissza.
   */
  onGetFamilyMembersForPerson?: (personId: number) => Promise<CombinedFamilyMember[]>
  /**
   * (B) Egyházfenntartói járulék auto-összeg (Endre, 2026-06-21): ha a sor jogcíme egyházfenntartói
   * járulék (kód 101.01*) ÉS a befizető regisztrált tag (id != null) ÉS van „melyik évre" év, a rögzítő
   * lekéri a tag adott évi {expected, paid, debt} értékét, és — ha az összeg MÉG ÜRES — beírja a `debt`-et
   * (a még fizetendőt, kedvezményekkel/felmentéssel). A kézzel beírt összeget SOHA nem írja felül. Ha
   * nincs megadva (pl. desktop), nincs automatikus kitöltés.
   */
  onGetExpectedJarulek?: (personId: number, year: number, prospectiveDateIso?: string) => Promise<{ expected: number; paid: number; debt: number } | null>
  /**
   * #3 (Endre, 2026-06-20): Chitanță választásakor a következő nyugtaszámok lekérése —
   * `keruleti` (kerülettől kapott/nyomdai → iratszam) és `gyulekezeti` (saját sorszám →
   * nyugta). Mindkettő +1-gyel lép az utolsó nyugtához képest, hézag nélkül. Ha nincs
   * megadva, nincs automatikus kitöltés (a felhasználó kézzel ír mindkettőt).
   */
  onGetNextReceiptNumbers?: (year: number) => Promise<{ keruleti: string; gyulekezeti: string; ujEv?: boolean; tavalyiUtolso?: string; tavalyiEv?: number }>
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
  /** #4 (Endre, 2026-06-21): EGY nyugta befizetői — sor-almenü. Minden befizetőnek SAJÁT
   *  összege (`osszeg`) és SAJÁT éve (`evre`) van; a nyugtaszám / irattípus / jogcím KÖZÖS (a soron).
   *  0 elem → klasszikus, szabad-szöveges egyszemélyes sor (a fősor `amount`/`evre` mezőivel).
   *  1 elem → egy regisztrált befizető (a fősor `amount`/`evre` az ő `osszeg`/`evre` mezőjét szerkeszti).
   *  2+ elem → lenyitható almenü, befizetőnként összeg+év; a fősor összege read-only summa.
   *  id=null = szabad szöveges (nem regisztrált) befizető. */
  people: Array<{ uid: string; id: number | null; name: string; osszeg: string; evre: string }>
  /** Legacy (B1) — már a people[] váltja ki; csak régi vázlat visszaállításához tartjuk meg. */
  szemelyId?: number | null
  csaladId?: number | null
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const newRow = (year?: number): EntryRow => ({
  id: crypto.randomUUID(), datum: todayIso(), categoryId: '', partner: '', docType: '', iratszam: '', gyulekezetiSzam: '', amount: '', megjegyzes: '', bankId: '',
  evre: year != null ? String(year) : '',
  people: [],
})

// #4 (Endre, 2026-06-21): a fősor összege = a befizetők (people[]) összegeinek summája — ezt
// használjuk a read-only fő-összeghez (>=2 befizető) és az érvényesség-/total-számításhoz.
const payerSum = (r: EntryRow): number => (r.people ?? []).reduce((s, p) => s + (Number(p.osszeg) || 0), 0)

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
  onSearchMembers, onSearchExpensePartners,
  onSearchFamilies, onGetFamilyMembers, onGetFamilyMembersForPerson, onGetExpectedJarulek, onGetNextReceiptNumbers,
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
  /** #2 (Endre): az ELDÖNTÖTT gyülekezeti kezdőszám az adott naptári évre (új-évi kérdés után) —
   *  erről nő tovább a kötegen belüli léptetés; null = még nincs döntés erre az évre. */
  const gyulStartRef = useRef<{ year: number; start: number; width: number } | null>(null)
  /** #2: az új-évi kérdés-panel állapota (null = nincs kérdés). */
  const [newYearPrompt, setNewYearPrompt] = useState<{ year: number; rowId: string; tavalyiEv?: number; tavalyiUtolso: string; ajanlott: string } | null>(null)
  /** #2: a „saját számtól" opció beviteli mezeje. */
  const [customStart, setCustomStart] = useState('')

  // Beviteli őr P1: a legutóbb rögzített dátum egyszeri betöltése (figyelmeztetés alapja).
  useEffect(() => {
    if (!onGetLastRecordedDate) return
    let cancelled = false
    void onGetLastRecordedDate()
      // FONTOS: csak a DÁTUM-részt tartjuk meg (a DB időbélyeget adhat: „2025-12-31T00:00:00").
      // Időbélyeggel a „2025-12-31" < „2025-12-31T00:00:00" szöveg-összehasonlítás IGAZ lenne,
      // és hamisan „Korábbi, mint az utolsó rögzített" figyelmeztetést adna UGYANARRA a napra.
      .then((d) => { if (!cancelled) setLastRecordedDate(d ? d.slice(0, 10) : null) })
      .catch(() => { /* nincs hálózat — a figyelmeztetés egyszerűen kimarad */ })
    return () => { cancelled = true }
  }, [onGetLastRecordedDate])

  // #3 auto-vázlat: van-e értelmes tartalom (üres sorokat nem mentünk).
  const rowHasContent = (r: EntryRow) =>
    !!(r.amount.trim() || r.partner.trim() || (r.people && r.people.length > 0) || r.categoryId !== '' || r.iratszam.trim() || r.megjegyzes.trim())
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
      // #4 migráció: régi vázlat (szemelyId, vagy people[] osszeg/evre nélkül) → a mai people[]
      // alakra (id,name,osszeg,evre) normalizálva, hogy a régi vázlat se dobjon hibát.
      const migrate = (rs: EntryRow[]): EntryRow[] =>
        rs.map((r) => {
          const arr = Array.isArray(r.people)
            ? r.people
            : (r.szemelyId != null ? [{ id: r.szemelyId, name: r.partner }] : [])
          const people = arr.map((p) => ({
            uid: typeof (p as { uid?: unknown }).uid === 'string' ? (p as { uid: string }).uid : crypto.randomUUID(),
            id: p.id ?? null,
            name: p.name ?? '',
            osszeg: typeof (p as { osszeg?: unknown }).osszeg === 'string' ? (p as { osszeg: string }).osszeg : '',
            evre: typeof (p as { evre?: unknown }).evre === 'string' ? (p as { evre: string }).evre : (r.evre ?? ''),
          }))
          return { ...r, people }
        })
      const inc = migrate(Array.isArray(d.incomeRows) ? d.incomeRows : [])
      const exp = migrate(Array.isArray(d.expenseRows) ? d.expenseRows : [])
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
  // #1 (Endre): a Kerületi sz. + Irat sz. OSZLOP csak akkor látszik (bevétel), ha legalább
  // egy sorban Chitanță az irattípus — különben teljesen eltűnik (nem csak „—").
  const showIncomeReceiptCols = tab === 'income' && rows.some((r) => r.docType === 'Chitanță')

  // Kód-lookup mindkét fülre (a belső mozgás iránya független a fültől).
  const incomeKod = useMemo(() => new Map<number, string>(incomeCategories.map((c) => [c.id, c.kod] as [number, string])), [incomeCategories])
  const expenseKod = useMemo(() => new Map<number, string>(expenseCategories.map((c) => [c.id, c.kod] as [number, string])), [expenseCategories])
  const dirFor = (tabName: 'income' | 'expense', r: EntryRow): 'deposit' | 'withdraw' | null => {
    if (r.categoryId === '') return null
    return dirOfKod((tabName === 'income' ? incomeKod : expenseKod).get(Number(r.categoryId)))
  }
  const belsoDir = (r: EntryRow) => dirFor(tab, r) // aktuális fül — a megjelenítéshez
  // (B) egyházfenntartói járulék jogcím-e (kód 101.01*) — az auto-összeghez (a szerveroldali
  // isChurchMaintenanceCode-dal egyezően).
  const isChurchMaintenance = (categoryId: number | ''): boolean => {
    if (categoryId === '') return false
    const kod = incomeKod.get(Number(categoryId))
    return typeof kod === 'string' && kod.startsWith('101.01')
  }

  // (B) AUTO-ÖSSZEG: ha egy bevétel-sor jogcíme egyházfenntartói járulék ÉS a befizető regisztrált
  // tag ÉS van év ÉS az összeg MÉG ÜRES → lekérjük a tag adott évi `debt`-jét és beírjuk. Effekt-alapú
  // (mindig a FRISS incomeRows-ból dolgozik); a per-befizető `reqKey`-guard megakadályozza az
  // ismételt/loop-os lekérést és tiszteletben tartja a kézi összeget.
  const jarulekReqRef = useRef<Map<string, string>>(new Map()) // payer.uid → `${id}:${year}` (már lekérve)
  useEffect(() => {
    if (tab !== 'income' || !onGetExpectedJarulek) return
    for (const row of incomeRows) {
      if (!isChurchMaintenance(row.categoryId)) continue
      for (const p of row.people ?? []) {
        if (p.id == null) continue // csak regisztrált tag
        if ((p.osszeg ?? '').trim() !== '') continue // a kézi/meglévő összeget NE bántsuk
        const year = Number(p.evre || row.evre)
        if (!Number.isFinite(year) || year < 1900) continue
        const reqKey = `${p.id}:${year}`
        if (jarulekReqRef.current.get(p.uid) === reqKey) continue // ezt a (tag,év)-et már lekértük
        jarulekReqRef.current.set(p.uid, reqKey)
        const rowId = row.id
        const payerUid = p.uid
        const payerId = p.id
        const payerName = p.name
        // J6: a befizetés DÁTUMA (a sor datum-ja) → a korai-fizetés/időszaki kedvezmény prospektív
        // alkalmazásához (ha a befizetés a határidő előtt van, a kedvezményes összeget ajánljuk).
        const prospectiveDateIso = parseFlexibleDate(row.datum) || undefined
        void onGetExpectedJarulek(payerId, year, prospectiveDateIso)
          .then((res) => {
            if (!res) return
            if (jarulekReqRef.current.get(payerUid) !== reqKey) return // közben változott a tag/év
            if (res.debt > 0) {
              const amount = String(res.debt)
              setIncomeRows((cur) => cur.map((r) => (r.id !== rowId ? r : {
                ...r,
                people: (r.people ?? []).map((q) =>
                  q.uid === payerUid && q.id === payerId && (q.osszeg ?? '').trim() === '' ? { ...q, osszeg: amount } : q,
                ),
              })))
            } else {
              // M3: rendezve / felmentett → NEM írunk 0-t, de jelezzük (különben néma a mező).
              onToast('success', res.expected <= 0
                ? `${payerName || 'A tag'}: erre az évre (${year}) felmentett — nincs járulék.`
                : `${payerName || 'A tag'}: a ${year}. évi járulék már rendezve (nincs hátralék).`)
            }
          })
          .catch(() => { /* hálózat nélkül nincs auto-kitöltés */ })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, tab, onGetExpectedJarulek])

  function rowValidIn(tabName: 'income' | 'expense', r: EntryRow): boolean {
    // #4: ha vannak befizetők (people[]), a sor összege a tagok összegeinek summája (per-tag
    // összeg az almenüben); különben a fősor `amount` (szabad-szöveges egyszemélyes / kiadás).
    const effAmount = tabName === 'income' && (r.people?.length ?? 0) >= 1 ? payerSum(r) : Number(r.amount)
    if (!(effAmount > 0 && r.categoryId !== '' && parseFlexibleDate(r.datum) != null)) return false
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

  const tabTotal = useMemo(
    () => rows.reduce((s, r) => s + (tab === 'income' && (r.people?.length ?? 0) >= 1 ? payerSum(r) : (Number(r.amount) || 0)), 0),
    [rows, tab],
  )

  /** #4: melyik többfizetős sorok almenüje van ÖSSZECSUKVA (alapból minden nyitva — felfedezhetőség). */
  const [collapsedPayerRows, setCollapsedPayerRows] = useState<Set<string>>(() => new Set())
  const togglePayerRow = (id: string) =>
    setCollapsedPayerRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  // ── #4 befizető-almenü műveletek (a sor people[] listáján) ────────────────
  /** Új befizetők hozzáfűzése (kereső-találat vagy család) — id szerint dedupolva. */
  function appendPayers(rowId: string, additions: Array<{ id: number | null; name: string }>) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const curPeople = r.people ?? []
        const existing = new Set(curPeople.filter((p) => p.id != null).map((p) => p.id))
        const add = additions.filter((a) => a.id == null || !existing.has(a.id))
        if (!add.length) return { ...r, partner: '' }
        const evreDefault = curPeople[0]?.evre || r.evre || String(currentYear)
        // BLOCKER-fix: 0 befizetőről indulva a fő Összeg mezőbe MÁR beírt érték (r.amount) NE
        // vesszen el a tag-választáskor — az ELSŐ új befizetőre visszük át, és ürítjük a fősor
        // amount-ját (a UI ezután a people[0].osszeg-et / a summát mutatja). A sorrend (előbb
        // összeg, utána tag) így sem okoz csendes adatvesztést.
        const seed = curPeople.length === 0 ? (r.amount.trim() || '') : ''
        const newPeople = [
          ...curPeople,
          ...add.map((a, i) => ({ uid: crypto.randomUUID(), id: a.id, name: a.name, osszeg: i === 0 ? seed : '', evre: evreDefault })),
        ]
        return { ...r, people: newPeople, partner: '', ...(curPeople.length === 0 ? { amount: '' } : {}) }
      }),
    )
  }
  /** Üres (szabad-szöveges) befizető-sor hozzáadása az almenühöz. */
  function addEmptyPayer(rowId: string) { appendPayers(rowId, [{ id: null, name: '' }]) }
  /** Egy befizető mezőjének frissítése (név / összeg / év). */
  function updatePayer(rowId: string, idx: number, patch: Partial<{ id: number | null; name: string; osszeg: string; evre: string }>) {
    setRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, people: (r.people ?? []).map((p, i) => (i === idx ? { ...p, ...patch } : p)) } : r)))
  }
  /** Egy befizető törlése az almenüből. */
  function removePayer(rowId: string, idx: number) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const removed = (r.people ?? [])[idx]
        const people = (r.people ?? []).filter((_, i) => i !== idx)
        // BLOCKER-fix (visszafelé): ha az UTOLSÓ befizetőt is töröljük (0-ra esik), a hozzá tartozó
        // összeg/év NE vesszen el — visszaírjuk a fősor mezőibe (a UI ezután a klasszikus
        // szabad-szöveges sort mutatja). 2→1 esetén nincs teendő: a maradt people[0].osszeg-et az
        // amountOf accessor úgyis a fő mezőben mutatja.
        if (people.length === 0 && removed) {
          return { ...r, people, amount: removed.osszeg || r.amount, evre: removed.evre || r.evre }
        }
        return { ...r, people }
      }),
    )
  }

  // #4: a fősor Összeg/Év mezője 0 vagy 1 befizetőnél a megfelelő forrást szerkeszti
  // (0 → a sor `amount`/`evre`; 1 → a befizető `osszeg`/`evre` mezője). 2+ befizetőnél a
  // fő-összeg read-only summa, az évet pedig tagonként az almenüben adjuk meg.
  const amountOf = (r: EntryRow): string =>
    tab === 'income' && (r.people?.length ?? 0) === 1 ? (r.people![0].osszeg ?? '') : r.amount
  const setAmountOf = (r: EntryRow, val: string) => {
    if (tab === 'income' && (r.people?.length ?? 0) === 1) updatePayer(r.id, 0, { osszeg: val })
    else updateRow(r.id, { amount: val })
  }
  const evreOf = (r: EntryRow): string =>
    tab === 'income' && (r.people?.length ?? 0) === 1 ? (r.people![0].evre ?? '') : (r.evre ?? '')
  const setEvreOf = (r: EntryRow, val: string) => {
    if (tab === 'income' && (r.people?.length ?? 0) === 1) updatePayer(r.id, 0, { evre: val })
    else updateRow(r.id, { evre: val })
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

  // In-batch: ugyanaz a kerületi iratSZÁM szerepel-e MÁSIK sorban is (még mentés előtt).
  // FONTOS: csak a ténylegesen kitöltött iratszám számít — az ÜRES mező (csak az irattípus)
  // NEM duplikátum (különben több üres Chitanță-sor hamisan ütközne).
  function inBatchDuplicate(r: EntryRow): boolean {
    if (!r.iratszam.trim()) return false
    const v = combinedIratszam(r)
    if (!v) return false
    return rows.filter((x) => x.iratszam.trim() && combinedIratszam(x) === v).length > 1
  }

  // P0: a kerületi iratszám DB-duplikátum-ellenőrzése a mező elhagyásakor (csak bevétel).
  function checkRowDuplicate(r: EntryRow) {
    if (tab !== 'income' || !onCheckReceiptDuplicate) return
    // Üres iratszámot ne ellenőrizzünk (nem duplikátum).
    if (!r.iratszam.trim()) {
      setDupRowIds((s) => { if (!s.has(r.id)) return s; const n = new Set(s); n.delete(r.id); return n })
      return
    }
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

  // #3/#2: irattípus-váltás — Chitanță választásakor a KÖVETKEZŐ nyugtaszámok automatikus kitöltése:
  // kerületi (iratszam) + gyülekezeti (nyugta) = az UTOLSÓ + 1. Új évnél a gyülekezeti számra
  // RÁKÉRDEZÜNK (1-től / folytatás / saját szám). Csak üres mezőt tölt (a kézit nem írja felül).
  function fillReceiptNumbers(
    rowId: string,
    year: number,
    next: { keruleti: string; gyulekezeti: string },
    onlyKeruleti: boolean,
  ) {
    setIncomeRows((cur) => {
      // KÖTEGEN-BELÜLI növekmény: a DB nem tud a még nem mentett sorokról, ezért a következő
      // számot a köteg többi sorához is igazítjuk (1,2,3… ne legyen mind ugyanaz).
      const nextOf = (field: 'iratszam' | 'gyulekezetiSzam', dbVal: string): string => {
        let maxNum = 0
        let width = 0
        for (const x of cur) {
          if (x.id === rowId) continue
          const m = String(x[field] || '').match(/(\d+)/)
          if (m) { const n = parseInt(m[1], 10); if (n >= maxNum) { maxNum = n; width = m[1].length } }
        }
        if (maxNum > 0) return width > 0 ? String(maxNum + 1).padStart(width, '0') : String(maxNum + 1)
        return dbVal // nincs köteg-előzmény → a DB szerinti következő (vagy üres)
      }
      const ker = nextOf('iratszam', next.keruleti)
      // Gyülekezeti alap: ha erre az évre már döntöttünk (gyulStartRef), abból; különben a DB szerinti.
      const decided = gyulStartRef.current?.year === year ? gyulStartRef.current : null
      const gyulBase = decided ? String(decided.start).padStart(decided.width, '0') : next.gyulekezeti
      const gyul = nextOf('gyulekezetiSzam', gyulBase)
      return cur.map((row) => {
        // J3: NEM ellenőrizzük újra a docType-ot (a handleDocTypeChange már value==='Chitanță'-val
        // hívott) — a `cur.docType` async-versenyhelyzete némán eldobta a fill-t. Csak az id számít.
        if (row.id !== rowId) return row
        const patch: Partial<EntryRow> = {}
        if (ker && !row.iratszam.trim()) patch.iratszam = ker
        if (!onlyKeruleti && gyul && !row.gyulekezetiSzam.trim()) patch.gyulekezetiSzam = gyul
        return Object.keys(patch).length ? { ...row, ...patch } : row
      })
    })
  }

  function handleDocTypeChange(r: EntryRow, value: string) {
    // Az irattípust AZONNAL beállítjuk (a vezérelt select ne ugorjon vissza a hálózati lekérés alatt).
    updateRow(r.id, { docType: value })
    const needsFill = !r.iratszam.trim() || !r.gyulekezetiSzam.trim()
    if (tab === 'income' && value === 'Chitanță' && onGetNextReceiptNumbers && needsFill) {
      // A gyülekezeti sorszám a NAPTÁRI évhez (datum) kötődik — nem a „melyik évre" mezőhöz.
      const year = Number(parseFlexibleDate(r.datum)?.slice(0, 4)) || currentYear
      void onGetNextReceiptNumbers(year)
        .then((next) => {
          if (!next) return
          const decided = gyulStartRef.current?.year === year
          // ÚJ ÉV + még nincs döntés → felugró kérdés a gyülekezeti kezdetről. J2: a gyülekezetit
          // MOST IS kitöltjük az ajánlott folytatással (ne maradjon üres), és beállítjuk a
          // gyulStartRef-et, hogy a TÖBBI sor ne kérdezzen újra — a panel csak FELÜLÍRÁSRA szolgál.
          if (next.ujEv && !decided) {
            setNewYearPrompt({ year, rowId: r.id, tavalyiEv: next.tavalyiEv, tavalyiUtolso: next.tavalyiUtolso || '0', ajanlott: next.gyulekezeti })
            const digits = (next.gyulekezeti || '').replace(/\D/g, '')
            gyulStartRef.current = { year, start: Number(digits) || 1, width: digits.length || 1 }
            fillReceiptNumbers(r.id, year, next, false)
            return
          }
          fillReceiptNumbers(r.id, year, next, false)
        })
        .catch(() => onToast('error', 'A következő nyugtaszámot nem sikerült lekérni — írd be kézzel.'))
    }
  }

  // #2: az új-évi kérdésre adott válasz — beállítja a gyülekezeti kezdőszámot erre az évre,
  // kitölti a kiváltó sort; a további Chitanță-sorok ebből nőnek tovább (nextOf).
  function decideNewYear(start: number, width: number) {
    const p = newYearPrompt
    if (!p || !(start > 0)) return
    gyulStartRef.current = { year: p.year, start, width }
    const filled = String(start).padStart(width, '0')
    // FELÜLÍRJUK a kiváltó sor gyülekezeti számát (a J2 már beírta az ajánlott folytatást; a
    // felhasználó most explicit mást választhat — pl. „1-től"), ezért nem nézzük az ürességet.
    setIncomeRows((cur) => cur.map((row) =>
      row.id === p.rowId ? { ...row, gyulekezetiSzam: filled } : row,
    ))
    setNewYearPrompt(null)
    setCustomStart('')
  }

  // #4: a Családi nyugta tagjait a sor befizető-almenüjéhez (people[]) FŰZZÜK — EGY nyugta,
  // tagonként saját összeggel/évvel. (A korábbi „külön sorra bontás" megszűnt: a sor MAGA a nyugta;
  // a kerületi iratszám csak mentéskor kap /N utótagot a UNIQUE index miatt, a gyülekezeti szám közös.)
  function handleFamilyConfirm(members: CombinedFamilyMember[]) {
    const rowId = familyPickerRowId
    setFamilyPickerRowId(null)
    if (!rowId || members.length === 0) return
    appendPayers(rowId, members.map((m) => ({ id: m.id, name: m.name })))
    // az almenü maradjon NYITVA — itt tölti a felhasználó az összegeket befizetőnként.
    setCollapsedPayerRows((s) => { if (!s.has(rowId)) return s; const n = new Set(s); n.delete(rowId); return n })
    onToast('success', 'Családtagok hozzáadva — töltsd ki az összegeket befizetőnként az almenüben.')
  }

  // Okos „Család csatolása": ha a sorban MÁR ki van választva egy regisztrált tag, annak a
  // CSALÁDJÁT oldjuk fel és tesszük az almenübe (ablak nélkül). Ha nincs kiválasztott tag (üres a
  // mező) vagy nincs család, a család-kereső ABLAKra esünk vissza.
  function handleFamilyClick(rowId: string) {
    const r = incomeRows.find((x) => x.id === rowId)
    const linked = r?.people?.find((p) => p.id != null)
    if (linked?.id != null && onGetFamilyMembersForPerson) {
      void onGetFamilyMembersForPerson(linked.id)
        .then((members) => {
          if (members && members.length > 0) {
            appendPayers(rowId, members.map((m) => ({ id: m.id, name: m.name })))
            setCollapsedPayerRows((s) => { if (!s.has(rowId)) return s; const n = new Set(s); n.delete(rowId); return n })
            onToast('success', `${linked.name} családja az almenübe került — töltsd ki az összegeket.`)
          } else {
            onToast('error', 'Ehhez a személyhez nincs rögzített család — keresd ki kézzel.')
            setFamilyPickerRowId(rowId)
          }
        })
        .catch(() => setFamilyPickerRowId(rowId))
    } else {
      // Üres mező → a megszokott család-kereső ablak.
      setFamilyPickerRowId(rowId)
    }
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
      // #4: EGY nyugta, több befizető. Ha vannak befizetők (people[]), tagonként KÜLÖN
      // befizetés keletkezik — KÖZÖS nyugtaszámmal (gyülekezeti = nyugta), közös irattípussal +
      // jogcímmel, de PER-TAG összeggel + évvel + személlyel. A kerületi iratszám csak több
      // (összeg>0) befizetőnél kap /N utótagot (a készpénzes iratszámra UNIQUE index van); egy
      // befizetőnél csupasz szám. People nélkül: a klasszikus szabad-szöveges egyszemélyes sor.
      const people = r.people ?? []
      const commonNyugta = r.gyulekezetiSzam.trim() || null
      const commonMegj = r.megjegyzes.trim() || null
      if (people.length >= 1) {
        const validPayers = people.filter((p) => Number(p.osszeg) > 0)
        const multi = validPayers.length > 1
        const base = combinedIratszam(r)
        validPayers.forEach((p, i) => {
          incomeBatch.push({
            datum, id_befizetescel: Number(r.categoryId),
            // minor-fix: NE az árva keresőpuffert (r.partner) használjuk fallbacknek — az egy
            // másik, be nem véglegesített gépelés lehet; csak a befizető saját neve vagy null.
            forrasa: p.name.trim() || null,
            osszeg: Number(p.osszeg),
            iratszam: base ? (multi ? `${base}/${i + 1}` : base) : null,
            irattipus: 'Készpénz',
            nyugta: commonNyugta,
            fizetettev: Number(p.evre) || Number(r.evre) || Number(datum.slice(0, 4)) || currentYear,
            megjegyzes: commonMegj,
            id_szemely: p.id,
            id_csalad: null,
          })
        })
      } else {
        incomeBatch.push({
          datum, id_befizetescel: Number(r.categoryId),
          forrasa: r.partner.trim() || null,
          osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: 'Készpénz',
          nyugta: commonNyugta,
          fizetettev: Number(r.evre) || Number(datum.slice(0, 4)) || currentYear,
          megjegyzes: commonMegj,
          id_szemely: null, id_csalad: null,
        })
      }
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

  // #3: Enter → a sor KÖVETKEZŐ mezőjére ugrik (gyorsabb tömeges bevitel). A naptár-választót
  // (type=date) és a textareát kihagyjuk; csak a soron belüli látható input/select mezők számítanak.
  function focusNextField(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter') return
    const target = e.target as HTMLElement
    if (target.tagName === 'TEXTAREA') return
    const container = target.closest('tr, [data-entry-card]')
    if (!container) return
    const fields = Array.from(
      container.querySelectorAll<HTMLElement>('input:not([disabled]):not([type="date"]), select:not([disabled])'),
    ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0)
    const idx = fields.indexOf(target)
    if (idx >= 0 && idx < fields.length - 1) {
      e.preventDefault()
      fields[idx + 1].focus()
    }
  }

  return (
    <div className="space-y-4">
      {/* #2: irattípus-autocomplete — egy betűre is felajánlja az alternatívákat (gépelhető). */}
      <datalist id="combined-doctypes">
        {DOC_TYPES.map((t) => (<option key={t} value={t} />))}
      </datalist>
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

      {/* #2 — Új-évi nyugtaszám kérdés (a Chitanță első nyugtájánál, ha új naptári év indul) */}
      {newYearPrompt && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
          <div className="font-semibold">
            Új év ({newYearPrompt.year}) — hogyan induljon a gyülekezeti nyugtaszám?
          </div>
          {newYearPrompt.tavalyiEv && newYearPrompt.tavalyiUtolso !== '0' && (
            <div className="mt-0.5 text-xs text-sky-700/80">
              {newYearPrompt.tavalyiEv}-ben az utolsó gyülekezeti szám: <strong>{newYearPrompt.tavalyiUtolso}</strong>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => decideNewYear(1, 1)}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
            >
              1-től induljon
            </button>
            <button
              type="button"
              onClick={() => decideNewYear(Number(newYearPrompt.ajanlott.replace(/\D/g, '')) || 1, newYearPrompt.ajanlott.replace(/\D/g, '').length || 1)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700"
            >
              Folytatás — {newYearPrompt.ajanlott}-tól
            </button>
            <span className="text-xs text-sky-700/80">vagy saját számtól:</span>
            <input
              type="number"
              min={1}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              placeholder="szám"
              className="h-8 w-24 rounded-md border border-sky-300 bg-white px-2 text-sm text-sky-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
            />
            <button
              type="button"
              onClick={() => { const t = customStart.trim(); const n = Number(t); if (n > 0) decideNewYear(n, t.length) }}
              disabled={!(Number(customStart) > 0)}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:opacity-40"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => { setNewYearPrompt(null); setCustomStart('') }}
              className="ml-auto rounded-lg px-2 py-1.5 text-xs font-medium text-sky-700/70 transition hover:bg-sky-100"
              title="Most nem döntök — kézzel beírom a gyülekezeti számot"
            >
              Később
            </button>
          </div>
        </div>
      )}

      {/* Nagy képernyő: táblázat */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Dátum</th>
              <th className="px-2 py-2 text-left">Irattípus</th>
              {(tab === 'expense' || showIncomeReceiptCols) && (
                <th className="px-2 py-2 text-left">{tab === 'income' ? 'Kerületi sz.' : 'Irat sz.'}</th>
              )}
              {showIncomeReceiptCols && <th className="px-2 py-2 text-left">Irat sz.</th>}
              <th className="px-2 py-2 text-left">Jogcím</th>
              <th className="px-2 py-2 text-left">{partnerLabel}</th>
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
                <tr key={r.id} className="border-t border-slate-100 align-top" onKeyDown={focusNextField}>
                  <td className="px-2 py-1.5 w-[160px]">
                    {renderDateField(r)}
                    {dWarn && <div className="mt-0.5 text-[10px] leading-tight text-amber-600">⚠ {dWarn}</div>}
                  </td>
                  <td className="px-2 py-1.5 w-[130px]">
                    <input
                      className={inputClass}
                      list="combined-doctypes"
                      value={r.docType}
                      disabled={!!dir}
                      placeholder="írd vagy válaszd"
                      onChange={(e) => void handleDocTypeChange(r, e.target.value)}
                    />
                  </td>
                  {(tab === 'expense' || showIncomeReceiptCols) && (
                    <td className="px-2 py-1.5 w-[100px]">
                      {dir || (tab === 'income' && !isChitanta) ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <>
                          <input
                            className={`${inputClass} ${rWarn ? 'border-red-400' : ''}`}
                            value={r.iratszam}
                            placeholder={tab === 'income' ? 'auto — 1. nyugtánál írd be' : undefined}
                            title={tab === 'income' ? 'Kerületi (nyomdai) szám — a kerülettől kapott szám. Automatikusan az utolsó + 1; az ELSŐ nyugtánál (nincs előzmény) írd be a kezdő számot, utána magától lép.' : undefined}
                            onChange={(e) => updateRow(r.id, { iratszam: e.target.value })}
                            onBlur={() => checkRowDuplicate(r)}
                          />
                          {rWarn && <div className="mt-0.5 text-[10px] leading-tight text-red-600">⚠ {rWarn}</div>}
                        </>
                      )}
                    </td>
                  )}
                  {showIncomeReceiptCols && (
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
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                    {renderBankSelect(r)}
                  </td>
                  <td className="px-2 py-1.5">
                    {dir ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <PartnerCell
                        row={r}
                        mode={tab}
                        searchable={tab === 'income' ? !!onSearchMembers : !!onSearchExpensePartners}
                        onSearchMembers={onSearchMembers}
                        onSearchExpense={onSearchExpensePartners}
                        onOpenFamily={
                          tab === 'income' && onSearchFamilies && onGetFamilyMembers
                            ? () => handleFamilyClick(r.id)
                            : undefined
                        }
                        updateRow={updateRow}
                        expanded={!collapsedPayerRows.has(r.id)}
                        onToggleExpand={() => togglePayerRow(r.id)}
                        appendPayers={appendPayers}
                        addEmptyPayer={addEmptyPayer}
                        updatePayer={updatePayer}
                        removePayer={removePayer}
                      />
                    )}
                  </td>
                  {tab === 'income' && (
                    <td className="px-2 py-1.5 w-[90px]">
                      {dir ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (r.people?.length ?? 0) >= 2 ? (
                        <span className="text-[11px] text-slate-400" title="Befizetőnként külön év — az almenüben">tagonként</span>
                      ) : (
                        <input
                          className={inputClass + ' text-center'}
                          type="number"
                          inputMode="numeric"
                          value={evreOf(r)}
                          placeholder={String(currentYear)}
                          title="Melyik évre szól a befizetés (visszamenőleges járulék is)"
                          onChange={(e) => setEvreOf(r, e.target.value)}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5 w-[120px]">
                    {tab === 'income' && (r.people?.length ?? 0) >= 2 ? (
                      <div className="flex h-9 items-center justify-end rounded-md border border-emerald-200 bg-emerald-50/60 px-2 text-sm font-semibold tabular-nums text-emerald-900" title="A befizetők összegeinek összege (automatikus)">
                        {formatRon(payerSum(r))}
                      </div>
                    ) : (
                      <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={amountOf(r)} onChange={(e) => setAmountOf(r, e.target.value)} />
                    )}
                  </td>
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
            <div key={r.id} data-entry-card className="rounded-xl border border-slate-200 bg-white p-3" onKeyDown={focusNextField}>
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
                  {tab === 'income' && (r.people?.length ?? 0) >= 2 ? (
                    <div className="flex h-9 items-center justify-end rounded-md border border-emerald-200 bg-emerald-50/60 px-2 text-sm font-semibold tabular-nums text-emerald-900" title="A befizetők összegeinek összege (automatikus)">{formatRon(payerSum(r))}</div>
                  ) : (
                    <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={amountOf(r)} onChange={(e) => setAmountOf(r, e.target.value)} />
                  )}
                </label>
                {tab === 'income' && !dir && (r.people?.length ?? 0) < 2 && (
                  <label className="text-xs text-slate-500">Melyik évre
                    <input className={inputClass} type="number" inputMode="numeric" value={evreOf(r)} placeholder={String(currentYear)} onChange={(e) => setEvreOf(r, e.target.value)} />
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
                        onSearchExpense={onSearchExpensePartners}
                        onOpenFamily={
                          tab === 'income' && onSearchFamilies && onGetFamilyMembers
                            ? () => handleFamilyClick(r.id)
                            : undefined
                        }
                        updateRow={updateRow}
                        expanded={!collapsedPayerRows.has(r.id)}
                        onToggleExpand={() => togglePayerRow(r.id)}
                        appendPayers={appendPayers}
                        addEmptyPayer={addEmptyPayer}
                        updatePayer={updatePayer}
                        removePayer={removePayer}
                      />
                    </label>
                    <label className="text-xs text-slate-500">Irattípus
                      <input
                        className={inputClass}
                        list="combined-doctypes"
                        value={r.docType}
                        placeholder="írd vagy válaszd"
                        onChange={(e) => void handleDocTypeChange(r, e.target.value)}
                      />
                    </label>
                    {(tab === 'expense' || isChitanta) && (
                      <label className="text-xs text-slate-500">{tab === 'income' ? 'Kerületi sz.' : 'Irat sz.'}
                        <input
                          className={`${inputClass} ${rWarn ? 'border-red-400' : ''}`}
                          value={r.iratszam}
                          placeholder={tab === 'income' ? 'auto — 1. nyugtánál írd be' : undefined}
                          onChange={(e) => updateRow(r.id, { iratszam: e.target.value })}
                          onBlur={() => checkRowDuplicate(r)}
                        />
                        {rWarn && <span className="mt-0.5 block text-[10px] leading-tight text-red-600">⚠ {rWarn}</span>}
                      </label>
                    )}
                    {tab === 'income' && isChitanta && (
                      <label className="text-xs text-slate-500">Irat sz.
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
              tmpl.gyulekezetiSzam && `Irat sz.: ${tmpl.gyulekezetiSzam}`,
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
  onSearchExpense,
  onOpenFamily,
  updateRow,
  expanded,
  onToggleExpand,
  appendPayers,
  addEmptyPayer,
  updatePayer,
  removePayer,
}: {
  row: EntryRow
  mode: 'income' | 'expense'
  searchable: boolean
  onSearchMembers?: (query: string) => Promise<CombinedMemberHit[]>
  onSearchExpense?: (query: string) => Promise<string[]>
  /** #5: ha megadva (bevétel), „Család csatolása" gomb — a tagokat a sor befizető-almenüjéhez fűzi. */
  onOpenFamily?: () => void
  updateRow: (id: string, patch: Partial<EntryRow>) => void
  /** #4: a befizető-almenü (people[] 2+) nyitva van-e + a chevron-váltás. */
  expanded: boolean
  onToggleExpand: () => void
  /** #4: befizetők hozzáfűzése / üres sor / mező-frissítés / törlés a sor almenüjén. */
  appendPayers: (rowId: string, additions: Array<{ id: number | null; name: string }>) => void
  addEmptyPayer: (rowId: string) => void
  updatePayer: (rowId: string, idx: number, patch: Partial<{ id: number | null; name: string; osszeg: string; evre: string }>) => void
  removePayer: (rowId: string, idx: number) => void
}) {
  // mode szerinti kereső-függvény: bevétel → tag-keresés; kiadás → korábbi partnerek (névlista).
  const searchFn = (query: string): Promise<CombinedMemberHit[]> =>
    mode === 'income'
      ? (onSearchMembers ? onSearchMembers(query) : Promise.resolve([]))
      : onSearchExpense
        ? onSearchExpense(query).then((names) => names.map((n, i) => ({ id: -1 - i, name: n })))
        : Promise.resolve([])

  if (!searchable) {
    return (
      <input
        className={inputClass}
        value={row.partner}
        onChange={(e) => updateRow(row.id, { partner: e.target.value })}
      />
    )
  }

  // #4 (Endre, 2026-06-21): EGY nyugta — több befizető. Minden befizető NEVE maga a kereső-mező
  // (ahová a nevet írod, ott keres és illeszt be — NINCS külön kereső-sor). 0/1 befizető → egy mező;
  // 2+ → lenyitható almenü, befizetőnként saját név(kereső) + összeg + év; a fősor összeg read-only summa.
  const people = row.people || []
  const subId = `payers-${row.id}`
  const sum = people.reduce((s, p) => s + (Number(p.osszeg) || 0), 0)
  const isMulti = mode === 'income' && people.length >= 2

  // ── Üres / egyszemélyes / kiadás: a befizető NEVE maga a kereső-mező ────────
  if (!isMulti) {
    const single = mode === 'income' && people.length === 1 ? people[0] : null
    return (
      <div className="relative space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <PayerNameSearch
              value={single ? single.name : row.partner}
              linked={!!single && single.id != null}
              onSearch={searchFn}
              placeholder={
                mode === 'income'
                  ? 'Befizető neve — itt keres a tagok közt (vagy szabad szöveg)'
                  : 'Cég/személy — itt keres a korábbiak közt (vagy szabad szöveg)'
              }
              onType={(t) => {
                if (single) updatePayer(row.id, 0, { name: t, id: null })
                else updateRow(row.id, { partner: t })
              }}
              onPick={(h) => {
                if (mode === 'expense') updateRow(row.id, { partner: h.name })
                else if (single) updatePayer(row.id, 0, { id: h.id, name: h.name })
                else appendPayers(row.id, [{ id: h.id, name: h.name }])
              }}
            />
          </div>
          {single && (
            <button
              type="button"
              aria-label="Befizető leválasztása"
              title="Befizető leválasztása"
              className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              onClick={() => removePayer(row.id, 0)}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
        {mode === 'income' && (onOpenFamily || people.length >= 1) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {onOpenFamily && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onOpenFamily}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                title="Családi nyugta — a tagok a befizető-almenübe kerülnek (tagonként összeg)"
              >
                <Users className="size-3" /> Család csatolása
              </button>
            )}
            {people.length >= 1 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addEmptyPayer(row.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline"
                title="Még egy befizető ugyanarra a nyugtára (lenyitható almenü, tagonként összeg)"
              >
                <Plus className="size-3" /> Még egy befizető
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Többfizetős (2+): kártyás lenyitható almenü — minden sor NEVE maga a kereső ─────
  const preview =
    people.slice(0, 2).map((p) => p.name || '—').join(', ') + (people.length > 2 ? ` +${people.length - 2}` : '')
  const missing = people.some((p) => !(Number(p.osszeg) > 0))
  return (
    <div className="relative space-y-1.5">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-controls={subId}
        className="flex w-full items-center gap-2 rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50/60 px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:from-emerald-100"
      >
        <ChevronRight className={`size-4 shrink-0 text-emerald-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <Users className="size-3.5 shrink-0 text-emerald-600" />
        <span className="shrink-0 font-semibold text-emerald-900">{people.length} befizető</span>
        <span className="truncate text-emerald-700/60">{preview}</span>
        <span className="ml-auto shrink-0 font-semibold tabular-nums text-emerald-900">{formatRon(sum)} RON</span>
      </button>
      {expanded && (
        <div id={subId} className="overflow-visible rounded-lg border border-emerald-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_6rem_4.5rem_2rem] gap-2 border-b border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
            <span>Befizető (név = keresés)</span>
            <span className="text-right">Összeg</span>
            <span className="text-center">Év</span>
            <span></span>
          </div>
          {people.map((p, i) => {
            const zero = !(Number(p.osszeg) > 0)
            return (
              <div
                key={p.uid}
                className="grid grid-cols-[1fr_6rem_4.5rem_2rem] items-center gap-2 border-b border-slate-50 px-2.5 py-1 last:border-b-0"
              >
                <PayerNameSearch
                  value={p.name}
                  linked={p.id != null}
                  onSearch={searchFn}
                  placeholder="Név — itt keres"
                  onType={(t) => updatePayer(row.id, i, { name: t, id: null })}
                  onPick={(h) => updatePayer(row.id, i, { id: h.id, name: h.name })}
                />
                <input
                  className={`${inputClass} h-8 text-right tabular-nums ${zero ? 'border-amber-300 bg-amber-50/40' : ''}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={p.osszeg}
                  placeholder="0"
                  onChange={(e) => updatePayer(row.id, i, { osszeg: e.target.value })}
                />
                <input
                  className={inputClass + ' h-8 px-1 text-center'}
                  type="number"
                  inputMode="numeric"
                  value={p.evre}
                  onChange={(e) => updatePayer(row.id, i, { evre: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Befizető törlése"
                  className="flex h-8 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removePayer(row.id, i)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400">{people.length} befizető — egy nyugta</span>
            <span
              className={`text-xs font-bold tabular-nums ${missing ? 'text-amber-600' : 'text-emerald-800'}`}
              title={missing ? 'Van befizető összeg nélkül — az nem mentődik' : undefined}
            >
              Összesen: {formatRon(sum)} RON{missing ? ' ⚠' : ''}
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => addEmptyPayer(row.id)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline"
        >
          <Plus className="size-3" /> Még egy befizető
        </button>
        {onOpenFamily && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenFamily}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
          >
            <Users className="size-3" /> Család csatolása
          </button>
        )}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────
// PayerNameSearch — egyetlen befizető NEVE = kereső-mező.
//
// Ahová a felhasználó a nevet írja, ott azonnal keres a tagnyilvántartásban (debounce),
// és a találatból választva BEILLESZTI (linkeli) a tagot — nincs külön kereső-sor. A saját
// portál-dropdownja a `position:fixed` + getBoundingClientRect-tel a dialóg overflow-ján is
// kilátszik; a rejtett breakpoint (táblázat⇄mobil) inputját az isElementVisible kiszűri.
// `linked` = regisztrált tag van hozzárendelve (id != null) → zöld jelölés + nem keres tovább.
// ─────────────────────────────────────────────────────────────────────────
function PayerNameSearch({
  value,
  linked,
  onType,
  onPick,
  onSearch,
  placeholder,
}: {
  value: string
  linked: boolean
  onType: (text: string) => void
  onPick: (hit: CombinedMemberHit) => void
  onSearch: (query: string) => Promise<CombinedMemberHit[]>
  placeholder: string
}) {
  const [hits, setHits] = useState<CombinedMemberHit[]>([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  // #3-fix: a kiválasztás (onPick) után a value a kiválasztott névre vált — ez NE indítson
  // azonnal új keresést (különben a lista visszanyílna, főleg kiadásnál, ahol nincs `linked`).
  const justPickedRef = useRef(false)
  const [dropRect, setDropRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const measure = () => {
    const el = inputRef.current
    if (!isElementVisible(el)) { setDropRect(null); return }
    const r = el!.getBoundingClientRect()
    setDropRect({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  useEffect(() => {
    if (!open) return
    measure()
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits])

  // Keresés gépeléskor — kiválasztott (linked) tagnál NEM keresünk (az már beillesztve).
  useEffect(() => {
    if (linked) { setHits([]); setOpen(false); return }
    if (justPickedRef.current) { justPickedRef.current = false; return } // friss kiválasztás → ne nyisson vissza
    const q = value.trim()
    if (q.length < 2) { setHits([]); setOpen(false); return }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      if (!isElementVisible(inputRef.current)) return // rejtett breakpoint ne keressen
      void onSearch(q)
        .then((res) => { setHits(res.slice(0, 8)); setOpen(res.length > 0) })
        .catch(() => { setHits([]); setOpen(false) })
    }, 300)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, linked])

  return (
    <div className="relative flex items-center gap-1.5">
      {linked && (
        <span
          className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
          title="Regisztrált tag hozzárendelve"
        />
      )}
      <input
        ref={inputRef}
        className={inputClass + ' h-8' + (linked ? ' border-emerald-300 bg-emerald-50/50 font-medium text-emerald-900' : '')}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => hits.length > 0 && setOpen(true)}
      />
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
                onClick={() => { justPickedRef.current = true; onPick(h); setHits([]); setOpen(false) }}
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
