#!/usr/bin/env node
/**
 * ADMIN-OVERRIDE ELSŐBBSÉGI KAPU önellenőrzés (2026-08-17, kerületi S5 szelet).
 *
 * Mit véd: azt a SZEREP-MATRIXOT, ami kimondja, hogy a hatókör-feloldókba
 * (`finance-scope.ts`, `module-scope.ts`) beszúrt admin-override kapu
 * KIZÁRÓLAG az `egyhazkeruleti_admin` viselkedését változtatja meg — és azt,
 * hogy a kapu TÉNYLEG a megyei/kerületi ágak ELŐTT áll.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MI VOLT A HIBA — IDEGEN KÖNYV A GYÜLEKEZET NEVE ALATT
 * ════════════════════════════════════════════════════════════════════════════
 * A kerületi S5 szelet beszúrt egy district-ágat a két hatókör-feloldóba, a
 * gyülekezeti fallback ELÉ. Az ág diszkriminátora a DISTRICT_READ_ROLES, amiben
 * benne van az `egyhazkeruleti_admin` — ÉS UGYANEZ a szerep szerepel az
 * `overrideAllowed` feltételében is (effective-access.ts), vagyis ő az, aki a
 * „Belépés a gyülekezetbe" gombot használhatja. Az override viszont NEM VÁLTJA
 * A PROFILT: az `activeProfileRole.scope` marad `'district'`.
 *
 * Következmény a kapu nélkül: a gyülekezetbe belépett KERÜLETI ADMIN felületén
 * a Pénzügy / Leltár / Iktató a KERÜLET könyveit adta — miközben a hero-címben
 * a GYÜLEKEZET neve állt (a `page.tsx` az `effectiveCongregationId`-t nézi, ami
 * az override miatt a gyülekezeté). Két réteg néma széthúzása; az iktatószámnál
 * visszamenőleg javíthatatlan (hivatalos iratra kerülő szám).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A FÁJL — A BIZONYÍTÁS ÁLLANDÓ ŐRSZEMMÉ TÉTELE
 * ════════════════════════════════════════════════════════════════════════════
 * A javítás helyessége EGY tényen áll: az `overrideAllowed` szerepei és a
 * level-scope.ts olvasó szerep-listái METSZETE PONTOSAN EGYELEMŰ
 * (`egyhazkeruleti_admin`). Ha ez a metszet valaha BŐVÜL — mert valaki felveszi
 * az `esperes`-t az `overrideAllowed`-ba, vagy a rendszergazdát a
 * DISTRICT_READ_ROLES-ba —, akkor ÚJABB szerep kerül pontosan abba a helyzetbe,
 * amit a fenti blokkoló leír, és a kapu magyarázata (a MEGYEI és GYÜLEKEZETI ág
 * byte-ra változatlan) HALLGATÓLAGOSAN érvényét veszti. Ez a fájl ilyenkor
 * HANGOSAN megáll.
 *
 * HAT DOLGOT ŐRZÜNK:
 *   (Ó1) a szerep-lista és a szerep-predikátumok VALÓDIAK (roles.ts-ből futnak,
 *        nem a teszt fejezi ki őket újra);
 *   (Ó2) az `overrideAllowed` kifejezés ALAKJA felismerhető, és minden tényezője
 *        ismert szerep-predikátumhoz köthető — ismeretlen tényezőnél megállunk;
 *   (Ó3) a level-scope.ts NÉGY szerep-listája kiolvasható és értelmes;
 *   (Ó4) A MÁTRIX: mind a nyolc (vagy több) ismert szerepre kiszámoljuk, hogy
 *        kaphat-e override-ot, melyik ágba esne, és VÁLTOZIK-e a viselkedése —
 *        pontosan EGY szerep változhat, és az az `egyhazkeruleti_admin`;
 *   (Ó5) a mátrix-ellenőrzés TUD PIROSRA VÁLTANI (negatív asszertek elrontott
 *        bemenettel) — egy őrszem, ami sosem bukik, rosszabb a semminél;
 *   (Ó6) a KAPU SORRENDJE mindkét feloldóban: a megyei ÉS a kerületi ág ELŐTT
 *        áll — és ez az ellenőrzés is TUD pirosra váltani (három mutáns).
 *
 * ⚠️ A HÁROM ÉRINTETT FORRÁS `import 'server-only'`-t húz (effective-access.ts,
 *    level-scope.ts, a két feloldó), ezért NEM betölthetők. Az import-mentes
 *    `roles.ts`-t transpile-lal FUTTATJUK (valódi predikátumok), a listákat és a
 *    kapu helyét pedig SZÖVEGESEN mérjük — MINDEN szöveges ellenőrzéshez
 *    tartozik negatív asszert is (Ó5, Ó6).
 *
 * Futtatás:  node scripts/selftest-override-elsobbseg.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const AUTH_DIR = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth')
const F_ROLES = path.join(AUTH_DIR, 'roles.ts')
const F_EFFECTIVE = path.join(AUTH_DIR, 'effective-access.ts')
const F_LEVEL = path.join(AUTH_DIR, 'level-scope.ts')
const F_FINANCE = path.join(AUTH_DIR, 'finance-scope.ts')
const F_MODULE = path.join(AUTH_DIR, 'module-scope.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [F_ROLES, F_EFFECTIVE, F_LEVEL, F_FINANCE, F_MODULE]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás: ${f}`)
    process.exit(1)
  }
}

/**
 * KOMMENT-KISZEDÉS — minden szöveges méréshez KÖTELEZŐ.
 *
 * ⚠️ Mind az öt érintett fájl fejléce SZÁNDÉKOSAN IDÉZI a mért sorokat (az
 * `overrideAllowed` kifejezést, a DISTRICT_READ_ROLES tartalmát, az
 * `effectiveCongregationId`-t). Ha a nyers szövegben mérnénk, az őrszem akkor is
 * zöld maradna, ha a VALÓDI kód eltűnik és csak a róla szóló komment marad.
 */
const kommentNelkul = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const SRC = {
  roles: kommentNelkul(fs.readFileSync(F_ROLES, 'utf8')),
  effective: kommentNelkul(fs.readFileSync(F_EFFECTIVE, 'utf8')),
  level: kommentNelkul(fs.readFileSync(F_LEVEL, 'utf8')),
  finance: kommentNelkul(fs.readFileSync(F_FINANCE, 'utf8')),
  module: kommentNelkul(fs.readFileSync(F_MODULE, 'utf8')),
}

// ════════════════════════════════════════════════════════════════════════════
// Ó6 — A KAPU SORRENDJE A KÉT FELOLDÓBAN (szöveges mérés + negatív asszertek)
// ────────────────────────────────────────────────────────────────────────────
// Ez a blokk FÖNT van, mert nem függ a typescript csomagtól: akkor is lefut, ha
// a mátrix-rész (Ó1–Ó5) kimarad.
// ════════════════════════════════════════════════════════════════════════════

/**
 * A kapu KÓD-alakja. Nem elég, hogy „valahol szerepel az override szó": a
 * kapunak a gyülekezeti kontextus-konstruktort kell visszaadnia, mert a
 * belépett admin a GYÜLEKEZET ügyintézőjeként jár el.
 */
const KAPU_RE =
  /const\s+override\s*=\s*access\.override\s+if\s*\(\s*override\.active\s*&&\s*override\.congregationId\s*\)\s*\{\s*return\s+gyulekezetiKontextus\(\s*override\.congregationId\s*\)\s*\}/

/**
 * A kapu-elsőbbség PURE ellenőrzője — mutánsokkal is hívható (lásd lentebb).
 * `{ rendben, uzenet }`-et ad, hogy a negatív asszertek ugyanezt a függvényt
 * mérjék, amit az élesek.
 */
function kapuElsobbsegiE(kodCsak) {
  const kapu = kodCsak.match(KAPU_RE)
  if (!kapu) {
    return { rendben: false, uzenet: 'nincs meg a `override.active` elsőbbségi kapu (KÓDBAN, nem kommentben)' }
  }
  const kapuIdx = kapu.index

  const helyek = [
    ['megyei olvasó feloldó (resolveDioceseReadScopeIds)', /resolveDioceseReadScopeIds\s*\(/],
    ['kerületi olvasó feloldó (resolveDistrictReadScopeIds)', /resolveDistrictReadScopeIds\s*\(/],
    ["megyei ág (scope: 'diocese')", /scope:\s*'diocese'/],
    ["kerületi ág (scope: 'district')", /scope:\s*'district'/],
    ['gyülekezeti fallback (access.effectiveCongregationId)', /access\.effectiveCongregationId/],
  ]

  for (const [nev, re] of helyek) {
    const idx = kodCsak.search(re)
    if (idx < 0) return { rendben: false, uzenet: `nem található a ${nev} — a fájl szerkezete elmozdult` }
    if (idx < kapuIdx) {
      return {
        rendben: false,
        uzenet: `a kapu a ${nev} UTÁN áll (kapu @${kapuIdx} > ág @${idx}) — a belépett kerületi admin idegen könyvet kapna`,
      }
    }
  }

  const belepoIdx = kodCsak.search(/if\s*\(\s*!access\.user\s*\)/)
  if (belepoIdx < 0 || belepoIdx > kapuIdx) {
    return { rendben: false, uzenet: 'a `!access.user` fail-closed belépő nem a kapu ELŐTT áll' }
  }

  return { rendben: true, uzenet: `a kapu @${kapuIdx}, minden hatókör-ág utána` }
}

// ── MUTÁNS-GYÁROSOK (a negatív asszertekhez) ────────────────────────────────
// Ha ezek nélkül csak azt igazolnánk, hogy a valódi forráson ZÖLD, akkor egy túl
// laza regex NÉMÁN mindig zöld lenne — pontosan az a hibaosztály, ami ellen ez
// a szelet épült.

/** A kapu TELJESEN eltűnik (valaki „fölösleges kódként" kitörli). */
const mutansTorolt = (kodCsak) => kodCsak.replace(KAPU_RE, '')

/** A kapu a megyei ÉS a kerületi ág UTÁN kerül — ez az EREDETI BLOKKOLÓ. */
function mutansAgUtan(kodCsak) {
  const kapu = kodCsak.match(KAPU_RE)
  if (!kapu) return kodCsak
  const blokk = kapu[0]
  return kodCsak
    .replace(KAPU_RE, '')
    .replace(/if\s*\(\s*access\.effectiveCongregationId\s*\)/, (t) => `${blokk}\n\n  ${t}`)
}

/** A kapu megmarad, de KOMMENTBE kerül (a „létezik a szó" csapda). */
function mutansCsakKomment(kodCsak) {
  const kapu = kodCsak.match(KAPU_RE)
  if (!kapu) return kodCsak
  const kommentelt = kapu[0]
    .split('\n')
    .map((sor) => `// ${sor}`)
    .join('\n')
  return kommentNelkul(kodCsak.replace(KAPU_RE, () => kommentelt))
}

for (const [nev, kod] of [
  ['finance-scope.ts', SRC.finance],
  ['module-scope.ts', SRC.module],
]) {
  const eles = kapuElsobbsegiE(kod)
  if (eles.rendben) {
    ok(`Ó6 ${nev}: az override-kapu a megyei ÉS a kerületi ág ELŐTT áll (${eles.uzenet})`)
  } else {
    fail(`Ó6 ${nev}: ${eles.uzenet}`)
  }

  // NEGATÍV ASSZERTEK — az őrszemnek TUDNIA KELL pirosra váltani.
  const mutansok = [
    ['a kapu kitörölve', mutansTorolt(kod)],
    ['a kapu a diocese/district ág UTÁN (az eredeti blokkoló)', mutansAgUtan(kod)],
    ['a kapu csak KOMMENTBEN', mutansCsakKomment(kod)],
  ]
  let mindBukik = true
  for (const [mutansNev, mutansKod] of mutansok) {
    if (mutansKod === kod) {
      fail(`Ó6n ${nev}: a mutáns („${mutansNev}") NEM különbözik az eredetitől — a negatív asszert vak`)
      mindBukik = false
      continue
    }
    if (kapuElsobbsegiE(mutansKod).rendben) {
      fail(
        `Ó6n ${nev}: az őrszem ZÖLD maradt az elrontott változaton („${mutansNev}") — ` +
          'túl laza regex, sosem tudna pirosra váltani',
      )
      mindBukik = false
    }
  }
  if (mindBukik) ok(`Ó6n ${nev}: az őrszem mind a 3 elrontott változaton BUKIK (tud pirosra váltani)`)
}

// ════════════════════════════════════════════════════════════════════════════
// Ó3 — A LEVEL-SCOPE NÉGY SZEREP-LISTÁJA (szöveges kiolvasás)
// ════════════════════════════════════════════════════════════════════════════

/**
 * `const X_ROLES: readonly string[] = [...]` kiolvasása. A READ-listák a
 * WRITE-listát spread-elik (`...DIOCESE_WRITE_ROLES`), ezért a spread-hivatkozást
 * fel is oldjuk — így a mérés akkor is a VALÓDI tartalmat adja, ha valaki a
 * WRITE-listát bővíti.
 */
function listaKiolvas(nev, mar = {}) {
  const re = new RegExp(`const\\s+${nev}\\s*:\\s*readonly\\s+string\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\]`)
  const m = SRC.level.match(re)
  if (!m) return null
  const belso = m[1]
  const ki = []
  for (const darab of belso.split(',')) {
    const t = darab.trim()
    if (!t) continue
    const literal = t.match(/^'([^']+)'$/) || t.match(/^"([^"]+)"$/)
    if (literal) {
      ki.push(literal[1])
      continue
    }
    const spread = t.match(/^\.\.\.(\w+)$/)
    if (spread) {
      const hivatkozott = mar[spread[1]]
      if (!hivatkozott) return { hiba: `feloldatlan spread: ...${spread[1]}` }
      ki.push(...hivatkozott)
      continue
    }
    return { hiba: `ismeretlen elem a ${nev} listában: ${t}` }
  }
  return ki
}

const LISTAK = {}
{
  let listaHiba = false
  for (const nev of ['DIOCESE_WRITE_ROLES', 'DIOCESE_READ_ROLES', 'DISTRICT_WRITE_ROLES', 'DISTRICT_READ_ROLES']) {
    const ki = listaKiolvas(nev, LISTAK)
    if (!ki) {
      fail(`Ó3: a level-scope.ts-ből nem olvasható ki a ${nev} lista (átnevezték / átalakították?)`)
      listaHiba = true
      continue
    }
    if (ki.hiba) {
      fail(`Ó3: ${ki.hiba}`)
      listaHiba = true
      continue
    }
    LISTAK[nev] = ki
  }
  if (!listaHiba) {
    const d = LISTAK.DIOCESE_READ_ROLES
    const k = LISTAK.DISTRICT_READ_ROLES
    const dW = LISTAK.DIOCESE_WRITE_ROLES
    const kW = LISTAK.DISTRICT_WRITE_ROLES
    if (!d.length || !k.length) {
      fail('Ó3: valamelyik olvasó szerep-lista ÜRES — fail-closed helyett néma bezárás')
    } else if (!dW.every((r) => d.includes(r)) || !kW.every((r) => k.includes(r))) {
      fail('Ó3: van ÍRÓ szerep, ami nem OLVASÓ — az RLS-sel széthúzó modell')
    } else if (d.some((r) => k.includes(r))) {
      fail(
        `Ó3: a megyei és a kerületi OLVASÓ lista ÁTFED (${d.filter((r) => k.includes(r)).join(', ')}) — ` +
          'a két ág skalár-tartaléka már nem diszjunkt, a feloldók sorrend-érve érvényét veszti',
      )
    } else {
      ok(`Ó3 a 4 szerep-lista kiolvasva; megyei olvasó: [${d.join(', ')}], kerületi olvasó: [${k.join(', ')}]`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Ó2 — AZ `overrideAllowed` KIFEJEZÉS ALAKJA ÉS TÉNYEZŐI
// ════════════════════════════════════════════════════════════════════════════

/**
 * `const admin = statusActive && isAdminRole(role, user.email)`
 *   → { admin: 'isAdminRole', … }
 *
 * ⚠️ 2026-09-04 — MIÉRT LETT OPCIONÁLIS ELŐTAG (és miért CSAK ez az egy):
 * A P0·2 javítás óta minden származtatott jog egy státusz-kapun keresztül
 * keletkezik (`statusActive && isXRole(role, …)`), mert a `profiles.status`
 * ellenőrzése eddig csak a dashboard-layoutban élt, a szerver-akciókra nem
 * hatott. Ez az őrszem eddig a csupasz `= isXRole(` alakot kereste, és a
 * javítás után NEM TALÁLTA a leképezést — helyesen meg is állt
 * („ISMERETLEN tényező… mérd újra"), mert egy nem mérhető mátrixról nem
 * szabad zöldet mondani.
 *
 * A megengedett előtag SZÁNDÉKOSAN egyetlen, konkrét azonosító: `statusActive`.
 * Nem `[\s\S]*?`, nem tetszőleges kifejezés — különben az őrszem bármilyen
 * jövőbeli tényezőt elfogadna a jog elé, és pont azt a TÁGÍTÁST engedné át,
 * aminek a kiszűrése a dolga. A `statusActive` bizonyítottan SZŰKÍT (egy
 * `&&`-dal kötött további feltétel soha nem ad több jogot), ezért biztonságos.
 *
 * Ha valaha más előtag jelenik meg, ez az őrszem újra megáll — és az akkor is
 * a helyes viselkedés lesz.
 */
const FLAG_PREDIKATUM = {}
for (const m of SRC.effective.matchAll(
  /const\s+(\w+)\s*=\s*(?:statusActive\s*&&\s*)?(is\w+Role)\s*\(\s*role\b[^)]*\)/g,
)) {
  FLAG_PREDIKATUM[m[1]] = m[2]
}

let OVERRIDE_TENYEZOK = null
{
  const m = SRC.effective.match(/const\s+overrideAllowed\s*=([\s\S]*?)(?=\n\s*const\s)/)
  if (!m) {
    fail('Ó2: nincs meg az `overrideAllowed` értékadás az effective-access.ts-ben')
  } else {
    const kifejezes = m[1].replace(/\s+/g, ' ').trim()
    // A mért alak: !missingPrimaryRole && (master ? godModeActive : <NEM-MASTER ÁG>)
    const alak = kifejezes.match(
      /^!missingPrimaryRole\s*&&\s*\(\s*master\s*\?\s*godModeActive\s*:\s*([^)]+)\)$/,
    )
    if (!alak) {
      fail(
        `Ó2: az \`overrideAllowed\` kifejezés ALAKJA megváltozott — ${JSON.stringify(kifejezes)}. ` +
          'A szerep-mátrix ebből származik: MÉRD ÚJRA, és igazítsd ezt az őrszemet is.',
      )
    } else {
      const tenyezok = alak[1].split('||').map((s) => s.trim())
      const ismeretlen = tenyezok.filter((t) => !(t in FLAG_PREDIKATUM))
      if (ismeretlen.length) {
        fail(
          `Ó2: az \`overrideAllowed\` nem-master ágában ISMERETLEN tényező van: [${ismeretlen.join(', ')}]. ` +
            'Nem tudjuk szerep-predikátumhoz kötni, tehát a mátrix nem mérhető — állj meg és mérd újra.',
        )
      } else {
        OVERRIDE_TENYEZOK = tenyezok.map((t) => FLAG_PREDIKATUM[t])
        ok(
          `Ó2 az overrideAllowed nem-master ága felismert: ${tenyezok.join(' || ')} ` +
            `→ [${OVERRIDE_TENYEZOK.join(', ')}]`,
        )
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Ó4/Ó5 — A METSZET-SZABÁLY (pure) ÉS A NEGATÍV ASSZERTJEI
// ════════════════════════════════════════════════════════════════════════════

/**
 * A VÉDETT SZABÁLY egyetlen függvényben: az override-ot kapható szerepek és a
 * két olvasó szerep-lista UNIÓJÁNAK metszete PONTOSAN `egyhazkeruleti_admin`.
 *
 * Pure — hogy az Ó5 negatív asszertek UGYANEZT mérjék elrontott bemenettel.
 */
function metszetErtekeles(overrideSzerepek, dioceseRead, districtRead) {
  const olvasoUnio = new Set([...dioceseRead, ...districtRead])
  const metszet = [...new Set(overrideSzerepek)].filter((r) => olvasoUnio.has(r)).sort()
  return {
    metszet,
    rendben: metszet.length === 1 && metszet[0] === 'egyhazkeruleti_admin',
  }
}

// ── Ó5: A SZABÁLY TUD PIROSRA VÁLTANI (a valódi listáktól függetlenül) ───────
{
  const O = ['admin', 'egyhazkeruleti_admin']
  const D = ['esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo']
  const K = ['egyhazkeruleti_admin', 'egyhazkeruleti_szamvevo']

  const esetek = [
    ['alapeset (a mai állapot)', metszetErtekeles(O, D, K).rendben, true],
    ['esperes bekerül az overrideAllowed-ba', metszetErtekeles([...O, 'esperes'], D, K).rendben, false],
    ['a rendszergazda bekerül a DISTRICT_READ_ROLES-ba', metszetErtekeles(O, D, [...K, 'admin']).rendben, false],
    ['a kerületi számvevő override-ot kap', metszetErtekeles([...O, 'egyhazkeruleti_szamvevo'], D, K).rendben, false],
    ['az egyhazkeruleti_admin kiesik az override-ból', metszetErtekeles(['admin'], D, K).rendben, false],
    ['az egyhazkeruleti_admin kiesik a DISTRICT_READ-ből', metszetErtekeles(O, D, ['egyhazkeruleti_szamvevo']).rendben, false],
  ]
  let mind = true
  for (const [nev, kapott, vart] of esetek) {
    if (kapott !== vart) {
      fail(`Ó5: a metszet-szabály „${nev}" esetén ${kapott} (várt: ${vart}) — az őrszem nem mér helyesen`)
      mind = false
    }
  }
  if (mind) ok('Ó5 a metszet-szabály a mai állapotra ZÖLD, és mind az 5 elrontott bővítésre PIROS')
}

// ════════════════════════════════════════════════════════════════════════════
// Ó1 + Ó4 — A VALÓDI PREDIKÁTUMOK ÉS A TELJES SZEREP-MÁTRIX
// ════════════════════════════════════════════════════════════════════════════

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — a szerep-mátrix (Ó1/Ó4) kimarad')
  if (failed) {
    console.error('\nOverride-elsőbbség önellenőrzés: HIBA')
    process.exit(1)
  }
  console.log('\nOverride-elsőbbség önellenőrzés: a szöveges rész zöld (mátrix kihagyva)')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-override-selftest-'))

/**
 * TS → CJS, majd betöltés. Fail-closed: ha a `roles.ts` valaha FUTÁSIDEJŰ
 * projekt-importot kapna (pl. `server-only`), inkább ITT bukjunk el érthető
 * üzenettel, mint hogy a mátrix némán kihagyhatóvá váljon.
 */
function loadTs(srcFile, outName) {
  const out = ts.transpileModule(fs.readFileSync(srcFile, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: `${outName}.ts`,
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}) — ` +
        'a szerep-predikátumok így nem futtathatók önállóan, a mátrix mérhetetlenné válna.',
    )
  }
  const dest = path.join(tmp, `${outName}.js`)
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let rolesMag = null
try {
  rolesMag = loadTs(F_ROLES, 'roles')
} catch (e) {
  fail(`Ó1: a roles.ts nem tölthető be — ${e?.message || e}`)
}

if (rolesMag) {
  // ── Ó1: a KNOWN_ROLES lista kiolvasása, keresztbe igazolva a VALÓDI
  //       `isKnownRole()` predikátummal. Így a mátrix egy jövőbeli KILENCEDIK
  //       szerepre is automatikusan kiterjed — nem marad mérés nélkül.
  const km = SRC.roles.match(/const\s+KNOWN_ROLES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/)
  const SZEREPEK = km ? [...km[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []

  if (!SZEREPEK.length) {
    fail('Ó1: a roles.ts-ből nem olvasható ki a KNOWN_ROLES lista')
  } else if (typeof rolesMag.isKnownRole !== 'function') {
    fail('Ó1: a roles.ts nem exportálja az isKnownRole predikátumot')
  } else if (!SZEREPEK.every((r) => rolesMag.isKnownRole(r))) {
    fail(`Ó1: a kiolvasott lista nem egyezik a VALÓDI isKnownRole()-lal — [${SZEREPEK.join(', ')}]`)
  } else if (SZEREPEK.length < 8) {
    fail(`Ó1: mindössze ${SZEREPEK.length} szerepet olvastunk ki (legalább 8 várt) — hiányos mérés`)
  } else {
    ok(`Ó1 ${SZEREPEK.length} ismert szerep, a VALÓDI isKnownRole()-lal keresztbe igazolva`)
  }

  const predikatumHiany = (OVERRIDE_TENYEZOK || []).filter((p) => typeof rolesMag[p] !== 'function')
  if (predikatumHiany.length) {
    fail(`Ó4: a roles.ts nem exportálja: [${predikatumHiany.join(', ')}]`)
  }

  if (
    SZEREPEK.length &&
    OVERRIDE_TENYEZOK &&
    !predikatumHiany.length &&
    LISTAK.DIOCESE_READ_ROLES &&
    LISTAK.DISTRICT_READ_ROLES
  ) {
    // ── Ó4: A MÁTRIX. A `kaphatOverride` oszlopot a VALÓDI predikátumok adják,
    //       a másik két oszlopot a level-scope VALÓDI listái. Az e-mail
    //       szándékosan üres: a master (e-mail alapú) hozzáférés a `profiles.role`
    //       skalártól FÜGGETLEN, külön (god mode) kapun át él.
    const sorok = SZEREPEK.map((szerep) => {
      const kaphatOverride = OVERRIDE_TENYEZOK.some((p) => rolesMag[p](szerep, null))
      const megyei = LISTAK.DIOCESE_READ_ROLES.includes(szerep)
      const keruleti = LISTAK.DISTRICT_READ_ROLES.includes(szerep)
      return { szerep, kaphatOverride, megyei, keruleti, valtozik: kaphatOverride && (megyei || keruleti) }
    })

    const j = (b) => (b ? 'igen ' : 'nem  ')
    console.log('\n      szerep                    override  megyei-ág  kerületi-ág  VÁLTOZIK')
    for (const s of sorok) {
      console.log(
        `      ${s.szerep.padEnd(26)}${j(s.kaphatOverride)}     ${j(s.megyei)}      ${j(s.keruleti)}       ` +
          (s.valtozik ? 'IGEN' : 'nem'),
      )
    }
    console.log('')

    const valtozok = sorok.filter((s) => s.valtozik).map((s) => s.szerep)
    const ert = metszetErtekeles(
      sorok.filter((s) => s.kaphatOverride).map((s) => s.szerep),
      LISTAK.DIOCESE_READ_ROLES,
      LISTAK.DISTRICT_READ_ROLES,
    )

    if (ert.rendben) {
      ok('Ó4 a metszet PONTOSAN egyelemű: egyhazkeruleti_admin (a kapu csak őt érinti)')
    } else {
      fail(
        `Ó4: a metszet [${ert.metszet.join(', ')}] — várt: pontosan [egyhazkeruleti_admin]. ` +
          'ÚJABB szerep került abba a helyzetbe, amit az override-kapu javított: a belépett ' +
          'felhasználó a saját szintje könyveit kapná a GYÜLEKEZET neve alatt. ' +
          'Vagy szűkítsd vissza, vagy mérd újra a mátrixot és igazold, hogy a kapu ott is helyes.',
      )
    }

    if (valtozok.length === 1 && valtozok[0] === 'egyhazkeruleti_admin') {
      ok('Ó4b a mátrix szerint PONTOSAN 1 szerep viselkedése változik: egyhazkeruleti_admin')
    } else {
      fail(`Ó4b: a kapu ${valtozok.length} szerep viselkedését változtatja meg — [${valtozok.join(', ')}]`)
    }

    // A megyei szint BYTE-RA VÁLTOZATLAN: egyetlen megyei olvasó szerep sem
    // kaphat override-ot, tehát a kapu SOHA nem fut le rajtuk.
    const megyeiErintett = sorok.filter((s) => s.megyei && s.kaphatOverride).map((s) => s.szerep)
    if (megyeiErintett.length === 0) {
      ok('Ó4c egyetlen MEGYEI olvasó szerep sem kaphat override-ot → a megyei ág byte-ra változatlan')
    } else {
      fail(
        `Ó4c: MEGYEI olvasó szerep(ek) kaphatnak override-ot — [${megyeiErintett.join(', ')}]. ` +
          'A megyei viselkedés így már NEM változatlan: ~500 gyülekezet éles rendszerében állj meg.',
      )
    }

    // A kerületi SZÁMVEVŐ (ellenőr) SOHA nem kaphat override-ot: ő olvas, nem
    // ügyintéz — ha egyszer kapna, ez a kapu némán gyülekezeti ÍRÓ kontextust
    // adna neki (canWrite: true).
    const szamvevoOverride = sorok.find((s) => s.szerep === 'egyhazkeruleti_szamvevo')
    if (!szamvevoOverride) {
      fail('Ó4d: nincs `egyhazkeruleti_szamvevo` a KNOWN_ROLES-ban — a 3. szint ellenőre eltűnt?')
    } else if (!szamvevoOverride.kaphatOverride && szamvevoOverride.keruleti && !szamvevoOverride.megyei) {
      ok('Ó4d a kerületi számvevő OLVAS a kerületi ágon, de override-ot NEM kaphat (ellenőr, nem ügyintéző)')
    } else {
      fail(
        `Ó4d: a kerületi számvevő állapota elmozdult (override: ${szamvevoOverride.kaphatOverride}, ` +
          `megyei ág: ${szamvevoOverride.megyei}, kerületi ág: ${szamvevoOverride.keruleti}). ` +
          'Override-dal a kapu némán ÍRÓ gyülekezeti kontextust adna az ellenőrnek.',
      )
    }
  } else if (!failed) {
    fail('Ó4: a mátrix bemenetei hiányosak — a mérés nem futott le')
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nOverride-elsőbbség önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nOverride-elsőbbség önellenőrzés: minden zöld')
