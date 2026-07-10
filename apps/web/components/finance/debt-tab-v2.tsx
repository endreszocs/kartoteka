'use client'

/**
 * Webes DebtTabV2 wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 2): a vizuális réteg átkerült a `@kartoteka/ui-app`
 * shared package `DebtTab` komponensébe (100% pure-UI, props-driven). Ez a fájl
 * már csak re-export wrapper — minden meglévő `import { DebtTabV2 } ...` változatlanul
 * működik, és a desktop is ugyanazt használhatja.
 *
 * 2026-07-10 (S2-1c): a megosztott `DebtTab` év-szerinti bontást kapott — új,
 * OPCIONÁLIS `debtRowsByYear` prop (év → DebtRow[]). A wrapper változatlanul
 * átenged mindent; ha a `FinanceTabs` később átadja a több évre számolt
 * sorokat, a Tartozások fül automatikusan évoszlopos nézetre vált. Prop
 * nélkül a mai egyéves viselkedés marad (visszafelé kompatibilis).
 */

import { DebtTab } from '@kartoteka/ui-app'

// Backward compatibility — `DebtTabV2` továbbra is hívható a webből.
export const DebtTabV2 = DebtTab
export type { DebtTabProps as DebtTabV2Props } from '@kartoteka/ui-app'
