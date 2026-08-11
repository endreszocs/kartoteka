import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseChangelogText } from './changelog-parse-core'
import type { ChangelogEntry } from './types'

/**
 * `docs/CHANGELOG.md` beolvasása.
 *
 * A tényleges elemzést a `changelog-parse-core.ts` TISZTA függvénye végzi
 * (nincs benne fájlrendszer, nincs benne Supabase) — így önteszttel védhető:
 * `scripts/selftest-changelog.mjs`.
 *
 * A fájl sorai az alábbi struktúrát követik:
 *
 * ```
 * ## [YYYY-MM-DD] — Rövid címsor
 * <!-- key: ... -->
 * <!-- category: ... -->
 * <!-- version: ... -->
 * <!-- targets: ... -->
 *
 * tartalom (markdown) ...
 *
 * ---
 * ```
 */

// A CHANGELOG.md a repo gyökerében van: KARTOTEKA/docs/CHANGELOG.md.
// A Next.js prod-on a process.cwd() lehet apps/web/, dev-en lehet a repo gyökér,
// Railway monorepo deploy-on a Root Directory beállítás dönt. Ezért több
// kandidátus path-ot próbálunk (első találat nyer).
const CANDIDATE_CHANGELOG_PATHS = [
  join(process.cwd(), 'docs', 'CHANGELOG.md'), // root cwd (Railway monorepo / dev)
  join(process.cwd(), '..', '..', 'docs', 'CHANGELOG.md'), // apps/web cwd (next start)
  join(process.cwd(), '..', 'docs', 'CHANGELOG.md'), // egy szintű variánsok
]

export async function parseChangelog(): Promise<ChangelogEntry[]> {
  let content: string | null = null
  for (const path of CANDIDATE_CHANGELOG_PATHS) {
    try {
      content = await readFile(path, 'utf8')
      break
    } catch {
      // try next
    }
  }
  if (!content) {
    console.warn(
      `[parseChangelog] CHANGELOG.md nem található. Próbált helyek: ${CANDIDATE_CHANGELOG_PATHS.join(', ')}`,
    )
    return []
  }

  return parseChangelogText(content)
}
