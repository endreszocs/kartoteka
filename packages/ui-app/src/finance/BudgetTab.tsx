'use client'

/**
 * BudgetTab — közös költségvetés-tab (Sprint Q F1, v0.7.0).
 *
 * Költségvetés (alap + 3 módosítás), bevétel/kiadás cellák kódonként,
 * mentés + véglegesítés + javítási kérelem flow.
 *
 * Callback-ek:
 *   - `loadBudgetRows(year, congregationId)` — adatlekérés
 *   - `saveBudgetRows(year, congregationId, rows)` — alap mentés
 *   - `saveBudgetModification(year, congregationId, modNum, rows)` — mod1/mod2/mod3
 *   - `submitDocument(docType, year, snapshot, modNum)` — beküldés egyházmegyéhez
 *   - `finalizeBudget(year)` / `finalizeBudgetModification(year, modNum)` — végleges flag
 *   - `requestBudgetUnlock(year, reason)` — javítási kérelem
 *   - `onRefresh()` — sikeres művelet után reload
 *   - `onToast(msg, kind)` — UI-feedback
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Check, Lock, Scale } from 'lucide-react'

import { Badge, Button } from '@kartoteka/ui'

// 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb (megerősítő
// dialógussal + a feloldás-kérés indoklás-dialógusával) — a korábbi
// window.confirm + külön ReasonPromptDialog helyett.
import { FinalizeButton } from '../shared/FinalizeButton'
import { gyulekezetSzerkesztheti, szamadasIvCellak } from './budget-reporting'
import { FinanceLoadingState } from './FinanceLoadingState'
import { formatCurrency } from './helpers'
import type { BealitasRow, BudgetCompatRow, SzamadasiCel } from './types'

export type BudgetMode = 'base' | 'mod1' | 'mod2' | 'mod3'
export type BudgetToastKind = 'success' | 'error' | 'info'
/** 2026-08-11 (6. kör): a fül hatóköre — az `AccountingScope`-pal azonos szemantika. */
export type BudgetScope = 'congregation' | 'diocese'

const MODE_LABELS: Record<BudgetMode, string> = {
  base: 'Alap költségvetés',
  mod1: '1. módosítás',
  mod2: '2. módosítás',
  mod3: '3. módosítás',
}

export interface BudgetTabProps {
  szamadasiCellek: SzamadasiCel[]
  settings: BealitasRow
  currentYear: number

  /**
   * 2026-08-11 (6. kör): a fül hatóköre. Alapértelmezés: 'congregation'.
   * Gyülekezeti hatókörben az egyházmegyei szintű ív-sorok LÁTSZANAK, de
   * ZÁROLVA (azokat az egyházmegye tölti ki). Egyházmegyei hatókörben a
   * viselkedés változatlan.
   */
  scope?: BudgetScope

  /**
   * 2026-07-10 (#2): NYITÓ egyenlegek (előző évi záró) — display-only blokk a
   * fül tetején, a hivatalos EREK-minta 1–3. sora szerint. OPCIONÁLIS: ha
   * undefined (pl. desktop hívó nem adja át), a blokk nem jelenik meg.
   * FONTOS: NEM kerül a budgetData-ba / mentésbe.
   */
  carryoverCash?: number
  carryoverBank?: number

  /** 2026-07-10 (S2 #9): a betöltő-állapot logója (web: '/kartoteka-icon.png'). */
  loadingLogoSrc?: string

  /**
   * 2026-07-10 (#2): előző évi TÉNY betöltése (szürke referencia-oszlop).
   * A `year` a NÉZETT év — a callback maga a `year - 1` évi tényt adja vissza
   * szamadasicel-kód szerint aggregálva. OPCIONÁLIS: ha nincs, az oszlop
   * nem jelenik meg (desktop hívók változatlanok).
   */
  loadPreviousActuals?: (year: number) => Promise<{
    actualIncome?: Record<string, number>
    actualExpense?: Record<string, number>
    error?: string
  }>

  loadBudgetRows: (
    year: number,
    congregationId: string,
  ) => Promise<{ rows: BudgetCompatRow[]; error?: string | null }>

  saveBudgetRows: (
    year: number,
    congregationId: string,
    rows: BudgetCompatRow[],
  ) => Promise<{ success?: boolean; error?: string | null }>

  saveBudgetModification: (
    year: number,
    congregationId: string,
    modNum: 1 | 2 | 3,
    rows: Array<{ szamadasicelid: string; value: number }>,
  ) => Promise<{ success?: boolean; error?: string | null }>

  finalizeBudget: (
    year: number,
  ) => Promise<{ success?: boolean; error?: string | null }>

  finalizeBudgetModification: (
    year: number,
    modNum: 1 | 2 | 3,
  ) => Promise<{ success?: boolean; error?: string | null }>

  submitDocument: (
    docType: 'koltsegvetes' | 'koltsegvetes_modositas',
    year: number,
    snapshot: Record<string, unknown>,
    modNum: number | null,
  ) => Promise<{ success?: boolean; error?: string | null }>

  requestBudgetUnlock: (
    year: number,
    reason: string,
  ) => Promise<{ success?: boolean; error?: string | null }>

  onRefresh?: () => void
  onToast?: (message: string, kind: BudgetToastKind) => void
}

export function BudgetTab({
  szamadasiCellek,
  settings,
  currentYear,
  scope = 'congregation',
  carryoverCash,
  carryoverBank,
  loadingLogoSrc,
  loadPreviousActuals,
  loadBudgetRows,
  saveBudgetRows,
  saveBudgetModification,
  finalizeBudget,
  finalizeBudgetModification,
  submitDocument,
  requestBudgetUnlock,
  onRefresh,
  onToast,
}: BudgetTabProps) {
  const [budgetData, setBudgetData] = useState<Record<string, BudgetCompatRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<BudgetMode>('base')
  // 2026-07-10 (#2): előző évi (currentYear-1) TÉNY kódonként — szürke referencia.
  const [prevActuals, setPrevActuals] = useState<{
    income: Record<string, number>
    expense: Record<string, number>
  } | null>(null)

  // 2026-08-15 (egyházmegyei szelet): a beküldés CÍMZETTJE a hatókör felettes
  // szintje — a gyülekezeté az egyházmegye, az egyházmegye SAJÁT
  // költségvetéséé az egyházkerület. A gomb, a helye és a folyamat (mentés →
  // zárás → felküldés) BETŰRE ugyanaz; csak a címzett neve igazodik ahhoz, ami
  // valóban történik. A tényleges beküldő hívást a `submitDocument` callback
  // adja (a web-wrapper hatókör szerint választja meg a célt).
  const felettesSzint = scope === 'diocese' ? 'az egyházkerület' : 'az egyházmegye'
  const felettesSzintNek = scope === 'diocese' ? 'az egyházkerületnek' : 'az egyházmegyének'

  const isBaseFinalized = settings.budget_finalized
  const isMod1Finalized = settings.budget_mod1_finalized ?? false
  const isMod2Finalized = settings.budget_mod2_finalized ?? false
  const isMod3Finalized = settings.budget_mod3_finalized ?? false

  const canEditBase = !isBaseFinalized
  const canEditMod1 = isBaseFinalized && !isMod1Finalized
  const canEditMod2 = isBaseFinalized && isMod1Finalized && !isMod2Finalized
  const canEditMod3 =
    isBaseFinalized && isMod1Finalized && isMod2Finalized && !isMod3Finalized

  const canEdit =
    mode === 'base'
      ? canEditBase
      : mode === 'mod1'
        ? canEditMod1
        : mode === 'mod2'
          ? canEditMod2
          : canEditMod3

  /**
   * 2026-07-10 (#3/A) + 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): a sor-tagságot
   * a NYOMTATVÁNY szabálya adja — MINDKÉT hatókörben, `szint` szerinti szűrés
   * NÉLKÜL. Nincs itteni másolat a szabályból: a `szamadasIvCellak` az a
   * függvény, amiből a papír sorai (`collectBudgetRows`) is készülnek, a
   * rendezéssel együtt.
   *
   * 1) GYÜLEKEZETI ív: a hivatalos ív TARTALMAZZA az egyházmegyei szintű
   *    sorokat is (201.15, 201.17, 206.02, 101.07, 105.03, 106.02–106.06 …),
   *    tehát a képernyőn is ott a helyük — különben a lelkész más sorokat lát,
   *    mint amit kinyomtat és aláír. A gyülekezet viszont NEM tölti ki őket:
   *    a beviteli mező zárolva (lásd `zaroltKodok` lentebb), és a rögzítő
   *    legördülőkből is ki vannak zárva (`isGyulekezetiKonyvelhetoKod`,
   *    `types.ts`) — az utóbbi VÁLTOZATLAN.
   *
   * 2) EGYHÁZMEGYEI ív (2026-08-11, MOST): „minden tétel szerepel rajta, nem
   *    csak az egyházmegyeiek!" — tulajdonosi döntés. A régi
   *    `if (scope === 'diocese') return gyulekezetSzerkesztheti(cell.szint)` ág
   *    MEGFORDÍTVA szűrt: a megyei költségvetésből pont az a 18 SAJÁT kód esett
   *    ki, amit az egyházmegye tölt ki, miközben a nyomtatvány `szint` szerint
   *    sosem szűrt. Vagyis az egyházmegye is más ívet látott, mint amit aláírt.
   */
  const bevetelCellek = useMemo(() => szamadasIvCellak(szamadasiCellek, 'B'), [szamadasiCellek])
  const kiadasCellek = useMemo(() => szamadasIvCellak(szamadasiCellek, 'K'), [szamadasiCellek])

  /**
   * 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): ZÁROLT sorok.
   *
   * „az egyházmegyei kódok egyházmegyei szinten nem módosíthatóak és nem lehet
   * gyülekezeteknek ezekre a kódokra pénzügyi tételt társítani."
   *
   * A sor tehát LÁTSZIK (rajta van a hivatalos íven), de GYÜLEKEZETI hatókörben
   * nem szerkeszthető. A már TÁROLT értéket NEM dobjuk el — read-only módon
   * megjelenítjük, és a mentés is változatlanul viszi tovább (a `budgetData`
   * teljes tartalma megy fel), így egy régi/importált érték nem tűnik el némán.
   *
   * EGYHÁZMEGYEI hatókörben a készlet ÜRES — vagyis az egyházmegye a SAJÁT ívén
   * MINDEN sort szerkeszthet, a 95 gyülekezeti szintűt is. Ez szándékos:
   *   · a `szint` azt mondja meg, ki tölti ki a sort a GYÜLEKEZETI íven; az
   *     egyházmegye saját ívén minden sor az övé,
   *   · a rögzítő legördülők megyei hatókörben MA SEM szűrnek (finance-tabs.tsx
   *     `incomeCategories`/`expenseCategories`: `scope !== 'congregation'`),
   *     tehát az egyházmegye BÁRMELY kódra könyvelhet tényleges tételt. Ha a
   *     tervet nem tudná ugyanoda beírni, a Számadás fülön terv nélküli tény
   *     állna — a zárolás pont azt a divergenciát gyártaná, ami ellen szól.
   */
  const zaroltKodok = useMemo(() => {
    const set = new Set<string>()
    if (scope === 'diocese') return set
    for (const c of szamadasiCellek) {
      if (!gyulekezetSzerkesztheti(c.szint)) set.add(c.id)
    }
    return set
  }, [szamadasiCellek, scope])

  const zarolt = (celId: string) => zaroltKodok.has(celId)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const result = await loadBudgetRows(currentYear, settings.congregation_id)
      if (cancelled) return
      if (result.error) {
        onToast?.('Hiba a költségvetés betöltésekor.', 'error')
      } else {
        const map: Record<string, BudgetCompatRow> = {}
        result.rows.forEach((b) => {
          map[b.szamadasicelid] = b
        })
        setBudgetData(map)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [currentYear, settings.congregation_id, loadBudgetRows, onToast])

  // 2026-07-10 (#2): előző évi tény betöltése (a callback a currentYear-1 évet
  // aggregálja). Hiba esetén csendben kimarad — a referencia-oszlop opcionális.
  useEffect(() => {
    if (!loadPreviousActuals) return
    let cancelled = false
    void (async () => {
      const result = await loadPreviousActuals(currentYear)
      if (cancelled || result.error) return
      setPrevActuals({
        income: result.actualIncome || {},
        expense: result.actualExpense || {},
      })
    })()
    return () => {
      cancelled = true
    }
  }, [currentYear, loadPreviousActuals])

  function getValue(celId: string): number {
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getLeafValue(c.id), 0)
    }
    return getLeafValue(celId)
  }

  function getLeafValue(celId: string): number {
    const row = budgetData[celId]
    if (!row) return 0
    if (mode === 'base') return row.tervezett || 0
    if (mode === 'mod1') return row.modositott ?? row.tervezett ?? 0
    if (mode === 'mod2') return row.mod2 ?? row.modositott ?? row.tervezett ?? 0
    return row.mod3 ?? row.mod2 ?? row.modositott ?? row.tervezett ?? 0
  }

  function getPreviousValue(celId: string): number {
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getPreviousLeafValue(c.id), 0)
    }
    return getPreviousLeafValue(celId)
  }

  function getPreviousLeafValue(celId: string): number {
    const row = budgetData[celId]
    if (!row) return 0
    if (mode === 'mod1') return row.tervezett || 0
    if (mode === 'mod2') return row.modositott ?? row.tervezett ?? 0
    if (mode === 'mod3') return row.mod2 ?? row.modositott ?? row.tervezett ?? 0
    return 0
  }

  // 2026-07-10 (#2): előző ÉVI tény — csoport-soroknál a levelek összege
  // (a getValue aggregáló mintája). A bevétel (1xx) és kiadás (2xx) kódok
  // diszjunktak, ezért a két map közös lookupja biztonságos.
  function getPrevYearActualLeaf(celId: string): number {
    if (!prevActuals) return 0
    return prevActuals.income[celId] ?? prevActuals.expense[celId] ?? 0
  }

  function getPrevYearActualValue(celId: string): number {
    if (!prevActuals) return 0
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getPrevYearActualLeaf(c.id), 0)
    }
    return getPrevYearActualLeaf(celId)
  }

  function setValue(celId: string, val: number) {
    // 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): fail-closed őr. A zárolt (egyházmegyei
    // szintű) sorra a gyülekezet nem írhat összeget — a beviteli mező meg sem
    // jelenik, de ez a második, adat-oldali kapu: egy jövőbeli hívó (batch-kitöltés,
    // import, billentyűs navigáció) se tudja némán felülírni.
    if (zarolt(celId)) return
    setBudgetData((prev) => {
      const existing = prev[celId] || {
        szamadasicelid: celId,
        tervezett: 0,
        modositott: null,
        mod2: null,
        mod3: null,
      }
      const updated = { ...existing }
      if (mode === 'base') updated.tervezett = val
      else if (mode === 'mod1') updated.modositott = val
      else if (mode === 'mod2') updated.mod2 = val
      else updated.mod3 = val
      return { ...prev, [celId]: updated }
    })
  }

  const totalIncome = bevetelCellek
    .filter((c) => c.id.includes('.'))
    .reduce((s, c) => s + getValue(c.id), 0)
  const totalExpense = kiadasCellek
    .filter((c) => c.id.includes('.'))
    .reduce((s, c) => s + getValue(c.id), 0)
  const balance = totalIncome - totalExpense

  /**
   * 2026-08-11 (5. kör, P0 adat-integritás): a tényleges mentés — a `saving`
   * flaget SZÁNDÉKOSAN nem állítja/nem engedi el, azt a hívó kezeli.
   *
   * HIBA VOLT: a régi `handleSave()` semmit nem adott vissza (hiba esetén csak
   * toastolt és `return`-ölt), a `handleFinalizeAndSubmit` pedig a visszatérési
   * érték ismerete NÉLKÜL zárta le az évet és küldte be az egyházmegyének a
   * kliens-oldali snapshotot — vagyis egy elbukott mentés után is. Ráadásul a
   * `finally { setSaving(false) }` a külső flow KÖZEPÉN visszaengedte a
   * gombokat (dupla beküldés lassú mobilhálózaton).
   *
   * @returns true, ha a mentés sikeres volt; false minden hiba esetén.
   */
  async function saveInner(): Promise<boolean> {
    if (mode === 'base') {
      const result = await saveBudgetRows(
        currentYear,
        settings.congregation_id,
        Object.values(budgetData),
      )
      if (result.error) {
        onToast?.('Mentési hiba: ' + result.error, 'error')
        return false
      }
      // A callback `success: false`-t is adhat error-szöveg nélkül — az sem siker.
      if (result.success === false) {
        onToast?.('A költségvetés mentése nem sikerült.', 'error')
        return false
      }
    } else {
      const modNum = (mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3) as 1 | 2 | 3
      const rows = Object.values(budgetData).map((r) => ({
        szamadasicelid: r.szamadasicelid,
        value:
          modNum === 1
            ? r.modositott ?? r.tervezett ?? 0
            : modNum === 2
              ? r.mod2 ?? 0
              : r.mod3 ?? 0,
      }))
      const result = await saveBudgetModification(
        currentYear,
        settings.congregation_id,
        modNum,
        rows,
      )
      if (result.error) {
        onToast?.('Mentési hiba: ' + result.error, 'error')
        return false
      }
      if (result.success === false) {
        onToast?.('A módosítás mentése nem sikerült.', 'error')
        return false
      }
    }
    return true
  }

  /** Önálló „Mentés" gomb — a saving-flaget itt kezeljük. */
  async function handleSave(): Promise<boolean> {
    setSaving(true)
    try {
      const ok = await saveInner()
      if (ok) onToast?.('Költségvetés mentve!', 'success')
      return ok
    } finally {
      setSaving(false)
    }
  }

  // 2026-08-15 (Endre 4. szakasz): a korábbi `window.confirm` megerősítést az
  // EGYSÉGES FinalizeButton saját dialógusa váltotta ki — mire ez a függvény
  // fut, a lelkész már megerősítette a véglegesítést.
  async function handleFinalizeAndSubmit() {
    if (typeof window === 'undefined') return
    const modNum = mode === 'base' ? null : mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3
    const docType: 'koltsegvetes' | 'koltsegvetes_modositas' =
      mode === 'base' ? 'koltsegvetes' : 'koltsegvetes_modositas'

    // 2026-08-11 (5. kör, P0): dupla-koppintás védelem — ha már fut egy mentés
    // vagy beküldés, ne induljon egy második flow.
    if (saving) return

    setSaving(true)
    try {
      // 2026-08-11 (5. kör, P0): HIBA VOLT — itt `await handleSave()` állt, a
      // visszatérési érték vizsgálata NÉLKÜL. Ha a szerver-mentés elbukott
      // (RLS/hálózat), a rendszer akkor is LEZÁRTA az évet és beküldte az
      // egyházmegyének a kliens-oldali snapshotot, ami a szerveren soha nem
      // került mentésre — a végén még zöld „véglegesítve és beküldve" toasttal.
      // A `saveInner()` a `saving` flaget végig true-n hagyja (nincs közbenső
      // feloldás → nincs dupla beküldés).
      const saved = await saveInner()
      if (!saved) {
        onToast?.(
          'A mentés nem sikerült, ezért a véglegesítés és a beküldés ELMARADT. ' +
            'Ellenőrizd az internetkapcsolatot, és próbáld újra — az adataid a képernyőn megmaradtak.',
          'error',
        )
        return
      }

      // 2026-08-11 (6. kör, P1): a beküldött pillanatkép a VÉGÖSSZEGEKET is viszi.
      // Eddig csak a kódonkénti sorok mentek be; az egyházmegyénél így senki nem
      // látta azt az összbevétel/összkiadás/egyenleg hármast, ami a gyülekezetnél
      // ALÁÍRT nyomtatvány végösszeg-sorában áll — és a sorok kézi összeadása sem
      // adta ki (a képernyőn a végösszeg csak a hivatalos végpont-kódokat összegzi).
      // A `modNumber` is bekerül, hogy a pillanatkép önmagában is azonosítható legyen.
      const snapshot: Record<string, unknown> = {
        budgetData,
        year: currentYear,
        mode,
        modNumber: modNum,
        totalIncome,
        totalExpense,
        balance,
      }

      // 2026-07-10 (#4/4): ZÁR-ELŐSZÖR sorrend — előbb a véglegesítés (lock),
      // utána a beküldés. Korábban fordítva volt: ha a zárás elbukott, a
      // dokumentum beküldött-de-nyitott maradt, és a beküldött snapshot csendben
      // elévülhetett (a szerkesztés tovább élt).
      // 2026-08-11 (5. kör, P0): a `success === false` ág is elutasítás — a
      // callback hibaszöveg nélkül is jelezhet kudarcot, és ilyenkor SEM
      // szabad beküldeni a snapshotot.
      if (mode === 'base') {
        const result = await finalizeBudget(currentYear)
        if (result.error || result.success === false) {
          onToast?.(
            `Véglegesítés sikertelen: ${result.error || 'ismeretlen hiba'} — a beküldés elmaradt.`,
            'error',
          )
          return
        }
      } else {
        const result = await finalizeBudgetModification(
          currentYear,
          modNum as 1 | 2 | 3,
        )
        if (result.error || result.success === false) {
          onToast?.(
            `Véglegesítés sikertelen: ${result.error || 'ismeretlen hiba'} — a beküldés elmaradt.`,
            'error',
          )
          return
        }
      }

      const submitResult = await submitDocument(docType, currentYear, snapshot, modNum)
      if (submitResult.error || submitResult.success === false) {
        onToast?.(
          `Véglegesítve, de a beküldés sikertelen: ${submitResult.error || 'ismeretlen hiba'} — ` +
            'próbáld újra a beküldést, vagy kérj javítási engedélyt.',
          'error',
        )
        return
      }

      onToast?.(
        mode === 'base'
          ? `Költségvetés véglegesítve és beküldve ${felettesSzintNek}!`
          : `${modNum}. módosítás véglegesítve és beküldve ${felettesSzintNek}!`,
        'success',
      )
      setTimeout(() => onRefresh?.(), 600)
    } finally {
      setSaving(false)
    }
  }

  // 2026-08-11 (K5-#12): melyik véglegesített szintre kérünk feloldást. Kiemelve,
  // mert a gomb megjelenítése, a dialógus címe és a beküldött indoklás előtagja
  // is ebből él — így nem tud széthúzni a három.
  const lastFinalizedLabel = isMod3Finalized
    ? '3. módosítás'
    : isMod2Finalized
      ? '2. módosítás'
      : isMod1Finalized
        ? '1. módosítás'
        : isBaseFinalized
          ? 'alap költségvetés'
          : null

  // ── 2026-08-11 (K5-#12) + 2026-08-15 (Endre 4. szakasz) ───────────────────
  // A javítási kérelem indoklása az EGYSÉGES FinalizeButton indoklás-
  // dialógusán érkezik (kötelező, ≥10 karakter). Az indoklás elé továbbra is a
  // véglegesített szint kerül („[1. módosítás] …"), mert az esperes ebből
  // tudja, MELYIK kört kell feloldania. A visszatérési értékből dönti el a
  // komponens, hogy a dialógus bezárható-e (hiba = nyitva marad).
  async function submitUnlockRequest(reason: string) {
    if (!lastFinalizedLabel) return { error: 'Nincs véglegesített költségvetés-szint.' }
    const fullReason = `[${lastFinalizedLabel}] ${reason.trim()}`
    const result = await requestBudgetUnlock(currentYear, fullReason)
    if (result.error) {
      onToast?.(result.error, 'error')
      return { error: result.error }
    }
    onToast?.(`Feloldási kérelem elküldve ${felettesSzintNek}!`, 'success')
    onRefresh?.()
    return { success: true }
  }

  if (loading) {
    // 2026-07-10 (S2 #9): állapotsávos, logós betöltő.
    return <FinanceLoadingState label="Költségvetés betöltése…" logoSrc={loadingLogoSrc} />
  }

  const showModComparison = mode !== 'base'
  // 2026-07-10 (#2): az „Előző évi tény" halvány referencia-oszlop csak base
  // módban és csak betöltött előző évi adat mellett látszik.
  const showPrevYear = mode === 'base' && prevActuals !== null

  // ── 2026-08-15 (Endre 4. szakasz): az AKTÍV szint véglegesítés-állapota ────
  // Az egységes gomb mindig a kiválasztott fül (alap / 1–3. módosítás)
  // állapotát mutatja; a feloldás-kérés viszont csak a LEGUTOLSÓ véglegesített
  // szinten értelmes (a K5-#12-es lastFinalizedLabel logika szerint).
  const activeModNum: 1 | 2 | 3 | null =
    mode === 'base' ? null : mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3
  const activeFinalized =
    mode === 'base'
      ? isBaseFinalized
      : mode === 'mod1'
        ? isMod1Finalized
        : mode === 'mod2'
          ? isMod2Finalized
          : isMod3Finalized
  const activeFinalizedAt =
    mode === 'base'
      ? (settings.budget_finalized_at ?? null)
      : mode === 'mod1'
        ? (settings.budget_mod1_date ?? null)
        : mode === 'mod2'
          ? (settings.budget_mod2_date ?? null)
          : (settings.budget_mod3_date ?? null)
  const activeModeLabel = mode === 'base' ? 'alap költségvetés' : `${activeModNum}. módosítás`
  const activeDocumentLabel =
    mode === 'base' ? 'költségvetés' : `${activeModNum}. költségvetés-módosítás`
  // A feloldás-gomb csak a legutolsó véglegesített szinten jelenik meg — a
  // korábbi köröket az esperes a legfrissebbtől visszafelé oldja fel.
  const unlockAvailable = activeFinalized && activeModeLabel === lastFinalizedLabel

  return (
    <div className="space-y-4">
      <div className="card-raised p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-heading text-xl text-slate-800">
              {currentYear}. évi költségvetés
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {isBaseFinalized && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <Check className="mr-1 size-3" /> Alap véglegesítve
                </Badge>
              )}
              {isMod1Finalized && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                  <Check className="mr-1 size-3" /> 1. módosítás végleges
                </Badge>
              )}
              {isMod2Finalized && (
                <Badge className="bg-violet-50 text-violet-700 border-violet-200">
                  <Check className="mr-1 size-3" /> 2. módosítás végleges
                </Badge>
              )}
              {isMod3Finalized && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                  <Check className="mr-1 size-3" /> 3. módosítás végleges
                </Badge>
              )}
              {settings.unlock_requested && (
                <Badge variant="outline" className="border-red-200 text-red-600">
                  Feloldás elbírálás alatt...
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['base', 'mod1', 'mod2', 'mod3'] as BudgetMode[]).map((m) => {
              const isActive = mode === m
              const isAvailable =
                m === 'base' ||
                (m === 'mod1' && isBaseFinalized) ||
                (m === 'mod2' && isMod1Finalized) ||
                (m === 'mod3' && isMod2Finalized)

              if (!isAvailable) return null

              return (
                // 2026-07-10 (S4-mobil): max-sm:min-h-10 — 40px-es érintőfelület telefonon.
                <Button
                  key={m}
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  className="rounded-full max-sm:min-h-10"
                  onClick={() => setMode(m)}
                >
                  {MODE_LABELS[m]}
                </Button>
              )
            })}

            {/* 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb a
                fejléc-sáv jobb szélén — az aktív szint (alap / 1–3. módosítás)
                állapotát mutatja. A flow változatlan: mentés → zár → beküldés
                (handleFinalizeAndSubmit); a megerősítést a közös dialógus adja. */}
            <FinalizeButton
              documentLabel={activeDocumentLabel}
              year={currentYear}
              finalized={activeFinalized}
              finalizedAt={activeFinalizedAt}
              unlockRequested={!!settings.unlock_requested}
              finalizeLabel="Véglegesítés és beküldés"
              confirmDescription={`A program előbb elmenti a képernyőn látható tervet, majd lezárja és azonnal beküldi ${felettesSzintNek}.`}
              unlockAuthorityLabel={felettesSzint}
              // Csak a folyamatban lévő mentés tilt — a canEdit véglegesített
              // szinten mindig false, és az NEM tilthatja a „Feloldás kérése" utat.
              disabled={saving}
              onFinalize={() => void handleFinalizeAndSubmit()}
              onRequestUnlock={unlockAvailable ? submitUnlockRequest : undefined}
              unlockPlaceholder="Pl. A 101.01 egyházfenntartói járulék tervezett összege elírás miatt 1000 lejjel kevesebb."
            />
          </div>
        </div>

        {/* 2026-08-15 (Endre 4. szakasz): a Véglegesítés + Javítási kérelem
            gombok a fejléc-sáv jobb szélére, az EGYSÉGES FinalizeButton-ba
            költöztek — itt csak a Mentés maradt. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* 2026-07-10 (S4-mobil): max-sm:min-h-10 — 40px-es érintőfelület telefonon. */}
          {canEdit && (
            <Button
              size="sm"
              className="rounded-xl max-sm:min-h-10"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? 'Mentés...' : 'Mentés'}
            </Button>
          )}
        </div>

        {settings.unlock_requested && settings.unlock_reason && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Javítási kérelem elbírálás alatt
            </p>
            <p className="mt-1 text-sm text-amber-900">{settings.unlock_reason}</p>
            <p className="mt-1 text-xs text-amber-600">
              {scope === 'diocese'
                ? 'Az egyházkerület döntéséről a csengőben fog értesülni.'
                : 'Az egyházmegye döntéséről a csengőben fog értesülni.'}
            </p>
          </div>
        )}
      </div>

      {/* 2026-07-10 (S2 #8): a NYITÓ egyenlegek a hivatalos költségvetés_Minta.pdf
          szerint a TÁBLÁZAT 1–3. sorai (nem külön kártya) — a Bevételek tábla élén,
          automatikus, nem szerkeszthető sorokként. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BudgetCellTable
          icon={<ArrowDownCircle className="size-4 text-emerald-600" />}
          title="Bevételek"
          headerBg="bg-emerald-50 border-emerald-100"
          totalText="text-emerald-700"
          total={totalIncome}
          showModComparison={showModComparison}
          showPrevYear={showPrevYear}
          modeLabel={MODE_LABELS[mode]}
          cells={bevetelCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
          getPrevYearActual={getPrevYearActualValue}
          canEdit={canEdit}
          setValue={setValue}
          isLocked={zarolt}
          isIncome
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
        />
        <BudgetCellTable
          icon={<ArrowUpCircle className="size-4 text-rose-500" />}
          title="Kiadások"
          headerBg="bg-rose-50 border-rose-100"
          totalText="text-rose-600"
          total={totalExpense}
          showModComparison={showModComparison}
          showPrevYear={showPrevYear}
          modeLabel={MODE_LABELS[mode]}
          cells={kiadasCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
          getPrevYearActual={getPrevYearActualValue}
          canEdit={canEdit}
          setValue={setValue}
          isLocked={zarolt}
          isIncome={false}
        />
      </div>

      {/* 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS): magyarázat a zárolt sorokhoz.
          Enélkül a lelkész csak annyit látna, hogy egy sor „nem enged írni" —
          és azt hinné, hibás a rendszer. */}
      {zaroltKodok.size > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-900">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Lock className="size-3.5" />
            Egyházmegyei szintű sorok
          </span>{' '}
          — ezek a kódok (pl. 201.15 Nettó fizetések, 201.17 Társadalombiztosítás,
          206.02 Biztosítások) rajta vannak a hivatalos íven, ezért itt is látod őket,
          de <strong>az egyházmegye tölti ki</strong> őket: nem írhatsz beléjük összeget,
          és tételt sem tudsz rájuk könyvelni. Ami esetleg már szerepel bennük, azt
          változatlanul megőrizzük.
        </div>
      )}

      <div
        className={`card-raised p-5 ${
          balance >= 0
            ? 'border-blue-100 bg-blue-50/30'
            : 'border-red-100 bg-red-50/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <Scale
            className={`size-5 ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Egyenleg
            </p>
            <p
              className={`text-2xl font-bold ${
                balance >= 0 ? 'text-blue-700' : 'text-red-700'
              }`}
            >
              {balance >= 0 ? '+' : ''}
              {formatCurrency(balance)} RON
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BudgetCellTableProps {
  icon: React.ReactNode
  title: string
  headerBg: string
  totalText: string
  total: number
  showModComparison: boolean
  /** 2026-07-10 (#2): halvány „Előző évi tény" referencia-oszlop (base mód). */
  showPrevYear: boolean
  modeLabel: string
  cells: SzamadasiCel[]
  getValue: (celId: string) => number
  getPreviousValue: (celId: string) => number
  /** 2026-07-10 (#2): előző évi tény érték (csoportnál levelek összege). */
  getPrevYearActual: (celId: string) => number
  canEdit: boolean
  setValue: (celId: string, val: number) => void
  isIncome: boolean
  /** 2026-08-11 (6. kör): zárolt (egyházmegyei szintű) sor — látszik, de nem
   *  szerkeszthető; a tárolt értéket read-only módon mutatjuk. */
  isLocked: (celId: string) => boolean
  /** 2026-07-10 (S2 #8): a hivatalos nyomtatvány 1–3. NYITÓ sora a tábla élén —
   *  automatikus, nem szerkeszthető sorok (Disponibil / Casa / Banca). */
  openingRows?: Array<{ nr: string; nev: string; value: number; group: boolean }>
}

function BudgetCellTable({
  icon,
  title,
  headerBg,
  totalText,
  total,
  showModComparison,
  showPrevYear,
  modeLabel,
  cells,
  getValue,
  getPreviousValue,
  getPrevYearActual,
  canEdit,
  setValue,
  isIncome,
  isLocked,
  openingRows,
}: BudgetCellTableProps) {
  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b ${headerBg} px-4 py-3`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className={`text-xs ${totalText} ml-auto font-semibold`}>
          {formatCurrency(total)} RON
        </span>
      </div>
      {/* 2026-07-10 (S4-mobil): min-w + tabular-nums — telefonon vízszintesen
          görgethető tábla; a referencia-oszlopok (Előző / Előző évi tény)
          md alatt rejtve, a lényeg (Kód/Megnevezés/Terv) mindig látszik. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm tabular-nums">
          <thead className="border-b border-slate-100 bg-slate-50/80">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500 w-16">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              {showModComparison && (
                <th className="hidden md:table-cell p-2 text-right text-xs font-medium text-slate-500 w-28">
                  Előző
                </th>
              )}
              {showPrevYear && (
                <th className="hidden md:table-cell p-2 text-right text-xs font-medium text-slate-400 w-28">
                  Előző évi tény
                </th>
              )}
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-32">
                {showModComparison ? modeLabel : 'Terv (RON)'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* 2026-07-10 (S2 #8): hivatalos NYITÓ sorok (1–3.) a tábla élén —
                automatikus, nem szerkeszthető (a mentés nem érinti őket). */}
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
                {showModComparison && (
                  <td className="hidden md:table-cell p-2 text-right text-xs text-slate-300">–</td>
                )}
                {showPrevYear && (
                  <td className="hidden md:table-cell p-2 text-right text-xs text-slate-300">–</td>
                )}
                <td className="p-2 text-right">
                  <span className={row.group ? 'font-semibold text-slate-700' : 'text-slate-600'}>
                    {formatCurrency(row.value)}
                  </span>
                </td>
              </tr>
            ))}
            {cells.map((c) => {
              const isGroup = !c.id.includes('.')
              // 2026-08-11 (6. kör): a zárolt sor a hivatalos íven RAJTA van, de
              // az egyházmegye tölti ki — csak megjelenítjük a tárolt értéket.
              const locked = !isGroup && isLocked(c.id)
              const val = getValue(c.id)
              const prevVal = showModComparison ? getPreviousValue(c.id) : 0
              const diff = showModComparison ? val - prevVal : 0
              // 2026-07-10 (#2): előző évi tény — halvány oszlop + üres input placeholdere.
              const prevYearVal = showPrevYear ? getPrevYearActual(c.id) : 0
              const positiveColor = isIncome ? 'text-emerald-600' : 'text-red-500'
              const negativeColor = isIncome ? 'text-red-500' : 'text-emerald-600'

              return (
                <tr
                  key={c.id}
                  className={
                    isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'
                  }
                >
                  <td className="p-2 text-xs text-slate-400">{c.id}</td>
                  <td
                    className={`p-2 ${
                      isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                    }`}
                  >
                    {c.nev}
                    {locked && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                        title="Egyházmegyei szintű tétel — az egyházmegye tölti ki. A hivatalos íven szerepel, de a gyülekezet nem írhat bele összeget, és nem is könyvelhet rá."
                      >
                        <Lock className="size-2.5" />
                        egyházmegyei
                      </span>
                    )}
                  </td>
                  {showModComparison && (
                    <td className="hidden md:table-cell p-2 text-right text-xs text-slate-400">
                      {formatCurrency(prevVal)}
                    </td>
                  )}
                  {showPrevYear && (
                    <td className="hidden md:table-cell p-2 text-right text-xs text-slate-400">
                      {prevYearVal !== 0 ? formatCurrency(prevYearVal) : '–'}
                    </td>
                  )}
                  <td className="p-2 text-right">
                    {isGroup ? (
                      <span className={`font-semibold ${positiveColor}`}>
                        {formatCurrency(val)}
                      </span>
                    ) : locked ? (
                      // ZÁROLT sor: a tárolt érték read-only. NEM nullázzuk és nem
                      // rejtjük el — a nulla itt is érvényes érték.
                      <span
                        className="text-slate-500"
                        title="Egyházmegyei szintű tétel — az egyházmegye tölti ki"
                      >
                        {formatCurrency(val)}
                      </span>
                    ) : canEdit ? (
                      // 2026-07-10 (S4-mobil): min-h-10 telefonon + tabular-nums a bevitelben.
                      <input
                        type="number"
                        value={val || ''}
                        onChange={(e) => setValue(c.id, Number(e.target.value) || 0)}
                        className="w-28 max-sm:min-h-10 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums placeholder:text-slate-300"
                        step="0.01"
                        min="0"
                        placeholder={
                          showPrevYear && prevYearVal !== 0
                            ? formatCurrency(prevYearVal)
                            : undefined
                        }
                      />
                    ) : (
                      <span
                        className={
                          diff > 0
                            ? positiveColor
                            : diff < 0
                              ? negativeColor
                              : 'text-slate-600'
                        }
                      >
                        {formatCurrency(val)}
                      </span>
                    )}
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
