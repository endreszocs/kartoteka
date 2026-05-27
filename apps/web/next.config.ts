import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// PWA / Serwist: a service worker `app/sw.ts`-ben van, a lefordított
// változat a `public/sw.js`-ben landol.
//
// A Serwist NEM kompatibilis a Turbopack-kel (ami Next.js 16 dev alapértelmezés).
// Emiatt két kényszer van:
//   1. Dev módban a Serwist ki van kapcsolva (a SW úgyis zavarna a HMR-ben)
//   2. A `build` script `--webpack` flag-gel fut, hogy a Serwist lefordítsa
//      a service worker-t production build-kor.
//
// Explicit disable flag env-ből: DISABLE_PWA=true (pl. CI-ben, Railway preview-n).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable:
    process.env.DISABLE_PWA === "true" ||
    process.env.NODE_ENV !== "production",
  // FONTOS: false — a SW NE intercept-elje a navigation request-eket.
  // 2026-04-27: a `true` érték miatt a `/login` és `/auth/callback` request-ek
  // néha "no-response" hibával fail-eltek (a Serwist NetworkFirst nem kezeli
  // jól a route-handler 302 response-okat). Ettől megzavarodott a Google
  // OAuth callback-flow (incognito-ban is fail-elt). A `false` hagyja a
  // hálózatra a HTML-eket; a static assetek továbbra is precache-eltek.
  cacheOnNavigation: false,
  reloadOnOnline: true,
});

// Supabase Storage host a NEXT_PUBLIC_SUPABASE_URL alapján
function getSupabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const supabaseHost = getSupabaseStorageHost()

// CSP a publikus oldalak számára — szigorú, csak a saját Supabase Storage
// engedélyezett képforrásként, Google Fonts a stílushoz.
const publicSiteCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ''}`,
  // 'unsafe-inline' a stílusokhoz, mert a layout.tsx-ben dinamikus <style>
  // blokk van a téma CSS változókhoz. A Next.js App Router inline stílust is
  // emitel, így az 'unsafe-inline' itt indokolt.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // A Next.js runtime szükség esetén inline scriptet is betehet (pl. hydration),
  // ezért az 'unsafe-inline' az npm-es Next standard build-hez kell.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'" + (supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''),
  "object-src 'none'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next.js "standalone" build mód — a `.next/standalone/server.js`
  // magában futtatható (Railway / Docker deploy). FIGYELEM: ez NEM azonos
  // a korábbi Kartotéka portable Inno Setup "standalone"-nal (M6.3-ban
  // kivezetve). Ez csak egy Next.js build flag.
  output: 'standalone',
  // 2026-05-04 — A Frissítések modul a `docs/CHANGELOG.md`-t olvassa
  // (`apps/web/lib/broadcasts/changelog-parser.ts`). Standalone build-ben
  // a fs.readFile-lal hivatkozott fájlokat NEM követi nyomon a tracer
  // automatikusan, ezért explicit hozzáadjuk. A path-ok a monorepo gyökerétől
  // relatívak (../../docs/CHANGELOG.md = KARTOTEKA/docs/CHANGELOG.md).
  outputFileTracingIncludes: {
    '/admin/frissitesek': ['../../docs/CHANGELOG.md'],
    '/admin': ['../../docs/CHANGELOG.md'],
  },
  // 2026-05-02 (v0.9.33) — Sebesség-optimalizálás: gzip a HTML/JSON/JS válaszokra
  // (Railway proxy is támogatja), és a `X-Powered-By` header elrejtése (apró
  // info-leak elkerülése).
  compress: true,
  poweredByHeader: false,
  // 2026-05-02 — react-strict-mode kifejezetten production-ben is true-ként
  // jelölve (a Next 16 alapból true, de explicit hogy a téma-aware rendering
  // ne fusson kétszer felesleges effektusokkal):
  reactStrictMode: true,
  // Üres turbopack config: jelzi a Next 16-nak, hogy Turbopack alatt
  // nem kell webpack-konfigot fordítania (Serwist prod build-nél a --webpack
  // flag miatt kapcsol át webpack-re automatikusan).
  //
  // 2026-05-25 megjegyzés: a magyar karakteres mappa-útvonal ("Egyházi APP")
  // miatt a Turbopack korábban Rust panic-ot dobott /admin/veszelyes-zona-n.
  // Megoldás: a felesleges külső package-lock.json-okat töröltük
  // (C:\Users\endre\, KARTOTEKA-szülő), így a Next.js a KARTOTEKA/-t
  // választja workspace root-nak, és a chunk-path-ban már nem szerepel a
  // magyar karakteres szegmens. Explicit `root`-ot NEM állítunk be, mert
  // megzavarja a Next.js route resolution-t (route group-okkal 404-et ad).
  turbopack: {},
  experimental: {
    serverActions: {
      // Képfeltöltésekhez: hero/crest/post cover 2 MB, PDF 20 MB
      // + némi overhead a FormData encodinghez
      bodySizeLimit: '25mb',
    },
  },
  images: {
    // A Supabase Storage host engedélyezése a next/image komponenshez
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'

    const baseHeaders = [
      // Biztonsági headerek a publikus gyülekezeti oldalakra
      {
        source: '/gy/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: publicSiteCsp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Általános biztonsági headerek mindenre
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]

    // 2026-05-25 KRITIKUS: a custom Cache-Control headerek CSAK production-ben
    // legyenek aktívak. Dev mode-ban a Turbopack lazy-újragenerálja a chunk-
    // hash-eket minden HMR-nél, és ha a böngésző 1 éves immutable cache-szel
    // tartja a régi build-manifest-et, a `data:<hash>` server-action chunkok
    // nem találják meg a module factory-t ("not available" runtime error).
    // A Next.js maga is figyelmeztet erre: "Custom Cache-Control headers
    // detected for /_next/static/:path* — break Next.js development behavior."
    if (!isProd) return baseHeaders

    return [
      ...baseHeaders,
      // 2026-05-02 (v0.9.33) — Sebesség-optimalizálás: a Next.js statikus
      // asset-jei (immutable hashed file-ek) tartós cache-szel (1 év).
      // A böngésző NEM kérdezi le újra, így a navigation visszafelé/előre
      // pillanat alatti.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // A statikus képek (icon, favicon, kép-asset) szintén hosszú cache-szel.
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000' }, // 30 nap
        ],
      },
      // A szervált fontok 1 hónap cache.
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, immutable' },
        ],
      },
    ]
  },
};

export default withSerwist(nextConfig);
