'use client'

/**
 * Webes BudgetTab wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.0): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `BudgetTab` komponensébe.
 */

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { BudgetTab as SharedBudgetTab, type BudgetTabProps } from '@kartoteka/ui-app'

import {
  felterjesztMegyeiKoltsegvetes,
  finalizeBudget,
  finalizeBudgetModification,
  getPreviousYearActuals,
  requestBudgetUnlock,
  saveBudgetModificationAction,
  saveBudgetRowsAction,
} from '@/app/(dashboard)/penzugy/actions'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
// 2026-07-10 (S3-#4): a MENTÉS szerver-akción megy (zár-ellenőrzéssel) — kliens-oldali
// compat-hívás csak az OLVASÁSRA (loadBudgetRowsCompat) maradt.
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

// 2026-07-10 (#2): carryoverCash/carryoverBank (nyitó blokk) átengedése a shared tabnak.
// 2026-08-11 (6. kör): `scope` — a hívó adja át. A SOROK hatókörtől függetlenül
// ugyanazok (a hivatalos ív minden tétele, ahogy a nyomtatványon); a `scope`
// már csak a SZERKESZTHETŐSÉGET dönti el: gyülekezeti hatókörben az egyházmegyei
// szintű ív-sorok látszanak, de zárolva, megyei hatókörben MINDEN sor
// szerkeszthető (az egyházmegye saját íve). A prop ELMARADÁSA 'congregation'-t
// jelentene — vagyis fölösleges zárolást —, ezért a diocese-oldal KÖTELEZŐEN
// átadja (lásd finance-tabs.tsx).
type WebBudgetTabProps = Pick<
  BudgetTabProps,
  | 'szamadasiCellek'
  | 'settings'
  | 'currentYear'
  | 'scope'
  | 'carryoverCash'
  | 'carryoverBank'
>

export function BudgetTab(props: WebBudgetTabProps) {
  const router = useRouter()
  return (
    <SharedBudgetTab
      {...props}
      // 2026-07-10 (S2 #9): logós betöltő-állapot.
      loadingLogoSrc="/kartoteka-icon.png"
      // 2026-07-10 (#2): előző évi tény betöltése (szürke referencia-oszlop) —
      // a server action a year-1 évet aggregálja szamadasicel-kód szerint.
      loadPreviousActuals={async (year) => await getPreviousYearActuals(year)}
      loadBudgetRows={async (year, congregationId) => {
        const supabase = createClient()
        try {
          // 2026-08-15 (egyházmegyei terv, 2.1): HATÓKÖR-TUDATOS betöltés. A
          // mentés már régóta a `diocese_koltsegvetes`-be írt (szerver-akció,
          // scope-aware), az OLVASÁS viszont a gyülekezeti táblában kereste az
          // egyházmegye azonosítóját → a megyei Költségvetés fül a mentés után
          // ÜRESEN jött vissza. Beírt, elmentett, létező adat tűnt el a szem
          // elől — a legrosszabb fajta néma hiba.
          const data = await loadBudgetRowsCompat(supabase, year, congregationId, props.scope ?? 'congregation')
          return { rows: data, error: null }
        } catch (e) {
          return {
            rows: [],
            error: e instanceof Error ? e.message : 'Ismeretlen hiba',
          }
        }
      }}
      // 2026-07-10 (S3-#4): a mentés SZERVER-akció — a budget_finalized /
      // budget_modN_finalized zárat a szerver ellenőrzi (a kliens-oldali írás
      // a zárat megkerülhette). A scope-ot (congregationId) a szerver oldja fel.
      saveBudgetRows={async (year, _congregationId, rows) => {
        const result = await saveBudgetRowsAction(year, rows)
        return result.error ? { error: result.error } : { success: true }
      }}
      saveBudgetModification={async (year, _congregationId, modNum, rows) => {
        const result = await saveBudgetModificationAction(year, modNum, rows)
        return result.error ? { error: result.error } : { success: true }
      }}
      finalizeBudget={async (year) => {
        const result = await finalizeBudget(year)
        return { error: 'error' in result ? result.error : null }
      }}
      finalizeBudgetModification={async (year, modNum) => {
        const result = await finalizeBudgetModification(year, modNum)
        return { error: 'error' in result ? result.error : null }
      }}
      // ── 2026-08-15 (egyházmegyei terv, 3.6 + Endre 3. döntése) ────────────
      // A „Véglegesítés és beküldés" gomb ugyanaz mind a két hatókörben, de a
      // CÉL más: a gyülekezet az egyházmegyének küld be
      // (`document_submissions`), az egyházmegye SAJÁT költségvetése az
      // egyházkerületnek megy fel (`diocese_felterjesztes`).
      //
      // MI VOLT A HIBA: megyei nézetben is a gyülekezeti beküldő futott, ami
      // „Nincs aktív gyülekezet." hibával állt meg (a megyei profilnak nincs
      // gyülekezete). Az esperes tehát lezárta az évet, majd egy értelmezhetetlen
      // hibaüzenetet kapott, és sehol nem maradt nyoma a felküldésnek.
      submitDocument={async (docType, year, snapshot, modNum) => {
        if (props.scope === 'diocese') {
          const result = await felterjesztMegyeiKoltsegvetes(
            year,
            (modNum as 1 | 2 | 3 | null) ?? null,
            snapshot,
          )
          return { error: result.error ?? null }
        }
        const result = await submitDocument(docType, year, snapshot, modNum)
        return { error: 'error' in result ? result.error : null }
      }}
      requestBudgetUnlock={async (year, reason) => {
        const result = await requestBudgetUnlock(year, reason)
        return { error: 'error' in result ? result.error : null }
      }}
      onRefresh={() => router.refresh()}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
    />
  )
}
