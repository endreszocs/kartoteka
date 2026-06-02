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
}

export interface FamilyTreeEdge {
  type: 'spouse' | 'parent-child'
  from: number
  to: number
}

export interface FamilyTreeData {
  members: FamilyTreeMember[]
  edges: FamilyTreeEdge[]
  /** A központi férj+feleség id-jei (a sortolás miatt is hasznos a UI-nak) */
  centerIds: number[]
}
