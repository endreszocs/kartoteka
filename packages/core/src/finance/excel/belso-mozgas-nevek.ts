/**
 * Belső-mozgás Excel-nevek — GENERÁLT a hivatalos 2026 EREK katalógusból
 * (`migration-docs/excel-2026-katalogus.json` <- `Adatok_2026.xlsx` Hibak!fif/fi).
 *
 * NE szerkeszd kézzel — a nevek BYTE-PONTOSAN egyeznek a hivatalos Excel
 * legördülő készletével (a SUMIF név szerint aggregál!).
 *
 * Konvenció (E3, 2026-06-11):
 *   - `300.<i>` — Kassza-lap BEVÉTEL név: "Készpénzfelvétel a(z) <L> számláról"
 *   - `400.<i>` — Kassza-lap KIADÁS név: "Készpénzletétel a(z) <L> számlára"
 *   - `<300+i>.01` — az <L> betű-lap BEVÉTEL neve (kassza→bank letét)
 *   - `<400+i>.01` — az <L> betű-lap KIADÁS neve (bank→kassza felvét)
 *   ahol i = a betű 1-alapú indexe (A=1 ... T=20).
 */

export const BELSO_MOZGAS_EXCEL_NEVEK: Record<string, string> = {
  '300.01': 'Készpénzfelvétel a(z) A számláról',
  '300.02': 'Készpénzfelvétel a(z) B számláról',
  '300.03': 'Készpénzfelvétel a(z) C számláról',
  '300.04': 'Készpénzfelvétel a(z) D számláról',
  '300.05': 'Készpénzfelvétel a(z) E számláról',
  '300.06': 'Készpénzfelvétel a(z) F számláról',
  '300.07': 'Készpénzfelvétel a(z) G számláról',
  '300.08': 'Készpénzfelvétel a(z) H számláról',
  '300.09': 'Készpénzfelvétel a(z) I számláról',
  '300.10': 'Készpénzfelvétel a(z) J számláról',
  '300.11': 'Készpénzfelvétel a(z) K számláról',
  '300.12': 'Készpénzfelvétel a(z) L számláról',
  '300.13': 'Készpénzfelvétel a(z) M számláról',
  '300.14': 'Készpénzfelvétel a(z) N számláról',
  '300.15': 'Készpénzfelvétel a(z) O számláról',
  '300.16': 'Készpénzfelvétel a(z) P számláról',
  '300.17': 'Készpénzfelvétel a(z) Q számláról',
  '300.18': 'Készpénzfelvétel a(z) R számláról',
  '300.19': 'Készpénzfelvétel a(z) S számláról',
  '300.20': 'Készpénzfelvétel a(z) T számláról',
  '301.01': 'Készpénzletétel a kasszából - A',
  '302.01': 'Készpénzletétel a kasszából - B',
  '303.01': 'Készpénzletétel a kasszából - C',
  '304.01': 'Készpénzletétel a kasszából - D',
  '305.01': 'Készpénzletétel a kasszából - E',
  '306.01': 'Készpénzletétel a kasszából - F',
  '307.01': 'Készpénzletétel a kasszából - G',
  '308.01': 'Készpénzletétel a kasszából - H',
  '309.01': 'Készpénzletétel a kasszából - I',
  '310.01': 'Készpénzletétel a kasszából - J',
  '311.01': 'Készpénzletétel a kasszából - K',
  '312.01': 'Készpénzletétel a kasszából - L',
  '313.01': 'Készpénzletétel a kasszából - M',
  '314.01': 'Készpénzletétel a kasszából - N',
  '315.01': 'Készpénzletétel a kasszából - O',
  '316.01': 'Készpénzletétel a kasszából - P',
  '317.01': 'Készpénzletétel a kasszából - Q',
  '318.01': 'Készpénzletétel a kasszából - R',
  '319.01': 'Készpénzletétel a kasszából - S',
  '320.01': 'Készpénzletétel a kasszából - T',
  '400.01': 'Készpénzletétel a(z) A számlára',
  '400.02': 'Készpénzletétel a(z) B számlára',
  '400.03': 'Készpénzletétel a(z) C számlára',
  '400.04': 'Készpénzletétel a(z) D számlára',
  '400.05': 'Készpénzletétel a(z) E számlára',
  '400.06': 'Készpénzletétel a(z) F számlára',
  '400.07': 'Készpénzletétel a(z) G számlára',
  '400.08': 'Készpénzletétel a(z) H számlára',
  '400.09': 'Készpénzletétel a(z) I számlára',
  '400.10': 'Készpénzletétel a(z) J számlára',
  '400.11': 'Készpénzletétel a(z) K számlára',
  '400.12': 'Készpénzletétel a(z) L számlára',
  '400.13': 'Készpénzletétel a(z) M számlára',
  '400.14': 'Készpénzletétel a(z) N számlára',
  '400.15': 'Készpénzletétel a(z) O számlára',
  '400.16': 'Készpénzletétel a(z) P számlára',
  '400.17': 'Készpénzletétel a(z) Q számlára',
  '400.18': 'Készpénzletétel a(z) R számlára',
  '400.19': 'Készpénzletétel a(z) S számlára',
  '400.20': 'Készpénzletétel a(z) T számlára',
  '401.01': 'Készpénzfelvétel a kasszába - A',
  '402.01': 'Készpénzfelvétel a kasszába - B',
  '403.01': 'Készpénzfelvétel a kasszába - C',
  '404.01': 'Készpénzfelvétel a kasszába - D',
  '405.01': 'Készpénzfelvétel a kasszába - E',
  '406.01': 'Készpénzfelvétel a kasszába - F',
  '407.01': 'Készpénzfelvétel a kasszába - G',
  '408.01': 'Készpénzfelvétel a kasszába - H',
  '409.01': 'Készpénzfelvétel a kasszába - I',
  '410.01': 'Készpénzfelvétel a kasszába - J',
  '411.01': 'Készpénzfelvétel a kasszába - K',
  '412.01': 'Készpénzfelvétel a kasszába - L',
  '413.01': 'Készpénzfelvétel a kasszába - M',
  '414.01': 'Készpénzfelvétel a kasszába - N',
  '415.01': 'Készpénzfelvétel a kasszába - O',
  '416.01': 'Készpénzfelvétel a kasszába - P',
  '417.01': 'Készpénzfelvétel a kasszába - Q',
  '418.01': 'Készpénzfelvétel a kasszába - S',
  '419.01': 'Készpénzfelvétel a kasszába - T',
  '420.01': 'Készpénzfelvétel a kasszába - U',
}

/** A bank-betűk sorrendje — az index+1 a kód-suffix (A=01 ... T=20). */
export const BANK_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'] as const
export type BankLetter = (typeof BANK_LETTERS)[number]
