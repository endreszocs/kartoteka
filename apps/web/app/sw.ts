/// <reference lib="webworker" />
/**
 * Service Worker — KARTOTEKA offline-first PWA
 *
 * Ezt a fájlt a `@serwist/next` build-time fordítja le `public/sw.js`-re.
 * A runtime cache stratégiák:
 *  - Statikus assetek (JS/CSS/kép/betűkészlet) → CacheFirst / StaleWhileRevalidate
 *    (ez az ALKALMAZÁS-HÉJ — ennek cache-elhetőnek KELL maradnia)
 *  - A hitelesített felület ADAT-válaszai → NetworkOnly (lásd lentebb)
 *  - A publikus `/gy/` gyülekezeti oldal → marad offline-elhető
 *  - Supabase API → NetworkOnly (mert a Dexie + sync orchestrator kezeli)
 *  - Google Fonts → StaleWhileRevalidate
 *
 * Offline navigáció esetén az ADATMENTES tartalék lap felel
 * (`public/nincs-internet.html`, Serwist `fallbacks`) — lásd lentebb.
 */

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist build injekciója — a precache manifest-et tartalmazza
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// 2026-04-27 FIX: az auth-útvonalak (login, register, callback, oauth-complete)
// SOSE menjenek SW cache-be — ezek 302 redirect-tel záródnak (Supabase OAuth flow),
// és a Serwist NetworkFirst nem kezeli jól a redirect-eket. A "no-response"
// SW-hiba és a megzavart Google OAuth callback ez okozta.
const authRouteCaching: RuntimeCaching = {
  matcher: ({ url, request }) =>
    request.mode === 'navigate'
    && (
      url.pathname.startsWith('/login')
      || url.pathname.startsWith('/hozzaferes-kerese')
      || url.pathname.startsWith('/auth/callback')
      || url.pathname.startsWith('/oauth-complete')
      || url.pathname.startsWith('/forgot-password')
      || url.pathname.startsWith('/api/auth')
    ),
  handler: new NetworkOnly(),
}

/* ══════════════════════════════════════════════════════════════════════════
   2026-08-24 ADATVÉDELMI JAVÍTÁS — A HITELESÍTETT FELÜLET ADATA NEM MEHET
   LEMEZRE
   ══════════════════════════════════════════════════════════════════════════
   MI VOLT A BAJ
   A `runtimeCaching: [authRouteCaching, ...defaultCache]` VÁLOGATÁS NÉLKÜL
   átvette a @serwist/next alapkészletét. Abban négy NetworkFirst szabály
   ADATOT tesz a Cache Storage-be, 24 órára:

     · `pages-rsc-prefetch` / `pages-rsc` — minden azonos eredetű, `RSC: 1`
       fejlécű kérés. Az RSC-payload maga a kirenderelt szerver-komponens
       ADATA: névsorok, CNP, pénzügyi sorok.
     · `pages` — a HTML dokumentumok. (Megjegyzés: ez a bejegyzés a KÉRÉS
       `Content-Type` fejlécét nézi, amit a böngésző navigációnál nem küld —
       ezért a gyakorlatban SOHA nem fogott, és a szerveren kirenderelt HTML
       valójában az `others` cache-be esett. A leletet ez nem enyhíti, csak
       áthelyezi: ezért nem elég a négy nevet kiszűrni, kell a lenti
       NetworkOnly szabály is.)
     · `apis` — minden azonos eredetű `/api/*` GET, ráadásul
       `networkTimeoutSeconds: 10`-zel: lassú hálón a 10. másodperc után a
       LEMEZRŐL jött vissza a válasz.

   A `authRouteCaching` ezen nem segített: az a `request.mode === 'navigate'`
   feltételhez van kötve, az RSC-prefetch pedig nem navigáció.

   A HELYES ELVÁRÁS: közös hivatali gépen a kartoték adatai ne maradjanak
   olvasható fájlként a lemezen. (A kijelentkezéskori ürítést egy korábbi kör
   már megcsinálta — `lib/utils/helyi-tarolo-urites.ts`; de az csak akkor
   véd, ha a felhasználó tényleg kijelentkezik.)

   A JAVÍTÁS KÉT LÁBON ÁLL
   (1) `hitelesitettAdatCaching` — egy NetworkOnly szabály MINDEN alap-
       szabály ELŐTT. Ez fogja az azonos eredetű dokumentum-, RSC- és
       `/api/*` kéréseket. Ez a NÉVTŐL FÜGGETLEN védelem: akkor is áll, ha a
       @serwist/next átnevezi vagy átrendezi a saját cache-eit, és fogja azt
       is, ami eddig az `others` gyűjtőbe csúszott.
   (2) `adatCacheNelkuliAlap` — a négy adat-cache NÉV SZERINTI kiszűrése az
       alapkészletből (öv és nadrágtartó).

   AMI SZÁNDÉKOSAN CACHE-ELHETŐ MARAD
   · az ALKALMAZÁS-HÉJ: `/_next/static/**` JS/CSS, ikonok, betűkészletek,
     képek, hangok, videók — enélkül az app offline el sem indulna;
   · a PUBLIKUS `/gy/` gyülekezeti oldal (dokumentum és RSC egyaránt): ott
     nincs hitelesített adat, és kifejezett elvárás, hogy offline is menjen.

   ⚠️ A `/gy/` NEM TELJESEN PUBLIKUS — a TAGI ALOLDALAK KIVÉTELEK
   A `/gy/<slug>/tagi-fiok` a bejelentkezett tag SAJÁT adatait rendereli
   szerver-oldalon (áttekintő, adatmódosítási kérelmek, hírlevél-beállítás),
   a `/gy/<slug>/tagi-portal` pedig a hozzá tartozó belépési/megerősítési
   folyamat (átirányításokkal — pont az a fajta válasz, ami 2026-04-27-én az
   OAuth-callbacket is megzavarta). Ez a két ág ezért a HITELESÍTETT oldalra
   tartozik: nem mehet lemezre. A `magazin`, `posts`, `rolunk` és maga a
   gyülekezeti főoldal publikus marad.

   ⚠️ VISELKEDÉS-VÁLTOZÁS (Endrének tudnia kell róla)
   A hitelesített felület oldalai OFFLINE már nem nyílnak meg a lemezről.
   Eddig egy korábban meglátogatott oldal (pl. a tagnyilvántartás) offline is
   megjelent — az elavult, lemezre írt HTML/RSC-ből. Ez volt maga a lelet.
   (2026-08-25 óta ilyenkor a lenti ADATMENTES tartalék lap fogadja a
   lelkészt — de a kartoték-adat továbbra sem jelenik meg offline.)
   Ami NEM változik: a Dexie/IndexedDB offline tükör, a feltöltésre váró sor
   és a szinkron (`lib/offline/**`) érintetlen — az offline ADAT ott van, nem
   a Cache Storage RSC-jében.

   TOVÁBBLÉPÉS — 2026-08-25-ÓTA MEGVAN: a Serwist `fallbacks` opciójával egy
   ADATMENTES offline lap van precache-elve. Az nem adatszivárgás, mert nincs
   benne kartoték-adat. A részletek a következő blokkban.
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   2026-08-25 — ADATMENTES OFFLINE TARTALÉK LAP (a fenti „továbblépés")
   ══════════════════════════════════════════════════════════════════════════
   MI VOLT A BAJ
   A fenti javítás ára az volt, hogy internet nélkül a böngésző CSUPASZ
   HIBAOLDALA fogadta a lelkészt („Nem érhető el az oldal"). A rendszer
   közben offline-first PWA-nak nevezi magát — a felület tehát többet ígért,
   mint amit a kód adott.

   A JAVÍTÁS
   A Serwist `fallbacks` opciója egy PRECACHE-ELT lapot ad vissza, amikor egy
   stratégia nem tud választ előállítani (offline: a `NetworkOnly` `fetch`-e
   eldobja magát). A `PrecacheFallbackPlugin` minden olyan `runtimeCaching`
   bejegyzés handlerére felkerül, amelynek még nincs `handlerDidError`
   bővítménye — vagyis a mi NetworkOnly szabályainkra is.

   MIÉRT STATIKUS FÁJL, ÉS NEM EGY NEXT-OLDAL
   A tartalék lapot LEMEZRE kell írni (precache), különben offline maga sem
   érhető el. Ezért CSAK olyan lap jöhet szóba, amiben garantáltan nincs
   személyes adat. Egy Next-oldal — az `/offline` is — a `(dashboard)`
   layouton keresztül a bejelentkezett felhasználó teljes `profile` sorát és
   a gyülekezet nevét is beleadja a payloadba (layout.tsx: `profile={profile}`,
   `congregationName`), tehát a „csak a váz" NEM igaz rá: precache-elve
   visszacsempésznénk a személyes adatot a lemezre. A `public/` alatti
   statikus fájlba viszont sem a build, sem a szerver nem interpolál semmit.

   HÁROM DOLOG KELL EGYÜTT (ha bármelyik hiányzik, a lap NÉMÁN nem működik):
    (1) a fájl:            apps/web/public/nincs-internet.html
    (2) a precache-lista:  next.config.ts → `globPublicPatterns`
                           (a lista POZITÍV: ami nincs benne, nincs a lemezen)
    (3) a proxy-kihagyás:  apps/web/proxy.ts matcher — különben a Supabase
                           `updateSession` a bejelentkezetlen kérést a
                           `/login`-ra irányítja, és a precache a LOGIN-OLDALT
                           tenné el tartaléknak (a SW első telepítése tipikusan
                           épp a bejelentkezés előtt történik).
   Mindhármat visszaméri: scripts/selftest-sw-cache.mjs

   MIRE SZÓL, ÉS MIRE NEM
   CSAK dokumentum-kérésre (navigáció). Az RSC-payloadra és a `/api/*` GET-re
   SZÁNDÉKOSAN nem: egy HTML-lap RSC-válaszként visszaadva a Next útválasztóját
   zavarná össze, `/api`-válaszként pedig a hívó kódot. Ezek maradnak hibásak —
   az alkalmazás saját hibakezelése látja el őket.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Az ADATMENTES offline tartalék lap. Statikus fájl a `public/` alatt —
 * a build ideje alatt sem kerül bele semmilyen adat.
 */
const OFFLINE_TARTALEK_URL = '/nincs-internet.html'

/** A publikus gyülekezeti oldal előtagja — ez offline-elhető MARAD. */
const PUBLIKUS_ELOTAG = '/gy/'

/**
 * A `/gy/<slug>/` alatti HITELESÍTETT ágak: a tag saját fiókja és a hozzá
 * tartozó belépési folyamat. Ezek NEM publikusak — lásd a fenti magyarázatot.
 */
const TAGI_SZEGMENSEK: readonly string[] = ['tagi-fiok', 'tagi-portal']

/** Az alkalmazás-héj build-assetjei — ezek cache-elhetők MARADNAK. */
const APP_HEJ_ELOTAG = '/_next/static/'

/**
 * Dokumentum-kérés-e (teljes oldalbetöltés / navigáció)?
 *
 * KÖZÖS definíció: ugyanez dönti el, hogy a kérés a hitelesített adat-szabály
 * alá esik-e, ÉS hogy offline megkapja-e a tartalék lapot. A kettőnek egyeznie
 * kell — különben van olyan kérés, amit a hálózatra engedünk, de hiba esetén
 * a csupasz böngésző-hibaoldal fogad.
 */
function dokumentumKeres(request: Request): boolean {
  return request.mode === 'navigate' || request.destination === 'document'
}

/** Publikus gyülekezeti útvonal-e (a tagi aloldalak NEM azok)? */
function publikusGyulekezetiUt(utvonal: string): boolean {
  if (!utvonal.startsWith(PUBLIKUS_ELOTAG)) return false
  // ['gy', '<slug>', '<szakasz>', …]
  const harmadikSzegmens = utvonal.split('/').filter(Boolean)[2] ?? ''
  return !TAGI_SZEGMENSEK.includes(harmadikSzegmens)
}

/**
 * A @serwist/next alapkészletének ADAT-cache-ei. A neveket a
 * `node_modules/@serwist/next/dist/index.worker.js` rögzíti; az önellenőrzés
 * (scripts/selftest-sw-cache.mjs) visszaméri, hogy tényleg léteznek — ha a
 * csomag átnevezi őket, a mérce elbukik, nem némán elsiklik felette.
 */
const ADAT_CACHE_NEVEK: readonly string[] = [
  'pages-rsc-prefetch',
  'pages-rsc',
  'pages',
  'apis',
]

/** Egy runtime-caching bejegyzés cache-neve (ha a handler stratégia-objektum). */
function futasideiCacheNev(bejegyzes: RuntimeCaching): string | null {
  const kezelo = bejegyzes.handler as { cacheName?: unknown } | undefined
  return typeof kezelo?.cacheName === 'string' ? kezelo.cacheName : null
}

/** Az alapkészlet a négy adat-cache NÉLKÜL. */
const adatCacheNelkuliAlap: RuntimeCaching[] = defaultCache.filter(bejegyzes => {
  const nev = futasideiCacheNev(bejegyzes)
  return nev === null || !ADAT_CACHE_NEVEK.includes(nev)
})

/**
 * A hitelesített felület ADAT-válaszai: SOHA nem mennek lemezre.
 *
 * Mit fog:
 *  · dokumentum-kérés (navigáció) — a szerveren kirenderelt HTML,
 *  · RSC-payload (`RSC: 1` fejléc, `Next-Router-Prefetch`, `?_rsc=` paraméter),
 *  · azonos eredetű `/api/*` (a Serwist alapból csak a GET-et irányítja).
 *
 * Mit NEM fog (marad cache-elhető):
 *  · a publikus `/gy/` oldal (a tagi aloldalak KIVÉTELÉVEL),
 *  · az alkalmazás-héj (`/_next/static/**`) és minden egyéb statikus asset
 *    (JS, CSS, kép, betűkészlet) — azok se nem dokumentumok, se nem RSC.
 */
const hitelesitettAdatCaching: RuntimeCaching = {
  matcher: ({ request, url, sameOrigin }) => {
    if (!sameOrigin) return false

    const utvonal = url.pathname
    // A publikus gyülekezeti oldal offline-elhető marad.
    if (publikusGyulekezetiUt(utvonal)) return false
    // Az alkalmazás-héj cache-elhető marad.
    if (utvonal.startsWith(APP_HEJ_ELOTAG)) return false

    const rscKeres =
      request.headers.get('RSC') === '1'
      || request.headers.get('Next-Router-Prefetch') === '1'
      || url.searchParams.has('_rsc')
    const apiKeres = utvonal.startsWith('/api/')

    return rscKeres || dokumentumKeres(request) || apiKeres
  },
  handler: new NetworkOnly(),
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Az auth-route és az adat-szabály ELŐRE — felülírják az alapkészletet.
  runtimeCaching: [authRouteCaching, hitelesitettAdatCaching, ...adatCacheNelkuliAlap],
  // Offline tartalék: a csupasz böngésző-hibaoldal helyett a MI lapunk.
  // Lásd a fenti magyarázatot — csak navigációra szól, adatot nem tartalmaz.
  fallbacks: {
    entries: [
      {
        url: OFFLINE_TARTALEK_URL,
        matcher: ({ request }) => dokumentumKeres(request),
      },
    ],
  },
})

serwist.addEventListeners()
