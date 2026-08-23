/**
 * KÖZÖS helyi-tároló ürítés — „ami a gépen marad, azt a következő ember látja".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Az Adatvédelmi tájékoztató azt ígéri, hogy közös (hivatali, gyülekezeti)
 * gépen érdemes kijelentkezni. Eddig a kijelentkezés CSAK a Supabase-munkamenetet
 * szüntette meg — a böngészőben viszont ott maradt:
 *
 *   · a service worker Cache Storage-a (RSC-payload: névsorok, CNP, pénzügyi
 *     sorok — akár 24 órán át), és
 *   · az offline IndexedDB (`kartoteka_offline`), amelyben a teljes gyülekezeti
 *     nyilvántartás tükre ül.
 *
 * A következő felhasználó ezeket bejelentkezés NÉLKÜL kiolvashatta a
 * devtoolsból. Ez a helper takarítja el őket.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÖZÖS (és miért nem másolat)
 * ════════════════════════════════════════════════════════════════════════════
 * Ugyanezt a takarítást végzi a `/dev-reset` oldal is. A projekt rögzített
 * hibaosztálya, hogy „két felület némán széthúz": ha a két helyen két külön
 * másolat állna, az egyiket javítanánk, a másik pedig csendben elavulna.
 * Ezért MINDKÉT hívó ezt az egy függvényt használja — az önellenőrző
 * (`scripts/selftest-adatvedelmi-fedezet.mjs`) vissza is méri.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AMIT SZÁNDÉKOSAN NEM TÖRLÜNK
 * ════════════════════════════════════════════════════════════════════════════
 * A felhasználó SZÁNDÉKOLT beállítása (téma, felületi preferenciák) nem adat,
 * hanem kényelem — a törlése bosszantó és semmit nem véd. Ezért engedélyezett
 * kulcslista (allowlist) dönt: ami nincs rajta, azt adatnak tekintjük és
 * töröljük. Így egy ÚJ, ismeretlen kulcs alapértelmezésben törlődik —
 * adatvédelmi szempontból ez a biztonságos irány.
 *
 * ⚠️ Éppen ezért a helper SOHA nem hív `localStorage.clear()`-t /
 *    `sessionStorage.clear()`-t: az a témát és a beállításokat is elvinné.
 */

/**
 * Az offline (Dexie) IndexedDB neve.
 *
 * MUSZÁJ egyeznie az `apps/web/lib/offline/db.ts`-beli `super('kartoteka_offline')`
 * hívással. Ha valaki átnevezi a Dexie adatbázist és ezt itt elfelejti követni,
 * a takarítás NÉMÁN a semmit törölné — ezért az önellenőrző a két fájlt
 * összeveti.
 */
export const OFFLINE_DB_NEV = 'kartoteka_offline'

/** Nyitóképernyő-jelző — kényelmi kapcsoló, nem adat (lásd splash-screen.tsx). */
export const SPLASH_KULCS = 'kartoteka_splash_shown'

/**
 * MEGTARTOTT localStorage-kulcsok: a felhasználó szándékolt beállításai.
 * (A `theme` kulcsot a next-themes írja — lásd app/layout.tsx ThemeProvider.)
 */
export const MEGTARTOTT_LOCALSTORAGE_KULCSOK: readonly string[] = [
  'theme',
  'kartoteka-user-prefs-v1',
  'kartoteka.emleklap.esketesVariant',
  'kartoteka.emleklap.kereszteloVariant',
  SPLASH_KULCS,
]

/**
 * MEGTARTOTT előtagok: egyszeri technikai jelölők (nem adat). Ha ezeket
 * törölnénk, a hozzájuk tartozó egyszeri takarítás minden bejelentkezésnél
 * újrafutna feleslegesen.
 */
export const MEGTARTOTT_KULCS_ELOTAGOK: readonly string[] = ['kartoteka:offline-purge:']

/** MEGTARTOTT sessionStorage-kulcsok. */
export const MEGTARTOTT_SESSIONSTORAGE_KULCSOK: readonly string[] = [SPLASH_KULCS]

export interface UritesOpciok {
  /** Opcionális naplózó — a /dev-reset oldal ezzel mutatja a lépéseket. */
  naplo?: (uzenet: string, sikeres: boolean) => void
  /** A service worker-eket is leiratkoztassuk? (csak a /dev-reset kéri) */
  serviceWorkerLeiratkozas?: boolean
  /**
   * Töröljük az offline adatbázist AKKOR IS, ha vannak még fel nem töltött
   * helyi módosítások? Alapértelmezésben NEM — a néma adatvesztés rosszabb,
   * mint egy megmaradt (később úgyis felülírt) helyi tükör.
   */
  eroltetettOfflineTorles?: boolean
}

export interface UritesEredmeny {
  toroltCacheKulcsok: string[]
  offlineDbTorolve: boolean
  /** Ha kimaradt: miért (magyarul, a felületen megmutatható). */
  offlineDbKihagyasOka: string | null
  toroltLocalKulcsok: number
  toroltSessionKulcsok: number
  hibak: string[]
}

function megtartando(kulcs: string, kulcsok: readonly string[]): boolean {
  if (kulcsok.includes(kulcs)) return true
  return MEGTARTOTT_KULCS_ELOTAGOK.some((elotag) => kulcs.startsWith(elotag))
}

/**
 * Hány helyi módosítás vár még feltöltésre? (offline szerkesztés)
 * Ha bármi hiba van, 0-t adunk vissza: az adatvédelem az alapértelmezés.
 */
async function fuggobenLevoValtozasokSzama(): Promise<number> {
  try {
    const { getDb } = await import('@/lib/offline/db')
    return await getDb()._mutation_queue.count()
  } catch {
    return 0
  }
}

/** Cache Storage (PWA / service worker) teljes ürítése. */
async function uritsdACacheStoraget(
  naplo: (uzenet: string, sikeres: boolean) => void,
  hibak: string[],
): Promise<string[]> {
  const toroltek: string[] = []
  if (typeof window === 'undefined' || !('caches' in window)) return toroltek
  try {
    const kulcsok = await caches.keys()
    if (kulcsok.length === 0) {
      naplo('Nincs gyorstár-bejegyzés (Cache Storage üres).', true)
      return toroltek
    }
    for (const kulcs of kulcsok) {
      await caches.delete(kulcs)
      toroltek.push(kulcs)
      naplo(`Gyorstár törölve: ${kulcs}`, true)
    }
  } catch (e) {
    const uzenet = e instanceof Error ? e.message : String(e)
    hibak.push(`Cache Storage: ${uzenet}`)
    naplo(`A gyorstár ürítése nem sikerült: ${uzenet}`, false)
  }
  return toroltek
}

/**
 * Az offline IndexedDB kiürítése + eldobása.
 *
 * Két lépés, szándékosan ebben a sorrendben:
 *   1. `wipeDb()` — a táblák TARTALMÁT üríti. Ez az érdemi adatvédelmi lépés,
 *      és akkor is lefut, ha az adatbázis eldobását egy másik böngészőfül
 *      blokkolja.
 *   2. `indexedDB.deleteDatabase()` — magát az adatbázist is eldobja. Ha egy
 *      másik fül nyitva tartja, a böngésző `blocked`-ot ad; ilyenkor NEM
 *      várunk a végtelenségig, hanem továbbmegyünk (a tartalom már üres).
 */
async function torolAzOfflineAdatbazist(
  naplo: (uzenet: string, sikeres: boolean) => void,
  hibak: string[],
  eroltetett: boolean,
): Promise<{ torolve: boolean; kihagyasOka: string | null }> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return { torolve: false, kihagyasOka: 'A böngésző nem támogatja az IndexedDB-t.' }
  }

  if (!eroltetett) {
    const fuggoben = await fuggobenLevoValtozasokSzama()
    if (fuggoben > 0) {
      const ok =
        `${fuggoben} helyi módosítás még nem került fel a szerverre — ` +
        'az offline adatbázist ezért NEM töröltük. Csatlakozz a hálózatra, ' +
        'várd meg a szinkront, aztán jelentkezz ki újra.'
      naplo(ok, false)
      return { torolve: false, kihagyasOka: ok }
    }
  }

  // 1. Táblatartalom ürítése (ez a lényegi lépés).
  try {
    const { wipeDb } = await import('@/lib/offline/db')
    await wipeDb()
    naplo('Az offline adatbázis tartalma törölve.', true)
  } catch (e) {
    const uzenet = e instanceof Error ? e.message : String(e)
    hibak.push(`offline tábla-ürítés: ${uzenet}`)
    naplo(`Az offline adatbázis ürítése nem sikerült: ${uzenet}`, false)
  }

  // 2. Maga az adatbázis eldobása — blokkolás esetén időkorláttal.
  const torolve = await new Promise<boolean>((resolve) => {
    let lezarva = false
    const kesz = (ertek: boolean) => {
      if (lezarva) return
      lezarva = true
      resolve(ertek)
    }
    const idozito = setTimeout(() => kesz(false), 2500)
    try {
      const keres = indexedDB.deleteDatabase(OFFLINE_DB_NEV)
      keres.onsuccess = () => {
        clearTimeout(idozito)
        kesz(true)
      }
      keres.onerror = () => {
        clearTimeout(idozito)
        kesz(false)
      }
      keres.onblocked = () => {
        // Másik fül tartja nyitva — a tartalom viszont már üres.
        clearTimeout(idozito)
        kesz(false)
      }
    } catch {
      clearTimeout(idozito)
      kesz(false)
    }
  })

  naplo(
    torolve
      ? `Offline adatbázis eldobva: ${OFFLINE_DB_NEV}`
      : `Az offline adatbázis (${OFFLINE_DB_NEV}) eldobása nem fejeződött be (másik fül tarthatja nyitva) — a tartalma viszont üres.`,
    torolve,
  )

  return { torolve, kihagyasOka: null }
}

/** Adat-jellegű localStorage/sessionStorage kulcsok törlése (allowlist alapján). */
function uritsdATarolot(
  tarolo: Storage,
  megtartott: readonly string[],
  cimke: string,
  naplo: (uzenet: string, sikeres: boolean) => void,
  hibak: string[],
): number {
  let torolt = 0
  try {
    const kulcsok: string[] = []
    for (let i = 0; i < tarolo.length; i++) {
      const kulcs = tarolo.key(i)
      if (kulcs !== null) kulcsok.push(kulcs)
    }
    for (const kulcs of kulcsok) {
      if (megtartando(kulcs, megtartott)) continue
      tarolo.removeItem(kulcs)
      torolt++
    }
    naplo(`${cimke}: ${torolt} adat-kulcs törölve (a beállítások megmaradtak).`, true)
  } catch (e) {
    const uzenet = e instanceof Error ? e.message : String(e)
    hibak.push(`${cimke}: ${uzenet}`)
    naplo(`${cimke} ürítése nem sikerült: ${uzenet}`, false)
  }
  return torolt
}

/**
 * A böngészőben maradt SZEMÉLYES ADAT eltakarítása.
 *
 * Hívási helyek:
 *   · kijelentkezés (components/layout/header-refined-v3.tsx) — a szerver-oldali
 *     `signOut()` ELŐTT, mert az `redirect()`-tel elhagyja az oldalt;
 *   · /dev-reset oldal (app/dev-reset/page.tsx).
 *
 * A függvény SOHA nem dob: minden lépés külön try/catch-ben van, a hibák a
 * visszatérési érték `hibak` tömbjében jelennek meg. Egy elakadt takarítás nem
 * akadályozhatja meg a kijelentkezést.
 */
export async function uritsdAHelyiAdatCachet(
  opciok: UritesOpciok = {},
): Promise<UritesEredmeny> {
  const naplo = opciok.naplo ?? (() => {})
  const hibak: string[] = []

  const eredmeny: UritesEredmeny = {
    toroltCacheKulcsok: [],
    offlineDbTorolve: false,
    offlineDbKihagyasOka: null,
    toroltLocalKulcsok: 0,
    toroltSessionKulcsok: 0,
    hibak,
  }

  if (typeof window === 'undefined') return eredmeny

  // 1. Service worker leiratkozás (csak ha kérték — kijelentkezéskor NEM kell:
  //    a PWA maradjon telepítve, csak a gyorstár tartalma tűnjön el).
  if (opciok.serviceWorkerLeiratkozas) {
    try {
      if ('serviceWorker' in navigator) {
        const regisztraciok = await navigator.serviceWorker.getRegistrations()
        if (regisztraciok.length === 0) {
          naplo('Nincs regisztrált service worker.', true)
        } else {
          for (const reg of regisztraciok) {
            await reg.unregister()
            naplo(`Service worker leiratkozva: ${reg.scope}`, true)
          }
        }
      } else {
        naplo('A böngésző nem támogatja a service worker-eket (nincs teendő).', true)
      }
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : String(e)
      hibak.push(`service worker: ${uzenet}`)
      naplo(`Service worker hiba: ${uzenet}`, false)
    }
  }

  // 2. Cache Storage — itt ül az RSC-payload (névsorok, CNP, pénzügyi sorok).
  eredmeny.toroltCacheKulcsok = await uritsdACacheStoraget(naplo, hibak)

  // 3. Offline IndexedDB — a gyülekezeti nyilvántartás helyi tükre.
  const offline = await torolAzOfflineAdatbazist(naplo, hibak, Boolean(opciok.eroltetettOfflineTorles))
  eredmeny.offlineDbTorolve = offline.torolve
  eredmeny.offlineDbKihagyasOka = offline.kihagyasOka

  // 4. localStorage / sessionStorage — csak az ADAT-jellegű kulcsok.
  eredmeny.toroltLocalKulcsok = uritsdATarolot(
    window.localStorage,
    MEGTARTOTT_LOCALSTORAGE_KULCSOK,
    'localStorage',
    naplo,
    hibak,
  )
  eredmeny.toroltSessionKulcsok = uritsdATarolot(
    window.sessionStorage,
    MEGTARTOTT_SESSIONSTORAGE_KULCSOK,
    'sessionStorage',
    naplo,
    hibak,
  )

  return eredmeny
}
