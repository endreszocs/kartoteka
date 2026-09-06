#!/usr/bin/env node
/**
 * STÁTUSZ-KAPU önellenőrzés (2026-09-04, P0·2 — ÚJRAÍRVA 2026-09-06).
 *
 * Mit véd:
 *   - `apps/web/lib/auth/effective-access.ts` — a származtatott jogok
 *     (admin / egyhazkeruletiAdmin / esperes / konyvelo / szamvevo)
 *     KELETKEZÉSI pontja.
 *   - `apps/web/lib/auth/admin-access.ts` — a második védelmi vonal.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-03-i védelmi felülvizsgálat P0·2 találata: a származtatott jogok
 * KIZÁRÓLAG a `profiles.role` értékéből jöttek, `profiles.status` nélkül. A
 * státusz-kapu csak a `(dashboard)/layout.tsx`-ben élt — az viszont OLDAL-
 * renderelést kapuz, NEM szerver-akciót. A Next.js szerver-akció önálló
 * POST-végpont: a layout soha nem fut le előtte. Egy `status='pending'` profil
 * tehát a teljes `/admin` szerver-akció felületet elérte.
 *
 * `access.admin`-t 74 hely olvassa, `egyhazkeruletiAdmin`-t 41 — ha a kapu a
 * keletkezésnél elvész, mind a 115 helyen elvész.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT LETT ÚJRAÍRVA (2026-09-06) — A RÉGI VÁLTOZAT VAK VOLT
 * ════════════════════════════════════════════════════════════════════════════
 * Egy utóellenőrzés négy konkrét lyukat mért ki az ELSŐ változatban:
 *
 *  1. ⛔ A „mutáns-ellenőrzés" TAUTOLÓGIA volt. A mutáns egy olyan cserét
 *     végzett, ami PONTOSAN azt a szövegrészt (a `statusActive &&` előtagot)
 *     törölte, amit az asszertek kötelezően megköveteltek. Logikailag nem
 *     tudott elbukni, tehát semmit nem bizonyított a forrásról.
 *
 *  2. ⛔ A regexek ELŐTAGRA illesztettek, nem a teljes kifejezésre. Ezért
 *     `const admin = statusActive && isAdminRole(role, user.email) || kivetel`
 *     ZÖLDEN átment: a kapu ott van, csak épp egy `||` megkerüli.
 *
 *  3. ⛔ A `statusActive` levezetésének regexe nem volt sorvégre zárva:
 *     `const statusActive = master || profile?.status === 'active' || true`
 *     mind a 10 asszertet átengedte — pedig ez a javítás EGYETLEN teherhordó sora.
 *
 *  4. ⛔ A második védelmi vonal asszertje csak a FELTÉTEL SZÖVEGÉT mérte.
 *     A `throw` helyére írt `console.warn` — vagy egy üres `{}` törzs —
 *     zölden átment.
 *
 * A MOSTANI FELÉPÍTÉS ezt szerkezetileg zárja ki:
 *   · a vizsgálat TISZTA FÜGGVÉNY (`vizsgal`), ami forrás-párost kap és
 *     hibalistát ad — nincs globális állapot, amin egy asszert „elcsúszhat";
 *   · minden asszert TELJES kifejezést hasonlít össze, nem előtagot;
 *   · a mutánsok VALÓDI, elképzelhető visszaesések (nem a saját literáljuk
 *     törlése), és mindegyiktől MEGKÖVETELJÜK, hogy legalább egy asszertet
 *     megbuktasson. Ha egy mutáns túléli, EZ A TESZT BUKIK — mert akkor vak.
 *
 * Futtatás:  node scripts/selftest-status-kapu.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const EFFECTIVE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'effective-access.ts')
const ADMIN_ACCESS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'admin-access.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * Kommentek eltávolítása: blokk-kommentek + a csak-kommentből álló sorok.
 *
 * MIÉRT KELL: ez a fájl és a javítás docblockja SZÓ SZERINT idézi a régi hibás
 * sort (`const admin = isAdminRole(role, user.email)`), és egy naiv illesztés
 * arra is ráillene — az őrszem így akkor is „hibát" jelezne, amikor a kód helyes.
 */
function kommentNelkul(forras) {
  return forras
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((sor) => !/^\s*\/\//.test(sor))
    .join('\n')
}

/**
 * Egy `const <nev> = <kifejezes>` értékadás JOBB OLDALA, a sor VÉGÉIG.
 *
 * ⚠️ EZ A LÉNYEG a 2. és 3. lyuk ellen: a sor végéig olvasunk, tehát a
 * kifejezéshez ragasztott `|| kivetel` vagy `|| true` NEM tud elbújni.
 * `null`, ha nincs ilyen értékadás.
 */
function ertekadasJobbOldala(forras, nev) {
  const m = forras.match(new RegExp(`^[ \\t]*const\\s+${nev}\\s*=\\s*(.+?)[ \\t]*$`, 'm'))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

/** A `{ … }` blokk kiolvasása egy adott indextől, zárójel-számlálással. */
function blokkTorzse(forras, kezdoIndex) {
  const nyit = forras.indexOf('{', kezdoIndex)
  if (nyit === -1) return ''
  let melyseg = 0
  for (let i = nyit; i < forras.length; i += 1) {
    if (forras[i] === '{') melyseg += 1
    else if (forras[i] === '}') {
      melyseg -= 1
      if (melyseg === 0) return forras.slice(nyit, i + 1)
    }
  }
  return forras.slice(nyit)
}

// ════════════════════════════════════════════════════════════════════════════
// A VÁRT ALAKOK — pontos egyezésre, nem előtagra
// ════════════════════════════════════════════════════════════════════════════

const VART_STATUS_ACTIVE = "master || profile?.status === 'active'"

const VART_JOGOK = [
  { nev: 'admin', kifejezes: 'statusActive && isAdminRole(role, user.email)' },
  {
    nev: 'egyhazkeruletiAdmin',
    kifejezes: 'statusActive && isEgyhazkeruletiAdminRole(role, user.email)',
  },
  { nev: 'esperes', kifejezes: 'statusActive && isEsperesRole(role, user.email)' },
  { nev: 'konyvelo', kifejezes: 'statusActive && isKonyveloRole(role)' },
  { nev: 'szamvevo', kifejezes: 'statusActive && isSzamvevoRole(role)' },
]

/**
 * A TELJES VIZSGÁLAT, tiszta függvényként.
 *
 * @returns {string[]} a megsértett szabályok kódjai (üres tömb = minden rendben)
 *
 * MIÉRT TISZTA FÜGGVÉNY: így PONTOSAN ugyanaz a vizsgálat fut a valódi
 * forráson és minden mutánson. A régi változat hibája részben az volt, hogy a
 * mutáns-ág külön, gyengébb logikát futtatott.
 */
function vizsgal(effective, adminAccess) {
  const hibak = []

  // (1) A kapu levezetése PONTOSAN a várt alak — se több, se kevesebb.
  const statusActive = ertekadasJobbOldala(effective, 'statusActive')
  if (statusActive !== VART_STATUS_ACTIVE) {
    hibak.push('KAPU_LEVEZETES')
  }

  // (2) Mind az öt jog PONTOSAN a kapuzott alak. A sor végéig hasonlítunk,
  //     tehát a ragasztott `|| kivetel` is kiderül.
  for (const { nev, kifejezes } of VART_JOGOK) {
    if (ertekadasJobbOldala(effective, nev) !== kifejezes) {
      hibak.push(`JOG_${nev}`)
    }
  }

  // (3) A `role` NEM eshet el a kaputól — a /pending oldal abból mutatja meg,
  //     milyen szerepkört kért a felhasználó.
  const role = ertekadasJobbOldala(effective, 'role')
  if (!role || !role.includes('hasPrimaryRole ? profile.role')) {
    hibak.push('ROLE_LEVEZETES')
  }

  // (4) A kontextus KIADJA a mezőt — típusban, tartalék-objektumban és a
  //     tényleges visszatérésben egyaránt.
  if (!/statusActive:\s*boolean/.test(effective)) hibak.push('TIPUS')
  if (!/statusActive:\s*false/.test(effective)) hibak.push('TARTALEK_FAIL_CLOSED')

  //     A visszatérési objektum a kaput ÉS mind az öt jogot továbbadja.
  //     (A régi változat csak a `statusActive`-ot mérte itt.)
  for (const mezo of ['statusActive', ...VART_JOGOK.map((j) => j.nev)]) {
    if (!new RegExp(`^\\s{4}${mezo},\\s*$`, 'm').test(effective)) {
      hibak.push(`VISSZATERES_${mezo}`)
    }
  }

  // (5) MÁSODIK VÉDELMI VONAL: nem elég, hogy ott a feltétel — DOBNIA is kell.
  const feltetelIdx = adminAccess.search(/!access\.master\s*&&\s*!access\.statusActive/)
  if (feltetelIdx === -1) {
    hibak.push('MASODIK_VONAL_FELTETEL')
  } else {
    const torzs = blokkTorzse(adminAccess, feltetelIdx)
    if (!/throw\s+new\s+Error\s*\(/.test(torzs)) {
      hibak.push('MASODIK_VONAL_NEM_DOB')
    }
  }

  return hibak
}

// ════════════════════════════════════════════════════════════════════════════
// 1. A VALÓDI FORRÁS
// ════════════════════════════════════════════════════════════════════════════

const effectiveNyers = fs.readFileSync(EFFECTIVE, 'utf8')
const adminAccessNyers = fs.readFileSync(ADMIN_ACCESS, 'utf8')
const effective = kommentNelkul(effectiveNyers)
const adminAccess = kommentNelkul(adminAccessNyers)

const eloHibak = vizsgal(effective, adminAccess)

if (eloHibak.length === 0) {
  ok('a valódi forrás mind a 13 szabálynak megfelel')
  ok('  · a kapu levezetése pontosan: ' + VART_STATUS_ACTIVE)
  ok('  · mind az 5 jog a kapun keresztül keletkezik, ragasztott kiskapu nélkül')
  ok('  · a role változatlanul a profilból jön (a /pending oldal működik)')
  ok('  · a kapu és mind az 5 jog átjut a visszatérési objektumon')
  ok('  · a második védelmi vonal nem csak vizsgál, hanem DOB is')
} else {
  for (const h of eloHibak) {
    fail(`megsértett szabály: ${h}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MUTÁNSOK — VALÓDI, elképzelhető visszaesések
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ EZ A RÉSZ DÖNTI EL, HOGY AZ ŐRSZEM LÁT-E. Minden mutáns egy olyan
// változtatás, amit egy jóhiszemű refaktor VAGY egy rosszhiszemű kiskapu
// tényleg elkövethet. Ha BÁRMELYIK túléli, ez a teszt BUKIK — mert akkor
// pontosan azon a ponton vak.
//
// A régi változat mutánsa (`statusActive && ` törlése) azért volt értéktelen,
// mert épp a saját asszertjének a literálját törölte: tautológia volt.

const MUTANSOK = [
  {
    nev: 'a kapu eltűnik az admin jogról (a JAVÍTÁS ELŐTTI alak)',
    e: (s) =>
      s.replace(
        'const admin = statusActive && isAdminRole(role, user.email)',
        'const admin = isAdminRole(role, user.email)',
      ),
    a: (s) => s,
  },
  {
    nev: 'a kapu megmarad, de egy ragasztott || megkerüli',
    e: (s) =>
      s.replace(
        'const admin = statusActive && isAdminRole(role, user.email)',
        'const admin = statusActive && isAdminRole(role, user.email) || sajatKivetel',
      ),
    a: (s) => s,
  },
  {
    nev: 'a kapu levezetése kitágul (|| true a végén)',
    e: (s) =>
      s.replace(
        "const statusActive = master || profile?.status === 'active'",
        "const statusActive = master || profile?.status === 'active' || true",
      ),
    a: (s) => s,
  },
  {
    nev: 'a kapu levezetése elveszíti a státusz-feltételt',
    e: (s) =>
      s.replace(
        "const statusActive = master || profile?.status === 'active'",
        'const statusActive = true',
      ),
    a: (s) => s,
  },
  {
    nev: 'a második védelmi vonal figyelmeztet, de nem dob',
    e: (s) => s,
    a: (s) =>
      s.replace(/throw\s+new\s+Error\s*\(\s*\n?\s*'A fiók még nincs jóváhagyva/, "console.warn('A fiók még nincs jóváhagyva"),
  },
  {
    nev: 'a visszatérési objektum elejti az admin mezőt',
    e: (s) => s.replace(/^\s{4}admin,\s*$/m, '    admin: false,'),
    a: (s) => s,
  },
  {
    nev: 'a konyvelo jog kikerül a kapu alól',
    e: (s) =>
      s.replace(
        'const konyvelo = statusActive && isKonyveloRole(role)',
        'const konyvelo = isKonyveloRole(role)',
      ),
    a: (s) => s,
  },
]

let vakPontok = []
for (const m of MUTANSOK) {
  const mutansE = m.e(effective)
  const mutansA = m.a(adminAccess)

  // Épség-ellenőrzés: ha a mutáns nem változtatott semmit, az illesztése
  // elavult — akkor NEM a forrásról mond valamit, hanem a saját hibája.
  if (mutansE === effective && mutansA === adminAccess) {
    fail(`a(z) „${m.nev}" mutáns NEM VÁLTOZTATOTT semmit — elavult az illesztése, javítsd`)
    continue
  }

  const hibak = vizsgal(mutansE, mutansA)
  if (hibak.length === 0) {
    vakPontok.push(m.nev)
  }
}

if (vakPontok.length === 0) {
  ok(`mutáns-ellenőrzés: mind a ${MUTANSOK.length} visszaesést elkapja (az őrszem LÁT)`)
} else {
  for (const v of vakPontok) {
    fail(`MUTÁNS TÚLÉLTE — az őrszem VAK erre: „${v}"`)
  }
}

console.log('')
if (failed) {
  console.error('❌ STÁTUSZ-KAPU önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('✅ STÁTUSZ-KAPU önellenőrzés: minden asszert rendben')
