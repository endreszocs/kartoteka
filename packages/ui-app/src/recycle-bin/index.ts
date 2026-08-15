/**
 * Kuka (recycle bin) közös rétege — web ⇄ desktop (2026-08-15,
 * desktop-paritás 3. szelet).
 *
 *  - countdown.ts: tiszta visszaszámláló-függvények (a selftest-kuka.mjs
 *    EZT a példányt fordítja — nulla importtal KELL maradnia)
 *  - labels.ts: tábla-specifikus, ember-olvasható sor-címkék
 *  - tables.ts: a desktop Kuka soft-delete táblalistája (a webes
 *    table-registry softDelete-bejegyzéseinek tükre — lásd a fájl fejlécét)
 *  - RecycleBinBody.tsx: a közös megjelenítés + művelet-hook
 */

export * from './countdown'
export * from './labels'
export * from './tables'
export * from './RecycleBinBody'
