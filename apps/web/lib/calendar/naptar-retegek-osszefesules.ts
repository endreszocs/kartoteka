/**
 * NAPTÁR-RÉTEGEK ÖSSZEFÉSÜLÉSE — tiszta függvények (2026-09-05, Endre 2. pontja).
 *
 * A csempe egy napra a PROGRAMOKAT (gyulekezeti_programok, ismétlődés
 * kibontva) és a RÉTEGEKET (anyakönyvi tények, születésnapok, névnapok —
 * `getNaptarRetegek`) EGY listában mutatja. Ez a modul dönt arról, hogy
 *   · melyik réteg látszik (a lelkész kapcsolói szerint),
 *   · mi kerül egy adott napra,
 *   · és hogy a MÁR ANYAKÖNYVEZETT tervezett program ne jelenjen meg KÉTSZER
 *     (egyszer programként, egyszer anyakönyvi tényként).
 *
 * ⚠️ DIREKTÍVA-MENTES, DOM-mentes, React-mentes: a `scripts/selftest-naptar-retegek.mjs`
 *    transpile-olva futtatja (a dedupe mutáns-asszertjével együtt).
 *
 * DEDUPE-SZABÁLY (D1): tény = anyakönyvi sor, terv = program + link
 * (`gyulekezeti_programok.anyakonyv_tabla/anyakonyv_id`). Ha a tényhez KÖTÖTT
 * program is a listában van, a naptár a PROGRAMOT mutatja („anyakönyvezve"
 * jelzéssel), a tényt nem külön. Ha a kötött program NINCS a listában (más év,
 * törölt), a tény látszik — semmi nem tűnik el némán.
 */

import type { Program } from '@/lib/constants/dashboard'
import { PROG_TIPUS_COLOR } from '@/lib/constants/dashboard'
import type {
  AnyakonyviEsemeny,
  NaptarRetegKapcsolok,
  NaptarRetegek,
  NevnapEsemeny,
  SzuletesnapEsemeny,
} from '@/lib/calendar/naptar-retegek-types'
import { ANYAKONYV_TABLA_EMOJI, ANYAKONYV_TABLA_PROGRAM_TIPUS } from '@/lib/calendar/naptar-retegek-types'

/**
 * A program sora a 2026-09-05-ös oszlopokkal. A `Program` interface (a
 * koordinátor tulajdona) még nem ismeri őket; a `select('*')` viszont már
 * behozza — itt OPCIONÁLISAN olvassuk, hogy a migráció előtti sor is
 * hibátlanul menjen át.
 */
export type ProgramAnyakonyvLink = Program & {
  anyakonyv_tabla?: string | null
  anyakonyv_id?: number | null
}

/** Egy nap EGY tétele a csempén — a `reteg` mondja meg, melyik forrásból jött. */
export type NaptarNapTetel =
  | { reteg: 'program'; kulcs: string; datum: string; program: ProgramAnyakonyvLink }
  | { reteg: 'anyakonyv'; kulcs: string; datum: string; esemeny: AnyakonyviEsemeny }
  | { reteg: 'szuletesnap'; kulcs: string; datum: string; esemeny: SzuletesnapEsemeny }
  | { reteg: 'nevnap'; kulcs: string; datum: string; esemeny: NevnapEsemeny }

/** Az anyakönyvi tény színe = a hozzá tartozó programtípus színe (egy színcsalád). */
export function anyakonyvSzin(tabla: AnyakonyviEsemeny['tabla']): string {
  return PROG_TIPUS_COLOR[ANYAKONYV_TABLA_PROGRAM_TIPUS[tabla]]
}

export function anyakonyvEmoji(tabla: AnyakonyviEsemeny['tabla']): string {
  return ANYAKONYV_TABLA_EMOJI[tabla]
}

/** Kötött-e a program egy anyakönyvi bejegyzéshez (a 2026-09-05-ös link-oszlopok szerint). */
export function programAnyakonyvezve(p: ProgramAnyakonyvLink): boolean {
  return !!p.anyakonyv_tabla && p.anyakonyv_id != null
}

/** Egy program érinti-e a napot (többnapos kezeléssel) — a `program-day.eventOnDay` tükre. */
function programANapon(p: Program, nap: string): boolean {
  const start = p.datum
  const end = p.datum_vege && p.datum_vege !== p.datum ? p.datum_vege : p.datum
  return nap >= start && nap <= end
}

/**
 * A rétegek MEGSZŰRVE a kapcsolók szerint és a dedupe-pal.
 *
 * @param programok a betöltött (ismétlődés-kibontott) programok — az id-k és a
 *   link-oszlopok innen jönnek a dedupe-hoz
 */
export function szurtRetegek(
  retegek: NaptarRetegek | null | undefined,
  kapcsolok: NaptarRetegKapcsolok,
  programok: ProgramAnyakonyvLink[],
): { anyakonyv: AnyakonyviEsemeny[]; szuletesnapok: SzuletesnapEsemeny[]; nevnapok: NevnapEsemeny[] } {
  if (!retegek) return { anyakonyv: [], szuletesnapok: [], nevnapok: [] }

  // A dedupe két irányból is felismeri a kötést — a rétegolvasó `programId`-t
  // ad, a program sora pedig `anyakonyv_tabla:anyakonyv_id`-t hordoz. Bármelyik
  // egyezik → a tény NEM jelenik meg külön (a program mutatja „anyakönyvezve").
  const programIdk = new Set<string>()
  const linkKulcsok = new Set<string>()
  for (const p of programok) {
    programIdk.add(p.id)
    if (programAnyakonyvezve(p)) linkKulcsok.add(`${p.anyakonyv_tabla}:${p.anyakonyv_id}`)
  }

  const anyakonyv = kapcsolok.anyakonyv
    ? retegek.anyakonyv.filter((e) => {
        if (e.programId && programIdk.has(e.programId)) return false
        if (linkKulcsok.has(e.kulcs)) return false
        return true
      })
    : []

  return {
    anyakonyv,
    szuletesnapok: kapcsolok.szuletesnapok ? retegek.szuletesnapok : [],
    nevnapok: kapcsolok.nevnapok ? retegek.nevnapok : [],
  }
}

/** Az anyakönyvi tényből a naptár-tétel — a kulcs a stabil `tabla:id`, sosem gépelt tartalom. */
function anyakonyvTetel(e: AnyakonyviEsemeny): NaptarNapTetel {
  return { reteg: 'anyakonyv', kulcs: `ak:${e.kulcs}`, datum: e.datum, esemeny: e }
}

/**
 * EGY NAP tételei, a csempe sorrendjében: programok (idő szerint, majd cím),
 * utána anyakönyvi tények, születésnapok, névnapok (név szerint).
 *
 * @param nap 'YYYY-MM-DD'
 */
export function napTetelei(
  nap: string,
  programok: ProgramAnyakonyvLink[],
  retegek: NaptarRetegek | null | undefined,
  kapcsolok: NaptarRetegKapcsolok,
): NaptarNapTetel[] {
  const ki: NaptarNapTetel[] = []

  const napiProgramok = programok
    .filter((p) => programANapon(p, nap))
    .sort((a, b) => {
      const ta = a.ido_kezdes || '99:99'
      const tb = b.ido_kezdes || '99:99'
      if (ta !== tb) return ta.localeCompare(tb)
      return a.cim.localeCompare(b.cim, 'hu')
    })
  for (const p of napiProgramok) {
    // A kibontott sorozat minden alkalma ugyanazt az `id`-t hordozza — a kulcs
    // ezért id + a KONKRÉT alkalom napja (a többnapos program a kezdőnapjával).
    ki.push({ reteg: 'program', kulcs: `pr:${p.id}:${p.datum}`, datum: nap, program: p })
  }

  const r = szurtRetegek(retegek, kapcsolok, programok)
  for (const e of r.anyakonyv) if (e.datum === nap) ki.push(anyakonyvTetel(e))
  for (const e of r.szuletesnapok) if (e.datum === nap) ki.push({ reteg: 'szuletesnap', kulcs: `sz:${e.kulcs}`, datum: nap, esemeny: e })
  for (const e of r.nevnapok) if (e.datum === nap) ki.push({ reteg: 'nevnap', kulcs: `nn:${e.kulcs}`, datum: nap, esemeny: e })

  return ki
}

/** A hónap-rács pöttyeihez: naponként a réteg-tételek (programok NÉLKÜL — azokat a rács maga adja). */
export interface RetegPotty {
  reteg: 'anyakonyv' | 'szuletesnap' | 'nevnap'
  /** Az anyakönyvi pötty a típus színét kapja; a másik kettő CSS-osztályból (téma-token) színeződik. */
  szin: string | null
  cim: string
}

export function retegPottyokNaponkent(
  retegek: NaptarRetegek | null | undefined,
  kapcsolok: NaptarRetegKapcsolok,
  programok: ProgramAnyakonyvLink[],
): Map<string, RetegPotty[]> {
  const terkep = new Map<string, RetegPotty[]>()
  const tegy = (datum: string, potty: RetegPotty) => {
    const lista = terkep.get(datum)
    if (lista) lista.push(potty)
    else terkep.set(datum, [potty])
  }
  const r = szurtRetegek(retegek, kapcsolok, programok)
  for (const e of r.anyakonyv) tegy(e.datum, { reteg: 'anyakonyv', szin: anyakonyvSzin(e.tabla), cim: e.cim })
  for (const e of r.szuletesnapok) tegy(e.datum, { reteg: 'szuletesnap', szin: null, cim: `🎂 ${e.nev} (${e.kor})` })
  for (const e of r.nevnapok) tegy(e.datum, { reteg: 'nevnap', szin: null, cim: `💐 ${e.nev}` })
  return terkep
}

/** Hány réteg-tétel esik a hónapra (a csempe hó-összegzéséhez). */
export function retegekSzamaHonapban(
  pottyok: Map<string, RetegPotty[]>,
  honapKulcs: string,
): number {
  let n = 0
  for (const [datum, lista] of pottyok) if (datum.startsWith(honapKulcs)) n += lista.length
  return n
}
