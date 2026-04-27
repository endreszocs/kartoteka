'use server'

/**
 * Anyakönyvi import wizard — "Új tagok létrehozása" szerver-akció.
 *
 * A person-link lépésen ha vannak nem-talált tagok (pl. újszülöttek a
 * keresztelési XML-ben akik még nincsenek a tagnyilvántartásban), a wizard
 * ezzel az actionnel **minimal szemely-rekordokat** hoz létre nekik:
 *   - csaladnev, k_nev, sz_datum, ferfi (a quad-lookup mezőkből)
 *   - cnp = generate_egyhazi_cnp() (auto-generated EC-prefix)
 *   - congregation_id = current
 *   - isvisible = true, isaktiv = true (default), type = 'L' (lélek/tag)
 *   - csaladfo = false (új tag, nem családfő)
 *
 * A többi mező (cím, telefon, foglalkozás stb.) NULL marad — Endre később
 * a tagnyilvántartásban kitöltheti.
 *
 * Az action visszadja, hány tagot hozott létre — a wizard ezután újra-resolve-olja
 * a person-link-et (most már megtalálja az újakat).
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { resolveLookups } from './lookup-resolver'

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

interface RowToCheck {
  _csaladnev?: string | null
  _k_nev?: string | null
  _sz_datum?: string | null
  _ferfi?: boolean | string | null
  _ferfi_csaladnev?: string | null
  _ferfi_k_nev?: string | null
  _ferfi_sz_datum?: string | null
  _no_csaladnev?: string | null
  _no_k_nev?: string | null
  _no_sz_datum?: string | null
  [key: string]: string | number | boolean | null | undefined
}

function coerceBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', '1', 'igen', 'yes', 'i', 'm', 'férfi', 'ferfi'].includes(s)) return true
    if (['false', '0', 'nem', 'no', 'n', 'f', 'nő', 'no'].includes(s)) return false
  }
  return null
}

export async function executeCreateMissingPersonsForRegistry(
  formData: FormData,
): Promise<CreateMissingPersonsResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const rowsRaw = formData.get('rows') as string | null
  const profileKey = formData.get('profileKey') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  if (!rowsRaw) return { error: 'Nincs feldolgozandó adat.' }
  if (!profileKey) return { error: 'Hiányzó profil-kulcs.' }
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet.' }

  let rows: RowToCheck[]
  try {
    const parsed = JSON.parse(rowsRaw)
    if (!Array.isArray(parsed)) return { error: 'Rossz rows formátum.' }
    rows = parsed as RowToCheck[]
  } catch (e) {
    return { error: `JSON parse hiba: ${e instanceof Error ? e.message : 'ismeretlen'}` }
  }

  // 1. Először RESOLVE-oljuk a már létezőket (hogy ne duplikáljuk)
  const records = rows.map((r) => ({ ...r })) as Array<Record<string, string | number | boolean | null>>
  const supabase = await createClient()
  await resolveLookups(supabase, targetCongregationId, records)

  // 2. A NEM-talált sorokból kinyerjük a létrehozandó person-eket
  const isMarriage = profileKey === 'marriage'
  const personsToCreate: Array<{ rowIndex: number; person: MissingPersonInput; whichSlot: '' | 'ferfi' | 'no' }> = []

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
            whichSlot: 'ferfi',
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
            whichSlot: 'no',
          })
        }
      }
    } else {
      // Egyszerű profilok (baptism, confirmation, burial, mozgások)
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
            whichSlot: '',
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

  // 3. Létrehozzuk az új szemely-rekordokat (egyszerre, soronként az insert
  //    miatt a generate_egyhazi_cnp() egyedi értéket generál minden sorra)
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
