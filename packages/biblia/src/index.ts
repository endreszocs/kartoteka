/**
 * @kartoteka/biblia — Károli-biblia igehely-parser + lefedettség-számító.
 *
 * A DicsHub testvérprojekt (HungarianChurchFlow) magyar igehely-parserének
 * portja és bővítése, a munkanapló/iktató igehely-mezőihez és a textus-
 * lefedettség statisztikához.
 *
 * Publikus API:
 *   - resolveBook(nev)                  magyar név/alias → kanonikus könyv ('1móz' → GEN)
 *   - parseReference(szoveg)            hivatkozás → szegmensek VAGY strukturált magyar hiba
 *   - parseMultiReference(szoveg)       ';'-vel/sortöréssel elválasztott több hivatkozás
 *   - formatReference(szegmensek)       kanonikus magyar megjelenítés ('Mt 13,53–14,12')
 *   - validateReference(szegmensek)     létezik-e (fejezet/vers a korpusz-tartományon belül)
 *   - expandToVerseIds(szegmensek)      érintett versek azonosítói ('JHN.3.16' — lásd types.ts)
 *   - coverage(verseIdHalmaz)           { osszes: 31126, erintett, szazalek }
 *   - getVerseCounts()                  beépített versszám-katalógus (66 könyv / 1189 fejezet)
 *
 * FONTOS: a 4,2 MB-os bibliaszöveget (apps/web/public/bibles/karoli.json) ez a
 * csomag NEM importálja — csak az ~5 KB-os verse-counts.json katalógust. A
 * szöveget maga az app tölti futásidőben, ahol tényleg kell.
 *
 * A verse-counts.json újragenerálása: node scripts/build-verse-counts.mjs
 */

export * from './types'
export { KONYVEK, KONYV_SORREND, getBook, normalizeBookName, resolveBook } from './books'
export type { BibliaKonyv } from './books'
export { parseReference, parseMultiReference } from './parser'
export { formatReference } from './format'
export { coverage, expandToVerseIds, getVerseCounts, osszesVers, validateReference } from './coverage'
