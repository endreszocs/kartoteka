import { redirect } from 'next/navigation'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { DioceseOsszesitoView } from '@/components/dashboard/diocese/diocese-osszesito-view'
import {
  MissingDioceseScopeNotice,
  VisszaAzIranyitopultra,
} from '@/components/dashboard/diocese/diocese-scope-notice'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canReadDioceseScope, resolveDioceseReadScopeIds } from '@/lib/auth/level-scope'
import { documentSeasonYear } from '@/lib/constants/documents'
import { getMegyeiOsszesito } from '../osszesito-actions'

/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ — `/dashboard-egyhazmegye/osszesito`
 * (2026-08-15, egyházmegyei terv 3.5–3.6 / S6 szelet).
 *
 * Kánon 90.§: a számvevő a megye gyülekezeteinek zárszámadását és
 * költségvetését „kellő időben ÖSSZESÍTI". Ez a felület az összesítés, és
 * innen megy fel az összesítő az egyházkerülethez — a megye SAJÁT iratainak
 * felküldésétől KÜLÖN úton (Endre 3. döntése).
 *
 * ÉV-ALAPÉRTELMEZÉS: a beszámolási SZEZON éve (`documentSeasonYear`) —
 * január–márciusban az ELŐZŐ év, mert a számadások akkor érkeznek. A naptári
 * évre szegezett nézet ilyenkor üres képet mutatna.
 *
 * HATÓKÖR (fail-closed): olvasási kapu `canReadDioceseScope` (a számvevő
 * ellenőri nézetben belép), a számítás pedig a szerep-szűrt hatókör EGYETLEN
 * megyéjére fut — országos „minden megye" összesítő SZÁNDÉKOSAN nincs (nem
 * létezik olyan hivatalos irat, és félrevezető végösszeg lenne).
 */
export default async function MegyeiOsszesitoPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDioceseScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'diocese') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  const dioceseId = resolveDioceseReadScopeIds(access)[0] ?? null
  if (!dioceseId) return <MissingDioceseScopeNotice />

  const ev = documentSeasonYear()
  const adat = await getMegyeiOsszesito(ev)
  const o = adat.osszesito

  return (
    <div className="space-y-5">
      <VisszaAzIranyitopultra />
      <ScopeHero
        eyebrow="Egyházmegyei összesítő"
        title={`${ev}. évi megyei összesítés`}
        description={
          'A gyülekezetek beküldött, véglegesített iratainak megyei összesítése — számadás, ' +
          'költségvetés, vagyonleltár, választói névjegyzék és lelkészi jelentés. Az összesítő ' +
          'külön véglegesíthető és felküldhető az egyházkerületnek.'
        }
        chips={[
          adat.dioceseNev || 'Egyházmegye',
          o ? `${o.gyulekezetSzam.toLocaleString('hu-HU')} gyülekezet` : 'Betöltés alatt',
          o
            ? `Számadás: ${o.szamadas.allapot.bekuldott.length} / ${o.gyulekezetSzam} beküldve`
            : 'Számadás: —',
          adat.canWrite === false ? 'Ellenőri (csak megtekintés) nézet' : '',
        ].filter(Boolean)}
      />
      <DioceseOsszesitoView kezdoAdat={adat} kezdoEv={ev} />
    </div>
  )
}
