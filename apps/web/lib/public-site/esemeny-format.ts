/**
 * Nyilvános alkalmak magyar dátum-formázása (2026-08-27).
 *
 * KÖZÖS FORRÁS: a kezdőlap „Következő alkalom" kártyája, a „Közelgő
 * események" szekció és az Alkalmaink oldal éves naptára ugyanezt használja.
 * Korábban a formázó a szekció-komponensben lakott, tehát egy új felület csak
 * MÁSOLÁSSAL vehette át — a másolat pedig előbb-utóbb elcsúszik.
 *
 * Minden számítás UTC-alapú, `YYYY-MM-DD` szövegből: a programok dátuma
 * zóna-naiv dátum (nem időpont), így a helyi időzóna sosem tolhatja el egy
 * nappal.
 */

export const HU_HONAPOK = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
] as const

export const HU_HONAPOK_ROVID = [
  'jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.',
  'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.',
] as const

export const HU_NAPOK = [
  'vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat',
] as const

/** 'YYYY-MM-DD' → [év, hónap(1–12), nap] vagy null, ha nem értelmezhető. */
export function bontDatum(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** A hét napja (0 = vasárnap), UTC-alapon. */
export function hetNapja(iso: string): number | null {
  const r = bontDatum(iso)
  if (!r) return null
  return new Date(Date.UTC(r[0], r[1] - 1, r[2])).getUTCDay()
}

/** „2026. augusztus 3. (hétfő)" */
export function formazDatum(iso: string): string {
  const r = bontDatum(iso)
  if (!r) return iso
  const [y, mo, d] = r
  const nap = HU_NAPOK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
  return `${y}. ${HU_HONAPOK[mo - 1]} ${d}. (${nap})`
}

/** „aug. 3." — sűrű listákhoz, naptár-sorokhoz. */
export function formazDatumRovid(iso: string): string {
  const r = bontDatum(iso)
  if (!r) return iso
  return `${HU_HONAPOK_ROVID[r[1] - 1]} ${r[2]}.`
}

/** „14:00–16:00", „14:00", vagy üres string, ha nincs megadott idő. */
export function formazIdo(kezdes: string | null, befejezes: string | null): string {
  const k = kezdes ? kezdes.slice(0, 5) : ''
  const v = befejezes ? befejezes.slice(0, 5) : ''
  if (k && v) return `${k}–${v}`
  return k || v
}

/**
 * Az alkalom teljes időpont-sora: dátum (+ zárónap, ha többnapos) + idő.
 * Példa: „2026. augusztus 3. (hétfő) – 2026. augusztus 7. (péntek) · 09:00–13:00"
 */
export function formazIdopont(e: {
  datum: string
  datum_vege?: string | null
  ido_kezdes?: string | null
  ido_befejezes?: string | null
}): string {
  const tobbnapos = e.datum_vege && e.datum_vege !== e.datum
  const datumResz = tobbnapos
    ? `${formazDatum(e.datum)} – ${formazDatum(e.datum_vege as string)}`
    : formazDatum(e.datum)
  const idoResz = formazIdo(e.ido_kezdes ?? null, e.ido_befejezes ?? null)
  return idoResz ? `${datumResz} · ${idoResz}` : datumResz
}
