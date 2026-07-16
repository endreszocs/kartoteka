/**
 * @kartoteka/biblia — parser/formázó/lefedettség tesztesetek.
 *
 * Futtatható keretrendszer nélkül: a runBibliaTests() tisztán összegyűjti a
 * hibákat (üres tömb = minden zöld). A scripts/selftest-biblia.mjs ezt hívja
 * TypeScript-transpile után; vitest/jest alá is beköthető később.
 */

import {
  coverage,
  expandToVerseIds,
  formatReference,
  getVerseCounts,
  parseReference,
  resolveBook,
  validateReference,
} from '../src/index'
import type { IgehelySzegmens } from '../src/index'

type SzegmensVaz = {
  startChapter: number | null
  startVerse: number | null
  endChapter: number | null
  endVerse: number | null
  startVerseSuffix?: string
  endVerseSuffix?: string
}

export interface ParserCase {
  input: string
  /** null = hibát várunk (ok: false); egyébként a várt könyvkód. */
  book: string | null
  segments?: SzegmensVaz[]
  formatted?: string
  /** Hibás esetnél a várt hibakód. */
  errorCode?: string
}

/** A feladatban felsorolt ÖSSZES hivatkozás-forma + vegyes írásjelek + hibaesetek. */
export const PARSER_CASES: ParserCase[] = [
  // Egy vers — vessző és kettőspont elválasztóval
  { input: 'Jn 3,16', book: 'JHN', segments: [{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }], formatted: 'Jn 3,16' },
  { input: 'Jn 3:16', book: 'JHN', segments: [{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }], formatted: 'Jn 3,16' },
  // DicsHub-kompatibilitás: első pont mint fejezet-vers elválasztó
  { input: 'Jn 3.16', book: 'JHN', segments: [{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }], formatted: 'Jn 3,16' },
  // Verstartomány — sima kötőjel és nagykötőjel
  { input: 'Zsolt 23:1-4', book: 'PSA', segments: [{ startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 4 }], formatted: 'Zsolt 23,1–4' },
  { input: 'Zsolt 23,1–4', book: 'PSA', segments: [{ startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 4 }], formatted: 'Zsolt 23,1–4' },
  // Római számos könyvnév
  { input: 'I. Móz 1,1', book: 'GEN', segments: [{ startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 }], formatted: '1Móz 1,1' },
  // Fejezeten átívelő tartomány
  { input: 'Mt 13,53-14,12', book: 'MAT', segments: [{ startChapter: 13, startVerse: 53, endChapter: 14, endVerse: 12 }], formatted: 'Mt 13,53–14,12' },
  { input: 'Mt 13,53–14,12', book: 'MAT', segments: [{ startChapter: 13, startVerse: 53, endChapter: 14, endVerse: 12 }], formatted: 'Mt 13,53–14,12' },
  // Több szakasz egy hivatkozásban — a pont utáni rész ugyanarra a fejezetre értendő
  {
    input: 'Lk 1,26-38.46-55',
    book: 'LUK',
    segments: [
      { startChapter: 1, startVerse: 26, endChapter: 1, endVerse: 38 },
      { startChapter: 1, startVerse: 46, endChapter: 1, endVerse: 55 },
    ],
    formatted: 'Lk 1,26–38.46–55',
  },
  // Betűs vers — az értelmezés elhagyja, a formázás megőrzi
  { input: 'Jn 3,16b', book: 'JHN', segments: [{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, startVerseSuffix: 'b' }], formatted: 'Jn 3,16b' },
  { input: 'Mk 5,21-24a', book: 'MRK', segments: [{ startChapter: 5, startVerse: 21, endChapter: 5, endVerse: 24, endVerseSuffix: 'a' }], formatted: 'Mk 5,21–24a' },
  // Csak fejezet / fejezet-tartomány
  { input: 'Mt 5', book: 'MAT', segments: [{ startChapter: 5, startVerse: null, endChapter: 5, endVerse: null }], formatted: 'Mt 5' },
  { input: 'Mt 5-7', book: 'MAT', segments: [{ startChapter: 5, startVerse: null, endChapter: 7, endVerse: null }], formatted: 'Mt 5–7' },
  { input: 'Mt 5 – 7', book: 'MAT', segments: [{ startChapter: 5, startVerse: null, endChapter: 7, endVerse: null }], formatted: 'Mt 5–7' },
  // Csak könyv
  { input: 'Máté', book: 'MAT', segments: [{ startChapter: null, startVerse: null, endChapter: null, endVerse: null }], formatted: 'Mt' },
  // Verslista ponttal és (engedékeny bővítésként) vesszővel
  {
    input: 'Jn 3,16.18',
    book: 'JHN',
    segments: [
      { startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 },
      { startChapter: 3, startVerse: 18, endChapter: 3, endVerse: 18 },
    ],
    formatted: 'Jn 3,16.18',
  },
  {
    input: 'Jn 3,16,18',
    book: 'JHN',
    segments: [
      { startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 },
      { startChapter: 3, startVerse: 18, endChapter: 3, endVerse: 18 },
    ],
    formatted: 'Jn 3,16.18',
  },
  // Vegyes/valós életbeli alakok
  { input: '1Kor 13:4-7', book: '1CO', segments: [{ startChapter: 13, startVerse: 4, endChapter: 13, endVerse: 7 }], formatted: '1Kor 13,4–7' },
  { input: 'Jel 21:1-5', book: 'REV', segments: [{ startChapter: 21, startVerse: 1, endChapter: 21, endVerse: 5 }], formatted: 'Jel 21,1–5' },
  { input: 'Apcsel 2,1', book: 'ACT', segments: [{ startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }], formatted: 'ApCsel 2,1' },
  { input: 'II. Kor 4,7', book: '2CO', segments: [{ startChapter: 4, startVerse: 7, endChapter: 4, endVerse: 7 }], formatted: '2Kor 4,7' },
  { input: 'jn3,16', book: 'JHN', segments: [{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }], formatted: 'Jn 3,16' },
  { input: 'Mt 5.', book: 'MAT', segments: [{ startChapter: 5, startVerse: null, endChapter: 5, endVerse: null }], formatted: 'Mt 5' },
  { input: 'Énekek éneke 2,4', book: 'SNG', segments: [{ startChapter: 2, startVerse: 4, endChapter: 2, endVerse: 4 }], formatted: 'Énekek 2,4' },
  // Hibaesetek
  { input: '', book: null, errorCode: 'ures' },
  { input: '   ', book: null, errorCode: 'ures' },
  { input: 'Hupikék törpikék 3,16', book: null, errorCode: 'ismeretlen-konyv' },
  { input: 'Jn ,16', book: null, errorCode: 'ertelmezhetetlen' },
  { input: 'Jn 3,-5', book: null, errorCode: 'ertelmezhetetlen' },
]

/** Könyvnév-feloldó esetek: bemenet → várt kód (null = nem oldható fel). */
export const RESOLVE_CASES: { input: string; code: string | null }[] = [
  { input: '1móz', code: 'GEN' },
  { input: 'I. Móz', code: 'GEN' },
  { input: 'Gen', code: 'GEN' },
  { input: 'Teremtés', code: 'GEN' },
  { input: 'zsoltarok', code: 'PSA' }, // ékezet nélkül
  { input: 'ZSOLT', code: 'PSA' },
  { input: 'ÉZSAIÁS', code: 'ISA' },
  { input: 'ezsaias', code: 'ISA' },
  { input: 'Jel', code: 'REV' },
  { input: 'apcsel', code: 'ACT' },
  { input: '2 Kor', code: '2CO' },
  { input: 'II.Kor', code: '2CO' },
  { input: 'Fil', code: 'PHP' },
  { input: 'Filem', code: 'PHM' },
  { input: 'zsid', code: 'HEB' },
  { input: '1SA', code: '1SA' }, // kanonikus kód önmagában
  { input: 'Hupikék', code: null },
]

function segEq(actual: IgehelySzegmens, expected: SzegmensVaz): boolean {
  return (
    actual.startChapter === expected.startChapter &&
    actual.startVerse === expected.startVerse &&
    actual.endChapter === expected.endChapter &&
    actual.endVerse === expected.endVerse &&
    (actual.startVerseSuffix ?? '') === (expected.startVerseSuffix ?? '') &&
    (actual.endVerseSuffix ?? '') === (expected.endVerseSuffix ?? '')
  )
}

/** Az összes teszt futtatása — üres failures tömb = minden rendben. */
export function runBibliaTests(): { total: number; failures: string[] } {
  const failures: string[] = []
  let total = 0
  const check = (name: string, ok: boolean, detail?: string) => {
    total++
    if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  }

  // ── Parser esetek ──────────────────────────────────────────────────────────
  for (const c of PARSER_CASES) {
    const r = parseReference(c.input)
    if (c.book === null) {
      check(`parse("${c.input}") hibát vár`, !r.ok, r.ok ? 'mégis sikerült' : undefined)
      if (!r.ok && c.errorCode) {
        check(`parse("${c.input}") hibakód`, r.error.code === c.errorCode, `kapott: ${r.error.code}`)
      }
      continue
    }
    if (!r.ok) {
      check(`parse("${c.input}")`, false, `hiba: ${r.error.code} — ${r.error.message}`)
      continue
    }
    check(`parse("${c.input}") könyv`, r.book.code === c.book, `kapott: ${r.book.code}`)
    if (c.segments) {
      const segOk =
        r.segments.length === c.segments.length && r.segments.every((s, i) => segEq(s, c.segments![i]))
      check(`parse("${c.input}") szegmensek`, segOk, JSON.stringify(r.segments))
    }
    if (c.formatted !== undefined) {
      const fmt = formatReference(r.segments)
      check(`format("${c.input}")`, fmt === c.formatted, `kapott: "${fmt}", várt: "${c.formatted}"`)
    }
  }

  // ── Könyvnév-feloldás ──────────────────────────────────────────────────────
  for (const c of RESOLVE_CASES) {
    const b = resolveBook(c.input)
    check(`resolveBook("${c.input}")`, (b?.code ?? null) === c.code, `kapott: ${b?.code ?? 'null'}`)
  }

  // ── Versszám-katalógus ─────────────────────────────────────────────────────
  const vc = getVerseCounts()
  check('katalógus: 66 könyv', vc.order.length === 66, String(vc.order.length))
  const fejezetek = vc.order.reduce((a, c2) => a + vc.counts[c2].length, 0)
  const versek = vc.order.reduce((a, c2) => a + vc.counts[c2].reduce((x, y) => x + y, 0), 0)
  check('katalógus: 1189 fejezet', fejezetek === 1189, String(fejezetek))
  check('katalógus: 31126 vers', versek === 31126, String(versek))

  // ── Validálás ──────────────────────────────────────────────────────────────
  const validCases: { input: string; valid: boolean }[] = [
    { input: 'Jn 3,16', valid: true },
    { input: 'Máté', valid: true },
    { input: 'Mt 13,53-14,12', valid: true },
    { input: 'Zsolt 150', valid: true },
    { input: 'Jn 3,99', valid: false }, // Jn 3-ban 36 vers van
    { input: 'Mt 29', valid: false }, // Mt-ban 28 fejezet van
    { input: 'Zsolt 151', valid: false },
    { input: 'Mt 7-5', valid: false }, // fordított fejezet-tartomány
    { input: 'Jn 3,18-16', valid: false }, // fordított vers-tartomány
  ]
  for (const c of validCases) {
    const r = parseReference(c.input)
    if (!r.ok) {
      check(`validate("${c.input}") parse`, false, r.error.message)
      continue
    }
    const v = validateReference(r.segments)
    check(`validate("${c.input}") = ${c.valid}`, v.valid === c.valid, v.problemak.join(' | '))
  }

  // ── Kibontás vers-azonosítókra ─────────────────────────────────────────────
  const expandOf = (input: string): string[] => {
    const r = parseReference(input)
    return r.ok ? expandToVerseIds(r.segments) : []
  }
  const e1 = expandOf('Jn 3,16')
  check("expand('Jn 3,16')", e1.length === 1 && e1[0] === 'JHN.3.16', JSON.stringify(e1))
  const e2 = expandOf('1Móz 1,1-3')
  check("expand('1Móz 1,1-3')", e2.join(',') === 'GEN.1.1,GEN.1.2,GEN.1.3', JSON.stringify(e2))
  const mtSum567 = vc.counts.MAT[4] + vc.counts.MAT[5] + vc.counts.MAT[6]
  check("expand('Mt 5-7')", expandOf('Mt 5-7').length === mtSum567)
  const mtAll = vc.counts.MAT.reduce((a, b) => a + b, 0)
  check("expand('Máté') = teljes könyv", expandOf('Máté').length === mtAll)
  const atMenoVart = vc.counts.MAT[12] - 53 + 1 + 12 // Mt 13,53-végig + Mt 14,1-12
  check("expand('Mt 13,53-14,12')", expandOf('Mt 13,53-14,12').length === atMenoVart)
  check("expand('Lk 1,26-38.46-55')", expandOf('Lk 1,26-38.46-55').length === 13 + 10)
  // Duplikátum-mentesség
  const rDup = parseReference('Jn 3,16')
  if (rDup.ok) {
    const dup = expandToVerseIds([...rDup.segments, ...rDup.segments])
    check('expand dedup', dup.length === 1, String(dup.length))
  }

  // ── Lefedettség ────────────────────────────────────────────────────────────
  const cov1 = coverage(expandOf('Jn 3,16-18'))
  check(
    'coverage(Jn 3,16-18)',
    cov1.osszes === 31126 && cov1.erintett === 3 && cov1.szazalek === 0.01,
    JSON.stringify(cov1),
  )
  const cov0 = coverage([])
  check('coverage(üres)', cov0.erintett === 0 && cov0.szazalek === 0, JSON.stringify(cov0))
  const covRossz = coverage(['XXX.1.1', 'JHN.99.1', 'JHN.3.16', 'JHN.3.16'])
  check('coverage: hibás/duplikált id nem számít', covRossz.erintett === 1, JSON.stringify(covRossz))
  const mindenKonyv: IgehelySzegmens[] = vc.order.map((code) => ({
    book: code,
    startChapter: null,
    startVerse: null,
    endChapter: null,
    endVerse: null,
  }))
  const covTeljes = coverage(expandToVerseIds(mindenKonyv))
  check(
    'coverage: teljes korpusz = 100%',
    covTeljes.erintett === 31126 && covTeljes.szazalek === 100,
    JSON.stringify(covTeljes),
  )

  // ── Több könyv formázása ───────────────────────────────────────────────────
  const rA = parseReference('Jn 3,16')
  const rB = parseReference('Zsolt 23')
  if (rA.ok && rB.ok) {
    const fmt = formatReference([...rA.segments, ...rB.segments])
    check('format több könyv', fmt === 'Jn 3,16; Zsolt 23', fmt)
  }

  return { total, failures }
}
