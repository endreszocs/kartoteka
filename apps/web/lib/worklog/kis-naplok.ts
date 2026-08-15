/**
 * Kis naplók (Katekézis + Családlátogatás naplólap) — RE-EXPORT a közös
 * @kartoteka/ui-app rétegből (2026-08-15, desktop-paritás 4. szelet).
 *
 * A generátorok VÁLTOZATLAN tartalommal a
 * `packages/ui-app/src/worklog/kis-naplok.ts`-be kerültek, hogy a desktop
 * Munkanapló oldala ugyanabból a forrásból nyomtasson. A
 * `scripts/selftest-kis-naplok.mjs` mostantól a közös fájlt fordítja.
 * Ez a fájl csak a meglévő webes importok kompatibilitását őrzi.
 */

export {
  KIS_NAPLO_SOR_PER_LAP,
  csalBlJel,
  buildKatekezisNaploLapok,
  buildCsaladlatogatasNaploLapok,
} from '@kartoteka/ui-app'
export type { KisNaploSor } from '@kartoteka/ui-app'
