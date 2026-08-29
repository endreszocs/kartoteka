/**
 * Kuka visszaszámláló — RE-EXPORT a közös csomagból (2026-08-15,
 * desktop-paritás 3. szelet).
 *
 * A kanonikus példány: `packages/ui-app/src/recycle-bin/countdown.ts` —
 * a desktop Kuka is onnan számol, és a `scripts/selftest-kuka.mjs` is azt
 * fordítja. Ez a fájl csak a meglévő webes import-utak megőrzésére van
 * (`@/lib/offline/recycle-bin-countdown`) — új kód importáljon közvetlenül
 * a `@kartoteka/ui-app`-ból.
 */

export {
  RECYCLE_BIN_RETENTION_DAYS,
  PENZUGYI_RETENTION_DAYS,
  retentionDaysFor,
  purgeCountdownDays,
  purgeCountdownLabel,
  deletedDateSuffix,
  exactKey,
} from '@kartoteka/ui-app'
