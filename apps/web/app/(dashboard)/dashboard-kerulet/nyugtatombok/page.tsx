import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  canWriteDistrictScope,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { NyugtatombKezelo } from './nyugtatomb-kezelo'

/**
 * EGYHÁZKERÜLETI NYUGTATÖMBÖK — `/dashboard-kerulet/nyugtatombok`
 * (2026-08-17, kerületi S6).
 *
 * MIÉRT ÖNÁLLÓ ÚTVONAL ÉS NEM FÜL: a kerületi szint a SZINT = ÚTVONAL elvet
 * követi (felterjesztesek / iratok / osszesito) — a megyei megoldás füles
 * dashboardja itt nem létezik.
 *
 * MIÉRT MOST ÉPÜL MEG: az S5c SQL (2026-08-17) az adatbázis-oldalt már
 * megnyitotta — `chitanta_tombok.district_id`, kerületi CHECK-ág, 2 részleges
 * index, 4 RLS-láb —, és az oszlop kommentje szó szerint kimondja, hogy a
 * FELÜLET hiányzik. Egy kinyitott, de fogyasztó nélküli adat-út pontosan az a
 * félkész állapot, amit a `diocese_felterjesztes` egyszer már megszenvedett:
 * az írás él, az olvasás nincs, és senki nem tudja, hogy a lánc elszakadt.
 *
 * HATÓKÖR — FAIL-CLOSED, HÁROM LÉPCSŐ (a felterjesztések oldalával azonos):
 *   1. Belépő-kapu: `canReadDistrictScope` — a kerületi SZÁMVEVŐ (ellenőr) is
 *      bejut, ellenőri nézetben. NEM a puszta `access.egyhazkeruletiAdmin`
 *      skalár: az kizárná a `profile_roles`-only kerületi adminokat is.
 *   2. Aktív profil-hatókör: ha a felhasználó éppen MÁS szinten jár el, a saját
 *      szintjének kezdőoldalára megy.
 *   3. Konkrét kerület: a szerep-szűrt `resolveDistrictReadScopeIds` első eleme
 *      (az RLS `current_user_district_olvaso_ids()` tükre). Feloldható kerület
 *      nélkül MAGYARÁZÓ KÁRTYA áll itt.
 *
 * ⚠️ MIÉRT NINCS „MINDEN KERÜLET" (rendszergazdai) NÉZET EZEN AZ OLDALON:
 *    egy nyugtatömb fizikailag EGY egyházkerület tulajdona, és a
 *    `chitanta_tombok.district_id` NOT NULL a kerületi ágon. Egy összevont
 *    lista nemcsak értelmetlen volna, hanem veszélyes is: a „melyik tömbből
 *    állítsuk ki a következő nyugtát" kérdésre két kerület tartománya keveredve
 *    válaszolna. A saját kerület-hatókör nélküli rendszergazda ezért itt
 *    magyarázó kártyát kap, nem listát.
 */
export default async function KeruletiNyugtatombokPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDistrictScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  const districtIds = resolveDistrictReadScopeIds(access)
  const districtId = districtIds[0] ?? null
  const isSystemAdmin = !!access.admin || !!access.master

  if (!districtId) {
    return <NincsKeruletKartya rendszergazda={isSystemAdmin} />
  }

  // Hero-név a `districts` törzsadatból — nem az első nyugtatömb sorából
  // kitalálva. A hibát NEM nyeljük el: a semleges „Egyházkerület" felirat azt
  // sugallná, hogy minden rendben, pedig csak a nevet nem tudtuk beolvasni.
  let districtNev: string | null = null
  let nevOlvashatatlan = false
  {
    const { data, error } = await access.supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    if (error) nevOlvashatatlan = true
    else districtNev = (data as { name?: string | null } | null)?.name || null
  }

  // Az ellenőr ELŐRE lássa, hogy csak megtekinteni fog. (A gombokat maga a
  // komponens tiltja le, a szervertől kapott `canWrite` alapján; ez itt csak a
  // hero felirata.)
  const csakOlvas = !canWriteDistrictScope(access, districtId)

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard-kerulet"
        className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground max-sm:min-h-10"
      >
        <ArrowLeft className="size-4" />
        Vissza az egyházkerületi irányítópultra
      </Link>

      <ScopeHero
        eyebrow="Egyházkerületi pénzügy"
        title="Nyugtatömbök"
        description={
          'Az egyházkerület saját nyugtatömbjei: a megvásárolt tömbök szám-tartománya, a ' +
          'felhasználásuk nyilvántartása és a betelt tömbök lezárása. A tömb felvételekor ' +
          'ellenőrizzük, hogy a szám-tartomány nem fed-e át egy korábbi, azonos szériájú tömbét — ' +
          'két azonos sorszámú nyugta ugyanis utólag nem javítható.'
        }
        chips={[
          districtNev || (nevOlvashatatlan ? 'Egyházkerület — a neve most nem olvasható' : 'Egyházkerület'),
          csakOlvas ? 'Ellenőri (számvevői) nézet — csak megtekintés' : '',
        ].filter(Boolean)}
      />

      <NyugtatombKezelo districtId={districtId} districtNev={districtNev} />
    </div>
  )
}

/**
 * FAIL-CLOSED üres állapot. KÉT külön mondat, mert két külön teendő tartozik
 * hozzájuk: a kerületi felhasználónak hatókört kell kapnia, a rendszergazdának
 * pedig profilt kell váltania — neki van joga, csak nincs megadva, MELYIK
 * kerületről van szó.
 */
function NincsKeruletKartya({ rendszergazda }: { rendszergazda: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="card-raised border-amber-200 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 p-6 dark:border-amber-400/25 dark:bg-none">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg text-slate-800 dark:text-slate-100">
              {rendszergazda
                ? 'Válaszd ki, melyik egyházkerületről van szó'
                : 'Nincs egyházkerület rendelve a fiókjához'}
            </h2>
            {rendszergazda ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                A nyugtatömb mindig EGYETLEN egyházkerület tulajdona, ezért ezen a felületen nincs
                „minden egyházkerület” nézet: két kerület szám-tartománya összekeverve azt a kérdést
                tenné megválaszolhatatlanná, hogy melyik tömbből következik a nyugta. Válts a
                fejlécben arra a profilra, amelyikhez konkrét egyházkerület tartozik.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  A nyugtatömb-nyilvántartás csak akkor tud adatot mutatni, ha a szerepköréhez
                  konkrét egyházkerület tartozik. Jelenleg a fiókjához nem sikerült egyházkerületet
                  feloldani, ezért — az adatok védelme érdekében — nem jelenítünk meg listát.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a szerepköréhez a megfelelő
                  egyházkerületet, vagy — ha több profilja van — váltson profilt a fejlécben.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
