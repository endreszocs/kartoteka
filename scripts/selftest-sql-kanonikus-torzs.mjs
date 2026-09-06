#!/usr/bin/env node
/**
 * SQL KANONIKUS TÖRZS önellenőrzés (2026-09-06).
 *
 * Mit véd: a `migration-docs/sql/` alatt élő, BIZTONSÁGKRITIKUS függvény-
 * definíciókat — nem a produkciót, hanem a REPÓT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT — A „TÖLTÖTT FEGYVER" HIBAOSZTÁLY
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-04-i javítási kör kilenc DB-oldali tételt zárt le (státusz-kapuk,
 * a regisztrációs trigger, az import hívó-azonosítója). Ezek mind
 * `CREATE OR REPLACE FUNCTION`-nel készültek.
 *
 * A `CREATE OR REPLACE` viszont NEM egyirányú: ugyanannak a függvénynek a RÉGI,
 * javítás ELŐTTI törzse továbbra is ott áll a repóban, más migrációs fájlokban.
 * Aki egy régi fájlt jóhiszeműen újrafuttat — mert éppen egy másik hibát keres,
 * vagy mert új környezetet állít fel —, az EGYETLEN paranccsal, NÉMÁN visszaveszi
 * a biztonsági javítást. Az adatbázis nem tiltakozik, a felület nem változik,
 * és a következő auditig senki nem veszi észre.
 *
 * A projekt rögzített tapasztalata ehhez: „a migration-fájl NEM bizonyíték" —
 * a repó és a produkció némán széthúz. Ez a teszt a másik irányt őrzi: hogy a
 * repóban ne maradjon élesíthető, visszaléptető töltény.
 *
 * ⚠️ EZ A TESZT NEM AZ ÉLES ADATBÁZIST MÉRI. Az élő állapotot csak SQL-lel
 * lehet megnézni (`docs/2026-09-05-auth-utoellenorzes.sql` A) szakasza).
 * Ez a teszt azt őrzi, hogy a repóban ne legyen olyan futtatható fájl, ami
 * jelöletlenül visszaléptetne.
 *
 * A FELMENTÉS MÓDJA: ha egy régi fájl szándékosan marad meg (mert a történetet
 * dokumentálja), a FEJLÉCÉBEN legyen ott az `NE FUTTASD` jelölés — ugyanaz a
 * bevett minta, amit a `2026-09-04-auth-p0-javitasok-2.sql` és a
 * `2026-09-05-fuggveny-jogok-TERVEZET-NE-FUTTASD.sql` is használ.
 *
 * Futtatás:  node scripts/selftest-sql-kanonikus-torzs.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SQL_DIR = path.join(REPO_ROOT, 'migration-docs', 'sql')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * A védett invariánsok. Mindegyik egy függvénynév + egy követelmény a törzsre.
 *
 * A `kell` egy regex, aminek a törzsben ILLESZKEDNIE kell; a `tilos` (opcionális)
 * pedig olyan minta, aminek NEM szabad benne lennie.
 */
const INVARIANSOK = [
  {
    nev: 'is_admin',
    kell: /\bstatus\b/i,
    miert: 'a jóváhagyásra váró vagy visszavont fiók szerepköre nem adhat admin-jogot',
  },
  {
    nev: 'is_caller_admin_for_user_mgmt',
    kell: /\bstatus\b/i,
    miert: 'a felhasználókezelő RPC-család kapuja',
  },
  {
    nev: 'is_master_admin',
    kell: /\bstatus\b/i,
    miert: 'négy iktató-RPC épül rá',
  },
  {
    nev: 'current_user_has_global_access',
    kell: /\bstatus\b/i,
    miert: 'ez az országos hozzáférés gerince (~50 tábla RLS-e)',
  },
  {
    nev: 'handle_new_user',
    tilos: /requested_role/i,
    miert: 'a regisztráló metaadata nem dönthet szerepkört (P0)',
  },
  {
    nev: 'import_finance_batch',
    kell: /auth\.uid\(\)/,
    tilos: /pr\.profile_id\s*=\s*p_user_id/,
    miert: 'a hívó kiléte a tokenből jöjjön, ne a kliens paraméteréből (P0)',
  },
  {
    nev: 'admin_activate_user',
    kell: /p_user_id\s*=\s*auth\.uid\(\)/,
    miert: 'az önaktiválás explicit tilalma (mélységi védelem a trigger mellett)',
  },
]

/** A fejléc tartalmazza-e a „NE FUTTASD" felmentő jelölést? (első 60 sor) */
function neFuttasdJeloles(tartalom) {
  const fejlec = tartalom.split('\n').slice(0, 60).join('\n')
  return /NE\s*FUTTASD|EZT\s+A\s+FÁJLT\s+NE|ELAVULT\s*—\s*NE/i.test(fejlec)
}

/**
 * Egy függvény ÖSSZES törzsének kiolvasása egy fájlból.
 *
 * A törzs a `AS $tag$ … $tag$` közötti rész. A dollár-idézést a Postgres
 * pontosan így zárja, tehát a címke visszakeresése megbízható — szemben egy
 * naiv „az első pontosvesszőig" vágással, ami a törzs belsejében lévő
 * pontosvesszőknél elszakadna.
 */
function torzsekKiolvasasa(tartalom, fnNev) {
  const talalatok = []
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnNev}\\b`, 'gi')
  let m
  while ((m = re.exec(tartalom)) !== null) {
    const utana = tartalom.slice(m.index)
    const tagM = utana.match(/\bAS\s+(\$[A-Za-z_]*\$)/)
    if (!tagM) continue
    const tag = tagM[1]
    const kezd = utana.indexOf(tag) + tag.length
    const veg = utana.indexOf(tag, kezd)
    if (veg === -1) continue
    talalatok.push(utana.slice(kezd, veg))
  }
  return talalatok
}

// ════════════════════════════════════════════════════════════════════════════
// A VIZSGÁLAT
// ════════════════════════════════════════════════════════════════════════════

if (!fs.existsSync(SQL_DIR)) {
  fail(`a migration-docs/sql könyvtár nem található (${SQL_DIR})`)
  process.exit(1)
}

const fajlok = fs
  .readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({
    nev: f,
    ut: path.join(SQL_DIR, f),
    tartalom: fs.readFileSync(path.join(SQL_DIR, f), 'utf8'),
  }))

ok(`${fajlok.length} SQL-fájl átvizsgálva a migration-docs/sql alatt`)

let toltottFegyverek = []

for (const inv of INVARIANSOK) {
  const serto = []
  let osszesTorzs = 0

  for (const f of fajlok) {
    const torzsek = torzsekKiolvasasa(f.tartalom, inv.nev)
    if (torzsek.length === 0) continue
    osszesTorzs += torzsek.length

    for (const torzs of torzsek) {
      const megfelel =
        (!inv.kell || inv.kell.test(torzs)) && (!inv.tilos || !inv.tilos.test(torzs))
      if (megfelel) continue
      // Nem felel meg — de fel van-e mentve?
      if (neFuttasdJeloles(f.tartalom)) continue
      serto.push(f.nev)
    }
  }

  if (osszesTorzs === 0) {
    fail(`${inv.nev}: EGYETLEN definíciót sem találtam — elavult ez az őrszem, vagy törölték a függvényt`)
    continue
  }

  const egyediSerto = [...new Set(serto)]
  if (egyediSerto.length === 0) {
    ok(`${inv.nev}: mind a(z) ${osszesTorzs} törzs megfelel (${inv.miert})`)
  } else {
    toltottFegyverek.push({ nev: inv.nev, fajlok: egyediSerto, miert: inv.miert })
  }
}

if (toltottFegyverek.length > 0) {
  console.error('')
  console.error('⛔ TÖLTÖTT FEGYVER: jelöletlen, visszaléptető függvény-törzs a repóban')
  console.error('')
  for (const t of toltottFegyverek) {
    fail(
      `${t.nev} — ${t.fajlok.length} fájlban áll olyan törzs, ami MEGSÉRTI az invariánst ` +
        `(${t.miert}):\n        ${t.fajlok.join('\n        ')}`,
    )
  }
  console.error('')
  console.error('    MIT KELL TENNI: mindegyik fájl FEJLÉCÉBE (az első 60 sorba) kerüljön')
  console.error('    egy „NE FUTTASD" jelölés, ami elmondja, MELYIK fájl a kanonikus.')
  console.error('    Minta: migration-docs/sql/2026-09-04-auth-p0-javitasok-2.sql fejléce.')
  console.error('    A fájlokat NEM kell törölni — a történetet dokumentálják.')
}

// ════════════════════════════════════════════════════════════════════════════
// MUTÁNS-ELLENŐRZÉS — lát-e egyáltalán ez az őrszem?
// ════════════════════════════════════════════════════════════════════════════
//
// Egy jelöletlen fájlba beleírjuk a RÉGI, hibás törzset, és megköveteljük,
// hogy a vizsgálat elkapja. Enélkül nem tudnánk, hogy a törzs-kiolvasás
// egyáltalán működik-e ezen a fájlformátumon.

{
  const mutansTartalom = [
    '-- egy jelöletlen migráció, ami visszalépteti a triggert',
    'CREATE OR REPLACE FUNCTION public.handle_new_user()',
    'RETURNS TRIGGER LANGUAGE plpgsql AS $mutans$',
    'BEGIN',
    "  INSERT INTO public.profiles (id, role)",
    "  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'requested_role', 'lelkesz'));",
    '  RETURN NEW;',
    'END;',
    '$mutans$;',
  ].join('\n')

  const torzsek = torzsekKiolvasasa(mutansTartalom, 'handle_new_user')
  const elkapva =
    torzsek.length === 1 && /requested_role/i.test(torzsek[0]) && !neFuttasdJeloles(mutansTartalom)

  if (elkapva) {
    ok('mutáns-ellenőrzés: a jelöletlen, visszaléptető törzset elkapja (az őrszem LÁT)')
  } else {
    fail(
      'MUTÁNS TÚLÉLTE: a törzs-kiolvasás nem ismerte fel a visszaléptető definíciót — ' +
        `${torzsek.length} törzset talált. Az őrszem VAK.`,
    )
  }

  // És a felmentés is működjön: ugyanaz a tartalom „NE FUTTASD" fejléccel legyen elfogadva.
  const felmentett = '-- ⛔ EZT A FÁJLT NE FUTTASD — elavult\n' + mutansTartalom
  if (neFuttasdJeloles(felmentett)) {
    ok('mutáns-ellenőrzés: a „NE FUTTASD" jelöléssel ellátott fájl felmentést kap')
  } else {
    fail('a „NE FUTTASD" felmentés nem ismerhető fel — a jelölés mintája elavult')
  }
}

console.log('')
if (failed) {
  console.error('❌ SQL KANONIKUS TÖRZS önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('✅ SQL KANONIKUS TÖRZS önellenőrzés: nincs jelöletlen visszaléptető törzs')
