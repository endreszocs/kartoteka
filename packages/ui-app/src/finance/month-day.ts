/**
 * „HH-NN" (hónap-nap) értékek EMBERI megjelenítése.
 *
 * A járulék-kedvezmények határidejét a DB év nélkül, `'07-01'` alakban tárolja
 * (`bealitas.jarulek_hatarid`, `jarulek_kedvezmeny.kezdet` / `.hatarid`). Ez a
 * lelkésznek olvashatatlan: a „07-01" ránézésre lehet július 1. VAGY január 7.
 * (Szőcs Endre, 2026-07-16: „nem lehet tudni melyik a hónap és melyik a nap".)
 *
 * A TÁROLT formátum NEM változik — ez tisztán prezentációs réteg, tehát nincs
 * adatmigráció, és a `parseMonthDay` továbbra is a nyers értéket olvassa.
 *
 * Itt (a finance csomagban) van a helye, mert a `jarulek-calculation.ts` a
 * felhasználónak szóló címkéket is itt állítja elő — így a web és az asztali
 * kiadás ugyanazt a szöveget kapja, egyetlen forrásból.
 */

/** Magyar hónapnevek, kisbetűvel — mondat közben így helyes („július 1-ig"). */
export const HU_MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
] as const

/** Ha az érték hiányzik vagy értelmezhetetlen, ezt írjuk ki szám helyett. */
const PLACEHOLDER = '—'

/**
 * Egy „HH-NN" érték hónapját és napját adja vissza, vagy null-t, ha nem
 * értelmezhető. A hónap 1-alapú (1 = január).
 */
export function parseMonthDayParts(value: string | null | undefined): { month: number; day: number } | null {
  if (!value) return null
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(String(value).trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  return { month, day }
}

/** `'07-01'` → `'július 1.'` — érvénytelen értékre `'—'`. */
export function formatMonthDay(value: string | null | undefined): string {
  const parts = parseMonthDayParts(value)
  if (!parts) return PLACEHOLDER
  return `${HU_MONTHS[parts.month - 1]} ${parts.day}.`
}

/** `('01-01', '07-01')` → `'január 1. – július 1.'` (nagykötőjel, ahogy a magyar tipográfia kéri). */
export function formatMonthDayRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const start = parseMonthDayParts(from)
  const end = parseMonthDayParts(to)
  if (!start && !end) return PLACEHOLDER
  // Nyitott alsó határ: a régi (kumulatív) mód — „…-ig" szemantika.
  if (!start) return `${formatMonthDay(to)}-ig`
  if (!end) return `${formatMonthDay(from)}-tól`
  return `${formatMonthDay(from)} – ${formatMonthDay(to)}`
}

/**
 * `'07-01'` → `'07-01 (július 1.)'` — beviteli mezők súgójához, ahol a nyers
 * kódot is látnia kell a lelkésznek, mert azt kell begépelnie.
 */
export function formatMonthDayWithCode(value: string | null | undefined): string {
  const parts = parseMonthDayParts(value)
  if (!parts) return PLACEHOLDER
  return `${value} (${formatMonthDay(value)})`
}
