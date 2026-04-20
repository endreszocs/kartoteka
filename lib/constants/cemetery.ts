export const PLOT_STATUSES = ['szabad', 'foglalt', 'lejart', 'zart', 'fenntartott'] as const
export type PlotStatus = typeof PLOT_STATUSES[number]

export const PLOT_STATUS_LABELS: Record<PlotStatus, string> = {
  szabad: 'Szabad', foglalt: 'Foglalt', lejart: 'Lejárt', zart: 'Zárt', fenntartott: 'Fenntartott',
}

export const PLOT_STATUS_COLORS: Record<PlotStatus, string> = {
  szabad: 'bg-green-100 text-green-700', foglalt: 'bg-blue-100 text-blue-700',
  lejart: 'bg-red-100 text-red-700', zart: 'bg-gray-200 text-gray-700',
  fenntartott: 'bg-amber-100 text-amber-700',
}

// FONTOS: az oszlopnevek a valódi DB séma (Database_schema.sql) szerintiek.
// A korábbi camelCase/underscore-keverék (temeto_id, sirhely_id, berlo_nev,
// kezdet, veg, helyszin, hely, szuletett, elhunyt, temetes) helyett az igazi
// PostgreSQL oszlopnevek: temetoid, sirhelyid, berlo, megvaltas, lejarata,
// cim, szam, sz_datum, hdatum, tdatum/temetesid.

export interface Cemetery {
  id: number
  nev: string
  cim: string | null
  megjegyzes: string | null
  aktiv: boolean
  deleted: boolean
}

export interface Plot {
  id: number
  temetoid: number
  parcella: string
  sor: number
  szam: string
  elhelyezkedes: string | null
  meret: string | null
  tipus: string | null
  allapot: string
  megjegyzes: string | null
  aktivberlesid: number | null
  imagelnk: string | null
  gps_lat: number | null
  gps_lng: number | null
  deleted: boolean
}

export interface Rental {
  id: number
  sirhelyid: number
  befizetesid: number | null
  berlo: string | null
  berloid: number | null
  berlocim: string | null
  berloelerhetoseg: string | null
  megvaltas: string
  lejarata: string | null
  tipus: string // 'berles' | 'megvaltas'
  osszeg: number | null
  megjegyzes: string | null
  deleted: boolean
}

export interface Deceased {
  id: number
  sirhelyid: number
  temetesid: number | null
  nev: string | null
  sznev: string | null
  ferfi: boolean | null
  sz_datum: string | null
  sz_hely: string | null
  anyjaneve: string | null
  hdatum: string | null
  hhely: string | null
  tdatum: string | null
  ttipus: string | null
  tmodja: string | null
  elhelyezkedes: string | null
  temetteto: string | null
  szolgaltato: string | null
  megjegyzes: string | null
  deleted: boolean
}
