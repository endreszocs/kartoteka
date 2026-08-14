#!/usr/bin/env node
/**
 * Szerveroldali UBL-parser (7. pont B — szállítói számla adatalap) önteszt —
 * build/tesztkeret nélkül futtatható (a selftest-print-columns.mjs mintájára).
 *
 * A node_modules-beli `typescript`-tel CommonJS-re transpile-olja az
 * apps/web/lib/oblio/ubl-parser.ts fájlt (szándékosan importmentes lib!),
 * és assertekkel ellenőrzi:
 *  1. teljes UBL számla (RON) — minden mező kinyerése,
 *  2. hiányzó mezők — fallback-lánc (RegistrationName, TaxInclusiveAmount,
 *     fájlnév-UUID),
 *  3. rossz XML — parseError, sosem dob kivételt,
 *  4. EUR számla — pénznem-kinyerés,
 *  5. ékezetes szállítónév — entitások (&amp;, &#337;) + CDATA,
 *  6. CreditNote (jóváíró) — típus-felismerés,
 *  7. fájlnév-segédek (anafUuidFajlnevbol, fajlnevGyoker),
 *  8. robusztusság: DOCTYPE + komment + '>' az attribútum-értékben.
 *
 * Futtatás:  node scripts/selftest-ubl-parser.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'oblio', 'ubl-parser.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC_FILE)) {
  fail(`hiányzik a forrás: ${SRC_FILE}`)
  process.exit(1)
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-ubl-parser-selftest-'))
let mod
try {
  const code = fs.readFileSync(SRC_FILE, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: 'ubl-parser.ts',
  })
  const dest = path.join(tmp, 'ubl-parser.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  mod = require_(dest)
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { parseUblSzamla, anafUuidFajlnevbol, fajlnevGyoker } = mod
if (typeof parseUblSzamla !== 'function') {
  fail('parseUblSzamla nem exportált függvény')
  process.exit(1)
}

const expect = (cimke, kapott, vart) => {
  const kapottS = JSON.stringify(kapott)
  const vartS = JSON.stringify(vart)
  if (kapottS === vartS) ok(`${cimke} = ${vartS}`)
  else fail(`${cimke}: kapott ${kapottS}, várt ${vartS}`)
}

// ── 1. Teljes UBL számla (RON) ───────────────────────────────────────────────
const teljesRon = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>EFI 2601416270</cbc:ID>
  <cbc:UUID>5852740042</cbc:UUID>
  <cbc:IssueDate>2026-07-03</cbc:IssueDate>
  <cbc:DueDate>2026-08-02</cbc:DueDate>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Societatea Electrica Furnizare SA</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>RO28909028</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>SOCIETATEA ELECTRICA FURNIZARE S.A.</cbc:RegistrationName>
        <cbc:CompanyID>J40/8974/2011</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Parohia Reformata Baratos</cbc:RegistrationName>
        <cbc:CompanyID>4201234</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="RON">45.60</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RON">240.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">240.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">285.60</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RON">285.60</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`

{
  const m = parseUblSzamla(teljesRon)
  expect('1. teljes RON / parseError', m.parseError, null)
  expect('1. teljes RON / tipus', m.tipus, 'szamla')
  expect('1. teljes RON / szamlaszam', m.szamlaszam, 'EFI 2601416270')
  expect('1. teljes RON / anafUuid', m.anafUuid, '5852740042')
  expect('1. teljes RON / kiallitasDatum', m.kiallitasDatum, '2026-07-03')
  expect('1. teljes RON / fizetesiHatarido', m.fizetesiHatarido, '2026-08-02')
  expect('1. teljes RON / penznem', m.penznem, 'RON')
  expect('1. teljes RON / szallitoNev', m.szallitoNev, 'Societatea Electrica Furnizare SA')
  expect('1. teljes RON / szallitoCui', m.szallitoCui, 'RO28909028')
  expect('1. teljes RON / vevoNev', m.vevoNev, 'Parohia Reformata Baratos')
  expect('1. teljes RON / vevoCui', m.vevoCui, '4201234')
  expect('1. teljes RON / vegosszeg', m.vegosszeg, 285.6)
}

// ── 2. Hiányzó mezők — fallback-lánc ────────────────────────────────────────
// Nincs: UUID (→ fájlnév-fallback), DueDate, PartyName (→ RegistrationName),
// PartyTaxScheme (→ PartyLegalEntity CompanyID), PayableAmount (→ TaxInclusive).
const hianyos = `<?xml version="1.0"?>
<Invoice xmlns:cbc="u" xmlns:cac="u2">
  <cbc:ID>F-2026-17</cbc:ID>
  <cbc:IssueDate>2026-05-11</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Apa-Canal SRL</cbc:RegistrationName>
        <cbc:CompanyID>RO123456</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxInclusiveAmount currencyID="RON">99,50</cbc:TaxInclusiveAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`

{
  const m = parseUblSzamla(hianyos, anafUuidFajlnevbol('4214783999.xml'))
  expect('2. hiányos / parseError', m.parseError, null)
  expect('2. hiányos / anafUuid (fájlnév-fallback)', m.anafUuid, '4214783999')
  expect('2. hiányos / fizetesiHatarido', m.fizetesiHatarido, null)
  expect('2. hiányos / szallitoNev (RegistrationName-fallback)', m.szallitoNev, 'Apa-Canal SRL')
  expect('2. hiányos / szallitoCui (LegalEntity-fallback)', m.szallitoCui, 'RO123456')
  expect('2. hiányos / vegosszeg (TaxInclusive + tizedes-vessző)', m.vegosszeg, 99.5)
}

// ── 3. Rossz XML — parseError, sosem dob ────────────────────────────────────
{
  let dobott = false
  let m = null
  try {
    m = parseUblSzamla('<Invoice><cbc:ID>felbehagyott')
  } catch {
    dobott = true
  }
  if (dobott) fail('3. rossz XML: kivételt dobott (tilos — parseError kell)')
  else if (m && typeof m.parseError === 'string' && m.parseError.length > 0) {
    ok(`3. rossz XML → parseError: "${m.parseError}"`)
  } else {
    fail(`3. rossz XML: nincs parseError (kapott: ${JSON.stringify(m?.parseError)})`)
  }

  const m2 = parseUblSzamla('ez nem is XML, csak szöveg')
  if (m2.parseError) ok('3b. nem-XML szöveg → parseError')
  else fail('3b. nem-XML szövegre nem jelzett hibát')

  const m3 = parseUblSzamla('')
  if (m3.parseError) ok('3c. üres bemenet → parseError')
  else fail('3c. üres bemenetre nem jelzett hibát')

  const m4 = parseUblSzamla('<a></b>')
  if (m4.parseError) ok('3d. tag-párosítási hiba → parseError')
  else fail('3d. rossz tag-párra nem jelzett hibát')
}

// ── 4. EUR számla ───────────────────────────────────────────────────────────
const eurSzamla = `<?xml version="1.0"?>
<Invoice>
  <cbc:ID xmlns:cbc="u">INV-EU-7</cbc:ID>
  <cbc:UUID xmlns:cbc="u">9988776655</cbc:UUID>
  <cbc:IssueDate xmlns:cbc="u">2026-06-30</cbc:IssueDate>
  <cbc:DocumentCurrencyCode xmlns:cbc="u">EUR</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal xmlns:cac="u2" xmlns:cbc="u">
    <cbc:PayableAmount currencyID="EUR">120.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`

{
  const m = parseUblSzamla(eurSzamla)
  expect('4. EUR / parseError', m.parseError, null)
  expect('4. EUR / penznem', m.penznem, 'EUR')
  expect('4. EUR / vegosszeg', m.vegosszeg, 120)
}

// ── 5. Ékezetes szállítónév — entitások + CDATA ─────────────────────────────
// A "Kőműves és Ács Kft. — Árvíz & Tűz" név vegyesen: numerikus entitás
// (&#337; = ő), nevesített entitás (&amp;) és közvetlen UTF-8 ékezetek.
const ekezetes = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cbc:ID xmlns:cbc="u">SZ-42</cbc:ID>
  <cbc:UUID xmlns:cbc="u">1122334455</cbc:UUID>
  <cbc:DocumentCurrencyCode xmlns:cbc="u">RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty xmlns:cac="u2" xmlns:cbc="u">
    <cac:Party>
      <cac:PartyName><cbc:Name>K&#337;m&#369;ves és Ács Kft. — Árvíz &amp; T&#369;z</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>RO7654321</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty xmlns:cac="u2" xmlns:cbc="u">
    <cac:Party>
      <cac:PartyName><cbc:Name><![CDATA[Sepsiszentgyörgyi Református Egyházközség <1>]]></cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal xmlns:cac="u2" xmlns:cbc="u">
    <cbc:PayableAmount currencyID="RON">1500.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`

{
  const m = parseUblSzamla(ekezetes)
  expect('5. ékezetes / parseError', m.parseError, null)
  expect('5. ékezetes / szallitoNev', m.szallitoNev, 'Kőműves és Ács Kft. — Árvíz & Tűz')
  expect('5. ékezetes / vevoNev (CDATA)', m.vevoNev, 'Sepsiszentgyörgyi Református Egyházközség <1>')
}

// ── 6. CreditNote (jóváíró) ─────────────────────────────────────────────────
const jovairo = `<?xml version="1.0"?>
<CreditNote>
  <cbc:ID xmlns:cbc="u">CN-3</cbc:ID>
  <cbc:UUID xmlns:cbc="u">5566778899</cbc:UUID>
  <cbc:IssueDate xmlns:cbc="u">2026-04-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode xmlns:cbc="u">RON</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal xmlns:cac="u2" xmlns:cbc="u">
    <cbc:PayableAmount currencyID="RON">50.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`

{
  const m = parseUblSzamla(jovairo)
  expect('6. jóváíró / tipus', m.tipus, 'jovairo')
  expect('6. jóváíró / vegosszeg', m.vegosszeg, 50)
}

// ── 7. Fájlnév-segédek ──────────────────────────────────────────────────────
{
  expect(`7. anafUuidFajlnevbol('5852740042.xml')`, anafUuidFajlnevbol('5852740042.xml'), '5852740042')
  expect(`7. anafUuidFajlnevbol('factura_4214783999.xml.zip')`, anafUuidFajlnevbol('factura_4214783999.xml.zip'), '4214783999')
  expect(`7. anafUuidFajlnevbol('abc.pdf') (fallback: alapnév)`, anafUuidFajlnevbol('abc.pdf'), 'abc')
  expect(`7. anafUuidFajlnevbol('.xml') (üres alap → null)`, anafUuidFajlnevbol('.xml'), null)
  expect(`7. fajlnevGyoker('semnatura_5884883600.xml')`, fajlnevGyoker('semnatura_5884883600.xml'), '5884883600')
  expect(`7. fajlnevGyoker('Factura_RO123.pdf')`, fajlnevGyoker('Factura_RO123.pdf'), 'factura_ro123')
  expect(`7. fajlnevGyoker('5884883600.xml.zip')`, fajlnevGyoker('5884883600.xml.zip'), '5884883600')
}

// ── 8. Robusztusság: DOCTYPE + komment + '>' az attribútum-értékben ─────────
const robusztus = `<?xml version="1.0"?>
<!DOCTYPE Invoice [ <!ENTITY sajat "SOSE-OLDODJON-FEL"> ]>
<!-- ANAF-letöltés, 2026 -->
<Invoice meta="a > b">
  <cbc:ID xmlns:cbc="u">R-1</cbc:ID>
  <cbc:UUID xmlns:cbc="u">4455667788</cbc:UUID>
  <cbc:DocumentCurrencyCode xmlns:cbc="u">RON</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal xmlns:cac="u2" xmlns:cbc="u">
    <cbc:PayableAmount currencyID="RON">10.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`

{
  const m = parseUblSzamla(robusztus)
  expect('8. robusztus / parseError', m.parseError, null)
  expect('8. robusztus / szamlaszam', m.szamlaszam, 'R-1')
  expect('8. robusztus / vegosszeg', m.vegosszeg, 10)
}

// ── Zárás ───────────────────────────────────────────────────────────────────
fs.rmSync(tmp, { recursive: true, force: true })
if (failed) {
  console.error('\nAz UBL-parser önteszt HIBÁVAL zárult.')
  process.exit(1)
}
console.log('\nMinden UBL-parser önteszt rendben. ✔')
