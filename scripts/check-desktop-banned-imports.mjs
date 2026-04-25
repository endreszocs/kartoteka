#!/usr/bin/env node
/**
 * M6.7 — Tiltott import-ok ellenőrzése a desktop oldalon.
 *
 * A Tauri desktop kliens offline réteghez a @kartoteka/offline-sync
 * StorageBackend absztrakciót használja (Rust/SQLCipher backend-del).
 * A Dexie/IndexedDB csak a webapp-on érvényes — a desktop-on TILOS.
 *
 * Ez a script build/tauri-időben fut (l. apps/desktop/package.json).
 * Windows-kompatibilis, tisztán Node.js (nincs grep dep).
 *
 * Hozzáadás új tiltott csomaghoz: lista a BANNED konstansban.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const DESKTOP_SRC = resolve(__dirname, '..', 'apps', 'desktop', 'src')

/** Tiltott import-forrás minta (regex-ben escape-elt végleges string). */
const BANNED = [
  { module: 'dexie', reason: 'Web-only; desktop a @kartoteka/offline-sync SQLCipher backendjét használja.' },
  { module: 'dexie-react-hooks', reason: 'ua., a `useLiveQuery` alternatívája a @kartoteka/offline-sync `useSyncQuery` hook-ja lesz (M6.8).' },
  { module: '@kartoteka/offline-sync/dexie-backend', reason: 'A DexieBackend a web-impl — desktop a TauriSqliteBackend-et importálja.' },
]

/** Rekurzívan összegyűjti a TypeScript/JavaScript forrásfájlokat. */
function collectSourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.tauri') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      collectSourceFiles(path, out)
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/** Escape egy string-et regex-biztonságosra. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const files = collectSourceFiles(DESKTOP_SRC)
let failures = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const { module: banned, reason } of BANNED) {
    // Match: import ... from '<banned>' | import '<banned>' | require('<banned>')
    const fromPattern = new RegExp(`from\\s+['"\`]${escapeRegex(banned)}['"\`]`)
    const bareImportPattern = new RegExp(`import\\s+['"\`]${escapeRegex(banned)}['"\`]`)
    const requirePattern = new RegExp(`require\\(\\s*['"\`]${escapeRegex(banned)}['"\`]\\s*\\)`)

    if (fromPattern.test(text) || bareImportPattern.test(text) || requirePattern.test(text)) {
      const relative = file.replace(DESKTOP_SRC, 'apps/desktop/src').replace(/\\/g, '/')
      console.error(`❌ ${relative}`)
      console.error(`   tiltott import: "${banned}"`)
      console.error(`   ok: ${reason}\n`)
      failures += 1
    }
  }
}

if (failures > 0) {
  console.error(`\nM6.7 alapelv (2026-04-21, memory: feedback_tauri_rls_kotelezo + offline-sync absztrakció):`)
  console.error(`  A desktop kliens NEM importálhat Dexie-alapú csomagot.`)
  console.error(`  Offline réteg: @kartoteka/offline-sync StorageBackend interface,`)
  console.error(`  desktop-on TauriSqliteBackend implementációval (M6.8).`)
  process.exit(1)
}

console.log(`✅ M6.7 import-check OK (${files.length} fájl vizsgálva, 0 tiltott import).`)
