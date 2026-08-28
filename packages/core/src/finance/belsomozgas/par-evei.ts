/**
 * belsoMozgasParEvei — a belső mozgás pár MINDKÉT lábának évei (D6, 2026-08-28).
 *
 * A web azonos nevű helperének (edit-storno-actions.ts, 2026-08-27) core-tükre.
 *
 * MIÉRT KELL: a sztornó és a sztornó-visszavonás az UPDATE-et a közös
 * `belso_mozgas_xkey`-re adja ki, tehát MINDKÉT lábat átírja — az év-zár
 * ellenőrzés viszont csak a kattintott sor dátumára futott. Egy évfordulós
 * átvezetés két oldala ELTÉRŐ évre eshet (kassza-láb dec. 31., bank-láb
 * jan. 2. — „úton lévő pénz"), és ilyenkor a friss év lábának sztornózása
 * NÉMÁN átbillentette volna a MÁR VÉGLEGESÍTETT és beküldött év egyenlegét is.
 *
 * FAIL-CLOSED: ha a párt nem tudjuk felderíteni, azt sem tudjuk, mely éveket
 * érintené a művelet — ilyenkor hibát adunk vissza, nem tippelünk.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function belsoMozgasParEvei(
  supabase: SupabaseClient,
  congregationId: string,
  xkey: string,
  sajatDatum: string | null | undefined,
): Promise<{ evek: number[] } | { error: string }> {
  const [befRes, kiaRes] = await Promise.all([
    supabase
      .from('befizetes')
      .select('datum')
      .eq('belso_mozgas_xkey', xkey)
      .eq('congregation_id', congregationId),
    supabase
      .from('kiadas')
      .select('datum')
      .eq('belso_mozgas_xkey', xkey)
      .eq('congregation_id', congregationId),
  ])
  if (befRes.error || kiaRes.error) {
    const msg = befRes.error?.message || kiaRes.error?.message || 'ismeretlen'
    return {
      error:
        `A belső mozgás párját most nem sikerült felderíteni (${msg}), ezért a műveletet ` +
        'biztonságból megszakítottuk — nem tudjuk, mely évek számadását érintené. ' +
        'Ellenőrizd az internetkapcsolatot, és próbáld újra.',
    }
  }

  const evek = new Set<number>()
  for (const row of [...(befRes.data ?? []), ...(kiaRes.data ?? [])]) {
    const d = (row as { datum?: string | null }).datum
    if (typeof d === 'string' && d) {
      const y = new Date(d).getFullYear()
      if (Number.isFinite(y)) evek.add(y)
    }
  }
  if (typeof sajatDatum === 'string' && sajatDatum) {
    const y = new Date(sajatDatum).getFullYear()
    if (Number.isFinite(y)) evek.add(y)
  }
  if (evek.size === 0) {
    return {
      error:
        'A belső mozgás egyik lábán sem találtunk értelmezhető dátumot, ezért a műveletet ' +
        'biztonságból megszakítottuk — nem tudjuk, mely évek számadását érintené.',
    }
  }
  return { evek: [...evek] }
}
