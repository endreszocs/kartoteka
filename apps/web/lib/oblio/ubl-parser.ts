/**
 * UBL 2.1 (e-Factura / RO_CIUS) számla-XML kinyerő — SZERVER-OLDALI, tiszta lib.
 *
 * MIÉRT KÜLÖN A packages/ui-app-BELI PARSERTŐL:
 *  - A böngészős parser (packages/ui-app/src/finance/oblio/ubl-parser.ts) a
 *    natív DOMParser-re épül, ami Node-ban NINCS — server actionből nem hívható.
 *  - A 7. pont B szelet (szállítói számla adatalap) szerveroldalon dolgozza fel
 *    a ZIP-ből kibontott XML-eket, ezért kell egy ui-app-tól FÜGGETLEN,
 *    importmentes, tiszta függvényként tesztelhető változat.
 *
 * MIÉRT NEM ÚJ FÜGGŐSÉG (fast-xml-parser): mindössze ~8 mezőt olvasunk egy
 * jól formázott, ANAF által validált XML-ből — ehhez egy kis, saját,
 * REGULÁRIS-KIFEJEZÉS-MENTES tokenizáló elég (karakterenkénti szkennelés).
 * Egyéni DTD-entitásokat SOHA nem dolgozunk fel (entitás-bomba ellen a
 * DOCTYPE blokkot csak átlépjük), és a mélység/méret is korlátos.
 *
 * A parse SOHA nem dob kivételt — hiba esetén a `parseError` mező magyarul
 * mondja el, mi történt (fail-closed: a hívó dönti el, mit kezd vele).
 *
 * Önteszt: scripts/selftest-ubl-parser.mjs  (npm run selftest:ubl-parser)
 */

// ─────────────────────────────────────────────────────────────────
// Kimeneti típus — a szallitoi_szamla tábla mezőihez igazítva
// (migration-docs/sql/2026-08-15-szallitoi-szamlak.sql)
// ─────────────────────────────────────────────────────────────────

export interface UblSzamlaMeta {
  /** Az XML gyökere: Invoice = számla, CreditNote = jóváíró. */
  tipus: 'szamla' | 'jovairo' | 'ismeretlen'
  /** A gyökér-elem neve — az 'ismeretlen' típus osztályozásához (pl. a
   *  Signature-gyökerű ANAF aláírás-fájl nem hiba, hanem kísérő fájl). */
  gyokerNev: string | null
  /** Számlaszám (a gyökér-szintű cbc:ID). */
  szamlaszam: string | null
  /** Kiállítás dátuma (YYYY-MM-DD). */
  kiallitasDatum: string | null
  /** Fizetési határidő (YYYY-MM-DD) — nem minden számlán van. */
  fizetesiHatarido: string | null
  /** Devizanem (RON / EUR / ...). */
  penznem: string | null
  /** ANAF SPV egyedi azonosító — cbc:UUID, ennek híján a fallback (fájlnév). */
  anafUuid: string | null
  /** Beszállító neve (PartyName/Name, ennek híján RegistrationName). */
  szallitoNev: string | null
  /** Beszállító CUI/CIF (PartyTaxScheme → PartyLegalEntity → PartyIdentification). */
  szallitoCui: string | null
  /** Vevő (a gyülekezet) neve — ellenőrzéshez. */
  vevoNev: string | null
  /** Vevő CUI — ellenőrzéshez. */
  vevoCui: string | null
  /** Bruttó végösszeg (PayableAmount, ennek híján TaxInclusiveAmount). */
  vegosszeg: number | null
  /** Hiba esetén magyar üzenet — ilyenkor a többi mező részleges lehet. */
  parseError: string | null
}

// ─────────────────────────────────────────────────────────────────
// Mini XML-fa — csak ami a kinyeréshez kell (localName + gyerekek + szöveg)
// ─────────────────────────────────────────────────────────────────

type XmlElem = {
  /** localName — a namespace-prefix (cbc:/cac:) levágva. */
  nev: string
  gyerekek: XmlElem[]
  /** A közvetlen szöveg-tartalom (entitás-dekódolva). */
  szoveg: string
}

/** Belső, szándékosan elkapott hibatípus — a parseUblSzamla fordítja üzenetté. */
class XmlHiba extends Error {}

const MAX_XML_MERET = 20 * 1024 * 1024 // egy valós e-Factura XML < 1 MB — e fölött valami nagyon nem stimmel
const MAX_MELYSEG = 64

function whitespace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

/** A namespace-prefix levágása: 'cbc:ID' → 'ID'. */
function lokalisNev(teljes: string): string {
  const idx = teljes.lastIndexOf(':')
  return idx === -1 ? teljes : teljes.slice(idx + 1)
}

/** Szigorú egész-parse (10-es vagy 16-os alap) — reguláris kifejezés nélkül. */
function parseSzamSzigoru(s: string, alap: 10 | 16): number | null {
  if (s.length === 0 || s.length > 7) return null
  let ertek = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    let jegy: number
    if (c >= '0' && c <= '9') jegy = c.charCodeAt(0) - 48
    else if (alap === 16 && c >= 'a' && c <= 'f') jegy = c.charCodeAt(0) - 87
    else if (alap === 16 && c >= 'A' && c <= 'F') jegy = c.charCodeAt(0) - 55
    else return null
    ertek = ertek * alap + jegy
  }
  return ertek
}

/**
 * A standard XML-entitások + numerikus karakter-hivatkozások dekódolása.
 * Ismeretlen entitást LITERÁLISAN hagyunk (nem dobunk) — egyéni DTD-entitást
 * szándékosan nem oldunk fel (entitás-bomba ellen).
 */
function dekodolEntitasok(s: string): string {
  if (s.indexOf('&') === -1) return s
  let ki = ''
  let i = 0
  while (i < s.length) {
    const amp = s.indexOf('&', i)
    if (amp === -1) {
      ki += s.slice(i)
      break
    }
    ki += s.slice(i, amp)
    const pv = s.indexOf(';', amp + 1)
    // entitás-név max ~10 karakter — ennél hosszabb "entitás" nem az
    if (pv === -1 || pv - amp > 12) {
      ki += '&'
      i = amp + 1
      continue
    }
    const ent = s.slice(amp + 1, pv)
    let dekodolt: string | null = null
    if (ent === 'amp') dekodolt = '&'
    else if (ent === 'lt') dekodolt = '<'
    else if (ent === 'gt') dekodolt = '>'
    else if (ent === 'quot') dekodolt = '"'
    else if (ent === 'apos') dekodolt = "'"
    else if (ent.length > 1 && ent[0] === '#') {
      const kodpont =
        ent[1] === 'x' || ent[1] === 'X'
          ? parseSzamSzigoru(ent.slice(2), 16)
          : parseSzamSzigoru(ent.slice(1), 10)
      if (kodpont !== null && kodpont > 0 && kodpont <= 0x10ffff) {
        try {
          dekodolt = String.fromCodePoint(kodpont)
        } catch {
          dekodolt = null
        }
      }
    }
    if (dekodolt !== null) {
      ki += dekodolt
      i = pv + 1
    } else {
      // ismeretlen entitás — literálisan hagyjuk, a szöveg többi része él
      ki += '&'
      i = amp + 1
    }
  }
  return ki
}

/**
 * A teljes XML-t fává parsolja. Attribútumokat nem tárolunk (nem kellenek a
 * kinyert mezőkhöz), de idézőjel-tudatosan lépünk át rajtuk — az
 * attribútum-értékben lévő '>' nem zavarhatja meg a szkennelést.
 *
 * Hibás (nem well-formed) bemenetre XmlHiba-t dob — a hívó elkapja.
 */
function parseXmlFa(xml: string): XmlElem {
  let i = 0
  const n = xml.length
  // UTF-8 BOM átlépése
  if (n > 0 && xml.charCodeAt(0) === 0xfeff) i = 1

  const gyoker: XmlElem = { nev: '#gyoker', gyerekek: [], szoveg: '' }
  const verem: XmlElem[] = [gyoker]

  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      // a gyökér-elem utáni farok — csak whitespace lehet, mást eltűrünk némán? NEM:
      const farok = xml.slice(i)
      for (let k = 0; k < farok.length; k++) {
        if (!whitespace(farok[k]) && verem.length > 1) {
          throw new XmlHiba('szöveg a lezáratlan elemek után')
        }
      }
      break
    }
    if (lt > i) {
      const akt = verem[verem.length - 1]
      if (akt !== gyoker) akt.szoveg += dekodolEntitasok(xml.slice(i, lt))
      i = lt
    }

    if (xml.startsWith('<!--', i)) {
      const vege = xml.indexOf('-->', i + 4)
      if (vege === -1) throw new XmlHiba('lezáratlan komment')
      i = vege + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const vege = xml.indexOf(']]>', i + 9)
      if (vege === -1) throw new XmlHiba('lezáratlan CDATA-szakasz')
      const akt = verem[verem.length - 1]
      // CDATA-ban nincs entitás-dekódolás — a tartalom szó szerinti
      if (akt !== gyoker) akt.szoveg += xml.slice(i + 9, vege)
      i = vege + 3
      continue
    }
    if (xml.startsWith('<?', i)) {
      const vege = xml.indexOf('?>', i + 2)
      if (vege === -1) throw new XmlHiba('lezáratlan feldolgozási utasítás (<?...?>)')
      i = vege + 2
      continue
    }
    if (xml.startsWith('<!', i)) {
      // DOCTYPE (belső subsettel együtt) — csak átlépjük, entitás-definíciókat
      // SZÁNDÉKOSAN nem dolgozunk fel (entitás-bomba ellen).
      let szogletes = 0
      let idezo: string | null = null
      let j = i + 2
      for (; j < n; j++) {
        const c = xml[j]
        if (idezo) {
          if (c === idezo) idezo = null
          continue
        }
        if (c === '"' || c === "'") idezo = c
        else if (c === '[') szogletes++
        else if (c === ']') szogletes--
        else if (c === '>' && szogletes <= 0) break
      }
      if (j >= n) throw new XmlHiba('lezáratlan DOCTYPE-deklaráció')
      i = j + 1
      continue
    }
    if (xml.startsWith('</', i)) {
      const vege = xml.indexOf('>', i + 2)
      if (vege === -1) throw new XmlHiba('lezáratlan záró-tag')
      const teljesNev = xml.slice(i + 2, vege).trim()
      const lokalis = lokalisNev(teljesNev)
      const akt = verem[verem.length - 1]
      if (akt === gyoker || akt.nev !== lokalis) {
        throw new XmlHiba(`tag-párosítási hiba: </${teljesNev}> váratlan helyen`)
      }
      verem.pop()
      i = vege + 1
      continue
    }

    // Nyitó tag: '<' + név [+ attribútumok] + '>' vagy '/>'
    {
      let j = i + 1
      let idezo: string | null = null
      for (; j < n; j++) {
        const c = xml[j]
        if (idezo) {
          if (c === idezo) idezo = null
          continue
        }
        if (c === '"' || c === "'") idezo = c
        else if (c === '>') break
      }
      if (j >= n) throw new XmlHiba('lezáratlan nyitó-tag')
      const onzaro = xml[j - 1] === '/'
      const belso = xml.slice(i + 1, onzaro ? j - 1 : j)
      let nevVege = 0
      while (nevVege < belso.length && !whitespace(belso[nevVege])) nevVege++
      const teljesNev = belso.slice(0, nevVege)
      if (!teljesNev) throw new XmlHiba('üres tag-név')
      const elem: XmlElem = { nev: lokalisNev(teljesNev), gyerekek: [], szoveg: '' }
      verem[verem.length - 1].gyerekek.push(elem)
      if (!onzaro) {
        verem.push(elem)
        if (verem.length > MAX_MELYSEG) throw new XmlHiba('túl mélyen egymásba ágyazott XML')
      }
      i = j + 1
    }
  }

  if (verem.length !== 1) {
    throw new XmlHiba(`lezáratlan elem: <${verem[verem.length - 1].nev}>`)
  }
  if (gyoker.gyerekek.length === 0) throw new XmlHiba('nincs gyökér-elem az XML-ben')
  if (gyoker.gyerekek.length > 1) throw new XmlHiba('több gyökér-elem — nem well-formed XML')
  return gyoker.gyerekek[0]
}

// ─────────────────────────────────────────────────────────────────
// Fa-lekérdező segédek (a böngészős parser findFirst-mintájára)
// ─────────────────────────────────────────────────────────────────

/** Az első elem a részfában (mélységi bejárás) adott localName-mel. */
function elsoElem(e: XmlElem, nev: string): XmlElem | null {
  for (const gy of e.gyerekek) {
    if (gy.nev === nev) return gy
    const talalat = elsoElem(gy, nev)
    if (talalat) return talalat
  }
  return null
}

function szovege(e: XmlElem | null): string | null {
  if (!e) return null
  const t = e.szoveg.trim()
  return t.length > 0 ? t : null
}

function szamErtek(e: XmlElem | null): number | null {
  const t = szovege(e)
  if (!t) return null
  // UBL: tizedespont; néhány kiállító vesszőt ír — az elsőt pontra cseréljük
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** YYYY-MM-DD alak ellenőrzése karakterenként (időzóna-farok levágva). */
function normalizalDatum(s: string | null): string | null {
  if (!s) return null
  const t = s.trim()
  if (t.length < 10) return null
  const d = t.slice(0, 10)
  for (let i = 0; i < 10; i++) {
    const c = d[i]
    if (i === 4 || i === 7) {
      if (c !== '-') return null
    } else if (c < '0' || c > '9') {
      return null
    }
  }
  return d
}

// ─────────────────────────────────────────────────────────────────
// A fő kinyerő függvény
// ─────────────────────────────────────────────────────────────────

/**
 * Egy UBL 2.1 (Invoice/CreditNote) XML-ből kinyeri a szállítói számla
 * adatalapjához szükséges mezőket. SOHA nem dob kivételt — hibánál a
 * parseError mező magyarul jelez.
 */
export function parseUblSzamla(xmlText: string, fallbackUuid?: string | null): UblSzamlaMeta {
  const meta: UblSzamlaMeta = {
    tipus: 'ismeretlen',
    gyokerNev: null,
    szamlaszam: null,
    kiallitasDatum: null,
    fizetesiHatarido: null,
    penznem: null,
    anafUuid: fallbackUuid || null,
    szallitoNev: null,
    szallitoCui: null,
    vevoNev: null,
    vevoCui: null,
    vegosszeg: null,
    parseError: null,
  }

  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    meta.parseError = 'Üres XML-tartalom.'
    return meta
  }
  if (xmlText.length > MAX_XML_MERET) {
    meta.parseError = 'Az XML gyanúsan nagy (20 MB felett) — ez nem e-Factura számla.'
    return meta
  }

  let root: XmlElem
  try {
    root = parseXmlFa(xmlText)
  } catch (e) {
    meta.parseError = `XML-hiba: ${e instanceof XmlHiba ? e.message : e instanceof Error ? e.message : String(e)}`
    return meta
  }

  // ─── Dokumentum-típus ───
  meta.gyokerNev = root.nev || null
  if (root.nev === 'Invoice') meta.tipus = 'szamla'
  else if (root.nev === 'CreditNote') meta.tipus = 'jovairo'

  // ─── Gyökér-szintű mezők (a böngészős parser sorrendjében) ───
  for (const gy of root.gyerekek) {
    if (gy.nev === 'ID' && !meta.szamlaszam) meta.szamlaszam = szovege(gy)
    else if (gy.nev === 'IssueDate') meta.kiallitasDatum = normalizalDatum(szovege(gy))
    else if (gy.nev === 'DueDate') meta.fizetesiHatarido = normalizalDatum(szovege(gy))
    else if (gy.nev === 'DocumentCurrencyCode') meta.penznem = szovege(gy)
    else if (gy.nev === 'UUID') meta.anafUuid = szovege(gy) || meta.anafUuid
  }

  // ─── Beszállító ───
  const szallitoParty = elsoElem(root, 'AccountingSupplierParty')
  if (szallitoParty) {
    const party = elsoElem(szallitoParty, 'Party')
    if (party) {
      const partyName = elsoElem(party, 'PartyName')
      if (partyName) meta.szallitoNev = szovege(elsoElem(partyName, 'Name'))
      if (!meta.szallitoNev) {
        const legal = elsoElem(party, 'PartyLegalEntity')
        if (legal) meta.szallitoNev = szovege(elsoElem(legal, 'RegistrationName'))
      }

      const taxScheme = elsoElem(party, 'PartyTaxScheme')
      if (taxScheme) meta.szallitoCui = szovege(elsoElem(taxScheme, 'CompanyID'))
      if (!meta.szallitoCui) {
        const legal = elsoElem(party, 'PartyLegalEntity')
        if (legal) meta.szallitoCui = szovege(elsoElem(legal, 'CompanyID'))
      }
      if (!meta.szallitoCui) {
        const ident = elsoElem(party, 'PartyIdentification')
        if (ident) meta.szallitoCui = szovege(elsoElem(ident, 'ID'))
      }
    }
  }

  // ─── Vevő (a gyülekezet — ellenőrzéshez) ───
  const vevoParty = elsoElem(root, 'AccountingCustomerParty')
  if (vevoParty) {
    const party = elsoElem(vevoParty, 'Party')
    if (party) {
      const partyName = elsoElem(party, 'PartyName')
      if (partyName) meta.vevoNev = szovege(elsoElem(partyName, 'Name'))
      if (!meta.vevoNev) {
        const legal = elsoElem(party, 'PartyLegalEntity')
        if (legal) meta.vevoNev = szovege(elsoElem(legal, 'RegistrationName'))
      }
      const taxScheme = elsoElem(party, 'PartyTaxScheme')
      if (taxScheme) meta.vevoCui = szovege(elsoElem(taxScheme, 'CompanyID'))
      if (!meta.vevoCui) {
        const legal = elsoElem(party, 'PartyLegalEntity')
        if (legal) meta.vevoCui = szovege(elsoElem(legal, 'CompanyID'))
      }
    }
  }

  // ─── Bruttó végösszeg ───
  const osszesito = elsoElem(root, 'LegalMonetaryTotal')
  if (osszesito) {
    meta.vegosszeg =
      szamErtek(elsoElem(osszesito, 'PayableAmount')) ??
      szamErtek(elsoElem(osszesito, 'TaxInclusiveAmount'))
  }

  return meta
}

// ─────────────────────────────────────────────────────────────────
// Fájlnév-segédek (a böngészős parserrel azonos szemantika, regex nélkül)
// ─────────────────────────────────────────────────────────────────

/**
 * 2026-08-28 (Endre hibajelzése, élesben elsült): az ANAF SPV tömeges ZIP-je
 * (Documente_*.zip) az aláírás-fájlokat `<CÉG>_<SOROZAT>_semnatura_<index>.xml`
 * néven adja — a `semnatura` a fájlnév KÖZEPÉN áll. A korábbi szűrők csak a
 * `semnatura_` KEZDETŰ nevet fogták, így 14 aláírás-fájl számlaként próbált
 * parszolódni, és a felület 14 piros hibát mutatott egy sikeres importra.
 * A token-minta a `semnatura` szót _ / - / . határolók közt fogja, a név
 * elején VAGY közepén — a hasonló, de más szavakat (semnificativ) nem.
 * KÖZÖS minta: a zip-kibonto és az oblio-folder is ezt importálja.
 */
export const SEMNATURA_TOKEN_RE = /(^|[_\-.])semnatura([_\-.]|$)/i

/**
 * Fájlnév-gyök: kiterjesztés(ek) levágva (akár .xml.zip halmozva), az ANAF
 * aláírás-prefix (semnatura_/semnatura-) eltávolítva, kisbetűsítve.
 * Ezzel párosítható az XML és a hozzá tartozó PDF.
 */
export function fajlnevGyoker(fajlnev: string): string {
  let alap = fajlnev
  let valtozott = true
  while (valtozott) {
    valtozott = false
    const kis = alap.toLowerCase()
    for (const kit of ['.zip', '.xml', '.pdf']) {
      if (kis.endsWith(kit)) {
        alap = alap.slice(0, alap.length - kit.length)
        valtozott = true
        break
      }
    }
  }
  let gyok = alap.trim().toLowerCase()
  if (gyok.startsWith('semnatura_') || gyok.startsWith('semnatura-')) {
    gyok = gyok.slice('semnatura_'.length)
  }
  return gyok
}

/**
 * ANAF UUID a fájlnévből: az ELSŐ legalább 8 jegyű szám-futam (a böngészős
 * extractAnafUuidFromFilename-nel azonos szemantika); ha nincs, maga a
 * fájlnév-alap a fallback (üresnél null).
 */
export function anafUuidFajlnevbol(fajlnev: string): string | null {
  let alap = fajlnev
  let valtozott = true
  while (valtozott) {
    valtozott = false
    const kis = alap.toLowerCase()
    for (const kit of ['.zip', '.xml', '.pdf']) {
      if (kis.endsWith(kit)) {
        alap = alap.slice(0, alap.length - kit.length)
        valtozott = true
        break
      }
    }
  }
  let futam = ''
  for (let i = 0; i <= alap.length; i++) {
    const c = i < alap.length ? alap[i] : ' '
    if (c >= '0' && c <= '9') {
      futam += c
    } else {
      if (futam.length >= 8) return futam
      futam = ''
    }
  }
  const trimmelt = alap.trim()
  return trimmelt.length > 0 ? trimmelt : null
}
