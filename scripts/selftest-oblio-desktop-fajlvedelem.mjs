#!/usr/bin/env node
/**
 * ASZTALI OBLIO-BEOLVASÁS: FÁJLVÉDELEM önellenőrzés (2026-09-03, átvilágítás P0)
 *
 * MIT ŐRIZ — a beolvasás a lelkész SAJÁT LEMEZÉN dolgozik, és korábban két
 * módon semmisített meg visszaállíthatatlanul fájlokat:
 *
 *   (1) NÉVÜTKÖZÉS. A `move_into` helyesen NEM ír felül (ütközéskor `Ok(false)`),
 *       csakhogy a hívó utána FELTÉTEL NÉLKÜL lefuttatta a
 *       `let _ = std::fs::remove_file(path)`-ot „hogy a bedobó mappa kiürüljön".
 *       Két különböző szállító azonos nevű `factura.xml`-je közül a másodikat
 *       ez VÉGLEGESEN törölte — nem a Lomtárba, a hibát elnyelve (`let _ =`),
 *       és csak a „kihagyott" számlálót növelte. Egy hivatalos e-Factura
 *       nyomtalanul eltűnt.
 *
 *   (2) ALÁÍRÁS-SZŰRŐ TÚLKAPÁSA. A `semnatura_` / `semnatura-` előtag-szűrő a
 *       `.pdf`-ekre IS állt, ezért a lelkész saját, így elnevezett PDF-jét
 *       (pl. `semnatura-presbiteri.pdf`) is kidobta.
 *
 * A JAVÍTÁS ELVE: a beolvasás SOSEM semmisít meg fájlt. Ami nem dolgozható fel,
 * az a `nem-egyertelmu` mappába kerül időbélyeggel, és a jelentés HANGOSAN
 * megmondja, hova. Ha a félretétel sem megy, a fájl a helyén marad.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-oblio-desktop-fajlvedelem.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const RS = path.join(REPO, 'apps', 'desktop', 'src-tauri', 'src', 'excel.rs')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

if (!fs.existsSync(RS)) { fail(`hiányzó fájl: ${path.relative(REPO, RS)}`); process.exit(1) }

const CR = String.fromCharCode(13)
const nyers = fs.readFileSync(RS, 'utf8').split(CR).join('')
/** Rust sor-kommentek nélkül — a komment sosem bizonyíték a viselkedésre. */
const kodCsak = (s) => s.replace(/^\s*\/\/.*$/gm, '')
const kod = kodCsak(nyers)

function orzo(cimke, minta, mutans) {
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(nyers)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

// ── (1) A BEOLVASÁS NEM SEMMISÍT MEG FÁJLT ───────────────────────────────
{
  // Az `oblio_ingest` törzsében NEM lehet feltétel nélküli remove_file.
  const kezd = kod.indexOf('pub fn oblio_ingest')
  const veg = kod.indexOf('pub fn oblio_list_processed')
  const torzs = kezd >= 0 && veg > kezd ? kod.slice(kezd, veg) : ''
  if (!torzs) {
    fail('(1) az oblio_ingest törzse nem azonosítható — az őr nem tud célozni')
  } else {
    const nemaTorles = /let\s+_\s*=\s*std::fs::remove_file\(path\)/.test(torzs)
    if (nemaTorles) {
      fail('(1) a beolvasás NÉMÁN töröl fájlt (`let _ = std::fs::remove_file(path)`) — ez volt a P0')
    } else {
      ok('(1) a beolvasás törzsében nincs néma fájltörlés')
    }
    // NEGATÍV: a régi világ bukjon.
    const regi = 'let _ = std::fs::remove_file(path);'
    if (/let\s+_\s*=\s*std::fs::remove_file\(path\)/.test(regi)) {
      ok('NEGATÍV — a régi, néma törlést a minta elkapja')
    } else {
      fail('NEGATÍV — a törlés-kereső minta VAK')
    }
  }
}

orzo(
  '(1) névütközéskor FÉLRETESSZÜK a fájlt (nem töröljük)',
  /report\.skipped \+= 1;\s*match set_aside\(path, &utkozes, &name\)/,
  (s) => s.replace(/match set_aside\(path, &utkozes, &name\) \{/g, 'match Ok::<(), String>(()) {'),
)
orzo(
  '(1) a félretétel helyét a jelentés KIÍRJA (a lelkész megtalálja)',
  /Félretettük ide: \{\}/,
  (s) => s.replace(/Félretettük ide: \{\}/g, 'kihagyva'),
)

// ── (2) A set_aside SOSEM TÖRÖL SIKERES MÁSOLÁS ELŐTT ────────────────────
{
  const kezd = kod.indexOf('fn set_aside(')
  const veg = kod.indexOf('\n}', kezd)
  const torzs = kezd >= 0 && veg > kezd ? kod.slice(kezd, veg) : ''
  if (!torzs) {
    fail('(2) nincs set_aside segédfüggvény')
  } else {
    const copyIdx = torzs.indexOf('std::fs::copy')
    const removeIdx = torzs.indexOf('std::fs::remove_file')
    if (copyIdx >= 0 && removeIdx > copyIdx) {
      ok('(2) a set_aside CSAK sikeres másolás UTÁN törli a forrást')
    } else {
      fail('(2) a set_aside a másolás előtt (vagy anélkül) törölne — adatvesztés')
    }
    if (/\.map_err\(\|e\| format!\("Félretétel másolás hiba/.test(torzs)) {
      ok('(2) a másolás hibája HANGOS (nem `let _ =`)')
    } else {
      fail('(2) a másolás hibáját elnyelnénk')
    }
  }
}

// ── (3) AZ ALÁÍRÁS-SZŰRŐ CSAK XML-RE ÁLL ─────────────────────────────────
orzo(
  '(3) az aláírás-szűrő csak .xml-re vonatkozik (a saját PDF-ek megmaradnak)',
  /lower\.ends_with\("\.xml"\)\s*&&\s*\(lower\.starts_with\("semnatura_"\)/,
  (s) => s.replace(/lower\.ends_with\("\.xml"\)\s*\r?\n?\s*&& \(lower\.starts_with\("semnatura_"\)/g, '(lower.starts_with("semnatura_")'),
)
{
  // Az aláírás-XML sem törlődik: félretesszük.
  // ⚠️ A `semnatura_` a ZIP-kibontóban IS szerepel (ott csak kihagyott
  // bejegyzés, nem fájlművelet) — ezért az `oblio_ingest` TÖRZSÉN belül
  // keressük, különben az őr a rossz helyre néz.
  const kezd = kod.indexOf('pub fn oblio_ingest')
  const veg = kod.indexOf('pub fn oblio_list_processed')
  const torzs = kezd >= 0 && veg > kezd ? kod.slice(kezd, veg) : ''
  const i = torzs.indexOf('semnatura_')
  const szakasz = i >= 0 ? torzs.slice(i, i + 700) : ''
  if (!szakasz) fail('(3) az aláírás-ág nem található az oblio_ingest törzsében')
  else if (/remove_file/.test(szakasz)) fail('(3) az aláírás-ág még mindig TÖRÖL')
  else if (/set_aside/.test(szakasz)) ok('(3) az aláírás-XML félretevődik, nem törlődik')
  else fail('(3) az aláírás-ág nem teszi félre a fájlt')
}

// ── (4) AZ ÜTKÖZÉS-MAPPA LÉTEZIK ÉS BE VAN KÖTVE ─────────────────────────
orzo(
  '(4) van külön nem-egyertelmu mappa',
  /fn oblio_utkozes\(app: &tauri::AppHandle\)[\s\S]{0,160}?join\("nem-egyertelmu"\)/,
  (s) => s.replace(/join\("nem-egyertelmu"\)/g, 'join("feldolgozott")'),
)
orzo(
  '(4) a beolvasás fel is oldja az ütközés-mappát',
  /let utkozes = oblio_utkozes\(&app\)\?;/,
  (s) => s.replace(/let utkozes = oblio_utkozes\(&app\)\?;/g, ''),
)

if (failed) { console.error('\nAz asztali fájlvédelem önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz asztali fájlvédelem önellenőrzés rendben.')
