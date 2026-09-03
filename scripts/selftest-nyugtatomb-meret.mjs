#!/usr/bin/env node
/**
 * NYUGTATÖMB LAPSZÁMA önellenőrzés (2026-09-02, Endre javítása)
 *
 * MIT ŐRIZ — Endre észrevétele: „A nyugtatömbökben nem 100, hanem 50 lap van."
 * Az EREK-től vásárolt, sorszámozott nyugtatömb 50 lapos. A rendszer korábban
 * 100-as korláttal dolgozott, ráadásul HÁROM helyen külön leírva.
 *
 * Négy, egymástól függetlenül elromolható dolog:
 *
 *   (1) A KONSTANS értéke 50, és EGYETLEN helyen él
 *       (`packages/validations/src/finance/chitanta-tomb.ts`).
 *
 *   (2) MIND A HÁROM rögzítő út a konstansra hivatkozik — nem saját számra:
 *       gyülekezeti varázsló + szerver-action, egyházkerületi action,
 *       egyházmegyei action. Ha bármelyik saját literált használ, egy későbbi
 *       módosítás NÉMÁN kihagyná azt a felületet, és ott továbbra is fel
 *       lehetne venni 100 lapos tömböt.
 *
 *   (3) NINCS visszamaradt 100-as tömbméret-korlát a domainben.
 *
 *   (4) A MEGLÉVŐ SOROK NEM TÖRNEK EL: a `chitantaTombRowSchema` (a DB-ből
 *       beolvasott sor sémája) SZÁNDÉKOSAN nem tartalmazhatja a korlátot —
 *       különben a régi, 100-as tartománnyal felvett tömbök beolvasása bukna,
 *       és a lelkész nem látná a saját nyugtatömbjeit.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-nyugtatomb-meret.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const VALID = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'chitanta-tomb.ts')
const WIZARD = path.join(REPO, 'apps', 'web', 'components', 'modals', 'chitanta-tomb-wizard-dialog.tsx')
const GYUL = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'chitanta-tombok-actions.ts')
const KER = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dashboard-kerulet', 'chitanta-tombok-actions.ts')
const KER_UI = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dashboard-kerulet', 'nyugtatombok', 'nyugtatomb-kezelo.tsx')
const MEGYE = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dashboard-egyhazmegye', 'chitanta-tombok-actions.ts')
const MEGYE_UI = path.join(REPO, 'apps', 'web', 'components', 'dashboard', 'diocese', 'diocese-chitanta-tombok-section.tsx')

let failed = false
function ok(m) { console.log(`OK:   ${m}`) }
function fail(m) { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
/** Kommentek nélkül — egy komment sosem lehet bizonyíték a viselkedésre. */
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [VALID, WIZARD, GYUL, KER, KER_UI, MEGYE, MEGYE_UI]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA nyugtatömb-méret önellenőrzés ELBUKOTT.'); process.exit(1) }

// ── (1) A KONSTANS ÉRTÉKE ────────────────────────────────────────────────
const validNyers = olvas(VALID)
const validKod = kodCsak(validNyers)

const KONSTANS = /export\s+const\s+MAX_NYUGTA_TOMBBEN\s*=\s*(\d+)/
const talalat = KONSTANS.exec(validKod)
if (!talalat) {
  fail('(1) nincs exportált MAX_NYUGTA_TOMBBEN konstans a validations csomagban')
} else if (Number(talalat[1]) !== 50) {
  fail(`(1) a MAX_NYUGTA_TOMBBEN értéke ${talalat[1]}, de a nyugtatömb 50 lapos`)
} else {
  ok('(1) MAX_NYUGTA_TOMBBEN = 50 — egy nyugtatömb 50 lapos')
}

// A create-séma a KONSTANSRA hivatkozzon, ne beírt számra.
const REFINE = /szam_veg\s*-\s*v\.szam_kezdet\s*\+\s*1\s*<=\s*MAX_NYUGTA_TOMBBEN/
if (REFINE.test(validKod)) ok('(1) a create-séma a konstansra hivatkozik (nem beírt számra)')
else fail('(1) a create-séma nem a MAX_NYUGTA_TOMBBEN konstansra hivatkozik')

// NEGATÍV: 100-ra visszaírt konstanst az őrnek el kell kapnia.
{
  const mutans = kodCsak(validNyers.replace('MAX_NYUGTA_TOMBBEN = 50', 'MAX_NYUGTA_TOMBBEN = 100'))
  const mm = KONSTANS.exec(mutans)
  if (mm && Number(mm[1]) !== 50) ok('NEGATÍV — a 100-ra visszaírt konstanst az őr elkapná')
  else fail('NEGATÍV — a mutáns is átment: az őr VAK a konstans visszaírására')
}

// ── (2) MIND A HÁROM RÖGZÍTŐ ÚT A KONSTANSRA HIVATKOZIK ──────────────────
const UTAK = [
  ['gyülekezeti varázsló', WIZARD],
  ['gyülekezeti szerver-action', GYUL],
  ['egyházkerületi szerver-action', KER],
  ['egyházkerületi rögzítő felület', KER_UI],
  ['egyházmegyei szerver-action', MEGYE],
  ['egyházmegyei rögzítő felület', MEGYE_UI],
]

for (const [cimke, ut] of UTAK) {
  const nyers = olvas(ut)
  const kod = kodCsak(nyers)
  if (!/MAX_NYUGTA_TOMBBEN/.test(kod)) {
    fail(`(2) ${cimke} — nem hivatkozik a MAX_NYUGTA_TOMBBEN konstansra: itt továbbra is fel lehetne venni 100 lapos tömböt`)
    continue
  }
  // NEGATÍV: ha a hivatkozás kiesik, az őrnek buknia kell.
  const mutans = kodCsak(nyers.replace(/MAX_NYUGTA_TOMBBEN/g, 'SZAZ'))
  if (/MAX_NYUGTA_TOMBBEN/.test(mutans)) fail(`(2) ${cimke} — az őr VAK: a mutáns is átment`)
  else ok(`(2) ${cimke} — a közös konstansból veszi a korlátot`)
}

// A korlát tényleg KAPU is, nem csak importált szimbólum.
for (const [cimke, ut] of [
  ['gyülekezeti szerver-action', GYUL],
  ['egyházkerületi szerver-action', KER],
  ['egyházmegyei szerver-action', MEGYE],
]) {
  const kod = kodCsak(olvas(ut))
  if (/>\s*MAX_NYUGTA_TOMBBEN/.test(kod)) ok(`(2) ${cimke} — a szerver VISSZAUTASÍTJA a túl hosszú tartományt`)
  else fail(`(2) ${cimke} — a konstans importálva van, de nincs rá ellenőrzés: a kapu nyitva`)
}

// ── (3) NINCS VISSZAMARADT 100-AS TÖMBMÉRET-KORLÁT ───────────────────────
const SZAZ_MINTAK = [
  { minta: /darabszam\s*>\s*100\b/, nev: 'darabszam > 100' },
  { minta: /\bd\s*<=\s*100\b/, nev: 'd <= 100' },
  { minta: /\bdb\s*>\s*100\b/, nev: 'db > 100' },
  { minta: /\+\s*1\s*<=\s*100\b/, nev: 'szam_veg - szam_kezdet + 1 <= 100' },
  { minta: /max\.?\s*100\s*nyugta/i, nev: '„max. 100 nyugta" szöveg' },
  { minta: /legfeljebb\s*100\s*nyugta/i, nev: '„legfeljebb 100 nyugta" szöveg' },
]
for (const [cimke, ut] of [...UTAK, ['validations séma', VALID]]) {
  // Itt a KOMMENTEKET IS nézzük: a félrevezető súgószöveg is hiba.
  const nyers = olvas(ut)
  const talaltak = SZAZ_MINTAK.filter((s) => s.minta.test(nyers)).map((s) => s.nev)
  if (talaltak.length) fail(`(3) ${cimke} — visszamaradt 100-as tömbméret: ${talaltak.join(', ')}`)
  else ok(`(3) ${cimke} — nincs visszamaradt 100-as korlát`)
}
// NEGATÍV: a mintáknak tényleg fogniuk kell.
{
  const hamisVilag = 'if (darabszam > 100) { return { error: "egy tömbben max. 100 nyugta lehet" } }'
  if (SZAZ_MINTAK.some((s) => s.minta.test(hamisVilag))) ok('NEGATÍV — a régi 100-as korlátot a minták elkapják')
  else fail('NEGATÍV — a 100-kereső minták VAKOK: a régi világ is átmenne')
}

// ── (4) A MEGLÉVŐ (RÉGI, 100-AS) SOROK NEM TÖRNEK EL ─────────────────────
{
  const rowResz = validKod.split('chitantaTombRowSchema')[1] ?? ''
  if (!rowResz) {
    fail('(4) a chitantaTombRowSchema nem található — nem tudjuk őrizni a régi sorok beolvashatóságát')
  } else {
    // A row-séma a create-séma ELŐTT áll; az utána következő create-részt kihagyjuk.
    const rowCsak = rowResz.split('createChitantaTombInputSchema')[0] ?? rowResz
    if (/MAX_NYUGTA_TOMBBEN/.test(rowCsak)) {
      fail('(4) a row-sémába bekerült a tömbméret-korlát: a régi, 100-as tömbök beolvasása elbukna')
    } else {
      ok('(4) a row-séma korlát nélkül olvassa be a meglévő (akár 100-as) tömböket')
    }
  }
  // NEGATÍV: ha valaki beleírja, buknia kell.
  const mutansForras = validKod.replace(
    'export const chitantaTombRowSchema',
    'export const chitantaTombRowSchema_MAX_NYUGTA_TOMBBEN_',
  )
  const mResz = mutansForras.split('chitantaTombRowSchema')[1] ?? ''
  const mRowCsak = mResz.split('createChitantaTombInputSchema')[0] ?? mResz
  if (/MAX_NYUGTA_TOMBBEN/.test(mRowCsak)) ok('NEGATÍV — a row-sémába szivárgó korlátot az őr elkapná')
  else fail('NEGATÍV — az őr VAK: a row-sémába szivárgó korlát átmenne')
}

if (failed) { console.error('\nA nyugtatömb-méret önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA nyugtatömb-méret önellenőrzés rendben.')
