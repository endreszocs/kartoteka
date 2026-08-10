#!/usr/bin/env node
/**
 * KARTOTEKA biztonsági diagnosztikai segédscript.
 *
 * Cél:
 * - kizárólag OLVASÓ audit
 * - futó kód vs. DB-séma eltérések jelzése
 * - legacy/source-links hamis pozitívok elkülönítése
 * - magas biztonságú árva komponens-jelöltek listázása
 * - publikus assetek közül a láthatóan nem hivatkozott fájlok jelzése
 *
 * FONTOS:
 * - nem módosít fájlokat
 * - nem töröl semmit
 * - nem próbál "okosból" automatikus javítást végezni
 *
 * Futtatás:
 *   node scripts/audit-safety.mjs
 *   node scripts/audit-safety.mjs --json
 *   node scripts/audit-safety.mjs --strict   (CI-kapu: nem 0 kilépőkód, ha van
 *                                             árva komponens-jelölt)
 *
 * Kilépőkódok:
 *   0 — lefutott
 *   1 — a DB-séma nem olvasható be (a drift-összehasonlítás értelmetlen lenne)
 *   2 — csak `--strict` mellett: van árva komponens-jelölt
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..')

// 2026-08-11 (K5 P2 #33) — JAVÍTVA: a séma-drift ág a monorepo-átállás
// (c365c09f, npm workspaces) óta némán halott volt. A `ROOT` az `apps/web`,
// és a script a `apps/web/migration-docs/Database_schema.sql` fájlt kereste,
// ami SOHA nem létezett — a séma a REPO GYÖKERÉBEN van. A `safeReadText`
// üres stringet adott vissza, így 0 táblát ismert, és emiatt MINDEN élő
// `.from('...')` hivatkozás drift-ként jelent meg: 613 hamis pozitív, közte a
// `profiles`, `congregations`, `access_requests`. Egy VALÓDI elgépelt táblanév
// ebben a zajban észrevehetetlen — pontosan az a hibaosztály, amit a projekt
// „rossz select → némán ÜRES lista" néven tart nyilván.
const REPO_ROOT = resolve(ROOT, '..', '..')

const wantsJson = process.argv.includes('--json')
// 2026-08-11 (K5 P2 #34) — a halott-kód takarítás után az árva komponensek
// száma 0. Ezzel a kapcsolóval a szám CI-ben őrizhető, hogy ne csússzon vissza.
const wantsStrict = process.argv.includes('--strict')

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const IGNORE_DIR_NAMES = new Set(['node_modules', '.next', '.git'])
const CODE_SCAN_EXCLUDES = [
  'migration-docs/source-links/',
]

const ORPHAN_HINT_RE = /(?:-v2|-v3|-v4|legacy|old|backup|copy|unused|refined|dialog|modal|tab)/i
const PUBLIC_ASSET_SAFE_ALLOWLIST = new Set([
  'EREK.png',
  'kartoteka-icon.png',
  'manifest.json',
  'sw.js',
])
const SPECIAL_APP_FILES = [
  'app/favicon.ico',
  'app/icon.png',
  'app/robots.ts',
  'app/sitemap.ts',
]

function normalizeSlashes(input) {
  return input.replace(/\\/g, '/')
}

function toRepoPath(absPath) {
  return normalizeSlashes(relative(ROOT, absPath))
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIR_NAMES.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, acc)
      continue
    }
    acc.push(fullPath)
  }
  return acc
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(extname(filePath))
}

function isExcludedFromPrimaryCodeScan(repoPath) {
  return CODE_SCAN_EXCLUDES.some((prefix) => repoPath.startsWith(prefix))
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8')
}

function safeReadText(filePath) {
  try {
    return readText(filePath)
  } catch {
    return ''
  }
}

function extractSchemaTables(schemaText) {
  const tables = new Set()
  const matches = schemaText.matchAll(/CREATE TABLE\s+public\.([a-zA-Z0-9_]+)/gi)
  for (const match of matches) tables.add(match[1].toLowerCase())
  return tables
}

// 2026-08-11 (K6) — MÁSODIK forrás a táblanevekre: a lefuttatott migrációs
// SQL-ek. Miért kell?
//
// A `Database_schema.sql` egy KÉZZEL exportált pillanatkép. A 0-táblás eset
// már fail-closed (lásd lentebb), de a NÉMÁN ELAVULT dump ugyanaz a hibaosztály
// egy fokkal halkabban: a dump 100 táblát ismer, a migrációk viszont 180+
// táblát hoznak létre, így a `haztartas`, `szemely_kapcsolat`, `cim`,
// `access_requests` és társaik „séma-drift"-ként jelentek meg. 89 hamis
// pozitív között egy VALÓDI elgépelt táblanév ugyanúgy észrevehetetlen, mint
// a 613 között volt.
//
// Ezért a drift-lista mostantól HÁROM vödörbe oszlik:
//   1. valóban ismeretlen név (sem a dumpban, sem migrációban nincs) → gyanús,
//   2. migrációban létrehozott, de a dumpból hiányzó név → a DUMP ELAVULT,
//   3. minden más → rendben.
//
// KORLÁT (szándékos): ha egy táblát létrehoztak, majd később eldobtak, a neve
// itt „ismert" marad. Cserébe egyetlen elgépelés sem tűnik el a zajban.
function extractSqlObjectNames(sqlText) {
  const tables = new Set()
  const views = new Set()
  for (const match of sqlText.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi,
  )) {
    tables.add(match[1].toLowerCase())
  }
  for (const match of sqlText.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi,
  )) {
    views.add(match[1].toLowerCase())
  }
  return { tables, views }
}

function collectMigrationObjectNames(migrationDir) {
  const names = new Set()
  for (const file of walk(migrationDir)) {
    if (extname(file).toLowerCase() !== '.sql') continue
    const { tables, views } = extractSqlObjectNames(safeReadText(file))
    for (const name of tables) names.add(name)
    for (const name of views) names.add(name)
  }
  return names
}

function extractFromReferences(codeText) {
  const results = []
  const regex = /(?:\.storage\s*\.\s*from|\.from)\((['"])([a-zA-Z0-9_\-]+)\1\)/g
  for (const match of codeText.matchAll(regex)) {
    results.push({
      name: match[2].toLowerCase(),
      isStorage: match[0].includes('.storage'),
    })
  }
  return results
}

function resolveImport(fromFile, specifier, fileIndex) {
  let basePath = null

  if (specifier.startsWith('@/')) {
    basePath = join(ROOT, specifier.slice(2))
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    basePath = resolve(dirname(fromFile), specifier)
  } else {
    return null
  }

  const candidates = [basePath]
  for (const ext of CODE_EXTENSIONS) candidates.push(`${basePath}${ext}`)
  for (const ext of CODE_EXTENSIONS) candidates.push(join(basePath, `index${ext}`))

  for (const candidate of candidates) {
    const normalized = normalizeSlashes(resolve(candidate))
    if (fileIndex.has(normalized)) return normalized
  }

  return null
}

function buildImportGraph(codeFiles) {
  const fileIndex = new Map(codeFiles.map((file) => [normalizeSlashes(resolve(file)), file]))
  const inbound = new Map(codeFiles.map((file) => [normalizeSlashes(resolve(file)), new Set()]))
  const outbound = new Map(codeFiles.map((file) => [normalizeSlashes(resolve(file)), new Set()]))

  const staticImportRe = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  const dynamicImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const file of codeFiles) {
    const normalizedFile = normalizeSlashes(resolve(file))
    const text = safeReadText(file)
    const specs = [
      ...Array.from(text.matchAll(staticImportRe), (match) => match[1]),
      ...Array.from(text.matchAll(dynamicImportRe), (match) => match[1]),
    ]

    for (const specifier of specs) {
      const target = resolveImport(file, specifier, fileIndex)
      if (!target) continue
      outbound.get(normalizedFile)?.add(target)
      inbound.get(target)?.add(normalizedFile)
    }
  }

  return { inbound, outbound }
}

function findStringReferences(text, needles) {
  return needles.filter((needle) => text.includes(needle))
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort()
}

function analyze() {
  const allFiles = walk(ROOT)
  const codeFiles = allFiles.filter(isCodeFile)
  const repoCodeFiles = codeFiles.map((file) => ({
    abs: file,
    repo: toRepoPath(file),
  }))

  // A séma a repó GYÖKERÉBEN van, nem az apps/web alatt (lásd a REPO_ROOT
  // melletti 2026-08-11-es megjegyzést).
  const schemaPath = join(REPO_ROOT, 'migration-docs', 'Database_schema.sql')
  const schemaText = safeReadText(schemaPath)
  const schemaTables = extractSchemaTables(schemaText)

  // FAIL-LOUD kapu: ha nulla táblát olvastunk be, a séma-drift ÖSSZEHASONLÍTÁS
  // értelmetlen — minden `.from()` hívás drift-nek látszana. Inkább szóljunk,
  // mintsem hogy a script megint évekig hamis pozitívokat gyártson csendben.
  if (schemaTables.size === 0) {
    console.error('')
    console.error('HIBA — az audit:safety nem tudta beolvasni a DB-sémát.')
    console.error(`  Várt fájl: ${schemaPath}`)
    console.error(
      schemaText.length === 0
        ? '  A fájl nem olvasható vagy nem létezik ezen az útvonalon.'
        : '  A fájl olvasható, de nincs benne egyetlen "CREATE TABLE public.<név>" sor sem.',
    )
    console.error('  Séma nélkül a "séma-drift" lista MINDEN táblahivatkozást hibásan jelezne,')
    console.error('  ezért a script most kilép. Javítsd az útvonalat (REPO_ROOT), majd futtasd újra.')
    console.error('')
    process.exit(1)
  }

  const fromReferences = []
  for (const file of repoCodeFiles) {
    const text = safeReadText(file.abs)
    const refs = extractFromReferences(text).map((ref) => ({
      ...ref,
      file: file.repo,
      excludedFromPrimaryScan: isExcludedFromPrimaryCodeScan(file.repo),
    }))
    fromReferences.push(...refs)
  }

  // A migrációs SQL-ekben létrehozott tábla-/nézetnevek (a dump elavulásának
  // kiszűréséhez — lásd a `collectMigrationObjectNames` melletti megjegyzést).
  const migrationObjects = collectMigrationObjectNames(join(REPO_ROOT, 'migration-docs'))

  const isKnown = (name) => schemaTables.has(name) || migrationObjects.has(name)

  const runtimeMissingTableRefs = uniqueSorted(
    fromReferences
      .filter((ref) => !ref.isStorage && !ref.excludedFromPrimaryScan && !isKnown(ref.name))
      .map((ref) => `${ref.name}\t${ref.file}`)
  )

  // Ismert a migrációkból, de HIÁNYZIK a dumpból → a `Database_schema.sql`
  // elavult. Nem kódhiba: a dumpot kell újraexportálni a Supabase Studióból.
  const staleSchemaDumpTables = uniqueSorted(
    fromReferences
      .filter(
        (ref) =>
          !ref.isStorage &&
          !ref.excludedFromPrimaryScan &&
          !schemaTables.has(ref.name) &&
          migrationObjects.has(ref.name),
      )
      .map((ref) => ref.name)
  )

  const legacyOnlyMissingTableRefs = uniqueSorted(
    fromReferences
      .filter((ref) => !ref.isStorage && ref.excludedFromPrimaryScan && !isKnown(ref.name))
      .map((ref) => `${ref.name}\t${ref.file}`)
  )

  const { inbound } = buildImportGraph(codeFiles)

  const orphanCandidates = repoCodeFiles
    .filter((file) => file.repo.startsWith('components/'))
    .filter((file) => ORPHAN_HINT_RE.test(file.repo))
    .filter((file) => (inbound.get(normalizeSlashes(resolve(file.abs)))?.size ?? 0) === 0)
    .map((file) => file.repo)
    .sort()

  const publicFiles = allFiles
    .filter((file) => toRepoPath(file).startsWith('public/'))
    .map((file) => ({
      abs: file,
      repo: toRepoPath(file),
      name: basename(file),
      size: statSync(file).size,
    }))

  const assetReferenceSources = repoCodeFiles
    .filter((file) => !file.repo.startsWith('migration-docs/source-links/'))
    .filter((file) => file.repo !== 'public/sw.js')
    .filter((file) => !/^public\/swe-worker-.*\.js$/i.test(file.repo))
    .map((file) => ({
    file: file.repo,
    text: safeReadText(file.abs),
  }))

  const activePublicAssets = []
  const orphanPublicAssetCandidates = []

  for (const asset of publicFiles) {
    const refNeedles = [
      `/${asset.name}`,
      asset.repo,
      asset.name === 'README.md' ? '/downloads/README.md' : '',
      asset.name === 'install-resend.bat' ? '/downloads/install-resend.bat' : '',
    ].filter(Boolean)

    const references = []
    for (const source of assetReferenceSources) {
      if (findStringReferences(source.text, refNeedles).length > 0) {
        references.push(source.file)
      }
    }

    const item = {
      file: asset.repo,
      size: asset.size,
      references: uniqueSorted(references),
    }

    if (references.length > 0 || PUBLIC_ASSET_SAFE_ALLOWLIST.has(asset.name)) {
      activePublicAssets.push(item)
    } else if (/^swe-worker-.*\.js$/i.test(asset.name)) {
      activePublicAssets.push(item)
    } else {
      orphanPublicAssetCandidates.push(item)
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    summary: {
      schemaTables: schemaTables.size,
      migrationObjects: migrationObjects.size,
      fromReferences: fromReferences.length,
      runtimeMissingTableRefs: runtimeMissingTableRefs.length,
      staleSchemaDumpTables: staleSchemaDumpTables.length,
      legacyOnlyMissingTableRefs: legacyOnlyMissingTableRefs.length,
      orphanComponentCandidates: orphanCandidates.length,
      orphanPublicAssetCandidates: orphanPublicAssetCandidates.length,
    },
    specialFrameworkFiles: SPECIAL_APP_FILES,
    staleSchemaDumpTables,
    runtimeMissingTableRefs,
    legacyOnlyMissingTableRefs,
    orphanComponentCandidates: orphanCandidates,
    orphanPublicAssetCandidates,
    activePublicAssets: activePublicAssets
      .filter((item) => item.references.length > 0)
      .sort((a, b) => a.file.localeCompare(b.file)),
  }

  return result
}

function printHuman(result) {
  console.log('KARTOTEKA biztonsági audit')
  console.log('Ez a script csak olvas, nem módosít és nem töröl.')
  console.log('')
  console.log('Összegzés:')
  console.log(`- séma táblák (Database_schema.sql): ${result.summary.schemaTables}`)
  console.log(`- migrációs SQL-ben létrehozott objektumok: ${result.summary.migrationObjects}`)
  console.log(`- .from() hivatkozások: ${result.summary.fromReferences}`)
  console.log(`- futó kódban hiányzó táblahivatkozások: ${result.summary.runtimeMissingTableRefs}`)
  console.log(`- csak az elavult sémadumpból hiányzó táblák: ${result.summary.staleSchemaDumpTables}`)
  console.log(`- csak legacy/source-links hiányzó táblahivatkozások: ${result.summary.legacyOnlyMissingTableRefs}`)
  console.log(`- árva komponens-jelöltek: ${result.summary.orphanComponentCandidates}`)
  console.log(`- árva publikus asset-jelöltek: ${result.summary.orphanPublicAssetCandidates}`)
  console.log('')

  console.log('Framework-kezelte speciális fájlok:')
  for (const file of result.specialFrameworkFiles) console.log(`- ${file}`)
  console.log('')

  console.log('Valós séma-drift jelöltek:')
  if (result.runtimeMissingTableRefs.length === 0) {
    console.log('- nincs találat')
  } else {
    for (const item of result.runtimeMissingTableRefs) {
      const [name, file] = item.split('\t')
      console.log(`- ${name}: ${file}`)
    }
  }
  console.log('')

  console.log('A sémadump elavultsága (a migrációk ismerik, a dump nem):')
  if (result.staleSchemaDumpTables.length === 0) {
    console.log('- nincs találat — a dump naprakész')
  } else {
    console.log(
      `- ${result.staleSchemaDumpTables.length} tábla hiányzik a migration-docs/Database_schema.sql fájlból.`,
    )
    console.log('  Ezek NEM kódhibák: exportáld újra a sémát a Supabase Studióból.')
    console.log(`  ${result.staleSchemaDumpTables.join(', ')}`)
  }
  console.log('')

  console.log('Legacy/source-links hamis pozitív jelöltek:')
  if (result.legacyOnlyMissingTableRefs.length === 0) {
    console.log('- nincs találat')
  } else {
    for (const item of result.legacyOnlyMissingTableRefs) {
      const [name, file] = item.split('\t')
      console.log(`- ${name}: ${file}`)
    }
  }
  console.log('')

  console.log('Magas biztonságú árva komponens-jelöltek:')
  if (result.orphanComponentCandidates.length === 0) {
    console.log('- nincs találat')
  } else {
    for (const file of result.orphanComponentCandidates) console.log(`- ${file}`)
  }
  console.log('')

  console.log('Magas biztonságú árva publikus asset-jelöltek:')
  if (result.orphanPublicAssetCandidates.length === 0) {
    console.log('- nincs találat')
  } else {
    for (const item of result.orphanPublicAssetCandidates) {
      console.log(`- ${item.file} (${item.size} byte)`)
    }
  }
}

const result = analyze()

if (wantsJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  printHuman(result)
}

// CI-kapu — csak `--strict` mellett. Az árva komponens-jelöltek száma a
// 2026-08-11-i takarítás után 0; ha ez újra nő, a build essen el, ne pedig
// egy senki által nem olvasott log-sorban jelenjen meg.
if (wantsStrict && result.summary.orphanComponentCandidates > 0) {
  console.error('')
  console.error(
    `HIBA (--strict) — ${result.summary.orphanComponentCandidates} árva komponens-jelölt van a components/ alatt.`,
  )
  console.error('  Ezekre egyetlen fájl sem hivatkozik. Vagy kösd be őket, vagy töröld a fájlt.')
  console.error('')
  process.exit(2)
}

// 2026-08-11 (K6) — `--strict` mellett a VALÓDI séma-drift is kapu. A migrációs
// SQL-ekkel való keresztellenőrzés után ez a szám ma 0, tehát bármi, ami itt
// megjelenik, tényleg ismeretlen táblanév (elgépelés vagy lefuttatatlan SQL).
if (wantsStrict && result.summary.runtimeMissingTableRefs > 0) {
  console.error('')
  console.error(
    `HIBA (--strict) — ${result.summary.runtimeMissingTableRefs} olyan .from('...') hivatkozás van, amelynek a tábláját sem a sémadump, sem egyetlen migrációs SQL nem ismeri.`,
  )
  console.error('  Ez elgépelt táblanév vagy le nem futtatott migráció — a lekérés némán ÜRES listát adna.')
  console.error('')
  process.exit(3)
}
