'use server'

/**
 * Közös multi-sheet batch import server action.
 *
 * Két fő akció:
 *   1. parseAndPreview — fájl feltöltés → parse → sheet előnézetek
 *   2. executeBatchImport — kiválasztott sheet+profil párokkal batch insert
 *
 * Minden modul (tagnyilvántartás, pénzügy, anyakönyv, munkanapló, iktató)
 * ugyanezt a két akciót használja — a különbség csak a profil.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import {
  type ImportProfile,
  type ImportModule,
  getProfileByKey,
  getProfilesByModule,
  suggestProfileForSheet,
} from './import-profiles'
import {
  transformSheet,
  type BatchTransformResult,
  type AutoColumnContext,
} from './row-transformer'
import { createClient } from '@/lib/supabase/server'
import { assertDelegatedImportAllowed } from '@/app/(dashboard)/delegated-import/guard'
import { resolveImportTargetCongregationId } from './import-target'
import { resolveLookups, type ResolveStats } from './lookup-resolver'
import {
  normalizeInventoryCategory,
  serializeInventoryCategory,
  nextLeltariSzam,
  INVENTORY_CATEGORY_PREFIXES,
} from '@kartoteka/ui-app'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { isLeltar343Workbook } from '@/lib/inventory/leltar343-shared'
import type {
  ParsedSheetPreview,
  ParseResult,
  ImportSheetConfig,
  BatchImportResult,
} from './batch-import-types'

// ---------------------------------------------------------------------------
// 1. Fájl parse + preview
// ---------------------------------------------------------------------------

/**
 * Fájl feltöltés → parse → sheet előnézetek visszaadása.
 * A kliens FormData-t küld (file + module).
 */
export async function parseAndPreview(
  formData: FormData,
): Promise<ParseResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // A parse (fájl-szerkezet felismerése) nem gyülekezet-függő, és nem ír adatot —
  // csak a feltöltött fájlt olvassa. Ha explicit `targetCongregationId` érkezik (admin
  // import-hub), a rendszergazda + hatókör-ellenőrzés itt is lefut, hogy jogosulatlan
  // cél már az előnézetnél elakadjon. A tényleges írás-guard az executeBatchImport-on van.
  const target = await resolveImportTargetCongregationId(
    formData.get('targetCongregationId') as string | null,
    access,
  )
  if (target.error) return { error: target.error }

  const file = formData.get('file') as File | null
  const moduleStr = formData.get('module') as string | null

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!moduleStr) return { error: 'Modul nem megadva.' }

  // BIZTONSÁGI FIX 2026-08-11 (#16): a rendszergazdai importáló PIN-kapuja eddig
  // CSAK a felületen létezett (a modul-oldalak elrejtették a fület), a szerver
  // viszont bárkinek válaszolt. Ez az elemző ág nem ír adatot, de a delegált
  // munkamenet nélküli hívás semmi jóra nem szolgál — ezért ugyanaz a kapuőr
  // védi, mint az importot.
  const parseGuard = await assertDelegatedImportAllowed(moduleStr, target.congregationId, access)
  if (!parseGuard.ok) return { error: parseGuard.error }

  const importModule = moduleStr as ImportModule

  // Méret ellenőrzés (max 10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }

  // Formátum ellenőrzés
  const ext = file.name.toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv', 'xml'].includes(ext || '')) {
    return { error: 'Nem támogatott fájlformátum. Elfogadott: .xlsx, .xls, .csv, .xml' }
  }

  let workbook: ParsedWorkbook

  try {
    if (ext === 'csv') {
      const text = await file.text()
      workbook = parseCsvString(text, file.name)
    } else if (ext === 'xml') {
      const text = await file.text()
      workbook = parseXmlSpreadsheet(text, file.name)
    } else {
      const buffer = await file.arrayBuffer()
      workbook = parseWorkbook(buffer, file.name)
    }
  } catch {
    return { error: 'A fájl olvasása sikertelen. Ellenőrizd a formátumot.' }
  }

  // 2026-08-26 (Leltar 3_43 kör): a HIVATALOS egyházmegyei munkafüzetet a
  // lapnevekről ismerjük fel, és a dedikált importálóhoz irányítunk — a
  // generikus út a 3–4. sorbeli fejléceket és a negatív (kivezetés-)sorokat
  // nem érti, tehát innen csak NÉMÁN ROSSZ import születhetne.
  if (importModule === 'inventory' && isLeltar343Workbook(workbook.sheets.map((s) => s.name))) {
    return {
      success: true,
      fileName: workbook.fileName,
      isCsv: workbook.isCsv,
      sheets: [],
      leltar343: true,
    }
  }

  // Profil javaslatok
  const moduleProfiles = getProfilesByModule(importModule)

  const sheets: ParsedSheetPreview[] = workbook.sheets.map((sheet) => {
    if (sheet.warning || sheet.headers.length === 0) {
      return {
        sheetName: sheet.name,
        headers: sheet.headers,
        rowCount: sheet.rowCount,
        suggestedProfileKey: null,
        sampleRows: [],
        warning: sheet.warning || 'Üres sheet',
      }
    }

    const suggested = suggestProfileForSheet(sheet.name, moduleProfiles)

    return {
      sheetName: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      suggestedProfileKey: suggested?.key ?? null,
      sampleRows: sheet.rows.slice(0, 5),
    }
  })

  return {
    success: true,
    fileName: workbook.fileName,
    isCsv: workbook.isCsv,
    sheets,
  }
}

// ---------------------------------------------------------------------------
// 2. Batch import végrehajtás
// ---------------------------------------------------------------------------

/**
 * A kiválasztott sheet+profil párokkal batch insert.
 * A kliens elküldi a fájlt újra + a sheet↔profil konfigurációt.
 */
export async function executeBatchImport(
  formData: FormData,
): Promise<BatchImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Cél-gyülekezet: alapból az aktív; admin import-hubból explicit `targetCongregationId`
  // (rendszergazda + hatókör-ellenőrzéssel — enélkül a régi god-mode/delegált út).
  const target = await resolveImportTargetCongregationId(
    formData.get('targetCongregationId') as string | null,
    access,
  )
  if (target.error) return { error: target.error }
  if (!target.congregationId) return { error: 'Nincs aktív gyülekezet.' }
  const congregationId = target.congregationId

  const file = formData.get('file') as File | null
  const configJson = formData.get('config') as string | null
  const moduleStr = formData.get('module') as string | null

  if (!file || !configJson || !moduleStr) {
    return { error: 'Hiányzó paraméterek (fájl, konfiguráció, modul).' }
  }

  // BIZTONSÁGI FIX 2026-08-11 (#16): a PIN-kapu eddig KIZÁRÓLAG a felületen volt.
  // A modul-oldalak csak elrejtették a „Rendszergazdai importáló" fület
  // (`showAdminImport = godMode.active || delegatedImport.active`), maga az akció
  // viszont csak a bejelentkezést nézte — így BÁRMELY hitelesített felhasználó
  // elküldhette az akció azonosítóját egy preparált munkafüzettel, és tömegesen
  // szúrhatott sorokat a saját gyülekezete szemely/befizetes/kiadas/iktato/
  // leltar_tetelek tábláiba: PIN nélkül, a 2 órás munkamenet, a brute-force
  // korlátozó és az aktiválási audit-nyom megkerülésével. A kapuőr fail-closed:
  // delegált süti VAGY aktív god mode VAGY rendszergazda + hatókör kell hozzá.
  const importGuard = await assertDelegatedImportAllowed(moduleStr, congregationId, access)
  if (!importGuard.ok) return { error: importGuard.error }

  let sheetConfigs: ImportSheetConfig[]
  try {
    sheetConfigs = JSON.parse(configJson) as ImportSheetConfig[]
  } catch {
    return { error: 'Érvénytelen konfiguráció.' }
  }

  if (sheetConfigs.length === 0) {
    return { error: 'Legalább egy sheet-et ki kell választani.' }
  }

  // Parse
  const ext = file.name.toLowerCase().split('.').pop()
  let workbook: ParsedWorkbook

  try {
    if (ext === 'csv') {
      const text = await file.text()
      workbook = parseCsvString(text, file.name)
    } else if (ext === 'xml') {
      const text = await file.text()
      workbook = parseXmlSpreadsheet(text, file.name)
    } else {
      const buffer = await file.arrayBuffer()
      workbook = parseWorkbook(buffer, file.name)
    }
  } catch {
    return { error: 'A fájl olvasása sikertelen.' }
  }

  const supabase = await createClient()
  const ctx: AutoColumnContext = {
    congregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }

  let totalInserted = 0
  let totalSkipped = 0
  const allErrors: Array<{ sheet: string; row: number; message: string }> = []
  const allLookupStats: ResolveStats = {
    personResolved: 0,
    personUnresolved: 0,
    categoryResolved: 0,
    categoryUnresolved: 0,
    warnings: [],
  }
  const perSheetLog: Array<{ sheet: string; profile: string; inserted: number; skipped: number }> = []

  // Sheet-enként feldolgozás
  for (const config of sheetConfigs) {
    const sheet = workbook.sheets.find((s) => s.name === config.sheetName)
    if (!sheet || sheet.rowCount === 0) continue

    const profile = getProfileByKey(config.profileKey)
    if (!profile) {
      allErrors.push({
        sheet: config.sheetName,
        row: 0,
        message: `Ismeretlen profil: ${config.profileKey}`,
      })
      continue
    }

    // 2026-07-17 (PR-1, F3.7 guard): a generikus batch-út NEM oldja fel az
    // _utca_text/_helyseg_text virtuális címmezőket (nincs utca/helység-resolver
    // a lookup-resolverben) — szemely-célú profilnál ez néma cím-vesztés lenne.
    // Hangos hibával a tagnyilvántartás import-varázslójára irányítunk.
    if (
      profile.targetTable === 'szemely' &&
      profile.columnMap.some((c) => c.dbColumn === '_utca_text' || c.dbColumn === '_helyseg_text')
    ) {
      allErrors.push({
        sheet: config.sheetName,
        row: 0,
        message: `A(z) "${profile.label}" profil címmezőket (utca/helység) tartalmaz, amelyeket csak a Tagnyilvántartás import-varázslója tud feloldani — ezen az útvonalon a címek elvesznének. Használd a Tagnyilvántartás → Rendszergazdai importáló varázslót.`,
      })
      continue
    }

    // Transzformálás
    const result: BatchTransformResult = transformSheet(
      sheet.rows,
      sheet.headers,
      profile,
      ctx,
    )

    // 2026-07-24 (PR-6 F7.4): a fel-nem-ismert oszlopok eddig NÉMÁN kimaradtak
    // az importból — fejléc-átnevezésnél (új évi sablon) ez csendes adathiányt
    // okozott. Mostantól hangos figyelmeztetés megy az eredménybe.
    if (result.headerMatch.unmatched.length > 0 && allLookupStats.warnings.length < 50) {
      allLookupStats.warnings.push(
        `[${config.sheetName}] ${result.headerMatch.unmatched.length} oszlop NEM importálódik (nem párosítható a(z) "${profile.label}" profilhoz): ${result.headerMatch.unmatched.join(', ')}`,
      )
    }

    // Hibás sorok
    for (const err of result.errors) {
      if (allErrors.length < 50) {
        allErrors.push({
          sheet: config.sheetName,
          row: err.rowIndex + 1,
          message: err.message,
        })
      }
      totalSkipped += 1
    }

    // Lookup resolver — virtuális `_` oszlopok → valódi FK ID-k
    let sheetInserted = 0
    let sheetSkipped = 0
    if (result.records.length > 0) {
      const rawRecords = result.records.map((r) => r.record)
      const { records: resolvedRecords, stats: resolveStats } = await resolveLookups(
        supabase,
        congregationId,
        rawRecords,
      )

      // Lookup statisztikák aggregálása
      allLookupStats.personResolved += resolveStats.personResolved
      allLookupStats.personUnresolved += resolveStats.personUnresolved
      allLookupStats.categoryResolved += resolveStats.categoryResolved
      allLookupStats.categoryUnresolved += resolveStats.categoryUnresolved
      for (const w of resolveStats.warnings) {
        if (allLookupStats.warnings.length < 50) {
          allLookupStats.warnings.push(`[${config.sheetName}] ${w}`)
        }
      }

      // 2026-08-09 (review-fix): az iktató-profil „Küldő keltezése" és
      // „Hivatkozás címe" mezői virtuális (_ prefixű) oszlopok — az insert előtt
      // eddig NÉMÁN elvesztek, pedig a sablon-súgó a megjegyzésbe ígéri őket.
      // Itt fűzzük őket a megjegyzéshez.
      const recordsForInsert =
        profile.targetTable === 'iktato'
          ? resolvedRecords.map((rec) => {
              const extras = [
                rec['_kuldo_keltezese'] ? `Küldő keltezése: ${rec['_kuldo_keltezese']}` : null,
                rec['_hivatkozas'] ? `Hivatkozás: ${rec['_hivatkozas']}` : null,
              ].filter(Boolean)
              const base = typeof rec['megjegyzes'] === 'string' && rec['megjegyzes'] ? `${rec['megjegyzes']} · ` : ''
              const merged = extras.length === 0 ? rec : { ...rec, megjegyzes: `${base}${extras.join(' · ')}` }
              // Üres iktatószámnál a kulcsot is elhagyjuk — explicit null-lal a
              // NOT NULL DEFAULT nextval(...) nem érvényesülne (NOT NULL hiba).
              if (merged['sequence_number'] == null) {
                const rest = { ...merged }
                delete rest['sequence_number']
                return rest
              }
              return merged
            })
          : resolvedRecords

      // 2026-08-26 (Leltar 3_43 kör): leltár-célú profilnál a kategória-címkét
      // kanonizáljuk, a hiányzó leltári számot a kategória-előtag szerint
      // pótoljuk, a duplikált számot pedig HANGOSAN kihagyjuk (nem írunk felül).
      let vegsoRekordok = recordsForInsert
      if (profile.targetTable === 'leltar_tetelek') {
        const prep = await prepareInventoryRecords(
          supabase,
          congregationId,
          recordsForInsert,
          config.sheetName,
          allErrors,
        )
        if ('error' in prep) {
          allErrors.push({ sheet: config.sheetName, row: 0, message: prep.error })
          totalSkipped += recordsForInsert.length
          perSheetLog.push({ sheet: config.sheetName, profile: profile.key, inserted: 0, skipped: recordsForInsert.length })
          continue
        }
        vegsoRekordok = prep.records
        totalSkipped += prep.skipped
      }

      const insertResult = await batchInsertRecords(
        supabase,
        profile,
        vegsoRekordok,
        config.sheetName,
        allErrors,
      )
      totalInserted += insertResult.inserted
      totalSkipped += insertResult.skipped
      sheetInserted = insertResult.inserted
      sheetSkipped = insertResult.skipped

      // 2026-07-11 P2 (iktató pointer-szinkron): az import direkt INSERT-tel ír,
      // ezért a next_iktato_sequence sorszám-pointere lemaradna — a következő
      // kézi iktatás ütköző sorszámot kapna. Az RPC minden érintett évre a
      // tényleges maximumra húzza a pointert; hibája nem buktatja az importot.
      if (profile.targetTable === 'iktato' && insertResult.inserted > 0) {
        const affectedYears = new Set<number>()
        for (const rec of resolvedRecords) {
          const y = Number(rec['year'])
          if (Number.isFinite(y) && y >= 1800 && y <= 2200) affectedYears.add(y)
        }
        // Az évek függetlenek — párhuzamosan szinkronizálhatók (sok-éves
        // archívum-importnál a soros változat éveként egy kört várna).
        await Promise.allSettled(
          [...affectedYears].map(async (y) => {
            // 2026-08-09 (review-fix): a pointer-szinkron a TÉNYLEGES cél-gyülekezetre
            // fusson (admin import-hub más gyülekezetbe is importálhat) — korábban a
            // hívó saját effectiveCongregationId-jára ment, és a cél-gyülekezet
            // pointere lemaradt → ütköző iktatószám a következő kézi iktatásnál.
            const { error: syncError } = await supabase.rpc('sync_iktato_sequence_pointer', {
              p_congregation_id: congregationId,
              p_year: y,
            })
            if (syncError) {
              console.warn(
                `[executeBatchImport] Iktató sorszám-pointer szinkron sikertelen (${y}. év): ${syncError.message}`,
              )
            }
          }),
        )
      }
    }

    perSheetLog.push({
      sheet: config.sheetName,
      profile: profile.key,
      inserted: sheetInserted,
      skipped: sheetSkipped + result.errors.length,
    })
  }

  // Revalidáljuk a megfelelő útvonalat
  revalidateModule(moduleStr as ImportModule)

  // Import log rögzítése (a táblához csatolt insert csak próbálkozás, hibát
  // nem logolunk tovább, hogy a fő flow ne akadjon el)
  try {
    const { logImportRun } = await import('./import-log')
    await logImportRun({
      supabase,
      congregationId,
      userId: access.user.id,
      module: moduleStr as ImportModule,
      fileName: file.name,
      totalInserted,
      totalSkipped,
      perSheetLog,
      lookupStats: allLookupStats,
      errors: allErrors,
    })
  } catch (e) {
    console.warn('[executeBatchImport] Import log rögzítése sikertelen:', e)
  }

  return {
    success: true,
    insertedCount: totalInserted,
    skippedCount: totalSkipped,
    errors: allErrors.length > 0 ? allErrors : undefined,
    lookupStats: allLookupStats,
  }
}

// ---------------------------------------------------------------------------
// Belső: leltár-rekordok előkészítése (2026-08-26, Leltar 3_43 kör)
// ---------------------------------------------------------------------------

/**
 * A generikus leltár-import ('inventory_items' profil) DB-kész rekordjai:
 *   - kategória-címke (HU/RO) → kanonikus szerializált alak; ismeretlen →
 *     hangos sor-hiba (nem tippelünk kategóriát);
 *   - hiányzó leltári szám → kategória-előtag szerinti következő szám (a
 *     MÁR KIADOTT számok LAPOZOTT, fail-closed lekérdezésével — a PostgREST
 *     1000 soros néma plafonja ismert hibaosztály);
 *   - már létező / fájlon belül duplikált szám → a sor kimarad, hibával;
 *   - kitöltött törlés-dátum → is_deleted (a kivezetett tétel sora megmarad).
 */
async function prepareInventoryRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  records: Array<Record<string, string | number | boolean | null>>,
  sheetName: string,
  errors: Array<{ sheet: string; row: number; message: string }>,
): Promise<{ records: Array<Record<string, string | number | boolean | null>>; skipped: number } | { error: string }> {
  const { data: meglevoSorok, error } = await selectAllPaged<{ leltari_szam: string | null }>(
    supabase
      .from('leltar_tetelek')
      .select('leltari_szam')
      .eq('congregation_id', congregationId),
  )
  if (error) {
    // Fail-closed: hiányos számlistából duplikált leltári szám születne.
    return { error: `A meglévő leltári számok lekérdezése nem sikerült (${error.message}) — az importot nem indítottuk el.` }
  }

  const kiadottSzamok = new Set(
    meglevoSorok.map((r) => String(r.leltari_szam || '').trim()).filter(Boolean),
  )
  const eredmeny: Array<Record<string, string | number | boolean | null>> = []
  let skipped = 0

  records.forEach((rec, index) => {
    const sor = index + 1
    const kategoriaKulcs = normalizeInventoryCategory(String(rec['kategoria'] ?? ''))
    if (!kategoriaKulcs) {
      errors.push({ sheet: sheetName, row: sor, message: `Ismeretlen kategória: „${rec['kategoria']}" — a sor kimaradt.` })
      skipped += 1
      return
    }

    let leltariSzam = String(rec['leltari_szam'] ?? '').trim()
    if (leltariSzam && kiadottSzamok.has(leltariSzam)) {
      errors.push({ sheet: sheetName, row: sor, message: `A(z) „${leltariSzam}" leltári szám már létezik — a sor kimaradt (nem írunk felül).` })
      skipped += 1
      return
    }
    if (!leltariSzam) {
      // CSAK a saját kategória-előtag számai számítanak — a teljes készletből
      // a nextLeltariSzam a MÁS előtagú számok suffixét is maximumnak venné.
      const prefix = INVENTORY_CATEGORY_PREFIXES[kategoriaKulcs]
      leltariSzam = nextLeltariSzam(
        [...kiadottSzamok].filter((sz) => sz.startsWith(`${prefix}-`)),
        kategoriaKulcs,
      )
    }
    kiadottSzamok.add(leltariSzam)

    eredmeny.push({
      ...rec,
      kategoria: serializeInventoryCategory(kategoriaKulcs),
      leltari_szam: leltariSzam,
      mennyiseg: Number(rec['mennyiseg'] ?? 1) > 0 ? Number(rec['mennyiseg'] ?? 1) : 1,
      mertekegyseg: String(rec['mertekegyseg'] ?? '').trim() || 'db',
      is_deleted: Boolean(rec['torles_datuma']),
    })
  })

  return { records: eredmeny, skipped }
}

// ---------------------------------------------------------------------------
// Belső: batch INSERT
// ---------------------------------------------------------------------------

async function batchInsertRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: ImportProfile,
  records: Array<Record<string, string | number | boolean | null>>,
  sheetName: string,
  errors: Array<{ sheet: string; row: number; message: string }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0

  // Kiszűrjük a _ prefixű (virtuális) oszlopokat — ezek lookup mezők,
  // amiket nem írunk közvetlenül a DB-be
  const cleanedRecords = records.map((rec) => {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(rec)) {
      if (!key.startsWith('_')) {
        cleaned[key] = val
      }
    }
    return cleaned
  })

  // Batch insert 100-asával
  const BATCH_SIZE = 100
  for (let i = 0; i < cleanedRecords.length; i += BATCH_SIZE) {
    const batch = cleanedRecords.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from(profile.targetTable)
      .insert(batch)

    if (error) {
      // Ha a batch hibás, próbálkozunk egyenként
      for (let j = 0; j < batch.length; j++) {
        const { error: rowError } = await supabase
          .from(profile.targetTable)
          .insert([batch[j]])

        if (rowError) {
          skipped += 1
          if (errors.length < 50) {
            errors.push({
              sheet: sheetName,
              row: i + j + 1,
              message: rowError.message,
            })
          }
        } else {
          inserted += 1
        }
      }
    } else {
      inserted += batch.length
    }
  }

  return { inserted, skipped }
}

// ---------------------------------------------------------------------------
// Revalidáció modulonként
// ---------------------------------------------------------------------------

function revalidateModule(module: ImportModule) {
  switch (module) {
    case 'members':
      revalidatePath('/tagnyilvantartas')
      break
    case 'finance':
      revalidatePath('/penzugy')
      break
    case 'registry':
      revalidatePath('/anyakonyv')
      break
    case 'worklog':
      revalidatePath('/munkanaplo')
      break
    case 'filing':
      revalidatePath('/iktato')
      break
    case 'inventory':
      revalidatePath('/leltar')
      break
  }
}
