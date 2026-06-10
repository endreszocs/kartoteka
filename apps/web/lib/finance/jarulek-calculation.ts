/**
 * Járulék-tartozás számítás — RE-EXPORT SHIM.
 *
 * 2026-06-10: a tényleges implementáció átkerült a `@kartoteka/ui-app` shared
 * package-be (`packages/ui-app/src/finance/jarulek-calculation.ts`), hogy a
 * desktop kliens is PONTOSAN ugyanazt a tartozás-számítást használja (web ==
 * desktop determinizmus). Ez a fájl már csak re-export — minden meglévő
 * `import ... from '@/lib/finance/jarulek-calculation'` változatlanul működik.
 */

export * from '@kartoteka/ui-app'
