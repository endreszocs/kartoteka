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

    // celId megállapítása a sor kategóriája és a kód kategóriája szerint
    const celId = pickCelId(row.kind, budget)
    if (celId === null) {
      // Speciális üzenet a belső mozgásra (v1 nem támogatja)
      const reason =
        row.kind === 'internal-transfer-in' || row.kind === 'internal-transfer-out'
          ? 'Belső mozgás (Kassza ↔ Bank) — a v1-ben nem importálható, kézzel rögzítendő'
          : `Sor ${row.kind} kategóriájához nem találtuk a megfelelő ${
              row.kind === 'income' ? 'befizetescel' : 'kiadascel'
            }-t a ${budget.rawKod} kódhoz`
      skippedReasons.push({ rowIndex: row.rowIndex, reason })
      continue
    }

    // Donor-feloldás
    const donorRaw = row.donorString || ''
    let szemelyId: number | null = null
    if (donorRaw) {
      // 1. Manuális override (ambiguous esetben)
      const manualPick = manualPersonSelections[donorRaw]
      if (manualPick) {
        szemelyId = parseIntSafe(manualPick)
      } else {
        // 2. Auto-resolved donor
        const donor = donorByRaw.get(donorRaw)
        if (donor && donor.status === 'resolved' && donor.szemelyId) {
          szemelyId = parseIntSafe(donor.szemelyId)
        }
        // company / not-found / unparsed → szemelyId marad null
      }
    }

    // Fizetett év (a dátum első 4 karaktere)
    const fizetettev = parseIntSafe(row.datum.slice(0, 4)) ?? new Date().getFullYear()

    items.push({
      kind: row.kind,
      datum: row.datum,
      osszeg: row.amount,
      celId,
      szemelyId,
      forrasa: donorRaw,
      nyugta: row.iratszam || '',
      iratszam: row.iratszam || '',
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
  if (
    (rowKind === 'internal-transfer-in' || rowKind === 'internal-transfer-out') &&
    budget.kind === 'internal-transfer'
  ) {
    // A v1-ben a belső mozgás (Kassza ↔ Bank) NEM importálható — a Bank A/B
    // fülek importja a v2-ben jön. A 16 belső-mozgás sort a felhasználónak
    // utólag, manuálisan kell rögzítenie a meglévő pénzügyi UI-val.
    return null
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
