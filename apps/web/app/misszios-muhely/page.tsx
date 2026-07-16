import { redirect } from 'next/navigation'

import { loadHomePageData } from './community-actions'
import { MuhelyHome, type MuhelyHomeData } from '@/components/muhely/home/muhely-home'

export default async function MissziosMuhelyPage() {
  const data = await loadHomePageData()
  if ('error' in data) redirect('/login')

  return <MuhelyHome data={data as MuhelyHomeData} />
}
