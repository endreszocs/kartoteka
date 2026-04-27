'use server'

/**
 * Anyakönyvi import wizard — "Új tagok létrehozása" szerver-akció.
 *
 * 2026-04-28 ÁTÍRÁS: most a TELJES fájlt parse-olja server-oldalon
 * (nem csak a sample-t). A korábbi verzió csak az 5-soros sampleRows-ról
 * dolgozott, így 81-soros XML-en csak max 5 új tagot hozott létre.
 *
 * A person-link lépésen ha vannak nem-talált tagok (pl. újszülöttek a
 * keresztelési XML-ben akik még nincsenek a tagnyilvántartásban), a wizard
 * ezzel az actionnel **minimal szemely-rekordokat** hoz létre nekik:
 *   - csaladnev, k_nev, sz_datum, ferfi (a quad-lookup mezőkből)
 *   - cnp = generate_egyhazi_cnp() (auto-generated EC-prefix)
 *   - congregation_id = current
 *   - isvisible = true, isaktiv = true (default), type = 'L' (lélek/tag)
 *   - csaladfo = false (új tag, nem családfő)
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES } from './import-profiles'
import { resolveLookups } from './lookup-resolver'
import { transformSheet, type AutoColumnContext } from './row-transformer'

export interface CreateMissingPersonsResult {
  success?: boolean
  error?: string
  /** Hány tagot hoztunk létre */
  createdCount?: number
  /** Hány sorra már megvolt a tag (skipped) */
  alreadyResolvedCount?: number
  /** Hány sorra nem tudtuk létrehozni a tagot (hibás adat) */
  errorCount?: number
  /** Hibák részletes listája */
  errors?: Array<{ rowIndex: number; reason: string }>
}

interface MissingPersonInput {
  csaladnev: string
  k_nev: string
  sz_datum?: string | null
  ferfi?: boolean | null
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

function coerceBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', '1', 'igen', 'yes', 'i', 'm', 'férfi', 'ferfi'].includes(s)) return true
    if (['false', '0', 'nem', 'no', 'n', 'f', 'nő'].includes(s)) return false
  }
  return null
}

export async function executeCreateMissingPersonsForRegistry(
  formData: FormData,
): Promise<CreateMissingPersonsResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = formData.get('profileKey') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!profileKey) return { error: 'Hiányzó profil-kulcs.' }
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet.' }

  const profile = REGISTRY_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: `Érvénytelen profil-kulcs: ${profileKey}` }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

  // 1. Parse
  let workbook: ParsedWorkbook
  try {
    if (ext === 'csv') {
      workbook = parseCsvString(await file.text(), file.name)
    } else if (ext === 'xml') {
      workbook = parseXmlSpreadsheet(await file.text(), file.name)
    } else {
      workbook = parseWorkbook(await file.arrayBuffer(), file.name)
    }
  } catch (e) {
    return { error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen'}` }
  }

  const sheet = sheetName
    ? workbook.sheets.find(s => s.name === sheetName)
    : workbook.sheets.find(s => !s.warning && s.rowCount > 0) || workbook.sheets[0]
  if (!sheet) return { error: `Nem található a megadott fül: ${sheetName || '(első)'}` }

  // 2. transformSheet
  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }
  const transformResult = transformSheet(sheet.rows, sheet.headers, profile, ctx)
  const records = transformResult.records.map(r => ({ ...r.record })) as Array<Record<string, string | number | boolean | null>>

  // 3. resolveLookups (a már létezőket azonosítjuk)
  const supabase = await createClient()
  await resolveLookups(supabase, targetCongregationId, records)

  // 4. Nem-talált sorokból kinyerjük a létrehozandó person-eket
  const isMarriage = profileKey === 'marriage'
  const personsToCreate: Array<{ rowIndex: number; person: MissingPersonInput }> = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (isMarriage) {
      // Esketés: id_ferfi és id_no külön
      if (r.id_ferfi == null || r.id_ferfi === '') {
        const cs = r._ferfi_csaladnev
        const k = r._ferfi_k_nev
        if (typeof cs === 'string' && cs.trim() && typeof k === 'string' && k.trim()) {
          personsToCreate.push({
            rowIndex: i,
            person: {
              csaladnev: cs.trim(),
              k_nev: k.trim(),
              sz_datum: typeof r._ferfi_sz_datum === 'string' ? r._ferfi_sz_datum : null,
              ferfi: true,
            },
          })
        }
      }
      if (r.id_no == null || r.id_no === '') {
        const cs = r._no_csaladnev
        const k = r._no_k_nev
        if (typeof cs === 'string' && cs.trim() && typeof k === 'string' && k.trim()) {
          personsToCreate.push({
            rowIndex: i,
            person: {
              csaladnev: cs.trim(),
              k_nev: k.trim(),
              sz_datum: typeof r._no_sz_datum === 'string' ? r._no_sz_datum : null,
              ferfi: false,
            },
          })
        }
      }
    } else {
      if (r.id_szemely == null || r.id_szemely === '') {
        const cs = r._csaladnev
        const k = r._k_nev
        if (typeof cs === 'string' && cs.trim() && typeof k === 'string' && k.trim()) {
          personsToCreate.push({
            rowIndex: i,
            person: {
              csaladnev: cs.trim(),
              k_nev: k.trim(),
              sz_datum: typeof r._sz_datum === 'string' ? r._sz_datum : null,
              ferfi: coerceBoolean(r._ferfi),
            },
          })
        }
      }
    }
  }

  if (personsToCreate.length === 0) {
    return {
      success: true,
      createdCount: 0,
      alreadyResolvedCount: records.length,
      errorCount: 0,
      errors: [],
    }
  }

  // 5. Létrehozzuk az új szemely-rekordokat soronként
  let createdCount = 0
  let errorCount = 0
  const errors: Array<{ rowIndex: number; reason: string }> = []

  for (const item of personsToCreate) {
    try {
      const { data: cnpData, error: cnpError } = await supabase.rpc('generate_egyhazi_cnp')
      if (cnpError || !cnpData) {
        errorCount += 1
        errors.push({ rowIndex: item.rowIndex + 1, reason: `CNP generálás hiba: ${cnpError?.message || 'üres'}` })
        continue
      }

      const { error: insertError } = await supabase
        .from('szemely')
        .insert({
          cnp: cnpData as string,
          csaladnev: item.person.csaladnev,
          k_nev: item.person.k_nev,
          sz_datum: item.person.sz_datum || null,
          ferfi: item.person.ferfi ?? true,
          csaladfo: false,
          meghalt: false,
          isvisible: true,
          type: 'L',
          congregation_id: targetCongregationId,
          created: new Date().toISOString(),
        })

      if (insertError) {
        errorCount += 1
        errors.push({ rowIndex: item.rowIndex + 1, reason: insertError.message })
      } else {
        createdCount += 1
      }
    } catch (e) {
      errorCount += 1
      errors.push({
        rowIndex: item.rowIndex + 1,
        reason: e instanceof Error ? e.message : 'ismeretlen hiba',
      })
    }
  }

  return {
    success: true,
    createdCount,
    alreadyResolvedCount: records.length - personsToCreate.length,
    errorCount,
    errors,
  }
}
