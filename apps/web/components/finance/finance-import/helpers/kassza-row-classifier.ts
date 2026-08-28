/**
 * Kassza-sor osztályozó: bevétel / kiadás / belső mozgás / skip.
 *
 * A hivatalos EREK könyvelési Excel "Kassza" füle 14 oszlopos, és minden
 * sor két párhuzamos összeg-oszlopot tartalmaz: "Bev. - Összeg" és
 * "Kiad. - Összeg". Egy sor csak az egyiket használja, a másik üres.
 *
 * 2026-05-02 (Fázis 2): a logika a valós EREK 2025 Kassza-fülre kalibrálva.
 * Az 994-soros fájl várt felbontása:
 *   - ~479 income (101.xx kódok, "Egyházfenntartói járulék" stb.)
 *   - ~64 expense (201.xx, 202.xx kódok)
 *   - ~16 internal-transfer (400.01 "Készpénzletétel/-felvétel")
 *   - ~436 skip (üres sablon-sorok, 9000+ az 1000 sor-buffer-ben)
 *
 * Belső mozgás minták (bank ↔ kassza):
 *   - "Készpénzletétel a(z) A számlára"  (kiadás-oldal: kassza → bank)
 *   - "Készpénzfelvétel a(z) A számláról" (bevétel-oldal: bank → kassza)
 *   - 400.01 költségvetési kód
 */

// Relatív import (nem @/): a tsx-alapú teszt-runnerek közvetlenül töltik be.
import { parseImportAmount } from '../../../../lib/import/amount-parse'

export type KasszaRowKind =
  | {
      kind: 'income'
      bevOsszeg: number
      celNev: string | null
      donorString: string | null
    }
  | {
      kind: 'expense'
      kiaOsszeg: number
      celNev: string | null
      targetText: string | null
    }
  | {
      kind: 'internal-transfer-in'
      amount: number
      celNev: string | null
      bankRef: string | null
    }
  | {
      kind: 'internal-transfer-out'
      amount: number
      celNev: string | null
      bankRef: string | null
    }
  | {
      kind: 'skip'
      reason: string
    }

const INTERNAL_TRANSFER_PATTERNS = [
  /Készpénzletétel/i,
  /Készpénzfelvétel/i,
  /Depunere\s+numerar/i,
  /Retragere\s+numerar/i,
  /Transfer\s+(?:între\s+)?conturi/i, // Bank-bank átvitel (402.xx)
]

/**
 * Igaz, ha a szöveg belső mozgásra UTAL (Készpénzletétel/-felvétel, Transfer
 * conturi, Depunere/Retragere numerar). A „lemaradt belső mozgás" figyelmeztetőhöz:
 * ha egy ilyen sor mégis sima bevétel/kiadásként osztályozódott (rossz/hiányzó kód),
 * akkor jelezni kell — különben a pénz fél lába hiányozna a párból.
 */
export function looksLikeInternalMovement(text: string | null | undefined): boolean {
  if (!text) return false
  return INTERNAL_TRANSFER_PATTERNS.some((p) => p.test(text))
}

const INFO_LINE_PATTERNS = [
  // „Előző évi készpénzegyenleg" (Kassza) ÉS „Előző évi egyenleg" (A–F bankszámla-lapok).
  // FONTOS: a nyitó egyenleg NEM tranzakció — különben bevételként importálódna.
  /Előző évi.*egyenleg/i,
  /^Napi bevétel/i,
  /^Napi kiadás/i,
  /^Egyenleg:/i,
  /^Kasszaegyenleg/i,
]

/**
 * A Kassza fül egy sorát osztályozza.
 *
 * @param row Egy Kassza-sor a `transformSheet` után, virtuális mezőkkel.
 * @returns Az osztályozási eredmény.
 */
export function splitKasszaRow(row: Record<string, unknown>): KasszaRowKind {
  const donor = (row['_donor_string'] as string | null) ?? null
  const bevOsszeg = toNumberOrNull(row['_bev_osszeg'])
  const kiaOsszeg = toNumberOrNull(row['_kia_osszeg'])
  const bevCel = (row['_bev_cel_nev'] as string | null) ?? null
  const kiaCel = (row['_kia_cel_nev'] as string | null) ?? null
  const kod = (row['_szamadasicel_kod'] as string | null) ?? null

  // 1. Üres sor — Kassza sablon-puffer
  const hasAnyValue =
    (donor && donor.trim() !== '') ||
    (bevOsszeg !== null && bevOsszeg !== 0) ||
    (kiaOsszeg !== null && kiaOsszeg !== 0)

  if (!hasAnyValue) {
    return { kind: 'skip', reason: 'üres sor' }
  }

  // 2. Tájékoztató/összesítő sorok
  if (donor && INFO_LINE_PATTERNS.some((p) => p.test(donor))) {
    return { kind: 'skip', reason: 'tájékoztató/összesítő sor' }
  }

  // 3. Belső mozgás detektálás — a 4xx vagy 30x.xx kód-prefix VAGY az
  //    "Készpénzletétel/-felvétel / Transfer între conturi" kifejezés.
  //
  // Belső pénzmozgás-kódok az EREK könyvelési számhalomban (a kanonikus készlet:
  // 300.01 / 301.01 / 400.01 / 401.01 / 402.02):
  //   - 400.xx — Kassza→Bank letétel       (Kassza fül kiadás-oldal)
  //   - 401.xx — Bank→Kassza felvét        (Kassza fül BEVÉTEL / Bank KIADÁS)
  //   - 402.xx — Bank→Bank átvitel         (Bank fülek; v2)
  //   - 300.xx / 301.xx — Bank-oldali belső mozgás (Bank fülek; v2)
  //
  // FONTOS: ennek konzisztensnek kell lennie a `budget-code-resolver.resolveBudgetCode`
  // belső-mozgás logikájával (az `startsWith('4') || '301' || '300'`-at néz). Korábban
  // a 300.xx itt KIMARADT, így egy 300-as átvezetés tévesen bevételként/kiadásként
  // könyvelődhetett volna.
  const kodNormalized = kod !== null ? String(kod).replace(/,/, '.') : ''
  const isInternalCode =
    kodNormalized.length > 0 &&
    (/^4\d{2}\b/.test(kodNormalized) || /^30[01]\b/.test(kodNormalized))
  const bevCelIsInternal = bevCel ? INTERNAL_TRANSFER_PATTERNS.some((p) => p.test(bevCel)) : false
  const kiaCelIsInternal = kiaCel ? INTERNAL_TRANSFER_PATTERNS.some((p) => p.test(kiaCel)) : false

  if (bevOsszeg && bevOsszeg > 0 && (bevCelIsInternal || isInternalCode)) {
    // Bank → Kassza (pénz érkezik a kasszába másik számláról)
    return {
      kind: 'internal-transfer-in',
      amount: bevOsszeg,
      celNev: bevCel,
      bankRef: donor,
    }
  }

  if (kiaOsszeg && kiaOsszeg > 0 && (kiaCelIsInternal || isInternalCode)) {
    // Kassza → Bank (pénz távozik a kasszából másik számlára)
    return {
      kind: 'internal-transfer-out',
      amount: kiaOsszeg,
      celNev: kiaCel,
      bankRef: donor,
    }
  }

  // 4. Sima bevétel (101.xx, 102.xx, 103.xx, 104.xx kódok dominálnak)
  if (bevOsszeg && bevOsszeg > 0) {
    return {
      kind: 'income',
      bevOsszeg,
      celNev: bevCel,
      donorString: donor,
    }
  }

  // 5. Sima kiadás (201.xx, 202.xx kódok dominálnak)
  if (kiaOsszeg && kiaOsszeg > 0) {
    return {
      kind: 'expense',
      kiaOsszeg,
      celNev: kiaCel,
      targetText: donor,
    }
  }

  // 6. Defenzív: nem várt eset (pl. csak donor szöveg, semmi összeg)
  return { kind: 'skip', reason: 'donor van, de összeg üres' }
}

/**
 * Szám-konverzió, null-tűréssel — a KÖZÖS import-összeg parserrel.
 * P0-17 (audit 2026-08-28): a korábbi naiv vessző→pont csere az „1.234,56"
 * alakot 1.234-re zsugorította; a kanonikus parser a lib/import/amount-parse.
 */
function toNumberOrNull(value: unknown): number | null {
  return parseImportAmount(value)
}

/* ───────────────────────────────────────────────────────────────────────
 * @testdata — manuális smoke test (Fázis 2)
 *
 *   splitKasszaRow({
 *     _donor_string: 'Szőcs Endre - Parókia 214',
 *     _bev_osszeg: 130,
 *     _bev_cel_nev: 'Egyházfenntartói járulék',
 *     _szamadasicel_kod: '101.01',
 *   }) // → { kind: 'income', bevOsszeg: 130, ... }
 *
 *   splitKasszaRow({
 *     _donor_string: 'Referinta 250108S744931084',
 *     _kia_osszeg: 7680,
 *     _kia_cel_nev: 'Készpénzletétel a(z) A számlára',
 *     _szamadasicel_kod: '400.01',
 *   }) // → { kind: 'internal-transfer-out', amount: 7680, ... }
 *
 *   splitKasszaRow({
 *     _donor_string: 'Készpénzfelvétel a(z) A számláról',
 *     _bev_osszeg: 5000,
 *     _bev_cel_nev: 'Készpénzfelvétel a(z) A számláról',
 *     _szamadasicel_kod: '400.01',
 *   }) // → { kind: 'internal-transfer-in', amount: 5000, ... }
 *
 *   splitKasszaRow({
 *     _donor_string: null,
 *     _bev_osszeg: null,
 *     _kia_osszeg: null,
 *   }) // → { kind: 'skip', reason: 'üres sor' }
 *
 *   splitKasszaRow({
 *     _donor_string: 'Előző évi készpénzegyenleg:',
 *     _bev_osszeg: 12519.86,
 *   }) // → { kind: 'skip', reason: 'tájékoztató/összesítő sor' }
 * ─────────────────────────────────────────────────────────────────────── */
