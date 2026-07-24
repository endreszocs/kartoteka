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

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import {
  FinancePrintDialogBody,
  buildDecontHtml,
  buildDispozitieHtml,
  buildFinancePrintDocument,
  buildBudgetPrintDocument,
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
import { loadBudgetRowsCompat } from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { printHtmlViaIframe } from '../lib/print-html'

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
  // (a kísérőív a kiadás-oldalról nyomtatható, a részszámadás a Költségvetés-
  // nyomtatási központból — mint a weben).
  const budgetTypes: FinancePrintTypeMeta[] = BUDGET_PRINT_TYPES.filter(
    (t) => t.id !== 'reszszamadas',
  ).map((t) => ({ id: t.id as FinancePrintType, title: t.title, subtitle: t.subtitle, description: t.description }))
  const printableTypes: FinancePrintTypeMeta[] = [
    ...FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv'),
    ...budgetTypes,
  ]

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
            buildReport={(filters: FinancePrintFilters): PrintReport => {
              // 2026-07-10 (S5-#3, web-paritás): a sorok a KIVÁLASZTOTT évhez —
              // az oldal évén a props, más évnél a Body által betöltött yearRecords.
              const yearScoped = filters.selectedYear !== currentYear
              if (
                yearScoped &&
                filters.yearRecords == null &&
                !TYPES_WITHOUT_RECORDS.has(filters.printType)
              ) {
                return emptyPreview(`A(z) ${filters.selectedYear}. évi tételek betöltése…`)
              }
              const yr = yearScoped ? (filters.yearRecords as YearRecordsPayload | null) : null
              const incomeUse = yr ? yr.income : income
              const expenseUse = yr ? yr.expense : expense
              const carryoverCashUse = yr ? yr.carryoverCash : carryoverCash
              const carryoverBankUse = yr ? yr.carryoverBank : carryoverBank
              const bankNyitoMapUse = yr ? yr.bankNyitoMap : bankNyitoMap

              // Korábbi bizonylatok újranyomtatása (a mentett pillanatképből)
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

              // Költségvetés / költségvetés-módosítás / számadás
              if (
                filters.printType === 'koltsegvetes' ||
                filters.printType === 'koltsegvetes_modositas' ||
                filters.printType === 'szamadas'
              ) {
                if (!filters.budgetRows) return emptyPreview('Költségvetési adatok betöltése…')
                const isSzamadas = filters.printType === 'szamadas'
                const actualIncome: Record<string, number> = {}
                const actualExpense: Record<string, number> = {}
                // 2026-07-10 (S5, web-paritás — S3 audit KRITIKUS #1): a stornózott
                // tétel a hivatalos tényadatba sem számít (a webes wrapper már így
                // számolt, a desktop-tükörből kimaradt).
                for (const r of incomeUse) {
                  if (r.deleted || r.stornozott) continue
                  const code = r.id_befizetescel ? bevCelMap[r.id_befizetescel] : undefined
                  if (code) actualIncome[code] = (actualIncome[code] || 0) + Number(r.osszeg || 0)
                }
                for (const r of expenseUse) {
                  if (r.deleted || r.stornozott) continue
                  const code = r.id_kiadascel ? kiaCelMap[r.id_kiadascel] : undefined
                  if (code) actualExpense[code] = (actualExpense[code] || 0) + Number(r.osszeg || 0)
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
            // 2026-07-10 (S5-#3): a kiválasztott év sorai + nyitói — a webes
            // getYearFinanceRecords tükre (azonos select-ek + nyitó-számítás).
            onLoadYearRecords={async (year): Promise<unknown> => {
              const emptyPayload: YearRecordsPayload = { income: [], expense: [], carryoverCash: 0, carryoverBank: 0 }
              if (!(await isOnlineWithSession())) {
                onToast?.('A múltbeli évek nyomtatásához internetkapcsolat és belépés szükséges.', 'warning')
                return emptyPayload
              }
              try {
                const supabase = getDesktopSupabase()
                const congregationId = settings.congregation_id
                const [bevRes, kiaRes, prevBevRes, prevKiaRes, cashNyitoRes, bankNyitoRes] = await Promise.all([
                  supabase.from('befizetes').select('id, osszeg, datum, id_befizetescel, id_szemely, id_csalad, forrasa, nyugta, iratszam, irattipus, fizetettev, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
                  supabase.from('kiadas').select('id, osszeg, datum, id_kiadascel, atvevo, atvevoid, nyugta, iratszam, irattipus, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
                  supabase.from('befizetes').select('osszeg, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`),
                  supabase.from('kiadas').select('osszeg, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`),
                  supabase.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg')
                    .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
                  supabase.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron, bankszamla_id')
                    .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
                ])
                const firstErr = bevRes.error || kiaRes.error || prevBevRes.error || prevKiaRes.error
                if (firstErr) {
                  onToast?.(`A(z) ${year}. évi tételek betöltése sikertelen: ${firstErr.message}`, 'error')
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
                let cashNet = 0, bankNet = 0
                ;((prevBevRes.data || []) as { osszeg: number; bankszamla_id: number | null }[]).forEach((r) => {
                  if (r.bankszamla_id == null) cashNet += Number(r.osszeg) || 0
                  else bankNet += Number(r.osszeg) || 0
                })
                ;((prevKiaRes.data || []) as { osszeg: number; bankszamla_id: number | null }[]).forEach((r) => {
                  if (r.bankszamla_id == null) cashNet -= Number(r.osszeg) || 0
                  else bankNet -= Number(r.osszeg) || 0
                })
                return {
                  income: (bevRes.data || []) as BefitetesRow[],
                  expense: (kiaRes.data || []) as KiadasRow[],
                  carryoverCash: hasCashCur ? recCashCur : recCashPrev + cashNet,
                  carryoverBank: hasBankCur ? recBankCur : recBankPrev + bankNet,
                  bankNyitoMap: yearBankNyitoMap,
                } satisfies YearRecordsPayload
              } catch (e) {
                onToast?.(`A(z) ${year}. évi tételek betöltése sikertelen: ${errorMessage(e)}`, 'error')
                return emptyPayload
              }
            }}
            // Nyugtatömb-kimutatás — a web `getChitantaTombokReport` tükre
            // (chitanta_tombok + gyülekezeti számok az oblio_szamlak-ból).
            onLoadNyugtatombok={async (year) => {
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

                const { data: chitantak } = await supabase
                  .from('oblio_szamlak')
                  .select('tomb_id, gyulekezeti_szam')
                  .eq('congregation_id', settings.congregation_id)
                  .eq('tipus', 'chitanta_papir')
                  .eq('stornozott', false)
                  .not('gyulekezeti_szam', 'is', null)

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
            }}
            // Decont + Dispoziție újranyomtatás — a web reprint-listák tükre.
            onLoadSavedDocs={async (year): Promise<SavedDocOption[]> => {
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
            }}
            onLoadBudgetRows={async (year): Promise<Record<string, unknown>> => {
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
            }}
            // Desktopon mindkét mód a rendszer print-dialógusát nyitja
            // (PDF-be mentés onnan választható).
            onPrintToBrowser={(html) => printHtmlViaIframe(html)}
            onPrintToPdf={(html) => printHtmlViaIframe(html)}
            onToast={onToast}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
