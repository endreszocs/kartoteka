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

/**
 * A walkthrough-flag mentése.
 *
 * 2026-06-04 (P1): elsődlegesen a `complete_user_walkthrough` SECURITY DEFINER
 * RPC-t hívjuk, ami megkerüli az RLS-t/GRANT-okat — így a flag akkor is biztosan
 * mentődik, ha a profiles regular-kliens UPDATE-je némán elbukna (különben a túra
 * minden navigáción újraindulna). Ha az RPC még nincs telepítve (deploy-sorrend),
 * gracefully visszaesünk a közvetlen UPDATE-re.
 */
async function persistWalkthroughDone(skipped: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error: rpcErr } = await supabase.rpc('complete_user_walkthrough', {
    p_skipped: skipped,
  })

  if (rpcErr) {
    // Fallback: az RPC még nincs telepítve (vagy más hiba) → közvetlen UPDATE.
    const { error: updErr } = await supabase
      .from('profiles')
      .update({
        walkthrough_completed: true,
        ...(skipped ? { walkthrough_skipped_at: new Date().toISOString() } : {}),
      })
      .eq('id', user.id)
    if (updErr) return { error: `Mentés sikertelen: ${updErr.message}` }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function markWalkthroughComplete(): Promise<
  { success: true } | { error: string }
> {
  const res = await persistWalkthroughDone(false)
  if (res.error) return { error: res.error }
  return { success: true }
}

export async function skipWalkthrough(): Promise<
  { success: true } | { error: string }
> {
  const res = await persistWalkthroughDone(true)
  if (res.error) return { error: res.error }
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
