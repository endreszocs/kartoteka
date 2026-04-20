/**
 * Runtime környezet-detektálás — standalone vs. server-based.
 *
 * A KARTOTEKA két módban futhat:
 *
 *  1. **SERVER MODE** (default): a Next.js server a webes host-on fut,
 *     a Supabase-hez csatlakozik, minden action Supabase-be megy.
 *
 *  2. **STANDALONE MODE** (Fázis 7): a Next.js server a lelkész saját gépén
 *     fut (portable Node.js), a Supabase-hez csak havonta csatlakozik.
 *     A SQLite lokális adatbázis az "authoritative" offline-ban.
 *
 * Detection:
 *   - `KARTOTEKA_STANDALONE=true` env var (a KARTOTEKA.bat beállítja)
 *   - VAGY `process.env.NODE_ENV === 'production'` ÉS `typeof window === 'undefined'`
 *     ÉS a `data/` mappa létezik (Windows standalone package)
 */

import fs from 'fs'
import path from 'path'

let cachedMode: 'server' | 'standalone' | null = null

export function isStandaloneMode(): boolean {
  if (cachedMode !== null) return cachedMode === 'standalone'

  // Explicit env var (legmegbízhatóbb)
  if (process.env.KARTOTEKA_STANDALONE === 'true') {
    cachedMode = 'standalone'
    return true
  }

  // Kliens-oldal soha nem standalone (a detektálás csak server-side)
  if (typeof window !== 'undefined') {
    cachedMode = 'server'
    return false
  }

  // Server-side heurisztika: ha van `data/` mappa + `license.dat`, standalone
  try {
    const licensePath = path.join(process.cwd(), 'data', 'license.dat')
    if (fs.existsSync(licensePath)) {
      cachedMode = 'standalone'
      return true
    }
  } catch {
    // fs nem elérhető, valószínűleg Edge runtime
  }

  cachedMode = 'server'
  return false
}

export function getRuntimeMode(): 'server' | 'standalone' {
  isStandaloneMode()
  return cachedMode || 'server'
}

export function getDataDir(): string {
  const base = path.join(process.cwd(), 'data')
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true })
  }
  return base
}

/** Csak tesztekhez — a cache resetelése */
export function _resetRuntimeDetectCache(): void {
  cachedMode = null
}
