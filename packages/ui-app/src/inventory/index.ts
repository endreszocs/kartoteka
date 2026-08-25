/**
 * Leltár közös rétege (2026-08-15, desktop-paritás 4. szelet):
 * kategória-konstansok, érték-számítás, kétnyelvű fisa-builder és a mentés
 * szabály-rétege — a web és a desktop leltár EGY forrásból dolgozik.
 *
 * Az amortizációs katalógus a finance modulban él
 * (`../finance/inventory.ts` — INVENTORY_AMORTIZATION_CATALOG); ide
 * szándékosan NEM duplikáljuk (a root barrel `export *`-ja kétértelművé
 * tenné a nevet).
 */

export * from './constants'
export * from './value'
export * from './fisa'
export * from './save'
export * from './threshold'
