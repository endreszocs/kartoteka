/**
 * UBL 2.1 (Universal Business Language) számla XML parser.
 *
 * A romániai e-Factura formátum az **EN 16931 + Romanian CIUS** profilt
 * használja, ami az UBL 2.1 Invoice és CreditNote-ot egyszerűsíti.
 *
 * Forrás: http://docs.oasis-open.org/ubl/UBL-2.1.html
 *         https://mfinante.gov.ro/ro/web/efactura/informatii-tehnice
 *
 * Csak a KARTOTEKA "Oblio ellenőrzés"-hez szükséges mezőket olvassuk:
 *   - Számlaszám, dátum, devizanem
 *   - ANAF UUID (a feltöltés azonosítója)
 *   - Beszállító (supplier): CUI, név, cím
 *   - Vevő (customer): CUI, név (ellenőrzéshez)
 *   - Pénzügyi összesítők: nettó, ÁFA, bruttó (PayableAmount)
 *
 * Kliens-oldali: a browser natív `DOMParser`-jét használjuk, nincs npm dep.
 */

export type UblInvoiceMeta = {
  /** Az XML típusa: standard Invoice vagy CreditNote (jóváíró). */
  documentType: 'invoice' | 'credit_note' | 'unknown'
  /** Számlaszám (cbc:ID). */
  invoiceNumber: string | null
  /** Kibocsátás dátuma (YYYY-MM-DD). */
  issueDate: string | null
  /** Esedékesség (ha van). */
  dueDate: string | null
  /** Devizanem (RON / EUR / ...). */
  currency: string | null
  /** ANAF SPV egyedi ID — a fájlnévből vagy a `cbc:UUID` mezőből. */
  anafUuid: string | null
  /**
   * 2026-09-04: a sztornó/jóváírás által hivatkozott EREDETI számla száma
   * (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID). A román
   * gyakorlatban a sztornó gyakran `InvoiceTypeCode 380`-as Invoice negatív
   * tételekkel — a gyökér-elem nem mondja meg a szerepét, ez igen.
   */
  referencedInvoice: string | null

  /** Beszállító (kibocsátó). */
  supplier: {
    cui: string | null
    name: string | null
    address: string | null
    countryCode: string | null
  }

  /** Vevő (befogadó — ez a gyülekezet). */
  customer: {
    cui: string | null
    name: string | null
  }

  /** Pénzügyi összesítők (RON). */
  amounts: {
    /** ÁFA nélkül (LineExtensionAmount). */
    netto: number | null
    /** ÁFA összesen (TaxAmount). */
    tva: number | null
    /** Bruttó — ezt használjuk párosításhoz (PayableAmount vagy TaxInclusiveAmount). */
    brut: number | null
  }

  /** Hibás parse esetén — magyar üzenet. */
  parseError: string | null
}

// ─────────────────────────────────────────────────────────────
// Segédfüggvények
// ─────────────────────────────────────────────────────────────

/**
 * UBL XPath-szerűség: namespace-érzéketlen elem-kereső.
 *
 * Az UBL XML namespace-eket használ (cbc, cac, ubl), de a böngésző DOMParser-e
 * a `getElementsByTagNameNS` mellett a `getElementsByTagName` is támogatja,
 * ami a teljes elemnevet (prefix:localName) keresi. A namespace-független
 * megoldás: a localName szerinti szűrés.
 */
function findFirst(parent: Element | Document, localName: string): Element | null {
  // Először namespace-független keresés
  const all = parent.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i]
  }
  return null
}

/**
 * Egy gyermek elemen belül az első leszármazott megadott localName-mel.
 * Akkor használjuk, ha pl. AccountingSupplierParty-n belül kell PartyName-t
 * keresni — DE csak ezen a részfán belül.
 */
function findFirstWithin(parent: Element, localName: string): Element | null {
  return findFirst(parent, localName)
}

function readText(el: Element | null): string | null {
  if (!el) return null
  const txt = el.textContent?.trim()
  return txt && txt.length > 0 ? txt : null
}

function readNumber(el: Element | null): number | null {
  const txt = readText(el)
  if (!txt) return null
  const n = Number(txt.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function safeDate(str: string | null): string | null {
  if (!str) return null
  // UBL: YYYY-MM-DD, néha extra timezone-szal
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

// ─────────────────────────────────────────────────────────────
// A fő parse függvény
// ─────────────────────────────────────────────────────────────

/**
 * Egy UBL XML stringet parse-ol és visszaadja a metaadatokat.
 *
 * Soha nem dob exception-t — ha hiba van, a `parseError` mezőben jön a hiba.
 */
export function parseUblXml(
  xmlText: string,
  fallbackUuid?: string,
): UblInvoiceMeta {
  const result: UblInvoiceMeta = {
    documentType: 'unknown',
    invoiceNumber: null,
    issueDate: null,
    dueDate: null,
    currency: null,
    anafUuid: fallbackUuid || null,
    referencedInvoice: null,
    supplier: { cui: null, name: null, address: null, countryCode: null },
    customer: { cui: null, name: null },
    amounts: { netto: null, tva: null, brut: null },
    parseError: null,
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    result.parseError = 'A UBL parser csak a kliens-oldalon használható (DOMParser hiányzik).'
    return result
  }

  let doc: Document
  try {
    const parser = new DOMParser()
    doc = parser.parseFromString(xmlText, 'application/xml')
    const errorNode = doc.getElementsByTagName('parsererror')
    if (errorNode.length > 0) {
      result.parseError = `XML parse hiba: ${errorNode[0].textContent?.slice(0, 200) || 'ismeretlen'}`
      return result
    }
  } catch (e) {
    result.parseError = `XML parse kivétel: ${e instanceof Error ? e.message : String(e)}`
    return result
  }

  // ─── Document type ───
  const root = doc.documentElement
  if (root) {
    if (root.localName === 'Invoice') result.documentType = 'invoice'
    else if (root.localName === 'CreditNote') result.documentType = 'credit_note'
  }

  // ─── Számlaszám + dátum ───
  // cbc:ID a root közvetlen gyermeke (van 1+ ID, de a root-szintű a számlaszám)
  if (root) {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i]
      if (child.localName === 'ID' && !result.invoiceNumber) {
        result.invoiceNumber = readText(child)
      } else if (child.localName === 'IssueDate') {
        result.issueDate = safeDate(readText(child))
      } else if (child.localName === 'DueDate') {
        result.dueDate = safeDate(readText(child))
      } else if (child.localName === 'DocumentCurrencyCode') {
        result.currency = readText(child)
      } else if (child.localName === 'UUID') {
        result.anafUuid = readText(child) || result.anafUuid
      }
    }
  }

  // ─── Beszállító ───
  // <cac:AccountingSupplierParty><cac:Party>...</cac:Party></cac:AccountingSupplierParty>
  const supplierParty = findFirst(doc, 'AccountingSupplierParty')
  if (supplierParty) {
    const party = findFirstWithin(supplierParty, 'Party')
    if (party) {
      // Név: <cac:PartyName><cbc:Name>...</cbc:Name></cac:PartyName>
      // VAGY <cac:PartyLegalEntity><cbc:RegistrationName>...</cbc:RegistrationName></cac:PartyLegalEntity>
      const partyName = findFirstWithin(party, 'PartyName')
      if (partyName) {
        result.supplier.name = readText(findFirstWithin(partyName, 'Name'))
      }
      if (!result.supplier.name) {
        const legalEntity = findFirstWithin(party, 'PartyLegalEntity')
        if (legalEntity) {
          result.supplier.name = readText(findFirstWithin(legalEntity, 'RegistrationName'))
        }
      }

      // CUI: <cac:PartyTaxScheme><cbc:CompanyID>RO12345</cbc:CompanyID></cac:PartyTaxScheme>
      // VAGY <cac:PartyLegalEntity><cbc:CompanyID>...</cbc:CompanyID></cac:PartyLegalEntity>
      // VAGY <cac:PartyIdentification><cbc:ID>...</cbc:ID></cac:PartyIdentification>
      const taxScheme = findFirstWithin(party, 'PartyTaxScheme')
      if (taxScheme) {
        result.supplier.cui = readText(findFirstWithin(taxScheme, 'CompanyID'))
      }
      if (!result.supplier.cui) {
        const legalEntity = findFirstWithin(party, 'PartyLegalEntity')
        if (legalEntity) {
          result.supplier.cui = readText(findFirstWithin(legalEntity, 'CompanyID'))
        }
      }
      if (!result.supplier.cui) {
        const ident = findFirstWithin(party, 'PartyIdentification')
        if (ident) {
          result.supplier.cui = readText(findFirstWithin(ident, 'ID'))
        }
      }

      // Cím: <cac:PostalAddress><cbc:StreetName/></cac:PostalAddress>
      const postal = findFirstWithin(party, 'PostalAddress')
      if (postal) {
        const parts: string[] = []
        const street = readText(findFirstWithin(postal, 'StreetName'))
        const city = readText(findFirstWithin(postal, 'CityName'))
        const postalZone = readText(findFirstWithin(postal, 'PostalZone'))
        if (street) parts.push(street)
        if (postalZone) parts.push(postalZone)
        if (city) parts.push(city)
        if (parts.length > 0) result.supplier.address = parts.join(', ')

        const countryEl = findFirstWithin(postal, 'Country')
        if (countryEl) {
          result.supplier.countryCode = readText(findFirstWithin(countryEl, 'IdentificationCode'))
        }
      }
    }
  }

  // ─── Vevő (a gyülekezet) ───
  const customerParty = findFirst(doc, 'AccountingCustomerParty')
  if (customerParty) {
    const party = findFirstWithin(customerParty, 'Party')
    if (party) {
      const partyName = findFirstWithin(party, 'PartyName')
      if (partyName) {
        result.customer.name = readText(findFirstWithin(partyName, 'Name'))
      }
      if (!result.customer.name) {
        const legalEntity = findFirstWithin(party, 'PartyLegalEntity')
        if (legalEntity) {
          result.customer.name = readText(findFirstWithin(legalEntity, 'RegistrationName'))
        }
      }

      const taxScheme = findFirstWithin(party, 'PartyTaxScheme')
      if (taxScheme) {
        result.customer.cui = readText(findFirstWithin(taxScheme, 'CompanyID'))
      }
      if (!result.customer.cui) {
        const legalEntity = findFirstWithin(party, 'PartyLegalEntity')
        if (legalEntity) {
          result.customer.cui = readText(findFirstWithin(legalEntity, 'CompanyID'))
        }
      }
    }
  }

  // ─── Pénzügyi összesítők ───
  // <cac:LegalMonetaryTotal>
  //   <cbc:LineExtensionAmount currencyID="RON">100.00</cbc:LineExtensionAmount>
  //   <cbc:TaxExclusiveAmount currencyID="RON">100.00</cbc:TaxExclusiveAmount>
  //   <cbc:TaxInclusiveAmount currencyID="RON">119.00</cbc:TaxInclusiveAmount>
  //   <cbc:PayableAmount currencyID="RON">119.00</cbc:PayableAmount>
  // </cac:LegalMonetaryTotal>
  const total = findFirst(doc, 'LegalMonetaryTotal')
  if (total) {
    result.amounts.netto = readNumber(findFirstWithin(total, 'TaxExclusiveAmount'))
    result.amounts.brut =
      readNumber(findFirstWithin(total, 'PayableAmount')) ||
      readNumber(findFirstWithin(total, 'TaxInclusiveAmount'))
  }

  // ─── ELŐJEL-TUDATOS TÍPUS (2026-09-04, valódi ANAF-exporton mérve) ───
  // A MIND ELECTROSERV MSV2785 (−22 010, a MSV2763 előleg sztornója) gyökere
  // `Invoice`, típuskódja 380 — a gyökér HAZUDIK a szerepről. Negatív bruttó =
  // jóváírás. E nélkül a desktop párosító 4 helyen és a bevezetés-varázsló
  // `credit_note`-kapuja normál számlaként engedte volna át → kettős könyvelés.
  if (result.amounts.brut !== null && result.amounts.brut < 0 && result.documentType === 'invoice') {
    result.documentType = 'credit_note'
  }
  // ─── Hivatkozott eredeti számla (dokumentum-szintű BillingReference) ───
  if (root) {
    for (const gy of Array.from(root.children)) {
      if (gy.localName !== 'BillingReference') continue
      const ref = Array.from(gy.children).find((c) => c.localName === 'InvoiceDocumentReference')
      const id = ref ? Array.from(ref.children).find((c) => c.localName === 'ID')?.textContent?.trim() : null
      if (id) { result.referencedInvoice = id; break }
    }
  }

  // <cac:TaxTotal><cbc:TaxAmount currencyID="RON">19.00</cbc:TaxAmount></cac:TaxTotal>
  const taxTotal = findFirst(doc, 'TaxTotal')
  if (taxTotal) {
    result.amounts.tva = readNumber(findFirstWithin(taxTotal, 'TaxAmount'))
  }

  // Ha nincs külön TVA, de van netto + brut, akkor levezetjük
  if (
    result.amounts.tva === null &&
    result.amounts.netto !== null &&
    result.amounts.brut !== null
  ) {
    result.amounts.tva = Math.round((result.amounts.brut - result.amounts.netto) * 100) / 100
  }

  return result
}

/**
 * A fájlnévből próbálja kinyerni az ANAF UUID-t. A jellegzetes minták:
 *   - "4214783.xml"        → "4214783"
 *   - "factura_4214783.xml" → "4214783"
 *   - "4214783.xml.zip"    → "4214783"
 */
export function extractAnafUuidFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\.(zip|xml|pdf)+$/i, '')
  // 2026-09-04 (valódi ANAF SPV-exporton mérve): az UTOLSÓ 8+ jegyű futam. Az
  // ANAF neve `<CÉG>_<SOROZAT>_<INDEX>.xml` — az INDEX az utolsó rész. Az ELSŐ
  // futam a SOROZAT belsejéből is jöhet (LIDL `1038726021242`, Electrica
  // `EFI2613512321`): az a szállító számlaszáma, nem ANAF-index, és eltér attól,
  // amit a PDF-párosító (utolsó rész) használ. A webes `anafUuidFajlnevbol`
  // UGYANEZT a szabályt követi — a két út nem húzhat szét.
  const runs = base.match(/\d{8,}/g)
  if (runs && runs.length > 0) return runs[runs.length - 1]
  // ⛔ NINCS visszaesés a csupasz fájlnévre (2026-09-04 — a webes út 2026-09-03-i
  //    P0-javításával azonosan): két különböző szállító `factura.xml`-je AZONOS
  //    kulcsot kapott, a második NÉMÁN elveszett. A hívó a számla IDENTITÁSÁBÓL
  //    képezzen kulcsot (`identityKeyFromInvoice`), vagy mondja ki a hibát.
  return null
}

/**
 * Kulcs a számla IDENTITÁSÁBÓL (szállító CUI + számlaszám + kelte) — a csupasz
 * fájlnév helyébe lép, ha sem cbc:UUID, sem fájlnév-index nincs. Alakja a
 * webes `azonositoSzamlaIdentitasbol`-lal BETŰRE azonos (`azon:CUI|SZÁM|DÁTUM`),
 * hogy a desktop és a web ugyanarra a számlára ugyanazt a kulcsot adja.
 */
export function identityKeyFromInvoice(
  supplierCui: string | null | undefined,
  invoiceNumber: string | null | undefined,
  issueDate: string | null | undefined,
): string | null {
  const cui = (supplierCui ?? '').trim().toUpperCase()
  const num = (invoiceNumber ?? '').trim().toUpperCase()
  const date = (issueDate ?? '').trim().slice(0, 10)
  if (!cui || !num || !date) return null
  return `azon:${cui}|${num}|${date}`
}

/**
 * Fájlnév-gyök normalizálása — a kiterjesztés(ek) és az ANAF aláírás-
 * prefixek (pl. `semnatura_`) levágva, kisbetűsítve.
 *
 * Ezzel **biztosabban párosítható** az XML és a PDF, mint a UUID-val:
 *   - `5884883600.xml`      → `5884883600`
 *   - `5884883600.pdf`      → `5884883600`
 *   - `semnatura_5884883600.xml` → `5884883600`
 *   - `Factura_RO123.pdf`   → `factura_ro123`
 *   - `factura_ro123.xml`   → `factura_ro123`
 *
 * Az ANAF SPV ZIP-ekben a gyökér-név rendszerint **ugyanaz**
 * az XML-re és a hozzá tartozó PDF-re.
 */
export function normalizeFileBaseName(fileName: string): string {
  // 1. Az extension(ek) levágása (akár `.xml.zip` is)
  let base = fileName.replace(/\.(zip|xml|pdf)+$/i, '')
  // 2. Aláírás-prefix levágása (ANAF digitális aláírás XML-ekre)
  base = base.replace(/^semnatura[_-]/i, '')
  // 3. Kisbetűsítés
  return base.trim().toLowerCase()
}
