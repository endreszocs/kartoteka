'use server'

/**
 * Körzet-nyomtatás adatgyűjtő (2026-07-24, PR-10, 3. észrevétel).
 *
 * Egy körzet teljes névsorát adja vissza NYOMTATÁSHOZ + statisztikával:
 * hány család / egyedülálló / özvegy / elvált van a körzetben, és pontosan
 * kik azok. A körzet tagsága két forrásból áll:
 *   (a) családok: csalad.id_csoport = körzet → a család minden élő tagja
 *   (b) család nélküli személyek: szemely.id_csoport = körzet (PR-10 oszlop)
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { applyStreetLocalityFallback } from '@/lib/members/street-locality-fallback'

const CHUNK = 100
function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

export interface DistrictPrintPerson {
  id: number
  nev: string
  ferfi: boolean | null
  sz_datum: string | null
  allapot: string | null
  lakcim: string
  /** true = önálló (család nélküli) személy; false = családtag */
  standalone: boolean
  /** A család azonosítója, amelyhez tartozik (csoportosításhoz) */
  familyId: number | null
  /** A család megjelenítési neve (családtagoknál) */
  familyName: string | null
}

export interface DistrictPrintData {
  districtName: string
  congregationName: string
  persons: DistrictPrintPerson[]
  stats: {
    families: number
    people: number
    standalone: number
    widowed: number
    divorced: number
    single: number
  }
}

type NameRel = { name: string | null } | Array<{ name: string | null }> | null
type StreetRel =
  | { name: string | null; adrlocality?: NameRel }
  | Array<{ name: string | null; adrlocality?: NameRel }>
  | null
type SzRow = {
  id: number
  csaladnev: string | null
  k_nev: string | null
  ferfi: boolean | null
  sz_datum: string | null
  allapot: string | null
  c_szam: string | null
  adrstreet?: StreetRel
  adrlocality?: NameRel
}

function buildAddress(row: SzRow): string {
  const flat = applyStreetLocalityFallback(row as Parameters<typeof applyStreetLocalityFallback>[0]) as {
    adrstreet: { name: string } | null
    adrlocality: { name: string } | null
  }
  const parts = [flat.adrlocality?.name, flat.adrstreet?.name, row.c_szam].filter(Boolean)
  return parts.join(', ')
}

const SELECT =
  'id, csaladnev, k_nev, ferfi, sz_datum, allapot, c_szam, adrstreet:adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality:adrlocality!c_helysegid(name)'

export async function getDistrictPrintData(csoportId: number): Promise<DistrictPrintData | null> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return null

  const [districtRes, congRes] = await Promise.all([
    supabase.from('csoport').select('nev').eq('id', csoportId).maybeSingle(),
    supabase.from('congregations').select('name, nev_hu').eq('id', congregationId).maybeSingle(),
  ])
  const districtName = (districtRes.data?.nev as string | null) || `#${csoportId}. körzet`
  const congregationName =
    (congRes.data?.nev_hu as string | null) || (congRes.data?.name as string | null) || 'Gyülekezet'

  // (a) A körzethez rendelt CSALÁDOK (legacy csalad.id)
  const { data: famRows, error: famError } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no')
    .eq('id_csoport', csoportId)
  if (famError) throw new Error(`A körzet családjainak lekérdezése sikertelen: ${famError.message}`)
  const familyIds = (famRows || []).map((f) => f.id as number)

  // A családok tagjai: felnőttek (id_ferfi/id_no) + gyerekek (gyerek tábla)
  const personToFamily = new Map<number, number>()
  for (const f of (famRows || []) as Array<{ id: number; id_ferfi: number | null; id_no: number | null }>) {
    if (f.id_ferfi) personToFamily.set(f.id_ferfi, f.id)
    if (f.id_no) personToFamily.set(f.id_no, f.id)
  }
  for (const part of chunks(familyIds, CHUNK)) {
    const { data: gyerekRows, error: gyerekError } = await supabase
      .from('gyerek')
      .select('id_szemely, id_csalad')
      .in('id_csalad', part)
    if (gyerekError) throw new Error(`A körzet gyermekeinek lekérdezése sikertelen: ${gyerekError.message}`)
    for (const g of (gyerekRows || []) as Array<{ id_szemely: number; id_csalad: number }>) {
      if (!personToFamily.has(g.id_szemely)) personToFamily.set(g.id_szemely, g.id_csalad)
    }
  }

  // (b) A körzethez KÖZVETLENÜL rendelt (család nélküli) személyek
  const standaloneIds = new Set<number>()
  {
    const { data: soloRows, error: soloError } = await supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('id_csoport', csoportId)
      .eq('isvisible', true)
      .eq('meghalt', false)
    if (soloError) {
      // PR-10 oszlop hiánya esetén csak a családos névsor jön (nem blokkol).
      console.warn('[district-print] szemely.id_csoport nem olvasható:', soloError.message)
    } else {
      for (const r of (soloRows || []) as Array<{ id: number }>) standaloneIds.add(r.id)
    }
  }

  // Minden érintett személy adatai (élő, látható)
  const allPersonIds = [...new Set([...personToFamily.keys(), ...standaloneIds])]
  const personRows: SzRow[] = []
  for (const part of chunks(allPersonIds, CHUNK)) {
    const { data, error } = await supabase
      .from('szemely')
      .select(SELECT)
      .in('id', part)
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
    if (error) throw new Error(`A körzet személyeinek lekérdezése sikertelen: ${error.message}`)
    personRows.push(...((data || []) as unknown as SzRow[]))
  }

  // Család-név (a fej neve) a csoportosításhoz
  const familyNameById = new Map<number, string>()
  for (const row of personRows) {
    const fid = personToFamily.get(row.id)
    if (fid != null && !familyNameById.has(fid)) {
      // az első felnőtt neve a fej-jelölt; pontosítjuk lentebb, ha van id_ferfi
    }
  }
  for (const f of (famRows || []) as Array<{ id: number; id_ferfi: number | null; id_no: number | null }>) {
    const fejId = f.id_ferfi ?? f.id_no
    const fej = personRows.find((p) => p.id === fejId)
    if (fej) familyNameById.set(f.id, `${fej.csaladnev || ''} ${fej.k_nev || ''}`.trim())
  }

  const persons: DistrictPrintPerson[] = personRows.map((row) => {
    const familyId = personToFamily.get(row.id) ?? null
    const standalone = standaloneIds.has(row.id) && familyId == null
    return {
      id: row.id,
      nev: `${row.csaladnev || ''} ${row.k_nev || ''}`.trim(),
      ferfi: row.ferfi,
      sz_datum: row.sz_datum,
      allapot: row.allapot,
      lakcim: buildAddress(row),
      standalone,
      familyId,
      familyName: familyId != null ? familyNameById.get(familyId) ?? null : null,
    }
  })

  // Rendezés: családok név szerint (a fej neve), a családon belül felnőttek
  // előre; végül a család nélküli személyek névsorban.
  persons.sort((a, b) => {
    if (a.standalone !== b.standalone) return a.standalone ? 1 : -1
    const an = a.familyName || a.nev
    const bn = b.familyName || b.nev
    const byFamily = an.localeCompare(bn, 'hu')
    if (byFamily !== 0) return byFamily
    return a.nev.localeCompare(b.nev, 'hu')
  })

  const standaloneList = persons.filter((p) => p.standalone)
  const stats = {
    families: familyIds.length,
    people: persons.length,
    standalone: standaloneList.length,
    widowed: standaloneList.filter((p) => p.allapot === 'özvegy').length,
    divorced: standaloneList.filter((p) => p.allapot === 'elvált').length,
    single: standaloneList.filter((p) => p.allapot !== 'özvegy' && p.allapot !== 'elvált').length,
  }

  return { districtName, congregationName, persons, stats }
}
