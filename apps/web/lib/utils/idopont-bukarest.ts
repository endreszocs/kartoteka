/**
 * IDŐPONT-KIÍRÁS — MINDIG Europe/Bucharest (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A mentés-felület UGYANARRÓL az eseményről KÉT különböző időt írt ki:
 * a kártya fejlécében „2026. augusztus 11. 15:32", alatta „…18:32". Egyik sem
 * volt hiba a maga helyén — a kettő egyszerűen KÉT KÜLÖNBÖZŐ GÉP zónájában
 * formázódott:
 *   · a fejléc a SZERVEREN (Railway konténer = UTC),
 *   · az alatta lévő sor a BÖNGÉSZŐBEN (a lelkész gépe = Europe/Bucharest).
 * Mindkét helyen ugyanaz a mulasztás volt: a `toLocaleString('hu-HU', …)`
 * hívásból hiányzott a `timeZone` opció, tehát mindkettő a FUTTATÓ KÖRNYEZET
 * zónáját vette.
 *
 * ⛔ TILOS A KÉZI ELTOLÁS. „Adjunk hozzá 3 órát" — télen 2 óra a különbség
 *    (Europe/Bucharest = UTC+3 nyáron, UTC+2 télen), tehát egy fix eltolás
 *    októbertől márciusig ÚJRA hazudna, és épp az óraátállítás éjszakáján a
 *    legrosszabbul. Az egyetlen helyes megoldás az explicit `timeZone`.
 *
 * ⚠️ EZ A MODUL SZÁNDÉKOSAN DIREKTÍVA-MENTES (nincs rajta `server-only`,
 *    `use client` és `use server` sem): a mentés-felület KÉT oldalról használja
 *    ugyanezt a formázást, és pontosan a két külön másolat okozta a bajt.
 *
 * ⚠️ Egy visszaállítás előtti „melyik mentést válasszam?" döntés ezeken az
 *    időpontokon múlik. Nem kozmetika.
 */

export const BUKARESTI_ZONA = 'Europe/Bucharest'

/** A felületen kiírt zóna emberi neve — a felhasználó tudja, mit lát. */
export const BUKARESTI_ZONA_FELIRAT = 'helyi idő, Bukarest'

type Hosszusag = 'long' | 'short'

const FORMAZOK = new Map<Hosszusag, Intl.DateTimeFormat>()

function formazo(hosszusag: Hosszusag): Intl.DateTimeFormat {
  const meglevo = FORMAZOK.get(hosszusag)
  if (meglevo) return meglevo
  const uj = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BUKARESTI_ZONA,
    year: 'numeric',
    month: hosszusag,
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  FORMAZOK.set(hosszusag, uj)
  return uj
}

/**
 * ISO időbélyeg → magyar dátum + óra:perc, Europe/Bucharest szerint.
 *
 * @param hosszusag `'long'` = „2026. augusztus 11. 18:32" (áttekintő kártya),
 *                  `'short'` = „2026. aug. 11. 18:32" (táblázatok, párbeszéd).
 */
export function huIdopontBukarest(
  iso: string | null | undefined,
  hosszusag: Hosszusag = 'long',
): string {
  if (!iso) return '—'
  const d = new Date(iso)
  // Érvénytelen bemenetnél a NYERS értéket adjuk vissza, nem az „Invalid Date"
  // szöveget: így legalább látszik, mi jött a szerverről.
  if (Number.isNaN(d.getTime())) return iso
  return formazo(hosszusag).format(d)
}

/**
 * A MAI NAP Europe/Bucharest szerint, `YYYY-MM-DD` alakban.
 *
 * ⚠️ EZ NEM KIJELZÉS, HANEM KULCS. A mentés napi egyedi indexe, a „ma/tegnap"
 *    lefedettség és a riasztás-deduplikálás mind naptári napot használ — ha ezt
 *    UTC-ben számolnánk, a nap 03:00-kor (télen 02:00-kor) váltana, vagyis PONT
 *    az éjszakai mentési ablak közepén.
 */
export function bukarestiNapKulcs(date: Date = new Date()): string {
  // `en-CA` → ISO-alak (YYYY-MM-DD) minden Node- és böngésző-verzióban.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUKARESTI_ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
