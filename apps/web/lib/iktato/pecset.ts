/**
 * Iktató F8d — digitális iktató-pecsét + kliens-oldali dokumentum-tömörítés.
 *
 * Tervdoc: docs/project-tracking/KARTOTEKA-iktato-szkenneles-kutatas-2026-07-25.md
 *
 * Három pure util a szkenner-varázsló számára ('use client'-kompatibilis,
 * nincs szerver-oldali függőség — böngésző-API-kra épül):
 *
 *  - compressDocumentImage: telefonos fotó tömörítése (browser-image-compression
 *    — az EXIF-orientációt és az iOS Safari canvas-plafont a könyvtár kezeli).
 *  - stampImageFooterStrip: „footer-strip" pecsét — a kép ALÁ fehér sáv kerül,
 *    a pecsét-szöveg ebbe íródik, így GARANTÁLTAN nem takar tartalmat.
 *  - stampPdf: pdf-lib (LAZY import!) — az első oldal alsó margójára kis szürke
 *    pecsét-sor; ha a margó szűknek tűnik (pl. teljes lapos szkennelt kép),
 *    MediaBox-magasítás +40 pt fehér sávval alul.
 *
 * Tárolási elv (tervdoc 4. pont): az EREDETI és a PECSÉTELT fájl KÜLÖN úton
 * tárolandó — ezek a függvények csak az átalakított File-t adják vissza, a
 * hívó dönt a feltöltési utakról. Hiba esetén magyar üzenetű PecsetHiba dobódik,
 * és a hívó dönti el, hogy az eredetit tölti-e fel.
 */

// ─────────────────────────────────────────────────────────────────
// Publikus típusok
// ─────────────────────────────────────────────────────────────────

/** A pecsét tartalma — a hívó (szkenner-varázsló / csatolmány-panel) állítja össze. */
export interface PecsetAdat {
  /** Iktatószám, pl. „12/2026". */
  iktatoszam: string
  /** Megjelenítésre kész dátum, pl. „2026. július 25.". */
  datum: string
  /** Iratcsomó megnevezése (ha van) — null esetén a sor elmarad. */
  iratcsomo: string | null
  /** A gyülekezet megjelenítendő neve. */
  gyulekezet: string
}

/**
 * A pecsételő/tömörítő útvonal saját hibatípusa — mindig magyar, felhasználónak
 * mutatható üzenettel. A hívó `instanceof PecsetHiba` alapján dönthet úgy, hogy
 * az EREDETI fájlt tölti fel pecsét/tömörítés nélkül.
 */
export class PecsetHiba extends Error {
  constructor(uzenet: string, options?: { cause?: unknown }) {
    super(uzenet, options)
    this.name = 'PecsetHiba'
  }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek
// ─────────────────────────────────────────────────────────────────

/** Fájlnév kiterjesztés nélkül (üres névre biztonságos alapérték). */
function fajlnevTorzs(nev: string): string {
  const pont = nev.lastIndexOf('.')
  const torzs = pont > 0 ? nev.slice(0, pont) : nev
  return torzs.trim() || 'dokumentum'
}

/** A pecsét két sora: fő sor + opcionális iratcsomó-sor (kontraktus-szöveg). */
function pecsetSorok(pecset: PecsetAdat): { sor1: string; sor2: string | null } {
  const sor1 = `${pecset.gyulekezet.trim()} — Iktatva: ${pecset.iktatoszam.trim()} · ${pecset.datum.trim()}`
  const iratcsomo = (pecset.iratcsomo || '').trim()
  return { sor1, sor2: iratcsomo ? `Iratcsomó: ${iratcsomo}` : null }
}

/** Böngésző-környezet őr — a canvas-alapú függvények csak kliensen futhatnak. */
function csakBongeszoben(muvelet: string): void {
  if (typeof document === 'undefined') {
    throw new PecsetHiba(`A ${muvelet} csak böngészőben futtatható (nincs elérhető canvas).`)
  }
}

/**
 * Kép betöltése rajzolható formába. Elsőként createImageBitmap (gyors, a modern
 * böngészők az EXIF-orientációt is alkalmazzák), tartalékként HTMLImageElement.
 * Megjegyzés: a pecsételendő kép tipikusan már a compressDocumentImage kimenete,
 * amelyben az orientáció „bele van sütve" a pixelekbe.
 */
async function betoltKep(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // esünk tovább a klasszikus <img>-es útra
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new PecsetHiba('A kép nem tölthető be — a fájl sérült lehet, vagy a böngésző nem támogatja a formátumát.'))
    }
    img.src = url
  })
}

/** canvas → JPEG File (q0.85 a kontraktus szerint). */
async function canvasJpegFile(canvas: HTMLCanvasElement, nev: string, minoseg: number): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/jpeg', minoseg)
    } catch {
      resolve(null)
    }
  })
  if (!blob || blob.size === 0) {
    throw new PecsetHiba('A pecsételt kép elkészítése nem sikerült (a böngésző nem tudta JPEG-gé alakítani a canvast).')
  }
  return new File([blob], nev, { type: 'image/jpeg', lastModified: Date.now() })
}

/** Szöveg csonkolása „…"-tal, hogy beférjen a megadott szélességbe (canvas). */
function csonkolCanvasSzoveg(ctx: CanvasRenderingContext2D, szoveg: string, maxSzeles: number): string {
  if (ctx.measureText(szoveg).width <= maxSzeles) return szoveg
  let s = szoveg
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxSzeles) {
    s = s.slice(0, -1)
  }
  return `${s.trimEnd()}…`
}

// ─────────────────────────────────────────────────────────────────
// 1) Kliens-oldali tömörítés — browser-image-compression
// ─────────────────────────────────────────────────────────────────

/**
 * Kiterjesztés → MIME. Egyes Android-böngészők ÜRES `type`-pal adják a
 * kamera-fájlt, a browser-image-compression viszont keményen elutasítja az
 * ilyet („The file given is not an image"), ezért ilyenkor a kiterjesztésből
 * pótoljuk a MIME-ot, és a File-t újracsomagoljuk a könyvtár hívása előtt.
 */
const KITERJESZTES_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** A fájlnév kiterjesztéséből kikövetkeztetett kép-MIME (vagy null). */
function kepMimeKiterjesztesbol(nev: string): string | null {
  const pont = nev.lastIndexOf('.')
  if (pont < 0) return null
  return KITERJESZTES_MIME[nev.slice(pont + 1).toLowerCase()] ?? null
}

/**
 * Dokumentum-fotó tömörítése a tervdoc paramétereivel: hosszabb él 2500 px
 * (~210 DPI A4-en), JPEG q0.8, cél ~1 MB alatt. WebP-t tudatosan NEM használunk
 * (a pdf-lib csak JPEG/PNG-t tud beágyazni — tervdoc 2. pont).
 *
 * Az EXIF-orientációt és az iOS Safari canvas-plafonját a browser-image-compression
 * kezeli — itt szándékosan NINCS saját orientáció-logika.
 *
 * Ha a bemenet nem kép (pl. PDF), VÁLTOZATLANUL adjuk vissza. Hiba esetén
 * PecsetHiba dobódik — a hívó dönthet az eredeti feltöltéséről.
 */
export async function compressDocumentImage(file: File): Promise<File> {
  const kepTipus = file.type.startsWith('image/') && file.type !== 'image/svg+xml'
  // Üres MIME (Android-kamera) esetén a kiterjesztésből pótoljuk a típust.
  const potoltMime = !file.type ? kepMimeKiterjesztesbol(file.name) : null
  if (!kepTipus && !potoltMime) return file

  csakBongeszoben('képtömörítés')
  try {
    const { default: imageCompression } = await import('browser-image-compression')
    // A könyvtár a `type` alapján szűr, ezért a pótolt MIME-ot rá kell írni a File-ra.
    const bemenet = potoltMime
      ? new File([file], file.name, { type: potoltMime, lastModified: file.lastModified })
      : file
    const tomoritett = await imageCompression(bemenet, {
      maxWidthOrHeight: 2500,
      initialQuality: 0.8,
      maxSizeMB: 1,
      fileType: 'image/jpeg',
      useWebWorker: true,
    })

    // Ha egy már optimális JPEG-en a tömörítés nem nyert méretet, és nincs benne
    // elforgatást igénylő EXIF-orientáció, az eredetit adjuk vissza. (Pótolt
    // MIME esetén a `bemenet`-et, hogy a feltöltés ne kapjon üres típust.)
    if (tomoritett.size >= bemenet.size && bemenet.type === 'image/jpeg') {
      const orientacio = await imageCompression.getExifOrientation(bemenet).catch(() => 1)
      if (orientacio <= 1) return bemenet
    }

    // Egységes .jpg kiterjesztés — a kimenet mindig image/jpeg.
    return new File([tomoritett], `${fajlnevTorzs(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch (err) {
    if (err instanceof PecsetHiba) throw err
    throw new PecsetHiba(
      'A kép tömörítése nem sikerült — a fájl sérült lehet, vagy a böngésző nem támogatja a formátumát.',
      { cause: err },
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// 2) Footer-strip pecsét képre (natív canvas, 0 kB függőség)
// ─────────────────────────────────────────────────────────────────

/** A fehér pecsét-sáv magassága pixelben (tervdoc: +80–120 px → kontraktus: 100). */
const SAV_MAGASSAG_PX = 100

/**
 * Biztonsági plafon a canvas-területre (px²) — a normál útvonalon a bemenet már
 * a compressDocumentImage kimenete (≤2500 px él, ~6 MP), ez az őr csak a
 * tömörítetlen óriásképek néma-üres-canvas hibáját váltja értelmes üzenetre.
 */
const MAX_CANVAS_TERULET = 24_000_000

/**
 * „Footer-strip" iktató-pecsét: a kép alá +100 px fehér sáv kerül, benne a
 * pecsét-szöveg két sorban — a pecsét így SOHA nem takar dokumentum-tartalmat
 * (tervdoc 4. pont). A kimenet JPEG (q0.85).
 *
 * A betűméret a kontraktus szerinti 14–16 px-ről indul, és a kép szélességével
 * arányosan nő (2500 px-es szkennen a 16 px olvashatatlanul apró lenne
 * nyomtatásban), de a 100 px-es sávot sosem növi túl.
 */
export async function stampImageFooterStrip(file: File, pecset: PecsetAdat): Promise<File> {
  csakBongeszoben('kép-pecsételés')
  let kep: ImageBitmap | HTMLImageElement | null = null
  try {
    kep = await betoltKep(file)
    const szeles = 'naturalWidth' in kep ? kep.naturalWidth : kep.width
    const magas = 'naturalHeight' in kep ? kep.naturalHeight : kep.height
    if (!szeles || !magas) {
      throw new PecsetHiba('A kép nem tölthető be — üres vagy sérült képfájl.')
    }
    if (szeles * (magas + SAV_MAGASSAG_PX) > MAX_CANVAS_TERULET) {
      throw new PecsetHiba('A kép túl nagy felbontású a pecsételéshez — előbb tömörítsd (compressDocumentImage), utána pecsételj.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = szeles
    canvas.height = magas + SAV_MAGASSAG_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new PecsetHiba('A pecsételéshez szükséges canvas nem érhető el ebben a böngészőben.')
    }

    // Teljes vászon fehérre (átlátszó PNG-nél is fehér alap), majd a kép felülre.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(kep, 0, 0)

    // Vékony elválasztó vonal a sáv tetején (a sávban van, tartalmat nem takar).
    ctx.fillStyle = '#d4d4d8'
    ctx.fillRect(0, magas, szeles, 1)

    // Pecsét-szöveg: 1. sor mindig, 2. sor csak ha van iratcsomó.
    const { sor1, sor2 } = pecsetSorok(pecset)
    const pad = Math.max(14, Math.round(szeles * 0.012))
    const maxSzoveg = Math.max(40, szeles - pad * 2)

    let meret = Math.round(16 * Math.max(1, szeles / 1200))
    meret = Math.min(meret, sor2 ? 26 : 34)
    meret = Math.max(meret, 14)
    const beallitFont = () => {
      ctx.font = `500 ${meret}px Arial, Helvetica, sans-serif`
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#3f3f46' // sötétszürke
    beallitFont()

    // Ha a hosszabb sor nem fér el, kisebb betű (10 px-ig), végső esetben csonkolás.
    const hosszabbSor = sor2 && ctx.measureText(sor2).width > ctx.measureText(sor1).width ? sor2 : sor1
    while (meret > 10 && ctx.measureText(hosszabbSor).width > maxSzoveg) {
      meret -= 1
      beallitFont()
    }

    if (sor2) {
      ctx.fillText(csonkolCanvasSzoveg(ctx, sor1, maxSzoveg), pad, magas + SAV_MAGASSAG_PX * 0.34)
      ctx.fillText(csonkolCanvasSzoveg(ctx, sor2, maxSzoveg), pad, magas + SAV_MAGASSAG_PX * 0.72)
    } else {
      ctx.fillText(csonkolCanvasSzoveg(ctx, sor1, maxSzoveg), pad, magas + SAV_MAGASSAG_PX / 2)
    }

    return await canvasJpegFile(canvas, `${fajlnevTorzs(file.name)}.jpg`, 0.85)
  } catch (err) {
    if (err instanceof PecsetHiba) throw err
    throw new PecsetHiba('A kép pecsételése nem sikerült — próbáld újra, vagy töltsd fel a képet pecsét nélkül.', {
      cause: err,
    })
  } finally {
    if (kep && 'close' in kep) {
      try {
        kep.close()
      } catch {
        // az ImageBitmap felszabadítása best-effort
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 3) PDF-pecsét — pdf-lib (LAZY import, csak ezen az útvonalon töltődik)
// ─────────────────────────────────────────────────────────────────

/** A MediaBox-magasítás mértéke pontban, ha a margó szűk (kontraktus: +40 pt). */
const PDF_SAV_PT = 40

/**
 * A pdf-lib beépített Helvetica-ja WinAnsi kódolású — a magyar ő/ű és a román
 * ă/ș/ț nincs benne. Vizuálisan hű cserék, hogy a pecsét ne dobjon hibát.
 */
const WINANSI_CSERE: Record<string, string> = {
  ő: 'ö',
  Ő: 'Ö',
  ű: 'ü',
  Ű: 'Ü',
  ă: 'a',
  Ă: 'A',
  ș: 's',
  Ș: 'S',
  ț: 't',
  Ț: 'T',
  ş: 's',
  Ş: 'S',
  ţ: 't',
  Ţ: 'T',
  đ: 'd',
  Đ: 'D',
}

/** Pecsételési mód: auto (heurisztika), kényszerített margó vagy fehér sáv. */
export type PdfPecsetMod = 'auto' | 'margo' | 'sav'

/** Lapszéli margó a pecsét-sornak (tervdoc 4. pont: ~25 pt). */
const PDF_MARGO_PT = 25
/** Oldalsó behúzás a fehér sávban. */
const PDF_SAV_PADDING_PT = 20

interface PdfDoboz {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A pecsét geometriája a lap /Rotate értéke szerint.
 *
 * A PDF a lapot megjelenítéskor az óramutató járásával megegyezően forgatja el
 * a /Rotate fokával, ezért a felhasználó által látott „lap alja" 90/180/270 fok
 * esetén NEM a user-space alsó éle. Telefonos szkennelésből származó PDF-ek
 * gyakran hordoznak /Rotate-et; forgatás-vak pecsételésnél a pecsét oldalra
 * kerülne — és ott TARTALMAT TAKARHATNA, ami épp a footer-strip elv ellentéte.
 */
interface PdfGeometria {
  /** A szöveg forgatása fokban (pdf-lib `degrees`), hogy vízszintesen olvasódjon. */
  szog: number
  /** A látható lap szélessége — a szöveg-illesztés ehhez igazodik. */
  lathatoSzeles: number
  /** A látható lap magassága — az „alacsony lap" heurisztikához. */
  lathatoMagas: number
  /** Margó-mód: a pecsét-sor kezdőpontja. */
  margoPont: { x: number; y: number }
  /** Sáv-mód: az új MediaBox [x, y, width, height]. */
  ujMediaBox: [number, number, number, number]
  /** Sáv-mód: a kirajzolandó fehér sáv. */
  feherSav: PdfDoboz
  /** Sáv-mód: a pecsét-sor kezdőpontja az adott betűmérethez (optikai közép). */
  savPont: (meret: number) => { x: number; y: number }
}

/**
 * A látható alsó él geometriájának kiszámítása a user-space MediaBoxból és a
 * normalizált forgatásból. A `savPont` a betűmérettel korrigál, mert a glifák a
 * saját „fel" irányukban a alapvonal fölé nyúlnak.
 */
function pdfGeometria(mb: PdfDoboz, fok: number): PdfGeometria {
  const S = PDF_SAV_PT
  const M = PDF_MARGO_PT
  const P = PDF_SAV_PADDING_PT
  const jobb = mb.x + mb.width
  const teto = mb.y + mb.height

  switch (fok) {
    // 90°: a látható alj a user-space JOBB oldala; a szöveg +y irányban fut.
    case 90:
      return {
        szog: 90,
        lathatoSzeles: mb.height,
        lathatoMagas: mb.width,
        margoPont: { x: jobb - M, y: mb.y + M },
        ujMediaBox: [mb.x, mb.y, mb.width + S, mb.height],
        feherSav: { x: jobb, y: mb.y, width: S, height: mb.height },
        savPont: (meret) => ({ x: jobb + S / 2 + meret * 0.35, y: mb.y + P }),
      }
    // 180°: a látható alj a user-space TETEJE; a szöveg -x irányban fut.
    case 180:
      return {
        szog: 180,
        lathatoSzeles: mb.width,
        lathatoMagas: mb.height,
        margoPont: { x: jobb - M, y: teto - M },
        ujMediaBox: [mb.x, mb.y, mb.width, mb.height + S],
        feherSav: { x: mb.x, y: teto, width: mb.width, height: S },
        savPont: (meret) => ({ x: jobb - P, y: teto + S / 2 + meret * 0.35 }),
      }
    // 270°: a látható alj a user-space BAL oldala; a szöveg -y irányban fut.
    case 270:
      return {
        szog: 270,
        lathatoSzeles: mb.height,
        lathatoMagas: mb.width,
        margoPont: { x: mb.x + M, y: teto - M },
        ujMediaBox: [mb.x - S, mb.y, mb.width + S, mb.height],
        feherSav: { x: mb.x - S, y: mb.y, width: S, height: mb.height },
        savPont: (meret) => ({ x: mb.x - S / 2 - meret * 0.35, y: teto - P }),
      }
    // 0°: a látható alj a user-space ALJA (alapeset).
    default:
      return {
        szog: 0,
        lathatoSzeles: mb.width,
        lathatoMagas: mb.height,
        margoPont: { x: mb.x + M, y: mb.y + M },
        ujMediaBox: [mb.x, mb.y - S, mb.width, mb.height + S],
        feherSav: { x: mb.x, y: mb.y - S, width: mb.width, height: S },
        savPont: (meret) => ({ x: mb.x + P, y: mb.y - S / 2 - meret * 0.35 }),
      }
  }
}

/**
 * PDF első oldalának iktató-pecsételése.
 *
 *  - Alapeset: kis szürke pecsét-sor az alsó margóra (25 pt a lapszéltől).
 *  - Ha a margó szűknek tűnik — nagyon alacsony lap, vagy szkennelt (teljes
 *    lapot kitöltő kép, szöveg nélküli) oldal —, a MediaBoxot +40 pt-tal
 *    magasítjuk lefelé, és a pecsét az így nyert fehér sávba kerül, tartalmat
 *    nem takarva.
 *
 * A pdf-lib CSAK itt, lazy importtal töltődik (~178 kB gzip — tervdoc 4. pont).
 * A `mod` paraméter opcionális felülbírálás a hívónak ('auto' az alapérték).
 */
export async function stampPdf(file: File, pecset: PecsetAdat, mod: PdfPecsetMod = 'auto'): Promise<File> {
  try {
    const pdfLib = await import('pdf-lib')
    const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFDict, PDFStream, EncryptedPDFError } = pdfLib

    const bytes = await file.arrayBuffer()
    let doc: import('pdf-lib').PDFDocument
    try {
      doc = await PDFDocument.load(bytes)
    } catch (err) {
      if (err instanceof EncryptedPDFError) {
        throw new PecsetHiba('A PDF jelszóval védett — pecsételés előtt fel kell oldani a védelmét, vagy pecsét nélkül tölthető fel.', { cause: err })
      }
      throw new PecsetHiba('A PDF beolvasása nem sikerült — a fájl sérült vagy nem szabványos PDF.', { cause: err })
    }
    if (doc.getPageCount() === 0) {
      throw new PecsetHiba('A PDF nem tartalmaz egyetlen oldalt sem — nincs mit pecsételni.')
    }

    const oldal = doc.getPage(0)
    const font = await doc.embedFont(StandardFonts.Helvetica)

    // WinAnsi-biztos szöveg: ismert cserék + minden maradék kódolhatatlan
    // karakter '?'-re (rövid szövegen a karakterenkénti próba olcsó).
    const winAnsiBiztos = (szoveg: string): string => {
      let ki = ''
      for (const ch of szoveg) {
        const csere = WINANSI_CSERE[ch]
        if (csere !== undefined) {
          ki += csere
          continue
        }
        try {
          font.encodeText(ch)
          ki += ch
        } catch {
          ki += '?'
        }
      }
      return ki
    }

    // Egyetlen pecsét-sor (kontraktus: „kis szürke pecsét-sor").
    const { sor1, sor2 } = pecsetSorok(pecset)
    const teljesSor = winAnsiBiztos(sor2 ? `${sor1} · ${sor2}` : sor1)

    // Betűméret-illesztés a rendelkezésre álló szélességhez, végső esetben csonkolás.
    const illesztSor = (szoveg: string, maxSzeles: number, kezdoMeret: number): { szoveg: string; meret: number } => {
      let meret = kezdoMeret
      while (meret > 6 && font.widthOfTextAtSize(szoveg, meret) > maxSzeles) {
        meret -= 0.5
      }
      let s = szoveg
      while (s.length > 4 && font.widthOfTextAtSize(`${s}…`, meret) > maxSzeles) {
        s = s.slice(0, -1)
      }
      return { szoveg: s === szoveg ? szoveg : `${s.trimEnd()}…`, meret }
    }

    const mediaBox = oldal.getMediaBox()
    const szurke = rgb(0.35, 0.35, 0.35)

    // Heurisztika: szkennelt oldal = van kép-XObject és nincs Font a Resources-ben
    // (best-effort — hibánál margó-módra esünk vissza).
    const scanSzeruOldal = (): boolean => {
      try {
        const resources = oldal.node.Resources()
        if (!resources) return false
        const fontok = resources.lookupMaybe(PDFName.of('Font'), PDFDict)
        if (fontok && fontok.keys().length > 0) return false
        const xobjektumok = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
        if (!xobjektumok) return false
        for (const kulcs of xobjektumok.keys()) {
          const objektum = xobjektumok.lookup(kulcs)
          if (objektum instanceof PDFStream && objektum.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
            return true
          }
        }
        return false
      } catch {
        return false
      }
    }

    // A lap /Rotate értéke 90/180/270 esetén elforgatja a LÁTHATÓ alsó élet —
    // a pecsét geometriáját ehhez igazítjuk (különben oldalra, akár tartalomra
    // kerülne). Csak a szabványos derékszögű értékeket kezeljük, minden mást
    // 0-nak veszünk.
    const nyersSzog = ((oldal.getRotation().angle % 360) + 360) % 360
    const fok = nyersSzog === 90 || nyersSzog === 180 || nyersSzog === 270 ? nyersSzog : 0
    const geo = pdfGeometria(mediaBox, fok)

    const margoSzuk = mod === 'sav' || (mod === 'auto' && (geo.lathatoMagas < 120 || scanSzeruOldal()))

    if (margoSzuk) {
      // MediaBox-bővítés a látható alj felé: +40 pt fehér sáv, a pecsét ebbe
      // íródik — a meglévő tartalomból semmit nem takar.
      const cropBox = oldal.getCropBox() // MÉG a setMediaBox előtt!
      const [ujX, ujY, ujSzeles, ujMagas] = geo.ujMediaBox
      oldal.setMediaBox(ujX, ujY, ujSzeles, ujMagas)
      // Ugyanaz az eltolás/növekmény a CropBoxra, különben a néző levágná a sávot.
      oldal.setCropBox(
        cropBox.x + (ujX - mediaBox.x),
        cropBox.y + (ujY - mediaBox.y),
        cropBox.width + (ujSzeles - mediaBox.width),
        cropBox.height + (ujMagas - mediaBox.height),
      )
      oldal.drawRectangle({ ...geo.feherSav, color: rgb(1, 1, 1) })

      const { szoveg, meret } = illesztSor(teljesSor, Math.max(40, geo.lathatoSzeles - 40), 9)
      const pont = geo.savPont(meret)
      oldal.drawText(szoveg, {
        x: pont.x,
        y: pont.y,
        size: meret,
        font,
        color: szurke,
        rotate: degrees(geo.szog),
      })
    } else {
      // Látható alsó margó: 25 pt a lapszéltől (tervdoc 4. pont).
      const { szoveg, meret } = illesztSor(teljesSor, Math.max(40, geo.lathatoSzeles - 50), 8)
      oldal.drawText(szoveg, {
        x: geo.margoPont.x,
        y: geo.margoPont.y,
        size: meret,
        font,
        color: szurke,
        rotate: degrees(geo.szog),
      })
    }

    const mentett = await doc.save()
    // Friss ArrayBuffer-másolat: a Blob-konstruktor típusa nem fogad
    // SharedArrayBuffer-hátterű nézetet, a pdf-lib pedig ArrayBufferLike-ot ad.
    const puffer = new ArrayBuffer(mentett.byteLength)
    new Uint8Array(puffer).set(mentett)
    return new File([puffer], `${fajlnevTorzs(file.name)}.pdf`, {
      type: 'application/pdf',
      lastModified: Date.now(),
    })
  } catch (err) {
    if (err instanceof PecsetHiba) throw err
    throw new PecsetHiba('A PDF pecsételése nem sikerült — a fájl pecsét nélkül tölthető fel.', { cause: err })
  }
}
