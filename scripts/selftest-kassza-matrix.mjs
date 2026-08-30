#!/usr/bin/env node
/**
 * KASSZA-MÁTRIX önellenőrzés (2026-08-30, Endre jóváhagyott terve)
 *
 * MIT ŐRIZ (több befizető × több év egy nyugtán — befizető-mátrix):
 *   (1) a mátrix-csoportosítás (matrixCsoportok) kulcsa a befizető AZONOSSÁGA
 *       (tag-id → jogi személy refId → normalizált név), névtelen bejegyzés
 *       pedig SAJÁT uid-kulcsot kap — két üres új sor SOSEM olvadhat össze;
 *       ütközésnél (ugyanaz a kulcs ugyanarra az évre kétszer) új sor-példány
 *       nyílik — bejegyzés SOSEM tűnhet el a nézetből;
 *   (2) a mátrix-aktiválás kapuja fail-closed: CSAK akkor él, ha MINDEN
 *       bejegyzésnek érvényes éve van (különben a klasszikus lista mutat
 *       mindent), és 2+ különböző évnél az ADATBÓL aktiválódik (vázlat-
 *       visszaállítás után is él);
 *   (3) az üres cella kitöltése (addPayerCell) a TELJES azonosságot másolja
 *       a csoport bázisáról (id + refId + kind) — jogi személy befizetőnél
 *       a partner-FK nem veszhet el;
 *   (4) Endre kérése: „ha 10 évet fizet… akkor is szépen átláthatóan férjen
 *       el minden" — a mátrix-tábla saját vízszintes görgetőben ül
 *       (overflow-x-auto), a Befizető-oszlop balra, az Összesen-oszlop
 *       jobbra RAGAD (sticky), a cella kulcsa pedig (csoport, év) — így
 *       gépelés közben (bejegyzés-létrejöttekor) nem vész el a fókusz;
 *   (5) a mentési út érintetlen: befizetésenként külön sor, közös nyugta,
 *       /N kerületi iratszám-utótag — a mátrix csak nézet.
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (M1–M4).
 *
 * Futtatás:  node scripts/selftest-kassza-matrix.mjs
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

/** Függvény-határolt ablak: a `jelzo`-től a KÖVETKEZŐ határolóig (alapból a
 *  következő top-level `function `/`export function`). A fix hosszú ablak
 *  átlóg a szomszéd függvénybe és vakká teszi a mutánst — ezért határolt. */
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

/** Az asszert-készlet — a mutáns-futásnál is EZ fut, változatlanul. */
function asszertek(rawSrc, jelent) {
  const src = stripComments(rawSrc)
  let helyi = 0
  const hiba = (msg) => { helyi++; if (jelent) bukik(msg) }
  const jo = (msg) => { if (jelent) pass(msg) }

  // (1) matrixCsoportok — azonosság-kulcs + ütközés-kezelés
  const csop = ablak(src, 'function matrixCsoportok', ['\nexport function CombinedEntryBody'])
  const kulcsFn = ablak(src, 'function payerKulcs', ['function matrixEv', 'function matrixCsoportok', '\nexport function CombinedEntryBody'])
  if (!csop || !kulcsFn) {
    hiba('nincs matrixCsoportok/payerKulcs a CombinedEntryBody-ban (a mátrix-csoportosítás hiányzik)')
  } else {
    if (kulcsFn.includes('`id:${p.id}`') && kulcsFn.includes('`ref:${p.refId}`') && kulcsFn.includes('`uid:${p.uid}`')) {
      jo('payerKulcs: id → refId → név → uid azonosság-lánc (névtelenek nem olvadnak össze)')
    } else {
      hiba('payerKulcs nem a teljes azonosság-láncot használja (id/refId/uid horgony hiányzik)')
    }
    if (csop.includes('!c.cellak.has(')) {
      jo('matrixCsoportok: (kulcs, év) ütközésnél új sor-példány — bejegyzés nem tűnhet el')
    } else {
      hiba('matrixCsoportok ütközés-kezelése hiányzik (!c.cellak.has horgony)')
    }
  }

  // (2a) aktiválási kapu — fail-closed (minden bejegyzésnek érvényes éve) + NEM vált élőben
  const kapu = ablak(src, 'const isMatrixActive', ['\n  function ', '\n  const multiYearChoices'])
  if (!kapu) {
    hiba('nincs isMatrixActive kapu')
  } else {
    if (kapu.includes('.every(') && kapu.includes('matrixEv(')) {
      jo('isMatrixActive: CSAK ha minden bejegyzésnek érvényes éve van (fail-closed)')
    } else {
      hiba('isMatrixActive nem követeli meg minden bejegyzés érvényes évét')
    }
    if (!kapu.includes('.size >= 2') && kapu.includes('multiYearRowIds.has(')) {
      jo('isMatrixActive: csak a kapcsolóból olvas — élő gépelés közben nem vált át magától')
    } else {
      hiba('isMatrixActive élő adat-alapú átváltást tartalmaz (a nézet a kéz alól váltana át)')
    }
  }
  // (2b) mag-vetés: a több-éves sor a VÁZLAT-VISSZAÁLLÍTÁSKOR az adatból éled fel
  const mag = ablak(src, 'const matrixMagok', ['\n      }', '\n    } catch'])
  if (!mag) {
    hiba('nincs matrixMagok mag-vetés a vázlat-visszaállításban')
  } else if (mag.includes('.size >= 2') && mag.includes('setMultiYearRowIds')) {
    jo('mag-vetés: 2+ különböző évű visszaállított sor mátrixként éled fel')
  } else {
    hiba('a matrixMagok mag-vetés hiányos (.size >= 2 / setMultiYearRowIds)')
  }
  // (2c) a csoport-műveletek SOR-PÉLDÁNYRA (uid-halmazra) céloznak, nem kulcsra
  const updGrp = ablak(src, 'function updatePayerGroup', ['\n  function '])
  const remGrp = ablak(src, 'function removePayerGroup', ['\n  function '])
  if (updGrp && updGrp.includes('halmaz.has(p.uid)') && remGrp && remGrp.includes('!halmaz.has(p.uid)')) {
    jo('csoport-műveletek: uid-halmazra célzottak (azonos kulcsú másik sort nem érinthetnek)')
  } else {
    hiba('a csoport-műveletek nem uid-halmazra célzottak (kulcs-alapú túltörlés veszélye)')
  }
  // (2d) év-hozzáadás: névtelen (azonosság nélküli) sor nem sokszorozódik
  const togg = ablak(src, 'function toggleMultiYearYear', ['\n  function '])
  if (togg && togg.includes("cs.kulcs.startsWith('uid:')")) {
    jo('év-hozzáadás: névtelen sor kimarad (nem duplázódik fantom-sorként)')
  } else {
    hiba('az év-hozzáadás nem hagyja ki a névtelen sort')
  }
  // (2e) az auto-kitöltés tiszteli a szándékosan kiürített cellát
  if (src.includes('userUresRef.current.has(')) {
    jo('auto-kitöltés: a felhasználó által kiürített cellába nem ír vissza („üres = nem fizet")')
  } else {
    hiba('az auto-kitöltésből hiányzik a kiürített-cella őr (userUresRef)')
  }

  // (3) addPayerCell — teljes azonosság-másolás a bázisról
  const cella = ablak(src, 'function addPayerCell', ['\n  function ', '\n  const '])
  if (!cella) {
    hiba('nincs addPayerCell (üres mátrix-cella kitöltése)')
  } else if (cella.includes('id: base.id') && cella.includes('refId: base.refId') && cella.includes('kind: base.kind')) {
    jo('addPayerCell: id + refId + kind másolódik a bázisról (jogi személy FK nem veszik el)')
  } else {
    hiba('addPayerCell nem másolja a teljes azonosságot (id/refId/kind)')
  }

  // (4) a mátrix-nézet: görgető + ragadó oszlopok + (csoport, év) cella-kulcs.
  // A KEZDET/VEG jelző kommentben él → a NYERS forrásból vágjuk ki az ablakot,
  // majd az ablakon BELÜL csupaszítunk — komment így sem elégíthet ki asszertet.
  const nezetRaw = ablak(rawSrc, 'MATRIX-NEZET-KEZDET', ['MATRIX-NEZET-VEG'])
  const nezet = nezetRaw ? stripComments(nezetRaw) : null
  if (!nezet) {
    hiba('nincs mátrix-nézet render-ág (MATRIX-NEZET-KEZDET/VEG jelzők)')
  } else {
    if (nezet.includes('overflow-x-auto')) {
      jo('mátrix: saját vízszintes görgető (10+ év is elfér)')
    } else {
      hiba('a mátrix-táblából hiányzik az overflow-x-auto (sok évnél szétesik)')
    }
    if (nezet.includes('sticky left-0') && nezet.includes('sm:sticky sm:right-0')) {
      jo('mátrix: Befizető balra + Összesen jobbra (sm-től) ragad — görgetve is látszik, ki mennyit fizet')
    } else {
      hiba('a mátrix ragadó oszlopai hiányoznak (sticky left-0 / sm:sticky sm:right-0)')
    }
    if (!nezet.includes('w-0 min-w-full')) {
      jo('mátrix: nincs percentage-min-width hack a konténeren (friss layoutnál 0-ra is oldódhatott)')
    } else {
      hiba('a mátrix konténerén percentage-min-width hack van — nem determinisztikus (0 széles görgető!)')
    }
    if (nezet.includes('sm:min-w-[9rem]') && nezet.includes('sm:sticky')) {
      jo('mátrix: mobilon keskenyebb név-oszlop + csak sm-től ragadó Összesen (375px-en is látszik év-cella)')
    } else {
      hiba('a mátrix ragadó oszlopai nem reszponzívak — mobilon a két fal közt nem férne el év-cella')
    }
    // 2026-08-29 (Endre: „minden betű után rá kell kattintsak") — MÉRT gyökérok:
    // a sor/cella React-kulcsa a payerKulcs-ból (= a GÉPELT NÉVBŐL) jött, ezért minden
    // leütésre unmount+mount → fókuszvesztés. A kulcs csak STABIL sor-azonosító lehet.
    if (nezet.includes('key={cs.sorUid}') && nezet.includes('${cs.sorUid}:${ev}')) {
      jo('mátrix React-kulcsok: stabil sorUid (a gépelt név SOSEM megy a kulcsba)')
    } else {
      hiba('a mátrix sor/cella kulcsa nem stabil sorUid — gépelés közben remountolna (fókuszvesztés!)')
    }
    if (!nezet.includes('key={sorKulcs}') && !nezet.includes('${cs.kulcs}:${ev}')) {
      jo('a névfüggő payerKulcs nincs benne egyetlen React-kulcsban sem')
    } else {
      hiba('a névfüggő payerKulcs MÉG MINDIG React-kulcs (fókuszvesztés minden leütésnél)')
    }
    if (nezet.includes('onCellaUrites(')) {
      jo('mátrix-cella: az ürítés jelölést kap (az auto-kitöltés nem töltheti vissza)')
    } else {
      hiba('a mátrix-cella ürítése nem jelölt — az auto-kitöltés visszaírná az összeget')
    }
  }

  // (4b) MOBIL: a PartnerCell NEM <label>-ben ül — a label-koppintás az első gombot
  // (mátrixban: Kikapcsol!) aktiválná, és egy koppintás adatot dobna el.
  const mobil = ablak(rawSrc, 'MOBIL-PARTNERCELL-DIV', ['<PartnerCell'])
  if (mobil && mobil.includes('<div') && !mobil.includes('<label')) {
    jo('mobil: a PartnerCell div-ben ül (a koppintás nem aktiválhatja a Kikapcsol gombot)')
  } else {
    hiba('mobil: a PartnerCell label-ben ül(het) — a koppintás a Kikapcsol gombot aktiválná (adatvesztés)')
  }
  // (4c) az asztali partner-oszlop CSAK mátrix-aktív sornál rugalmas (w-full) — a feltétel
  // nélküli w-full az ÖSSZES többi oszlopot összenyomta (Endre 2026-08-29: „nem látszanak
  // az adatok!" — az év „20."-ra, a megjegyzés „Decemb"-re csonkult).
  if (src.includes("isMatrixActive(r) ? 'w-full max-w-0 min-w-[26rem] '") && !src.includes('"w-full px-2 py-1.5"')) {
    jo('asztali partner-oszlop: feltételes w-full max-w-0 min-w-[26rem] (laptopon sem 0 a látható év-terület)')
  } else {
    hiba('az asztali partner-cella nem feltételes w-full max-w-0 min-w-[26rem] (csonkulás VAGY 0 px év-terület)')
  }
  // (4d) min-szélesség-őrök a többi oszlopon — mátrix-módban se csonkulhat dátum/év/összeg/megjegyzés
  // 2026-08-29 (Endre: „nem látszik a dátum") — a minimumok a TÉNYLEGES tartalomhoz
  // igazítva: a dátum-cellában a szöveges mező + a 36 px-es naptár-gomb együtt ~11rem.
  if (src.includes('w-[170px] min-w-[11rem]') && src.includes('w-[90px] min-w-[5.5rem]')) {
    jo('oszlop min-szélességek: a dátum/év mező tartalma kifér (nem csonkul „2026-C"-re)')
  } else {
    hiba('a dátum/év oszlop minimuma túl szűk — a beírt érték csonkulna')
  }
  // (4e) a Mentés-sáv RAGAD a dialóg aljára — görgetés nélkül elérhető (Endre kérése)
  const lab = ablak(rawSrc, 'FOOTER-MENTES-SAV', ['Mentés ('])
  if (lab && lab.includes('sticky bottom-0')) {
    jo('Mentés-sáv: sticky bottom-0 — görgetés nélkül mindig elérhető')
  } else {
    hiba('a Mentés-sáv nem ragad a dialóg aljára (görgetni kellene a mentéshez)')
  }

  // (4f) Endre 2026-08-29: a kiválasztott személy életkora + lakhelye is látszódjon
  const hitFn = ablak(src, 'function payerFromHit', ['\nfunction ', '\ntype '])
  if (hitFn && hitFn.includes('kor:') && hitFn.includes('lakhely:') && src.includes('payerInfoText(')) {
    jo('kiválasztott befizető: életkor + lakhely eltárolva és kiírva (azonos nevűek megkülönböztetése)')
  } else {
    hiba('a kiválasztott befizető életkora/lakhelye nem tárolódik vagy nem jelenik meg')
  }
  // (4f2) a kor/lakhely a LEGGYAKORIBB úton (üres sor → kereső → appendPayers) sem veszhet el
  const appFn = ablak(src, 'function appendPayers', ['\n  function '])
  if (appFn && appFn.includes('kor: a.kor ?? null') && appFn.includes('lakhely: a.lakhely ?? null')) {
    jo('appendPayers: a kor/lakhely átvezetve (a fő kiválasztási út sem ejti el)')
  } else {
    hiba('appendPayers elejti a kor/lakhely mezőket — az info-sor a fő úton nem jelenne meg')
  }
  // (4f3) a sorUid minden bejegyzés-létrehozó úton öröklődik/keletkezik
  const cellaFn = ablak(src, 'function addPayerCell', ['\n  function ', '\n  const '])
  if (cellaFn && cellaFn.includes('sorUid: base.sorUid')) {
    jo('addPayerCell: a cella a csoport sorUid-ját örökli (a sor kulcsa nem változik)')
  } else {
    hiba('addPayerCell nem örökli a sorUid-ot — új cellánál remountolna a sor')
  }
  // (4g) Endre 2026-08-29: zebra-csíkozás — váltakozó sor-háttér, index-alapú
  // A `sorBg` FELHASZNÁLÁSÁT nézzük, nem a beszúrás pontos alakját: a 2026-08-30-i
  // vázlat-védelemnél a tr-osztály feltételessé vált (`… : sorBg}`), és a régi,
  // alak-függő minta bukott — az őr a VISELKEDÉST védje.
  if (src.includes('sorIdx % 2') && src.includes('sorBg}')) {
    jo('zebra: váltakozó sor-háttér index-alapon (a leltár-alsor a saját sora hátterét kapja)')
  } else {
    hiba('nincs index-alapú zebra-csíkozás a tétel-sorokon')
  }

  // (5) a mentési út érintetlen (a mátrix csak nézet)
  if (src.includes('`${base}/${i + 1}`')) {
    jo('mentés: a /N kerületi iratszám-utótag érintetlen')
  } else {
    hiba('a mentési út /N utótag-képzése megváltozott vagy eltűnt')
  }

  return helyi
}

const raw = fs.readFileSync(BODY, 'utf8')

console.log('— Pozitív asszertek —')
const hibak = asszertek(raw, true)

// ── NEGATÍV ASSZERT: mutánsok — mindegyiknek BUKTATNIA kell a fenti készletet ──
console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'M1: a mátrix görgetője nélkül (overflow-x-auto → overflow-visible) — 10 év szétesne',
    alkalmaz: (s) => {
      const kezdet = s.indexOf('MATRIX-NEZET-KEZDET')
      const veg = s.indexOf('MATRIX-NEZET-VEG')
      if (kezdet < 0 || veg < 0) return null
      const elotte = s.slice(0, kezdet)
      const bent = s.slice(kezdet, veg).replace('overflow-x-auto', 'overflow-visible')
      return elotte + bent + s.slice(veg)
    },
  },
  {
    nev: 'M2: addPayerCell elejti a refId-t — jogi személy FK-vesztés',
    alkalmaz: (s) => {
      const a = ablak(s, 'function addPayerCell', ['\n  function ', '\n  const '])
      if (!a || !a.includes('refId: base.refId')) return null
      return s.replace(a, a.replace('refId: base.refId', 'refId: null as string | null //'))
    },
  },
  {
    nev: 'M3: a mag-vetés elrontása (.size >= 2 → >= 3) — vázlat után eltűnne a mátrix',
    alkalmaz: (s) => {
      const a = ablak(s, 'const matrixMagok', ['\n      }', '\n    } catch'])
      if (!a || !a.includes('.size >= 2')) return null
      return s.replace(a, a.replace('.size >= 2', '.size >= 3'))
    },
  },
  {
    nev: 'M5: a max-w-0/min-w szélesség-fegyelem törlése a partner-celláról — széteső tábla / 0 px év-terület',
    alkalmaz: (s) => (s.includes("isMatrixActive(r) ? 'w-full max-w-0 min-w-[26rem] '")
      ? s.replace("isMatrixActive(r) ? 'w-full max-w-0 min-w-[26rem] '", "isMatrixActive(r) ? 'w-full '")
      : null),
  },
  {
    nev: 'M6: a kiürített-cella őr törlése az auto-kitöltésből — a „nem fizet" cella visszatöltődne',
    alkalmaz: (s) => (s.includes('if (userUresRef.current.has(payerUid)) return')
      ? s.replace('if (userUresRef.current.has(payerUid)) return', '')
      : null),
  },
  {
    nev: 'M8: a névfüggő payerKulcs visszatétele a sor-kulcsba — fókuszvesztés minden leütésnél',
    alkalmaz: (s) => (s.includes('key={cs.sorUid}')
      ? s.replace('key={cs.sorUid}', 'key={cs.kulcs}')
      : null),
  },
  {
    nev: 'M7: a partner-oszlop w-full-ja feltétel nélkülivé rontva — minden más oszlop összenyomódna',
    alkalmaz: (s) => (s.includes("isMatrixActive(r) ? 'w-full")
      ? s.replace(/isMatrixActive\(r\) \? 'w-full[^:]*: ''/, "'w-full '")
      : null),
  },
  {
    nev: 'M4: a cella-kulcs visszarontása a névfüggő payerKulcsra — fókuszvesztés gépelés közben',
    alkalmaz: (s) => (s.includes('${cs.sorUid}:${ev}')
      ? s.replace('${cs.sorUid}:${ev}', '${cs.kulcs}:${ev}')
      : null),
  },
]

for (const m of mutansok) {
  const mutalt = m.alkalmaz(raw)
  if (mutalt == null) {
    bukik(`${m.nev} — a mutáns NEM alkalmazható (a védett minta hiányzik?)`)
    continue
  }
  if (mutalt === raw) {
    bukik(`${m.nev} — a mutáns nem változtatott semmit (vak minta)`)
    continue
  }
  const mutansHibak = asszertek(mutalt, false)
  if (mutansHibak > 0) {
    pass(`${m.nev} — az őr elkapja (${mutansHibak} asszert bukik)`)
  } else {
    bukik(`${m.nev} — az őr VAK erre a mutánsra!`)
  }
}

console.log('')
if (fail > 0) {
  console.error(`${fail} hiba, ${ok} rendben — a kassza-mátrix őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — kassza-mátrix (több befizető × több év) őr zöld`)
