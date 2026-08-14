'use client'

/**
 * BcrImportWizardBody — BCR Excel import wizard KÖZÖS törzse
 * (2026-06-12, Endre #4 bank-import).
 *
 * A webes `apps/web/components/modals/bcr-import-wizard-dialog.tsx`
 * platform-függetlenné emelt változata: MINDEN hálózati/server hívás
 * callback-PROP-on érkezik (onParseFile, onImport, onLoadNyitoEgyenleg, ...),
 * így a web (server actionök) és a desktop (core use-case-ek +
 * getDesktopSupabase) ugyanazt a wizardot használja.
 *
 * Lépések:
 *   1. Fájl feltöltés (xlsx) + target bankszámla választás
 *   2. Év eleji nyitó egyenleg (ha az évre még nincs rögzítve)
 *   3. Tételek kategorizálása — minden sornál: bevétel / kiadás /
 *      belső mozgás (kassza ↔ bank) / kihagyás + kategória
 *   4. Összefoglaló + importálás
 *
 * Megjelenési módok:
 *   - default: Dialog-héjban (web — a régi viselkedés pixelre azonos),
 *   - `inline`: Dialog NÉLKÜL, sima kártya-div-ben (desktop oldal-törzs).
 *
 * A ui-app NEM importál core-ból — a BankImportItem/Result típusok itt
 * lokálisan definiáltak (szerkezetileg azonosak a core-belivel).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  FileSpreadsheet,
  Upload,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Landmark,
} from 'lucide-react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kartoteka/ui'

import { SearchableCategorySelect } from './SearchableCategorySelect'
import type { BankAccount, NyitoEgyenlegRow } from './types'

// ─────────────────────────────────────────────────────────────
// Lokális típusok (a core megfelelőivel szerkezetileg azonosak)
// ─────────────────────────────────────────────────────────────

/** Egy beolvasott banki tranzakció — a parser (web/core) kimenete. */
export type BcrWizardTransaction = {
  /** Az Excel sor indexe (1-től). */
  rowIndex: number
  /** Tranzakció dátuma (YYYY-MM-DD). */
  date: string
  /** Leírás — amit a bank küldött. */
  description: string
  /** Referencia (opcionális). */
  reference?: string | null
  /** Összeg — ELŐJELESEN: > 0 jóváírás (bevétel), < 0 terhelés (kiadás). */
  amount: number
  /** Egyenleg a tranzakció után (opcionális). */
  balance?: number | null
  /** Kedvezményezett / küldő (ha kiolvasható). */
  counterparty?: string | null
}

/** A parse-callback eredménye (a webes/core parse-eredmény közös metszete). */
export type BcrWizardParseResult = {
  transactions: BcrWizardTransaction[]
  error: string | null
}

export type BankImportItemAction = 'income' | 'expense' | 'internal-transfer' | 'skip'

export type BankImportItem = {
  rowIndex: number
  date: string
  description: string
  reference?: string
  /** Előjeles összeg (negatív = kiadás, pozitív = bevétel). */
  amount: number
  counterparty?: string
  action: BankImportItemAction
  bankszamlaId: number
  categoryId?: number
  transferTo?: 'kassza' | number
  personId?: number
  megjegyzes?: string
  iratszam?: string
}

export type BankImportResult = {
  totalItems: number
  imported: number
  skipped: number
  duplicates: number
  errors: Array<{ rowIndex: number; error: string }>
}

/** Nyitó egyenleg upsert input (a core UpsertNyitoEgyenlegInput tükre). */
export type WizardNyitoEgyenlegUpsertInput = {
  bankszamla_id: number
  eve: number
  nyito_egyenleg_valuta: number
  nyito_egyenleg_ron?: number | null
  arfolyam?: number | null
  forrasa?: 'manual' | 'import' | 'carryover'
  megjegyzes?: string | null
}

/** Év eleji állapot-ellenőrzés eredménye (a core YearStartCheckResult tükre). */
export type WizardYearStartCheckResult = {
  valuta: string
  hasPreviousYear: boolean
  hasPreviousYearFxRevaluation: boolean
  prevYearClosingValuta: number | null
  prevYearRevaluedRon: number | null
  prevYearArfolyam: number | null
  newYearValuta: number
  newYearArfolyam: number
  newYearRon: number
  status: 'ok_matching' | 'ok_no_previous' | 'fx_revaluation_needed' | 'arfolyam_mismatch'
  message: string
  mismatchDiff: number | null
}

/** 2026-07-10 (nyitó-carryover): az előző évi záróból számolt nyitó
 *  (a core CarryoverNyitoResult tükre — a ui-app nem importál a core-ból). */
export type WizardCarryoverNyitoResult = {
  available: boolean
  reason?: 'no_prev_data' | 'missing_prev_nyito' | 'fx_revaluation_needed'
  eve: number
  prevYear: number
  valuta: string
  nyitoValuta?: number
  nyitoRon?: number
  arfolyam?: number | null
  prevNyito?: number
  prevBevetel?: number
  prevKiadas?: number
  prevTetelDb?: number
  fallbackValuta?: number
}

/** BNR árfolyam-lekérdezés eredménye (a webes fetchBnrRateAction alakja). */
export type BnrRateResult = {
  date: string | null
  eur: number | null
  huf: number | null
  source?: 'bnr' | 'frankfurter' | 'none'
  error?: string
}

type WizardStep = 'upload' | 'opening-balance' | 'categorize' | 'confirm' | 'done'

type RowDecision = {
  action: BankImportItemAction
  categoryId?: number
  transferToKassza?: boolean
  note?: string
  /** Iratszám (szerkeszthető a wizardban — pl. számla szám, nyugta szám). */
  iratszam?: string
}

export interface BcrImportWizardBodyProps {
  /** Dialog-módban a láthatóság; inline módban hagyd default true-n. */
  open?: boolean
  onOpenChange: (open: boolean) => void
  bankAccounts: BankAccount[]
  /** Bevétel-kategóriák (id_befizetescel). */
  incomeCategories: Array<{ id: number; kod: string; nev: string }>
  /** Kiadás-kategóriák (id_kiadascel). */
  expenseCategories: Array<{ id: number; kod: string; nev: string }>
  onImported?: () => void | Promise<void>
  /** true: Dialog-héj NÉLKÜL, sima div-ben renderel (desktop oldal-törzs). */
  inline?: boolean
  /** UI-visszajelzés (web: sonner; desktop: page-toast). */
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
  /** A kiválasztott Excel-fájl parsolása (web: kliens-parser; desktop: core parseBankExport). */
  onParseFile: (file: File) => Promise<BcrWizardParseResult>
  /** A legutolsó banki tranzakció dátuma az adott bankszámlán. */
  onGetLatestDate: (bankszamlaId: number) => Promise<{ date?: string | null; error?: string }>
  /** Éves nyitó egyenleg lekérdezése. */
  onLoadNyitoEgyenleg: (
    bankszamlaId: number,
    eve: number,
  ) => Promise<{ data?: NyitoEgyenlegRow | null; error?: string }>
  /** Éves nyitó egyenleg rögzítése/frissítése. */
  onUpsertNyitoEgyenleg: (
    input: WizardNyitoEgyenlegUpsertInput,
  ) => Promise<{ success?: boolean; id?: number; error?: string }>
  /** Év eleji állapot-ellenőrzés (FX revaluation megléte stb.). */
  onCheckYearStart: (args: {
    bankszamlaId: number
    eve: number
    newYearValuta: number
    newYearArfolyam: number
  }) => Promise<{ data?: WizardYearStartCheckResult | null; error?: string }>
  /** BNR/ECB árfolyam-lekérdezés (targetDate: historikus ISO-dátum vagy undefined = friss). */
  onFetchBnrRate: (targetDate?: string) => Promise<BnrRateResult>
  /** 2026-07-10 (nyitó-carryover): az előző évi záróból számolt nyitó —
   *  ha megadva és van tavalyi adat, a nyitó lépés kitöltve jelenik meg. */
  onComputeCarryoverNyito?: (
    bankszamlaId: number,
    eve: number,
  ) => Promise<{ data?: WizardCarryoverNyitoResult | null; error?: string }>
  /** A batch-import futtatása. */
  onImport: (items: BankImportItem[]) => Promise<BankImportResult & { error?: string }>
}

export function BcrImportWizardBody({
  open = true,
  onOpenChange,
  bankAccounts,
  incomeCategories,
  expenseCategories,
  onImported,
  inline = false,
  onToast,
  onParseFile,
  onGetLatestDate,
  onLoadNyitoEgyenleg,
  onUpsertNyitoEgyenleg,
  onCheckYearStart,
  onFetchBnrRate,
  onComputeCarryoverNyito,
  onImport,
}: BcrImportWizardBodyProps) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [parsing, setParsing] = useState(false)
  const [transactions, setTransactions] = useState<BcrWizardTransaction[]>([])
  const [decisions, setDecisions] = useState<Record<number, RowDecision>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    duplicates: number
    errors: Array<{ rowIndex: number; error: string }>
  } | null>(null)
  const [latestImportedDate, setLatestImportedDate] = useState<string | null>(null)
  const [hideOlder, setHideOlder] = useState(true)
  /** Nyitó egyenleg állapot (év eleji) */
  const [nyitoEve, setNyitoEve] = useState<number>(new Date().getFullYear())
  // A meglévő nyitó-rekordot csak eltároljuk (mező-előtöltéshez) — a változó
  // maga nem kerül kiolvasásra, ezért csak a setter él (desktop tsc: noUnusedLocals).
  const [, setNyitoExisting] = useState<NyitoEgyenlegRow | null>(null)
  const [nyitoValuta, setNyitoValuta] = useState<number | ''>('')
  const [nyitoRon, setNyitoRon] = useState<number | ''>('')
  const [nyitoArfolyam, setNyitoArfolyam] = useState<number | ''>('')
  const [savingNyito, setSavingNyito] = useState(false)
  /** 2026-07-10 (nyitó-carryover): az előző évi záróból automatikusan
   *  áthozott nyitó — a banner + a forrasa:'carryover' jelölés alapja. */
  const [carryover, setCarryover] = useState<WizardCarryoverNyitoResult | null>(null)
  /** BNR árfolyam lekérdezés állapot. */
  const [loadingBnr, setLoadingBnr] = useState(false)
  const [bnrInfo, setBnrInfo] = useState<string | null>(null)
  /** Év eleji állapot ellenőrzés (a helyes könyvelési logikával). */
  const [yearStartCheck, setYearStartCheck] = useState<WizardYearStartCheckResult | null>(null)

  // A kiválasztott bankszámla gyorsabb hivatkozás — a state-ek után hogy a
  // dependency array-ben használható legyen.
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId)

  useEffect(() => {
    if (!open) {
      // reset
      setStep('upload')
      setFile(null)
      setSelectedBankId(null)
      setTransactions([])
      setDecisions({})
      setImportResult(null)
      setCarryover(null)
    }
  }, [open])

  async function handleParse() {
    if (!file) {
      onToast('Válassz egy Excel fájlt.', 'error')
      return
    }
    if (!selectedBankId) {
      onToast('Válassz egy bankszámlát.', 'error')
      return
    }
    setParsing(true)
    try {
      // Párhuzamosan parse-oljuk a fájlt ÉS lekérdezzük a legújabb banki
      // tranzakció dátumát — utóbbi a duplikációhoz hasznos UI szűrőhöz.
      const [parseRes, latestRes] = await Promise.all([
        onParseFile(file),
        onGetLatestDate(selectedBankId),
      ])
      if (parseRes.error) {
        onToast(parseRes.error, 'error')
        return
      }
      setTransactions(parseRes.transactions)
      // A régebbi import legújabb dátumát eltároljuk szűrőhöz
      setLatestImportedDate(latestRes.date ?? null)
      // Ha egyáltalán van régebbi import, alapértelmezetten szűrünk
      setHideOlder(!!latestRes.date)
      // Alapértelmezett döntések: pozitív → income, negatív → expense
      const d: Record<number, RowDecision> = {}
      for (const t of parseRes.transactions) {
        d[t.rowIndex] = {
          action: t.amount >= 0 ? 'income' : 'expense',
        }
      }
      setDecisions(d)

      // ── Nyitó egyenleg ellenőrzése ──
      // A tranzakciók legkorábbi évére nézünk meg egy bankszamla_nyito_egyenleg
      // rekordot. Ha nincs, az 'opening-balance' lépéssel folytatódunk.
      const sortedDates = [...parseRes.transactions]
        .map((t) => t.date)
        .filter(Boolean)
        .sort()
      const earliestYear = sortedDates.length > 0
        ? new Date(sortedDates[0]).getFullYear()
        : new Date().getFullYear()
      setNyitoEve(earliestYear)

      const nyitoRes = await onLoadNyitoEgyenleg(selectedBankId, earliestYear)
      const existing = nyitoRes.data ?? null
      setNyitoExisting(existing)
      setCarryover(null)
      if (existing) {
        setNyitoValuta(Number(existing.nyito_egyenleg_valuta))
        setNyitoRon(Number(existing.nyito_egyenleg_ron))
        setNyitoArfolyam(existing.arfolyam ? Number(existing.arfolyam) : '')
        setStep('categorize')
      } else {
        // 2026-07-10 (nyitó-carryover): ha az ELŐZŐ évben már volt import /
        // banki forgalom, a nyitó NEM kézi adat — a tavalyi záróból hozzuk át.
        // A lépés így is megjelenik (ellenőrizhető + felülírható), de kitöltve.
        const carry = onComputeCarryoverNyito
          ? ((await onComputeCarryoverNyito(selectedBankId, earliestYear)).data ?? null)
          : null
        setCarryover(carry)
        if (carry?.available && typeof carry.nyitoValuta === 'number') {
          setNyitoValuta(carry.nyitoValuta)
          setNyitoRon(typeof carry.nyitoRon === 'number' ? carry.nyitoRon : '')
          setNyitoArfolyam(typeof carry.arfolyam === 'number' ? carry.arfolyam : '')
        } else if (
          carry?.reason === 'fx_revaluation_needed' &&
          typeof carry.fallbackValuta === 'number'
        ) {
          // Deviza-összeg előszámolva; a RON-t a dec. 31-i átértékelés adja majd.
          setNyitoValuta(carry.fallbackValuta)
          setNyitoRon('')
          setNyitoArfolyam('')
        } else {
          // Alapértékek
          setNyitoValuta('')
          setNyitoRon('')
          setNyitoArfolyam('')
        }
        setStep('opening-balance')
      }

      const oldCount = latestRes.date
        ? parseRes.transactions.filter((t) => t.date <= latestRes.date!).length
        : 0
      onToast(
        `${parseRes.transactions.length} tranzakció beolvasva` +
          (oldCount > 0
            ? ` (${oldCount} db ${latestRes.date} dátumon vagy korábbi — alapértelmezetten elrejtve)`
            : '') +
          '.',
        'success',
      )
    } finally {
      setParsing(false)
    }
  }

  // Élő év eleji állapot ellenőrzés — a KÖNYVELÉSI gyakorlatnak megfelelően.
  // (FX revaluation december 31-re, nem január 1-re — ezért csak ellenőrzünk,
  // NEM könyvelünk.)
  useEffect(() => {
    if (step !== 'opening-balance') return
    if (!selectedBankId) return
    const isRon = (selectedBank?.valuta || 'RON') === 'RON'
    if (isRon) { setYearStartCheck(null); return }
    if (typeof nyitoValuta !== 'number' || typeof nyitoArfolyam !== 'number' || nyitoArfolyam <= 0) {
      setYearStartCheck(null)
      return
    }
    let cancelled = false
    void onCheckYearStart({
      bankszamlaId: selectedBankId,
      eve: nyitoEve,
      newYearValuta: nyitoValuta,
      newYearArfolyam: nyitoArfolyam,
    }).then((res) => {
      if (cancelled) return
      setYearStartCheck(res.data ?? null)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedBankId, selectedBank?.valuta, nyitoValuta, nyitoArfolyam, nyitoEve])

  async function handleFetchBnr() {
    setLoadingBnr(true)
    setBnrInfo(null)
    try {
      // A célév január 1-i árfolyamát kérjük — a Frankfurter/BNR automatikusan
      // a legközelebbi publikált (januári első munkanap, gyakorlatban az
      // előző év december 31-i érvényes) árfolyamot adja vissza.
      // Ez egyezik a könyvelési gyakorlattal: a nyitó egyenleghez az előző
      // év zárás árfolyamát használjuk.
      const currentYear = new Date().getFullYear()
      const isCurrentYear = nyitoEve === currentYear
      const targetDate = isCurrentYear ? undefined : `${nyitoEve}-01-01`

      const res = await onFetchBnrRate(targetDate)
      const valuta = selectedBank?.valuta || 'RON'
      const rate = valuta === 'EUR' ? res.eur : valuta === 'HUF' ? res.huf : null

      if (!rate) {
        const msg = res.error || `A ${valuta} árfolyam nem elérhető ${nyitoEve}-re.`
        onToast(msg, 'error')
        setBnrInfo(
          `⚠️ Árfolyam nem tölthető le. Nézd meg: bnr.ro/Exchange-rates-1224.aspx`,
        )
        return
      }

      setNyitoArfolyam(rate)
      const sourceLabel =
        res.source === 'bnr' ? 'BNR' :
        res.source === 'frankfurter' ? 'Frankfurter (ECB)' :
        'online'
      const dateLabel = res.date || (isCurrentYear ? 'friss' : `${nyitoEve}-01`)
      const contextLabel = isCurrentYear
        ? 'legfrissebb publikáció'
        : `${nyitoEve}. évre érvényes (BNR/ECB január 1-i árfolyama)`
      setBnrInfo(`${sourceLabel} ${valuta} árfolyam: ${rate} (${dateLabel}) — ${contextLabel}`)
      if (typeof nyitoValuta === 'number') {
        setNyitoRon(Number((nyitoValuta * rate).toFixed(2)))
      }
      if (res.source === 'bnr') {
        onToast(
          `BNR árfolyam betöltve a ${nyitoEve}. évre: 1 ${valuta} = ${rate} RON (${dateLabel})`,
          'success',
        )
      } else if (res.source === 'frankfurter') {
        onToast(
          `Fallback (Frankfurter/ECB) árfolyam a ${nyitoEve}. évre: 1 ${valuta} = ${rate} RON — a BNR nem volt elérhető, de ez az ECB hivatalos árfolyama.`,
          'success',
        )
      }
    } finally {
      setLoadingBnr(false)
    }
  }

  // Opening balance lépés: mentés után tovább categorize-ra
  async function handleSaveNyito() {
    if (!selectedBankId) return
    if (typeof nyitoValuta !== 'number' || !Number.isFinite(nyitoValuta)) {
      onToast(`Add meg az év eleji nyitó egyenleget (${selectedBank?.valuta || 'RON'}).`, 'error')
      return
    }
    const isRon = (selectedBank?.valuta || 'RON') === 'RON'
    if (!isRon) {
      const ronOk = typeof nyitoRon === 'number' && Number.isFinite(nyitoRon)
      const arfOk = typeof nyitoArfolyam === 'number' && nyitoArfolyam > 0
      if (!ronOk && !arfOk) {
        onToast('Valutás számlánál adj meg RON ekvivalenst VAGY árfolyamot.', 'error')
        return
      }
    }
    setSavingNyito(true)
    try {
      // 2026-07-10 (nyitó-carryover): ha az automatikusan áthozott érték
      // változatlanul megy mentésre, a forrása 'carryover' — ha átírták, 'manual'.
      const isUntouchedCarryover =
        carryover?.available === true &&
        typeof carryover.nyitoValuta === 'number' &&
        nyitoValuta === carryover.nyitoValuta
      const res = await onUpsertNyitoEgyenleg({
        bankszamla_id: selectedBankId,
        eve: nyitoEve,
        nyito_egyenleg_valuta: nyitoValuta,
        nyito_egyenleg_ron: typeof nyitoRon === 'number' ? nyitoRon : null,
        arfolyam: typeof nyitoArfolyam === 'number' ? nyitoArfolyam : null,
        forrasa: isUntouchedCarryover ? 'carryover' : 'manual',
        megjegyzes:
          isUntouchedCarryover && carryover
            ? `Automatikusan áthozva a ${carryover.prevYear}. évi záró egyenlegből.`
            : null,
      })
      if (res.error) {
        onToast(res.error, 'error')
        return
      }
      onToast(`Nyitó egyenleg rögzítve a ${nyitoEve}. évre.`, 'success')

      // Ha van FX különbség, felajánljuk a lekönyvelést — csak ha a felhasználó
      // explicit rányomott a gombra (lásd a JSX-ben a handleApplyFx logikát).
      setStep('categorize')
    } finally {
      setSavingNyito(false)
    }
  }

  /** Átirányítás az év végi FX revaluation dialógushoz (helyes könyvelési hely).
   *  Ez a Pénzügy → Bank fülön a „Évvégi átértékelés" gomb. A wizardot bezárja,
   *  a lelkész először december 31-re elvégzi a revaluation-t, aztán visszajön. */
  function redirectToFxRevaluation() {
    onToast(
      `Zárd le ezt az importot, nyisd meg a Pénzügy → Bank fülön a ${nyitoEve - 1}. évi Évvégi átértékelést, utána térj vissza.`,
      'info',
    )
    onOpenChange(false)
  }

  function updateDecision(rowIndex: number, patch: Partial<RowDecision>) {
    setDecisions((prev) => {
      const existing = prev[rowIndex] || { action: 'skip' as BankImportItemAction }
      return {
        ...prev,
        [rowIndex]: { ...existing, ...patch },
      }
    })
  }

  function bulkSetAction(action: BankImportItemAction) {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const t of transactions) {
        next[t.rowIndex] = { ...(next[t.rowIndex] || { action: 'skip' }), action }
      }
      return next
    })
  }

  // A "régebbi" tranzakciók alapértelmezetten rejtettek — a felhasználónak
  // nem kell minden alkalommal végigmennie a már importált tételeken
  const visibleTransactions = useMemo(() => {
    if (!hideOlder || !latestImportedDate) return transactions
    return transactions.filter((t) => t.date > latestImportedDate)
  }, [transactions, hideOlder, latestImportedDate])

  // Ha régebbi tételeket elrejtünk, azokat auto-skip-re állítjuk a mentéskor
  const hiddenOlderAutoSkip = useMemo(() => {
    if (!hideOlder || !latestImportedDate) return new Set<number>()
    return new Set(
      transactions.filter((t) => t.date <= latestImportedDate).map((t) => t.rowIndex),
    )
  }, [transactions, hideOlder, latestImportedDate])

  const stats = useMemo(() => {
    let income = 0,
      expense = 0,
      transfer = 0,
      skip = 0,
      missingCategory = 0
    for (const t of visibleTransactions) {
      const d = decisions[t.rowIndex]
      if (!d) {
        skip++
        continue
      }
      if (d.action === 'income') income++
      else if (d.action === 'expense') expense++
      else if (d.action === 'internal-transfer') transfer++
      else skip++
      if ((d.action === 'income' || d.action === 'expense') && !d.categoryId) {
        missingCategory++
      }
    }
    return { income, expense, transfer, skip, missingCategory }
  }, [visibleTransactions, decisions])

  async function handleImport() {
    if (!selectedBankId) return
    if (stats.missingCategory > 0) {
      onToast(
        `${stats.missingCategory} bevétel/kiadás tételnél nincs kategória kiválasztva. Javítsd őket.`,
        'error',
      )
      return
    }
    setImporting(true)
    try {
      const items: BankImportItem[] = transactions.map((t) => {
        const d = decisions[t.rowIndex] || { action: 'skip' as const }
        // Ha régebbi rejtett tétel, automatikusan skip (felhasználó nem döntött róla)
        const finalAction = hiddenOlderAutoSkip.has(t.rowIndex) ? 'skip' : d.action
        // Iratszám: ha a lelkész szerkesztette (d.iratszam), azt használjuk.
        // Ha nem, a BCR-ből érkező reference-t (ha volt). A szerveren a docNumber
        // fallback logika kezeli az üres esetet is.
        const finalIratszam = d.iratszam?.trim() || t.reference?.trim() || undefined
        return {
          rowIndex: t.rowIndex,
          date: t.date,
          description: t.description,
          reference: t.reference ?? undefined,
          amount: t.amount,
          counterparty: t.counterparty ?? undefined,
          action: finalAction,
          bankszamlaId: selectedBankId,
          categoryId: d.categoryId,
          transferTo: d.transferToKassza ? ('kassza' as const) : undefined,
          megjegyzes: d.note,
          iratszam: finalIratszam,
        }
      })
      const res = await onImport(items)
      if (res.error) {
        onToast(res.error, 'error')
        return
      }
      setImportResult({
        imported: res.imported,
        skipped: res.skipped,
        duplicates: res.duplicates ?? 0,
        errors: res.errors,
      })
      setStep('done')
      if (onImported) await onImported()
    } finally {
      setImporting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Megjelenítés — közös fejléc-leírás + lépés-tartalom; a héj
  // (Dialog vagy inline div) a végén dől el.
  // ─────────────────────────────────────────────────────────────

  const stepDescription =
    step === 'upload'
      ? 'Töltsd fel a BCR-ből exportált Excel fájlt és válaszd ki a célbankszámlát.'
      : step === 'opening-balance'
        ? `Ez az első import a ${nyitoEve}. évre — add meg az év eleji nyitó egyenleget.`
        : step === 'categorize'
          ? `${transactions.length} tranzakció beolvasva. Minden sornál válaszd ki, mit csináljon a rendszer.`
          : step === 'confirm'
            ? 'Ellenőrizd az összefoglalót, és importálj.'
            : 'Import lezárult.'

  const progressDots = (
    <div className="flex items-center gap-2 mt-2 text-xs">
      <StepDot active={step === 'upload'} done={step !== 'upload'}>1. Fájl</StepDot>
      <div className="h-px bg-slate-200 flex-1" />
      <StepDot
        active={step === 'opening-balance'}
        done={step === 'categorize' || step === 'confirm' || step === 'done'}
      >
        2. Nyitó egyenleg
      </StepDot>
      <div className="h-px bg-slate-200 flex-1" />
      <StepDot active={step === 'categorize'} done={step === 'confirm' || step === 'done'}>
        3. Kategorizálás
      </StepDot>
      <div className="h-px bg-slate-200 flex-1" />
      <StepDot active={step === 'confirm'} done={step === 'done'}>
        4. Megerősítés
      </StepDot>
      <div className="h-px bg-slate-200 flex-1" />
      <StepDot active={step === 'done'} done={false}>
        5. Kész
      </StepDot>
    </div>
  )

  const titleContent = (
    <>
      <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
        <FileSpreadsheet className="size-5" />
      </span>
      Banki Excel import (BCR)
    </>
  )

  const stepsContent = (
    <>
      {/* ───── LÉPÉS 1: FÁJL FELTÖLTÉS ───── */}
      {step === 'upload' && (
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="space-y-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Célbankszámla *
              </span>
              <select
                value={selectedBankId || ''}
                onChange={(e) =>
                  setSelectedBankId(e.target.value ? Number(e.target.value) : null)
                }
                className="mt-1 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm"
              >
                <option value="">— Válassz bankszámlát —</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_neve} · {b.iban || 'IBAN hiányzik'} ({b.valuta})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Az importált tranzakciók ehhez a bankszámlához kerülnek.
              </p>
            </label>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-6 text-center">
            <Upload className="size-10 mx-auto mb-3 text-violet-400" />
            <p className="font-semibold text-slate-800">BCR Excel fájl</p>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              A BCR netbankjából exportált <code className="font-mono">.xlsx</code> vagy{' '}
              <code className="font-mono">.xls</code> fájl.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="max-w-sm mx-auto cursor-pointer"
            />
            {file && (
              <p className="mt-3 text-xs text-slate-600">
                ✓ Kiválasztva: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button
              onClick={handleParse}
              disabled={!file || !selectedBankId || parsing}
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              {parsing ? (
                <><Loader2 className="mr-1.5 size-4 animate-spin" /> Beolvasás…</>
              ) : (
                <>Beolvasás <ChevronRight className="ml-1 size-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ───── LÉPÉS 2: NYITÓ EGYENLEG ───── */}
      {step === 'opening-balance' && (
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="card-raised p-5 sm:p-6 border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
            <div className="flex items-start gap-3 mb-4">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600">
                <Landmark className="size-5 text-white" />
              </div>
              <div>
                <h3 className="font-heading text-xl text-slate-800">
                  Év eleji nyitó egyenleg — {nyitoEve}
                </h3>
                <p className="text-sm text-slate-600 mt-0.5 leading-snug">
                  {selectedBank?.bank_neve} · {selectedBank?.valuta || 'RON'}
                  {selectedBank?.iban && ` · ${selectedBank.iban}`}
                </p>
              </div>
            </div>

            {/* 2026-07-10 (nyitó-carryover): ha tavaly már volt import/forgalom,
                a nyitót a rendszer hozza át a tavalyi záróból — a kézi-bekérő
                figyelmeztetés helyett zöld összefoglaló + ellenőrzési kérés. */}
            {carryover?.available ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 leading-relaxed mb-4">
                <strong>✓ Automatikusan áthozva a {carryover.prevYear}. évi záró egyenlegből.</strong>{' '}
                {typeof carryover.prevNyito === 'number' &&
                typeof carryover.prevBevetel === 'number' &&
                typeof carryover.prevKiadas === 'number' ? (
                  <>
                    Számítás: {carryover.prevYear}. évi nyitó (
                    {carryover.prevNyito.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    ) + banki bevételek (
                    {carryover.prevBevetel.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    ) − banki kiadások (
                    {carryover.prevKiadas.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    ) = <strong>
                    {(carryover.nyitoValuta ?? 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    {carryover.valuta}</strong>
                    {typeof carryover.prevTetelDb === 'number' && ` (${carryover.prevTetelDb} tavalyi tétel)`}.
                  </>
                ) : (
                  <>
                    A {carryover.prevYear}. december 31-i évvégi átértékelés szerint:{' '}
                    <strong>
                      {(carryover.nyitoValuta ?? 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      {carryover.valuta}
                    </strong>
                    {typeof carryover.nyitoRon === 'number' &&
                      ` = ${carryover.nyitoRon.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`}
                    .
                  </>
                )}{' '}
                Vesd össze az online bank {nyitoEve}. január 1-i egyenlegével — ha eltér
                (pl. tavalyi kivonat még nincs importálva), írd át kézzel.
              </div>
            ) : carryover?.reason === 'missing_prev_nyito' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 leading-relaxed mb-4">
                <strong>Fontos:</strong> A {carryover.prevYear}. évben van banki forgalom
                ({carryover.prevTetelDb} tétel), de nincs rögzített {carryover.prevYear}. évi
                nyitó egyenleg, ezért az idei nyitót nem tudtuk automatikusan kiszámolni.
                Ellenőrizd az online bankban (BCR George Banking → &bdquo;Extras&rdquo; vagy
                &bdquo;Sold cont&rdquo;) a <strong>{nyitoEve}. január 1-i</strong> záró
                egyenleget, és add meg itt.
              </div>
            ) : carryover?.reason === 'fx_revaluation_needed' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 leading-relaxed mb-4">
                <strong>Fontos:</strong> A {carryover.prevYear}. évben már volt forgalom ezen
                a devizás számlán, de a {carryover.prevYear}. december 31-i évvégi átértékelés
                még hiányzik — a pontos RON nyitóhoz előbb azt kell elvégezni (lásd lent).
                {typeof carryover.fallbackValuta === 'number' && (
                  <>
                    {' '}A deviza-összeget a tavalyi forgalomból előre kiszámoltuk:{' '}
                    <strong>
                      {carryover.fallbackValuta.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      {carryover.valuta}
                    </strong>
                    .
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 leading-relaxed mb-4">
                <strong>Fontos:</strong> A BCR Excel exportban nem szerepel a nyitó egyenleg.
                Kérlek ellenőrizd az online bankban (BCR George Banking → &bdquo;Extras&rdquo;
                vagy &bdquo;Sold cont&rdquo;) a <strong>{nyitoEve}. január 1-i</strong> záró
                egyenleget, és add meg itt.
              </div>
            )}

            <div className="space-y-4">
              {/* Nyitó egyenleg a számla valutájában */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Nyitó egyenleg ({selectedBank?.valuta || 'RON'}) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={nyitoValuta}
                  onChange={(e) =>
                    setNyitoValuta(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="0.00"
                  className="h-11"
                />
              </div>

              {/* Valutás számla: kell RON + árfolyam */}
              {selectedBank && selectedBank.valuta && selectedBank.valuta !== 'RON' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        Árfolyam (1 {selectedBank.valuta} = X RON) *
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.0001"
                          value={nyitoArfolyam}
                          onChange={(e) => {
                            const v = e.target.value === '' ? '' : Number(e.target.value)
                            setNyitoArfolyam(v)
                            if (typeof v === 'number' && typeof nyitoValuta === 'number') {
                              setNyitoRon(Number((nyitoValuta * v).toFixed(2)))
                            }
                          }}
                          placeholder="Pl. 4.9750"
                          className="h-11 flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleFetchBnr}
                          disabled={loadingBnr}
                          className="h-11 rounded-xl border-cyan-200 text-cyan-700 hover:bg-cyan-50 whitespace-nowrap"
                          title="Legfrissebb BNR árfolyam lekérése"
                        >
                          {loadingBnr ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <>📡 BNR</>
                          )}
                        </Button>
                      </div>
                      {bnrInfo ? (
                        <p className="text-[11px] text-cyan-700 font-medium">{bnrInfo}</p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          BNR január 1-i árfolyam ({nyitoEve}. évre) — kattints a BNR gombra
                          az automatikus lekérdezéshez. Január 1. ünnep, ezért a rendszer az
                          előző év utolsó publikált árfolyamát adja vissza (könyvelési
                          gyakorlat: az év eleji nyitót az előző év záró árfolyama értékeli).
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        Nyitó egyenleg RON-ban *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={nyitoRon}
                        onChange={(e) =>
                          setNyitoRon(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="0.00"
                        className="h-11"
                      />
                      <p className="text-[11px] text-slate-500">
                        {typeof nyitoValuta === 'number' && typeof nyitoArfolyam === 'number' && nyitoArfolyam > 0
                          ? `Auto-számolva: ${nyitoValuta} × ${nyitoArfolyam} = ${(nyitoValuta * nyitoArfolyam).toFixed(2)} RON`
                          : 'A könyvelésben RON-ban dolgozunk — ez az érték a Registru-ba és számadásba kerül.'}
                      </p>
                    </div>
                  </div>

                  {/* ── Év eleji állapot ellenőrzés — a helyes könyvelési gyakorlat szerint ── */}
                  {yearStartCheck && typeof nyitoArfolyam === 'number' && (
                    <div
                      className={`rounded-xl border-2 p-4 ${
                        yearStartCheck.status === 'ok_matching'
                          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50/40'
                          : yearStartCheck.status === 'fx_revaluation_needed'
                            ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50/40'
                            : yearStartCheck.status === 'arfolyam_mismatch'
                              ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50/40'
                              : 'border-slate-200 bg-slate-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">
                          {yearStartCheck.status === 'ok_matching' ? '✅' :
                           yearStartCheck.status === 'fx_revaluation_needed' ? '🟡' :
                           yearStartCheck.status === 'arfolyam_mismatch' ? '🟠' : '⚪'}
                        </span>
                        <h4 className="font-heading text-sm text-slate-800">
                          Év eleji állapot — {nyitoEve - 1} → {nyitoEve} forduló
                        </h4>
                      </div>

                      {/* Előző évi FX revaluation összefoglaló */}
                      {yearStartCheck.hasPreviousYearFxRevaluation && (
                        <div className="text-xs text-slate-700 space-y-1.5 mb-3 rounded-lg bg-white/60 p-3 border border-slate-200">
                          <p className="font-semibold text-slate-800 mb-1">
                            {nyitoEve - 1}. december 31. FX revaluation:
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-slate-500">Záró valuta egyenleg:</span>
                            <span className="text-right font-mono">
                              {yearStartCheck.prevYearClosingValuta?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {yearStartCheck.valuta}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-slate-500">Használt záró árfolyam:</span>
                            <span className="text-right font-mono">
                              {yearStartCheck.prevYearArfolyam?.toFixed(4)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 border-t border-slate-200 pt-1">
                            <span className="font-semibold text-slate-700">Átértékelt záró RON (= jan. 1. nyitó):</span>
                            <span className="text-right font-mono font-bold">
                              {yearStartCheck.prevYearRevaluedRon?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} RON
                            </span>
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-slate-700 leading-relaxed">
                        {yearStartCheck.message}
                      </p>

                      {yearStartCheck.status === 'fx_revaluation_needed' && (
                        <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                          <Button
                            type="button"
                            size="sm"
                            onClick={redirectToFxRevaluation}
                            className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                          >
                            Ugrás az Évvégi átértékelésre →
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs text-slate-600 leading-relaxed">
                    <p className="mb-1 font-semibold text-slate-700">📚 Könyvelési gyakorlat:</p>
                    <p className="mb-1">
                      A román OMFP 1802/2014 és a magyar egyházi számvitel szerint az
                      <strong> árfolyam-nyereség / veszteség DECEMBER 31-I DÁTUMMAL</strong> kerül
                      könyvelésre (év végi revaluation). Az új év január 1-i RON nyitó egyenleg =
                      a december 31-i átértékelt záró RON (<strong>ugyanaz az érték</strong>, nincs
                      új FX tranzakció).
                    </p>
                    <p>
                      Ezért a rendszer nem &bdquo;újra könyvel&rdquo; januárra — helyette ellenőrzi, hogy a
                      december 31-i átértékelés megtörtént-e. Ha nem, figyelmeztet, hogy előbb
                      az &bdquo;Évvégi átértékelés&rdquo; gombbal (Bank fül) el kell végezni.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep('upload')}
              disabled={savingNyito}
              className="rounded-xl"
            >
              <ChevronLeft className="mr-1 size-4" />
              Vissza
            </Button>
            <Button
              onClick={handleSaveNyito}
              disabled={savingNyito || typeof nyitoValuta !== 'number'}
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              {savingNyito ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : null}
              Tovább a kategorizáláshoz
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ───── LÉPÉS 3: KATEGORIZÁLÁS ───── */}
      {step === 'categorize' && (
        <div className="space-y-3">
          {/* Duplikáció-szűrő infó + toggle */}
          {latestImportedDate && (
            <div className="card-raised p-3 bg-amber-50/40 border-amber-200 flex flex-wrap items-center gap-2">
              <AlertCircle className="size-4 text-amber-700 shrink-0" />
              <span className="text-xs text-slate-700">
                A legutóbb importált banki tranzakció dátuma ezen a bankszámlán:{' '}
                <strong>{latestImportedDate}</strong>. Az ennél korábbi tételek
                valószínűleg már benne vannak a rendszerben.
              </span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideOlder}
                  onChange={(e) => setHideOlder(e.target.checked)}
                  className="size-3.5 rounded border-slate-300"
                />
                Régebbi tételek elrejtése
              </label>
            </div>
          )}

          {/* Tömeges beállítás */}
          <div className="card-raised p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Tömeges:</span>
            <Button size="sm" variant="outline" onClick={() => bulkSetAction('income')}>
              Minden bevétel
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetAction('expense')}>
              Minden kiadás
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetAction('skip')}>
              Mindent kihagy
            </Button>
            <span className="ml-auto text-xs text-slate-500">
              ✓ {stats.income + stats.expense + stats.transfer} feldolg. · ⏭ {stats.skip}{' '}
              kihagy · {stats.missingCategory > 0 && (
                <span className="text-amber-700 font-semibold">
                  ⚠ {stats.missingCategory} kategória hiányzik
                </span>
              )}
            </span>
          </div>

          {/* Tranzakciók listája */}
          <div className="card-raised overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium text-slate-500">Dátum</th>
                    <th className="p-2 text-left font-medium text-slate-500">Leírás</th>
                    <th className="p-2 text-right font-medium text-slate-500">Összeg</th>
                    <th className="p-2 text-left font-medium text-slate-500">Művelet</th>
                    <th className="p-2 text-left font-medium text-slate-500">Kategória</th>
                    <th className="p-2 text-left font-medium text-slate-500">Iratszám</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTransactions.map((t) => {
                    const d = decisions[t.rowIndex] || { action: 'skip' as const }
                    const cats = d.action === 'income' ? incomeCategories : expenseCategories
                    const needsCategory =
                      d.action === 'income' || d.action === 'expense' || d.action === 'internal-transfer'
                    return (
                      <tr key={t.rowIndex} className="hover:bg-slate-50/50">
                        <td className="p-2 text-slate-600 whitespace-nowrap">{t.date}</td>
                        <td className="p-2">
                          <p className="text-slate-700 truncate max-w-[280px]">{t.description}</p>
                          {t.counterparty && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[280px]">
                              Partner: {t.counterparty}
                            </p>
                          )}
                          {t.reference && (
                            <p className="text-[10px] text-slate-400">Ref: {t.reference}</p>
                          )}
                        </td>
                        <td
                          className={`p-2 text-right font-semibold whitespace-nowrap ${
                            t.amount >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {t.amount >= 0 ? '+' : ''}
                          {t.amount.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} RON
                        </td>
                        <td className="p-2">
                          <select
                            value={d.action}
                            onChange={(e) =>
                              updateDecision(t.rowIndex, {
                                action: e.target.value as BankImportItemAction,
                                categoryId: undefined,
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="income">↓ Bevétel</option>
                            <option value="expense">↑ Kiadás</option>
                            <option value="internal-transfer">⇄ Kassza átvez.</option>
                            <option value="skip">Kihagy</option>
                          </select>
                        </td>
                        <td className="p-2 min-w-[220px]">
                          {needsCategory ? (
                            <div
                              className={`rounded-lg ${
                                d.categoryId ? '' : 'ring-1 ring-amber-300 bg-amber-50/40 rounded-xl'
                              }`}
                            >
                              <SearchableCategorySelect
                                value={d.categoryId ?? null}
                                onChange={(id) =>
                                  updateDecision(t.rowIndex, { categoryId: id ?? undefined })
                                }
                                categories={cats}
                                placeholder="⚠ Válassz kategóriát…"
                                allowClear
                              />
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-2 min-w-[140px]">
                          {d.action !== 'skip' ? (
                            <Input
                              type="text"
                              value={d.iratszam ?? (t.reference || '')}
                              onChange={(e) =>
                                updateDecision(t.rowIndex, { iratszam: e.target.value })
                              }
                              placeholder="pl. 123/2026"
                              className="h-8 text-xs"
                            />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Figyelmeztető banner — ha hiányzik a kategória, nem engedünk
              tovább. A „Megerősítés" gomb is disabled alább. */}
          {stats.missingCategory > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                <strong>{stats.missingCategory}</strong> bevétel/kiadás tételnél még nincs kategória kiválasztva —
                állítsd be mindegyiket, mielőtt továbblépsz. (Ha nem szükséges importálni, állítsd &bdquo;Kihagy&rdquo;-ra.)
              </span>
            </div>
          )}

          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              <ChevronLeft className="mr-1 size-4" /> Vissza
            </Button>
            <Button
              onClick={() => setStep('confirm')}
              disabled={stats.income + stats.expense + stats.transfer === 0 || stats.missingCategory > 0}
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              Megerősítés <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ───── LÉPÉS 4: MEGERŐSÍTÉS ───── */}
      {step === 'confirm' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="card-raised p-4 space-y-3">
            <h4 className="font-heading text-lg text-slate-800">Összefoglaló</h4>
            <StatRow label="Célbankszámla" value={selectedBank?.bank_neve || '—'} />
            <StatRow label="Bevétel (jóváírás)" value={`${stats.income} tétel`} color="text-emerald-600" />
            <StatRow label="Kiadás (terhelés)" value={`${stats.expense} tétel`} color="text-red-600" />
            <StatRow label="Belső mozgás (↔ kassza)" value={`${stats.transfer} tétel`} color="text-violet-600" />
            <StatRow label="Kihagy" value={`${stats.skip} tétel`} color="text-slate-400" />
          </div>

          {stats.missingCategory > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                {stats.missingCategory} tételnél nincs kategória — menj vissza és állítsd be.
              </span>
            </div>
          )}

          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setStep('categorize')}>
              <ChevronLeft className="mr-1 size-4" /> Vissza
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || stats.missingCategory > 0}
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              {importing ? (
                <><Loader2 className="mr-1.5 size-4 animate-spin" /> Importálás…</>
              ) : (
                <><CheckCircle2 className="mr-1 size-4" /> Importálás indítása</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ───── LÉPÉS 5: KÉSZ ───── */}
      {step === 'done' && importResult && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="card-raised p-5 text-center">
            <CheckCircle2 className="size-12 mx-auto text-emerald-500 mb-2" />
            <h4 className="font-heading text-xl text-slate-800 mb-2">Import sikeres!</h4>
            <p className="text-sm text-slate-600">
              <strong>{importResult.imported}</strong> tétel importálva ·{' '}
              <strong>{importResult.skipped}</strong> kihagyva
              {importResult.duplicates > 0 && (
                <> · <span className="text-amber-700">
                  {importResult.duplicates} duplikátum (már szerepelt a rendszerben)
                </span></>
              )}
              {importResult.errors.length > 0 && (
                <> · <span className="text-red-600">{importResult.errors.length} hiba</span></>
              )}
            </p>
          </div>

          {importResult.errors.length > 0 && (
            <div className="card-raised border border-red-200 bg-red-50/40 p-4 space-y-1.5">
              <p className="font-semibold text-red-800 text-sm">Hibák:</p>
              {importResult.errors.slice(0, 10).map((e, i) => (
                <p key={i} className="text-xs text-slate-700 font-mono">
                  Sor {e.rowIndex}: {e.error}
                </p>
              ))}
              {importResult.errors.length > 10 && (
                <p className="text-xs text-slate-500 italic">
                  … és még {importResult.errors.length - 10} hiba
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)} className="rounded-xl">
              Bezárás
            </Button>
          </div>
        </div>
      )}
    </>
  )

  // ── INLINE MÓD (desktop): Dialog-héj nélkül, sima kártya-div-ben ──
  if (inline) {
    return (
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30 overflow-hidden">
        <div className="border-b border-violet-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4">
          <h2 className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            {titleContent}
          </h2>
          <p className="text-sm leading-6 text-slate-600">{stepDescription}</p>
          {progressDots}
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">{stepsContent}</div>
      </div>
    )
  }

  // ── DIALOG MÓD (web — a régi megjelenés változatlan) ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94dvh] !max-h-[94dvh]
          overflow-hidden
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-violet-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            {titleContent}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {stepDescription}
          </DialogDescription>
          {progressDots}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{stepsContent}</div>
      </DialogContent>
    </Dialog>
  )
}

function StepDot({
  active,
  done,
  children,
}: {
  active: boolean
  done: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
        done
          ? 'bg-emerald-100 text-emerald-700'
          : active
            ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200'
            : 'bg-slate-100 text-slate-500'
      }`}
    >
      {done && <CheckCircle2 className="size-3" />}
      {children}
    </span>
  )
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${color || 'text-slate-800'}`}>{value}</span>
    </div>
  )
}
