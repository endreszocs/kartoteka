/**
 * Asztali eszköz-kapcsolás — a KÓD-ARITMETIKA egyetlen közös helye (2026-09-05).
 *
 * A web (API-útvonalak, jóváhagyó oldal) és az asztali alkalmazás UGYANEZT a
 * modult használja, hogy a titkos kód, annak hash-e és a 6 jegyű ellenőrző
 * kód mindkét oldalon ugyanabból a szabályból szülessen. Két külön másolat
 * itt a projekt ismert hibaosztálya lenne („a második felület a régi
 * implementációt őrzi") — ezért él a közös csomagban.
 *
 * A FOLYAMAT (device-flow, „tévé-belépés"):
 *   asztali app: kód = 32 véletlen bájt (base64url, 43 karakter) → POST
 *   /api/desktop-kapcsolas/inditas {kod, eszkozNev} → a szerver a kód
 *   SHA-256-át tárolja + egy nem-titkos kérés-azonosítót ad vissza → az app a
 *   böngészőben megnyitja /api/desktop-kapcsolas/nyit?id=<azonosító> → a
 *   lelkész bejelentkezve látja az eszköz nevét és a 6 jegyű ELLENŐRZŐ KÓDOT
 *   (ugyanaz áll az asztali képernyőn) → jóváhagy → az app a TITKOS kóddal
 *   lekéri az egyszer használatos belépő-tokent → verifyOtp → munkamenet.
 *
 * Csak platform-független Web Crypto-t használ (`globalThis.crypto`): Node ≥ 19,
 * a Tauri webview és minden modern böngésző adja.
 */

/** A titkos kód nyers hossza bájtban (256 bit entrópia). */
export const KAPCSOLASI_KOD_BAJT = 32

/** base64url, 32 bájt → pontosan 43 karakter, kitöltés nélkül. */
const KOD_MINTA = /^[A-Za-z0-9_-]{43}$/

/** Az eszköznév legnagyobb hossza (a jóváhagyó oldalon jelenik meg). */
export const ESZKOZ_NEV_MAX = 80

/** A kérés élettartama — ennyi ideje van a lelkésznek jóváhagyni. */
export const KAPCSOLAS_LEJARAT_MS = 10 * 60 * 1000

/** Az asztali app ennyi időnként kérdezi le az állapotot. */
export const KAPCSOLAS_LEKERDEZES_MS = 2000

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (!c || !c.subtle || typeof c.getRandomValues !== 'function') {
    throw new Error('A Web Crypto API nem érhető el — a kapcsolási kód nem állítható elő biztonságosan.')
  }
  return c
}

/** Új, kriptográfiailag erős titkos kód (43 karakteres base64url). */
export function ujKapcsolasiKod(): string {
  const bytes = new Uint8Array(KAPCSOLASI_KOD_BAJT)
  getCrypto().getRandomValues(bytes)
  return base64url(bytes)
}

/** A kód alaki érvényessége — a szerver ezt nézi, mielőtt bármit hash-elne. */
export function kapcsolasiKodErvenyes(kod: unknown): kod is string {
  return typeof kod === 'string' && KOD_MINTA.test(kod)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await getCrypto().subtle.digest('SHA-256', data)
  return hex(new Uint8Array(digest))
}

/**
 * A kód tárolt alakja: SHA-256 hex. A nyers kód SOHA nem kerül adatbázisba —
 * aki a táblát olvassa, nem tudja lekérdezni a belépő-tokent.
 */
export function kapcsolasiKodHash(kod: string): Promise<string> {
  return sha256Hex(`kartoteka-desktop-kapcsolas:v1:${kod}`)
}

/**
 * A 6 jegyű ELLENŐRZŐ KÓD — ugyanabból a titokból, más doménnel származtatva,
 * ezért a tárolt hash-ből NEM vezethető le, és a kódból NEM következtethető
 * vissza a hash. A lelkész ezt hasonlítja össze a két képernyőn: idegen
 * (adathalász) kérés esetén más szám állna az asztali gépén.
 */
export async function ellenorzoKod(kod: string): Promise<string> {
  const h = await sha256Hex(`kartoteka-desktop-kapcsolas:ellenorzo:v1:${kod}`)
  // Az első 8 hex jegy (32 bit) → 6 decimális jegy, vezető nullákkal.
  const n = parseInt(h.slice(0, 8), 16) % 1_000_000
  return String(n).padStart(6, '0')
}

/** „123 456" alakban — a képernyőn így könnyebb összeolvasni. */
export function ellenorzoKodFormazott(kod6: string): string {
  return `${kod6.slice(0, 3)} ${kod6.slice(3)}`
}

/** A kérés-azonosító (nem titkos) alaki ellenőrzése. */
export const KAPCSOLAS_ID_MINTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Az állapot-lekérdezés lehetséges válaszai (a szerver → asztali app). */
export type DesktopKapcsolasAllapot =
  | 'varakozik'
  | 'jovahagyva'
  | 'felhasznalva'
  | 'lejart'
  | 'elutasitva'
  | 'ismeretlen'

export interface DesktopKapcsolasInditasValasz {
  ok: true
  /** Nem titkos kérés-azonosító — ez megy a böngésző-URL-be. */
  id: string
  /** A 6 jegyű ellenőrző kód (az app maga is kiszámolja; ez a megerősítés). */
  ellenorzoKod: string
  /** ISO időbélyeg — eddig érvényes a kérés. */
  lejar: string
}

export interface DesktopKapcsolasAllapotValasz {
  allapot: DesktopKapcsolasAllapot
  /** CSAK egyszer, a jóváhagyás utáni első lekérdezéskor. */
  tokenHash?: string
  /** Emberi magyarázat, ha a kérés nem folytatható. */
  uzenet?: string
}
