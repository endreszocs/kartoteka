/**
 * Excel D–L sor-építő — E3 write-through (2026-06-11).
 *
 * PURE modul: nincs Supabase, nincs Tauri, nincs I/O — unit-tesztelhető.
 * A hivatalos EREK `Adatok_<év>.xlsx` Kassza/bank-lap oszlop-sémáját építi:
 *   D=Dátum · E=Iratszám · F=Irattíp · G=Név · H=Bev.összeg · I=Bev.kód(NÉV) ·
 *   J=Kiad.összeg · K=Kiad.kód(NÉV) · L=Megjegyzés
 *
 * Pénzügyi szabályok:
 *   - Az I/K oszlopba a kategória SZÖVEGES NEVE megy (a SUMIF név szerint
 *     aggregál) — a nevet a hívó adja (szamadasicel.nev = hivatalos név,
 *     a 2026-06-11 név-fix után), a builder NEM talál ki nevet.
 *   - Cent-pontos kerekítés (`roundCent`) — egyezik az Excel `ROUND(...,2)`-vel.
 *   - Sztornó: ellenelőjeles TÜKÖR-SOR (append-only) — a SUMIF nettóz, az
 *     audit-nyom megmarad. A megjegyzés `SZTORNÓ:` prefixet kap.
 */

import { BANK_LETTERS, BELSO_MOZGAS_EXCEL_NEVEK } from './belso-mozgas-nevek'

/** Egy Kassza/bank-lap adatsor — a D–L oszlopok (camelCase, a Tauri-híddal egyező). */
export interface ExcelKasszaRow {
  datum: string
  iratszam: string
  irattip: string
  nev: string
  bevOsszeg?: number | null
  bevKod?: string | null
  kiadOsszeg?: number | null
  kiadKod?: string | null
  megjegyzes: string
}

/** Cent-pontos kerekítés — az Excel `ROUND(x, 2)` megfelelője. */
export function roundCent(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * Irattíp (F oszlop) az E2 szótár szerint:
 *   Készpénzes tétel → `Chit.` · Banki tétel → `Extr`
 * (A Dispozíció/Decont/Fact. variánsok a web-oldali bizonylatokhoz tartoznak —
 * a desktop rögzítő a Készpénz/Banki kontextusból választ.)
 */
export function irattipToExcel(irattipus: string, bankszamlaId?: number | null): string {
  if (bankszamlaId) return 'Extr'
  if (/bank/i.test(irattipus)) return 'Extr'
  return 'Chit.'
}

export interface BuildEntryRowInput {
  datum: string
  iratszam: string
  irattipus: string
  /** G oszlop — a befizető / átvevő / forrás neve. */
  nev: string
  osszeg: number
  /** A kategória HIVATALOS neve (szamadasicel.nev) — I vagy K oszlopba. */
  kategoriaNev: string
  megjegyzes?: string | null
  bankszamlaId?: number | null
}

/** Bevétel-sor (H=összeg, I=kategória-név). */
export function buildIncomeExcelRow(input: BuildEntryRowInput): ExcelKasszaRow {
  return {
    datum: input.datum,
    iratszam: input.iratszam,
    irattip: irattipToExcel(input.irattipus, input.bankszamlaId),
    nev: input.nev,
    bevOsszeg: roundCent(input.osszeg),
    bevKod: input.kategoriaNev,
    kiadOsszeg: null,
    kiadKod: null,
    megjegyzes: input.megjegyzes || '',
  }
}

/** Kiadás-sor (J=összeg, K=kategória-név). */
export function buildExpenseExcelRow(input: BuildEntryRowInput): ExcelKasszaRow {
  return {
    datum: input.datum,
    iratszam: input.iratszam,
    irattip: irattipToExcel(input.irattipus, input.bankszamlaId),
    nev: input.nev,
    bevOsszeg: null,
    bevKod: null,
    kiadOsszeg: roundCent(input.osszeg),
    kiadKod: input.kategoriaNev,
    megjegyzes: input.megjegyzes || '',
  }
}

/**
 * Sztornó tükör-sor: ugyanaz az oszlop (H marad H, J marad J), ellentett
 * előjellel — a SUMIF így nettóz, és mindkét sor auditálhatóan megmarad.
 */
export function buildReversalRow(original: ExcelKasszaRow, indok?: string | null): ExcelKasszaRow {
  const prefix = `SZTORNÓ: ${original.iratszam}`
  const note = indok?.trim() ? `${prefix} — ${indok.trim()}` : prefix
  return {
    datum: original.datum,
    iratszam: original.iratszam,
    irattip: original.irattip,
    nev: original.nev,
    bevOsszeg: original.bevOsszeg ? roundCent(-original.bevOsszeg) : null,
    bevKod: original.bevOsszeg ? original.bevKod : null,
    kiadOsszeg: original.kiadOsszeg ? roundCent(-original.kiadOsszeg) : null,
    kiadKod: original.kiadOsszeg ? original.kiadKod : null,
    megjegyzes: original.megjegyzes ? `${note} | ${original.megjegyzes}` : note,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Belső mozgás (kassza ↔ bank) — KÉT sor: Kassza-lap + betű-lap
// ─────────────────────────────────────────────────────────────────────────

export interface BuildTransferRowsInput {
  tipus: 'kassza_bank' | 'bank_kassza'
  datum: string
  /** A belső mozgás azonosítója — az E oszlopba `BM-<id>` kerül. */
  belsomozgasId: number
  osszeg: number
  /** A bank-betű (A…T) — a megerősített bank→betű párosításból. */
  bankLetter: string
  megjegyzes?: string | null
}

export interface TransferExcelRows {
  /** A Kassza-lapra írandó sor. */
  kasszaRow: ExcelKasszaRow
  /** A betű-lapra írandó sor. */
  bankRow: ExcelKasszaRow
  /** A cél betű-lap neve (A…T). */
  bankSheet: string
}

/**
 * Belső mozgás két Excel-sora a hivatalos per-számla nevekkel:
 *   kassza_bank (perselyfölözés a bankba):
 *     Kassza KIADÁS  = „Készpénzletétel a(z) <L> számlára"   (400.<i>)
 *     <L>-lap BEVÉTEL = „Készpénzletétel a kasszából - <L>"  ((300+i).01)
 *   bank_kassza (pénzfelvétel a kasszába):
 *     Kassza BEVÉTEL = „Készpénzfelvétel a(z) <L> számláról" (300.<i>)
 *     <L>-lap KIADÁS  = „Készpénzfelvétel a kasszába - <L>"  ((400+i).01)
 *
 * Hibát dob, ha a betű vagy a katalógus-név nem oldható fel — a hívó SOHA
 * nem tippelhet lapot/nevet („pénzügyekkel nem lehet viccelni").
 */
export function buildTransferExcelRows(input: BuildTransferRowsInput): TransferExcelRows {
  const letterIdx = (BANK_LETTERS as readonly string[]).indexOf(input.bankLetter)
  if (letterIdx < 0) {
    throw new Error(`Ismeretlen bank-betű: "${input.bankLetter}" (A–T várt).`)
  }
  const i = letterIdx + 1
  const suffix = i < 10 ? `0${i}` : String(i)

  // Kassza-oldali név: a 300/400 család kód-suffixe determinisztikus (A=01…T=20).
  const kasszaKod = input.tipus === 'kassza_bank' ? `400.${suffix}` : `300.${suffix}`
  const kasszaNev = BELSO_MOZGAS_EXCEL_NEVEK[kasszaKod]

  // Bank-oldali név: NÉV SZERINT keresünk, mert az EREK-sablon (300+i).01 /
  // (400+i).01 kód-kiosztása nem mindenhol következetes (pl. 418.01 = „- S",
  // az R kimaradt; 420.01 = „- U"). A betű-lap legördülője a pontos nevet
  // várja — ha a katalógusban nincs ilyen név, HIBA (sosem tippelünk).
  const bankNevVart =
    input.tipus === 'kassza_bank'
      ? `Készpénzletétel a kasszából - ${input.bankLetter}`
      : `Készpénzfelvétel a kasszába - ${input.bankLetter}`
  const bankNev = Object.values(BELSO_MOZGAS_EXCEL_NEVEK).includes(bankNevVart)
    ? bankNevVart
    : null

  if (!kasszaNev || !bankNev) {
    throw new Error(
      `Hiányzó belső-mozgás Excel-név a(z) ${input.bankLetter} laphoz ` +
        `(${kasszaKod} / „${bankNevVart}") — a hivatalos katalógus nem fedi.`,
    )
  }

  const osszeg = roundCent(input.osszeg)
  const iratszam = `BM-${input.belsomozgasId}`
  const megjegyzes = input.megjegyzes || ''

  const kasszaRow: ExcelKasszaRow =
    input.tipus === 'kassza_bank'
      ? {
          datum: input.datum,
          iratszam,
          irattip: 'Chit.',
          nev: kasszaNev,
          bevOsszeg: null,
          bevKod: null,
          kiadOsszeg: osszeg,
          kiadKod: kasszaNev,
          megjegyzes,
        }
      : {
          datum: input.datum,
          iratszam,
          irattip: 'Chit.',
          nev: kasszaNev,
          bevOsszeg: osszeg,
          bevKod: kasszaNev,
          kiadOsszeg: null,
          kiadKod: null,
          megjegyzes,
        }

  const bankRow: ExcelKasszaRow =
    input.tipus === 'kassza_bank'
      ? {
          datum: input.datum,
          iratszam,
          irattip: 'Extr',
          nev: bankNev,
          bevOsszeg: osszeg,
          bevKod: bankNev,
          kiadOsszeg: null,
          kiadKod: null,
          megjegyzes,
        }
      : {
          datum: input.datum,
          iratszam,
          irattip: 'Extr',
          nev: bankNev,
          bevOsszeg: null,
          bevKod: null,
          kiadOsszeg: osszeg,
          kiadKod: bankNev,
          megjegyzes,
        }

  return { kasszaRow, bankRow, bankSheet: input.bankLetter }
}

// ─────────────────────────────────────────────────────────────────────────
// Bank ↔ bank átvezetés — KÉT betű-lap (forrás kiadás + cél bevétel)
// ─────────────────────────────────────────────────────────────────────────

export interface BuildBankBankRowsInput {
  datum: string
  belsomozgasId: number
  osszeg: number
  /** A forrás-számla betűje (ahonnan a pénz megy). */
  forrasLetter: string
  /** A cél-számla betűje (ahová érkezik). */
  celLetter: string
  megjegyzes?: string | null
}

export interface BankBankExcelRows {
  /** A forrás betű-lapra írandó KIADÁS-sor. */
  forrasRow: ExcelKasszaRow
  /** A cél betű-lapra írandó BEVÉTEL-sor. */
  celRow: ExcelKasszaRow
  forrasSheet: string
  celSheet: string
}

/**
 * Bank→bank átvezetés két Excel-sora. Névminta (Endre élő fájljának
 * képernyőképével igazolva, 2026-06-11):
 *   forrás X lapon (kiadás): „Átutalva a(z) <CÉL> számlára - <X>"
 *   cél Y lapon (bevétel):  „Átutalva a(z) <FORRÁS> számláról - <Y>"
 * A nevek KÖTELEZŐEN a hivatalos katalógus-készletből jönnek — ha a pár
 * bármelyik neve hiányzik, hibát dobunk (sosem tippelünk).
 */
export function buildBankBankExcelRows(input: BuildBankBankRowsInput): BankBankExcelRows {
  const letters = BANK_LETTERS as readonly string[]
  if (!letters.includes(input.forrasLetter) || !letters.includes(input.celLetter)) {
    throw new Error(
      `Ismeretlen bank-betű: "${input.forrasLetter}" → "${input.celLetter}" (A–T várt).`,
    )
  }
  if (input.forrasLetter === input.celLetter) {
    throw new Error('A forrás- és cél-számla nem lehet azonos.')
  }

  const forrasNev = `Átutalva a(z) ${input.celLetter} számlára - ${input.forrasLetter}`
  const celNev = `Átutalva a(z) ${input.forrasLetter} számláról - ${input.celLetter}`
  const keszlet = Object.values(BELSO_MOZGAS_EXCEL_NEVEK)
  if (!keszlet.includes(forrasNev) || !keszlet.includes(celNev)) {
    throw new Error(
      `Hiányzó bank→bank Excel-név (`+
        `„${forrasNev}" / „${celNev}") — a hivatalos katalógus nem fedi ezt a lap-párt.`,
    )
  }

  const osszeg = roundCent(input.osszeg)
  const iratszam = `BM-${input.belsomozgasId}`
  const megjegyzes = input.megjegyzes || ''

  return {
    forrasSheet: input.forrasLetter,
    celSheet: input.celLetter,
    forrasRow: {
      datum: input.datum,
      iratszam,
      irattip: 'OP',
      nev: forrasNev,
      bevOsszeg: null,
      bevKod: null,
      kiadOsszeg: osszeg,
      kiadKod: forrasNev,
      megjegyzes,
    },
    celRow: {
      datum: input.datum,
      iratszam,
      irattip: 'Extr',
      nev: celNev,
      bevOsszeg: osszeg,
      bevKod: celNev,
      kiadOsszeg: null,
      kiadKod: null,
      megjegyzes,
    },
  }
}
