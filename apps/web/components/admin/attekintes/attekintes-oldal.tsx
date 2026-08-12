/**
 * Admin ÁTTEKINTÉS — a teljes oldal (2026-08-12).
 *
 * SZERVER-KOMPONENS. Kliens CSAK ott van, ahol tényleg kell:
 *   · `Belepo`        — belépő-animáció burkoló (csak `children`-t kap),
 *   · `Szamlalo`      — szám-felfutás (csak számot kap),
 *   · `FrissitesGomb` — kézi újratöltés,
 *   · `MelyEllenorzes`— gombra futó, drága ellenőrzés.
 * Szerver-komponens FÜGGVÉNYT (pl. `Icon={Bell}`) SEHOL nem adunk át
 * kliens-határon: tegnap pontosan ez okozott éles 500-at a /notifications-on.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ OLDAL FELÉPÍTÉSE — FELÜLRŐL LEFELÉ, SÜRGŐSSÉG SZERINT
 * ════════════════════════════════════════════════════════════════════════════
 *   1. Fejléc + EGY MONDATOS ÍTÉLET   („Ma 2 dolog vár rád.")
 *   2. A NAP TEENDŐJE                  — egy mondat, egy gomb
 *   3. RIADÓ-ZÓNA                      — csak ami tényleg fennáll
 *   4. „Nem futott le" panel           — a hiányzó ellenőrzések, kimondva
 *   5. PULZUS                          — a nyugodt számok (FIX sorrend)
 *   6. IDŐVONAL + ÜZENETEK
 *   7. MODULOK                         — élő pirulákkal
 *   8. MÉLYEBB ELLENŐRZÉS              — csak gombra
 *
 * A 3. zónán KÍVÜL semmi nem rendeződik át. A riadók sorrendje is FIX
 * (fokozat-sáv + azonosítónkénti alapsúly), tehát egy adott riadó-típus mindig
 * ugyanott áll a többihez képest — csak az változik, hogy megjelenik-e.
 */

import { LayoutDashboard, ListChecks, Lightbulb, ShieldQuestion } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import type { AttekintesAdat } from '@/app/(dashboard)/admin/overview-shared'
import { fejlecMondat, napTeendoje } from '@/app/(dashboard)/admin/overview-shared'

import { Belepo } from './belepo'
import { EgyhazmegyeTabla } from './egyhazmegye-tabla'
import { FrissitesGomb } from './frissites-gomb'
import { IdovonalPanel } from './idovonal-panel'
import { MelyEllenorzes } from './mely-ellenorzes'
import { ModulRacs } from './modul-racs'
import { PulzusRacs } from './pulzus-racs'
import { RiadoCsempe } from './riado-csempe'
import { UzenetekPanel } from './uzenetek-panel'

export function AttekintesOldal({ adat }: { adat: AttekintesAdat }) {
  const most = new Date(adat.mertAt).getTime()
  const teendo = napTeendoje(adat.riadok)
  const mondat = fejlecMondat({
    riadokSzama: adat.riadok.length,
    hibasAgak: adat.nemFutottLe.length,
  })
  const elsoKritikus = adat.riadok.find((r) => r.fokozat === 'kritikus')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Központ"
        description="Ez az oldal alapból csendben van. Csak az kerül elé, amivel tényleg tenni kell valamit — a többi szám lentebb, mindig ugyanott."
        icon={LayoutDashboard}
        eyebrow="Rendszerszint"
        hideBackLink
        actions={<FrissitesGomb mertAt={adat.mertAt} />}
      />

      {/* ── 1. AZ ÍTÉLET — a lap legfontosabb mondata ───────────────────── */}
      <p
        className="text-lg font-semibold leading-relaxed text-foreground sm:text-xl"
        aria-live="polite"
      >
        {mondat}
      </p>

      {/* ── 2. A NAP TEENDŐJE ───────────────────────────────────────────── */}
      {teendo && (
        <Belepo>
          <section
            className="card-raised flex items-start gap-3 p-4 sm:p-5"
            aria-labelledby="nap-teendoje"
          >
            <span
              className="icon-raised flex size-10 shrink-0 items-center justify-center text-[var(--primary-foreground)]"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
              aria-hidden
            >
              <Lightbulb className="size-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="nap-teendoje"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                Ha ma csak egy dolgot csinálsz
              </h2>
              <p className="mt-1 max-w-prose text-base leading-relaxed text-foreground sm:text-lg">
                {teendo.mondat}
              </p>
            </div>
          </section>
        </Belepo>
      )}

      {/* ── 3. RIADÓ-ZÓNA ──────────────────────────────────────────────── */}
      {adat.riadok.length > 0 ? (
        <section aria-labelledby="riadok-cim" className="space-y-3">
          <h2 id="riadok-cim" className="font-heading text-lg text-foreground">
            Amivel tenni kell valamit
          </h2>
          {/* Az ELSŐ (legsúlyosabb) riadó teljes szélességű vezető csempe;
              a többi kettesével — így a rangsor első eleme vizuálisan is más
              osztály, nem csak feljebb van. */}
          <Belepo index={0}>
            <RiadoCsempe
              riado={adat.riadok[0]}
              vezeto
              sziv={!!elsoKritikus && elsoKritikus.id === adat.riadok[0].id}
            />
          </Belepo>
          {adat.riadok.length > 1 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {adat.riadok.slice(1).map((r, i) => (
                <Belepo key={r.id} index={i + 1}>
                  <RiadoCsempe riado={r} />
                </Belepo>
              ))}
            </div>
          )}
        </section>
      ) : (
        <UresAllapot adat={adat} />
      )}

      {/* ── 4. AMI NEM FUTOTT LE ────────────────────────────────────────── */}
      {adat.nemFutottLe.length > 0 && (
        <section
          role="alert"
          className="card-raised p-4 sm:p-5"
          style={{ border: '2px solid var(--destructive)' }}
          aria-labelledby="nem-futott-cim"
        >
          <h2
            id="nem-futott-cim"
            className="flex items-center gap-2 font-heading text-lg text-foreground"
          >
            <ShieldQuestion className="size-5 text-[var(--destructive)]" aria-hidden />
            {adat.nemFutottLe.length === 1
              ? '1 ellenőrzés nem futott le'
              : `${adat.nemFutottLe.length} ellenőrzés nem futott le`}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-foreground/90">
            A kép emiatt hiányos. Ezekről most NEM tudjuk, hogy rendben vannak-e — a hiányzó
            adatot szándékosan nem mutatjuk nullának.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {adat.nemFutottLe.map((n) => (
              <li key={n.mi} className="text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{n.mi}</strong> —{' '}
                {n.fajta === 'nincs_sql'
                  ? 'a hozzá tartozó adatbázis-lépés még nem futott le. '
                  : ''}
                {n.miert}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 5. PULZUS ──────────────────────────────────────────────────── */}
      <PulzusRacs csempek={adat.pulzus} />

      {/* ── 6. IDŐVONAL + ÜZENETEK + EGYHÁZMEGYÉK ──────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IdovonalPanel ag={adat.idovonal} most={most} />
        <UzenetekPanel ag={adat.uzenetek} />
      </div>
      <EgyhazmegyeTabla ag={adat.egyhazmegyek} />

      {/* ── 7. MODULOK ─────────────────────────────────────────────────── */}
      <ModulRacs pirulak={adat.modulPirulak} rendszerAdmin={adat.rendszerAdmin} />

      {/* ── 8. MÉLYEBB ELLENŐRZÉS ──────────────────────────────────────── */}
      <MelyEllenorzes />
    </div>
  )
}

/**
 * Üres állapot — FELSOROLJA, MIT ellenőriztünk.
 *
 * ⚠️ A „minden rendben" önmagában nem meggyőző, és ha bármelyik ág elbukott,
 * egyenesen hamis. Ezért itt kiírjuk, MIT néztünk meg — és a 4. blokk kiírja,
 * mit NEM.
 */
function UresAllapot({ adat }: { adat: AttekintesAdat }) {
  const teljes = adat.nemFutottLe.length === 0
  return (
    <section
      className="card-raised p-4 sm:p-5"
      style={{
        border: teljes
          ? '2px solid color-mix(in oklab, var(--accent) 60%, var(--border))'
          : '1px solid var(--border)',
      }}
      aria-labelledby="ures-cim"
    >
      <div className="flex items-start gap-3">
        <span
          className="icon-raised flex size-10 shrink-0 items-center justify-center text-[var(--primary-foreground)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }}
          aria-hidden
        >
          <ListChecks className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="ures-cim" className="font-heading text-lg text-foreground">
            {teljes ? 'Ma nincs teendő' : 'Nem találtam teendőt — de a kép hiányos'}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
            {adat.ellenorizve.length > 0
              ? `Ezeket néztem meg: ${adat.ellenorizve.join(', ')}.`
              : 'Egyetlen ellenőrzést sem sikerült lefuttatni.'}
          </p>
        </div>
      </div>
    </section>
  )
}
