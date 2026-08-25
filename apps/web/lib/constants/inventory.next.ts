/**
 * Leltár-konstansok — RE-EXPORT a közös @kartoteka/ui-app rétegből
 * (2026-08-15, desktop-paritás 4. szelet).
 *
 * MIÉRT: a kategória-készlet, a HU/RO címkék és a normalizálás korábban itt,
 * web-only fájlban élt, miközben a desktop leltár-oldala saját (ELAVULT)
 * másolatot tükrözött — pontosan a „második felület a régi implementációt
 * őrzi" hibaosztály. A tartalom VÁLTOZATLANUL a
 * `packages/ui-app/src/inventory/constants.ts`-be került; ez a fájl csak a
 * meglévő webes importok kompatibilitását őrzi.
 *
 * Az amortizációs katalógus már korábban közös volt
 * (`packages/ui-app/src/finance/inventory.ts`) — az itteni MÁSOLATA törölve,
 * a nevek onnan jönnek.
 */

export {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ROMANIAN_LABELS,
  INVENTORY_CATEGORY_PREFIXES,
  normalizeInventoryCategory,
  serializeInventoryCategory,
  getInventoryCategoryLabel,
  getInventoryCategoryRomanianLabel,
  INVENTORY_AMORTIZATION_CATALOG,
  getInventoryAmortizationCatalogEntry,
  getAlapeszkozCsoportFromKod,
  ALAPESZKOZ_ERTEKHATAROK,
  getAlapeszkozErtekhatar,
  alapeszkozKuszobFigyelmeztetes,
} from '@kartoteka/ui-app'

export type {
  InventoryCategory,
  InventoryItem,
  InventoryAmortizationCatalogEntry,
} from '@kartoteka/ui-app'
