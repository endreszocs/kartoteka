export interface MissionLevel {
  name: string
  minPoints: number
  maxPoints: number
  accent: string
  description: string
}

export type MissionPointEvent =
  | 'otlet_bekuldve'
  | 'otlet_tovabbjutott'
  | 'otlet_megvalosult'
  | 'szavazat_adva'
  | 'csatlakozas'
  | 'hozzaszolas'
  | 'segedanyag_feltoltes'
  | 'ertekeles_adva'
  | 'feladat_teljesitve'

export interface MissionRewardOutcome {
  applied: boolean
  points: number
  totalPoints: number | null
  previousLevel: string | null
  newLevel: string | null
  newBadges: string[]
}

export interface MissionUserStats {
  user_id: string
  otletek_szama: number
  elfogadott_otletek: number
  megvalosult_otletek: number
  tamogatasok_adva: number
  hozzaszolasok_szama: number
  segedanyagok_feltoltve: number
  feladatok_teljesitve: number
  ertekelesek_adva: number
  osszpontszam: number
  szint: string
  frissitve: string | null
}

export const MISSION_LEVELS: MissionLevel[] = [
  {
    name: 'Újonc',
    minPoints: 0,
    maxPoints: 49,
    accent: 'from-slate-400 to-slate-500',
    description: 'Az első szolgálati gondolatok és megosztások ideje.',
  },
  {
    name: 'Szolgálattevő',
    minPoints: 50,
    maxPoints: 149,
    accent: 'from-sky-500 to-cyan-500',
    description: 'Már aktívan formálod a közös missziós teret.',
  },
  {
    name: 'Lelkes misszionárius',
    minPoints: 150,
    maxPoints: 349,
    accent: 'from-amber-500 to-orange-500',
    description: 'Látszik rajtad, hogy örömmel hozol új impulzusokat.',
  },
  {
    name: 'Tapasztalt munkatárs',
    minPoints: 350,
    maxPoints: 699,
    accent: 'from-fuchsia-500 to-rose-500',
    description: 'A közösség számít a meglátásaidra és a segítségedre.',
  },
  {
    name: 'Közösségépítő',
    minPoints: 700,
    maxPoints: 1199,
    accent: 'from-violet-500 to-indigo-500',
    description: 'Nemcsak ötletelsz, hanem másokat is bevonsz és bátorítasz.',
  },
  {
    name: 'Missziói bajnok',
    minPoints: 1200,
    maxPoints: 99999,
    accent: 'from-emerald-500 to-teal-500',
    description: 'A szolgálati közösség egyik meghatározó, példaadó alakja vagy.',
  },
]

export const MISSION_POINT_RULES: Record<
  MissionPointEvent,
  { points: number; statKey: keyof MissionUserStats | null }
> = {
  otlet_bekuldve: { points: 10, statKey: 'otletek_szama' },
  otlet_tovabbjutott: { points: 25, statKey: 'elfogadott_otletek' },
  otlet_megvalosult: { points: 50, statKey: 'megvalosult_otletek' },
  szavazat_adva: { points: 2, statKey: 'tamogatasok_adva' },
  csatlakozas: { points: 5, statKey: null },
  hozzaszolas: { points: 3, statKey: 'hozzaszolasok_szama' },
  segedanyag_feltoltes: { points: 8, statKey: 'segedanyagok_feltoltve' },
  ertekeles_adva: { points: 1, statKey: 'ertekelesek_adva' },
  feladat_teljesitve: { points: 10, statKey: 'feladatok_teljesitve' },
}

export function getMissionLevel(points: number) {
  const safePoints = Number.isFinite(points) ? points : 0
  return (
    [...MISSION_LEVELS].reverse().find((level) => safePoints >= level.minPoints) ||
    MISSION_LEVELS[0]
  )
}

export function getMissionNextLevel(points: number) {
  const current = getMissionLevel(points)
  const currentIndex = MISSION_LEVELS.findIndex((level) => level.name === current.name)
  return MISSION_LEVELS[currentIndex + 1] || null
}

export function getMissionProgress(points: number) {
  const current = getMissionLevel(points)
  const next = getMissionNextLevel(points)

  if (!next) {
    return {
      current,
      next: null,
      percent: 100,
      pointsIntoLevel: Math.max(points - current.minPoints, 0),
      levelSpan: current.maxPoints - current.minPoints,
    }
  }

  const levelSpan = Math.max(next.minPoints - current.minPoints, 1)
  const pointsIntoLevel = Math.max(points - current.minPoints, 0)

  return {
    current,
    next,
    percent: Math.max(0, Math.min(100, Math.round((pointsIntoLevel / levelSpan) * 100))),
    pointsIntoLevel,
    levelSpan,
  }
}
