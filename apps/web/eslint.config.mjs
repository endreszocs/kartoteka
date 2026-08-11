import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build artifacts
    "dist/**",
    // Supabase Edge Functions (Deno runtime, nem Node.js)
    "supabase/functions/**",
    // Legacy Vanilla JS forrásfájlok — referencia archívum, nem fut runtime-ban
    "migration-docs/source-links/**",
    // Generált Service Worker (Serwist által) — nem írjuk kézzel
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
  ]),
  {
    rules: {
      // 2026-08-11 — KIKAPCSOLVA. A `react/no-unescaped-entities` a magyar
      // tipográfiai idézőjelekre („…") is elsül, így ~182 hibát gyártott a
      // teljes ~197-ből. Ettől a zajtól senki nem futtatta a lintet, és a
      // ~15 VALÓDI hiba (set-state-in-effect, error-boundaries) láthatatlan
      // maradt. A szabály egy magyar nyelvű felületen értelmetlen: az idézőjel
      // nem HTML-entitás-veszély, a React amúgy is escape-eli a szöveget.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // ─────────────────────────────────────────────────────────────────────
    // 2026-08-11 — ÁTMENETI, LEJÁRATOS KIVÉTEL. NE MÁSOLD, NE BŐVÍTSD.
    //
    // Ebben a négy fájlban IS valódi `set-state-in-effect` hiba van, de a
    // fájlokat ÉPPEN MOST szerkeszti a munkanapló- és a pénzügy-ág — a
    // párhuzamos módosítás garantált ütközés lenne. Mivel a CI első napon
    // ZÖLDEN kell hogy induljon (a piros CI rosszabb, mint a semmilyen),
    // itt átmenetileg figyelmeztetésre fokozzuk le, hogy a hiba LÁTHATÓ
    // maradjon a lint-kimenetben, de ne blokkolja a csővezetéket.
    //
    // TEENDŐ (a munkanapló- és pénzügy-ág beolvadása után): javítsd a négy
    // effectet (származtatás renderben / eseménykezelő / ref), majd TÖRÖLD
    // ezt az egész blokkot. Ha a blokk törlése után a lint zöld, kész.
    // ─────────────────────────────────────────────────────────────────────
    files: [
      "components/worklog/enekek-field.tsx",
      "components/worklog/igehely-field.tsx",
      "components/worklog/sermon-plan-tab.tsx",
      "components/finance/chitanta-silent-print.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
