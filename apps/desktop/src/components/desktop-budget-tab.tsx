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

// 2026-07-10 (S2-#5 paritás): carryoverCash/carryoverBank (nyitó egyenleg blokk)
// + loadPreviousActuals („Előző évi tény" oszlop) átengedése a shared tabnak —
// a web budget-tab.tsx wrapper tükre. Mind opcionális, a {...props} viszi tovább.
type DesktopBudgetTabProps = Pick<
  BudgetTabProps,
  | 'szamadasiCellek'
  | 'settings'
  | 'currentYear'
  | 'carryoverCash'
  | 'carryoverBank'
  | 'loadPreviousActuals'
  | 'onRefresh'
  | 'onToast'
> & {
  userId: string
}

/** A beküldés-értesítés címkéi (a web `DOCUMENT_TYPE_LABELS` releváns elemei). */
const DOC_LABELS: Record<string, string> = {
  koltsegvetes: 'Költségvetés',
  koltsegvetes_modositas: 'Költségvetés-módosítás',
}

/**
 * Az évi zár-/kérelem-zászlók írása a `bealitas` táblába — 0 soros NÉMA SIKER nélkül.
 *
 * 2026-08-15 (P0 néma no-op, desktop). MI VOLT A HIBA: a három írás (`finalizeBudget`,
 * `finalizeBudgetModification`, `requestBudgetUnlock`) `.select()` NÉLKÜL futott, a
 * PostgREST pedig 0 érintett sornál sem ad hibát. Ha az adott évhez nem volt
 * `bealitas` sor — vagy az RLS elnyelte az írást —, a művelet „siker"-t adott vissza.
 * KÖVETKEZMÉNY: a lelkész azt hitte, véglegesítette az évet (a BudgetTab a sikerre
 * zöld utat kapott, és beküldte a snapshotot az egyházmegyének), közben a
 * költségvetés NYITVA maradt; a feloldás-kérésnél pedig „Elküldve!"-t látott, de az
 * esperes soha nem kapta meg a kérelmet.
 *
 * A webes párja ugyanezt 2026-08-11-én javította: `updateYearlyFinanceFlags`
 * (apps/web/app/(dashboard)/penzugy/actions.ts) — ez annak a desktop-tükre.
 * A két oldalnak nincs közös helpere: a webes változat szerver-akció
 * (getProfileCongregation + revalidatePath), amit a Tauri-kliens nem tud hívni.
 */
async function updateYearlyBudgetFlags(
  year: number,
  congregationId: string,
  updates: Record<string, unknown>,
  muvelet: string,
): Promise<{ success?: boolean; error?: string }> {
  const { data: updated, error } = await getDesktopSupabase()
    .from('bealitas')
    .update(updates)
    .eq('id', String(year))
    .eq('congregation_id', congregationId)
    .select('id')

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    return {
      error:
        `${muvelet} nem történt meg: a ${year}. évhez nincs mentett évi pénzügyi ` +
        'beállítás, vagy nincs írási jogosultságod hozzá. Nyisd meg a Pénzügy oldalon ' +
        'ezt az évet, mentsd el az évi beállításokat, majd próbáld újra. Ha újra ezt ' +
        'írja, jelezd a rendszergazdának.',
    }
  }
  return { success: true }
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
        const result = await updateYearlyBudgetFlags(
          year,
          props.settings.congregation_id,
          { budget_finalized: true },
          'A költségvetés véglegesítése',
        )
        if (result.error) return result
        void pullFinanceSettings(props.settings.congregation_id, year)
        return { success: true }
      }}
      finalizeBudgetModification={async (year, modNum) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        // A webbel azonos oszlopnevek (budget_modN_finalized + _date).
        return updateYearlyBudgetFlags(
          year,
          props.settings.congregation_id,
          {
            [`budget_mod${modNum}_finalized`]: true,
            [`budget_mod${modNum}_date`]: new Date().toISOString().split('T')[0],
          },
          `A ${modNum}. költségvetés-módosítás véglegesítése`,
        )
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
              const alapSorok = recipients.map((r) => ({
                user_id: r.id,
                congregation_id: congregationId,
                cim: `Új beküldés: ${docLabel}${modSuffix} — ${congName}`,
                uzenet:
                  `${congName} beküldte a(z) ${year}. évi ${docLabel.toLowerCase()}${modSuffix} ` +
                  `dokumentumot az egyházmegyének. Részletek: Egyházmegyei áttekintő.`,
                tipus: 'info',
                hivatkozas: '/dashboard-egyhazmegye',
              }))
              // 2026-09-05: a FELADÓ a beküldő gyülekezet — a három feladó-mező
              // SZÓ SZERINT (az asztali app nem importálhat az apps/web
              // `feladoMezok()` segédjéből; a kulcsok = az ertesitesek oszlopai).
              const feladoMezok = {
                felado_tipus: 'gyulekezet',
                felado_nev: congName,
                felado_id: congregationId,
              }
              const { error: ertErr } = await supabase
                .from('ertesitesek')
                .insert(alapSorok.map((s) => ({ ...s, ...feladoMezok })))
              if (ertErr) {
                // MIGRÁCIÓ ELŐTTI VISSZAESÉS: ha a feladó-oszlopok még nincsenek az
                // adatbázisban (2026-09-05-ertesitesek-felado.sql), a sor nélkülük
                // megy be — az üzenet kézbesül, a feladót a visszatöltés adja rá.
                const oszlopHianyzik = /felado_/i.test(`${ertErr.message ?? ''} ${ertErr.details ?? ''}`)
                if (!oszlopHianyzik) {
                  console.warn('[desktop-budget] a beküldés-értesítés nem ment ki:', ertErr.message)
                } else {
                  const { error: masodik } = await supabase.from('ertesitesek').insert(alapSorok)
                  if (masodik) console.warn('[desktop-budget] a beküldés-értesítés nem ment ki:', masodik.message)
                }
              }
            }
          } catch (e) {
            // A beküldés már sikeres — de a hallgatás tilos.
            console.warn('[desktop-budget] a beküldés-értesítés nem ment ki:', errorMessage(e))
          }

          return { success: true }
        } catch (e) {
          return { error: errorMessage(e) }
        }
      }}
      requestBudgetUnlock={async (year, reason) => {
        const guard = await requireVerified()
        if (!guard.ok) return { error: guard.error }
        const result = await updateYearlyBudgetFlags(
          year,
          props.settings.congregation_id,
          { unlock_requested: true, unlock_reason: reason?.trim() || null },
          'A költségvetés javítási kérelmének elküldése',
        )
        if (result.error) return result
        void pullFinanceSettings(props.settings.congregation_id, year)
        return { success: true }
      }}
    />
  )
}
