/**
 * Adatvédelmi napló — dátum-segédek a FELÜLETHEZ (2026-08-23).
 *
 * ⚠️ MIÉRT NEM A KÖZÖS MAGBAN VANNAK. Az `adatvedelem-shared.ts` szándékosan
 * `new Date()`-mentes: a határidő-számítás ott determinisztikus, tesztelhető
 * egész-aritmetika, ahol a „ma" mindig paraméter. Ha a „ma" előállítása is
 * odakerülne, a szerver (UTC) és a böngésző (helyi idő) a nap két végén
 * MÁS napot mondana, és a „lejárt" jelölés hidratáláskor átugrana. Ezért az
 * óra-olvasás ITT van, a kliens oldalon — ott, ahol a lelkész naptára is.
 */

/** A mai nap a felhasználó HELYI naptára szerint, `YYYY-MM-DD` alakban. */
export function maiNap(): string {
  const d = new Date()
  const ho = d.getMonth() + 1
  const nap = d.getDate()
  return (
    String(d.getFullYear()).padStart(4, '0') +
    '-' +
    (ho < 10 ? '0' + String(ho) : String(ho)) +
    '-' +
    (nap < 10 ? '0' + String(nap) : String(nap))
  )
}

/** `YYYY-MM-DD` → „2026. augusztus 23." Hibás bemenetnél a nyers érték. */
export function magyarDatum(ertek: string | null | undefined): string {
  if (!ertek) return '—'
  const d = new Date(ertek + (ertek.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return ertek
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

/** Időbélyeg → „2026. aug. 23. 14:05". */
export function magyarIdopont(ertek: string | null | undefined): string {
  if (!ertek) return '—'
  const d = new Date(ertek)
  if (Number.isNaN(d.getTime())) return ertek
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
