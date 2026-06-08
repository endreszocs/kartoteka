import { PresenterRemote } from '@/components/presentation/presenter-remote'

export const metadata = { title: 'Prezenter — Éves beszámoló' }

interface PageProps {
  params: Promise<{ session: string }>
}

export default async function PresenterPage({ params }: PageProps) {
  const { session } = await params
  return <PresenterRemote session={session} />
}
