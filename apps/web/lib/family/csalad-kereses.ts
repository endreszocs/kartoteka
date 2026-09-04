/**
 * Család-kereső: korlátok és a találati sor szövegei (2026-09-04).
 *
 * ELŐZMÉNY — Endre észrevétele: a személyi karton „Családhoz rendelés"
 * dialógusában a találat CSAK ennyit mutatott:
 *
 *     Csoma család
 *     Vasút 189 · 0 gyermek
 *
 * Három „Csoma család" mellett ebből NEM derül ki, kiket választ a lelkész —
 * és egy elvétett hozzárendelés a háztartást, a járulék-elvárást és a
 * választói névjegyzéket is elrontja. A sor ezért mostantól viszi a felnőtt
 * tagok teljes nevét (születési évvel) és a gyermekek nevét is.
 *
 * Ez a modul SIMA lib, nem 'use server': a Next.js 16 alatt a 'use server'
 * fájl CSAK async függvényt exportálhat, tehát konstans és szinkron segéd
 * nem élhet benne. (Ugyanez a csapda buktatta korábban a deploy buildjét.)
 */

/** Legfeljebb ennyi személyt nézünk át a névre illesztésnél. */
export const CSALAD_KERESES_SZEMELY_LIMIT = 60
/**
 * Legfeljebb ennyi családot kérünk le. A `.in()` szűrő ~100 azonosító fölött
 * 414-et kap a proxytól, ezért maradunk jóval alatta.
 */
export const CSALAD_KERESES_CSALAD_LIMIT = 60
/** Ennél több találatnál a felület pontosítást kér — a csendes vágás félrevezet. */
export const CSALAD_KERESES_MEGJELENITETT = 20
/** A soron ennyi gyermeknevet mutatunk ki, a többit összevonva. */
export const CSALAD_SOR_GYERMEK_NEV = 3

export interface KeresettTag {
  name: string
  bornYear: number | null
}

/** „Csoma János (1971)" — a születési év a döntő, ha két tag neve egyezik. */
export function tagFelirat(tag: KeresettTag): string {
  return tag.bornYear ? `${tag.name} (${tag.bornYear})` : tag.name
}

/**
 * A felnőtt tagok sora: „Csoma János (1971) · Kis Mária (1974)".
 * Üres, ha egyik felnőtt sem ismert — a hívó ilyenkor mást írjon ki, nem
 * egy néma üres sávot.
 */
export function felnottekFelirat(ferfi: KeresettTag | null, no: KeresettTag | null): string {
  return [ferfi, no].filter((t): t is KeresettTag => t != null).map(tagFelirat).join(' · ')
}

/**
 * A gyermekek sora: „2 gyermek: Csoma Anna, Csoma Péter". Ha több gyermek van,
 * mint amennyit kiírunk, a maradékot MEGSZÁMOLVA jelezzük — a néma levágás
 * pont azt a bizonytalanságot hozná vissza, ami miatt ez a kör elindult.
 *
 * @param count a család gyermekeinek TELJES száma (a nevek listája rövidebb lehet)
 */
export function gyermekekFelirat(count: number, nevek: KeresettTag[]): string {
  // ⚠️ „nincs RÖGZÍTETT gyermek", nem „nincs gyermek". A `gyerek` táblán
  // RESTRICTIVE aal2-policy ül: egy MFA-ra beállított, de aal1 munkamenet nem
  // hibát kap, hanem ÜRES eredményt. A szűkebb állítás mindkét esetben igaz.
  if (count <= 0) return 'nincs rögzített gyermek'
  const alap = `${count} gyermek`
  if (nevek.length === 0) return alap
  const mutatott = nevek.slice(0, CSALAD_SOR_GYERMEK_NEV).map((t) => t.name)
  const maradek = count - mutatott.length
  const felsorolas = maradek > 0 ? `${mutatott.join(', ')} +${maradek}` : mutatott.join(', ')
  return `${alap}: ${felsorolas}`
}
