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
 * egy adott kezdő-pont (család vagy egyetlen személy) köré. A központ
 * körül felfelé (szülő-keresés) és lefelé (gyermek-keresés) is BFS-eljük
 * a kapcsolatokat. Mindenkinek a házastársa is bekerül.
 *
 * Típusok: `@/lib/family-tree/types` — Next.js 16-on a 'use server' fájl
 * NEM exportálhat típust/interface-t (runtime hiba).
 */

/**
 * Belső helper — a megadott centerIds köré épít fát.
 * NEM exportált. A két public action (getFamilyTreeData és
 * getFamilyTreeDataByMemberId) ezt hívja közös magnak.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildTreeFromCenters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  centerIds: number[],
  generationsUp: number,
  generationsDown: number,
): Promise<FamilyTreeData> {
  if (centerIds.length === 0) return { members: [], edges: [], centerIds: [] }

  // visited: id → generation. A központok 0. szint.
  const generationOf = new Map<number, number>()
  for (const id of centerIds) generationOf.set(id, 0)

  // 1. BFS felfelé szülő-keresés
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

  // 2. BFS lefelé gyermek-keresés
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

  // 2.5. TESTVÉR-bevétel: a szülők (-1 szint) MINDEN gyermekét lekérdezzük
  // — így a center testvérei (akik a centerrel közös szülő alatt vannak)
  // is bekerülnek 0-szintre. Hasonlóan a -2 szint MINDEN gyermeke -1-szintű
  // (= nagybácsi/néni), és így tovább.
  for (let upGen = -1; upGen >= -generationsUp; upGen--) {
    const upPersons = Array.from(generationOf.entries())
      .filter(([, g]) => g === upGen)
      .map(([id]) => id)
    if (upPersons.length === 0) continue
    const { data: kapcs } = await supabase
      .from('szemely_kapcsolat')
      .select('id_szemely_1, id_szemely_2')
      .eq('tipus', 'szulo_gyermek')
      .in('id_szemely_1', upPersons)
      .is('ervenyes_ig', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of (kapcs || []) as any[]) {
      const gyermekId = k.id_szemely_2 as number
      const targetGen = upGen + 1
      if (!generationOf.has(gyermekId)) {
        generationOf.set(gyermekId, targetGen)
      }
    }
  }

  // 3. Házastársak (ugyanaz a generáció)
  const allIds = Array.from(generationOf.keys())
  if (allIds.length > 0) {
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

  // 4. Person-adatok — bővítve a "több info" toggle-hoz
  const finalIds = Array.from(generationOf.keys())
  if (finalIds.length === 0) return { members: [], edges: [], centerIds }

  const { data: persons } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas')
    .in('id', finalIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personsRaw = (persons || []) as any[]

  // 2026-06-02: role-label számítás (szülő/testvér/nagyszülő...)
  // A központhoz képest a kapcsolat típusát levezetjük a generációs szintből
  // és a nemből. Egyszerű approach — közeli rokonokra pontos, távolira általános.
  const rolesByDistance: { [gen: number]: { ferfi: string; no: string; semleges: string } } = {
    [-3]: { ferfi: 'Dédnagyapa', no: 'Dédnagyanya', semleges: 'Dédnagyszülő' },
    [-2]: { ferfi: 'Nagyapa', no: 'Nagyanya', semleges: 'Nagyszülő' },
    [-1]: { ferfi: 'Apa', no: 'Anya', semleges: 'Szülő' },
    [1]: { ferfi: 'Fiú', no: 'Lánya', semleges: 'Gyermek' },
    [2]: { ferfi: 'Unoka (fiú)', no: 'Unoka (lány)', semleges: 'Unoka' },
    [3]: { ferfi: 'Dédunoka (fiú)', no: 'Dédunoka (lány)', semleges: 'Dédunoka' },
  }
  // 0-szint nem-center: testvér vagy házastárs — az edges-ből nézzük meg

  // members: id → person + generation
  const generationByPersonId = new Map<number, number>()
  for (const p of personsRaw) generationByPersonId.set(p.id as number, generationOf.get(p.id as number)!)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: FamilyTreeMember[] = personsRaw.map((p) => {
    const gen = generationOf.get(p.id as number)!
    const isCenter = centerIds.includes(p.id as number)
    let roleLabel: string | null = null
    if (!isCenter) {
      if (gen !== 0 && rolesByDistance[gen]) {
        const r = rolesByDistance[gen]
        roleLabel = p.ferfi === true ? r.ferfi : p.ferfi === false ? r.no : r.semleges
      } else if (gen === 0) {
        // A spouse/testver megkülönböztetést a `centerIds`-szel csekkoljuk:
        // - házastárs: a központok valamelyikével direkt hazastars-kapcsolata van
        // - testvér: a központtal közös szülő (= a saját szülő-kapcsolatok generációja -1)
        // Egyszerűbb: a központ házastársa = "Házastárs", egyébként "Testvér".
        // A pontos hovatartozás (test/féltest stb.) későbbi finomítás.
        roleLabel = 'Testvér'
      }
    }
    return {
      id: p.id as number,
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

  // 5. Edges
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

  // Role-label finomítás: a központ HÁZASTÁRSAIT a "Testvér" helyett
  // "Házastárs"-nak címkézzük. Az edges-ből most már látjuk.
  const centerIdSet = new Set(centerIds)
  const spouseOfCenter = new Set<number>()
  for (const e of edges) {
    if (e.type === 'spouse') {
      if (centerIdSet.has(e.from) && !centerIdSet.has(e.to)) spouseOfCenter.add(e.to)
      if (centerIdSet.has(e.to) && !centerIdSet.has(e.from)) spouseOfCenter.add(e.from)
    }
  }
  // Update members
  for (const m of members) {
    if (m.generation === 0 && !m.isCenter && spouseOfCenter.has(m.id)) {
      m.roleLabel = 'Házastárs'
    }
  }

  return { members, edges, centerIds }
}

/**
 * Family-id alapú: a régi `csalad.id_ferfi + id_no` köré épít fát.
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

  const { data: csaladRow } = await supabase
    .from('csalad')
    .select('id_ferfi, id_no')
    .eq('id', csaladId)
    .single()
  if (!csaladRow) return { members: [], edges: [], centerIds: [] }

  const centerIds = [csaladRow.id_ferfi, csaladRow.id_no].filter(
    (v): v is number => v != null,
  )
  return await buildTreeFromCenters(supabase, centerIds, generationsUp, generationsDown)
}

/**
 * 2026-06-02: Member-id alapú — a megadott személy köré épít fát.
 * A régi `FamilyTreeDialog` (persons-tab) ezt használja, hogy egyetlen
 * tag köré rajzoljon. Ha a tagnak van háztartása, abból vesszük a férj+nő
 * párost mint központ (érdekes lateral nézet); egyébként SAJÁT magát.
 */
export async function getFamilyTreeDataByMemberId(
  memberId: number,
  generationsUp: number = 2,
  generationsDown: number = 2,
): Promise<FamilyTreeData> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { members: [], edges: [], centerIds: [] }

  // 1. Megkeresem a member aktív háztartását (legacy_csalad_id-val)
  const { data: tag } = await supabase
    .from('haztartas_tag')
    .select('haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
    .eq('id_szemely', memberId)
    .is('ervenyes_ig', null)
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasRaw = (tag as any)?.haztartas
  const haztartas = Array.isArray(haztartasRaw) ? haztartasRaw[0] : haztartasRaw
  const legacyCsaladId = haztartas?.legacy_csalad_id as number | null
  const haztartasAktiv = haztartas?.isaktiv === true && haztartas?.ervenyes_ig == null

  // 2. Ha van aktív háztartás → a házaspár köré építünk; egyébként saját maga köré
  if (legacyCsaladId && haztartasAktiv) {
    const { data: csaladRow } = await supabase
      .from('csalad')
      .select('id_ferfi, id_no')
      .eq('id', legacyCsaladId)
      .maybeSingle()
    if (csaladRow) {
      const centerIds = [csaladRow.id_ferfi, csaladRow.id_no].filter(
        (v): v is number => v != null,
      )
      // Ha a member nem a férj/feleség (pl. gyermek), akkor a saját kapcsolata
      // megfelelőbb központ. De a 0-szintű "központ" háromfelé úszik így is.
      // A `isCenter` mező a két szülőre lesz true — a member kiemelése a UI-on
      // történjen a saját megnyitása alapján.
      if (centerIds.includes(memberId) || centerIds.length === 0) {
        return await buildTreeFromCenters(supabase, centerIds, generationsUp, generationsDown)
      }
      // A member NEM szülő (pl. gyermek a háztartásban) — a saját generációja
      // 0 legyen, a szülei -1, a sajat gyermekei +1. Tehát a member-t mint
      // CENTER tegyük.
    }
  }

  // 3. Fallback / member-center: csak a member köré
  return await buildTreeFromCenters(supabase, [memberId], generationsUp, generationsDown)
}
