#!/usr/bin/env node
/**
 * JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés
 * (2026-09-04, P1 — ÚJRAÍRVA 2026-09-06).
 *
 * Mit véd:
 *   - `apps/web/app/(auth)/forgot-password/actions.ts`  → setNewPassword
 *   - `apps/web/app/(dashboard)/profile/actions.ts`     → updatePassword
 *   - `apps/web/components/modals/settings-dialog.tsx`  → a felhasználói tájékoztatás
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-03-i védelmi felülvizsgálat megállapítása: a jelszóváltás után
 * SEMMILYEN munkamenet-visszavonás nem történt — az egész repóban nem volt
 * egyetlen `scope: 'global'` vagy `scope: 'others'` kiléptetés sem. Aki azért
 * állított vissza jelszót, mert attól tartott, hogy valaki hozzáfért a
 * fiókjához, pontosan azt nem érte el, amiért csinálta.
 *
 * A 2026-09-05-i mérés ezt súlyosbította: `auth.sessions.not_after` MINDENHOL
 * NULL, és a legrégebbi élő munkamenet 125 napos. Ami nincs kifejezetten
 * visszavonva, az gyakorlatilag örökké él.
 *
 * MIÉRT ESIK KI KÖNNYEN: a visszavonás a jelszó beállítása UTÁN áll, tehát
 * „a munka már kész" — egy refaktorban kézenfekvő fölöslegesnek nézni. A hiánya
 * pedig NÉMA: a jelszó attól még megváltozik, a felület sikert jelez.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT LETT ÚJRAÍRVA (2026-09-06) — KÉT LYUK AZ ELSŐ VÁLTOZATBAN
 * ════════════════════════════════════════════════════════════════════════════
 *  1. ⛔ CSAK AZ ELSŐ ELŐFORDULÁST MÉRTE. Az `indexOf` és a `search` egyaránt
 *     az első találatot adja, tehát az asszert csak annyit bizonyított:
 *     „létezik EGY jelszóváltás, ami után létezik EGY kiléptetés". Egy MÁSODIK,
 *     visszavonás nélküli jelszóváltó függvény ugyanabban a fájlban zölden
 *     átment volna. Mostantól MINDEN jelszóváltó függvényt külön mérünk.
 *  2. ⛔ NÉMÁN KIMARADT a felületi szakasz, ha a fájl neve megváltozik:
 *     `if (fs.existsSync(UI)) { … }` — `else` nélkül. A repóban a felület-
 *     átnevezés rutin (a betöltés-jelző körben 25 felület mozdult), tehát ez
 *     valós kockázat volt. Mostantól a hiányzó fájl BUKÁS.
 *
 * Futtatás:  node scripts/selftest-jelszo-munkamenet.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const FORRASOK = [
  {
    cimke: 'jelszó-visszaállítás',
    ut: path.join(REPO_ROOT, 'apps', 'web', 'app', '(auth)', 'forgot-password', 'actions.ts'),
  },
  {
    cimke: 'profil-oldali jelszóváltás',
    ut: path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'profile', 'actions.ts'),
  },
]

const UI = path.join(REPO_ROOT, 'apps', 'web', 'components', 'modals', 'settings-dialog.tsx')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * Kommentek eltávolítása.
 *
 * MIÉRT KELL: a javítás dokumentációja szó szerint idézi a hiányzó hívást, és
 * egy naiv illesztés a KOMMENTRE is ráillene — az őrszem így akkor is
 * átengedne, amikor a tényleges kód már nem tartalmazza. Ez a projekt rögzített
 * hibaosztálya (lásd selftest-hatokor.mjs SZ4b).
 */
function kommentNelkul(forras) {
  return forras
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((sor) => !/^\s*\/\//.test(sor))
    .join('\n')
}

/**
 * A forrás felbontása exportált függvényekre.
 *
 * MIÉRT: így MINDEN jelszóváltó függvényt külön tudunk mérni, nem csak az
 * elsőt. Egy fájl végére illesztett második jelszóváltó nem bújhat el.
 */
function fuggvenyekre(forras) {
  const hatarok = []
  const re = /export\s+async\s+function\s+(\w+)/g
  let m
  while ((m = re.exec(forras)) !== null) hatarok.push({ nev: m[1], kezd: m.index })
  return hatarok.map((h, i) => ({
    nev: h.nev,
    torzs: forras.slice(h.kezd, i + 1 < hatarok.length ? hatarok[i + 1].kezd : forras.length),
  }))
}

const JELSZOVALTAS_RE = /updateUser\(\s*\{\s*password/
const VISSZAVONAS_RE = /supabase\.auth\.signOut\(\s*\{\s*scope:\s*'others'\s*\}\s*\)/
const GLOBALIS_RE = /signOut\(\s*\{\s*scope:\s*'global'\s*\}\s*\)/

/**
 * A vizsgálat TISZTA FÜGGVÉNYE — ugyanaz fut a valódi forráson és a mutánsokon.
 * @returns {string[]} a megsértett szabályok kódjai
 */
function vizsgal(forras) {
  const hibak = []
  const fuggvenyek = fuggvenyekre(forras).filter((f) => JELSZOVALTAS_RE.test(f.torzs))

  if (fuggvenyek.length === 0) {
    hibak.push('NINCS_JELSZOVALTO_FUGGVENY')
    return hibak
  }

  for (const f of fuggvenyek) {
    // (1) MINDEN jelszóváltó függvényben legyen visszavonás — nem csak az elsőben.
    if (!VISSZAVONAS_RE.test(f.torzs)) {
      hibak.push(`NINCS_VISSZAVONAS_${f.nev}`)
      continue
    }

    // (2) A visszavonás a jelszó beállítása UTÁN álljon. Előtte futtatva a
    //     SAJÁT, még érvényes munkamenetet vonná vissza, és az updateUser
    //     hitelesítés nélkül maradna.
    const jelszoIdx = f.torzs.search(JELSZOVALTAS_RE)
    const kileptetesIdx = f.torzs.search(VISSZAVONAS_RE)
    if (!(kileptetesIdx > jelszoIdx)) {
      hibak.push(`ROSSZ_SORREND_${f.nev}`)
    }

    // (3) NEM 'global' — az a mostani munkamenetet is megölné, a felhasználó
    //     a siker-üzenetet sem látná.
    if (GLOBALIS_RE.test(f.torzs)) {
      hibak.push(`GLOBALIS_KILEPTETES_${f.nev}`)
    }

    // (4) A visszavonás hibája nem NÉMA. A jelszó ekkor MÁR megváltozott,
    //     visszagörgetni nem lehet — de elhallgatni sem szabad: pont a
    //     biztonsági hatás maradt el.
    const utana = f.torzs.slice(kileptetesIdx, kileptetesIdx + 900)
    if (!/kileptetesHiba/.test(f.torzs) || !/console\.error\(/.test(utana)) {
      hibak.push(`NEMA_HIBA_${f.nev}`)
    }
  }

  return hibak
}

// ════════════════════════════════════════════════════════════════════════════
// 1. A VALÓDI FORRÁSOK
// ════════════════════════════════════════════════════════════════════════════

const betoltott = []
for (const { cimke, ut } of FORRASOK) {
  if (!fs.existsSync(ut)) {
    fail(`${cimke}: a forrásfájl nem található (${path.relative(REPO_ROOT, ut)}) — átnevezték?`)
    continue
  }
  const forras = kommentNelkul(fs.readFileSync(ut, 'utf8'))
  betoltott.push({ cimke, forras })

  const hibak = vizsgal(forras)
  if (hibak.length === 0) {
    const db = fuggvenyekre(forras).filter((f) => JELSZOVALTAS_RE.test(f.torzs)).length
    ok(`${cimke}: mind a(z) ${db} jelszóváltó függvény visszavonja a többi munkamenetet`)
  } else {
    for (const h of hibak) fail(`${cimke}: megsértett szabály — ${h}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MUTÁNSOK — valódi, elképzelhető visszaesések
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A második mutáns a régi változat konkrét vakfoltját játssza újra: egy
// MÁSODIK jelszóváltó függvény a fájl végén, visszavonás nélkül. A régi
// őrszem erre ZÖLD volt.

const MUTANSOK = [
  {
    nev: 'a visszavonás eltűnik (a JAVÍTÁS ELŐTTI állapot)',
    mutal: (s) => s.replace(VISSZAVONAS_RE, 'undefined'),
  },
  {
    nev: 'egy MÁSODIK jelszóváltó függvény, visszavonás nélkül',
    mutal: (s) =>
      s +
      '\nexport async function ujJelszoValtoFuggveny(p) {\n' +
      '  const supabase = await createClient()\n' +
      '  const { error } = await supabase.auth.updateUser({ password: p })\n' +
      '  return { success: !error }\n}\n',
  },
  {
    nev: "a hatókör 'others' helyett 'global' (a felhasználót is kidobná)",
    mutal: (s) => s.replace(VISSZAVONAS_RE, "supabase.auth.signOut({ scope: 'global' })"),
  },
]

for (const { cimke, forras } of betoltott) {
  const tulelok = []
  for (const m of MUTANSOK) {
    const mutans = m.mutal(forras)
    if (mutans === forras) {
      fail(`${cimke}: a(z) „${m.nev}" mutáns NEM VÁLTOZTATOTT semmit — elavult az illesztése`)
      continue
    }
    if (vizsgal(mutans).length === 0) tulelok.push(m.nev)
  }
  if (tulelok.length === 0) {
    ok(`${cimke}: mutáns-ellenőrzés — mind a ${MUTANSOK.length} visszaesést elkapja`)
  } else {
    for (const t of tulelok) fail(`${cimke}: MUTÁNS TÚLÉLTE — az őrszem VAK erre: „${t}"`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. A FELÜLET SZÓL-E RÓLA
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT ŐRIZZÜK: a mellékhatás valódi és váratlan — a lelkész desktopja és
// telefonja jelszóváltás után újra belépést kér. Ha ezt nem mondjuk meg, a
// felhasználó azt hiszi, elromlott valami, és felhív. A biztonsági javítás
// akkor jó, ha nem termel támogatási hívást.
//
// ⚠️ A HIÁNYZÓ FÁJL BUKÁS, nem néma kihagyás — ez volt a régi változat 2. lyuka.

if (!fs.existsSync(UI)) {
  fail(
    `a jelszó-változtató felület nem található (${path.relative(REPO_ROOT, UI)}). ` +
      'Ha átnevezték, igazítsd ezt az őrszemet — a néma kihagyás nem elfogadható.',
  )
} else {
  const ui = kommentNelkul(fs.readFileSync(UI, 'utf8'))
  if (/többi eszközön/i.test(ui)) {
    ok('a felület elmondja, hogy a többi eszközön kiléptetjük a felhasználót')
  } else {
    fail(
      'a jelszó-változtató felület nem szól arról, hogy a többi eszközön megszűnik a bejelentkezés. ' +
        'A váratlan újra-belépés támogatási hívást termel.',
    )
  }
  if (/res\.warning/.test(ui)) {
    ok('a felület megjeleníti a visszavonás-figyelmeztetést, ha volt')
  } else {
    fail('a felület elnyeli a warning mezőt — a felhasználó nem tudná meg, ha a visszavonás elmaradt.')
  }
}

console.log('')
if (failed) {
  console.error('❌ JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('✅ JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés: minden asszert rendben')
