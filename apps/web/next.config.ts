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
  cacheOnNavigation: true,
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
  // Üres turbopack config: jelzi a Next 16-nak, hogy Turbopack alatt
  // nem kell webpack-konfigot fordítania (Serwist prod build-nél a --webpack
  // flag miatt kapcsol át webpack-re automatikusan)
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
    return [
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
  },
};

export default withSerwist(nextConfig);
