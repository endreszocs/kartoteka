/**
 * Bérleti szerződés és bérleti hátralék számítási logika.
 *
 * A logika a Vanilla JS forrás alapján készült:
 *   migration-docs/source-links/penzugy_tartozasok.js:304-399
 *   (_renderBerletTartozas függvény)
 *
 * 2026-07-10 (S4-#2 audit): a korábbi "duális párosítás" (két külön Map:
 * id_szemely ÉS berlo_nev szerint, majd MINDKETTŐ összege) DUPLÁN számolta
 * azt a befizetést, amely egyszerre illeszkedett személy-ID és név szerint
 * is — a `fizett` felfúvódott, a hátralék alábecsült lett. Javítva:
 * befizetésenként EGYSZER vizsgáljuk az illeszkedést (id_szemely VAGY név,
 * logikai VAGY), így egy befizetés egy szerződéshez legfeljebb egyszer
 * számít. A név-párosítás robusztusabb is lett: a `forrasa` "Név - utca"
 * formátumából a név-részt is figyeljük (splitForrasaNameStreet).
 */

import type { RentalContractRow, RentalDebtRow, RentalTipus } from './types'
// 2026-06-10: a `calculateEvesDij` a megosztott `helpers`-ből jön (azonos
// implementáció) — a korábbi lokális duplikátum eltávolítva a barrel-ütközés
// elkerüléséért (helpers.ts is exportálja).
// 2026-07-10 (S4-#2): + splitForrasaNameStreet a robusztusabb név-párosításhoz.
import { calculateEvesDij, splitForrasaNameStreet } from './helpers'

export interface RentalPaymentLike {
  id_szemely: number | null
  forrasa: string | null
  fizetettev: number | null
  osszeg: number
}

// ── Segédfüggvények ──────────────────────────────────────────

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseYear(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback
  const y = Number(String(iso).slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : fallback
}

function parseMonthIndex(iso: string | null | undefined): number {
  // 0-11 (január = 0). Ha parse nem sikerül, 0-t ad vissza (január).
  if (!iso) return 0
  const m = Number(String(iso).slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : 0
}

// ── Részarányos díj egy adott évre ───────────────────────────

/**
 * Részarányos (arányos) bérleti díj egy adott évre.
 *
 * Szabály: az adott évben AKTÍV hónapok száma alapján arányosítunk:
 * - Ha az év a szerződés kezdet/vége tartományán kívül esik → 0
 * - Ha az év TELJES évben lefedett → teljes éves díj (12/12)
 * - Ha az év a KEZDET éve → az aktív ablak a kezdő hónapnál indul
 * - Ha az év a VÉGE éve (és van vege) → az aktív ablak a záró hónapnál zárul
 * - Ha az év EGYSZERRE kezdet- és vége-év → a két ablak METSZETE számít
 *
 * Példa: 2025-05-15 — 2026-03-31 szerződés, éves díj 1200 RON:
 * - 2025: 8 hónap aktív (május-december) = 1200 * 8/12 = 800
 * - 2026: 3 hónap aktív (január-március) = 1200 * 3/12 = 300
 *
 * Példa (töredék-év, egyazon évben indul ÉS zárul):
 * 2025-05-01 — 2025-08-31, éves díj 1200 RON:
 * - 2025: 4 hónap aktív (május-augusztus) = 1200 * 4/12 = 400
 *
 * 2026-07-10 (S4-#2 audit): korábban a vége-évi ág FELÜLÍRTA a kezdet-évi
 * arányosítást — egy éven belül induló ÉS végződő szerződésnél a teljes
 * január→vége időszakot számolta (fenti példában 8/12 = 800), figyelmen
 * kívül hagyva a kezdő hónapot. Javítva: hónap-ablak metszet.
 */
export function calculateAranyosDij(contract: RentalContractRow, year: number): number {
  const evesDij = calculateEvesDij(contract)
  if (evesDij <= 0) return 0

  const szKezdetEv = parseYear(contract.kezdet, 9999)
  const szVegeEv = contract.vege ? parseYear(contract.vege, 9999) : 9999

  if (year < szKezdetEv || year > szVegeEv) return 0

  // Aktív hónap-ablak az adott éven belül (0=január … 11=december)
  const elsoAktivHonap = year === szKezdetEv ? parseMonthIndex(contract.kezdet) : 0
  const utolsoAktivHonap =
    year === szVegeEv && contract.vege ? parseMonthIndex(contract.vege) : 11

  // Hibás adat (vege < kezdet ugyanabban az évben) ellen védve: min. 0 hónap
  const aktivHonapok = Math.max(0, utolsoAktivHonap - elsoAktivHonap + 1)

  return (evesDij * aktivHonapok) / 12
}

// ── Bérleti hátralék számítás ────────────────────────────────

/**
 * Bérleti hátralék számítása egy szerződéshalmazra és a kapcsolódó
 * befizetésekre, egy év-intervallumra.
 *
 * Minden aktív (NEM törölt) szerződésre kiszámolja:
 * - `elvart`  — az évenként aránylagos elvárt díjak összege
 * - `fizett`  — a befizetett összeg az intervallumon belül
 * - `hatralek = max(0, elvart - fizett)`
 *
 * Párosítás (2026-07-10, S4-#2 audit — javítva): a befizetés akkor számít
 * ehhez a szerződéshez, ha:
 * - `befizetes.id_szemely === contract.id_szemely`, VAGY
 * - a `forrasa` (teljes VAGY a "Név - utca" formátum név-része, trim +
 *   case-insensitive) egyezik a `berlo_nev`-vel.
 * A feltételek logikai VAGY-gyal, befizetésenként EGYSZER értékelődnek ki —
 * a korábbi implementáció a személy-ID- és a név-egyezést KÜLÖN összegezte,
 * így az egyszerre mindkettőre illeszkedő befizetés duplán számolódott.
 *
 * Ismert korlát (nem javítható befizetés→szerződés link nélkül): ha ugyanannak
 * a bérlőnek TÖBB aktív szerződése van, ugyanaz a befizetés MINDKÉT szerződés
 * `fizett`-jébe beszámít — a bérlő-szintű összesítés viszont helyes marad.
 *
 * @param contracts  az összes aktív bérleti szerződés (nem törölt)
 * @param payments   az összes 104.04/104.05 kódú befizetés az adott évekre
 * @param yearFrom   kezdő év (inkluzív)
 * @param yearTo     záró év (inkluzív)
 */
export function calculateRentalDebts(
  contracts: RentalContractRow[],
  payments: RentalPaymentLike[],
  yearFrom: number,
  yearTo: number,
): RentalDebtRow[] {
  // 2026-07-10 (S4-#2): a befizetéseket előfeldolgozzuk — év-szűrés + normalizált
  // név-kulcsok (teljes forrasa ÉS a "Név - utca" név-része) egyszer számolódnak.
  const relevantPayments = payments
    .filter(p => p.fizetettev != null && p.fizetettev >= yearFrom && p.fizetettev <= yearTo)
    .map(p => {
      const forrasaKey = p.forrasa ? p.forrasa.trim().toLowerCase() : ''
      const nevReszKey = splitForrasaNameStreet(p.forrasa).namePart.toLowerCase()
      return {
        id_szemely: p.id_szemely,
        osszeg: toNum(p.osszeg),
        forrasaKey,
        nevReszKey,
      }
    })

  // Aktív szerződések szűrése (aktiv=true, deleted=false)
  const aktivContracts = contracts.filter(c => c.aktiv && !c.deleted)

  const result: RentalDebtRow[] = []

  for (const contract of aktivContracts) {
    let elvart = 0
    for (let ev = yearFrom; ev <= yearTo; ev++) {
      elvart += calculateAranyosDij(contract, ev)
    }

    const nevKey = contract.berlo_nev.trim().toLowerCase()

    // Befizetésenként EGYSZER döntünk az illeszkedésről (VAGY-feltétel) —
    // így nincs dupla számolás akkor sem, ha ID és név egyszerre egyezik.
    let fizett = 0
    for (const p of relevantPayments) {
      const idEgyezik =
        contract.id_szemely != null && p.id_szemely === contract.id_szemely
      const nevEgyezik =
        nevKey !== '' && (p.forrasaKey === nevKey || p.nevReszKey === nevKey)
      if (idEgyezik || nevEgyezik) fizett += p.osszeg
    }

    const hatralek = Math.max(0, elvart - fizett)

    result.push({
      contractId: contract.id,
      berlo_nev: contract.berlo_nev,
      leiras: contract.leiras,
      tipus: contract.tipus as RentalTipus,
      evesDij: calculateEvesDij(contract),
      fizett,
      hatralek,
    })
  }

  return result
}

// ── Aggregátor segéd ─────────────────────────────────────────

/**
 * Összegzi a hátralék-sorokat:
 * - `totalEvesDij` — az összes aktív szerződés éves díja
 * - `totalFizetett` — a vizsgált időszak összes bérleti befizetése
 * - `totalHatralek` — az összes szerződés hátralékának összege
 */
export function summarizeRentalDebts(rows: RentalDebtRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.totalEvesDij += r.evesDij
      acc.totalFizetett += r.fizett
      acc.totalHatralek += r.hatralek
      return acc
    },
    { totalEvesDij: 0, totalFizetett: 0, totalHatralek: 0 },
  )
}
