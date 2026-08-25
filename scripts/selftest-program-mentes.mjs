// selftest-program-mentes.mjs — az „Új program" mentés néma bukásának őrszemei
//
// ⛔ MI VOLT A HIBA (2026-08-25, Endre élesben találta)
//   A program-dialógus rejtett `id` mezője ÚJ programnál üres sztringet ('')
//   ad, a programSchema viszont `z.string().uuid().optional()`-lel csak
//   érvényes uuid-t VAGY hiányzó értéket fogadott el. A zod-resolver az `id`
//   mezőn bukott — aminek NINCS kirajzolt hibaüzenete —, így a Mentés gombra
//   kattintva LÁTSZÓLAG SEMMI nem történt.
//
// ŐRSZEMEK
//   P1–P3  a séma elfogadja az új-program állapotokat (transpile + futtatás)
//   P4     érvénytelen dátum továbbra is bukik (a lazítás nem tág)
//   P1n    negatív: a RÉGI (szigorú uuid) séma-mutánson az őrszem BUKIK
//   D1     a dialógus hangos onInvalid-ot használ (forrás-őr)
//   D1n    negatív: onInvalid-mutánson BUKIK

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const VAL_SRC = path.join(ROOT, 'apps/web/lib/validations/dashboard.ts')
const CONST_SRC = path.join(ROOT, 'apps/web/lib/constants/dashboard.ts')
const DIALOG_SRC = path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** A validációs modul betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betoltSchema(valForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-program-'))
  try {
    fs.writeFileSync(path.join(tmp, 'dashboard-const.cjs'), t(fs.readFileSync(CONST_SRC, 'utf8')))
    fs.writeFileSync(
      path.join(tmp, 'dashboard-val.cjs'),
      t(valForras)
        .replace(
          /require\(["']@\/lib\/constants\/dashboard["']\)/g,
          `require(${JSON.stringify(path.join(tmp, 'dashboard-const.cjs'))})`,
        )
        .replace(/require\(["']zod["']\)/g, `require(${JSON.stringify(path.join(ROOT, 'node_modules/zod'))})`),
    )
    return require_(path.join(tmp, 'dashboard-val.cjs')).programSchema
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// Az Endre képernyőjén látott állapot (új, többnapos program, idővel):
const UJ_PROGRAM = {
  id: '',
  cim: 'Vakációs Bibliahét',
  datum: '2026-09-01',
  datum_vege: '2026-09-05',
  ido_kezdes: '10:00',
  ido_befejezes: '14:00',
  helyszin: 'Kultúrotthon',
  tipus: 'gyerekprogram',
  prioritas: 'normal',
  ismetlodes_tipus: '',
  egyedi_tipus_nev: '',
  egyedi_emoji: '',
  megjegyzes: '',
}

const valNyers = fs.readFileSync(VAL_SRC, 'utf8')
const schema = betoltSchema(valNyers)

assert(schema.safeParse(UJ_PROGRAM).success, "P1: új program üres id-vel ('') átmegy a sémán")
assert(schema.safeParse({ ...UJ_PROGRAM, id: undefined }).success, 'P2: hiányzó id is átmegy')
assert(
  schema.safeParse({ ...UJ_PROGRAM, id: '7e570000-0000-4000-8000-000000000099' }).success,
  'P3: valódi uuid (szerkesztés) is átmegy',
)
assert(!schema.safeParse({ ...UJ_PROGRAM, datum: 'nem-datum' }).success, 'P4: érvénytelen dátum továbbra is bukik')

// NEGATÍV: a „régi világ" a MAI forrásból — a lazítás visszavétele
const regiVilag = valNyers.replace(
  /id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/,
  "id: z.string().uuid().optional()",
)
if (regiVilag === valNyers) {
  assert(false, 'P1n: a séma-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
} else {
  const regiSchema = betoltSchema(regiVilag)
  assert(
    !regiSchema.safeParse(UJ_PROGRAM).success,
    'P1n: a RÉGI (szigorú uuid) sémán az üres id BUKIK — az őrszem tud pirosra váltani',
  )
}

// D — a dialógus hangos onInvalid-ja (néma validációs bukás tilos)
function kommentNelkul(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((s) => {
    const i = s.indexOf('//')
    if (i === -1) return s
    const elotte = s.slice(0, i)
    return ((elotte.match(/['"`]/g) || []).length % 2 === 0) ? elotte : s
  }).join('\n')
}
function dialogVedE(kod) {
  const k = kommentNelkul(kod)
  return /handleSubmit\(\s*onSubmit\s*,\s*onInvalid\s*\)/.test(k) && /toast\.error\(/.test(k)
}
const dialogNyers = fs.readFileSync(DIALOG_SRC, 'utf8')
assert(dialogVedE(dialogNyers), 'D1: a dialógus onInvalid-kezelője hangos (toast) hibát ad')
const dialogMutans = dialogNyers.replace(/handleSubmit\(\s*onSubmit\s*,\s*onInvalid\s*\)/, 'handleSubmit(onSubmit)')
if (dialogMutans === dialogNyers) {
  assert(false, 'D1n: a dialógus-mutáns NEM különbözik — a negatív asszert vak')
} else {
  assert(!dialogVedE(dialogMutans), 'D1n: az onInvalid nélküli mutánson az őrszem BUKIK')
}

console.log(`\nÖsszesen: ${total}, hibás: ${failedCount}`)
if (failedCount > 0) {
  console.error('❌ FAIL — program-mentés őrszemek')
  process.exit(1)
}
console.log('✅ PASS — program-mentés őrszemek')
