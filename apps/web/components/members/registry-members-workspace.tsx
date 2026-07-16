'use client'

import type { MemberListPage } from '@/lib/members/registry-list-types'

import { PersonsTab } from './persons-tab'

interface RegistryMembersWorkspaceProps {
  initialPage: MemberListPage
}

/**
 * A tagnyilvántartás elsődleges munkafelülete személy-központú.
 * A családi kapcsolatok a személyi kartonból érhetők el, a vizuális
 * családi háló pedig külön felső fülön marad.
 */
export function RegistryMembersWorkspace({ initialPage }: RegistryMembersWorkspaceProps) {
  return (
    <section aria-label="Személyek nyilvántartása">
      <PersonsTab initialPage={initialPage} />
    </section>
  )
}
