/**
 * @kartoteka/enekeskonyv — Erdélyi Református Énekeskönyv adat + kereső API.
 *
 * Adatforrás: src/data/enekeskonyv.json — a scripts/convert-ere-dtx.mjs generálja
 * az ERE.dtx (Diatár) fájlból. KÉZZEL NE szerkeszd, a konvertert futtasd újra.
 *
 * Tartalom: 513 ének (1–150 genfi zsoltár + 151–504 dicséret), 18 betűs változat
 * (pl. 152a, 400a/400b), 2697 versszak, 44 tematikus szakaszfejléc.
 * A zsoltárok szintetikus "Zsoltárok" szakaszt kapnak (a fájlban nincs fejlécük).
 */

import rawData from './data/enekeskonyv.json'
import { normalizeSearchText, type Enek } from './normalize'

// A típus és a normalizáló az adat-mentes ./normalize almodulban él, hogy a
// korpusz nélkül is importálható legyen — innen re-exportáljuk kompatibilitásból.
export { normalizeSearchText, type Enek } from './normalize'

interface EnekeskonyvData {
  forras: string
  /** A 44 szakaszfejléc a könyvbeli sorrendben (nevek ismétlődhetnek, pl. "Karácsony" 2×). */
  szakaszok: string[]
  enekek: Enek[]
}

const data = rawData as unknown as EnekeskonyvData

/** Az összes ének a könyvbeli sorrendben (csak olvasásra). */
export const enekek: readonly Enek[] = data.enekek

// ---------------------------------------------------------------------------
// Indexek (modul-betöltéskor épülnek, 513 éneken olcsó)
// ---------------------------------------------------------------------------

const byAzonosito = new Map<string, Enek>()
const bySzam = new Map<number, Enek[]>()
for (const enek of data.enekek) {
  byAzonosito.set(enek.azonosito, enek)
  const lista = bySzam.get(enek.szam)
  if (lista) lista.push(enek)
  else bySzam.set(enek.szam, [enek])
}

interface KeresoIndexSor {
  enek: Enek
  cimNorm: string
  elsoSorNorm: string
  szovegNorm: string
}

let keresoIndex: KeresoIndexSor[] | null = null

function getKeresoIndex(): KeresoIndexSor[] {
  if (!keresoIndex) {
    keresoIndex = data.enekek.map((enek) => ({
      enek,
      cimNorm: enek.cim ? normalizeSearchText(enek.cim) : '',
      elsoSorNorm: normalizeSearchText(enek.elsoSor),
      szovegNorm: normalizeSearchText(enek.versszakok.join('\n')),
    }))
  }
  return keresoIndex
}

// ---------------------------------------------------------------------------
// Kereső API
// ---------------------------------------------------------------------------

/**
 * Szám-szerű azonosító felbontása: '400b', '400B', '400/B', '400. b', ' 23 ' → {szam, betu}.
 * Ha nem szám-szerű, null.
 */
function parseAzonosito(query: string): { szam: number; betu: string | null } | null {
  const m = query.trim().match(/^(\d+)\s*[/.\-]?\s*([a-zA-Z])?\.?$/)
  if (!m) return null
  return { szam: Number(m[1]), betu: m[2] ? m[2].toLowerCase() : null }
}

/**
 * Ének lekérése azonosító alapján. Tűri a '400B' és '400/B' írásmódot is.
 * Ha betű nélkül kérik, de csak betűs változatok léteznek (pl. '400' → 400a/400b),
 * az első ('a') változatot adja vissza.
 */
export function getEnek(azonosito: string | number): Enek | null {
  const parsed = typeof azonosito === 'number' ? { szam: azonosito, betu: null } : parseAzonosito(azonosito)
  if (!parsed) return null
  if (parsed.betu) return byAzonosito.get(`${parsed.szam}${parsed.betu}`) ?? null
  const sima = byAzonosito.get(String(parsed.szam))
  if (sima) return sima
  const valtozatok = bySzam.get(parsed.szam)
  return valtozatok?.[0] ?? null
}

/** Egy szám összes változata (pl. 400 → [400a, 400b]; 23 → [23]). */
export function getEnekValtozatok(szam: number): Enek[] {
  return bySzam.get(szam) ?? []
}

/** Cím szerinti keresés (ékezet-toleráns részszöveg-egyezés; zsoltároknál az első sorban keres). */
export function searchByTitle(query: string, limit = 20): Enek[] {
  const q = normalizeSearchText(query)
  if (q === '') return []
  const talalatok: { enek: Enek; pontszam: number }[] = []
  for (const sor of getKeresoIndex()) {
    const cel = sor.cimNorm !== '' ? sor.cimNorm : sor.elsoSorNorm
    const idx = cel.indexOf(q)
    if (idx >= 0) talalatok.push({ enek: sor.enek, pontszam: idx })
  }
  talalatok.sort((a, b) => a.pontszam - b.pontszam || a.enek.szam - b.enek.szam)
  return talalatok.slice(0, limit).map((t) => t.enek)
}

/** Énekszöveg szerinti keresés (ékezet-toleráns részszöveg-egyezés a versszakokban). */
export function searchByText(query: string, limit = 20): Enek[] {
  const q = normalizeSearchText(query)
  if (q === '') return []
  const talalatok: { enek: Enek; pontszam: number }[] = []
  for (const sor of getKeresoIndex()) {
    const idx = sor.szovegNorm.indexOf(q)
    if (idx >= 0) talalatok.push({ enek: sor.enek, pontszam: idx })
  }
  talalatok.sort((a, b) => a.pontszam - b.pontszam || a.enek.szam - b.enek.szam)
  return talalatok.slice(0, limit).map((t) => t.enek)
}

/**
 * Egyesített keresés:
 *  - szám-szerű query ('23', '400b', '400/B') → szám szerinti találat(ok),
 *    majd a számmal kezdődő további énekek ('40' → 40, 400a, 400b, 401…);
 *  - egyébként cím- és szöveg-találatok relevancia-sorrendben
 *    (címkezdet < cím-részlet < első sor < versszak-részlet).
 */
export function searchEnek(query: string, limit = 20): Enek[] {
  const q = query.trim()
  if (q === '') return []

  const parsed = parseAzonosito(q)
  if (parsed) {
    const eredmeny: Enek[] = []
    if (parsed.betu) {
      const pontos = byAzonosito.get(`${parsed.szam}${parsed.betu}`)
      if (pontos) eredmeny.push(pontos)
    } else {
      eredmeny.push(...(bySzam.get(parsed.szam) ?? []))
      // szám-prefix találatok: '40' → 400a, 401… (a pontos találat után)
      const prefix = String(parsed.szam)
      for (const enek of data.enekek) {
        if (enek.szam !== parsed.szam && String(enek.szam).startsWith(prefix)) {
          eredmeny.push(enek)
          if (eredmeny.length >= limit) break
        }
      }
    }
    return eredmeny.slice(0, limit)
  }

  const qNorm = normalizeSearchText(q)
  const talalatok: { enek: Enek; pontszam: number }[] = []
  for (const sor of getKeresoIndex()) {
    const cimCel = sor.cimNorm !== '' ? sor.cimNorm : sor.elsoSorNorm
    let pontszam: number | null = null
    if (cimCel.startsWith(qNorm)) pontszam = 0
    else if (cimCel.includes(qNorm)) pontszam = 1
    else if (sor.elsoSorNorm.includes(qNorm)) pontszam = 2
    else if (sor.szovegNorm.includes(qNorm)) pontszam = 3
    if (pontszam !== null) talalatok.push({ enek: sor.enek, pontszam })
  }
  talalatok.sort((a, b) => a.pontszam - b.pontszam || a.enek.szam - b.enek.szam)
  return talalatok.slice(0, limit).map((t) => t.enek)
}

/**
 * Tematikus szakaszok listája első előfordulás szerinti sorrendben, a szintetikus
 * "Zsoltárok"-kal az élen. Az ismétlődő fejlécnevek (pl. "Karácsony" a fő részben
 * és a bibliaórai részben is) egyszer szerepelnek; az "Énekek bibliaórákra…"
 * rész-cím nem jelenik meg, mert alá közvetlenül nem tartozik ének (al-fejlécei
 * vannak). Eredmény: 38 elem (37 fejlécnév + "Zsoltárok").
 */
export function listSzakaszok(): string[] {
  const latott = new Set<string>()
  const eredmeny: string[] = []
  for (const enek of data.enekek) {
    if (!latott.has(enek.szakasz)) {
      latott.add(enek.szakasz)
      eredmeny.push(enek.szakasz)
    }
  }
  return eredmeny
}

/** Egy szakasz énekei a könyvbeli sorrendben. */
export function getEnekekBySzakasz(szakasz: string): Enek[] {
  return data.enekek.filter((enek) => enek.szakasz === szakasz)
}
