import 'server-only'

import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'

export interface MemberPortalPublicCongregation {
  congregationId: string
  displayName: string
  slug: string
}

/**
 * A tagi Auth ugyanazt a szűk, anonim public-site context RPC-t használja,
 * mint a nyilvános weboldal. Az RPC csak publikált oldal, aktív gyülekezet
 * és bekapcsolt public site esetén ad vissza sort; a kliens nem olvassa
 * közvetlenül a teljes `congregations` táblát.
 */
export async function loadMemberPortalPublicCongregation(
  slug: string,
): Promise<MemberPortalPublicCongregation | null> {
  const site = await loadPublicSiteBySlug(slug)
  if (!site) return null

  return {
    congregationId: site.congregation_id,
    displayName: site.display_name,
    slug: site.slug,
  }
}
