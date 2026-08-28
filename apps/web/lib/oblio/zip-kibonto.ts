/**
 * Szerveroldali ZIP-kibontó az e-Factura (ANAF SPV / Oblio Wallet) ZIP-ekhez.
 *
 * FÜGGŐSÉG: jszip — MÁR MEGLÉVŐ web-függőség (a böngészős Oblio-fül is ezt
 * használja, apps/web/package.json), és Node alatt is fut → NEM kellett új
 * csomagot (fflate) felvenni.
 *
 * Amit tud:
 *  - egy szint mélységig a BEÁGYAZOTT ZIP-eket is kibontja (az Oblio Wallet
 *    tömeges exportja ZIP-eken belüli, számlánkénti ZIP-eket ad),
 *  - az ANAF aláírás-XML-eket (semnatura_*.xml) kihagyja (csak zaj lenne),
 *  - ZIP-bomba elleni őrök: bejegyzés-darabszám + kicsomagolt összméret +
 *    fájlonkénti méret-plafon — túllépésnél az EGÉSZ kibontás hangos hibával
 *    áll le (fail-closed: részleges, félrevezető eredményt nem adunk).
 *
 * A függvények nem dobnak kivételt — az error mező magyarul jelez.
 */

import JSZip from 'jszip'
import { GYDOK_MAX_BYTES } from '@/lib/dokumentumtar/dokumentum-types'
import { fajlnevGyoker, SEMNATURA_TOKEN_RE } from './ubl-parser'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface KibontottSzamlaFajl {
  /** Fájlnév útvonal nélkül (a ZIP-en belüli mappákat eldobjuk). */
  fajlnev: string
  tipus: 'xml' | 'pdf'
  adat: Uint8Array
}

export interface SzamlaZipTartalom {
  fajlok: KibontottSzamlaFajl[]
  /** Kihagyott bejegyzések magyar indoklással (aláírás-XML, idegen típus…). */
  kihagyott: string[]
  error: string | null
}

/** XML + (opcionális) hozzá párosított PDF. */
export interface SzamlaFajlPar {
  xml: KibontottSzamlaFajl
  pdf: KibontottSzamlaFajl | null
}

// ─────────────────────────────────────────────────────────────────
// Őr-konstansok (ZIP-bomba ellen)
// ─────────────────────────────────────────────────────────────────

const MAX_FAJL_DARAB = 500
const MAX_OSSZ_MERET = 100 * 1024 * 1024 // 100 MB kicsomagolva
const MAX_ZIP_MELYSEG = 2 // zip-ben zip még igen, annál mélyebb már nem

// ─────────────────────────────────────────────────────────────────
// Kibontás
// ─────────────────────────────────────────────────────────────────

/** A ZIP-en belüli út utolsó szegmense (mappák eldobva) — regex nélkül. */
function csakFajlnev(ut: string): string {
  const perjelnel = ut.split('/').pop() || ut
  return perjelnel.split('\\').pop() || perjelnel
}

function alairasXml(fajlnev: string): boolean {
  // 2026-08-28 (Endre hibajelzése): token-alapú minta — az ANAF tömeges
  // ZIP-jében a `semnatura` a fájlnév KÖZEPÉN áll, a régi prefix-ellenőrzés
  // mellett átcsúszott. A minta a közös SEMNATURA_TOKEN_RE (ubl-parser).
  return SEMNATURA_TOKEN_RE.test(fajlnev)
}

/**
 * Egy e-Factura ZIP tartalmának kibontása (XML + PDF), a beágyazott ZIP-eket
 * egy szintig követve. Hibánál (rossz ZIP, őr-túllépés) az error mező szól.
 */
export async function kibontSzamlaZip(
  adat: ArrayBuffer | Uint8Array,
): Promise<SzamlaZipTartalom> {
  const eredmeny: SzamlaZipTartalom = { fajlok: [], kihagyott: [], error: null }
  // közös számlálók minden mélységre (a ZIP-bomba az össz-számokon bukjon el)
  const allapot = { darab: 0, osszMeret: 0 }
  try {
    await kibontEgySzintet(adat, 1, eredmeny, allapot)
    return eredmeny
  } catch (e) {
    return {
      fajlok: [],
      kihagyott: eredmeny.kihagyott,
      error: `A ZIP kibontása sikertelen: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

async function kibontEgySzintet(
  adat: ArrayBuffer | Uint8Array,
  melyseg: number,
  eredmeny: SzamlaZipTartalom,
  allapot: { darab: number; osszMeret: number },
): Promise<void> {
  const zip = await JSZip.loadAsync(adat)

  for (const bejegyzesUt of Object.keys(zip.files)) {
    const bejegyzes = zip.files[bejegyzesUt]
    if (bejegyzes.dir) continue

    allapot.darab++
    if (allapot.darab > MAX_FAJL_DARAB) {
      throw new Error(
        `túl sok fájl a ZIP-ben (${MAX_FAJL_DARAB} felett) — biztonsági okból leálltunk`,
      )
    }

    const fajlnev = csakFajlnev(bejegyzesUt)
    const kis = fajlnev.toLowerCase()

    // ANAF aláírás-XML: kihagyjuk (a hiteles számla maga a fő XML)
    if (alairasXml(fajlnev) && kis.endsWith('.xml')) {
      eredmeny.kihagyott.push(`${fajlnev} (ANAF aláírás-fájl — nem számla)`)
      continue
    }

    if (kis.endsWith('.zip')) {
      if (melyseg >= MAX_ZIP_MELYSEG) {
        eredmeny.kihagyott.push(`${fajlnev} (túl mélyen egymásba csomagolt ZIP — kihagyva)`)
        continue
      }
      const belsoAdat = await bejegyzes.async('uint8array')
      allapot.osszMeret += belsoAdat.byteLength
      if (allapot.osszMeret > MAX_OSSZ_MERET) {
        throw new Error('a kicsomagolt tartalom túl nagy (100 MB felett) — biztonsági okból leálltunk')
      }
      await kibontEgySzintet(belsoAdat, melyseg + 1, eredmeny, allapot)
      continue
    }

    if (!kis.endsWith('.xml') && !kis.endsWith('.pdf')) {
      eredmeny.kihagyott.push(`${fajlnev} (nem XML/PDF — kihagyva)`)
      continue
    }

    const tartalom = await bejegyzes.async('uint8array')
    allapot.osszMeret += tartalom.byteLength
    if (allapot.osszMeret > MAX_OSSZ_MERET) {
      throw new Error('a kicsomagolt tartalom túl nagy (100 MB felett) — biztonsági okból leálltunk')
    }
    if (tartalom.byteLength > GYDOK_MAX_BYTES) {
      // egy-egy óriásfájl nem állítja le a többit — de hangosan jelezzük
      eredmeny.kihagyott.push(`${fajlnev} (25 MB-nál nagyobb — a dokumentumtárba nem fér be, kihagyva)`)
      continue
    }
    if (tartalom.byteLength === 0) {
      eredmeny.kihagyott.push(`${fajlnev} (üres fájl — kihagyva)`)
      continue
    }

    eredmeny.fajlok.push({
      fajlnev,
      tipus: kis.endsWith('.xml') ? 'xml' : 'pdf',
      adat: tartalom,
    })
  }
}

// ─────────────────────────────────────────────────────────────────
// XML ↔ PDF párosítás (tiszta függvény — a selftest is hívhatja)
// ─────────────────────────────────────────────────────────────────

/**
 * ANAF fájlnév-minta azonosítók (a shared pdf-xml-name-matcher szemantikája,
 * regex nélkül):
 *   XML: `<BESZÁLLÍTÓ>_<SOROZAT>_<UPLOAD-INDEX>.xml` → utolsó 2 rész
 *   PDF: `<UPLOAD-INDEX>_<SOROZAT>.pdf`              → első 2 rész
 */
function anafNevAzonositok(
  fajlnev: string,
  tipus: 'xml' | 'pdf',
): { uuid: string; sorozat: string } | null {
  const gyok = fajlnevGyoker(fajlnev)
  const reszek = gyok.split('_')
  if (tipus === 'xml') {
    if (reszek.length < 3) return null
    const uuid = reszek[reszek.length - 1].trim()
    const sorozat = reszek[reszek.length - 2].trim().toUpperCase()
    return uuid && sorozat ? { uuid, sorozat } : null
  }
  if (reszek.length < 2) return null
  const uuid = reszek[0].trim()
  const sorozat = reszek[1].trim().toUpperCase()
  return uuid && sorozat ? { uuid, sorozat } : null
}

/**
 * A kibontott fájlokat számlánkénti XML+PDF párokba rendezi.
 *
 * Párosítási lánc (a webes Oblio-fül bevált sorrendje):
 *  1. fájlnév-gyök egyezés (ugyanaz az alapnév .xml/.pdf kiterjesztéssel),
 *  2. ANAF fájlnév-minta (UUID + sorozat egyezés),
 *  3. 1 XML + 1 PDF a csomagban → biztos pár.
 * Ami PDF így sem párosul: árva (a hívó dönt róla — mi nem találgatunk).
 */
export function parositSzamlaFajlok(fajlok: KibontottSzamlaFajl[]): {
  parok: SzamlaFajlPar[]
  arvaPdfek: KibontottSzamlaFajl[]
} {
  const xmlek = fajlok.filter((f) => f.tipus === 'xml')
  const pdfek = fajlok.filter((f) => f.tipus === 'pdf')

  const pdfXmlhez = new Map<KibontottSzamlaFajl, KibontottSzamlaFajl>() // xml → pdf
  const felhasznaltPdf = new Set<KibontottSzamlaFajl>()

  // 1. fájlnév-gyök egyezés
  for (const xml of xmlek) {
    const gyok = fajlnevGyoker(xml.fajlnev)
    const talalat = pdfek.find(
      (p) => !felhasznaltPdf.has(p) && fajlnevGyoker(p.fajlnev) === gyok,
    )
    if (talalat) {
      pdfXmlhez.set(xml, talalat)
      felhasznaltPdf.add(talalat)
    }
  }

  // 2. ANAF fájlnév-minta (UUID + sorozat)
  for (const xml of xmlek) {
    if (pdfXmlhez.has(xml)) continue
    const xmlIds = anafNevAzonositok(xml.fajlnev, 'xml')
    if (!xmlIds) continue
    const talalat = pdfek.find((p) => {
      if (felhasznaltPdf.has(p)) return false
      const pdfIds = anafNevAzonositok(p.fajlnev, 'pdf')
      return !!pdfIds && pdfIds.uuid === xmlIds.uuid && pdfIds.sorozat === xmlIds.sorozat
    })
    if (talalat) {
      pdfXmlhez.set(xml, talalat)
      felhasznaltPdf.add(talalat)
    }
  }

  // 3. pontosan 1+1 → biztos pár
  if (xmlek.length === 1 && pdfek.length === 1 && !pdfXmlhez.has(xmlek[0]) && !felhasznaltPdf.has(pdfek[0])) {
    pdfXmlhez.set(xmlek[0], pdfek[0])
    felhasznaltPdf.add(pdfek[0])
  }

  return {
    parok: xmlek.map((xml) => ({ xml, pdf: pdfXmlhez.get(xml) ?? null })),
    arvaPdfek: pdfek.filter((p) => !felhasznaltPdf.has(p)),
  }
}
