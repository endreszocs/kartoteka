/**
 * Bibliai könyvek katalógusa + magyar könyvnév-feloldó.
 *
 * A DicsHub testvérprojekt (HungarianChurchFlow src/lib/bible.ts) engedékeny
 * alias-listájának és feloldó-létrájának portja, két bővítéssel:
 *   - `abbrev`: kanonikus magyar rövidítés a formázott kimenethez ('Mt', 'Zsolt', '1Móz'),
 *   - ékezet-lenyelő fallback: 'zsoltarok', 'ezsaias' stb. ékezet nélkül is feloldódik.
 *
 * A `code` a karoli.json kulcsaival azonos 3 betűs USFM-szerű kód (GEN … REV).
 */

export interface BibliaKonyv {
  /** Kanonikus 3 betűs kód — a karoli.json és a verse-counts.json kulcsa (pl. 'GEN'). */
  code: string
  /** Teljes magyar név (megjelenítéshez, pl. 'Mózes első könyve'). */
  canonical: string
  /** Kanonikus magyar rövidítés (formatReference használja, pl. '1Móz', 'Mt'). */
  abbrev: string
  aliases: string[]
}

export const KONYVEK: BibliaKonyv[] = [
  // ÓSZÖVETSÉG
  { code: 'GEN', canonical: 'Mózes első könyve', abbrev: '1Móz', aliases: ['mózes 1', '1 mózes', '1móz', '1móz.', 'i. mózes', 'i mózes', 'imóz', 'gen', 'genezis', 'ter', 'teremtés'] },
  { code: 'EXO', canonical: 'Mózes második könyve', abbrev: '2Móz', aliases: ['mózes 2', '2 mózes', '2móz', 'ii. mózes', 'ii mózes', 'iimóz', 'exo', 'exodus', 'kiv', 'kivonulás'] },
  { code: 'LEV', canonical: 'Mózes harmadik könyve', abbrev: '3Móz', aliases: ['mózes 3', '3 mózes', '3móz', 'iii mózes', 'iiimóz', 'lev', 'leviták', 'leviticus'] },
  { code: 'NUM', canonical: 'Mózes negyedik könyve', abbrev: '4Móz', aliases: ['mózes 4', '4 mózes', '4móz', 'num', 'számok', 'szám', 'numeri'] },
  { code: 'DEU', canonical: 'Mózes ötödik könyve', abbrev: '5Móz', aliases: ['mózes 5', '5 mózes', '5móz', 'mtörv', 'deut', 'deu', 'deuteronomium', 'második törvénykönyv'] },
  { code: 'JOS', canonical: 'Józsué', abbrev: 'Józs', aliases: ['józsué', 'józs', 'jos'] },
  { code: 'JDG', canonical: 'Bírák', abbrev: 'Bír', aliases: ['bírák', 'bír', 'birak', 'bírák könyve', 'jdg'] },
  { code: 'RUT', canonical: 'Ruth', abbrev: 'Ruth', aliases: ['ruth', 'rút', 'rúth', 'rut'] },
  { code: '1SA', canonical: 'Sámuel első könyve', abbrev: '1Sám', aliases: ['1sám', '1 sám', '1 sámuel', 'i sám', 'isam', '1sam'] },
  { code: '2SA', canonical: 'Sámuel második könyve', abbrev: '2Sám', aliases: ['2sám', '2 sám', '2 sámuel', 'ii sám', '2sam'] },
  { code: '1KI', canonical: 'Királyok első könyve', abbrev: '1Kir', aliases: ['1kir', '1 kir', '1 királyok', 'i kir', '1ki'] },
  { code: '2KI', canonical: 'Királyok második könyve', abbrev: '2Kir', aliases: ['2kir', '2 kir', '2 királyok', 'ii kir', '2ki'] },
  { code: '1CH', canonical: 'Krónikák első könyve', abbrev: '1Krón', aliases: ['1krón', '1 krón', '1 krónikák', '1 krónika', '1ch'] },
  { code: '2CH', canonical: 'Krónikák második könyve', abbrev: '2Krón', aliases: ['2krón', '2 krón', '2 krónikák', '2 krónika', '2ch'] },
  { code: 'EZR', canonical: 'Ezsdrás', abbrev: 'Ezsd', aliases: ['ezsdrás', 'ezsd', 'ezr', 'ezd', 'ezdrás'] },
  { code: 'NEH', canonical: 'Nehémiás', abbrev: 'Neh', aliases: ['nehémiás', 'neh', 'néh'] },
  { code: 'EST', canonical: 'Eszter', abbrev: 'Eszt', aliases: ['eszter', 'eszt', 'est'] },
  { code: 'JOB', canonical: 'Jób', abbrev: 'Jób', aliases: ['jób', 'job'] },
  { code: 'PSA', canonical: 'Zsoltárok', abbrev: 'Zsolt', aliases: ['zsoltárok', 'zsoltár', 'zsolt', 'zsolt.', 'zs', 'zs.', 'psa', 'ps'] },
  { code: 'PRO', canonical: 'Példabeszédek', abbrev: 'Péld', aliases: ['példabeszédek', 'példab', 'péld', 'pro', 'prov'] },
  { code: 'ECC', canonical: 'Prédikátor', abbrev: 'Préd', aliases: ['prédikátor', 'préd', 'ecc', 'pred', 'koh', 'kohelet'] },
  { code: 'SNG', canonical: 'Énekek éneke', abbrev: 'Énekek', aliases: ['énekek éneke', 'énekek', 'én.', 'én', 'sng', 'éé'] },
  { code: 'ISA', canonical: 'Ézsaiás', abbrev: 'Ézs', aliases: ['ézsaiás', 'ézs', 'ésaiás', 'ésa', 'isa', 'is', 'iz', 'izajás', 'ezsaias', 'esaias'] },
  { code: 'JER', canonical: 'Jeremiás', abbrev: 'Jer', aliases: ['jeremiás', 'jer'] },
  { code: 'LAM', canonical: 'Jeremiás siralmai', abbrev: 'JSir', aliases: ['siralmak', 'jsir', 'lam', 'siralmak könyve', 'jeremiás siralmai'] },
  { code: 'EZK', canonical: 'Ezékiel', abbrev: 'Ez', aliases: ['ezékiel', 'ezék', 'ez.', 'ez', 'ezk', 'ezekiel'] },
  { code: 'DAN', canonical: 'Dániel', abbrev: 'Dán', aliases: ['dániel', 'dán', 'dan'] },
  { code: 'HOS', canonical: 'Hóseás', abbrev: 'Hós', aliases: ['hóseás', 'hós', 'hos', 'oz', 'ozeás'] },
  { code: 'JOL', canonical: 'Jóel', abbrev: 'Jóel', aliases: ['jóel', 'jól', 'jol', 'joel'] },
  { code: 'AMO', canonical: 'Ámósz', abbrev: 'Ám', aliases: ['ámósz', 'ámós', 'ámosz', 'amosz', 'ám', 'am', 'amo', 'amos'] },
  { code: 'OBA', canonical: 'Abdiás', abbrev: 'Abd', aliases: ['abdiás', 'abd', 'oba'] },
  { code: 'JON', canonical: 'Jónás', abbrev: 'Jón', aliases: ['jónás', 'jón', 'jon'] },
  { code: 'MIC', canonical: 'Mikeás', abbrev: 'Mik', aliases: ['mikeás', 'mik', 'mic'] },
  { code: 'NAM', canonical: 'Náhum', abbrev: 'Náh', aliases: ['náhum', 'náh', 'nam', 'nah'] },
  { code: 'HAB', canonical: 'Habakuk', abbrev: 'Hab', aliases: ['habakuk', 'hab'] },
  { code: 'ZEP', canonical: 'Sofóniás', abbrev: 'Sof', aliases: ['sofóniás', 'zofóniás', 'szofóniás', 'sof', 'zof', 'szof', 'zep'] },
  { code: 'HAG', canonical: 'Haggeus', abbrev: 'Hag', aliases: ['haggeus', 'aggeus', 'agg', 'ag', 'hag'] },
  { code: 'ZEC', canonical: 'Zakariás', abbrev: 'Zak', aliases: ['zakariás', 'zak', 'zec'] },
  { code: 'MAL', canonical: 'Malakiás', abbrev: 'Mal', aliases: ['malakiás', 'mal'] },
  // ÚJSZÖVETSÉG
  { code: 'MAT', canonical: 'Máté', abbrev: 'Mt', aliases: ['máté', 'mt', 'mát', 'mat', 'máté evangéliuma'] },
  { code: 'MRK', canonical: 'Márk', abbrev: 'Mk', aliases: ['márk', 'mk', 'mrk', 'mar', 'márk evangéliuma'] },
  { code: 'LUK', canonical: 'Lukács', abbrev: 'Lk', aliases: ['lukács', 'lk', 'luk', 'luc', 'lukács evangéliuma'] },
  { code: 'JHN', canonical: 'János', abbrev: 'Jn', aliases: ['jános', 'jn', 'jhn', 'ján', 'jános evangéliuma', 'jn evangéliuma'] },
  { code: 'ACT', canonical: 'Apostolok cselekedetei', abbrev: 'ApCsel', aliases: ['apostolok cselekedetei', 'apcsel', 'csel', 'act', 'cselekedetek'] },
  { code: 'ROM', canonical: 'Rómaiakhoz', abbrev: 'Róm', aliases: ['rómaiakhoz', 'róm', 'rom', 'rómaiak', 'római levél'] },
  { code: '1CO', canonical: 'Korinthusiakhoz I.', abbrev: '1Kor', aliases: ['1kor', '1 kor', '1 korinthus', '1 korintus', 'i kor', '1co', 'i korinthus', '1k'] },
  { code: '2CO', canonical: 'Korinthusiakhoz II.', abbrev: '2Kor', aliases: ['2kor', '2 kor', '2 korinthus', '2 korintus', 'ii kor', '2co', 'ii korinthus', '2k'] },
  { code: 'GAL', canonical: 'Galatákhoz', abbrev: 'Gal', aliases: ['galatákhoz', 'gal', 'galata'] },
  { code: 'EPH', canonical: 'Efézusiakhoz', abbrev: 'Ef', aliases: ['efézusiakhoz', 'ef', 'eph', 'efezus', 'efézus'] },
  { code: 'PHP', canonical: 'Filippiekhez', abbrev: 'Fil', aliases: ['filippiekhez', 'fil', 'flp', 'php', 'filippi'] },
  { code: 'COL', canonical: 'Kolosséaikhoz', abbrev: 'Kol', aliases: ['kolosséaikhoz', 'kolosséhoz', 'kolosszé', 'kolosszeiekhez', 'kol', 'col'] },
  { code: '1TH', canonical: 'Thesszalonikaiakhoz I.', abbrev: '1Thessz', aliases: ['1tessz', '1 tessz', '1 tesz', '1thessz', '1th', '1 th', '1thess', 'i tessz'] },
  { code: '2TH', canonical: 'Thesszalonikaiakhoz II.', abbrev: '2Thessz', aliases: ['2tessz', '2 tessz', '2 tesz', '2thessz', '2th', '2 th', '2thess', 'ii tessz'] },
  { code: '1TI', canonical: 'Timóteushoz I.', abbrev: '1Tim', aliases: ['1tim', '1 tim', '1 timóteus', '1ti', 'i tim'] },
  { code: '2TI', canonical: 'Timóteushoz II.', abbrev: '2Tim', aliases: ['2tim', '2 tim', '2 timóteus', '2ti', 'ii tim'] },
  { code: 'TIT', canonical: 'Tituszhoz', abbrev: 'Tit', aliases: ['titusz', 'tit'] },
  { code: 'PHM', canonical: 'Filemonhoz', abbrev: 'Filem', aliases: ['filemon', 'filem', 'flm', 'phm'] },
  { code: 'HEB', canonical: 'Zsidókhoz', abbrev: 'Zsid', aliases: ['zsidókhoz', 'zsid', 'heb', 'zsidók', 'zsidó levél'] },
  { code: 'JAS', canonical: 'Jakab', abbrev: 'Jak', aliases: ['jakab', 'jak', 'jas'] },
  { code: '1PE', canonical: 'Péter I.', abbrev: '1Pt', aliases: ['1pét', '1 pét', '1péter', '1 péter', '1pe', '1pt', '1 pt', 'i pét'] },
  { code: '2PE', canonical: 'Péter II.', abbrev: '2Pt', aliases: ['2pét', '2 pét', '2péter', '2 péter', '2pe', '2pt', '2 pt', 'ii pét'] },
  { code: '1JN', canonical: 'János I.', abbrev: '1Jn', aliases: ['1jn', '1 jn', '1ján', '1 ján', '1 jános', 'i jn'] },
  { code: '2JN', canonical: 'János II.', abbrev: '2Jn', aliases: ['2jn', '2 jn', '2ján', '2 jános', 'ii jn'] },
  { code: '3JN', canonical: 'János III.', abbrev: '3Jn', aliases: ['3jn', '3 jn', '3ján', '3 jános', 'iii jn'] },
  { code: 'JUD', canonical: 'Júdás', abbrev: 'Júd', aliases: ['júdás', 'júd', 'jud', 'júdás levele'] },
  { code: 'REV', canonical: 'Jelenések', abbrev: 'Jel', aliases: ['jelenések', 'jelenések könyve', 'jel', 'rev', 'apok', 'apokalipszis'] },
]

/** Könyvkódok kanonikus (protestáns) sorrendben — a verse-counts.json `order`-ével azonos. */
export const KONYV_SORREND: string[] = KONYVEK.map((k) => k.code)

const KONYV_BY_CODE: Record<string, BibliaKonyv> = Object.fromEntries(
  KONYVEK.map((k) => [k.code, k] as const),
)

export function getBook(code: string): BibliaKonyv | null {
  return KONYV_BY_CODE[code] ?? null
}

/** Ékezet-lenyelés: 'ézsaiás' → 'ezsaias' (a magyar ékezetes betűk alapbetűre). */
function foldAccents(s: string): string {
  return s
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/í/g, 'i')
    .replace(/[óöő]/g, 'o')
    .replace(/[úüű]/g, 'u')
}

export function normalizeBookName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\./g, '') // pontok el ("Jn." → "jn", "I. Móz" → "i móz")
    .replace(/\s+/g, ' ') // whitespace össze
    .replace(/^iii\s+/, '3 ') // római → arab
    .replace(/^ii\s+/, '2 ')
    .replace(/^i\s+/, '1 ')
    .replace(/^iii(?=[a-záéíóöőúüű])/, '3 ') // tapadt római: "iiikor" → "3 kor"
    .replace(/^ii(?=[a-záéíóöőúüű])/, '2 ') // (az 1-es tapadt római NEM biztonságos: 'isa', 'izajás')
    .replace(/^(\d+)\.?\s+/, '$1 ') // "1. mózes" → "1 mózes"
    .replace(/^(\d)(?=[a-záéíóöőúüű])/, '$1 ') // tapadt szám: "1móz" → "1 móz"
    .replace(/\s+(ev|evang|evangéliuma|könyve|levele|levél|próféta)$/, '') // sallangok le
    .trim()
}

/** Lapos alias-térkép a gyors kereséshez — a kulcsok normalizált ÉS ékezet-lenyelt alakban is bekerülnek. */
const ALIAS_MAP: Record<string, BibliaKonyv> = (() => {
  const out: Record<string, BibliaKonyv> = {}
  const add = (key: string, book: BibliaKonyv) => {
    if (!key) return
    if (!(key in out)) out[key] = book
    const folded = foldAccents(key)
    if (!(folded in out)) out[folded] = book
  }
  for (const b of KONYVEK) {
    add(normalizeBookName(b.canonical), b)
    add(normalizeBookName(b.abbrev), b)
    add(b.code.toLowerCase(), b)
    for (const a of b.aliases) add(normalizeBookName(a), b)
  }
  return out
})()

function aliasHit(key: string): BibliaKonyv | undefined {
  return ALIAS_MAP[key] ?? ALIAS_MAP[foldAccents(key)]
}

/**
 * Feloldó-létra (a DicsHub lookupBook portja): pontos egyezés → szóköz nélküli →
 * vezető tokenek → kanonikus névre kezdet-egyezés. Mindegyik szint ékezet-toleráns.
 */
function lookupBook(normalized: string): BibliaKonyv | null {
  if (!normalized) return null
  let hit = aliasHit(normalized) ?? aliasHit(normalized.replace(/\s/g, ''))
  if (!hit) {
    const parts = normalized.split(' ')
    for (let len = parts.length; len > 0 && !hit; len--) {
      const candidate = parts.slice(0, len).join(' ')
      hit = aliasHit(candidate) ?? aliasHit(candidate.replace(/\s/g, ''))
    }
  }
  if (!hit) {
    const lower = foldAccents(normalized.replace(/\s/g, ''))
    for (const b of KONYVEK) {
      const cn = foldAccents(b.canonical.toLowerCase().replace(/\s/g, ''))
      if (cn.startsWith(lower) || lower.startsWith(cn)) {
        hit = b
        break
      }
    }
  }
  return hit ?? null
}

/**
 * Magyar könyvnév/alias → kanonikus könyv ('1móz', 'I. Móz', 'Gen' → GEN).
 * Ékezet- és írásmód-toleráns; null, ha nem azonosítható.
 */
export function resolveBook(input: string): BibliaKonyv | null {
  return lookupBook(normalizeBookName(input))
}
