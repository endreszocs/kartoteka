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
    // Standalone build artifacts
    "dist/**",
    "standalone-build/**",
    // Supabase Edge Functions (Deno runtime, nem Node.js)
    "supabase/functions/**",
    // Legacy Vanilla JS forrásfájlok — referencia archívum, nem fut runtime-ban
    "migration-docs/source-links/**",
    // Generált Service Worker (Serwist által) — nem írjuk kézzel
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
  ]),
]);

export default eslintConfig;
