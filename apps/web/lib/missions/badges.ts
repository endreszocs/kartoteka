import type { MissionUserStats } from './gamification'

export const BADGE_UNLOCK_QUERY_PARAM = 'feloldas'

export const MISSION_BADGE_CODES = [
  'elso_otlet',
  'otletgyaros',
  'tamogato',
  'tamogato_bajnok',
  'kozossegi',
  'feltolto',
  'siker',
  'nagy_siker',
  'top_ertekelo',
  'hozzaszolo',
  'mentor',
  'megbizhato',
] as const

export type MissionBadgeCode = (typeof MISSION_BADGE_CODES)[number]
export type MissionBadgeState = 'locked' | 'earned' | 'new'

export interface MissionBadgeDefinition {
  code: MissionBadgeCode
  name: string
  description: string
  condition: string
  color: string
  enamel: string
  enamelDark: string
  sortOrder: number
  progress?: {
    stat: keyof MissionUserStats
    goal: number
    unit: string
  }
}
/**
 * A tizenkét éles adatbázis-jelvény kód-native vizuális szerződése.
 *
 * A kód és a név szándékosan nem a betöltött katalógusból érkezik: így egy
 * részleges vagy átmenetileg hibás seed sem rendezi át és nem nevezi át a
 * Jelvényszekrényt. Az elnyert állapot továbbra is az élő adatbázisból jön.
 */
export const MISSION_BADGES: readonly MissionBadgeDefinition[] = [
  {
    code: 'elso_otlet',
    name: 'Első Ötlet',
    description: 'Beküldted az első ötletedet!',
    condition: '1 ötlet beküldve',
    color: '#f59f00',
    enamel: '#c98412',
    enamelDark: '#8e5406',
    sortOrder: 1,
    progress: { stat: 'otletek_szama', goal: 1, unit: 'ötlet' },
  },
  {
    code: 'otletgyaros',
    name: 'Ötletgyáros',
    description: 'Kimeríthetetlen kreativitás — 5 ötlet beküldve!',
    condition: '5 ötlet beküldve',
    color: '#f59f00',
    enamel: '#b8730d',
    enamelDark: '#754300',
    sortOrder: 2,
    progress: { stat: 'otletek_szama', goal: 5, unit: 'ötlet' },
  },
  {
    code: 'tamogato',
    name: 'Lelkes Támogató',
    description: 'Aktívan támogatod mások ötleteit!',
    condition: '10 ötlet támogatva',
    color: '#2fb344',
    enamel: '#3e7b42',
    enamelDark: '#214f2c',
    sortOrder: 3,
    progress: { stat: 'tamogatasok_adva', goal: 10, unit: 'támogatás' },
  },
  {
    code: 'tamogato_bajnok',
    name: 'Támogató Bajnok',
    description: 'A közösség egyik legerősebb támasza!',
    condition: '25 ötlet támogatva',
    color: '#2fb344',
    enamel: '#2d7040',
    enamelDark: '#174329',
    sortOrder: 4,
    progress: { stat: 'tamogatasok_adva', goal: 25, unit: 'támogatás' },
  },
  {
    code: 'kozossegi',
    name: 'Közösségi Ember',
    description: 'Aktívan részt veszel a közös munkában!',
    condition: '3 projekthez csatlakozott',
    color: '#206bc4',
    enamel: '#28669a',
    enamelDark: '#173e69',
    sortOrder: 5,
  },
  {
    code: 'feltolto',
    name: 'Segédanyag Feltöltő',
    description: 'Értékes anyagokkal gazdagítod a közösséget!',
    condition: '5 segédanyag feltöltve',
    color: '#0ca678',
    enamel: '#238271',
    enamelDark: '#125346',
    sortOrder: 6,
    progress: { stat: 'segedanyagok_feltoltve', goal: 5, unit: 'segédanyag' },
  },
  {
    code: 'siker',
    name: 'Siker-kő',
    description: 'Az első ötleted megvalósult!',
    condition: '1 ötlet megvalósult',
    color: '#f59f00',
    enamel: '#ad701b',
    enamelDark: '#71440a',
    sortOrder: 7,
    progress: { stat: 'megvalosult_otletek', goal: 1, unit: 'megvalósult ötlet' },
  },
  {
    code: 'nagy_siker',
    name: 'Nagy Siker',
    description: 'Három ötleted is megvalósult — igazi vezető vagy!',
    condition: '3 ötlet megvalósult',
    color: '#d63939',
    enamel: '#a93d2e',
    enamelDark: '#6c241c',
    sortOrder: 8,
    progress: { stat: 'megvalosult_otletek', goal: 3, unit: 'megvalósult ötlet' },
  },
  {
    code: 'top_ertekelo',
    name: 'Top Értékelő',
    description: 'Visszajelzéseid segítik a közösséget fejlődni!',
    condition: '20 segédanyag értékelve',
    color: '#f59f00',
    enamel: '#b37a20',
    enamelDark: '#76500f',
    sortOrder: 9,
    progress: { stat: 'ertekelesek_adva', goal: 20, unit: 'értékelés' },
  },
  {
    code: 'hozzaszolo',
    name: 'Hozzászóló-király',
    description: 'Aktívan részt veszel a párbeszédben!',
    condition: '50 hozzászólás összesen',
    color: '#ae3ec9',
    enamel: '#8c4c86',
    enamelDark: '#582850',
    sortOrder: 10,
    progress: { stat: 'hozzaszolasok_szama', goal: 50, unit: 'hozzászólás' },
  },
  {
    code: 'mentor',
    name: 'Mentor',
    description: 'Megbízható munkatárs — 10 feladat teljesítve!',
    condition: '10 feladat teljesítve',
    color: '#4263eb',
    enamel: '#315f91',
    enamelDark: '#1b3b66',
    sortOrder: 11,
    progress: { stat: 'feladatok_teljesitve', goal: 10, unit: 'feladat' },
  },
  {
    code: 'megbizhato',
    name: 'Megbízható',
    description: 'Minden feladatot időben teljesítettél!',
    condition: 'Minden feladat időben teljesítve 3 projektben',
    color: '#2fb344',
    enamel: '#34744a',
    enamelDark: '#1d472d',
    sortOrder: 12,
  },
] as const

const MISSION_BADGE_CODE_SET = new Set<string>(MISSION_BADGE_CODES)

export function isMissionBadgeCode(value: unknown): value is MissionBadgeCode {
  return typeof value === 'string' && MISSION_BADGE_CODE_SET.has(value)
}

export function getMissionBadge(code: MissionBadgeCode) {
  return MISSION_BADGES.find((badge) => badge.code === code)!
}
