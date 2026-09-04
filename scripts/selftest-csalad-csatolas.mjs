#!/usr/bin/env node
/**
 * CSALÁD-CSATOLÁS + GONDOLKODÓ-JEL önellenőrzés (2026-08-29, Endre hibajelzése)
 *
 * MIT ŐRIZ:
 *   (1) a „Család csatolása" siker-toastja a TÉNYLEGESEN hozzáadott (dedup
 *       UTÁNI) tagokról szól — a régi világ a dedup ELŐTT mondott sikert,
 *       és ha csak a kiválasztott tag jött vissza, semmi nem történt némán;
 *   (2) a szerver-oldali tag-feloldás MINDKÉT család-modellből gyűjt
 *       (új: haztartas_tag legacy-link NÉLKÜL is; legacy: csalad/gyerek),
 *       és a lekérdezés-hibák hangosak;
 *   (3) a globális folyamatjelző (GlobalPendingIndicator) létezik, a fetch-et
 *       idempotensen csomagolja, és a web layout + a desktop shell mountolja.
 *
 * NEGATÍV ASSZERT: a régi világot visszajátszó mutánsok.
 *
 * Futtatás:  node scripts/selftest-csalad-csatolas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const INDICATOR = path.join(REPO, 'packages', 'ui-app', 'src', 'GlobalPendingIndicator.tsx')
const WEB_LAYOUT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'layout.tsx')
const DESKTOP_SHELL = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'shell', 'desktop-shell.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(files) {
  const hibak = []

  // (1) becsületes toast a dedup UTÁN
  const b = stripComments(files.get(BODY))
  const iFn = b.indexOf('function handleFamilyClick')
  const fn = iFn >= 0 ? b.slice(iFn, iFn + 3000) : ''
  if (!/const ujak = \(members \|\| \[\]\)\.filter/.test(fn)) {
    hibak.push('kliens: a család-csatolás nem szűri ki a már bent lévő / kiválasztott tagot a döntés ELŐTT')
  }
  if (!/ujak\.length > 0/.test(fn)) {
    hibak.push('kliens: a siker-ág nem a TÉNYLEGESEN hozzáadott tagokon áll — a toast hazudhat')
  }
  if (!/nincs TOVÁBBI rögzített tag/.test(fn)) {
    hibak.push('kliens: nincs őszinte üzenet arra az esetre, amikor a család nem ad ÚJ tagot')
  }
  if (!/setFamilyLoadingRowId\(rowId\)/.test(fn)) {
    hibak.push('kliens: a család-feloldás alatt nincs gomb-pending (lassú hálózaton láthatatlan a munka)')
  }

  // (2) szerver: mindkét modell + hangos hibák. FÜGGVÉNYHATÁROS ablak — a fix
  // hosszú ablak és a mutációs ablak eltérő fedése tette vakká az első mutánst.
  const a = stripComments(files.get(ACTIONS))
  const iSrv = a.indexOf('export async function getFamilyMembersForPerson')
  const jSrv = iSrv >= 0 ? a.indexOf('export async function', iSrv + 10) : -1
  const srv = iSrv >= 0 ? a.slice(iSrv, jSrv > iSrv ? jSrv : iSrv + 8000) : ''
  // Quote-horgony (a repó visszatérő substring-csapdája ellen): a mutáns
  // átnevezés a záró aposztróf miatt nem illeszkedhet.
  if (!/'haztartas_tag'/.test(srv) || !/getFamilyIdForPerson/.test(srv)) {
    hibak.push('szerver: a tag-feloldás nem gyűjt MINDKÉT család-modellből')
  }
  if (!/console\.error\('\[getFamilyMembersForPerson\]/.test(srv)) {
    hibak.push('szerver: a tag-feloldás lekérdezés-hibái némák')
  }
  if (!/console\.error\('\[getFamilyMembers\]/.test(a)) {
    hibak.push('szerver: a getFamilyMembers lekérdezés-hibái némák maradtak')
  }

  // (2b) 2026-08-29 SAJÁT REGRESSZIÓ tanulsága: a `cim_telepules` a DIOCESES táblán van,
  // a `szemely`-n NINCS. A rossz oszlopnév 400-at adott, és a családtagok NÉMÁN eltűntek
  // („Ehhez a családhoz nincs rögzített tag"), holott ott voltak. Két kapu:
  //   (a) a család-lekérdezés SOHA ne kérjen `cim_telepules`-t a szemely-ről;
  //   (b) a KÉNYELMI mezők (kor/lakhely) hibájánál legyen MINIMÁL újrapróbálkozás —
  //       a kényelmi adat elmaradhat, a TAGOK soha.
  const iFam = a.indexOf('export async function getFamilyMembers(')
  const jFam = iFam >= 0 ? a.indexOf('export async function getFamilyMembersForPerson', iFam) : -1
  const famFn = iFam >= 0 ? a.slice(iFam, jFam > iFam ? jFam : iFam + 8000) : ''
  if (!famFn) {
    hibak.push('szerver: nincs getFamilyMembers függvény')
  } else {
    if (/cim_telepules/.test(famFn)) {
      hibak.push('szerver: a család-lekérdezés `cim_telepules`-t kér a szemely-ről (az a dioceses oszlopa) — 400, a tagok némán eltűnnek')
    }
    if (!/\(minimál\)/.test(famFn) || !/bovitett\.error/.test(famFn)) {
      hibak.push('szerver: nincs MINIMÁL fallback a család-lekérdezésben — egy kényelmi mező elírása megint elnyelné a tagokat')
    }
  }

  // (3) globális folyamatjelző
  const indRaw = files.get(INDICATOR)
  // 2026-08-29 deploy-bukás tanulsága: a hook-os ui-app barrel-modulnak
  // KÖTELEZŐ a 'use client' az 1. sorban — a CI nem buildel, a hiba csak a
  // deploy `next build`-jénél robbanna (szerver-komponens importálja a barrelt).
  if (!/^'use client'/.test(indRaw)) {
    hibak.push("jelző: a GlobalPendingIndicator NEM 'use client'-tel indul — a next build (deploy) elhasal rajta")
  }
  const ind = stripComments(indRaw)
  if (!/__kartotekaFetchFigyelo/.test(ind) || !/window\.fetch = /.test(ind)) {
    hibak.push('jelző: a GlobalPendingIndicator nem csomagolja a fetch-et (idempotens őrrel)')
  }
  if (!/p\.then\(kesz, kesz\)/.test(ind)) {
    hibak.push('jelző: a számláló nem csökken hibás híváson is — beragadó csík')
  }
  const wl = stripComments(files.get(WEB_LAYOUT))
  if (!/<GlobalPendingIndicator \/>/.test(wl)) {
    hibak.push('web: a (dashboard) layout nem mountolja a folyamatjelzőt')
  }
  const ds = stripComments(files.get(DESKTOP_SHELL))
  if (!/<GlobalPendingIndicator \/>/.test(ds)) {
    hibak.push('desktop: a shell nem mountolja a folyamatjelzőt')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [BODY, ACTIONS, INDICATOR, WEB_LAYOUT, DESKTOP_SHELL]) {
    m.set(fp, fs.readFileSync(fp, 'utf8'))
  }
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('család-csatolás + folyamatjelző: becsületes toast, két-modelles feloldás, globális jelző rendben')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — a régi világ mutánsai ─────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a dedup-előtti siker-toast visszabontása (a RÉGI hazug világ)
  const m1 = beolvas()
  const b1 = m1.get(BODY)
  const b1mut = b1
    .replace(/const ujak = \(members \|\| \[\]\)\.filter\([^\n]+\n/, 'const ujak = members || []\n')
  m1.set(BODY, b1mut)
  if (b1mut === b1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a dedup-szűrés kilövésére NEM bukik — vak')
  else pass('M1 mutáns (dedup-előtti siker vissza) → az őr elbuktatja')

  // M2: az új-modelles ág kivétele a szerver-feloldásból — FÜGGVÉNYHATÁROS
  // ablakkal, hogy a mutáció és az ellenőrzés UGYANAZT a törzset lássa.
  const m2 = beolvas()
  const a2 = m2.get(ACTIONS)
  const i2 = a2.indexOf('export async function getFamilyMembersForPerson')
  const j2 = i2 >= 0 ? a2.indexOf('export async function', i2 + 10) : -1
  const w2 = i2 >= 0 ? a2.slice(i2, j2 > i2 ? j2 : i2 + 8000) : ''
  const w2mut = w2.replace(/haztartas_tag/g, 'haztartas_tag_KIKAPCSOLVA')
  const a2mut = w2 ? a2.replace(w2, w2mut) : a2
  m2.set(ACTIONS, a2mut)
  if (a2mut === a2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: az új-modelles ág kilövésére NEM bukik — vak')
  else pass('M2 mutáns (haztartas-ág kilőve a feloldásból) → az őr elbuktatja')

  // M4: a 'use client' letörlése (a 2026-08-29-i deploy-bukás visszajátszása)
  const m4 = beolvas()
  const i4raw = m4.get(INDICATOR)
  const i4mut = i4raw.replace(/^'use client'\r?\n/, '')
  m4.set(INDICATOR, i4mut)
  if (i4mut === i4raw) bukik('M4 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m4).length === 0) bukik("M4: a 'use client' letörlésére NEM bukik — vak")
  else pass("M4 mutáns ('use client' letörölve) → az őr elbuktatja")

  // M3: a folyamatjelző lecsatolása a web layoutról
  const m3 = beolvas()
  const w3 = m3.get(WEB_LAYOUT)
  const w3mut = w3.replace(/<GlobalPendingIndicator \/>/, '')
  m3.set(WEB_LAYOUT, w3mut)
  if (w3mut === w3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a jelző lecsatolására NEM bukik — vak')
  else pass('M3 mutáns (jelző lecsatolva a layoutról) → az őr elbuktatja')
}

// M5/M6 (2026-08-29): a család-lekérdezés két új kapuja
{
  const m5 = beolvas()
  const a5 = m5.get(ACTIONS)
  // 2026-09-03: a családfő-select kibővült utcával és házszámmal (Endre 5. kérése:
  // „az utca, helység és házszám … vesszővel a neve mellett"), ezért a mutáns
  // HORGONYA is változott. A védett VISELKEDÉS ugyanaz: a személy lakhelye a
  // kapcsolt `adrlocality` (c_helysegid), NEM a `cim_telepules` — az a DIOCESES
  // tábla oszlopa, és a 2026-08-29-i elírás miatt a családtagok NÉMÁN eltűntek.
  const a5mut = a5.replace('adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)), no:', 'cim_telepules), no:')
  m5.set(ACTIONS, a5mut)
  if (a5mut === a5) bukik('M5 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m5).length === 0) bukik('M5: a rossz oszlopnév (cim_telepules) visszatételére NEM bukik — vak')
  else pass('M5 mutáns (cim_telepules a szemely-ről) → az őr elbuktatja')

  const m6 = beolvas()
  const a6 = m6.get(ACTIONS)
  // replaceAll: a `(minimál)` KÉT helyen áll (családfő + gyermek); egyetlen csere
  // után a másik előfordulás kielégítené az asszertet — a mutáns vak lett volna.
  const a6mut = a6.replaceAll('(minimál)', '(masodik)')
  m6.set(ACTIONS, a6mut)
  if (a6mut === a6) bukik('M6 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m6).length === 0) bukik('M6: a minimál fallback eltüntetésére NEM bukik — vak')
  else pass('M6 mutáns (minimál fallback nélkül) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — család-csatolás + folyamatjelző rendben`)
