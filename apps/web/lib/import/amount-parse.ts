/**
 * Import-összeg parszolás — magyar/román/US számformátumokra (P0-17, 2026-08-28).
 *
 * MIÉRT: a korábbi naiv `replace(',', '.')`-alapú parszolás az „1.234,56"
 * (ezres-pont + tizedes-vessző) alakot „1.234.56"-má torzította, amiből a
 * parseFloat 1.234-et adott — az összeg NÉMÁN az ezredére zsugorodott az
 * importban. Ez a modul az egyetlen kanonikus összeg-parser minden webes
 * import-útnak és kézi összeg-mezőnek.
 *
 * PÉNZ-SZEMANTIKA (a szabályok, amikre a viselkedési őrszem is épül):
 *   - szám-cella (typeof number) változatlanul átmegy;
 *   - a szóköz (normál és nem törő) MINDIG ezres elválasztó;
 *   - ha pont ÉS vessző is van: az UTOLSÓ a tizedes, a többi ezres;
 *   - egyetlen elválasztónál: PONTOSAN 3 számjegy utána = ezres csoport
 *     (pénzben legfeljebb 2 tizedes van — az „1.234" itt 1234, nem 1,234);
 *     1–2 (vagy 4+) számjegy utána = tizedes;
 *   - több azonos elválasztó: mind ezres, és minden csoportnak 3 jegyűnek
 *     kell lennie („1.23.45" → null, nem tipp);
 *   - értelmezhetetlen bemenet → null (a hívó dönt: skip/figyelmeztetés),
 *     SOHA nem csendes rossz szám.
 *
 * IMPORT-MENTES modul: a tsx-alapú teszt-runnerek és az őrszem (transpile +
 * futtatás) is közvetlenül betöltik.
 */

export function parseImportAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null

  let s = value.replace(/\u00a0/g, ' ').trim()
  if (!s) return null

  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim()
  }

  // szóköz = ezres elválasztó
  s = s.replace(/ /g, '')
  if (!s || !/^[0-9.,]+$/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  let normalized: string
  if (lastDot >= 0 && lastComma >= 0) {
    // mindkettő jelen: az utolsó a tizedes, minden korábbi ezres
    const dec = Math.max(lastDot, lastComma)
    const intPart = s.slice(0, dec).replace(/[.,]/g, '')
    const fracPart = s.slice(dec + 1)
    if (!/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) return null
    normalized = `${intPart}.${fracPart}`
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = s.split(sep)
    if (parts.some((p) => p.length === 0)) return null
    if (parts.length > 2) {
      if (!parts.slice(1).every((p) => p.length === 3)) return null
      normalized = parts.join('')
    } else {
      normalized = parts[1].length === 3 ? parts[0] + parts[1] : `${parts[0]}.${parts[1]}`
    }
  } else {
    normalized = s
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? sign * n : null
}
