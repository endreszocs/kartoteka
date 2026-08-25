import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  MapPinned,
  TriangleAlert,
} from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import {
  EGYSEG_TIPUS_CIMKEK,
  SZERVEZETI_TIPUS_CIMKEK,
  type EgysegTipus,
  type HierarchiaSor,
  type SzervezetiTipus,
} from '@/lib/gyulekezet/egysegek-shared'

/**
 * EGYHÁZKERÜLETI SZERVEZETI TÉRKÉP — `/dashboard-kerulet/szervezet`
 * (2026-08-25, gyülekezeti egységek kör).
 *
 * MIT MUTAT: a kerület gyülekezeteinek szervezeti képét EGYHÁZMEGYÉNKÉNT
 * csoportosítva — anya-, missziói és társegyházközségek, a hozzájuk kapcsolt
 * leányegyházközségek, a kartotékon belüli egységek (leány/szórvány/egyházrész),
 * a szolgáló lelkészek neve és az élő létszám.
 *
 * ADATFORRÁS-HATÁR (Endre K4 döntése, 2026-08-16): a kerület a gyülekezetek
 * belső adatait nem olvassa. Ez az oldal EGYETLEN adatforrásból dolgozik: a
 * `gyulekezeti_hierarchia()` SECURITY DEFINER RPC-ből
 * (migration-docs/sql/2026-08-25-gyulekezeti-egysegek.sql), amely maga
 * hatókör-szűr (kerületi szerep → a saját kerület), és a kerületi hívónak a
 * `letszam_elo` oszlopban AGGREGÁLT darabszámot ad — pontosan azon a
 * precedensen, amelyen a `district_member_counts()` (2026-08-11) már ma is:
 * a kerület összesített létszámot láthat, tagnyilvántartási sort soha.
 * `NULL` létszámnál „—" áll, „nincs adat" magyarázattal — nem hamis nulla.
 *
 * HATÓKÖR — FAIL-CLOSED (a /dashboard-kerulet kapu-mintája betűre):
 * belépő-kapu a `canReadDistrictScope` (a kerületi SZÁMVEVŐ is bejut, ellenőri
 * nézetben), a listaszűrés a szerep-szűrt `resolveDistrictReadScopeIds` (az
 * adatbázis `current_user_district_olvaso_ids()` tükre) — az RPC hatókörén
 * belül is METSZET, soha nem tágítás. Feloldható hatókör nélkül magyarázó
 * kártya áll itt; a szűretlen ág KIZÁRÓLAG a feliratozott rendszergazdai/
 * master nézet (showAllDistricts), soha nem NULL-scope néma mellékhatása.
 */

/** Típus → jelvény-hangulat — a megyei panel (diocese-szervezet-panel.tsx)
 *  leképezésével BETŰRE azonos, hogy a két szint ugyanazt a nyelvet beszélje.
 *  A StatusBadge-nek nincs teal intentje: a társegyházközség (és az egyházrész)
 *  teal színe `className`-felülírással érvényesül, dark párral. */
const TEAL_JELVENY =
  'bg-teal-50 text-teal-700 ring-teal-600/25 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-400/30'

const TIPUS_META: Record<SzervezetiTipus, { intent: StatusIntent; className?: string }> = {
  anya: { intent: 'info' },
  leany: { intent: 'success' },
  misszioi: { intent: 'warning' },
  tars: { intent: 'neutral', className: TEAL_JELVENY },
}

const EGYSEG_META: Record<EgysegTipus, { intent: StatusIntent; className?: string }> = {
  leany: { intent: 'success' },
  szorvany: { intent: 'neutral' },
  // Az egyházrész a társegyházközség színnyelvét viseli.
  egyhazresz: { intent: 'neutral', className: TEAL_JELVENY },
}

/** Hiányzó RPC felismerése (PGRST202 / 42883 / proxy-átírt szövegek). */
const HIANYZO_RPC_MINTA = /could not find|does not exist|schema cache/i

function rpcHianyzikE(error: { code?: string; message: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    HIANYZO_RPC_MINTA.test(error.message || '')
  )
}

export default async function KeruletiSzervezetPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDistrictScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  // SZEREP-SZŰRT olvasási hatókör — az RLS tükre (lásd a fejléc-docblockot).
  const districtIds = resolveDistrictReadScopeIds(access)
  const isSystemAdmin = !!access.admin || !!access.master
  if (districtIds.length === 0 && !isSystemAdmin) return <MissingDistrictScopeNotice />
  // Szűretlen ág KIZÁRÓLAG a feliratozott rendszergazdai/master nézetnek.
  const showAllDistricts = isSystemAdmin && districtIds.length === 0
  const districtId = districtIds[0] ?? null

  // Hero-név a `districts` táblából — nem egy adat-sorból kitalálva.
  let districtName: string | null = null
  if (districtId) {
    const { data: dr } = await access.supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    districtName = (dr as { name?: string | null } | null)?.name || null
  }

  // ── AZ EGYETLEN ADATFORRÁS: a hatókör-szűrt RPC ──────────────────────────
  const { data, error } = await access.supabase.rpc('gyulekezeti_hierarchia')

  const rpcHianyzik = !!error && rpcHianyzikE(error)
  const hiba =
    error && !rpcHianyzik
      ? `A szervezeti térkép betöltése sikertelen: ${error.message}`
      : null

  const osszesSor = (Array.isArray(data) ? data : []) as HierarchiaSor[]
  // App-oldali METSZET az RPC hatókörén belül (soha nem tágítás): kerületi
  // hívónál a szerep-szűrt kerület-listára, rendszergazdánál szűretlen.
  const sorok = showAllDistricts
    ? osszesSor
    : osszesSor.filter((s) => s.district_id !== null && districtIds.includes(s.district_id))

  // ── Egyházmegyénkénti csoportosítás (az RPC megye+név szerint rendez) ────
  const megyek = new Map<string, { nev: string; sorok: HierarchiaSor[] }>()
  for (const s of sorok) {
    const kulcs = s.diocese_id ?? '—'
    const bejegyzes = megyek.get(kulcs) ?? {
      nev:
        formatEgyhazmegyeNev(s.diocese_name) ||
        'Egyházmegyéhez nem sorolt gyülekezetek',
      sorok: [],
    }
    bejegyzes.sorok.push(s)
    megyek.set(kulcs, bejegyzes)
  }

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
        eyebrow="Egyházkerületi szervezeti térkép"
        title={
          districtName ||
          (showAllDistricts ? 'Rendszergazdai összesített nézet' : 'Egyházkerület')
        }
        description={
          'A kerület gyülekezeteinek szervezeti képe egyházmegyénként: anyaegyházközségek, ' +
          'a hozzájuk kapcsolt leányegyházközségek, a kartotékon belüli egységek és a szolgáló ' +
          'lelkészek. A létszám összesített darabszám — a kerület a tagnyilvántartás soraiba ' +
          'nem lát bele.'
        }
        chips={[
          showAllDistricts ? 'Rendszergazdai nézet: minden egyházkerület' : undefined,
          `${megyek.size.toLocaleString('hu-HU')} egyházmegye`,
          `${sorok.length.toLocaleString('hu-HU')} gyülekezet`,
        ].filter(Boolean) as string[]}
      />

      {/* ── Hiányzó migráció / hiba — SOHA nem néma üres lista ── */}
      {rpcHianyzik && (
        <Figyelmezteto
          szoveg={
            'A szervezeti térkép adatforrása még nincs telepítve az adatbázisban. ' +
            'Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd frissítse az oldalt.'
          }
        />
      )}
      {hiba && <Figyelmezteto szoveg={hiba} />}

      {/* Jelmagyarázat */}
      {!rpcHianyzik && !hiba && (
        <div className="card-raised flex flex-wrap items-center gap-2 rounded-2xl p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Jelmagyarázat:
          </span>
          {(Object.keys(TIPUS_META) as SzervezetiTipus[]).map((t) => (
            <StatusBadge
              key={t}
              intent={TIPUS_META[t].intent}
              className={TIPUS_META[t].className}
              dot
            >
              {SZERVEZETI_TIPUS_CIMKEK[t]}
            </StatusBadge>
          ))}
          <StatusBadge intent={EGYSEG_META.szorvany.intent} dot>
            {EGYSEG_TIPUS_CIMKEK.szorvany}
          </StatusBadge>
          <StatusBadge
            intent={EGYSEG_META.egyhazresz.intent}
            className={EGYSEG_META.egyhazresz.className}
            dot
          >
            {EGYSEG_TIPUS_CIMKEK.egyhazresz}
          </StatusBadge>
        </div>
      )}

      {!rpcHianyzik && !hiba && megyek.size === 0 && (
        <div className="card-raised rounded-2xl p-8 text-center">
          <MapPinned className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            Ebben a hatókörben még nincs rögzített gyülekezet.
          </p>
        </div>
      )}

      {/* ── Egyházmegyénkénti bontás (a DioceseBreakdown stílusa) ── */}
      {[...megyek.entries()].map(([megyeId, megye]) => (
        <MegyeSzakasz key={megyeId} nev={megye.nev} sorok={megye.sorok} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

/** Egy egyházmegye kártyája: fejléc + anya-csoportok divide-y sorokban. */
function MegyeSzakasz({ nev, sorok }: { nev: string; sorok: HierarchiaSor[] }) {
  // Csoportosítás: anyák + a hozzájuk kapcsolt leányok (a megyei panel logikája).
  const leanyokAnyankent = new Map<string, HierarchiaSor[]>()
  const anyak: HierarchiaSor[] = []
  const kapcsoltLeanyok: HierarchiaSor[] = []
  for (const s of sorok) {
    if (s.anya_congregation_id) {
      kapcsoltLeanyok.push(s)
      const lista = leanyokAnyankent.get(s.anya_congregation_id) ?? []
      lista.push(s)
      leanyokAnyankent.set(s.anya_congregation_id, lista)
    } else {
      anyak.push(s)
    }
  }
  // Árva leány (az anyja másik megyében / nem látható): saját sort kap,
  // kimondott magyarázattal — nem tűnik el némán.
  const lathatoAnyaIds = new Set(anyak.map((a) => a.congregation_id))
  const arvaLeanyok = kapcsoltLeanyok.filter(
    (l) => !l.anya_congregation_id || !lathatoAnyaIds.has(l.anya_congregation_id),
  )

  const osszLetszam = sorok.reduce<number | null>(
    (acc, s) =>
      typeof s.letszam_elo === 'number' ? (acc ?? 0) + s.letszam_elo : acc,
    null,
  )

  return (
    <div className="card-raised overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg text-foreground">{nev}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sorok.length.toLocaleString('hu-HU')} gyülekezet
            </p>
          </div>
          {osszLetszam !== null && (
            <p className="text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Élő létszám
              </span>
              <span className="font-heading text-xl tabular-nums text-foreground">
                {osszLetszam.toLocaleString('hu-HU')} fő
              </span>
            </p>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border">
        {anyak.map((anya) => (
          <AnyaCsoportSor
            key={anya.congregation_id}
            anya={anya}
            leanyok={leanyokAnyankent.get(anya.congregation_id) ?? []}
          />
        ))}
        {arvaLeanyok.map((l) => (
          <li key={l.congregation_id} className="px-4 py-3 sm:px-5">
            <GyulekezetSor sor={l} />
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Anyaegyházközsége nem ebben az egyházmegyében van.
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Egy anya-csoport sora: az anya, alatta behúzva a leányai és az egységei. */
function AnyaCsoportSor({
  anya,
  leanyok,
}: {
  anya: HierarchiaSor
  leanyok: HierarchiaSor[]
}) {
  const egysegek = anya.egysegek ?? []
  return (
    <li className="px-4 py-3 sm:px-5">
      <GyulekezetSor sor={anya} />
      {(leanyok.length > 0 || egysegek.length > 0) && (
        <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3 sm:pl-4">
          {leanyok.map((l) => (
            <GyulekezetSor key={l.congregation_id} sor={l} kicsi />
          ))}
          {egysegek.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-foreground">{e.nev}</p>
              <StatusBadge
                intent={EGYSEG_META[e.tipus]?.intent ?? 'neutral'}
                className={EGYSEG_META[e.tipus]?.className}
              >
                {EGYSEG_TIPUS_CIMKEK[e.tipus] ?? e.tipus}
              </StatusBadge>
              {!e.aktiv && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Inaktív
                </span>
              )}
              {typeof e.letszam === 'number' && <LetszamPirula ertek={e.letszam} />}
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

/** Egy gyülekezet sora: név + típus-jelvény + lelkész + létszám-pirula. */
function GyulekezetSor({ sor, kicsi }: { sor: HierarchiaSor; kicsi?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {!kicsi && <Building2 className="size-4 shrink-0 text-muted-foreground" />}
          <p
            className={
              kicsi
                ? 'text-sm font-medium text-foreground'
                : 'text-sm font-semibold text-foreground'
            }
          >
            {sor.name}
          </p>
          <StatusBadge
            intent={TIPUS_META[sor.szervezeti_tipus]?.intent ?? 'neutral'}
            className={TIPUS_META[sor.szervezeti_tipus]?.className}
          >
            {SZERVEZETI_TIPUS_CIMKEK[sor.szervezeti_tipus] ?? sor.szervezeti_tipus}
          </StatusBadge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {sor.lelkesz_nevek
            ? `Lelkész: ${sor.lelkesz_nevek}`
            : 'Nincs regisztrált lelkész'}
        </p>
      </div>
      <LetszamPirula ertek={sor.letszam_elo} />
    </div>
  )
}

/**
 * Létszám-pirula. `null` = „—", „nincs adat" magyarázattal — SOHA nem hamis
 * nulla (a hiányzó adat és a nulla fő két különböző tény).
 */
function LetszamPirula({ ertek }: { ertek: number | null | undefined }) {
  if (typeof ertek !== 'number') {
    return (
      <span
        className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
        title="nincs adat"
      >
        —
      </span>
    )
  }
  return (
    <span
      className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium tabular-nums text-teal-800 dark:bg-teal-400/10 dark:text-teal-300"
      title="Élő létszám (összesített darabszám)"
    >
      {ertek.toLocaleString('hu-HU')} fő
    </span>
  )
}

function Figyelmezteto({ szoveg }: { szoveg: string }) {
  return (
    <div className="card-raised rounded-2xl border-amber-300/60 p-4 dark:border-amber-400/30">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">{szoveg}</p>
      </div>
    </div>
  )
}

/**
 * FAIL-CLOSED üres állapot: kerületi szintű felhasználó feloldható
 * egyházkerület-hatókör nélkül — a /dashboard-kerulet mintájának analógja.
 * SOHA nem mutatunk „minden kerület" listát ebben az esetben.
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
              A szervezeti térkép csak akkor tud adatot mutatni, ha a szerepköréhez
              konkrét egyházkerület tartozik. Jelenleg a fiókjához nem sikerült
              egyházkerületet feloldani, ezért — a gyülekezetek adatainak védelme
              érdekében — nem jelenítünk meg listát.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a szerepköréhez a
              megfelelő egyházkerületet, vagy — ha több profilja van — váltson profilt a
              fejlécben.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
