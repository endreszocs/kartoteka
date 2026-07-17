import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MemberPortalAuthPreview } from '@/components/member-portal/member-portal-auth-preview'
import { MemberPortalAuthShell } from '@/components/member-portal/member-portal-auth-shell'

export const metadata: Metadata = {
  title: 'Tagi portál — fejlesztői előnézet',
  robots: {
    index: false,
    follow: false,
  },
}

export default function MemberPortalPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <MemberPortalAuthShell
      congregationName="Kertvárosi Református Egyházközség"
      location="Kolozsvár"
    >
      <MemberPortalAuthPreview />
    </MemberPortalAuthShell>
  )
}
