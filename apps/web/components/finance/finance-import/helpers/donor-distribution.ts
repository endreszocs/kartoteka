/**
 * „1×/év" globális, constraint-propagált jelölt-hozzárendelés az ambiguous befizetőkre (B1).
 *
 * Felhasználói szabály: az egyházfenntartói járulékot egy személy ÉVENTE EGYSZER fizeti.
 * Ebből következik a record-linkage „one-to-one assignment" (Hungarian-algoritmus) elve:
 * egy tag legfeljebb EGY befizetéshez rendelhető, így ha egy jelöltet már „elhasználtunk",
 * a többi ambiguous befizetőnél kiesik a jelölt-listából. Ezzel a többi eset is egyértelművé
 * válhat (constraint propagation) → sokkal kevesebb kézi egyeztetés kell.
 *
 * Algoritmus:
 *   1. Összegyűjtjük az ambiguous (jelölt-listás) befizetőket.
 *   2. A LEGKEVÉSBÉ szabad (legkevesebb jelölt) befizetőt rendezzük előre — a legszűkebb
 *      választást oldjuk fel először (klasszikus constraint propagation).
 *   3. Mindegyikhez a legjobb MÉG SZABAD jelöltet választjuk (cím- és név-egyezés pontszám
 *      alapján), és „elhasználjuk" (used).
 *   4. Konfidencia: ha a feloldáskor csak EGY szabad jelölt maradt → biztos (confident).
 *      Ha több is volt → auto-javaslat (a UI „ellenőrizd"-del jelzi).
 *
 * Források (record linkage best practice):
 *   - https://textbook.coleridgeinitiative.org/chap-link.html (one-to-one, Hungarian-algoritmus)
 *   - https://www.dataiku.com/stories/blog/accelerating-entity-resolution (auto-accept + review)
 */

import type { DonorResolution } from '@/app/(dashboard)/penzugy/finance-import-types'
import { nameSimilarity } from '@/lib/import/jaro-winkler'

export interface DonorDistributionResult {
  /** donor.raw → javasolt szemely.id (string, a select value-ja). */
  selections: Record<string, string>
  /** Mely donor.raw-k kaptak AUTOMATIKUS hozzárendelést (a UI „ellenőrizd"-del jelzi). */
  autoSet: Set<string>
  /** Ezek BIZTOS feloldások (a constraint után egyetlen szabad jelölt maradt). */
  confidentSet: Set<string>
}

export interface DistributeOptions {
  /**
   * Mely donor.raw-k egyházfenntartás (101.01) — CSAK ezekre érvényes az „1×/év" kizárás.
   * Ha nincs megadva, minden ambiguous donort egyházfenntartásként kezelünk (visszafelé kompat).
   */
  egyhfRaws?: Set<string>
  /**
   * Már „elhasznált" tagok (pl. a már EGYÉRTELMŰEN feloldott egyházfenntartás-befizetők
   * személyei) — ezeket NEM osztjuk ki újabb egyházfenntartáshoz (z_j ≠ z_j' kényszer).
   */
  preTakenPersonIds?: Set<string>
}

function norm(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Egy jelölt pontszáma egy befizetőre: cím-egyezés (erős) + név-hasonlóság (gyenge). */
function scoreCandidate(
  donor: DonorResolution,
  candidate: NonNullable<DonorResolution['candidates']>[number],
): number {
  let score = 0
  const cim = norm(candidate.cim)
  const street = norm(donor.street)
  const house = (donor.houseNumber || '').trim().toLowerCase()

  if (cim && street && cim.includes(street)) score += 2
  if (cim && house && house !== '?' && house !== '0') {
    // házszám szó-határos egyezés a címben
    const re = new RegExp(`(?:^|\\D)${house.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\D|$)`)
    if (re.test(cim)) score += 1
  }
  // Keresztnév-hasonlóság (a családnév úgyis egyezik — ez különbözteti meg az azonos nevűeket)
  const donorName = `${donor.csaladnev ?? donor.husbandFamilyName ?? ''} ${donor.k_nev ?? ''}`
  const candName = `${candidate.csaladnev ?? ''} ${candidate.k_nev ?? ''}`
  score += nameSimilarity(donorName, candName) // 0..1
  return score
}

function pickBest(
  donor: DonorResolution,
  candidates: NonNullable<DonorResolution['candidates']>,
): NonNullable<DonorResolution['candidates']>[number] {
  let best = candidates[0]
  let bestScore = scoreCandidate(donor, best)
  for (let i = 1; i < candidates.length; i++) {
    const s = scoreCandidate(donor, candidates[i])
    if (s > bestScore) {
      bestScore = s
      best = candidates[i]
    }
  }
  return best
}

export function distributeAmbiguousDonors(
  resolutions: DonorResolution[],
  opts?: DistributeOptions,
): DonorDistributionResult {
  const selections: Record<string, string> = {}
  const autoSet = new Set<string>()
  const confidentSet = new Set<string>()

  // Csak az egyházfenntartás (101.01) donorokra érvényes az „1×/év" kizárás. Ha nincs
  // kategória-info, visszafelé-kompat módon mindet egyházfenntartásként kezeljük.
  const egyhfRaws = opts?.egyhfRaws
  const isEgyhf = (raw: string): boolean => !egyhfRaws || egyhfRaws.has(raw)

  const donors = resolutions.filter(
    (r) => r.status === 'ambiguous' && r.candidates && r.candidates.length > 0,
  )

  // Constraint propagation: a legszűkebb választást (legkevesebb jelölt) oldjuk fel előbb;
  // azonos jelöltszámnál a több előfordulású (fontosabb) befizető megy előre.
  const ordered = [...donors].sort(
    (a, b) =>
      (a.candidates!.length - b.candidates!.length) ||
      (b.occurrenceCount - a.occurrenceCount) ||
      a.raw.localeCompare(b.raw),
  )

  // A `used` halmaz az egyházfenntartáshoz MÁR hozzárendelt tagokat tartja — beleértve a
  // már egyértelműen feloldott (resolved) egyházfenntartás-befizetők személyeit is.
  const used = new Set<string>(opts?.preTakenPersonIds ?? [])

  for (const donor of ordered) {
    if (isEgyhf(donor.raw)) {
      // Egyházfenntartás: egy tag évente egyszer — csak SZABAD jelöltet osztunk ki.
      const avail = donor.candidates!.filter((c) => !used.has(c.id))
      if (avail.length === 0) continue // minden jelöltje elfogyott → genuin ütközés, marad kézi
      const best = pickBest(donor, avail)
      selections[donor.raw] = String(best.id)
      autoSet.add(donor.raw)
      used.add(best.id)
      if (avail.length === 1) confidentSet.add(donor.raw) // egyetlen szabad jelölt → biztos
    } else {
      // Adomány/egyéb: egy tag évente többször is adhat — NINCS kizárás.
      const best = pickBest(donor, donor.candidates!)
      selections[donor.raw] = String(best.id)
      autoSet.add(donor.raw)
    }
  }

  return { selections, autoSet, confidentSet }
}
