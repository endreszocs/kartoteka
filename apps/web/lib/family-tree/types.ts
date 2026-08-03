// 2026-06-02: Családfa modul közös típusai.
// Külön fájl, mert Next.js 16-on a `'use server'` fájlokon belüli type-export
// futási idejű hibát okoz — minden type erre a fájlra kerül, a server action
// csak async function-okat exportál.

export interface FamilyTreeMember {
  id: number
  csaladnev: string
  k_nev: string
  ferfi: boolean
  sz_datum: string | null
  meghalt: boolean
  /** -2 = nagyszülők, -1 = szülők, 0 = ego (központ), +1 = gyermekek, +2 = unokák */
  generation: number
  /** True ha az adott személy a központi férj vagy feleség. */
  isCenter: boolean
  /** 2026-06-12 (Endre): profilkép (Storage URL) — a fa-kártyán avatarként. */
  kep?: string | null
  /** 2026-06-02: kapcsolati szerepkör-címke a központhoz képest.
   *  Pl. "Apa", "Anya", "Testvér", "Nagyszülő", "Gyermek", "Unoka", "Házastárs".
   *  A kártyán jelenik meg — nem jelmagyarázat. NULL a központra. */
  roleLabel: string | null
  /** 2026-06-02: opcionális extra mezők — "Több info" toggle esetén jelennek meg. */
  telefon: string | null
  foglalkozas: string | null
  vallas: string | null
}

export interface FamilyTreeEdge {
  type: 'spouse' | 'parent-child'
  from: number
  to: number
  /** 2026-08-04 (PR-27): a pár-kapcsolat jellege (spouse élnél) */
  partnership?: 'hazastars' | 'elettars'
}

export interface FamilyTreeData {
  members: FamilyTreeMember[]
  edges: FamilyTreeEdge[]
  /** A központi férj+feleség id-jei (a sortolás miatt is hasznos a UI-nak) */
  centerIds: number[]
  /**
   * 2026-08-02 (PR-21): kereszthiba-üzenetek — ellentmondó rokonsági adatok
   * (két aktív házastárs-él, két „édesapa", évszám-képtelen szülő). A fa
   * ettől még kirajzolódik; a UI figyelmeztető sávban mutatja.
   */
  conflicts?: string[]
}
