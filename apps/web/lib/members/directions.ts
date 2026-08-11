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

export interface DirectionsCounty {
  name?: string | null
  name_hu?: string | null
  name_ro?: string | null
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

export function resolveCountyName(county?: DirectionsCounty | null): string | null {
  if (!county) return null
  return txt(county.name_ro) ?? txt(county.name) ?? txt(county.name_hu)
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
 */
export function formatRomanianAddress(address: MemberDirectionsAddress): string | null {
  const locality = resolveLocalityName(address.locality)
  const street = resolveStreetName(address.street)
  const houseNumber = txt(address.houseNumber)
  const county = resolveCountyName(address.locality?.county)
  const postalCode = resolvePostalCode(address)

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

  if (county && county.toLowerCase() !== (locality?.text || '').toLowerCase()) parts.push(county)
  if (postalCode) parts.push(postalCode)
  parts.push('România')

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

  const warnings: string[] = []
  if (locality && !locality.official) {
    warnings.push('A település hivatalos román neve hiányzik a címtörzsből — a térkép a magyar nevet kapja.')
  }
  if (street && !street.official) {
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
