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
 * „Több évre fizet" (2026-08-15, Endre 23. pont): egyházfenntartói járulék
 * jogcímen EGY regisztrált befizető TÖBB ÉVRE is fizethet egyszerre —
 * év-választó chipek (az utolsó ~10 év), évenként automatikusan előtöltött,
 * szerkeszthető összeggel. A megvalósítás a people[] almenü-modellre épül
 * (év = bejegyzés ugyanazzal a taggal), így a mentés a meglévő úton megy:
 * évenként külön befizetés-sor, helyes fizetettev-vel, közös nyugtaszámmal.
 *
 * Mobil-barát: kis/közepes képernyőn kártyák (nincs oldalirányú görgetés).
 */

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Save, Trash2, ArrowLeftRight, Users, ChevronRight, TrendingUp, TrendingDown, Boxes, AlertTriangle, CalendarRange, Loader2 } from 'lucide-react'
import { keszpenzKorlatFigyelmeztetesek, type KeszpenzTetel } from '@kartoteka/core'
import { localTodayIso } from '@kartoteka/validations'
import { formatRon } from './ron-in-words'
import { parseFlexibleDate } from './date-parse'
import { inventoryKategoriaForExpenseKod } from './helpers'
import { INVENTORY_AMORTIZATION_CATALOG, getInventoryAmortizationCatalogEntry } from './inventory'
import { SearchableSelect } from './SearchableSelect'
import {
  FamilyReceiptModal,
  type CombinedFamilyHit,
  type CombinedFamilyMember,
} from './FamilyReceiptModal'
import type { IncomeCategory, SaveIncomeBatchRow } from './IncomeDialogBody'
import type { ExpenseCategory, ExpenseInventoryIntake, SaveExpenseBatchRow } from './ExpenseDialogBody'

export type CombinedToastFn = (type: 'success' | 'error' | 'warning', message: string) => void

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

/**
 * 2026-08-22 (5. pont / 5a): a befizető-találat FAJTÁJA.
 *
 * Gyülekezeti szinten a befizető SZEMÉLY; felső szinten viszont JOGI SZEMÉLY:
 * az egyházmegyébe a GYÜLEKEZETEK fizetnek, az egyházkerületbe az
 * EGYHÁZMEGYÉK. A `lelkesz` a megyei listában szereplő lelkipásztor (illetve a
 * kerületi listában az esperes) — ő SZEMÉLY, de NEM gyülekezeti tag, ezért
 * külön csoportba kerül, és FK-t sem kap (Endre D5 döntése: elég a `forrasa`
 * szabad szöveg).
 */
export type CombinedPartnerKind = 'szemely' | 'gyulekezet' | 'lelkesz' | 'egyhazmegye'

/** Tag-találat a Befizető-keresőhöz (B1, 2026-06-11). */
export interface CombinedMemberHit {
  id: number
  name: string
  /** Részletes másodlagos sor a találati listában (pl. „Brateș · Fő u. 12"). */
  detail?: string
  /** #Endre 2026-07-01: a befizető életkora (teljes évek) — a találati sorban badge-ként. */
  age?: number
  /** Születési év (ha van) — a badge tooltipjéhez / másodlagos infóhoz. */
  birthYear?: string
  /**
   * 2026-08-22 (5a): a találat fajtája. HIÁNYA = `'szemely'` — a gyülekezeti
   * kereső és a kiadás-partner autocomplete NEM tölti ki, így azok látványa
   * és viselkedése BYTE-AZONOS marad (a csoport-fejlécek is csak akkor
   * jelennek meg, ha van nem-személy találat).
   */
  kind?: CombinedPartnerKind
  /**
   * 2026-08-22 (5a): a felső szintű partner UUID-ja (gyülekezet / egyházmegye).
   * Ez lesz a mentett bevételi sor VALÓDI FK-ja — a szerver a saját hatókörére
   * visszaellenőrzi (a kliens-prop önmagában nem bizonyíték).
   */
  refId?: string
}

/**
 * 2026-08-22 (5a): a mentendő bevételi sor + a FELSŐ SZINTŰ befizető-partner.
 *
 * MIÉRT KITERJESZTÉS és nem a `SaveIncomeBatchRow` átírása: azt a típust a
 * gyülekezeti IncomeDialogBody is használja, és a két mező OPCIONÁLIS — így a
 * desktop hívó (`apps/desktop`) és a gyülekezeti web-út egyaránt változatlan
 * marad. A szerver a `befizeto_scope_id`-t a SAJÁT hatókörére visszaellenőrzi;
 * hatókörön kívüli azonosítónál a sor FK nélkül, a mai alakban mentődik.
 */
export interface CombinedIncomeBatchRow extends SaveIncomeBatchRow {
  /** A kiválasztott felső szintű partner UUID-ja (gyülekezet / egyházmegye). */
  befizeto_scope_id?: string | null
  /** A partner fajtája — a szerver ebből tudja, MELYIK FK-oszlopot töltheti. */
  befizeto_kind?: CombinedPartnerKind | null
}

/** A találati csoportok magyar fejlécei (a felső szintű, csoportosított listához). */
const PARTNER_CSOPORT_FELIRAT: Record<CombinedPartnerKind, string> = {
  szemely: 'Gyülekezeti tagok',
  gyulekezet: 'Gyülekezetek',
  lelkesz: 'Lelkipásztorok',
  egyhazmegye: 'Egyházmegyék',
}

/** A csoportok MEGJELENÍTÉSI SORRENDJE a találati listában. */
const PARTNER_CSOPORT_SORREND: CombinedPartnerKind[] = ['gyulekezet', 'egyhazmegye', 'lelkesz', 'szemely']

/**
 * Egy találatból a befizető-bejegyzés mezői.
 *
 * ⚠️ A SZEMÉLY-FK (`id`) CSAK VALÓDI SZEMÉLYNÉL marad kitöltve. A felső szintű
 *    találatok azonosítója NEGATÍV ál-szám (listakulcs), ami `id_szemely`-ként
 *    idegen kulcs-hibát adna — ezért ott `id: null`, és a partner a `refId`-ben
 *    utazik. (A szerver a felső szintű ágon amúgy is nullázza az `id_szemely`-t;
 *    ez az öv-és-nadrágtartó a kliens oldalon: így a járulék-ajánló sem indul el
 *    egy nem létező személy-azonosítóra.)
 */
function payerFromHit(h: CombinedMemberHit): { id: number | null; name: string; refId: string | null; kind: CombinedPartnerKind; kor: number | null; lakhely: string | null } {
  const kind = h.kind ?? 'szemely'
  return {
    id: kind === 'szemely' ? h.id : null,
    name: h.name,
    refId: kind === 'szemely' ? null : (h.refId ?? null),
    kind,
    // 2026-08-29 (Endre): életkor + lakhely a kiválasztott befizető alá.
    kor: kind === 'szemely' ? (h.age ?? null) : null,
    lakhely: h.detail ?? null,
  }
}

/** Teljes években vett életkor a születési dátumból — a família-úton érkező tagokhoz. */
function korSzDatumbol(szDatum: string | null | undefined): number | null {
  if (!szDatum) return null
  const b = new Date(String(szDatum))
  if (Number.isNaN(b.getTime())) return null
  const most = new Date()
  let kor = most.getFullYear() - b.getFullYear()
  const m = most.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && most.getDate() < b.getDate())) kor--
  return kor >= 0 && kor < 130 ? kor : null
}

/** A beillesztett befizető azonosító-sora: „68 éves · Székelyudvarhely". */
function payerInfoText(p: PayerLike): string {
  if (p.id == null && !p.refId) return ''
  return [p.kor != null ? `${p.kor} éves` : null, (p.lakhely || '').trim() || null].filter(Boolean).join(' · ')
}

export interface CombinedEntryBodyProps {
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  bankAccounts: CombinedBankAccount[]
  currentYear: number
  onSaveIncomeBatch: (rows: CombinedIncomeBatchRow[]) => Promise<{ error?: string | null }>
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
   * 2026-08-27 (Endre 8. kérése): hasonló (esetleg duplikált) banki tétel keresése
   * MENTÉS ELŐTT. Ha talál, megerősítést kérünk — de NEM blokkolunk.
   * Ha a gazda nem adja meg, a rögzítés viselkedése VÁLTOZATLAN.
   */
  onCheckSimilarEntries?: (
    sorok: Array<{ rowId: string; type: 'income' | 'expense'; datum: string; osszeg: number; nev: string }>,
  ) => Promise<Array<{
    rowId: string
    datum: string
    osszeg: number
    nev: string
    iratszam: string | null
    hasonlosag: number
    napEltres: number
  }>>
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
  onGetExpectedJarulek?: (personId: number, year: number, prospectiveDateIso?: string) => Promise<{ expected: number; paid: number; debt: number; hasBase?: boolean; szabalyok?: string[] } | null>
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
  /**
   * 2026-08-09 (Endre): pénzügy→leltár híd. Ha true, a KIADÁS fülön a
   * leltár-köteles jogcímeknél (205.01 Új beruházások / 201.12 Kis értékű
   * leltári tárgyak) automatikusan felajánljuk a „Leltárba vétel" al-űrlapot,
   * és a mentés a kiadással együtt leltári tételt is rögzít. Csak gyülekezeti
   * módban kapcsolható be (a wrapper dönti el); desktopon egyelőre nincs
   * bekötve (a leltár ott csak olvasható tükör).
   */
  offerExpenseInventory?: boolean
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
  /** 2026-08-22 (5a): `refId`+`kind` — felső szintű (jogi személy) befizetőnél a
   *  valódi partner-azonosító. Személynél `refId: null`, `kind: 'szemely'`. */
  people: Array<{
    uid: string
    id: number | null
    name: string
    osszeg: string
    evre: string
    refId?: string | null
    kind?: CombinedPartnerKind
    /** 2026-08-29 (Endre): a kiválasztáskor ismert életkor + lakhely — a beillesztett
     *  (linkelt) befizető alatt kiírjuk, hogy azonos nevűeknél is látszódjon, KI ő. */
    kor?: number | null
    lakhely?: string | null
  }>
  /** Legacy (B1) — már a people[] váltja ki; csak régi vázlat visszaállításához tartjuk meg. */
  szemelyId?: number | null
  csaladId?: number | null
  /** 2026-08-09: a kiadás-sor „Leltárba vétel" al-űrlapjának állapota (csak kiadás-fül,
   *  leltár-köteles jogcímnél; undefined = még nem nyúlt hozzá → alapból BEKAPCSOLVA). */
  inventory?: RowInventoryState
}

/** 2026-08-09: a „Leltárba vétel" al-űrlap sor-szintű állapota. */
type RowInventoryState = {
  enabled: boolean
  megnevezes: string
  kategoria: string
  katalogusKod: string
  hasznalatiIdo: string
  helyszin: string
  felelos: string
}

const defaultRowInventory = (suggested: 'alapeszkoz' | 'csekely'): RowInventoryState => ({
  enabled: true,
  megnevezes: '',
  kategoria: suggested,
  katalogusKod: '',
  hasznalatiIdo: '',
  helyszin: '',
  felelos: '',
})

/** A leltári kategória-választó opciói (a webes inventory.next címkéivel egyezően). */
const INTAKE_CATEGORY_OPTIONS = [
  { value: 'alapeszkoz', label: 'Alapeszközök' },
  { value: 'csekely', label: 'Csekély értékű leltári tárgyak' },
  { value: 'konyv', label: 'Könyvek' },
  { value: 'kegyszer', label: 'Kegyszerek' },
  { value: 'telek', label: 'Telkek, földek, erdők' },
  { value: 'karpotlasi', label: 'Kárpótlási jegyek és részvények' },
  { value: 'bizomanyi', label: 'Bizományi' },
] as const

const todayIso = () => localTodayIso()
// 2026-08-14 (13. pont): az új sor alapértelmezett dátuma a NÉZETT pénzügyi
// évhez igazodik. Korábban mindig a MAI nap volt — ha a lelkész egy KORÁBBI
// évet nézett (visszamenőleges könyvelés), a mentett tétel a folyó évhez
// könyvelődött, és „eltűnt" a nézett listáról. Más évnél az év utolsó napja
// az alap (a napot úgyis a bizonylathoz igazítja a rögzítő), és a dateWarning
// külön is jelzi az év-eltérést.
const newRow = (year?: number): EntryRow => ({
  id: crypto.randomUUID(),
  datum: year != null && year !== new Date().getFullYear() ? `${year}-12-31` : todayIso(),
  categoryId: '', partner: '', docType: '', iratszam: '', gyulekezetiSzam: '', amount: '', megjegyzes: '', bankId: '',
  evre: year != null ? String(year) : '',
  people: [],
})

// #4 (Endre, 2026-06-21): a fősor összege = a befizetők (people[]) összegeinek summája — ezt
// használjuk a read-only fő-összeghez (>=2 befizető) és az érvényesség-/total-számításhoz.
const payerSum = (r: EntryRow): number => (r.people ?? []).reduce((s, p) => s + (Number(p.osszeg) || 0), 0)

/** 2026-07-10 (S2-#1b): egy befizető sora a people[] listából — a hint-helperek közös típusa. */
type PayerLike = EntryRow['people'][number]

// ── 2026-08-30 (Endre jóváhagyott terve): befizető-MÁTRIX — több befizető × több év ──
// EGY nyugtán. Az adat marad a lapos people[]-modell (bejegyzés = (befizető, év, összeg));
// a mátrix CSAK nézet: sorok = befizetők (csoportok), oszlopok = évek. Így a mentés,
// a /N iratszám-utótag, a járulék-hint (uid-kulcsú!) és a vázlat-mentés érintetlen.
/** A befizető azonossága a mátrix-sorhoz: tag-id → jogi személy refId → normalizált név.
 *  Névtelen bejegyzés a SAJÁT uid-ját kapja — két üres, új sor sosem olvadhat össze. */
function payerKulcs(p: PayerLike): string {
  if (p.id != null) return `id:${p.id}`
  if (p.refId) return `ref:${p.refId}`
  const nev = (p.name || '').trim().toLowerCase()
  return nev ? `nev:${nev}` : `uid:${p.uid}`
}
/** Érvényes „melyik évre" érték — a mátrix minden bejegyzéstől megköveteli. */
function matrixEv(s: string | undefined): number | null {
  const y = Number((s ?? '').trim())
  return Number.isFinite(y) && y > 1900 ? y : null
}
type MatrixCsoport = {
  kulcs: string
  base: PayerLike
  cellak: Map<number, { p: PayerLike; idx: number }>
  /** A sor-példány SAJÁT bejegyzéseinek uid-jai — a csoport-műveletek (név-átírás, törlés)
   *  ERRE céloznak, nem a kulcsra: azonos kulcsú két sor-példánynál (pl. két azonos nevű
   *  befizető) egy művelet így CSAK a saját sorát érinti, a másikét nem. */
  uids: string[]
}
/** Csoportosítás mátrix-sorokká. Ütközésnél (ugyanaz a kulcs ugyanarra az évre kétszer)
 *  ÚJ sor-példány nyílik — bejegyzés SOSEM tűnhet el a nézetből. Az `idx` a people[]
 *  LAPOS indexe (az updatePayer/hint-lánc erre épül — nem szabad átszámozni). */
function matrixCsoportok(people: PayerLike[]): MatrixCsoport[] {
  const out: MatrixCsoport[] = []
  people.forEach((p, idx) => {
    const ev = matrixEv(p.evre)
    if (ev == null) return // a kapu (isMatrixActive) érvénytelen évnél a klasszikus listát mutatja
    const kulcs = payerKulcs(p)
    const nevtelen = kulcs.startsWith('uid:')
    let cs: MatrixCsoport | undefined
    if (nevtelen) {
      // Névtelenné vált bejegyzések (pl. a név törlése közben) NE essenek szét soronként:
      // az utolsó csoporthoz csatlakozik, ha az is névtelen és nincs még cellája erre az
      // évre — így a név visszagépelésekor a sor egyben újra-nevesíthető.
      const utolso = out[out.length - 1]
      if (utolso && utolso.kulcs.startsWith('uid:') && !utolso.cellak.has(ev)) cs = utolso
    } else {
      cs = out.find((c) => c.kulcs === kulcs && !c.cellak.has(ev))
    }
    if (!cs) {
      cs = { kulcs, base: p, cellak: new Map(), uids: [] }
      out.push(cs)
    }
    cs.cellak.set(ev, { p, idx })
    cs.uids.push(p.uid)
  })
  return out
}
/** A mátrix év-oszlopai növekvő sorrendben. */
function matrixEvek(people: PayerLike[]): number[] {
  return [...new Set(people.map((p) => matrixEv(p.evre)).filter((y): y is number => y != null))].sort((a, b) => a - b)
}

/** 2026-07-10 (S2-#1b): a tagra lekért éves járulék (a BEÁLLÍTOTT kedvezményekkel, a rögzítés
 *  dátuma szerint) — az összeg-mező melletti „Ajánlott összeg" jelzés adata. A reqKey a
 *  (tag, év, dátum) hármast kódolja: csak a JELENLEGI állapothoz tartozó hint jelenik meg. */
type JarulekHint = { reqKey: string; expected: number; paid: number; debt: number; hasBase: boolean;
  /** 2026-08-29 (Endre kérdése nyomán): MELYIK szabály árazta az összeget —
   *  pl. 'Időszaki kedvezmény (07-01)'. Üres = a teljes éves díj. */
  szabalyok: string[] }

/** 2026-08-15 (23. pont) + 2026-08-30 (mátrix): a „Több évre fizet" mód PartnerCell-propja.
 *  Csak egyházfenntartói járulék jogcímű bevétel-soron adjuk át; `active` = a befizető-mátrix
 *  látszik (sorok = befizetők, oszlopok = évek), különben a kapcsoló-pill jelenik meg. */
type MultiYearProps = {
  active: boolean
  /** A felajánlott év-chipek (az utolsó ~10 év) — a már kiválasztott évekkel uniózva jelenik meg. */
  yearChips: number[]
  onEnable: () => void
  /** Vissza az egy-éves módba: befizetőnként csak az ELSŐ év-bejegyzés marad meg. */
  onDisable: () => void
  /** Egy év oszlopa ki/be: hozzáadásnál MINDEN befizető kap egy üres cellát (az auto-kitöltés
   *  tölti az adott évi járulékkal); kivételnél az év MINDEN bejegyzése törlődik. */
  onToggleYear: (year: number) => void
  /** Egy mátrix-SOR-PÉLDÁNY bejegyzéseinek közös azonosság-mezői — uid-listára célzott
   *  (azonos kulcsú másik sor-példányt SOSEM érinthet). */
  onUpdateGroup: (uids: string[], patch: Partial<{ id: number | null; name: string; refId: string | null; kind: CombinedPartnerKind; kor: number | null; lakhely: string | null }>) => void
  /** Egy befizető sor-példányának eltávolítása — csak a SAJÁT bejegyzései (uid szerint). */
  onRemoveGroup: (uids: string[]) => void
  /** Üres cella kitöltése: új bejegyzés a csoport TELJES azonosságával az adott évre. */
  onAddCell: (base: PayerLike, year: number, osszeg: string) => void
  /** A felhasználó által kiürített cella jelölése (ures=true) / a jelölés törlése — az
   *  auto-kitöltés a jelölt cellába SOHA nem ír vissza („üres = arra az évre nem fizet"). */
  onCellaUrites: (uid: string, ures: boolean) => void
}

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
  onSearchMembers, onSearchExpensePartners, onCheckSimilarEntries,
  onSearchFamilies, onGetFamilyMembers, onGetFamilyMembersForPerson, onGetExpectedJarulek, onGetNextReceiptNumbers,
  onCheckReceiptDuplicate, onGetLastRecordedDate, draftStorageKey, offerExpenseInventory,
}: CombinedEntryBodyProps) {
  const [tab, setTab] = useState<'income' | 'expense'>('income')
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>(() => [newRow(currentYear)])
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>(() => [newRow(currentYear)])
  const [busy, setBusy] = useState(false)
  // P0-9 (audit 2026-08-28): szinkron újra-belépési zár a mentésre. A state
  // frissítése aszinkron, ezért a gyors dupla kattintást csak ref tudja fogni.
  const busyRef = useRef(false)
  // 2026-08-27 (8. kérés): a hasonló-tétel megerősítés állapota. A `megerositve`
  // egyszeri: a felhasználó „Igen, rögzítem" válasza után a mentés újraindul,
  // és a kapu átengedi. Új mentésnél (új sorokkal) újra kérdez.
  const [hasonloTalalatok, setHasonloTalalatok] = useState<Array<{
    rowId: string; datum: string; osszeg: number; nev: string
    iratszam: string | null; hasonlosag: number; napEltres: number
  }> | null>(null)
  const [hasonloMegerositve, setHasonloMegerositve] = useState(false)
  /** #5: a Családi nyugta tag-választó melyik SORHOZ van nyitva (null = zárva). */
  const [familyPickerRowId, setFamilyPickerRowId] = useState<string | null>(null)
  // 2026-08-29: a „Család csatolása" hálózati feloldása alatt a gomb pörög —
  // lassú kapcsolaton is látszik, hogy a rendszer dolgozik.
  const [familyLoadingRowId, setFamilyLoadingRowId] = useState<string | null>(null)
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
  // #Endre 2026-07-01 (perf): egy dialógus-megnyitásra ÉVENTE EGYSZER kérdezünk a szervertől a
  // következő nyugtaszámokért — a köteg-belüli léptetést a fillReceiptNumbers.nextOf kliens-oldalon
  // számolja, így N Chitanță-sor sem indít N szerver-hívást. (A ref a dialóg újramountolásakor ürül.)
  const receiptCacheRef = useRef<Map<number, ReturnType<NonNullable<typeof onGetNextReceiptNumbers>>>>(new Map())
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

  // ── 2026-08-30 (Endre kérése): FANTOM-SOR — mindig legyen alul egy üres új sor ──
  // Amint a felhasználó az utolsó sorba írni kezd, magától megjelenik a következő üres
  // sor — nem kell az „Új sor" gombra kattintani. A fantom-jelleghez a rowHasContent-nél
  // TÁGABB érintettség kell (a docType/gyulekezetiSzam gépelése is számítson), különben az
  // irattípussal kezdő felhasználó nem kapna új sort. Az üres sort a mentés (rowValidIn)
  // és a vázlat-mentés (rowHasContent) amúgy is átugorja, ezért mellékhatása nincs.
  const fantomErintett = (r: EntryRow) => rowHasContent(r) || !!r.docType.trim() || !!r.gyulekezetiSzam.trim()
  useEffect(() => {
    const rows = tab === 'income' ? incomeRows : expenseRows
    const utolso = rows[rows.length - 1]
    if (utolso && !fantomErintett(utolso)) return
    const setter = tab === 'income' ? setIncomeRows : setExpenseRows
    setter((cur) => {
      const u = cur[cur.length - 1]
      if (u && !fantomErintett(u)) return cur // közben már van üres sor a végén
      const r = newRow(currentYear)
      if (u?.datum) r.datum = u.datum // az új sor az előző dátumát örökli (mint az „Új sor" gomb)
      return [...cur, r]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, expenseRows, tab, currentYear])

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
            // 2026-08-30: a refId/kind (jogi személy partner-FK) is túléli a vázlatot — korábban
            // a migráció némán elejtette, és a felső szintű befizető FK nélkül mentődött volna.
            refId: typeof (p as { refId?: unknown }).refId === 'string' ? (p as { refId: string }).refId : null,
            kind: typeof (p as { kind?: unknown }).kind === 'string' ? ((p as { kind: string }).kind as CombinedPartnerKind) : 'szemely',
            kor: typeof (p as { kor?: unknown }).kor === 'number' ? (p as { kor: number }).kor : null,
            lakhely: typeof (p as { lakhely?: unknown }).lakhely === 'string' ? (p as { lakhely: string }).lakhely : null,
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
        // 2026-08-30 (mátrix-magvetés): a több-éves sor a VISSZAÁLLÍTOTT ADATBÓL éled fel —
        // itt (és csak itt) aktiválunk automatikusan, hogy élő gépelés közben a nézet sose
        // váltson át magától a kéz alól (az isMatrixActive a kapcsolóból olvas).
        const matrixMagok = inc
          .filter((r) => new Set((r.people ?? []).map((p) => matrixEv(p.evre)).filter((y) => y != null)).size >= 2)
          .map((r) => r.id)
        if (matrixMagok.length > 0) setMultiYearRowIds((s) => new Set([...s, ...matrixMagok]))
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

  // ── 2026-08-09: pénzügy→leltár híd — leltár-köteles kiadás-jogcím felismerése ──
  const invKategoriaForRow = (r: EntryRow): 'alapeszkoz' | 'csekely' | null => {
    if (!offerExpenseInventory || r.categoryId === '') return null
    return inventoryKategoriaForExpenseKod(expenseKod.get(Number(r.categoryId)))
  }
  const invOf = (r: EntryRow, suggested: 'alapeszkoz' | 'csekely'): RowInventoryState =>
    r.inventory ?? defaultRowInventory(suggested)

  /** A kiadás-sor alatti „Leltárba vétel" panel (asztali táblázat + mobil kártya közös). */
  function renderInventoryPanel(r: EntryRow, suggested: 'alapeszkoz' | 'csekely') {
    const inv = invOf(r, suggested)
    const kategoria = inv.kategoria || suggested
    const setInv = (patch: Partial<RowInventoryState>) =>
      updateRow(r.id, { inventory: { ...inv, ...patch } })
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
        <label className="flex items-start gap-2 text-sm font-medium text-amber-900">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-amber-300"
            checked={inv.enabled}
            onChange={(e) => setInv({ enabled: e.target.checked })}
          />
          <span>
            <Boxes className="mr-1 inline size-4 align-text-bottom" aria-hidden />
            Leltárba vétel — a mentés a kiadással együtt leltári tételt is rögzít
            <span className="block text-xs font-normal text-amber-700">
              Ez a jogcím ({suggested === 'alapeszkoz' ? '205.01 Új beruházások' : '201.12 Kis értékű leltári tárgyak'})
              leltár-köteles beszerzés — az összeg, a dátum és az irat száma automatikusan átkerül.
              Ha most nem szeretnéd, vedd ki a pipát.
            </span>
          </span>
        </label>
        {inv.enabled && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-amber-900">
              Tárgy megnevezése *
              <input
                className={inputClass}
                value={inv.megnevezes}
                placeholder={r.megjegyzes.trim() || 'pl. Laptop, irodai szék…'}
                onChange={(e) => setInv({ megnevezes: e.target.value })}
              />
            </label>
            <label className="text-xs text-amber-900">
              Leltári kategória
              <select
                className={inputClass}
                value={kategoria}
                onChange={(e) =>
                  setInv({
                    kategoria: e.target.value,
                    ...(e.target.value !== 'alapeszkoz' ? { katalogusKod: '', hasznalatiIdo: '' } : {}),
                  })
                }
              >
                {INTAKE_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {kategoria === 'alapeszkoz' && (
              <>
                <label className="text-xs text-amber-900">
                  Amortizációs katalóguskód
                  <select
                    className={inputClass}
                    value={inv.katalogusKod}
                    onChange={(e) => {
                      const entry = getInventoryAmortizationCatalogEntry(e.target.value)
                      setInv({
                        katalogusKod: e.target.value,
                        ...(entry ? { hasznalatiIdo: String(entry.defEv) } : {}),
                      })
                    }}
                  >
                    <option value="">Kézi beállítás</option>
                    {INVENTORY_AMORTIZATION_CATALOG.map((entry) => (
                      <option key={entry.kod} value={entry.kod}>{entry.kod} – {entry.nev}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-amber-900">
                  Használati idő (év)
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    step={1}
                    value={inv.hasznalatiIdo}
                    onChange={(e) => setInv({ hasznalatiIdo: e.target.value })}
                  />
                </label>
              </>
            )}
            <label className="text-xs text-amber-900">
              Helyszín
              <input className={inputClass} value={inv.helyszin} onChange={(e) => setInv({ helyszin: e.target.value })} />
            </label>
            <label className="text-xs text-amber-900">
              Felelős személy
              <input className={inputClass} value={inv.felelos} onChange={(e) => setInv({ felelos: e.target.value })} />
            </label>
          </div>
        )}
      </div>
    )
  }
  const belsoDir = (r: EntryRow) => dirFor(tab, r) // aktuális fül — a megjelenítéshez
  // (B) egyházfenntartói járulék jogcím-e (kód 101.01*) — az auto-összeghez (a szerveroldali
  // isChurchMaintenanceCode-dal egyezően).
  const isChurchMaintenance = (categoryId: number | ''): boolean => {
    if (categoryId === '') return false
    const kod = incomeKod.get(Number(categoryId))
    return typeof kod === 'string' && kod.startsWith('101.01')
  }

  // (B) AUTO-ÖSSZEG + AJÁNLOTT ÖSSZEG (2026-07-10, S2-#1b): ha egy bevétel-sor jogcíme
  // egyházfenntartói járulék ÉS a befizető regisztrált tag ÉS van év → lekérjük a tag adott évi
  // {expected, paid, debt} értékét a RÖGZÍTÉS DÁTUMÁVAL (így a beállított kedvezmények — korai-
  // fizetési ablak, kor, foglalkozás, felmentés — prospektíven érvényesülnek). Az eredményt
  // (1) ÜRES összeg-mezőbe beírjuk (auto-kitöltés, mint eddig), és (2) MINDIG eltároljuk
  // hint-ként → az összeg mellett „Ajánlott: X RON — átvesz" jelzés látszik; eltérő kézi összeg
  // NEM blokkolt (részletfizetés!), csak diszkrét jelzést kap. A reqKey a DÁTUMOT is tartalmazza:
  // dátum-váltáskor (kedvezmény-ablak határa!) újraszámol.
  const jarulekReqRef = useRef<Map<string, string>>(new Map()) // payer.uid → `${id}:${year}:${datum}` (már lekérve)
  const [jarulekHints, setJarulekHints] = useState<Map<string, JarulekHint>>(() => new Map())
  /** 2026-08-30 (mátrix): a felhasználó által SZÁNDÉKOSAN kiürített cellák (uid-k). Az
   *  „üres cella = arra az évre nem fizet" ígéretet az auto-kitöltés nem írhatja felül:
   *  dátum-/tagváltás utáni újraszámoláskor a kiürített mezőbe NEM írunk vissza összeget
   *  (a hint attól még frissül). Új érték gépelése törli a jelölést. */
  const userUresRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (tab !== 'income' || !onGetExpectedJarulek) return
    for (const row of incomeRows) {
      if (!isChurchMaintenance(row.categoryId)) continue
      for (const p of row.people ?? []) {
        if (p.id == null) continue // csak regisztrált tag
        const year = Number(p.evre || row.evre)
        if (!Number.isFinite(year) || year < 1900) continue
        // J6: a befizetés DÁTUMA (a sor datum-ja) → a korai-fizetés/időszaki kedvezmény prospektív
        // alkalmazásához (ha a befizetés a határidő előtt van, a kedvezményes összeget ajánljuk).
        const prospectiveDateIso = parseFlexibleDate(row.datum) || undefined
        const reqKey = `${p.id}:${year}:${prospectiveDateIso ?? ''}`
        if (jarulekReqRef.current.get(p.uid) === reqKey) continue // ezt a (tag,év,dátum)-ot már lekértük
        jarulekReqRef.current.set(p.uid, reqKey)
        const rowId = row.id
        const payerUid = p.uid
        const payerId = p.id
        const payerName = p.name
        // 2026-07-10 (S2-#1b): kitöltött összegnél IS lekérjük (az „Ajánlott" jelzéshez), de
        // auto-kitöltés és toast csak akkor van, ha a mező a KÉRÉSKOR üres volt (a kézit sosem bántjuk).
        const wasEmpty = (p.osszeg ?? '').trim() === ''
        void onGetExpectedJarulek(payerId, year, prospectiveDateIso)
          .then((res) => {
            if (!res) return
            if (jarulekReqRef.current.get(payerUid) !== reqKey) return // közben változott a tag/év/dátum
            // 2026-07-10 (S2-#1b): a hint eltárolása — az összeg-mező melletti „Ajánlott" jelzéshez.
            setJarulekHints((cur) => {
              const next = new Map(cur)
              next.set(payerUid, { reqKey, expected: res.expected, paid: res.paid, debt: res.debt, hasBase: res.hasBase !== false, szabalyok: res.szabalyok ?? [] })
              return next
            })
            if (res.debt > 0) {
              if (!wasEmpty) return // kézi összeg — a hint jelzi az eltérést, nem írunk felül
              if (userUresRef.current.has(payerUid)) return // szándékosan kiürített cella — nem töltjük vissza
              const amount = String(res.debt)
              setIncomeRows((cur) => cur.map((r) => (r.id !== rowId ? r : {
                ...r,
                people: (r.people ?? []).map((q) =>
                  q.uid === payerUid && q.id === payerId && (q.osszeg ?? '').trim() === '' ? { ...q, osszeg: amount } : q,
                ),
              })))
            } else if (res.hasBase === false) {
              // #Endre 2026-07-01: NINCS beállítva az adott évi éves járulék-alap (se bealitas, se
              // congregations.eves_jarulek) → NEM „felmentett", hanem beállítandó. Ajánljuk fel.
              if (wasEmpty) onToast('warning', `A(z) ${year}. évi éves járulék nincs beállítva — állítsd be a „Gyülekezetünk adatai → Pénzügy" alatt, utána automatikusan kitölti. Addig írd be kézzel.`)
            } else {
              // M3: rendezve / felmentett → NEM írunk 0-t, de jelezzük (különben néma a mező).
              if (wasEmpty) onToast('success', res.expected <= 0
                ? `${payerName || 'A tag'}: erre az évre (${year}) felmentett — nincs járulék.`
                : `${payerName || 'A tag'}: a ${year}. évi járulék már rendezve (nincs hátralék).`)
            }
          })
          .catch(() => { /* hálózat nélkül nincs auto-kitöltés / ajánlás */ })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, tab, onGetExpectedJarulek])

  // 2026-07-10 (S2-#1b): érvényes hint egy befizetőhöz — CSAK ha a JELENLEGI (jogcím, tag, év,
  // dátum) állapothoz tartozik (év-/dátumváltás után az elavult hint eltűnik, amíg az új meg nem jön).
  function jarulekHintFor(row: EntryRow, p: PayerLike): JarulekHint | null {
    if (tab !== 'income' || !onGetExpectedJarulek) return null
    if (!isChurchMaintenance(row.categoryId) || p.id == null) return null
    const year = Number(p.evre || row.evre)
    if (!Number.isFinite(year) || year < 1900) return null
    const key = `${p.id}:${year}:${parseFlexibleDate(row.datum) ?? ''}`
    const h = jarulekHints.get(p.uid)
    return h && h.reqKey === key && h.hasBase ? h : null
  }

  /** 2026-07-10 (S2-#1b): „Ajánlott összeg" jelzés az összeg-mező alatt — a tag éves díja a
   *  rögzítés dátumán érvényes kedvezménnyel, egy kattintással átvehető. Eltérő kézi összeg
   *  NEM hiba (részletfizetés létezik) — csak diszkrét „eltér" jelzést kap. */
  function renderJarulekHint(row: EntryRow, p: PayerLike, idx: number): ReactNode {
    const h = jarulekHintFor(row, p)
    if (!h) return null
    const entered = Number(p.osszeg) || 0
    if (h.debt > 0) {
      // 2026-08-29 (Endre kérdése nyomán): a jelzés NEVEZZE MEG az árazó
      // szabályt — a puszta „kedvezménnyel" felirat megtévesztő volt, amikor a
      // beállított kedvezmény-lépcső mást árazott, mint amire a lelkész számított.
      const cimke = h.szabalyok.length > 0 ? h.szabalyok.join(' + ') : 'teljes éves díj'
      const detail = h.paid > 0
        ? `Alkalmazott szabály: ${cimke}. Éves díj így: ${formatRon(h.expected)} RON · ebből már befizetve: ${formatRon(h.paid)} RON · még fizetendő: ${formatRon(h.debt)} RON.`
        : `Alkalmazott szabály: ${cimke}. Ha az összeg nem stimmel, a szabály összegét a Gyülekezetünk adatai → Pénzügy → járulék-kedvezmények alatt tudod átírni.`
      if (entered === h.debt) {
        return (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600" title={detail}>
            ✓ Ajánlott összeg ({cimke})
          </span>
        )
      }
      return (
        <span className="mt-0.5 flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updatePayer(row.id, idx, { osszeg: String(h.debt) })}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
            title={detail}
          >
            Ajánlott: {formatRon(h.debt)} RON — átvesz
          </button>
          {entered > 0 && (
            <span className="text-[10px] text-amber-600" title="Az eltérő összeg megengedett (pl. részletfizetés) — ez csak jelzés.">
              eltér
            </span>
          )}
        </span>
      )
    }
    // debt = 0: rendezve vagy felmentett — kicsi, semleges jelzés (nem hiba, nem blokkol).
    return (
      <span className="mt-0.5 inline-flex text-[10px] text-slate-400">
        {h.expected <= 0 ? 'Felmentett — nincs járulék erre az évre.' : `A(z) ${Number(p.evre || row.evre)}. évi járulék rendezve.`}
      </span>
    )
  }

  /** 2026-08-30 (mátrix): TÖMÖR járulék-jelzés egy mátrix-cellához — a teljes hint nem fér el
   *  az ~5,5 rem széles cella alatt; a részletek (szabály neve, hol írható át) a title-ben. */
  function renderJarulekHintKompakt(row: EntryRow, p: PayerLike, idx: number): ReactNode {
    const h = jarulekHintFor(row, p)
    if (!h) return null
    const entered = Number(p.osszeg) || 0
    if (h.debt > 0) {
      const cimke = h.szabalyok.length > 0 ? h.szabalyok.join(' + ') : 'teljes éves díj'
      if (entered === h.debt) {
        return (
          <span className="mt-0.5 block text-right text-[9.5px] font-medium text-emerald-600" title={`Ajánlott összeg (${cimke})`}>
            ✓ ajánlott
          </span>
        )
      }
      return (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updatePayer(row.id, idx, { osszeg: String(h.debt) })}
          className="mt-0.5 block w-full text-right text-[9.5px] font-semibold text-emerald-700 underline decoration-dotted underline-offset-2 transition hover:text-emerald-900"
          title={`Ajánlott: ${formatRon(h.debt)} RON (${cimke}) — kattints az átvételhez. Az eltérő összeg megengedett (pl. részletfizetés).`}
        >
          ↳ {formatRon(h.debt)}
        </button>
      )
    }
    return (
      <span
        className="mt-0.5 block text-right text-[9.5px] text-slate-400"
        title={h.expected <= 0 ? 'Felmentett — nincs járulék erre az évre.' : 'Az évi járulék már rendezve.'}
      >
        {h.expected <= 0 ? 'felmentett' : 'rendezve'}
      </span>
    )
  }

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

  // ── Készpénz-korlát figyelmeztetések (2026-08-14, Endre kérése) ──────────
  // A „Változások 2026" törvényi korlátai a MOSTANI beviteli kötegre:
  // 5 000 lej feletti készpénzes tétel · feldarabolás-gyanú (ugyanaz a partner,
  // ugyanaz a nap, több tétel > 5 000) · napi összes kifizetés > 10 000 ·
  // bevételi határok (5 000 / 10 000 partnerenként). FIGYELMEZTET, nem blokkol —
  // a partner jogi státuszát a rendszer nem ismeri, a döntés a rögzítőé.
  // A készpénz-azonosítás a bevett szabály szerint: bankId === '' (kassza).
  // A közös szabály-mag a @kartoteka/core-ban él → a desktop is ugyanezt kapja.
  const keszpenzFigyelmeztetesek = useMemo(() => {
    const tetelek: KeszpenzTetel[] = []
    const addRows = (tabName: 'income' | 'expense', rows: EntryRow[]) => {
      for (const r of rows) {
        if (!rowValidIn(tabName, r)) continue
        if (dirFor(tabName, r)) continue // belső mozgás (letét/felvét) nem partner-forgalom
        const iso = parseFlexibleDate(r.datum)
        if (!iso) continue
        const effAmount =
          tabName === 'income' && (r.people?.length ?? 0) >= 1 ? payerSum(r) : Number(r.amount)
        tetelek.push({
          datum: iso,
          osszeg: effAmount,
          irany: tabName === 'income' ? 'bevetel' : 'kiadas',
          partner: r.partner,
          keszpenz: r.bankId === '',
        })
      }
    }
    addRows('income', incomeRows)
    addRows('expense', expenseRows)
    return keszpenzKorlatFigyelmeztetesek(tetelek)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, expenseRows])

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
    // 2026-07-10 (S5-#2): irányonként EGY belső-mozgás opció elég — a mentés csak az
    // IRÁNYT használja (pushTransfer), a konkrét cél-id-t nem. Korábban a 300.01 ÉS a
    // legacy 401.01 (hibás bevétel-oldali cél, aktiv=false, de a lekérés áthozza) is a
    // listában volt, ugyanazzal a „Készpénzfelvétel…" felirattal → duplikátum. A
    // kanonikus KASSZA-oldali kód (felvétel: 300.01, letétel: 400.01) élvez elsőbbséget.
    const dirPick = new Map<'deposit' | 'withdraw', number>()
    for (const c of cats) {
      const dir = dirOfKod(c.kod)
      if (!dir) continue
      const canonical = dir === 'withdraw' ? '300.01' : '400.01'
      if (!dirPick.has(dir) || c.kod === canonical) dirPick.set(dir, c.id)
    }
    return cats
      .filter((c) => !BANKBANK_KODS.has(c.kod))
      .filter((c) => hasBank || !dirOfKod(c.kod))
      .filter((c) => {
        const dir = dirOfKod(c.kod)
        return !dir || dirPick.get(dir) === c.id
      })
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
  // #5 (Endre): az újonnan hozzáadott befizető NÉV-mezője automatikusan fókuszt kap,
  // hogy a „Még egy befizető" után azonnal írható legyen a következő név.
  const [focusPayerUid, setFocusPayerUid] = useState<string | null>(null)
  const togglePayerRow = (id: string) =>
    setCollapsedPayerRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  // ── #4 befizető-almenü műveletek (a sor people[] listáján) ────────────────
  /** Új befizetők hozzáfűzése (kereső-találat vagy család) — id szerint dedupolva. */
  function appendPayers(rowId: string, additions: Array<{ id: number | null; name: string; refId?: string | null; kind?: CombinedPartnerKind; kor?: number | null; lakhely?: string | null }>) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const curPeople = r.people ?? []
        const existing = new Set(curPeople.filter((p) => p.id != null).map((p) => p.id))
        // 2026-08-22 (5a): a felső szintű partnernek NINCS `id`-je (az null marad),
        // ezért a `refId` szerint is dedupolunk — különben ugyanaz a gyülekezet
        // kétszer is bekerülhetne ugyanarra a nyugtára.
        const existingRef = new Set(curPeople.filter((p) => p.refId).map((p) => p.refId))
        const add = additions.filter(
          (a) => (a.id == null || !existing.has(a.id)) && (!a.refId || !existingRef.has(a.refId)),
        )
        if (!add.length) return { ...r, partner: '' }
        const evreDefault = curPeople[0]?.evre || r.evre || String(currentYear)
        // BLOCKER-fix: 0 befizetőről indulva a fő Összeg mezőbe MÁR beírt érték (r.amount) NE
        // vesszen el a tag-választáskor — az ELSŐ új befizetőre visszük át, és ürítjük a fősor
        // amount-ját (a UI ezután a people[0].osszeg-et / a summát mutatja). A sorrend (előbb
        // összeg, utána tag) így sem okoz csendes adatvesztést.
        const seed = curPeople.length === 0 ? (r.amount.trim() || '') : ''
        const newPeople = [
          ...curPeople,
          ...add.map((a, i) => ({ uid: crypto.randomUUID(), id: a.id, name: a.name, refId: a.refId ?? null, kind: a.kind ?? 'szemely', kor: a.kor ?? null, lakhely: a.lakhely ?? null, osszeg: i === 0 ? seed : '', evre: evreDefault })),
        ]
        return { ...r, people: newPeople, partner: '', ...(curPeople.length === 0 ? { amount: '' } : {}) }
      }),
    )
  }
  /** #5 (Endre): „Még egy befizető" — az új mező AZONNAL írható. 0 befizetőnél a már beírt
   * szabad-szöveges nevet/összeget ELSŐ befizetővé alakítja, és rögtön ad egy üres, FÓKUSZÁLT
   * második sort (korábban a kattintás láthatatlan maradt, mert az almenü csak 2+ befizetőnél
   * nyílik); 1+ befizetőnél üres sort fűz hozzá + fókusz. Az almenüt kinyitjuk. */
  function addEmptyPayer(rowId: string) {
    const newUid = crypto.randomUUID()
    setRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const curPeople = r.people ?? []
        const evreDefault = curPeople[0]?.evre || r.evre || String(currentYear)
        const empty = { uid: newUid, id: null as number | null, name: '', osszeg: '', evre: evreDefault }
        if (curPeople.length === 0) {
          const first = { uid: crypto.randomUUID(), id: null as number | null, name: r.partner.trim(), osszeg: r.amount.trim(), evre: evreDefault }
          return { ...r, people: [first, empty], partner: '', amount: '' }
        }
        return { ...r, people: [...curPeople, empty] }
      }),
    )
    setCollapsedPayerRows((cur) => { const next = new Set(cur); next.delete(rowId); return next })
    setFocusPayerUid(newUid)
  }
  /** Egy befizető mezőjének frissítése (név / összeg / év). */
  function updatePayer(rowId: string, idx: number, patch: Partial<{ id: number | null; name: string; osszeg: string; evre: string; refId: string | null; kind: CombinedPartnerKind; kor: number | null; lakhely: string | null }>) {
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

  // ── 2026-08-15 (Endre, 23. pont) + 2026-08-30 (mátrix): „Több évre fizet" ──
  // EGY nyugtán TÖBB befizető × TÖBB év. A megvalósítás a MEGLÉVŐ people[] almenü-modellre
  // épül: minden (befizető, év) cella = egy people[]-bejegyzés saját `evre`+`osszeg` mezővel.
  // Így a teljes lánc VÁLTOZATLANUL működik: az auto-kitöltés (onGetExpectedJarulek —
  // évenként az ADOTT ÉV még fizetendő járuléka, uid-kulcsú hint-cache), a mentés (cellánként
  // külön befizetés-sor, fizetettev helyesen) és a nyugtaszám (közös nyugta, /N utótag).
  /** Mely sorokon kapcsolta BE a felhasználó a mátrixot (UI-állapot; 2+ évnél az adatból
   *  is levezethető — lásd isMatrixActive —, ezért vázlat-visszaállítás után is él). */
  const [multiYearRowIds, setMultiYearRowIds] = useState<Set<string>>(() => new Set())
  /** Az év-chipek: az utolsó ~10 év. A NÉZETT pénzügyi év ÉS a mai év közül a nagyobbtól
   *  visszafelé — régebbi évet nézve a folyó évre is fizethessen előre. */
  const multiYearChoices = useMemo(() => {
    const top = Math.max(Number.isFinite(currentYear) ? currentYear : 0, new Date().getFullYear())
    return Array.from({ length: 10 }, (_, i) => top - 9 + i)
  }, [currentYear])
  /** Aktív-e a befizető-mátrix. FAIL-CLOSED: csak akkor, ha MINDEN bejegyzésnek érvényes
   *  éve van — különben a klasszikus lista mutat mindent (bejegyzés nem tűnhet el a nézetből).
   *  A kapcsolót a felhasználó (pill/chip) VAGY a vázlat-visszaállítás magvetése állítja —
   *  élő gépelés közben SOSEM vált át magától (az Év-mező nem tűnhet el a kéz alól). */
  const isMatrixActive = (r: EntryRow): boolean => {
    const ps = r.people ?? []
    if (ps.length === 0) return false
    if (!ps.every((p) => matrixEv(p.evre) != null)) return false
    return multiYearRowIds.has(r.id)
  }
  /** A mátrix people[]-sorrendje: befizető (első előfordulás) szerint, azon belül év szerint —
   *  a mentett sorok (és a /N kerületi iratszám-utótag) determinisztikusan követik. Az év
   *  nélküli bejegyzés a lista VÉGÉRE kerül, de SOSEM veszhet el (fail-closed rendezés). */
  function matrixRendez(ps: PayerLike[]): PayerLike[] {
    const rendezett = matrixCsoportok(ps).flatMap((cs) =>
      [...cs.cellak.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c.p),
    )
    if (rendezett.length === ps.length) return rendezett
    const megvan = new Set(rendezett.map((p) => p.uid))
    return [...rendezett, ...ps.filter((p) => !megvan.has(p.uid))]
  }
  /** Mátrix BE — bármely (1+) befizetőnél: az érvénytelen év-mezőket a sor alapértelmezett
   *  évére töltjük (a kapu minden bejegyzéstől érvényes évet követel). */
  function enableMultiYear(rowId: string) {
    setIncomeRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const ps = r.people ?? []
        if (ps.length === 0) return r
        const evreDefault =
          ps.find((p) => matrixEv(p.evre) != null)?.evre ??
          (matrixEv(r.evre) != null ? r.evre : String(currentYear))
        return { ...r, people: ps.map((p) => (matrixEv(p.evre) != null ? p : { ...p, evre: evreDefault })) }
      }),
    )
    setMultiYearRowIds((s) => { const n = new Set(s); n.add(rowId); return n })
  }
  /** Mátrix KI: sor-példányonként csak a LEGKORÁBBI év bejegyzése marad (összegével) —
   *  azonos kulcsú második példány (pl. két részlet) bejegyzése is megmarad, és az
   *  érvénytelen évű bejegyzéshez sem nyúlunk (bejegyzés nem veszhet el némán). */
  function disableMultiYear(rowId: string) {
    setIncomeRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const ps = r.people ?? []
        const tartott = new Set<string>()
        for (const cs of matrixCsoportok(ps)) {
          const legkisebbEv = Math.min(...cs.cellak.keys())
          const cella = cs.cellak.get(legkisebbEv)
          if (cella) tartott.add(cella.p.uid)
        }
        const people = ps.filter((p) => matrixEv(p.evre) == null || tartott.has(p.uid))
        return people.length === ps.length ? r : { ...r, people }
      }),
    )
    setMultiYearRowIds((s) => { if (!s.has(rowId)) return s; const n = new Set(s); n.delete(rowId); return n })
  }
  /** Egy év-oszlop ki-/bekapcsolása. Hozzáadásnál MINDEN befizető (csoport) kap egy üres
   *  bejegyzést az új évre → a meglévő auto-kitöltés (onGetExpectedJarulek) az ADOTT ÉV még
   *  fizetendő járulékát írja bele; a kézzel már beírt összegekhez nem nyúlunk. Kivételnél
   *  az év MINDEN bejegyzése törlődik (a fejléc/chip felirata figyelmeztet erre). */
  function toggleMultiYearYear(rowId: string, year: number) {
    setIncomeRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const ps = r.people ?? []
        const van = ps.some((p) => matrixEv(p.evre) === year)
        if (van) {
          const marad = ps.filter((p) => matrixEv(p.evre) !== year)
          if (marad.length === 0) return r // az utolsó kijelölt év nem vehető el
          return { ...r, people: marad }
        }
        const ujak: PayerLike[] = []
        for (const cs of matrixCsoportok(ps)) {
          // Névtelen (azonosság nélküli) sor NEM sokszorozódik évre — előbb nevet kap.
          if (cs.kulcs.startsWith('uid:')) continue
          if (cs.cellak.has(year)) continue
          ujak.push({ uid: crypto.randomUUID(), id: cs.base.id, name: cs.base.name, refId: cs.base.refId ?? null, kind: cs.base.kind ?? 'szemely', kor: cs.base.kor ?? null, lakhely: cs.base.lakhely ?? null, osszeg: '', evre: String(year) })
        }
        if (ujak.length === 0) return r
        return { ...r, people: matrixRendez([...ps, ...ujak]) }
      }),
    )
  }
  /** Egy mátrix-SOR-PÉLDÁNY bejegyzéseinek közös azonosság-mezői (név-átírás, tag-
   *  beillesztés) — uid-listára célzott: azonos kulcsú MÁSIK sor-példányt nem érinthet.
   *  Tag-CSERÉNÉL (új regisztrált id) az ELŐZŐ tag auto-kitöltött összegei ürülnek (a
   *  hint-tel egyező összeg = automatikus volt), hogy az új tag hátraléka töltődhessen —
   *  a kézzel beírt (eltérő) összeghez nem nyúlunk. */
  function updatePayerGroup(rowId: string, uids: string[], patch: Partial<{ id: number | null; name: string; refId: string | null; kind: CombinedPartnerKind; kor: number | null; lakhely: string | null }>) {
    const halmaz = new Set(uids)
    setIncomeRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        return {
          ...r,
          people: (r.people ?? []).map((p) => {
            if (!halmaz.has(p.uid)) return p
            const uj = { ...p, ...patch }
            if (patch.id != null && patch.id !== p.id) {
              const h = jarulekHints.get(p.uid)
              if (h && Number(p.osszeg) === h.debt) uj.osszeg = ''
            }
            return uj
          }),
        }
      }),
    )
  }
  /** Egy befizető sor-példányának eltávolítása — CSAK a saját (uid szerinti) bejegyzései. */
  function removePayerGroup(rowId: string, uids: string[]) {
    const halmaz = new Set(uids)
    setIncomeRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r
        const people = (r.people ?? []).filter((p) => !halmaz.has(p.uid))
        if (people.length === (r.people ?? []).length) return r
        // Az utolsó befizető is elment → üres, szabad-szöveges sor marad (mint a leválasztásnál).
        return people.length === 0 ? { ...r, people, partner: '', amount: '' } : { ...r, people }
      }),
    )
  }
  /** Üres mátrix-cella kitöltése: új bejegyzés a csoport TELJES azonosságával (id + refId +
   *  kind — jogi személynél a partner-FK nem veszhet el) az adott évre. */
  function addPayerCell(rowId: string, base: PayerLike, year: number, osszeg: string) {
    const uj: PayerLike = { uid: crypto.randomUUID(), id: base.id, name: base.name, refId: base.refId ?? null, kind: base.kind ?? 'szemely', kor: base.kor ?? null, lakhely: base.lakhely ?? null, osszeg, evre: String(year) }
    setIncomeRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, people: matrixRendez([...(r.people ?? []), uj]) } : r)))
  }
  /** A PartnerCell „Több évre fizet" propja — CSAK egyházfenntartás-jogcímű bevétel-soron. */
  function multiYearFor(r: EntryRow): MultiYearProps | undefined {
    if (tab !== 'income' || !isChurchMaintenance(r.categoryId)) return undefined
    const ps = r.people ?? []
    const active = isMatrixActive(r)
    // A pill (offer): 1+ befizető, MINDEGYIKNEK van azonossága (tag, jogi személy vagy név) —
    // névtelen bejegyzésnél nincs mit több évre szorozni.
    const offer = ps.length >= 1 && ps.every((p) => p.id != null || !!p.refId || p.name.trim() !== '')
    if (!active && !offer) return undefined
    return {
      active,
      yearChips: multiYearChoices,
      onEnable: () => enableMultiYear(r.id),
      onDisable: () => disableMultiYear(r.id),
      onToggleYear: (year: number) => toggleMultiYearYear(r.id, year),
      onUpdateGroup: (uids, patch) => updatePayerGroup(r.id, uids, patch),
      onRemoveGroup: (uids) => removePayerGroup(r.id, uids),
      onAddCell: (base, year, osszeg) => addPayerCell(r.id, base, year, osszeg),
      onCellaUrites: (uid, ures) => {
        if (ures) userUresRef.current.add(uid)
        else userUresRef.current.delete(uid)
      },
    }
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

  // #5 (Endre): az IRATTÍPUS oszlop a VÁLASZTOTT bizonylattípust mutassa (Chitanță/Factură/…),
  // ne fixen „Készpénz"-t. A készpénz-azonosítás már a bankszamla_id IS NULL (kassza) alapján
  // megy, nem az irattipus szövegén (lásd reporting.ts / offline save-gate). Ha nincs választott
  // típus, marad a „Készpénz" alapérték.
  function docTypeForSave(r: EntryRow): string { return r.docType.trim() || 'Készpénz' }

  // ── Beviteli őrök (P0 duplikátum + P1 dátum-sorrend) ─────────────────────
  // P1: a sor dátuma jövőbeli, vagy korábbi mint az utolsó rögzített → figyelmeztetés
  // (NEM blokkol — a visszamenőleges rögzítés jogos lehet, csak nehogy VÉLETLEN legyen).
  function dateWarning(r: EntryRow): string | null {
    const iso = parseFlexibleDate(r.datum)
    if (!iso) return null
    // 2026-08-14 (13. pont): ÉV-ELTÉRÉS — a legerősebb figyelmeztetés elöl.
    // A más évre könyvelt tétel mentés után NEM a most nézett listán jelenik
    // meg; e jelzés nélkül a lelkész „eltűnt tételnek" látta.
    const rowYear = Number(iso.slice(0, 4))
    if (Number.isFinite(currentYear) && rowYear !== currentYear) {
      return `A(z) ${rowYear}. évhez könyvelődik — most a ${currentYear}. évet nézed, mentés után nem ezen a listán jelenik meg`
    }
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

  // #Endre 2026-07-01 (perf): a szerver-lekérés per-év CACHE-elve (egy dialóg-megnyitásra 1×/év).
  function fetchReceiptNumbersCached(year: number) {
    const cache = receiptCacheRef.current
    let p = cache.get(year)
    if (!p) { p = onGetNextReceiptNumbers!(year); cache.set(year, p) }
    return p
  }

  // Chitanță auto-számozás + új-évi popup — KÖZÖS a docType- ÉS a dátumváltáshoz, hogy a dátum
  // idei (új) évre visszaváltásakor is újraértékeljen (a popup ÚJRA feljöhet, amíg nincs döntés).
  function maybeFetchReceiptNumbers(r: EntryRow) {
    if (tab !== 'income' || r.docType !== 'Chitanță' || !onGetNextReceiptNumbers) return
    // A gyülekezeti sorszám a NAPTÁRI évhez (datum) kötődik — nem a „melyik évre" mezőhöz.
    const year = Number(parseFlexibleDate(r.datum)?.slice(0, 4)) || currentYear
    void fetchReceiptNumbersCached(year)
      .then((next) => {
        if (!next) return
        // A puszta MEGJELENÍTÉS NEM döntés: idei-évre visszaváltáskor újra feljön, amíg a felhasználó
        // nem válaszol (decideNewYear) vagy be nem zárja („Később") — ekkor a gyulStartRef „megjegyzi".
        const decided = gyulStartRef.current?.year === year
        if (next.ujEv && !decided) {
          setNewYearPrompt({ year, rowId: r.id, tavalyiEv: next.tavalyiEv, tavalyiUtolso: next.tavalyiUtolso || '0', ajanlott: next.gyulekezeti })
        }
        fillReceiptNumbers(r.id, year, next, false)
      })
      .catch(() => onToast('error', 'A következő nyugtaszámot nem sikerült lekérni — írd be kézzel.'))
  }

  function handleDocTypeChange(r: EntryRow, value: string) {
    // Az irattípust AZONNAL beállítjuk (a vezérelt select ne ugorjon vissza a hálózati lekérés alatt).
    updateRow(r.id, { docType: value })
    // A friss docType-tal hívjuk (a state async — a helper r.docType-ját felül kell írni).
    maybeFetchReceiptNumbers({ ...r, docType: value })
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
    appendPayers(rowId, members.map((m) => ({ id: m.id, name: m.name, kor: korSzDatumbol(m.szDatum), lakhely: m.telepules ?? null })))
    // az almenü maradjon NYITVA — itt tölti a felhasználó az összegeket befizetőnként.
    setCollapsedPayerRows((s) => { if (!s.has(rowId)) return s; const n = new Set(s); n.delete(rowId); return n })
    onToast('success', 'Családtagok hozzáadva — töltsd ki az összegeket befizetőnként az almenüben.')
  }

  // Okos „Család csatolása": ha a sorban MÁR ki van választva egy regisztrált tag, annak a
  // CSALÁDJÁT oldjuk fel és tesszük az almenübe (ablak nélkül). Ha nincs kiválasztott tag (üres a
  // mező) vagy nincs család, a család-kereső ABLAKra esünk vissza.
  //
  // 2026-08-29 (Endre hibajelzése): a siker-toast eddig a DEDUP ELŐTT sült el —
  // ha a szerver csak a kiválasztott tagot (vagy már bent lévőket) adta vissza,
  // a felület „családja az almenübe került"-et mondott, miközben SEMMI nem
  // változott. Mostantól a toast a TÉNYLEGESEN hozzáadott tagokról szól; ha
  // nincs ÚJ tag, őszintén mondjuk ki, és a család-keresőt nyitjuk. A gomb a
  // lekérés alatt pörgő állapotot mutat (lassú hálózaton is látszik a munka).
  function handleFamilyClick(rowId: string) {
    const r = incomeRows.find((x) => x.id === rowId)
    const linked = r?.people?.find((p) => p.id != null)
    if (linked?.id != null && onGetFamilyMembersForPerson) {
      setFamilyLoadingRowId(rowId)
      void onGetFamilyMembersForPerson(linked.id)
        .then((members) => {
          const meglevo = new Set((r?.people ?? []).filter((p) => p.id != null).map((p) => p.id))
          const ujak = (members || []).filter((m) => m.id != null && !meglevo.has(m.id))
          if (ujak.length > 0) {
            appendPayers(rowId, ujak.map((m) => ({ id: m.id, name: m.name, kor: korSzDatumbol(m.szDatum), lakhely: m.telepules ?? null })))
            setCollapsedPayerRows((s) => { if (!s.has(rowId)) return s; const n = new Set(s); n.delete(rowId); return n })
            onToast('success', `${ujak.length} családtag került az almenübe (${linked.name} családja) — töltsd ki az összegeket.`)
          } else if ((members || []).length > 0) {
            onToast('error', `${linked.name} családjában nincs TOVÁBBI rögzített tag — a keresőből kézzel is hozzáadhatsz befizetőt.`)
            setFamilyPickerRowId(rowId)
          } else {
            onToast('error', 'Ehhez a személyhez nincs rögzített család — keresd ki kézzel.')
            setFamilyPickerRowId(rowId)
          }
        })
        .catch(() => setFamilyPickerRowId(rowId))
        .finally(() => setFamilyLoadingRowId((cur) => (cur === rowId ? null : cur)))
    } else {
      // Üres mező → a megszokott család-kereső ablak.
      setFamilyPickerRowId(rowId)
    }
  }

  async function handleSave() {
    // P0-9 (audit 2026-08-28): a zárnak MINDEN await ELŐTT kell állnia — a
    // hasonló-tétel kapu szerver-hívása alatt a gomb korábban aktív maradt, és
    // a dupla kattintás mindkét ága teljes mentést futtatott (duplikátum). A
    // feloldás finally-ben garantált, így a kapu korai return-je után a
    // „Mégis rögzítem" újrahívás nem ragad be.
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await handleSaveInner()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleSaveInner() {
    if (incomeValid === 0 && expenseValid === 0) {
      onToast('error', 'Legalább egy érvényes sor szükséges (összeg + kategória + dátum; belső mozgásnál bankszámla is).')
      return
    }

    // Belső mozgás sorok kigyűjtése (mindkét fülről). 2026-08-09 (review-fix):
    // minden mentett tételhez megjegyezzük a FORRÁS-SOR id-ját, és a sikeresen
    // mentett fázis sorait AZONNAL kivesszük az űrlapból — így egy későbbi fázis
    // hibája utáni ÚJRA-mentés nem rögzíti duplán a már elmentett tételeket.
    const transfers: Array<{ payload: CombinedInternalTransferPayload; rowId: string; tab: 'income' | 'expense' }> = []
    const incomeBatch: CombinedIncomeBatchRow[] = []
    const expenseBatch: SaveExpenseBatchRow[] = []
    const savedIncomeRowIds: string[] = []
    const savedExpenseRowIds: string[] = []

    const removeRowsFromTab = (tabName: 'income' | 'expense', ids: string[]) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      const setter = tabName === 'income' ? setIncomeRows : setExpenseRows
      setter((cur) => {
        const kept = cur.filter((row) => !idSet.has(row.id))
        return kept.length ? kept : [newRow(currentYear)]
      })
    }

    function pushTransfer(dir: 'deposit' | 'withdraw', datum: string, r: EntryRow, tabName: 'income' | 'expense') {
      if (dir === 'deposit') {
        transfers.push({ payload: { tipus: 'kassza_bank', datum, forras: 'kassza', cel: String(r.bankId), osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzletétel a bankba' }, rowId: r.id, tab: tabName })
      } else {
        transfers.push({ payload: { tipus: 'bank_kassza', datum, forras: String(r.bankId), cel: 'kassza', osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzfelvétel a bankból' }, rowId: r.id, tab: tabName })
      }
    }

    for (const r of incomeRows) {
      if (!rowValidIn('income', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('income', r)
      if (dir) { pushTransfer(dir, datum, r, 'income'); continue }
      savedIncomeRowIds.push(r.id)
      // #4: EGY nyugta, több befizető. Ha vannak befizetők (people[]), tagonként KÜLÖN
      // befizetés keletkezik — KÖZÖS nyugtaszámmal (gyülekezeti = nyugta), közös irattípussal +
      // jogcímmel, de PER-TAG összeggel + évvel + személlyel. A kerületi iratszám csak több
      // (összeg>0) befizetőnél kap /N utótagot (a készpénzes iratszámra UNIQUE index van); egy
      // befizetőnél csupasz szám. People nélkül: a klasszikus szabad-szöveges egyszemélyes sor.
      const people = r.people ?? []
      const commonNyugta = r.gyulekezetiSzam.trim() || null
      const commonMegj = r.megjegyzes.trim() || null
      // P4-30 (audit 2026-08-28): banki bizonylat (Ordin de plată) bankszámla
      // nélkül a KASSZÁBA sorolódna — hangosan megállunk, nem mentünk félre.
      if (r.docType === 'Ordin de plată' && r.bankId === '') {
        onToast('error', 'Az Ordin de plată (banki) tételhez válaszd ki, melyik bankszámlát érinti — enélkül a tétel tévesen a kasszába kerülne.')
        return
      }
      const rowBankId = r.bankId === '' ? null : Number(r.bankId)
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
            irattipus: docTypeForSave(r),
            nyugta: commonNyugta,
            fizetettev: Number(p.evre) || Number(r.evre) || Number(datum.slice(0, 4)) || currentYear,
            megjegyzes: commonMegj,
            id_szemely: p.id,
            id_csalad: null,
            // 2026-08-22 (5a): felső szintű (jogi személy) befizető — a szerver
            // a saját hatókörére visszaellenőrzi, mielőtt FK-ként beírja.
            befizeto_scope_id: p.refId ?? null,
            befizeto_kind: p.kind ?? null,
            bankszamla_id: rowBankId,
          })
        })
      } else {
        incomeBatch.push({
          datum, id_befizetescel: Number(r.categoryId),
          forrasa: r.partner.trim() || null,
          osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: docTypeForSave(r),
          nyugta: commonNyugta,
          fizetettev: Number(r.evre) || Number(datum.slice(0, 4)) || currentYear,
          megjegyzes: commonMegj,
          id_szemely: null, id_csalad: null,
          bankszamla_id: rowBankId,
        })
      }
    }
    for (const r of expenseRows) {
      if (!rowValidIn('expense', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('expense', r)
      if (dir) { pushTransfer(dir, datum, r, 'expense'); continue }
      // D1 (audit 2026-08-28, Endre döntése): a kiadás ÁTVEVŐJE kötelező —
      // a hivatalos kiadási kísérőívnek is szüksége van rá, és a desktop is
      // megköveteli. Hangos hiba, nem néma sor-kihagyás.
      if (!r.partner.trim()) {
        onToast('error', `A kiadás átvevője kötelező — add meg, ki kapta a pénzt (${parseFlexibleDate(r.datum)} · ${Number(r.amount).toLocaleString('hu')} RON sor).`)
        return
      }
      // P4-30: banki bizonylat bankszámla nélkül nem mehet a kasszába.
      if (r.docType === 'Ordin de plată' && r.bankId === '') {
        onToast('error', 'Az Ordin de plată (banki) kiadáshoz válaszd ki, melyik bankszámláról ment — enélkül a tétel tévesen a kasszába kerülne.')
        return
      }
      savedExpenseRowIds.push(r.id)
      // 2026-08-09: leltár-köteles jogcím (205.01 / 201.12) → kapcsolt leltári tétel.
      let inventory: ExpenseInventoryIntake | null = null
      const invKat = invKategoriaForRow(r)
      if (invKat) {
        const inv = invOf(r, invKat)
        if (inv.enabled) {
          // Ha a megnevezés üres, a sor megjegyzése lép a helyébe (a placeholder is ezt mutatja).
          const megnevezes = inv.megnevezes.trim() || r.megjegyzes.trim()
          if (!megnevezes) {
            onToast('error', 'Leltárba vétel: add meg a tárgy megnevezését a kiadás-sor leltár-paneljén (vagy vedd ki a „Leltárba vétel" pipát).')
            return
          }
          const kategoria = inv.kategoria || invKat
          inventory = {
            megnevezes,
            kategoria,
            katalogus_kod: kategoria === 'alapeszkoz' && inv.katalogusKod ? inv.katalogusKod : null,
            hasznalati_ido: kategoria === 'alapeszkoz' && inv.hasznalatiIdo ? Number(inv.hasznalatiIdo) || null : null,
            helyszin: inv.helyszin.trim() || null,
            felelos_nev: inv.felelos.trim() || null,
            megjegyzes: r.partner.trim() ? `Szállító: ${r.partner.trim()}` : null,
          }
        }
      }
      expenseBatch.push({
        // D1: a partner a fenti kapu miatt garantáltan nem üres.
        datum, id_kiadascel: Number(r.categoryId), kedvezmenyzett: r.partner.trim(),
        osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: docTypeForSave(r),
        megjegyzes: r.megjegyzes.trim() || null, is_inventory: !!inventory,
        inventory,
        bankszamla_id: r.bankId === '' ? null : Number(r.bankId),
      })
    }

    incomeBatch.sort((a, b) => a.datum.localeCompare(b.datum))
    expenseBatch.sort((a, b) => a.datum.localeCompare(b.datum))

    // ── HASONLÓ TÉTEL KAPU (2026-08-27, Endre 8. kérése) ──────────────────
    // „ha valaki pont abban az összegben, pont azon a cégnévvel (kb. egyezés is
    //  elég) és kb. ugyanazon a napon (±3 nap) akarja bevezetni, akkor jelezze a
    //  rendszer, hogy egy hasonló tételt már rögzítettünk a banki résznél"
    // FIGYELMEZTETÉS, NEM TILTÁS: a „Mégis rögzítem" gomb továbbenged.
    if (onCheckSimilarEntries && !hasonloMegerositve) {
      const kerdesek = [
        ...incomeBatch.map((b, i) => ({
          rowId: `income-${i}`, type: 'income' as const,
          datum: b.datum, osszeg: Number(b.osszeg) || 0,
          nev: String((b as { forrasa?: string | null }).forrasa ?? ''),
        })),
        ...expenseBatch.map((b, i) => ({
          rowId: `expense-${i}`, type: 'expense' as const,
          datum: b.datum, osszeg: Number(b.osszeg) || 0,
          nev: String((b as { kedvezmenyzett?: string | null }).kedvezmenyzett ?? ''),
        })),
      ]
      if (kerdesek.length) {
        try {
          const talalatok = await onCheckSimilarEntries(kerdesek)
          if (talalatok.length) {
            setHasonloTalalatok(talalatok)
            return // a modal dönt — a mentés onnan indul újra
          }
        } catch {
          // FAIL-OPEN, SZÁNDÉKOSAN: ez figyelmeztetés, nem védelem. Ha az
          // ellenőrzés elhasal, NEM akadályozzuk meg a rögzítést.
        }
      }
    }

    try {
      if (incomeBatch.length) {
        const res = await onSaveIncomeBatch(incomeBatch)
        if (res.error) { onToast('error', `Bevétel: ${res.error}`); return }
        // A bevételek elmentve — kivesszük őket, hogy egy későbbi hiba utáni
        // újra-mentés ne rögzítse duplán ugyanazokat a sorokat.
        removeRowsFromTab('income', savedIncomeRowIds)
      }
      if (expenseBatch.length) {
        const res = await onSaveExpenseBatch(expenseBatch)
        if (res.error) { onToast('error', `Kiadás: ${res.error}`); return }
        removeRowsFromTab('expense', savedExpenseRowIds)
      }
      for (const t of transfers) {
        const res = await onSaveInternalTransfer(t.payload)
        if (res.error) { onToast('error', `Belső mozgás: ${res.error}`); return }
        removeRowsFromTab(t.tab, [t.rowId])
      }
      const parts = []
      if (incomeBatch.length) parts.push(`${incomeBatch.length} bevétel`)
      if (expenseBatch.length) parts.push(`${expenseBatch.length} kiadás`)
      const invCount = expenseBatch.filter((b) => b.inventory).length
      if (invCount) parts.push(`${invCount} leltári tétel`)
      if (transfers.length) parts.push(`${transfers.length} belső mozgás`)
      // 2026-08-27: a hasonló-tétel megerősítés EGYSZERI — a következő mentés
      // (más sorokkal) újra kérdez. Enélkül egy megerősítés után a figyelmeztetés
      // a munkamenet végéig néma maradna.
      setHasonloMegerositve(false)
      onToast('success', `Mentve: ${parts.join(', ')} — dátum szerint rendezve.`)
      clearDraft() // #3: sikeres mentés után a vázlat törlődik
      onClose()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A mentés nem sikerült.')
    }
  }

  const dateInvalid = (r: EntryRow) => r.datum.trim() !== '' && parseFlexibleDate(r.datum) == null

  // Dátum mező: szabadon beírható szöveg + naptár-választó (natív date input).
  // #Endre 2026-07-01: dátumváltás kezelése. Ha a kiváltó soron NEM az új-évhez tartozó
  // (pl. múlt évi) dátumot választ a felhasználó, tüntessük el az „Új év (…)" felugró kérdést —
  // az kizárólag arra az egy új évre vonatkozik, amelyre az autofill rákérdezett.
  function handleDatumChange(r: EntryRow, value: string) {
    updateRow(r.id, { datum: value })
    const yNew = Number(parseFlexibleDate(value)?.slice(0, 4))
    // A NYITOTT új-évi panel eltüntetése, ha EZ a sor MÁS évre vált (pl. múlt évi dátum).
    if (newYearPrompt && newYearPrompt.rowId === r.id && (!yNew || yNew !== newYearPrompt.year)) {
      setNewYearPrompt(null)
    }
    // Chitanță-sornál a dátumváltás ÚJRAÉRTÉKEL: idei (új) évre visszaváltáskor a popup ismét
    // feljöhet (amíg nincs döntés), a szám-kitöltés pedig az új évhez igazodik.
    if (tab === 'income' && r.docType === 'Chitanță' && yNew) {
      maybeFetchReceiptNumbers({ ...r, datum: value })
    }
  }

  function renderDateField(r: EntryRow) {
    return (
      <div className="flex items-center gap-1">
        <input
          className={`${inputClass} ${dateInvalid(r) ? 'border-red-400' : ''}`}
          value={r.datum}
          placeholder="pl. 2026.01.04"
          onChange={(e) => handleDatumChange(r, e.target.value)}
        />
        <input
          type="date"
          aria-label="Dátum választása naptárból"
          title="Naptár"
          className="h-9 w-9 shrink-0 rounded-md border border-input bg-transparent px-1 text-transparent"
          value={parseFlexibleDate(r.datum) || ''}
          onChange={(e) => { if (e.target.value) handleDatumChange(r, e.target.value) }}
        />
      </div>
    )
  }

  function renderBankSelect(r: EntryRow) {
    const dir = belsoDir(r)
    // P4-30 (audit 2026-08-28): banki bizonylatnál (Ordin de plată) is kell a
    // bankszámla — eddig a kézzel rögzített OP-tétel némán a KASSZÁBA
    // sorolódott (kassza = bankszamla_id IS NULL a kanonikus szabály szerint).
    const banki = !dir && r.docType === 'Ordin de plată'
    if (!dir && !banki) return null
    return (
      <div className="mt-1 flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
        <ArrowLeftRight className="size-3.5 shrink-0" />
        <span className="shrink-0">
          {dir === 'deposit' ? 'Melyik bankszámlára:' : dir === 'withdraw' ? 'Melyik bankszámláról:' : 'Melyik bankszámlát érinti:'}
        </span>
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
      {/* Kiemelt fülek — 2026-07-10 (S2-#2): a KÉT szekció (Bevétel = zöld, Kiadás = piros)
          INAKTÍVAN is színkódolt és ikonos, hogy első pillantásra látsszon: egy mentéssel
          MINDKETTŐ rögzíthető (a számláló-badge a másik fülön is mutatja a kész sorokat). */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
        <button type="button" onClick={() => setTab('income')} aria-pressed={tab === 'income'}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'income' ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
          <TrendingUp className="size-5 shrink-0" aria-hidden />
          Bevétel{incomeValid > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === 'income' ? 'bg-white/25' : 'bg-white/80 text-emerald-700'}`}>{incomeValid}</span>}
        </button>
        <button type="button" onClick={() => setTab('expense')} aria-pressed={tab === 'expense'}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'expense' ? 'bg-red-500 text-white shadow-md' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'}`}>
          <TrendingDown className="size-5 shrink-0" aria-hidden />
          Kiadás{expenseValid > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === 'expense' ? 'bg-white/25' : 'bg-white/80 text-rose-600'}`}>{expenseValid}</span>}
        </button>
      </div>
      {/* 2026-08-29 (Endre: kevesebb görgetés): egyetlen tömör sor — az „egy mentéssel
          bevétel ÉS kiadás" már a dialóg alcímében áll, itt csak az egyedi tudnivaló. */}
      <p className="text-[11px] leading-snug text-slate-400">
        Csak készpénzes tételek — a banki tételeket kivonatból importáljuk; készpénzfelvétel/-letétel esetén bankszámlát is válassz.
      </p>

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
              onClick={() => {
                // „Később" = az ajánlott folytatást elfogadjuk erre az évre, és TÖBBSZÖR nem kérdezünk
                // (a döntést a gyulStartRef megjegyzi — így dátum-oda-vissza sem hozza vissza a panelt).
                const p = newYearPrompt
                if (p) {
                  const digits = (p.ajanlott || '').replace(/\D/g, '')
                  gyulStartRef.current = { year: p.year, start: Number(digits) || 1, width: digits.length || 1 }
                }
                setNewYearPrompt(null); setCustomStart('')
              }}
              className="ml-auto rounded-lg px-2 py-1.5 text-xs font-medium text-sky-700/70 transition hover:bg-sky-100"
              title="Most nem döntök — az ajánlott számmal folytatom (később átírhatom kézzel)"
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
            {rows.map((r, sorIdx) => {
              const dir = belsoDir(r)
              // Zebra: index-alapú (a leltár-alsor UGYANAZT a hátteret kapja, a CSS
              // odd/even azt külön sorként számolná, és felborulna a paritás).
              const sorBg = sorIdx % 2 === 1 ? 'bg-slate-100/80' : 'bg-white'
              const dWarn = dateWarning(r)
              const rWarn = receiptWarning(r)
              // #1: a kerületi + gyülekezeti szám-mező CSAK Chitanță (nyugta) esetén jelenik meg.
              const isChitanta = r.docType === 'Chitanță'
              // 2026-08-09: leltár-köteles kiadás-jogcím → „Leltárba vétel" panel a sor alatt.
              const invKat = tab === 'expense' && !dir ? invKategoriaForRow(r) : null
              return (
                <Fragment key={r.id}>
                <tr className={`border-t border-slate-200 align-top ${sorBg}`} onKeyDown={focusNextField}>
                  <td className="px-2 py-1.5 w-[160px] min-w-[7.5rem]">
                    {renderDateField(r)}
                    {dWarn && <div className="mt-0.5 text-[10px] leading-tight text-amber-600">⚠ {dWarn}</div>}
                  </td>
                  <td className="px-2 py-1.5 w-[130px] min-w-[5rem]">
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
                    <td className="px-2 py-1.5 w-[100px] min-w-[4rem]">
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
                    <td className="px-2 py-1.5 w-[100px] min-w-[4rem]">
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
                  {/* A partner-oszlop CSAK mátrix-aktív sornál rugalmas (w-full) — a mátrix
                      w-0/min-w-full trükkje így kap valós szélességet. Feltétel NÉLKÜL a
                      w-full az összes többi oszlopot összenyomta (2026-08-29, Endre: „nem
                      látszanak az adatok!" — az év „20."-ra, a megjegyzés csonkra tört). */}
                  <td className={`${isMatrixActive(r) ? 'w-full max-w-0 min-w-[26rem] ' : ''}px-2 py-1.5`}>
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
                        familyLoading={familyLoadingRowId === r.id}
                        updateRow={updateRow}
                        expanded={!collapsedPayerRows.has(r.id)}
                        onToggleExpand={() => togglePayerRow(r.id)}
                        appendPayers={appendPayers}
                        addEmptyPayer={addEmptyPayer}
                        updatePayer={updatePayer}
                        removePayer={removePayer}
                        focusPayerUid={focusPayerUid}
                        onFocusConsumed={() => setFocusPayerUid(null)}
                        renderPayerHint={renderJarulekHint}
                        renderPayerHintCompact={renderJarulekHintKompakt}
                        multiYear={multiYearFor(r)}
                      />
                    )}
                  </td>
                  {tab === 'income' && (
                    <td className="px-2 py-1.5 w-[90px] min-w-[4.5rem]">
                      {dir ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (r.people?.length ?? 0) >= 2 ? (
                        // 2026-08-15 (23. pont): több-éves sornál a címke is ezt mondja ki.
                        <span
                          className="text-[11px] text-slate-400"
                          title={isMatrixActive(r) ? 'Évenként külön tétel — a befizető-mátrixban' : 'Befizetőnként külön év — az almenüben'}
                        >
                          {isMatrixActive(r) ? 'több évre' : 'tagonként'}
                        </span>
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
                  <td className="px-2 py-1.5 w-[120px] min-w-[5.5rem]">
                    {tab === 'income' && (r.people?.length ?? 0) >= 2 ? (
                      <div className="flex h-9 items-center justify-end rounded-md border border-emerald-200 bg-emerald-50/60 px-2 text-sm font-semibold tabular-nums text-emerald-900" title="A befizetők összegeinek összege (automatikus)">
                        {formatRon(payerSum(r))}
                      </div>
                    ) : (
                      <>
                        <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={amountOf(r)} onChange={(e) => setAmountOf(r, e.target.value)} />
                        {/* 2026-07-10 (S2-#1b): ajánlott járulék-összeg (kedvezménnyel) — egy befizetőnél. */}
                        {tab === 'income' && (r.people?.length ?? 0) === 1 && renderJarulekHint(r, r.people![0], 0)}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5 min-w-[6.5rem]"><input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
                {invKat && (
                  <tr className={sorBg}>
                    <td colSpan={9} className="px-2 pb-2 pt-0">
                      {renderInventoryPanel(r, invKat)}
                    </td>
                  </tr>
                )}
                </Fragment>
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
            <div key={r.id} data-entry-card className={`rounded-xl border border-slate-200 p-3 ${i % 2 === 1 ? 'bg-slate-100/80' : 'bg-white'}`} onKeyDown={focusNextField}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{i + 1}. tétel</span>
                <button type="button" aria-label="Sor törlése" className="text-slate-400 hover:text-red-500" onClick={() => removeRow(r.id)}><Trash2 className="size-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-slate-500">Kategória
                  <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                </label>
                {(dir || r.docType === 'Ordin de plată') && (
                  <label className="col-span-2 text-xs text-sky-800">
                    {dir === 'deposit' ? 'Melyik bankszámlára' : dir === 'withdraw' ? 'Melyik bankszámláról' : 'Melyik bankszámlát érinti'}
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
                    <>
                      <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={amountOf(r)} onChange={(e) => setAmountOf(r, e.target.value)} />
                      {/* 2026-07-10 (S2-#1b): ajánlott járulék-összeg (kedvezménnyel) — egy befizetőnél. */}
                      {tab === 'income' && (r.people?.length ?? 0) === 1 && renderJarulekHint(r, r.people![0], 0)}
                    </>
                  )}
                </label>
                {tab === 'income' && !dir && (r.people?.length ?? 0) < 2 && (
                  <label className="text-xs text-slate-500">Melyik évre
                    <input className={inputClass} type="number" inputMode="numeric" value={evreOf(r)} placeholder={String(currentYear)} onChange={(e) => setEvreOf(r, e.target.value)} />
                  </label>
                )}
                {!dir && (
                  <>
                    {/* MOBIL-PARTNERCELL-DIV: szándékosan NEM label-elem — a label-koppintás
                        az első gombot (mátrixban: Kikapcsol) aktiválná, ami adatot dobna el. */}
                    <div className="col-span-2 text-xs text-slate-500">
                      <span className="block">{partnerLabel}</span>
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
                        familyLoading={familyLoadingRowId === r.id}
                        updateRow={updateRow}
                        expanded={!collapsedPayerRows.has(r.id)}
                        onToggleExpand={() => togglePayerRow(r.id)}
                        appendPayers={appendPayers}
                        addEmptyPayer={addEmptyPayer}
                        updatePayer={updatePayer}
                        removePayer={removePayer}
                        focusPayerUid={focusPayerUid}
                        onFocusConsumed={() => setFocusPayerUid(null)}
                        renderPayerHint={renderJarulekHint}
                        renderPayerHintCompact={renderJarulekHintKompakt}
                        multiYear={multiYearFor(r)}
                      />
                    </div>
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
                {/* 2026-08-09: leltár-köteles jogcím → „Leltárba vétel" panel a kártyán is */}
                {tab === 'expense' && !dir && (() => {
                  const invKat = invKategoriaForRow(r)
                  return invKat ? <div className="col-span-2">{renderInventoryPanel(r, invKat)}</div> : null
                })()}
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

      {/* 2026-08-14 (Endre kérése): készpénz-korlát figyelmeztetések a mentés
          előtt — kimondják a szabályt és a mért számot, de NEM blokkolnak. */}
      {keszpenzFigyelmeztetesek.length > 0 && (
        <div
          role="alert"
          className="space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            Készpénzhasználati figyelmeztetés — a mentés lehetséges, de ellenőrizd:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {keszpenzFigyelmeztetesek.map((f, i) => (
              <li key={`${f.kod}-${i}`}>{f.uzenet}</li>
            ))}
          </ul>
        </div>
      )}

      {/* FOOTER-MENTES-SAV (2026-08-29, Endre: „scrollozás nélkül lehessen mindent
          megoldani"): a sáv a dialóg aljára RAGAD — hosszú listánál sem kell a
          mentéshez legörgetni. A -mx-6/px-6 a dialóg szélére húzza a fehér hátteret. */}
      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
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

      {/* ── HASONLÓ TÉTEL MEGERŐSÍTÉS (2026-08-27, Endre 8. kérése) ─────────
          PORTÁL, mert a rögzítő maga is dialógusban ül: egy `fixed inset-0`
          overlay a transzformált ősre igazodna és levágódna. Ugyanaz az ok,
          amiért a FamilyReceiptModal is portálozik.
          FIGYELMEZTETÉS, NEM TILTÁS: a „Mégis rögzítem" gomb továbbenged. */}
      {hasonloTalalatok && hasonloTalalatok.length > 0 &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 p-4 sm:p-8">
            <div className="max-h-[80dvh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
                <h3 className="text-base font-semibold text-amber-900">
                  Hasonló tételt már rögzítettünk a banki résznél
                </h3>
                <p className="mt-1 text-sm text-amber-800">
                  {hasonloTalalatok.length === 1
                    ? 'Egy tétel'
                    : `${hasonloTalalatok.length} tétel`}{' '}
                  ugyanazzal az összeggel, hasonló névvel és néhány napon belüli dátummal
                  már szerepel a könyvben. Lehet, hogy ez ugyanaz a befizetés — nézd meg,
                  mielőtt rögzíted.
                </p>
              </div>
              <div className="max-h-[46dvh] space-y-2 overflow-y-auto px-5 py-4">
                {hasonloTalalatok.map((t, i) => (
                  <div
                    key={`${t.rowId}-${i}`}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-slate-800">
                      {t.datum} · {t.osszeg.toLocaleString('hu-HU')} RON
                    </div>
                    <div className="text-slate-600">{t.nev || '(nincs név)'}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t.iratszam ? `Iratszám: ${t.iratszam} · ` : ''}
                      {t.napEltres === 0
                        ? 'ugyanazon a napon'
                        : `${t.napEltres} nap eltéréssel`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row-reverse">
                <button
                  type="button"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                  onClick={() => {
                    // A felhasználó megerősítette → a kapu egyszer átenged.
                    setHasonloTalalatok(null)
                    setHasonloMegerositve(true)
                    void handleSave()
                  }}
                >
                  Mégis rögzítem
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setHasonloTalalatok(null)}
                >
                  Mégsem — átnézem
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
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
  familyLoading,
  updateRow,
  expanded,
  onToggleExpand,
  appendPayers,
  addEmptyPayer,
  updatePayer,
  removePayer,
  focusPayerUid,
  onFocusConsumed,
  renderPayerHint,
  renderPayerHintCompact,
  multiYear,
}: {
  row: EntryRow
  mode: 'income' | 'expense'
  searchable: boolean
  onSearchMembers?: (query: string) => Promise<CombinedMemberHit[]>
  onSearchExpense?: (query: string) => Promise<string[]>
  /** #5: ha megadva (bevétel), „Család csatolása" gomb — a tagokat a sor befizető-almenüjéhez fűzi. */
  onOpenFamily?: () => void
  /** 2026-08-29: a család-feloldás hálózati hívása fut — a gomb pörög. */
  familyLoading?: boolean
  updateRow: (id: string, patch: Partial<EntryRow>) => void
  /** #4: a befizető-almenü (people[] 2+) nyitva van-e + a chevron-váltás. */
  expanded: boolean
  onToggleExpand: () => void
  /** #4: befizetők hozzáfűzése / üres sor / mező-frissítés / törlés a sor almenüjén. */
  appendPayers: (rowId: string, additions: Array<{ id: number | null; name: string; refId?: string | null; kind?: CombinedPartnerKind; kor?: number | null; lakhely?: string | null }>) => void
  addEmptyPayer: (rowId: string) => void
  updatePayer: (rowId: string, idx: number, patch: Partial<{ id: number | null; name: string; osszeg: string; evre: string; refId: string | null; kind: CombinedPartnerKind; kor: number | null; lakhely: string | null }>) => void
  removePayer: (rowId: string, idx: number) => void
  /** #5: az újonnan hozzáadott befizető uid-je — annak NÉV-mezője fókuszt kap. */
  focusPayerUid?: string | null
  /** 2026-08-30: az autofókusz EGYSZERI — megtörténte után a szülő nullázza a focusPayerUid-ot,
   *  hogy egy későbbi sor-remount ne lophassa a fókuszt a név-mezőbe (id/refId-nullázás!). */
  onFocusConsumed?: () => void
  /** 2026-07-10 (S2-#1b): befizetőnkénti „Ajánlott összeg" jelzés a többfizetős almenüben. */
  renderPayerHint?: (row: EntryRow, p: PayerLike, idx: number) => ReactNode
  /** 2026-08-30 (mátrix): tömör járulék-jelzés egy mátrix-cella alá. */
  renderPayerHintCompact?: (row: EntryRow, p: PayerLike, idx: number) => ReactNode
  /** 2026-08-15 (23. pont) + 2026-08-30: „Több évre fizet" mátrix — csak egyházfenntartás-jogcímen. */
  multiYear?: MultiYearProps
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

  // ── MATRIX-NEZET-KEZDET (2026-08-30, Endre jóváhagyott terve): befizető-mátrix ──
  // Több befizető × több év EGY nyugtán: sorok = befizetők, oszlopok = évek. Endre kérése:
  // „ha 10 évet fizet… akkor is szépen átláthatóan férjen el minden" → a rács SAJÁT vízszintes
  // görgetőben ül, a Befizető-oszlop balra, az Összesen jobbra RAGAD — görgetve is látszik,
  // ki mennyit fizet. Üres cella = arra az évre nem fizet (nem mentődik). Az adat ugyanaz a
  // lapos people[]-modell — a mátrix csak nézet, a mentés/nyugtaszám-lánc érintetlen.
  if (multiYear?.active && people.length >= 1) {
    const csoportok = matrixCsoportok(people)
    const evek = matrixEvek(people)
    // A chip-lista az utolsó ~10 év + a már kiválasztott (akár régebbi) évek uniója.
    const chips = [...multiYear.yearChips]
    evek.forEach((y) => { if (!chips.includes(y)) chips.push(y) })
    chips.sort((a, b) => a - b)
    const evOsszeg = (ev: number) => csoportok.reduce((s, cs) => s + (Number(cs.cellak.get(ev)?.p.osszeg) || 0), 0)
    const tobbSoros = csoportok.length >= 2
    // A sor kulcsa a csoport STABIL azonossága + példány-sorszám — NEM a base uid-ja:
    // korábbi év cellájának kitöltésekor a rendezés új base-t adna, és a sor remountolna
    // (fókuszvesztés az első leütés után). Azonos kulcsú második példány #1-et kap.
    const peldanySzam = new Map<string, number>()
    const sorok = csoportok.map((cs) => {
      const n = peldanySzam.get(cs.kulcs) ?? 0
      peldanySzam.set(cs.kulcs, n + 1)
      return { cs, sorKulcs: `${cs.kulcs}#${n}` }
    })
    return (
      // A szélesség-fegyelmet a BEFOGADÓ td adja (w-full max-w-0, csak mátrix-aktív sornál):
      // az intrinsic méret-járulék 0, így a belső min-w-max nem nyomja szét a külső táblát,
      // a görgető/sticky pedig a td valós szélességén él (10 évnél ez Endre fő kérése).
      <div className="relative space-y-1.5">
        <div className="overflow-visible rounded-lg border border-emerald-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-900">
              <CalendarRange className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
              Több évre fizet — {csoportok.length} befizető × {evek.length} év
            </span>
            <button
              type="button"
              onClick={multiYear.onDisable}
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-emerald-700/70 transition hover:bg-emerald-100"
              title="Vissza az egy-éves rögzítéshez (befizetőnként csak az első év marad meg)"
            >
              Kikapcsol
            </button>
          </div>
          <div className="flex flex-wrap gap-1 px-2.5 py-2">
            {chips.map((y) => {
              const on = evek.includes(y)
              const last = on && evek.length === 1
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={on}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => multiYear.onToggleYear(y)}
                  title={
                    last
                      ? 'Legalább egy évnek kijelölve kell maradnia'
                      : on
                        ? 'Év kivétele — az oszlop MINDEN összege törlődik'
                        : 'Év hozzáadása — minden befizető kap egy cellát, az összeg az adott évi járulékkal töltődik ki'
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                    on
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  {y}
                </button>
              )
            })}
          </div>
          {/* A RÁCS — 10+ évnél vízszintesen görgethető, a szélső oszlopok ragadnak. */}
          <div className="overflow-x-auto border-t border-emerald-100">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr>
                  {/* Mobilon keskenyebb név-oszlop, és az Összesen csak sm-től ragad —
                      különben a két ragadó fal közt egyetlen év-cella sem férne el (375px). */}
                  <th className="sticky left-0 z-10 min-w-[7rem] bg-emerald-50 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 sm:min-w-[9rem]">
                    Befizető
                  </th>
                  {evek.map((ev) => (
                    <th key={ev} className="min-w-[4.5rem] bg-emerald-50/60 px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums text-emerald-900 sm:min-w-[5.5rem]">
                      <span className="inline-flex items-center gap-1">
                        {ev}
                        {evek.length > 1 && (
                          <button
                            type="button"
                            aria-label={`A(z) ${ev}. év oszlopának törlése`}
                            title="Az év oszlopa és MINDEN benne lévő összeg törlődik"
                            className="rounded px-0.5 text-[10px] font-normal text-emerald-700/50 transition hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => multiYear.onToggleYear(ev)}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="z-10 bg-emerald-50 px-2.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 sm:sticky sm:right-0">
                    Összesen
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorok.map(({ cs, sorKulcs }) => {
                  const sorOsszeg = [...cs.cellak.values()].reduce((s, c) => s + (Number(c.p.osszeg) || 0), 0)
                  const azonositott = cs.base.id != null || !!cs.base.refId || cs.base.name.trim() !== ''
                  return (
                    <tr key={sorKulcs}>
                      <td className="sticky left-0 z-10 min-w-[7rem] border-b border-slate-100 bg-white px-2 py-1 sm:min-w-[9rem]">
                        <div className="flex items-center gap-1">
                          <div className="min-w-0 flex-1">
                            <PayerNameSearch
                              value={cs.base.name}
                              linked={cs.base.id != null || !!cs.base.refId}
                              onSearch={searchFn}
                              placeholder="Befizető neve"
                              onType={(t) => multiYear.onUpdateGroup(cs.uids, { name: t, id: null, refId: null, kind: 'szemely' })}
                              onPick={(h) => multiYear.onUpdateGroup(cs.uids, payerFromHit(h))}
                              autoFocus={[...cs.cellak.values()].some((c) => c.p.uid === focusPayerUid)}
                              onAutoFocused={onFocusConsumed}
                              showUnlinkedBadge
                            />
                            {payerInfoText(cs.base) !== '' && (
                              <p className="truncate pl-1 text-[10px] leading-tight text-slate-500">{payerInfoText(cs.base)}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label="Befizető törlése"
                            title="Befizető törlése — minden évével együtt"
                            className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => multiYear.onRemoveGroup(cs.uids)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      {evek.map((ev) => {
                        const cella = cs.cellak.get(ev)
                        return (
                          <td key={`${cs.kulcs}:${ev}`} className="border-b border-slate-100 px-1.5 py-1 align-top">
                            <input
                              className={`${inputClass} h-8 w-[4.5rem] text-right tabular-nums sm:w-[5.5rem]`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={cella?.p.osszeg ?? ''}
                              placeholder="—"
                              disabled={!cella && !azonositott}
                              title={
                                !cella && !azonositott
                                  ? 'Előbb írd be a befizető nevét'
                                  : `${cs.base.name || 'A befizető'} — ${ev}. évi összeg (üresen hagyva: erre az évre nem fizet)`
                              }
                              onChange={(e) => {
                                const v = e.target.value
                                if (cella) {
                                  // A kiürített cella jelölést kap: az auto-kitöltés (dátum-/
                                  // tagváltás után se) nem töltheti vissza — „üres = nem fizet".
                                  multiYear.onCellaUrites(cella.p.uid, v === '')
                                  updatePayer(row.id, cella.idx, { osszeg: v })
                                } else if (v !== '') {
                                  multiYear.onAddCell(cs.base, ev, v)
                                }
                              }}
                            />
                            {cella && renderPayerHintCompact?.(row, cella.p, cella.idx)}
                          </td>
                        )
                      })}
                      <td className={`z-10 border-b border-slate-100 bg-white px-2.5 py-1 text-right font-semibold tabular-nums sm:sticky sm:right-0 ${sorOsszeg > 0 ? 'text-emerald-900' : 'text-amber-600'}`}>
                        <span title={sorOsszeg > 0 ? undefined : 'Minden cella üres — ez a befizető nem mentődik'}>
                          {formatRon(sorOsszeg)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {tobbSoros && (
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-10 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
                      Évente
                    </td>
                    {evek.map((ev) => (
                      <td key={ev} className="bg-emerald-50/60 px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-900">
                        {formatRon(evOsszeg(ev))}
                      </td>
                    ))}
                    <td className="z-10 bg-emerald-50 px-2.5 py-1.5 text-right font-bold tabular-nums text-emerald-900 sm:sticky sm:right-0">
                      {formatRon(sum)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50/70 px-2.5 py-2">
            <span className="text-[11px] font-medium text-emerald-700/80">
              Üres cella = arra az évre nem fizet (nem mentődik)
            </span>
            <span className="text-sm font-bold tabular-nums text-emerald-800">
              Nyugta összesen: {formatRon(sum)} RON
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => addEmptyPayer(row.id)}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            title="Még egy befizető ugyanarra a nyugtára — új sor a mátrixban"
          >
            <Plus className="size-3.5" /> Még egy befizető
          </button>
          {onOpenFamily && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenFamily}
              disabled={familyLoading}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
              title="Családi nyugta — a tagok a mátrix soraiba kerülnek"
            >
              {familyLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
              {familyLoading ? 'Család keresése…' : 'Család csatolása'}
            </button>
          )}
        </div>
      </div>
    )
  }
  // ── MATRIX-NEZET-VEG ──

  // ── Üres / egyszemélyes / kiadás: a befizető NEVE maga a kereső-mező ────────
  if (!isMulti) {
    const single = mode === 'income' && people.length === 1 ? people[0] : null
    return (
      <div className="relative space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <PayerNameSearch
              value={single ? single.name : row.partner}
              linked={!!single && (single.id != null || !!single.refId)}
              onSearch={searchFn}
              showUnlinkedBadge={mode === 'income'}
              placeholder={
                mode === 'income'
                  ? 'Befizető neve — itt keres a tagok közt (vagy szabad szöveg)'
                  : 'Cég/személy — itt keres a korábbiak közt (vagy szabad szöveg)'
              }
              onType={(t) => {
                // ⚠️ A refId-t IS nullázni kell: ha a felhasználó átírja egy kiválasztott
                // gyülekezet nevét, a mentés NEM vihet magával egy immár hamis partner-FK-t.
                if (single) updatePayer(row.id, 0, { name: t, id: null, refId: null, kind: 'szemely' })
                else updateRow(row.id, { partner: t })
              }}
              onPick={(h) => {
                if (mode === 'expense') updateRow(row.id, { partner: h.name })
                else if (single) updatePayer(row.id, 0, payerFromHit(h))
                else appendPayers(row.id, [payerFromHit(h)])
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
        {/* 2026-08-29 (Endre): a kiválasztott személy életkora + lakhelye is látszódjon —
            azonos nevűeknél (pl. apa és fia) e nélkül nem tudni, KI lett beillesztve. */}
        {single && payerInfoText(single) !== '' && (
          <p className="truncate pl-1 text-[10px] leading-tight text-slate-500">{payerInfoText(single)}</p>
        )}
        {mode === 'income' && (
          <div className="space-y-1">
            {/* #4 (Endre): a „Még egy befizető" mindig látható, kiemelt pill-gomb, és már
                a 0-fizetős (szabadszavas) állapotban is elérhető — nem csak miután van tag. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addEmptyPayer(row.id)}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                title="Még egy befizető ugyanarra a nyugtára (lenyitható almenü, tagonként összeg)"
              >
                <Plus className="size-3.5" /> Még egy befizető
              </button>
              {/* 2026-08-15 (23. pont): egyházfenntartás + 1 regisztrált befizető → több-éves mód. */}
              {multiYear && !multiYear.active && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={multiYear.onEnable}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
                  title="Egy nyugtával több év egyházfenntartói járuléka — évenként külön tétel, az összegek az adott évi járulékkal automatikusan kitöltve"
                >
                  <CalendarRange className="size-3.5" /> Több évre fizet
                </button>
              )}
              {onOpenFamily && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onOpenFamily}
                  disabled={familyLoading}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
                  title="Családi nyugta — a tagok a befizető-almenübe kerülnek (tagonként összeg)"
                >
                  {familyLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
                  {familyLoading ? 'Család keresése…' : 'Család csatolása'}
                </button>
              )}
            </div>
            {people.length === 0 && (
              <p className="text-[10.5px] leading-tight text-slate-400">
                Több befizető egy nyugtára? Kattints a{' '}
                <span className="font-medium text-emerald-600">&bdquo;Még egy befizető&rdquo;</span>-re — mindenki külön összeggel.
              </p>
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
          {/* 2026-07-10 (S2-#2): kártyás/csoportosított befizető-lista a dispozitie-incasare-wizard
              mintájára — kezdőbetűs avatar + sorszám, váltakozó sor-háttér, összegek jobbra igazítva. */}
          {people.map((p, i) => {
            const zero = !(Number(p.osszeg) > 0)
            const hint = renderPayerHint?.(row, p, i)
            return (
              <div key={p.uid} className="border-b border-slate-50 px-2.5 py-1 last:border-b-0 odd:bg-slate-50/40">
                <div className="grid grid-cols-[1fr_6rem_4.5rem_2rem] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 text-[11px] font-semibold text-emerald-700 sm:flex"
                      title={`${i + 1}. befizető`}
                    >
                      {p.name.trim() ? p.name.trim()[0].toUpperCase() : String(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <PayerNameSearch
                        value={p.name}
                        linked={p.id != null || !!p.refId}
                        onSearch={searchFn}
                        placeholder="Név — itt keres (vagy szabad szöveg)"
                        onType={(t) => updatePayer(row.id, i, { name: t, id: null, refId: null, kind: 'szemely' })}
                        onPick={(h) => updatePayer(row.id, i, payerFromHit(h))}
                        autoFocus={focusPayerUid === p.uid}
                        onAutoFocused={onFocusConsumed}
                        showUnlinkedBadge
                      />
                      {payerInfoText(p) !== '' && (
                        <p className="truncate pl-1 text-[10px] leading-tight text-slate-500">{payerInfoText(p)}</p>
                      )}
                    </div>
                  </div>
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
                {/* 2026-07-10 (S2-#1b): befizetőnkénti ajánlott járulék-összeg (kedvezménnyel). */}
                {/* jobbra igazítva, az Összeg oszlop alá (Év 4.5rem + törlés 2rem + 2 gap 0.5rem). */}
                {hint && <div className="flex justify-end pb-0.5 pr-[7.5rem] max-sm:pr-0">{hint}</div>}
              </div>
            )
          })}
          {/* 2026-07-10 (S2-#2): a nyugta ÖSSZESEN sora kiemelve (zöld sáv) — a wizard mintájára. */}
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50/70 px-2.5 py-2">
            <span className="text-[11px] font-medium text-emerald-700/80">{people.length} befizető — egy nyugta</span>
            <span
              className={`text-sm font-bold tabular-nums ${missing ? 'text-amber-600' : 'text-emerald-800'}`}
              title={missing ? 'Van befizető összeg nélkül — az nem mentődik' : undefined}
            >
              Nyugta összesen: {formatRon(sum)} RON{missing ? ' ⚠' : ''}
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => addEmptyPayer(row.id)}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
          title="Még egy befizető ugyanarra a nyugtára"
        >
          <Plus className="size-3.5" /> Még egy befizető
        </button>
        {/* 2026-08-30 (mátrix): több befizetőnél is felajánljuk — a lista áttekinthető
            ráccsá alakul (sorok = befizetők, oszlopok = évek). */}
        {multiYear && !multiYear.active && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={multiYear.onEnable}
            className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
            title="Több év egy nyugtán — a lista áttekinthető ráccsá alakul (sorok = befizetők, oszlopok = évek), az összegek az adott évi járulékkal automatikusan kitöltve"
          >
            <CalendarRange className="size-3.5" /> Több évre fizet
          </button>
        )}
        {onOpenFamily && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenFamily}
            disabled={familyLoading}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
          >
            {familyLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
            {familyLoading ? 'Család keresése…' : 'Család csatolása'}
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
  autoFocus,
  onAutoFocused,
  showUnlinkedBadge,
}: {
  value: string
  linked: boolean
  onType: (text: string) => void
  onPick: (hit: CombinedMemberHit) => void
  onSearch: (query: string) => Promise<CombinedMemberHit[]>
  placeholder: string
  /** #5: mountkor fókusz — a „Még egy befizető" után azonnal írható az új név. */
  autoFocus?: boolean
  /** A fókusz megtörtént — a szülő ebből tudja egyszerivé tenni (stale re-fókusz ellen). */
  onAutoFocused?: () => void
  /** #5: „nem tag" jelvény szabad-szöveges (nem párosított) névnél — csak bevételnél. */
  showUnlinkedBadge?: boolean
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

  // #5: az újonnan hozzáadott befizető mezője automatikus fókuszt kap.
  useEffect(() => {
    if (autoFocus) queueMicrotask(() => { inputRef.current?.focus(); onAutoFocused?.() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

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
        // 2026-08-22 (5a): 8 → 12. A gyülekezeti kereső látványa NEM változik
        // (a szerver ott `limit(8)`-cal jön), a felső szintű, CSOPORTOSÍTOTT
        // lista viszont 8-nál elvágná a második csoportot (pl. a lelkészeket).
        .then((res) => { setHits(res.slice(0, 12)); setOpen(res.length > 0) })
        .catch(() => { setHits([]); setOpen(false) })
    }, 300)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, linked])

  // ── 2026-08-22 (5a): CSOPORTOSÍTOTT találati lista ────────────────────────
  // Felső szinten három FÉLE partner jöhet egyszerre (gyülekezet / egyházmegye /
  // lelkipásztor), és egy vegyes, felirat nélküli lista félrevezető: a lelkész
  // NEVE önmagában nem árulja el, hogy ő NEM a befizető jogi személy.
  //
  // ⚠️ REGRESSZIÓ-VÉDELEM: a fejlécek CSAK akkor jelennek meg, ha van legalább
  //    egy nem-személy találat. A gyülekezeti tag-kereső és a kiadás-partner
  //    autocomplete `kind` nélkül jön → `csoportositott === false` → a lista
  //    látványa BYTE-AZONOS a mai állapottal.
  const csoportositott = hits.some((h) => (h.kind ?? 'szemely') !== 'szemely')
  const csoportok = PARTNER_CSOPORT_SORREND
    .map((kind) => ({ kind, elemek: hits.filter((h) => (h.kind ?? 'szemely') === kind) }))
    .filter((cs) => cs.elemek.length > 0)

  return (
    <div className="relative flex items-center gap-1.5">
      {linked && (
        <span
          className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
          title="Beillesztett befizető (regisztrált tag vagy hivatalos partner)"
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
      {/* #5: nem párosított (szabad-szöveges) név — nem gyülekezeti tag is adhat adományt. */}
      {showUnlinkedBadge && !linked && value.trim().length >= 2 && !open && (
        <span
          className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500"
          title="Nincs taghoz kötve — szabad szövegként mentődik (nem gyülekezeti tag is adhat)"
        >
          nem tag
        </span>
      )}
      {open && hits.length > 0 && dropRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl ring-1 ring-black/5"
            style={{ left: dropRect.left, top: dropRect.top, width: Math.max(dropRect.width, 280) }}
          >
            {csoportok.map(({ kind, elemek }) => (
              <div key={kind}>
                {/* A csoport-fejléc CSAK felső szinten jelenik meg (lásd `csoportositott`):
                    a gyülekezeti tag-kereső és a kiadás-partner lista látványa változatlan. */}
                {csoportositott && (
                  <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {PARTNER_CSOPORT_FELIRAT[kind]}
                  </div>
                )}
                {elemek.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-emerald-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { justPickedRef.current = true; onPick(h); setHits([]); setOpen(false) }}
                  >
                    {/* Kezdőbetűs avatar — letisztult, „apple" jelleg */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 text-xs font-semibold text-emerald-700">
                      {(h.name.trim()[0] || '?').toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{h.name}</span>
                        {h.age != null && (
                          <span
                            className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 group-hover:bg-white"
                            title={h.birthYear ? `Született: ${h.birthYear}` : undefined}
                          >
                            {h.age} éves
                          </span>
                        )}
                      </span>
                      {h.detail && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{h.detail}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
