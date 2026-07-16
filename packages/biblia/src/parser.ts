/**
 * Magyar igehely-hivatkozás parser — a DicsHub bible.ts parseReference-ének
 * portja, szegmens-alapúra bővítve. Támogatott formák:
 *
 *   'Jn 3,16'            egy vers (vessző VAGY kettőspont fejezet-vers elválasztó)
 *   'Zsolt 23:1-4'       verstartomány
 *   'I. Móz 1,1'         római számos könyvnév
 *   'Mt 13,53-14,12'     fejezeten átívelő tartomány
 *   'Lk 1,26-38.46-55'   több szakasz — a pont utáni rész az előző szakasz
 *                        ZÁRÓ fejezetére értendő (egyszerű esetben ugyanaz a fejezet)
 *   'Jn 3,16b'           betűs vers — 16-ként értendő, a formázás megőrzi a betűt
 *   'Mt 5'               csak fejezet
 *   'Mt 5-7'             fejezet-tartomány
 *   'Máté'               csak könyv (teljes könyv)
 *   'Jn 3,16.18'         verslista (a ',' is elfogadott lista-elválasztóként: 'Jn 3,16,18')
 *   'Jn 3.16'            DicsHub-kompatibilitás: az ELSŐ pont fejezet-vers elválasztó,
 *                        ha előtte nem volt ','/':' — a továbbiak lista-elválasztók
 *
 * Kötőjel-változatok: '-', '–', '—', '−' egyenértékűek.
 */

import { resolveBook } from './books'
import type { IgehelySzegmens, ParseReferenceResult } from './types'

type SzegmensMag = Omit<IgehelySzegmens, 'book'>

/** Belső scanner a könyv utáni fejezet/vers részhez. */
class RefScanner {
  private pos = 0
  constructor(private readonly s: string) {}

  skipWs(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++
  }

  peek(): string {
    return this.pos < this.s.length ? this.s[this.pos] : ''
  }

  next(): string {
    return this.s[this.pos++] ?? ''
  }

  atEnd(): boolean {
    this.skipWs()
    return this.pos >= this.s.length
  }

  readNumber(): number | null {
    this.skipWs()
    const m = this.s.slice(this.pos).match(/^\d+/)
    if (!m) return null
    this.pos += m[0].length
    const n = parseInt(m[0], 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  /** Egyetlen betűs vers-utótag ('16b' → 'b'); két betű már nem utótag. */
  readSuffix(): string {
    const m = this.s.slice(this.pos).match(/^[a-záéíóöőúüű](?![a-záéíóöőúüű])/i)
    if (!m) return ''
    this.pos += 1
    return m[0].toLowerCase()
  }
}

/** A fejezet/vers rész elemzése (a kötőjelek már '-'-re egységesítve). */
function parseRefPart(refPart: string): SzegmensMag[] | null {
  const sc = new RefScanner(refPart)
  const chapter = sc.readNumber()
  if (chapter === null) return null

  if (sc.atEnd()) {
    return [{ startChapter: chapter, startVerse: null, endChapter: chapter, endVerse: null }]
  }

  const sep = sc.peek()

  // Fejezet-tartomány: 'Mt 5-7'
  if (sep === '-') {
    sc.next()
    const endChapter = sc.readNumber()
    if (endChapter === null || !sc.atEnd()) return null
    return [{ startChapter: chapter, startVerse: null, endChapter, endVerse: null }]
  }

  if (sep !== ',' && sep !== ':' && sep !== '.') return null
  sc.next()

  // Záró írásjel tolerálása: 'Mt 5.' / 'Jn 3,' → teljes fejezet
  if (sc.atEnd()) {
    return [{ startChapter: chapter, startVerse: null, endChapter: chapter, endVerse: null }]
  }

  // Verslista: szakaszok '.' (vagy ',') elválasztóval, mind az aktuális fejezetre
  const segs: SzegmensMag[] = []
  let curChapter = chapter
  for (;;) {
    const v1 = sc.readNumber()
    if (v1 === null) return null
    const sfx1 = sc.readSuffix()
    sc.skipWs()

    if (sc.peek() === '-') {
      sc.next()
      const n2 = sc.readNumber()
      if (n2 === null) return null
      sc.skipWs()
      // Fejezeten átívelő tartomány vége: '…-14,12' (a pont itt NEM elválasztó,
      // az mindig új listaelemet kezd — lásd 'Lk 1,26-38.46-55')
      if (sc.peek() === ',' || sc.peek() === ':') {
        sc.next()
        const v2 = sc.readNumber()
        if (v2 === null) return null
        const sfx2 = sc.readSuffix()
        segs.push({
          startChapter: curChapter,
          startVerse: v1,
          endChapter: n2,
          endVerse: v2,
          ...(sfx1 ? { startVerseSuffix: sfx1 } : {}),
          ...(sfx2 ? { endVerseSuffix: sfx2 } : {}),
        })
        curChapter = n2
      } else {
        const sfx2 = sc.readSuffix()
        segs.push({
          startChapter: curChapter,
          startVerse: v1,
          endChapter: curChapter,
          endVerse: n2,
          ...(sfx1 ? { startVerseSuffix: sfx1 } : {}),
          ...(sfx2 ? { endVerseSuffix: sfx2 } : {}),
        })
      }
    } else {
      segs.push({
        startChapter: curChapter,
        startVerse: v1,
        endChapter: curChapter,
        endVerse: v1,
        ...(sfx1 ? { startVerseSuffix: sfx1 } : {}),
      })
    }

    if (sc.atEnd()) return segs
    const listSep = sc.peek()
    if (listSep !== '.' && listSep !== ',') return null
    sc.next()
    // Záró írásjel: 'Jn 3,16.' → kész
    if (sc.atEnd()) return segs
  }
}

/**
 * Egy igehely-hivatkozás → szegmensek VAGY strukturált magyar hiba.
 * Több, pontosvesszővel elválasztott hivatkozáshoz lásd parseMultiReference.
 */
export function parseReference(input: string): ParseReferenceResult {
  const raw = input.trim()
  if (!raw) {
    return { ok: false, error: { code: 'ures', message: 'Üres igehely-hivatkozás.', raw: input } }
  }

  // Egységesítés: whitespace össze, kötőjel-változatok ('–', '—', '−') → '-'
  const cleaned = raw.replace(/\s+/g, ' ').replace(/[–—−]/g, '-').trim()

  // Könyv + fejezet/vers rész szétválasztása: a könyv betűre végződik (elé tapadt
  // sorszám mehet: '1Móz'), a hivatkozás-rész az első önálló számmal kezdődik.
  const m = cleaned.match(/^(.*?[a-záéíóöőúüű])\.?\s*(\d.*)$/i)

  if (!m) {
    // Betű UTÁNI számjegy regex-találat nélkül = torz hivatkozás ('Jn ,16'),
    // nem csupasz könyvnév — a könyv eleji sorszám ('1Móz', '2 Kor') még belefér.
    if (/[a-záéíóöőúüű].*\d/i.test(cleaned)) {
      return {
        ok: false,
        error: {
          code: 'ertelmezhetetlen',
          message: `Nem értelmezhető igehely: „${raw}”. Példák a helyes alakra: Jn 3,16 · Zsolt 23,1-4 · Mt 13,53-14,12`,
          raw,
        },
      }
    }
    // Nincs szám → csak könyvnév ('Máté') = a teljes könyv
    const book = resolveBook(cleaned)
    if (!book) {
      return {
        ok: false,
        error: { code: 'ismeretlen-konyv', message: `Nem azonosítható bibliai könyv: „${raw}”.`, raw },
      }
    }
    return {
      ok: true,
      book: { code: book.code, canonical: book.canonical, abbrev: book.abbrev },
      segments: [{ book: book.code, startChapter: null, startVerse: null, endChapter: null, endVerse: null }],
      raw,
    }
  }

  const book = resolveBook(m[1])
  if (!book) {
    return {
      ok: false,
      error: { code: 'ismeretlen-konyv', message: `Nem azonosítható bibliai könyv: „${m[1].trim()}”.`, raw },
    }
  }

  const mags = parseRefPart(m[2])
  if (!mags) {
    return {
      ok: false,
      error: {
        code: 'ertelmezhetetlen',
        message: `Nem értelmezhető igehely: „${raw}”. Példák a helyes alakra: Jn 3,16 · Zsolt 23,1-4 · Mt 13,53-14,12 · Lk 1,26-38.46-55`,
        raw,
      },
    }
  }

  return {
    ok: true,
    book: { code: book.code, canonical: book.canonical, abbrev: book.abbrev },
    segments: mags.map((s) => ({ book: book.code, ...s })),
    raw,
  }
}

/**
 * Több hivatkozás egy szövegben, ';' vagy sortörés elválasztóval
 * ('Jn 3,16; Zsolt 23' → két eredmény). A hibás darabok hibaként jönnek vissza.
 */
export function parseMultiReference(input: string): ParseReferenceResult[] {
  return input
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseReference)
}
