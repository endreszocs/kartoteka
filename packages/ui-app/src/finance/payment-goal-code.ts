/**
 * Befizetés-cél kód kibontása + egyházfenntartói járulék (101.01) felismerése.
 *
 * 2026-08-11 (5. kör, P3 #4) — MI VOLT A BAJ: ez a két függvény NÉGY példányban
 * élt, kézzel karbantartva:
 *   - apps/web/app/(dashboard)/penzugy/actions.ts
 *   - apps/web/app/(dashboard)/tagnyilvantartas/actions.ts
 *   - apps/web/app/(dashboard)/tagnyilvantartas/registry-list-actions.ts
 *   - apps/desktop/src/lib/finance-entry-lookups.ts
 * Három példány `||`-lal fűzte össze a fallback-láncot, a negyedik
 * (registry-list-actions) `??`-lal. Egy ÜRES SZTRING `id_szamadasicel` esetén a
 * `??` megáll az üres sztringnél (`isChurchMaintenanceCode('')` = false), a `||`
 * viszont továbblép a `szamadasicel.id` / `.kod` értékre — vagyis UGYANARRÓL a
 * befizetésről a Pénzügy modul azt mondaná: „egyházfenntartói járulék, fizetve",
 * a tagnyilvántartási karton pedig azt: „nem fizetett".
 *
 * Hogy a `befizetescel.id_szamadasicel` tárol-e valaha üres sztringet, kódból
 * NEM eldönthető (nincs séma-kényszer a repóban, és a Kartotéka adatbázisához
 * nincs MCP-hozzáférésünk) — ezért a NORMALIZÁLÁS a `||` szemantikára történt:
 * az üres sztring is „nincs érték", tehát a lánc tovább esik. Ez a megengedőbb,
 * és ez az, amit a Pénzügy modul (a járulék-számítás forrása) eddig is csinált —
 * így a két felület egymással garantáltan egyezik.
 *
 * FONTOS (2026-07-17, F1-1 P0): a `szamadasicel` táblában NINCS `kod` oszlop —
 * az `id` MAGA a kód (pl. '101.01'). A `.kod` ág csak a régi, beágyazott
 * lekérdezés-formák miatt maradt a láncban.
 */

/** Egy `befizetescel` sor (esetleg beágyazott `szamadasicel`-lel), ahogy a PostgREST adja. */
export type PaymentGoalCodeRef = {
  id_szamadasicel?: string | null
  szamadasicel?:
    | { id?: string | null; kod?: string | null }
    | Array<{ id?: string | null; kod?: string | null }>
    | null
} | null

/** A PostgREST a to-one relációt is tömbként adhatja vissza — az első elem kell. */
function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return (Array.isArray(value) ? value[0] : value) || null
}

/**
 * A befizetés számadási-cél kódja, vagy `null`, ha egyik forrásból sem derül ki.
 * Fallback-sorrend: `befizetescel.id_szamadasicel` → `szamadasicel.id` → `szamadasicel.kod`.
 */
export function getPaymentGoalCode(
  goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[],
): string | null {
  const normalizedGoal = pickOne(goal)
  const codeRef = pickOne(normalizedGoal?.szamadasicel)
  // `||` (NEM `??`): az üres sztring is „nincs érték" — lásd a fájl fejlécét.
  return normalizedGoal?.id_szamadasicel || codeRef?.id || codeRef?.kod || null
}

/** Igaz, ha a kód egyházfenntartói járulék (101.01…). */
export function isChurchMaintenanceCode(code?: string | null): boolean {
  return typeof code === 'string' && code.startsWith('101.01')
}

/** Kényelmi rövidítés: közvetlenül egy `befizetescel` relációra kérdez rá. */
export function isChurchMaintenancePayment(
  goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[],
): boolean {
  return isChurchMaintenanceCode(getPaymentGoalCode(goal))
}
