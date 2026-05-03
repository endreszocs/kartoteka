import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChangelogEntry, ReleaseCategory } from './types'

/**
 * `docs/CHANGELOG.md` parse.
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

  const entries: ChangelogEntry[] = []

  // Az egyes entries egy `## [dátum]` kezdetű blokkokból állnak — a következő `## [` vagy `---`-ig
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const headerMatch = line.match(/^##\s+\[(\d{4}-\d{2}-\d{2})\]\s+—\s+(.+)$/)
    if (!headerMatch) {
      i++
      continue
    }

    const date = headerMatch[1]
    const title = headerMatch[2].trim()
    const startIdx = i
    i++

    // Metaadat sorok: <!-- key: ... --> stb.
    let key: string | null = null
    let category: ReleaseCategory | null = null
    let version: string | null = null
    let targetsHint: string | null = null

    while (i < lines.length) {
      const metaMatch = lines[i].match(/^<!--\s*(\w+):\s*(.+?)\s*-->$/)
      if (!metaMatch) break
      const [, name, value] = metaMatch
      if (name === 'key') key = value.trim()
      else if (name === 'category') {
        const v = value.trim() as ReleaseCategory
        if (['bugfix', 'feature', 'improvement', 'security', 'breaking'].includes(v)) {
          category = v
        }
      } else if (name === 'version') version = value.trim()
      else if (name === 'targets') targetsHint = value.trim()
      i++
    }

    // Body: a következő `## [` vagy fájl vége
    const bodyStart = i
    while (i < lines.length) {
      if (lines[i].match(/^##\s+\[\d{4}-\d{2}-\d{2}\]/)) break
      i++
    }
    const bodyMarkdown = lines.slice(bodyStart, i)
      .join('\n')
      .replace(/^-{3,}\s*$/gm, '') // vízszintes vonal eltávolítása
      .trim()

    // Ha nincs key, akkor generálunk egyet a dátum + title alapján
    if (!key) {
      key = `${date}-${slugify(title).slice(0, 40)}`
    }

    entries.push({
      key,
      date,
      title,
      category,
      version,
      targetsHint,
      bodyMarkdown,
      alreadySent: false, // ezt a caller állítja be a DB alapján
      broadcastStatus: null,
    })

    // Ha még a ## [dátum] sor nem került feldolgozásra (pl. az i éppen rajta áll), folytatjuk
    if (i === startIdx) i++
  }

  return entries
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
