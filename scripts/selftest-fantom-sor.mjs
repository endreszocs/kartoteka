#!/usr/bin/env node
/**
 * FANTOM-SOR önellenőrzés (2026-08-30, Endre kérése)
 *
 * MIT ŐRIZ: a Tétel rögzítőben mindig van alul egy üres új sor, és amint a
 * felhasználó az utolsóba írni kezd, magától megjelenik a következő — nem
 * kell az „Új sor" gombra kattintani.
 *   (1) az érintettség-vizsgálat (fantomErintett) TÁGABB a rowHasContent-nél:
 *       az irattípus (docType) és a nyugtaszám (gyulekezetiSzam) gépelése is
 *       számít — az irattípussal kezdő felhasználó is kapjon új sort;
 *   (2) a setter-en BELÜL is újra-ellenőrzünk (dupla üres sor / verseny ellen);
 *   (3) az új fantom-sor az előző sor dátumát örökli (mint az „Új sor" gomb —
 *       tömeges rögzítésnél ne ugorjon vissza a mai napra).
 *
 * NEGATÍV ASSZERT: a viselkedést elrontó mutánsok (F1–F2).
 *
 * Futtatás:  node scripts/selftest-fantom-sor.mjs
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

/** Függvény-határolt ablak — a fix hosszú ablak átlóg a szomszédba és vakítja a mutánst. */
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

  const blokk = ablak(src, 'const fantomErintett', ['\n  function clearDraft', '\n  function handleSave'])
  if (!blokk) {
    hiba('nincs fantomErintett + fantom-sor effekt a CombinedEntryBody-ban')
    return helyi
  }
  // (1) tágabb érintettség: docType + gyulekezetiSzam is számít
  if (blokk.includes('rowHasContent(r)') && blokk.includes('r.docType.trim()') && blokk.includes('r.gyulekezetiSzam.trim()')) {
    jo('fantomErintett: rowHasContent + docType + gyulekezetiSzam (az irattípussal kezdő is kap új sort)')
  } else {
    hiba('a fantomErintett nem fedi a docType/gyulekezetiSzam gépelését')
  }
  // (2) setter-en belüli újra-ellenőrzés (dupla üres sor ellen)
  if (blokk.includes('if (u && !fantomErintett(u)) return cur')) {
    jo('fantom-sor: a setter-en belül is újra-ellenőriz (nem szaporodik az üres sor)')
  } else {
    hiba('a fantom-sor effektből hiányzik a setter-en belüli újra-ellenőrzés')
  }
  // (3) dátum-öröklés az előző sorról
  if (blokk.includes('r.datum = u.datum')) {
    jo('fantom-sor: az új sor az előző dátumát örökli')
  } else {
    hiba('a fantom-sor nem örökli az előző sor dátumát')
  }
  return helyi
}

const raw = fs.readFileSync(BODY, 'utf8')

console.log('— Pozitív asszertek —')
asszertek(raw, true)

console.log('— Mutánsok (az elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'F1: a setter-en belüli újra-ellenőrzés törlése — szaporodó üres sorok',
    alkalmaz: (s) => (s.includes('if (u && !fantomErintett(u)) return cur')
      ? s.replace('if (u && !fantomErintett(u)) return cur', '')
      : null),
  },
  {
    nev: 'F2: a fantomErintett szűkítése (docType kiesik) — irattípussal kezdve nincs új sor',
    alkalmaz: (s) => {
      const a = ablak(s, 'const fantomErintett', ['\n  useEffect'])
      if (!a || !a.includes("|| !!r.docType.trim()")) return null
      return s.replace(a, a.replace("|| !!r.docType.trim()", ''))
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
  console.error(`${fail} hiba, ${ok} rendben — a fantom-sor őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — fantom-sor (mindig van üres új sor alul) őr zöld`)
