/**
 * Asztali eszköz-kapcsolás — CORS az /api/desktop-kapcsolas/* útvonalakon
 * (2026-09-05).
 *
 * MIÉRT KELL: az asztali app a Tauri webview-ból `window.fetch`-csel hívja a
 * kartoteka.app API-ját, a webview origója pedig NEM a kartoteka.app
 * (Windows/WebView2: http://tauri.localhost; macOS/Linux: tauri://localhost;
 * fejlesztéskor http://localhost:1420). A webview a CORS-t böngészőként
 * érvényesíti: a `Content-Type: application/json` POST ELŐKÉRÉST (OPTIONS)
 * vált ki, és `Access-Control-Allow-Origin` nélkül a válasz a JS-nek nem
 * látszik — a fetch TypeError-ral bukik, az app „nincs internet"-et mond,
 * a lelkész pedig a hálózatát bogarássza. A Tauri CSP `connect-src`-je
 * (tauri.conf.json) csak az ELSŐ kaput nyitja; ez a MÁSODIK.
 *
 * MIÉRT ALLOWLIST ÉS NEM `*`: az útvonalak süti- és credential-mentesek, a `*`
 * is védhető lenne — az allowlist viszont kimondja, KI hívhat, a `Vary: Origin`
 * pedig megóvja a köztes cache-eket a más origóval elmentett választól.
 * A fejlesztői origók élesben is engedettek: egy dev asztali build alapból az
 * éles kartoteka.app-ot hívja (VITE_WEB_ORIGIN nélkül), és a nyilvános,
 * credential-mentes útvonalon ez semmit nem nyit ki.
 *
 * Ismeretlen origóra NINCS Allow-Origin fejléc (a böngésző blokkol) — nem 403,
 * mert a nem-böngésző hívók (curl, szerver-szerver) Origin nélkül jönnek, és
 * őket a kód + a spam-fék kapuzza, nem a CORS.
 *
 * Őrszem: scripts/selftest-desktop-kapcsolas.mjs M2–M3 (+ negatív mutánsok).
 */

export const DESKTOP_KAPCSOLAS_ENGEDETT_ORIGOK: readonly string[] = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
]

/**
 * A CORS-fejlécek a kérés `Origin`-je alapján. MINDEN válaszra rá kell tenni
 * (4xx/5xx-re is) — különben a hibaüzenet sem jut el az asztali appig.
 */
export function corsFejlecek(request: Pick<Request, 'headers'>): Record<string, string> {
  const origin = request.headers.get('origin')?.trim() ?? ''
  const fejlecek: Record<string, string> = { Vary: 'Origin' }
  if (origin && DESKTOP_KAPCSOLAS_ENGEDETT_ORIGOK.includes(origin)) {
    fejlecek['Access-Control-Allow-Origin'] = origin
    fejlecek['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    fejlecek['Access-Control-Allow-Headers'] = 'content-type'
    fejlecek['Access-Control-Max-Age'] = '600'
  }
  return fejlecek
}
