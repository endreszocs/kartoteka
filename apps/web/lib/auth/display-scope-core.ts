/**
 * MEGJELENÍTÉSI HATÓKÖR — a BEKAPCSOLT PROFIL követése (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT OLD MEG, ÉS MIT NEM
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a modul NEM biztonsági kapu. A kapu a `requireAdminAccess` +
 * `getScopedCongregationIds` marad, és az helyesen zár (fail-closed).
 *
 * Amit ez old meg: a Kartotékában a JOGOSULTSÁG és a BEKAPCSOLT PROFIL két
 * külön dolog. A tulajdonos rendszergazda (master), de a barátosi lelkészi
 * profiljában böngész. A `getScopedCongregationIds` a mögöttes jogosultságot
 * nézi (`master → null = korlátlan`), ezért a mentés-sáv a barátosi profilban
 * is 784 hatókört és idegen gyülekezet-neveket sorolt fel.
 *
 * Ez ugyanaz a hibaosztály, amit a projekt már megszenvedett („SKALÁR HATÓKÖR
 * ⇄ FELOLDÓ SZÉTHÚZÁS"), csak itt megjelenítési, nem biztonsági oldalon: a
 * `/admin` layout MÁR MOST az aktív profil szerint dönt és gyülekezeti
 * profilban elterel — a sáv volt az egyetlen kilógó elem.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A SZABÁLY: METSZET, SOHA NEM UNIÓ
 * ════════════════════════════════════════════════════════════════════════════
 * A végeredmény MINDIG `metszet(jogosultsági_hatókör, bekapcsolt_profil)`.
 * Ez azt jelenti, hogy a profilváltás SOHA nem tágíthat: egy kerületi admin
 * attól, hogy egy másik profilra vált, nem láthat többet, mint amennyit a
 * jogosultsága enged.
 *
 * ⚠️ FAIL-CLOSED. Ha a bekapcsolt profil hatóköre BÁRMIÉRT nem állapítható meg
 *    (hiányzó `scope_id`, adatbázis-hiba a feloldásnál, VAGY a `profile_roles`
 *    lekérdezés maga hibázott → `aktivScope: 'ismeretlen'`), a SZŰKEBB ág nyer:
 *    ÜRES hatókör, nem országos. Egy téves országos lista a tulajdonos kifejezett
 *    kérése ellen megy; egy téves üres lista csak annyit tesz, hogy a sáv nem
 *    jelenik meg — és az admin felületen (ahol a hatókör helyesen oldódik fel)
 *    ott a teljes kép.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÜLÖN, IMPORT NÉLKÜLI FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Ebben a fájlban NINCS egyetlen futásidejű projekt-import sem, ezért a
 * `scripts/selftest-hatokor.mjs` önállóan fordítja és futtatja. A hatókör-
 * választás a legkönnyebben visszaeső rész — teszt nélkül a következő
 * refaktor némán visszaállítaná az országos ágat.
 */

/** A `profile_roles.scope` lehetséges értékei. */
export type ProfilScope = 'system' | 'district' | 'diocese' | 'congregation'

/**
 * A BEKAPCSOLT PROFIL scope-ja HÁROM ÁLLAPOTTAL (2026-08-11).
 *
 * ⚠️ MIÉRT NEM ELÉG A `ProfilScope | null`. A `null` eddig egyszerre jelentette,
 * hogy „a felhasználónak bizonyítottan nincs `profile_roles` sora" ÉS azt, hogy
 * „a `profile_roles` lekérdezés hibázott, nem tudjuk". A kettő ellenkező irányba
 * dönt: az elsőnél a jogosultság MAGA az aktív kontextus (helyes), a másodiknál
 * viszont ugyanez NÉMÁN TÁGÍT — a tulajdonos barátosi profiljában egy tranziens
 * adatbázis-hiba visszahozta volna a 784 hatókört és az idegen gyülekezet-neveket.
 *
 * Ezért:
 *   · `null`          = bizonyítottan nincs bekapcsolt profil → a jogosultság dönt,
 *   · `'ismeretlen'`  = nem tudtuk feloldani → FAIL-CLOSED, üres hatókör.
 */
export type AktivScopeBemenet = ProfilScope | null | 'ismeretlen'

/** Miért annyi a hatókör, amennyi — naplózáshoz és teszthez. */
export type HatokorIndok =
  /** Rendszergazdai (system) profil, vagy nincs bekapcsolható profil → a jogosultság dönt. */
  | 'jogosultsagi'
  /** A bekapcsolt profil szűkített (gyülekezet / egyházmegye / egyházkerület). */
  | 'profil_szukit'
  /** A profil hatóköre nem volt feloldható → fail-closed üres hatókör. */
  | 'fail_closed'

export interface MegjelenitesiHatokor {
  /** `null` = korlátlan (országos). Üres tömb = SEMMI. */
  congregationIds: string[] | null
  /** Elvárjuk-e a rendszerszintű (globális) mentést is? */
  globalisIsVarhato: boolean
  indok: HatokorIndok
}

export interface HatokorMetszesBemenet {
  /**
   * A JOGOSULTSÁGI hatókör (`getScopedCongregationIds`).
   * `null` = korlátlan (master / országos admin). Üres tömb = semmi.
   */
  jogosultsagi: string[] | null
  /**
   * A BEKAPCSOLT PROFIL hatóköre, gyülekezet-azonosítókra feloldva.
   * `null` = a profil nem szűkít (rendszergazdai profil).
   * `undefined` = NEM SIKERÜLT feloldani → fail-closed.
   */
  profil: string[] | null | undefined
  /**
   * A bekapcsolt profil scope-ja.
   * `null` = a felhasználónak BIZONYÍTOTTAN nincs profile_roles sora.
   * `'ismeretlen'` = a profile_roles NEM VOLT BEOLVASHATÓ → fail-closed.
   */
  aktivScope: AktivScopeBemenet
}

/**
 * A megjelenítési hatókör kiszámítása. SOHA nem tágít, csak szűkít.
 */
export function metszHatokort(bemenet: HatokorMetszesBemenet): MegjelenitesiHatokor {
  const { jogosultsagi, profil, aktivScope } = bemenet

  // 0) NEM TUDJUK, mi a bekapcsolt profil (a `profile_roles` olvasása hibázott).
  //    ⚠️ EZ AZ ÁG SOHA NEM ESHET ÖSSZE a lenti `aktivScope === null`-lal: ott
  //    bizonyítékunk van arra, hogy nincs profil; itt csak tudatlanságunk. Egy
  //    tranziens Supabase/RLS-hiba enélkül némán ORSZÁGOS hatókört adna vissza.
  if (aktivScope === 'ismeretlen') {
    return { congregationIds: [], globalisIsVarhato: false, indok: 'fail_closed' }
  }

  // 1) RENDSZERGAZDAI PROFIL — a teljes lista itt HASZNOS, nem vesszük el.
  //    Ugyanez az ág fut, ha a felhasználónak egyáltalán nincs `profile_roles`
  //    sora (`aktivScope === null`): ilyenkor nincs „bekapcsolt profil", amit
  //    követni lehetne, tehát a jogosultság MAGA az aktív kontextus. Pontosan
  //    így dönt az `/admin` layout is (ott sincs elterelés `activeProfileRole`
  //    hiányában), és így nem némul el az őrszem egy olyan rendszergazdánál,
  //    aki még nem kapott multi-role sorokat.
  if (aktivScope === 'system' || aktivScope === null) {
    return {
      congregationIds: jogosultsagi,
      // A rendszerszintű (globális) mentés CSAK az országos hatókör ügye.
      globalisIsVarhato: jogosultsagi === null,
      indok: 'jogosultsagi',
    }
  }

  // 2) SZŰKÍTŐ PROFIL (gyülekezet / egyházmegye / egyházkerület).
  //    ⚠️ FAIL-CLOSED: ha a profil hatóköre nem oldható fel, ÜRES a hatókör.
  //    Az `undefined` az „nem tudtuk feloldani" jelzés; a `null` ezen az ágon
  //    értelmezhetetlen (szűkítő profil nem adhat korlátlan hatókört), ezért
  //    az is fail-closed.
  if (profil === undefined || profil === null) {
    return { congregationIds: [], globalisIsVarhato: false, indok: 'fail_closed' }
  }

  // Metszet. `jogosultsagi === null` (korlátlan) esetén a profil önmagában dönt.
  const metszet =
    jogosultsagi === null
      ? [...profil]
      : profil.filter((id) => jogosultsagi.includes(id))

  return {
    congregationIds: metszet,
    // A gyülekezeti/megyei/kerületi profil NEM felelős a rendszerszintű
    // mentésért — ha elvárnánk tőle, minden nap „1 hiányzik"-ot mutatnánk neki.
    globalisIsVarhato: false,
    indok: 'profil_szukit',
  }
}

/** `true`, ha a hatókör bizonyítottan üres (nincs mit mutatni). */
export function uresHatokor(h: MegjelenitesiHatokor): boolean {
  return h.congregationIds !== null && h.congregationIds.length === 0
}
