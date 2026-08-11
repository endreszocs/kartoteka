/**
 * ÚTVONAL-CÉLPONT ÉPÍTŐ — a személyi karton „Útvonal" gombja mögött (2026-08-11).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MI VOLT A BAJ (bizonyított, nem feltételezés)
 * ---------------------------------------------
 * A `member-details-dialog-v2.tsx` `buildDirectionsUrl`-je a
 * `member.adrlocality.name` + `member.adrstreet.name` mezőkből épített
 * célpontot. Ezek a nyilvántartás MAGYAR nevei — a kartoték szándékosan így
 * tárol, mert a gyülekezet nyelve ez. A Google Térkép viszont a HIVATALOS
 * ROMÁN névtörzsre geokódol:
 *
 *      „Barátos"  →  hivatalosan  Brateș (Covasna megye)
 *      „Főút"     →  hivatalosan  Strada Principală
 *
 * Ezért jött a lelkész képernyőjére szó szerint ez:
 *      „A Google Térkép nem találja a következőt: Barátos, Főút, 144, România"
 *
 * A `_ro` oszlopok (adrlocality.name_ro, adrstreet.name_ro, street_type_ro,
 * default_postalcode, adrcounty.name_ro) 2026-04-21 ÓTA LÉTEZNEK és fel is
 * vannak töltve (Poșta Română + GeoNames seed) — egyszerűen SENKI nem olvasta
 * őket a térkép-linkhez. A javítás nagyobb része tehát nem új adat, hanem a
 * MEGLÉVŐ adat használatba vétele.
 *
 * MIÉRT NINCS BENNE KÜLSŐ GEOKÓDOLÓ HÍVÁS
 * ---------------------------------------
 * A tulajdonos állandó szabálya (2026-08-09): „ne api kulcsot használjunk,
 * hanem építsük be natívan." A kulcsmentes Nominatim (OpenStreetMap) meg is
 * fordult a kezünkben, és TUDATOSAN elvetettük:
 *   · a használati feltétele max. 1 kérés/másodperc, azonosító User-Agenttel,
 *     és kifejezetten TILTJA az alkalmazás-háttérként való rendszeres
 *     geokódolást (pont ez lenne),
 *   · ODbL-attribúciót követel minden megjelenített találatnál,
 *     nincs rendelkezésre-állási garancia, visszaélésnél IP-t tilt,
 *   · a lelkész gyakran ÚTON, gyenge térerőn nyitja a kartont — egy elérhetetlen
 *     külső szolgáltatás pontosan akkor mondana csődöt, amikor a funkció kell.
 * Helyette: (1) a saját, hivatalos referencia-adatunk, (2) egyszeri emberi
 * megerősítés MAGÁBAN A TÉRKÉPBEN, koordinátaként eltárolva. A koordinátára
 * lekérdezéskor SEMMILYEN szolgáltatás nem kell, és soha nem hibázik.
 *
 * A MODUL SZÁNDÉKOSAN TISZTA (nincs React, nincs Supabase) — így önmagában
 * tesztelhető és a desktop/nyomtatás is újrahasználhatja.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Típusok
// ═══════════════════════════════════════════════════════════════════════════

export interface GeoPoint {
  lat: number
  lng: number
}

/** Az ORSZÁG a címtörzs tetején (`adrlocality → adrcounty → adrcountry`). */
export interface DirectionsCountry {
  id?: number | null
  name?: string | null
  /** Kétbetűs kód — a seed Romániára `RO`-t ír. */
  sname?: string | null
  name_hu?: string | null
  name_ro?: string | null
}

export interface DirectionsCounty {
  id?: number | null
  name?: string | null
  name_hu?: string | null
  name_ro?: string | null
  /** A 42 seedelt román megye MINDEGYIKÉNEK van SIRUTA- és rendszám-kódja. */
  siruta_code?: string | null
  auto_code?: string | null
  country?: DirectionsCountry | null
}

export interface DirectionsLocality {
  id?: number | null
  /** A nyilvántartás neve — ebben a közösségben MAGYAR (pl. „Barátos"). */
  name?: string | null
  name_hu?: string | null
  /** A hivatalos román név (pl. „Brateș") — a térkép EZT keresi. */
  name_ro?: string | null
  default_postalcode?: string | null
  siruta_code?: string | null
  needs_review?: boolean | null
  /** 2026-08-11-cim-geokodolas.sql — a lelkész által egyeztetett pont. */
  geo_lat?: number | string | null
  geo_lng?: number | string | null
  geo_verified_at?: string | null
  county?: DirectionsCounty | null
}

export interface DirectionsStreet {
  id?: number | null
  name?: string | null
  name_hu?: string | null
  name_ro?: string | null
  /** „Strada" / „Bulevardul" / „Aleea" … */
  street_type_ro?: string | null
  street_type_hu?: string | null
  postalcode?: string | null
  geo_lat?: number | string | null
  geo_lng?: number | string | null
  geo_verified_at?: string | null
}

/** A térkép-célponthoz szükséges MINDEN adat, egy helyen. */
export interface MemberDirectionsAddress {
  locality: DirectionsLocality | null
  street: DirectionsStreet | null
  /** `szemely.c_szam` — a házszám. */
  houseNumber?: string | null
}

/** Melyik szinten tárolunk egyeztetett pontot. */
export type AddressGeoScope = 'locality' | 'street'

export type DirectionsKind = 'koordinata' | 'cim'
export type DirectionsPrecision = 'utca' | 'telepules'

export interface DirectionsTarget {
  /** A megnyitható Google Maps útvonal-URL. */
  url: string
  /** Amit a térképnek ténylegesen átadunk — a kartonon MEGMUTATJUK, ez az
   *  „egyeztetés" látható fele: a lelkész látja, mit keres a gép. */
  destination: string
  kind: DirectionsKind
  precision: DirectionsPrecision
  /** Van-e a felhasznált szinten a lelkész által megerősített pont. */
  verified: boolean
  /** Magyar figyelmeztetések (mi hiányzik, mi lesz emiatt pontatlan). */
  warnings: string[]
}

/** A Bihar–Dobrudzsa négyszög — csak FIGYELMEZTETÉSHEZ, nem elutasításhoz
 *  (elköltözött tag címe simán lehet külföldi). */
const ROMANIA_BBOX = { latMin: 43.5, latMax: 48.4, lngMin: 20.1, lngMax: 29.8 }

// ═══════════════════════════════════════════════════════════════════════════
// Apró segédek
// ═══════════════════════════════════════════════════════════════════════════

function txt(value?: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

/** A PostgREST a `numeric`-et számként ÉS stringként is visszaadhatja. */
function num(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function isValidGeoPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  if (!point) return false
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 &&
    point.lng >= -180 && point.lng <= 180 &&
    // A 0,0 (Guineai-öböl) mindig hibás adat, nem valódi lakcím.
    !(point.lat === 0 && point.lng === 0)
  )
}

export function isOutsideRomania(point: GeoPoint): boolean {
  return (
    point.lat < ROMANIA_BBOX.latMin || point.lat > ROMANIA_BBOX.latMax ||
    point.lng < ROMANIA_BBOX.lngMin || point.lng > ROMANIA_BBOX.lngMax
  )
}

/** Egyeztetett pont a településen (csak ha az egyeztetés meg is történt). */
export function localityGeoPoint(locality?: DirectionsLocality | null): GeoPoint | null {
  if (!locality) return null
  const point = { lat: num(locality.geo_lat) ?? NaN, lng: num(locality.geo_lng) ?? NaN }
  return isValidGeoPoint(point) ? point : null
}

/** Egyeztetett pont az utcán. */
export function streetGeoPoint(street?: DirectionsStreet | null): GeoPoint | null {
  if (!street) return null
  const point = { lat: num(street.geo_lat) ?? NaN, lng: num(street.geo_lng) ?? NaN }
  return isValidGeoPoint(point) ? point : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Névfeloldás — román elsőbbséggel, magyar tartalékkal
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolvedName {
  text: string
  /** Igaz, ha a HIVATALOS román alakot használjuk (a térkép ezt szereti). */
  official: boolean
}

/** Település a térképnek: `name_ro` → `name` → `name_hu`. */
export function resolveLocalityName(locality?: DirectionsLocality | null): ResolvedName | null {
  if (!locality) return null
  const ro = txt(locality.name_ro)
  if (ro) return { text: ro, official: true }
  const fallback = txt(locality.name) ?? txt(locality.name_hu)
  return fallback ? { text: fallback, official: false } : null
}

/**
 * Utca a térképnek.
 * · Van `name_ro` → a hivatalos alak, típus-előtaggal („Strada Principală").
 * · Nincs → a nyilvántartási (magyar) név NYERSEN. SZÁNDÉKOSAN nem teszünk elé
 *   kitalált „Strada"-t: a „Strada Főút" egy nem létező román utcanév, amitől
 *   a geokódolás inkább romlik, mint javul.
 */
export function resolveStreetName(street?: DirectionsStreet | null): ResolvedName | null {
  if (!street) return null
  const ro = txt(street.name_ro)
  if (ro) {
    const type = txt(street.street_type_ro)
    // Idempotens: ha a név már tartalmazza a típust, nem duplázunk.
    const alreadyTyped = type ? ro.toLowerCase().startsWith(type.toLowerCase()) : false
    return { text: type && !alreadyTyped ? `${type} ${ro}` : ro, official: true }
  }
  const fallback = txt(street.name) ?? txt(street.name_hu)
  return fallback ? { text: fallback, official: false } : null
}

/**
 * A megye neve a térkép-célponthoz.
 *
 * ⚠️ 2026-08-11 — A JELENTÉS NÉLKÜLI MEGYENÉV NEM CÍMELEM.
 *    A címtörzsben KÉT ilyen ül: a legacy „?" megye (a Delphi/Access-átvétel
 *    öröksége — élesben ezen ülnek az erdélyi sorok) és a
 *    2026-08-11-orszagok-es-kulfoldi-telepulesek.sql „(külföld)" TARTÓOSZLOPA.
 *    Mindkettő SZÁNDÉKOSAN `name_ro` NÉLKÜL van, tehát a lenti sorrend a
 *    `name`-re esne vissza, és a `formatRomanianAddress` szó szerint ezt tenné
 *    a Google `destination` paraméterébe:
 *        „Váci utca 12, Budapest, (külföld), 1054, Magyarország"
 *        „Barátos nr. 144, ?, România"
 *    A lelkész ezt a kartonon, az „A térkép ezt keresi:" sorban EL IS OLVASSA.
 *    Egy zárójeles/kérdőjeles token a geokódolást rontja — ezért az ilyen
 *    neveket itt, EGYETLEN helyen dobjuk el, nem minden hívónál külön.
 *    (Lásd `isJelentesNelkuliNev` — ugyanaz a szabály, ami a helykitöltő
 *    településeket is felismeri.)
 */
export function resolveCountyName(county?: DirectionsCounty | null): string | null {
  if (!county) return null
  const jeloltek = [county.name_ro, county.name, county.name_hu]
    .map((value) => txt(value))
    .filter((value): value is string => value !== null && !isJelentesNelkuliNev(value))
  return jeloltek[0] ?? null
}

/** Az irányítószám: az utcáé pontosabb, a településé a tartalék. */
export function resolvePostalCode(address: MemberDirectionsAddress): string | null {
  return txt(address.street?.postalcode) ?? txt(address.locality?.default_postalcode)
}

// ═══════════════════════════════════════════════════════════════════════════
// Szöveges cím a térképnek
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A romániai hivatalos cím-sorrend, geokódolásra hangolva:
 *
 *   <utcatípus utcanév> <házszám>, <település>, <megye>, <irányítószám>, România
 *
 * Ha nincs utca (romániai falvakban ez a NORMÁLIS eset), a helyes alak
 * `<település> nr. <házszám>` — a „nr." nélkül a puszta szám postai kódnak
 * látszana. Ha VAN utca, a „nr." elhagyható, és a Google így megbízhatóbban
 * párosít („Strada Principală 144").
 *
 * A lakás-töredékek (tömbház/lépcsőház/emelet/ajtó) KIMARADNAK: az ajtóig
 * úgysem navigál a térkép, viszont elronthatják a párosítást. (A kartonon
 * megjelenített cím ettől függetlenül teljes — lásd `formatAddressLine`.)
 *
 * ⚠️ 2026-08-11 — AZ ORSZÁG NEM MINDIG ROMÁNIA (mért hiba, nem elmélet).
 *    A gyülekezet tagjainak egy része Budapesten, Debrecenben, Gödöllőn,
 *    Győrben, Hollandiában él. A függvény korábban FELTÉTEL NÉLKÜL a
 *    „România" szót ragasztotta a sor végére, tehát egy budapesti tag célpontja
 *    szó szerint ez lett:
 *        „Váci utca 12, Budapest, Pest, 1054, România"
 *    — a Google ilyenkor Romániában keres egy magyar utcát, és az útvonal
 *    éppen a KÜLFÖLDI tagoknál marad rossz. A név a függvényben a romániai
 *    hivatalos SORRENDRE utal (utca, település, megye, irsz., ország); az
 *    ország maga a címtörzsből jön:
 *      · BIZONYÍTOTTAN külföldi ország → annak a neve kerül a végére,
 *      · Románia VAGY ismeretlen ország → „România" (a nyilvántartás túlnyomó
 *        része romániai, és ez volt az eddigi működés is).
 *
 * ⚠️ 2026-08-11 — A MEGYE CSAK ROMÁNIAI CÍMEN CÍMELEM. Külföldi országnál
 *    kimarad: a címtörzs ott egyetlen, semleges „(külföld)" nevű megyét használ
 *    tartóoszlopnak (az `adrlocality.countyid` NOT NULL), és ezt a zárójeles
 *    tokent a Google `destination` paraméterébe tenni pont annál a 8 tagnál
 *    rontaná el a geokódolást, akik kedvéért az egész ág készült.
 */
export function formatRomanianAddress(address: MemberDirectionsAddress): string | null {
  const locality = resolveLocalityName(address.locality)
  const street = resolveStreetName(address.street)
  const houseNumber = txt(address.houseNumber)
  const county = resolveCountyName(address.locality?.county)
  const postalCode = resolvePostalCode(address)
  const country = address.locality?.county?.country ?? null
  const kulfoldi = isRomanianCountry(country) === false

  const parts: string[] = []

  if (street) {
    parts.push(houseNumber ? `${street.text} ${houseNumber}` : street.text)
    if (locality) parts.push(locality.text)
  } else if (locality) {
    parts.push(houseNumber ? `${locality.text} nr. ${houseNumber}` : locality.text)
  } else {
    // Se utca, se település: a puszta házszám értelmezhetetlen a térképnek.
    return null
  }

  // ⚠️ 2026-08-11 — KÜLFÖLDI CÍMNÉL A MEGYE KIMARAD.
  //    A címtörzsben a külföldi országokat egyetlen, semleges „(külföld)" nevű
  //    megye tartja (`adrlocality.countyid` NOT NULL — máshogy nem köthető
  //    országhoz). Ez TARTÓOSZLOP, nem közigazgatási állítás: sem magyar, sem
  //    holland megyerendszert nem modellezünk, tehát a megyénk NEM a cím része.
  //    A `resolveCountyName` a zárójeles nevet már eldobja, de a védelem itt is
  //    kell: egy KÉSŐBB felvett, valódi nevű külföldi „megye" (pl. „Pest") is
  //    csak zavarná a Google-t, mert nem a helyi közigazgatási tagolás. Az
  //    irányítószám marad — az minden országban valódi címelem.
  if (!kulfoldi && county && county.toLowerCase() !== (locality?.text || '').toLowerCase()) {
    parts.push(county)
  }
  if (postalCode) parts.push(postalCode)

  if (kulfoldi) {
    // A saját nevén keressük — a Google a magyar/holland alakot is ismeri.
    const foreignName = txt(country?.name) ?? txt(country?.name_hu) ?? txt(country?.name_ro)
    if (foreignName) parts.push(foreignName)
  } else {
    parts.push('România')
  }

  return parts.join(', ')
}

/**
 * A KERESŐ-lekérdezés az egyeztető ablakhoz („nyisd meg a térképen, és keresd
 * meg"). Ugyanaz, mint a célpont — de ha a pontot már egyeztettük, a
 * koordinátát adjuk, hogy a lelkész az ELMENTETT pontot lássa viszont.
 */
export function buildLookupQuery(address: MemberDirectionsAddress): string | null {
  const point = streetGeoPoint(address.street) ?? localityGeoPoint(address.locality)
  if (point) return formatGeoPoint(point)
  return formatRomanianAddress(address)
}

/** Egységes koordináta-írásmód (6 tizedes ≈ 11 cm — bőven elég). */
export function formatGeoPoint(point: GeoPoint): string {
  const round = (value: number) => Number(value.toFixed(6)).toString()
  return `${round(point.lat)},${round(point.lng)}`
}

// ═══════════════════════════════════════════════════════════════════════════
// A CÉLPONT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sorrend — a legmegbízhatóbbtól a leggyengébbig:
 *
 *  1. AZ UTCA egyeztetett pontja → koordináta. Soha nem hibázik, nem kell hozzá
 *     semmilyen szolgáltatás.
 *  2. A TELEPÜLÉS egyeztetett pontja, HA az utca nem hozható hivatalos alakra.
 *     Ilyenkor egy ismeretlen (magyar) utcanév a szöveges címben többet ártana,
 *     mint amennyit használ: inkább a biztos falu-pont.
 *  3. SZÖVEGES cím, román elsőbbséggel. Ez az az ág, ami a lelkész esetét
 *     magától megoldja, amint a `name_ro` megvan („Brateș").
 *  4. Semmi — a gomb ilyenkor tiltott, nem hazudik navigációt.
 */
export function buildDirectionsTarget(
  address: MemberDirectionsAddress | null | undefined,
): DirectionsTarget | null {
  if (!address) return null

  const locality = resolveLocalityName(address.locality)
  const street = resolveStreetName(address.street)
  const streetPoint = streetGeoPoint(address.street)
  const localityPoint = localityGeoPoint(address.locality)

  // ⚠️ 2026-08-11 — A HIÁNYZÓ ROMÁN NÉV CSAK ROMÁNIÁBAN HIÁNY.
  //    Budapestnek, Debrecennek, Gödöllőnek, Győrnek nincs és nem is lehet
  //    román neve — a térkép mégis tökéletesen megtalálja őket a saját nevükön.
  //    A figyelmeztetés ott a karton szövegsávjában, közvetlenül a semleges
  //    „Külföldi cím" pirula alatt jelenne meg, és ugyanazt a hamis riasztást
  //    hozná vissza egy sorral lejjebb. Ismeretlen országnál viszont MEGMARAD:
  //    ott a hiányzó név tényleg valószínű hibaforrás.
  const kulfoldiOrszag = isRomanianCountry(address.locality?.county?.country) === false
  const warnings: string[] = []
  if (!kulfoldiOrszag && locality && !locality.official) {
    warnings.push('A település hivatalos román neve hiányzik a címtörzsből — a térkép a magyar nevet kapja.')
  }
  if (!kulfoldiOrszag && street && !street.official) {
    warnings.push('Az utca hivatalos román neve hiányzik a címtörzsből — a térkép a magyar nevet kapja.')
  }
  if (address.locality?.needs_review) {
    warnings.push('Ez a település importból származik, és még nincs felülvizsgálva.')
  }

  // 1. Az utca egyeztetett pontja.
  if (streetPoint) {
    const destination = formatGeoPoint(streetPoint)
    return {
      url: buildGoogleDirectionsUrl(destination),
      destination,
      kind: 'koordinata',
      precision: 'utca',
      verified: true,
      // Az egyeztetett pont felülírja a névhiányokat — azok innentől nem
      // befolyásolják az útvonalat.
      warnings: [],
    }
  }

  // 2. A település egyeztetett pontja, ha az utca nem hivatalos alakú.
  if (localityPoint && (!street || !street.official)) {
    const destination = formatGeoPoint(localityPoint)
    return {
      url: buildGoogleDirectionsUrl(destination),
      destination,
      kind: 'koordinata',
      precision: 'telepules',
      verified: true,
      warnings: street
        ? ['Az utca még nincs egyeztetve, ezért a térkép a település egyeztetett pontjára visz — onnan házszám szerint tájékozódj.']
        : [],
    }
  }

  // 3. Szöveges cím.
  const destination = formatRomanianAddress(address)
  if (destination) {
    return {
      url: buildGoogleDirectionsUrl(destination),
      destination,
      kind: 'cim',
      precision: street ? 'utca' : 'telepules',
      verified: Boolean(localityPoint),
      warnings,
    }
  }

  return null
}

/** Kényelmi burkoló ott, ahol csak az URL kell. */
export function buildMemberDirectionsUrl(
  address: MemberDirectionsAddress | null | undefined,
): string | null {
  return buildDirectionsTarget(address)?.url ?? null
}

function buildGoogleDirectionsUrl(destination: string): string {
  // A célpont MINDIG URL-kódolt query-paraméter — soha nem kerül nyersen az
  // útvonalba (ugyanaz az elv, mint a `lib/public-site/map-link.ts`-ben).
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

// ═══════════════════════════════════════════════════════════════════════════
// A CÍM TÉRKÉP-ÁLLAPOTA (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────
// EGY forrás KÉT fogyasztónak:
//   · a személyi karton kis ikonja („kezeli-e a térkép ezt a címet?"),
//   · a tagnyilvántartás Hibák füle („a címet a kartonon kell javítani").
// Külön „feloldható-e" logikát ÍRNI TILOS — ez a projekt visszatérő
// hibaosztálya (két pénzügyi Súgó, négy járulék-osztályozó, öt lapozó segéd).
// ═══════════════════════════════════════════════════════════════════════════

/** A település feloldható-e: van egyeztetett pont VAGY hivatalos román név. */
export function isLocalityMapResolvable(locality?: DirectionsLocality | null): boolean {
  if (!locality) return false
  if (localityGeoPoint(locality)) return true
  return resolveLocalityName(locality)?.official === true
}

/** Ugyanez az utcára. Falusi címnél a hiánya NORMÁLIS, nem hiba. */
export function isStreetMapResolvable(street?: DirectionsStreet | null): boolean {
  if (!street) return false
  if (streetGeoPoint(street)) return true
  return resolveStreetName(street)?.official === true
}

/**
 * A NÉGY megkülönböztetendő állapot (+ a „nincs mit keresni" eset).
 * ⛔ A színvak felhasználó a színből SEMMIT nem lát — ezért a felület
 *    KÖTELEZŐEN külön IKONALAKOT és SZÖVEGET is rendel mindegyikhez.
 *
 * ⚑ 2026-08-11 — a negyedik: `nem-ellenorizheto`. Ide esik minden olyan cím,
 *   amelyről NEM állíthatjuk felelősen, hogy a térkép nem találja meg:
 *   a bizonyítottan külföldi települések (Budapest, Debrecen, Gödöllő, Győr,
 *   Hollandia — ezeknek nincs és nem is lehet román nevük, a Google mégis
 *   tökéletesen megtalálja őket), és azok, amelyeknél az ország egyszerűen
 *   nem állapítható meg (legacy „?" megye). Semleges pirula, nulla riasztás.
 *
 * ⚠️ A `nem-ellenorizheto` NÉGY KÜLÖNBÖZŐ CÍMKÉT hordoz, mert négy különböző
 *   teendő tartozik hozzájuk — a `label`/`detail` mondja meg, melyik:
 *     · „Hiányzik a település"          → válaszd ki a települést,
 *     · „Országnév a település helyén"  → írd be a tényleges várost,
 *     · „Külföldi cím"                  → nincs riasztás, de pontosítható,
 *     · „Nem ellenőrizhető"             → nem tudjuk, melyik ország; hallgatunk.
 */
export type AddressMapStatus =
  | 'megtalalhato'
  | 'bizonytalan'
  | 'nem-talalhato'
  | 'nem-ellenorizheto'
  | 'nincs-cim'

export interface AddressMapAssessment {
  status: AddressMapStatus
  /** Rövid, pirulába való címke. */
  label: string
  /** Egész mondat — ez megy a `title`-be és a képernyőolvasónak. */
  detail: string
  /** A kiszámolt célpont (ha van) — a hívó ne számolja újra. */
  target: DirectionsTarget | null
}

/**
 * A cím térkép-állapota.
 *
 * ⚠️ 2026-08-11 — A BESOROLÁS A MÁR KISZÁMOLT CÉLPONTBÓL INDUL, NEM MELLETTE.
 *    A korábbi változat kiszámolta a `target`-et, majd ELDOBTA, és kizárólag
 *    az `isLocalityMapResolvable`-t kérdezte. Emiatt két mért hazugság állt elő:
 *
 *      1. Ha a lelkész MÁR egyeztette az UTCÁT (az egyeztető ablak utca-fülén),
 *         a `buildDirectionsTarget` a pontos házkoordinátát adja — a kartonon
 *         viszont egymás alatt, 2 cm-re jelent meg a rózsaszín „A térkép nem
 *         találja" pirula ÉS a zöld pipás „Ez a cím egyeztetve van a térképpel."
 *         Az elvégzett munkára mondtunk hibát.
 *      2. Külföldi településnél (Budapest, Debrecen, …) a piros pirula azt
 *         kérte, hogy a lelkész „javítson" egy tökéletesen jó címet.
 *
 *    Ezért a sorrend: (a) van-e MEGERŐSÍTETT PONT — az mindent felülír, mert a
 *    koordinátához se név, se nyelv, se szolgáltatás nem kell; (b) csak utána
 *    dönt a NÉV; (c) és a piros ág elé kerül a KÜLFÖLD-KAPU.
 *
 * ⚠️ 2026-08-11 (KIEGÉSZÍTÉS) — A KOORDINÁTA-ÁG ELÉ MÉG EGY LÉPCSŐ KERÜLT:
 *    „a település mezőben nincs település" (helykitöltő „?" vagy egy ORSZÁG
 *    neve). Ez felülír minden koordinátát. Indok: a Hibák fül `lakcim|logic`
 *    tétele NÉV-alapú, tehát egy elmentett pont után is NYITVA marad — ha a
 *    karton közben zöldre váltana, a két felület ellentmondana egymásnak, és a
 *    lelkész nem tudná feloldani. A pont attól még nem mondja meg, HOL LAKIK
 *    a tag; a hiányzó település az anyakönyvbe, a jelentésbe és a levélcímzésbe
 *    is beleszól, nem csak a navigációba.
 *
 *   · `megtalalhato`      — a térkép a házig / az utcáig visz,
 *   · `bizonytalan`       — a település megvan, az utca nem: a térkép a faluba visz,
 *   · `nem-talalhato`     — BIZONYÍTHATÓAN ROMÁNIAI település, amit a térkép
 *                           nem tud feloldani → ITT kell javítani,
 *   · `nem-ellenorizheto` — külföldi vagy ismeretlen országú cím: nem ítélünk,
 *   · `nincs-cim`         — nincs térképre küldhető cím (a felület hallgat).
 *
 * ⛔ Külön „feloldható-e" logikát írni TILOS: a Hibák fül
 *    (`shouldReportUnresolvableLocality`) és ez a függvény UGYANARRA a két
 *    segédre (`isLocalityMapResolvable` + `isProvablyRomanianLocality`) épül,
 *    hogy a két felület soha ne mondjon ellent egymásnak.
 */
export function assessAddressMap(
  address: MemberDirectionsAddress | null | undefined,
  orszagtorzs?: OrszagtorzsAllapot | null,
): AddressMapAssessment {
  const target = buildDirectionsTarget(address)
  if (!address || !target) {
    return {
      status: 'nincs-cim',
      label: 'Nincs cím',
      detail: 'Ehhez a taghoz nincs olyan lakcím rögzítve, amit a térképnek el lehetne küldeni.',
      target: null,
    }
  }

  // Az utca még hiányzó hivatalos alakja — két ágon is ugyanaz a mondat kell.
  const streetMissing = Boolean(address.street) && !isStreetMapResolvable(address.street)

  const bizonytalan = (detail: string): AddressMapAssessment => ({
    status: 'bizonytalan',
    label: 'Csak a településig',
    detail,
    target,
  })
  const megtalalhato = (detail: string): AddressMapAssessment => ({
    status: 'megtalalhato',
    label: 'A térkép megtalálja',
    detail,
    target,
  })

  // ── 0. A TELEPÜLÉS HELYÉN NINCS TELEPÜLÉS — EZ MINDENT FELÜLÍR. ───────────
  //
  // ⚠️ 2026-08-11 — MIÉRT ÁLL EZ A KOORDINÁTA-ÁG ELŐTT (mért ellentmondás).
  //    A korábbi sorrendben a `kind === 'koordinata'` ág jött előbb. Elég volt
  //    tehát EGYETLEN egyeztetett pont bárhol a „?" sor alatt (a település
  //    sorára vagy egy ottani utcára), és a karton pirulája „A térkép
  //    megtalálja"-ra váltott — miközben a Hibák fülön a `lakcim|logic` tétel
  //    („Ebből a lakcímből hiányzik a település") HELYESEN nyitva maradt, mert
  //    az NÉV-alapú. A lelkész elvégezte az egyeztetést, zöldet kapott, és a
  //    hibalista mégis pirosan tartotta — magyarázat nélkül. Pontosan ezt az
  //    ellentmondást ígéri kizárni a modul fejléce.
  //    A helykitöltő állapota ezért FELÜLÍR MINDEN KOORDINÁTÁT: attól, hogy van
  //    egy pont, még nem tudjuk, hol lakik a tag.
  if (isPlaceholderLocality(address.locality)) {
    return {
      status: 'nem-ellenorizheto',
      label: 'Hiányzik a település',
      detail:
        'Ehhez a címhez nincs valódi település rögzítve — a címtörzsben csak egy helykitöltő („?") áll. Ezért a térkép nem tud hova vinni, és a „Cím egyeztetése" sem segít: előbb az Elérhetőségeknél válaszd ki a tényleges települést.',
      target,
    }
  }
  // Ugyanez a családja: a település mezőbe egy ORSZÁG neve került („Hollandia",
  // 2 élő tag). Ilyenkor a térkép legfeljebb az ország közepéig visz, és a
  // teendő NEM a térképen van — a valódi várost kell beírni.
  if (isCountryNamedLocality(address.locality)) {
    const nev = resolveLocalityName(address.locality)?.text ?? 'ország'
    return {
      status: 'nem-ellenorizheto',
      label: 'Országnév a település helyén',
      detail:
        `A település helyére egy országnév került („${nev}"), nem valódi város vagy falu — a térkép ezért legfeljebb az ország közepéig tud vinni. ` +
        'Nyisd meg az Elérhetőségeket, és írd be a tényleges várost; utána a „Cím egyeztetése" gombbal a pontos hely is megerősíthető.',
      target,
    }
  }

  // ── 1. MEGERŐSÍTETT PONT — a lelkész MÁR elvégezte az egyeztetést. ────────
  // A koordináta felülír minden névhiányt: nincs geokódolás, nincs mit eltéveszteni.
  if (target.kind === 'koordinata') {
    if (target.precision === 'utca') {
      return megtalalhato(
        'Ez a cím egyeztetve van a térképpel: az „Útvonal" gomb a mentett pontra visz, a nevektől függetlenül.',
      )
    }
    // Település-pont. Ha van utca, de nincs hivatalos alakja, csak a faluig visz.
    return streetMissing
      ? bizonytalan(
          'A település egyeztetett pontja megvan, az utca viszont még nincs — az útvonal a falu közepére visz, a házszámot a helyszínen keresd. A „Cím egyeztetése" gombbal pontosíthatod.',
        )
      : megtalalhato(
          'Ez a cím egyeztetve van a térképpel: az „Útvonal" gomb a település mentett pontjára visz.',
        )
  }

  // ── 2. Nincs megerősített pont → a NÉV dönt. ──────────────────────────────
  if (!isLocalityMapResolvable(address.locality)) {
    // ⚠️ A KÜLFÖLD-KAPU. Ugyanaz, ami a Hibák fülön: hibát CSAK bizonyíthatóan
    //    romániai településre jelzünk. Egy budapesti tag címe NEM HIBÁS.
    if (!isProvablyRomanianLocality(address.locality, orszagtorzs)) {
      const kulfoldi = isRomanianCountry(address.locality?.county?.country) === false
      return {
        status: 'nem-ellenorizheto',
        label: kulfoldi ? 'Külföldi cím' : 'Nem ellenőrizhető',
        // ⚠️ 2026-08-11 — NEM MONDJUK, HOGY „nincs mit javítani rajta".
        //    A korábbi szöveg ezt feltétel nélkül állította, holott a külföldi
        //    címek egy részénél VAN teendő (hiányzó város, pontatlan utcanév),
        //    és a Hibák fülön ezekre szándékosan nincs tétel — a lelkész tehát
        //    sehonnan nem értesülne róla. Nem riasztunk, de nem is zárjuk le a
        //    kérdést: megmondjuk, hol tud pontosítani, ha az útvonal nem jó.
        detail: kulfoldi
          ? 'Ez a cím nem Romániában van, ezért nincs is román neve — a térkép a saját nevén keresi, és általában meg is találja. Ha az útvonal nem oda visz, ahova kell, az Elérhetőségeknél pontosítsd a várost és az utcát, vagy a „Cím egyeztetése" gombbal erősítsd meg a helyet a térképen.'
          : 'Erről a településről nem tudjuk, melyik országban van, ezért nem ítéljük meg a térkép találatát — inkább hallgatunk, mint hogy hamis hibát mutassunk. Ha az útvonal nem jó, a „Cím egyeztetése" gombbal egyszer megerősítheted a helyet.',
        target,
      }
    }
    return {
      status: 'nem-talalhato',
      label: 'A térkép nem találja',
      detail:
        'A térkép ezt a települést nem tudja feloldani. Nyisd meg a „Cím egyeztetése" gombot, és erősítsd meg a helyet a térképen — egyszer elég, utána a település minden tagjának jó lesz az útvonal.',
      target,
    }
  }

  if (streetMissing) {
    return bizonytalan(
      'A térkép a települést megtalálja, az utcát nem — az útvonal a falu közepére visz, a házszámot a helyszínen keresd. A „Cím egyeztetése" gombbal pontosíthatod.',
    )
  }

  return megtalalhato('A térkép megtalálja ezt a címet — az „Útvonal" gomb pontosan idevisz.')
}

// ═══════════════════════════════════════════════════════════════════════════
// KÜLFÖLDI-E A TELEPÜLÉS? — a ZAJ elkerülésének EGYETLEN kapuja (2026-08-11)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ EZ A FÜGGVÉNY A FUNKCIÓ LELKE. A tagok egy része Budapesten, Debrecenben,
//    Gödöllőn, Győrben, Hollandiában él. Ezeknek NINCS és nem is lehet román
//    nevük — a Google Térkép viszont a saját nevükön TÖKÉLETESEN megtalálja
//    őket. Egy budapesti tag címe NEM HIBÁS.
//    Ha ezeket hibaként jeleznénk, a lelkész tucatnyi HAMIS hibát kapna egy
//    eddig megbízható listában, és onnantól az EGÉSZET figyelmen kívül hagyná.
//    Az kártékonyabb, mint ha semmit nem jeleznénk.
//
// EZÉRT A LOGIKA POZITÍV IRÁNYÚ: nem azt kérdezzük, „bizonyítható-e, hogy
// külföldi?", hanem azt, hogy „BIZONYÍTHATÓ-E, HOGY ROMÁNIAI?". Ha az ország
// nem állapítható meg, HALLGATUNK. A kihagyott jelzés olcsó; a hamis nem.

const ROMANIA_COUNTRY_ID = 1
const ROMANIA_COUNTRY_CODE = 'ro'
const ROMANIA_NAMES = new Set(['romania', 'rumania', 'rumanien'])

function foldName(value?: string | null): string | null {
  const trimmed = txt(value)
  if (!trimmed) return null
  return trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * `true` = Románia · `false` = BIZONYÍTOTTAN másik ország · `null` = nem tudjuk.
 * A háromértékű válasz szándékos: a `null`-t a hívó NEM kezelheti `false`-ként
 * („akkor biztos külföldi") és `true`-ként sem („akkor biztos romániai").
 */
export function isRomanianCountry(country?: DirectionsCountry | null): boolean | null {
  if (!country) return null
  const code = foldName(country.sname)
  if (code) return code === ROMANIA_COUNTRY_CODE
  const names = [country.name, country.name_ro, country.name_hu]
    .map(foldName)
    .filter((value): value is string => value !== null)
  if (names.length > 0) return names.some((name) => ROMANIA_NAMES.has(name))
  if (typeof country.id === 'number') return country.id === ROMANIA_COUNTRY_ID
  return null
}

// ───────────────────────────────────────────────────────────────────────────
// AZ ORSZÁGTÖRZS ÁLLAPOTA — ÁTMENETI SZERKEZET (2026-08-11)
// ───────────────────────────────────────────────────────────────────────────
//
// ⚠️ MÉRT TÉNY, NEM ELMÉLET: az `adrcountry` táblában ELESBEN EGYETLEN sor van
//    (Románia, id=1, sname='RO') — az egész repóban egyetlen
//    `INSERT INTO public.adrcountry` létezik, a 2026-04-21-adr-seed-01-countries.sql
//    8. sora. Minden `adrcounty` erre az egy sorra mutat, tehát a címtörzs
//    Budapestre, Debrecenre, Gödöllőre, Győrre és „Hollandiára" IS azt feleli,
//    hogy Románia.
//
//    Ilyen törzsben a „Románia" NEM TÉNY, HANEM ALAPÉRTELMEZÉS: pontosan annyit
//    jelent, mint a „nem tudjuk". Ezért az `isRomanianCountry` `true` válaszát
//    ilyenkor `null`-ra (ismeretlen) fokozzuk le — a `false` viszont ÉRINTETLEN
//    marad, mert az mindig valódi információ (valaki tényleg másik országot
//    választott). A lefokozás így SOHA nem gyengíti a külföld-kizárást, csak
//    visszatartja a jelzést addig, amíg az ország bizonyítani nem tud.
//
// ⏳ MIKOR SZŰNIK MEG EZ AZ ÁG: amikor a
//    `migration-docs/sql/2026-08-11-orszagok-es-kulfoldi-telepulesek.sql`
//    lefut élesben (felveszi Magyarországot és Hollandiát, és átköti rájuk a
//    bizonyítottan külföldi településeket). Onnantól az `ismertOrszagok >= 2`,
//    az ország valódi információt hordoz, és ez az egész blokk törölhető —
//    az `isProvablyRomanianLocality` az `orszagtorzs` paraméter nélkül is
//    helyesen fog dönteni. ADDIG viszont a kód a mai, óvatos ágon marad, és
//    egyetlen hamis hibát sem zúdít a lelkészre.

/** Amit a hívó az `adrcountry` tábláról tud. Egyetlen szám, egyetlen kérdésre. */
export interface OrszagtorzsAllapot {
  /** Hány sora van az `adrcountry` táblának. Élesben ma: 1. */
  ismertOrszagok: number
}

/**
 * Hordoz-e egyáltalán információt az ország-mező?
 * Egy soros törzsben nem: ott minden település „romániai", a külföldiek is.
 * Ismeretlen állapotnál (`undefined`) FAIL-CLOSED: nem hordoz.
 */
export function isOrszagtorzsErtelmes(orszagtorzs?: OrszagtorzsAllapot | null): boolean {
  return (orszagtorzs?.ismertOrszagok ?? 0) >= 2
}

/**
 * HELYKITÖLTŐ-E A TELEPÜLÉS? (2026-08-11)
 *
 * A legacy (Delphi/Access) átvett címtörzsben van egy „?" NEVŰ `adrlocality`
 * sor, és élesben 70 ÉLŐ TAG címe mutat rá. Ez nem település, hanem egy üres
 * hely kitöltése — a tagnak LÁTSZÓLAG van címe, valójában nincs.
 *
 * ⛔ MIÉRT KELL EZT KÜLÖN ISMERNI, ÉS MIÉRT NEM TÉRKÉP-HIBA: a „térkép nem
 *    találja" tétel a „Cím egyeztetése" gombra küld, ami EGYETLEN koordinátát
 *    ír a település sorára. Ha valaki ezt a „?" soron elvégezné, az
 *    `isLocalityMapResolvable` onnantól igazat adna, és a probléma VÉGLEG
 *    elnémulna — 70 különböző valódi lakcím egyetlen hamis pontra szegezve.
 *    Az igaz mondat itt más: ezeknek a tagoknak a települése HIÁNYZIK, és
 *    egyenként, a személyi kartonon pótolható. Lásd a `validation-engine.ts`
 *    `helykitoltoTelepulesek` tételét.
 */
const HELYKITOLTO_NEV_RE = /^[?\-–—.,_\s]*$/
const HELYKITOLTO_NEVEK = new Set(['n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'])
/** Zárójellel kezdődő „név" — pl. a `(külföld)` tartóoszlop-megye. */
const ZAROJELES_NEV_RE = /^[([{]/

/**
 * MOND-E EGYÁLTALÁN VALAMIT EZ A NÉV? Egy helyre KÉT fogyasztó:
 *   · `isPlaceholderLocality` — a település-sor helykitöltő-e,
 *   · `resolveCountyName`     — bekerülhet-e a megye a térkép-célpontba.
 * Így a „?" és a „(külföld)" ugyanazon a szabályon bukik el, és nem lehet a
 * kettőt egymástól eltérően „javítani".
 */
function isJelentesNelkuliNev(nev: string): boolean {
  return (
    HELYKITOLTO_NEV_RE.test(nev)
    || ZAROJELES_NEV_RE.test(nev)
    || HELYKITOLTO_NEVEK.has(nev.toLowerCase())
  )
}

export function isPlaceholderLocality(locality?: DirectionsLocality | null): boolean {
  if (!locality) return false
  // A törzs MINDHÁROM névoszlopát nézzük: ha bármelyikben valódi név áll, a sor
  // használható. Csak akkor helykitöltő, ha EGYIK sem mond semmit.
  const nevek = [locality.name, locality.name_hu, locality.name_ro]
    .map((value) => txt(value))
    .filter((value): value is string => value !== null)
  if (nevek.length === 0) return true
  return nevek.every((nev) => isJelentesNelkuliNev(nev))
}

/**
 * ORSZÁGNÉV KERÜLT A TELEPÜLÉS HELYÉRE? (2026-08-11)
 *
 * MÉRT ESET, NEM ELMÉLET: a címtörzsben van egy „Hollandia" NEVŰ `adrlocality`
 * sor, 2 élő taggal. Ez nyilvánvalóan hibás adatfelvitel — egy ORSZÁG neve
 * került a település mezőbe —, és a rendszer NEM tudja kitalálni, melyik holland
 * városról van szó (a találgatás rosszabb, mint a hiány).
 *
 * ⛔ MIÉRT KELL KÜLÖN ÁLLAPOT: e nélkül ez a 2 tag a „külföldi cím" ágra esik,
 *    ahol a karton szó szerint azt állította, hogy „nincs mit javítani rajta".
 *    Ez HAMIS: az `orszagok-es-kulfoldi-telepulesek.sql` fejléce ugyanerről azt
 *    írja, hogy „AMIT A LELKÉSZNEK KÉZZEL KELL ELVÉGEZNIE: … beírni a tényleges
 *    holland várost". A teendő eddig SEHOL nem jelent meg a felületen — csak egy
 *    egyszer lefuttatott ellenőrző SELECT egyik sorában, ami a futtatás után
 *    elveszett. A Hibák fülön sincs tétele (külföld → csend), tehát a lelkész
 *    soha nem értesült volna róla.
 *
 * ⚠️ KÉT VÉDŐFELTÉTEL A HAMIS TALÁLAT ELLEN:
 *    (a) SIRUTA-kódos sorra SOHA — az a román hivatalos településnyilvántartás
 *        azonosítója, tehát a sor valódi település, bármi is a neve;
 *    (b) MINDEN kitöltött névoszlopnak országnévnek kell lennie (`every`) — ha
 *        valaki a `name_ro`-ba már beírta a valódi várost, a sor használható.
 *
 * A lista SZÁNDÉKOSAN rövid és konzervatív: a diaszpóra tényleges célországai
 * magyar, román és angol alakban. Ehhez jön DINAMIKUSAN a sor SAJÁT országának
 * a neve — ha a település neve = az országa neve, az önmagában bizonyíték.
 */
const ORSZAGNEV_TELEPULESKENT = new Set([
  // magyarul
  'magyarorszag', 'hollandia', 'nemetorszag', 'ausztria', 'anglia', 'nagy-britannia',
  'olaszorszag', 'spanyolorszag', 'franciaorszag', 'belgium', 'svajc', 'svedorszag',
  'norvegia', 'dania', 'irorszag', 'amerika', 'egyesult allamok', 'usa', 'kanada',
  'izrael', 'ausztralia', 'gorogorszag', 'csehorszag', 'szlovakia', 'szerbia',
  'ukrajna', 'lengyelorszag', 'portugalia', 'finnorszag', 'torokorszag', 'romania',
  // románul
  'ungaria', 'olanda', 'germania', 'italia', 'spania', 'franta', 'elvetia', 'suedia',
  'danemarca', 'irlanda', 'belgia', 'cehia', 'slovacia', 'ucraina', 'polonia',
  'portugalia', 'finlanda', 'turcia', 'grecia', 'statele unite',
  // angolul (az importált táblákban előfordul)
  'hungary', 'netherlands', 'holland', 'germany', 'england', 'united kingdom',
  'italy', 'spain', 'france', 'switzerland', 'sweden', 'norway', 'denmark',
  'ireland', 'israel', 'canada', 'australia', 'greece', 'poland', 'ukraine',
])

export function isCountryNamedLocality(locality?: DirectionsLocality | null): boolean {
  if (!locality) return false
  // (a) Hivatalos román település SOHA nem esik ide.
  if (txt(locality.siruta_code)) return false

  const nevek = [locality.name, locality.name_hu, locality.name_ro]
    .map((value) => foldName(value))
    .filter((value): value is string => value !== null)
  if (nevek.length === 0) return false

  // A sor SAJÁT országának a neve — dinamikus bizonyíték a statikus lista mellé.
  const orszag = locality.county?.country ?? null
  const sajatOrszagNevek = new Set(
    [orszag?.name, orszag?.name_hu, orszag?.name_ro]
      .map((value) => foldName(value))
      .filter((value): value is string => value !== null),
  )

  // (b) MINDEN kitöltött névoszlopnak országnévnek kell lennie.
  return nevek.every((nev) => ORSZAGNEV_TELEPULESKENT.has(nev) || sajatOrszagNevek.has(nev))
}

/**
 * BIZONYÍTHATÓAN romániai-e a település? Csak `true` esetén szabad hibát
 * jelezni rá. A sorrend nem esztétika — mindegyik lépés egy konkrét
 * hamis-jelzési utat zár le:
 *
 *  1. Az ország ISMERT és NEM Románia → külföldi. Ez a Budapest-ág.
 *  2. `needs_review` → az import wizard hozta létre, és az `add_locality_for_review`
 *     megye HÍJÁN Kovásznát tippel; a wizard ráadásul a kifejezetten
 *     „külföldi"-ként megjelölt településre is hardkódolt `'RO'` országkódot
 *     küld (`locality-match-step.tsx`). Egy így felvett „Budapest" tehát
 *     romániai megyében ül — a megyéje NEM bizonyíték. Hallgatunk.
 *     ⏳ Ez az ág addig teherhordó, amíg a wizard az országot TIPPELI.
 *  3. SIRUTA-kód → a román hivatalos településnyilvántartás azonosítója.
 *     Amelyik sornak van, az definíció szerint romániai. Ez az EGYETLEN ág,
 *     ami ország nélkül is bizonyít.
 *  4. Minden más esetben az ORSZÁG dönt — és csak az.
 *
 * ⛔ 2026-08-11 — MI TŰNT EL INNEN, ÉS MIÉRT. Korábban két további ág állt itt:
 *    a „seedelt román megye" (`name_ro` + SIRUTA/rendszám) és a „6 jegyű
 *    irányítószám". MINDKETTŐ CSAK AKKOR volt elérhető, ha az ország amúgy is
 *    Románia — vagyis külföldit sosem tudtak romániaivá tenni, KIZÁRÓLAG igaz
 *    hibát tudtak elnémítani. És pontosan ezt tették: a mérés szerint Zágon,
 *    Páké, Sepsiszentgyörgy, Kovászna és Csíkcsicsó (24 élő tag) a legacy „?"
 *    megye miatt mindkettőn elbukott, tehát a funkció ÉLESBEN NÉMA volt —
 *    0 jelzés. A 6 jegyű irányítószám ráadásul önmagában sem Románia-bizonyíték
 *    (Oroszország, India, Kína, Szingapúr is 6 jegyű), a hiánya pedig végképp
 *    nem külföld-bizonyíték.
 *
 * ⚠️ ISMERT, NYITOTT KITETTSÉG (nem ebben a körben javítjuk, de tudni kell róla):
 *    az `app_get_or_create_locality` RPC MINDEN szabad szövegként begépelt
 *    települést HARDKÓDOLT `countyid = 1`-gyel szúr be
 *    (2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql:407), és az `address-form`
 *    „— Külföldi cím —" ága is ide fut. Vagyis egy EZUTÁN begépelt „Bécs" is
 *    romániai megyébe kerül, és — mivel az ország innentől dönt — hamis jelzést
 *    kapna. A mai adatot ez NEM érinti (a mért 11 sor mind meglévő), és a
 *    javítás sem ide tartozik: a `countyid = 1` megszüntetése RPC-módosítás +
 *    a címűrlap ország-átadása, saját PR-ben. Amíg él, minden újonnan begépelt
 *    külföldi település egy hamis sort hozhat a Hibák fülre.
 */
export function isProvablyRomanianLocality(
  locality?: DirectionsLocality | null,
  orszagtorzs?: OrszagtorzsAllapot | null,
): boolean {
  if (!locality) return false

  let romanian = isRomanianCountry(locality.county?.country)
  // ÁTMENETI (lásd a fenti blokkot): egy soros törzsben a „Románia" alapérték,
  // nem tény — a `true`-t ilyenkor „nem tudjuk"-ra fokozzuk le. A `false` marad.
  if (romanian === true && !isOrszagtorzsErtelmes(orszagtorzs)) romanian = null

  if (romanian === false) return false
  if (locality.needs_review) return false
  if (txt(locality.siruta_code)) return true
  return romanian === true
}

/**
 * Jelezzük-e a tagnyilvántartás Hibák fülén ezt a települést?
 * HÁROM feltétel EGYÜTT: (a) nem helykitöltő sor (annak SAJÁT, igazabb tétele
 * van), (b) a térkép tényleg nem tudja feloldani, ÉS (c) bizonyíthatóan
 * romániai. Bármelyik hiánya = csend.
 *
 * ⚠️ A kérdés TELEPÜLÉS-szintű, és szándékosan az is marad: a defekt maga
 *    település-szintű (hiányzó hivatalos név a címtörzsben), és a javítás is
 *    egyetlen sorra megy. AZ EGYES TAG mentessége (van-e a saját UTCÁJÁN
 *    egyeztetett pont, tehát működik-e neki az útvonal a település hiánya
 *    ellenére) NEM ide tartozik — az a tagot ismerő rétegben, a validációs
 *    kontextus összeállításakor dől el (`validation-actions.ts` →
 *    `egyeztetettUtcak`). Ha ide húznánk be, ennek a függvénynek egy olyan
 *    tagot kellene ismernie, amilyet a hívója (település-lista) nem is lát.
 */
export function shouldReportUnresolvableLocality(
  locality?: DirectionsLocality | null,
  orszagtorzs?: OrszagtorzsAllapot | null,
): boolean {
  if (!locality) return false
  // A helykitöltő („?") sor NEM térkép-ügy: nincs mit a térképen megkeresni,
  // és az egyeztetés itt kifejezetten ROMBOLNA. Külön tétele van.
  if (isPlaceholderLocality(locality)) return false
  if (isLocalityMapResolvable(locality)) return false
  return isProvablyRomanianLocality(locality, orszagtorzs)
}

// ═══════════════════════════════════════════════════════════════════════════
// A LELKÉSZ ÁLTAL BEILLESZTETT PONT ÉRTELMEZÉSE (teljesen helyben, hálózat nélkül)
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedGeoInput {
  point: GeoPoint | null
  /** Magyar hibaüzenet, ha a beillesztett szöveg nem értelmezhető. */
  error: string | null
  /** Magyar figyelmeztetés (pl. Románián kívüli pont) — nem blokkol. */
  warning: string | null
}

const SHORT_LINK_RE = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i
const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`

/**
 * Elfogadja:
 *   · „46.123456, 26.123456" (szóköz / vessző / pontosvessző elválasztással,
 *     magyar tizedesvesszővel is, ha pontosvessző választ el)
 *   · teljes Google Maps URL-t: `!3d…!4d…` (a TALÁLAT pontja), `?q=`, `&query=`,
 *     `&destination=`, `ll=`, végül `/@lat,lng` (a nézet közepe)
 *
 * NEM tud mit kezdeni a rövidített megosztási linkkel (maps.app.goo.gl): annak
 * feloldásához hálózati kérés kellene, amit szándékosan nem teszünk. Ilyenkor
 * konkrét, elvégezhető magyar utasítást adunk vissza.
 */
export function parseGeoInput(raw: string | null | undefined): ParsedGeoInput {
  const source = (raw || '').trim()
  if (!source) return { point: null, error: null, warning: null }

  if (SHORT_LINK_RE.test(source)) {
    return {
      point: null,
      error: 'Ez rövidített megosztási link (maps.app.goo.gl), amiből nem tudjuk kiolvasni a pontot. Nyisd meg a linket a térképben, nyomd hosszan a helyet, és a felugró koordinátát („46.1234, 26.1234") másold ide.',
      warning: null,
    }
  }

  const patterns: RegExp[] = [
    // A TALÁLAT valódi pontja a hosszú Google-URL-ben — ez a legpontosabb.
    new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`),
    // ?q=… / &query=… / &destination=… / ll=… / center=…
    new RegExp(`[?&](?:q|query|daddr|destination|ll|center)=(${NUMBER})(?:,|%2C)\\s*(${NUMBER})`, 'i'),
    // A nézet közepe — csak végső esetben.
    new RegExp(`@(${NUMBER}),(${NUMBER})`),
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match) return finalizeGeo(match[1], match[2])
  }

  // Sima „lat, lng" (pont-tizedessel).
  const plain = source.match(new RegExp(`^(${NUMBER})\\s*[,;\\s]\\s*(${NUMBER})$`))
  if (plain) return finalizeGeo(plain[1], plain[2])

  // Magyar tizedesvessző, pontosvesszővel elválasztva: „46,1234; 26,1234".
  const huComma = source.match(/^(-?\d{1,3},\d+)\s*;\s*(-?\d{1,3},\d+)$/)
  if (huComma) return finalizeGeo(huComma[1].replace(',', '.'), huComma[2].replace(',', '.'))

  if (/^https?:\/\//i.test(source)) {
    return {
      point: null,
      error: 'Ebből a linkből nem tudtuk kiolvasni a koordinátát. A térképen nyomd hosszan a házat, és a felugró számpárt („46.1234, 26.1234") másold ide.',
      warning: null,
    }
  }

  return {
    point: null,
    error: 'Nem sikerült koordinátát felismerni. Két szám kell, vesszővel elválasztva — például: 46.123456, 26.123456',
    warning: null,
  }
}

function finalizeGeo(latRaw: string, lngRaw: string): ParsedGeoInput {
  const point = { lat: Number(latRaw), lng: Number(lngRaw) }
  if (!isValidGeoPoint(point)) {
    return { point: null, error: 'A felismert számpár nem érvényes koordináta (szélesség −90…90, hosszúság −180…180).', warning: null }
  }
  return {
    point,
    error: null,
    warning: isOutsideRomania(point)
      ? 'Ez a pont Románián kívülre esik. Ha a tag tényleg külföldön lakik, ez rendben van — egyébként ellenőrizd, nem cserélted-e fel a két számot.'
      : null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Az egyeztetés mentésének szerződése (a szerver-action és az ablak közös nyelve)
// ═══════════════════════════════════════════════════════════════════════════

export interface AddressGeoSaveInput {
  scope: AddressGeoScope
  /** adrlocality.id vagy adrstreet.id */
  id: number
  /** Elhagyható: ha csak a hivatalos nevet javítjuk. */
  lat?: number | null
  lng?: number | null
  /** Elhagyható: a hivatalos román név pótlása (meglévőt NEM írunk felül). */
  nameRo?: string | null
}

export interface AddressGeoSaveResult {
  ok?: true
  /** Magyar hibaüzenet — a felület ezt mutatja, összeomlás nélkül. */
  error?: string
  /** Magyar figyelmeztetés sikeres mentés mellé (pl. a nevet nem írtuk felül). */
  warning?: string
}
