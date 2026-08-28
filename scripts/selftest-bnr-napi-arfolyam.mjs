#!/usr/bin/env node
/**
 * BNR NAPI ÁRFOLYAM önellenőrzés (P0-18, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-18 találata:
 *   (a) A fetchBnrRates (web) és a fetchBnrRatesDesktop (desktop-port) a
 *       `!isHistorical || isCurrentYear` feltétellel az AKTUÁLIS ÉV BÁRMELY
 *       történelmi dátumára a NAPI (mai) XML-t adta vissza — az idei devizás
 *       bank-import minden tétele a MAI kurzuson konvertálódott a tétel napi
 *       árfolyama helyett.
 *   (b) A desktop bank-import egyáltalán nem adott át dailyRates-t a közös
 *       use-case-nek → devizás számlán a web és a desktop ugyanarra a
 *       kivonatra KÜLÖNBÖZŐ osszeg_ron-t könyvelt.
 *
 * A JAVÍTOTT VILÁG:
 *   (1) a napi XML-t csak a TÉNYLEG aktuális kérés kapja (nincs targetDate,
 *       vagy targetDate = a bukaresti mai nap); minden más történelmi dátum —
 *       az ideiek is — az ÉVES XML-en (≤ target Cube) megy, Frankfurter
 *       historikus fallbackkel,
 *   (2) a desktop bank-import a web collectDailyRates mintájára napi
 *       árfolyam-mapet gyűjt és átadja a use-case-nek,
 *   (3) az éves XML-ből a ≤ target legkésőbbi publikáció választódik
 *       (viselkedési teszt a pure parseBnrYearlyXml-en).
 *
 * NEGATÍV ASSZERT: az isCurrentYear-ág visszaírása + a dailyRates-átadás
 * eltávolítása — az őrnek mindkettőre buknia kell.
 *
 * Futtatás:  node scripts/selftest-bnr-napi-arfolyam.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const WEB_BNR = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'bnr-exchange-rate.ts')
const DESKTOP_BNR = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'bnr-rate.ts')
const DESKTOP_PAGE = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'bank-import-page.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenorizFetcher(nev, src) {
  const s = stripComments(src)
  const hibak = []
  if (/!isHistorical \|\| isCurrentYear/.test(s)) {
    hibak.push(`${nev}: a napi-XML ág feltétele még '!isHistorical || isCurrentYear' — az idei történelmi dátumok a MAI kurzust kapják`)
  }
  if (!/localTodayIso/.test(s)) {
    hibak.push(`${nev}: a napi-XML ág nem a bukaresti mai naphoz köti magát (localTodayIso hiányzik)`)
  }
  return hibak
}

const webRaw = fs.readFileSync(WEB_BNR, 'utf8')
const desktopRaw = fs.readFileSync(DESKTOP_BNR, 'utf8')
const pageRaw = fs.readFileSync(DESKTOP_PAGE, 'utf8')

// ── (1) A két fetcher napi-ága csak a TÉNYLEG mai kérésre fut ───────────────
{
  const hibak = [...ellenorizFetcher('web fetchBnrRates', webRaw), ...ellenorizFetcher('desktop fetchBnrRatesDesktop', desktopRaw)]
  if (hibak.length === 0) pass('mindkét fetcher napi-XML ága csak a tényleg mai kérésre fut (történelmi idei dátum → éves XML / Frankfurter)')
  else for (const h of hibak) bukik(h)
}

// ── (2) A desktop bank-import dailyRates-t gyűjt és ad át ───────────────────
{
  const s = stripComments(pageRaw)
  const i = s.indexOf('importBankTransactionsUseCase(')
  const hivas = i >= 0 ? s.slice(i, i + 400) : ''
  if (i < 0) bukik('a desktop importBankTransactionsUseCase-hívása nem található (fail-closed)')
  else if (!/dailyRates/.test(hivas)) bukik('a desktop bank-import NEM ad át dailyRates-t — devizás számlán a web és a desktop más RON-t könyvel')
  else if (!/collectDailyRatesDesktop/.test(s)) bukik('a desktop nem a collectDailyRatesDesktop gyűjtőt használja')
  else pass('a desktop bank-import napi árfolyam-mapet gyűjt és átad a közös use-case-nek')
}

// ── (3) VISELKEDÉS — az éves XML ≤ target kiválasztása (pure függvény) ──────
const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — a viselkedési ág kihagyva')
  ts = null
}
if (ts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-bnr-'))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  // A web bnr-modul a @kartoteka/validations-ból importál — a tmp-be a valódi
  // local-date.ts transpile-ját tesszük be a csomag helyére (a fetch-et nem hívjuk).
  const localDateRaw = fs.readFileSync(path.join(REPO, 'packages', 'validations', 'src', 'local-date.ts'), 'utf8')
  const pkgDir = path.join(tmp, 'node_modules', '@kartoteka', 'validations')
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"@kartoteka/validations","main":"index.js"}', 'utf8')
  const localDateOut = ts.transpileModule(localDateRaw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'local-date.ts',
  })
  fs.writeFileSync(path.join(pkgDir, 'index.js'), localDateOut.outputText, 'utf8')
  const out = ts.transpileModule(webRaw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'bnr.ts',
  })
  fs.writeFileSync(path.join(tmp, 'bnr.js'), out.outputText, 'utf8')
  const mod = require_(path.join(tmp, 'bnr.js'))
  const XML = `
    <Body>
      <Cube date="2026-03-06"><Rate currency="EUR">4.9000</Rate></Cube>
      <Cube date="2026-03-09"><Rate currency="EUR">4.9500</Rate></Cube>
      <Cube date="2026-08-27"><Rate currency="EUR">5.1000</Rate></Cube>
    </Body>`
  const r = mod.parseBnrYearlyXml(XML, '2026-03-10')
  if (!r || r.date !== '2026-03-09' || r.eur !== 4.95) {
    bukik(`parseBnrYearlyXml: a 2026-03-10 targethez a ≤ legkésőbbi (2026-03-09, 4.95) kell — kapott: ${r && r.date}, ${r && r.eur}`)
  } else {
    pass('viselkedés — az éves XML-ből a ≤ target legkésőbbi publikáció választódik (nem a mai)')
  }
}

// ── (4) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1: az isCurrentYear-ág visszaírása a webbe
  const m1 = webRaw.replace(/!isHistorical \|\| targetDate === localTodayIso\(\)/, '!isHistorical || isCurrentYear')
  if (m1 === webRaw) bukik('M1 mutáció nem változtatott a weben (fail-closed)')
  else if (ellenorizFetcher('web', m1).length === 0) bukik('M1: az isCurrentYear visszaírására az őr NEM bukik — vak')
  else pass('M1 mutáns (isCurrentYear visszaírva) → az őr elbuktatja')

  // M2: a dailyRates-átadás eltávolítása a desktop use-case-hívásból
  const m2 = pageRaw.replace(/\{ congregationId, items, dailyRates \}/, '{ congregationId, items }')
  if (m2 === pageRaw) bukik('M2 mutáció nem változtatott a desktopon (fail-closed)')
  else {
    const s2 = stripComments(m2)
    const i2 = s2.indexOf('importBankTransactionsUseCase(')
    const hivas2 = i2 >= 0 ? s2.slice(i2, i2 + 400) : ''
    if (/dailyRates/.test(hivas2)) bukik('M2: a dailyRates-elhagyó mutánsra az őr NEM bukik — vak')
    else pass('M2 mutáns (dailyRates elhagyva) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — BNR napi árfolyam kezelés rendben`)
