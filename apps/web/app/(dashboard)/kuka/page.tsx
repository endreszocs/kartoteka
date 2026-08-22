import { redirect } from 'next/navigation'

import { ModuleHero } from '@/components/shared/module-hero'
import { RecycleBinViewClient } from '@/components/shared/recycle-bin-client'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  TABLE_REGISTRY,
  MODULE_META,
  type TableRegistryEntry,
} from '@/lib/offline/table-registry'

import { listDistrictDeletedRows, restoreDistrictRow } from './actions'

/**
 * Globális Kuka oldal — az összes modul törölt rekordjai egy helyen.
 *
 * A RecycleBinView componens reaktívan figyeli a Dexie-t (useLiveQuery),
 * így a sync-orchestrator által hozott server-side soft-delete-ek azonnal
 * megjelennek.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-08-22 (S7) — KÉT ÁG EGY OLDALON
 * ─────────────────────────────────────────────────────────────────────────
 * Ha a hívó EGYHÁZKERÜLETI hatókörben jár el, a Dexie-s felület használhatatlan:
 * a helyi másolatba SOHA nem kerül kerületi sor (a pull `congregation_id`-re
 * szűr). Ezért kerületi hatókörben egy SZERVER-OLDALON renderelt lista jön a
 * `listDistrictDeletedRows()`-ból, `<form action={restoreDistrictRow}>`
 * gombokkal — kliens-komponens és Dexie nélkül.
 *
 * ⚠️ A GYÜLEKEZETI (és a megyei) ÚT VÁLTOZATLAN: a `keruleti === false` ágon
 *    betűre ugyanaz a markup fut, mint korábban. A megyei szint megnyitása
 *    KÜLÖN döntés — a `listDistrictDeletedRows` szándékosan csak a `district`
 *    hatókörre mond `keruleti: true`-t.
 */

/** Rövid magyar dátum a törlés időpontjához. `null` bemenetre em-dash. */
function magyarDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export default async function KukaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  // A kerületi ág feloldása a KANONIKUS hatókör-feloldón át (a részletes MIÉRT
  // az `actions.ts`-ben). Nem kerületi hatókörben `{ keruleti: false }` jön, és
  // egyetlen lekérdezés sem fut le — a gyülekezeti út ettől nem lassul.
  const keruleti = await listDistrictDeletedRows()

  if (keruleti.keruleti) {
    const uzenetek = await searchParams
    const osszesen = keruleti.csoportok.reduce((n, cs) => n + cs.sorok.length, 0)

    return (
      <div className="space-y-5">
        <ModuleHero
          eyebrow="Kuka · Egyházkerület"
          title="Törölt kerületi tételek visszaállítása"
          description={
            'Itt az egyházkerület SAJÁT leltári és iktatói tételei találhatók, amelyeket törölték. ' +
            'Ezek nem a gyülekezetek adatai — azokat a gyülekezetek a saját kukájukban kezelik. ' +
            'A kerületi tételeket a rendszer NEM törli ki magától 30 nap után, tehát nyugodtan ' +
            'átnézheted őket, és bármelyiket visszahozhatod.'
          }
          pills={[
            {
              label: keruleti.keruletNev ?? 'Egyházkerület',
              tone: 'teal',
            },
            {
              label: `${osszesen} törölt tétel`,
              tone: osszesen > 0 ? 'amber' : 'neutral',
            },
          ]}
        />

        {uzenetek.success ? (
          <p className="card-raised border border-emerald-200 bg-emerald-50/80 p-4 text-sm font-semibold text-emerald-800">
            {uzenetek.success}
          </p>
        ) : null}
        {uzenetek.error ? (
          <p className="card-raised border border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
            {uzenetek.error}
          </p>
        ) : null}

        {/* Ellenőri (számvevői) nézet: olvashat, de nem állíthat vissza. */}
        {keruleti.olvasoiUzenet ? (
          <p className="card-raised border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
            {keruleti.olvasoiUzenet}
          </p>
        ) : null}

        {/*
          HIÁNYOS LISTA — soha nem ígérünk üres kukát, ha valamit nem tudtunk
          elolvasni. (A gyülekezeti Kuka 2026-08-11-es tanulsága: a megnyugtató
          üres-állapotból a lelkész azt olvasta ki, hogy az adat véglegesen
          elveszett.)
        */}
        {keruleti.hibasTablak.length > 0 ? (
          <p className="card-raised border border-red-200 bg-red-50/80 p-4 text-sm leading-6 text-red-700">
            Ezeket most nem sikerült beolvasni:{' '}
            <strong>{keruleti.hibasTablak.join(', ')}</strong>. A lista tehát
            HIÁNYOS — lehet, hogy van még visszaállítható tétel. Frissítsd az
            oldalt, és ha így marad, jelezd a rendszergazdának.
          </p>
        ) : null}

        {keruleti.csoportok.length === 0 && keruleti.hibasTablak.length === 0 ? (
          <div className="card-raised p-8 text-center text-sm text-slate-500">
            Az egyházkerület kukája üres — nincs visszaállítható törölt tétel.
          </div>
        ) : null}

        {keruleti.csoportok.map(csoport => (
          <section key={csoport.tabla} className="card-raised p-4 sm:p-5">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-lg text-slate-800">{csoport.cim}</h3>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {csoport.sorok.length} tétel
              </span>
            </header>

            <ul className="divide-y divide-slate-100">
              {csoport.sorok.map(sor => (
                <li
                  key={`${sor.tabla}:${sor.id}`}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {sor.cimke}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {sor.pontosDatum ? 'Törölve: ' : 'Törölve legkésőbb: '}
                      {magyarDatum(sor.toroltEkkor)}
                    </p>
                  </div>

                  {keruleti.irhat ? (
                    <form action={restoreDistrictRow} className="shrink-0">
                      <input type="hidden" name="tabla" value={sor.tabla} />
                      <input type="hidden" name="id" value={sor.id} />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 sm:w-auto"
                      >
                        Visszaállítás
                      </button>
                    </form>
                  ) : (
                    <span
                      className="shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-semibold text-slate-400 sm:text-left"
                      title={keruleti.olvasoiUzenet ?? undefined}
                    >
                      Csak megtekintés
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  // ── Gyülekezeti (Dexie-s) ág — BETŰRE a korábbi felület ───────────────────

  // Csak a soft-delete támogató táblák jelennek meg a Kukában
  const softDeleteTables: TableRegistryEntry[] = TABLE_REGISTRY.filter(
    t => t.softDelete,
  )

  // 2026-08-14 (6. pont, BLOKKOLÓ-javítás): CSAK sima adat mehet át a
  // Server→Client határon. Korábban itt egy labelBuilder FÜGGVÉNY is átment,
  // amitől az oldal minden betöltésnél kivétellel elszállt („Functions cannot
  // be passed directly to Client Components"). A címkézőt a RecycleBinView
  // állítja elő kliens-oldalon a tábla nevéből.
  const tables = softDeleteTables.map(t => ({
    dexieTable: t.dexieTable,
    label: `${MODULE_META[t.module].label} · ${t.label}`,
  }))

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Kuka"
        title="Törölt rekordok visszaállítása"
        description="Itt találod a legutóbb törölt rekordokat. 30 napon belül bármelyiket visszaállíthatod — utána a szerver automatikusan véglegesen törli őket. A kuka csak azokat a modulokat mutatja, amelyek soft-delete-et használnak."
        pills={[
          { label: 'Fázis 5 — Új', tone: 'amber' },
          { label: `${softDeleteTables.length} tábla`, tone: 'neutral' },
        ]}
      />

      <RecycleBinViewClient
        tables={tables}
        congregationId={access.effectiveCongregationId}
        backHref="/"
        backLabel="Kezdőoldal"
        moduleLabel="Minden modul"
      />
    </div>
  )
}
