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
                year: filters.selectedYear,
                carryoverCash: carryoverCashUse,
                carryoverBank: carryoverBankUse,
                finalized: isSzamadas ? !!settings.accounting_finalized : !!settings.budget_finalized,
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
                const stored = settings.szamadas_tartozasok
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
            const res = await getYearFinanceRecords(year)
            if (res.error || !res.income || !res.expense) {
              toast.error(`A(z) ${year}. évi tételek betöltése sikertelen${res.error ? `: ${res.error}` : '.'}`)
              // 2026-08-11 (6. kör): `nyitoOk: false` → a részszámadás LETILTVA.
              // Üres tétel-listából némán „0 lej mindenütt" papír készülne.
              return {
                income: [],
                expense: [],
                carryoverCash: 0,
                carryoverBank: 0,
                nyitoOk: false,
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
              const rows = await loadBudgetRowsCompat(supabase, year, settings.congregation_id)
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
