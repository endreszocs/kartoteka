import { WelcomeWizardClient } from '@/components/onboarding/welcome-wizard-client'

/**
 * Web-onboarding varázsló — új, aktív lelkész első bejelentkezésekor.
 *
 * A 4 lépés (Gyülekezet, Lelkész, Pénzügy, Kész) lépésenként mentődik a
 * `wizard_progress` táblába — ha a lelkész félbehagyja, a következő
 * bejelentkezéskor onnan folytathatja.
 *
 * M6.3 (2026-04-22) óta a korábbi portable (standalone) ág kivezetve —
 * ez a page csak web-módban fut (a `(setup)/layout.tsx` garantálja, hogy
 * csak `active` + nem még onboardolt user látja).
 */
export default function WelcomePage() {
  return <WelcomeWizardClient />
}
