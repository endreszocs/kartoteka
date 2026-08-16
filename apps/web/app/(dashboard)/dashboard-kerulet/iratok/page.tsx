import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Info,
  Landmark,
  TriangleAlert,
} from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
// A gyülekezeti rekesz a MEGYEI archívum-nézetét használja — nem másolatot.
// A komponens 2026-08-17 óta `level`-paraméteres (alapértelmezés: 'diocese'),
// mert a benne lévő pillanatkép-néző jogosultság-ága szintfüggő.
import { DioceseArchivumView } from '@/components/dashboard/diocese/diocese-archivum-view'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  canWriteDistrictScope,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import {
  FELTERJESZTES_LABELS,
  felterjesztesAllapotSzoveg,
  type DioceseFelterjesztesTipus,
} from '@/lib/finance/diocese-felterjesztes'
import { getSubmissionMatrix } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import { getKeruletiFelterjesztesek } from '../felterjesztes-actions'

/**
 * EGYHÁZKERÜLETI IRATTÁR — `/dashboard-kerulet/iratok`
 * (egyházkerületi S4, 2026-08-17).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÉT REKESZ — ÉS MIÉRT NEM EGY LISTA
 * ════════════════════════════════════════════════════════════════════════════
 * A kerülethez KÉTFÉLE hivatalos irat érkezik, és a kettő JOGI TERMÉSZETE MÁS:
 *
 *  (1) A GYÜLEKEZETEK iratai (`document_submissions`) — ezeket a gyülekezet
 *      véglegesítette, az egyházmegye ellenőrizte és TOVÁBBÍTOTTA a kerületnek.
 *      A felelős a gyülekezet, az ellenőrző az egyházmegye; a kerület átvevő.
 *
 *  (2) AZ EGYHÁZMEGYÉK saját felterjesztései (`diocese_felterjesztes`) — ezeket
 *      maga a megye állította ki a SAJÁT könyveiből (megyei számadás,
 *      költségvetés + módosításai, számvevői összesítő). A felelős az esperesi
 *      hivatal, a címzett közvetlenül a kerület.
 *
 * Ha a kettőt EGY listába öntenénk, egy „gyülekezeti számadás" és egy „megyei
 * számadás" ugyanabban az oszlopban ülne — ami nemcsak zavaró, hanem hivatalos
 * felületen félrevezető is: más az irat gazdája, más a hitelesítője és más a
 * javítás útja. Ezért két, VILÁGOSAN feliratozott szakasz áll itt, mindegyik
 * kimondja, kinek az irata és honnan érkezett.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ENDRE K4 DÖNTÉSE (2026-08-16) — AZ ADATFORRÁS HATÁRA
 * ────────────────────────────────────────────────────────────────────────────
 * „A kerület nem írhatja és nem is olvassa a kerület gyülekezeteinek és
 *  egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve
 *  azoknak az összesítőjét!"
 * ⇒ Ez az oldal HÁROM forrásból dolgozik, és csak ebből a háromból:
 *   · `getSubmissionMatrix('district')` — a TOVÁBBÍTOTT/véglegesített gyülekezeti
 *     beküldések (a szűrést maga az akció végzi, `districtVisibleOnly`);
 *   · `getKeruletiFelterjesztesek()` — a megyei felterjesztés-sorok (a fagyasztott
 *     `snapshot_data` NÉLKÜL: azt a kerületi posta nyitja meg, darabonként);
 *   · `dioceses` / `districts` TÖRZSADAT (id, name) — a feladó neve a borítékon.
 *   A megyék KÖNYVEIBE (diocese_befizetes/kiadas/koltsegvetes, annual_reports)
 *   ez az oldal nem néz bele — azoknak a policy-knak a kerületi ága 2026-08-16-án
 *   meg is szűnt, tehát 0 sort adnának.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AMI NINCS BEKÜLDVE, AZ LÁTHATÓAN HIÁNYZIK
 * ────────────────────────────────────────────────────────────────────────────
 * Mindkét rekesz a HATÓKÖR TELJES listájából épül (gyülekezetek, illetve
 * egyházmegyék törzsadata), nem a beérkezett iratokból. Egy „kerek" archívum,
 * amiben csak a beérkezett iratok szerepelnek, elrejtené, hogy fél kerület
 * semmit sem küldött — pontosan ez volt a dokumentumközpont teljességi
 * mátrixának eredeti tanulsága (diagnosztika #7).
 *
 * ⚠️ Egyetlen kivétel a „hiány" feliratozásában: a KÖLTSÉGVETÉS-MÓDOSÍTÁS.
 *    Abból nulla is lehet szabályos (nem volt módosítás), ezért ott a hiány
 *    „Nincs módosítás" — semleges tény —, nem pedig mulasztásra utaló hiány.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HATÓKÖR — FAIL-CLOSED
 * ────────────────────────────────────────────────────────────────────────────
 * Belépő-kapu: `canReadDistrictScope` (a kerületi SZÁMVEVŐ is bejut, ellenőri
 * nézetben — a fagyasztott iratok megtekintése épp az ő munkaeszköze). A
 * listaszűrés a szerep-szűrt `resolveDistrictReadScopeIds` (az adatbázis
 * `current_user_district_olvaso_ids()` tükre). Feloldható hatókör nélkül
 * MAGYARÁZÓ KÁRTYA áll itt — SOHA nem szűretlen, más kerület iratait is mutató
 * lista. A szűretlen ág kizárólag a feliratozott rendszergazdai/master nézet.
 */
export default async function KeruletiIratokPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDistrictScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  const districtIds = resolveDistrictReadScopeIds(access)
  const isSystemAdmin = !!access.admin || !!access.master
  if (districtIds.length === 0 && !isSystemAdmin) return <MissingDistrictScopeNotice />
  // Szűretlen ág KIZÁRÓLAG a feliratozott rendszergazdai/master nézetnek, és
  // csak akkor, ha nincs saját kerület-hatóköre — soha nem egy NULL-scope néma
  // mellékhatásaként.
  const mindenKerulet = isSystemAdmin && districtIds.length === 0
  const districtId = districtIds[0] ?? null

  // A kerület egyházmegyéi (TÖRZSADAT) — ebből látszik, MELYIK megye nem
  // küldött semmit. A hibát NEM nyeljük el: ha a lekérdezés elszáll, a
  // `megyek = []` üres lista azt hazudná, hogy nincs egyházmegye a kerületben.
  let megyeQuery = access.supabase.from('dioceses').select('id, name').order('name')
  if (!mindenKerulet) megyeQuery = megyeQuery.in('district_id', districtIds)

  // A két rekesz adata PÁRHUZAMOSAN — a két forrás független egymástól, a
  // sorosítás csak várakozás lenne a felhasználónak.
  const [gyulekezeti, megyeiAdat, megyeValasz] = await Promise.all([
    // `years: null` = explicit „minden év": az irattár lényege épp az évek
    // egymásutánja. A jsonb-pillanatképek NEM utaznak a listával.
    getSubmissionMatrix('district', { years: null }),
    // Év nélkül hívva MINDEN év felterjesztése jön (a fogadó posta ezzel
    // szemben a beszámolási szezon évére szűk — ott az a helyes).
    getKeruletiFelterjesztesek(),
    megyeQuery,
  ])

  const megyek = ((megyeValasz.data || []) as Array<{ id: string; name: string | null }>).map(
    (m) => ({ id: m.id, nev: formatEgyhazmegyeNev(m.name) || 'Ismeretlen egyházmegye' }),
  )
  const megyekHiba = megyeValasz.error
    ? 'Az egyházmegyék törzsadata (neve, besorolása) most nem olvasható, ezért előfordulhat, ' +
      'hogy nem minden egyházmegye látszik a felterjesztések között. Ez NEM azt jelenti, hogy ' +
      'nincs egyházmegye rendelve az egyházkerülethez — az adat beolvasása hiúsult meg. ' +
      'Frissítsd az oldalt, és ha ez megmarad, jelezd a rendszergazdának.'
    : null

  // Hero-név: a SAJÁT hatókör elsődleges kerülete a `districts` táblából — nem
  // egy beérkezett irat sorából kitalálva (az rendszergazdai nézetben akár a
  // MÁSIK kerület nevét is adhatná). A hibát itt is kimondjuk: a semleges
  // „Egyházkerület" felirat azt sugallná, hogy minden rendben van.
  let districtNev: string | null = null
  let districtNevOlvashatatlan = false
  if (districtId) {
    const { data, error } = await access.supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    if (error) districtNevOlvashatatlan = true
    else districtNev = (data as { name?: string | null } | null)?.name || null
  }

  const felterjesztesSorok = megyeiAdat.rows || []
  // Az „évfolyam" a TÉNYLEGESEN beküldött évek száma — a `years` mezők az
  // év-választókhoz készülnek, és az aktuális évet akkor is tartalmazhatják, ha
  // abból még egyetlen irat sem érkezett; a hero-felirat abból túlmondana.
  const gyulekezetiEvek = new Set(gyulekezeti.submissions.map((s) => s.year)).size
  const gyulekezetiDb = gyulekezeti.totalCount ?? gyulekezeti.submissions.length
  const csakOlvas = !canWriteDistrictScope(access, districtId)

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard-kerulet"
        className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground max-sm:min-h-10"
      >
        <ArrowLeft className="size-4" />
        Vissza az egyházkerületi irányítópultra
      </Link>

      <ScopeHero
        eyebrow="Egyházkerületi irattár"
        title="Beérkezett hivatalos iratok"
        description={
          'Az egyházkerülethez hivatalosan beérkezett iratok egy helyen, évekre visszamenőleg: ' +
          'a gyülekezetek véglegesített és továbbított iratai, valamint az egyházmegyék saját ' +
          'felterjesztései. A kerület kizárólag ezeket a lezárt, fagyasztott iratokat látja — ' +
          'a gyülekezetek és az egyházmegyék könyveibe nem néz bele.'
        }
        chips={[
          districtNev ||
            (mindenKerulet
              ? 'Rendszergazdai összesített nézet'
              : districtNevOlvashatatlan
                ? 'Egyházkerület — a neve most nem olvasható'
                : 'Egyházkerület'),
          `${megyek.length.toLocaleString('hu-HU')} egyházmegye`,
          `${gyulekezeti.congregations.length.toLocaleString('hu-HU')} gyülekezet`,
          `${gyulekezetiDb.toLocaleString('hu-HU')} gyülekezeti irat`,
          `${felterjesztesSorok.length.toLocaleString('hu-HU')} megyei felterjesztés`,
          gyulekezetiEvek > 0 ? `${gyulekezetiEvek} évfolyam` : 'Még nincs beküldött év',
          csakOlvas ? 'Ellenőri (számvevői) nézet — csak megtekintés' : '',
        ].filter(Boolean)}
      />

      {/* ═══ 1. REKESZ — A GYÜLEKEZETEK IRATAI ═══════════════════════════ */}
      <section className="space-y-4">
        <RekeszFejlec
          ikon={<Building2 className="size-5 text-teal-600 dark:text-teal-300" />}
          cimke="1. rekesz"
          cim="A gyülekezetek beküldött iratai"
          leiras={
            'A gyülekezetek által véglegesített iratok — számadás, költségvetés és módosításai, ' +
            'vagyonleltári jelentés, választók névjegyzéke, lelkészi jelentés —, amelyeket az ' +
            'illetékes egyházmegye ellenőrzött és továbbított az egyházkerületnek. Az irat gazdája ' +
            'a gyülekezet, a javítás útja a gyülekezet és az egyházmegye között vezet.'
          }
        />
        {/* A MEGYEI archívum-nézet, `level="district"`-tel: ugyanaz a hat
            irat-típus, ugyanaz a pillanatkép-néző. A `level` load-bearing — a
            `getSubmissionSnapshot` ebből dönti el, melyik szint jogosultságát
            ellenőrizze; 'diocese'-zal a kerületi felhasználó minden pillanatképre
            „Nincs jogosultsága" hibát kapna. */}
        <DioceseArchivumView data={gyulekezeti} level="district" />
      </section>

      {/* ═══ 2. REKESZ — AZ EGYHÁZMEGYÉK FELTERJESZTÉSEI ═════════════════ */}
      <section className="space-y-4">
        <RekeszFejlec
          ikon={<Landmark className="size-5 text-violet-600 dark:text-violet-300" />}
          cimke="2. rekesz"
          cim="Az egyházmegyék felterjesztései"
          leiras={
            'Az egyházmegyék SAJÁT hivatalos iratai — számvevői összesítő, megyei számadás, ' +
            'megyei költségvetés és annak módosításai —, amelyeket az esperesi hivatal ' +
            'véglegesítés után küldött fel. Ezeknek az iratoknak a gazdája az egyházmegye, a ' +
            'címzettje pedig közvetlenül az egyházkerület.'
          }
        />
        <FelterjesztesArchivum
          sorok={felterjesztesSorok}
          megyek={megyek}
          megyekHiba={megyekHiba}
          evek={megyeiAdat.years || []}
          scopeNotice={megyeiAdat.scopeNotice}
          hiba={megyeiAdat.error}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

/**
 * A `getKeruletiFelterjesztesek` egy sora — a szerver-akció visszatérési
 * típusából SZÁRMAZTATVA.
 *
 * MIÉRT NEM `import type { KeruletiFelterjesztesSor }`: az akció-fájl
 * `'use server'`, és a repó bevett iránya, hogy a típusai előbb-utóbb átköltöznek
 * egy `*-shared.ts`-be (lásd `document-shared.ts`, `osszesito-shared.ts`). A
 * származtatott alak a KÖLTÖZTETÉST is túléli, a mezőnév-változást viszont
 * azonnal fordítási hibává teszi — nem néma, üres oszloppá.
 */
type FelterjesztesSor = Awaited<ReturnType<typeof getKeruletiFelterjesztesek>>['rows'][number]

/** A négy irat MEGJELENÍTÉSI sorrendje — a hivatali út sorrendje, betűre úgy,
 *  ahogy a kerületi fogadó felület (felterjesztes-fogado.tsx) mutatja. */
const TIPUS_SORREND: DioceseFelterjesztesTipus[] = [
  'szamvevoi_osszesito',
  'megyei_szamadas',
  'megyei_koltsegvetes',
  'megyei_koltsegvetes_modositas',
]

/**
 * Az állapot HANGULATÁHOZ tartozó jelvény-színek.
 *
 * A feliratot és a hangulatot NEM itt döntjük el, hanem a közös, tiszta magban
 * (`felterjesztesAllapotSzoveg`) — így ugyanarra az iratra a megyei kártya, a
 * kerületi posta és ez az irattár ugyanazt mondja. Itt csak a token-alapú szín
 * kerül hozzá (sötét módban is olvashatóan).
 */
const HANGULAT_OSZTALY: Record<'semleges' | 'folyamatban' | 'kesz' | 'figyelem', string> = {
  // A hiány az irattárban FIGYELMEZTETÉS értékű (nem szürke semmi), ezért
  // borostyán — pontosan úgy, ahogy a fogadó felület „Nincs felküldve" jelvénye.
  semleges:
    'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30',
  folyamatban:
    'bg-sky-50 text-sky-800 ring-sky-600/25 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30',
  kesz:
    'bg-emerald-50 text-emerald-800 ring-emerald-600/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  figyelem:
    'bg-rose-50 text-rose-800 ring-rose-600/25 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30',
}

function RekeszFejlec({
  ikon,
  cimke,
  cim,
  leiras,
}: {
  ikon: React.ReactNode
  cimke: string
  cim: string
  leiras: string
}) {
  return (
    <div className="card-raised rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-muted/50 p-2">{ikon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {cimke}
          </p>
          <h2 className="font-heading text-lg text-foreground">{cim}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{leiras}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * A MEGYEI felterjesztések archívuma: évenként egy táblázat, soronként egy
 * egyházmegye, oszloponként a négy irat-típus.
 *
 * MIÉRT SZERVEREN RENDERELT, MŰVELETI GOMBOK NÉLKÜL: az átvétel, a
 * visszaküldés és a feloldás-kérelmek elbírálása a kerületi POSTA felülete
 * (`/dashboard-kerulet/felterjesztesek`, S3) — ott van hozzá a párbeszédablak,
 * az indoklás-ellenőrzés és a pillanatkép-néző. Ha ugyanazok a gombok itt is
 * megjelennének, két helyen kellene ugyanazt a munkafolyamatot karbantartani,
 * és a lelkész sem tudná, melyik az „igazi". Az irattár szerepe MÁS: mit
 * küldött fel egy megye ÉVEKRE visszamenőleg, és mi hiányzik.
 *
 * A KÖLTSÉGVETÉS-MÓDOSÍTÁS cellában a LEGUTOLSÓ módosítás állapota látszik (a
 * sorszámával együtt) — a megyei összesítő 4. szabálya szerint az az érvényes.
 */
function FelterjesztesArchivum({
  sorok,
  megyek,
  megyekHiba,
  evek,
  scopeNotice,
  hiba,
}: {
  sorok: FelterjesztesSor[]
  megyek: Array<{ id: string; nev: string }>
  megyekHiba: string | null
  evek: number[]
  scopeNotice: string | null
  hiba?: string
}) {
  // Az ÉVEK a teljes archívumból (a szerver `years` mezője) ÉS a betöltött
  // sorokból — unióban, hogy egyik forrás csonkulása se tüntessen el évfolyamot.
  const evLista = [...new Set([...(evek || []), ...sorok.map((s) => s.year)])]
    .filter((e) => Number.isFinite(e))
    .sort((a, b) => b - a)

  // Sor-index: év + megye + irat-típus → a MÉRVADÓ felterjesztés.
  // Költségvetés-módosításnál a legnagyobb sorszámú (döntetlennél a később
  // felküldött) számít mérvadónak.
  const cellak = new Map<string, FelterjesztesSor>()
  for (const s of sorok) {
    const kulcs = `${s.year}::${s.dioceseId}::${s.docType}`
    const elozo = cellak.get(kulcs)
    const ujabb =
      !elozo ||
      s.modificationNumber > elozo.modificationNumber ||
      (s.modificationNumber === elozo.modificationNumber &&
        (s.submittedAt || '') > (elozo.submittedAt || ''))
    if (ujabb) cellak.set(kulcs, s)
  }

  // ÁRVA SOROK: olyan felterjesztés, amelynek a megyéje nincs a törzsadat-
  // listában (a törzsadat-lekérdezés hibázott, vagy a megyét időközben átsorolták
  // egy másik kerülethez). Az irat ATTÓL MÉG BEÉRKEZETT — ha csak a törzsadatból
  // építenénk a sorokat, ez az irat NÉMÁN eltűnne az irattárból.
  const ismertMegye = new Set(megyek.map((m) => m.id))
  const arvaMegyek = new Map<string, string>()
  for (const s of sorok) {
    if (ismertMegye.has(s.dioceseId)) continue
    if (!arvaMegyek.has(s.dioceseId)) {
      arvaMegyek.set(s.dioceseId, formatEgyhazmegyeNev(s.dioceseName) || 'Ismeretlen egyházmegye')
    }
  }
  const megyeSorok = [
    ...megyek.map((m) => ({ ...m, arva: false })),
    ...[...arvaMegyek].map(([id, nev]) => ({ id, nev, arva: true })),
  ]

  return (
    <div className="space-y-4">
      {/* FAIL-CLOSED hibasáv — a hibát SOHA nem „nincs felterjesztés" képként
          mutatjuk: az arra bírná a kerületet, hogy azt higgye, a megyék nem
          küldtek fel semmit. */}
      {hiba && <Figyelmezteto szoveg={hiba} />}
      {megyekHiba && <Figyelmezteto szoveg={megyekHiba} />}
      {scopeNotice && (
        <p className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
          {scopeNotice}
        </p>
      )}

      <p className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Az irattár a felterjesztések ÁLLAPOTÁT mutatja évekre visszamenőleg. Egy irat
          megnyitásához, az átvétel visszaigazolásához, a javításra visszaküldéshez és a
          feloldás-kérelmek elbírálásához nyisd meg a{' '}
          <Link
            href="/dashboard-kerulet/felterjesztesek"
            className="font-medium text-foreground underline underline-offset-2"
          >
            kerületi postát
          </Link>
          . A költségvetés-módosításnál a legutolsó módosítás állapota látszik — a korábbiakat a
          posta sorolja fel egyenként.
        </span>
      </p>

      {megyeSorok.length === 0 ? (
        <UresKartya
          szoveg={
            megyekHiba
              ? 'Az egyházmegyék listája most nem olvasható, ezért a felterjesztések táblázata nem építhető fel.'
              : 'Ehhez az egyházkerülethez nincs egyházmegye rendelve, ezért felterjesztés sem érkezhet.'
          }
        />
      ) : evLista.length === 0 ? (
        <UresKartya szoveg="Egyetlen egyházmegye sem terjesztett fel iratot az egyházkerülethez." />
      ) : (
        evLista.map((ev) => {
          const eviDb = sorok.filter((s) => s.year === ev && s.status !== 'draft').length
          return (
            <div key={ev} className="card-raised overflow-hidden rounded-2xl">
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                <p className="text-sm font-semibold text-foreground">{ev}. év</p>
                <span className="text-xs text-muted-foreground">
                  {eviDb.toLocaleString('hu-HU')} felküldött irat
                </span>
              </div>
              {/* A mátrix SAJÁT vízszintes görgetőben — az oldal törzse nem
                  görgethet oldalra (mobil-first követelmény). */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">
                        Egyházmegye
                      </th>
                      {TIPUS_SORREND.map((t) => (
                        <th
                          key={t}
                          className="p-2 text-left text-xs font-medium text-muted-foreground"
                        >
                          {FELTERJESZTES_LABELS[t]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {megyeSorok.map((m) => (
                      <tr key={m.id}>
                        <td className="p-2 align-top">
                          <p className="text-foreground">{m.nev}</p>
                          {m.arva && (
                            <p className="text-[11px] text-muted-foreground">
                              A törzsadatban most nem szerepel — az irata attól még beérkezett.
                            </p>
                          )}
                        </td>
                        {TIPUS_SORREND.map((t) => (
                          <td key={t} className="p-2 align-top">
                            <AllapotCella
                              sor={cellak.get(`${ev}::${m.id}::${t}`)}
                              tipus={t}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * Egy cella: a felterjesztés állapota — vagy a HIÁNY kimondása.
 *
 * A feliratot a KÖZÖS mag adja (`felterjesztesAllapotSzoveg`), a `tennivalo`
 * mezőjét viszont SZÁNDÉKOSAN nem írjuk ki: az a MEGYÉNEK szóló utasítás
 * („Véglegesítsd az iratot…"), a kerületi irattárban félrevezető lenne.
 */
function AllapotCella({
  sor,
  tipus,
}: {
  sor?: FelterjesztesSor
  tipus: DioceseFelterjesztesTipus
}) {
  // A költségvetés-módosításból a NULLA is szabályos: ott a hiány semleges tény,
  // nem mulasztás. Ezt külön mondjuk ki, hogy a kerület ne sürgessen olyan
  // iratot, ami sosem keletkezett.
  if (!sor && tipus === 'megyei_koltsegvetes_modositas') {
    return <span className="text-xs text-muted-foreground">Nincs módosítás</span>
  }

  const allapot = felterjesztesAllapotSzoveg(sor ?? null)
  const modositasSorszam =
    sor && tipus === 'megyei_koltsegvetes_modositas' && sor.modificationNumber > 0
      ? `${sor.modificationNumber}. módosítás`
      : null

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${HANGULAT_OSZTALY[allapot.hangulat]}`}
      >
        {allapot.cimke}
      </span>
      {modositasSorszam && (
        <p className="text-[11px] text-muted-foreground">{modositasSorszam}</p>
      )}
      {allapot.reszletek && (
        <p className="text-[11px] text-muted-foreground">{allapot.reszletek}</p>
      )}
      {/* A visszaküldés INDOKA a legfontosabb tény az iraton — enélkül az
          archívum csak annyit mondana, hogy „valami baj volt vele". */}
      {sor?.status === 'returned' && sor.returnedReason && (
        <p className="text-[11px] leading-snug text-rose-700 dark:text-rose-300">
          Indoklás: {sor.returnedReason}
        </p>
      )}
      {sor?.unlockRequested && (
        <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          Feloldás-kérelem függőben
        </p>
      )}
      {sor?.iktatoszam && (
        <p className="text-[11px] text-muted-foreground">Iktatószám: {sor.iktatoszam}</p>
      )}
    </div>
  )
}

function Figyelmezteto({ szoveg }: { szoveg: string }) {
  return (
    <div className="card-raised rounded-2xl border-amber-300/60 p-4 dark:border-amber-400/30">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">{szoveg}</p>
      </div>
    </div>
  )
}

function UresKartya({ szoveg }: { szoveg: string }) {
  return (
    <div className="card-raised rounded-2xl p-8 text-center">
      <Landmark className="mx-auto size-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">{szoveg}</p>
    </div>
  )
}

/**
 * FAIL-CLOSED üres állapot: kerületi szintű felhasználó, akinek NEM oldható fel
 * az egyházkerület-hatóköre (se aktív szerep, se `profile_roles` district sor,
 * se `profiles.district_id`). Ilyenkor SOHA nem mutatunk „minden kerület"
 * listát — az más kerületek gyülekezeteinek és egyházmegyéinek hivatalos
 * iratait szivárogtatná.
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
              Az egyházkerületi irattár csak akkor tud iratot mutatni, ha a szerepköréhez konkrét
              egyházkerület tartozik. Jelenleg a fiókjához nem sikerült egyházkerületet feloldani,
              ezért — a gyülekezetek és az egyházmegyék hivatalos iratainak védelme érdekében — nem
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
