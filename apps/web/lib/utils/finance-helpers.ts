/**
 * Pénzügyi modul tiszta-függvények — RE-EXPORT SHIM.
 *
 * 2026-04-25 (Sprint Q Fázis 1): a tényleges definíciók átkerültek a
 * `@kartoteka/ui-app` shared package-be (`packages/ui-app/src/finance/helpers.ts`),
 * hogy a desktop kliens is ugyanazt használhassa. Ez a fájl most már
 * **csak re-export** — minden meglévő import változatlanul működik.
 */

export * from '@kartoteka/ui-app'
