import { KeyRound, ShieldAlert } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SecuritySettingsTabV2 } from '@/components/admin/security-settings-tab-v2'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { szefAllapot } from '@/lib/supabase/secret-vault'

/**
 * 2026-08-24 — TITOK-SZÉF ÁLLAPOTSOR.
 *
 * A `lib/supabase/secret-vault.ts` korábban NÉMÁN a 6 jegyű god-mode PIN-nel
 * titkosított, ha a `VAULT_ENCRYPTION_KEY` hiányzott — a figyelmeztetése pedig
 * halott kód volt, tehát soha nem szólalt meg. A szerver-oldali napló mellett
 * ITT is látszania kell, mert egy környezeti változó hiányát senki nem veszi
 * észre a naplóban.
 *
 * ⚠️ CSAK A FŐ RENDSZERGAZDÁNAK mutatjuk (ugyanaz a kör, mint a lenti PIN-panelé:
 * `requireMasterAdmin`). Egy kerületi adminnak nem kell tudnia, hogy a széf
 * éppen a god-mode PIN-nel dolgozik. Maga a kulcs SOHA nem jelenik meg — sem a
 * kulcs, sem a hossza, sem az előtagja.
 */
export default async function Page() {
  const { master } = await getEffectiveAccessContext()
  const szef = szefAllapot()
  const mutatFigyelmeztetest = master && szef.figyelmeztetes !== null

  return (
    <>
      <AdminPageHeader
        title="Rendszer"
        description="Biztonsági beállítások, audit-konfiguráció, rendszerszintű paraméterek. Csak rendkívüli esetben módosíts!"
        icon={ShieldAlert}
      />
      {mutatFigyelmeztetest ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 shrink-0" aria-hidden />
            Titok-széf: gyenge kulcs
          </p>
          <p className="mt-2 leading-relaxed">{szef.figyelmeztetes}</p>
        </div>
      ) : null}
      <div className="card-raised p-4 sm:p-5">
        <SecuritySettingsTabV2 />
      </div>
    </>
  )
}
