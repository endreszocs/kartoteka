/**
 * DesktopFinancePrintDialog — a webes „Pénzügyi nyomtatási központ" desktop
 * megfelelője (2026-06-11, Endre #4).
 *
 * A web `components/finance/finance-print-dialog.tsx` wrapper tükre: a
 * megosztott `FinancePrintDialogBody` + a közös builderek
 * (`buildFinancePrintDocument`, `buildBudgetPrintDocument` — @kartoteka/ui-app)
 * desktop adatforrásokkal:
 *   - nyugtatömb-kimutatás: direkt Supabase (chitanta_tombok + oblio_szamlak),
 *   - Decont/Dispoziție újranyomtatás: direkt Supabase (decont/dispozitie),
 *   - költségvetés-sorok: közös `loadBudgetRowsCompat` (@kartoteka/core),
 *   - nyomtatás: rejtett iframe print (rendszer-dialógus, PDF onnan menthető).
 */

import { useCallback, useEffect, useRef } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import {
  FinancePrintDialogBody,
  buildDecontHtml,
  buildDispozitieHtml,
  buildFinancePrintDocument,
  buildBudgetPrintDocument,
  hivatalosHatarozatMezok,
  FINANCE_PRINT_TYPES,
  BUDGET_PRINT_TYPES,
  type BefitetesRow,
  type KiadasRow,
  type BankAccount,
  type SzamadasiCel,
  type BealitasRow,
  type BudgetCompatRow,
  type BudgetPrintData,
  type BudgetPrintType,
  type DecontDocData,
  type DispozitieDocData,
  type FinancePrintFilters,
  type FinancePrintType,
  type FinancePrintTypeMeta,
  type FinanceReportData,
  type PrintReport,
  type SavedDocOption,
} from '@kartoteka/ui-app'
import {
  computePeriodBalances,
  loadBudgetRowsCompat,
  resolveNyitoEgyenlegekUseCase,
  type PeriodRow,
} from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { printHtmlViaIframe } from '../lib/print-html'
import { selectAllPaged } from '../lib/sync'

interface DesktopFinancePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  income: BefitetesRow[]
  expense: KiadasRow[]
  bankAccounts: BankAccount[]
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") a nyomtatványhoz. */
  congregationNameRo?: string
  carryoverCash: number
  carryoverBank: number
  /** 2026-07-17 (F4, web-paritás): az idei rögzített bank-nyitók számlánként (Registru Banca). */
  bankNyitoMap?: Record<number, number>
  currentYear: number
  settings: BealitasRow
  onToast?: (msg: string, kind: 'success' | 'error' | 'info' | 'warning') => void
}

/** 2026-07-10 (S5-#3, web-paritás): a Body opak yearRecords-ának alakja. */
type YearRecordsPayload = {
  income: BefitetesRow[]
  expense: KiadasRow[]
  carryoverCash: number
  carryoverBank: number
  bankNyitoMap?: Record<number, number>
  /** 2026-08-11 (6. kör, web-paritás): sikerült-e a nyitók FELOLDÁSA. A
   *  részszámadás minden száma a nyitóra épül — `false` esetén nem nyomtatunk. */
  nyitoOk?: boolean
  /** D11 (2026-08-28, a web 2026-08-15-i javításának paritása): a KIVÁLASZTOTT
   *  év bealitas-sora — a véglegesítés-zászló és a presbitériumi határozat
   *  ebből jön, nem a lap évének settings-éből. `null` = az évhez nincs sor
   *  (tehát tényszerűen nincs véglegesítés sem). */
  evBealitas?: BealitasRow | null
  /** false = a bealitas-sor lekérése hibázott — a budget-típusú ívek fail-closed
   *  blokkolódnak (hamis véglegesítés-állapottal nem készül aláírható papír). */
  evBealitasOk?: boolean
  nyitoBizonytalan?: boolean
}

/** Bizonylat-típusok, amelyeknek NEM kellenek a bevétel/kiadás sorok. */
const TYPES_WITHOUT_RECORDS = new Set<FinancePrintType>([
  'decont_reprint',
  'dispozitie_reprint',
  'nyugtatomb_kimutatas',
])

function emptyPreview(message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;color:#94a3b8;font-size:14px;text-align:center;padding:24px}</style></head><body>${message}</body></html>`,
    title: 'Előnézet',
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
  }
}

/** 2026-08-11 (6. kör, web-paritás): NYOMTATÁST TILTÓ hiba-előnézet. */
function blockedPreview(title: string, message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:620px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}p{font-size:14px;line-height:1.65;margin:0 0 10px}
    </style></head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    title,
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
    blocked: true,
  }
}

export function DesktopFinancePrintDialog({
  open,
  onOpenChange,
  income,
  expense,
  bankAccounts,
  cellek,
  bevCelMap,
  kiaCelMap,
  congregationName,
  congregationNameRo,
  carryoverCash,
  carryoverBank,
  bankNyitoMap,
  currentYear,
  settings,
  onToast,
}: DesktopFinancePrintDialogProps) {
  // A webbel azonos típuskínálat: pénzügyi nyomtatványok + költségvetés-félék
  // (a kísérőív a kiadás-oldalról nyomtatható).
  // 2026-08-11 (6. kör, web-paritás): a RÉSZSZÁMADÁS ide került át — csak itt
  // van év-scope-olt tétel-betöltés és számlánkénti feloldott nyitó.
  const budgetTypes: FinancePrintTypeMeta[] = BUDGET_PRINT_TYPES.map((t) => ({
    id: t.id as FinancePrintType,
    title: t.title,
    subtitle: t.subtitle,
    description: t.description,
  }))
  const printableTypes: FinancePrintTypeMeta[] = [
    ...FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv'),
    ...budgetTypes,
  ]

  // ── 2026-08-22 (8. pont, web-paritás): STABIL callback-referenciák ──────
  //
  // MI VOLT A ROSSZ: ezek a propok INLINE nyíl-függvényként mentek át, tehát
  // minden renderben ÚJ identitást kaptak. A közös `FinancePrintDialogBody`
  // NÉGY betöltő-effektje a deps közt figyeli őket, vagyis a `penzugy-page`
  // MINDEN renderére újraindult a négy lekérés, és az előnézet visszaesett
  // betöltő-állapotba. Az `onLoadYearRecords` ráadásul `onToast`-ot hív, ami
  // a page-en inline függvény és `setPageToast`-ot ír: egyetlen hiba-toast
  // önfenntartó kört zárt volna, ha az `onToast` a deps-listába kerül.
  //
  // ⛔ EZÉRT az `onToast` REF-en át hívódik, és NINCS egyetlen deps-listában
  //    sem. ⚠️ A deps-listák egyébként TELJESEK — hiányos deps = BEFAGYASZTOTT
  //    előnézet, azaz régi állapotból készülő hivatalos ív.
  const onToastRef = useRef(onToast)
  useEffect(() => {
    onToastRef.current = onToast
  })

  const buildReport = useCallback((filters: FinancePrintFilters): PrintReport => {
    // 2026-07-10 (S5-#3, web-paritás): a sorok a KIVÁLASZTOTT évhez —
    // az oldal évén a props, más évnél a Body által betöltött yearRecords.
    // 2026-08-11 (6. kör, web-paritás): a Body `undefined`-et ad, ha
    // a props-beli (oldal-évi) sorok elegendők, `null`-t amíg tölt.
    const wantsYearRecords = filters.yearRecords !== undefined
    if (
      wantsYearRecords &&
      filters.yearRecords == null &&
      !TYPES_WITHOUT_RECORDS.has(filters.printType)
    ) {
      return emptyPreview(`A(z) ${filters.selectedYear}. évi tételek betöltése…`)
    }
    const yr = wantsYearRecords ? (filters.yearRecords as YearRecordsPayload | null) : null
    const incomeUse = yr ? yr.income : income
    const expenseUse = yr ? yr.expense : expense
    const carryoverCashUse = yr ? yr.carryoverCash : carryoverCash
    const carryoverBankUse = yr ? yr.carryoverBank : carryoverBank
    const bankNyitoMapUse = yr ? yr.bankNyitoMap : bankNyitoMap

    // Korábbi bizonylatok újranyomtatása (a mentett pillanatképből)
    if (filters.printType === 'decont_reprint') {
      const doc = filters.selectedDoc
      if (!doc) return emptyPreview('Válassz egy korábbi elszámolást a bal oldalon.')
      // 2026-08-22 (6. pont): a DECONT „Unitate" sávja kétnyelvű — a webes
      // ággal AZONOSAN (a két felület széthúzása visszatérő hibaosztály). A
      // mai hivatalos neveket a snapshot UTÁN tesszük rá, hogy a mentett
      // tétel-adat ne írhassa felül őket.
      const data = doc.data as Omit<DecontDocData, 'congregationName' | 'congregationNameRo'>
      return {
        html: buildDecontHtml({ ...data, congregationName, congregationNameRo }),
        title: `Decont #${data.sorszam}`,
        filename: `Decont_${data.sorszam}_${data.date}.pdf`,
        orientation: 'portrait',
      }
    }
    if (filters.printType === 'dispozitie_reprint') {
      const doc = filters.selectedDoc
      if (!doc) return emptyPreview('Válassz egy korábbi rendelvényt a bal oldalon.')
      const data = doc.data as Omit<DispozitieDocData, 'congregationName'>
      return {
        html: buildDispozitieHtml({ congregationName, congregationNameRo, ...data }),
        title: `Dispoziție #${data.sorszam}`,
        filename: `Dispozitie_${data.tipus}_${data.sorszam}_${data.date}.pdf`,
        orientation: 'portrait',
      }
    }

    // Költségvetés / költségvetés-módosítás / számadás / részszámadás
    if (
      filters.printType === 'koltsegvetes' ||
      filters.printType === 'koltsegvetes_modositas' ||
      filters.printType === 'szamadas' ||
      filters.printType === 'reszszamadas'
    ) {
      if (!filters.budgetRows) return emptyPreview('Költségvetési adatok betöltése…')
      const isReszszamadas = filters.printType === 'reszszamadas'
      const isSzamadas = filters.printType === 'szamadas'
      const periodFrom = filters.periodFrom
      const periodTo = filters.periodTo
      const inPeriod = (datum: string | null | undefined): boolean => {
        if (!isReszszamadas) return true
        if (!datum || !periodFrom || !periodTo) return false
        const d = datum.slice(0, 10)
        return d >= periodFrom && d <= periodTo
      }
      const actualIncome: Record<string, number> = {}
      const actualExpense: Record<string, number> = {}
      // 2026-07-10 (S5, web-paritás — S3 audit KRITIKUS #1): a stornózott
      // tétel a hivatalos tényadatba sem számít (a webes wrapper már így
      // számolt, a desktop-tükörből kimaradt).
      // 2026-08-11 (6. kör, K5-#6 web-paritás): az összeg a RON-EKVIVALENS
      // (`osszeg_ron ?? osszeg`) — a nyers deviza-összeg a Registrutól
      // ELTÉRŐ számot adott ugyanarra az évre, két aláírt papíron.
      for (const r of incomeUse) {
        if (r.deleted || r.stornozott) continue
        if (!inPeriod(r.datum)) continue
        const code = r.id_befizetescel ? bevCelMap[r.id_befizetescel] : undefined
        if (code) actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      }
      for (const r of expenseUse) {
        if (r.deleted || r.stornozott) continue
        if (!inPeriod(r.datum)) continue
        const code = r.id_kiadascel ? kiaCelMap[r.id_kiadascel] : undefined
        if (code) actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      }
      // D11 (audit 2026-08-28, a web 2026-08-15-i javításának paritása): a
      // véglegesítés-zászló és a presbitériumi határozat a KIVÁLASZTOTT évé —
      // eddig a LAP évének settings-e ment MINDEN évre, határozat-mezők nélkül.
      // Fail-closed: ha az év sora nem tölthető be, nem készül aláírható ív
      // hamis véglegesítés-állapottal.
      let evSettings: BealitasRow | null
      if (yr) {
        if (yr.evBealitasOk !== true) {
          return blockedPreview(
            'A nyomtatvány most nem készíthető el',
            `A(z) ${filters.selectedYear}. évi pénzügyi beállítások (véglegesítés, presbitériumi határozat) nem tölthetők be, ezért az ív hamis véglegesítés-állapottal készülne. Ellenőrizd az internetkapcsolatot, és próbáld újra.`,
          )
        }
        evSettings = yr.evBealitas ?? null
      } else {
        evSettings = settings
      }
      const printData: BudgetPrintData = {
        cellek,
        budgetRows: filters.budgetRows as Record<string, BudgetCompatRow>,
        actualIncome,
        actualExpense,
        congregationName,
        congregationNameRo,
        year: filters.selectedYear,
        carryoverCash: carryoverCashUse,
        carryoverBank: carryoverBankUse,
        finalized: isSzamadas ? !!evSettings?.accounting_finalized : !!evSettings?.budget_finalized,
        ...hivatalosHatarozatMezok(evSettings, isSzamadas ? 'szamadas' : 'koltsegvetes'),
      }

      // ── RÉSZSZÁMADÁS: időszaki nyitó/záró + fail-closed kapuk ──
      if (isReszszamadas) {
        if (yr && yr.nyitoOk === false) {
          return blockedPreview(
            'A részszámadás most nem nyomtatható',
            'A nyitó egyenlegek feloldása nem sikerült (offline vagy hibás adat), így az időszak nyitó és záró egyenlege nem vezethető le. Csatlakozz az internethez, ellenőrizd a nyitó egyenlegeket, majd próbáld újra.',
          )
        }
        if (!periodFrom || !periodTo) {
          return blockedPreview(
            'A részszámadás most nem nyomtatható',
            'Add meg az időszak kezdő és záró dátumát a bal oldalon.',
          )
        }
        const balances = computePeriodBalances({
          income: incomeUse as unknown as PeriodRow[],
          expense: expenseUse as unknown as PeriodRow[],
          year: filters.selectedYear,
          periodFrom,
          periodTo,
          yearOpeningCash: carryoverCashUse,
          yearOpeningBankById: bankNyitoMapUse || {},
          actualIncomeByCode: actualIncome,
          actualExpenseByCode: actualExpense,
        })
        if ('error' in balances) {
          return blockedPreview('A részszámadás most nem nyomtatható', balances.error)
        }
        const fxIds = new Set<number>()
        for (const r of [...incomeUse, ...expenseUse]) {
          if (r.deleted || r.stornozott) continue
          if (!inPeriod(r.datum)) continue
          if (r.bankszamla_id != null && r.osszeg_ron != null && Number(r.osszeg_ron) !== Number(r.osszeg)) {
            fxIds.add(r.bankszamla_id)
          }
        }
        printData.periodFrom = periodFrom
        printData.periodTo = periodTo
        printData.periodBalances = balances
        printData.partial = true
        printData.nyitoBizonytalan = yr?.nyitoBizonytalan === true
        printData.keszult = new Date().toISOString().slice(0, 10)
        printData.devizaSzamlak = [...fxIds].map(
          (id) => bankAccounts.find((b) => b.id === id)?.bank_neve || `#${id}`,
        )
      }

      return buildBudgetPrintDocument(filters.printType as BudgetPrintType, printData)
    }

    const reportData: FinanceReportData = {
      income: incomeUse,
      expense: expenseUse,
      bankAccounts,
      cellek,
      bevCelMap,
      kiaCelMap,
      congregationName,
      congregationNameRo,
      carryoverCash: carryoverCashUse,
      carryoverBank: carryoverBankUse,
      bankNyitoMap: bankNyitoMapUse,
      // 2026-08-28 (Endre döntése): az asztali program KIZÁRÓLAG gyülekezeti hatókörű,
      // ezért a legacy, év nélküli `bankszamlak.nyito_egyenleg` itt SOSEM számolhat.
      // A kanonikus forrás a `bankszamla_nyito_egyenleg` évenkénti tábla.
      // (Kiirva, nem elhagyva: így egy későbbi olvasó látja, hogy ez DÖNTÉS, nem feledékenyég.)
      felsoSzintLegacyNyito: false,
      nyugtatombok:
        filters.printType === 'nyugtatomb_kimutatas'
          ? filters.nyugtatombok
          : undefined,
    }
    return buildFinancePrintDocument(filters.printType, reportData, {
      year: filters.selectedYear,
      month: filters.selectedMonth,
      bankAccountId: filters.selectedBankId,
      categoryKod: filters.selectedCategoryKod,
    })
  }, [
    income,
    expense,
    bankAccounts,
    cellek,
    bevCelMap,
    kiaCelMap,
    congregationName,
    congregationNameRo,
    carryoverCash,
    carryoverBank,
    bankNyitoMap,
    // D11: a teljes settings-objektum — a határozat-mezők is innen jönnek a
    // folyó évnél; a két zászló-dep önmagában BEFAGYASZTOTT határozatot adna.
    settings,
  ])

  const onLoadYearRecords = useCallback(async (year: number): Promise<unknown> => {
    // 2026-08-11 (6. kör): `nyitoOk: false` minden hibaágon — a
    // részszámadás inkább NE készüljön el, mint hogy üres/0 alapról
    // nyomtasson egy aláírható papírt.
    const emptyPayload: YearRecordsPayload = {
      income: [],
      expense: [],
      carryoverCash: 0,
      carryoverBank: 0,
      nyitoOk: false,
      evBealitas: null,
      evBealitasOk: false,
    }
    if (!(await isOnlineWithSession())) {
      onToastRef.current?.('A múltbeli évek nyomtatásához internetkapcsolat és belépés szükséges.', 'warning')
      return emptyPayload
    }
    try {
      const supabase = getDesktopSupabase()
      const congregationId = settings.congregation_id
      const [bevRes, kiaRes, prevBevRes, prevKiaRes, cashNyitoRes, bankNyitoRes] = await Promise.all([
        // 2026-07-25 (F6.1): LAPOZVA — ez a nyomtatványok (Számadás,
        // Registru, nyitó) forrása; a szerver-plafon némán hibás összeget adott volna.
        // 2026-08-11 (6. kör, reviewer-blocker): `osszeg_ron, arfolyam` a
        // SELECT-be. A `Number(r.osszeg_ron ?? r.osszeg)` deviza-javítás
        // ENÉLKÜL TEHETETLEN volt: a `BefitetesRow.osszeg_ron` opcionális,
        // tehát a hiányzó oszlop `undefined`-ként fordult le, a `??` mindig
        // a NYERS deviza-összegre esett vissza — 1000 EUR bank-sor 1.000,00
        // lej-ként ment az aláírt Részszámadásra/Számadásra, míg a Registru
        // 4.970,00 lejt írt. Ugyanezen okból a deviza-lábjegyzet
        // (`osszeg_ron !== osszeg`) SOHA nem sült el. A részszámadás MINDIG
        // ezen az úton jön (`needsYearRecords`), a múltbeli évi Számadás is.
        selectAllPaged(supabase.from('befizetes').select('id, osszeg, osszeg_ron, arfolyam, datum, id_befizetescel, id_szemely, id_csalad, forrasa, nyugta, iratszam, irattipus, fizetettev, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)),
        selectAllPaged(supabase.from('kiadas').select('id, osszeg, osszeg_ron, arfolyam, datum, id_kiadascel, atvevo, atvevoid, nyugta, iratszam, irattipus, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lt('datum', `${year + 1}-01-01`)),
        selectAllPaged(supabase.from('befizetes').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`)),
        selectAllPaged(supabase.from('kiadas').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lt('datum', `${year}-01-01`)),
        supabase.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg')
          .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
        supabase.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron, bankszamla_id')
          .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
      ])
      // D11 (2026-08-28): a KIVÁLASZTOTT év bealitas-sora — a véglegesítés
      // zászlaja és a presbitériumi határozat ebből jön az ívre, nem a lap
      // évének settings-éből. (A `bealitas.id` az év, stringként.)
      const evBealitasRes = await supabase
        .from('bealitas')
        .select('*')
        .eq('congregation_id', congregationId)
        .eq('id', String(year))
        .maybeSingle()
      const firstErr = bevRes.error || kiaRes.error || prevBevRes.error || prevKiaRes.error
      if (firstErr) {
        onToastRef.current?.(`A(z) ${year}. évi tételek betöltése sikertelen: ${firstErr.message}`, 'error')
        return emptyPayload
      }
      let recCashCur = 0, recCashPrev = 0, hasCashCur = false
      for (const r of (cashNyitoRes.data || []) as { eve: number; nyito_egyenleg: number }[]) {
        if (r.eve === year) { recCashCur += Number(r.nyito_egyenleg) || 0; hasCashCur = true }
        else recCashPrev += Number(r.nyito_egyenleg) || 0
      }
      let recBankCur = 0, recBankPrev = 0, hasBankCur = false
      const yearBankNyitoMap: Record<number, number> = {}
      for (const r of (bankNyitoRes.data || []) as { eve: number; nyito_egyenleg_ron: number; bankszamla_id: number }[]) {
        if (r.eve === year) {
          recBankCur += Number(r.nyito_egyenleg_ron) || 0
          hasBankCur = true
          if (r.bankszamla_id != null) yearBankNyitoMap[r.bankszamla_id] = Number(r.nyito_egyenleg_ron) || 0
        } else recBankPrev += Number(r.nyito_egyenleg_ron) || 0
      }
      // 2026-08-11 (6. kör, reviewer-blocker): a bázisév nettó forgalma is
      // RON-EKVIVALENSBEN (`osszeg_ron ?? osszeg`), a webes
      // `getYearFinanceRecords` szerint — a könyvelés RON-ban vezet, a nyers
      // deviza-összeg hamis nyitót adott volna a következő évre.
      let cashNet = 0, bankNet = 0
      type PrevFlowRow = { osszeg: number; osszeg_ron?: number | null; bankszamla_id: number | null }
      ;((prevBevRes.data || []) as unknown as PrevFlowRow[]).forEach((r) => {
        if (r.bankszamla_id == null) cashNet += Number(r.osszeg_ron ?? r.osszeg) || 0
        else bankNet += Number(r.osszeg_ron ?? r.osszeg) || 0
      })
      ;((prevKiaRes.data || []) as unknown as PrevFlowRow[]).forEach((r) => {
        if (r.bankszamla_id == null) cashNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
        else bankNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
      })
      // 2026-08-11 (6. kör, G5 web-paritás): „előző évi záró = köv.
      // évi nyitó" OLVASÁS-ONLY feloldás SZÁMLÁNKÉNT. A részszámadás
      // időszaki nyitója ebből vezetődik le; a régi, aggregált
      // fallback egy MÁSIK számla nyitóját írta volna ide.
      const resolved = await resolveNyitoEgyenlegekUseCase(
        { congregationId, eve: year },
        { supabase, runtime: 'desktop' },
      )
      const resolvedBankMap: Record<number, number> = { ...yearBankNyitoMap }
      if (resolved.success) {
        for (const [id, r] of Object.entries(resolved.bank)) resolvedBankMap[Number(id)] = r.value
      }
      const nyitoBizonytalan =
        resolved.success &&
        (resolved.cash.baseYear === null ||
          Object.values(resolved.bank).some((b) => b.baseYear === null))
      return {
        income: (bevRes.data || []) as unknown as BefitetesRow[],
        expense: (kiaRes.data || []) as unknown as KiadasRow[],
        carryoverCash: resolved.success
          ? resolved.cash.value
          : hasCashCur
            ? recCashCur
            : recCashPrev + cashNet,
        carryoverBank: resolved.success
          ? resolved.bankTotal
          : hasBankCur
            ? recBankCur
            : recBankPrev + bankNet,
        bankNyitoMap: resolvedBankMap,
        nyitoOk: resolved.success,
        nyitoBizonytalan,
        evBealitas: (evBealitasRes.data as BealitasRow | null) ?? null,
        evBealitasOk: !evBealitasRes.error,
      } satisfies YearRecordsPayload
    } catch (e) {
      onToastRef.current?.(`A(z) ${year}. évi tételek betöltése sikertelen: ${errorMessage(e)}`, 'error')
      return emptyPayload
    }
  }, [
    income,
    expense,
    carryoverCash,
    carryoverBank,
    bankNyitoMap,
    settings.congregation_id,
  ])

  const onLoadNyugtatombok = useCallback(async (year: number) => {
    if (!(await isOnlineWithSession())) {
      return { data: undefined, error: 'A nyugtatömb-kimutatáshoz internetkapcsolat és belépés szükséges.' }
    }
    try {
      const supabase = getDesktopSupabase()
      const { data: tombok, error } = await supabase
        .from('chitanta_tombok')
        .select('*')
        .eq('congregation_id', settings.congregation_id)
        .order('szam_kezdet', { ascending: true })
      if (error) return { data: undefined, error: error.message }

      // 2026-07-25 (F6.1): LAPOZOTT — a kiállított nyugták száma évente
      // több száz, a PostgREST plafonja némán levágta volna a min/max-ot.
      const { data: chitantak } = await selectAllPaged<{
        tomb_id: string | null
        gyulekezeti_szam: number | null
      }>(
        supabase
          .from('oblio_szamlak')
          .select('id, tomb_id, gyulekezeti_szam')
          .eq('congregation_id', settings.congregation_id)
          .eq('tipus', 'chitanta_papir')
          .eq('stornozott', false)
          .not('gyulekezeti_szam', 'is', null),
      )

      const gyulSzamByTomb = new Map<string, { min: number; max: number }>()
      for (const c of chitantak || []) {
        if (!c.tomb_id || c.gyulekezeti_szam == null) continue
        const existing = gyulSzamByTomb.get(c.tomb_id as string)
        if (!existing) {
          gyulSzamByTomb.set(c.tomb_id as string, {
            min: c.gyulekezeti_szam as number,
            max: c.gyulekezeti_szam as number,
          })
        } else {
          existing.min = Math.min(existing.min, c.gyulekezeti_szam as number)
          existing.max = Math.max(existing.max, c.gyulekezeti_szam as number)
        }
      }

      const filtered = ((tombok || []) as Record<string, unknown>[]).filter((t) => {
        const elso = t.elso_hasznalat_datum as string | null
        const utolso = t.utolso_hasznalat_datum as string | null
        if (!elso && !utolso) return false
        const elsoYear = elso ? new Date(elso).getFullYear() : null
        const utolsoYear = utolso ? new Date(utolso).getFullYear() : null
        return elsoYear === year || utolsoYear === year
      })

      return {
        data: filtered.map((t, idx) => {
          const gyul = gyulSzamByTomb.get(t.id as string)
          return {
            sorszam: idx + 1,
            block_nr: (t.block_nr as string | null) || null,
            seria: t.seria as string,
            nyomdai_kezdet: t.szam_kezdet as number,
            nyomdai_veg: t.szam_veg as number,
            datum_kezdet: (t.elso_hasznalat_datum as string | null) || null,
            datum_veg: (t.utolso_hasznalat_datum as string | null) || null,
            sajat_kezdet: gyul?.min ?? null,
            sajat_veg: gyul?.max ?? null,
            felhasznalt_darabszam: t.felhasznalt_darabszam as number,
            darabszam_ossz: t.darabszam_ossz as number,
            aktiv: t.aktiv as boolean,
          }
        }),
        error: null,
      }
    } catch (e) {
      return { data: undefined, error: errorMessage(e) }
    }
  }, [
    settings.congregation_id,
  ])

  const onLoadSavedDocs = useCallback(async (year: number): Promise<SavedDocOption[]> => {
    if (!(await isOnlineWithSession())) return []
    try {
      const supabase = getDesktopSupabase()
      const [decontRes, dispRes] = await Promise.all([
        supabase
          .from('decont')
          .select('id, sorszam, datum, elszamolo_nev, jovahagyta, jelleg, kapott_eloleg, osszkoltseg, tetelek')
          .eq('congregation_id', settings.congregation_id)
          .eq('ev', year)
          .eq('deleted', false)
          .order('sorszam', { ascending: true }),
        supabase
          .from('dispozitie')
          .select('id, tipus, sorszam, datum, nev, tisztseg, osszeg, cel, ci_tipus, ci_serie, ci_nr')
          .eq('congregation_id', settings.congregation_id)
          .eq('ev', year)
          .eq('deleted', false)
          .order('datum', { ascending: true }),
      ])

      const deconts: SavedDocOption[] = ((decontRes.data || []) as Record<string, unknown>[]).map((r) => {
        const tetelek = Array.isArray(r.tetelek) ? (r.tetelek as Record<string, unknown>[]) : []
        const datum = String(r.datum).slice(0, 10)
        return {
          id: String(r.id),
          label: `#${r.sorszam} · ${datum} · ${String(r.elszamolo_nev || '—')}`,
          kind: 'decont' as const,
          data: {
            sorszam: Number(r.sorszam),
            date: datum,
            personName: String(r.elszamolo_nev || ''),
            jelleg: String(r.jelleg || ''),
            approvedBy: String(r.jovahagyta || ''),
            advance: Number(r.kapott_eloleg) || 0,
            items: tetelek.map((t) => ({
              actNr: String(t.act_nr || ''),
              actType: String(t.act_type || ''),
              actDate: String(t.act_date || ''),
              issuer: String(t.issuer || ''),
              explanation: String(t.explanation || ''),
              amount: Number(t.amount) || 0,
            })),
          },
        }
      })

      const dispozitiok: SavedDocOption[] = ((dispRes.data || []) as Record<string, unknown>[]).map((r) => {
        const datum = String(r.datum).slice(0, 10)
        const tipus = String(r.tipus || 'plata')
        return {
          id: String(r.id),
          label: `${tipus === 'plata' ? 'Plată' : 'Încasare'} #${r.sorszam} · ${datum} · ${String(r.nev || '—')}`,
          kind: 'dispozitie' as const,
          data: {
            tipus,
            sorszam: Number(r.sorszam),
            date: datum,
            name: String(r.nev || ''),
            tisztseg: String(r.tisztseg || ''),
            amount: Number(r.osszeg) || 0,
            cel: String(r.cel || ''),
            ciTipus: String(r.ci_tipus || ''),
            ciSerie: String(r.ci_serie || ''),
            ciNr: String(r.ci_nr || ''),
          },
        }
      })

      return [...deconts, ...dispozitiok]
    } catch {
      return []
    }
  }, [
    settings.congregation_id,
  ])

  const onLoadBudgetRows = useCallback(async (year: number): Promise<Record<string, unknown>> => {
    try {
      if (!(await isOnlineWithSession())) return {}
      const rows = await loadBudgetRowsCompat(getDesktopSupabase(), year, settings.congregation_id)
      const map: Record<string, unknown> = {}
      rows.forEach((r) => {
        map[r.szamadasicelid] = {
          szamadasicelid: r.szamadasicelid,
          tervezett: r.tervezett,
          modositott: r.modositott,
          mod2: r.mod2,
          mod3: r.mod3,
        }
      })
      return map
    } catch {
      return {}
    }
  }, [
    settings.congregation_id,
  ])

  const onPrintToBrowser = useCallback((html: string) => printHtmlViaIframe(html), [])
  const onPrintToPdf = useCallback((html: string) => printHtmlViaIframe(html), [])
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full flex-col overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 pr-14">
          <DialogTitle>Pénzügyi nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <FinancePrintDialogBody
            open={open}
            printableTypes={printableTypes}
            bankAccounts={bankAccounts.map((b) => ({
              id: b.id,
              bank_neve: b.bank_neve,
              iban: b.iban,
            }))}
            categories={cellek
              // 2026-07-10 (S3 #1e, web-paritás): a 100-as fejezet (legacy belső
              // mozgás) is kizárva — a builder úgyis belsőként hagyja ki.
              .filter(
                (c) =>
                  c.kod &&
                  !/^[34]/.test(c.kod) &&
                  c.kod !== '100' &&
                  !c.kod.startsWith('100.') &&
                  (c.type === 'B' || c.type === 'K'),
              )
              .map((c) => ({ kod: c.kod, nev: c.nev || c.kod, type: c.type as 'B' | 'K' }))
              .sort((a, b) => a.kod.localeCompare(b.kod, undefined, { numeric: true }))}
            currentYear={currentYear}
            buildReport={buildReport}
            // 2026-07-10 (S5-#3): a kiválasztott év sorai + nyitói — a webes
            // getYearFinanceRecords tükre (azonos select-ek + nyitó-számítás).
            onLoadYearRecords={onLoadYearRecords}
            // Nyugtatömb-kimutatás — a web `getChitantaTombokReport` tükre
            // (chitanta_tombok + gyülekezeti számok az oblio_szamlak-ból).
            onLoadNyugtatombok={onLoadNyugtatombok}
            // Decont + Dispoziție újranyomtatás — a web reprint-listák tükre.
            onLoadSavedDocs={onLoadSavedDocs}
            onLoadBudgetRows={onLoadBudgetRows}
            // Desktopon mindkét mód a rendszer print-dialógusát nyitja
            // (PDF-be mentés onnan választható).
            onPrintToBrowser={onPrintToBrowser}
            onPrintToPdf={onPrintToPdf}
            onToast={onToast}
            onClose={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
