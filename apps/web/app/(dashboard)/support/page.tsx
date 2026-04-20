import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SupportMain } from '@/components/support/support-main'

export default async function SupportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Segítségkérés</h1>
        <p className="text-sm text-muted-foreground mt-1">Kérdése van? Írjon nekünk és hamarosan válaszolunk.</p>
      </div>
      <SupportMain />
    </div>
  )
}
