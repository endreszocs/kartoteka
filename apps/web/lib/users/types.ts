import type { UserWithScope } from '@/app/(dashboard)/admin/actions'
import type { ProfileRoleScope, ProfileRoleType } from '@/lib/profile-roles/types'

export type StatusFilter = 'all' | 'active' | 'pending' | 'rejected' | 'other'

export type RoleFilter = 'all' | ProfileRoleType | 'no-role'

export interface FilterState {
  search: string
  status: StatusFilter
  role: RoleFilter
}

export interface RoleAssignmentInput {
  profileId: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  customLabel?: string | null
  reason?: string
}

export type UnifiedUserRow = UserWithScope
