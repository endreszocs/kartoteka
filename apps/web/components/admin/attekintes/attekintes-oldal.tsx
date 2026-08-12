/**
 * Admin ÁTTEKINTÉS — a teljes oldal (2026-08-12, sűrített váz).
 *
 * SZERVER-KOMPONENS. Kliens CSAK ott van, ahol tényleg kell:
 *   · `Belepo`        — belépő-animáció burkoló (csak `children`-t kap),
 *   · `Szamlalo`      — szám-felfutás (csak számot kap),
 *   · `FrissitesGomb` — kézi újratöltés,
 *   · `MelyEllenorzes`— gombra futó, drága ellenőrzés.
 * Szerver-komponens FÜGGVÉNYT (pl. `Icon={Bell}`) SEHOL nem adunk át
 * kliens-határon: ez okozott éles 500-at a /notifications-on.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A VÁZ — MIÉRT ÍGY, ÉS HOL A SŰRŰSÉG/OLVASHATÓSÁG HATÁRA
 * ════════════════════════════════════════════════════════════════════════════
 * A panasz konkrét volt: „egymás mellett legyenek a dobozok, ne legyenek ekkora
 * üres terek, ne kelljen nagy képernyőn ennyit görgetni". A régi lap EGYETLEN
 * oszlop volt (`space-y-6`), és a `components/admin/attekintes/*` alatt
 * EGYETLEN `xl:` osztály sem szerepelt — vagyis 1030 px-en és 2000 px-en
 * ugyanaz a lap jelent meg, a jobb 40% üresen.
 *
 * NÉGY TÖRÉSPONT, SEHOL NEM TÖBB MINT NÉGY HASÁB:
 *   · alap  (<640 px)  1 hasáb — telefon, 320 px-en is töretlen
 *   · sm/md (≥640 px)  2 hasáb — tablet
 *   · xl    (≥1280 px) 3 hasáb — laptop, 1440 px
 *   · 2xl   (≥1536 px) 4 hasáb — a tulajdonos nagy képernyője (1920 px)
 * Négynél többet SZÁNDÉKOSAN nem engedünk: 1650 px-en az ötödik hasáb már
 * 260 px alá viszi a kártyát, ahol a magyar szavak törni kezdenek.
 *
 * ⚠️ 2026-08-12 — KÉT KIVÉTEL, MINDKETTŐ MÉRT OKBÓL:
 *   (1) A HÁRMAS HASÁB CSAK `xl`-TŐL (1280) INDULHAT, `lg`-től (1024) SOHA. A
 *       bal oldalsáv 288 px-t elvesz, tehát 1024 px-es ablakban a tartalom
 *       680 px — SZŰKEBB, mint 768-on (720 px). Három hasábbal a modul-kártya
 *       ~220 px lenne, amiből az ikon+hézag+chevron után ~126 px marad a
 *       névnek: a „Felhasználók és szerepkörök" töredékké válna.
 *   (2) A SZÁM-ZÓNA 1280–1535 KÖZÖTT 2 HASÁBON MARAD. Fixen négy csoport van;
 *       három hasábnál 3+1-be törik, és a legmagasabb kártya mellett két üres
 *       cella áll — pont a kifogásolt üres tér, épp 1366/1440 px-en.
 *
 * A FÜGGŐLEGES LEVEGŐ, AMIT ELVETTÜNK:
 *   · a lap-hézag 24 → 20 px (`space-y-5`),
 *   · a hét külön `text-lg` szekciócím közül négy beköltözött a kártyába, és
 *     halk, nagybetűs „szemöldök"-felirat lett (~150 px),
 *   · az ítélet-mondat és „a nap teendője" EGY SORBA került (~100 px),
 *   · a 12 modul-kártya leírása a `title`/`aria-label`-be ment (~250 px),
 *   · az egyházmegye-táblázatból több hasábos lista lett (~300 px).
 *
 * A FÜGGŐLEGES LEVEGŐ, AMIT NEM VETTÜNK EL — EZ A HATÁR:
 *   · a RIADÓ-csempék tipográfiája és belső margója VÁLTOZATLAN. A sűrítés nem
 *     jelentheti, hogy a baj elvész a számok között; a riadó-zóna a lap tetején
 *     marad, saját fokozat-kerettel és 44 px-es gombbal.
 *   · minden kattintható sor legalább 44 px magas,
 *   · a szám-sorok címkéje 13 px, a szám 18-20 px — a 12 px-es „táblázat-méret"
 *     az 55+ éves célközönségnél olvashatatlan lenne.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ OLDAL FELÉPÍTÉSE — FELÜLRŐL LEFELÉ, SÜRGŐSSÉG SZERINT
 * ════════════════════════════════════════════════════════════════════════════
 *   1. Fejléc + ÍTÉLET + A NAP TEENDŐJE (egy sorban)
 *   2. RIADÓ-ZÓNA        — csak ami tényleg fennáll, FIX sorrendben
 *   3. „Nem futott le"   — a hiányzó ellenőrzések, kimondva
 *   4. A RENDSZER SZÁMAI — téma-csoportokban (Gyülekezetek · Emberek ·
 *                          Anyakönyv · Rendszer és mentés)
 *   5. Idővonal · Üzenetek · Legnagyobb gyülekezetek
 *   6. Egyházmegyénként
 *   7. Modulok
 *   8. Mélyebb ellenőrzés — csak gombra
 *
 * A 2. zónán KÍVÜL semmi nem rendeződik át, és a riadók sorrendje is FIX
 * (fokozat-sáv + azonosítónkénti alapsúly). A rácsba tördelés a SORRENDET NEM
 * változtatja — csak azt, hogy hány fér egy sorba.
 */

import { LayoutDashboard, ListChecks, Lightbulb, ShieldQuestion } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import type { AttekintesAdat } from '@/app/(dashboard)/admin/overview-shared'
import { fejlecMondat, hibasAgakSzama, napTeendoje } from '@/app/(dashboard)/admin/overview-shared'

import { Belepo } from './belepo'
import { EgyhazmegyeTabla } from './egyhazmegye-tabla'
import { FrissitesGomb } from './frissites-gomb'
import { IdovonalPanel } from './idovonal-panel'
import { LegnagyobbakPanel } from './legnagyobbak-panel'
import { MelyEllenorzes } from './mely-ellenorzes'
import { MentesPulzusCsik } from './mentes-pulzus-csik'
import { ModulRacs } from './modul-racs'
import { RiadoCsempe } from './riado-csempe'
import { SzamCsoportKartya } from './szam-csoport'
import { UzenetekPanel } from './uzenetek-panel'

export function AttekintesOldal({ adat }: { adat: AttekintesAdat }) {
  const most = new Date(adat.mertAt).getTime()
  const teendo = napTeendoje(adat.riadok)
  // ⚠️ A FŐ ÍTÉLET NEVEZŐJE. NEM `adat.nemFutottLe.length`: a legfontosabb
  //    bukások (mentés-lefedettség, tagszám-RPC, országos head-count-ok) a
  //    csoportok `hianyzo` tömbjébe esnek, nem a `nemFutottLe`-be — a régi
  //    számítás mellett a lap tetején „Ma nincs teendő" állt, közvetlenül egy
  //    piros „NEM nulla, hanem nem tudjuk" doboz fölött. Lásd `hibasAgakSzama`.
  const hibasAgak = hibasAgakSzama(adat)
  const mondat = fejlecMondat({
    riadokSzama: adat.riadok.length,
    hibasAgak,
  })
  const elsoKritikus = adat.riadok.find((r) => r.fokozat === 'kritikus')

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Admin Központ"
        description="Ez az oldal alapból csendben van. Csak az kerül elé, amivel tényleg tenni kell valamit — a többi szám lentebb, mindig ugyanott."
        icon={LayoutDashboard}
        eyebrow="Rendszerszint"
        hideBackLink
        actions={<FrissitesGomb mertAt={adat.mertAt} />}
      />

      {/* ── 1. AZ ÍTÉLET + A NAP TEENDŐJE — EGY SORBAN ──────────────────────
          Korábban két külön, teljes szélességű sáv volt egymás alatt: egy
          egysoros mondat ~900 px üres hellyel, alatta ugyanaz még egyszer.
          Egymás mellett ugyanaz az információ egy képernyő-magassággal
          feljebb kezdi a lapot. */}
      <div className={`grid gap-4 ${teendo ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]' : ''}`}>
        <p
          className="self-center font-heading text-xl font-semibold leading-snug text-foreground sm:text-2xl"
          aria-live="polite"
        >
          {mondat}
        </p>

        {teendo && (
          <Belepo>
            <section
              className="card-raised flex h-full items-start gap-3 p-4"
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
                <p className="mt-1 text-base leading-relaxed text-foreground">{teendo.mondat}</p>
              </div>
            </section>
          </Belepo>
        )}
      </div>

      {/* ── 2. RIADÓ-ZÓNA ──────────────────────────────────────────────────
          A SORREND VÁLTOZATLAN (riadokSorrendben). Ami változott: a csempék
          rácsba folynak, tehát két riadónál nem marad üres a jobb oldal. A
          vezető (legsúlyosabb) csempe `md:col-span-2`-t kap, így vizuálisan
          továbbra is más osztály — nem csak feljebb van. */}
      {adat.riadok.length > 0 ? (
        <section aria-labelledby="riadok-cim" className="space-y-2.5">
          <h2
            id="riadok-cim"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            Amivel tenni kell valamit
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {adat.riadok.map((r, i) => (
              <Belepo key={r.id} index={i} className={i === 0 ? 'h-full md:col-span-2' : 'h-full'}>
                <RiadoCsempe
                  riado={r}
                  vezeto={i === 0}
                  sziv={i === 0 && !!elsoKritikus && elsoKritikus.id === r.id}
                />
              </Belepo>
            ))}
          </div>
        </section>
      ) : (
        <UresAllapot adat={adat} hibasAgak={hibasAgak} />
      )}

      {/* ── 3. AMI NEM FUTOTT LE ────────────────────────────────────────── */}
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
          <ul className="mt-2.5 grid gap-x-6 gap-y-1.5 lg:grid-cols-2 2xl:grid-cols-3">
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

      {/* ── 4. A RENDSZER SZÁMAI — TÉMA-CSOPORTOKBAN ────────────────────────
          Négy kártya, 1920 px-en EGYETLEN sávban ~25 mért számmal. A
          csoportosítás adja vissza az áttekinthetőséget, amit a sűrűség
          elvesz: a szem tudja, hol keresse. A csoportok sorrendje FIX. */}
      {adat.szamCsoportok.length > 0 && (
        <section aria-labelledby="szamok-cim" className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2
              id="szamok-cim"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              A rendszer számai
            </h2>
            <p className="text-xs text-muted-foreground">
              Minden szám mért adatból — becslés és mintaadat nincs köztük
            </p>
          </div>
          {/* ⚠️ 1280–1535 px: SZÁNDÉKOSAN 2 HASÁB, nem 3.
              A szám-zóna FIXEN négy csoportot rak ki (Gyülekezetek · Emberek ·
              Anyakönyv · Rendszer és mentés). Három hasábnál 3+1-be törik: a
              NEGYEDIK, egyben legmagasabb kártya („Rendszer és mentés", ~9 sor
              + a 14 napos pulzus-csík) egyedül marad a második sorban, mellette
              két üres cella az egész kártya magasságában — PONTOSAN a
              kifogásolt üres tér, és épp a legelterjedtebb laptop-szélességeken
              (1366, 1440). 2×2-ben a törés kiegyenlített. */}
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {adat.szamCsoportok.map((cs, i) => (
              <Belepo key={cs.id} index={i} className="h-full">
                <SzamCsoportKartya csoport={cs}>
                  {cs.id === 'rendszer' ? <MentesPulzusCsik ag={adat.mentesPulzus} /> : null}
                </SzamCsoportKartya>
              </Belepo>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. IDŐVONAL · ÜZENETEK · LEGNAGYOBB GYÜLEKEZETEK ───────────────
          Ez a három panel korábban egymás ALATT állt (idővonal+üzenetek egy
          sorban, a többi lejjebb) — ez adta a görgetés javát. */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <IdovonalPanel ag={adat.idovonal} most={most} />
        <UzenetekPanel ag={adat.uzenetek} />
        <LegnagyobbakPanel ag={adat.legnagyobbak} />
      </div>

      {/* ── 6. EGYHÁZMEGYÉNKÉNT ────────────────────────────────────────── */}
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
 * egyenesen hamis. Ezért itt kiírjuk, MIT néztünk meg — és a 3. blokk kiírja,
 * mit NEM.
 */
function UresAllapot({ adat, hibasAgak }: { adat: AttekintesAdat; hibasAgak: number }) {
  // ⚠️ Ugyanaz a nevező, mint a fejléc-mondaté (`hibasAgakSzama`). A zöld keret
  //    csak akkor jár, ha SEMMI nem hiányzik — a csoportokon belüli bevallott
  //    hiány is „hiányos kép", nem „minden rendben".
  const teljes = hibasAgak === 0
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
          <p className="mt-1 text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
            {adat.ellenorizve.length > 0
              ? `Ezeket néztem meg: ${adat.ellenorizve.join(', ')}.`
              : 'Egyetlen ellenőrzést sem sikerült lefuttatni.'}
          </p>
          {/* Ha a hiány CSAK a szám-csoportokon belül van, nincs alatta piros
              „nem futott le" panel — ilyenkor megmondjuk, hol keresse. */}
          {!teljes && adat.nemFutottLe.length === 0 && (
            <p className="mt-1 text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
              {hibasAgak === 1
                ? 'Egy szám viszont nem jött meg — a „rendszer számai" között piros kerettel jelöltem.'
                : `${hibasAgak} szám viszont nem jött meg — a „rendszer számai" között piros kerettel jelöltem.`}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
