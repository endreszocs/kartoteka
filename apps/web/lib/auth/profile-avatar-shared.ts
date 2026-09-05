/**
 * PROFILKÉP-FELOLDÁS — EGY szabály a fejlécnek, a dialógusnak és a
 * misszió-műhelynek (2026-09-05, profil-kör D5).
 *
 * MIÉRT SZÜLETETT: három helyen élt ugyanaz a sorrend
 * (`user_metadata.avatar_url || picture || pastor_profiles.photo_url`), és ez a
 * sorrend ROSSZ volt: a Google `picture` (mulandó lh3-URL) megelőzte a lelkész
 * SAJÁT feltöltését, a „nincs kép" döntést pedig nem lehetett kifejezni — a
 * metaadat-URL törlése után a Google-kép azonnal visszaugrott.
 *
 * Az új szabály a `pastor_profiles.avatar_source` oszlopból indul (SQL:
 * migration-docs/sql/2026-09-05-profil-pontossag.sql):
 *   'upload' → a feltöltött kép (photo_url)
 *   'google' → a Google-fiók képe (picture)
 *   'none'   → NINCS kép (monogram)
 *   NULL     → örökölt viselkedés, de MEGFORDÍTVA: az explicit feltöltés győz
 *              (photo_url → avatar_url → picture)
 *
 * Direktíva-mentes: a szerver-oldali `profile-avatar.ts` innen exportálja
 * tovább, az önteszt pedig közvetlenül ezt tölti be.
 */

export type AvatarSource = 'upload' | 'google' | 'none'

export interface AvatarForrasok {
  /** `pastor_profiles.avatar_source` — NULL/ismeretlen = örökölt szabály. */
  source: string | null | undefined
  /** `pastor_profiles.photo_url` — a saját feltöltés. */
  photoUrl: string | null | undefined
  /** `user_metadata.avatar_url` — a régi mentések és a fejléc gyors forrása. */
  metadataAvatarUrl: string | null | undefined
  /** `user_metadata.picture` — a Google OAuth által adott kép. */
  picture: string | null | undefined
}

/** Csak http(s) URL fogadható el — más protokoll (data:, javascript:) soha. */
export function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function isAvatarSource(value: unknown): value is AvatarSource {
  return value === 'upload' || value === 'google' || value === 'none'
}

/**
 * Az EFFEKTÍV forrás — amit a felület a forrás-váltón jelöl (2026-09-05,
 * bírálat P3): explicit döntésnél maga a döntés; örökölt (NULL) sornál a
 * `resolveAvatarUrl` sorrendjéből levezetve (photo_url → metaadat → picture),
 * hogy a SQL előtti sorok se mondjanak „semmi sincs kiválasztva"-t, miközben a
 * feltöltött kép látszik. `null` = örökölt metaadat-kép ISMERETLEN eredettel
 * (nem a feltöltött, nem a Google `picture`): erre nincs gomb, csak a
 * „Monogram" (elrejtés) vagy egy új feltöltés.
 *
 * A sorrend EGY helyen él: a `resolveAvatarUrl` ebből dönt, nem mellette.
 */
export function effektivAvatarSource(input: AvatarForrasok): AvatarSource | null {
  if (isAvatarSource(input.source)) return input.source
  if (normalizeAvatarUrl(input.photoUrl)) return 'upload'
  const metadataAvatarUrl = normalizeAvatarUrl(input.metadataAvatarUrl)
  const picture = normalizeAvatarUrl(input.picture)
  if (metadataAvatarUrl) return picture && metadataAvatarUrl === picture ? 'google' : null
  if (picture) return 'google'
  return 'none'
}

export function resolveAvatarUrl(input: AvatarForrasok): string | null {
  switch (effektivAvatarSource(input)) {
    case 'upload':
      // Ha a döntés „feltöltött", de a fájl URL-je hiányzik (pl. törölt
      // objektum), NEM esünk vissza a Google-képre: a felhasználó nem azt kérte.
      return normalizeAvatarUrl(input.photoUrl)
    case 'google':
      return normalizeAvatarUrl(input.picture)
    case 'none':
      return null
    default:
      // Örökölt metaadat-kép (nincs döntés, nincs feltöltés, nem a Google-kép).
      return normalizeAvatarUrl(input.metadataAvatarUrl)
  }
}
