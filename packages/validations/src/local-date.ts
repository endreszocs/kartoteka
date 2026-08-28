/**
 * Helyi „ma" — Europe/Bucharest (P0-1, 2026-08-28).
 *
 * MIÉRT: a `new Date().toISOString().slice(0, 10)` az UTC-napot adja, ami
 * Bukarestben (UTC+2, nyáron UTC+3) helyi éjfél és hajnali 2–3 óra között az
 * ELŐZŐ nap — január 1-jén hajnalban az ELŐZŐ ÉV. A rögzítő default dátuma
 * így rossz napra/évre könyvelt, a „jövőbeli dátum" kapu pedig a helyi MAI
 * dátumot is elutasította. Minden „mai nap" képzés ezt a helpert használja.
 *
 * A gyülekezetek Romániában működnek — a pénzügyi napfogalom kanonikus
 * időzónája az Europe/Bucharest, függetlenül attól, hogy a szerver (UTC-n
 * futó Railway) vagy egy átállított gép hol jár.
 *
 * Ha az Intl/timeZone nem elérhető (nagyon régi környezet), a KÉSZÜLÉK helyi
 * napjára esünk vissza — az is Románia a felhasználóinknál, és sosem UTC.
 */

export const FINANCE_TIME_ZONE = 'Europe/Bucharest'

export function localTodayIso(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: FINANCE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const resz = (t: string) => parts.find((p) => p.type === t)?.value
    const y = resz('year')
    const m = resz('month')
    const d = resz('day')
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    /* Intl/timeZone hiány — készülék-helyi fallback lent */
  }
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
