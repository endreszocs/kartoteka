#!/usr/bin/env node
/**
 * SZÁMLA-ZIP ALÁÍRÁS-FELISMERÉS önellenőrzés (2026-08-28, Endre hibajelzése)
 *
 * MIT ŐRIZ — élesben elsült: az ANAF SPV tömeges ZIP-je (Documente_*.zip) az
 * aláírás-fájlokat `<CÉG>_<SOROZAT>_semnatura_<index>.xml` néven adja — a
 * `semnatura` a fájlnév KÖZEPÉN áll. A szűrő viszont csak a `semnatura_`
 * KEZDETŰ nevet fogta, így mind a 14 aláírás-fájl számlaként próbált
 * parszolódni, és a felület 14 PIROS HIBÁT mutatott egy tökéletesen sikeres
 * importra (a 14 valódi számla közben rendben bekerült).
 *
 * A JAVÍTÁS:
 *   (1) token-alapú felismerés (a `semnatura` _ / - / . határolók közt,
 *       a név ELEJÉN vagy KÖZEPÉN) — a webes zip-kibontóban ÉS a desktop
 *       Oblio-mappaolvasóban;
 *   (2) biztonsági háló: ha az XML gyökere Signature, a feldolgozó
 *       „kihagyott"-ként jelzi, nem hibaként;
 *   (3) a dokumentumtár-lista betöltője try/catch/finally — kivételnél a
 *       hangos hiba-panel + Újrapróbálás, nem örök „Dokumentumok betöltése…".
 *
 * NEGATÍV ASSZERT: prefix-visszabontó + finally-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-szamla-zip-alairas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ZIP = path.join(REPO, 'apps', 'web', 'lib', 'oblio', 'zip-kibonto.ts')
const PARSER = path.join(REPO, 'apps', 'web', 'lib', 'oblio', 'ubl-parser.ts')
const FOLDER = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'oblio', 'oblio-folder.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla-actions.ts')
const MAIN = path.join(REPO, 'apps', 'web', 'components', 'dokumentumtar', 'dokumentumtar-main.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const ALAIRAS_TOKEN_MINTA = 'SEMNATURA_TOKEN_RE'

function ellenoriz(files) {
  const hibak = []

  // ── (1) token-alapú felismerés mindkét helyen ──
  const z = stripComments(files.get(ZIP))
  if (!z.includes(ALAIRAS_TOKEN_MINTA)) {
    hibak.push('zip-kibonto: az aláírás-felismerés nem a közös token-mintát használja — a fájlnév közepén álló semnatura átcsúszik')
  }
  const f = stripComments(files.get(FOLDER))
  if (!f.includes(ALAIRAS_TOKEN_MINTA)) {
    hibak.push('oblio-folder (desktop mappaolvasó): az aláírás-felismerés nem a közös token-mintát használja')
  }

  // ── (2) biztonsági háló a feldolgozóban: Signature-gyökér → kihagyott ──
  const a = stripComments(files.get(ACTIONS))
  if (!/[Ss]ignature/.test(a) || !/kihagyott\.push/.test(a)) {
    hibak.push('szamla-actions: a Signature-gyökerű XML nem kihagyottként jelenik meg — piros hibaként riaszt')
  }

  // ── (3) a lista-betöltő nem ragadhat be ──
  const m = stripComments(files.get(MAIN))
  const iLoad = m.indexOf('const load = useCallback')
  const loadBlokk = iLoad >= 0 ? m.slice(iLoad, iLoad + 1600) : ''
  if (!/catch/.test(loadBlokk) || !/finally/.test(loadBlokk) || !/setLoading\(false\)/.test(loadBlokk)) {
    hibak.push('dokumentumtar-main: a load nincs try/catch/finally-ben — kivételnél örök „Dokumentumok betöltése…" marad')
  }

  return hibak
}

function beolvas() {
  const map = new Map()
  for (const fp of [ZIP, PARSER, FOLDER, ACTIONS, MAIN]) map.set(fp, fs.readFileSync(fp, 'utf8'))
  return map
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('aláírás-token felismerés + Signature-háló + betöltő-védelem a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── VISELKEDÉS — a közös token-regex maga ───────────────────────────────────
if (hibak.length === 0) {
  const pRaw = files.get(PARSER)
  // A regexet a forrásból emeljük ki: const SEMNATURA_TOKEN_RE = /.../i
  const talalat = pRaw.match(/const SEMNATURA_TOKEN_RE = (\/[^\n]+\/i?)/)
  if (!talalat) {
    bukik('a SEMNATURA_TOKEN_RE nem emelhető ki a forrásból (fail-closed)')
  } else {
    let re
    try { re = eval(talalat[1]) } catch { re = null }
    if (!re) bukik('a SEMNATURA_TOKEN_RE nem értelmezhető regexként')
    else {
      const esetek = [
        ['semnatura_6245906283.xml', true, 'prefix-alak'],
        ['semnatura-6245906283.xml', true, 'kötőjeles prefix'],
        ['SOCIETATEAELECTRICAFURNIZARESA_EFI2613512321_semnatura_6245906283.xml', true, 'KÖZÉPEN álló token (ANAF tömeges ZIP)'],
        ['MINDELECTROSERVSRL_MSV2786_semnatura_6416663635.xml', true, 'másik éles példa'],
        ['factura_semnificativ_123.xml', false, 'hasonló, de MÁS szó — nem aláírás'],
        ['CEG_semnaturafoo_1.xml', false, 'token-határ nélkül — nem aláírás'],
        ['SUPPLIER_EFI123_6245906283.xml', false, 'valódi számla-XML'],
      ]
      for (const [nev, vart, magyarazat] of esetek) {
        if (re.test(nev) === vart) pass(`viselkedés: ${magyarazat}`)
        else bukik(`viselkedés: ${magyarazat} — a ${nev} névre ${re.test(nev)} jött, várt: ${vart}`)
      }
    }
  }
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a zip-kibontó visszabontása a régi prefix-ellenőrzésre
  const m1files = beolvas()
  const z1 = m1files.get(ZIP)
  const z1mut = z1.replace(/SEMNATURA_TOKEN_RE/g, 'SEMNATURA_PREFIX_CSAK')
  m1files.set(ZIP, z1mut)
  if (z1mut === z1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a token-minta kiváltására az őr NEM bukik — vak')
  else pass('M1 mutáns (zip-kibontó token-minta kilőve) → az őr elbuktatja')

  // M2: a lista-betöltő finally-jának törlése
  const m2files = beolvas()
  const m2 = m2files.get(MAIN)
  const m2mut = m2.replace(/} finally \{/, '} if (false) {')
  m2files.set(MAIN, m2mut)
  if (m2mut === m2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a finally törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (betöltő finally törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — számla-ZIP aláírás-felismerés rendben`)
