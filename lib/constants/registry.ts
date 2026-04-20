// ── Anyakönyvi fül típusok ────────────────────────────────────

export const REGISTRY_TABS = [
  'attekinto', 'keresztseg', 'konfirmalas', 'hazassag', 'temetes',
  'bekoltozott', 'elkoltozott', 'attert', 'kitert',
] as const

export type RegistryTab = typeof REGISTRY_TABS[number]

export const REGISTRY_TAB_LABELS: Record<RegistryTab, string> = {
  attekinto: 'Áttekintő',
  keresztseg: 'Kereszteltek',
  konfirmalas: 'Konfirmáltak',
  hazassag: 'Házasultak',
  temetes: 'Eltemetettek',
  bekoltozott: 'Beköltözött',
  elkoltozott: 'Elköltözött',
  attert: 'Áttért',
  kitert: 'Kitért',
}

// ── Dinamikus gomb konfig (fülönként) ────────────────────────

export const REGISTRY_BUTTON_CONFIG: Record<string, { label: string; color: string }> = {
  keresztseg: { label: 'Keresztelés rögzítése', color: 'bg-blue-600 hover:bg-blue-700' },
  konfirmalas: { label: 'Konfirmandusok rögzítése', color: 'bg-purple-600 hover:bg-purple-700' },
  hazassag: { label: 'Házasságkötés rögzítése', color: 'bg-orange-600 hover:bg-orange-700' },
  temetes: { label: 'Haláleset rögzítése', color: 'bg-gray-700 hover:bg-gray-800' },
  bekoltozott: { label: 'Beköltözés rögzítése', color: 'bg-teal-600 hover:bg-teal-700' },
  elkoltozott: { label: 'Elköltözés rögzítése', color: 'bg-slate-600 hover:bg-slate-700' },
  attert: { label: 'Áttérés rögzítése', color: 'bg-emerald-600 hover:bg-emerald-700' },
  kitert: { label: 'Kitérés rögzítése', color: 'bg-amber-600 hover:bg-amber-700' },
}

// ── Tagmozgás típusok ────────────────────────────────────────

export const MOVEMENT_TYPES = ['bekoltozott', 'elkoltozott', 'attert', 'kitert'] as const
export type MovementType = typeof MOVEMENT_TYPES[number]

// ── Közös anyakönyvi bejegyzés típus ─────────────────────────

export interface RegistryEntry {
  id: number
  datum?: string
  mikor?: string
  hdatum?: string
  tdatum?: string
  okirat?: string
  lelkeszneve?: string
  megjegyzes?: string
  // Személy JOIN
  szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null } | null
  // Házasság: két személy
  ferfi?: { id: number; csaladnev: string; k_nev: string } | null
  no?: { id: number; csaladnev: string; k_nev: string } | null
  // Egyéb
  tanuk?: string
  hoka?: string
  felekezet?: string
  igazolas?: string
  kulfoldre?: boolean
  adrlocality?: { name: string } | null
  [key: string]: unknown
}
