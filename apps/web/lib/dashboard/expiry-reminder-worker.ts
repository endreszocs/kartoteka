import 'server-only'

/**
 * HETI LEJÁRAT-EMLÉKEZTETŐ — 2026-08-11.
 *
 * Végigmegy az aktív gyülekezeteken, kiszámolja a lejárat-radart, és ahol van
 * SÜRGŐS tétel (már lejárt, vagy 90 napon belül lejár), értesítést ír az
 * `ertesitesek` táblába a gyülekezet lelkészének.
 *
 * IDEMPOTENCIA
 * ────────────
 * A kulcs a `hivatkozas` mező: `/dashboard?lejarat=<ÉV>-W<ISO-hét>`. Egy héten
 * belüli MÁSODIK futás ugyanazt a kulcsot állítaná elő, a beszúrás előtti
 * ellenőrzés viszont megtalálja a meglévő sort, és kihagyja a gyülekezetet.
 *
 * MIÉRT ÉPP A `hivatkozas`
 * ────────────────────────
 * A TVA-figyelő (penzugy/tva-actions.ts) ugyanezt a mezőt használja dedup-ra,
 * de ott a kulcs (`tva-plafon-atlepes-2026`) NEM útvonal, ezért az az egy sor
 * a harangban KATTINTHATATLAN lesz (notification-bell-refined.tsx
 * `notificationLink()`: csak `/`-sel vagy `http`-vel kezdődő érték link).
 * Itt ezt elkerüljük: a dedup-kulcs MAGA egy érvényes útvonal query-vel, tehát
 * egyszerre egyedi és kattintható — minden címzettnél ugyanaz.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPaged } from '@kartoteka/supabase-client'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { getCongregationOfficials } from '@/lib/profiles/officials'
import { collectExpiryRadar, EXPIRY_SOON_DAYS, type ExpiryItem } from './expiry-radar'

export interface ExpiryReminderResult {
  /** Hány gyülekezetet néztünk végig. */
  processed: number
  /** Hány gyülekezetben született új értesítés. */
  notified: number
  /** Hány gyülekezet maradt ki (nincs sürgős tétel, vagy már ment a héten). */
  skipped: number
  /** Hány gyülekezetnél nem sikerült a számítás — NEM nyeljük el. */
  failed: number
  /** A hibák szövege (gyülekezetenként egy) — a válaszban is megjelenik. */
  errors: string[]
  /** A hét kulcsa, amivel a dedup dolgozott. */
  weekKey: string
}

/**
 * ISO-8601 hétkulcs: 'YYYY-Www'. A hét CSÜTÖRTÖKJE dönti el, melyik évhez
 * tartozik — enélkül az év fordulóján ugyanaz a hét két kulcsot kapna, és a
 * lelkész két értesítést.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Vasárnap (0) → 7, hogy a hétfő legyen a hét első napja.
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function huDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${m}. ${d}.`
}

/** Az értesítés szövege — lelkész-barát, tegező, konkrét teendővel. */
function buildMessage(urgent: ExpiryItem[]): { cim: string; uzenet: string } {
  const lejart = urgent.filter((i) => i.bucket === 'lejart')
  const soon = urgent.filter((i) => i.bucket !== 'lejart')

  const cim =
    lejart.length > 0
      ? `Lejárat-figyelő: ${lejart.length} lejárt és ${soon.length} hamarosan lejáró tétel`
      : `Lejárat-figyelő: ${soon.length} tétel jár le ${EXPIRY_SOON_DAYS} napon belül`

  // A leghamarabb lejáró néhány tétel a szövegben is — a harang előnézete így
  // már önmagában használható, nem kell átkattintani.
  const lines = urgent.slice(0, 5).map((i) => {
    const mikor = i.napok < 0 ? `${Math.abs(i.napok)} napja lejárt` : `${i.napok} nap múlva`
    const mi = i.kind === 'sirhely' ? 'Sírhely-bérlet' : 'Bérleti szerződés'
    return `• ${mi} — ${i.cim}${i.reszlet ? ` (${i.reszlet})` : ''}: ${huDate(i.lejarat)}, ${mikor}`
  })
  const tobbi = urgent.length > lines.length ? `\n…és további ${urgent.length - lines.length} tétel.` : ''

  const uzenet =
    'A következő tételek lejártak vagy hamarosan lejárnak:\n' +
    lines.join('\n') +
    tobbi +
    '\n\nA sírhely-bérlet megújítása bevétel is, és jó alkalom a család megkeresésére; ' +
    'a lejáró bérleti szerződés viszont jogi kockázat és elmaradt jövedelem. ' +
    'Részletek: Irányítópult → Lejárat-figyelő.'

  return { cim, uzenet }
}

interface CongregationRow {
  id: string
  name: string | null
  nev_hu: string | null
}

export async function runExpiryReminderWorker(
  supabaseOverride?: SupabaseClient,
): Promise<ExpiryReminderResult> {
  const supabase = supabaseOverride ?? getSupabaseAdminClient()
  const weekKey = isoWeekKey(new Date())
  const hivatkozas = `/dashboard?lejarat=${weekKey}`

  const result: ExpiryReminderResult = {
    processed: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    weekKey,
  }

  const congregations = await selectAllPaged<CongregationRow>(
    supabase.from('congregations').select('id, name, nev_hu').eq('status', 'active'),
  )
  if (congregations.error) {
    // A gyülekezet-lista hibája NEM lehet „nulla gyülekezet, minden rendben".
    throw new Error(`A gyülekezetek listája nem tölthető be: ${congregations.error.message}`)
  }

  for (const cong of congregations.data) {
    result.processed += 1
    const nev = (cong.nev_hu || cong.name || cong.id).trim()

    try {
      const radar = await collectExpiryRadar(supabase, cong.id)
      const urgent = radar.items.filter((i) => i.bucket === 'lejart' || i.bucket === 'd90')
      if (urgent.length === 0) {
        result.skipped += 1
        continue
      }

      // ── Idempotencia: ment-e már ezen a héten értesítés? ──
      const { data: existing, error: existingError } = await supabase
        .from('ertesitesek')
        .select('id')
        .eq('congregation_id', cong.id)
        .eq('hivatkozas', hivatkozas)
        .limit(1)
        .maybeSingle()
      if (existingError) {
        // Ha a dedup-ellenőrzés hasal el, INKÁBB KIHAGYJUK: egy duplán kiküldött
        // értesítés bizalomvesztés, egy héttel későbbi emlékeztető nem az.
        throw new Error(`dedup-ellenőrzés sikertelen: ${existingError.message}`)
      }
      if (existing?.id) {
        result.skipped += 1
        continue
      }

      const officials = await getCongregationOfficials(supabase, cong.id, ['lelkesz'])
      const recipientIds = Array.from(new Set(officials.map((o) => o.userId)))
      if (recipientIds.length === 0) {
        result.skipped += 1
        continue
      }

      const { cim, uzenet } = buildMessage(urgent)
      const rows = recipientIds.map((userId) => ({
        user_id: userId,
        congregation_id: cong.id,
        cim,
        uzenet,
        tipus: urgent.some((i) => i.bucket === 'lejart') ? 'warning' : 'info',
        hivatkozas,
      }))

      const { error: insertError } = await supabase.from('ertesitesek').insert(rows)
      if (insertError) throw new Error(`értesítés beszúrása sikertelen: ${insertError.message}`)

      result.notified += 1
    } catch (error: unknown) {
      result.failed += 1
      const message = error instanceof Error ? error.message : 'ismeretlen hiba'
      result.errors.push(`${nev}: ${message}`)
      console.error('[expiry-reminders]', nev, message)
    }
  }

  return result
}
