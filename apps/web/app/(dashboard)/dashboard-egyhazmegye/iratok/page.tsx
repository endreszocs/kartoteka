import { redirect } from 'next/navigation'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { DioceseArchivumView } from '@/components/dashboard/diocese/diocese-archivum-view'
import {
  MissingDioceseScopeNotice,
  VisszaAzIranyitopultra,
} from '@/components/dashboard/diocese/diocese-scope-notice'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canReadDioceseScope, resolveDioceseReadScopeIds } from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import { getSubmissionMatrix } from '../document-actions'

/**
 * BEKÜLDÖTT IRATOK ARCHÍVUMA — `/dashboard-egyhazmegye/iratok`
 * (2026-08-15, egyházmegyei terv 3.2 / S5 szelet).
 *
 * A megye gyülekezetei által VÉGLEGESÍTETT és beküldött hivatalos iratok
 * archívuma: mind a hat irat-típus, gyülekezetenként ÉS évekre visszamenőleg
 * (Endre 3. követelménye). A szint = ÚTVONAL elv szerint alútvonal, nem újabb
 * fül a dashboardon.
 *
 * HATÓKÖR (fail-closed): olvasási kapu `canReadDioceseScope` (a számvevő is
 * beengedve, ellenőri nézetben), a LISTASZŰRÉS pedig a szerep-szűrt
 * `readScopeIds` alapján a `getSubmissionMatrix`-ban — feloldhatatlan hatókör
 * → magyarázó kártya, SOHA nem szűretlen (más megyés) lista.
 *
 * TELJES ARCHÍVUM: a mátrix `years: null`-lal hívva MINDEN év beküldését
 * hozza (a jsonb-pillanatkép nélkül — az a snapshot-néző kérésére töltődik),
 * mert az archívum lényege épp az évek egymásutánja.
 */
export default async function MegyeiIratokArchivumPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDioceseScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'diocese') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  const isSystemAdmin = !!access.admin || !!access.master
  const dioceseId = resolveDioceseReadScopeIds(access)[0] ?? null
  if (!dioceseId && !isSystemAdmin) return <MissingDioceseScopeNotice />

  const { data: dioceseRow } = dioceseId
    ? await access.supabase.from('dioceses').select('name').eq('id', dioceseId).maybeSingle()
    : { data: null }

  // `years: null` = explicit „minden év" (a felhasználó ezt kérte az
  // archívummal). A pillanatképek NEM utaznak a listával.
  const data = await getSubmissionMatrix('diocese', { years: null })

  // Az „évfolyam" a TÉNYLEGESEN beküldött évek száma. A `data.years` az
  // év-választóhoz készül, és beleteszi az aktuális + előző évet akkor is, ha
  // abból még egyetlen irat sem érkezett — a hero-felirat abból túlmondana.
  const evek = new Set(data.submissions.map((s) => s.year)).size
  return (
    <div className="space-y-5">
      <VisszaAzIranyitopultra />
      <ScopeHero
        eyebrow="Egyházmegyei irattár"
        title="Beküldött iratok archívuma"
        description={
          'A gyülekezetek által véglegesített és beküldött hivatalos iratok — számadás, ' +
          'költségvetés és módosításai, vagyonleltári jelentés, választók névjegyzéke és lelkészi ' +
          'jelentés — gyülekezetenként és évekre visszamenőleg, egy helyen.'
        }
        chips={[
          formatEgyhazmegyeNev(dioceseRow?.name) || 'Rendszergazdai összesített nézet',
          `${(data.totalCount ?? data.submissions.length).toLocaleString('hu-HU')} beküldött irat`,
          `${data.congregations.length.toLocaleString('hu-HU')} gyülekezet`,
          evek > 0 ? `${evek} évfolyam` : 'Még nincs beküldött év',
        ]}
      />
      <DioceseArchivumView data={data} />
    </div>
  )
}
