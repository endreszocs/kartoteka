'use client'

/**
 * SZERVEZETI TÉRKÉP — a megye gyülekezeteinek anya→leány képe (2026-08-25).
 *
 * MIT MUTAT: anya-csoportokat (anyaegyházközség / missziói egyházközség /
 * társegyházközség), alattuk behúzva a hozzájuk KAPCSOLT leányegyházközségeket
 * (önálló kartoték, saját sorral az RPC-ben) és a kartotékán BELÜLI egységeket
 * (leány/szórvány/egyházrész címkék a `gyulekezeti_egysegek` táblából). Az
 * önálló (kapcsolat nélküli) anyák egyszerű kártyasorban állnak.
 *
 * ADATFORRÁS-HATÁR (ALAPELV 2026-04-17): kizárólag a `gyulekezeti_hierarchia()`
 * RPC sorai (szervezet + lelkész-nevek) + a már engedélyezett
 * `congregationOverview` (a beküldött választók névjegyzékének létszáma).
 * A `letszam_elo` a megyei hívónak az RPC-ben SZÁNDÉKOSAN NULL — élő
 * tagnyilvántartási számot ez a felület NEM mutat, és nem is mutat helyette
 * hamis nullát: a hiányzó számot ELHAGYJA.
 *
 * NÉGY ÁLLAPOT, NÉGY KÜLÖN KÉP (soha nem néma üres lista):
 * hiba ≠ hiányzó migráció ≠ nincs hatókör ≠ tényleg üres.
 */

import { AlertTriangle, Building2, MapPinned } from 'lucide-react'

import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import {
  EGYSEG_TIPUS_CIMKEK,
  SZERVEZETI_TIPUS_CIMKEK,
  type EgysegTipus,
  type HierarchiaEgyseg,
  type HierarchiaSor,
  type SzervezetiTipus,
  type SzervezetTerkepEredmeny,
} from '@/lib/gyulekezet/egysegek-shared'
import type { CongregationDetail } from './congregation-detail-modal'

/**
 * Típus → jelvény-hangulat. A színek jelentést hordoznak, és a felül lévő
 * jelmagyarázat ugyanebből a leképezésből épül — a kettő nem húzhat szét.
 *
 * ⚠️ A StatusBadge-nek nincs teal intentje — a társegyházközség (és az
 *    egyházrész) teal színe `className`-felülírással érvényesül, dark párral.
 *    A leképezés a kerületi oldal (dashboard-kerulet/szervezet/page.tsx)
 *    leképezésével BETŰRE azonos.
 */
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

interface DioceseSzervezetPanelProps {
  data: SzervezetTerkepEredmeny
  /**
   * A megyei áttekintő (engedélyezett adatforrás) sorai — ebből jön a
   * VÁLASZTÓI létszám (a beküldött választók névjegyzékéből). Ha nincs átadva,
   * a térkép létszám nélkül, akkor is teljes értékűen renderel.
   */
  congregationOverview?: CongregationDetail[]
}

export function DioceseSzervezetPanel({
  data,
  congregationOverview,
}: DioceseSzervezetPanelProps) {
  // ── 1. állapot: hiányzó migráció — a felület a teendőt mondja ki ─────────
  if (data.rpcHianyzik) {
    return (
      <Figyelmezteto
        cim="A szervezeti térkép adatforrása még nincs telepítve"
        szoveg={
          data.error ||
          'Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd frissítse az oldalt.'
        }
      />
    )
  }

  // ── 2. állapot: nincs feloldható hatókör (fail-closed) ───────────────────
  if (data.nincsHatokor) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm leading-relaxed text-muted-foreground">
        {data.error ||
          'Nem sikerült egyházmegye-hatókört feloldani a fiókodhoz, ezért a szervezeti térkép nem jeleníthető meg.'}
      </div>
    )
  }

  // ── 3. állapot: hiba — SOHA nem üres listaként ───────────────────────────
  if (data.error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 dark:border-rose-900 dark:bg-rose-950/30">
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
          A szervezeti térkép betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{data.error}</p>
        <p className="mt-2 text-xs text-rose-700/80 dark:text-rose-300/80">
          Ez nem azt jelenti, hogy nincs gyülekezet — csak azt, hogy most nem tudtuk
          lekérdezni. Frissítsd az oldalt, és ha újra ezt írja, jelezd a rendszergazdának.
        </p>
      </div>
    )
  }

  const sorok = data.sorok ?? []

  // ── 4. állapot: tényleg üres ─────────────────────────────────────────────
  if (sorok.length === 0) {
    return (
      <div className="card-raised p-10 text-center">
        <MapPinned className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">
          Ebben a hatókörben még nincs rögzített gyülekezet.
        </p>
      </div>
    )
  }

  // Választói létszám a beküldött névjegyzékből (engedélyezett megyei adat).
  const valasztok = new Map<string, number | null>(
    (congregationOverview ?? []).map((c) => [c.congregationId, c.voterCount]),
  )

  // ── Csoportosítás: anyák + a hozzájuk kapcsolt leányok ───────────────────
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

  // ÁRVA leány: az anyja nem esik a látható hatókörbe (pl. másik egyházmegye).
  // NEM tüntetjük el némán — önálló kártyaként áll, kimondott magyarázattal.
  const lathatoAnyaIds = new Set(anyak.map((a) => a.congregation_id))
  const arvaLeanyok = kapcsoltLeanyok.filter(
    (l) => !l.anya_congregation_id || !lathatoAnyaIds.has(l.anya_congregation_id),
  )

  const csoportosAnyak = anyak.filter(
    (a) =>
      (leanyokAnyankent.get(a.congregation_id)?.length ?? 0) > 0 ||
      (a.egysegek?.length ?? 0) > 0,
  )
  const onalloAnyak = anyak.filter((a) => !csoportosAnyak.includes(a))

  return (
    <div className="space-y-5">
      {/* Magyarázat + jelmagyarázat */}
      <div className="card-raised p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
            <MapPinned className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Az egyházmegye gyülekezeteinek szervezeti képe: az anyaegyházközségek, a
              hozzájuk kapcsolt leányegyházközségek, a kartotékon belüli egységek
              (leány/szórvány/egyházrész) és a szolgáló lelkészek. A választói létszám a
              beküldött választók névjegyzékéből származik — ahol nincs beküldve, ott nem
              mutatunk számot.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
          </div>
        </div>
      </div>

      {/* Anya-csoportok (van leányuk és/vagy egységük) */}
      {csoportosAnyak.length > 0 && (
        <div className="space-y-4">
          {csoportosAnyak.map((anya) => (
            <AnyaCsoportKartya
              key={anya.congregation_id}
              anya={anya}
              leanyok={leanyokAnyankent.get(anya.congregation_id) ?? []}
              valasztok={valasztok}
            />
          ))}
        </div>
      )}

      {/* Önálló anyák — egyszerű kártyasor (mobilon egy oszlop) */}
      {onalloAnyak.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Önálló egyházközségek
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {onalloAnyak.map((s) => (
              <GyulekezetKartya key={s.congregation_id} sor={s} valasztok={valasztok} />
            ))}
          </div>
        </section>
      )}

      {/* Árva leányok — az anyjuk nem látható ebben a hatókörben */}
      {arvaLeanyok.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Kapcsolt leányegyházközségek, amelyek anyaegyházközsége nem ebben az
            egyházmegyében van
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {arvaLeanyok.map((s) => (
              <GyulekezetKartya key={s.congregation_id} sor={s} valasztok={valasztok} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

/** Egy anya-csoport: anya-kártya, alatta behúzva a leányok és az egységek. */
function AnyaCsoportKartya({
  anya,
  leanyok,
  valasztok,
}: {
  anya: HierarchiaSor
  leanyok: HierarchiaSor[]
  valasztok: Map<string, number | null>
}) {
  const egysegek = anya.egysegek ?? []
  return (
    <div className="card-raised overflow-hidden">
      {/* Anya-fejléc */}
      <div className="flex flex-wrap items-start gap-3 border-b border-border bg-muted/30 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
          <Building2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-base text-foreground">{anya.name}</p>
            <StatusBadge
              intent={TIPUS_META[anya.szervezeti_tipus]?.intent ?? 'neutral'}
              className={TIPUS_META[anya.szervezeti_tipus]?.className}
            >
              {SZERVEZETI_TIPUS_CIMKEK[anya.szervezeti_tipus] ?? anya.szervezeti_tipus}
            </StatusBadge>
          </div>
          <MetaSor sor={anya} valasztok={valasztok} />
        </div>
      </div>

      {/* Behúzott tartalom: kapcsolt leányok + belső egységek */}
      <div className="space-y-1 p-3 pl-5 sm:pl-8">
        {leanyok.map((l) => (
          <AgSor key={l.congregation_id}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{l.name}</p>
                <StatusBadge
                  intent={TIPUS_META[l.szervezeti_tipus]?.intent ?? 'neutral'}
                  className={TIPUS_META[l.szervezeti_tipus]?.className}
                >
                  {SZERVEZETI_TIPUS_CIMKEK[l.szervezeti_tipus] ?? l.szervezeti_tipus}
                </StatusBadge>
              </div>
              <MetaSor sor={l} valasztok={valasztok} />
            </div>
          </AgSor>
        ))}
        {egysegek.map((e) => (
          <AgSor key={e.id}>
            <EgysegTartalom egyseg={e} />
          </AgSor>
        ))}
        {leanyok.length === 0 && egysegek.length === 0 && (
          <p className="py-1 text-xs text-muted-foreground">Nincs kapcsolt egység.</p>
        )}
      </div>
    </div>
  )
}

/** Behúzott ág-sor a csoport-kártyán belül (vizuális „fa-ág"). */
function AgSor({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border-l-2 border-border py-2 pl-3">
      {children}
    </div>
  )
}

/**
 * Egy kartotékon BELÜLI egység sora. A létszám megyei nézetben NEM elérhető
 * (az RPC nem adja) — ilyenkor a szám ELMARAD, nem hamis 0 áll a helyén.
 */
function EgysegTartalom({ egyseg }: { egyseg: HierarchiaEgyseg }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-foreground">{egyseg.nev}</p>
        <StatusBadge
          intent={EGYSEG_META[egyseg.tipus]?.intent ?? 'neutral'}
          className={EGYSEG_META[egyseg.tipus]?.className}
        >
          {EGYSEG_TIPUS_CIMKEK[egyseg.tipus] ?? egyseg.tipus}
        </StatusBadge>
        {!egyseg.aktiv && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Inaktív
          </span>
        )}
        {typeof egyseg.letszam === 'number' && (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium tabular-nums text-teal-800 dark:bg-teal-400/10 dark:text-teal-300">
            {egyseg.letszam.toLocaleString('hu-HU')} fő
          </span>
        )}
      </div>
    </div>
  )
}

/** Lelkész-név + választói létszám (ha ismert) egy gyülekezet-sor alá. */
function MetaSor({
  sor,
  valasztok,
}: {
  sor: HierarchiaSor
  valasztok: Map<string, number | null>
}) {
  const valasztoDb = valasztok.get(sor.congregation_id)
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        {sor.lelkesz_nevek
          ? `Lelkész: ${sor.lelkesz_nevek}`
          : 'Nincs regisztrált lelkész'}
      </span>
      {typeof valasztoDb === 'number' && (
        <span
          className="rounded-full bg-violet-50 px-2 py-0.5 font-medium tabular-nums text-violet-800 dark:bg-violet-400/10 dark:text-violet-300"
          title="Választók száma a beküldött névjegyzékből"
        >
          {valasztoDb.toLocaleString('hu-HU')} választó
        </span>
      )}
    </p>
  )
}

/** Önálló (vagy árva) gyülekezet egyszerű kártyája. */
function GyulekezetKartya({
  sor,
  valasztok,
}: {
  sor: HierarchiaSor
  valasztok: Map<string, number | null>
}) {
  return (
    <div className="card-raised p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-muted/50 p-2">
          <Building2 className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{sor.name}</p>
            <StatusBadge
              intent={TIPUS_META[sor.szervezeti_tipus]?.intent ?? 'neutral'}
              className={TIPUS_META[sor.szervezeti_tipus]?.className}
            >
              {SZERVEZETI_TIPUS_CIMKEK[sor.szervezeti_tipus] ?? sor.szervezeti_tipus}
            </StatusBadge>
          </div>
          <MetaSor sor={sor} valasztok={valasztok} />
          {sor.anya_congregation_id && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Anyaegyházközsége nem ebben a nézetben szerepel (más egyházmegyéhez
              tartozik).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Figyelmezteto({ cim, szoveg }: { cim: string; szoveg: string }) {
  return (
    <div className="card-raised border-amber-300/60 p-4 sm:p-5 dark:border-amber-400/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{cim}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            {szoveg}
          </p>
        </div>
      </div>
    </div>
  )
}
