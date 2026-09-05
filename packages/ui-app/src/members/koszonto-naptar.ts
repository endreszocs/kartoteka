/**
 * SZÜLETÉSNAPOS ÉS NÉVNAPOS NAPTÁR — DOM-mentes, többlapos HTML-építő
 * (web + desktop KÖZÖS). 2026-09-05, Endre 2. pontja — a naptár-brief D5 döntése.
 *
 * MIÉRT KÜLÖN nyomtatvány, és miért nem a születésnapos lista-dialógus
 * táblája: a régi „Nyomtatás" egyetlen folyó táblázat volt hónap-fejléc,
 * névnap, lapszám-őr és PDF-út nélkül (`window.open` + `document.write`). A
 * lelkésznek viszont az íróasztalra egy NAPTÁR kell: havi blokkok, napi
 * sorok, egy pillantásra „kit köszöntünk ma".
 *
 * A4 ÁLLÓ, laponként teljes fejléc, havi blokk (hónapnév-sáv), napi sorok
 *   nap | 🎂 Név (kor) | 💐 Név (névnap-név)
 * lábléc: „Belső használatra — személyes adat" + „x/N".
 *
 * ADATVÉDELEM (cal-birthday-8): születési ÉV soha nem kerül a lapra, csak a
 * betöltött kor; a 18 alattiak kora ALAPBÓL NEM (csak a név); az „Életkor"
 * kapcsolóval a felnőtteké is elhagyható. A nyomtatás tényét a HÍVÓ naplózza
 * (a közös `naplozNaptarNyomtatas`, `koszonto` fajta).
 *
 * TISZTA FÜGGVÉNY: nincs DOM, nincs óra, nincs adatbázis. A bemenet a
 * `getNaptarRetegek(ev)` rétegeivel szerkezetileg kompatibilis — ugyanaz a
 * forrás, mint az éves programtervé (kitért-szűrés, névnap-egyeztetés EGY
 * helyen, az SQL-ben él).
 *
 * TÖRDELÉS determinisztikus, DOM-mérés nélkül: FIX 5 mm-es cellamagasság +
 * JS-oldali névvágás + `white-space: nowrap` — egy sor mindig EGY sor, a lap
 * kapacitása kiszámítható (a választói névjegyzék mintája). A hónap-fejléc
 * SOHA nem marad árván a lap alján, egy nap sorai együtt maradnak, ha férnek.
 *
 * ⚠️ Minden felhasználói szöveg `esc()`-en át kerül a HTML-be — a nyomtató-
 *    motor same-origin fut, ott már késő escape-elni.
 */

import { HU_HONAPOK, HU_NAPNEVEK_ROVID, esc, hetNapja, honapNapjai, ymdUTC } from '../dashboard/eves-naptar-print'

// ── Bemeneti szerződés ──────────────────────────────────────────────────────

/** Szerkezetileg a webes `SzuletesnapEsemeny` tükre (a réteg-olvasó adja). */
export interface KoszontoSzuletesnap {
  kulcs: string
  /** 'YYYY-MM-DD' — az évforduló napja a NÉZETT évben. */
  datum: string
  nev: string
  /** Hányadik születésnap (betöltött kor) az adott évben. */
  kor: number
}

/** Szerkezetileg a webes `NevnapEsemeny` tükre. */
export interface KoszontoNevnap {
  kulcs: string
  datum: string
  nev: string
  /** A katalógus neve, amire az egyezés történt (pl. „Anna"). */
  nevnapNev: string
  elsodleges?: boolean
}

export type KoszontoMod = 'mindketto' | 'szuletesnap' | 'nevnap'

export interface KoszontoNaptarOpciok {
  mod: KoszontoMod
  /** Életkor kiírása a felnőtteknél (alap: igen). */
  eletkor: boolean
  /** A 18 alattiak kora is (alap: NEM — a kiskorú csak névvel szerepel). */
  kiskoruKor: boolean
}

export const KOSZONTO_OPCIOK_ALAP: KoszontoNaptarOpciok = { mod: 'mindketto', eletkor: true, kiskoruKor: false }

export interface KoszontoNaptarInput {
  ev: number
  /** 1–12; ha tol > ig, az építő megcseréli. */
  honapTol: number
  honapIg: number
  gyulekezetNev: string
  /** Adat-URL ajánlott (a PDF-render biztosan látja); http(s) is működik. */
  logoUrl?: string | null
  szuletesnapok: KoszontoSzuletesnap[]
  nevnapok: KoszontoNevnap[]
  opciok?: Partial<KoszontoNaptarOpciok> | null
  /** „Készült: …" felirat — a hívó formázza (az építő nem néz órát). */
  keszult?: string | null
}

export interface KoszontoNaptarEredmeny {
  title: string
  filename: string
  orientation: 'portrait'
  html: string
  /** A lapok száma — a `<body data-sheet-count>` ugyanezt hordozza. */
  sheetCount: number
  /** A lapra került tételek száma (a naplózáshoz). */
  szuletesnapDb: number
  nevnapDb: number
}

// ── Állandók ────────────────────────────────────────────────────────────────

export const KOSZONTO_NAGYKORU_KOR = 18

/**
 * Sor-egység laponként. A4 álló 297 mm − 12 mm felső − 14 mm alsó margó −
 * 18 mm fejléc − 6 mm táblafejléc − 8 mm lábléc ≈ 239 mm; egy sor 5 mm →
 * 47 férne, 44-gyel ~15 mm tartalék marad (a hónap-sáv 7 mm = 2 egység).
 */
export const KOSZONTO_LAP_KAPACITAS = 44
const HONAP_FEJ_EGYSEG = 2
/** Karakter-plafon egy név-cellára (~79 mm, 10 px betű ≈ 2 mm/karakter). */
const MAX_NEV_KARAKTER = 38

// ── Segédek ─────────────────────────────────────────────────────────────────

/**
 * Az életkor felirata a szabályok szerint: '' vagy ' (NN)'.
 * A kiskorú (18 alatt) kora CSAK kifejezett kéréssel kerül a lapra.
 */
export function korFelirat(kor: number, opciok: Pick<KoszontoNaptarOpciok, 'eletkor' | 'kiskoruKor'>): string {
  if (!opciok.eletkor) return ''
  if (!Number.isFinite(kor)) return ''
  if (kor < KOSZONTO_NAGYKORU_KOR && !opciok.kiskoruKor) return ''
  return ` (${kor})`
}

/** JS-oldali egysoros vágás — determinisztikus sormagasság MINDEN renderelőben. */
function clip(v: string, max: number): string {
  const s = (v ?? '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function honapTartomany(tol: number, ig: number): [number, number] {
  const n = (v: number) => (Number.isInteger(v) ? Math.min(12, Math.max(1, v)) : 1)
  const a = n(tol)
  const b = Number.isInteger(ig) ? Math.min(12, Math.max(1, ig)) : 12
  return a <= b ? [a, b] : [b, a]
}

// ── Belső modell ────────────────────────────────────────────────────────────

interface KSor {
  osztaly: string
  /** A sor cellái (a nap-cellával együtt). */
  cellak: string
  /** Ugyanez lap-folytatásnál (a nap sorai szétszakadtak): a nap-cella „(folyt.)" jellel. */
  cellakFolyt: string
  egyseg: number
}

const sorEgysegOsszeg = (sorok: KSor[]) => sorok.reduce((a, s) => a + s.egyseg, 0)

// ── Fő építő ────────────────────────────────────────────────────────────────

export function buildKoszontoNaptar(input: KoszontoNaptarInput): KoszontoNaptarEredmeny {
  const ev = Number(input.ev)
  if (!Number.isInteger(ev) || ev < 1900 || ev > 2200) {
    throw new Error('A köszöntő naptárhoz érvényes év kell (1900–2200).')
  }
  const [tol, ig] = honapTartomany(input.honapTol, input.honapIg)
  const opciok: KoszontoNaptarOpciok = { ...KOSZONTO_OPCIOK_ALAP, ...(input.opciok ?? {}) }
  const mutatSzul = opciok.mod !== 'nevnap'
  const mutatNev = opciok.mod !== 'szuletesnap'
  const gyulekezet = (input.gyulekezetNev || '').trim() || 'Gyülekezet'

  // ── Napi térképek, a nézett évre és a hónap-tartományra szűrve ──
  const evStr = String(ev)
  const honapBenne = (datum: string) => {
    if (datum.slice(0, 4) !== evStr) return false
    const h = Number(datum.slice(5, 7))
    return h >= tol && h <= ig
  }
  const szulNap = new Map<string, KoszontoSzuletesnap[]>()
  if (mutatSzul) {
    for (const s of input.szuletesnapok) {
      if (!honapBenne(s.datum)) continue
      const arr = szulNap.get(s.datum) ?? []
      arr.push(s)
      szulNap.set(s.datum, arr)
    }
  }
  const nevNap = new Map<string, KoszontoNevnap[]>()
  if (mutatNev) {
    for (const n of input.nevnapok) {
      if (!honapBenne(n.datum)) continue
      const arr = nevNap.get(n.datum) ?? []
      arr.push(n)
      nevNap.set(n.datum, arr)
    }
  }
  // Ékezet-helyes rendezés (Ábel az Anna elé, nem a Zita mögé).
  for (const arr of szulNap.values()) arr.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
  for (const arr of nevNap.values()) arr.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))

  const oszlopok = 1 + (mutatSzul ? 1 : 0) + (mutatNev ? 1 : 0)
  let szuletesnapDb = 0
  let nevnapDb = 0

  // ── Sorok ──
  const napSorai = (datum: string, nap: number, dow: number): KSor[] => {
    const szul = szulNap.get(datum) ?? []
    const nevn = nevNap.get(datum) ?? []
    const k = Math.max(szul.length, nevn.length)
    const sorok: KSor[] = []
    const napCella = `<td class="nap"><b>${nap}.</b> <span class="dn">${HU_NAPNEVEK_ROVID[dow]}</span></td>`
    const napCellaFolyt = `<td class="nap"><b>${nap}.</b> <span class="dn">${HU_NAPNEVEK_ROVID[dow]}</span> <span class="folyt">(folyt.)</span></td>`
    for (let i = 0; i < k; i++) {
      let szulCella = ''
      if (mutatSzul) {
        const s = szul[i]
        if (s) {
          const korF = korFelirat(s.kor, opciok)
          szulCella = `<td class="szul">🎂 ${esc(clip(s.nev, MAX_NEV_KARAKTER - korF.length))}${korF ? `<span class="kor">${esc(korF)}</span>` : ''}</td>`
        } else szulCella = '<td class="szul"></td>'
      }
      let nevCella = ''
      if (mutatNev) {
        const n = nevn[i]
        nevCella = n
          ? `<td class="nevn">💐 ${esc(clip(n.nev, MAX_NEV_KARAKTER - Math.min(14, n.nevnapNev.length + 3)))} <span class="nn">(${esc(clip(n.nevnapNev, 12))})</span></td>`
          : '<td class="nevn"></td>'
      }
      const osztaly = `r-nap${dow === 0 ? ' v' : ''}${i === 0 ? ' nap-elso' : ''}`
      sorok.push({
        osztaly,
        cellak: `${i === 0 ? napCella : '<td class="nap"></td>'}${szulCella}${nevCella}`,
        cellakFolyt: `${napCellaFolyt}${szulCella}${nevCella}`,
        egyseg: 1,
      })
    }
    return sorok
  }

  // ── Lapokra tördelés (determinisztikus) ──
  const lapok: KSor[][] = [[]]
  let hasznalt = 0
  const ujLap = () => { lapok.push([]); hasznalt = 0 }
  const tesz = (s: KSor, folyt = false) => {
    lapok[lapok.length - 1].push(folyt ? { ...s, cellak: s.cellakFolyt } : s)
    hasznalt += s.egyseg
  }
  const utolsoFejlec = () => {
    const lap = lapok[lapok.length - 1]
    return lap.length > 0 && lap[lap.length - 1].osztaly === 'honap-fej'
  }

  for (let h = tol; h <= ig; h++) {
    const dim = honapNapjai(ev, h)
    const blokkok: KSor[][] = []
    let honapDb = 0
    for (let nap = 1; nap <= dim; nap++) {
      const datum = ymdUTC(ev, h, nap)
      const sz = szulNap.get(datum)?.length ?? 0
      const nv = nevNap.get(datum)?.length ?? 0
      if (sz === 0 && nv === 0) continue
      szuletesnapDb += sz
      nevnapDb += nv
      honapDb += sz + nv
      blokkok.push(napSorai(datum, nap, hetNapja(datum)))
    }
    if (blokkok.length === 0) {
      blokkok.push([{
        osztaly: 'r-ures',
        cellak: `<td colspan="${oszlopok}">Ebben a hónapban nincs köszöntendő.</td>`,
        cellakFolyt: `<td colspan="${oszlopok}">Ebben a hónapban nincs köszöntendő.</td>`,
        egyseg: 1,
      }])
    }
    const fejCella = `<td colspan="${oszlopok}">${HU_HONAPOK[h - 1]}<span class="db">${honapDb > 0 ? `${honapDb} köszöntendő` : ''}</span></td>`
    const fej: KSor = { osztaly: 'honap-fej', cellak: fejCella, cellakFolyt: fejCella, egyseg: HONAP_FEJ_EGYSEG }

    // A hónap-fejléc CSAK akkor kerül a lap aljára, ha legalább az első nap
    // (vagy annak legalább egy sora) még elfér alatta — árva fejléc nincs.
    const elsoBlokk = sorEgysegOsszeg(blokkok[0])
    const elsoKell = HONAP_FEJ_EGYSEG + (elsoBlokk <= KOSZONTO_LAP_KAPACITAS - HONAP_FEJ_EGYSEG ? elsoBlokk : 1)
    if (hasznalt > 0 && hasznalt + elsoKell > KOSZONTO_LAP_KAPACITAS) ujLap()
    tesz(fej)

    for (const blokk of blokkok) {
      const kell = sorEgysegOsszeg(blokk)
      const fer = hasznalt + kell <= KOSZONTO_LAP_KAPACITAS
      if (fer) {
        for (const s of blokk) tesz(s)
        continue
      }
      // Nem fér el egyben. Ha a lapon csak a hónap-fejléc áll (vagy a nap
      // önmagában nagyobb egy lapnál), soronként visszük át folytatás-jellel;
      // különben az egész nap átmegy az új lapra.
      if (kell <= KOSZONTO_LAP_KAPACITAS && !utolsoFejlec() && hasznalt > 0) {
        ujLap()
        for (const s of blokk) tesz(s)
        continue
      }
      blokk.forEach((s, i) => {
        if (hasznalt >= KOSZONTO_LAP_KAPACITAS) {
          ujLap()
          tesz(s, i > 0)
        } else tesz(s)
      })
    }
  }

  const sheetCount = lapok.length

  // ── HTML ──
  const cim = opciok.mod === 'mindketto'
    ? 'Születésnapos és névnapos naptár'
    : opciok.mod === 'szuletesnap' ? 'Születésnapos naptár' : 'Névnapos naptár'
  const tartomany = tol === 1 && ig === 12
    ? 'egész év'
    : tol === ig ? HU_HONAPOK[tol - 1].toLowerCase() : `${HU_HONAPOK[tol - 1].toLowerCase()} – ${HU_HONAPOK[ig - 1].toLowerCase()}`

  const colgroup = `<colgroup><col class="c-nap">${mutatSzul ? '<col class="c-szul">' : ''}${mutatNev ? '<col class="c-nevn">' : ''}</colgroup>`
  const thead = `<thead><tr><th>Nap</th>${mutatSzul ? '<th>🎂 Születésnap</th>' : ''}${mutatNev ? '<th>💐 Névnap</th>' : ''}</tr></thead>`

  const fejlec = `<div class="topline"></div><header class="fej">
    <div class="fej-bal"><div class="logo"></div><div><div class="gy-al">Köszöntő naptár</div><div class="gy">${esc(gyulekezet)}</div></div></div>
    <div class="fej-jobb"><div class="lapcim">${esc(cim)}</div><div class="alcim">${ev} · ${esc(tartomany)}</div></div>
  </header>`
  const lablec = (lap: number) => `<footer class="lab">
    <span class="figy">Belső használatra — személyes adat</span>
    <span>${lap}/${sheetCount}</span>
    <span>${input.keszult ? `Készült: ${esc(input.keszult)} · ` : ''}<strong>KARTOTÉKA</strong></span>
  </footer>`

  const lapokHtml = lapok.map((sorok, i) => `<div class="page" data-lap="${i + 1}">
    ${fejlec}
    <table class="kn">${colgroup}${thead}<tbody>${sorok.map((s) => `<tr class="${s.osztaly}">${s.cellak}</tr>`).join('')}</tbody></table>
    ${lablec(i + 1)}
  </div>`).join('')

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(gyulekezet)} — ${esc(cim)} ${ev}</title><style>${stilus(input.logoUrl)}</style></head><body data-sheet-count="${sheetCount}">${lapokHtml}</body></html>`

  return {
    title: `${cim} ${ev}`,
    filename: `Koszonto_naptar_${ev}_${String(tol).padStart(2, '0')}-${String(ig).padStart(2, '0')}.pdf`,
    orientation: 'portrait',
    html,
    sheetCount,
    szuletesnapDb,
    nevnapDb,
  }
}

// ── Stíluslap ───────────────────────────────────────────────────────────────

function stilus(logoUrl: string | null | undefined): string {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; background: #e5e7eb; padding: 20px; }
    .page { width: 210mm; height: 297mm; margin: 0 auto 18px; background: #fff; position: relative; overflow: hidden; padding: 12mm 14mm 14mm 16mm; break-after: page; page-break-after: always; box-shadow: 0 14px 34px -14px rgba(15,23,42,.4); }
    .page:last-child { break-after: auto; page-break-after: auto; margin-bottom: 0; }
    .topline { position: absolute; top: 0; left: 0; right: 0; height: 2.2mm; background: linear-gradient(90deg, #217c72 0%, #f3c061 50%, #217c72 100%); }
    .fej { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1.5px solid rgba(33,124,114,.45); padding: 2mm 0 2mm; margin-bottom: 3mm; }
    .fej-bal { display: flex; align-items: center; gap: 3mm; min-width: 0; }
    .logo { width: 12mm; height: 12mm; border-radius: 50%; flex: 0 0 auto; background: center / contain no-repeat; ${logoUrl ? `background-image: url('${logoUrl}');` : 'display: none;'} }
    .gy-al { font-size: 8.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #217c72; }
    .gy { font-family: Georgia, "Times New Roman", serif; font-size: 15px; font-weight: 700; color: #1a5f57; line-height: 1.1; }
    .fej-jobb { text-align: right; flex: 0 0 auto; }
    .lapcim { font-family: Georgia, "Times New Roman", serif; font-size: 17px; font-weight: 700; color: #217c72; line-height: 1.1; }
    .alcim { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: #8a6420; margin-top: 2px; }
    table.kn { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 10px; }
    .c-nap { width: 24mm; }
    th { height: 6mm; background: #f4faf7; border-bottom: 1.5px solid #cfdcd8; text-align: left; padding: 0 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: #217c72; }
    td { height: 5mm; padding: 0 6px; border-bottom: 1px solid #e6ecec; white-space: nowrap; overflow: hidden; vertical-align: middle; }
    tr.honap-fej td { height: 7mm; background: #217c72; color: #fff; font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: 11.5px; letter-spacing: .04em; border-bottom: 0; }
    tr.honap-fej td .db { font-family: "Segoe UI", system-ui, sans-serif; font-weight: 400; font-size: 8.5px; opacity: .85; margin-left: 8px; letter-spacing: 0; }
    tr.nap-elso td { border-top: 1px solid #cfdcd8; }
    tr.honap-fej + tr td { border-top: 0; }
    .nap b { font-size: 10.5px; color: #1f2937; }
    .dn { color: #66848c; font-size: 8.5px; }
    .folyt { color: #94a3b8; font-size: 8px; font-style: italic; }
    tr.v .nap b, tr.v .dn { color: #c0584a; }
    .kor { color: #217c72; font-weight: 700; }
    .nn { color: #66848c; font-size: 9px; }
    tr.r-ures td { color: #94a3b8; font-style: italic; }
    .lab { position: absolute; left: 16mm; right: 14mm; bottom: 5mm; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #dbece4; padding-top: 1.5mm; font-size: 8.5px; color: #66848c; }
    .lab .figy { color: #b45309; font-weight: 700; }
    .lab strong { color: #217c72; letter-spacing: .05em; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { margin: 0; box-shadow: none; }
    }
  `
}
