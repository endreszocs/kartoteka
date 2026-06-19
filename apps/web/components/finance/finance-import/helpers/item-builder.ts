/**
 * Item-builder — a wizard kliens-állapotából `FinanceImportItem[]`-t épít.
 *
 * Bemenetek (a wizard parent state-jéből):
 *   - kasszaAnalysis.rows — minden klasszifikált sor
 *   - budgetCodeResolutions — kód → befizetescel.id / kiadascel.id
 *   - donorResolutions — donorRaw → szemely.id
 *   - manualPersonSelections — manuális override az ambiguous-ra
 *   - skippedCodes — felhasználó által kihagyott unknown-kódok
 *
 * Kimenet: a `FinanceImportItem[]` tömb, amit az `executeFinanceImport`
 * server action küld az RPC-nek.
 *
 * 2026-05-03 (Fázis 6): első verzió.
 */

import type {
  ClassifiedKasszaRow,
  BudgetCodeResolution,
  DonorResolution,
  FinanceImportItem,
} from '@/app/(dashboard)/penzugy/finance-import-types'
import { shouldResolvePerson } from '@/lib/import/person-scope-config'

export interface BuildItemsInput {
  rows: ClassifiedKasszaRow[]
  budgetCodeResolutions: BudgetCodeResolution[]
  donorResolutions: DonorResolution[]
  manualPersonSelections: Record<string, string>
  skippedCodes: Set<string>
}

export interface BuildItemsResult {
  items: FinanceImportItem[]
  /** Sorok, amiket nem tudtunk fölépíteni (pl. unknown kód, hiányzó adat) */
  skippedReasons: Array<{ rowIndex: number; reason: string }>
}

export function buildFinanceImportItems(input: BuildItemsInput): BuildItemsResult {
  const { rows, budgetCodeResolutions, donorResolutions, manualPersonSelections, skippedCodes } =
    input

  // Lookup map-ek a gyors elérés érdekében
  const budgetByRaw = new Map<string, BudgetCodeResolution>()
  const budgetByNorm = new Map<string, BudgetCodeResolution>()
  for (const r of budgetCodeResolutions) {
    budgetByRaw.set(r.rawKod, r)
    if (r.normalizedKod) budgetByNorm.set(r.normalizedKod, r)
  }

  const donorByRaw = new Map<string, DonorResolution>()
  for (const d of donorResolutions) {
    donorByRaw.set(d.raw, d)
  }

  const items: FinanceImportItem[] = []
  const skippedReasons: Array<{ rowIndex: number; reason: string }> = []

  for (const row of rows) {
    // Skip-kategóriás sorok — átugorjuk
    if (row.kind === 'skip') continue

    // Dátum kötelező
    if (!row.datum) {
      skippedReasons.push({ rowIndex: row.rowIndex, reason: 'Hiányzó dátum' })
      continue
    }
    if (typeof row.amount !== 'number' || row.amount <= 0) {
      skippedReasons.push({
        rowIndex: row.rowIndex,
        reason: 'Hiányzó vagy érvénytelen összeg',
      })
      continue
    }

    // Költségvetési kód feloldás
    const budget = row.budgetCode
      ? budgetByNorm.get(row.budgetCode) || budgetByRaw.get(row.budgetCode)
      : null

    if (!budget) {
      skippedReasons.push({
        rowIndex: row.rowIndex,
        reason: 'Hiányzó költségvetési kód',
      })
      continue
    }

    // Felhasználó által kihagyott unknown-kód
    if (skippedCodes.has(budget.rawKod)) {
      skippedReasons.push({
        rowIndex: row.rowIndex,
        reason: `Kihagyott kód: ${budget.rawKod}`,
      })
      continue
    }

    // Unknown kódra (nem kihagyva) — szintén skip
    if (budget.kind === 'unknown') {
      skippedReasons.push({
        rowIndex: row.rowIndex,
        reason: `Ismeretlen kód: ${budget.rawKod} (${budget.reason ?? '-'})`,
      })
      continue
    }

    // ─── Belső mozgás (400.xx kód) — VÁRAKOZÓ importálás ───────────────
    // A meglévő `bank-import-actions.ts` páros tételeket hoz létre
    // (kassza-oldali `kiadas` + bank-oldali `befizetes` + `belsomozgas` audit)
    // közös `belso_mozgas_xkey` UUID-vel. A v1-ben csak a kassza-oldalt
    // tudjuk látni, ezért a 400.xx sorokat **várakozó állapotban** importáljuk:
    //   - megkapnak egy `belso_mozgas_xkey` UUID-t → a meglévő nyugta-
    //     egészség / pár-keresés logika tudja, hogy ez belső mozgás
    //   - a `kedvezmenyzett` és `megjegyzes` mezőbe pasztorális "várakozó"
    //     felirat kerül → a tranzakció-listában szürkén jelenik meg
    //   - a Bank A/B import (v2) később megpróbálja összeg + dátum alapján
    //     párba állítani
    if (
      row.kind === 'internal-transfer-out' ||
      row.kind === 'internal-transfer-in'
    ) {
      const celId = pickCelId(row.kind, budget)
      if (celId === null) {
        const direction =
          row.kind === 'internal-transfer-out' ? 'Kassza → Bank' : 'Bank → Kassza'
        skippedReasons.push({
          rowIndex: row.rowIndex,
          reason: `Belső mozgás (${direction}, kód ${budget.rawKod}) — hiányzik a ${
            row.kind === 'internal-transfer-out' ? 'kiadascel' : 'befizetescel'
          } rekord a ${budget.rawKod} kódhoz. Futtasd Supabase Studio-ban: migration-docs/sql/2026-05-03-finance-belso-mozgas-celok.sql`,
        })
        continue
      }

      const belsoMozgasXkey = generateUuid()
      const fizetettev =
        parseIntSafe(row.datum.slice(0, 4)) ?? new Date().getFullYear()

      // pending-bank-deposit = kassza → bank (kassza-oldali kiadás)
      // pending-bank-withdrawal = bank → kassza (kassza-oldali bevétel)
      const importKind: FinanceImportItem['kind'] =
        row.kind === 'internal-transfer-out'
          ? 'pending-bank-deposit'
          : 'pending-bank-withdrawal'

      const direction =
        row.kind === 'internal-transfer-out'
          ? 'banki letétel'
          : 'banki készpénzfelvét'
      const pasztoralisMegjegyzes = `⏳ Várakozik banki egyeztetésre — ${direction} (a Bank A/B importja után automatikusan párba áll, ${row.megjegyzes ? row.megjegyzes : 'eredeti megjegyzés nincs'})`

      items.push({
        kind: importKind,
        datum: row.datum,
        osszeg: row.amount,
        celId,
        szemelyId: null, // belső mozgásnál nincs szemely
        forrasa: row.donorString || '', // pl. "Depunere numerar" vagy "Referinta ..."
        nyugta: row.iratszam || '',
        iratszam: row.iratszam || '',
        irattipus: row.irattipus || '',
        megjegyzes: pasztoralisMegjegyzes,
        fizetettev,
        belsoMozgasXkey,
      })
      continue
    }

    // celId megállapítása a sor kategóriája és a kód kategóriája szerint
    const celId = pickCelId(row.kind, budget)
    if (celId === null) {
      const reason = `Sor ${row.kind} kategóriájához nem találtuk a megfelelő ${
        row.kind === 'income' ? 'befizetescel' : 'kiadascel'
      }-t a ${budget.rawKod} kódhoz`
      skippedReasons.push({ rowIndex: row.rowIndex, reason })
      continue
    }

    // Donor-feloldás — PERSON-SCOPE kapuval (2026-06-19).
    // Csak a tag-bevétel kategóriáknál (person-scope-config) próbálunk személyt
    // rendelni; a perselypénz/cég/intézmény soroknál NEM (nincs téves párosítás,
    // nincs „nem található" zaj). A MANUÁLIS választást viszont mindig tiszteljük.
    const donorRaw = row.donorString || ''
    let szemelyId: number | null = null
    if (donorRaw) {
      const manualPick = manualPersonSelections[donorRaw]
      if (manualPick) {
        szemelyId = parseIntSafe(manualPick)
      } else if (shouldResolvePerson(budget.normalizedKod)) {
        const donor = donorByRaw.get(donorRaw)
        if (donor && donor.status === 'resolved' && donor.szemelyId) {
          szemelyId = parseIntSafe(donor.szemelyId)
        }
        // company / not-found / unparsed / nem-scope → szemelyId marad null
      }
    }

    // Fizetett év: az XML-overlay „Befizetett év"-e elsőbbség (több-éves hátralék
    // helyes besorolása), különben a dátum éve.
    const fizetettev =
      row.fizetettevOverride ?? parseIntSafe(row.datum.slice(0, 4)) ?? new Date().getFullYear()
    // Iratszám: a hivatalos (5-jegyű) XML-iratszám elsőbbség, különben a fájl sorszáma.
    const iratszamFinal = row.iratszamHivatalos ?? row.iratszam ?? ''

    // Itt már csak `income` vagy `expense` lehet (a belső mozgás sorok
    // korábban skip-re mentek)
    items.push({
      kind: row.kind as 'income' | 'expense',
      datum: row.datum,
      osszeg: row.amount,
      celId,
      szemelyId,
      forrasa: donorRaw,
      nyugta: row.iratszam || '',
      iratszam: iratszamFinal,
      irattipus: row.irattipus || '',
      megjegyzes: row.megjegyzes || '',
      fizetettev,
    })
  }

  return { items, skippedReasons }
}

/**
 * A megfelelő cel-ID kiválasztása a sor és a kód kategóriája alapján.
 *
 * Logika:
 *   - income sor + income kód → befizetescelId
 *   - expense sor + expense kód → kiadascelId
 *   - internal-transfer sor + internal-transfer kód → szabványos default
 *     (lásd lent: a 400.xx kódhoz general-purpose befizetescel/kiadascel)
 *   - egyéb kombinációk → null (skip)
 */
function pickCelId(
  rowKind: ClassifiedKasszaRow['kind'],
  budget: BudgetCodeResolution,
): number | null {
  if (rowKind === 'income' && budget.kind === 'income') {
    return budget.befizetescelId ?? null
  }
  if (rowKind === 'expense' && budget.kind === 'expense') {
    return budget.kiadascelId ?? null
  }
  if (rowKind === 'internal-transfer-out' && budget.kind === 'internal-transfer') {
    // Kassza→Bank: a kassza-oldal kiadás-rekord, kell a kiadascelId
    return budget.kiadascelId ?? null
  }
  if (rowKind === 'internal-transfer-in' && budget.kind === 'internal-transfer') {
    // Bank→Kassza: a kassza-oldal bevétel-rekord, kell a befizetescelId
    return budget.befizetescelId ?? null
  }
  // Mismatch (pl. income sor + expense kód) — gyakran a felhasználó által
  // kategorizált sor és a kód típusa nem stimmel
  return null
}

function parseIntSafe(s: string | undefined | null): number | null {
  if (!s) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * UUID v4 generálás kliens-oldalon (a `belso_mozgas_xkey` mezőhöz). A modern
 * böngészők támogatják a `crypto.randomUUID()`-t. Fallback: timestamp + random.
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (legacy böngészők) — RFC4122 v4-szerű
  const r = () =>
    Math.random()
      .toString(16)
      .slice(2, 10)
  return `${r()}-${r().slice(0, 4)}-4${r().slice(0, 3)}-a${r().slice(0, 3)}-${r()}${r().slice(0, 4)}`
}
