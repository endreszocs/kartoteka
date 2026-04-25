/**
 * Pénzügyi modul konstansok / típusok / pure-helpers — RE-EXPORT SHIM.
 *
 * 2026-04-25 (Sprint Q Fázis 1): a tényleges definíciók átkerültek a
 * `@kartoteka/ui-app` shared package-be (`packages/ui-app/src/finance/`),
 * hogy a desktop kliens is ugyanazt használhassa. Ez a fájl most már
 * **csak re-export** — minden meglévő `import ... from '@/lib/constants/finance'`
 * import változatlanul működik.
 *
 * Új kódhoz: használhatod ezt vagy közvetlenül a `@kartoteka/ui-app`-ot.
 */

export * from '@kartoteka/ui-app'
