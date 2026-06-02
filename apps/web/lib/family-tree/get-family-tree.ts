'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type {
  FamilyTreeData,
  FamilyTreeEdge,
  FamilyTreeMember,
} from '@/lib/family-tree/types'

/**
 * 2026-06-02: Családfa modul.
 * A `szemely_kapcsolat` táblából (Fázis 0) építünk egy generációs gráfot
 * egy adott `csalad.id` köré. A központ a férj + feleség; felfelé szülő-
 * gyermek kapcsolatokon át 2 generáció (nagyszülőkig), lefelé szintén 2
 * generáció (unokákig). Mindenkinek a házastársa is bekerül.
 *
 * Típusok: `@/lib/family-tree/types` — Next.js 16-on a 'use server' fájl
 * NEM exportálhat típust/interface-t (runtime hiba).
 */

/**
 * @param csaladId - a központi család id-je (régi csalad.id)
 * @param generationsUp - max szint felfelé (default 2 = nagyszülők)
 * @param generationsDown - max szint lefelé (default 2 = unokák)
 */
export async function getFamilyTreeData(
  csaladId: number,
  generationsUp: number = 2,
  generationsDown: number = 2,
): Promise<FamilyTreeData> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { members: [], edges: [], centerIds: [] }

  // 1. Központ — a régi csalad rekord ferfi + no
  const { data: csaladRow } = await supabase
    .from('csalad')
    .select('id_ferfi, id_no')
    .eq('id', csaladId)
    .single()
  if (!csaladRow) return { members: [], edges: [], centerIds: [] }

  const centerIds = [csaladRow.id_ferfi, csaladRow.id_no].filter(
    (v): v is number => v != null,
  )
  if (centerIds.length === 0) return { members: [], edges: [], centerIds: [] }

  // visited: id → generation. A központok 0. szint.
  const generationOf = new Map<number, number>()
  for (const id of centerIds) generationOf.set(id, 0)

  // 2. BFS felfelé szülő-keresés
  let frontierUp: number[] = [...centerIds]
  for (let gen = -1; gen >= -generationsUp; gen--) {
    if (frontierUp.length === 0) break
    const { data: kapcs } = await supabase
      .from('szemely_kapcsolat')
      .select('id_szemely_1, id_szemely_2')
      .eq('tipus', 'szulo_gyermek')
      .in('id_szemely_2', frontierUp)
      .is('ervenyes_ig', null)
    const next: number[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of (kapcs || []) as any[]) {
      const szuloId = k.id_szemely_1 as number
      if (!generationOf.has(szuloId)) {
        generationOf.set(szuloId, gen)
        next.push(szuloId)
      }
    }
    frontierUp = next
  }

  // 3. BFS lefelé gyermek-keresés
  let frontierDown: number[] = [...centerIds]
  for (let gen = 1; gen <= generationsDown; gen++) {
    if (frontierDown.length === 0) break
    const { data: kapcs } = await supabase
      .from('szemely_kapcsolat')
      .select('id_szemely_1, id_szemely_2')
      .eq('tipus', 'szulo_gyermek')
      .in('id_szemely_1', frontierDown)
      .is('ervenyes_ig', null)
    const next: number[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of (kapcs || []) as any[]) {
      const gyermekId = k.id_szemely_2 as number
      if (!generationOf.has(gyermekId)) {
        generationOf.set(gyermekId, gen)
        next.push(gyermekId)
      }
    }
    frontierDown = next
  }

  // 4. Házastársak — mindenki házastársát bevesszük (ugyanaz a generáció)
  const allIds = Array.from(generationOf.keys())
  if (allIds.length > 0) {
    // Két külön query-vel (Supabase `or` + `in` kombo nem mindig stabil)
    const [{ data: hazA }, { data: hazB }] = await Promise.all([
      supabase
        .from('szemely_kapcsolat')
        .select('id_szemely_1, id_szemely_2')
        .eq('tipus', 'hazastars')
        .in('id_szemely_1', allIds)
        .is('ervenyes_ig', null),
      supabase
        .from('szemely_kapcsolat')
        .select('id_szemely_1, id_szemely_2')
        .eq('tipus', 'hazastars')
        .in('id_szemely_2', allIds)
        .is('ervenyes_ig', null),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: { id_szemely_1: number; id_szemely_2: number }[] = [...((hazA || []) as any[]), ...((hazB || []) as any[])]
    for (const k of merged) {
      if (generationOf.has(k.id_szemely_1) && !generationOf.has(k.id_szemely_2)) {
        generationOf.set(k.id_szemely_2, generationOf.get(k.id_szemely_1)!)
      } else if (generationOf.has(k.id_szemely_2) && !generationOf.has(k.id_szemely_1)) {
        generationOf.set(k.id_szemely_1, generationOf.get(k.id_szemely_2)!)
      }
    }
  }

  // 5. Person-adatok lekérdezése
  const finalIds = Array.from(generationOf.keys())
  if (finalIds.length === 0) return { members: [], edges: [], centerIds }

  const { data: persons } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt')
    .in('id', finalIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: FamilyTreeMember[] = ((persons || []) as any[]).map((p) => ({
    id: p.id as number,
    csaladnev: (p.csaladnev as string | null) ?? '',
    k_nev: (p.k_nev as string | null) ?? '',
    ferfi: p.ferfi as boolean,
    sz_datum: (p.sz_datum as string | null) ?? null,
    meghalt: !!p.meghalt,
    generation: generationOf.get(p.id as number)!,
    isCenter: centerIds.includes(p.id as number),
  }))

  // 6. Edges — minden aktív kapcsolat a `members` halmazon belül
  const finalIdsSet = new Set(finalIds)
  const { data: allKapcs } = await supabase
    .from('szemely_kapcsolat')
    .select('id_szemely_1, id_szemely_2, tipus')
    .in('id_szemely_1', finalIds)
    .is('ervenyes_ig', null)

  const edges: FamilyTreeEdge[] = []
  const seenEdges = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (allKapcs || []) as any[]) {
    const a = k.id_szemely_1 as number
    const b = k.id_szemely_2 as number
    if (!finalIdsSet.has(a) || !finalIdsSet.has(b)) continue

    if (k.tipus === 'hazastars') {
      const key = `s:${Math.min(a, b)}-${Math.max(a, b)}`
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      edges.push({ type: 'spouse', from: a, to: b })
    } else if (k.tipus === 'szulo_gyermek') {
      const key = `pc:${a}-${b}`
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      edges.push({ type: 'parent-child', from: a, to: b })
    }
  }

  return { members, edges, centerIds }
}
