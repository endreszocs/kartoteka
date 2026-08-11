import 'server-only'

/**
 * VISSZAÁLLÍTÁS-NAPLÓ. 2026-08-11.
 *
 * MINDEN kísérlet naplózódik — a sikeres és a sikertelen is, sőt a puszta
 * száraz futás és a hibás jelszó-próbálkozás is. Ki, mikor, melyik mentésből,
 * milyen indokkal, és mit mutatott neki a száraz futás.
 *
 * HÁROM SZABÁLY, AMIT EZ A FÁJL BETARTAT:
 *
 *  1) A NAPLÓSOR A MŰVELET ELŐTT ÍRÓDIK. Ha a folyamat közben meghal, egy
 *     lezáratlan „indult" sor marad — ÉS EZ MAGA A RIASZTÁS. Egy utólag írt
 *     napló pont a legrosszabb esetben (összeomlás félúton) hiányozna.
 *
 *  2) AZ INDOKLÁS TÉNYLEG IDE MEGY. A `wipe-congregation-panel.tsx:79-80`
 *     bevallja, hogy ott az indoklás CSAK a felületen él, és sosem érte el a
 *     naplót. Ezt a hibát nem ismételjük meg.
 *
 *  3) A NAPLÓBA CSAK SZÁM MEGY, TARTALOM NEM. A száraz futás összefoglalója
 *     táblánkénti darabszám — se név, se összeg, se mintarekord, se CNP.
 *     A mentés-előzmény böngészése így nem jár adatfeltárással.
 *
 * A táblán szándékosan NINCS UPDATE/DELETE policy: a cselekvő nem tudja
 * eltüntetni a nyomát. Ezért ír ez a modul `service_role` klienssel.
 */

import { headers } from 'next/headers'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { hashClientIp } from '@/lib/utils/ip-hash'

export type RestoreLogTipus = 'preview' | 'restore' | 'download' | 'passphrase_fail'
export type RestoreLogOutcome = 'indult' | 'ok' | 'failed' | 'rolled_back'

export interface RestoreActor {
  profileId: string | null
  email: string | null
}

export interface StartRestoreLogArgs {
  tipus: RestoreLogTipus
  actor: RestoreActor
  congregationId?: string | null
  congregationNev?: string | null
  backupLogId?: number | null
  backupRunDate?: string | null
  backupSha256?: string | null
  planTokenHash?: string | null
  dryRunLogId?: number | null
  sessionId?: string | null
  liveFingerprint?: string | null
  indoklas?: string | null
  /** CSAK SZÁMOK. Tartalom ide soha nem kerül. */
  diffSummary?: Record<string, unknown> | null
  outcome?: RestoreLogOutcome
}

export interface FinishRestoreLogArgs {
  id: number
  outcome: RestoreLogOutcome
  errorMessage?: string | null
  preRestoreBackupId?: number | null
  rowsBefore?: Record<string, unknown> | null
  rowsAfter?: Record<string, unknown> | null
  tablesTouched?: string[] | null
  figyelmeztetesek?: string[] | null
}

/** Az IP-t SOHA nem tároljuk, csak sózott hash-ét (lib/utils/ip-hash.ts). */
async function actorIpHash(): Promise<string | null> {
  try {
    const h = await headers()
    return hashClientIp(h)
  } catch {
    // Ha nincs kérés-kontextus (pl. háttérfutás), a naplózás emiatt NEM bukhat el.
    return null
  }
}

/**
 * Naplósor NYITÁSA — a művelet ELŐTT.
 *
 * Ha ez elhasal, a HÍVÓNAK MEG KELL ÁLLNIA: naplózatlan visszaállítás nincs.
 * Ezért ad vissza `null`-t hiba esetén, és nem nyeli el csendben.
 */
export async function startRestoreLog(args: StartRestoreLogArgs): Promise<
  { ok: true; id: number } | { ok: false; error: string }
> {
  const supabase = getSupabaseAdminClient()
  const ipHash = await actorIpHash()

  const { data, error } = await supabase
    .from('backup_restore_log')
    .insert({
      tipus: args.tipus,
      actor_profile_id: args.actor.profileId,
      actor_email: args.actor.email,
      actor_ip_hash: ipHash,
      congregation_id: args.congregationId ?? null,
      congregation_nev: args.congregationNev ?? null,
      backup_log_id: args.backupLogId ?? null,
      backup_run_date: args.backupRunDate ?? null,
      backup_sha256: args.backupSha256 ?? null,
      plan_token_hash: args.planTokenHash ?? null,
      dry_run_log_id: args.dryRunLogId ?? null,
      session_id: args.sessionId ?? null,
      live_fingerprint: args.liveFingerprint ?? null,
      indoklas: args.indoklas ?? null,
      diff_summary: args.diffSummary ?? null,
      outcome: args.outcome ?? 'indult',
    })
    .select('id')
    .single()

  if (error) {
    // A UNIQUE index a plan_token_hash-en — EZ a „száraz futás egyszer
    // használható" szabály valódi kapuja. Ezt kimondjuk, nem generikus hibát adunk.
    const uzenet =
      error.code === '23505'
        ? 'Ezt az előnézetet már felhasználták egy visszaállításhoz. Egy száraz futás pontosan EGY visszaállítást hitelesít — futtasd le újra az előnézetet.'
        : `A visszaállítás-napló írása nem sikerült (${error.code || 'ismeretlen'}): ${error.message}`
    console.error('[visszaallitas] naplósor nyitása sikertelen:', error.code, error.message)
    return { ok: false, error: uzenet }
  }

  return { ok: true, id: Number((data as { id: number }).id) }
}

/**
 * Naplósor LEZÁRÁSA.
 *
 * ⚠️ CSAK MÉG NYITOTT SORT ZÁR (`finished_at IS NULL`). Ez nem óvatoskodás:
 *    a sikeres visszaállítást az SQL zárja le, ugyanabban a tranzakcióban,
 *    mint az adatváltozás. Ha a válasz hazaúton veszik el (hálózati hiba egy
 *    MÁR VÉGREHAJTOTT művelet után), a hívó hibát lát, és „sikertelenre"
 *    írná a naplót — miközben az adat visszaállt. A napló ilyenkor az
 *    ELLENKEZŐJÉT állítaná a valóságnak, ami rosszabb, mint ha semmit nem
 *    mondana. A `finished_at` őrszem ezt zárja ki.
 */
export async function finishRestoreLog(args: FinishRestoreLogArgs): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('backup_restore_log')
    .update({
      outcome: args.outcome,
      finished_at: new Date().toISOString(),
      error_message: args.errorMessage ?? null,
      pre_restore_backup_id: args.preRestoreBackupId ?? null,
      rows_before: args.rowsBefore ?? null,
      rows_after: args.rowsAfter ?? null,
      tables_touched: args.tablesTouched ?? null,
      figyelmeztetesek: args.figyelmeztetesek ?? [],
    })
    .eq('id', args.id)
    .is('finished_at', null)
    .select('id')

  if (error) {
    // A lezárás elmaradása NEM adatvesztés, de nyitva hagy egy sort — és a
    // nyitott sor riasztásnak számít. Ezért hangosan naplózzuk a szerveren.
    console.error('[visszaallitas] naplósor lezárása sikertelen:', error.code, error.message)
    return
  }
  if ((data ?? []).length === 0) {
    // A sor MÁR le volt zárva — szinte biztosan az SQL zárta le sikeresként,
    // és a válasz veszett el. Ezt hangosan kiírjuk, mert ilyenkor a
    // felhasználó hibát látott, miközben a művelet lefutott.
    console.warn(
      `[visszaallitas] a(z) #${args.id} naplósor már le volt zárva — a(z) "${args.outcome}" állapotot NEM írtuk felül.`,
    )
  }
}

/**
 * Csak a `pre_restore_backup_id`-t és a figyelmeztetéseket frissíti — a
 * sikeres visszaállításnál a sor LEZÁRÁSA az SQL-ben történik, ugyanabban a
 * tranzakcióban, mint az adatváltozás (így a napló és az adat EGYÜTT dől el).
 */
export async function attachPreRestoreBackup(
  id: number,
  preRestoreBackupId: number,
  figyelmeztetesek: string[],
): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('backup_restore_log')
    .update({
      pre_restore_backup_id: preRestoreBackupId,
      figyelmeztetesek,
    })
    .eq('id', id)
  if (error) {
    console.error('[visszaallitas] elő-mentés rögzítése sikertelen:', error.code, error.message)
  }
}

/**
 * Egylépéses esemény naplózása (hibás jelszó, letöltés, elutasított kísérlet).
 * Nyitva sosem marad — azonnal lezárt sor.
 */
export async function logRestoreEvent(
  args: StartRestoreLogArgs & { errorMessage?: string | null },
): Promise<number | null> {
  const res = await startRestoreLog({ ...args, outcome: args.outcome ?? 'failed' })
  if (!res.ok) return null
  await finishRestoreLog({
    id: res.id,
    outcome: args.outcome ?? 'failed',
    errorMessage: args.errorMessage ?? null,
  })
  return res.id
}
