#!/usr/bin/env node
/**
 * NYITÓ EGYENLEG — EGYETLEN KANONIKUS FORRÁS önellenőrzés (2026-08-28)
 *
 * MIT ŐRIZ — Endre döntése:
 *   „A gyülekezet beállításainál legyenek a nyitó egyenlegek, EGY [helyen],
 *    és onnan számoljon mindent!"
 *
 * A nyitó egyenleg NÉGY helyen élt, élesben HÁROM KÜLÖNBÖZŐ számmal ugyanarra a
 * bankszámlára: `bankszamlak.nyito_egyenleg` = 15 000 (év nélküli skalár) ·
 * `bankszamla_nyito_egyenleg` (2025) = 107 771,39 (kanonikus, évenkénti) ·
 * `bealitas.nyito_bank` = 0,00 (halott). A kanonikus a két ÉVENKÉNTI tábla, amit
 * a Gyülekezet beállításai → Nyitó egyenlegek felület ír.
 *
 * ── AZ ŐR KÉT IRÁNYBA VÉD ────────────────────────────────────────────────
 * (A) GYÜLEKEZETI hatókörben a legacy skalár NEM számolhat.
 * (B) FELSŐBB (megyei/kerületi) szinten viszont TOVÁBBRA IS kell — mert ott a
 *     kanonikus tábla `congregation_id`-je NOT NULL, a megyének nincs hova
 *     rögzítenie. Egy „túl mohó" kivezetés a MEGYEI hivatalos banknapló nyitó
 *     sorát nullázná — ez a kör legdrágább elkerülhető hibája.
 * Az őr MINDKÉT irányt méri, mert egyiket sem lehet a másik nélkül helyesen javítani.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden ághoz
 * visszajátsszuk a régi/hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-nyito-egyenleg-kanonikus.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const P = (...r) => path.join(REPO, ...r)

const REPORTING = P('packages', 'ui-app', 'src', 'finance', 'reporting.ts')
const ENTITY_NAME = P('packages', 'ui-app', 'src', 'finance', 'entity-name.ts')
const FELSO_INIT = P('apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const WEB_PRINT = P('apps', 'web', 'components', 'finance', 'finance-print-dialog.tsx')
const DESKTOP_PRINT = P('apps', 'desktop', 'src', 'components', 'finance-print-dialog.tsx')
const TABLE_REGISTRY = P('apps', 'web', 'lib', 'offline', 'table-registry.ts')
const EXCEL_SCHEMA = P('apps', 'web', 'lib', 'offline', 'excel-schema', 'registry.ts')
const IMPORT_ACTIONS = P('apps', 'web', 'app', '(dashboard)', 'penzugy', 'finance-import-actions.ts')
const CORE_NYITO = P('packages', 'core', 'src', 'finance', 'bank-import', 'nyito-egyenleg.ts')
const RESOLVE_NYITO = P('packages', 'core', 'src', 'finance', 'bank-import', 'resolve-nyito.ts')
const WELCOME = P('apps', 'web', 'app', '(setup)', 'welcome', 'actions.ts')
const CONGREGATION = P('apps', 'web', 'app', '(dashboard)', 'congregation', 'actions.ts')

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

// FAIL-CLOSED: hiányzó fájl HIBA, nem „nincs találat → zöld".
for (const f of [REPORTING, ENTITY_NAME, FELSO_INIT, WEB_PRINT, DESKTOP_PRINT,
                 TABLE_REGISTRY, EXCEL_SCHEMA, IMPORT_ACTIONS, CORE_NYITO,
                 RESOLVE_NYITO, WELCOME, CONGREGATION]) {
  if (!fs.existsSync(f)) { fail(`hiányzik: ${f}`); process.exit(1) }
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

// ── (A) VISELKEDÉS: a nyomtatvány tényleg melyik számot írja ki? ──────────
let betoltoSzamlalo = 0
function betoltReporting(reportingForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-nyito-${betoltoSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  const emit = (nev, src) => {
    const out = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: `${nev}.ts`,
    })
    fs.writeFileSync(path.join(tmp, `${nev}.js`), out.outputText, 'utf8')
  }
  emit('entity-name', olvas(ENTITY_NAME))
  // A `./types` import CSAK típus (`import type`), a transpile kiejti.
  emit('reporting', reportingForras)
  return require_(path.join(tmp, 'reporting.js'))
}

const SZAMLA_ID = 7
const LEGACY_SKALAR = 15000

/** Minimális, de valósághű bemenet a Registru Banca építéséhez. */
function reportData(extra) {
  return {
    income: [],
    expense: [],
    bankAccounts: [{ id: SZAMLA_ID, bank_neve: 'Teszt Bank', valuta: 'RON', nyito_egyenleg: LEGACY_SKALAR, aktiv: true }],
    cellek: [],
    bevCelMap: {},
    kiaCelMap: {},
    congregationName: 'Teszt Gyülekezet',
    carryoverCash: 0,
    carryoverBank: 0,
    // ÜRES térkép = a kanonikus táblából nem jött érték erre a számlára.
    // Ez a hibaág (lekérdezés-hiba), és PONT itt derül ki, melyik forrásra esünk vissza.
    bankNyitoMap: {},
    ...extra,
  }
}

const FILTERS = { year: 2026, month: 1, bankAccountId: SZAMLA_ID }

/** A „Sold luna precedenta" sor számértéke a generált HTML-ből. */
function soldLunaPrecedenta(html) {
  const m = html.match(/Sold luna precedenta:<\/td><td class="text-right">([^<]*)</)
  if (!m) return null
  // A `fmtNum` magyar formátumot ad (ezres szóköz/nbsp, tizedes vessző).
  const nyers = m[1].replace(/[\s  ]/g, '').replace(',', '.')
  const n = Number(nyers)
  return Number.isFinite(n) ? n : null
}

const mod = betoltReporting(olvas(REPORTING))
if (typeof mod.buildFinancePrintDocument !== 'function') {
  fail('a `buildFinancePrintDocument` nem tölthető be — az őr nem tud mérni')
} else {
  // (A1) GYÜLEKEZETI: a flag hiányzik → a legacy skalár NEM számolhat.
  const gyul = mod.buildFinancePrintDocument('registru_banca', reportData({}), FILTERS)
  const gyulErtek = soldLunaPrecedenta(gyul.html)
  if (gyulErtek === null) fail('(A1) a „Sold luna precedenta" sor nem található a HTML-ben — az őr vak')
  else if (gyulErtek === 0) ok('(A1) GYÜLEKEZETI: a legacy 15 000 NEM számol — a nyitó 0')
  else fail(`(A1) GYÜLEKEZETI: a nyitó ${gyulErtek} lett, várt 0 — a legacy skalár még mindig beszámít`)

  // (A2) FELSŐBB SZINT: a flag igaz → a legacy skalár az EGYETLEN forrás, KELL.
  const felso = mod.buildFinancePrintDocument(
    'registru_banca',
    reportData({ felsoSzintLegacyNyito: true }),
    FILTERS,
  )
  const felsoErtek = soldLunaPrecedenta(felso.html)
  if (felsoErtek === LEGACY_SKALAR) {
    ok(`(A2) MEGYEI: a legacy ${LEGACY_SKALAR} MEGMARAD — a megyei banknapló nem nullázódik`)
  } else {
    fail(`(A2) MEGYEI: a nyitó ${felsoErtek} lett, várt ${LEGACY_SKALAR} — a kivezetés TÚL MOHÓ, a megyei ív elromlott`)
  }

  // (A3) A kanonikus térkép MINDIG nyer — mindkét hatókörben.
  for (const [cimke, extra] of [['gyülekezeti', {}], ['megyei', { felsoSzintLegacyNyito: true }]]) {
    const r = mod.buildFinancePrintDocument(
      'registru_banca',
      reportData({ ...extra, bankNyitoMap: { [SZAMLA_ID]: 107771.39 } }),
      FILTERS,
    )
    const v = soldLunaPrecedenta(r.html)
    if (v === 107771.39) ok(`(A3) ${cimke}: a kanonikus tábla értéke nyer (107 771,39)`)
    else fail(`(A3) ${cimke}: a kanonikus érték helyett ${v} jött`)
  }

  // ── NEGATÍV ASSZERT: a RÉGI, feltétel nélküli fallback visszajátszása ───
  const mutansForras = olvas(REPORTING).replace(
    "const legacyNyito = data.felsoSzintLegacyNyito === true ? Number(bank?.nyito_egyenleg ?? 0) || 0 : 0",
    "const legacyNyito = Number(bank?.nyito_egyenleg ?? 0) || 0",
  )
  if (mutansForras === olvas(REPORTING)) {
    fail('NEGATÍV — a mutáns nem alkalmazódott (a flag-es sor alakja megváltozott?): az őr VAK lenne')
  } else {
    const m = betoltReporting(mutansForras)
    const r = m.buildFinancePrintDocument('registru_banca', reportData({}), FILTERS)
    const v = soldLunaPrecedenta(r.html)
    if (v === LEGACY_SKALAR) ok('NEGATÍV — a régi, feltétel nélküli fallback tényleg 15 000-et adna gyülekezeti szinten (a teszt lát)')
    else fail(`NEGATÍV — a mutáns is ${v}-t adott: a viselkedés nincs valóban ellenőrizve`)
  }
}

// ── (B) SZÖVEGES ŐRÖK ────────────────────────────────────────────────────
// A kommentek tele vannak a `nyito_egyenleg` szóval, ezért szűretlenül minden
// őr önmagától zöld (vagy önmagától piros) lenne.
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// A JSX-kommentek (`{/* … */}`) a `/* */` szabállyal már kiestek.

const OROK = [
  {
    nev: 'a felsőbb szintű init beállítja a `felsoSzintLegacyNyito` flaget (enélkül a megyei ív 0-ra esne)',
    file: FELSO_INIT,
    kell: /felsoSzintLegacyNyito:\s*true/,
    mutans: (s) => s.replace(/felsoSzintLegacyNyito:\s*true/g, 'felsoSzintLegacyNyito: false'),
  },
  {
    nev: 'a webes nyomtató a HATÓKÖRBŐL vezeti le a flaget (nem külön propból — nem lehet elfelejteni)',
    file: WEB_PRINT,
    kell: /felsoSzintLegacyNyito:\s*scope\s*!==\s*'congregation'/,
    mutans: (s) => s.replace(/felsoSzintLegacyNyito:\s*scope\s*!==\s*'congregation'/g, ''),
  },
  {
    nev: 'az asztali nyomtató SOSEM enged a legacy skalárnak (a desktop csak gyülekezeti)',
    file: DESKTOP_PRINT,
    kell: /felsoSzintLegacyNyito:\s*false/,
    mutans: (s) => s.replace(/felsoSzintLegacyNyito:\s*false/g, 'felsoSzintLegacyNyito: true'),
  },
  {
    nev: 'az offline sync NEM szinkronizálja a `nyito_egyenleg`-et (a push abból építi a payloadot)',
    file: TABLE_REGISTRY,
    tilt: /'nyito_egyenleg'/,
    mutans: (s) => s.replace(
      "'bank_neve', 'iban', 'valuta', 'aktiv',",
      "'bank_neve', 'iban', 'valuta', 'nyito_egyenleg', 'aktiv',",
    ),
  },
  {
    nev: 'az Excel „Bankszámlák" munkalapon NINCS szerkeszthető „Nyitó egyenleg" oszlop',
    file: EXCEL_SCHEMA,
    tilt: /technical:\s*'nyito_egyenleg'/,
    mutans: (s) => s.replace(
      "{ displayName: 'Valuta', technical: 'valuta', type: 'string', width: 8 },",
      "{ displayName: 'Valuta', technical: 'valuta', type: 'string', width: 8 },\n        { displayName: 'Nyitó egyenleg', technical: 'nyito_egyenleg', type: 'currency', width: 14 },",
    ),
  },
  {
    nev: 'az Excel-import NEM írja felül a kézzel jóváhagyott kassza-nyitót',
    file: IMPORT_ACTIONS,
    kell: /forrasa\s*===\s*'manual'/,
    mutans: (s) => s.replace(/forrasa\s*===\s*'manual'/g, "forrasa === '__soha__'"),
  },
  {
    nev: 'az import zárt-év kapuja a KÖLTSÉGVETÉS véglegesítését is nézi',
    file: IMPORT_ACTIONS,
    kell: /r\.accounting_finalized\s*\|\|\s*r\.budget_finalized/,
    mutans: (s) => s.replace(/r\.accounting_finalized\s*\|\|\s*r\.budget_finalized/g, 'r.accounting_finalized'),
  },
  {
    nev: 'a banki nyitó ÍRÓJA (közös mag) zárt-év védett — a web ÉS a desktop is ezen megy át',
    file: CORE_NYITO,
    kell: /accounting_finalized['"]?\s*===\s*true\s*\|\|\s*zaras\?\.budget_finalized\s*===\s*true/,
    mutans: (s) => s.replace(
      /if \(zaras\?\.accounting_finalized === true \|\| zaras\?\.budget_finalized === true\) \{/,
      'if (false) {',
    ),
  },
  {
    nev: 'a lánc-ablak ÖNADAPTÍV (a fix 8 év eldobta volna a saját bázisát)',
    file: RESOLVE_NYITO,
    kell: /input\.eve\s*-\s*legkorabbiBazis/,
    mutans: (s) => s.replace(/input\.eve\s*-\s*legkorabbiBazis/g, '0'),
  },
  {
    nev: 'a bevezető varázsló NEM írja a halott `bealitas.nyito_*` oszlopokat',
    file: WELCOME,
    tilt: /bealitasUpsert\.nyito_(bank|keszpenz)\s*=/,
    mutans: (s) => s.replace(
      "    if (wd.congregation?.bejegyzesiszam) {",
      "    bealitasUpsert.nyito_bank = 0\n    if (wd.congregation?.bejegyzesiszam) {",
    ),
  },
  {
    nev: 'a bankszámla-mentés NEM nullázza némán a legacy skalárt (`.optional()`, nem `.default(0)`)',
    file: CONGREGATION,
    tilt: /nyitoEgyenleg:\s*z\.number\(\)\.default\(0\)/,
    mutans: (s) => s.replace(/nyitoEgyenleg: z\.number\(\)\.optional\(\)/, 'nyitoEgyenleg: z.number().default(0)'),
  },
]

for (const o of OROK) {
  const nyers = olvas(o.file)
  const kod = kodCsak(nyers)
  const rovid = path.relative(REPO, o.file)

  if (o.kell) {
    if (!o.kell.test(kod)) { fail(`${rovid} — hiányzik: ${o.nev}`); continue }
  } else if (o.tilt) {
    if (o.tilt.test(kod)) { fail(`${rovid} — MÉG MINDIG jelen van, pedig kivezettük: ${o.nev}`); continue }
  }

  // NEGATÍV ASSZERT: a régi világ visszajátszása — az őrnek buknia KELL rá.
  const mutans = kodCsak(o.mutans(nyers))
  if (mutans === kod) {
    fail(`${rovid} — a mutáns NEM változtatott semmit: az őr VAK (${o.nev})`)
    continue
  }
  const mutansAtmegy = o.kell ? o.kell.test(mutans) : !o.tilt.test(mutans)
  if (mutansAtmegy) fail(`${rovid} — az őr VAK: a mutáns is átment (${o.nev})`)
  else ok(`${rovid} — ${o.nev}`)
}

// ── (C) A `bealitas.nyito_*` NEM kerülhet vissza insert/upsert payloadba ──
// Repó-szintű pásztázás: egy ÚJ írási hely is elbukna rajta, nem csak a régiek.
{
  const gyanus = []
  const jar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const teljes = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.next', 'dist', 'src-tauri', '.git'].includes(e.name)) continue
        jar(teljes)
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        const kod = kodCsak(olvas(teljes))
        if (/\bnyito_(bank|keszpenz)\s*:/.test(kod)) gyanus.push(path.relative(REPO, teljes))
      }
    }
  }
  jar(P('apps'))
  jar(P('packages'))
  if (gyanus.length === 0) ok('(C) a halott `bealitas.nyito_bank` / `nyito_keszpenz` sehol nem kerül payloadba')
  else fail(`(C) payload-írás a halott oszlopokra: ${gyanus.join(', ')}`)

  // NEGATÍV ASSZERT: a pásztázó tényleg lát-e? Ha nem, némán zöld lenne.
  const proba = kodCsak('const x = { nyito_bank: 0 }')
  if (/\bnyito_(bank|keszpenz)\s*:/.test(proba)) ok('NEGATÍV — a pásztázó egy visszaírt payload-mezőt tényleg elkapna')
  else fail('NEGATÍV — a pásztázó mintája nem illeszkedik: az őr VAK')
}

// ── (D) E-blokk utókör (P3-6 + P3-22, 2026-08-29) ─────────────────────────
// P3-6: a deviza-egyenleg (getBankCurrencyBalance) nyitója a KANONIKUS
// évenkénti táblából jön — a legacy skalár csak kanonikus sor híján él.
// P3-22: a lelkészi jelentés VII.5-je keresztellenőrzött a kanonikus
// nyitó-feloldóval (eltérésnél hangos autoHibak-üzenet).
{
  const BANK_BALANCE = P('apps', 'web', 'lib', 'finance', 'bank-balance.ts')
  const LELKESZI = P('apps', 'web', 'app', '(dashboard)', 'munkanaplo', 'lelkeszi-jelentes-actions.ts')
  const kodCsakD = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const bb = kodCsakD(olvas(BANK_BALANCE))
  if (/nyitoOverride/.test(bb) && /fromDate/.test(bb)) {
    ok('(D) calculateBankCurrencyBalance fogadja a kanonikus nyitót (nyitoOverride + fromDate)')
  } else {
    fail('(D) P3-6: a deviza-egyenleg nem fogadja a kanonikus nyitót — csak a legacy skalárból tud indulni')
  }

  const fa = kodCsakD(olvas(FELSO_INIT))
  const gbcb = fa.indexOf('export async function getBankCurrencyBalance')
  const gbcbW = gbcb >= 0 ? fa.slice(gbcb, gbcb + 4000) : ''
  if (/bankszamla_nyito_egyenleg/.test(gbcbW) && /nyitoOverride/.test(gbcbW)) {
    ok('(D) getBankCurrencyBalance a kanonikus évenkénti táblából oldja fel a nyitót')
  } else {
    fail('(D) P3-6: a getBankCurrencyBalance nem a kanonikus táblából indul — a legacy skalár szivárog')
  }

  const lj = kodCsakD(olvas(LELKESZI))
  if (/resolveNyitoEgyenlegekUseCase/.test(lj) && /kanonikusNyito/.test(lj)) {
    ok('(D) a lelkészi jelentés VII.5-je keresztellenőrzött a kanonikus nyitó-feloldóval')
  } else {
    fail('(D) P3-22: a VII.5 nincs a kanonikus nyitóval keresztellenőrizve — a lánc némán elcsúszhat')
  }

  // NEGATÍV ASSZERT: a minták tényleg buknának a régi világon.
  const regiGbcb = "const result = calculateBankCurrencyBalance(bank, transfers, uptoDate)"
  if (!/bankszamla_nyito_egyenleg/.test(regiGbcb)) {
    ok('(D) NEGATÍV — a régi (kanonikus tábla nélküli) hívásforma tényleg elbukna az őrön')
  } else {
    fail('(D) NEGATÍV — az őr mintája nem különbözteti meg a régi világot: VAK')
  }
}

if (failed) { console.error('\nA nyitó egyenleg önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA nyitó egyenleg önellenőrzés rendben.')
