/**
 * Út-alapú rokonság-címkéző (2026-07-24, PR-5b F8.2 — D6 döntés).
 *
 * A korábbi címkézés KIZÁRÓLAG a generációs szintből számolt, ami hamis
 * címkéket adott az oldalágon: a nagybácsi „Apa", a sógor „Testvér", a vő
 * „Fiú" lett. Ez a modul a szülő-gyerek élekből a KLASSZIKUS rokonsági
 * koordinátát számolja: a center U lépést megy FEL a közös ősig, onnan D
 * lépést LE a rokonig → (U,D) párból + nemből adódik a magyar címke:
 *   (1,0)=Szülő, (2,0)=Nagyszülő, (3,0)=Dédszülő, (4,0)=Ükszülő, (5,0)=Szépszülő
 *   (0,1)=Gyermek, (0,2)=Unoka, (0,3)=Dédunoka
 *   (1,1)=Testvér, (2,1)=Nagybácsi/Nagynéni, (1,2)=Unokaöcs/Unokahúg
 *   (2,2)=Unokatestvér, (3,3)=Másod-unokatestvér …
 * Affinális (házassági) rokonság — D6 szerint KELL:
 *   center házastársának szülője = Após/Anyós, testvére = Sógor/Sógornő;
 *   vérrokon házastársa = Meny/Vő (gyermeké), Sógor/Sógornő (testvéré),
 *   egyébként „<címke> házastársa".
 *
 * PURE modul (nincs 'use server') — unit-tesztelhető, a builder hívja.
 */

export interface KinshipEdges {
  /** szulo_gyermek élek: parent → child */
  parentEdges: Array<{ parent: number; child: number }>
  /** hazastars élek (irányítatlan) */
  spouseEdges: Array<{ a: number; b: number }>
  /** Explicit nagyszulo_unoka élek (ahol a köztes szülő nincs a nyilvántartásban) */
  explicitGrand?: Array<{ ancestor: number; descendant: number }>
}

const MAX_ANCESTOR_DEPTH = 6

type Gender = boolean | null | undefined

function pick(gender: Gender, ferfi: string, no: string, semleges: string): string {
  if (gender === true) return ferfi
  if (gender === false) return no
  return semleges
}

/** Vérrokonsági címke az (u,d) koordinátából. null = nincs ismert magyar címke. */
export function bloodLabel(u: number, d: number, gender: Gender): string | null {
  if (u === 0 && d === 0) return null // ő maga
  if (d === 0) {
    switch (u) {
      case 1: return pick(gender, 'Apa', 'Anya', 'Szülő')
      case 2: return pick(gender, 'Nagyapa', 'Nagyanya', 'Nagyszülő')
      case 3: return pick(gender, 'Dédnagyapa', 'Dédnagyanya', 'Dédszülő')
      case 4: return pick(gender, 'Üknagyapa', 'Üknagyanya', 'Ükszülő')
      case 5: return pick(gender, 'Szépapa', 'Szépanya', 'Szépszülő')
      default: return 'Távoli ős'
    }
  }
  if (u === 0) {
    switch (d) {
      case 1: return pick(gender, 'Fia', 'Lánya', 'Gyermek')
      case 2: return pick(gender, 'Unoka (fiú)', 'Unoka (lány)', 'Unoka')
      case 3: return pick(gender, 'Dédunoka (fiú)', 'Dédunoka (lány)', 'Dédunoka')
      default: return 'Távoli leszármazott'
    }
  }
  if (u === 1 && d === 1) return pick(gender, 'Fiútestvér', 'Lánytestvér', 'Testvér')
  if (u === 2 && d === 1) return pick(gender, 'Nagybácsi', 'Nagynéni', 'Szülő testvére')
  if (u === 3 && d === 1) return pick(gender, 'Déd-nagybácsi', 'Déd-nagynéni', 'Nagyszülő testvére')
  if (u === 1 && d === 2) return pick(gender, 'Unokaöcs', 'Unokahúg', 'Testvér gyermeke')
  if (u === 1 && d === 3) return 'Testvér unokája'
  if (u === 2 && d === 2) return 'Unokatestvér'
  if (u === 2 && d === 3) return 'Unokatestvér gyermeke'
  if (u === 3 && d === 2) return 'Szülő unokatestvére'
  if (u === 3 && d === 3) return 'Másod-unokatestvér'
  return 'Távolabbi rokon'
}

/** Affinális címke a HÁZASTÁRS vérrokonának (u,d)-jéből (após/anyós/sógor…). */
function spouseSideLabel(u: number, d: number, gender: Gender): string | null {
  if (u === 0 && d === 0) return null // maga a házastárs — másutt címkézzük
  if (u === 1 && d === 0) return pick(gender, 'Após', 'Anyós', 'Házastárs szülője')
  if (u === 1 && d === 1) return pick(gender, 'Sógor', 'Sógornő', 'Házastárs testvére')
  const base = bloodLabel(u, d, gender)
  return base ? `${base} (házastárs ágán)` : null
}

/** Affinális címke egy VÉRROKON házastársának, a vérrokon (u,d)-je alapján.
 *  @param gender — a CÍMKÉZETT személy (a házastárs) neme
 *  @param bloodGender — a VÉRROKON neme (a generikus „X házastársa" alaphoz) */
function inLawOfBloodLabel(u: number, d: number, gender: Gender, bloodGender: Gender): string | null {
  if (u === 0 && d === 1) return pick(gender, 'Vő', 'Meny', 'Gyermek házastársa')
  if (u === 0 && d >= 2) return 'Unoka házastársa'
  if (u === 1 && d === 1) return pick(gender, 'Sógor', 'Sógornő', 'Testvér házastársa')
  if (u === 1 && d === 0) return pick(gender, 'Mostohaapa', 'Mostohaanya', 'Szülő házastársa')
  // Magyar szokás szerint a nagybácsi felesége is „nagynéni" (és fordítva)
  if (u === 2 && d === 1) return pick(gender, 'Nagybácsi (házasság révén)', 'Nagynéni (házasság révén)', 'Nagybácsi/nagynéni házastársa')
  const base = bloodLabel(u, d, bloodGender)
  return base ? `${base} házastársa` : null
}

/** Egy személy őseinek mélység-térképe (önmaga = 0). */
function ancestorDepths(
  id: number,
  parentsOf: Map<number, number[]>,
): Map<number, number> {
  const depths = new Map<number, number>([[id, 0]])
  let frontier = [id]
  for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH; depth += 1) {
    const next: number[] = []
    for (const person of frontier) {
      for (const parent of parentsOf.get(person) || []) {
        if (!depths.has(parent)) {
          depths.set(parent, depth)
          next.push(parent)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return depths
}

/**
 * Kiszámolja a fa MINDEN tagjára a centerhez viszonyított rokonsági címkét.
 * A visszaadott map-ből hiányzó személy: nincs levezethető kapcsolat
 * (a hívó adhat generikus címkét).
 */
export function computeKinshipLabels(params: {
  centerIds: number[]
  memberIds: number[]
  genderOf: Map<number, Gender>
  edges: KinshipEdges
}): Map<number, string> {
  const { centerIds, memberIds, genderOf, edges } = params
  const labels = new Map<number, string>()
  if (centerIds.length === 0) return labels

  const parentsOf = new Map<number, number[]>()
  for (const { parent, child } of edges.parentEdges) {
    const list = parentsOf.get(child) || []
    list.push(parent)
    parentsOf.set(child, list)
  }
  // Az explicit nagyszülő-él „virtuális" 2-lépéses szülő-láncként olvad be:
  // egy szintetikus (negatív id-jű) köztes csomóponton át, így az (u,d)
  // számítás magától helyes lesz (nagyszülő=2 fel).
  let syntheticId = -1
  for (const { ancestor, descendant } of edges.explicitGrand || []) {
    const mid = syntheticId
    syntheticId -= 1
    const childList = parentsOf.get(descendant) || []
    childList.push(mid)
    parentsOf.set(descendant, childList)
    parentsOf.set(mid, [...(parentsOf.get(mid) || []), ancestor])
  }

  const spouseOf = new Map<number, number[]>()
  for (const { a, b } of edges.spouseEdges) {
    spouseOf.set(a, [...(spouseOf.get(a) || []), b])
    spouseOf.set(b, [...(spouseOf.get(b) || []), a])
  }

  const centerSet = new Set(centerIds)
  const centerAncestors = centerIds.map((id) => ancestorDepths(id, parentsOf))

  /** Legjobb (legkisebb u+d) vérrokonsági koordináta a személyhez, vagy null. */
  function bloodCoord(personId: number): { u: number; d: number } | null {
    const personAncestors = ancestorDepths(personId, parentsOf)
    let best: { u: number; d: number } | null = null
    for (const centerAnc of centerAncestors) {
      for (const [ancestor, u] of centerAnc) {
        const d = personAncestors.get(ancestor)
        if (d === undefined) continue
        if (!best || u + d < best.u + best.d) best = { u, d }
      }
    }
    return best
  }

  const bloodCoords = new Map<number, { u: number; d: number }>()
  for (const id of memberIds) {
    if (centerSet.has(id)) continue
    const coord = bloodCoord(id)
    if (coord && !(coord.u === 0 && coord.d === 0)) bloodCoords.set(id, coord)
  }

  // 1) Vérrokonok
  for (const [id, { u, d }] of bloodCoords) {
    const label = bloodLabel(u, d, genderOf.get(id))
    if (label) labels.set(id, label)
  }

  // 2) A center házastársa(i)
  for (const centerId of centerIds) {
    for (const spouse of spouseOf.get(centerId) || []) {
      if (!centerSet.has(spouse) && !labels.has(spouse)) labels.set(spouse, 'Házastárs')
    }
  }

  // 3) A center házastársának vérrokonai (após/anyós/sógor…)
  const centerSpouses = centerIds.flatMap((id) => spouseOf.get(id) || []).filter((id) => !centerSet.has(id))
  if (centerSpouses.length > 0) {
    const spouseAncestors = centerSpouses.map((id) => ancestorDepths(id, parentsOf))
    for (const id of memberIds) {
      if (centerSet.has(id) || labels.has(id)) continue
      const personAncestors = ancestorDepths(id, parentsOf)
      let best: { u: number; d: number } | null = null
      for (const anc of spouseAncestors) {
        for (const [ancestor, u] of anc) {
          const d = personAncestors.get(ancestor)
          if (d === undefined) continue
          if (!best || u + d < best.u + best.d) best = { u, d }
        }
      }
      if (best) {
        const label = spouseSideLabel(best.u, best.d, genderOf.get(id))
        if (label) labels.set(id, label)
      }
    }
  }

  // 4) Vérrokonok házastársai (meny/vő/sógor/mostohaszülő…)
  for (const id of memberIds) {
    if (centerSet.has(id) || labels.has(id)) continue
    let best: { coord: { u: number; d: number }; bloodGender: Gender } | null = null
    for (const spouse of spouseOf.get(id) || []) {
      const coord = centerSet.has(spouse) ? { u: 0, d: 0 } : bloodCoords.get(spouse)
      if (!coord) continue
      if (coord.u === 0 && coord.d === 0) {
        // center házastársa — azt a 2) ág már címkézte volna; itt nem játszik
        continue
      }
      if (!best || coord.u + coord.d < best.coord.u + best.coord.d) {
        best = { coord, bloodGender: genderOf.get(spouse) }
      }
    }
    if (best) {
      const label = inLawOfBloodLabel(best.coord.u, best.coord.d, genderOf.get(id), best.bloodGender)
      if (label) labels.set(id, label)
    }
  }

  return labels
}
