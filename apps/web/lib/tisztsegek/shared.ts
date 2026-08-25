/**
 * Gyülekezeti tisztségek — közös, tiszta szabályréteg (2026-08-26, 5. kör).
 *
 * Itt él: a kódlisták (presbiteri fokozat/funkció, nem-presbiteri tisztségek,
 * bizottságok), az „aktív mandátum" definíció, a mandátum-lejárat badge-állapot
 * és a jegyzőkönyvi HATÁROZATKÉPESSÉG szabálya. Tiszta modul (nincs IO/React) —
 * a szerver-akciók, a felület és a selftest ugyanabból dolgozik.
 *
 * EGYHÁZJOGI SZABÁLYOK (Endre 2026-08-26-i döntése szerint rögzítve):
 *  - a kvórum-alap CSAK az aktív, TELJES értékű presbiterekből áll, ÉS a
 *    lelkész hivatalból beleszámít (+1);
 *  - a pótpresbiter és a tiszteletbeli presbiter tanácskozási joggal vesz
 *    részt, a határozatképességbe NEM számít;
 *  - gondnok/főgondnok csak teljes értékű presbiter lehet (DB-CHECK is védi);
 *  - a mandátum alapciklusa 3 év (Erdély), gyülekezetenként állítható.
 */

// ---------------------------------------------------------------------------
// Kódlisták
// ---------------------------------------------------------------------------

export const PRESBITER_FOKOZATOK = ['teljes', 'pot', 'tiszteletbeli'] as const
export type PresbiterFokozat = typeof PRESBITER_FOKOZATOK[number]

export const PRESBITER_FOKOZAT_CIMKEK: Record<PresbiterFokozat, string> = {
  teljes: 'Teljes értékű presbiter',
  pot: 'Pótpresbiter',
  tiszteletbeli: 'Tiszteletbeli presbiter',
}

export const PRESBITER_FUNKCIOK = ['fogondnok', 'gondnok'] as const
export type PresbiterFunkcio = typeof PRESBITER_FUNKCIOK[number]

export const PRESBITER_FUNKCIO_CIMKEK: Record<PresbiterFunkcio, string> = {
  fogondnok: 'Főgondnok',
  gondnok: 'Gondnok',
}

export const TISZTSEG_TIPUSOK = [
  'kantor',
  'diakonus',
  'noszovetsegi_elnok',
  'ike_elnok',
  'onkentes',
  'bizottsagi_tag',
  'egyhazmegyei_kuldott',
  'egyeb',
] as const
export type TisztsegTipus = typeof TISZTSEG_TIPUSOK[number]

export const TISZTSEG_TIPUS_CIMKEK: Record<TisztsegTipus, string> = {
  kantor: 'Kántor',
  diakonus: 'Diakónus',
  noszovetsegi_elnok: 'Nőszövetségi elnök',
  ike_elnok: 'IKE-elnök',
  onkentes: 'Önkéntes',
  bizottsagi_tag: 'Bizottsági tag',
  egyhazmegyei_kuldott: 'Egyházmegyei küldött',
  egyeb: 'Egyéb tisztség',
}

/** UI-kódlista — szándékosan NEM DB-CHECK (a 4. bizottság UI-bővítés legyen). */
export const BIZOTTSAGOK = ['gazdasagi', 'leltarozo', 'diakoniai'] as const
export type BizottsagKod = typeof BIZOTTSAGOK[number]

export const BIZOTTSAG_CIMKEK: Record<BizottsagKod, string> = {
  gazdasagi: 'Gazdasági bizottság',
  leltarozo: 'Leltározó bizottság',
  diakoniai: 'Diakóniai bizottság',
}

export const KANTOR_JELLEG_CIMKEK: Record<'hivatasos' | 'onkentes', string> = {
  hivatasos: 'hivatásos',
  onkentes: 'önkéntes',
}

/** A presbitérium kánoni létszámsávja (4–36 fő) — soft figyelmeztetéshez. */
export const PRESBITERIUM_MIN_LETSZAM = 4
export const PRESBITERIUM_MAX_LETSZAM = 36

// ---------------------------------------------------------------------------
// Aktív mandátum + lejárat-állapot
// ---------------------------------------------------------------------------

export function maiNap(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Aktív = (nincs kezdete VAGY már elkezdődött) ÉS (nincs vége VAGY még nem
 * járt le). A jövőbeli kezdetű mandátum NEM aktív — nem publikálódik, és a
 * kvórumba sem számít (különben egy előre rögzített új presbitérium a
 * régiekkel EGYÜTT duplázná a létszámot).
 */
export function aktivE(kezdete?: string | null, vege?: string | null, ma = maiNap()): boolean {
  if (kezdete && kezdete > ma) return false
  if (vege && vege < ma) return false
  return true
}

export type MandatumAllapot = 'nincs_megadva' | 'el' | 'hamarosan_lejar' | 'lejart' | 'meg_nem_kezdodott'

/** A „hamarosan lejár" küszöbe: fél év. */
const HAMAROSAN_NAP = 183

export function mandatumAllapot(
  kezdete?: string | null,
  vege?: string | null,
  ma = maiNap(),
): MandatumAllapot {
  if (kezdete && kezdete > ma) return 'meg_nem_kezdodott'
  if (!vege) return kezdete ? 'el' : 'nincs_megadva'
  if (vege < ma) return 'lejart'
  const [ey, em, ed] = vege.split('-').map(Number)
  const [my, mm, md] = ma.split('-').map(Number)
  const napok = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(my, mm - 1, md)) / 86400000)
  return napok <= HAMAROSAN_NAP ? 'hamarosan_lejar' : 'el'
}

export const MANDATUM_BADGE: Record<MandatumAllapot, { cimke: string; szin: 'zold' | 'sarga' | 'piros' | 'szurke' | 'kek' }> = {
  el: { cimke: 'érvényes', szin: 'zold' },
  hamarosan_lejar: { cimke: 'fél éven belül lejár', szin: 'sarga' },
  lejart: { cimke: 'LEJÁRT', szin: 'piros' },
  nincs_megadva: { cimke: 'mandátum nincs megadva', szin: 'szurke' },
  meg_nem_kezdodott: { cimke: 'még nem kezdődött el', szin: 'kek' },
}

/** vege-javaslat a rögzítéshez: kezdete + ciklus év (nap-pontosan, -1 nap). */
export function mandatumVegeJavaslat(kezdete: string, ciklusEv: number): string {
  const [y, m, d] = kezdete.split('-').map(Number)
  const veg = new Date(Date.UTC(y + Math.max(1, Math.round(ciklusEv)), m - 1, d - 1))
  return veg.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Szerep-címkék (jegyzőkönyv jelenléti ív + kártyák)
// ---------------------------------------------------------------------------

/** A pót/tiszteletbeli jelölés a jelenléti íven — a kvórum-szabály ERRE ismer rá. */
export const TANACSKOZASI_JELZES = 'tanácskozási joggal'

export function presbiterSzerepCimke(
  fokozat?: string | null,
  funkcio?: string | null,
): string {
  if (funkcio === 'fogondnok') return 'presbiter, főgondnok'
  if (funkcio === 'gondnok') return 'presbiter, gondnok'
  if (fokozat === 'pot') return `pótpresbiter (${TANACSKOZASI_JELZES})`
  if (fokozat === 'tiszteletbeli') return `tiszteletbeli presbiter (${TANACSKOZASI_JELZES})`
  return 'presbiter'
}

function egyszerusit(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Szavazati jogú-e egy jelenléti ív-sor a szerep-címkéje alapján. A pót- és
 * tiszteletbeli presbiter (és bármely, kifejezetten tanácskozási jogúként
 * jelölt résztvevő) NEM számít a kvórumba.
 */
export function szavazatiJoguSor(szerep?: string | null): boolean {
  const t = egyszerusit(String(szerep || ''))
  if (t.includes('potpresbiter') || t.includes('pot presbiter')) return false
  if (t.includes('tiszteletbeli')) return false
  if (t.includes('tanacskozasi')) return false
  if (t.includes('meghivott') || t.includes('vendeg')) return false
  return true
}

// ---------------------------------------------------------------------------
// Határozatképesség (kvórum)
// ---------------------------------------------------------------------------

export interface KvorumEredmeny {
  /** Szavazati jogú testületi létszám (aktív teljes presbiterek + a lelkész). */
  alap: number
  /** Ebből jelen (a lelkésszel együtt — az elnöklő lelkész jelen van). */
  jelen: number
  /** A határozatképességhez szükséges létszám: floor(alap/2)+1. */
  szukseges: number
  megvan: boolean
}

/**
 * A presbiteri ülés határozatképessége a jelenléti ív soraiból.
 *
 * SZABÁLY (Endre-döntés, 2026-08-26): az alap a SZAVAZATI JOGÚ sorok száma
 * (pót/tiszteletbeli kizárva) + 1 (a lelkész hivatalból, aki az ülés elnöke —
 * a jelenléti íven külön nem szerepel). A lelkész jelenlévőnek számít.
 * A RÉGI (hibás) viselkedés — minden sor beleszámított, a lelkész nem —
 * jogilag megtámadható jegyzőkönyvet adott volna a pót-fokozat bevezetésével.
 */
export function kvorumSzamitas(
  resztvevok: Array<{ szerep?: string | null; statusz?: string | null }>,
): KvorumEredmeny {
  const szavazok = resztvevok.filter(r => szavazatiJoguSor(r.szerep))
  const alap = szavazok.length + 1
  const jelen = szavazok.filter(r => (r.statusz || 'jelen') === 'jelen').length + 1
  const szukseges = Math.floor(alap / 2) + 1
  return { alap, jelen, szukseges, megvan: jelen >= szukseges }
}

// ---------------------------------------------------------------------------
// Publikus weboldal — RPC-kód → magyar címke
// ---------------------------------------------------------------------------

/** A public_site_tisztsegek RPC kod-oszlopának fordítása a weboldalon. */
export function publikusTisztsegCimke(kod: string): string {
  const fix: Record<string, string> = {
    fogondnok: 'Főgondnok',
    gondnok: 'Gondnok',
    presbiter: 'Presbiter',
    potpresbiter: 'Pótpresbiter',
    tiszteletbeli_presbiter: 'Tiszteletbeli presbiter',
    kantor: 'Kántor',
    diakonus: 'Diakónus',
    noszovetsegi_elnok: 'Nőszövetségi elnök',
    ike_elnok: 'IKE-elnök',
    onkentes: 'Önkéntes',
    egyhazmegyei_kuldott: 'Egyházmegyei küldött',
    egyeb: 'Tisztségviselő',
  }
  if (fix[kod]) return fix[kod]
  // bizottsági kódok: '<bizottsag>_bizottsag_<szerep>'
  const m = kod.match(/^([a-z]+)_bizottsag_(elnok|tag)$/)
  if (m) {
    const biz = BIZOTTSAG_CIMKEK[m[1] as BizottsagKod] || `${m[1]} bizottság`
    return m[2] === 'elnok' ? `${biz} — elnök` : `${biz} — tag`
  }
  return 'Tisztségviselő'
}
