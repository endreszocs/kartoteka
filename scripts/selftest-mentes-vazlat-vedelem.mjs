#!/usr/bin/env node
/**
 * VÁZLAT-VÉDELEM + NYUGTASZÁM-KÖR önellenőrzés (2026-08-30, Endre kérése)
 *
 * ENDRE KÖVETELMÉNYE: „addig nem tűnhet el a vázlat, amíg minden tétel a
 * vázlatból nem menti! Ha egy is kimarad, akkor a teljes vázlat vázlatként bent
 * marad!" — több száz sor bevezetésénél SEMMI nem veszhet el.
 *
 * MIT ŐRIZ:
 *  (1) A sikeresen elmentett sor NEM TŰNIK EL az űrlapról — `mentveAt`-tal
 *      JELÖLT lesz. (A régi világ eltávolította őket: így a vázlat csonkult, és
 *      a nyugtaszám-számláló elvesztette a köteg-előzményt → elölről kezdte.)
 *  (2) A mentett sor NEM mehet ki MÉGEGYSZER: a `rowValidIn` fail-closed
 *      kizárja (így a „Mentés (N tétel)" számláló is helyes).
 *  (3) A vázlat CSAK akkor törlődik, ha MINDEN menthető sor elment
 *      (`mindenMentve` kapu a clearDraft/onClose előtt).
 *  (4) A vázlat-migráció megőrzi a `mentveAt`-ot — F5/újranyitás után is
 *      látszik, mi ment már el (dupla könyvelés ellen).
 *  (5) A nyugtaszám-cache ÜRÜL sikeres bevétel-mentés után (a befagyott
 *      számláló volt az „elölről kezdte" átmeneti oka).
 *  (6) Chitanță ÜRES gyülekezeti nyugtaszámmal nem menthető — az ilyen sor a
 *      szerveren `nyugta = iratszam` alakot kap, és MÉRGEZI a sorozatot.
 *  (7) A puszta irattípusból NEM képződik iratszám (a „Factură"-ütközés).
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (V1–V6).
 *
 * Futtatás:  node scripts/selftest-mentes-vazlat-vedelem.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Függvényhatáros ablak — a fix hosszú ablak átlóg a szomszédba és vakítja a mutánst. */
function ablak(src, jelzo, vegJelzok) {
  const start = src.indexOf(jelzo)
  if (start < 0) return null
  let end = src.length
  for (const v of vegJelzok) {
    const i = src.indexOf(v, start + jelzo.length)
    if (i >= 0 && i < end) end = i
  }
  return src.slice(start, end)
}

function asszertek(rawSrc, jelent) {
  const src = stripComments(rawSrc)
  let helyi = 0
  const hiba = (msg) => { helyi++; if (jelent) bukik(msg) }
  const jo = (msg) => { if (jelent) pass(msg) }

  // (1) a mentett sor JELÖLT, nem törölt
  // A jelölő a mentési törzsben él (`const jelolMentettnek = …`), ezért 4 szóközös
  // behúzású végjelzők kellenek — a 2 szóközös ablak a fájl végéig nyúlna.
  const jelol = ablak(src, 'const jelolMentettnek', ['\n    function ', '\n    const '])
  if (!jelol) {
    hiba('nincs jelolMentettnek — a mentett sorok nyilván még eltávolításra kerülnek (vázlat-csonkulás)')
  } else if (jelol.includes('mentveAt: mikor') && !jelol.includes('.filter(')) {
    jo('mentett sor: JELÖLT (mentveAt), nem eltávolított — a vázlat teljes marad')
  } else {
    hiba('a jelolMentettnek nem mentveAt-tal jelöl, vagy továbbra is szűr/eltávolít')
  }
  if (!src.includes('function removeRowsFromTab')) {
    jo('a régi removeRowsFromTab (soreltávolító) megszűnt')
  } else {
    hiba('a removeRowsFromTab még él — a mentett sorok eltűnnének a vázlatból')
  }

  // (2) a mentett sor fail-closed kizárva az újbóli mentésből
  const valid = ablak(src, 'function rowValidIn', ['\n  const incomeValid'])
  if (valid && /if \(r\.mentveAt\) return false/.test(valid)) {
    jo('rowValidIn: a mentett sor NEM mehet ki mégegyszer (dupla könyvelés ellen)')
  } else {
    hiba('a rowValidIn nem zárja ki a már elmentett sort — dupla könyvelés veszélye')
  }

  // (3) a vázlat CSAK teljes siker esetén törlődik
  const zaras = ablak(src, 'const mindenMentve', ['\n    } catch'])
  if (!zaras) {
    hiba('nincs mindenMentve kapu a mentés záró ágában')
  } else {
    if (zaras.includes('if (mindenMentve)') && zaras.includes('clearDraft()')) {
      jo('vázlat: CSAK teljes siker esetén törlődik (mindenMentve kapu)')
    } else {
      hiba('a clearDraft nincs a mindenMentve kapu mögött — részleges mentésnél is törölne')
    }
    if (zaras.includes('onClose()')) {
      jo('az ablak is csak teljes sikernél zárul (részlegesnél marad javítani)')
    } else {
      hiba('az onClose nem a teljes-siker ágban van')
    }
  }

  // (4) a vázlat-migráció megőrzi a mentveAt-ot
  const migr = ablak(src, 'const migrate =', ['\n      const inc ='])
  if (migr && migr.includes('people, mentveAt }')) {
    jo('vázlat-migráció: a mentveAt túléli az újranyitást (nem könyvelünk duplán)')
  } else {
    hiba('a vázlat-migráció elejti a mentveAt-ot — újranyitás után duplán mentene')
  }

  // (5) a nyugtaszám-cache ürül sikeres bevétel-mentés után
  if (src.includes('receiptCacheRef.current.clear()')) {
    jo('nyugtaszám-cache: ürül a mentés után (nem fagy be a számláló)')
  } else {
    hiba('a receiptCacheRef sosem ürül — a számozó a megnyitáskori értékre esne vissza')
  }

  // (6) Chitanță üres gyülekezeti számmal nem menthető
  if (/gyulekezetiSzam\.trim\(\) === ''/.test(src) && /Chitan/.test(src)) {
    jo('Chitanță-kapu: üres gyülekezeti nyugtaszám nem menthető (a sorozat nem mérgeződik)')
  } else {
    hiba('hiányzik a Chitanță üres-nyugtaszám kapu — a sorozat tovább mérgeződne')
  }

  // (7) a puszta irattípusból nem lesz iratszám
  const irat = ablak(src, 'function combinedIratszam', ['\n  function ', '\n  const '])
  if (!irat) {
    hiba('nincs combinedIratszam')
  } else if (irat.includes("if (!szam) return null")) {
    jo('combinedIratszam: üres irat sz. → nincs iratszám (nem lesz „Factură"-ütközés)')
  } else {
    hiba('a combinedIratszam a puszta irattípusból is iratszámot képez (determinisztikus ütközés)')
  }

  // (8) az ELLENŐRZŐ KÖR tanulságai (2026-08-30) — ezek a saját első verzióm hibái voltak:
  //  a) a fázis-hiba üzenete CSAK ténylegesen lezárt fázisokat sorolhat (a `savedIncomeRowIds`
  //     a köteg ÖSSZEÁLLÍTÁSAKOR telik meg — abból üzenetet építeni HAZUGSÁG);
  //  b) a „hátravan" kapu TARTALMAT mérjen (rowHasContent), ne érvényességet, és a sor
  //     SAJÁT fülének szabályát nézze (a kereszt-validálás kiúttalan hurkot adott);
  //  c) a mentett sor NE legyen szerkeszthető/törölhető (a javítás némán elveszne);
  //  d) a clearDraft után a vázlat-mentő effekt ne írja vissza a vázlatot.
  if (src.includes('const mentettFazisok') && !src.includes('savedIncomeRowIds.length + savedExpenseRowIds.length > 0')) {
    jo('fázis-hiba üzenet: CSAK ténylegesen lezárt fázisokat sorol (nem hazudik)')
  } else {
    hiba('a fázis-hiba üzenete a köteg-listákból számol — olyan sorokra is azt mondaná, hogy elmentek, amikből semmi nem ment ki')
  }
  if (src.includes('const hatravan = (rs: EntryRow[])') && src.includes('rowHasContent(r)')) {
    jo('a „hátravan" kapu TARTALMAT mér és fülönként validál (félkész sor sem veszhet el)')
  } else {
    hiba('a hátralévő-sor kapu érvényességet mér vagy keresztbe validál — félkész sor veszhet el / kiúttalan hurok')
  }
  const upd = ablak(src, 'function updateRow', ['\n  function '])
  const rem = ablak(src, 'function removeRow', ['\n  function '])
  if (upd && upd.includes('mentettSor(id)') && rem && rem.includes('mentettSor(id)')) {
    jo('elkönyvelt sor: nem szerkeszthető és nem törölhető (a javítás nem veszhet el némán)')
  } else {
    hiba('az elkönyvelt sor szerkeszthető/törölhető maradt — a javítás némán elveszne')
  }
  if (src.includes('zarasFolyamatbanRef.current) return')) {
    jo('vázlat-mentő effekt: a záráskor törölt vázlatot nem írja vissza')
  } else {
    hiba('a clearDraft után a vázlat-mentő effekt visszaírná a vázlatot (minden megnyitáskor feltámadna)')
  }

  return helyi
}

const raw = fs.readFileSync(BODY, 'utf8')

console.log('— Pozitív asszertek —')
asszertek(raw, true)

console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'V1: a mentett sorok ELTÁVOLÍTÁSA (a régi világ) — a vázlat csonkulna',
    alkalmaz: (s) => {
      const a = ablak(s, 'const jelolMentettnek', ['\n    function ', '\n    const '])
      if (!a || !a.includes('mentveAt: mikor')) return null
      return s.replace(a, a.replace('mentveAt: mikor', 'mentveAt_KIKAPCSOLVA: mikor'))
    },
  },
  {
    nev: 'V2: a mindenMentve kapu törlése — részleges mentésnél is törölné a vázlatot',
    alkalmaz: (s) => (s.includes('if (mindenMentve)')
      ? s.replace('if (mindenMentve)', 'if (true)')
      : null),
  },
  {
    nev: 'V3: a rowValidIn újra átengedi a mentett sort — dupla könyvelés',
    alkalmaz: (s) => (s.includes('if (r.mentveAt) return false')
      ? s.replace('if (r.mentveAt) return false', '')
      : null),
  },
  {
    nev: 'V4: a nyugtaszám-cache ürítés kivétele — visszatér a befagyott számláló',
    alkalmaz: (s) => (s.includes('receiptCacheRef.current.clear()')
      ? s.replaceAll('receiptCacheRef.current.clear()', 'void 0')
      : null),
  },
  {
    nev: 'V5: a Chitanță üres-nyugtaszám kapu kivétele — a sorozat újra mérgeződne',
    alkalmaz: (s) => (s.includes("gyulekezetiSzam.trim() === ''")
      ? s.replaceAll("gyulekezetiSzam.trim() === ''", "false && ''")
      : null),
  },
  {
    nev: 'V6: combinedIratszam visszarontása — a puszta irattípusból megint iratszám lesz',
    alkalmaz: (s) => (s.includes('if (!szam) return null')
      ? s.replace('if (!szam) return null', '')
      : null),
  },
  {
    nev: 'V8: a fázis-üzenet visszarontása a köteg-listákra — hazug „már elmentve"',
    alkalmaz: (s) => (s.includes('const mentettFazisok')
      ? s.replace('const mentettFazisok', 'const hazug = savedIncomeRowIds.length + savedExpenseRowIds.length > 0; const mentettFazisok_KI')
      : null),
  },
  {
    nev: 'V9: az elkönyvelt sor szerkesztés-védelmének kivétele — a javítás némán elveszne',
    alkalmaz: (s) => {
      const a = ablak(s, 'function updateRow', ['\n  function '])
      if (!a || !a.includes('mentettSor(id)')) return null
      return s.replace(a, a.replace('mentettSor(id)', 'false'))
    },
  },
  {
    nev: 'V10: a zárás-őr kivétele — a vázlat minden megnyitáskor feltámadna',
    alkalmaz: (s) => (s.includes('zarasFolyamatbanRef.current) return')
      ? s.replace('if (zarasFolyamatbanRef.current) return', '')
      : null),
  },
  {
    nev: 'V7: a vázlat-migráció elejti a mentveAt-ot — újranyitás után duplán mentene',
    alkalmaz: (s) => {
      const a = ablak(s, 'const migrate =', ['\n      const inc ='])
      if (!a || !a.includes('people, mentveAt }')) return null
      return s.replace(a, a.replace('people, mentveAt }', 'people }'))
    },
  },
]

for (const m of mutansok) {
  const mutalt = m.alkalmaz(raw)
  if (mutalt == null || mutalt === raw) {
    bukik(`${m.nev} — a mutáns nem alkalmazható (vak minta?)`)
    continue
  }
  const mutansHibak = asszertek(mutalt, false)
  if (mutansHibak > 0) pass(`${m.nev} — az őr elkapja (${mutansHibak} asszert bukik)`)
  else bukik(`${m.nev} — az őr VAK erre a mutánsra!`)
}

console.log('')
if (fail > 0) {
  console.error(`${fail} hiba, ${ok} rendben — a vázlat-védelem őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — vázlat-védelem + nyugtaszám-kör őr zöld`)
