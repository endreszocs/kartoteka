'use server'

import { getMembers, getUpcomingNameDays } from './actions'
import { buildMemberOverviewSnapshot } from '@/lib/members/member-overview'

export async function getMemberOverviewSnapshot() {
  const [{ members }, nameDays] = await Promise.all([
    getMembers(),
    getUpcomingNameDays(),
  ])

  return buildMemberOverviewSnapshot(members, nameDays)
}
