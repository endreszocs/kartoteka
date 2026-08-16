import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { FelterjesztesFogado } from '@/components/dashboard/district/felterjesztes-fogado'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  canWriteDistrictScope,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import { documentSeasonYear } from '@/lib/constants/documents'
import { getKeruletiFelterjesztesek } from '../felterjesztes-actions'

/**
 * KERÜLETI FOGADÓ FELÜLET — `/dashboard-kerulet/felterjesztesek`
 * (egyházkerületi S3, 2026-08-16).
 *
 * MIÉRT EZ A KÖR LEGNAGYOBB NYERESÉGE: az egyházmegyei szint már MA felküldi a
 * négy hivatalos iratát a `diocese_felterjesztes` táblába, a kerületnek viszont
 * NULLA fogyasztója volt ennek a táblának. Az irat felment és megállt: az
 * esperes nem tudta meg, átvették-e, a kerület nem látta, mi érkezett, a már
 * élő „visszaküldés" és „feloldás-kérés" mezőknek pedig nem volt elbírálója.
 * Ez az oldal zárja be a kört.
 *
 * A SZINT = ÚTVONAL elv szerint alútvonal (nem újabb fül a kerületi
 * irányítópulton) — pontosan úgy, ahogy a megyei `iratok` és `osszesito`.
 *
 * HATÓKÖR (FAIL-CLOSED, három lépcső):
 *   1. Belépő-kapu: `canReadDistrictScope` — a kerületi SZÁMVEVŐ (ellenőr) is
 *      bejut, ellenőri nézetben. (Nem a puszta `access.egyhazkeruletiAdmin`
 *      skalár: az kizárná a `profile_roles`-only kerületi adminokat is.)
 *   2. Aktív profil-hatókör: ha a felhasználó éppen MÁS szinten jár el, a saját
 *      szintjének kezdőoldalára megy — nem lát bele a kerületi postába.
 *   3. Listaszűrés: a szerep-szűrt `resolveDistrictReadScopeIds` (az RLS
 *      `current_user_district_olvaso_ids()` tükre). Feloldható hatókör nélkül
 *      MAGYARÁZÓ KÁRTYA áll itt — SOHA nem szűretlen, más kerület megyéit is
 *      mutató lista. A felterjesztés-sorok szűrését maga a szerver-akció végzi,
 *      ugyanezekkel a feloldókkal.
 *
 * ENDRE K4 DÖNTÉSE: a kerület kizárólag a hivatalosan felküldött iratokat és a
 * bennük lévő FAGYASZTOTT pillanatképet látja — a megyék könyveibe (befizetés,
 * kiadás, költségvetés, számadás) nem néz bele. Ezért ez az oldal két forrásból
 * dolgozik, és csak ebből a kettőből:
 *   · `diocese_felterjesztes` (a szerver-akción keresztül) — maga a hivatalos irat;
 *   · `dioceses` (id, name) TÖRZSADAT — a feladó neve a borítékon, és ami ennél
 *     is fontosabb: ebből derül ki, MELYIK megye NEM küldött semmit. Enélkül a
 *     lista csak a beérkezett iratokat mutatná, és egy „kerek" lista mögött fél
 *     kerület hiánya rejtőzne el.
 *
 * ÉV-ALAPÉRTELMEZÉS: a beszámolási SZEZON éve (`documentSeasonYear`) —
 * január–márciusban még az ELŐZŐ év, mert a számadások akkor érkeznek. A
 * naptári évre szegezett nézet ilyenkor üres képet mutatna, amiből a kerület
 * arra következtetne, hogy egyetlen megye sem terjesztett fel semmit.
 */
export default async function KeruletiFelterjesztesekPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDistrictScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  const districtIds = resolveDistrictReadScopeIds(access)
  const isSystemAdmin = !!access.admin || !!access.master
  if (districtIds.length === 0 && !isSystemAdmin) {
    return <MissingDistrictScopeNotice />
  }
  // Szűretlen ág KIZÁRÓLAG a feliratozott rendszergazdai/master nézetnek, és
  // csak akkor, ha nincs saját kerület-hatóköre — soha nem egy NULL-scope néma
  // mellékhatásaként.
  const mindenKerulet = isSystemAdmin && districtIds.length === 0

  const ev = documentSeasonYear()
  const adat = await getKeruletiFelterjesztesek(ev)

  // A kerület egyházmegyéi (TÖRZSADAT) — ebből látszik, ki NEM küldött semmit.
  //
  // A HIBÁT ELKAPJUK, NEM NYELJÜK EL. TÜNET, AMI ELLEN EZ VÉD: itt korábban csak
  // `const { data: megyeSorok } = await megyeQuery` állt. Ha a lekérdezés hibára
  // futott (RLS-drift, hálózat, séma-változás), `megyek = []` lett, és a fogadó
  // felület kimondta: „Ehhez az egyházkerülethez nincs egyházmegye rendelve,
  // ezért felterjesztés sem érkezhet." Elnyelt hiba esetén ez TÉNYSZERŰEN HAMIS
  // mondat egy hivatalos felületen: a kerület azt hinné, nincs kit sürgetnie,
  // pedig csak az adat nem volt olvasható. Ezért a hiba ÁTMEGY a komponensnek.
  let megyeQuery = access.supabase.from('dioceses').select('id, name').order('name')
  if (!mindenKerulet) megyeQuery = megyeQuery.in('district_id', districtIds)
  const { data: megyeSorok, error: megyeLekeresHiba } = await megyeQuery
  const megyek = ((megyeSorok || []) as Array<{ id: string; name: string | null }>).map((m) => ({
    id: m.id,
    nev: formatEgyhazmegyeNev(m.name) || 'Ismeretlen egyházmegye',
  }))
  // Beszédes magyar mondat — nyers adatbázis-hibaszöveg nélkül (az a lelkésznek
  // nem mond semmit, viszont belső részleteket szivárogtat).
  const megyekHiba = megyeLekeresHiba
    ? 'Az egyházmegyék törzsadata (neve, besorolása) most nem olvasható, ezért előfordulhat, ' +
      'hogy nem minden egyházmegye látszik a listán. Ez NEM azt jelenti, hogy nincs ' +
      'egyházmegye rendelve az egyházkerülethez — az adat beolvasása hiúsult meg. Frissítsd ' +
      'az oldalt, és ha ez megmarad, jelezd a rendszergazdának.'
    : undefined

  // Hero-név: a SAJÁT hatókör elsődleges kerülete a `districts` táblából — nem
  // az első beérkezett irat sorából kitalálva (az rendszergazdai nézetben akár
  // a MÁSIK kerület nevét is adhatná).
  const districtId = districtIds[0] ?? null
  let districtNev: string | null = null
  let districtNevOlvashatatlan = false
  if (districtId) {
    const { data, error } = await access.supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    // Itt a kár kisebb (csak a hero-chip felirata), de a hibaosztály UGYANAZ:
    // némán elnyelt hiba ⇒ a semleges „Egyházkerület" chip azt sugallná, hogy
    // minden rendben van. Mondjuk ki, hogy a nevet nem tudtuk beolvasni.
    if (error) districtNevOlvashatatlan = true
    else districtNev = (data as { name?: string | null } | null)?.name || null
  }

  const sorok = adat.rows || []
  const atvetelreVar = sorok.filter((s) => s.status === 'submitted').length
  const feloldasKerelem = sorok.filter((s) => s.unlockRequested).length
  // Az ellenőr ELŐRE lássa, hogy csak megtekinteni fog — ne egy néma, 0-soros
  // mentés után derüljön ki. (A gombokat maga a komponens tiltja le, a
  // szervertől kapott `canWrite` alapján; ez itt csak a hero-felirat.)
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
        eyebrow="Egyházkerületi posta"
        title="Egyházmegyei felterjesztések"
        description={
          'Az egyházmegyék hivatalosan felküldött iratai — számvevői összesítő, megyei számadás, ' +
          'megyei költségvetés és annak módosításai. Az átvétel nyugtázása, a javításra ' +
          'visszaküldés és a feloldás-kérelmek elbírálása egy helyen. A kerület kizárólag a ' +
          'felküldött, fagyasztott iratokat látja — az egyházmegyék könyveibe nem néz bele.'
        }
        chips={[
          districtNev ||
            (mindenKerulet
              ? 'Rendszergazdai összesített nézet'
              : districtNevOlvashatatlan
                ? 'Egyházkerület — a neve most nem olvasható'
                : 'Egyházkerület'),
          `${ev}. beszámolási év`,
          `${megyek.length.toLocaleString('hu-HU')} egyházmegye`,
          atvetelreVar > 0 ? `${atvetelreVar} irat átvételre vár` : 'Nincs átvételre váró irat',
          feloldasKerelem > 0 ? `${feloldasKerelem} feloldás-kérelem` : '',
          csakOlvas ? 'Ellenőri (számvevői) nézet — csak megtekintés' : '',
        ].filter(Boolean)}
      />

      <FelterjesztesFogado
        kezdoAdat={adat}
        kezdoEv={ev}
        megyek={megyek}
        megyekHiba={megyekHiba}
      />
    </div>
  )
}

/**
 * FAIL-CLOSED üres állapot: kerületi szintű felhasználó, akinek NEM oldható fel
 * az egyházkerület-hatóköre (se aktív szerep, se `profile_roles` district sor,
 * se `profiles.district_id`). Ilyenkor SOHA nem mutatunk „minden kerület"
 * listát — az más kerületek egyházmegyéinek hivatalos iratait szivárogtatná.
 */
function MissingDistrictScopeNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="card-raised border-amber-200 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 p-6 dark:border-amber-400/25 dark:bg-none">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg text-slate-800 dark:text-slate-100">
              Nincs egyházkerület rendelve a fiókjához
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              A felterjesztések fogadó felülete csak akkor tud iratot mutatni, ha a szerepköréhez
              konkrét egyházkerület tartozik. Jelenleg a fiókjához nem sikerült egyházkerületet
              feloldani, ezért — az egyházmegyék hivatalos iratainak védelme érdekében — nem
              jelenítünk meg listát.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a szerepköréhez a megfelelő
              egyházkerületet, vagy — ha több profilja van — váltson profilt a fejlécben.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
