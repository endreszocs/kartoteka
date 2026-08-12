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

const DATUM_FORMAZOK = new Map<Hosszusag, Intl.DateTimeFormat>()

function datumFormazo(hosszusag: Hosszusag): Intl.DateTimeFormat {
  const meglevo = DATUM_FORMAZOK.get(hosszusag)
  if (meglevo) return meglevo
  const uj = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BUKARESTI_ZONA,
    year: 'numeric',
    month: hosszusag,
    day: 'numeric',
  })
  DATUM_FORMAZOK.set(hosszusag, uj)
  return uj
}

/**
 * ISO időbélyeg (vagy `Date`) → magyar dátum ÓRA NÉLKÜL, Europe/Bucharest szerint.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIÉRT KELL EZ KÜLÖN, AMIKOR VAN `toLocaleDateString('hu-HU', …)`
 * ════════════════════════════════════════════════════════════════════════════
 * Az átjelentkezési válaszlevél „Kelt" dátuma így készült — `timeZone` NÉLKÜL.
 * A Railway-konténer UTC-ben jár, tehát bukaresti 00:00 és 02:00/03:00 között
 * az ALÁÍRT, IKTATOTT egyházi iraton az ELŐZŐ NAP dátuma állt. Ez nem
 * kozmetika: az irat kelte jogi tartalom.
 *
 * @param hosszusag `'long'` = „2026. augusztus 11." (irat, levél),
 *                  `'short'` = „2026. aug. 11." (táblázat, lista).
 */
export function huDatumBukarest(
  iso: string | Date | null | undefined,
  hosszusag: Hosszusag = 'long',
): string {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return typeof iso === 'string' ? iso : '—'
  return datumFormazo(hosszusag).format(d)
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

let ORA_FORMAZO: Intl.DateTimeFormat | null = null

/** Csak óra:perc, Europe/Bucharest szerint („08:12"). */
export function huOraPercBukarest(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  if (!ORA_FORMAZO) {
    ORA_FORMAZO = new Intl.DateTimeFormat('hu-HU', {
      timeZone: BUKARESTI_ZONA,
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return ORA_FORMAZO.format(d)
}

// ────────────────────────────────────────────────────────────────────────────
// RELATÍV IDŐ — EGY IMPLEMENTÁCIÓ, NEM NÉGY
// ────────────────────────────────────────────────────────────────────────────

/**
 * MAGYAR RELATÍV IDŐ: „az imént" → „12 perce" → „3 órája" → „tegnap" → „2 napja".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KERÜLT IDE (2026-08-12)
 * ════════════════════════════════════════════════════════════════════════════
 * Az admin Áttekintésen ez a szöveg állt: „Utolsó igazolt mentés: 10.650685
 * órája". A `BackupHealth.oraSzam` NYERS lebegőpontos szám (ms / 3 600 000), és
 * a csempe formázás nélkül írta ki. Egy hatjegyű tizedes tört ott, ahol egy
 * embernek kellene beszélnie, az OLDAL ÖSSZES TÖBBI SZÁMÁT is hiteltelenné teszi.
 *
 * A javítás pillanatában HÁROM egyforma másolat élt a relatív időből
 * (`components/notifications/ertesites-vizualis.ts`,
 *  `components/admin/attekintes/idovonal-panel.tsx`,
 *  `components/offline/sync-status-panel.tsx`) — és a legrosszabb megoldás egy
 * NEGYEDIK megírása lett volna. Mostantól mind a három INNEN hívja, a
 * `huIdopontBukarest()` szomszédságából, mert a kettő mindig együtt jár.
 *
 * ⚠️ A RELATÍV IDŐ SOHA NEM ÁLL MAGÁBAN. „11 órája" nem mondja meg, MIKOR —
 *    egy visszaállítás előtti „melyik mentést válasszam?" döntés viszont pont
 *    ezen múlik. Ezért van a `huIdopontRelativval()`, és ezért azt használjuk.
 *
 * ⚠️ LEFELÉ KEREKÍTÜNK (`Math.floor`), nem a legközelebbire. A „10 órája" azt
 *    állítja, hogy LEGALÁBB 10 óra telt el — ez igaz. A „11 órája" 10,65 órára
 *    TÖBBET állít a valóságnál, és egy mentés-korra vonatkozó számnál mindig a
 *    szigorúbb (régebbinek látszó) irány a biztonságos. A rendszer többi
 *    felülete (harang, idővonal, szinkron-panel) 2026-08-11 óta szintén így
 *    számol — az egységes viselkedés itt fontosabb, mint a fél óra.
 *
 * @param most Az ÖSSZEHASONLÍTÁSI PILLANAT. Az admin Áttekintés a köteg
 *   `mertAt` értékét adja át, nem `Date.now()`-ot: a köteg 60 másodpercre
 *   gyorsítótárazva van, és enélkül a „11 órája" felirat elcsúszna a fejléc
 *   „Mérve: hh:mm" szövegétől.
 */
export function huRelativIdo(iso: string | null | undefined, most: number = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = most - t
  // Jövőbeli időbélyeg (óraeltérés két gép között) — nem hazudunk „−3 órát".
  if (diff < 0) return 'az imént'

  const perc = Math.floor(diff / 60_000)
  if (perc < 1) return 'az imént'
  if (perc < 60) return `${perc} perce`

  const ora = Math.floor(perc / 60)
  if (ora < 24) return `${ora} órája`

  const nap = Math.floor(ora / 24)
  if (nap === 1) return 'tegnap'
  if (nap < 7) return `${nap} napja`
  if (nap < 30) {
    const het = Math.floor(nap / 7)
    return het === 1 ? 'egy hete' : `${het} hete`
  }
  if (nap < 365) {
    const honap = Math.floor(nap / 30)
    return honap === 1 ? 'egy hónapja' : `${honap} hónapja`
  }
  const ev = Math.floor(nap / 365)
  return ev === 1 ? 'egy éve' : `${ev} éve`
}

/**
 * NAPTÁRI IDŐPONT emberi alakban: „ma 08:12" / „tegnap 22:04" /
 * „2026. aug. 10. 02:05".
 *
 * A „ma" és a „tegnap" BUKARESTI naptári napot jelent (`bukarestiNapKulcs`),
 * nem 24, illetve 48 órát — pontosan úgy, ahogy a mentés napi kulcsa.
 */
export function huNaptariIdopontBukarest(
  iso: string | null | undefined,
  most: number = Date.now(),
): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const napja = bukarestiNapKulcs(d)
  const maNap = bukarestiNapKulcs(new Date(most))
  if (napja === maNap) return `ma ${huOraPercBukarest(d)}`

  const tegnapNap = bukarestiNapKulcs(new Date(most - 86_400_000))
  if (napja === tegnapNap) return `tegnap ${huOraPercBukarest(d)}`

  return huIdopontBukarest(iso, 'short')
}

/**
 * A FELÜLETEN KIÍRHATÓ TELJES ALAK: „ma 08:12 (10 órája)".
 *
 * A pontos időpont ELÖL van, a relatív alak zárójelben követi — a relatív idő
 * segít tájékozódni, de a döntés a pontos időponton múlik.
 */
export function huIdopontRelativval(
  iso: string | null | undefined,
  most: number = Date.now(),
): string {
  if (!iso) return '—'
  const naptari = huNaptariIdopontBukarest(iso, most)
  const relativ = huRelativIdo(iso, most)
  return relativ ? `${naptari} (${relativ})` : naptari
}
