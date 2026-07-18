import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PublicSitePreview } from '@/components/public/public-site-preview'

export const metadata: Metadata = {
  title: 'Nyilvános gyülekezeti weboldal — fejlesztői előnézet',
  description:
    'Adatbázis-független, kizárólag fejlesztési célú előnézet a nyilvános gyülekezeti weboldal négy témájához.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function PublicSitePreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return <PublicSitePreview />
}
