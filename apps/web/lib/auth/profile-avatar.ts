import 'server-only'

import { cache } from 'react'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

function normalizeAvatarUrl(value: unknown): string | null {
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

/**
 * A bejelentkezett felhasználó megjelenítési célú profilfotója.
 *
 * Az auth metadata a frissen mentett és OAuth-fotók gyors forrása. A
 * `pastor_profiles.photo_url` csak a régebbi, még metadata-szinkron előtti
 * profilok kompatibilitási tartaléka. Az érték soha nem használható
 * jogosultsági döntéshez.
 */
export const getProfileAvatarUrl = cache(async (): Promise<string | null> => {
  const { user, supabase } = await getEffectiveAccessContext()
  if (!user) return null

  const metadataUrl =
    normalizeAvatarUrl(user.user_metadata?.avatar_url) ||
    normalizeAvatarUrl(user.user_metadata?.picture)

  if (metadataUrl) return metadataUrl

  const { data, error } = await supabase
    .from('pastor_profiles')
    .select('photo_url')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return null

  return normalizeAvatarUrl((data as { photo_url: string | null } | null)?.photo_url)
})
