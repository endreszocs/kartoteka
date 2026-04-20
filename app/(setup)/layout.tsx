import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { checkLicensePresent } from '@/lib/standalone/license-check'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'

/**
 * Setup route group layout — az onboarding wizardnak.
 *
 * KÉT ÜZEMMÓD:
 *
 *  1. STANDALONE: az első indítási varázsló, licensz aktiválással
 *     - ha már van license.dat → redirect /
 *
 *  2. WEB: a bejelentkezett, active lelkész első wizard-lépései
 *     - ha status === 'pending' → redirect /pending
 *     - ha már onboarding_completed_at IS NOT NULL → redirect /dashboard
 *     - nincs bejelentkezve → redirect /login
 *
 * A header mode-aware: standalone módban "Első indítási varázsló",
 * web módban "Üdvözöljük a rendszerben".
 */
export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const standalone = isStandaloneMode()

  if (standalone) {
    // Standalone: csak a licensz ellenőrzés
    const licenseCheck = checkLicensePresent()
    if (licenseCheck.hasLicense) {
      redirect('/')
    }
  } else {
    // Web mód: auth + status + onboarding ellenőrzés
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status, onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      redirect('/login')
    }

    if (profile.status === 'pending') {
      redirect('/pending')
    }

    if (profile.status !== 'active') {
      // Banned vagy egyéb — signOut + login
      await supabase.auth.signOut()
      redirect('/login')
    }

    // Már teljesítette az onboarding-ot → dashboard (ne csináljuk újra a wizardot)
    if (profile.onboarding_completed_at) {
      redirect('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-teal-50">
      {/* Dekoratív háttér */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute -right-40 -bottom-40 h-96 w-96 rounded-full bg-teal-200/30 blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white shadow-md">
              <span className="font-heading text-xl font-bold text-primary">K</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/70">
                Erdélyi Református Egyházkerület
              </p>
              <h1 className="font-heading text-xl text-slate-800">Kartotéka</h1>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold">
              {standalone ? 'Első indítási varázsló' : 'Üdvözöljük a rendszerben'}
            </p>
            <p>{standalone ? 'Standalone Windows' : 'Webes hozzáférés'}</p>
          </div>
        </div>
      </header>

      {/* Fő tartalom */}
      <main className="mx-auto max-w-3xl px-6 py-8 md:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/60 bg-white/60 py-6 text-center text-xs text-slate-500 backdrop-blur-sm">
        <p>KARTOTEKA · EREK · Minden jog fenntartva · {new Date().getFullYear()}</p>
        <p className="mt-1">
          Technikai segítség:{' '}
          <a
            href="mailto:support@kartoteka.erek.ro"
            className="text-primary underline hover:no-underline"
          >
            support@kartoteka.erek.ro
          </a>
        </p>
      </footer>
    </div>
  )
}
