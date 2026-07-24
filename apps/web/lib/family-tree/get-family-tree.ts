'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { computeKinshipLabels } from '@/lib/family-tree/kinship'
import type {
  FamilyTreeData,
  FamilyTreeEdge,
  FamilyTreeMember,
} from '@/lib/family-tree/types'

/**
 * 2026-06-02: Családfa modul.
 * A `szemely_kapcsolat` táblából építünk generációs gráfot egy kezdő-pont
 * (család vagy személy) köré: felfelé (ősök), lefelé (leszármazottak),
 * oldalágon (testvérek → nagybácsik → unokatestvérek), plusz mindenki
 * házastársa.
 *
 * 2026-07-24 (PR-5b, F8.1+F8.2 — D6 döntés) ÁTÍRVA:
 *  - HIBAPROPAGÁLÁS: minden lekérdezés hibája dob — eddig a `const { data }`
 *    minta minden hibát némán elnyelt, és a felület hamis „Nincs elegendő
 *    adat" üzenetet mutatott (ismert néma-üres hibaosztály).
 *  - TENANT-SZŰRÉS: minden kapcsolat/személy-lekérdezés congregation_id-ra
 *    szűrt — admin/esperes szerepnél az RLS role-bypass eddig idegen
 *    gyülekezetek sorait keverte a fába.
 *  - CHUNK: minden .in() lista 100-asával darabolt (URL-limit + a PostgREST
 *    1000-soros default plafon néma él-levágása ellen).
 *  - MÉLYSÉG: default 2→5 szint fel (szépszülőig) és 2→3 szint le (dédunokáig).
 *  - OLDALÁG: a korábbi testvér-pass iterációs sorrend-hibája miatt az
 *    unokatestvérek SOSEM kerültek be — most a legmélyebb őstől lefelé haladva
 *    kaszkádol az oldalági kibontás (nagybácsi → unokatestvér).
 *  - CÍMKÉK: út-alapú kinship-számítás (lib/family-tree/kinship.ts) — a
 *    nagybácsi többé nem „Apa", a vő nem „Fiú", a sógor nem „Testvér".
 *  - nagyszulo_unoka explicit élek beolvasztása (ahol a köztes szülő nincs
 *    a nyilvántartásban).
 *
 * Típusok: `@/lib/family-tree/types` — Next.js 16-on a 'use server' fájl
 * NEM exportálhat típust/interface-t (runtime hiba).
 */

/** Robbanás-védelem sűrűn összeházasodott (falusi) gyülekezetekre. */
const MAX_TREE_NODES = 400
const CHUNK_SIZE = 100

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

type KapcsRow = { id_szemely_1: number; id_szemely_2: number; tipus?: string }

/** Chunkolt, hibát DOBÓ szemely_kapcsolat-lekérdezés. */
async function fetchKapcs(
  supabase: Supa,
  congregationId: string,
  tipus: string,
  column: 'id_szemely_1' | 'id_szemely_2',
  ids: number[],
): Promise<KapcsRow[]> {
  const rows: KapcsRow[] = []
  for (const part of chunks(ids, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('szemely_kapcsolat')
      .select('id_szemely_1, id_szemely_2')
      .eq('congregation_id', congregationId)
      .eq('tipus', tipus)
      .in(column, part)
      .is('ervenyes_ig', null)
    if (error) throw new Error(`A családfa kapcsolat-lekérdezése sikertelen: ${error.message}`)
    rows.push(...((data || []) as KapcsRow[]))
  }
  return rows
}

async function buildTreeFromCenters(
  supabase: Supa,
  congregationId: string,
  centerIds: number[],
  generationsUp: number,
  generationsDown: number,
): Promise<FamilyTreeData> {
  if (centerIds.length === 0) return { members: [], edges: [], centerIds: [] }

  // visited: id → generation. A központok 0. szint.
  const generationOf = new Map<number, number>()
  for (const id of centerIds) generationOf.set(id, 0)
  const capReached = () => generationOf.size >= MAX_TREE_NODES

  // 1. BFS felfelé — ősök (szépszülőig)
  let frontierUp: number[] = [...centerIds]
  for (let gen = -1; gen >= -generationsUp; gen--) {
    if (frontierUp.length === 0 || capReached()) break
    const kapcs = await fetchKapcs(supabase, congregationId, 'szulo_gyermek', 'id_szemely_2', frontierUp)
    const next: number[] = []
    for (const k of kapcs) {
      const szuloId = k.id_szemely_1
      if (!generationOf.has(szuloId) && !capReached()) {
        generationOf.set(szuloId, gen)
        next.push(szuloId)
      }
    }
    frontierUp = next
  }

  // 2. BFS lefelé — leszármazottak (dédunokáig)
  let frontierDown: number[] = [...centerIds]
  for (let gen = 1; gen <= generationsDown; gen++) {
    if (frontierDown.length === 0 || capReached()) break
    const kapcs = await fetchKapcs(supabase, congregationId, 'szulo_gyermek', 'id_szemely_1', frontierDown)
    const next: number[] = []
    for (const k of kapcs) {
      const gyermekId = k.id_szemely_2
      if (!generationOf.has(gyermekId) && !capReached()) {
        generationOf.set(gyermekId, gen)
        next.push(gyermekId)
      }
    }
    frontierDown = next
  }

  // 2.5. OLDALÁGI kibontás — a LEGMÉLYEBB őstől lefelé haladva, hogy a
  // frissen felvett oldalági személyek (pl. nagybácsi) gyermekei
  // (unokatestvérek) is bekerüljenek. A korábbi -1-től induló sorrend miatt
  // az unokatestvérek szisztematikusan kimaradtak.
  for (let upGen = -generationsUp; upGen <= -1; upGen++) {
    if (capReached()) break
    const upPersons = Array.from(generationOf.entries())
      .filter(([, g]) => g === upGen)
      .map(([id]) => id)
    if (upPersons.length === 0) continue
    const kapcs = await fetchKapcs(supabase, congregationId, 'szulo_gyermek', 'id_szemely_1', upPersons)
    for (const k of kapcs) {
      const gyermekId = k.id_szemely_2
      if (!generationOf.has(gyermekId) && !capReached()) {
        generationOf.set(gyermekId, upGen + 1)
      }
    }
  }

  // 2.7. EXPLICIT nagyszülő-élek beolvasztása (csak a KÖZPONTOKHOZ horgonyozva
  // — így a rokonsági koordináta biztosan helyes): ahol a köztes szülő nincs
  // rögzítve, a nagyszülő/unoka e nélkül nem jelenne meg a fán, miközben a
  // galaxis-nézet mutatja (kettős igazságforrás volt).
  const explicitGrand: Array<{ ancestor: number; descendant: number }> = []
  {
    const [grandUp, grandDown] = await Promise.all([
      fetchKapcs(supabase, congregationId, 'nagyszulo_unoka', 'id_szemely_2', centerIds),
      fetchKapcs(supabase, congregationId, 'nagyszulo_unoka', 'id_szemely_1', centerIds),
    ])
    for (const k of grandUp) {
      // k.id_szemely_1 = nagyszülő, k.id_szemely_2 = központi unoka
      explicitGrand.push({ ancestor: k.id_szemely_1, descendant: k.id_szemely_2 })
      if (!generationOf.has(k.id_szemely_1) && !capReached()) generationOf.set(k.id_szemely_1, -2)
    }
    for (const k of grandDown) {
      // k.id_szemely_1 = központi nagyszülő, k.id_szemely_2 = unoka
      explicitGrand.push({ ancestor: k.id_szemely_1, descendant: k.id_szemely_2 })
      if (!generationOf.has(k.id_szemely_2) && !capReached()) generationOf.set(k.id_szemely_2, 2)
    }
  }

  // 3. Házastársak (ugyanaz a generáció)
  const allIds = Array.from(generationOf.keys())
  if (allIds.length > 0) {
    const [hazA, hazB] = await Promise.all([
      fetchKapcs(supabase, congregationId, 'hazastars', 'id_szemely_1', allIds),
      fetchKapcs(supabase, congregationId, 'hazastars', 'id_szemely_2', allIds),
    ])
    for (const k of [...hazA, ...hazB]) {
      if (capReached()) break
      if (generationOf.has(k.id_szemely_1) && !generationOf.has(k.id_szemely_2)) {
        generationOf.set(k.id_szemely_2, generationOf.get(k.id_szemely_1)!)
      } else if (generationOf.has(k.id_szemely_2) && !generationOf.has(k.id_szemely_1)) {
        generationOf.set(k.id_szemely_1, generationOf.get(k.id_szemely_2)!)
      }
    }
  }

  if (generationOf.size >= MAX_TREE_NODES) {
    console.warn(`[family-tree] Node-plafon (${MAX_TREE_NODES}) elérve — a fa csonkolt (congregation=${congregationId})`)
  }

  // 4. Person-adatok — chunkolt, tenant-szűrt, hibát dobó lekérdezés
  const collectedIds = Array.from(generationOf.keys())
  if (collectedIds.length === 0) return { members: [], edges: [], centerIds }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personsRaw: any[] = []
  for (const part of chunks(collectedIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, kep')
      .eq('congregation_id', congregationId)
      .in('id', part)
    if (error) throw new Error(`A családfa személy-lekérdezése sikertelen: ${error.message}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    personsRaw.push(...((data || []) as any[]))
  }

  // A tagok halmaza a TÉNYLEGESEN betöltött személyekből — más gyülekezetbe
  // tartozó (tenant-szűrőn fennakadt) végpontok élei is kimaradnak így.
  const finalIdsSet = new Set<number>(personsRaw.map((p) => p.id as number))
  const finalIds = Array.from(finalIdsSet)

  // 5. Élek — chunkolt lekérdezés (mindkét végpont a fában kell legyen)
  const allKapcs: KapcsRow[] = []
  for (const part of chunks(finalIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('szemely_kapcsolat')
      .select('id_szemely_1, id_szemely_2, tipus')
      .eq('congregation_id', congregationId)
      .in('id_szemely_1', part)
      .is('ervenyes_ig', null)
    if (error) throw new Error(`A családfa él-lekérdezése sikertelen: ${error.message}`)
    allKapcs.push(...((data || []) as KapcsRow[]))
  }

  const edges: FamilyTreeEdge[] = []
  const seenEdges = new Set<string>()
  const parentEdges: Array<{ parent: number; child: number }> = []
  const spouseEdges: Array<{ a: number; b: number }> = []
  for (const k of allKapcs) {
    const a = k.id_szemely_1
    const b = k.id_szemely_2
    if (!finalIdsSet.has(a) || !finalIdsSet.has(b)) continue

    if (k.tipus === 'hazastars') {
      const key = `s:${Math.min(a, b)}-${Math.max(a, b)}`
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      edges.push({ type: 'spouse', from: a, to: b })
      spouseEdges.push({ a, b })
    } else if (k.tipus === 'szulo_gyermek') {
      const key = `pc:${a}-${b}`
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      edges.push({ type: 'parent-child', from: a, to: b })
      parentEdges.push({ parent: a, child: b })
    }
  }

  // 6. Rokonsági címkék — út-alapú kinship-számítás (D6: affinális rokonokkal)
  const genderOf = new Map<number, boolean | null>()
  for (const p of personsRaw) genderOf.set(p.id as number, (p.ferfi as boolean | null) ?? null)
  const kinshipLabels = computeKinshipLabels({
    centerIds,
    memberIds: finalIds,
    genderOf,
    edges: {
      parentEdges,
      spouseEdges,
      explicitGrand: explicitGrand.filter(
        (g) => finalIdsSet.has(g.ancestor) && finalIdsSet.has(g.descendant),
      ),
    },
  })

  const centerIdSet = new Set(centerIds)
  const members: FamilyTreeMember[] = personsRaw.map((p) => {
    const id = p.id as number
    const gen = generationOf.get(id) ?? 0
    const isCenter = centerIdSet.has(id)
    // Ha az út-alapú számítás nem talált kapcsolatot (pl. házastárs
    // házastársán át került be), generikus címkét adunk — de SOHA nem hamisat.
    const roleLabel = isCenter ? null : kinshipLabels.get(id) ?? 'Rokon (házasság révén)'
    return {
      id,
      kep: (p.kep as string | null) ?? null,
      csaladnev: (p.csaladnev as string | null) ?? '',
      k_nev: (p.k_nev as string | null) ?? '',
      ferfi: p.ferfi as boolean,
      sz_datum: (p.sz_datum as string | null) ?? null,
      meghalt: !!p.meghalt,
      generation: gen,
      isCenter,
      roleLabel,
      telefon: (p.telefon as string | null) ?? null,
      foglalkozas: (p.foglalkozas as string | null) ?? null,
      vallas: (p.vallas as string | null) ?? null,
    }
  })

  return { members, edges, centerIds }
}

/**
 * Family-id alapú: a régi `csalad.id_ferfi + id_no` köré épít fát.
 * @param csaladId - a központi család id-je (régi csalad.id)
 * @param generationsUp - max szint felfelé (default 5 = szépszülők)
 * @param generationsDown - max szint lefelé (default 3 = dédunokák)
 */
export async function getFamilyTreeData(
  csaladId: number,
  generationsUp: number = 5,
  generationsDown: number = 3,
): Promise<FamilyTreeData> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { members: [], edges: [], centerIds: [] }

  const { data: csaladRow, error } = await supabase
    .from('csalad')
    .select('id_ferfi, id_no')
    .eq('id', csaladId)
    .single()
  if (error) throw new Error(`A család nem tölthető be: ${error.message}`)
  if (!csaladRow) return { members: [], edges: [], centerIds: [] }

  const centerIds = [csaladRow.id_ferfi, csaladRow.id_no].filter(
    (v): v is number => v != null,
  )
  return await buildTreeFromCenters(supabase, congregationId, centerIds, generationsUp, generationsDown)
}

/**
 * 2026-06-02: Member-id alapú — a megadott személy köré épít fát.
 * A régi `FamilyTreeDialog` (persons-tab) ezt használja, hogy egyetlen
 * tag köré rajzoljon. Ha a tagnak van háztartása, abból vesszük a férj+nő
 * párost mint központ (érdekes lateral nézet); egyébként SAJÁT magát.
 */
export async function getFamilyTreeDataByMemberId(
  memberId: number,
  generationsUp: number = 5,
  generationsDown: number = 3,
): Promise<FamilyTreeData> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { members: [], edges: [], centerIds: [] }

  // 1. Megkeresem a member aktív háztartását (legacy_csalad_id-val)
  const { data: tag, error: tagError } = await supabase
    .from('haztartas_tag')
    .select('haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
    .eq('id_szemely', memberId)
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .limit(1)
    .maybeSingle()
  if (tagError) throw new Error(`A háztartás-kapcsolat nem tölthető be: ${tagError.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasRaw = (tag as any)?.haztartas
  const haztartas = Array.isArray(haztartasRaw) ? haztartasRaw[0] : haztartasRaw
  const legacyCsaladId = haztartas?.legacy_csalad_id as number | null
  const haztartasAktiv = haztartas?.isaktiv === true && haztartas?.ervenyes_ig == null

  // 2. Ha van aktív háztartás → a házaspár köré építünk; egyébként saját maga köré
  if (legacyCsaladId && haztartasAktiv) {
    const { data: csaladRow, error: csaladError } = await supabase
      .from('csalad')
      .select('id_ferfi, id_no')
      .eq('id', legacyCsaladId)
      .maybeSingle()
    if (csaladError) throw new Error(`A család nem tölthető be: ${csaladError.message}`)
    if (csaladRow) {
      const centerIds = [csaladRow.id_ferfi, csaladRow.id_no].filter(
        (v): v is number => v != null,
      )
      if (centerIds.includes(memberId) || centerIds.length === 0) {
        return await buildTreeFromCenters(supabase, congregationId, centerIds, generationsUp, generationsDown)
      }
      // A member NEM szülő (pl. gyermek a háztartásban) — saját maga a központ.
    }
  }

  // 3. Fallback / member-center: csak a member köré
  return await buildTreeFromCenters(supabase, congregationId, [memberId], generationsUp, generationsDown)
}
