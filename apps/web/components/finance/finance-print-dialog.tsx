'use client'

/**
 * Webes FinancePrintDialog wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.5): a vizuális réteg + state-management
 * átkerült a `@kartoteka/ui-app/finance` shared package-be
 * (`FinancePrintDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a print-engine-t (`print-engine-v2.ts`), a server actiont
 * (`getChitantaTombokReport`), a sonner toast-ot és a HTML builder-t
 * (`buildFinancePrintDocument`) köti be a callback prop-okra.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FinancePrintDialogBody,
  type FinancePrintFilters,
  type FinancePrintType,
  type FinancePrintTypeMeta,
  type SavedDocOption,
  type PrintReport,
  type DecontDocData,
  type DispozitieDocData,
  buildDecontHtml,
  buildDispozitieHtml,
  // 2026-08-15 (átvilágítás 15.): a borító iktató-/határozat-mezőinek KÖZÖS
  // leképezése — hogy a webes és a desktopos dialógus ne húzhasson szét.
  hivatalosHatarozatMezok,
} from '@kartoteka/ui-app'
import {
  buildFinancePrintDocument,
  FINANCE_PRINT_TYPES,
  type FinanceReportData,
} from '@/lib/finance/reporting'
import {
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BudgetPrintData,
  type BudgetPrintType,
} from '@/lib/finance/budget-reporting'
import { loadBudgetRowsCompat, type BudgetCompatRow } from '@/lib/finance/budget-compat'
// 2026-08-15 (egyházmegyei terv, 2.1): hatókör-tudatos évi beállítás-betöltő
// (a Költségvetés nyomtatási központ UGYANEZT hívja — közös helper).
import { loadEvBeallitas } from '@/lib/finance/print-scope'
// 2026-08-11 (6. kör): a részszámadás IDŐSZAKI nyitó/záró levezetése — tiszta
// függvény, önellenőrzéssel (`npm run selftest:reszszamadas`).
import { computePeriodBalances, type PeriodRow } from '@kartoteka/core'
import { createClient } from '@/lib/supabase/client'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getChitantaTombokReport } from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'
import { getYearFinanceRecords } from '@/app/(dashboard)/penzugy/actions'
import { listDecontReprint } from '@/app/(dashboard)/penzugy/decont-actions'
import { listDispozitieReprint } from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'
import type { BefitetesRow, KiadasRow, BankAccount, SzamadasiCel, BealitasRow } from '@/lib/constants/finance'

interface FinancePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  income: BefitetesRow[]
  expense: KiadasRow[]
  bankAccounts: BankAccount[]
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") a nyomtatványokhoz. */
  congregationNameRo?: string
  carryoverCash: number
  carryoverBank: number
  /** 2026-07-17 (F4): az idei rögzített bank-nyitók számlánként (Registru Banca). */
  bankNyitoMap?: Record<number, number>
  currentYear: number
  settings: BealitasRow
  /**
   * 2026-08-15 (egyházmegyei terv, 2.1): a nyomtatványok HATÓKÖRE. Megyei
   * hatókörben az évi beállítás a `diocese_bealitas`-ból, a terv-sorok a
   * `diocese_koltsegvetes`-ből jönnek, és a borító a megyei feliratokat kapja.
   */
  scope?: 'congregation' | 'diocese'
  /** Az egyházkerület neve a megyei borító felső blokkjához. */
  districtName?: string | null
}

/** 2026-07-10 (S5-#3): a Body opak yearRecords-ának webes alakja. */
type YearRecordsPayload = {
  income: BefitetesRow[]
  expense: KiadasRow[]
  carryoverCash: number
  carryoverBank: number
  bankNyitoMap?: Record<number, number>
  /** 2026-08-11 (6. kör): sikerült-e a nyitók feloldása (fail-closed kapu). */
  nyitoOk?: boolean
  nyitoBizonytalan?: boolean
  /**
   * 2026-08-15 (átvilágítás 13.): a KIVÁLASZTOTT év `bealitas` sora.
   * `null` = az évhez nincs beállítás-sor (sosem nyitották meg) — ez ISMERT
   * állapot, nem hiba: a nyomtatvány ilyenkor „nincs véglegesítve"-ként megy.
   */
  settings?: BealitasRow | null
  /**
   * `false` = a beállítás-sor lekérése HIBÁRA futott, tehát nem tudjuk, hogy az
   * adott év véglegesítve van-e és mik a tartozásai → fail-closed: a hivatalos
   * költségvetés/számadás nyomtatvány LETILTVA. Néma, rossz évből származó
   * záró blokk helyett inkább semmit.
   */
  settingsOk?: boolean
}

/** Bizonylat-típusok, amelyeknek NEM kellenek a bevétel/kiadás sorok
 *  (saját lazy-loaderük van vagy snapshot-ból nyomtatnak). */
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

/** 2026-08-11 (6. kör): hangos, NYOMTATÁST TILTÓ előnézet (`blocked: true`). */
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

export function FinancePrintDialog({
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
  scope = 'congregation',
  districtName,
}: FinancePrintDialogProps) {
  // 2026-08-11 (6. kör): a RÉSZSZÁMADÁS mostantól ITT érhető el. Eddig a
  // `.filter((t) => t.id !== 'reszszamadas')` kizárta abból az EGYETLEN
  // felületből, ahol a lelkész nyomtatványt keres — miközben a rendszer saját
  // negyedéves teendőlistája a nyomtatását írja elő.
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

  // Csoportnapló jogcím-választó opciói: a számadási célok (belső mozgások nélkül),
  // kód szerint numerikusan rendezve.
  // 2026-07-10 (S3 #1e): a 3xx/4xx mellett a 100-as fejezet (legacy belső mozgás /
  // pénztármaradvány: 100, 100.01, 100.5x) is kimarad — a buildCsoportNaplo ezeket
  // belsőként kihagyja, így felkínálásuk MINDIG üres nyomtatványt adott volna.
  // ── 2026-08-15 (átvilágítás 13.): ÉV-SCOPE-OLT beállítás-lekérés ─────────
  //
  // MI VOLT A ROSSZ: a `settings` prop MINDIG az OLDAL évének `bealitas` sora,
  // az év-választó viszont 8 évet kínál. A tételek és a költségvetés-sorok
  // évhelyesen töltődtek újra, de a hivatalos záró blokk (`szamadas_tartozasok`)
  // és a véglegesítés-zászló az oldal évéből jött.
  // MI VOLT A KÖVETKEZMÉNYE: a 2026-on álló oldalról nyomtatott 2025-ös Számadás
  // 116–127. Datorii sorába a 2026-os tartozás került, és mivel a 134. sor
  // Záróegyenleg = 113 − 116 + 128, a 2025-ös ív VÉGSŐ egyenlege is ennyivel
  // tért el — aláírható, beküldhető papíron. A `bealitas` sor évenként külön
  // létezik (id = év), tehát a kiválasztott évre kell lekérni.
  // 2026-08-15 (egyházmegyei terv, 2.1): a betöltés HATÓKÖR-TUDATOS közös
  // helperrel megy (lib/finance/print-scope.ts) — megyei nézetben a
  // `diocese_bealitas` sorát hozza. Eddig itt a gyülekezeti tábla állt, és
  // megyei hatókörben (ahol az azonosító az egyházmegyéé) NÉMÁN üres maradt:
  // a megyei ív „nincs véglegesítve" felirattal ment ki a lezárt évekre is.
  const loadYearSettings = async (
    year: number,
  ): Promise<{ row: BealitasRow | null; ok: boolean }> => {
    const supabase = createClient()
    return await loadEvBeallitas(supabase, scope, settings.congregation_id, year)
  }

  const categoryOptions = cellek
    .filter(
      (c) =>
        c.kod &&
        !/^[34]/.test(c.kod) &&
        c.kod !== '100' &&
        !c.kod.startsWith('100.') &&
        (c.type === 'B' || c.type === 'K'),
    )
    .map((c) => ({ kod: c.kod, nev: c.nev || c.kod, type: c.type as 'B' | 'K' }))
    .sort((a, b) => a.kod.localeCompare(b.kod, undefined, { numeric: true }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-full flex-col overflow-hidden p-0 sm:max-w-7xl">
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
          categories={categoryOptions}
          currentYear={currentYear}
          buildReport={(filters: FinancePrintFilters): PrintReport => {
            // 2026-07-10 (S5-#3): a bevétel/kiadás sorok a KIVÁLASZTOTT évhez.
            // Az oldal évén a props-beli (memóriában lévő) sorokat használjuk;
            // más évnél a Body által betöltött yearRecords-ot — amíg az töltődik,
            // "Betöltés…" előnézetet adunk (mint a budgetRows-nál).
            // 2026-08-11 (6. kör): a Body `undefined`-et ad, ha a props-beli
            // (oldal-évi) sorok elegendők, és `null`-t, amíg tölt. A
            // részszámadás a FOLYÓ évben IS a szerverről kéri a sorokat — csak
            // ott van SZÁMLÁNKÉNTI feloldott nyitó és `nyitoOk`.
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
            // 2026-08-15 (átvilágítás 13.): a beállítás-sor is a KIVÁLASZTOTT évé.
            // Ha `yr` van, az oldal évétől eltérő (vagy részszámadás-) évet nézünk,
            // ilyenkor a props-beli `settings` MÁS év sora lenne.
            // KIVÉTEL: ha az újratöltött év MAGA az oldal éve (részszámadás), a
            // props-beli sor a mérvadó — azt a szerver oldotta fel, egyházmegyei
            // nézetben például a `diocese_bealitas` táblából, ahol a lenti
            // `bealitas`-lekérés természetesen nem talál semmit.
            const settingsUse: BealitasRow | null = yr
              ? (yr.settings ?? (filters.selectedYear === currentYear ? settings : null))
              : settings
            const settingsOk = yr ? yr.settingsOk !== false : true

            // Korábbi bizonylatok újranyomtatása (a snapshot adatból)
            if (filters.printType === 'decont_reprint') {
              const doc = filters.selectedDoc
              if (!doc) return emptyPreview('Válassz egy korábbi elszámolást a bal oldalon.')
              const data = doc.data as Omit<DecontDocData, 'congregationName'>
              return {
                html: buildDecontHtml({ congregationName, ...data }),
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

              // 2026-08-15 (átvilágítás 13.): FAIL-CLOSED kapu. Ha a kiválasztott
              // év beállítás-sorát nem sikerült lekérni, nem tudjuk, véglegesítve
              // van-e, mi a presbitériumi határozata és mik a tartozásai. A
              // hivatalos ívet ilyenkor NEM adjuk ki: a hiányzó adat helyére az
              // OLDAL évének adata kerülne — pontosan az a hamis papír, ami ellen
              // ez a javítás készült. (A részszámadás nem hivatalos zárszámadás,
              // és a záró blokkot sem használja — annak saját kapui vannak.)
              if (!isReszszamadas && !settingsOk) {
                return blockedPreview(
                  'Ez a nyomtatvány most nem készíthető el',
                  `A(z) ${filters.selectedYear}. évi pénzügyi beállítások (véglegesítés, presbitériumi határozat, tartozások) nem tölthetők be, ezért a nyomtatvány hibás adatokkal készülne. Ellenőrizd az internetkapcsolatot, és próbáld újra. Ha újra ezt írja, jelezd a rendszergazdának.`,
                )
              }

              // 2026-08-11 (6. kör): a részszámadás tény-oszlopa CSAK az
              // időszaki tételeket összegzi. A nyitó/záró NEM ebből jön —
              // azt a `computePeriodBalances` vezeti le a pénzmozgásból.
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
              // 2026-07-10 (S3 audit KRITIKUS #1): stornózott tétel a hivatalos
              // költségvetés/számadás nyomtatvány tényadatába sem számít.
              // 2026-08-11 (K5-#6): a tény-oszlop a NYERS deviza-összeget (`osszeg`)
              // adta össze, miközben a Registru Casa/Banca/Jurnal a RON-ekvivalenst
              // (`osszeg_ron`) használja (reporting.ts `ronOf`, helpers.ts
              // calculateBalances). Devizás banki tételnél (pl. 1000 EUR = 4970 lej)
              // a Számadás 1000 lejt, a Registru 4970 lejt írt — két hivatalos,
              // ALÁÍRT papír ugyanarra az évre, egymásnak ellentmondó összeggel.
              // A könyvelés RON-ban folyik, ezért mindenhol `osszeg_ron ?? osszeg`.
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

              const printData: BudgetPrintData = {
                cellek,
                budgetRows: filters.budgetRows as Record<string, BudgetCompatRow>,
                actualIncome,
                actualExpense,
                congregationName,
                congregationNameRo,
                // 2026-08-15 (terv 2.1/3): a borító feliratai a KIÁLLÍTÓ
                // szintjét követik (megyei íven kerületi blokk + közgyűlés).
                printScope: scope,
                districtName,
                year: filters.selectedYear,
                carryoverCash: carryoverCashUse,
                carryoverBank: carryoverBankUse,
                finalized: isSzamadas
                  ? !!settingsUse?.accounting_finalized
                  : !!settingsUse?.budget_finalized,
                // 2026-08-15 (átvilágítás 15.): a presbitériumi határozat és az
                // egyházközségi iktatószám. Eddig CSAK a `finalized` zászló ment
                // át, ezért a véglegesített ív borítóján a határozat-sor üresen
                // maradt — és mivel az „ez még nincs véglegesítve" magyarázat is
                // eltűnt, a lelkész észre sem vette, hogy hiányos papírt ad be.
                ...hivatalosHatarozatMezok(settingsUse, isSzamadas ? 'szamadas' : 'koltsegvetes'),
              }

              // ── 2026-08-14 (K2): a hivatalos 113–134. záró blokk adatai ──
              if (isSzamadas && !isReszszamadas) {
                // Tartozások/Kintlévőségek a bealitas.szamadas_tartozasok-ból
                // (a Könyvelés fül rögzítője írja). Kulcs: hivatalos Nr. rând.
                const toNumMap = (m?: Record<string, number>): Record<number, number> => {
                  const ki: Record<number, number> = {}
                  for (const [nr, v] of Object.entries(m || {})) {
                    const n = Number(nr)
                    if (Number.isFinite(n)) ki[n] = Number(v) || 0
                  }
                  return ki
                }
                // 2026-08-15 (átvilágítás 13.): a KIVÁLASZTOTT év sorából.
                const stored = settingsUse?.szamadas_tartozasok
                printData.tartozasok = toNumMap(stored?.tartozasok ?? undefined)
                printData.kintlevosegek = toNumMap(stored?.kintlevosegek ?? undefined)

                // Év végi Casa/Banca (114–115. sor): ugyanazzal a levezetéssel,
                // mint a részszámadás, csak a teljes évre. Ha a levezetés
                // hibázik, a mezők üresen maradnak → a papíron „—" áll (őszinte
                // fallback), az ÉVES Számadást nem blokkoljuk miatta.
                const evesBalances = computePeriodBalances({
                  income: incomeUse as unknown as PeriodRow[],
                  expense: expenseUse as unknown as PeriodRow[],
                  year: filters.selectedYear,
                  periodFrom: `${filters.selectedYear}-01-01`,
                  periodTo: `${filters.selectedYear}-12-31`,
                  yearOpeningCash: carryoverCashUse,
                  yearOpeningBankById: bankNyitoMapUse || {},
                  actualIncomeByCode: actualIncome,
                  actualExpenseByCode: actualExpense,
                })
                if (!('error' in evesBalances)) {
                  printData.zaroCasa = evesBalances.cash.closing
                  printData.zaroBanca = evesBalances.bank.closing
                }
              }

              // ── RÉSZSZÁMADÁS: időszaki nyitó/záró levezetés + fail-closed ──
              if (isReszszamadas) {
                // A nyitók feloldása HANGOSAN bukik: a részszámadás MINDEN
                // száma a nyitóra épül, néma 0-bázisból hamis papír lenne.
                if (yr && yr.nyitoOk === false) {
                  return blockedPreview(
                    'A részszámadás most nem nyomtatható',
                    'A nyitó egyenlegek feloldása nem sikerült, így az időszak nyitó és záró egyenlege nem vezethető le. Nyisd meg a Pénzügy → Bank / Kassza fület, ellenőrizd a nyitó egyenlegeket, majd próbáld újra.',
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
                  // SZÁMLÁNKÉNTI nyitó. SOHA nem az aggregát `carryoverBank`
                  // egyetlen számlára — az egy MÁSIK számla nyitóját írná oda.
                  yearOpeningBankById: bankNyitoMapUse || {},
                  actualIncomeByCode: actualIncome,
                  actualExpenseByCode: actualExpense,
                })
                if ('error' in balances) {
                  return blockedPreview('A részszámadás most nem nyomtatható', balances.error)
                }
                // Devizás számla az időszakban → RON-ekvivalens lábjegyzet.
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
          }}
          onLoadYearRecords={async (year): Promise<unknown> => {
            // 2026-07-10 (S5-#3): a kiválasztott év sorai + nyitói a szerverről.
            // 2026-08-15 (átvilágítás 13.): a tételek MELLÉ az adott év
            // `bealitas` sora is — abból jön a véglegesítés-zászló, a
            // presbitériumi határozat és a hivatalos záró blokk (tartozások).
            const [res, evSettings] = await Promise.all([
              getYearFinanceRecords(year),
              loadYearSettings(year),
            ])
            if (res.error || !res.income || !res.expense) {
              toast.error(`A(z) ${year}. évi tételek betöltése sikertelen${res.error ? `: ${res.error}` : '.'}`)
              // 2026-08-11 (6. kör): `nyitoOk: false` → a részszámadás LETILTVA.
              // Üres tétel-listából némán „0 lej mindenütt" papír készülne.
              // 2026-08-15: ugyanezért `settingsOk: false` — ha az év tételei nem
              // jöttek meg, a hivatalos költségvetés/számadás ív sem adható ki.
              return {
                income: [],
                expense: [],
                carryoverCash: 0,
                carryoverBank: 0,
                nyitoOk: false,
                settings: null,
                settingsOk: false,
              } satisfies YearRecordsPayload
            }
            return {
              income: res.income,
              expense: res.expense,
              carryoverCash: res.carryoverCash ?? 0,
              carryoverBank: res.carryoverBank ?? 0,
              bankNyitoMap: res.bankNyitoMap,
              nyitoOk: res.nyitoOk,
              nyitoBizonytalan: res.nyitoBizonytalan,
              settings: evSettings.row,
              settingsOk: evSettings.ok,
            } satisfies YearRecordsPayload
          }}
          onLoadNyugtatombok={async (year) => {
            const res = await getChitantaTombokReport(year)
            return {
              data: 'data' in res ? res.data : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onLoadSavedDocs={async (year): Promise<SavedDocOption[]> => {
            const [deconts, dispozitiok] = await Promise.all([
              listDecontReprint(year).catch(() => []),
              listDispozitieReprint(year).catch(() => []),
            ])
            return [
              ...deconts.map((d) => ({ id: d.id, label: d.label, kind: 'decont' as const, data: d.data })),
              ...dispozitiok.map((d) => ({ id: d.id, label: d.label, kind: 'dispozitie' as const, data: d.data })),
            ]
          }}
          onLoadBudgetRows={async (year): Promise<Record<string, unknown>> => {
            try {
              const supabase = createClient()
              // Hatókör-tudatos: megyei nézetben a `diocese_koltsegvetes`
              // tábla — enélkül a megyei ív minden terv-sora nulla lett volna.
              const rows = await loadBudgetRowsCompat(supabase, year, settings.congregation_id, scope)
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
          }}
          loadingLogoSrc="/kartoteka-icon.png"
          onPrintToBrowser={(html) => printToBrowser(html)}
          onPrintToPdf={(html, filename, options) =>
            printToPdf(html, filename, {
              orientation: options?.orientation,
              margin: options?.margin,
              format: options?.format,
            })
          }
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onClose={() => onOpenChange(false)}
        />
        </div>
      </DialogContent>
    </Dialog>
  )
}
