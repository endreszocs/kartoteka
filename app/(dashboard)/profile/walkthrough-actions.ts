'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Walkthrough state kezelés server actions.
 *
 * A profiles-ra mentjük:
 *  - walkthrough_completed: boolean — ha végigcsinálta VAGY kihagyta
 *  - walkthrough_skipped_at: timestamptz — csak ha explicit kihagyta
 *
 * A walkthrough akkor indul el, ha walkthrough_completed === false.
 * Ez az A fázis SQL-jében került be (2026-04-20-wizard-onboarding-schema.sql).
 */

export async function markWalkthroughComplete(): Promise<
  { success: true } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('profiles')
    .update({ walkthrough_completed: true })
    .eq('id', user.id)

  if (error) return { error: `Mentés sikertelen: ${error.message}` }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function skipWalkthrough(): Promise<
  { success: true } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      walkthrough_completed: true,
      walkthrough_skipped_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: `Mentés sikertelen: ${error.message}` }

  revalidatePath('/', 'layout')
  return { success: true }
}

/** Debug / support — walkthrough újraindítása. */
export async function restartWalkthrough(): Promise<
  { success: true } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      walkthrough_completed: false,
      walkthrough_skipped_at: null,
    })
    .eq('id', user.id)

  if (error) return { error: `Mentés sikertelen: ${error.message}` }

  revalidatePath('/', 'layout')
  return { success: true }
}
