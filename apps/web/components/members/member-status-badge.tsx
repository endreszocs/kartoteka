'use client'

import { Badge } from '@/components/ui/badge'
import { PAYMENT_STATUS_CONFIG } from '@/lib/constants/members'
import type { PaymentStatus } from '@/lib/constants/members'

interface MemberStatusBadgeProps {
  status: PaymentStatus
}

export function MemberStatusBadge({ status }: MemberStatusBadgeProps) {
  const config = PAYMENT_STATUS_CONFIG[status]
  return (
    <Badge variant="secondary" className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold shadow-sm ${config.variant}`}>
      {config.icon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  )
}
