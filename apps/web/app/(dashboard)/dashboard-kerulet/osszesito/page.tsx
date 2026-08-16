import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, Info, Printer, TriangleAlert } from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
// A NYOMTATÁS-GOMB az egyetlen kliens-sziget ezen a lapon (`window.print()`).
import { NyomtatasGomb } from '@/components/dashboard/district/nyomtatas-gomb'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canReadDistrictScope, resolveDistrictReadScopeIds } from '@/lib/auth/level-scope'
import { documentSeasonYear } from '@/lib/constants/documents'
// A HIÁNY-MONDAT KANONIKUS FORRÁSA. ⚠️ NE írjunk helyette sajátot: a mag
// docblockja épp azt tiltja, hogy ugyanarra az összesítőre más-más mondatot
// lásson a püspöki hivatal — a lap korábban mégis saját mondatot épített, a mag
// exportja pedig holt kód volt (2026-08-17-i ellenőrzés találata).
import { hianyOsszefoglalo } from '@/lib/district/osszesito-core'
import { getKeruletiOsszesito } from '../osszesito-actions'

/**
 * EGYHÁZKERÜLETI ÖSSZESÍTŐ — `/dashboard-kerulet/osszesito`
 * (kerületi S4 szelet, 2026-08-17).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT MUTAT, ÉS MIBŐL
 * ════════════════════════════════════════════════════════════════════════════
 * A kerület egyházmegyéi által hivatalosan FELTERJESZTETT iratok kerületi
 * összesítését évenként: a megyei számadásokat, a megyei költségvetéseket (a
 * legutolsó módosítás az érvényes) és a megyék SZÁMVEVŐI ÖSSZESÍTŐIT — utóbbi a
 * kerület egyetlen törvényes ablaka a gyülekezeti szint számaira.
 *
 * ADATFORRÁS (Endre K4 döntése): KIZÁRÓLAG a `diocese_felterjesztes` sorok
 * FAGYASZTOTT pillanatképe + a `dioceses` törzsadat (a feladó neve). A megyék
 * könyveibe a kerület nem néz bele — lásd az `osszesito-actions.ts` fejlécét.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED LÁTHATÓSÁG — EZ A LAP LÉNYEGE
 * ────────────────────────────────────────────────────────────────────────────
 * Minden szakasz KIÍRJA, hány és MELYIK egyházmegye adata hiányzik belőle, és
 * külön, nevesítve azt is, melyik iratot küldte a kerület javításra vissza (az
 * NEM számít bele az összegbe). Egy „kerek" végösszeg, ami mögött fél kerület
 * hiánya áll, rosszabb, mint a nyílt hiány: ebből tudja a püspöki hivatal, kit
 * kell megsürgetnie.
 *
 * A hiány NEM ÁLL MEG A MEGYEHATÁRON: a számvevői szakasz azt is kiírja, hány
 * és melyik GYÜLEKEZET adata hiányzik az egyes megyei összesítőkből (ezt a
 * megye maga rögzítette a felterjesztett, fagyasztott csomagban) — enélkül egy
 * hiánytalan megye-névsor mögött is állhatna fél kerületnyi be nem adott
 * gyülekezeti irat.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MIÉRT TISZTA SZERVER-KOMPONENS (nincs 'use client')
 * ────────────────────────────────────────────────────────────────────────────
 *  · ÉV-VÁLASZTÓ: `?ev=` keresési paraméter + sima `<Link>` chipek. A megyei
 *    párja kliens-állapotban tartja az évet; itt nincs rá szükség, és cserébe
 *    az évek MEGOSZTHATÓ, könyvjelzőzhető URL-t kapnak — egy hivatalos iratnál
 *    ez tényleges nyereség (a püspöki hivatal elküldheti a pontos nézet linkjét).
 *  · NYOMTATÁS: a lap MAGA az A4-es nyomtatvány, `@media print` szabályokkal (a
 *    repó bevett „csak a nyomtatvány látszik" mintája szerint). Így a képernyőn
 *    látott és a papírra kerülő szám ugyanabból az EGY forrásból jön — nem egy
 *    külön HTML-építőből, ami idővel széthúzhat a képernyővel. A nyomtatást a
 *    lap tetején lévő GOMB indítja (`NyomtatasGomb` — ez a lap EGYETLEN
 *    kliens-szigete, mert a `window.print()` böngésző-API), a Ctrl+P / ⌘+P
 *    pedig továbbra is működik. ⚠️ A gomb azért kell, mert korábban CSAK a
 *    „Ctrl+P" felirat állt itt: érintőképernyőn (tableten, telefonon) nincs
 *    Ctrl billentyű, tehát a hivatalos ív ott elérhetetlen volt.
 *
 * ⚠️ A VÉGLEGESÍTÉS / FELKÜLDÉS SZÁNDÉKOSAN NINCS ITT: Endre K3 döntése szerint
 *    NINCS 4. szint, tehát a kerületi összesítőt nincs hová felküldeni. A
 *    zárolás (véglegesítés) későbbi szelet.
 *
 * HATÓKÖR (fail-closed, három lépcső): belépő-kapu `canReadDistrictScope` (az
 * egyházkerületi SZÁMVEVŐ is bejut, ellenőri nézetben) → aktív profil-hatókör
 * ellenőrzés → a szűrés a szerep-szűrt `resolveDistrictReadScopeIds` alapján,
 * magában a szerver akcióban. Feloldhatatlan hatókör esetén MAGYARÁZÓ KÁRTYA áll
 * itt, SOHA nem más kerület iratait mutató összesítés.
 */

interface PageProps {
  searchParams?: Promise<{ ev?: string }>
}

// ---------------------------------------------------------------------------
// A SZÁMÍTÓ MAG KIMENETE — típusok a szerver akcióból levezetve
//
// MIÉRT ÍGY: a `'use server'` fájl csak async függvényt exportálhat, típust nem.
// A `Awaited<ReturnType<…>>` levezetés viszont ugyanazt a szerződést adja, EGY
// import-ból — és ha a mag mezőnevei változnak, a fordító pontosan az érintett
// sorra mutat, nem egy elveszett típus-importra.
// ---------------------------------------------------------------------------
type OldalAdat = Awaited<ReturnType<typeof getKeruletiOsszesito>>
type Osszesito = NonNullable<OldalAdat['osszesito']>
type Allapot = Osszesito['szamadas']['allapot']
type KodSor = Osszesito['szamadas']['bevetelSorok'][number]
type MegyeOsszeg = Osszesito['szamadas']['megyenkent'][number]
type Szamvevoi = Osszesito['szamvevoiOsszesito']

/** Egy megjelenítendő szakasz: pénzügyi tábla VAGY számvevői blokk + a teljességi kép. */
interface Szakasz {
  kulcs: string
  cim: string
  leiras: string
  allapot: Allapot
  penzugy?: Osszesito['szamadas']
  szamvevoi?: Szamvevoi
}

/**
 * ⚠️ EZ AZ EGYETLEN HELY, AHOL AZ OLDAL A SZÁMÍTÓ MAG TAGOLÁSÁRA TÁMASZKODIK.
 *
 * Szándékosan egyetlen függvénybe fogva: ha a mag alakja finomodik, itt EGY
 * helyen kell követni, és a lap többi része (táblák, hiány-blokkok,
 * aláírás-rovat) érintetlen marad.
 */
function szakaszokBol(o: Osszesito): Szakasz[] {
  return [
    {
      kulcs: 'szamadas',
      cim: 'Egyházmegyei számadások összesítése',
      leiras:
        'A kerület egyházmegyéi által felterjesztett, véglegesített megyei számadások összege ' +
        'számadási kódonként. A javításra visszaküldött felterjesztések NEM számítanak bele.',
      allapot: o.szamadas.allapot,
      penzugy: o.szamadas,
    },
    {
      kulcs: 'koltsegvetes',
      cim: 'Egyházmegyei költségvetések összesítése',
      leiras:
        'Az ÉRVÉNYES terv összege: ahol volt költségvetés-módosítás, ott a legutolsó módosított ' +
        'összeg számít — nem az év eleji, rég túlhaladott terv.',
      allapot: o.koltsegvetes.allapot,
      penzugy: o.koltsegvetes,
    },
    {
      kulcs: 'szamvevoi',
      cim: 'Számvevői összesítők — a gyülekezeti szint kerületi képe',
      leiras:
        'A megyék számvevői összesítőiből származó kerületi mutatók. Ez a kerület egyetlen ' +
        'hivatalos ablaka a gyülekezetek számaira: nem a gyülekezetek adatait olvassuk, hanem ' +
        'azt a fagyasztott összesítőt, amit az egyházmegye felterjesztett.',
      allapot: o.szamvevoiOsszesito.allapot,
      szamvevoi: o.szamvevoiOsszesito,
    },
  ]
}

// ---------------------------------------------------------------------------
// Formázók
// ---------------------------------------------------------------------------

function penz(n: number): string {
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function db(n: number): string {
  return n.toLocaleString('hu-HU')
}

/**
 * NYOMTATÁSI SZABÁLYOK — a repó bevett „csak a nyomtatvány látszik" mintája
 * (components/finance/chitanta-print-template.tsx).
 *
 * MIÉRT `visibility` ÉS NEM `display:none` a keretre: a dashboard héja (fejléc,
 * oldalsáv) NEM ennek az oldalnak a fája, tehát innen nem lehet célzottan
 * elrejteni. A `body * { visibility: hidden }` + a nyomtatvány visszakapcsolása
 * viszont a teljes héjra hat, a lap-elrendezés felborítása nélkül.
 *
 * A `@page` A4 álló, 14/12 mm margóval — a repó hivatalos íveinek mérete.
 */
const NYOMTATAS_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  .kerulet-nyomtatvany, .kerulet-nyomtatvany * { visibility: visible; }
  .kerulet-nyomtatvany {
    position: absolute; top: 0; left: 0; width: 100%;
    box-shadow: none !important; border: 0 !important;
    padding: 0 !important; margin: 0 !important;
    color: #111 !important; background: #fff !important;
    font-size: 10pt;
  }
  .kerulet-nyomtatvany * { color: #111 !important; background: transparent !important; }
  .kerulet-nyomtatvany .nyomtatasban-rejtve { display: none !important; }
  .kerulet-nyomtatvany section { break-inside: avoid; page-break-inside: avoid; }
  .kerulet-nyomtatvany table { font-size: 9pt; width: 100%; border-collapse: collapse; }
  .kerulet-nyomtatvany th, .kerulet-nyomtatvany td { border-bottom: 1px solid #cbd5e1; padding: 2px 4px; }
  .kerulet-nyomtatvany .gorgo { max-height: none !important; overflow: visible !important; }
  .kerulet-nyomtatvany .alairas-rovat { break-inside: avoid; page-break-inside: avoid; }
}
`

export default async function KeruletiOsszesitoPage({ searchParams }: PageProps) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canReadDistrictScope(access)) redirect('/dashboard')
  if (access.activeProfileRole && access.activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(access.activeProfileRole.scope))
  }

  // FAIL-CLOSED: feloldható kerületi hatókör nélkül magyarázó kártya. Itt
  // SZÁNDÉKOSAN nincs rendszergazdai „minden kerület" ág — az összesítő EGY
  // egyházkerület hivatalos irata (lásd az akció fejlécét).
  if (resolveDistrictReadScopeIds(access).length === 0) {
    return <MissingDistrictScopeNotice />
  }

  // ÉV: a `?ev=` paraméterből, ésszerű korláttal. Alapértelmezés a beszámolási
  // SZEZON éve — január–márciusban még az ELŐZŐ év, mert a felterjesztések
  // akkor érkeznek; naptári évre szegezve ilyenkor üres képet mutatnánk, amiből
  // a kerület arra következtetne, hogy senki nem terjesztett fel semmit.
  const params = (await searchParams) || {}
  const kertEv = Number.parseInt(params.ev ?? '', 10)
  const ev =
    Number.isFinite(kertEv) && kertEv >= 1900 && kertEv <= 2200 ? kertEv : documentSeasonYear()

  const adat = await getKeruletiOsszesito(ev)
  const o = adat.osszesito
  const szakaszok = o ? szakaszokBol(o) : []

  // Az év-választó chipjei: ami az adatbázisban van, plusz a most nézett év —
  // különben egy kézzel beírt `?ev=` érték eltűnne a sávból.
  const evek = [...new Set([...(adat.evek || []), ev])].sort((a, b) => b - a)

  const keruletNev = adat.districtNev || 'Egyházkerület'
  const nyomtatasDatuma = new Date().toLocaleDateString('hu-HU')

  return (
    <div className="space-y-5">
      {/* Statikus, kód-beli nyomtatási CSS — nincs benne felhasználói adat. */}
      <style dangerouslySetInnerHTML={{ __html: NYOMTATAS_CSS }} />

      <div className="nyomtatasban-rejtve">
        <Link
          href="/dashboard-kerulet"
          className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground max-sm:min-h-10"
        >
          <ArrowLeft className="size-4" />
          Vissza az egyházkerületi irányítópultra
        </Link>
      </div>

      <div className="nyomtatasban-rejtve">
        <ScopeHero
          eyebrow="Egyházkerületi összesítő"
          title={`${ev}. évi egyházkerületi összesítés`}
          description={
            'Az egyházmegyék hivatalosan felterjesztett iratainak kerületi összesítése — megyei ' +
            'számadás, megyei költségvetés (a legutolsó módosítással) és a megyék számvevői ' +
            'összesítői. A kerület kizárólag a felküldött, fagyasztott iratokból dolgozik; a ' +
            'hiányzó egyházmegyék név szerint láthatók.'
          }
          chips={[
            keruletNev,
            `${ev}. beszámolási év`,
            o ? `${db(o.megyeSzam)} egyházmegye` : 'Betöltés alatt',
            o
              ? `Számadás: ${db(o.szamadas.allapot.bekuldott.length)} / ${db(o.megyeSzam)} felterjesztve`
              : 'Számadás: —',
            adat.canWrite === false ? 'Ellenőri (számvevői) nézet — csak megtekintés' : '',
          ].filter(Boolean)}
        />
      </div>

      {/* ── Év-választó + nyomtatási tudnivaló ─────────────────────────────── */}
      <div className="nyomtatasban-rejtve card-raised rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Beszámolási év</p>
          {/* NYOMTATÁS: gomb ÉS felirat. A gomb azért kell, mert a puszta
              „Ctrl+P" felirat érintőképernyőn (tableten, telefonon) nem elérhető
              út — ott nincs is Ctrl billentyű. A felirat marad, mert a
              billentyűparancs továbbra is működik. */}
          <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-2">
            <NyomtatasGomb />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Printer className="size-3.5" />
              vagy a böngésző nyomtatás parancsával (Ctrl+P, Mac-en ⌘+P) — a lap A4-es,
              aláírás-rovatos nyomtatványként kerül papírra.
            </span>
          </span>
        </div>

        {/* TÖBB KERÜLETI HATÓKÖR: az összesítő EGY kerületről szól, az
            irattár viszont MINDET mutatja — ha ezt elhallgatnánk, ugyanaz a
            felhasználó két lapon más terjedelmet látna, magyarázat nélkül. */}
        {adat.scopeNotice && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{adat.scopeNotice}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {evek.map((e) => (
            <Link
              key={e}
              href={`/dashboard-kerulet/osszesito?ev=${e}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-9 ${
                e === ev
                  ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/15 dark:text-teal-300'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {e}.
            </Link>
          ))}
        </div>

        {/* Ellenőri nézet magyarázata — a szűkebb jogosultság sose legyen néma. */}
        {adat.canWrite === false && (
          <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            {adat.readOnlyReason ||
              'Ellenőri nézet: az összesítőt megtekintheted és kinyomtathatod, módosítani nem tudsz.'}
          </p>
        )}

        {/* A törzsadat hiánya: a SZÁMOK jók, csak a fejléc/aláírás-rovat üres. */}
        {adat.torzsadatHiba && (
          <p className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            {adat.torzsadatHiba}
          </p>
        )}

        {/* A KATALÓGUS hiánya — ez MÁS súlyú, mint a törzsadaté: a költségvetés
            bevétel/kiadás bontása ilyenkor HAMIS (lásd `KatalogusHibaSav`). */}
        {adat.katalogusHiba && <KatalogusHibaSav szoveg={adat.katalogusHiba} className="mt-3" />}
      </div>

      {/* ── Fail-closed hiba: nincs hatókör vagy nem olvasható az adat ─────── */}
      {adat.error ? (
        <div className="nyomtatasban-rejtve card-raised rounded-2xl border-amber-300/60 p-5 dark:border-amber-400/30">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h2 className="font-heading text-base text-foreground">
                Az összesítő most nem jeleníthető meg
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{adat.error}</p>
            </div>
          </div>
        </div>
      ) : !o ? (
        <div className="nyomtatasban-rejtve card-raised rounded-2xl p-6 text-center text-sm text-muted-foreground">
          Erre az évre nincs megjeleníthető adat.
        </div>
      ) : (
        // ── AZ A4-ES NYOMTATVÁNY ─────────────────────────────────────────────
        <article className="kerulet-nyomtatvany card-raised space-y-5 rounded-2xl p-5">
          <header className="border-b-2 border-border pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Kartotéka — egyházkerületi összesítő
            </p>
            <h1 className="mt-1 font-heading text-xl text-foreground sm:text-2xl">
              {ev}. évi egyházkerületi összesítő
            </h1>
            <p className="mt-1 text-sm italic text-muted-foreground">
              {keruletNev}
              {adat.districtNevRo ? ` · ${adat.districtNevRo}` : ''}
            </p>
          </header>

          {/* ⚠️ A KATALÓGUS-HIBA A PAPÍRRA IS RÁKERÜL — szándékosan NEM
              `nyomtatasban-rejtve`. A képernyőn álló figyelmeztetés önmagában
              kevés: az ívet ki lehet nyomtatni és alá lehet írni, és a papíron
              már semmi nem árulná el, hogy a bevétel/kiadás megosztás hamis.
              Ez a sáv az egyetlen, ami a kinyomtatott lapon is megvédi az
              aláírót. */}
          {adat.katalogusHiba && <KatalogusHibaSav szoveg={adat.katalogusHiba} />}

          {/* Meta-tábla: mi ez az irat, és mennyi áll mögötte. */}
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                ['Egyházkerület', keruletNev],
                ['Beszámolási év', `${ev}.`],
                ['Egyházmegyék száma', db(o.megyeSzam)],
                [
                  'Számadást felterjesztett',
                  `${db(o.szamadas.allapot.bekuldott.length)} / ${db(o.megyeSzam)}`,
                ],
                [
                  'Költségvetést felterjesztett',
                  `${db(o.koltsegvetes.allapot.bekuldott.length)} / ${db(o.megyeSzam)}`,
                ],
                [
                  'Számvevői összesítőt felterjesztett',
                  `${db(o.szamvevoiOsszesito.allapot.bekuldott.length)} / ${db(o.megyeSzam)}`,
                ],
                ['Nyomtatva', nyomtatasDatuma],
              ].map(([cimke, ertek]) => (
                <tr key={cimke}>
                  <td className="py-1.5 pr-3 text-xs uppercase tracking-wide text-muted-foreground sm:w-64">
                    {cimke}
                  </td>
                  <td className="py-1.5 text-foreground">{ertek}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {szakaszok.map((szakasz) => (
            <SzakaszBlokk key={szakasz.kulcs} szakasz={szakasz} megyeSzam={o.megyeSzam} />
          ))}

          <AlairasRovat alairok={adat.alairok} />

          <footer className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span>Nyomtatva: {nyomtatasDatuma}</span>
            <span>
              Kartotéka · {keruletNev} · {ev}. évi egyházkerületi összesítő
            </span>
          </footer>
        </article>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső, tisztán megjelenítő komponensek
// ---------------------------------------------------------------------------

/**
 * A SZÁMADÁSI CÉL KATALÓGUS hibájának borostyán sávja.
 *
 * ⚠️ A JAVÍTOTT TÜNET (2026-08-17-i ellenőrzés): a katalógus olvasása fail-soft
 * volt, és a hiba CSAK a szerver naplójába ment. A számadás számai valóban
 * helyesek maradnak nélküle (ott a bevétel/kiadás bontás a pillanatképből jön),
 * a KÖLTSÉGVETÉSNÉL viszont a besorolás KIZÁRÓLAG a katalógusból származik:
 * üres katalógusnál minden terv-sor a bevétel-oldalra kerül, az összes kiadás
 * 0, az egyenleg pedig a teljes terv. Így egy aláírható, kinyomtatható hivatalos
 * ív született nyilvánvalóan hamis megosztással, és a felhasználó erről semmit
 * nem tudott meg.
 *
 * Ezért a sáv KÉTSZER szerepel a lapon: a képernyős kártyán (a törzsadat-hiba
 * mellett) ÉS magában a nyomtatványban, hogy a PAPÍRRA is rákerüljön. Ne
 * „egyszerűsítsd" egyetlen, `nyomtatasban-rejtve` példánnyá.
 */
function KatalogusHibaSav({ szoveg, className = '' }: { szoveg: string; className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 ${className}`}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{szoveg}</span>
    </p>
  )
}

/**
 * Egy összesítő-szakasz: cím + magyarázat + a TELJESSÉGI kép + a tartalom.
 *
 * A hiány-blokk MINDIG ott van (a hiánytalanságot is kimondja) — ez a
 * fail-closed láthatóság, és a papírra is rákerül. Egy hivatalos összesítő
 * pontosan annyit ér, amennyi felterjesztés mögötte áll.
 */
function SzakaszBlokk({ szakasz, megyeSzam }: { szakasz: Szakasz; megyeSzam: number }) {
  // ⚠️ A NEGYEDIK LISTA IS SZÁMÍT. Ha egy megyétől van érvényes irat ÉS
  // visszaküldött is (tipikusan: az alap költségvetés átvéve, az 1. módosítás
  // javításra visszaküldve), a megye a `bekuldott` ágra kerül — az összeg tehát
  // NEM a legutolsó tervet tükrözi. Ha ezt kihagynánk a számításból, a lap
  // „teljes az összeg" zöld dobozt mutatna, miközben a mag figyelmeztető
  // mondatot ad. Egy hivatalos íven a kettő nem mondhat mást.
  const hianyzik =
    szakasz.allapot.hianyzo.length +
    szakasz.allapot.visszakuldott.length +
    szakasz.allapot.bekuldottDeVanVisszakuldott.length
  return (
    <section className="space-y-3 rounded-xl border border-border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base text-foreground">{szakasz.cim}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{szakasz.leiras}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
            hianyzik === 0
              ? 'border-emerald-300 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300'
              : 'border-amber-300 text-amber-700 dark:border-amber-400/40 dark:text-amber-300'
          }`}
        >
          {db(szakasz.allapot.bekuldott.length)} / {db(megyeSzam)} felterjesztve
        </span>
      </div>

      <HianyBlokk allapot={szakasz.allapot} />

      {szakasz.penzugy && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Vegosszeg cimke="Összes bevétel" ertek={`${penz(szakasz.penzugy.osszBevetel)} RON`} />
            <Vegosszeg cimke="Összes kiadás" ertek={`${penz(szakasz.penzugy.osszKiadas)} RON`} />
            <Vegosszeg cimke="Egyenleg" ertek={`${penz(szakasz.penzugy.egyenleg)} RON`} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <KodTabla
              cim="Bevételek kódonként"
              sorok={szakasz.penzugy.bevetelSorok}
              vegosszeg={szakasz.penzugy.osszBevetel}
            />
            <KodTabla
              cim="Kiadások kódonként"
              sorok={szakasz.penzugy.kiadasSorok}
              vegosszeg={szakasz.penzugy.osszKiadas}
            />
          </div>
          <MegyeTabla sorok={szakasz.penzugy.megyenkent} />
        </>
      )}

      {szakasz.szamvevoi && <SzamvevoiBlokk szamvevoi={szakasz.szamvevoi} />}
    </section>
  )
}

/**
 * A HIÁNYZÓ és a VISSZAKÜLDÖTT egyházmegyék — NÉV SZERINT, mindkettő külön.
 *
 * MIÉRT KÜLÖN A KETTŐ: a „nem terjesztette fel" és az „elküldte, de mi
 * visszaküldtük javításra" két különböző teendő. Az elsőnél sürgetni kell, a
 * másodiknál a kerületnél van a labda. Összemosva mindkettő félrevezetne.
 *
 * ⚠️ Ez a blokk a NYOMTATVÁNYRA IS rákerül, és nincs összecsukva: a papíron egy
 *    lenyitható részlet nem létezik, és épp ez az az információ, ami nélkül a
 *    végösszeg félrevezető.
 *
 * ⚠️ A SZÖVEGES ÖSSZEFOGLALÓ A MAGBÓL JÖN (`hianyOsszefoglalo`), NEM ITT ÉPÜL.
 *    Javított tünet (2026-08-17): ez a blokk saját mondatot fűzött össze
 *    („{db} egyházmegye nem terjesztette fel" / „Javításra visszaküldve:"),
 *    miközben a mag pontosan erre exportál egy függvényt — amelynek a docblockja
 *    meg is TILTJA a duplikációt, mert így ugyanarra az összesítőre más-más
 *    mondatot látna a püspöki hivatal. A mag exportja addig holt kód volt. Ha
 *    egy „egyszerűsítés" vissza akarná írni a kézi mondatot: NE. A doboz és a
 *    két külön, név szerinti felsorolás marad — az a TEENDŐ szerinti bontás
 *    (sürgetni kell / a kerületnél van a labda), nem a mondat másolata.
 */
function HianyBlokk({ allapot }: { allapot: Allapot }) {
  // Lásd a SzakaszBlokk azonos indoklását: a „javítás alatt" eset is hiány.
  const hianyzik =
    allapot.hianyzo.length +
    allapot.visszakuldott.length +
    allapot.bekuldottDeVanVisszakuldott.length
  if (hianyzik === 0) {
    return (
      <p className="rounded-lg border border-emerald-300/60 bg-emerald-50/50 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
        A kerület minden egyházmegyéje felterjesztette ezt az iratot — az összeg teljes.
      </p>
    )
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
      {/* A KANONIKUS mondat — a magból. (A `?? ''` csak a fordítót nyugtatja: e
          ág futásakor van hiány, tehát a mag SOHA nem ad itt `null`-t.) */}
      <p className="font-semibold">{hianyOsszefoglalo(allapot) ?? ''}</p>
      {allapot.hianyzo.length > 0 && (
        <p>
          <strong>Nem terjesztette fel:</strong> {allapot.hianyzo.map((m) => m.nev).join(', ')}
        </p>
      )}
      {allapot.visszakuldott.length > 0 && (
        <p>
          <strong>Javításra visszaküldve:</strong>{' '}
          {allapot.visszakuldott.map((m) => m.nev).join(', ')}
        </p>
      )}
    </div>
  )
}

/**
 * Kódonkénti összesítő tábla.
 *
 * Az „Egyházmegye" oszlop azt mondja meg, HÁNY megye szerepeltetett összeget
 * ezen a kódon. Enélkül egy nagy szám mögött nem látszana, hogy egyetlen megye
 * adta-e az egészet, vagy tízen osztoznak rajta.
 */
function KodTabla({ cim, sorok, vegosszeg }: { cim: string; sorok: KodSor[]; vegosszeg: number }) {
  if (sorok.length === 0) {
    return (
      <div className="rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cim}</p>
        <p className="mt-1.5 text-sm italic text-muted-foreground">
          Erre a részre nincs felterjesztett adat.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {cim}
      </p>
      {/* A széles tábla SAJÁT görgetőben — az oldal törzse sosem görgethet
          oldalra (mobil-first követelmény). Nyomtatáskor a `gorgo` osztályról a
          magasság-korlát lekerül, hogy egyetlen sor se maradjon le a papírról. */}
      <div className="gorgo max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-muted-foreground">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-muted-foreground">Megnevezés</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">Megye</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">
                Összeg (RON)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorok.map((s) => (
              <tr key={`${s.tipus}-${s.kod}`}>
                <td className="p-2 font-mono text-xs text-muted-foreground">{s.kod}</td>
                <td className="p-2 text-foreground">{s.nev || '—'}</td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {db(s.megyeSzam)}
                </td>
                <td className="p-2 text-right tabular-nums text-foreground">{penz(s.osszeg)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="p-2 font-semibold text-foreground" colSpan={3}>
                Összesen
              </td>
              <td className="p-2 text-right font-semibold tabular-nums text-foreground">
                {penz(vegosszeg)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Egyházmegyénkénti bontás — a végösszeg mögötti tételes kép, a papíron is.
 *
 * A „(módosított terv)" jelölés a költségvetésnél szándékos: enélkül nem
 * derülne ki, hogy két megye száma nem ugyanabból az irat-állapotból származik.
 */
function MegyeTabla({ sorok }: { sorok: MegyeOsszeg[] }) {
  if (sorok.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Egyházmegyénkénti bontás ({db(sorok.length)} egyházmegye)
      </p>
      <div className="gorgo max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-muted-foreground">Egyházmegye</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">Bevétel</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">Kiadás</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">Egyenleg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorok.map((m) => (
              <tr key={m.id}>
                <td className="p-2 text-foreground">
                  {m.nev}
                  {m.modositassalSzamolt && (
                    <span className="text-muted-foreground">
                      {' '}
                      (módosított terv
                      {m.modositasSzam ? `, ${db(m.modositasSzam)}. módosítás` : ''})
                    </span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums text-foreground">{penz(m.bevetel)}</td>
                <td className="p-2 text-right tabular-nums text-foreground">{penz(m.kiadas)}</td>
                <td className="p-2 text-right tabular-nums text-foreground">{penz(m.egyenleg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * A SZÁMVEVŐI ÖSSZESÍTŐK kerületi képe.
 *
 * Itt a hiány KÉT szinten látszik: melyik MEGYE nem terjesztett fel összesítőt
 * (a szakasz hiány-blokkja), és a felterjesztett összesítőkből melyik
 * GYÜLEKEZET adata hiányzik (ez a blokk). A második nélkül egy hiánytalan
 * megye-névsor mögött is állhatna fél kerületnyi be nem adott gyülekezeti irat.
 */
function SzamvevoiBlokk({ szamvevoi }: { szamvevoi: Szamvevoi }) {
  if (szamvevoi.megyenkent.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Erre az évre még egyetlen egyházmegye sem terjesztett fel számvevői összesítőt, ezért a
        gyülekezeti szintről nincs kerületi képünk.
      </p>
    )
  }

  const hianyosMegyek = szamvevoi.megyenkent.filter(
    (m) => m.hianyzoGyulekezetek.length > 0 || m.visszakuldottGyulekezetek.length > 0,
  )

  return (
    <div className="space-y-3">
      {/* A KULCS-MUTATÓK a magból jönnek, FELIRATOSTUL.
          MIÉRT NEM ITT CÍMKÉZZÜK ŐKET: ha a képernyő találná ki a feliratokat,
          a papíron és a képernyőn más név állhatna ugyanarra a számra — a mag
          épp ezért ad `label` + `egyseg` párokat. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Kerületi kulcs-mutatók
        </p>
        <div className="gorgo max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40">
              <tr>
                <th className="p-2 text-left text-xs font-medium text-muted-foreground">Mutató</th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">
                  Összesen
                </th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">Megye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {szamvevoi.mutatok.map((m) => (
                <tr key={m.id}>
                  <td className="p-2 text-foreground">{m.label}</td>
                  <td className="p-2 text-right tabular-nums text-foreground">
                    {/* A pénz két tizedessel, a darab/fő tizedes nélkül — a
                        mértékegységet a mag mondja meg, nem a képernyő találgatja. */}
                    {m.egyseg === 'RON' ? penz(m.osszeg) : db(m.osszeg)}
                    {m.egyseg ? ` ${m.egyseg}` : ''}
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {db(m.megyeSzam)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {szamvevoi.hianyzoGyulekezetSzam > 0 && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          A felterjesztett megyei összesítőkből <strong>{db(szamvevoi.hianyzoGyulekezetSzam)}</strong>{' '}
          gyülekezeti SZÁMADÁS hiányzik vagy lett visszaküldve — ezek NINCSENEK benne a fenti
          kerületi számokban. (A szám a megyei összesítők számadás-állapotából jön; a többi
          irattípus hiányát a megyei összesítők külön mutatják.)
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Egyházmegyénként ({db(szamvevoi.megyenkent.length)} felterjesztett összesítő)
        </p>
        <div className="gorgo max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40">
              <tr>
                <th className="p-2 text-left text-xs font-medium text-muted-foreground">
                  Egyházmegye
                </th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">
                  Gyülekezet
                </th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">Bevétel</th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">Kiadás</th>
                <th className="p-2 text-right text-xs font-medium text-muted-foreground">
                  Jogosult
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {szamvevoi.megyenkent.map((m) => (
                <tr key={m.id}>
                  <td className="p-2 text-foreground">{m.nev}</td>
                  <td className="p-2 text-right tabular-nums text-foreground">
                    {db(m.bekuldottGyulekezetSzam)} / {db(m.gyulekezetSzam)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-foreground">{penz(m.bevetel)}</td>
                  <td className="p-2 text-right tabular-nums text-foreground">{penz(m.kiadas)}</td>
                  <td className="p-2 text-right tabular-nums text-foreground">
                    {db(m.valasztoFo)} fő
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* A hiány GYÜLEKEZET-szinten, név szerint — a megye saját, felterjesztett
          összesítője szerint. Ez már nem „a gyülekezet adata": ez az, amit az
          egyházmegye maga írt bele a hivatalos csomagba. */}
      {hianyosMegyek.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          <p className="font-semibold">
            Hiányzó gyülekezeti adatok a felterjesztett megyei összesítőkben:
          </p>
          {hianyosMegyek.map((m) => (
            <p key={m.id}>
              <strong>{m.nev}:</strong>
              {m.hianyzoGyulekezetek.length > 0
                ? ` nem küldte be — ${m.hianyzoGyulekezetek.join(', ')}`
                : ''}
              {m.hianyzoGyulekezetek.length > 0 && m.visszakuldottGyulekezetek.length > 0
                ? ' ·'
                : ''}
              {m.visszakuldottGyulekezetek.length > 0
                ? ` javításra visszaküldve — ${m.visszakuldottGyulekezetek.join(', ')}`
                : ''}
            </p>
          ))}
        </div>
      )}

    </div>
  )
}

function Vegosszeg({ cimke, ertek }: { cimke: string; ertek: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {cimke}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{ertek}</p>
    </div>
  )
}

/**
 * ALÁÍRÁS-ROVAT — a hivatalos irat záró blokkja.
 *
 * A kerületi aláírók a `districts` törzsadatból jönnek: a PÜSPÖK (a saját
 * tisztség-szövegével) és a kerületi ADMINISZTRÁTOR. A SZÁMVEVŐ csak akkor kap
 * rovatot, ha van neve rögzítve — nem minden egyházkerületnél van kiosztva, és
 * egy örökké üres rovat azt sugallná, hogy hiányzik egy aláírás.
 *
 * A rovat AKKOR IS kikerül a papírra, ha a NÉV hiányzik: üres vonal a tisztség
 * felirata fölött — ez a kézzel aláírható nyomtatvány.
 */
function AlairasRovat({ alairok }: { alairok?: OldalAdat['alairok'] }) {
  const rovatok: Array<{ nev: string | null; tisztseg: string }> = [
    { nev: alairok?.puspokNev ?? null, tisztseg: alairok?.puspokCim || 'püspök' },
    { nev: alairok?.adminisztratorNev ?? null, tisztseg: 'egyházkerületi adminisztrátor' },
  ]
  if (alairok?.szamvevoNev) {
    rovatok.push({ nev: alairok.szamvevoNev, tisztseg: 'egyházkerületi számvevő' })
  }

  return (
    <div className="alairas-rovat grid gap-6 pt-10 sm:grid-cols-3">
      {rovatok.map((r) => (
        <div key={r.tisztseg} className="border-t border-foreground/50 pt-1.5 text-center">
          <p className="min-h-5 text-sm font-medium text-foreground">{r.nev || ''}</p>
          <p className="text-[11px] text-muted-foreground">{r.tisztseg}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * FAIL-CLOSED üres állapot: kerületi szintű felhasználó, akinek NEM oldható fel
 * az egyházkerület-hatóköre. Ilyenkor SOHA nem mutatunk „minden kerület"
 * összesítőt — az más kerületek egyházmegyéinek hivatalos számait szivárogtatná.
 *
 * (Testvér-példánya a `felterjesztesek/page.tsx`-ben él. Amikor az S4 mindkét
 * lapja elkészült, a kettőt érdemes közös komponensbe emelni — a megyei ág
 * `MissingDioceseScopeNotice`-ának mintájára; most a párhuzamos munka miatt
 * marad helyben.)
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
              A kerületi összesítő EGY egyházkerület hivatalos irata, ezért csak akkor számolható
              ki, ha a szerepköréhez konkrét egyházkerület tartozik. Jelenleg a fiókjához nem
              sikerült egyházkerületet feloldani, ezért — az egyházmegyék hivatalos iratainak
              védelme érdekében — nem jelenítünk meg összesítést.
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
