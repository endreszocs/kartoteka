'use client'

/**
 * AccountingTab — közös számadás-megjelenítő (Sprint Q Fázis 1, v0.6.2).
 *
 * Élő számadási kép: költségvetés (terv) vs. tényleges (befizetés/kiadás)
 * megvalósulás, kategóriánkénti összehasonlító táblázat, véglegesítés gomb.
 *
 * **Adatfogadás props-on**: a `budgetData`-t a szülő tölti be (web-en
 * Supabase-ből, desktop-on Tauri SQLite-ből). A finalize-wizard `finalizeWizardSlot`
 * prop-on érkezik — a web `AccountingFinalizeWizard`-ot ad át, a desktop pedig
 * majd saját, lokális verziót.
 *
 * **Server-action callback-ek**:
 *   - `onRequestUnlock(reason)`: javítási kérelem küldése (web → server action,
 *     desktop → outbox/online)
 *   - `onRefresh()`: lap újratöltése sikeres művelet után (web: router.refresh,
 *     desktop: notifyLocalDataChanged)
 *   - `onToast(msg, kind)`: feedback (web: sonner, desktop: belső állapot)
 *
 * Eredeti web fájl: `apps/web/components/finance/accounting-tab-v2.tsx` (396 sor).
 */

import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Landmark, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react'

import { Badge } from '@kartoteka/ui'

// 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb — egy megjelenés,
// egy viselkedés mind a 6 irat-típusnál. A wizard-flow változatlan (skipConfirm).
import { FinalizeButton } from '../shared/FinalizeButton'
import {
  gyulekezetSzerkesztheti,
  osszegezLevelek,
  szamadasIvCellak,
} from './budget-reporting'
import { FinanceLoadingState } from './FinanceLoadingState'
import { formatCurrency } from './helpers'
import type { FinanceBalances } from './helpers'
import type { BealitasRow, BefitetesRow, KiadasRow, SzamadasiCel } from './types'

export type AccountingScope = 'congregation' | 'diocese'
export type ToastKind = 'success' | 'error' | 'info'

export interface AccountingTabProps {
  szamadasiCellek: SzamadasiCel[]
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
  currentYear: number
  scope?: AccountingScope

  /**
   * A költségvetési tervek térképe (`szamadasicelid -> tervezett összeg`).
   * A szülő tölti be (web: Supabase, desktop: Tauri SQLite).
   * Ha még tölt, `loading` prop-ot is állítson true-ra.
   */
  budgetData: Record<string, number>
  loading?: boolean

  /**
   * 2026-07-10 (#2): NYITÓ egyenlegek (előző évi záró) — display-only blokk a
   * fül tetején, a hivatalos EREK-minta 1–3. sora szerint. OPCIONÁLIS: ha
   * undefined (pl. desktop hívó), a blokk nem jelenik meg. NEM kerül mentésre.
   */
  carryoverCash?: number
  carryoverBank?: number

  /** 2026-07-10 (S2 #9): a betöltő-állapot logója (web: '/kartoteka-icon.png'). */
  loadingLogoSrc?: string

  /**
   * 2026-07-25 (G3): évi összegző hero — a szülő által MÁR kiszámolt, a Kassza/
   * Bank/Dashboard fülekkel bit-azonos egyenlegek (web: FinanceTabs balances
   * memo, desktop: penzugy-page yearBalances). OPCIONÁLIS: ha undefined (pl. a
   * desktop önálló számadás-oldala), a hero-sor nem jelenik meg. A fülön belül
   * TILOS újraszámolni — a divergencia-kapu ellen csak lecsorgatás megengedett.
   */
  balances?: FinanceBalances

  /**
   * 2026-07-10 (#2): előző évi (currentYear-1) TÉNY kódonként — halvány
   * „Előző évi tény" referencia-oszlop a terv/tény táblákban. OPCIONÁLIS:
   * ha undefined, az oszlop nem jelenik meg (desktop hívók változatlanok).
   */
  prevActualIncome?: Record<string, number>
  prevActualExpense?: Record<string, number>

  /** Javítási kérelem callback. Web: requestAccountingUnlock server action. */
  onRequestUnlock?: (
    year: number,
    reason: string,
  ) => Promise<{ success?: boolean; error?: string | null }>

  /** Sikeres művelet után: lap újratöltése (web: router.refresh, desktop: notifyLocalDataChanged). */
  onRefresh?: () => void

  /** UI-feedback (web: toast.success/error, desktop: belső állapot). */
  onToast?: (message: string, kind: ToastKind) => void

  /**
   * Véglegesítő wizard slot. Itt mountolódik a platform-specifikus modal:
   *   - Web: `<AccountingFinalizeWizard open={...} ... />`
   *   - Desktop: saját, lokális Tauri-data-source-szal működő wizard
   *
   * Az `open` állapotot a wizard maga kezelje (a tab csak `setOpen(true)`-t tud küldeni).
   */
  finalizeWizardSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    summary: AccountingFinalizeSummary
  }) => ReactNode
}

export interface AccountingFinalizeSummary {
  totalBudgetIncome: number
  totalActualIncome: number
  totalBudgetExpense: number
  totalActualExpense: number
  budgetedBalance: number
  actualBalance: number
  actualIncome: Record<string, number>
  actualExpense: Record<string, number>
}

/**
 * 2026-08-11 (6. kör): a BELSŐ MOZGÁS (kassza⇄bank átvezetés) felismerése.
 * Ez SOHA nem számadási tétel, tehát a hivatalos íven kívülre esése nem hiba —
 * nem is figyelmeztetünk rá. Két jelből ismerjük fel:
 *   - `belso_mozgas_xkey` (a kanonikus, párosított átvezetés jelölése), VAGY
 *   - a kód fejezete: 100.xx (pénztármaradvány) és 3xx/4xx (átvezetés-kódok) —
 *     a régi, xkey nélkül rögzített párok miatt kell (belso_mozgas_kanonikus_kodok).
 */
function isInternalMovement(xkey: string | null | undefined, code: string | undefined): boolean {
  if (xkey) return true
  if (!code) return false
  return code.startsWith('100') || code.startsWith('3') || code.startsWith('4')
}

export function AccountingTab({
  szamadasiCellek,
  incomeRecords,
  expenseRecords,
  bevCelMap,
  kiaCelMap,
  settings,
  currentYear,
  scope = 'congregation',
  budgetData,
  loading = false,
  carryoverCash,
  carryoverBank,
  loadingLogoSrc,
  balances,
  prevActualIncome,
  prevActualExpense,
  onRequestUnlock,
  onRefresh,
  onToast,
  finalizeWizardSlot,
}: AccountingTabProps) {
  const [finalizeWizardOpen, setFinalizeWizardOpen] = useState(false)

  /**
   * 2026-07-10 (#3/A) + 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): melyik cella
   * kerül a fül táblájába?
   *
   * PONTOSAN a nyomtatvány sorai — MINDKÉT hatókörben, `szint` szerinti szűrés
   * NÉLKÜL. Nincs is többé itteni másolat a szabályból: a `szamadasIvCellak` az
   * a függvény, amiből a papír sorai (`collectBudgetRows`) is készülnek, a
   * rendezéssel együtt. Így a képernyő és a papír nem tud széthúzni.
   *
   * 1) GYÜLEKEZETI ív: a hivatalos gyülekezeti Számadás-/Költségvetés-ív
   *    TARTALMAZZA az egyházmegyei szintű kódokat is (201.15 Nettó fizetések,
   *    201.17 CAS, 206.02 Biztosítások, 101.07, 105.03, 106.02–106.06 …) —
   *    Endre, aki maga adja be ezeket az íveket, ezt kimondottan megerősítette.
   *    Ezek a sorok látszanak, de a gyülekezet nem tölti ki őket (lásd lentebb
   *    `dioceseOnlyCodes`, illetve a BudgetTab `zaroltKodok`-ja).
   *
   * 2) EGYHÁZMEGYEI ív (2026-08-11, MOST): „minden tétel szerepel rajta, nem
   *    csak az egyházmegyeiek!" — tulajdonosi döntés. Eddig itt egy
   *    `if (scope === 'diocese') return gyulekezetSzerkesztheti(cell.szint)` ág
   *    állt, ami MEGFORDÍTVA szűrt: a megyei nézetből pont az a 18 SAJÁT kód
   *    esett ki, amit az egyházmegye tölt ki, miközben a nyomtatvány
   *    (`collectBudgetRows`) `szint` szerint SOSEM szűrt. Vagyis az egyházmegye
   *    a képernyőn más ívet látott, mint amit kinyomtatott és aláírt — ugyanaz
   *    a hibaosztály, mint a gyülekezeti oldalon, csak ellentétes előjellel.
   *
   * A régi `isGyulekezetSzint` szűrő a `2026-06-11l-felsobb-szint-jeloles.sql`
   * nyomán került ide, csakhogy az a migráció a hivatalos Adatok_2026.xlsx
   * RÖGZÍTŐ LEGÖRDÜLŐIT igazolta (bevétel 30 · kiadás 38 tétel) — a legördülő
   * (mire KÖNYVELHET a gyülekezet) és a Számadás-ív (mely SOROKAT sorolja fel a
   * nyomtatvány) KÉT KÜLÖN dolog. A szűrő tehát rossz felületen ült: ez a fül
   * ŰRLAP-NÉZET, nem kategóriaválasztó. A valódi választók (finance-tabs.tsx
   * `incomeCategories`/`expenseCategories`, desktop `penzugy-page.tsx`,
   * `bank-import-page.tsx`) a befizetescel/kiadascel junction táblákon át,
   * `isGyulekezetiKonyvelhetoKod`-dal szűrnek — ők TOVÁBBRA IS kizárják ezeket
   * a kódokat GYÜLEKEZETI hatókörben, tehát ez a változtatás NEM tágítja, mire
   * könyvelhet a gyülekezet.
   *
   * A 100-as fejezet (Pénztármaradvány / legacy belső mozgás: 100.01 / 100.02 /
   * 100.51 / 100.52) továbbra is TELJESEN kizárva — a hivatalos EREK-formában a
   * bevétel a 101-nél kezdődik, a belső mozgás sosem számadási tétel.
   */
  const incomeCells = useMemo(() => szamadasIvCellak(szamadasiCellek, 'B'), [szamadasiCellek])
  const expenseCells = useMemo(() => szamadasIvCellak(szamadasiCellek, 'K'), [szamadasiCellek])

  const leafIncome = useMemo(() => incomeCells.filter((c) => c.id.includes('.')), [incomeCells])
  const leafExpense = useMemo(() => expenseCells.filter((c) => c.id.includes('.')), [expenseCells])

  /**
   * A HIVATALOS ív végpont-kódjai. Csak ezek szerepelhetnek a Számadás tény-
   * oszlopában — és a BEKÜLDÖTT pillanatképben is (lásd lentebb).
   *
   * 2026-08-11 (6. kör, D3-csapda): ez a két készlet a FENTI, most kitágított
   * listákból származik, tehát EGYÜTT tágul velük — MINDKÉT hatókörben. Ha nem
   * így lenne, a beküldött pillanatkép megint elszakadna a kinyomtatott
   * papírtól — pontosan az a hiba, amit a D3 javított, és ami ma reggel öt P0
   * forrása volt. A származtatás szándékosan marad `leafIncome`/`leafExpense`-
   * alapú, nem külön szűrés: egy második szűrő itt némán széthúzhatna a
   * képernyőn látott ívvel.
   */
  const officialIncomeCodes = useMemo(
    () => new Set(leafIncome.map((c) => c.id)),
    [leafIncome],
  )
  const officialExpenseCodes = useMemo(
    () => new Set(leafExpense.map((c) => c.id)),
    [leafExpense],
  )

  /**
   * 2026-08-11 (6. kör): kód → szint térkép. Az egyházmegyei szintű sorok RAJTA
   * vannak az íven és a végösszegben is, de a GYÜLEKEZET nem könyvelhet rájuk —
   * ha mégis van rajtuk pénz, az legacy/importált adat, amit érdemes átnézni.
   *
   * A `szint` azt mondja meg, hogy a GYÜLEKEZETI íven ki tölti ki az adott sort.
   * Az egyházmegye SAJÁT ívén ennek nincs értelme: ott minden sor az övé, ezért
   * `scope === 'diocese'` esetén sem jelölés, sem figyelmeztetés nincs.
   */
  const szintByCode = useMemo(() => {
    const map: Record<string, SzamadasiCel['szint']> = {}
    for (const cell of szamadasiCellek) map[cell.id] = cell.szint
    return map
  }, [szamadasiCellek])

  const csakEgyhazmegyeKod = (code: string) =>
    scope !== 'diocese' && !gyulekezetSzerkesztheti(szintByCode[code])

  /** A táblában megjelölendő (egyházmegyei szintű) kódok — csak gyülekezeti nézetben. */
  const dioceseOnlyCodes = useMemo(() => {
    const set = new Set<string>()
    if (scope === 'diocese') return set
    for (const cell of szamadasiCellek) {
      if (!gyulekezetSzerkesztheti(cell.szint)) set.add(cell.id)
    }
    return set
  }, [szamadasiCellek, scope])

  // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott (érvénytelenített) tétel a
  // számadás tény-összegeibe SEM számíthat bele — eddig felfújta a totálokat és
  // a beküldött snapshotot is (a wizard summary innen táplálkozik).
  // 2026-08-11 (5. kör, P1): `osszeg_ron ?? osszeg` — a NYERS deviza-összeg
  // helyett a RON-ekvivalens. Eddig a hivatalos Számadás a nyers összeget adta
  // össze, a Registru Casa/Banca viszont a RON-értéket (reporting.ts `ronOf`),
  // így egy 1000 EUR-s banki tétel a Registru-ban 4 970 lej, a Számadáson
  // 1 000 lej volt: ugyanarra az évre két, egymásnak ellentmondó aláírt papír.
  //
  // 2026-08-11 (6. kör, P0 — BEKÜLDÖTT ≠ KINYOMTATOTT): a térkép eddig MINDEN
  // kódra gyűjtött, amit a bevCelMap/kiaCelMap ismer — a belső mozgás 100.01 /
  // 100.02 kódjaira és az egyházmegyei szintű (a gyülekezeti íven nem szereplő)
  // tételekre is. A VÉGÖSSZEG viszont csak a hivatalos végpont-kódokat adta
  // össze, és a kinyomtatott Számadás is csak azokat sorolta fel. Vagyis a
  // wizard ezt a térképet küldte be az egyházmegyének: az esperes olyan
  // sorokat kapott (pl. „100.02 — 45 000"), amelyek az aláírt papíron nem
  // szerepelnek, és a sorok összege nem jött ki a fejlécben álló végösszegre.
  // Mostantól a térkép PONTOSAN a hivatalos ív végpont-kódjaira szűkül —
  // beküldött == kinyomtatott ==  végösszeg —, az ezen kívülre könyvelt pénzt
  // pedig NEM nyeljük el némán: külön, hangos figyelmeztetésben jelenik meg
  // (lásd `offFormIncome` / `offFormExpense` lentebb).
  //
  // 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): az „ív végpont-kódjai" készlet most
  // az egyházmegyei szintűeket IS tartalmazza (rajta vannak a papíron), tehát az
  // ilyen kódra könyvelt pénz mostantól bekerül a tény-oszlopba, a végösszegbe és
  // a beküldött pillanatképbe — pontosan úgy, ahogy a nyomtatványon. Külön
  // gyűjtjük viszont (`dioceseOnly*`), mert a gyülekezet ezekre már NEM
  // könyvelhet: ha mégis van rajtuk pénz, az legacy/importált sor.
  const { actualIncome, offFormIncome, dioceseOnlyIncome } = useMemo(() => {
    const map: Record<string, number> = {}
    const offForm: Record<string, number> = {}
    const dioceseOnly: Record<string, number> = {}
    incomeRecords.forEach((row) => {
      // 2026-08-11 (6. kör): a `deleted` is szűrve — a hívó ma már szűrt sorokat
      // ad, de ez KIMONDATLAN invariáns volt (a nyomtatvány mindkettőt nézi).
      if (row.deleted || row.stornozott) return
      const amount = Number(row.osszeg_ron ?? row.osszeg) || 0
      const code = bevCelMap[row.id_befizetescel || 0]
      if (code && officialIncomeCodes.has(code)) {
        map[code] = (map[code] || 0) + amount
        if (csakEgyhazmegyeKod(code)) dioceseOnly[code] = (dioceseOnly[code] || 0) + amount
        return
      }
      if (isInternalMovement(row.belso_mozgas_xkey, code)) return
      const key = code || '(nincs kategória)'
      offForm[key] = (offForm[key] || 0) + amount
    })
    return { actualIncome: map, offFormIncome: offForm, dioceseOnlyIncome: dioceseOnly }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRecords, bevCelMap, officialIncomeCodes, szintByCode, scope])

  const { actualExpense, offFormExpense, dioceseOnlyExpense } = useMemo(() => {
    const map: Record<string, number> = {}
    const offForm: Record<string, number> = {}
    const dioceseOnly: Record<string, number> = {}
    expenseRecords.forEach((row) => {
      if (row.deleted || row.stornozott) return
      const amount = Number(row.osszeg_ron ?? row.osszeg) || 0
      const code = kiaCelMap[row.id_kiadascel || 0]
      if (code && officialExpenseCodes.has(code)) {
        map[code] = (map[code] || 0) + amount
        if (csakEgyhazmegyeKod(code)) dioceseOnly[code] = (dioceseOnly[code] || 0) + amount
        return
      }
      if (isInternalMovement(row.belso_mozgas_xkey, code)) return
      const key = code || '(nincs kategória)'
      offForm[key] = (offForm[key] || 0) + amount
    })
    return { actualExpense: map, offFormExpense: offForm, dioceseOnlyExpense: dioceseOnly }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseRecords, kiaCelMap, officialExpenseCodes, szintByCode, scope])

  /**
   * 2026-08-11 (6. kör): a hivatalos íven KÍVÜLRE könyvelt (nem belső mozgás)
   * pénz. Ha ez nem nulla, a Számadás kevesebbet mutat, mint amennyi tényleges
   * forgalom volt — némán. Ezért a fül tetején hangos figyelmeztetést kap a
   * lelkész, a véglegesítés-gomb MELLETT, még a beküldés előtt.
   */
  const offFormRows = useMemo(() => {
    const rows: Array<{ code: string; amount: number; kind: 'bevétel' | 'kiadás' }> = []
    for (const [code, amount] of Object.entries(offFormIncome)) {
      if (amount !== 0) rows.push({ code, amount, kind: 'bevétel' })
    }
    for (const [code, amount] of Object.entries(offFormExpense)) {
      if (amount !== 0) rows.push({ code, amount, kind: 'kiadás' })
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code, 'hu'))
  }, [offFormIncome, offFormExpense])

  /**
   * 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): pénz EGYHÁZMEGYEI SZINTŰ kódon.
   *
   * Ez a sor RAJTA van a hivatalos íven, tehát benne is van a tény-oszlopban, a
   * végösszegben és a beküldött adatban — nem hiányzik sehonnan. A gyülekezet
   * viszont ma már nem tud ilyen kódot választani (a rögzítő legördülőkből ki van
   * zárva), így ha mégis van rajta pénz, az régi vagy importált tétel. Ezért ez
   * NEM „nem fér rá az ívre" figyelmeztetés, hanem egy átnézésre hívó jelzés.
   */
  const dioceseOnlyRows = useMemo(() => {
    const rows: Array<{ code: string; amount: number; kind: 'bevétel' | 'kiadás' }> = []
    for (const [code, amount] of Object.entries(dioceseOnlyIncome)) {
      if (amount !== 0) rows.push({ code, amount, kind: 'bevétel' })
    }
    for (const [code, amount] of Object.entries(dioceseOnlyExpense)) {
      if (amount !== 0) rows.push({ code, amount, kind: 'kiadás' })
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code, 'hu'))
  }, [dioceseOnlyIncome, dioceseOnlyExpense])

  // 2026-08-11 (6. kör): a végösszegek a KÖZÖS `osszegezLevelek` helperrel —
  // ugyanaz a levél-készlet, ugyanaz az összeadás, mint a nyomtatványon.
  const leafIncomeCodes = useMemo(() => leafIncome.map((c) => c.id), [leafIncome])
  const leafExpenseCodes = useMemo(() => leafExpense.map((c) => c.id), [leafExpense])

  const totalBudgetIncome = osszegezLevelek(leafIncomeCodes, budgetData)
  const totalBudgetExpense = osszegezLevelek(leafExpenseCodes, budgetData)
  const totalActualIncome = osszegezLevelek(leafIncomeCodes, actualIncome)
  const totalActualExpense = osszegezLevelek(leafExpenseCodes, actualExpense)

  const incomeRealization =
    totalBudgetIncome > 0 ? Math.round((totalActualIncome / totalBudgetIncome) * 100) : 0
  const expenseRealization =
    totalBudgetExpense > 0 ? Math.round((totalActualExpense / totalBudgetExpense) * 100) : 0
  const budgetedBalance = totalBudgetIncome - totalBudgetExpense
  const actualBalance = totalActualIncome - totalActualExpense

  if (loading) {
    // 2026-07-10 (S2 #9): állapotsávos, logós betöltő.
    return <FinanceLoadingState label="Számadás betöltése…" logoSrc={loadingLogoSrc} />
  }

  // 2026-08-15 (Endre 4. szakasz): a korábbi `window.prompt`-os javítási kérelem
  // az EGYSÉGES FinalizeButton indoklás-dialógusára költözött (kötelező, ≥10
  // karakteres indoklás — mint a többi irat-típusnál). A toast/refresh itt marad,
  // a komponens csak a dialógus nyitva tartását dönti el a visszaadott hibából.
  // 2026-08-15 (egyházmegyei szelet): a CÍMZETT a hatókör felettes szintje — a
  // gyülekezeté az egyházmegye, az egyházmegye SAJÁT számadásáé az
  // egyházkerület. Eddig a megyei felület is „az egyházmegyének" küldte a saját
  // iratát (önmagának) — a felület mást mondott, mint ami történik.
  const felettesSzint = scope === 'diocese' ? 'az egyházkerület' : 'az egyházmegye'
  const felettesSzintNek = scope === 'diocese' ? 'az egyházkerületnek' : 'az egyházmegyének'

  async function handleUnlockRequest(reason: string) {
    if (!onRequestUnlock) return { error: 'A feloldás-kérés ezen a felületen nem érhető el.' }
    const result = await onRequestUnlock(currentYear, reason)
    if (result.error) {
      onToast?.(result.error, 'error')
      return { error: result.error }
    }
    onToast?.(`Javítási kérelem elküldve ${felettesSzintNek}!`, 'success')
    onRefresh?.()
    return { success: true }
  }

  const summary: AccountingFinalizeSummary = {
    totalBudgetIncome,
    totalActualIncome,
    totalBudgetExpense,
    totalActualExpense,
    budgetedBalance,
    actualBalance,
    actualIncome,
    actualExpense,
  }

  return (
    <div className="space-y-4">
      {/* 2026-07-25 (G3): évi összegző hero — bevétel/kiadás + kassza/bank záró
          és a kettő együtt, NAGYBAN. A számok a szülőtől kapott balances-ből
          jönnek (a Kassza/Bank/Dashboard fülekkel bit-azonos calculateBalances). */}
      {balances && (
        <div className="card-raised p-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-emerald-600" />
            <p className="text-base font-semibold text-slate-800">
              {currentYear}. évi pénzügyi kép
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeroStat
              label={`Bevétel (${currentYear})`}
              value={balances.totalIncome}
              tone="emerald"
              icon={<TrendingUp className="size-4" />}
            />
            <HeroStat
              label={`Kiadás (${currentYear})`}
              value={balances.totalExpense}
              tone="rose"
              icon={<TrendingDown className="size-4" />}
            />
            <HeroStat
              label="Kassza egyenleg (Casa)"
              value={balances.cashBalance}
              tone={balances.cashBalance >= 0 ? 'sky' : 'rose'}
              icon={<Wallet className="size-4" />}
            />
            <HeroStat
              label="Banki egyenleg (Banca)"
              value={balances.bankBalance}
              tone={balances.bankBalance >= 0 ? 'violet' : 'rose'}
              icon={<Landmark className="size-4" />}
            />
          </div>
          {(() => {
            const totalAvailable = balances.cashBalance + balances.bankBalance
            const positive = totalAvailable >= 0
            // /60-as bg-változatok: ezekre VAN dark-override a kartoteka.css-ben
            // (a /70-re és a red-50-re nincs — világos szöveg világos sávon).
            return (
              <div
                className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] px-5 py-4 ${
                  positive ? 'bg-emerald-50/60' : 'bg-rose-50/60'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">Rendelkezésre álló pénz összesen</p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold tabular-nums break-words ${
                      positive ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {formatCurrency(totalAvailable)} RON
                  </p>
                </div>
                <p className="max-w-xs text-xs leading-5 text-slate-400">
                  Kassza + banki egyenleg együtt — a Kassza és a Bank füllel azonos
                  számítás (stornó nélkül; a belső átvezetés az egyenlegben szerepel, a
                  bevétel/kiadás összesítőben nem). A lenti terv–tény táblázat csak a
                  számadási kódra könyvelt tételeket összegzi, ezért ott kis eltérés
                  lehetséges (pl. kód nélküli vagy devizás tétel).
                </p>
              </div>
            )
          })()}
        </div>
      )}

      {/* 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS UTÁN ÁTÍRVA): a régi szöveg azt
          állította, hogy az egyházmegyei szintű kódra könyvelt pénz „nem fér rá a
          hivatalos Számadás-ívre". Ez a premissza MEGDŐLT: a sor rajta van az
          íven, tehát a pénz benne van a tény-oszlopban, a végösszegben és a
          beküldött adatban is. Egy ilyen kódra könyvelt tétel viszont ma már nem
          keletkezhet (a rögzítő legördülők kizárják), ezért átnézésre hívunk.
          A valóban íven KÍVÜLI pénz (ismeretlen kód / nincs kategória) továbbra is
          hangos figyelmeztetés — az tényleg hiányozna a papírról. */}
      {(offFormRows.length > 0 || dioceseOnlyRows.length > 0) && (
        <div className="card-raised border-amber-300 bg-amber-50/70 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-amber-900">
                {offFormRows.length > 0
                  ? 'Van pénz, ami nem fér rá a hivatalos Számadás-ívre'
                  : 'Nézd át: egyházmegyei szintű kódon van pénz'}
              </p>

              {offFormRows.length > 0 && (
                <>
                  <p className="mt-1 text-sm leading-6 text-amber-900/90">
                    Az alábbi tételek olyan számadási kódra vannak könyvelve, amelyik ezen
                    az íven nem szerepel (ismeretlen kód, vagy nincs kategória kiválasztva).
                    Ezek az összegek NEM számítanak bele a lenti terv–tény táblázatba, a
                    végösszegekbe és az egyházmegyének beküldött adatba sem. Kérlek, a
                    véglegesítés előtt könyveld át őket a megfelelő kódra a Tranzakciók
                    fülön — különben a Számadás kevesebbet mutat, mint a tényleges forgalom.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {offFormRows.map((row) => (
                      <li
                        key={`off-${row.kind}-${row.code}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm"
                      >
                        <span className="font-mono text-xs text-amber-800">
                          {row.code} · {row.kind}
                        </span>
                        <span className="font-semibold tabular-nums text-amber-900">
                          {formatCurrency(row.amount)} RON
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {dioceseOnlyRows.length > 0 && (
                <>
                  <p
                    className={`text-sm leading-6 text-amber-900/90 ${
                      offFormRows.length > 0 ? 'mt-4 border-t border-amber-200 pt-3' : 'mt-1'
                    }`}
                  >
                    Az alábbi kódok <strong>egyházmegyei szintűek</strong>: a hivatalos íven
                    szerepelnek — ezért a pénz benne van a lenti táblázatban, a
                    végösszegekben és a beküldött adatban is —, de ezeket az egyházmegye
                    tölti ki, a gyülekezet nem könyvelhet rájuk. Ha mégis van rajtuk
                    összeg, az régi vagy importált tétel. Nézd át a véglegesítés előtt,
                    és ha nem ide való, könyveld át a Tranzakciók fülön.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {dioceseOnlyRows.map((row) => (
                      <li
                        key={`egyhm-${row.kind}-${row.code}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm"
                      >
                        <span className="font-mono text-xs text-amber-800">
                          {row.code} · {row.kind} · egyházmegyei szintű
                        </span>
                        <span className="font-semibold tabular-nums text-amber-900">
                          {formatCurrency(row.amount)} RON
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2026-07-10 (S2 #10): a NYITÓ egyenlegek a hivatalos minta szerint a
          Bevételek tábla 1–3. sorai (lásd lent, openingRows) — a külön kártya megszűnt. */}
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card-raised p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="size-4 text-cyan-600" />
            <p className="text-base font-semibold text-slate-800">Élő számadási kép</p>
            {/* 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb a
                fejléc-sáv jobb szélén. A meglévő wizard-flow változatlan
                (skipConfirm: a wizard maga vezet végig és erősít meg); a
                feloldás-kérés a közös indoklás-dialógussal megy. */}
            {(finalizeWizardSlot || settings.accounting_finalized) && (
              <FinalizeButton
                className="ml-auto"
                documentLabel="számadás"
                year={currentYear}
                finalized={!!settings.accounting_finalized}
                finalizedAt={settings.accounting_finalized_at ?? null}
                unlockRequested={!!settings.accounting_unlock_requested}
                finalizeLabel="Véglegesítés és beküldés"
                skipConfirm
                onFinalize={() => setFinalizeWizardOpen(true)}
                onRequestUnlock={onRequestUnlock ? handleUnlockRequest : undefined}
                unlockAuthorityLabel={felettesSzint}
                unlockPlaceholder="Pl. Egy decemberi banki kiadás rossz jogcímre került, javítani szeretném."
              />
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            A rendszer itt már azt mutatja, hogy a költségvetési tervhez képest a tényleges
            számadás hány százalékban valósult meg.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ProgressCard
              label="Bevételi megvalósulás"
              percent={incomeRealization}
              actual={totalActualIncome}
              budget={totalBudgetIncome}
              tone="emerald"
            />
            <ProgressCard
              label="Kiadási megvalósulás"
              percent={expenseRealization}
              actual={totalActualExpense}
              budget={totalBudgetExpense}
              tone="rose"
            />
          </div>

          {/* 2026-08-15 (Endre 4. szakasz): a gomb a fejléc-sávba költözött
              (egységes hely mind a 6 irat-típusnál) — itt csak a magyarázat marad. */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 max-w-md">
              {settings.accounting_finalized
                ? `A számadás véglegesítve és beküldve ${felettesSzintNek}. Módosítás csak a fenti „Feloldás kérése" úton lehetséges.`
                : `Ha minden tétel stimmel, a fenti „Véglegesítés és beküldés" gombbal zárhatod le és küldheted be a számadást ${felettesSzintNek}.`}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <KpiCard
            label="Tervezett egyenleg"
            value={budgetedBalance}
            tone={budgetedBalance >= 0 ? 'sky' : 'rose'}
          />
          <KpiCard
            label="Tényleges egyenleg"
            value={actualBalance}
            tone={actualBalance >= 0 ? 'emerald' : 'rose'}
          />
          <KpiCard
            label="Eltérés"
            value={actualBalance - budgetedBalance}
            tone={actualBalance - budgetedBalance >= 0 ? 'amber' : 'rose'}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComparisonTable
          title="Bevételek - terv és tény"
          icon={<TrendingUp className="size-4 text-emerald-600" />}
          headerClassName="bg-emerald-50 border-emerald-100"
          cells={incomeCells}
          budgetData={budgetData}
          actualData={actualIncome}
          prevActualData={prevActualIncome}
          positiveClassName="text-emerald-600"
          openingRows={
            carryoverCash != null && carryoverBank != null
              ? [
                  {
                    nr: '1',
                    nev: 'Múlt évi pénztármaradvány (Disponibil din anul precedent)',
                    value: carryoverCash + carryoverBank,
                    group: true,
                  },
                  { nr: '2', nev: 'Készpénz egyenleg (Casa)', value: carryoverCash, group: false },
                  { nr: '3', nev: 'Banki egyenleg (Banca)', value: carryoverBank, group: false },
                ]
              : undefined
          }
          dioceseOnlyCodes={dioceseOnlyCodes}
        />
        <ComparisonTable
          title="Kiadások - terv és tény"
          icon={<TrendingDown className="size-4 text-rose-500" />}
          headerClassName="bg-rose-50 border-rose-100"
          cells={expenseCells}
          budgetData={budgetData}
          actualData={actualExpense}
          prevActualData={prevActualExpense}
          positiveClassName="text-rose-500"
          dioceseOnlyCodes={dioceseOnlyCodes}
        />
      </div>

      <div className="card-raised p-6 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Scale className="size-5 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Éves egyenleg</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BalanceSummary
            label="Tervezett"
            value={budgetedBalance}
            tone={budgetedBalance >= 0 ? 'sky' : 'rose'}
          />
          <BalanceSummary
            label="Tényleges"
            value={actualBalance}
            tone={actualBalance >= 0 ? 'emerald' : 'rose'}
          />
        </div>
      </div>

      {/* Véglegesítő wizard — platform-specifikus, slot-prop-on érkezik */}
      {finalizeWizardSlot?.({
        open: finalizeWizardOpen,
        onOpenChange: setFinalizeWizardOpen,
        summary,
      })}
    </div>
  )
}

function ProgressCard({
  label,
  percent,
  actual,
  budget,
  tone,
}: {
  label: string
  percent: number
  actual: number
  budget: number
  tone: 'emerald' | 'rose'
}) {
  const barClassName = tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'
  const boxClassName =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'

  return (
    <div className={`rounded-[1.4rem] px-4 py-4 ${boxClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-semibold">
          {percent}%
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/70">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="mt-3 text-xs opacity-80">
        Tény: {formatCurrency(actual)} RON · Terv: {formatCurrency(budget)} RON
      </p>
    </div>
  )
}

// 2026-07-25 (G3): az évi összegző hero kis kártyája — ikonos, tabular-nums,
// 375px-en 1 oszlopra törik (a grid a hívónál).
function HeroStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'violet' | 'rose'
  icon: ReactNode
}) {
  const toneClassName = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className={`rounded-[1.35rem] px-4 py-4 ${toneClassName}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</p>
        <span className="opacity-70">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums break-words">
        {formatCurrency(value)} RON
      </p>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'amber' | 'rose'
}) {
  const toneClassName = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className={`rounded-[1.35rem] px-4 py-4 ${toneClassName}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{formatCurrency(value)} RON</p>
    </div>
  )
}

function BalanceSummary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'rose'
}) {
  const toneClassName = {
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-500',
  }[tone]

  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${toneClassName}`}>{formatCurrency(value)} RON</p>
    </div>
  )
}

function ComparisonTable({
  title,
  icon,
  headerClassName,
  cells,
  budgetData,
  actualData,
  prevActualData,
  positiveClassName,
  openingRows,
  dioceseOnlyCodes,
}: {
  title: string
  icon: ReactNode
  headerClassName: string
  cells: SzamadasiCel[]
  budgetData: Record<string, number>
  actualData: Record<string, number>
  /** 2026-07-10 (#2): előző évi tény kódonként — halvány referencia-oszlop, ha van. */
  prevActualData?: Record<string, number>
  positiveClassName: string
  /** 2026-07-10 (S2 #10): a hivatalos nyomtatvány 1–3. NYITÓ sora a tábla élén
   *  (Disponibil / Casa / Banca) — automatikus, nem szerkeszthető. */
  openingRows?: Array<{ nr: string; nev: string; value: number; group: boolean }>
  /** 2026-08-11 (6. kör): egyházmegyei szintű kódok. A sor RAJTA van az íven és a
   *  végösszegben, de a gyülekezet nem könyvelhet rá — ezt a soron is kimondjuk,
   *  hogy az üres tény-oszlop ne tűnjön hiányzó adatnak. */
  dioceseOnlyCodes?: Set<string>
}) {
  const showPrevYear = prevActualData != null
  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${headerClassName}`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      {/* 2026-07-10 (S4-mobil): min-w + tabular-nums — telefonon vízszintesen
          görgethető tábla; az „Előző évi tény" referencia-oszlop md alatt rejtve. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="border-b border-slate-100 bg-slate-50/80">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              {showPrevYear && (
                <th className="hidden md:table-cell p-2 text-right text-xs font-medium text-slate-400">
                  Előző évi tény
                </th>
              )}
              <th className="p-2 text-right text-xs font-medium text-slate-500">Terv</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">Tény</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* 2026-07-10 (S2 #10): hivatalos NYITÓ sorok (1–3.) a tábla élén — a
                nyomtatványon a Prevederi ÉS az Executie is a nyitó értéket hordozza. */}
            {openingRows?.map((row) => (
              <tr
                key={`opening-${row.nr}`}
                className={row.group ? 'bg-sky-50/60 font-semibold' : 'bg-sky-50/30'}
                title="Automatikus nyitó egyenleg — az előző évi záróból, nem szerkeszthető"
              >
                <td className="p-2 text-xs text-slate-400">{row.nr}</td>
                <td
                  className={`p-2 ${
                    row.group ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                  }`}
                >
                  {row.nev}
                </td>
                {showPrevYear && (
                  <td className="hidden md:table-cell p-2 text-right text-xs text-slate-300">–</td>
                )}
                <td className="p-2 text-right text-slate-600">{formatCurrency(row.value)}</td>
                <td className="p-2 text-right text-slate-600">{formatCurrency(row.value)}</td>
                <td className="p-2 text-right text-xs text-slate-300">–</td>
              </tr>
            ))}
            {cells.map((cell) => {
              const isGroup = cell.id.split('.').length === 1
              const budget = isGroup
                ? cells
                    .filter(
                      (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                    )
                    .reduce((s, c) => s + (budgetData[c.id] || 0), 0)
                : budgetData[cell.id] || 0
              const actual = isGroup
                ? cells
                    .filter(
                      (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                    )
                    .reduce((s, c) => s + (actualData[c.id] || 0), 0)
                : actualData[cell.id] || 0
              // 2026-07-10 (#2): előző évi tény — csoportnál a levelek összege
              // (a fenti budget/actual aggregáló minta szerint).
              const prevActual = !showPrevYear
                ? 0
                : isGroup
                  ? cells
                      .filter(
                        (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                      )
                      .reduce((s, c) => s + (prevActualData?.[c.id] || 0), 0)
                  : prevActualData?.[cell.id] || 0
              // Minden tételt mutatunk (a költségvetéshez hasonlóan) — a
              // csoport- és a végpont-sorokat is, akkor is, ha nincs terv/tény.

              const percent = budget > 0 ? Math.round((actual / budget) * 100) : 0

              return (
                <tr
                  key={cell.id}
                  className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'}
                >
                  <td className="p-2 text-xs text-slate-400">{cell.id}</td>
                  <td
                    className={`p-2 ${
                      isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                    }`}
                  >
                    {cell.nev}
                    {dioceseOnlyCodes?.has(cell.id) && (
                      <span
                        className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                        title="Egyházmegyei szintű tétel — a hivatalos íven szerepel, de az egyházmegye tölti ki; a gyülekezet nem könyvelhet rá."
                      >
                        egyházmegyei
                      </span>
                    )}
                  </td>
                  {showPrevYear && (
                    <td className="hidden md:table-cell p-2 text-right text-xs text-slate-400">
                      {prevActual !== 0 ? formatCurrency(prevActual) : '-'}
                    </td>
                  )}
                  <td className="p-2 text-right text-slate-500">
                    {budget > 0 ? formatCurrency(budget) : '-'}
                  </td>
                  <td className={`p-2 text-right font-semibold ${positiveClassName}`}>
                    {actual > 0 ? formatCurrency(actual) : '-'}
                  </td>
                  <td className="p-2 text-right">
                    <Badge
                      className={`border-0 ${
                        percent > 100
                          ? 'bg-rose-100 text-rose-600'
                          : percent > 80
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {percent}%
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
