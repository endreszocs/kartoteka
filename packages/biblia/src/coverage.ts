/**
 * Versszám-katalógus + validálás + vers-szintű kibontás + lefedettség.
 *
 * A katalógus (verse-counts.json, ~5 KB) a scripts/build-verse-counts.mjs
 * generátumával jön a Károli-korpuszból (66 könyv / 1189 fejezet / 31126 vers) —
 * a 4,2 MB-os bibliaszöveget ez a csomag NEM importálja.
 *
 * Vers-azonosító: 'KÖNYVKÓD.fejezet.vers' (pl. 'JHN.3.16') — lásd types.ts.
 */

import verseCountsData from './data/verse-counts.json'
import { getBook } from './books'
import { formatReference } from './format'
import type { CoverageResult, IgehelySzegmens, ValidationResult, VerseCounts } from './types'

const BUILTIN: VerseCounts = verseCountsData as VerseCounts

/** A beépített Károli versszám-katalógus (könyvsorrend + fejezetenkénti versszámok). */
export function getVerseCounts(): VerseCounts {
  return BUILTIN
}

let osszesVersCache: number | null = null

/** A korpusz teljes versszáma (Károli: 31126). */
export function osszesVers(verseCounts: VerseCounts = BUILTIN): number {
  if (verseCounts === BUILTIN && osszesVersCache !== null) return osszesVersCache
  let total = 0
  for (const code of verseCounts.order) {
    for (const n of verseCounts.counts[code] ?? []) total += n
  }
  if (verseCounts === BUILTIN) osszesVersCache = total
  return total
}

function konyvNev(code: string): string {
  return getBook(code)?.abbrev ?? code
}

/**
 * Létezik-e a hivatkozás a korpuszban: könyv ismert, fejezetek a könyv
 * fejezetszámán, versek az adott fejezet versszámán belül, tartomány nem fordított.
 */
export function validateReference(
  segments: IgehelySzegmens[],
  verseCounts: VerseCounts = BUILTIN,
): ValidationResult {
  const problemak: string[] = []
  if (segments.length === 0) problemak.push('Üres hivatkozás (nincs szegmens).')

  for (const seg of segments) {
    const label = formatReference([seg])
    const chapters = verseCounts.counts[seg.book]
    if (!chapters) {
      problemak.push(`Ismeretlen könyvkód: ${seg.book}.`)
      continue
    }
    if (seg.startChapter === null) continue // teljes könyv — mindig létezik

    const sc = seg.startChapter
    const ec = seg.endChapter ?? sc
    if (sc < 1 || sc > chapters.length) {
      problemak.push(`${label}: a(z) ${konyvNev(seg.book)} könyvnek nincs ${sc}. fejezete (összesen ${chapters.length}).`)
      continue
    }
    if (ec < 1 || ec > chapters.length) {
      problemak.push(`${label}: a(z) ${konyvNev(seg.book)} könyvnek nincs ${ec}. fejezete (összesen ${chapters.length}).`)
      continue
    }
    if (ec < sc) {
      problemak.push(`${label}: fordított fejezet-tartomány (${sc}–${ec}).`)
      continue
    }

    const sv = seg.startVerse
    const ev = seg.endVerse
    if (sv !== null && (sv < 1 || sv > chapters[sc - 1])) {
      problemak.push(`${label}: a ${konyvNev(seg.book)} ${sc}. fejezetében csak ${chapters[sc - 1]} vers van (kért: ${sv}.).`)
      continue
    }
    if (ev !== null && (ev < 1 || ev > chapters[ec - 1])) {
      problemak.push(`${label}: a ${konyvNev(seg.book)} ${ec}. fejezetében csak ${chapters[ec - 1]} vers van (kért: ${ev}.).`)
      continue
    }
    if (sv !== null && ev !== null && sc === ec && ev < sv) {
      problemak.push(`${label}: fordított vers-tartomány (${sv}–${ev}).`)
    }
  }

  return { valid: problemak.length === 0, problemak }
}

/**
 * Az érintett versek azonosító-listája ('JHN.3.16' formátum), kanonikus
 * sorrendben, duplikátumok nélkül. A korpuszon kívülre eső részeket némán a
 * létező tartományra vágja (a hibajelzés a validateReference dolga) — így
 * részben hibás hivatkozásból is használható lefedettség számolható.
 */
export function expandToVerseIds(
  segments: IgehelySzegmens[],
  verseCounts: VerseCounts = BUILTIN,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const seg of segments) {
    const chapters = verseCounts.counts[seg.book]
    if (!chapters) continue

    const sc = Math.max(1, Math.min(seg.startChapter ?? 1, chapters.length))
    const ec = Math.max(sc, Math.min(seg.endChapter ?? (seg.startChapter === null ? chapters.length : sc), chapters.length))

    for (let ch = sc; ch <= ec; ch++) {
      const maxVers = chapters[ch - 1]
      const from = ch === sc && seg.startVerse !== null ? Math.max(1, Math.min(seg.startVerse, maxVers)) : 1
      const to = ch === ec && seg.endVerse !== null ? Math.max(from, Math.min(seg.endVerse, maxVers)) : maxVers
      for (let v = from; v <= to; v++) {
        const id = `${seg.book}.${ch}.${v}`
        if (!seen.has(id)) {
          seen.add(id)
          out.push(id)
        }
      }
    }
  }

  return out
}

const VERSE_ID_RE = /^([0-9A-Z]{3})\.(\d+)\.(\d+)$/

/**
 * Lefedettség-statisztika egy vers-azonosító halmazból.
 * Csak a korpuszban létező, egyedi azonosítók számítanak (a duplikátum és a
 * hibás id nem torzít) — így a százalék sosem megy 100 fölé.
 */
export function coverage(
  verseIds: Iterable<string>,
  verseCounts: VerseCounts = BUILTIN,
): CoverageResult {
  const osszes = osszesVers(verseCounts)
  const egyedi = new Set<string>()
  for (const id of verseIds) {
    if (egyedi.has(id)) continue
    const m = VERSE_ID_RE.exec(id)
    if (!m) continue
    const chapters = verseCounts.counts[m[1]]
    if (!chapters) continue
    const ch = parseInt(m[2], 10)
    const v = parseInt(m[3], 10)
    if (ch < 1 || ch > chapters.length || v < 1 || v > chapters[ch - 1]) continue
    egyedi.add(id)
  }
  const erintett = egyedi.size
  const szazalek = osszes > 0 ? Math.round((erintett / osszes) * 10000) / 100 : 0
  return { osszes, erintett, szazalek }
}
