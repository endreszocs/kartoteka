/**
 * Leltári tárgy fişă — RE-EXPORT a közös @kartoteka/ui-app rétegből
 * (2026-08-15, desktop-paritás 4. szelet).
 *
 * A kétnyelvű (HU/RO) fişă-builder VÁLTOZATLAN tartalommal a
 * `packages/ui-app/src/inventory/fisa.ts`-be került, hogy a desktop leltár
 * ugyanabból a forrásból nyomtasson (printHtmlViaIframe) — ez a fájl csak a
 * meglévő webes importok kompatibilitását őrzi.
 */

export { buildInventoryItemCardHtml } from '@kartoteka/ui-app'
export type { InventoryItemCardData, InventoryItemCardResult } from '@kartoteka/ui-app'
