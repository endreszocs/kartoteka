'use client'

/**
 * Onboarding — 4 lépéses bevezető wizard (Sprint R F5 · v0.8.4).
 *
 * Új user-eknek (első bejelentkezés után) a Kartotéka rövid bevezetése.
 * Most NEM van auth-gate-elve — bárki megnyithatja a `/onboarding` URL-t,
 * a `Belépés a Kartotékába` gomb a `/dashboard`-ra navigál.
 *
 * A teljes UI a `packages/ui-app/src/onboarding/`-ben van — pure UI,
 * body-pattern. A perzisztens „onboarding kész" jelölő (user_preferences
 * táblában) később (Sprint S+) kerülhet bekötésre.
 */

import { useRouter } from 'next/navigation'
import { OnboardingScreen } from '@kartoteka/ui-app'

export default function OnboardingPage() {
  const router = useRouter()
  return (
    <OnboardingScreen
      onComplete={() => router.push('/dashboard')}
      onSkip={() => router.push('/dashboard')}
    />
  )
}
