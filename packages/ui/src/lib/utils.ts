import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind osztály-egyesítő helper.
 * Egy helyen tart mind clsx-et, mind tailwind-merge-et.
 *
 * Korábbi hely: `apps/web/lib/utils.ts` — M1.4 óta innen jön.
 * Az `apps/web/lib/utils.ts` most egy egy-soros re-export.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
