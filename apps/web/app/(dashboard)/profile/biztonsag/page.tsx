import { redirect } from 'next/navigation'
import { ArrowLeftCircle } from 'lucide-react'

import { DesktopEszkozokCard } from '@/components/profile/desktop-eszkozok-card'
import { TwoFactorCard } from '@/components/profile/two-factor-card'
import { createClient } from '@/lib/supabase/server'

/**
 * Profil → Biztonság (2026-08-15, 8. pont): a kétlépcsős belépés (2FA)
 * be-/kikapcsolása és a mentőkódok kezelése. Opt-in — Endre 4. döntése.
 */
export default async function BiztonsagPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-slate-800">Biztonság</h1>
        <a
          href="/profile"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeftCircle className="h-3.5 w-3.5" />
          Profilom
        </a>
      </div>
      <TwoFactorCard />
      {/* 2026-09-05: az asztali alkalmazás összekapcsolt gépei + elfelejtett PIN útja */}
      <DesktopEszkozokCard />
    </div>
  )
}
