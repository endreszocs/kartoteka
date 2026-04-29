'use server'

/**
 * Elköltözés-import — sor-szintű átjelentő tábla.
 *
 * Endre kérése (2026-04-30): "Az XML-ben 14 sor különböző célgyülekezetekre
 * megy. Sor-szintű választó kell, plus auto-javaslat a Hova-helység és a
 * Megjegyzés alapján."
 *
 * Ez az action:
 *   1. Parse-olja a TELJES fájlt (a bekoltozott/elkoltozott profilra)
 *   2. Minden sornál: kinyeri a tag-nevet, Hova-helységet, Megjegyzést, kulfoldre flaget
 *   3. Auto-javaslatot készít a célgyülekezethez:
 *      - Megjegyzés egyezés (pl. "Gyöngyvirág utcai Református" → 1 találat)
 *      - Helység-egyezés (pl. "Árkos" → 1 ilyen néven van: Árkosi Református)
 *      - Ha többszörös találat van: marker, hogy a felhasználó dönt
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES } from './import-profiles'
import { transformSheet, type AutoColumnContext } from './row-transformer'

export interface ElkoltozottRow {
  rowIndex: number
  csaladnev: string
  szcs_nev: string | null
  k_nev: string
  sz_datum: string | null
  mikor: string | null
  hova: string | null // Hova-helység az XML-ben
  kulfoldre: boolean
  megjegyzes: string | null
  /** Auto-javaslat: a hova helység és/vagy megjegyzés alapján — UUID + megjelenítendő név */
  suggested_target: {
    congregation_id: string
    congregation_name: string
    diocese_name: string | null
    confidence: 'high' | 'medium' | 'low'
    reason: string
  } | null
  /** Plus jelölhetjük, ha a sor egyértelműen külföldi (kulfoldre=true)
   *  → akkor a felhasználónak nem kell célgyülekezetet választania */
  is_foreign: boolean
}

export interface ElkoltozottRowsResult {
  success?: boolean
  error?: string
  rows?: ElkoltozottRow[]
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

function norm(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function coerceBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return ['true', '1', 'igen', 'yes', 'i', 'külföld', 'kulfold'].includes(s)
  }
  return false
}

export async function previewElkoltozottRowsAction(
  formData: FormData,
): Promise<ElkoltozottRowsResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = formData.get('profileKey') as string | null

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (profileKey !== 'movement_elkoltozott') {
    return { error: 'Csak elkoltozott profilra elérhető.' }
  }

  const profile = REGISTRY_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: 'Profil nem található.' }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

  // Parse
  let workbook: ParsedWorkbook
  try {
    if (ext === 'csv') workbook = parseCsvString(await file.text(), file.name)
    else if (ext === 'xml') workbook = parseXmlSpreadsheet(await file.text(), file.name)
    else workbook = parseWorkbook(await file.arrayBuffer(), file.name)
  } catch (e) {
    return { error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen'}` }
  }

  const sheet = sheetName
    ? workbook.sheets.find(s => s.name === sheetName)
    : workbook.sheets.find(s => !s.warning && s.rowCount > 0) || workbook.sheets[0]
  if (!sheet) return { error: `Nem található a fül.` }

  // transformSheet ad standardizált rekordokat (csaladnev, k_nev, mikor, _helyseg_text stb.)
  const ctx: AutoColumnContext = {
    congregationId: access.effectiveCongregationId || '',
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }
  const transformResult = transformSheet(sheet.rows, sheet.headers, profile, ctx)
  const records = transformResult.records.map(r => r.record)

  // Lekérjük a congregations + dioceses listát az auto-javaslathoz
  const supabase = await createClient()
  const { data: allCongs } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, varos, diocese:dioceses(name)')
    .order('name')

  type CongRow = {
    id: string
    name: string
    nev_hu: string | null
    varos: string | null
    diocese: { name: string | null } | { name: string | null }[] | null
  }
  const congs = (allCongs || []) as unknown as CongRow[]

  // Sor-szintű feldolgozás + auto-javaslat
  const rows: ElkoltozottRow[] = records.map((r, i) => {
    const csaladnev = String(r._csaladnev || '')
    const szcs_nev = typeof r._szcs_nev === 'string' && r._szcs_nev.trim() ? r._szcs_nev.trim() : null
    const k_nev = String(r._k_nev || '')
    const sz_datum = typeof r._sz_datum === 'string' ? r._sz_datum : null
    const mikor = typeof r.mikor === 'string' ? r.mikor : null
    const hova = typeof r._helyseg_text === 'string' && r._helyseg_text.trim() ? r._helyseg_text.trim() : null
    const kulfoldre = coerceBool(r.kulfoldre)
    const megjegyzes = typeof r.megjegyzes === 'string' && r.megjegyzes.trim() ? r.megjegyzes.trim() : null

    // Auto-javaslat algoritmus
    let suggested: ElkoltozottRow['suggested_target'] = null

    if (!kulfoldre) {
      const megNorm = norm(megjegyzes)
      const hovaNorm = norm(hova)

      // 1. Próba: a megjegyzésben szerepel-e congregation neve (legerősebb jel)
      if (megNorm.length > 5) {
        for (const c of congs) {
          const cName = norm(c.nev_hu || c.name)
          if (cName && cName.length >= 5 && megNorm.includes(cName)) {
            const dn = Array.isArray(c.diocese) ? c.diocese[0]?.name : c.diocese?.name
            suggested = {
              congregation_id: c.id,
              congregation_name: c.nev_hu || c.name,
              diocese_name: dn || null,
              confidence: 'high',
              reason: `Megjegyzésben szerepel: "${c.nev_hu || c.name}"`,
            }
            break
          }
        }
      }

      // 2. Próba: a "Hova" helység alapján — ha a város egyezik
      //    (pl. "Árkos" → "Árkosi Református Egyházközség" varos="Árkos")
      if (!suggested && hovaNorm.length >= 3) {
        const matches = congs.filter(c => {
          const v = norm(c.varos)
          return v && v === hovaNorm
        })
        if (matches.length === 1) {
          const c = matches[0]
          const dn = Array.isArray(c.diocese) ? c.diocese[0]?.name : c.diocese?.name
          suggested = {
            congregation_id: c.id,
            congregation_name: c.nev_hu || c.name,
            diocese_name: dn || null,
            confidence: 'high',
            reason: `Helység "${hova}" → "${c.nev_hu || c.name}"`,
          }
        } else if (matches.length > 1) {
          // Több gyülekezet ugyanabban a helységben (pl. Sepsiszentgyörgy 4 db) — alacsony bizalom
          const c = matches[0]
          const dn = Array.isArray(c.diocese) ? c.diocese[0]?.name : c.diocese?.name
          suggested = {
            congregation_id: c.id,
            congregation_name: c.nev_hu || c.name,
            diocese_name: dn || null,
            confidence: 'low',
            reason: `Helység "${hova}" — ${matches.length} gyülekezet közül (válassz a megfelelőt)`,
          }
        }
      }

      // 3. Próba: a congregation neve a Hova-helységgel kezdődik (pl. "Árkos" → "Árkosi")
      if (!suggested && hovaNorm.length >= 3) {
        const matches = congs.filter(c => {
          const cName = norm(c.nev_hu || c.name)
          // Pl. "árkos" → "árkosi református..."
          return cName.startsWith(hovaNorm) || cName.startsWith(hovaNorm + 'i ')
        })
        if (matches.length === 1) {
          const c = matches[0]
          const dn = Array.isArray(c.diocese) ? c.diocese[0]?.name : c.diocese?.name
          suggested = {
            congregation_id: c.id,
            congregation_name: c.nev_hu || c.name,
            diocese_name: dn || null,
            confidence: 'medium',
            reason: `Helység "${hova}" → név-egyezés: "${c.nev_hu || c.name}"`,
          }
        }
      }
    }

    return {
      rowIndex: i + 1,
      csaladnev,
      szcs_nev,
      k_nev,
      sz_datum,
      mikor,
      hova,
      kulfoldre,
      megjegyzes,
      suggested_target: suggested,
      is_foreign: kulfoldre,
    }
  })

  return { success: true, rows }
}
