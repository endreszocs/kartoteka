'use client'

/**
 * A MENTÉS-FUTÁS BESZÉDES JELENTÉSE (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A KOMPONENS
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 2026-08-11-én ennyit látott a „Mentés most" után:
 *
 *     „A biztonsági mentés futása sikertelen."
 *
 * Egyetlen mondat, se lépés, se ok, se teendő. Közben a szerver PONTOSAN tudta
 * a hibát. Ez a komponens azt mutatja meg, amit eddig eldobtunk:
 *
 *   1) MEDDIG JUTOTT a futás — lépésenként, és az első bukott lépés KIEMELVE,
 *   2) MIT JELENT ÉS MIT TEGYEN — egy magyar mondat, tegezve,
 *   3) HOL TART — hány hatókör kész, hány bukott, hány van még hátra,
 *   4) a pontos technikai ok — de csak összecsukva, „Részletek" alatt, hogy a
 *      lényeget ne nyomja el.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ ÖT LÉPÉS-ÁLLAPOT KÜLÖNBÖZIK, ÉS EZ NEM KOZMETIKA
 * ════════════════════════════════════════════════════════════════════════════
 *      pipa          = kész,
 *      háromszög     = megtörtént, de HIÁNYOSAN (nem állítja meg a futást),
 *      pörgő karika  = FOLYAMATBAN, még nem végeztünk vele (több szelet),
 *      kereszt       = ITT bukott el — ez és KIZÁRÓLAG ez a hiba,
 *      vonás         = „idáig el sem jutottunk".
 *
 * ⚠️ 2026-08-11 JAVÍTÁS. Korábban három állapot volt, és az `ok: false` KÉT
 *    ártatlan dolgot is jelölt: a „még nem végeztünk vele"-t (784 hatókörnél
 *    MINDEN köztes szelet ilyen!) és a „hiányzik, de nem végzetes"-t. Emiatt a
 *    lelkész egy hibátlan, haladó futás közben PIROS KERESZTET látott, a
 *    képernyőolvasó pedig szó szerint azt mondta: „— ITT HIBÁZOTT" — nulla hiba
 *    mellett. Ugyanez történt egy ZÖLD, sikeres readiness-jelentésben is a
 *    „Helyreállító kulcs ellenőrzése" soron. Ez pontosan az a néma féligazság,
 *    ami ellen ez az egész kör szól, csak fordítva: hibát állított oda, ahol
 *    nem volt.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * KONTRASZT — MIÉRT NINCS ITT `text-destructive` ÉS `text-muted-foreground`
 * ════════════════════════════════════════════════════════════════════════════
 * A hiba-doboz `bg-destructive/10` tintre van festve, és a `page.tsx` szerint
 * nincs kártya-burkolata — vagyis a tint az OLDALHÁTTÉRRE keveredik. Ezen a
 * tinten MÉRVE:
 *   · `text-destructive`      → kert-világos 3,72:1 (az ÉLES alapértelmezés),
 *                               zsoltáros-világos 4,18, parókia-világos 4,40,
 *                               kert-sötét 4,32 — HATBÓL NÉGY téma AA-bukás,
 *   · `text-muted-foreground` → mindhárom világos témában 4,26–4,30:1 — bukás
 *                               (a token a KÁRTYÁRA van kalibrálva, a piros
 *                               tint viszont sötétebb, mint amire számít),
 *   · `text-muted-foreground/60` (a „vonás" ikon) → 2,21:1, a grafikus elemekre
 *                               előírt 3:1 (WCAG 1.4.11) alatt — telefonon,
 *                               változó fényben, 55+ éves szemmel láthatatlan.
 *
 * Ezért a doboz SZÖVEGSZÍNE `text-foreground` (11,6:1 a mért tinten), a piros
 * pedig a KERETET és az IKONT festi — ott 3:1 a küszöb, azt teljesíti. A
 * másodlagos szöveg nem külön tokent kap, hanem a doboz saját színének
 * halványítását (`opacity-80`) — így a mérés mindig a doboz TÉNYLEGES
 * hátteréhez igazodik, nem egy másik felülethez kalibrált tokenhez.
 *
 * ⛔ Titok (token, kulcs, jelszó, Google `code`) SOHA nem kerülhet ide — a
 *    szerver oldali szövegek már tisztítottak, ez a réteg csak megjeleníti őket.
 */

import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Lightbulb,
  Minus,
  X,
} from 'lucide-react'

import type {
  MentesFutasEredmeny,
  MentesLepes,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

interface Props {
  eredmeny: MentesFutasEredmeny
  /** Fut-e még (a haladás-jelző ilyenkor „folyamatban"-t mond). */
  fut?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// A LÉPÉS-ÁLLAPOTOK
// ─────────────────────────────────────────────────────────────────────────────

type LepesAllapot = 'kesz' | 'hianyos' | 'folyamatban' | 'bukott' | 'nem_ert_ide'

function lepesAllapot(ok: MentesLepes['ok']): LepesAllapot {
  if (ok === true) return 'kesz'
  if (ok === false) return 'bukott'
  if (ok === 'figyelmeztetes') return 'hianyos'
  if (ok === 'folyamatban') return 'folyamatban'
  return 'nem_ert_ide'
}

/**
 * Ikon + LÁTHATÓ szó minden állapothoz.
 *
 * ⚠️ A `latszik: true` nem díszítés. Korábban az állapotot KIZÁRÓLAG az ikon
 *    alakja hordozta (a magyarázat `sr-only` volt), vagyis a látó felhasználó
 *    számára a megkülönböztetés nem valósult meg — a „vonás" ikon ráadásul
 *    2,21:1-gyel gyakorlatilag láthatatlan volt. Egy információt nem hordozhat
 *    egyedül a szín vagy a forma (WCAG 1.4.1).
 *
 * ⚠️ Az ikon-színek a `bg-destructive/10` tinten mérve mind ≥3:1 (WCAG 1.4.11):
 *    emerald-700 4,26 · destructive 3,72 · amber-700 3,90 · a halványított
 *    doboz-szín (opacity-70) 4,96.
 */
const ALLAPOT_JELOLES: Record<
  LepesAllapot,
  {
    Ikon: typeof Check
    ikonOszt: string
    szo: string
    /** Megjelenjen-e a szó a KÉPERNYŐN is, vagy csak a képernyőolvasónak? */
    latszik: boolean
    /** Pörögjön-e az ikon (csak a „folyamatban" állapotnál). */
    forog?: boolean
  }
> = {
  // A pipa a VÁRT állapot: nyolc soron kiírva csak zaj lenne, ezért csak a
  // képernyőolvasó kapja meg szóban.
  kesz: {
    Ikon: Check,
    ikonOszt: 'text-emerald-700 dark:text-emerald-300',
    szo: 'kész',
    latszik: false,
  },
  hianyos: {
    Ikon: AlertTriangle,
    ikonOszt: 'text-amber-700 dark:text-amber-300',
    szo: 'rendben, de hiányos',
    latszik: true,
  },
  folyamatban: {
    Ikon: CircleDashed,
    ikonOszt: 'opacity-80',
    szo: 'folyamatban, még nem végzett',
    latszik: true,
    forog: true,
  },
  bukott: {
    Ikon: X,
    ikonOszt: 'text-destructive',
    szo: 'ITT HIBÁZOTT',
    latszik: true,
  },
  nem_ert_ide: {
    Ikon: Minus,
    ikonOszt: 'opacity-70',
    szo: 'idáig nem jutottunk el',
    latszik: true,
  },
}

/** Egy lépés sora: ikon + címke + állapot-szó + rövid tény. */
function LepesSor({ lepes, kiemelt }: { lepes: MentesLepes; kiemelt: boolean }) {
  const allapot = lepesAllapot(lepes.ok)
  const j = ALLAPOT_JELOLES[allapot]
  const { Ikon } = j

  return (
    <li
      className={[
        'flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
        // ⚠️ A kiemelés NEM `text-destructive`: a piros szöveg a piros tinten
        //    3,30:1-et adna (a tint duplán keveredne). A hangsúlyt a gyűrű, a
        //    sötétebb tint és a félkövér szedés viszi — a szín csak kíséri.
        kiemelt ? 'bg-destructive/15 font-semibold ring-1 ring-destructive/40' : '',
      ].join(' ')}
    >
      <Ikon
        className={['size-4 shrink-0', j.ikonOszt, j.forog ? 'animate-spin' : ''].join(' ')}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {lepes.cimke}
        {j.latszik ? (
          <span className="ml-1.5 whitespace-nowrap text-xs font-normal opacity-80">
            — {j.szo}
          </span>
        ) : (
          <span className="sr-only"> — {j.szo}</span>
        )}
        {lepes.reszlet ? (
          <span className="ml-1.5 font-normal opacity-80">({lepes.reszlet})</span>
        ) : null}
      </span>
    </li>
  )
}

function Lepeslista({ lepesek, cim }: { lepesek: MentesLepes[]; cim: string }) {
  // ⚠️ KIZÁRÓLAG a szigorú `=== false` a bukás. A „folyamatban" és a
  //    „figyelmeztetés" NEM az — különben a kiemelés újra egy hibátlan futásra
  //    mutatna rá.
  const elsoBukott = lepesek.find((l) => l.ok === false)
  return (
    <ul aria-label={cim} className="mt-2 space-y-0.5">
      {lepesek.map((l) => (
        <LepesSor key={l.id} lepes={l} kiemelt={elsoBukott ? l.id === elsoBukott.id : false} />
      ))}
    </ul>
  )
}

export function BackupRunReport({ eredmeny, fut = false }: Props) {
  const [reszletekNyitva, setReszletekNyitva] = useState(false)

  const sikeres = eredmeny.success
  const osszes = eredmeny.osszes ?? 0
  const kesz = (eredmeny.sikeres ?? 0) + (eredmeny.kihagyva ?? 0)
  const hatralevo = eredmeny.hatralevo ?? 0
  const vanHaladas = osszes > 0
  const szazalek = vanHaladas ? Math.min(100, Math.round((kesz / osszes) * 100)) : 0

  // ⚠️ A BEFEJEZETLEN FUTÁS NEM ZÖLD. Ha maradt hátra hatókör, borostyán színt
  //    kap: a szelet elvégezte a dolgát, de a mentés MÉG NEM teljes. Zöld csak
  //    akkor jár, ha végigment.
  // ⚠️ A hiba-ág szövegszíne `text-foreground`, NEM `text-destructive`: az
  //    utóbbi hat témavariánsból négyben AA-bukás ezen a tinten (lásd a fájl
  //    fejlécét). A piros a keretet és a fejléc-ikont festi.
  const szin = !sikeres
    ? 'border-destructive/40 bg-destructive/10 text-foreground'
    : hatralevo > 0
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100'
      : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'

  const vanReszlet =
    Boolean(eredmeny.reszlet) ||
    (eredmeny.figyelmeztetesek?.length ?? 0) > 0 ||
    (eredmeny.bukottak?.length ?? 0) > 0

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * KÉPERNYŐOLVASÓ: RITKÁN VÁLTOZÓ, RÖVID ÖSSZEFOGLALÓ (2026-08-11)
   * ════════════════════════════════════════════════════════════════════════════
   * ⚠️ MIÉRT NEM AZ EGÉSZ SZEKCIÓ ÉLŐ RÉGIÓ. Korábban a TELJES jelentés
   *    `role="status"` volt (implicit `aria-live="polite"`): fő mondat +
   *    haladás-sor + „Mit tegyél?" + a nyolc lépéses lista. Amíg a mentés a
   *    böngészőből futott, ez négypercenként változott. Mostantól a panel négy
   *    MÁSODPERCENKÉNT kérdezi az állapotot, és minden befejezett hatókörnél
   *    (≈18 másodperc) új szöveget ír bele — egy négyórás futás alatt ez ~800
   *    teljes bekezdés-felolvasás. A képernyőolvasót használó tulajdonos így
   *    egyszerűen NEM TUDNÁ HASZNÁLNI az oldalt, amíg a mentése dolgozik.
   *
   * Ezért az élő régió egy KIS, önmagában is értelmes mondat, ami futás közben
   * csak TÍZ SZÁZALÉKONKÉNT változik. A vizuális frissítés marad 4 másodperces:
   * a szem elviseli, a fül nem.
   */
  const lepcsosSzazalek = Math.floor(szazalek / 10) * 10
  const elhangzo = fut
    ? vanHaladas
      ? `A mentés fut: nagyjából ${lepcsosSzazalek} százalék kész, ${osszes} hatókörből.`
      : 'A mentés fut a szerveren.'
    : (sikeres ? eredmeny.uzenet : eredmeny.error) ?? 'A mentés futása véget ért.'

  return (
    <section
      aria-label="A mentés futásának jelentése"
      className={['space-y-3 rounded-2xl border p-3 text-sm leading-relaxed sm:p-4', szin].join(' ')}
    >
      {/* Az EGYETLEN élő régió ezen a jelentésen. Vizuálisan rejtett: a látó
          felhasználó ugyanezt a lenti mondatban és a haladás-sávon olvassa. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {elhangzo}
      </p>

      {/* A LÉNYEG — egy mondat. Hibánál PIROS HÁROMSZÖG kíséri: a rossz hírt
          nem csak a (kontraszt miatt már nem piros) szöveg hordozza. */}
      <p className="flex items-start gap-2 font-semibold">
        {!sikeres ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        ) : null}
        <span className="min-w-0 flex-1">
          {sikeres ? (eredmeny.uzenet ?? 'Lefutott.') : (eredmeny.error ?? 'Nem sikerült.')}
        </span>
      </p>

      {/* HALADÁS — hány hatókör kész a 784-ből */}
      {vanHaladas ? (
        <div className="space-y-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={osszes}
            aria-valuenow={kesz}
            aria-label={`Haladás: ${kesz} hatókör kész a(z) ${osszes} hatókörből`}
          >
            <div
              className="h-full rounded-full bg-current transition-[width] duration-500"
              style={{ width: `${szazalek}%` }}
            />
          </div>
          <p className="text-xs font-medium">
            {kesz} / {osszes} hatókör kész ({szazalek}%)
            {(eredmeny.sikertelen ?? 0) > 0 ? ` · ${eredmeny.sikertelen} elbukott` : ''}
            {hatralevo > 0 ? ` · ${hatralevo} hátravan` : ''}
            {fut ? ' · folyamatban…' : ''}
          </p>
        </div>
      ) : null}

      {/* MIT TEGYEN — ez a legfontosabb sor egy hibánál.
          ⚠️ A belső háttér `bg-foreground/5`, NEM `bg-background/50`: az utóbbi
             VILÁGOSÍTOTTA a tintet, vagyis a felület legfontosabb mondata lett
             a legrosszabbul olvasható eleme (kert-világoson 3,99:1). */}
      {eredmeny.teendo ? (
        <div className="flex items-start gap-2 rounded-xl border border-current/25 bg-foreground/5 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">Mit tegyél?</p>
            <p className="mt-0.5 font-normal">{eredmeny.teendo}</p>
            {eredmeny.sqlFajl ? (
              <p className="mt-1.5 break-all rounded-lg bg-foreground/5 px-2 py-1.5 font-mono text-xs">
                {eredmeny.sqlFajl}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* MEDDIG JUTOTT — a lépés-lista */}
      {eredmeny.lepesek && eredmeny.lepesek.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Meddig jutott a futás
          </p>
          <Lepeslista lepesek={eredmeny.lepesek} cim="A mentés-futás lépései" />
        </div>
      ) : null}

      {/* RÉSZLETEK — összecsukva, hogy a lényeget ne nyomja el */}
      {vanReszlet ? (
        <div>
          <button
            type="button"
            onClick={() => setReszletekNyitva((v) => !v)}
            aria-expanded={reszletekNyitva}
            aria-label={
              reszletekNyitva
                ? 'A technikai részletek elrejtése'
                : 'A technikai részletek megmutatása'
            }
            className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold underline-offset-2 hover:underline"
          >
            {reszletekNyitva ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            )}
            Részletek
          </button>

          {reszletekNyitva ? (
            <div className="mt-2 space-y-3 rounded-xl bg-foreground/5 p-3">
              {eredmeny.reszlet ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    A pontos technikai ok
                  </p>
                  <p className="mt-1 break-words font-mono text-xs leading-relaxed">
                    {eredmeny.reszlet}
                  </p>
                </div>
              ) : null}

              {eredmeny.figyelmeztetesek && eredmeny.figyelmeztetesek.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    Figyelmeztetések ({eredmeny.figyelmeztetesek.length})
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                    {eredmeny.figyelmeztetesek.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {eredmeny.bukottak && eredmeny.bukottak.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    Elbukott hatókörök ({eredmeny.bukottak.length})
                  </p>
                  <ul className="mt-1 space-y-3">
                    {eredmeny.bukottak.map((b, i) => (
                      <li key={i} className="rounded-lg border border-current/20 p-2.5">
                        <p className="font-semibold">
                          {b.nev ?? (b.scope === 'globalis' ? 'Rendszerszintű mentés' : 'Ismeretlen')}
                        </p>
                        {b.hiba ? (
                          <p className="mt-1 break-words font-mono text-xs leading-relaxed">
                            {b.hiba}
                          </p>
                        ) : null}
                        {b.teendo ? <p className="mt-1 text-xs">{b.teendo}</p> : null}
                        {b.lepesek && b.lepesek.length > 0 ? (
                          <Lepeslista
                            lepesek={b.lepesek}
                            cim={`A(z) ${b.nev ?? 'hatókör'} mentésének lépései`}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Ha még fut, de nincs mit mutatni, legalább egy jel legyen róla */}
      {fut && !vanHaladas ? (
        <p className="flex items-center gap-2 text-xs">
          <CircleDashed className="size-3.5 animate-spin" aria-hidden />
          A szelet fut…
        </p>
      ) : null}
    </section>
  )
}
