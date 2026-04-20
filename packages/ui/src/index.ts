/**
 * @kartoteka/ui — közös UI komponens-könyvtár.
 *
 * M1.1 placeholder → M1.4-ben feltöltve 13 shadcn-alapú komponenssel.
 *
 * Használat (web és desktop egyaránt):
 *   import { Button, Card, Dialog } from '@kartoteka/ui'
 *
 * A csomag a shadcn/ui mintát követi, de @base-ui/react primitíveken alapul
 * (a Radix UI helyett). A Tailwind CSS 4 utility class-ok és CSS változók
 * a caller-app `globals.css`-ében vannak definiálva (design tokens), a
 * Tailwind scanner-nek az `@source '../../packages/ui/src'` direktívát kell
 * beállítani, hogy a csomag TSX fájlait is scannelje.
 *
 * Project-specifikus komponensek, amik NEM kerültek ide (és apps/web-ben
 * maradnak):
 *   - address-form (RO cím-hierarchia)
 *   - color-tabs (projekt-specifikus `card-raised` custom class)
 *   - help-tooltip (next/link)
 *   - modal-field (magyar label+required)
 *   - searchable-category-select
 *   - splash-screen (magyar kezdő splash)
 *   - sonner (next-themes)
 */

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
export { cn } from './lib/utils'

// ─────────────────────────────────────────────────────────────────────────
// Komponensek
// ─────────────────────────────────────────────────────────────────────────
export * from './components/avatar'
export * from './components/badge'
export * from './components/button'
export * from './components/card'
export * from './components/dialog'
export * from './components/dropdown-menu'
export * from './components/input'
export * from './components/label'
export * from './components/select'
export * from './components/separator'
export * from './components/sheet'
export * from './components/tabs'
export * from './components/textarea'
