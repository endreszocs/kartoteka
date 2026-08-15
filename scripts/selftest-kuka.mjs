#!/usr/bin/env node
/**
 * KUKA-visszaszámláló önellenőrzés — build/tesztkeret nélkül futtatható
 * (a selftest-keszpenz-korlatok.mjs mintájára).
 *
 * MIT ŐRIZ (2026-08-14, 6. pont 2. ütem):
 *  - a 30 napos megőrzési idő és a napszámítás (ceil, 0-alsó-korlát)
 *  - a PONTOS ↔ BECSLÉS feliratok szétválasztása: becslésnél KÖTELEZŐ a
 *    „legfeljebb" szó (nem hazudunk pontosságot), pontos dátumnál tilos
 *  - a lejárt sor „bármikor törlődhet" felirata
 *
 * 2026-08-15 (desktop-paritás 3. szelet): a kanonikus visszaszámláló a közös
 * csomagba költözött — packages/ui-app/src/recycle-bin/countdown.ts (a webes
 * apps/web/lib/offline/recycle-bin-countdown.ts már csak re-export). A
 * selftest a KANONIKUS példányt fordítja: az NULLA importtal készül, ezért
 * önállóan fordítható.
 *
 * Futtatás:  node scripts/selftest-kuka.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(
  REPO_ROOT, 'packages', 'ui-app', 'src', 'recycle-bin', 'countdown.ts',
)

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-kuka-selftest-'))
const out = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'recycle-bin-countdown.ts',
})
if (/require\(["'][^."']/.test(out.outputText)) {
  fail('FUTÁSIDEJŰ IMPORT került a fájlba — a modulnak önállónak kell maradnia.')
  process.exit(1)
}
const dest = path.join(tmp, 'recycle-bin-countdown.js')
fs.writeFileSync(dest, out.outputText, 'utf8')
const M = require_(dest)

const {
  RECYCLE_BIN_RETENTION_DAYS,
  purgeCountdownDays,
  purgeCountdownLabel,
  deletedDateSuffix,
  exactKey,
} = M

const NAP_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-14T12:00:00Z')

// U1: a megőrzési idő 30 nap — a purge_recycle_bin() SQL-lel közös ígéret
if (RECYCLE_BIN_RETENTION_DAYS === 30) ok('U1: RECYCLE_BIN_RETENTION_DAYS = 30')
else fail(`U1: a megőrzési idő ${RECYCLE_BIN_RETENTION_DAYS}, nem 30`)

// U2: dátum nélkül nincs számláló
if (purgeCountdownDays(null, NOW) === null && purgeCountdownDays(undefined, NOW) === null) {
  ok('U2: hiányzó dátum → null (nincs hamis számláló)')
} else fail('U2: hiányzó dátumra nem null jött')

// U3: értelmezhetetlen dátum → null
if (purgeCountdownDays('nem-datum', NOW) === null) ok('U3: rossz dátum → null')
else fail('U3: rossz dátumra nem null jött')

// U4: friss törlés → 30 nap
if (purgeCountdownDays(new Date(NOW).toISOString(), NOW) === 30) {
  ok('U4: most törölt sor → 30 nap')
} else fail(`U4: most törölt sorra ${purgeCountdownDays(new Date(NOW).toISOString(), NOW)} jött (várt: 30)`)

// U5: 10 napja törölt → 20 nap
const d10 = new Date(NOW - 10 * NAP_MS).toISOString()
if (purgeCountdownDays(d10, NOW) === 20) ok('U5: 10 napja törölt → 20 nap')
else fail(`U5: 10 napja törölt sorra ${purgeCountdownDays(d10, NOW)} jött (várt: 20)`)

// U6: tört nap FELFELÉ kerekít (29,5 nap telt el → 1 nap van hátra)
const d295 = new Date(NOW - 29.5 * NAP_MS).toISOString()
if (purgeCountdownDays(d295, NOW) === 1) ok('U6: 29,5 eltelt nap → 1 nap hátra (ceil)')
else fail(`U6: 29,5 eltelt napra ${purgeCountdownDays(d295, NOW)} jött (várt: 1)`)

// U7: lejárt sor sem megy mínuszba
const d40 = new Date(NOW - 40 * NAP_MS).toISOString()
if (purgeCountdownDays(d40, NOW) === 0) ok('U7: 40 napja törölt → 0 (nincs negatív)')
else fail(`U7: 40 napja törölt sorra ${purgeCountdownDays(d40, NOW)} jött (várt: 0)`)

// U8: BECSLÉS-felirat kötelezően „legfeljebb"-bel kezd
const becsles = purgeCountdownLabel(12, false)
if (becsles && becsles.startsWith('legfeljebb ') && becsles.includes('12 nap')) {
  ok('U8: becslés-felirat „legfeljebb 12 nap…"')
} else fail(`U8: becslés-felirat rossz: "${becsles}"`)

// U9: PONTOS felirat NEM tartalmaz „legfeljebb"-et
const pontos = purgeCountdownLabel(12, true)
if (pontos && !pontos.includes('legfeljebb') && pontos.includes('12 nap')) {
  ok('U9: pontos felirat „12 nap…" (nincs legfeljebb)')
} else fail(`U9: pontos felirat rossz: "${pontos}"`)

// U10: lejárt sor felirata mindkét módban a figyelmeztetés
if (
  purgeCountdownLabel(0, true) === 'Bármikor törlődhet véglegesen!' &&
  purgeCountdownLabel(0, false) === 'Bármikor törlődhet véglegesen!'
) ok('U10: 0 nap → „Bármikor törlődhet véglegesen!"')
else fail('U10: a 0 napos felirat nem a figyelmeztetés')

// U11: null napszám → nincs felirat
if (purgeCountdownLabel(null, true) === null) ok('U11: null napszám → null felirat')
else fail('U11: null napszámra nem null felirat jött')

// U12: a dátum-kiegészítő csak becslésnél jelzi a módosítás-napot
if (deletedDateSuffix(true) === '' && deletedDateSuffix(false).includes('módosítás')) {
  ok('U12: dátum-kiegészítő pontos↔becslés helyes')
} else fail('U12: a dátum-kiegészítő rossz')

// U13: a pontos-dátum térkép kulcsa tábla:id
if (exactKey('befizetes', 42) === 'befizetes:42' && exactKey('leltar_tetelek', 'abc') === 'leltar_tetelek:abc') {
  ok('U13: exactKey formátum tábla:id')
} else fail('U13: exactKey formátum rossz')

// U14: a szerver-akció és a helper kulcsképzése NEM térhet szét — a
// kuka/actions.ts-ben a térkép kulcsa szövegszerűen `${item.table}:${row.id}` kell legyen
const actionsSrc = fs.readFileSync(
  path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'kuka', 'actions.ts'), 'utf8',
)
if (actionsSrc.includes('`${item.table}:${row.id}`')) {
  ok('U14: a fetchExactDeletedAt kulcsa tábla:id (egyezik az exactKey-jel)')
} else fail('U14: a fetchExactDeletedAt kulcsképzése eltérhet az exactKey-től — ellenőrizd!')

// U15: JÖVŐBELI deleted_at (a kliens órája a szerveré mögött jár) sem adhat
// 30-nál többet — a felirat sehol nem ígérhet 31 napot
const jovobeli = new Date(NOW + 60 * 1000).toISOString()
if (purgeCountdownDays(jovobeli, NOW) === 30) {
  ok('U15: jövőbeli deleted_at (óra-eltérés) → 30 nap (felső vágás)')
} else fail(`U15: jövőbeli deleted_at-ra ${purgeCountdownDays(jovobeli, NOW)} jött (várt: 30)`)

// U16: a szerver-akció fail-closed — congregation-kontextus nélkül üres
// választ ad (a „NULL skalár → szűretlen lista" hibaosztály őre)
if (/if \(!congregationId\) return \{\}/.test(actionsSrc)) {
  ok('U16: fetchExactDeletedAt fail-closed (nincs congregationId → üres)')
} else fail('U16: HIÁNYZIK a fail-closed korai return a fetchExactDeletedAt-ból!')

if (failed) { console.error('\nKUKA selftest: HIBA'); process.exit(1) }
console.log('\nKUKA selftest: minden rendben ✅')
