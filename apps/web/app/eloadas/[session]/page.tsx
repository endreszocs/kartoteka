import { ProjectionReceiver } from '@/components/presentation/projection-receiver'

export const metadata = { title: 'Kivetítő — Éves beszámoló' }

interface PageProps {
  params: Promise<{ session: string }>
}

export default async function ProjectionPage({ params }: PageProps) {
  const { session } = await params
  return <ProjectionReceiver session={session} />
}
