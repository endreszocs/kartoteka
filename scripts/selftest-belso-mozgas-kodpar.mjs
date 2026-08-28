#!/usr/bin/env node
/**
 * BELSŐ MOZGÁS KÓDPÁR önellenőrzés (2026-08-27)
 *
 * MIT ŐRIZ — élesben elsülő adathiba:
 *   A banki import belső mozgás ága a varázslótól kapott EGYETLEN `categoryId`-t
 *   írta a pár MINDKÉT oldalára: egyszer `id_befizetescel`-ként, egyszer
 *   `id_kiadascel`-ként. Ez KÉT KÜLÖN TÁBLA, KÉT KÜLÖN azonosító-térrel.
 *   A varázsló belső mozgásnál ráadásul MINDIG a kiadás-listát adja, tehát a
 *   kapott szám egy `kiadascel.id` — a bevétel-oldal FK-jába írva vagy hibára
 *   fut, vagy NÉMÁN teljesen más befizetési célra mutat.
 *
 * A leképezést HÁROM FÜGGETLEN FORRÁSHOZ mérjük — nem egyhez:
 *   (A) a hivatalos EREK Excel szemantikája (Adatok_2025.xlsx, Hibak katalógus),
 *   (B) az ÉLŐ junction-táblák 2026-08-27-i mérése (mind a 6 kód feloldható),
 *   (C) a kézi rögzítő (actions.ts saveInternalTransfer) kódpárjai.
 *
 * NEGATÍV ASSZERT: a régi (hibás) viselkedés visszajátszása — bizonyítjuk,
 * hogy a mai leképezés elbuktatná, és hogy a felcserélt irány is bukik.
 *
 * Futtatás:  node scripts/selftest-belso-mozgas-kodpar.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SRC = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'belso-mozgas-kodok.ts')
const HASZNALO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'import-transactions.ts')
const ROGZITO = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik: ${SRC}`); process.exit(1) }

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-bmkod-'))
const raw = fs.readFileSync(SRC, 'utf8')
const out = ts.transpileModule(raw, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'belso-mozgas-kodok.ts',
})
if (/require\(["'][^."']/.test(out.outputText)) {
  fail('a modul külső importot kapott — tiszta, import nélküli modulnak kell maradnia')
}
const file = path.join(tmp, 'bmkod.cjs')
fs.writeFileSync(file, out.outputText, 'utf8')
const mod = require_(file)
const { belsoMozgasKodpar, BELSO_MOZGAS_KANONIKUS_KODOK } = mod

// ── (A) AZ EXCEL SZEMANTIKÁJA ────────────────────────────────────────────
// A hivatalos katalógus szerint (mérve az Adatok_2025.xlsx Hibak lapján):
//   400.01 „Készpénzletétel a(z) A számlára"   → Kassza lap KIADÁS
//   301.01 „Készpénzletétel a kasszából - A"   → A lap BEVÉTEL
//   300.01 „Készpénzfelvétel a(z) A számláról" → Kassza lap BEVÉTEL
//   401.01 „Készpénzfelvétel a kasszába - A"   → A lap KIADÁS
const ESETEK = [
  {
    nev: 'kassza → bank (LETÉT): a bank kap, a kassza ad',
    isKasszaTarget: true, isBankToKassza: false,
    vart: { bevKod: '301.01', kiaKod: '400.01' },
  },
  {
    nev: 'bank → kassza (FELVÉT): a kassza kap, a bank ad',
    isKasszaTarget: true, isBankToKassza: true,
    vart: { bevKod: '300.01', kiaKod: '401.01' },
  },
  {
    nev: 'bank ↔ bank: mindkét oldal 402.02',
    isKasszaTarget: false, isBankToKassza: true,
    vart: { bevKod: '402.02', kiaKod: '402.02' },
  },
  {
    nev: 'bank ↔ bank (másik irány): szintén 402.02',
    isKasszaTarget: false, isBankToKassza: false,
    vart: { bevKod: '402.02', kiaKod: '402.02' },
  },
]
for (const e of ESETEK) {
  const kapott = belsoMozgasKodpar(e.isKasszaTarget, e.isBankToKassza)
  if (kapott.bevKod === e.vart.bevKod && kapott.kiaKod === e.vart.kiaKod) {
    ok(`(A) Excel-szemantika — ${e.nev}: ${kapott.bevKod} / ${kapott.kiaKod}`)
  } else {
    fail(`(A) ${e.nev}: várt ${e.vart.bevKod}/${e.vart.kiaKod}, kapott ${kapott.bevKod}/${kapott.kiaKod}`)
  }
}

// ── (B) AZ ÉLŐ JUNCTION-TÁBLÁK ───────────────────────────────────────────
// A 2026-08-27-i mérés: MELYIK kód MELYIK táblában oldható fel.
// Ha egy irányhoz olyan kódot rendelnénk, ami a saját táblájában NEM létezik,
// az import fail-closed hibára futna — vagyis a funkció használhatatlan lenne.
const ELO_BEV = new Set(['300.01', '301.01', '301.02', '401.01', '402.02']) // befizetescel
const ELO_KIA = new Set(['400.01', '401.01', '401.02', '402.02'])           // kiadascel
for (const e of ESETEK) {
  const { bevKod, kiaKod } = belsoMozgasKodpar(e.isKasszaTarget, e.isBankToKassza)
  const bevOk = ELO_BEV.has(bevKod)
  const kiaOk = ELO_KIA.has(kiaKod)
  if (bevOk && kiaOk) ok(`(B) élő junction — ${e.nev}: mindkét kód feloldható`)
  else fail(`(B) ${e.nev}: bev ${bevKod}=${bevOk ? 'ok' : 'NINCS a befizetescel-ben'}, kia ${kiaKod}=${kiaOk ? 'ok' : 'NINCS a kiadascel-ben'}`)
}

// ── (C) A KÉZI RÖGZÍTŐ ────────────────────────────────────────────────────
// A saveInternalTransfer BETŰRE ugyanezt a párosítást használja. Ha a kettő
// széthúz, ugyanaz a művelet két különböző kódot kapna aszerint, hogy kézzel
// vagy importból rögzítik — ezt kell megakadályozni.
if (fs.existsSync(ROGZITO)) {
  const r = fs.readFileSync(ROGZITO, 'utf8')
  const bev = r.match(/bevKod\s*=\s*isDeposit\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/)
  const kia = r.match(/kiaKod\s*=\s*isDeposit\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/)
  if (!bev || !kia) {
    fail('(C) nem található a kézi rögzítő bevKod/kiaKod párosítása — az összevetés nem végezhető el')
  } else {
    // isDeposit = kassza→bank (letét) ; !isDeposit = bank→kassza (felvét)
    const letet = belsoMozgasKodpar(true, false)
    const felvet = belsoMozgasKodpar(true, true)
    const egyezik =
      bev[1] === letet.bevKod && kia[1] === letet.kiaKod &&
      bev[2] === felvet.bevKod && kia[2] === felvet.kiaKod
    if (egyezik) ok(`(C) a kézi rögzítő UGYANEZT a párosítást használja (letét ${bev[1]}/${kia[1]}, felvét ${bev[2]}/${kia[2]})`)
    else fail(`(C) SZÉTHÚZÁS a kézi rögzítővel: rögzítő letét=${bev[1]}/${kia[1]} felvét=${bev[2]}/${kia[2]}, import letét=${letet.bevKod}/${letet.kiaKod} felvét=${felvet.bevKod}/${felvet.kiaKod}`)
  }
} else {
  fail(`(C) hiányzik a kézi rögzítő: ${ROGZITO}`)
}

// ── (D) A HASZNÁLÓ: nem maradt-e kereszt-táblás categoryId ───────────────
if (fs.existsSync(HASZNALO)) {
  const h = fs.readFileSync(HASZNALO, 'utf8')
  const rossz = [
    /id_befizetescel:\s*item\.categoryId\s*\?\?\s*null/,
    /id_kiadascel:\s*item\.categoryId\s*\?\?\s*null/,
  ]
  const talalt = rossz.filter((re) => re.test(h))
  if (talalt.length === 0) ok('(D) a belső mozgás ágban nincs kereszt-táblás `item.categoryId` beszúrás')
  else fail(`(D) VISSZATÉRT A HIBA: ${talalt.length} helyen még item.categoryId megy a junction-FK-ba`)
  if (/const \{ bevKod, kiaKod \} = belsoMozgasKodpar\(/.test(h)) ok('(D) a használó a kanonikus kódpárból old fel')
  else fail('(D) a használó NEM a belsoMozgasKodpar()-t hívja')
}

// ── (E) A HASZNÁLÓ A MEGBÍZHATÓ JELBŐL DÖNT ──────────────────────────────
// A `transferToKassza` mezőt a teljes forrásban SEMMI nem állítja be (nincs
// hozzá UI-kapcsoló), ezért az `isKasszaTarget` MINDIG false — miközben a
// `counterpartBankId` ugyanott null, azaz a pénz VALÓJÁBAN a kasszába megy.
// Ha a használó az `isKasszaTarget`-re építene, bank↔bank kódot (402.02) írna
// egy kassza-oldali sorra. Ez az őr azt védi, hogy a `counterpartBankId`-ből
// döntsön — és külön bizonyítja, hogy a `transferToKassza` tényleg halott.
if (fs.existsSync(HASZNALO)) {
  const h = fs.readFileSync(HASZNALO, 'utf8')
  if (/belsoMozgasKodpar\(\s*counterpartIsKassza\s*,/.test(h)) {
    ok('(E) a használó a counterpartBankId-ből dönt (nem a halott isKasszaTarget-ből)')
  } else if (/belsoMozgasKodpar\(\s*isKasszaTarget\s*,/.test(h)) {
    fail('(E) a használó az isKasszaTarget-re épít — az MINDIG false, így kassza-mozgásra bank↔bank kód (402.02) kerülne')
  } else {
    fail('(E) nem tudom megállapítani, mibol dont a hasznalo')
  }
}
// A `transferToKassza` halottsága MÉRVE, nem feltételezve: ha valaki bekötné
// (UI-kapcsolót ad hozzá), ez az őr FIGYELMEZTET, hogy a fenti érvelés elavult.
{
  const irok = []
  for (const f of [
    path.join(REPO, 'apps', 'web', 'components', 'modals', 'bcr-import-wizard-dialog.tsx'),
    path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BcrImportWizardBody.tsx'),
  ]) {
    if (!fs.existsSync(f)) continue
    const src = fs.readFileSync(f, 'utf8')
    // ÍRÁS = updateDecision-patchben vagy értékadásban szerepel, nem csak olvasva.
    if (/transferToKassza\s*:\s*(true|false|!)/.test(src)) irok.push(path.basename(f))
  }
  if (irok.length === 0) {
    ok('(E) a transferToKassza tényleg halott (senki nem állítja be) — az érvelés érvényes')
  } else {
    fail(`(E) FIGYELEM: a transferToKassza MÁR ÍRVA VAN (${irok.join(', ')}) — nézd át, hogy a counterpartBankId-alapú döntés még helyes-e`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  NEGATÍV ASSZERT — a hibás világ visszajátszása
// ══════════════════════════════════════════════════════════════════════════
// (1) Ha a leképezés FELCSERÉLNÉ az irányt, az (A) próba bukna.
const felcserelt = (isKasszaTarget, isBankToKassza) =>
  belsoMozgasKodpar(isKasszaTarget, !isBankToKassza)
const letetFelcserelt = felcserelt(true, false)
if (letetFelcserelt.bevKod === '301.01' && letetFelcserelt.kiaKod === '400.01') {
  fail('AZ ŐRSZEM VAK: a felcserélt irány UGYANAZT adja — a próba nem különbözteti meg az irányokat')
} else {
  ok('negatív asszert: a felcserélt irány MÁS kódpárt ad — a próba iránytól függ')
}
// (2) A kanonikus készlet ne szűküljön észrevétlenül.
if (BELSO_MOZGAS_KANONIKUS_KODOK.length === 5) ok('a kanonikus készlet 5 kód')
else fail(`a kanonikus készlet ${BELSO_MOZGAS_KANONIKUS_KODOK.length} kód — várt 5`)

try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
if (failed) {
  console.error('\nBELSŐ MOZGÁS KÓDPÁR ÖNELLENŐRZÉS: BUKOTT')
  process.exit(1)
}
console.log('\nBELSŐ MOZGÁS KÓDPÁR ÖNELLENŐRZÉS: RENDBEN')
