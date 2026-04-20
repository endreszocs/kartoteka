/**
 * M1.4 óta a `cn()` helper a `@kartoteka/ui` közös csomagból jön —
 * hogy a Tauri desktop és a web ugyanazt a függvényt használja.
 *
 * Ez a fájl visszafelé kompatibilitás miatt maradt (15+ fájl importálja
 * `@/lib/utils`-ról), és csak egy re-export.
 */
export { cn } from '@kartoteka/ui'
