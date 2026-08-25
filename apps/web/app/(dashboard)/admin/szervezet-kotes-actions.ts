'use server'

/**
 * Gyülekezet HIVATALOS szervezeti formája (anya–leány–missziói) — admin action
 * (2026-08-25, gyülekezeti egységek terv 3.1).
 *
 * A `congregations.szervezeti_tipus` + `anya_congregation_id` a hivatalos
 * (egyházmegyei javaslat + kerületi jóváhagyás szerinti) réteg — ezért NEM a
 * lelkész állítgatja: master / teljes admin bárhol, egyházkerületi admin a
 * saját hatókörén belül (minta: congregation-diocese-actions.ts).
 *
 * ⚠️ A VÉGSŐ őr a DB-oldali trigger (`congregations_szervezet_guard`, magyar
 *    RAISE-üzenetekkel — 2026-08-25-gyulekezeti-egysegek.sql). Az itteni
 *    validálás csak KORÁBBAN ad barátságosabb hibát; a trigger üzenete
 *    VÁLTOZTATÁS NÉLKÜL megy vissza a felületre, mert az maga a szabály
 *    kimondva.
 */

import { revalidatePath } from 'next/cache'

import { logAuditEvent } from '@/lib/audit/log'
import { requireAdminAccess } from '@/lib/auth/admin-access'
import { assertCongregationInScope } from '@/lib/auth/admin-scope'
import { SZERVEZETI_TIPUS_CIMKEK } from '@/lib/gyulekezet/egysegek-shared'
import type {
  SetCongregationSzervezetInput,
  SetCongregationSzervezetResult,
} from './szervezet-kotes-shared'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A PostgREST „nincs ilyen oszlop" hibái = a 2026-08-25-ös migráció még nem
 * futott le. (A getSzervezetiFa ugyanígy ismeri fel az RPC hiányát.)
 */
function migracioHianyzik(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const m = (error.message || '').toLowerCase()
  return (
    (m.includes('szervezeti_tipus') || m.includes('anya_congregation_id')) &&
    (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache'))
  )
}

const MIGRACIO_UZENET =
  'Az adatbázis még nem ismeri a szervezeti mezőket. Futtassa le a ' +
  'migration-docs/sql/2026-08-25-gyulekezeti-egysegek.sql migrációt, utána a művelet elérhető.'

/**
 * A gyülekezet szervezeti formájának beállítása / módosítása.
 *
 * Validálás (fail-closed, a DB-trigger a végső őr):
 *   · `leany` ⇄ anya KÖTELEZŐ, `anya`/`misszioi` → anya-kötés TILOS,
 *   · a gyülekezet nem lehet önmaga anyja,
 *   · a választott anya csak önálló (anya nélküli) `anya`/`misszioi` lehet,
 *   · akinek kapcsolt leánya van, maga nem sorolható leánynak.
 */
export async function setCongregationSzervezet(
  input: SetCongregationSzervezetInput,
): Promise<SetCongregationSzervezetResult> {
  const congregationId = input.congregationId
  const szervezetiTipus = input.szervezetiTipus
  // '' → null normalizálás: a <select> üres értéke ne látsszon azonosítónak.
  const anyaCongregationId = input.anyaCongregationId || null

  // ── (0) Bemenet-validálás — még a jogosultság-ellenőrzés előtt ──────────
  if (!UUID_RE.test(congregationId || '')) {
    return { error: 'Érvénytelen gyülekezet-azonosító.' }
  }
  if (szervezetiTipus !== 'anya' && szervezetiTipus !== 'leany' && szervezetiTipus !== 'misszioi') {
    return { error: 'Érvénytelen szervezeti típus.' }
  }
  if (szervezetiTipus === 'leany') {
    if (!UUID_RE.test(anyaCongregationId || '')) {
      return { error: 'Leányegyházközségnek kötelező anyaegyházközséget választani.' }
    }
  } else if (anyaCongregationId !== null) {
    return { error: 'Anyaegyházközséget csak leány típusnál lehet megadni.' }
  }
  if (anyaCongregationId === congregationId) {
    return { error: 'A gyülekezet nem lehet önmaga anyaegyházközsége.' }
  }

  // ── (1) Jogosultság + hatókör (fail-closed) ─────────────────────────────
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága.' }
  }
  try {
    await assertCongregationInScope(access, congregationId)
    if (anyaCongregationId) {
      // A kerületi admin a MÁSIK kerület gyülekezetét anyának sem választhatja.
      await assertCongregationInScope(access, anyaCongregationId)
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a művelethez.' }
  }
  const supabase = access.supabase

  // ── (2) A gyülekezet jelenlegi állapota (audit-hoz + no-op ellenőrzés) ──
  const { data: congRow, error: congErr } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, szervezeti_tipus, anya_congregation_id')
    .eq('id', congregationId)
    .maybeSingle()
  if (congErr) {
    if (migracioHianyzik(congErr)) return { error: MIGRACIO_UZENET }
    return { error: `A gyülekezet betöltése sikertelen: ${congErr.message}` }
  }
  if (!congRow) return { error: 'A gyülekezet nem található.' }
  const cong = congRow as {
    id: string
    nev_hu: string | null
    name: string | null
    szervezeti_tipus: string | null
    anya_congregation_id: string | null
  }
  const congNev = cong.nev_hu || cong.name || 'a gyülekezet'
  const regiTipus = cong.szervezeti_tipus
  const regiAnyaId = cong.anya_congregation_id

  if (regiTipus === szervezetiTipus && (regiAnyaId || null) === anyaCongregationId) {
    return { error: `${congNev} már pontosan ebben a szervezeti formában van — nincs mit módosítani.` }
  }

  // ── (3) Elő-validálás az anya oldalán (barátságosabb, mint a trigger) ───
  let anyaNev: string | null = null
  if (anyaCongregationId) {
    const { data: anyaRow, error: anyaErr } = await supabase
      .from('congregations')
      .select('id, nev_hu, name, szervezeti_tipus, anya_congregation_id')
      .eq('id', anyaCongregationId)
      .maybeSingle()
    if (anyaErr) {
      return { error: `Az anyaegyházközség betöltése sikertelen: ${anyaErr.message}` }
    }
    if (!anyaRow) return { error: 'A választott anyaegyházközség nem található.' }
    const anya = anyaRow as {
      id: string
      nev_hu: string | null
      name: string | null
      szervezeti_tipus: string | null
      anya_congregation_id: string | null
    }
    anyaNev = anya.nev_hu || anya.name || null
    if (
      (anya.szervezeti_tipus !== 'anya' && anya.szervezeti_tipus !== 'misszioi') ||
      anya.anya_congregation_id
    ) {
      return {
        error: `${anyaNev || 'A választott gyülekezet'} nem lehet anyaegyházközség: csak önálló „anya" vagy „missziói" típusú egyházközség választható.`,
      }
    }
    // Egyszintűség: akinek kapcsolt leánya van, maga nem sorolható leánynak.
    const { data: sajatLeanyok, error: leanyErr } = await supabase
      .from('congregations')
      .select('id')
      .eq('anya_congregation_id', congregationId)
      .limit(1)
    if (leanyErr) {
      return { error: `A kapcsolt leányok ellenőrzése sikertelen: ${leanyErr.message}` }
    }
    if (sajatLeanyok && sajatLeanyok.length > 0) {
      return {
        error: `${congNev} maga is anyaegyházközség (kapcsolt leánya van) — előbb a leányokat kell átsorolni.`,
      }
    }
  }

  // ── (4) Mentés — a `.select('id')` KRITIKUS: RLS-elutasításnál a Supabase
  //    nem ad hibát, csak 0 érintett sort; enélkül a felület sikert jelezne
  //    egy meg nem történt mentésre (néma no-op hibaosztály). ──────────────
  const { data: updated, error: updErr } = await supabase
    .from('congregations')
    .update({ szervezeti_tipus: szervezetiTipus, anya_congregation_id: anyaCongregationId })
    .eq('id', congregationId)
    .select('id')
  if (updErr) {
    if (migracioHianyzik(updErr)) return { error: MIGRACIO_UZENET }
    // ⚠️ A DB őr-trigger (congregations_szervezet_guard) MAGYAR RAISE-üzenetei
    //    ide érkeznek — SZÓ SZERINT adjuk tovább: a felhasználó a tényleges
    //    szabályt olvassa, nem egy általánosított burkolatot.
    return { error: updErr.message }
  }
  if (!updated || updated.length === 0) {
    return {
      error:
        'A mentés nem történt meg (az adatbázis jogosultság-szabálya elutasította, vagy a sor időközben eltűnt). Ellenőrizze a saját profil-szerepét — a congregations UPDATE-jogot az admin-szerep adja.',
    }
  }

  // ── (5) Audit + cache-frissítés ─────────────────────────────────────────
  await logAuditEvent(
    {
      action: 'congregation.szervezet_changed',
      targetTable: 'congregations',
      targetId: congregationId,
      metadata: {
        congregation_name: congNev,
        regi_tipus: regiTipus,
        uj_tipus: szervezetiTipus,
        regi_anya_id: regiAnyaId,
        uj_anya_id: anyaCongregationId,
        anya_nev: anyaNev,
      },
    },
    supabase,
  )

  revalidatePath('/admin/szervezet')
  revalidatePath('/admin')

  const cimke = SZERVEZETI_TIPUS_CIMKEK[szervezetiTipus]
  return {
    success:
      szervezetiTipus === 'leany' && anyaNev
        ? `${congNev} mostantól: ${cimke} — anyaegyházközsége: ${anyaNev}.`
        : `${congNev} mostantól: ${cimke}.`,
  }
}
