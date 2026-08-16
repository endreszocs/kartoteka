/**
 * A FELKÜLDÖTT IRAT ÁLLAPOTA — EGY közös, TISZTA megfogalmazás (2026-08-16).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI VOLT A TÜNET (ezért van ez a fájl — kérlek, ne írd vissza)
 * ════════════════════════════════════════════════════════════════════════════
 * A megyei felületek a NYERS `status`-t olvasták, és a négy állapotból hármat
 * (`submitted`, `received`, `returned`) UGYANAZZAL a zöld „Felküldve"
 * jelvénnyel mutattak. Az esperesi hivatal tehát nem tudta megkülönböztetni,
 * hogy az irat
 *   · még a postaládában áll (felküldve, de át nem véve),
 *   · megérkezett és a kerület átvette, vagy
 *   · javításra VISSZAJÖTT.
 * A visszaküldés INDOKA pedig végképp nem látszott sehol, így a megye azt sem
 * tudta, mit kellene javítania. (Brief, S3: „a megyei kártyán jelenjen meg az
 * »Átvéve« / »Visszaküldve« státusz — ma csak »Felküldve«-t mutat.")
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÜLÖN FÁJL ÉS MIÉRT IMPORT-MENTES
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a megfogalmazás a SZERVEREN (nyomtatvány, e-mail, PDF-fejléc) és a
 * KLIENS-komponensekben (jelvények) IS kell. Ha mindegyik felület a maga
 * `status === 'received' ? … : …` kifejezését írná meg, ugyanarra az iratra
 * más-más feliratot látna a felhasználó — ez a hibaosztály a Dokumentumtárban
 * egyszer már megtörtént.
 *
 * A gazda-modul (`diocese-felterjesztes.ts`) SUPABASE-t hív, tehát projekt-
 * importja van; ez a mag viszont a repó `*-core.ts` mintáját követi
 * (`display-scope-core.ts`, `osszesito-core.ts`): MELLÉKHATÁS- és
 * IMPORT-MENTES, nincs benne `new Date()` sem, így determinisztikus és
 * ÖNMAGÁBAN transpile-olható → `node scripts/selftest-felterjesztes-allapot.mjs`
 * betölti és állításokkal védi. Ha ide valaha projekt-import kerülne, az
 * önellenőrző HANGOSAN elbukik — szándékosan.
 *
 * A gazda-modul mindent újra-exportál innen, ezért a hívók import-útvonala és
 * a szignatúrák változatlanok maradnak.
 */

/** A felterjesztés életútja (a `diocese_felterjesztes.status` CHECK-jével azonos). */
export type DioceseFelterjesztesStatus = 'draft' | 'submitted' | 'received' | 'returned'

/**
 * A megfogalmazó bemenete — SZÁNDÉKOSAN laza (strukturális) alak, hogy a
 * `DioceseFelterjesztesSor` és az `OsszesitoFelkuldesAllapot` is átadható
 * legyen, sőt a kerületi fogadó felület saját sora is.
 */
export interface FelterjesztesAllapotBemenet {
  status?: DioceseFelterjesztesStatus | null
  submittedAt?: string | null
  receivedAt?: string | null
  returnedReason?: string | null
  /** Az összesítő-olvasó jelzése: van-e egyáltalán felterjesztés-sor. */
  letezik?: boolean
}

export interface FelterjesztesAllapotSzoveg {
  cimke: 'Felküldve' | 'Átvéve' | 'Visszaküldve' | 'Nincs felküldve'
  /**
   * Jelvény-hangulat a felületnek — token-alapú színt a komponens választ
   * hozzá. MIÉRT: így a szín is EGY helyen dől el, nem felületenként.
   */
  hangulat: 'semleges' | 'folyamatban' | 'kesz' | 'figyelem'
  /** Egysoros tényközlés (dátum + kihez), vagy null, ha nincs mit mondani. */
  reszletek: string | null
  /** Mit tegyen MOST a megye. Csak ott van, ahol tényleg van teendő. */
  tennivalo: string | null
}

/**
 * ISO időbélyeg → „2026. 08. 16." (csak a nap; óra-perc a kártyán zaj lenne).
 * Szándékosan STRING-műveletekkel: a `new Date(...).toLocaleDateString()` a
 * szerveren és a böngészőben MÁS napot adhat (időzóna), és a hidratálás
 * eltérésre panaszkodna.
 */
function napSzovegge(iso: string | null | undefined): string | null {
  if (!iso) return null
  const nap = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(nap) ? `${nap.replace(/-/g, '. ')}.` : null
}

/**
 * Az idézett kerületi indoklás mondattá zárása: ha a kerületi ügyintéző
 * írásjel nélkül fejezte be, teszünk egy pontot — különben a záró idézőjel
 * után következő mondat összefolyna vele.
 */
function mondatta(szoveg: string): string {
  return /[.!?…]$/.test(szoveg) ? szoveg : `${szoveg}.`
}

/** „2026. 08. 16. — Erdélyi Református Egyházkerület" (a kerület neve opcionális). */
function datumEsCimzett(nap: string | null, keruletNev?: string | null): string | null {
  const nev = (keruletNev || '').trim()
  if (nap && nev) return `${nap} — ${nev}`
  return nap || nev || null
}

/**
 * EGYETLEN, ember-olvasható állapot-leírás a felterjesztés-sorból.
 *
 * @param sor a felterjesztés (null/undefined = nincs sor → „Nincs felküldve")
 * @param opciok `keruletNev`: ha a hívó tudja, melyik egyházkerülethez ment az
 *        irat, a részletek sorában megjelenik. Nem kötelező — a modul maga NEM
 *        olvassa ki (K4 döntés: a szintek csak a hivatalos csatornán látnak át).
 */
export function felterjesztesAllapotSzoveg(
  sor: FelterjesztesAllapotBemenet | null | undefined,
  opciok?: { keruletNev?: string | null },
): FelterjesztesAllapotSzoveg {
  // A kerület NEVE csak a `reszletek` sorba kerül. MIÉRT: a magyarban a
  // tulajdonnév ragozása/névelője mondatonként más („az Erdélyi …-nek", „a
  // Királyhágómelléki …-nek"), és egy rosszul ragozott intézménynév a hivatalos
  // iraton bántó. A mondatokban ezért a semleges „az egyházkerület" áll.
  const keruletNev = opciok?.keruletNev ?? null
  const status = sor?.status ?? 'draft'
  const felkuldveNap = napSzovegge(sor?.submittedAt)
  const atvettNap = napSzovegge(sor?.receivedAt)

  // NINCS FELKÜLDVE: nincs sor, `letezik: false`, vagy a sor piszkozat (ide
  // esik a VISSZAVONT felküldés is — ott a `status` szándékosan 'draft'-ra áll,
  // és a felületnek TILOS „Felküldve"-t mutatnia, mert az irat már nincs fent).
  if (!sor || sor.letezik === false || status === 'draft') {
    return {
      cimke: 'Nincs felküldve',
      hangulat: 'semleges',
      reszletek: null,
      tennivalo: 'Véglegesítsd az iratot, és küldd fel az egyházkerületnek.',
    }
  }

  // VISSZAKÜLDVE: a megyének az INDOK a legfontosabb — enélkül nem tud javítani.
  if (status === 'returned') {
    const indok = (sor.returnedReason || '').trim()
    return {
      cimke: 'Visszaküldve',
      hangulat: 'figyelem',
      reszletek: datumEsCimzett(atvettNap || felkuldveNap, keruletNev),
      tennivalo: indok
        ? `Indoklás: „${mondatta(indok)}” Javítsd az iratot, majd véglegesítsd és küldd fel újra.`
        : 'Az egyházkerület nem adott meg indoklást. Egyeztess a kerülettel, majd javítás ' +
          'után véglegesítsd és küldd fel újra az iratot.',
    }
  }

  // ÁTVÉVE: a kerület elismerte a beérkezést — ez a megye számára a „megérkezett" pont.
  if (status === 'received') {
    const alap = datumEsCimzett(atvettNap, keruletNev)
    return {
      cimke: 'Átvéve',
      hangulat: 'kesz',
      reszletek:
        alap && felkuldveNap && felkuldveNap !== atvettNap
          ? `${alap} (felküldve: ${felkuldveNap})`
          : alap,
      tennivalo: null,
    }
  }

  // FELKÜLDVE, de még nem vették át: a megye ne higgye késznek a folyamatot.
  return {
    cimke: 'Felküldve',
    hangulat: 'folyamatban',
    reszletek: datumEsCimzett(felkuldveNap, keruletNev),
    tennivalo:
      'Az egyházkerület még nem vette át. Amíg át nem veszi, a felküldés visszavonható javításra.',
  }
}
