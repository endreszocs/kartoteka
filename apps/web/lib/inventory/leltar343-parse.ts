/**
 * Leltar 3_43 — munkafüzet-beolvasó (szerver-oldali, 2026-08-26).
 *
 * SheetJS-szel olvassuk a KITÖLTENDŐ lapokat (a 7 kategória-lap + Cimlap) —
 * a `sheets` opció miatt a származtatott, több tízezer képletcellás lapokat
 * (Hibak, Fisa, Leltariv…) be sem töltjük, így egy nagy, kitöltött megyei
 * fájl is gyorsan és kis memóriával megy át.
 *
 * A cellaszemantika (oszlopjelentések, alapértelmezések, negatív sorok) a
 * tiszta leltar343-shared rétegben él — itt CSAK cellából-nyers-sor olvasás van.
 */

import * as XLSX from 'xlsx'
import {
  LELTAR343_CIMLAP,
  LELTAR343_KATEGORIA_LAPOK,
  type Leltar343Lap,
  type Leltar343NyersSor,
  joinHelyszinFelelos,
} from './leltar343-shared'

export interface Leltar343CimlapAdatok {
  egyhazmegye: string | null
  intezmeny: string | null
  vezeto: string | null
  parok: Array<{ helyszin: string | null; felelos: string | null }>
}

export interface Leltar343ParsedLap {
  lap: Leltar343Lap
  sorok: Leltar343NyersSor[]
}

export interface Leltar343Parsed {
  cimlap: Leltar343CimlapAdatok
  lapok: Leltar343ParsedLap[]
  /** G-oszlop érték → { helyszin, felelos } a Cimlap katalógusából. */
  helyszinKatalogus: Map<string, { helyszin: string | null; felelos: string | null }>
  hianyzoLapok: string[]
}

function cellaSzoveg(ws: XLSX.WorkSheet, ref: string): string | null {
  const c = ws[ref]
  if (!c || c.v == null) return null
  const s = String(c.v).trim()
  return s || null
}

function cellaSzam(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref]
  if (!c || c.v == null || c.v === '') return null
  const n = Number(c.v)
  return Number.isFinite(n) ? n : null
}

function utolsoSor(ws: XLSX.WorkSheet, lap: Leltar343Lap): number {
  // ⚠️ A lap ADAT-TERÜLETE véges (5 … 4+kapacitás): a Csekely lap 3005. sorától
  // belső tükör-segédterület él (más lapok tartalmát másolja képletekkel) — a
  // lapméretig olvasó változat ezt ADATNAK nézte, és több ezer hamis
  // „hiányzó megnevezés" hibát adott. A lapvédelem miatt a kitöltő az
  // adat-területen kívül amúgy sem rögzíthet tételt.
  const plafon = 4 + lap.kapacitas
  const ref = ws['!ref']
  if (!ref) return 0
  try {
    return Math.min(XLSX.utils.decode_range(ref).e.r + 1, plafon)
  } catch {
    return plafon
  }
}

function olvasLap(ws: XLSX.WorkSheet, lap: Leltar343Lap): Leltar343NyersSor[] {
  const sorok: Leltar343NyersSor[] = []
  const vege = utolsoSor(ws, lap)
  for (let r = 5; r <= vege; r += 1) {
    const sor: Leltar343NyersSor = {
      sor: r,
      eOszlop: cellaSzoveg(ws, `E${r}`),
      fOszlop: cellaSzoveg(ws, `F${r}`),
      helyszinFelelos: cellaSzoveg(ws, `G${r}`),
      leltariSzam: cellaSzoveg(ws, `H${r}`),
      ev: cellaSzam(ws, `I${r}`),
      ho: cellaSzam(ws, `J${r}`),
      nap: cellaSzam(ws, `K${r}`),
      ertek: cellaSzam(ws, `L${r}`),
      mennyiseg: cellaSzam(ws, `M${r}`),
      mertekegyseg: cellaSzoveg(ws, `N${r}`),
      beszerzesiIrat: cellaSzoveg(ws, `O${r}`),
      torlesEv: cellaSzam(ws, `P${r}`),
      torlesHo: cellaSzam(ws, `Q${r}`),
      torlesNap: cellaSzam(ws, `R${r}`),
      torlesSzoveg: cellaSzoveg(ws, `S${r}`),
      hasznalatiIdo: lap.alapeszkozOszlopok ? cellaSzam(ws, `T${r}`) : null,
      tipusNev: lap.alapeszkozOszlopok ? cellaSzoveg(ws, `U${r}`) : null,
    }
    sorok.push(sor)
  }
  return sorok
}

/** Csak a lapnevek beolvasása (gyors felismerés, tartalom-parse nélkül). */
export function leltar343LapNevek(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: 'array', bookSheets: true })
  return wb.SheetNames || []
}

export function parseLeltar343Workbook(buffer: ArrayBuffer): Leltar343Parsed {
  const kellLapok = [LELTAR343_CIMLAP, ...LELTAR343_KATEGORIA_LAPOK.map(l => l.sheet)]
  const wb = XLSX.read(buffer, {
    type: 'array',
    sheets: kellLapok,
    cellHTML: false,
    cellText: false,
  })

  // — Cimlap —
  const cimlapWs = wb.Sheets[LELTAR343_CIMLAP]
  const cimlap: Leltar343CimlapAdatok = {
    egyhazmegye: null,
    intezmeny: null,
    vezeto: null,
    parok: [],
  }
  const helyszinKatalogus = new Map<string, { helyszin: string | null; felelos: string | null }>()
  if (cimlapWs) {
    cimlap.egyhazmegye = cellaSzoveg(cimlapWs, 'A2')
    cimlap.intezmeny = cellaSzoveg(cimlapWs, 'A4')
    cimlap.vezeto = cellaSzoveg(cimlapWs, 'A6')
    for (let r = 8; r <= 107; r += 1) {
      const helyszin = cellaSzoveg(cimlapWs, `B${r}`)
      const felelos = cellaSzoveg(cimlapWs, `C${r}`)
      if (!helyszin && !felelos) continue
      cimlap.parok.push({ helyszin, felelos })
      // A G-oszlop legördülője a Cimlap D-képletének szövegét hordozza —
      // ugyanazzal az összefűzéssel kulcsolunk, hogy pontos találat legyen.
      helyszinKatalogus.set(
        joinHelyszinFelelos(helyszin, felelos, cimlap.vezeto),
        { helyszin, felelos },
      )
    }
  }

  // — Kategória-lapok —
  const lapok: Leltar343ParsedLap[] = []
  const hianyzoLapok: string[] = []
  for (const lap of LELTAR343_KATEGORIA_LAPOK) {
    const ws = wb.Sheets[lap.sheet]
    if (!ws) {
      hianyzoLapok.push(lap.sheet)
      continue
    }
    lapok.push({ lap, sorok: olvasLap(ws, lap) })
  }

  return { cimlap, lapok, helyszinKatalogus, hianyzoLapok }
}
