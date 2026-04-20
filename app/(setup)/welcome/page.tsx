import { WelcomeWizardClient } from '@/components/standalone/welcome-wizard-client'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'

/**
 * Onboarding wizard — első indítás / hiányzó adatok pótlása.
 *
 * KÉT ÜZEMMÓD:
 *
 *  - **Standalone**: a lelkész saját gépén fut. Step 1 (licensz) aktiválja a
 *    local install-t, utána Step 2-4 adatok, Step 5 letölti a gyülekezeti
 *    adatokat Supabase-ről SQLite-ba.
 *
 *  - **Web (szerveres)**: a lelkész online dolgozik. Step 1 kimarad (már
 *    bejelentkezett), Step 2-4 mentés közvetlenül a Supabase-be, Step 5
 *    egyszerűsített "összefoglaló + dashboard redirect".
 *
 * KILÉPÉS + ÚJRAINDÍTÁS:
 *   A lépésenkénti mentés (wizard_progress tábla) biztosítja, hogy ha a
 *   lelkész kilép, onnan folytathatja, ahol abbahagyta.
 */
export default function WelcomePage() {
  const mode: 'standalone' | 'web' = isStandaloneMode() ? 'standalone' : 'web'
  return <WelcomeWizardClient mode={mode} />
}
