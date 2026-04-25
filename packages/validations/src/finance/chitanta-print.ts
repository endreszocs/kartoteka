/**
 * ChitantaPrintData — a chitanța nyomtatási adatcsomag típusa. A-M7.2f (2026-04-23).
 *
 * Ez az objektum egyszerre tartalmaz:
 *   - a chitanța fő adatait (sorozat/szám, dátum, kliens, összeg, reprezentánd)
 *   - a gyülekezet-fejlécet (nev_hu, nev_ro, CIF, cím, telefon)
 *   - az egyházmegye + kerület hierarchiát (hu + ro)
 *   - a sztornózás adatait (ha sztornózott)
 *
 * A mezők `camelCase`-ben vannak (nem `snake_case`), mert ez a **print-layout**
 * típusa — direkt a React komponensbe megy, a DB-ről a core use-case konvertál.
 */

// ─────────────────────────────────────────────────────────────────────────
// Gyülekezet-fejléc (print-header)
// ─────────────────────────────────────────────────────────────────────────

export interface ChitantaPrintCongregation {
  nevHu: string
  nevRo: string | null
  /** CIF (cégadószám) — a DB-ben `congregations.adoszam`. */
  cif: string | null
  /** Utca + szám, pl. "str. Parohiei, nr. 214". */
  cim: string | null
  /** Falu / város (pl. "Brateș"). */
  varos: string | null
  /** Megye (pl. "Jud. Covasna"). */
  megye: string | null
  telefon: string | null
}

// ─────────────────────────────────────────────────────────────────────────
// ChitantaPrintData — a teljes nyomtatandó rekord
// ─────────────────────────────────────────────────────────────────────────

export interface ChitantaPrintData {
  id: string
  sorozat: string
  /** Backward-compat — az újabb nyugtáknál `szam === nyomdaiSzam`. */
  szam: number
  /** Kerületi nyomdai sorszám — a tömbből lefoglalva (pl. 115356). */
  nyomdaiSzam: number | null
  /** Gyülekezeti saját sorszám — év elején 1-től újraindul (pl. 356). */
  gyulekezetiSzam: number | null
  szamlaDatum: string
  klienessegNev: string
  klienessegCui: string | null
  klienessegCim: string | null
  klienessegNrOrcAn: string | null
  osszegBrut: number
  reprezentand: string | null
  /** A reprezentand román fordítása — `befizetescel.nevro`-ból. */
  reprezentandRo: string | null
  megjegyzes: string | null
  stornozott: boolean
  stornozottAt: string | null
  stornozottIndok: string | null
  gyulekezet: ChitantaPrintCongregation
  egyhazmegyeNevHu: string | null
  egyhazmegyeNevRo: string | null
  egyhazkeruletNevHu: string | null
  egyhazkeruletNevRo: string | null
}
