import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Választói jogosultság újraszámítása — KÖZÖS, „best-effort" hívó.
 *
 * 2026-08-15 (átvilágítás, 23. megállapítás): a perzisztált
 * `szemely.voter_eligible` zászlót KIZÁRÓLAG a `recompute_voter_eligibility`
 * RPC állítja, és azt eddig csak a Választók fül három művelete hívta
 * (kézi újraszámítás, konfirmáció-kapcsoló, egyéni felülbírálás).
 * Adatbázis-trigger és ütemezett futás sincs rá, ezért az élet-eseményeket
 * rögzítő műveletek (kivezetés, temetés, tagmozgás, konfirmáció) után a
 * zászló ÁLLOTT maradt: az elköltözött és az elhunyt addig rajta maradt a
 * hivatalos választói névjegyzéken, amíg valaki kézzel meg nem nyomta a
 * „Jogosultság frissítése" gombot.
 *
 * Ez a modul a KÖZÖS hívási út — hogy ne szülessen belőle négy, egymástól
 * elcsúszó másolat (a repó ismert hibaosztálya). Szerződés:
 *
 *  • best-effort: az RPC hibája NEM buktatja el az üzleti műveletet (a
 *    temetés/kivezetés maga már elmentődött — azt visszagörgetni rosszabb
 *    volna, mint egy állott jogosultsági jelöléssel élni),
 *  • de NEM néma: minden nem-`ok` kimenet a szerver-naplóba kerül ÉS
 *    magyar, cselekvésre váltható figyelmeztetést ad vissza a felületnek,
 *  • fail-closed a válasz értelmezésében: csak a kifejezett `status: 'ok'`
 *    számít sikernek — az ismeretlen vagy `forbidden` válasz figyelmeztetés.
 *
 * KÖTEGELT műveletnél (pl. konfirmáció-batch) a köteg VÉGÉN, EGYSZER hívd:
 * az RPC a teljes gyülekezetet újraszámolja, soronként hívni felesleges
 * terhelés volna.
 */

/** A lelkésznek szóló, zsargon nélküli figyelmeztetés — egyetlen forrásból. */
export const VOTER_RECOMPUTE_WARNING =
  'A választói névjegyzék automatikus frissítése nem sikerült, ezért a jogosultsági jelölés egyelőre a művelet ELŐTTI állapotot mutatja. Nyisd meg a Tagnyilvántartás → Választók fület, és nyomd meg a „Jogosultság frissítése" gombot.'

export interface VoterRecomputeResult {
  ok: boolean
  /** Csak hibánál van kitöltve — a hívó a saját figyelmeztetés-listájába teszi. */
  warning?: string
}

/**
 * Újraszámolja a gyülekezet választói jogosultságait.
 *
 * @param source A hívó művelet neve — csak a szerver-naplóba kerül, hogy
 *   utólag látszódjon, melyik művelet után maradt állott a zászló.
 */
export async function refreshVoterEligibility(
  supabase: SupabaseClient,
  congregationId: string | null | undefined,
  source: string,
): Promise<VoterRecomputeResult> {
  if (!congregationId) {
    console.warn(`[${source}] választói jogosultság újraszámítása kimaradt: nincs aktív gyülekezet`)
    return { ok: false, warning: VOTER_RECOMPUTE_WARNING }
  }

  try {
    const { data, error } = await supabase.rpc('recompute_voter_eligibility', {
      p_congregation_id: congregationId,
    })
    if (error) {
      console.warn(`[${source}] recompute_voter_eligibility hiba:`, error.message)
      return { ok: false, warning: VOTER_RECOMPUTE_WARNING }
    }
    const status = (data as { status?: string } | null)?.status
    if (status !== 'ok') {
      // 'forbidden' vagy ismeretlen válasz — fail-closed: nem tekintjük sikernek.
      console.warn(`[${source}] recompute_voter_eligibility váratlan válasz:`, status ?? 'üres')
      return { ok: false, warning: VOTER_RECOMPUTE_WARNING }
    }
    return { ok: true }
  } catch (e) {
    console.warn(
      `[${source}] recompute_voter_eligibility kivétellel állt le:`,
      e instanceof Error ? e.message : e,
    )
    return { ok: false, warning: VOTER_RECOMPUTE_WARNING }
  }
}
