/**
 * @kartoteka/ui-app/finance/oblio — OblioEllenőrzés modul közös rétege
 * (Sprint Q F2.1, v0.7.7, 2026-04-26).
 *
 * 10 lib fájl portolva a webes `apps/web/lib/finance/oblio/` mappából
 * a shared package-be. iOS-future-proof: minden lib WKWebView-kompatibilis
 * (DOMParser, IndexedDB/Dexie, PDF.js, fuzzy match, HTML builder).
 *
 * NEM tartalmazza (még):
 *   - oblio-folder.ts (File System Access API → v0.7.9-ben absztrakcióval)
 *   - 4 modal + 2 sub-komp + 1 tab (v0.7.8 + v0.7.9)
 *   - 3 server-only lib (oblio-auth, oblio-client, oblio-invoice-builder)
 *
 * A web és (a jövőben) desktop egyaránt INNEN importál — nincs duplikáció.
 */

export * from './oblio-types'
export * from './oblio-status-labels'
export * from './oblio-errors'
export * from './oblio-matcher'
export * from './ubl-parser'
export * from './pdf-content-parser'
export * from './pdf-xml-name-matcher'
export * from './pdf-xml-content-matcher'
export * from './oblio-print-builder'
export * from './oblio-cache'
