'use server'

/**
 * Anyakönyvi import wizard — person-link lépés szerver-segéd.
 *
 * A wizard 3. lépésén a kliens már transzformálta a rows-t (transformSheet),
 * de a `_csaladnev` + `_k_nev` + `_sz_datum` + `_ferfi` mezők még szöveges
 * formában vannak. Ez a server action behívja a `resolveLookups`-ot és
 * visszaadja, mely sorokon sikerült id-t találni (id_szemely / id_ferfi / id_no).
 *
 * A wizard ezt csak STATISZTIKÁHOZ használja a person-link-step-en — a
 * tényleges import (executeRegistryImport) ugyanezt megint elvégzi
 * (idempotens). Egyszerűsítve: nem küldünk vissza minden record-ot, csak
 * statisztikát + nem-talált példákat.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { resolveLookups } from './lookup-resolver'

export interface RegistryPersonResolveResult {
  success?: boolean
  error?: string
  /** Hány sor sikerült feloldani (legalább egy ID-t kapott) */
  resolvedCount?: number
  /** Hány sor nem talált egyetlen tagot sem */
  unresolvedCount?: number
  /** Hány sor két tag-ID-t igényel (esketés) — és mindkettő sikerült */
  dualResolvedCount?: number
  /** Hány esketés-sornál egyik vagy másik fél nem található */
  dualPartialCount?: number
  /** Példa nem-talált sorok (max 20) */
  unresolvedExamples?: Array<{ rowIndex: number; description: string }>
}

interface RowToResolve {
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
  // a transformer minden mást is hozzáadhat
  [key: string]: string | number | boolean | null | undefined
}

export async function resolveRegistryPersonsAction(
  formData: FormData,
): Promise<RegistryPersonResolveResult> {
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

  let rows: RowToResolve[]
  try {
    const parsed = JSON.parse(rowsRaw)
    if (!Array.isArray(parsed)) return { error: 'Rossz rows formátum.' }
    rows = parsed as RowToResolve[]
  } catch (e) {
    return {
      error: `JSON parse hiba: ${e instanceof Error ? e.message : 'ismeretlen'}`,
    }
  }

  // Másoljuk a rows-t (mert a resolveLookups mutálja a rec-eket)
  const records = rows.map((r) => ({ ...r })) as Array<Record<string, string | number | boolean | null>>

  const supabase = await createClient()
  await resolveLookups(supabase, targetCongregationId, records)

  // Esketés profil → dual lookup (id_ferfi + id_no)
  const isMarriage = profileKey === 'marriage'

  let resolvedCount = 0
  let unresolvedCount = 0
  let dualResolvedCount = 0
  let dualPartialCount = 0
  const unresolvedExamples: Array<{ rowIndex: number; description: string }> = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (isMarriage) {
      const hasFerfi = r.id_ferfi != null && r.id_ferfi !== ''
      const hasNo = r.id_no != null && r.id_no !== ''
      if (hasFerfi && hasNo) {
        dualResolvedCount += 1
      } else if (hasFerfi || hasNo) {
        dualPartialCount += 1
        if (unresolvedExamples.length < 20) {
          const missingPart = !hasFerfi
            ? `Vőlegény nem található: ${r._ferfi_csaladnev || '?'} ${r._ferfi_k_nev || '?'}`
            : `Menyasszony nem található: ${r._no_csaladnev || '?'} ${r._no_k_nev || '?'}`
          unresolvedExamples.push({ rowIndex: i + 1, description: missingPart })
        }
      } else {
        unresolvedCount += 1
        if (unresolvedExamples.length < 20) {
          unresolvedExamples.push({
            rowIndex: i + 1,
            description: `Egyik fél sem található: ${r._ferfi_csaladnev || '?'} ${r._ferfi_k_nev || '?'} × ${r._no_csaladnev || '?'} ${r._no_k_nev || '?'}`,
          })
        }
      }
    } else {
      const hasSzemely = r.id_szemely != null && r.id_szemely !== ''
      if (hasSzemely) {
        resolvedCount += 1
      } else {
        unresolvedCount += 1
        if (unresolvedExamples.length < 20) {
          unresolvedExamples.push({
            rowIndex: i + 1,
            description: `${r._csaladnev || '?'} ${r._k_nev || '?'}${r._sz_datum ? `, sz: ${r._sz_datum}` : ''}`,
          })
        }
      }
    }
  }

  return {
    success: true,
    resolvedCount,
    unresolvedCount,
    dualResolvedCount,
    dualPartialCount,
    unresolvedExamples,
  }
}
