import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { DashboardMemberPreview } from '@/components/member-portal/dashboard-member-preview'

export const metadata: Metadata = {
  title: 'Tagi portál irányítópult — fejlesztői előnézet',
  description: 'Backendfüggetlen, kizárólag fejlesztési célú tagi irányítópult-látványterv.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function MemberDashboardPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return <DashboardMemberPreview />
}
