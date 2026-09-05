/**
 * ÉVES PROGRAMTERV — DOM-mentes, többlapos HTML-építő (web + desktop KÖZÖS).
 * (2026-09-05, Endre 2. pontja — a naptár-brief D4 döntése.)
 *
 * ⛔ MI VOLT A HIBA: a 2026-06-08-i egylapos nyomtatványon a program CSAK egy
 *    3 px-es színes pötty volt, a neve kizárólag a `title=` tooltipbe került,
 *    a névsoros lista pedig csak a `fontos`/`kiemelt` prioritású sorokat írta
 *    ki — az alapértelmezett prioritás `normal`, tehát a lelkész programjai
 *    NÉV NÉLKÜL maradtak a papíron („a mentett programok nem jelennek meg").
 *
 * MIT AD EZ AZ ÉPÍTŐ:
 *   1. lap  „Áttekintő"  — fejléc (logó, gyülekezet, év, vezérige), 12
 *           mini-naptár (ünnep ✝ ÉS típus-pötty együtt, vasárnap piros,
 *           szabadság sraffozva, anyakönyvi glyph), jelmagyarázat CSAK az
 *           előforduló típusokra.
 *   2–N. lap HAVI LAPOK — hónaponként napi sorok: dátum + nap neve + ünnep,
 *           a nap MINDEN programja NÉVVEL, időponttal, helyszínnel, típus-
 *           jellel (a prioritás csak vizuális erősítés); ismétlődések a hívó
 *           által KIBONTVA érkeznek, többnapos program MINDEN napján (n/N. nap);
 *           a rétegek (anyakönyv, születésnap, névnap) a kapcsolók szerint;
 *           üres napok tömörítve („5–9.: nincs alkalom"), a vasárnap mindig
 *           saját sor — a hónap TELJES.
 *
 * KÉT VÁLTOZAT (`valtozat`):
 *   · 'gyulekezeti' — terjesztésre: a MAGÁN típusú programok (szabadság,
 *     anyakönyvi alkalmak) a CÍMÜKKEL együtt hiányoznak, személyes réteg nincs.
 *   · 'lelkeszi'   — mindennel.
 *
 * TISZTA FÜGGVÉNY: nincs DOM, nincs Date.now(), nincs adatbázis. A bemenet
 * a MÁR KIBONTOTT előfordulások listája (a webes `expandProgramOccurrences`
 * eredménye) — az ismétlődés-logika így EGY helyen él, itt nem másoljuk.
 *
 * TÖRDELÉS: determinisztikus, DOM-mérés nélkül. Egy hasáb kapacitása
 * `EVES_NAPTAR_HASAB_KAPACITAS` sor-egység; egy sor annyi egység, ahány
 * becsült szövegsorra tördelődik (`SOR_KARAKTER` karakter/sor — szándékosan
 * KONZERVATÍV, hogy a lap inkább alul maradjon üres, mint hogy túlcsorduljon;
 * a `.page { overflow: hidden }` a végső őr). Egy nap sorai együtt maradnak
 * (nem szakad hasáb-határon), kivéve ha egy nap önmagában több egy hasábnál.
 *
 * ⚠️ Minden felhasználói szöveg `esc()`-en át kerül a HTML-be — a nyomtató-
 *    motor (print-engine-v2) same-origin fut, ott már késő escape-elni.
 */

// ── Bemeneti szerződés ──────────────────────────────────────────────────────

/** Egy program-ELŐFORDULÁS (ismétlődő sorozatnál a kibontott alkalom). */
export interface EvesNaptarElofordulas {
  id: string
  cim: string
  /** 'YYYY-MM-DD' */
  datum: string
  datum_vege: string | null
  /** 'HH:MM' vagy 'HH:MM:SS' */
  ido_kezdes: string | null
  ido_befejezes: string | null
  helyszin: string | null
  tipus: string
  prioritas?: string | null
  ismetlodes_tipus?: string | null
  egyedi_tipus_nev?: string | null
  egyedi_emoji?: string | null
  /** BELSŐ jegyzet — csak a szabadság sorába kerül, csak lelkészi példányon. */
  megjegyzes?: string | null
}

/** A programtípus megjelenítési adatai — a hívó adja (a web: constants/dashboard.ts). */
export interface EvesNaptarTipusMeta {
  cimke: string
  szin: string
  emoji?: string
}

export interface EvesNaptarUnnep {
  /** 'YYYY-MM-DD' */
  date: string
  name: string
}

/** A rétegek a webes `NaptarRetegek` szerkezetével kompatibilisek (struktúrális típus). */
export interface EvesNaptarAnyakonyv {
  kulcs: string
  datum: string
  cim: string
  tabla: string
  /** Ha a bejegyzéshez kötött TERVEZETT program is van, annak azonosítója (dedupe). */
  programId?: string | null
}
export interface EvesNaptarSzuletesnap {
  kulcs: string
  datum: string
  nev: string
  kor: number
}
export interface EvesNaptarNevnap {
  kulcs: string
  datum: string
  nev: string
  nevnapNev: string
}
export interface EvesNaptarRetegek {
  anyakonyv: EvesNaptarAnyakonyv[]
  szuletesnapok: EvesNaptarSzuletesnap[]
  nevnapok: EvesNaptarNevnap[]
}

export type EvesNaptarValtozat = 'gyulekezeti' | 'lelkeszi'

export interface EvesNaptarKapcsolok {
  anyakonyv: boolean
  szuletesnapok: boolean
  nevnapok: boolean
}

export interface EvesNaptarInput {
  ev: number
  gyulekezetNev: string
  /** Adat-URL ajánlott (a PDF-render biztosan látja); http(s) is működik. */
  logoUrl?: string | null
  vezerige?: { text: string; ref: string } | null
  /** MÁR KIBONTOTT előfordulások (expandProgramOccurrences eredménye). */
  elofordulasok: EvesNaptarElofordulas[]
  unnepek: EvesNaptarUnnep[]
  retegek?: EvesNaptarRetegek | null
  /** típus-kulcs → címke/szín/emoji. Ismeretlen típusra szürke „Egyéb". */
  tipusMeta: Record<string, EvesNaptarTipusMeta>
  /** A MAGÁN típusok kulcsai — a gyülekezeti példányból KIMARADNAK. */
  maganTipusok: readonly string[]
  valtozat: EvesNaptarValtozat
  kapcsolok: EvesNaptarKapcsolok
  /** „Készült: …" felirat a láblécben — a hívó formázza (az építő nem néz órát). */
  keszult?: string | null
}

export interface EvesNaptarEredmeny {
  title: string
  filename: string
  orientation: 'landscape'
  html: string
  /** A lapok száma — a `<body data-sheet-count>` ugyanezt hordozza. */
  sheetCount: number
}

// ── Közös segédek (a köszöntő-naptár is innen importál — EGY forrás) ────────

export const HU_HONAPOK = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
] as const
/** 0 = vasárnap … 6 = szombat (a JS `getUTCDay()` sorrendje). */
export const HU_NAPNEVEK = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'] as const
export const HU_NAPNEVEK_ROVID = ['vas', 'hét', 'kedd', 'sze', 'csüt', 'pén', 'szo'] as const
/** A mini-naptár fejléce, HÉTFŐVEL kezdve. */
const DOW_FEJLEC = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'] as const

export function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 'YYYY-MM-DD' — UTC-matek, időzóna-független (a program-recurrence mintája). */
export function ymdUTC(y: number, m1: number, d: number): string {
  return new Date(Date.UTC(y, m1 - 1, d)).toISOString().slice(0, 10)
}

/** A hét napja egy 'YYYY-MM-DD' sztringből: 0 = vasárnap … 6 = szombat. */
export function hetNapja(datum: string): number {
  const [y, m, d] = datum.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function honapNapjai(ev: number, honap1: number): number {
  return new Date(Date.UTC(ev, honap1, 0)).getUTCDate()
}

/** Egy szöveg becsült sor-egysége adott karakter/sor mellett (≥ 1). */
export function sorEgyseg(szoveg: string, karakterPerSor: number): number {
  return Math.max(1, Math.ceil(szoveg.length / Math.max(1, karakterPerSor)))
}

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM'; hiányzó időre üres. */
export function idoRovid(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}

// ── Tördelési állandók (MÉRT, konzervatív) ─────────────────────────────────

/**
 * Egy havi hasáb kapacitása sor-egységben. A4 fekvő: 210 mm − 8 mm felső −
 * 10 mm alsó margó − 13 mm lapfejléc − 8 mm hónapcím − 6 mm lábléc ≈ 165 mm
 * hasznos magasság; egy 9,5 px-es sor ≈ 4 mm → 41 egység férne, 36-tal
 * ~20 mm tartalék marad a becslés hibájára.
 */
export const EVES_NAPTAR_HASAB_KAPACITAS = 36
export const EVES_NAPTAR_HASAB_PER_LAP = 2
/** Karakter/sor a tartalom-cellában (~89 mm széles, 9,5 px betű ≈ 65 valós; 54 konzervatív). */
const SOR_KARAKTER = 54
/** Védőkorlát: egy előfordulás legfeljebb ennyi napot fed le (elszabadult ciklus ellen). */
const MAX_NAPOK_EGY_ELOFORDULAS = 400
const ISMERETLEN_TIPUS: EvesNaptarTipusMeta = { cimke: 'Egyéb', szin: '#94a3b8', emoji: '📌' }

// ── Belső modell ────────────────────────────────────────────────────────────

type NapTetel =
  | { fajta: 'unnep'; nev: string }
  | { fajta: 'program'; p: EvesNaptarElofordulas; napSorszam: number; napokSzama: number; anyakonyvezve: boolean }
  | { fajta: 'anyakonyv'; a: EvesNaptarAnyakonyv }
  | { fajta: 'szuletesnap'; nevek: string[] }
  | { fajta: 'nevnap'; nevek: string[] }

interface Sor {
  /** 'YYYY-MM-DD' vagy tömörített tartománynál a kezdőnap. */
  napBlokk: string
  /** A nap ELSŐ sora hordozza a dátum-cellát; a többinél üres marad. */
  elsoANapon: boolean
  napCella: string
  /** A dátum-cella hasáb-folytatásnál (ha a nap sorai szétszakadtak). */
  napCellaFolyt: string
  /** Sor-osztály (r-prog, r-unnep, …). */
  osztaly: string
  datumAttr: string
  /** Az idő- és tartalom-cella (colspan-os tömörített sornál a teljes sor). */
  tartalomTd: string
  egyseg: number
}

/** A napok az adott előfordulásból, a NÉZETT évre vágva; n/N. nap sorszámmal. */
function elofordulasNapjai(p: EvesNaptarElofordulas, ev: number): Array<{ datum: string; napSorszam: number; napokSzama: number }> {
  const out: Array<{ datum: string; napSorszam: number; napokSzama: number }> = []
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.datum)
  if (!m) return out
  const veg = p.datum_vege && /^\d{4}-\d{2}-\d{2}$/.test(p.datum_vege) && p.datum_vege > p.datum ? p.datum_vege : p.datum
  const evElso = `${ev}-01-01`
  const evUtolso = `${ev}-12-31`
  let t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const osszes: string[] = []
  for (let i = 0; i < MAX_NAPOK_EGY_ELOFORDULAS; i++) {
    const s = new Date(t).toISOString().slice(0, 10)
    if (s > veg) break
    osszes.push(s)
    t += 86400000
  }
  osszes.forEach((s, i) => {
    if (s >= evElso && s <= evUtolso) out.push({ datum: s, napSorszam: i + 1, napokSzama: osszes.length })
  })
  return out
}

function tipusMetaOf(tipusMeta: Record<string, EvesNaptarTipusMeta>, p: EvesNaptarElofordulas): EvesNaptarTipusMeta {
  const meta = tipusMeta[p.tipus] ?? ISMERETLEN_TIPUS
  if (p.tipus === 'egyeb' && (p.egyedi_tipus_nev || p.egyedi_emoji)) {
    return { cimke: p.egyedi_tipus_nev || meta.cimke, szin: meta.szin, emoji: p.egyedi_emoji || meta.emoji }
  }
  return meta
}

function idoFelirat(p: EvesNaptarElofordulas): string {
  const k = idoRovid(p.ido_kezdes)
  if (!k) return ''
  const v = idoRovid(p.ido_befejezes)
  return v ? `${k}–${v}` : k
}

// ── Napi tételek összegyűjtése ─────────────────────────────────────────────

function napTetelek(input: EvesNaptarInput, programok: EvesNaptarElofordulas[]): Map<string, NapTetel[]> {
  const terkep = new Map<string, NapTetel[]>()
  const tegyel = (datum: string, t: NapTetel) => {
    const arr = terkep.get(datum)
    if (arr) arr.push(t)
    else terkep.set(datum, [t])
  }

  // Ünnepek — a program pöttye/neve MELLETT (a régi `if (hol) … else` a
  // karácsonyi hangversenyt némán eltüntette).
  for (const u of input.unnepek) {
    if (u.date.slice(0, 4) === String(input.ev)) tegyel(u.date, { fajta: 'unnep', nev: u.name })
  }

  // Rétegek — CSAK lelkészi példányon, a kapcsolók szerint.
  const retegekAktiv = input.valtozat === 'lelkeszi' && input.retegek
  const programIdk = new Set(programok.map((p) => p.id))
  const anyakonyvezettProgramok = new Set<string>()
  if (retegekAktiv && input.kapcsolok.anyakonyv) {
    for (const a of input.retegek!.anyakonyv) {
      if (a.datum.slice(0, 4) !== String(input.ev)) continue
      // D1 dedupe: ha a bejegyzéshez kötött program is a listában van, a
      // PROGRAM sora viseli az „anyakönyvezve" jelet, a réteg nem ismétli.
      if (a.programId && programIdk.has(a.programId)) {
        anyakonyvezettProgramok.add(a.programId)
        continue
      }
      tegyel(a.datum, { fajta: 'anyakonyv', a })
    }
  }

  // Programok — MINDEN nap, amelyet az előfordulás lefed.
  for (const p of programok) {
    for (const n of elofordulasNapjai(p, input.ev)) {
      tegyel(n.datum, {
        fajta: 'program', p, napSorszam: n.napSorszam, napokSzama: n.napokSzama,
        anyakonyvezve: anyakonyvezettProgramok.has(p.id),
      })
    }
  }

  if (retegekAktiv && input.kapcsolok.szuletesnapok) {
    const napok = new Map<string, string[]>()
    for (const s of input.retegek!.szuletesnapok) {
      if (s.datum.slice(0, 4) !== String(input.ev)) continue
      const arr = napok.get(s.datum) ?? []
      arr.push(`${s.nev} (${s.kor})`)
      napok.set(s.datum, arr)
    }
    for (const [datum, nevek] of napok) tegyel(datum, { fajta: 'szuletesnap', nevek: nevek.sort((a, b) => a.localeCompare(b, 'hu')) })
  }
  if (retegekAktiv && input.kapcsolok.nevnapok) {
    const napok = new Map<string, string[]>()
    for (const nv of input.retegek!.nevnapok) {
      if (nv.datum.slice(0, 4) !== String(input.ev)) continue
      const arr = napok.get(nv.datum) ?? []
      arr.push(`${nv.nev} (${nv.nevnapNev})`)
      napok.set(nv.datum, arr)
    }
    for (const [datum, nevek] of napok) tegyel(datum, { fajta: 'nevnap', nevek: nevek.sort((a, b) => a.localeCompare(b, 'hu')) })
  }

  // Napon belüli sorrend: ünnep → programok (idő szerint, idő nélküli a
  // végén — a képernyős agenda szabálya) → anyakönyv → születésnap → névnap.
  const rang: Record<NapTetel['fajta'], number> = { unnep: 0, program: 1, anyakonyv: 2, szuletesnap: 3, nevnap: 4 }
  for (const arr of terkep.values()) {
    arr.sort((a, b) => {
      if (rang[a.fajta] !== rang[b.fajta]) return rang[a.fajta] - rang[b.fajta]
      if (a.fajta === 'program' && b.fajta === 'program') {
        const ta = a.p.ido_kezdes || '99:99'
        const tb = b.p.ido_kezdes || '99:99'
        if (ta !== tb) return ta.localeCompare(tb)
        return a.p.cim.localeCompare(b.p.cim, 'hu')
      }
      return 0
    })
  }
  return terkep
}

// ── Havi sorok ─────────────────────────────────────────────────────────────

function napCellaHtml(nap: number, dow: number): string {
  return `<b>${nap}.</b> <span class="dn">${HU_NAPNEVEK[dow]}</span>`
}

function tetelSor(datum: string, nap: number, dow: number, t: NapTetel, elso: boolean, input: EvesNaptarInput): Sor {
  const alap = {
    napBlokk: datum,
    elsoANapon: elso,
    napCella: napCellaHtml(nap, dow),
    napCellaFolyt: `<b>${nap}.</b> <span class="dn">${HU_NAPNEVEK[dow]}</span> <span class="folyt">(folyt.)</span>`,
    datumAttr: datum,
  }
  const vas = dow === 0 ? ' r-vas' : ''
  switch (t.fajta) {
    case 'unnep': {
      return {
        ...alap, osztaly: `r-unnep${vas}`, egyseg: 1,
        tartalomTd: `<td class="ido"></td><td class="tar"><span class="kr">✝</span> ${esc(t.nev)}</td>`,
      }
    }
    case 'program': {
      const meta = tipusMetaOf(input.tipusMeta, t.p)
      const szabadsag = t.p.tipus === 'szabadsag'
      const prio = t.p.prioritas === 'kiemelt' ? ' kiemelt' : t.p.prioritas === 'fontos' ? ' fontos' : ''
      const csillag = t.p.prioritas === 'kiemelt' ? ' <span class="csillag">★</span>' : ''
      const hely = t.p.helyszin && t.p.helyszin.trim() ? ` <span class="hely">· ${esc(t.p.helyszin.trim())}</span>` : ''
      const tobbnap = t.napokSzama > 1 ? ` <span class="meta">(${t.napSorszam}/${t.napokSzama}. nap)</span>` : ''
      const megj = szabadsag && t.p.megjegyzes && t.p.megjegyzes.trim() ? ` <span class="hely">— ${esc(t.p.megjegyzes.trim())}</span>` : ''
      const anyak = t.anyakonyvezve ? ' <span class="meta">✓ anyakönyvezve</span>' : ''
      const szovegHossz = (meta.emoji ? 2 : 0) + t.p.cim.length + (t.p.helyszin?.length ?? 0) + (t.napokSzama > 1 ? 12 : 0) + (megj ? (t.p.megjegyzes?.length ?? 0) + 3 : 0) + (anyak ? 16 : 0)
      return {
        ...alap, osztaly: `r-prog${szabadsag ? ' r-szab' : ''}${vas}`, egyseg: sorEgyseg('x'.repeat(szovegHossz), SOR_KARAKTER),
        tartalomTd: `<td class="ido">${esc(idoFelirat(t.p))}</td><td class="tar" data-tipus="${esc(t.p.tipus)}"><span class="ik" style="background:${esc(meta.szin)}"></span>${meta.emoji ? `<span class="em">${esc(meta.emoji)}</span> ` : ''}<span class="cim${prio}">${esc(t.p.cim)}</span>${csillag}${hely}${megj}${tobbnap}${anyak}</td>`,
      }
    }
    case 'anyakonyv': {
      return {
        ...alap, osztaly: `r-anyak${vas}`, egyseg: sorEgyseg(t.a.cim, SOR_KARAKTER),
        tartalomTd: `<td class="ido"></td><td class="tar"><span class="ak">◆</span> ${esc(t.a.cim)} <span class="meta">(anyakönyv)</span></td>`,
      }
    }
    case 'szuletesnap': {
      const sz = t.nevek.join(', ')
      return {
        ...alap, osztaly: `r-szul${vas}`, egyseg: sorEgyseg(`Születésnap: ${sz}`, SOR_KARAKTER),
        tartalomTd: `<td class="ido"></td><td class="tar"><span class="em">🎂</span> <span class="hely">Születésnap:</span> ${esc(sz)}</td>`,
      }
    }
    case 'nevnap': {
      const sz = t.nevek.join(', ')
      return {
        ...alap, osztaly: `r-nevnap${vas}`, egyseg: sorEgyseg(`Névnap: ${sz}`, SOR_KARAKTER),
        tartalomTd: `<td class="ido"></td><td class="tar"><span class="em">💐</span> <span class="hely">Névnap:</span> ${esc(sz)}</td>`,
      }
    }
  }
}

function uresSor(ev: number, honap1: number, tol: number, ig: number): Sor {
  const felirat = tol === ig ? `${tol}.: nincs alkalom` : `${tol}–${ig}.: nincs alkalom`
  const datum = ymdUTC(ev, honap1, tol)
  return {
    napBlokk: datum, elsoANapon: true, napCella: '', napCellaFolyt: '', datumAttr: datum,
    osztaly: 'r-ures', egyseg: 1,
    tartalomTd: `<td class="ures" colspan="3">${felirat}</td>`,
  }
}

function vasarnapUresSor(datum: string, nap: number): Sor {
  return {
    napBlokk: datum, elsoANapon: true,
    napCella: napCellaHtml(nap, 0), napCellaFolyt: napCellaHtml(nap, 0), datumAttr: datum,
    osztaly: 'r-vas r-vas-ures', egyseg: 1,
    tartalomTd: `<td class="ido"></td><td class="tar muted">—</td>`,
  }
}

/** Egy hónap sorai: minden nap képviselve (tétel-sor, üres vasárnap, vagy tömörített tartomány). */
function honapSorai(input: EvesNaptarInput, honap1: number, terkep: Map<string, NapTetel[]>): Sor[] {
  const sorok: Sor[] = []
  const dim = honapNapjai(input.ev, honap1)
  let uresTol: number | null = null
  const zarUres = (ig: number) => {
    if (uresTol !== null) {
      sorok.push(uresSor(input.ev, honap1, uresTol, ig))
      uresTol = null
    }
  }
  for (let nap = 1; nap <= dim; nap++) {
    const datum = ymdUTC(input.ev, honap1, nap)
    const dow = hetNapja(datum)
    const tetelek = terkep.get(datum) ?? []
    if (tetelek.length === 0) {
      // A vasárnap mindig saját sor (a heti ritmus a papíron is látszik);
      // a többi üres nap tartományba tömörül.
      if (dow === 0) {
        zarUres(nap - 1)
        sorok.push(vasarnapUresSor(datum, nap))
      } else if (uresTol === null) {
        uresTol = nap
      }
      continue
    }
    zarUres(nap - 1)
    tetelek.forEach((t, i) => sorok.push(tetelSor(datum, nap, dow, t, i === 0, input)))
  }
  zarUres(dim)
  return sorok
}

/** A sorok nap-blokkokra fogva (egy nap sorai együtt) — a tördelés egysége. */
function napBlokkok(sorok: Sor[]): Sor[][] {
  const blokkok: Sor[][] = []
  for (const s of sorok) {
    const utolso = blokkok[blokkok.length - 1]
    if (utolso && utolso[0].napBlokk === s.napBlokk) utolso.push(s)
    else blokkok.push([s])
  }
  return blokkok
}

const blokkEgyseg = (blokk: Sor[]) => blokk.reduce((a, s) => a + s.egyseg, 0)

/**
 * KÉT kiegyensúlyozott hasáb, ha az egész hónap egy lapra fér.
 *
 * MIÉRT: a mohó töltés egy 30 egységes hónapot EGY hasábba tett, a lap jobb
 * fele üresen maradt. A kiegyensúlyozott vágás (nap-határon, a két hasáb
 * maximumát minimalizálva) a lapot szélességében is kihasználja, és mindkét
 * hasáb rövidebb — könnyebben olvasható. Null, ha nincs olyan vágás, ahol
 * mindkét fél a kapacitáson belül marad (akkor a mohó út dönt).
 */
function kettoHasabKiegyensulyozva(blokkok: Sor[][], kapacitas: number): Sor[][] | null {
  if (blokkok.length < 2) return null
  const meretek = blokkok.map(blokkEgyseg)
  const osszes = meretek.reduce((a, b) => a + b, 0)
  if (osszes > 2 * kapacitas) return null
  let legjobb = -1
  let legjobbMax = Number.POSITIVE_INFINITY
  let bal = 0
  for (let i = 1; i < blokkok.length; i++) {
    bal += meretek[i - 1]
    const jobb = osszes - bal
    if (bal > kapacitas || jobb > kapacitas) continue
    const max = Math.max(bal, jobb)
    if (max < legjobbMax) { legjobbMax = max; legjobb = i }
  }
  if (legjobb < 0) return null
  return [blokkok.slice(0, legjobb).flat(), blokkok.slice(legjobb).flat()]
}

/** Determinisztikus hasábokra tördelés: a nap sorai együtt maradnak, ha férnek. */
function hasabokraTordel(sorok: Sor[], kapacitas: number): Sor[][] {
  const blokkok = napBlokkok(sorok)
  const kiegyensulyozott = kettoHasabKiegyensulyozva(blokkok, kapacitas)
  if (kiegyensulyozott) return kiegyensulyozott
  const hasabok: Sor[][] = [[]]
  let hasznalt = 0
  const uj = () => { hasabok.push([]); hasznalt = 0 }
  for (const blokk of blokkok) {
    const kell = blokkEgyseg(blokk)
    if (kell <= kapacitas) {
      if (hasznalt + kell > kapacitas && hasznalt > 0) uj()
      hasabok[hasabok.length - 1].push(...blokk)
      hasznalt += kell
      continue
    }
    // Egy nap, ami önmagában nagyobb egy hasábnál: soronként, folytatás-jellel.
    for (const s of blokk) {
      if (hasznalt + s.egyseg > kapacitas && hasznalt > 0) uj()
      hasabok[hasabok.length - 1].push(s)
      hasznalt += s.egyseg
    }
  }
  return hasabok
}

function hasabHtml(sorok: Sor[]): string {
  const tr = sorok.map((s, i) => {
    const napCella = s.osztaly === 'r-ures'
      ? ''
      : `<td class="nap">${s.elsoANapon ? s.napCella : (i === 0 ? s.napCellaFolyt : '')}</td>`
    return `<tr class="r ${s.osztaly}${s.elsoANapon ? ' nap-elso' : ''}" data-nap="${s.datumAttr}">${napCella}${s.tartalomTd}</tr>`
  }).join('')
  return `<table class="hs"><colgroup><col class="c-nap"><col class="c-ido"><col class="c-tar"></colgroup><tbody>${tr}</tbody></table>`
}

// ── Áttekintő lap ──────────────────────────────────────────────────────────

function miniHonap(input: EvesNaptarInput, honap1: number, terkep: Map<string, NapTetel[]>): string {
  const dim = honapNapjai(input.ev, honap1)
  let startDow = hetNapja(ymdUTC(input.ev, honap1, 1)) - 1
  if (startDow < 0) startDow = 6
  let cellak = ''
  for (let i = 0; i < startDow; i++) cellak += '<div class="mc ures"></div>'
  for (let nap = 1; nap <= dim; nap++) {
    const datum = ymdUTC(input.ev, honap1, nap)
    const dow = hetNapja(datum)
    const tetelek = terkep.get(datum) ?? []
    let unnep = false
    let szabadsag = false
    let anyakonyv = false
    const szinek: string[] = []
    for (const t of tetelek) {
      if (t.fajta === 'unnep') unnep = true
      else if (t.fajta === 'anyakonyv') anyakonyv = true
      else if (t.fajta === 'program') {
        if (t.p.tipus === 'szabadsag') { szabadsag = true; continue }
        if (t.p.tipus === 'kereszteles' || t.p.tipus === 'eskuvo' || t.p.tipus === 'konfirmacio' || t.p.tipus === 'temetes') anyakonyv = true
        const c = tipusMetaOf(input.tipusMeta, t.p).szin
        if (!szinek.includes(c) && szinek.length < 3) szinek.push(c)
      }
    }
    let cls = 'mc'
    if (dow === 0) cls += ' v'
    if (unnep) cls += ' u'
    if (szabadsag) cls += ' sz'
    const jelek = `${unnep ? '<span class="kr">✝</span>' : ''}${anyakonyv ? '<span class="ak">◆</span>' : ''}${szinek.map((c) => `<span class="pt" style="background:${esc(c)}"></span>`).join('')}`
    cellak += `<div class="${cls}" data-nap="${datum}"><span class="n">${nap}</span><span class="jel">${jelek}</span></div>`
  }
  const fej = DOW_FEJLEC.map((d, i) => `<div class="dow${i === 6 ? ' v' : ''}">${d}</div>`).join('')
  return `<div class="mh"><div class="mh-nev">${HU_HONAPOK[honap1 - 1]}</div><div class="mc-racs">${fej}${cellak}</div></div>`
}

/**
 * Jelmagyarázat CSAK a lapon ténylegesen előforduló típusokra. A forrás a
 * napi térkép (a NÉZETT év napjai), nem a nyers előfordulás-lista: a kibontott
 * sorozat előző évi alkalmai (a horizont miatt a listában vannak) különben
 * olyan típust magyaráznának, ami ebben az évben egyszer sem szerepel.
 */
function jelmagyarazat(input: EvesNaptarInput, terkep: Map<string, NapTetel[]>): string {
  const tipusok = new Map<string, EvesNaptarTipusMeta>()
  let vanSzabadsag = false
  let vanAnyakonyv = false
  let vanSzul = false
  let vanNevnap = false
  for (const arr of terkep.values()) {
    for (const t of arr) {
      if (t.fajta === 'anyakonyv') vanAnyakonyv = true
      else if (t.fajta === 'szuletesnap') vanSzul = true
      else if (t.fajta === 'nevnap') vanNevnap = true
      else if (t.fajta === 'program') {
        if (t.p.tipus === 'szabadsag') { vanSzabadsag = true; continue }
        if (t.p.tipus === 'kereszteles' || t.p.tipus === 'eskuvo' || t.p.tipus === 'konfirmacio' || t.p.tipus === 'temetes') vanAnyakonyv = true
        if (!tipusok.has(t.p.tipus)) tipusok.set(t.p.tipus, input.tipusMeta[t.p.tipus] ?? ISMERETLEN_TIPUS)
      }
    }
  }
  const tetelek: string[] = []
  for (const [, meta] of tipusok) {
    tetelek.push(`<span class="ji"><span class="pt" style="background:${esc(meta.szin)}"></span>${meta.emoji ? ` ${esc(meta.emoji)}` : ''} ${esc(meta.cimke)}</span>`)
  }
  tetelek.push('<span class="ji"><span class="kr">✝</span> Egyházi ünnep</span>')
  tetelek.push('<span class="ji"><span class="jv">7</span> Vasárnap</span>')
  if (vanSzabadsag) tetelek.push('<span class="ji"><span class="jsz"></span> Szabadság</span>')
  if (vanAnyakonyv) tetelek.push('<span class="ji"><span class="ak">◆</span> Anyakönyvi alkalom</span>')
  if (vanSzul) tetelek.push('<span class="ji">🎂 Születésnap (havi lapokon)</span>')
  if (vanNevnap) tetelek.push('<span class="ji">💐 Névnap (havi lapokon)</span>')
  tetelek.push('<span class="ji"><span class="csillag">★</span> Kiemelt alkalom</span>')
  return `<section class="jelm">${tetelek.join('')}</section>`
}

// ── Stíluslap ──────────────────────────────────────────────────────────────

function stilus(logoUrl: string | null | undefined): string {
  return `
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; background: #e5e7eb; padding: 20px; }
    .page { width: 297mm; height: 210mm; margin: 0 auto 18px; background: #fff; position: relative; overflow: hidden; padding: 8mm 10mm 10mm; break-after: page; page-break-after: always; box-shadow: 0 14px 34px -14px rgba(15,23,42,.4); }
    .page:last-child { break-after: auto; page-break-after: auto; margin-bottom: 0; }
    .topline { position: absolute; top: 0; left: 0; right: 0; height: 2.2mm; background: linear-gradient(90deg, #217c72 0%, #f3c061 50%, #217c72 100%); }
    .fej { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1.5px solid rgba(33,124,114,.45); padding: 2mm 0 1.5mm; margin-bottom: 2.5mm; }
    .fej-bal { display: flex; align-items: center; gap: 3mm; min-width: 0; }
    .logo { width: 11mm; height: 11mm; border-radius: 50%; flex: 0 0 auto; background: center / contain no-repeat; ${logoUrl ? `background-image: url('${logoUrl}');` : 'display: none;'} }
    .gy-al { font-size: 8.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #217c72; }
    .gy { font-family: Georgia, "Times New Roman", serif; font-size: 16px; font-weight: 700; color: #1a5f57; line-height: 1.1; }
    .fej-jobb { text-align: right; flex: 0 0 auto; }
    .lapcim { font-family: Georgia, "Times New Roman", serif; font-size: 19px; font-weight: 700; color: #217c72; line-height: 1.1; }
    .valtozat { font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: #8a6420; margin-top: 1px; }
    .lab { position: absolute; left: 10mm; right: 10mm; bottom: 4.5mm; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #dbece4; padding-top: 1.5mm; font-size: 8.5px; color: #66848c; }
    .lab-kozep { font-family: Georgia, serif; font-style: italic; color: #217c72; font-weight: 600; }
    .lab strong { color: #217c72; letter-spacing: .05em; }

    /* Áttekintő lap */
    .att-fej { display: grid; grid-template-columns: 1fr 1.35fr; gap: 8mm; align-items: center; margin: 2mm 0 4mm; }
    .att-cim { text-align: center; }
    .att-cim .gy { font-size: 24px; }
    .orn { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 2mm 0; color: #c79233; }
    .orn i { display: block; height: 1px; width: 60px; background: linear-gradient(90deg, transparent, #c79233); }
    .orn i:last-child { background: linear-gradient(90deg, #c79233, transparent); }
    .orn b { width: 7px; height: 7px; background: #f3c061; transform: rotate(45deg); }
    .ev { font-family: Georgia, serif; font-size: 15px; color: #66848c; }
    .ev strong { color: #217c72; font-size: 19px; }
    .vers { text-align: center; padding: 3mm 6mm; border-radius: 10px; border: 1px solid rgba(243,192,97,.6); background: linear-gradient(180deg, rgba(243,192,97,.16), #fff); }
    .vers-c { font-size: 8.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #c79233; margin-bottom: 1.5mm; }
    .vers-t { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 16px; line-height: 1.35; color: #294853; overflow-wrap: anywhere; }
    .vers-r { font-family: Georgia, serif; font-size: 12px; font-weight: 700; color: #217c72; margin-top: 1.5mm; }
    .mini-racs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4mm 5mm; }
    .mh-nev { font-family: Georgia, serif; font-weight: 700; font-size: 12.5px; color: #217c72; text-align: center; border-bottom: 1.5px solid rgba(33,124,114,.35); padding-bottom: 2px; margin-bottom: 3px; }
    .mc-racs { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
    .dow { font-size: 7.5px; font-weight: 700; color: #66848c; text-align: center; text-transform: uppercase; padding-bottom: 1px; }
    .dow.v { color: #c0584a; }
    .mc { min-height: 20px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 1px; border-radius: 3px; padding: 1.5px 0 1px; }
    .mc.ures { background: transparent; }
    .mc .n { font-size: 9px; line-height: 1; font-weight: 500; color: #1f2937; }
    .mc.v .n { color: #c0584a; font-weight: 700; }
    .mc.u { background: rgba(243,192,97,.26); box-shadow: inset 0 0 0 1px rgba(199,146,51,.55); }
    .mc.u .n { color: #8a6420; font-weight: 700; }
    .mc.sz { background: repeating-linear-gradient(135deg, rgba(132,204,22,.38) 0 2px, transparent 2px 5px); }
    .jel { display: flex; gap: 1.5px; align-items: center; height: 6px; }
    .pt { width: 5px; height: 5px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
    .kr { font-size: 7.5px; color: #c79233; line-height: 1; font-weight: 700; }
    .ak { font-size: 6.5px; color: #475569; line-height: 1; }
    .jelm { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin-top: 5mm; padding: 5px 12px; border: 1px solid #dbece4; border-radius: 8px; background: #f4faf7; font-size: 9.5px; color: #475569; }
    .ji { display: inline-flex; align-items: center; gap: 4px; }
    .jv { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; font-size: 8.5px; font-weight: 700; color: #c0584a; }
    .jsz { display: inline-block; width: 16px; height: 9px; border-radius: 2px; background: repeating-linear-gradient(135deg, rgba(132,204,22,.5) 0 2px, transparent 2px 5px); }
    .csillag { color: #c79233; font-size: 9px; }

    /* Havi lapok */
    .honap-cim { font-family: Georgia, "Times New Roman", serif; font-size: 15px; font-weight: 700; color: #1a5f57; margin: 0 0 2mm; }
    .hasabok { display: grid; grid-template-columns: 1fr 1fr; gap: 0 7mm; align-items: start; }
    table.hs { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9.5px; line-height: 1.25; }
    .c-nap { width: 21mm; } .c-ido { width: 17mm; }
    table.hs td { padding: 1.5px 3px; border-bottom: 1px solid #e6ecec; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    tr.nap-elso td { border-top: 1px solid #cfdcd8; }
    tr.r:first-child td { border-top: 0; }
    .nap b { font-size: 10.5px; color: #1f2937; }
    .dn { color: #66848c; font-size: 8.5px; }
    .folyt { color: #94a3b8; font-size: 8px; font-style: italic; }
    .r-vas .nap b, .r-vas .dn { color: #c0584a; }
    .ido { color: #217c72; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .r-unnep .tar { color: #8a6420; font-weight: 700; }
    .r-ures td { color: #94a3b8; font-style: italic; font-size: 8.5px; padding: 1px 3px; }
    .muted { color: #cbd5e1; }
    .ik { display: inline-block; width: 3px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
    .em { font-size: 9px; }
    .cim.fontos { font-weight: 600; }
    .cim.kiemelt { font-weight: 700; }
    .hely { color: #475569; }
    .meta { color: #94a3b8; font-size: 8.5px; }
    .r-szab .tar { background: repeating-linear-gradient(135deg, rgba(132,204,22,.22) 0 3px, transparent 3px 8px); }
    .r-anyak .tar { color: #334155; }

    @media print {
      body { background: #fff; padding: 0; }
      .page { margin: 0; box-shadow: none; }
    }
  `
}

// ── Fő építő ───────────────────────────────────────────────────────────────

export function buildEvesNaptar(input: EvesNaptarInput): EvesNaptarEredmeny {
  const ev = Number.isInteger(input.ev) ? input.ev : new Date().getUTCFullYear()
  const gyulekezet = (input.gyulekezetNev || '').trim() || 'Gyülekezet'
  const magan = new Set(input.maganTipusok)

  // A gyülekezeti példány: a MAGÁN típusú program a címével együtt kimarad.
  const programok = input.valtozat === 'gyulekezeti'
    ? input.elofordulasok.filter((p) => !magan.has(p.tipus))
    : input.elofordulasok.slice()

  const terkep = napTetelek({ ...input, ev }, programok)

  // Havi lapok — hónaponként hasábok, laponként EVES_NAPTAR_HASAB_PER_LAP hasáb.
  const haviLapok: Array<{ cim: string; hasabok: Sor[][] }> = []
  for (let h = 1; h <= 12; h++) {
    const hasabok = hasabokraTordel(honapSorai({ ...input, ev }, h, terkep), EVES_NAPTAR_HASAB_KAPACITAS)
    for (let i = 0; i < hasabok.length; i += EVES_NAPTAR_HASAB_PER_LAP) {
      haviLapok.push({
        cim: `${HU_HONAPOK[h - 1]}${i > 0 ? ' (folytatás)' : ''}`,
        hasabok: hasabok.slice(i, i + EVES_NAPTAR_HASAB_PER_LAP),
      })
    }
  }
  const sheetCount = 1 + haviLapok.length
  const valtozatCimke = input.valtozat === 'lelkeszi' ? 'Lelkészi példány' : 'Gyülekezeti terjesztésre'

  const fej = (lapcim: string) => `<div class="topline"></div><header class="fej">
    <div class="fej-bal"><div class="logo"></div><div><div class="gy-al">Gyülekezeti programterv</div><div class="gy">${esc(gyulekezet)}</div></div></div>
    <div class="fej-jobb"><div class="lapcim">${esc(lapcim)}</div><div class="valtozat">${esc(valtozatCimke)} · ${ev}</div></div>
  </header>`
  const lab = (lap: number) => `<footer class="lab">
    <span>${input.keszult ? `Készült: ${esc(input.keszult)}` : ''}</span>
    <span class="lab-kozep">✝ ${esc(gyulekezet)} · ${ev}. évi programterv</span>
    <span>${lap}/${sheetCount} · Készült a <strong>KARTOTÉKA</strong> rendszerrel</span>
  </footer>`

  const vers = input.vezerige && input.vezerige.text.trim()
    ? `<section class="vers"><div class="vers-c">Az év vezérigéje</div><div class="vers-t">&bdquo;${esc(input.vezerige.text.trim())}&rdquo;</div>${input.vezerige.ref.trim() ? `<div class="vers-r">${esc(input.vezerige.ref.trim())}</div>` : ''}</section>`
    : '<div></div>'

  const attekinto = `<div class="page" data-lap="1">
    ${fej('Áttekintő')}
    <div class="att-fej">
      <div class="att-cim"><div class="gy">${esc(gyulekezet)}</div><div class="orn"><i></i><b></b><i></i></div><div class="ev">Az Úr <strong>${ev}.</strong> esztendeje</div></div>
      ${vers}
    </div>
    <section class="mini-racs">${Array.from({ length: 12 }, (_, i) => miniHonap({ ...input, ev }, i + 1, terkep)).join('')}</section>
    ${jelmagyarazat({ ...input, ev }, terkep)}
    ${lab(1)}
  </div>`

  const havi = haviLapok.map((lap, i) => `<div class="page" data-lap="${i + 2}">
    ${fej(lap.cim)}
    <h2 class="honap-cim">${esc(lap.cim)} ${ev}</h2>
    <div class="hasabok">${lap.hasabok.map(hasabHtml).join('')}</div>
    ${lab(i + 2)}
  </div>`).join('')

  const title = `Éves programterv ${ev}`
  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(gyulekezet)} — ${esc(title)}</title><style>${stilus(input.logoUrl)}</style></head><body data-sheet-count="${sheetCount}">${attekinto}${havi}</body></html>`

  return {
    title,
    filename: `Eves_programterv_${ev}_${input.valtozat === 'lelkeszi' ? 'lelkeszi' : 'gyulekezeti'}.pdf`,
    orientation: 'landscape',
    html,
    sheetCount,
  }
}
