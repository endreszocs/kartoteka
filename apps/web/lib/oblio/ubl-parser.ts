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
  /** ANAF SPV egyedi azonosító — cbc:UUID, ennek híján a fájlnév 8+ jegyű
   *  szám-futama. Ha egyik sincs, `null`; a hívó ilyenkor a számla
   *  identitásából képez kulcsot (`azonositoSzamlaIdentitasbol`). */
  anafUuid: string | null
  /** Beszállító neve (PartyName/Name, ennek híján RegistrationName). */
  szallitoNev: string | null
  /** Beszállító CUI/CIF (PartyTaxScheme → PartyLegalEntity → PartyIdentification). */
  szallitoCui: string | null
  /** Vevő (a gyülekezet) neve — ellenőrzéshez. */
  vevoNev: string | null
  /** Vevő CUI — ellenőrzéshez. */
  vevoCui: string | null
  /** Bruttó végösszeg (PayableAmount, ennek híján TaxInclusiveAmount) — ELŐJELESEN. */
  vegosszeg: number | null
  /**
   * 2026-09-04 (valódi ANAF-exporton mérve): a sztornó/jóváírás által
   * hivatkozott EREDETI számla száma (cac:BillingReference/
   * cac:InvoiceDocumentReference/cbc:ID). A román gyakorlatban a sztornó
   * gyakran NEM CreditNote, hanem `InvoiceTypeCode 380`-as Invoice NEGATÍV
   * tételekkel + BillingReference-szel az eredetire.
   */
  hivatkozottSzamla: string | null
  /**
   * +1 = tartozás, −1 = jóváírás/sztornó. ⛔ A típus NEM csak a gyökér-elemből
   * dől el: egy negatív végösszegű `Invoice` is jóváírás. E nélkül a MIND
   * ELECTROSERV MSV2785 (−22 010, a MSV2763 előleg sztornója) +22 010-es
   * MÁSODIK tartozásként rögzült volna — az előjel elveszett.
   */
  elojel: 1 | -1
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
  /**
   * 2026-09-03 (faktúra-nyomtatás): az attribútumok, localName szerint
   * (`currencyID`, `unitCode`, `schemeID`). Eddig eldobtuk őket — a fejléc-
   * mezőkhöz nem kellettek. A SORTÉTELEKHEZ viszont igen: a mennyiség
   * mértékegysége (`unitCode`) és az összegek devizája (`currencyID`)
   * attribútum. Deviza-tudat nélkül egy EUR-tétel RON-ként jelenne meg a
   * nyomtatott íven — ez a hibaosztály az Oblio-láncban már megégetett minket.
   */
  attr: Record<string, string>
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
 * Attribútumok kiolvasása a nyitó-tag név utáni részéből: `a="x" b='y'`.
 * Idézőjel-tudatos, entitás-dekódolt; a namespace-prefixet (xmlns:cbc) a
 * névből levágjuk. Hibás alakot nem dob — amit nem ért, azt kihagyja
 * (egy hiányzó attribútum kevésbé fáj, mint egy eldobott egész számla).
 */
function parseAttributumok(resz: string): Record<string, string> {
  const ki: Record<string, string> = {}
  let i = 0
  const n = resz.length
  while (i < n) {
    while (i < n && whitespace(resz[i])) i++
    if (i >= n) break
    let nevVege = i
    while (nevVege < n && resz[nevVege] !== '=' && !whitespace(resz[nevVege])) nevVege++
    const nev = resz.slice(i, nevVege)
    i = nevVege
    while (i < n && whitespace(resz[i])) i++
    if (i >= n || resz[i] !== '=') continue // érték nélküli attribútum — kihagyjuk
    i++
    while (i < n && whitespace(resz[i])) i++
    if (i >= n) break
    const idezo = resz[i]
    if (idezo !== '"' && idezo !== "'") break
    const zaro = resz.indexOf(idezo, i + 1)
    if (zaro < 0) break
    if (nev && !nev.startsWith('xmlns')) ki[lokalisNev(nev)] = dekodolEntitasok(resz.slice(i + 1, zaro))
    i = zaro + 1
  }
  return ki
}

/**
 * A teljes XML-t fává parsolja. Az attribútumokat 2026-09-03-tól TÁROLJUK
 * (`attr`), idézőjel-tudatosan — az attribútum-értékben lévő '>' nem
 * zavarhatja meg a szkennelést.
 *
 * Hibás (nem well-formed) bemenetre XmlHiba-t dob — a hívó elkapja.
 */
function parseXmlFa(xml: string): XmlElem {
  let i = 0
  const n = xml.length
  // UTF-8 BOM átlépése
  if (n > 0 && xml.charCodeAt(0) === 0xfeff) i = 1

  const gyoker: XmlElem = { nev: '#gyoker', gyerekek: [], szoveg: '', attr: {} }
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
      const elem: XmlElem = {
        nev: lokalisNev(teljesNev),
        gyerekek: [],
        szoveg: '',
        attr: parseAttributumok(belso.slice(nevVege)),
      }
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

/**
 * KÖZVETLEN gyerek adott localName-mel (nem mélységi!). A sortételekhez ez
 * kell: az `elsoElem` mélységi keresője a `Price/PriceAmount`-ot és a
 * `LineExtensionAmount`-ot összekeverhetné, vagy egy al-elem `ID`-ját adná
 * a sor `ID`-ja helyett.
 */
function kozvetlen(e: XmlElem, nev: string): XmlElem | null {
  for (const gy of e.gyerekek) if (gy.nev === nev) return gy
  return null
}

/** MINDEN közvetlen gyerek adott localName-mel, sorrendben. */
function kozvetlenMind(e: XmlElem, nev: string): XmlElem[] {
  return e.gyerekek.filter((gy) => gy.nev === nev)
}

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
    hivatkozottSzamla: null,
    elojel: 1,
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

  // ─── Hivatkozott eredeti számla (sztornó / jóváírás) ───
  // KÖZVETLEN gyerek: a sor-szintű (InvoiceLine alatti) hivatkozásokat nem
  // keverjük ide — az a dokumentum-szintű „mit sztornóz" kérdés.
  for (const gy of root.gyerekek) {
    if (gy.nev !== 'BillingReference') continue
    const ref = kozvetlen(gy, 'InvoiceDocumentReference')
    const id = szovege(ref ? kozvetlen(ref, 'ID') : null)
    if (id) { meta.hivatkozottSzamla = id; break }
  }

  // ─── ELŐJEL-TUDATOS TÍPUS (2026-09-04, valódi ANAF-exporton mérve) ───
  // A román kiállítók a sztornót gyakran `InvoiceTypeCode 380`-as Invoice-ként
  // adják NEGATÍV tételekkel — a gyökér-elem tehát HAZUDIK a szerepről. Ha a
  // végösszeg negatív, az jóváírás, akárhogy hívják a gyökeret.
  if (meta.vegosszeg != null && meta.vegosszeg < 0) {
    meta.elojel = -1
    if (meta.tipus === 'szamla') meta.tipus = 'jovairo'
  }

  return meta
}

// ─────────────────────────────────────────────────────────────────
// RÉSZLETES KINYERÉS — a nyomtatható számla-adatlaphoz (2026-09-03)
// ─────────────────────────────────────────────────────────────────
//
// Endre kérése: a faktúra nyomtatási képe legyen az ANAF/Oblio-féle
// e-Factura-laphoz hasonló — sortételekkel, felekkel, ÁFA-bontással.
// A `szallitoi_szamla` tábla CSAK fejléc-szintű adatot tárol; a sortételek,
// a címek, az IBAN és az ÁFA-bontás KIZÁRÓLAG a tárolt e-Factura XML-ben
// vannak. Ez a függvény azokat nyeri ki — a lap betöltésekor, új tábla és
// séma-változtatás NÉLKÜL (az eredeti XML marad az egyetlen igazságforrás).
//
// ⛔ Az összegek mellett a DEVIZA is megy (`currencyID` attribútum): egy
//    EUR-számla tételei EUR-ban vannak, és úgy is kell kiírni őket.

/** Egy fél (szállító vagy vevő) postacíme és elérhetőségei — mind opcionális. */
export interface UblFel {
  nev: string | null
  /** CUI/CIF (PartyTaxScheme → PartyLegalEntity → PartyIdentification sorrendben). */
  cui: string | null
  /** Cégjegyzékszám (J40/…): cac:PartyLegalEntity/cbc:CompanyLegalForm. */
  cegjegyzek: string | null
  utca: string | null
  varos: string | null
  iranyitoszam: string | null
  /** Megye (cbc:CountrySubentity) — a román CIUS itt a megye-kódot adja (CV, B, …). */
  megye: string | null
  orszag: string | null
  telefon: string | null
  email: string | null
  /** cac:PartyIdentification/cbc:ID — az Oblio „Identificator client"-je. */
  azonosito: string | null
}

export interface UblTetel {
  sorszam: string | null
  megnevezes: string | null
  leiras: string | null
  mennyiseg: number | null
  /** UN/ECE Rec 20 kód (H87 = darab, XPP = csomag, C62 = egység…). */
  mertekegyseg: string | null
  /** Nettó egységár (cac:Price/cbc:PriceAmount). */
  egysegar: number | null
  /** A sor nettó értéke (cbc:LineExtensionAmount). */
  netto: number | null
  /** ÁFA-kulcs % (cac:Item/cac:ClassifiedTaxCategory/cbc:Percent). */
  afaSzazalek: number | null
  /** ÁFA-kategória (S = normál, Z = 0%, E = mentes, AE = fordított, O = nem tárgya). */
  afaKategoria: string | null
  /** A sor ÁFA-összege, HA a kiállító megadta (cac:TaxTotal a soron) — különben null. */
  afa: number | null
  penznem: string | null
}

export interface UblAfaBontas {
  alap: number | null
  afa: number | null
  szazalek: number | null
  kategoria: string | null
  penznem: string | null
}

export interface UblOsszesito {
  /** cbc:LineExtensionAmount — a tételek nettó összege. */
  tetelekNetto: number | null
  /** cbc:TaxExclusiveAmount — nettó a kedvezmények/felárak után. */
  netto: number | null
  /** cbc:TaxInclusiveAmount — bruttó. */
  brutto: number | null
  kedvezmeny: number | null
  felar: number | null
  /** cbc:PrepaidAmount — előleg. */
  eloleg: number | null
  /** cbc:PayableAmount — a ténylegesen fizetendő. */
  fizetendo: number | null
  /** /TaxTotal/cbc:TaxAmount — ÁFA összesen. */
  afaOsszesen: number | null
  penznem: string | null
}

export interface UblSzamlaReszletek {
  fej: UblSzamlaMeta
  szallito: UblFel
  vevo: UblFel
  /** A szállító bankszámlái (cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID). */
  iban: string[]
  bic: string | null
  tetelek: UblTetel[]
  afaBontas: UblAfaBontas[]
  osszesito: UblOsszesito
  /** cac:PaymentTerms/cbc:Note — fizetési feltétel szövege. */
  fizetesiFeltetel: string | null
  /** /cbc:Note — a kiállító szabad megjegyzései. */
  megjegyzesek: string[]
  /** /cbc:BuyerReference — az Oblio „Referinta cumparator"-a. */
  vevoHivatkozas: string | null
  /** cac:OrderReference/cbc:ID — megrendelés-szám. */
  megrendelesSzam: string | null
  /** Egyetlen ÁFA-kulcs, ha MINDEN tétel ugyanazt viseli (az Oblio fejléc-felirata). */
  egysegesAfaKulcs: number | null
  parseError: string | null
}

function penznemOf(e: XmlElem | null, alap: string | null): string | null {
  const c = e?.attr.currencyID
  return typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : alap
}

function uresFel(): UblFel {
  return {
    nev: null, cui: null, cegjegyzek: null, utca: null, varos: null, iranyitoszam: null,
    megye: null, orszag: null, telefon: null, email: null, azonosito: null,
  }
}

/** Román cégjegyzékszám: J14/145/2013, F12/3/2020, C40/7/2019 (regisztráló hivatal/sorszám/év). */
const CEGJEGYZEK_RE = /^[JFC]\s?\d{1,2}\s?\/\s?\d{1,6}\s?\/\s?\d{4}$/i

function felOf(partyBurok: XmlElem | null): UblFel {
  const fel = uresFel()
  const party = partyBurok ? kozvetlen(partyBurok, 'Party') : null
  if (!party) return fel
  const partyName = kozvetlen(party, 'PartyName')
  const legal = kozvetlen(party, 'PartyLegalEntity')
  const tax = kozvetlen(party, 'PartyTaxScheme')
  const ident = kozvetlen(party, 'PartyIdentification')
  fel.nev = szovege(partyName ? kozvetlen(partyName, 'Name') : null)
    ?? szovege(legal ? kozvetlen(legal, 'RegistrationName') : null)
  const taxCui = szovege(tax ? kozvetlen(tax, 'CompanyID') : null)
  const legalId = szovege(legal ? kozvetlen(legal, 'CompanyID') : null)
  const legalForm = szovege(legal ? kozvetlen(legal, 'CompanyLegalForm') : null)
  fel.cui = taxCui ?? legalId ?? szovege(ident ? kozvetlen(ident, 'ID') : null)
  // 2026-09-04 (valódi exporton mérve): a cégjegyzékszám (J14/145/2013) a
  // PartyLegalEntity/CompanyID-ban áll, AMIKOR a CUI már a PartyTaxScheme-ben
  // van; a CompanyLegalForm a legtöbb kiállítónál a törzstőke szövege
  // („Capital social: 200 LEI") — azt Reg. com.-ként kiírni hamis adat lenne.
  // Csak J/F/C-mintájú értéket fogadunk el, bárhonnan is jön.
  fel.cegjegyzek =
    (legalId && legalId !== fel.cui && CEGJEGYZEK_RE.test(legalId) ? legalId : null)
    ?? (legalForm && CEGJEGYZEK_RE.test(legalForm) ? legalForm : null)
  fel.azonosito = szovege(ident ? kozvetlen(ident, 'ID') : null)
  const cim = kozvetlen(party, 'PostalAddress')
  if (cim) {
    // StreetName + AdditionalStreetName + AddressLine/Line — ami van, azt összefűzzük.
    const reszek = [
      szovege(kozvetlen(cim, 'StreetName')),
      szovege(kozvetlen(cim, 'AdditionalStreetName')),
      ...kozvetlenMind(cim, 'AddressLine').map((al) => szovege(kozvetlen(al, 'Line'))),
    ].filter((x): x is string => !!x)
    fel.utca = reszek.length > 0 ? reszek.join(', ') : null
    fel.varos = szovege(kozvetlen(cim, 'CityName'))
    fel.iranyitoszam = szovege(kozvetlen(cim, 'PostalZone'))
    fel.megye = szovege(kozvetlen(cim, 'CountrySubentity'))
    const orszag = kozvetlen(cim, 'Country')
    fel.orszag = szovege(orszag ? kozvetlen(orszag, 'IdentificationCode') : null)
  }
  const kontakt = kozvetlen(party, 'Contact')
  if (kontakt) {
    fel.telefon = szovege(kozvetlen(kontakt, 'Telephone'))
    fel.email = szovege(kozvetlen(kontakt, 'ElectronicMail'))
  }
  return fel
}

/**
 * A nyomtatható adatlap TELJES adatkészlete egy UBL 2.1 XML-ből. SOHA nem dob:
 * hibánál a `parseError` mező magyarul jelez, és ami kinyerhető volt, az a
 * mezőkben marad (részleges adat > semmi — de a hívó a hibát KÖTELES kiírni,
 * hogy egy csonka lap ne látszódjon teljesnek).
 */
export function parseUblSzamlaReszletek(xmlText: string, fallbackUuid?: string | null): UblSzamlaReszletek {
  const fej = parseUblSzamla(xmlText, fallbackUuid)
  const ki: UblSzamlaReszletek = {
    fej,
    szallito: uresFel(),
    vevo: uresFel(),
    iban: [],
    bic: null,
    tetelek: [],
    afaBontas: [],
    osszesito: {
      tetelekNetto: null, netto: null, brutto: null, kedvezmeny: null, felar: null,
      eloleg: null, fizetendo: null, afaOsszesen: null, penznem: fej.penznem,
    },
    fizetesiFeltetel: null,
    megjegyzesek: [],
    vevoHivatkozas: null,
    megrendelesSzam: null,
    egysegesAfaKulcs: null,
    parseError: fej.parseError,
  }
  if (fej.parseError) return ki

  let root: XmlElem
  try {
    root = parseXmlFa(xmlText)
  } catch (e) {
    ki.parseError = `XML-hiba: ${e instanceof XmlHiba ? e.message : e instanceof Error ? e.message : String(e)}`
    return ki
  }
  const alapPenznem = fej.penznem

  ki.szallito = felOf(kozvetlen(root, 'AccountingSupplierParty'))
  ki.vevo = felOf(kozvetlen(root, 'AccountingCustomerParty'))

  // ─── Fizetés: IBAN(ok), BIC, fizetési feltétel ───
  for (const pm of kozvetlenMind(root, 'PaymentMeans')) {
    const szamla = kozvetlen(pm, 'PayeeFinancialAccount')
    const iban = szovege(szamla ? kozvetlen(szamla, 'ID') : null)
    if (iban && !ki.iban.includes(iban)) ki.iban.push(iban)
    const fiok = szamla ? kozvetlen(szamla, 'FinancialInstitutionBranch') : null
    if (!ki.bic && fiok) ki.bic = szovege(kozvetlen(fiok, 'ID'))
  }
  const pt = kozvetlen(root, 'PaymentTerms')
  ki.fizetesiFeltetel = szovege(pt ? kozvetlen(pt, 'Note') : null)
  ki.megjegyzesek = kozvetlenMind(root, 'Note').map(szovege).filter((x): x is string => !!x)
  ki.vevoHivatkozas = szovege(kozvetlen(root, 'BuyerReference'))
  const rendeles = kozvetlen(root, 'OrderReference')
  ki.megrendelesSzam = szovege(rendeles ? kozvetlen(rendeles, 'ID') : null)

  // ─── Sortételek: Invoice → InvoiceLine/InvoicedQuantity; CreditNote → CreditNoteLine/CreditedQuantity ───
  const sorNev = root.nev === 'CreditNote' ? 'CreditNoteLine' : 'InvoiceLine'
  const mennyNev = root.nev === 'CreditNote' ? 'CreditedQuantity' : 'InvoicedQuantity'
  for (const sor of kozvetlenMind(root, sorNev)) {
    const menny = kozvetlen(sor, mennyNev)
    const netto = kozvetlen(sor, 'LineExtensionAmount')
    const item = kozvetlen(sor, 'Item')
    const ar = kozvetlen(sor, 'Price')
    const kat = item ? kozvetlen(item, 'ClassifiedTaxCategory') : null
    const sorAfa = kozvetlen(sor, 'TaxTotal')
    ki.tetelek.push({
      sorszam: szovege(kozvetlen(sor, 'ID')),
      megnevezes: szovege(item ? kozvetlen(item, 'Name') : null),
      leiras: szovege(item ? kozvetlen(item, 'Description') : null),
      mennyiseg: szamErtek(menny),
      mertekegyseg: (menny?.attr.unitCode || '').trim() || null,
      egysegar: szamErtek(ar ? kozvetlen(ar, 'PriceAmount') : null),
      netto: szamErtek(netto),
      afaSzazalek: szamErtek(kat ? kozvetlen(kat, 'Percent') : null),
      afaKategoria: szovege(kat ? kozvetlen(kat, 'ID') : null),
      afa: szamErtek(sorAfa ? kozvetlen(sorAfa, 'TaxAmount') : null),
      penznem: penznemOf(netto, alapPenznem),
    })
  }

  // ─── ÁFA-bontás (a dokumentum-szintű TaxTotal alatt — a soron belülieket kihagyjuk) ───
  for (const tt of kozvetlenMind(root, 'TaxTotal')) {
    const ossz = kozvetlen(tt, 'TaxAmount')
    if (ki.osszesito.afaOsszesen == null) ki.osszesito.afaOsszesen = szamErtek(ossz)
    for (const st of kozvetlenMind(tt, 'TaxSubtotal')) {
      const kat = kozvetlen(st, 'TaxCategory')
      const alapE = kozvetlen(st, 'TaxableAmount')
      ki.afaBontas.push({
        alap: szamErtek(alapE),
        afa: szamErtek(kozvetlen(st, 'TaxAmount')),
        szazalek: szamErtek(kat ? kozvetlen(kat, 'Percent') : null),
        kategoria: szovege(kat ? kozvetlen(kat, 'ID') : null),
        penznem: penznemOf(alapE, alapPenznem),
      })
    }
  }

  // ─── Összesítő ───
  const lmt = kozvetlen(root, 'LegalMonetaryTotal')
  if (lmt) {
    const fiz = kozvetlen(lmt, 'PayableAmount')
    ki.osszesito = {
      tetelekNetto: szamErtek(kozvetlen(lmt, 'LineExtensionAmount')),
      netto: szamErtek(kozvetlen(lmt, 'TaxExclusiveAmount')),
      brutto: szamErtek(kozvetlen(lmt, 'TaxInclusiveAmount')),
      kedvezmeny: szamErtek(kozvetlen(lmt, 'AllowanceTotalAmount')),
      felar: szamErtek(kozvetlen(lmt, 'ChargeTotalAmount')),
      eloleg: szamErtek(kozvetlen(lmt, 'PrepaidAmount')),
      fizetendo: szamErtek(fiz),
      afaOsszesen: ki.osszesito.afaOsszesen,
      penznem: penznemOf(fiz, alapPenznem),
    }
  }

  // ─── Egységes ÁFA-kulcs (az Oblio fejléce: „Cota TVA (21% - Normala)") ───
  const kulcsok = new Set(ki.tetelek.map((t) => t.afaSzazalek).filter((x): x is number => x != null))
  if (kulcsok.size === 1) ki.egysegesAfaKulcs = [...kulcsok][0]
  else if (kulcsok.size === 0 && ki.afaBontas.length === 1 && ki.afaBontas[0].szazalek != null) {
    ki.egysegesAfaKulcs = ki.afaBontas[0].szazalek
  }

  return ki
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
 * ANAF-azonosító a fájlnévből: az ELSŐ legalább 8 jegyű szám-futam.
 *
 * ⛔ 2026-09-03 (átvilágítás): A CSUPASZ FÁJLNÉV-VISSZAESÉS MEGSZŰNT.
 *
 * A függvény korábban — ha nem talált 8+ jegyű futamot — MAGÁT A FÁJLNEVET adta
 * vissza azonosítóként. Mivel a `szallitoi_szamla` táblán
 * `UNIQUE (congregation_id, anaf_uuid)` áll, ez két irányba tudott rombolni:
 *
 *   (A) két KÜLÖNBÖZŐ szállító `factura.xml`-je AZONOS kulcsot kapott → a
 *       második sosem került be, „Már korábban rögzített" felirattal
 *       nyugtázva. A második szállító követelése NYOMTALANUL eltűnt.
 *   (B) ugyanaz a számla két úton (SPV / e-mail) két KÜLÖNBÖZŐ néven érkezve
 *       két kulcsot kapott → kettős tartozás-nyilvántartás.
 *
 * Ráadásul a hivatalos, nyomtatható adatlapra „ANAF-azonosító: factura" került.
 *
 * MOSTANTÓL: ha nincs 8+ jegyű futam, `null` a válasz. A hívó ilyenkor a
 * SZÁMLA IDENTITÁSÁBÓL képez kulcsot (szállító CUI + számlaszám + kelte, lásd
 * `azonositoSzamlaIdentitasbol`), és ha az sem áll elő, a rendszer HANGOSAN
 * elutasítja a sort — nem talál ki azonosítót.
 *
 * ⚠️ MIGRÁCIÓ NEM KELLETT: a 2026-09-03-i éles diagnosztika
 * (`docs/2026-09-03-anaf-uuid-diagnosztika.sql`) szerint mind a 14 rögzített
 * számla 8+ jegyű szám-azonosítón áll, EGYETLEN fájlnév-alapú kulcs sincs.
 * A változás tehát tisztán megelőző; meglévő sor kulcsa nem mozdul.
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
  // 2026-09-04 (valódi ANAF SPV-exporton mérve): az UTOLSÓ 8+ jegyű futam.
  // Az ANAF neve `<CÉG>_<SOROZAT>_<INDEX>.xml`, ahol az INDEX az utolsó rész.
  // Az ELSŐ futam a SOROZAT belsejéből is jöhet (LIDL `1038726021242`,
  // Electrica `EFI2613512321`) — az nem ANAF-index, hanem a szállító saját
  // számlaszáma, és ELTÉR attól, amit a PDF-párosító (utolsó rész) használ.
  const futamok = szamFutamok(alap)
  if (futamok.length > 0) return futamok[futamok.length - 1]
  // ⛔ NINCS visszaesés a csupasz fájlnévre (lásd a fenti magyarázatot).
  return null
}

/** Minden ≥8 jegyű számjegy-futam a névben, sorrendben (regex nélkül). */
function szamFutamok(alap: string): string[] {
  const ki: string[] = []
  let futam = ''
  for (let i = 0; i <= alap.length; i++) {
    const c = i < alap.length ? alap[i] : ' '
    if (c >= '0' && c <= '9') {
      futam += c
    } else {
      if (futam.length >= 8) ki.push(futam)
      futam = ''
    }
  }
  return ki
}

/**
 * A 2026-09-04 ELŐTTI kulcsképzés: az ELSŐ 8+ jegyű futam. CSAK a duplikátum-
 * ellenőrzés RÉGI ÁGÁHOZ — az élesben már rögzített sorok ezzel a kulccsal
 * állnak (UNIQUE (congregation_id, anaf_uuid)). Ha az import csak az új kulcsot
 * nézné, egy újraimport NEM találná a régi sort, és MÁSODIK tartozást szúrna be.
 * Új sor SOHA nem kaphatja ezt a kulcsot.
 */
export function anafUuidFajlnevbolElso(fajlnev: string): string | null {
  let alap = fajlnev
  let valtozott = true
  while (valtozott) {
    valtozott = false
    const kis = alap.toLowerCase()
    for (const kit of ['.zip', '.xml', '.pdf']) {
      if (kis.endsWith(kit)) { alap = alap.slice(0, alap.length - kit.length); valtozott = true; break }
    }
  }
  const futamok = szamFutamok(alap)
  return futamok.length > 0 ? futamok[0] : null
}

/**
 * Azonosító a SZÁMLA IDENTITÁSÁBÓL, ha sem az XML-ben, sem a fájlnévben nincs
 * ANAF-azonosító.
 *
 * A kulcs három, a bizonylaton is szereplő adatból áll: szállító adószáma +
 * számlaszám + kiállítás dátuma. Ez pontosan azt fejezi ki, amit az
 * azonosítónak jelentenie kell: „ugyanaz a számla". Két különböző szállító
 * azonos nevű fájlja így KÜLÖN kulcsot kap, ugyanaz a számla két úton pedig
 * AZONOSAT.
 *
 * A `azon:` előtag SZÁNDÉKOS: ránézésre megkülönbözteti a valódi ANAF-
 * azonosítótól (a hivatalos adatlapon is látszik, hogy ez a mi képzett
 * kulcsunk, nem a hatóságé).
 *
 * `null`, ha bármelyik összetevő hiányzik — ilyenkor a hívó HANGOSAN utasít el.
 */
export function azonositoSzamlaIdentitasbol(
  szallitoCui: string | null | undefined,
  szamlaSzam: string | null | undefined,
  kiallitasDatum: string | null | undefined,
): string | null {
  const norm = (s: string | null | undefined): string =>
    (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  const cui = norm(szallitoCui)
  const szam = norm(szamlaSzam)
  const datum = norm(kiallitasDatum).slice(0, 10)
  if (!cui || !szam || !datum) return null
  return `azon:${cui}|${szam}|${datum}`
}
