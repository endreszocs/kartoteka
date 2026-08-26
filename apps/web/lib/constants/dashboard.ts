// ── Magyar hónapok és napok ──────────────────────────────────

export const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
] as const

export const HU_MONTHS_SHORT = [
  'Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún',
  'Júl', 'Aug', 'Sze', 'Okt', 'Nov', 'Dec',
] as const

export const HU_DAYS = [
  'vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat',
] as const

export const HU_DAYS_SHORT = [
  'vas', 'hét', 'kedd', 'szer', 'csüt', 'pén', 'szom',
] as const

export const CAL_DAYS_HU = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'] as const

// ── Program típusok (16 db) ──────────────────────────────────

export const PROGRAM_TYPES = [
  'istentisztelet', 'bibliaora', 'imaora', 'ifjusagi', 'gyerekprogram',
  'konferencia', 'hangverseny', 'kozossegi', 'presbiteri', 'latogatas',
  'unnep', 'tabor', 'evangelizacio', 'diakoniai', 'noszovetseg', 'egyeb',
] as const

export type ProgramTipus = typeof PROGRAM_TYPES[number]

export const PROG_TIPUS_EMOJI: Record<ProgramTipus, string> = {
  istentisztelet: '⛪', bibliaora: '📖', imaora: '🙏', ifjusagi: '🎯',
  gyerekprogram: '🧒', konferencia: '🎤', hangverseny: '🎵', kozossegi: '🤝',
  presbiteri: '📋', latogatas: '🏠', unnep: '🎄', tabor: '⛺',
  evangelizacio: '📣', diakoniai: '❤️', noszovetseg: '🌸', egyeb: '📌',
}

export const PROG_TIPUS_LABELS: Record<ProgramTipus, string> = {
  istentisztelet: 'Istentisztelet', bibliaora: 'Bibliaóra', imaora: 'Imaóra',
  ifjusagi: 'Ifjúsági', gyerekprogram: 'Gyerekprogram', konferencia: 'Konferencia',
  hangverseny: 'Hangverseny', kozossegi: 'Közösségi', presbiteri: 'Presbiteri',
  latogatas: 'Látogatás', unnep: 'Ünnep', tabor: 'Tábor',
  evangelizacio: 'Evangélizáció', diakoniai: 'Diakónia', noszovetseg: 'Nőszövetség',
  egyeb: 'Egyéb',
}

export const PROG_TIPUS_COLOR: Record<ProgramTipus, string> = {
  istentisztelet: '#3b82f6', bibliaora: '#f59e0b', imaora: '#8b5cf6', ifjusagi: '#ec4899',
  gyerekprogram: '#14b8a6', konferencia: '#ef4444', hangverseny: '#6366f1', kozossegi: '#10b981',
  presbiteri: '#6b7280', latogatas: '#f97316', unnep: '#eab308', tabor: '#22c55e',
  evangelizacio: '#d946ef', diakoniai: '#f43f5e', noszovetseg: '#ec4899', egyeb: '#94a3b8',
}

// ── Program prioritások ──────────────────────────────────────

export const PROGRAM_PRIORITIES = ['alacsony', 'normal', 'fontos', 'kiemelt'] as const
export type ProgramPrioritas = typeof PROGRAM_PRIORITIES[number]

export const PROG_PRIORITAS_LABELS: Record<ProgramPrioritas, string> = {
  alacsony: 'Alacsony', normal: 'Normál', fontos: 'Fontos', kiemelt: 'Kiemelt',
}

// ── Ismétlődés típusok ───────────────────────────────────────

// 2026-08-26 (5. kör): + 'evi' — az évente visszatérő gyülekezeti alkalom
// (búcsú, hálaadás, VBH) eddig nem volt modellezhető ismétlődésként.
export const ISMETLODES_TYPES = ['heti', 'ketheti', 'havi', 'evi'] as const
export type IsmetlodesTipus = typeof ISMETLODES_TYPES[number]

export const ISMETLODES_LABELS: Record<IsmetlodesTipus, string> = {
  heti: 'Heti', ketheti: 'Kétheti', havi: 'Havi', evi: 'Évente',
}

// ── Emoji picker lista (64 elem) ─────────────────────────────

export const EMOJI_LIST = [
  '⛪','✝️','🙏','📖','🕊️','🔔','💒','🕯️',
  '🎤','🎵','🎶','🎭','🎪','🏕️','⛺','🎓',
  '👥','👨‍👩‍👧‍👦','👶','🧒','👨‍🏫','🤝','💪','❤️',
  '⚠️','🔴','🟢','🔵','⭐','🌟','💡','🔥',
  '📅','📆','🗓️','⏰','🕐','📋','📝','✏️',
  '🏠','🏛️','🚌','🚗','✈️','🌍','📍','🗺️',
  '🍞','🍷','☕','🎂','🎁','🎄','🎊','🎉',
  '🌸','🌻','🍂','❄️','☀️','🌙','⛰️','🌊',
]

// ── Friss bejegyzések típus-színek ───────────────────────────

export const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  istentisztelet: 'bg-blue-100 text-blue-700',
  temetés: 'bg-gray-200 text-gray-700',
  konfirmáció: 'bg-purple-100 text-purple-700',
  esküvő: 'bg-pink-100 text-pink-700',
  keresztelő: 'bg-teal-100 text-teal-700',
  presbiteri: 'bg-amber-100 text-amber-700',
}

// ── Program típus segédfüggvények ────────────────────────────

export interface Program {
  id: string
  cim: string
  datum: string
  datum_vege: string | null
  ido_kezdes: string | null
  ido_befejezes: string | null
  helyszin: string | null
  tipus: ProgramTipus
  prioritas: ProgramPrioritas
  ismetlodes_tipus: string | null
  /** 2026-08-26 (5. kör): a sorozat utolsó napja — e nélkül a heti bibliaóra
   *  „örökre futott". NULL = nincs megadva (a régi viselkedés). */
  ismetlodes_vege?: string | null
  /** 2026-08-26 (5. kör): megjelenhet a gyülekezet nyilvános weboldalán. */
  publikus?: boolean | null
  egyedi_tipus_nev: string | null
  egyedi_emoji: string | null
  /**
   * A LÁTOGATÓNAK szánt ismertető — ez jelenik meg a gyülekezet nyilvános
   * weboldalán, ha a program `publikus`.
   *
   * ⚠️ 2026-08-27: az oszlop a kezdetektől létezik az adatbázisban, de a WEBES
   * felület soha nem írta (csak az asztali alkalmazás) — se a típusban, se a
   * séma-ellenőrzésben, se a mentésben nem szerepelt. Emiatt a nyilvános
   * naptár „leírással együtt" kérése némán ÜRES maradt volna: a mező, amit
   * publikálunk, kitölthetetlen volt.
   */
  leiras?: string | null
  /** BELSŐ jegyzet — SOHA nem hagyja el a rendszert. */
  megjegyzes: string | null
  teljesitett: boolean
  teljesites_datum: string | null
  letrehozta_id: string | null
  letrehozta_nev: string | null
  congregation_id: string | null
  created_at: string
  updated_at: string
}

export function progEmoji(p: Program): string {
  if (p.tipus === 'egyeb' && p.egyedi_emoji) return p.egyedi_emoji
  return PROG_TIPUS_EMOJI[p.tipus] || '📌'
}

export function progLabel(p: Program): string {
  if (p.tipus === 'egyeb' && p.egyedi_tipus_nev) return p.egyedi_tipus_nev
  return PROG_TIPUS_LABELS[p.tipus] || 'Egyéb'
}

export function progColor(p: Program): string {
  return PROG_TIPUS_COLOR[p.tipus] || '#94a3b8'
}
