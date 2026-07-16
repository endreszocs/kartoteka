/**
 * Kanonikus magyar igehely-formázás.
 *
 * Szabályok:
 *   - könyv: kanonikus rövidítés ('Mt', 'Zsolt', '1Móz')
 *   - fejezet-vers elválasztó: vessző ('Jn 3,16')
 *   - tartomány: nagykötőjel ('Zsolt 23,1–4', 'Mt 13,53–14,12', 'Mt 5–7')
 *   - azonos fejezetre eső további szakaszok: pont ('Lk 1,26–38.46–55')
 *   - eltérő fejezet/könyv: pontosvessző ('Mt 5,3; 6,9' · 'Jn 3,16; Zsolt 23')
 *   - a betűs vers-utótag megmarad ('Jn 3,16b')
 */

import { getBook } from './books'
import type { IgehelySzegmens } from './types'

const NAGYKOTO = '–' // nagykötőjel: –

function verseToken(verse: number, suffix?: string): string {
  return `${verse}${suffix ?? ''}`
}

/** Egy szegmens fejezet/vers része, könyvnév nélkül ('3,16' · '5–7' · '13,53–14,12'). */
function chapterPart(seg: IgehelySzegmens): string {
  if (seg.startChapter === null) return '' // teljes könyv — csak a könyvnév jelenik meg
  const sc = seg.startChapter
  const ec = seg.endChapter ?? sc
  if (seg.startVerse === null) {
    return ec !== sc ? `${sc}${NAGYKOTO}${ec}` : `${sc}`
  }
  const sv = verseToken(seg.startVerse, seg.startVerseSuffix)
  if (ec !== sc) {
    // fejezeten átívelő: záró vers nélkül a záró fejezet végéig
    const evPart = seg.endVerse !== null ? `,${verseToken(seg.endVerse, seg.endVerseSuffix)}` : ''
    return `${sc},${sv}${NAGYKOTO}${ec}${evPart}`
  }
  if (seg.endVerse !== null && seg.endVerse !== seg.startVerse) {
    return `${sc},${sv}${NAGYKOTO}${verseToken(seg.endVerse, seg.endVerseSuffix)}`
  }
  return `${sc},${sv}`
}

/** Csak a vers-rész ('16' · '26–38') — a ponttal fűzött folytató szakaszokhoz. */
function versePart(seg: IgehelySzegmens): string {
  if (seg.startVerse === null) return ''
  const sv = verseToken(seg.startVerse, seg.startVerseSuffix)
  if (seg.endVerse !== null && seg.endVerse !== seg.startVerse) {
    return `${sv}${NAGYKOTO}${verseToken(seg.endVerse, seg.endVerseSuffix)}`
  }
  return sv
}

/**
 * Szegmensek → kanonikus magyar megjelenítés (parseReference inverz-szerű párja).
 * Ismeretlen könyvkódnál magát a kódot írja ki (defenzív viselkedés).
 */
export function formatReference(segments: IgehelySzegmens[]): string {
  let out = ''
  let prev: IgehelySzegmens | null = null

  for (const seg of segments) {
    const abbrev = getBook(seg.book)?.abbrev ?? seg.book

    if (prev && prev.book === seg.book) {
      // Ugyanarra a fejezetre folytatódó vers-szakasz → ponttal fűzzük
      const folytatas =
        seg.startVerse !== null &&
        prev.startVerse !== null &&
        seg.startChapter !== null &&
        seg.startChapter === (prev.endChapter ?? prev.startChapter) &&
        seg.endChapter === seg.startChapter
      out += folytatas ? `.${versePart(seg)}` : `; ${chapterPart(seg)}`
    } else {
      const cp = chapterPart(seg)
      const darab = cp ? `${abbrev} ${cp}` : abbrev
      out += out ? `; ${darab}` : darab
    }
    prev = seg
  }

  return out
}
