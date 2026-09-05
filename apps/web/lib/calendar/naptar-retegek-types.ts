/**
 * NAPTÁR-RÉTEGEK — a naptár-csempe és a nyomtatványok KÖZÖS adatszerződése
 * (2026-09-05).
 *
 * A gyülekezeti naptár eddig EGYETLEN forrásból élt: a `gyulekezeti_programok`
 * táblából. A lelkész napi munkájában viszont ugyanarra a napra esik a
 * keresztelő (anyakönyv), a 80. születésnap (tagnyilvántartás) és a névnap
 * (nevnap-katalógus) is. Ezek RÉTEGEK a programok fölött: külön forrásból
 * jönnek, külön kapcsolhatók, és SOHA nem másolódnak át programmá — az
 * anyakönyv a tény, a tagnyilvántartás a személy; a naptár csak OLVASSA őket.
 *
 * ⚠️ EZ A FÁJL DIREKTÍVA-MENTES (se 'use server', se 'use client'): a szerver-
 *    akció, a csempe és a nyomtatvány ugyanezt a típust használja.
 *
 * ⚠️ SZEMÉLYES ADAT. Ezek a rétegek neveket hordoznak. A nyilvános weboldalra
 *    és a gyülekezeti ICS-feedbe SOHA nem kerülnek — azok kizárólag a
 *    `gyulekezeti_programok` publikus sorait látják (SQL-szintű kapu).
 */

/** Egy anyakönyvi TÉNY a naptárban (megtörtént bejegyzés). */
export interface AnyakonyviEsemeny {
  /** `keresztseg:123` alakú, stabil kulcs (React-kulcsnak is jó — nem gépelt tartalom). */
  kulcs: string
  tabla: 'keresztseg' | 'hazassag' | 'konfirmalas' | 'temetes'
  /** Az anyakönyvi sor azonosítója (integer PK). */
  id: number
  /** 'YYYY-MM-DD' — temetésnél a TEMETÉS napja (tdatum), nem a halálozásé. */
  datum: string
  /** Naptárba írható cím, pl. „Keresztelő — Kovács Anna". */
  cim: string
  /** Az érintett személy(ek) kanonikus neve (formatNameWithPrefix). */
  nevek: string[]
  /** A lelkész neve az anyakönyvi sorból, ha rögzítették. */
  lelkesz: string | null
  /**
   * Ha ehhez a bejegyzéshez KÖTÖTT tervezett program is van
   * (gyulekezeti_programok.anyakonyv_tabla/anyakonyv_id), annak azonosítója —
   * a naptár ilyenkor a PROGRAMOT mutatja „anyakönyvezve" jelzéssel, ezt a
   * sort nem külön.
   */
  programId: string | null
}

/** Egy tag születésnapja az ADOTT évben. */
export interface SzuletesnapEsemeny {
  kulcs: string
  szemelyId: number
  datum: string
  nev: string
  /** Hányadik születésnap az adott évben (≥ 1). */
  kor: number
  ferfi: boolean | null
}

/** Egy tag névnapja az ADOTT évben (egy személynek több is lehet). */
export interface NevnapEsemeny {
  kulcs: string
  szemelyId: number
  datum: string
  nev: string
  /** A névnap-katalógus szerinti név, amire az egyezés történt (pl. „Anna"). */
  nevnapNev: string
  /** A nap FŐ neve-e (nevnap.nev1) — a nyomtatvány ezt emeli ki. */
  elsodleges: boolean
}

export interface NaptarRetegek {
  ev: number
  anyakonyv: AnyakonyviEsemeny[]
  szuletesnapok: SzuletesnapEsemeny[]
  nevnapok: NevnapEsemeny[]
  /** Emberi hibaüzenetek rétegenként (pl. „a névnap-egyeztető függvény még nincs telepítve"). */
  hibak: Array<{ reteg: 'anyakonyv' | 'szuletesnapok' | 'nevnapok'; uzenet: string }>
}

/** A rétegek láthatósága a csempén/nyomtatványon — a lelkész kapcsolgatja. */
export interface NaptarRetegKapcsolok {
  anyakonyv: boolean
  szuletesnapok: boolean
  nevnapok: boolean
}

export const NAPTAR_RETEG_ALAP: NaptarRetegKapcsolok = {
  anyakonyv: true,
  szuletesnapok: true,
  nevnapok: false,
}

/** localStorage-kulcs a kapcsolók megjegyzéséhez (kényelmi, per-böngésző). */
export const NAPTAR_RETEG_LS_KULCS = 'kartoteka-naptar-retegek-v1'

export const ANYAKONYV_TABLA_CIMKE: Record<AnyakonyviEsemeny['tabla'], string> = {
  keresztseg: 'Keresztelő',
  hazassag: 'Esküvő',
  konfirmalas: 'Konfirmáció',
  temetes: 'Temetés',
}

export const ANYAKONYV_TABLA_EMOJI: Record<AnyakonyviEsemeny['tabla'], string> = {
  keresztseg: '💧',
  hazassag: '💍',
  konfirmalas: '✝️',
  temetes: '🕯️',
}

/** Az anyakönyvi tábla ⇄ a TERVEZETT program típusa (gyulekezeti_programok.tipus). */
export const ANYAKONYV_TABLA_PROGRAM_TIPUS: Record<AnyakonyviEsemeny['tabla'], 'kereszteles' | 'eskuvo' | 'konfirmacio' | 'temetes'> = {
  keresztseg: 'kereszteles',
  hazassag: 'eskuvo',
  konfirmalas: 'konfirmacio',
  temetes: 'temetes',
}

export const PROGRAM_TIPUS_ANYAKONYV_TABLA: Record<'kereszteles' | 'eskuvo' | 'konfirmacio' | 'temetes', AnyakonyviEsemeny['tabla']> = {
  kereszteles: 'keresztseg',
  eskuvo: 'hazassag',
  konfirmacio: 'konfirmalas',
  temetes: 'temetes',
}
