#!/usr/bin/env node
/**
 * Romániai cím-hierarchia seed generátor.
 *
 * BEMENETEK:
 *   migration-docs/data/adr-seed/
 *     ├── infocod-cu-siruta-mai-2016.xls       (Poşta Română / data.gov.ro)
 *     ├── RO.zip  ← /_unpacked/RO.txt           (GeoNames)
 *     └── alternateNamesV2.zip                   (GeoNames alt. nevek)
 *
 * KIMENETEK (migration-docs/sql/):
 *     ├── 2026-04-21-adr-seed-01-countries.sql    — adrcountry + adrcounty (42+2)
 *     ├── 2026-04-21-adr-seed-02-localities.sql   — adrlocality (~14 000)
 *     ├── 2026-04-21-adr-seed-03-aliases.sql      — adrlocality_alias (magyar)
 *     └── 2026-04-21-adr-seed-04-streets.sql      — adrstreet (~41 000)
 *
 * FUTTATÁS:
 *     cd "D:\Egyházi APP\KARTOTEKA"
 *     node scripts/build-adr-seed.mjs
 *
 * A script előfeltétele: `unzip` elérhető a PATH-ban (Git Bash / WSL ✓).
 */

import xlsx from 'xlsx'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(__filename, '..', '..')

const DATA_DIR = join(ROOT, 'migration-docs', 'data', 'adr-seed')
const UNPACKED = join(DATA_DIR, '_unpacked')
const OUT_DIR = join(ROOT, 'migration-docs', 'sql')

if (!existsSync(UNPACKED)) mkdirSync(UNPACKED, { recursive: true })
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const XLS_PATH = join(DATA_DIR, 'infocod-cu-siruta-mai-2016.xls')
const RO_TXT = join(UNPACKED, 'RO.txt')
const ALT_FILTERED = join(UNPACKED, 'alternateNamesV2-filtered.txt')

// ────────────────────────────────────────────────────────────────────────
// 1) 42 MEGYE (kézzel összeállítva, hivatalos adat a SIRUTA + auto_code alapján)
//    A magyar nevek a történelmi-gyakorlati változatok; ha nincs bevett
//    magyar név, a román nevet hagyom (name_hu = name_ro).
// ────────────────────────────────────────────────────────────────────────
const COUNTIES = [
  { siruta: '01', auto_code: 'AB', name_ro: 'Alba', name_hu: 'Fehér' },
  { siruta: '02', auto_code: 'AR', name_ro: 'Arad', name_hu: 'Arad' },
  { siruta: '03', auto_code: 'AG', name_ro: 'Argeș', name_hu: 'Arges' },
  { siruta: '04', auto_code: 'BC', name_ro: 'Bacău', name_hu: 'Bákó' },
  { siruta: '05', auto_code: 'BH', name_ro: 'Bihor', name_hu: 'Bihar' },
  { siruta: '06', auto_code: 'BN', name_ro: 'Bistrița-Năsăud', name_hu: 'Beszterce-Naszód' },
  { siruta: '07', auto_code: 'BT', name_ro: 'Botoșani', name_hu: 'Botosán' },
  { siruta: '08', auto_code: 'BV', name_ro: 'Brașov', name_hu: 'Brassó' },
  { siruta: '09', auto_code: 'BR', name_ro: 'Brăila', name_hu: 'Brăila' },
  { siruta: '10', auto_code: 'BZ', name_ro: 'Buzău', name_hu: 'Buzău' },
  { siruta: '11', auto_code: 'CS', name_ro: 'Caraș-Severin', name_hu: 'Krassó-Szörény' },
  { siruta: '12', auto_code: 'CL', name_ro: 'Călărași', name_hu: 'Călărași' },
  { siruta: '13', auto_code: 'CJ', name_ro: 'Cluj', name_hu: 'Kolozs' },
  { siruta: '14', auto_code: 'CT', name_ro: 'Constanța', name_hu: 'Konstanca' },
  { siruta: '15', auto_code: 'CV', name_ro: 'Covasna', name_hu: 'Kovászna' },
  { siruta: '16', auto_code: 'DB', name_ro: 'Dâmbovița', name_hu: 'Dâmbovița' },
  { siruta: '17', auto_code: 'DJ', name_ro: 'Dolj', name_hu: 'Dolzs' },
  { siruta: '18', auto_code: 'GL', name_ro: 'Galați', name_hu: 'Galac' },
  { siruta: '19', auto_code: 'GR', name_ro: 'Giurgiu', name_hu: 'Gyurgyevó' },
  { siruta: '20', auto_code: 'GJ', name_ro: 'Gorj', name_hu: 'Gorzs' },
  { siruta: '21', auto_code: 'HR', name_ro: 'Harghita', name_hu: 'Hargita' },
  { siruta: '22', auto_code: 'HD', name_ro: 'Hunedoara', name_hu: 'Hunyad' },
  { siruta: '23', auto_code: 'IL', name_ro: 'Ialomița', name_hu: 'Ialomița' },
  { siruta: '24', auto_code: 'IS', name_ro: 'Iași', name_hu: 'Jász' },
  { siruta: '25', auto_code: 'IF', name_ro: 'Ilfov', name_hu: 'Ilfov' },
  { siruta: '26', auto_code: 'MM', name_ro: 'Maramureș', name_hu: 'Máramaros' },
  { siruta: '27', auto_code: 'MH', name_ro: 'Mehedinți', name_hu: 'Mehedinc' },
  { siruta: '28', auto_code: 'MS', name_ro: 'Mureș', name_hu: 'Maros' },
  { siruta: '29', auto_code: 'NT', name_ro: 'Neamț', name_hu: 'Német' },
  { siruta: '30', auto_code: 'OT', name_ro: 'Olt', name_hu: 'Olt' },
  { siruta: '31', auto_code: 'PH', name_ro: 'Prahova', name_hu: 'Prahova' },
  { siruta: '32', auto_code: 'SM', name_ro: 'Satu Mare', name_hu: 'Szatmár' },
  { siruta: '33', auto_code: 'SJ', name_ro: 'Sălaj', name_hu: 'Szilágy' },
  { siruta: '34', auto_code: 'SB', name_ro: 'Sibiu', name_hu: 'Szeben' },
  { siruta: '35', auto_code: 'SV', name_ro: 'Suceava', name_hu: 'Szucsáva' },
  { siruta: '36', auto_code: 'TR', name_ro: 'Teleorman', name_hu: 'Teleorman' },
  { siruta: '37', auto_code: 'TM', name_ro: 'Timiș', name_hu: 'Temes' },
  { siruta: '38', auto_code: 'TL', name_ro: 'Tulcea', name_hu: 'Tulcsa' },
  { siruta: '39', auto_code: 'VS', name_ro: 'Vaslui', name_hu: 'Vaszló' },
  { siruta: '40', auto_code: 'VL', name_ro: 'Vâlcea', name_hu: 'Vâlcea' },
  { siruta: '41', auto_code: 'VN', name_ro: 'Vrancea', name_hu: 'Vrancsa' },
  { siruta: '42', auto_code: 'B', name_ro: 'București', name_hu: 'Bukarest' },
]

// Gyors lookup: román megyenév → county objektum
const countyByRoName = new Map(COUNTIES.map((c) => [c.name_ro, c]))
// Normalizált lookup (diakritika-nélkül) — a postakód-tábla Judet-je
// néha eltérő karakterekkel (pl. `Bucureşti` vs `București`)
const countyByNormalized = new Map(COUNTIES.map((c) => [normalizeEarly(c.name_ro), c]))

// Early normalize (használható a COUNTIES init után is)
function normalizeEarly(s) {
  if (!s) return ''
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function findCountyByJudet(judetStr) {
  if (!judetStr) return null
  const direct = countyByRoName.get(judetStr.trim())
  if (direct) return direct
  const norm = normalizeEarly(judetStr)
  return countyByNormalized.get(norm) || null
}

// ────────────────────────────────────────────────────────────────────────
// 2) HELPER FÜGGVÉNYEK
// ────────────────────────────────────────────────────────────────────────

// SQL string escape
function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL'
  const str = String(s).replace(/'/g, "''")
  return `'${str}'`
}

// Diakritika-eltávolítás (szöveg-match-hez)
function normalize(s) {
  if (!s) return ''
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// Postakód padding (6-jegyű)
function padPostalCode(p) {
  if (!p) return null
  const s = String(p).trim()
  if (!s) return null
  return s.padStart(6, '0')
}

function log(...args) {
  console.log('[adr-seed]', ...args)
}

// ────────────────────────────────────────────────────────────────────────
// 3) alternateNamesV2 SZŰRÉS (egyszer futtatjuk, cache-eljük)
// ────────────────────────────────────────────────────────────────────────
function ensureAltNamesFiltered() {
  if (existsSync(ALT_FILTERED)) {
    log('alternateNames szűrt fájl megvan — cache hit')
    return
  }
  throw new Error(
    `A szűrt alternateNames fájl nem létezik: ${ALT_FILTERED}\n` +
    `Kérlek futtasd le előzetesen Git Bash-ből:\n` +
    `    cd "${DATA_DIR}"\n` +
    `    unzip -p alternateNamesV2.zip alternateNamesV2.txt \\\n` +
    `      | awk -F'\\t' '$3=="hu" || $3=="ro"' \\\n` +
    `      > _unpacked/alternateNamesV2-filtered.txt`
  )
}

// ────────────────────────────────────────────────────────────────────────
// 4) RO.txt PARSING (GeoNames helység → geonameid + román név + admin1_code)
// ────────────────────────────────────────────────────────────────────────
async function loadGeoNamesLocalities() {
  if (!existsSync(RO_TXT)) {
    throw new Error(`RO.txt nem található (bontsd ki: unzip RO.zip). Útvonal: ${RO_TXT}`)
  }
  log('GeoNames RO.txt olvasás (populated places)...')

  const byNameNormalized = new Map() // normalized(name) → [ {geonameid, name, admin1_code, feature_code, pop} ]
  const byGeonameId = new Map()

  const rl = createInterface({
    input: createReadStream(RO_TXT, 'utf8'),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const cols = line.split('\t')
    if (cols.length < 18) continue

    const [geonameid, name, asciiname, alternatenames, lat, lon, feature_class, feature_code, country_code, cc2, admin1_code] = cols
    if (country_code !== 'RO') continue
    if (feature_class !== 'P') continue // csak populated place (város/falu)

    const obj = {
      geonameid: Number(geonameid),
      name,
      asciiname,
      admin1_code,
      feature_code,
      alternatenames: alternatenames || '',
    }
    byGeonameId.set(obj.geonameid, obj)

    const key = normalize(name)
    if (!byNameNormalized.has(key)) byNameNormalized.set(key, [])
    byNameNormalized.get(key).push(obj)
  }
  log(`GeoNames helységek: ${byGeonameId.size} sor`)
  return { byNameNormalized, byGeonameId }
}

// ────────────────────────────────────────────────────────────────────────
// 5) alternateNames-filtered PARSING → magyar nevek
// ────────────────────────────────────────────────────────────────────────
async function loadHungarianNames(validGeonameIds) {
  log('Magyar alt. nevek szűrése...')
  const huByGeonameId = new Map() // geonameid → { name, isPreferred }

  const rl = createInterface({
    input: createReadStream(ALT_FILTERED, 'utf8'),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const cols = line.split('\t')
    if (cols.length < 5) continue
    const [, geonameidStr, lang, name, isPreferred, isShort, isColloquial, isHistoric] = cols
    if (lang !== 'hu') continue
    if (isHistoric === '1') continue // történelmi nevek kihagyva
    if (isColloquial === '1') continue

    const gid = Number(geonameidStr)
    if (!validGeonameIds.has(gid)) continue

    const existing = huByGeonameId.get(gid)
    if (!existing || isPreferred === '1') {
      huByGeonameId.set(gid, { name, isPreferred: isPreferred === '1' })
    }
  }
  log(`Magyar nevek: ${huByGeonameId.size} helységhez`)
  return huByGeonameId
}

// ────────────────────────────────────────────────────────────────────────
// 6) XLS PARSING — helységek (Sheet 2 + 3) + utcák (Sheet 1 + 2)
// ────────────────────────────────────────────────────────────────────────
function parseXls() {
  log('XLS olvasás (3 sheet)...')
  const wb = xlsx.readFile(XLS_PATH, { cellDates: false })

  // Sheet "Localitati sub 50.000 loc" — helység-szintű postakód
  const smallLocRows = xlsx.utils.sheet_to_json(
    wb.Sheets['Localitati sub 50.000 loc']
  )

  // Sheet "Localitati peste 50.000 loc" — utca-szintű postakód
  const bigLocRows = xlsx.utils.sheet_to_json(
    wb.Sheets['Localitati peste 50.000 loc']
  )

  // Sheet "Bucuresti" — bukaresti utcák
  const bucharestRows = xlsx.utils.sheet_to_json(wb.Sheets['Bucuresti'])

  log(
    `  Kisvárosok: ${smallLocRows.length} sor · Nagyvárosok: ${bigLocRows.length} utca · Bukarest: ${bucharestRows.length} utca`
  )
  return { smallLocRows, bigLocRows, bucharestRows }
}

// ────────────────────────────────────────────────────────────────────────
// 7) HELYSÉG GYŰJTÉS — unique kulcs: SIRUTA
// ────────────────────────────────────────────────────────────────────────
function buildLocalityMap(smallLocRows, bigLocRows) {
  const map = new Map() // siruta_code → { ... }
  const nameCountyUsed = new Set() // (name_normalized + county_siruta) — (name, countyid) unique DB constraint miatt
  const missingJudets = new Set()
  let nameCountyDuplicates = 0

  function addOrSkip(siruta, judet, localitate, codpostal) {
    if (!siruta || siruta === 'undefined') return
    if (map.has(siruta)) return
    const county = findCountyByJudet(judet)
    if (!county) {
      missingJudets.add(judet)
      return // hiányzó megye (pl. külföldi vagy felesleges sor)
    }
    const nameRo = String(localitate).trim()

    // (name, countyid) unique DB constraint — az XLS-ben előfordul, hogy
    // ugyanaz a név többször szerepel egy megyében különböző SIRUTA-val
    // (pl. NIV=2 község + NIV=3 település-központ "Erdőd"). A DB csak egyet
    // engedélyez, ezért a scriptem is csak egyet vesz fel — az első nyer.
    const nameCountyKey = normalize(nameRo) + '|' + county.siruta
    if (nameCountyUsed.has(nameCountyKey)) {
      nameCountyDuplicates++
      return
    }
    nameCountyUsed.add(nameCountyKey)

    map.set(siruta, {
      siruta_code: siruta,
      judet: judet.trim(),
      county_siruta: county.siruta,
      county_auto: county.auto_code,
      name_ro: nameRo,
      default_postalcode: padPostalCode(codpostal),
    })
  }

  // A kisvárosok először (helység-szintű postakód), aztán a nagyvárosok
  for (const r of smallLocRows) {
    addOrSkip(String(r.SIRUTA).trim(), String(r.Judet).trim(), r.Localitate, r.Codpostal)
  }
  for (const r of bigLocRows) {
    addOrSkip(String(r.SIRUTA).trim(), String(r.Judet).trim(), r.Localitate, r.Codpostal)
  }

  if (missingJudets.size > 0) {
    log(`  FIGYELEM: ismeretlen Judet értékek (kihagyva): ${[...missingJudets].join(', ')}`)
  }
  if (nameCountyDuplicates > 0) {
    log(`  (name, county) duplikátumok kihagyva: ${nameCountyDuplicates} sor`)
  }

  return map
}

// ────────────────────────────────────────────────────────────────────────
// BUKAREST HELYSÉGEK — az XLS Bucuresti sheet-jén csak utcák vannak,
// a főváros + 6 kerület helységként külön kell rögzíteni.
// A SIRUTA kódokat az XLS "SIRUTA SECTOR" / "SIRSUP" oszlopaiból vesszük.
// ────────────────────────────────────────────────────────────────────────
function addBucharestLocalities(localityMap, bucharestRows) {
  const sectors = new Map() // siruta → { name, mainPostalcode, streetCount }
  let capitalSiruta = null

  for (const r of bucharestRows) {
    const sectorSiruta = String(r['SIRUTA SECTOR'] || '').trim()
    const parentSiruta = String(r['SIRSUP'] || '').trim()
    const sectorNum = r.Sector // 1-6
    const postalcode = padPostalCode(r.Codpostal)

    if (parentSiruta && !capitalSiruta) capitalSiruta = parentSiruta

    if (!sectorSiruta || !sectorNum) continue
    if (!sectors.has(sectorSiruta)) {
      sectors.set(sectorSiruta, {
        sectorNum,
        firstPostal: postalcode,
      })
    }
  }

  // Bukarest főváros mint helység
  if (capitalSiruta) {
    localityMap.set(capitalSiruta, {
      siruta_code: capitalSiruta,
      judet: 'București',
      county_siruta: '42',
      county_auto: 'B',
      name_ro: 'București',
      default_postalcode: null,
    })
  }

  // 6 Sector mint külön helység (a SIRUTA SECTOR kódjaikkal)
  for (const [siruta, info] of sectors) {
    localityMap.set(siruta, {
      siruta_code: siruta,
      judet: 'București',
      county_siruta: '42',
      county_auto: 'B',
      name_ro: `Sector ${info.sectorNum}`,
      default_postalcode: info.firstPostal,
    })
  }
  log(`  Bukarest: ${capitalSiruta ? 'főváros + ' : ''}${sectors.size} kerület hozzáadva`)
}

// ────────────────────────────────────────────────────────────────────────
// 8) HELYSÉG → MAGYAR NÉV MATCHELÉS
//    A postakód-tábla Localitate (román) + megye — összevetjük GeoNames-szel
// ────────────────────────────────────────────────────────────────────────
function matchHungarianNames(localityMap, geo, huNames) {
  log('Magyar név match a helységekhez...')
  let matched = 0
  let total = 0

  for (const [siruta, loc] of localityMap) {
    total++
    const key = normalize(loc.name_ro)
    const candidates = geo.byNameNormalized.get(key)
    if (!candidates || candidates.length === 0) continue

    // Ha több jelölt, a megye alapján szűrünk
    // (Későbbi bővítés: admin1_code → county fips mapping)
    let chosen = candidates[0]

    const huName = huNames.get(chosen.geonameid)
    if (huName) {
      loc.name_hu = huName.name
      loc.geonames_id = chosen.geonameid
      loc.feature_code = chosen.feature_code
      matched++
    } else {
      loc.geonames_id = chosen.geonameid
      loc.feature_code = chosen.feature_code
    }
  }
  log(`  Match: ${matched}/${total} helységhez van magyar név`)

  // DEDUP: a geonames_id unique lesz a DB-ben (adrlocality_geonames_uq),
  // tehát egy geonames ID csak EGY helységhez tartozhat. Ha több helység
  // mutat ugyanarra (pl. két "Sărata" nevű falu), az elsőt tartjuk,
  // a többire NULL-ra állítjuk a geonames_id + magyar név + feature_code-t.
  const geonamesUsed = new Set()
  let deduped = 0
  for (const loc of localityMap.values()) {
    if (!loc.geonames_id) continue
    if (geonamesUsed.has(loc.geonames_id)) {
      loc.geonames_id = null
      loc.name_hu = null
      loc.feature_code = null
      deduped++
    } else {
      geonamesUsed.add(loc.geonames_id)
    }
  }
  if (deduped > 0) {
    log(`  Dedup: ${deduped} helységről törölve a duplikált geonames_id (DB uq miatt)`)
  }
}

// ────────────────────────────────────────────────────────────────────────
// 9) SQL FÁJLOK GENERÁLÁSA
// ────────────────────────────────────────────────────────────────────────

function writeCountriesSQL() {
  log('SQL gen: 01-countries-counties...')
  const lines = []
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push('-- adrcountry + adrcounty seed (2026-04-21)')
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')

  // ORSZÁG: Románia
  lines.push('-- Románia (ID-t fix tartunk, hogy kiszámítható legyen)')
  lines.push(`INSERT INTO public.adrcountry (id, name, sname, name_hu, name_ro)`)
  lines.push(`VALUES (1, 'România', 'RO', 'Románia', 'România')`)
  lines.push(`ON CONFLICT (id) DO UPDATE SET`)
  lines.push(`  name = EXCLUDED.name,`)
  lines.push(`  sname = EXCLUDED.sname,`)
  lines.push(`  name_hu = EXCLUDED.name_hu,`)
  lines.push(`  name_ro = EXCLUDED.name_ro;`)
  lines.push('')
  lines.push(
    `SELECT setval('public.adrcountry_id_seq', GREATEST(2, (SELECT MAX(id) + 1 FROM public.adrcountry)), false);`
  )
  lines.push('')

  // MEGYÉK
  lines.push('-- 42 román megye (41 megye + Bukarest)')
  lines.push('-- Az adrcounty táblán unique (name, countryid) constraint — ON CONFLICT DO NOTHING-gel kezelve.')
  lines.push('INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code)')
  lines.push('VALUES')
  const vals = COUNTIES.map(
    (c) =>
      `  (${sqlStr(c.name_ro)}, ${sqlStr(c.auto_code)}, 1, ${sqlStr(c.name_hu)}, ${sqlStr(c.name_ro)}, ${sqlStr(c.auto_code)}, ${sqlStr(c.siruta)})`
  )
  lines.push(vals.join(',\n'))
  lines.push(`ON CONFLICT (name, countryid) DO NOTHING;`)
  lines.push('')
  // Ha a UQ-constraint szükséges, ALTER TABLE ADD CONSTRAINT külön (most nem bevezetünk)
  // Inkább: a már létező sorokat UPDATE-eljük siruta_code alapján
  lines.push('-- Ha már létező megyék vannak (név alapján), frissítjük a meta adatokat')
  for (const c of COUNTIES) {
    lines.push(
      `UPDATE public.adrcounty SET name_hu = ${sqlStr(c.name_hu)}, name_ro = ${sqlStr(c.name_ro)}, auto_code = ${sqlStr(c.auto_code)}, siruta_code = ${sqlStr(c.siruta)} WHERE countryid = 1 AND (name = ${sqlStr(c.name_ro)} OR name = ${sqlStr(c.name_hu)} OR sname = ${sqlStr(c.auto_code)}) AND siruta_code IS NULL;`
    )
  }
  lines.push('')
  lines.push('-- Fallback: ha egy megye hiányzott (pl. Alba) — explicit INSERT (name, countryid) alapján')
  for (const c of COUNTIES) {
    lines.push(
      `INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) ` +
      `SELECT ${sqlStr(c.name_ro)}, ${sqlStr(c.auto_code)}, 1, ${sqlStr(c.name_hu)}, ${sqlStr(c.name_ro)}, ${sqlStr(c.auto_code)}, ${sqlStr(c.siruta)} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = ${sqlStr(c.name_ro)} AND countryid = 1);`
    )
  }
  lines.push('')
  lines.push('COMMIT;')
  lines.push('')

  // Diagnosztika
  lines.push('-- Ellenőrzés: 42 megyének kell lennie')
  lines.push(`SELECT COUNT(*) AS megye_count FROM public.adrcounty;`)
  lines.push(`SELECT name_ro, name_hu, auto_code, siruta_code FROM public.adrcounty WHERE siruta_code IS NOT NULL ORDER BY siruta_code;`)

  writeFileSync(join(OUT_DIR, '2026-04-21-adr-seed-01-countries.sql'), lines.join('\n'))
  log('  → migration-docs/sql/2026-04-21-adr-seed-01-countries.sql')
}

function writeLocalitiesSQL(localityMap) {
  log('SQL gen: 02-localities...')
  const lines = []
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push(`-- adrlocality seed — ${localityMap.size} helység`)
  lines.push('-- A county a county_siruta alapján JOIN-olódik (kézzel map-elve a Judet-ből)')
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')
  lines.push('-- Temp staging tábla — előre mapelt county_siruta-val')
  lines.push(`CREATE TEMP TABLE _adr_loc_staging (`)
  lines.push(`  siruta_code text,`)
  lines.push(`  county_siruta text,  -- pl. "15" Kovászna, "25" Ilfov, "42" Bukarest`)
  lines.push(`  name_ro text,`)
  lines.push(`  name_hu text,`)
  lines.push(`  default_postalcode text,`)
  lines.push(`  geonames_id integer,`)
  lines.push(`  feature_code text`)
  lines.push(`);`)
  lines.push('')

  // Batch INSERT-ek
  const entries = Array.from(localityMap.values())
  const BATCH = 500
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    lines.push(`INSERT INTO _adr_loc_staging VALUES`)
    lines.push(
      batch
        .map(
          (loc) =>
            `  (${sqlStr(loc.siruta_code)}, ${sqlStr(loc.county_siruta)}, ${sqlStr(loc.name_ro)}, ${sqlStr(loc.name_hu)}, ${sqlStr(loc.default_postalcode)}, ${loc.geonames_id || 'NULL'}, ${sqlStr(loc.feature_code)})`
        )
        .join(',\n')
    )
    lines.push(';')
    lines.push('')
  }

  // 1. Meglévő sorok frissítése SIRUTA alapján (ha már van)
  lines.push(`-- 1) SIRUTA-alapú UPDATE — ha a helység már létezik a táblában és van SIRUTA-ja`)
  lines.push(`UPDATE public.adrlocality l`)
  lines.push(`SET`)
  lines.push(`  name_hu = COALESCE(s.name_hu, l.name_hu),`)
  lines.push(`  name_ro = s.name_ro,`)
  lines.push(`  default_postalcode = s.default_postalcode,`)
  lines.push(`  geonames_id = s.geonames_id,`)
  lines.push(`  feature_code = s.feature_code`)
  lines.push(`FROM _adr_loc_staging s`)
  lines.push(`WHERE l.siruta_code = s.siruta_code;`)
  lines.push('')

  // 2. Meglévő sorok frissítése név alapján (a régi 5 sor, Barót, Csíkszereda)
  lines.push(`-- 2) NÉV-alapú UPDATE a régi magyar nevezésű sorokra (SIRUTA még NULL)`)
  lines.push(`UPDATE public.adrlocality l`)
  lines.push(`SET`)
  lines.push(`  name_hu = l.name,  -- a régi magyar név HU-ként megmarad`)
  lines.push(`  name_ro = s.name_ro,`)
  lines.push(`  default_postalcode = s.default_postalcode,`)
  lines.push(`  siruta_code = s.siruta_code,`)
  lines.push(`  geonames_id = s.geonames_id,`)
  lines.push(`  feature_code = s.feature_code,`)
  lines.push(`  countyid = (SELECT id FROM public.adrcounty WHERE siruta_code = s.county_siruta LIMIT 1)`)
  lines.push(`FROM _adr_loc_staging s`)
  lines.push(`WHERE l.siruta_code IS NULL`)
  lines.push(`  AND (lower(l.name) = lower(s.name_hu) OR lower(l.name) = lower(s.name_ro));`)
  lines.push('')

  // 3. Új helységek beszúrása (a staging-ből, ami még nincs az adrlocality-ben)
  lines.push(`-- 3) Új helységek (a staging-ből, amely még nem létezik SIRUTA alapján)`)
  lines.push(`-- ON CONFLICT (name, countyid) DO NOTHING — az adrlocality tábla unique indexét kezeli`)
  lines.push(`INSERT INTO public.adrlocality (name, countyid, name_hu, name_ro, siruta_code, default_postalcode, geonames_id, feature_code)`)
  lines.push(`SELECT`)
  lines.push(`  COALESCE(s.name_hu, s.name_ro) AS name,`)
  lines.push(`  c.id AS countyid,`)
  lines.push(`  s.name_hu,`)
  lines.push(`  s.name_ro,`)
  lines.push(`  s.siruta_code,`)
  lines.push(`  s.default_postalcode,`)
  lines.push(`  s.geonames_id,`)
  lines.push(`  s.feature_code`)
  lines.push(`FROM _adr_loc_staging s`)
  lines.push(`JOIN public.adrcounty c ON c.siruta_code = s.county_siruta`)
  lines.push(`WHERE NOT EXISTS (`)
  lines.push(`  SELECT 1 FROM public.adrlocality l WHERE l.siruta_code = s.siruta_code`)
  lines.push(`)`)
  lines.push(`ON CONFLICT (name, countyid) DO NOTHING;`)
  lines.push('')
  lines.push(`DROP TABLE _adr_loc_staging;`)
  lines.push('')
  lines.push('COMMIT;')
  lines.push('')
  lines.push('-- Ellenőrzés')
  lines.push(`SELECT COUNT(*) AS locality_count FROM public.adrlocality;`)
  lines.push(`SELECT COUNT(*) AS with_siruta FROM public.adrlocality WHERE siruta_code IS NOT NULL;`)
  lines.push(`SELECT COUNT(*) AS with_hu FROM public.adrlocality WHERE name_hu IS NOT NULL;`)
  lines.push(`-- Megyénkénti megoszlás`)
  lines.push(`SELECT c.name_ro AS megye, COUNT(l.id) AS helyseg_count`)
  lines.push(`FROM public.adrcounty c LEFT JOIN public.adrlocality l ON l.countyid = c.id`)
  lines.push(`GROUP BY c.name_ro, c.auto_code ORDER BY c.auto_code;`)

  writeFileSync(join(OUT_DIR, '2026-04-21-adr-seed-02-localities.sql'), lines.join('\n'))
  log('  → migration-docs/sql/2026-04-21-adr-seed-02-localities.sql')
}

function writeAliasesSQL(localityMap, geo) {
  log('SQL gen: 03-aliases...')
  const lines = []
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push('-- adrlocality_alias seed — a fuzzy match támogatásához')
  lines.push('-- A GeoNames `alternatenames` mezőjéből (vesszővel elválasztott variánsok)')
  lines.push('-- ═══════════════════════════════════════════════════════════════')
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')

  // Alias-ok: a GeoNames alternatenames mezőből, a matched helységekhez
  let aliasCount = 0
  const aliasRows = []
  for (const loc of localityMap.values()) {
    if (!loc.geonames_id) continue
    const geoObj = geo.byGeonameId.get(loc.geonames_id)
    if (!geoObj || !geoObj.alternatenames) continue
    const alts = geoObj.alternatenames.split(',').map((s) => s.trim()).filter(Boolean)
    for (const alt of alts) {
      const n = normalize(alt)
      if (!n) continue
      if (n === normalize(loc.name_ro)) continue
      if (loc.name_hu && n === normalize(loc.name_hu)) continue
      aliasRows.push({ siruta: loc.siruta_code, alias: alt })
      aliasCount++
    }
  }

  lines.push(`-- Staging tábla az alias-oknak`)
  lines.push(`CREATE TEMP TABLE _adr_alias_staging (siruta_code text, alias_name text);`)
  lines.push('')
  const BATCH = 500
  for (let i = 0; i < aliasRows.length; i += BATCH) {
    const batch = aliasRows.slice(i, i + BATCH)
    lines.push('INSERT INTO _adr_alias_staging VALUES')
    lines.push(batch.map((a) => `  (${sqlStr(a.siruta)}, ${sqlStr(a.alias)})`).join(',\n'))
    lines.push(';')
  }
  lines.push('')
  lines.push(`-- Insert a tényleges adrlocality_alias táblába`)
  lines.push(`INSERT INTO public.adrlocality_alias (adrlocality_id, alias_name, source)`)
  lines.push(`SELECT l.id, s.alias_name, 'geonames'`)
  lines.push(`FROM _adr_alias_staging s`)
  lines.push(`JOIN public.adrlocality l ON l.siruta_code = s.siruta_code`)
  lines.push(`ON CONFLICT DO NOTHING;`)
  lines.push('')
  lines.push(`DROP TABLE _adr_alias_staging;`)
  lines.push('')
  lines.push('COMMIT;')
  lines.push('')
  lines.push('-- Ellenőrzés')
  lines.push(`SELECT COUNT(*) AS alias_count FROM public.adrlocality_alias;`)

  writeFileSync(join(OUT_DIR, '2026-04-21-adr-seed-03-aliases.sql'), lines.join('\n'))
  log(`  → migration-docs/sql/2026-04-21-adr-seed-03-aliases.sql (${aliasCount} alias)`)
}

function writeStreetsSQL(bigLocRows, bucharestRows) {
  log('SQL gen: 04-streets (több fájlra bontva)...')

  // Az utcák: distinct (SIRUTA, Tip artera, Denumire artera, Codpostal)
  // A nagyvárosokban ugyanaz az utca több szegmensen 2-3 postakóddal lehet,
  // ezért az (utca, postakód) pár az unique kulcs.
  const streetsMap = new Map()

  function addStreet(siruta, typeRo, nameRo, postal) {
    const key = `${siruta}|${typeRo}|${nameRo}|${postal}`
    if (streetsMap.has(key)) return
    streetsMap.set(key, { siruta, typeRo, nameRo, postal })
  }

  for (const r of bigLocRows) {
    const siruta = String(r.SIRUTA).trim()
    const typeRo = String(r['Tip artera'] || '').trim()
    const nameRo = String(r['Denumire artera'] || '').trim()
    const postal = padPostalCode(r.Codpostal)
    if (!siruta || !nameRo || !postal) continue
    addStreet(siruta, typeRo, nameRo, postal)
  }

  for (const r of bucharestRows) {
    const siruta = String(r['SIRUTA SECTOR'] || '').trim()
    const typeRo = String(r['Tip artera'] || '').trim()
    const nameRo = String(r['Denumire artera'] || '').trim()
    const postal = padPostalCode(r.Codpostal)
    if (!siruta || !nameRo || !postal) continue
    addStreet(siruta, typeRo, nameRo, postal)
  }

  const streets = Array.from(streetsMap.values())
  log(`  ${streets.length} unique utca-postakód pár`)

  // Bontjuk 8 fájlra — Supabase Studio ~250 KB fájlokat könnyen kezel
  const NUM_FILES = 8
  const perFile = Math.ceil(streets.length / NUM_FILES)
  const BATCH = 500

  for (let fileIdx = 0; fileIdx < NUM_FILES; fileIdx++) {
    const slice = streets.slice(fileIdx * perFile, (fileIdx + 1) * perFile)
    if (slice.length === 0) continue

    const suffix = String(fileIdx + 1).padStart(2, '0')
    const lines = []
    lines.push('-- ═══════════════════════════════════════════════════════════════')
    lines.push(`-- adrstreet seed — ${slice.length} utca-postakód pár (${fileIdx + 1}/${NUM_FILES})`)
    lines.push('-- ═══════════════════════════════════════════════════════════════')
    lines.push('')
    lines.push('BEGIN;')
    lines.push('')
    lines.push(`CREATE TEMP TABLE _adr_street_staging (siruta_code text, type_ro text, name_ro text, postalcode text);`)
    lines.push('')

    for (let i = 0; i < slice.length; i += BATCH) {
      const batch = slice.slice(i, i + BATCH)
      lines.push('INSERT INTO _adr_street_staging VALUES')
      lines.push(
        batch
          .map(
            (s) =>
              `  (${sqlStr(s.siruta)}, ${sqlStr(s.typeRo)}, ${sqlStr(s.nameRo)}, ${sqlStr(s.postal)})`
          )
          .join(',\n')
      )
      lines.push(';')
      lines.push('')
    }

    lines.push(`INSERT INTO public.adrstreet (name, postalcode, localityid, name_ro, street_type_ro)`)
    lines.push(`SELECT s.name_ro, s.postalcode, l.id, s.name_ro, s.type_ro`)
    lines.push(`FROM _adr_street_staging s`)
    lines.push(`JOIN public.adrlocality l ON l.siruta_code = s.siruta_code`)
    lines.push(`ON CONFLICT DO NOTHING;`)
    lines.push('')
    lines.push(`DROP TABLE _adr_street_staging;`)
    lines.push('')
    lines.push('COMMIT;')
    lines.push('')

    if (fileIdx === NUM_FILES - 1) {
      lines.push('-- Összesítő ellenőrzés (csak az utolsó fájlban)')
      lines.push(`SELECT COUNT(*) AS street_count FROM public.adrstreet;`)
      lines.push(`SELECT COUNT(*) AS with_postalcode FROM public.adrstreet WHERE postalcode IS NOT NULL;`)
    }

    const filename = `2026-04-21-adr-seed-04-streets-part-${suffix}.sql`
    writeFileSync(join(OUT_DIR, filename), lines.join('\n'))
    log(`  → migration-docs/sql/${filename} (${slice.length} utca)`)
  }
}

// ────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────
async function main() {
  log('═══ Romániai cím-hierarchia seed generátor ═══')
  log(`Forrás: ${DATA_DIR}`)
  log(`Kimenet: ${OUT_DIR}`)
  log('')

  // 0. Előfeltétel: alternateNames szűrt
  ensureAltNamesFiltered()

  // 1. XLS parsing
  const { smallLocRows, bigLocRows, bucharestRows } = parseXls()

  // 2. Helységek map + Bukarest manuálisan
  const localityMap = buildLocalityMap(smallLocRows, bigLocRows)
  addBucharestLocalities(localityMap, bucharestRows)
  log(`Egyedi helségek: ${localityMap.size}`)

  // 3. GeoNames
  const geo = await loadGeoNamesLocalities()

  // 4. Magyar nevek
  const huNames = await loadHungarianNames(new Set(geo.byGeonameId.keys()))

  // 5. Match
  matchHungarianNames(localityMap, geo, huNames)

  // 6. SQL generálás
  writeCountriesSQL()
  writeLocalitiesSQL(localityMap)
  writeAliasesSQL(localityMap, geo)
  writeStreetsSQL(bigLocRows, bucharestRows)

  log('')
  log('═══ Kész ═══')
  log('Futtasd a Supabase Studio-ban sorrendben:')
  log('  1. 2026-04-21-adr-schema-bovites.sql')
  log('  2. 2026-04-21-adr-seed-01-countries.sql')
  log('  3. 2026-04-21-adr-seed-02-localities.sql')
  log('  4. 2026-04-21-adr-seed-03-aliases.sql')
  log('  5. 2026-04-21-adr-seed-04-streets.sql')
}

main().catch((err) => {
  console.error('[adr-seed] HIBA:', err)
  process.exit(1)
})
