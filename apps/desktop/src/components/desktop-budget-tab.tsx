/**
 * DesktopBudgetTab — a megosztott `BudgetTab` desktop-bekötése (2026-06-11, paritás #5).
 *
 * A web `components/finance/budget-tab.tsx` wrapper tükre:
 *   - betöltés: online a közös `loadBudgetRowsCompat`-tal (@kartoteka/core),
 *     OFFLINE pedig a lokális `koltsegvetes_local` tükörből (megtekintés),
 *   - mentés / véglegesítés / beküldés / feloldás-kérés: CSAK igazolt
 *     felhő-belépéssel (`getVerifiedSession`, B6 elv) — ezek a webbel azonos
 *     táblákra írnak (koltsegvetes, bealitas, document_submissions),
 *   - sikeres mentés után a lokális tükör frissül (`pullFinanceSettings`),
 *     hogy a Számadás-fül tervoszlopa és az offline nézet is naprakész legyen.
 */

import {
  BudgetTab as SharedBudgetTab,
  type BudgetTabProps,
} from '@kartoteka/ui-app'
import {
  loadBudgetRowsCompat,
  saveBudgetRowsCompat,
  saveBudgetModification as saveBudgetModificationCompat,
} from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getVerifiedSession } from '../lib/verified-session'
import { isOnlineWithSession } from '../lib/use-session-online'
import { getLocalBudgetCompatRows, pullFinanceSettings } from '../lib/finance-settings-sync'
import { getLocalOwnProfile } from '../lib/sync'

type DesktopBudgetTabProps = Pick<
  BudgetTabProps,
  'szamadasiCellek' | 'settings' | 'currentYear' | 'onRefresh' | 'onToast'
> & {
  userId: string
}

/** A beküldés-értesítés címkéi (a web `DOCUMENT_TYPE_LABELS` releváns elemei). */
const DOC_LABELS: Record<string, string> = {
  koltsegvetes: 'Költségvetés',
  koltsegvetes_modositas: 'Költségvetés-módosítás',
}

export function DesktopBudgetTab({ userId, ...props }: DesktopBudgetTabProps) {
  /** Írás-őr: minden felhő-írás előtt igazolt munkamenet kell (B6). */
  async function requireVerified(): Promise<{ ok: true } | { ok: false; error: string }> {
    const verified = await getVerifiedSession()
    if (!verified.ok) return { ok: false, error: verified.message }
    return { ok: true }
  }

  return (
    <SharedBudgetTab
      {...props}
      loadBudgetRows={async (year, congregationId) => {
        try {
          if (await isOnlineWithSession()) {
            const rows = await loadBudgetRowsCompat(getDesktopSupabase(), year, congregationId)
            return { rows, error: null }
          }
          // Offline: a lokális tükörből — megtekintésre teljes értékű
          // (alap + 3 módosítás), a mentés úgyis online művelet.
          const rows = await getLocalBudgetCompatRows(congregationId, year)
          return { rows, error: null }
        } catch (e) {
          return { rows: [], error: errorMessage(e) }
        }
      }}
      saveBudgetRows={async (year, congregationId, rows) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        try {
          await saveBudgetRowsCompat(getDesktopSupabase(), year, congregationId, rows)
          // A lokális tükör frissítése, hogy a Számadás-fül és az offline
          // nézet is az új tervszámokat lássa.
          void pullFinanceSettings(congregationId, year)
          return { success: true }
        } catch (e) {
          return { error: errorMessage(e) }
        }
      }}
      saveBudgetModification={async (year, congregationId, modNum, rows) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        try {
          await saveBudgetModificationCompat(getDesktopSupabase(), year, congregationId, modNum, rows)
          void pullFinanceSettings(congregationId, year)
          return { success: true }
        } catch (e) {
          return { error: errorMessage(e) }
        }
      }}
      finalizeBudget={async (year) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        const { error } = await getDesktopSupabase()
          .from('bealitas')
          .update({ budget_finalized: true })
          .eq('id', String(year))
          .eq('congregation_id', props.settings.congregation_id)
        if (error) return { error: `Hiba: ${error.message}` }
        void pullFinanceSettings(props.settings.congregation_id, year)
        return { success: true }
      }}
      finalizeBudgetModification={async (year, modNum) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        // A webbel azonos oszlopnevek (budget_modN_finalized + _date).
        const { error } = await getDesktopSupabase()
          .from('bealitas')
          .update({
            [`budget_mod${modNum}_finalized`]: true,
            [`budget_mod${modNum}_date`]: new Date().toISOString().split('T')[0],
          })
          .eq('id', String(year))
          .eq('congregation_id', props.settings.congregation_id)
        if (error) return { error: `Hiba: ${error.message}` }
        return { success: true }
      }}
      submitDocument={async (docType, year, snapshot, modNum) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        try {
          const supabase = getDesktopSupabase()
          const congregationId = props.settings.congregation_id
          const profile = await getLocalOwnProfile(userId)
          const dioceseId = profile?.diocese_id ?? null

          // A web `submitDocument` action tükre: upsert a document_submissions-be.
          const { error } = await supabase.from('document_submissions').upsert(
            {
              congregation_id: congregationId,
              diocese_id: dioceseId,
              year,
              document_type: docType,
              modification_number: modNum || null,
              status: 'submitted',
              submitted_at: new Date().toISOString(),
              snapshot_data: snapshot,
            },
            { onConflict: 'congregation_id,year,document_type,modification_number' },
          )
          if (error) return { error: `Hiba: ${error.message}` }

          // Értesítés az egyházmegyei címzetteknek — hiba esetén csendes
          // (a beküldés már sikeres, a flow-t nem blokkoljuk; web-azonos).
          try {
            const { data: cong } = await supabase
              .from('congregations')
              .select('name')
              .eq('id', congregationId)
              .maybeSingle()
            const congName = cong?.name || 'Ismeretlen gyülekezet'

            let recipientsQuery = supabase
              .from('profiles')
              .select('id')
              .eq('status', 'active')
              .in('role', ['esperes', 'egyhazmegyei_admin'])
            if (dioceseId) recipientsQuery = recipientsQuery.eq('diocese_id', dioceseId)
            const { data: recipients } = await recipientsQuery

            if (recipients && recipients.length > 0) {
              const docLabel = DOC_LABELS[docType] ?? docType
              const modSuffix = modNum ? ` (${modNum}. módosítás)` : ''
              await supabase.from('ertesitesek').insert(
                recipients.map((r) => ({
                  user_id: r.id,
                  congregation_id: congregationId,
                  cim: `Új beküldés: ${docLabel}${modSuffix} — ${congName}`,
                  uzenet:
                    `${congName} beküldte a(z) ${year}. évi ${docLabel.toLowerCase()}${modSuffix} ` +
                    `dokumentumot az egyházmegyének. Részletek: Egyházmegyei áttekintő.`,
                  tipus: 'info',
                  hivatkozas: '/dashboard-egyhazmegye',
                })),
              )
            }
          } catch {
            /* nem kritikus */
          }

          return { success: true }
        } catch (e) {
          return { error: errorMessage(e) }
        }
      }}
      requestBudgetUnlock={async (year, reason) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        const { error } = await getDesktopSupabase()
          .from('bealitas')
          .update({ unlock_requested: true, unlock_reason: reason?.trim() || null })
          .eq('id', String(year))
          .eq('congregation_id', props.settings.congregation_id)
        if (error) return { error: `Hiba: ${error.message}` }
        void pullFinanceSettings(props.settings.congregation_id, year)
        return { success: true }
      }}
    />
  )
}
