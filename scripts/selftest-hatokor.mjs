#!/usr/bin/env node
/**
 * MEGJELENÍTÉSI HATÓKÖR önellenőrzés (2026-08-11).
 *
 * Mit véd: `apps/web/lib/auth/display-scope-core.ts` — a mentés-sáv hatókörét
 * eldöntő TISZTA függvény.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A projekt visszatérő hibaosztálya, hogy a BEKAPCSOLT PROFIL és a MÖGÖTTES
 * JOGOSULTSÁG széthúz: a tulajdonos barátosi lelkészi profilban böngész, de
 * master, ezért a hatókör-feloldó `null`-t (korlátlan) adott, és a mentés-sáv
 * 784 hatókört + idegen gyülekezet-neveket sorolt fel.
 *
 * A javítás egyetlen szabálya: MINDIG `metszet(jogosultság, profil)` — soha
 * unió, soha tágítás. Ez a fajta szabály a legkönnyebben esik vissza egy
 * későbbi refaktorban, mert „logikusnak" tűnik visszaírni az egyszerűbb ágat.
 * Ezért van assert rá.
 *
 * Futtatás:  node scripts/selftest-hatokor.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'display-scope-core.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

// ════════════════════════════════════════════════════════════════════════════
// „SZ" BLOKK — SZEREPKÖRÖK: néma üres lista, 414-darabolás, fejléc-címkék
// (2026-08-22, 4. pont)
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT ITT: ez a fájl őrzi a projekt hatókör-hibaosztályát. A „néma üres lista"
// ugyanannak a betegségnek egy másik tünete: a hatókör-feloldó KÉT különböző
// okra (nincs kerülete / a lekérdezés hibázott) ugyanazt az ÜRES TÖMBÖT adta, a
// hívó pedig `if (tomb)`-bel ellenőrizte — az üres tömb viszont JS-ben TRUTHY,
// tehát az `.in([])` lefutott, 0 sort adott, HIBA NÉLKÜL.
//
// MINDEN itteni asszert MUTÁNS-ELLENŐRZÉSSEL fut: eljátsszuk a RÉGI, hibás
// alakot, és bizonyítjuk, hogy az őrszem BUKNA rá. Enélkül az őrszem vak.
//
// A szöveges vizsgálat KOMMENT NÉLKÜLI forráson dolgozik: a javítások
// dokumentációja szó szerint idézi a régi hibás sorokat, és egy naiv regex
// ezekre is ráillene — az őrszem így akkor is „hibát" jelezne, amikor a kód
// helyes (lásd az SZ4b bizonyítékot).

/** Kommentek eltávolítása: blokk-kommentek + a csak-kommentből álló sorok. */
function kommentNelkul(src) {
  if (!src) return ''
  const blokkNelkul = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return blokkNelkul
    .split('\n')
    .filter((sor) => {
      const t = sor.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/** Fájl beolvasása — hiányzó fájl HANGOS hiba, nem néma átugrás. */
function olvasForras(...reszek) {
  const teljes = path.join(REPO_ROOT, ...reszek)
  if (!fs.existsSync(teljes)) {
    fail(`hiányzik a fájl: ${path.join(...reszek)}`)
    return null
  }
  return fs.readFileSync(teljes, 'utf8')
}

/**
 * Egy őrszem-asszert MUTÁNS-ellenőrzéssel.
 *
 * @param nev      az asszert neve
 * @param pred     (forras) => boolean — igaz, ha a forrás HELYES
 * @param joForras a jelenlegi forrás
 * @param mutans   a RÉGI, hibás alak — ezen a `pred`-nek HAMISAT kell adnia
 */
function orszem(nev, pred, joForras, mutans) {
  if (joForras === null || joForras === undefined) return
  if (!pred(joForras)) {
    fail(`${nev}: a JELENLEGI forrás megbukik az asszerten`)
    return
  }
  if (pred(mutans)) {
    fail(`${nev}: az őrszem VAK — a régi, hibás alak is átmegy rajta`)
    return
  }
  ok(`${nev} (mutáns-ellenőrzéssel)`)
}

{
  const adminScope = olvasForras('apps', 'web', 'lib', 'auth', 'admin-scope.ts')
  const pcActions = olvasForras('apps', 'web', 'app', '(dashboard)', 'admin', 'profile-congregations-actions.ts')
  const prActions = olvasForras('apps', 'web', 'app', '(dashboard)', 'admin', 'profile-roles-actions.ts')
  const webHeader = olvasForras('apps', 'web', 'components', 'layout', 'header-refined-v3.tsx')
  const uiHeader = olvasForras('packages', 'ui', 'src', 'layout', 'kartoteka-header.tsx')
  const roleTypes = olvasForras('apps', 'web', 'lib', 'profile-roles', 'types.ts')
  const megyeiFulek = olvasForras('apps', 'web', 'components', 'dashboard', 'diocese', 'diocese-dashboard-tabs.tsx')

  // ── SZ1: a hatókör-feloldó megkülönbözteti a „nem tudjuk"-ot az „üres"-től ──
  //
  // RÉGI (hibás) alak:  if (error) return []
  // ÚJ alak:            if (error) return { ids: [], feloldhato: false, indok: 'lekerdezes_hiba', … }
  const sz1 = (src) => {
    const tiszta = kommentNelkul(src)
    if (!/interface\s+ScopedIdsResult/.test(tiszta)) return false
    const hibaAgak = tiszta.match(/if \(error\) return [^\n]*/g) || []
    if (hibaAgak.length < 2) return false
    return hibaAgak.every(
      (ag) => /feloldhato:\s*false/.test(ag) && /indok:\s*'lekerdezes_hiba'/.test(ag),
    )
  }
  orszem(
    'SZ1 a hatókör-feloldó hibája NEM néma üres tömb',
    sz1,
    adminScope,
    (adminScope || '').replace(/if \(error\) return \{[^\n]*/g, 'if (error) return []'),
  )

  // ── SZ2: a hozzárendelés-listázóból eltűnt a feltétel-nélküli `.in()` ───────
  //
  // RÉGI (hibás) alak:  if (scopedCongIds) query = query.in('congregation_id', scopedCongIds)
  // Az ÜRES TÖMB truthy → `.in([])` → 0 sor, hiba nélkül: NÉMA ÜRES LISTA.
  const sz2 = (src) => {
    const tiszta = kommentNelkul(src)
    if (/if\s*\(\s*\w*[Cc]ong\w*Ids?\s*\)\s*(?:\w+\s*=\s*)?\w+\.in\(/.test(tiszta)) return false
    if (!/length === 0/.test(tiszta)) return false
    if (!/feloldhato/.test(tiszta)) return false
    return true
  }
  orszem(
    'SZ2 a hozzárendelés-listázóban nincs feltétel-nélküli `.in()` szűrő',
    sz2,
    pcActions,
    (pcActions || '') + "\n    if (scopedCongIds) query = query.in('congregation_id', scopedCongIds)\n",
  )

  // ── SZ3: 414-védelem — a gyülekezet-azonosítós szűrők DARABOLVA futnak ──────
  //
  // Az SZ2 javítás a darabolás NÉLKÜL a tünetet ÜRESRŐL 414-es HIBÁRA fordítaná:
  // egy kerületben több száz gyülekezet is lehet, és a `.in()` az URL-be kerül.
  const sz3darab = (src) => {
    const m = kommentNelkul(src).match(/IN_SZURO_DARAB\s*=\s*(\d+)/)
    if (!m) return false
    const meret = Number(m[1])
    return meret > 0 && meret <= 100
  }
  orszem(
    'SZ3a a `.in()` darabmérete 100 alatt marad (414-védelem)',
    sz3darab,
    adminScope,
    (adminScope || '').replace(/IN_SZURO_DARAB\s*=\s*\d+/, 'IN_SZURO_DARAB = 500'),
  )

  const sz3hasznalat = (src) => /darabolIdListat\(/.test(kommentNelkul(src))
  for (const [nev, src] of [
    ['hozzárendelés-listázó', pcActions],
    ['szerepkör-listázó', prActions],
  ]) {
    orszem(
      `SZ3b a ${nev} 80-asával darabolja a gyülekezet-azonosítós szűrőt`,
      sz3hasznalat,
      src,
      (src || '').replace(/darabolIdListat\(/g, 'egyDarabban('),
    )
  }

  // ── SZ4: fejléc-címke — az `admin` a RENDSZERGAZDA, nem a kerületi admin ────
  //
  // A web fejléc a KANONIKUS térképből címkéz (nincs saját listája); a közös
  // (desktop) fejléc nem importálhat az apps/web-ből, ezért ott másolat van.
  // 2026-09-05 (profil-kör D7): a fejléc már nem közvetlenül a ROLE_LABELS-t
  // olvassa, hanem az EGYETLEN címke-modult (lib/profile-roles/labels.ts →
  // getRoleLabel), amely maga importálja a kanonikus ROLE_LABELS-t. Az őr a
  // LÁNCOT ellenőrzi: fejléc → labels.ts → types.ts; bármelyik szem hiánya bukás.
  const roleLabels = olvasForras('apps', 'web', 'lib', 'profile-roles', 'labels.ts')
  orszem(
    'SZ4a a web fejléc a kanonikus ROLE_LABELS-ből veszi a címkét (nincs saját, elavuló listája)',
    (src) => {
      const tiszta = kommentNelkul(src)
      if (/admin:\s*'Kerületi admin'/.test(tiszta)) return false
      const kozvetlen = /ROLE_LABELS[\s\S]{0,80}from '@\/lib\/profile-roles\/types'/.test(tiszta)
      const modulon = /getRoleLabel[\s\S]{0,80}from '@\/lib\/profile-roles\/labels'/.test(tiszta)
      return kozvetlen || modulon
    },
    webHeader,
    (webHeader || '').replace(
      /import \{ getRoleLabel \} from '@\/lib\/profile-roles\/labels'/,
      "const getRoleLabel = (r) => ({ admin: 'Kerületi admin' })[r]",
    ),
  )
  orszem(
    'SZ4a2 a közös címke-modul (labels.ts) a kanonikus ROLE_LABELS-t importálja — a lánc nem szakad',
    (src) => {
      const tiszta = kommentNelkul(src)
      if (/admin:\s*'Kerületi admin'/.test(tiszta)) return false
      return /ROLE_LABELS[\s\S]{0,120}from '@\/lib\/profile-roles\/types'/.test(tiszta)
    },
    roleLabels,
    (roleLabels || '').replace(
      /import \{ ROLE_LABELS, SCOPE_LABELS,/,
      "const ROLE_LABELS = { admin: 'Kerületi admin' }\nimport { SCOPE_LABELS,",
    ),
  )
  orszem(
    'SZ4b a közös (desktop) fejléc az `admin` szerepet Rendszergazdának nevezi',
    (src) => {
      const tiszta = kommentNelkul(src)
      if (/admin:\s*'Kerületi admin'/.test(tiszta)) return false
      return /admin:\s*'Rendszergazda'/.test(tiszta)
    },
    uiHeader,
    (uiHeader || '').replace(/admin:\s*'Rendszergazda'/, "admin: 'Kerületi admin'"),
  )

  // ── SZ4c: BIZONYÍTÉK, hogy a komment-eltávolítás KÖTELEZŐ ───────────────────
  //
  // A javítás dokumentációja szó szerint idézi a régi hibás sort
  // („itt `admin: 'Kerületi admin'` állt"). Egy naiv, kommenteket is néző
  // őrszem ezért a JELENLEGI, HELYES forrásra is hibát jelezne — használhatatlan.
  {
    const naiv = (src) => !/admin:\s*'Kerületi admin'/.test(src) && /admin:\s*'Rendszergazda'/.test(src)
    if (!uiHeader) {
      fail('SZ4c: nincs mit ellenőrizni (hiányzó közös fejléc)')
    } else if (naiv(uiHeader)) {
      fail(
        'SZ4c: a komment-eltávolítás nélküli (naiv) őrszem is átengedi a jelenlegi forrást — ' +
          'a bizonyíték elveszett; ellenőrizd, hogy a javítás doksija idézi-e még a régi sort.',
      )
    } else {
      ok('SZ4c bizonyítva: komment-eltávolítás nélkül az őrszem hibásan jelezne (ezért kötelező)')
    }
  }

  // ── SZ5: a két fejléc szerep-térképe BETŰRE egyezik ─────────────────────────
  //
  // A `packages/ui` nem importálhat az `apps/web`-ből, ezért a térkép MÁSOLAT —
  // és a másolat NÉMÁN széthúzhat. Ez az egyetlen kötés a kettő között.
  const terkepet = (src, minta) => {
    if (!src) return null
    const m = kommentNelkul(src).match(minta)
    if (!m) return null
    const parok = {}
    for (const [, kulcs, ertek] of m[1].matchAll(/(\w+):\s*'([^']*)'/g)) parok[kulcs] = ertek
    return parok
  }
  {
    const kanonikus = terkepet(roleTypes, /export const ROLE_LABELS[^=]*=\s*\{([\s\S]*?)\n\}/)
    const masolat = terkepet(uiHeader, /const ROLE_LABELS[^=]*=\s*\{([\s\S]*?)\n\}/)
    if (!kanonikus || !masolat) {
      fail('SZ5: nem sikerült kiolvasni a ROLE_LABELS térképet (kanonikus vagy másolat)')
    } else {
      const elteres = []
      for (const [k, v] of Object.entries(kanonikus)) {
        if (masolat[k] !== v) elteres.push(`${k}: '${v}' ↔ '${masolat[k] ?? '—'}'`)
      }
      if (elteres.length > 0) {
        fail(
          'SZ5 a közös (desktop) fejléc szerep-térképe SZÉTHÚZ a kanonikus ROLE_LABELS-szel: ' +
            elteres.join(', '),
        )
      } else {
        ok(`SZ5 a két szerep-térkép betűre egyezik (${Object.keys(kanonikus).length} szerep)`)
      }
      // MUTÁNS: egy hiányzó kulcsra buknia KELL.
      const csonka = { ...masolat }
      delete csonka.konyvelo
      const buknaE = Object.entries(kanonikus).some(([k, v]) => csonka[k] !== v)
      if (buknaE) ok('SZ5b az egyezés-vizsgálat egy hiányzó kulcsra bukna (nem vak)')
      else fail('SZ5b az egyezés-vizsgálat VAK: egy hiányzó kulcsot sem venne észre')
    }
  }

  // ── SZ6: a megyei fül felirata és tartalma összeér ──────────────────────────
  //
  // RÉGI: a fül „👥 Szerepkörök" volt, de a `profile_congregations` táblát
  // mutatta, ráadásul a listázót PARAMÉTER NÉLKÜL hívta (a kerületi admin egy
  // megyei képernyőn a TELJES kerületét látta).
  const sz6 = (src) => {
    const tiszta = kommentNelkul(src)
    if (!/<ProfileCongregationsTab\s+dioceseId=\{dioceseId\}/.test(tiszta)) return false
    if (/label:\s*'👥 Szerepkörök'/.test(tiszta)) return false
    return /listProfileRolesForDiocese/.test(tiszta)
  }
  orszem(
    'SZ6 a megyei fül a képernyőn látott egyházmegyére szűr, és valódi szerepkör-listát mutat',
    sz6,
    megyeiFulek,
    (megyeiFulek || '')
      .replace(/<ProfileCongregationsTab\s+dioceseId=\{dioceseId\}\s*\/>/, '<ProfileCongregationsTab />')
      .replace(/label: '👥 Szerepkörök és hozzárendelések'/, "label: '👥 Szerepkörök'"),
  )
}

if (!fs.existsSync(FORRAS)) {
  fail(`hiányzik a forrás: ${FORRAS}`)
  process.exit(1)
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — a TS-fordítást igénylő rész kihagyva')
  // ⚠️ A fenti „SZ" blokk MÁR lefutott — az ő hibáit nem nyelhetjük el.
  if (failed) {
    console.error('\nMegjelenítési hatókör önellenőrzés: HIBA')
    process.exit(1)
  }
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-hatokor-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * Fail-closed: ha valaha PROJEKT-import kerülne a fájlba (pl. `server-only`),
 * a `require()` ismeretlen modulra futna. Inkább ITT bukjon el, érthető
 * üzenettel — a döntési magnak import-mentesnek KELL maradnia.
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: outName + '.ts',
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}). ` +
        'A hatókör-döntés magja csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let mag
try {
  mag = loadTs(FORRAS, 'display-scope-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { metszHatokort, uresHatokor } = mag

if (typeof metszHatokort !== 'function' || typeof uresHatokor !== 'function') {
  fail('a modul nem exportálja a metszHatokort / uresHatokor függvényt')
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const egyenlo = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ────────────────────────────────────────────────────────────────────────────
// A1 — RENDSZERGAZDAI PROFIL: a teljes lista HASZNOS, nem vesszük el.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'system' })
  if (r.congregationIds === null && r.globalisIsVarhato === true && r.indok === 'jogosultsagi') {
    ok('A1 rendszergazdai profil + korlátlan jogosultság → országos, globális elvárva')
  } else {
    fail(`A1: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A2 — EZ MAGA A TULAJDONOS KÉRÉSE. Master, DE barátosi gyülekezeti profil.
//      Csak a saját gyülekezetét lássa, és a rendszerszintű mentést NE várja el.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: null, // master → korlátlan jogosultság
    profil: ['baratos'], // …de a bekapcsolt profil Barátos
    aktivScope: 'congregation',
  })
  if (
    egyenlo(r.congregationIds, ['baratos']) &&
    r.globalisIsVarhato === false &&
    r.indok === 'profil_szukit'
  ) {
    ok('A2 master + gyülekezeti profil → CSAK a saját gyülekezet (a 3. kérés lényege)')
  } else {
    fail(`A2: ${JSON.stringify(r)} — a master gyülekezeti profilban is országos hatókört kapott`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A3 — A PROFILVÁLTÁS SOHA NEM TÁGÍT. Kerületi admin, aki egy hatókörén KÍVÜLI
//      gyülekezet profilját kapcsolná be → üres metszet, nem szivárgás.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b'], // a kerülete gyülekezetei
    profil: ['idegen'], // …de egy másik kerület gyülekezete
    aktivScope: 'congregation',
  })
  if (egyenlo(r.congregationIds, []) && uresHatokor(r)) {
    ok('A3 a profilváltás NEM tágít: hatókörön kívüli gyülekezet → üres metszet')
  } else {
    fail(`A3: ${JSON.stringify(r)} — a profilváltás átlépte a jogosultsági hatókört`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A4 — METSZET, nem unió. Kerületi admin megyei profilban: csak a közös rész.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b', 'c'],
    profil: ['b', 'c', 'd'],
    aktivScope: 'diocese',
  })
  if (egyenlo(r.congregationIds, ['b', 'c']) && r.globalisIsVarhato === false) {
    ok('A4 metszet (nem unió): a közös rész marad, az idegen „d" kiesik')
  } else {
    fail(`A4: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A5 — FAIL-CLOSED. Ha a profil hatóköre nem oldható fel (`undefined`), a
//      SZŰKEBB ág nyer: ÜRES, soha nem országos.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: undefined, aktivScope: 'congregation' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A5 feloldhatatlan profil-hatókör → ÜRES (fail-closed), NEM országos')
  } else {
    fail(`A5: ${JSON.stringify(r)} — a feloldhatatlan hatókör országosra esett vissza`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A6 — Ugyanez `null` profillal egy SZŰKÍTŐ scope-on: értelmezhetetlen bemenet,
//      tehát szintén fail-closed. (Szűkítő profil nem adhat korlátlan hatókört.)
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'district' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A6 szűkítő scope + „nem szűkít" profil → fail-closed üres hatókör')
  } else {
    fail(`A6: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7 — NINCS profile_roles sor (`aktivScope: null`): nincs bekapcsolt profil,
//      amit követni lehetne → a jogosultság MAGA az aktív kontextus.
//      Ez szándékos: enélkül elnémulna az őrszem egy olyan rendszergazdánál,
//      aki még nem kapott multi-role sorokat.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: null })
  if (r.congregationIds === null && r.globalisIsVarhato === true) {
    ok('A7 nincs profile_roles → a jogosultság dönt (az őrszem nem némul el)')
  } else {
    fail(`A7: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7b — „ISMERETLEN": a `profile_roles` lekérdezés HIBÁZOTT, tehát NEM tudjuk,
//       van-e bekapcsolt profil. Ez NEM azonos az A7-tel: ott bizonyítékunk van
//       arra, hogy nincs sor, itt csak tudatlanságunk. Fail-closed ÜRES hatókör.
//
//       ⚠️ EZ AZ ASSERT A LÉNYEG. A7 és A7b bemenete korábban UGYANAZ a `null`
//       volt, ezért egy tranziens Supabase/RLS-hiba a `profile_roles` olvasásán
//       NÉMÁN visszahozta az országos hatókört a barátosi profilban — pontosan
//       az a tünet, amit ez a kör javítani hivatott.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: undefined, aktivScope: 'ismeretlen' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed' && r.globalisIsVarhato === false) {
    ok('A7b beolvashatatlan profile_roles → ÜRES (fail-closed), NEM országos')
  } else {
    fail(`A7b: ${JSON.stringify(r)} — a beolvashatatlan profile_roles országosra tágított`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7c — Ugyanez akkor is, ha a profil-feloldó véletlenül `null`-t (nem szűkít)
//       adna: az „ismeretlen" ág MINDENT megelőz, nem lehet megkerülni.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'ismeretlen' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A7c az „ismeretlen" ág megelőzi a profil-feloldást is')
  } else {
    fail(`A7c: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A8 — A KERÜLETI ADMIN MA IS AZT LÁTJA, AMIT EDDIG: a saját kerületét, és a
//      rendszerszintű mentést nem várja el. (Nincs viselkedés-visszalépés.)
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b'],
    profil: ['a', 'b'],
    aktivScope: 'district',
  })
  if (egyenlo(r.congregationIds, ['a', 'b']) && r.globalisIsVarhato === false) {
    ok('A8 kerületi admin kerületi profilban: a saját kerülete, globális nélkül')
  } else {
    fail(`A8: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A9 — A BEMENET NEM MÓDOSUL (a hívó tömbjét nem írjuk felül).
// ────────────────────────────────────────────────────────────────────────────
{
  const profil = ['x', 'y']
  const jog = ['x']
  metszHatokort({ jogosultsagi: jog, profil, aktivScope: 'congregation' })
  if (egyenlo(profil, ['x', 'y']) && egyenlo(jog, ['x'])) {
    ok('A9 a bemeneti tömbök változatlanok maradnak')
  } else {
    fail('A9: a függvény módosította a bemenetet')
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nMegjelenítési hatókör önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nMegjelenítési hatókör önellenőrzés: minden zöld')
