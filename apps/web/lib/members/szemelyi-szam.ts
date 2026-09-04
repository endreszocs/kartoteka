/**
 * EGYHÁZI AZONOSÍTÓ ⇄ HIVATALOS SZEMÉLYI SZÁM (2026-09-05).
 *
 * ELŐZMÉNY — Endre észrevétele:
 *   „Személyi szám (CNP) az nem az ami a kartotékon szerepel. Az a rendszer
 *    által adott azonosító kód. A hivatalos CNP-t külön lehet menteni!"
 *
 * A `szemely.cnp` mező HÁROMFÉLE dolgot tárol, mégis mindet ugyanazzal a
 * „Személyi szám (CNP)" címkével mutattuk:
 *
 *   · `EC-2026-XXXXXXXXXX`  — a `generate_egyhazi_cnp()` adja (import-út),
 *   · `999` + 7 számjegy    — a webes `generateCnp()` adja (kézi felvitel),
 *   · valódi 13 jegyű CNP   — a DESKTOP új-tag űrlapja EZT követeli meg.
 *
 * A hivatalos szám mostantól KÜLÖN, szűkebb hozzáférésű táblában él
 * (`szemely_szemelyi_szam`), a `cnp` pedig az marad, ami valójában: EGYHÁZI
 * BELSŐ AZONOSÍTÓ — és egyben a szülő-kapcsolatok idegen kulcsa, ezért hozzá
 * nem nyúlunk.
 *
 * Ez a modul dönti el, MIT LÁTUNK a `cnp` mezőben, és ebből milyen címke és
 * milyen védelem következik.
 *
 * ⚠️ FAIL-SAFE IRÁNY: ha a formátum ISMERETLEN, SZEMÉLYES ADATNAK vesszük
 * (tehát maszkoljuk). Csak a bizonyítottan generált alakokat mutatjuk
 * csupaszon — fordítva egy legacy importból származó valódi számot
 * fednénk fel némán.
 *
 * Sima lib (NEM 'use server'): a Next.js 16 alatt a 'use server' fájl CSAK
 * async függvényt exportálhat, ezért a konstansok és a szinkron segédek
 * ide kerülnek.
 */

import { validateRomanianCnp } from '@kartoteka/validations'

/** Az SQL `generate_egyhazi_cnp()` alakja: EC-ÉÉÉÉ-XXXXXXXXXX. */
const EC_ALAK = /^EC-\d{4}-[A-Z0-9]+$/i
/** A webes `generateCnp()` alakja: '999' + 7 számjegy. */
const WEB_GENERALT_ALAK = /^999\d{7}$/
/** Régi import-alak, a súgó is említi. */
const IMPORT_ALAK = /^IMPORT-[A-Z0-9-]+$/i

export type AzonositoFajta = 'ures' | 'egyhazi' | 'szemelyes'

/**
 * Mi van a `cnp` mezőben? Az `egyhazi` a rendszer által generált kód —
 * ez nem személyes adat, nyugodtan látszhat. Minden más `szemelyes`.
 */
export function azonositoFajta(ertek: string | null | undefined): AzonositoFajta {
  const v = (ertek ?? '').trim()
  if (!v) return 'ures'
  if (EC_ALAK.test(v) || WEB_GENERALT_ALAK.test(v) || IMPORT_ALAK.test(v)) return 'egyhazi'
  return 'szemelyes'
}

/** Igaz, ha az érték bizonyítottan a rendszer által generált egyházi azonosító. */
export function egyhaziAzonositoE(ertek: string | null | undefined): boolean {
  return azonositoFajta(ertek) === 'egyhazi'
}

/**
 * A `cnp` mező ŐSZINTE címkéje. A nyomtatott személyi karton már ma is
 * „Egyházi azonosító"-nak hívja — a képernyő mostantól ugyanezt mondja.
 */
export function cnpMezoCimke(ertek: string | null | undefined): string {
  return egyhaziAzonositoE(ertek) ? 'Egyházi azonosító' : 'Egyházi azonosító (személyes adatnak tűnő érték)'
}

/**
 * Maszkolni kell-e a `cnp` értékét? A generált egyházi azonosító NEM személyes
 * adat, azt fölösleges rejtegetni — a „mindent maszkolunk" szabály épp azt
 * mosta össze, amit szét kellett volna választani. Ismeretlen alakot viszont
 * MASZKOLUNK (lásd a fájl fejlécében a fail-safe irányt).
 */
export function cnpMaszkolando(ertek: string | null | undefined): boolean {
  return azonositoFajta(ertek) === 'szemelyes'
}

/** A hivatalos szám hossz-plafonja — a tárolás text, de a bemenet nem parttalan. */
export const SZEMELYI_SZAM_MAX = 40

export interface SzemelyiSzamEllenorzes {
  /** Menthető-e az érték. */
  rendben: boolean
  /** A normalizált (szóköz- és kötőjel-mentesített) érték, ha rendben van. */
  tisztitott: string
  /** Magyar hibaüzenet, ha nem menthető. */
  hiba: string | null
  /**
   * Igaz, ha az érték érvényes ROMÁN CNP. Más ország azonosítóját NEM tudjuk
   * ellenőrizni — az is menthető, csak nem állítjuk róla, hogy stimmel.
   */
  romanCnp: boolean
}

/**
 * A hivatalos szám ellenőrzése mentés előtt.
 *
 * ⚠️ SZÁNDÉKOSAN NEM KÖTELEZŐ a 13 jegyű román alak: a rendszer külföldi
 * tagokat is nyilvántart, és a repóban van precedens arra, hogy a merev
 * 13-jegyes szabály „elárasztotta a Hibák fület ál-hibákkal" (PR-9, 2026-07-24).
 * A román alakot viszont, ha annak látszik, KEMÉNYEN ellenőrizzük — egy
 * elgépelt CNP rosszabb, mint a hiányzó.
 */
export function ellenorizSzemelyiSzam(nyers: string | null | undefined): SzemelyiSzamEllenorzes {
  const tisztitott = (nyers ?? '').replace(/[\s.\-/]/g, '').trim()
  if (!tisztitott) {
    return { rendben: true, tisztitott: '', hiba: null, romanCnp: false }
  }
  if (tisztitott.length > SZEMELYI_SZAM_MAX) {
    return {
      rendben: false,
      tisztitott,
      hiba: `A személyi szám legfeljebb ${SZEMELYI_SZAM_MAX} karakter lehet.`,
      romanCnp: false,
    }
  }
  // Csak 13 számjegynél vizsgáljuk román CNP-ként — más hosszúságú vagy betűt
  // is tartalmazó azonosító külföldi lehet, azt nem utasítjuk el.
  if (/^\d{13}$/.test(tisztitott)) {
    if (!validateRomanianCnp(tisztitott)) {
      return {
        rendben: false,
        tisztitott,
        hiba:
          'Ez 13 számjegy, tehát romániai CNP-nek látszik, de az ellenőrző számjegye nem stimmel. ' +
          'Nézd meg újra a személyi igazolványon — elgépelt CNP rosszabb, mint a hiányzó.',
        romanCnp: false,
      }
    }
    return { rendben: true, tisztitott, hiba: null, romanCnp: true }
  }
  if (/^\d{1,12}$/.test(tisztitott)) {
    return {
      rendben: false,
      tisztitott,
      hiba: `A romániai személyi szám (CNP) 13 számjegy — ez ${tisztitott.length}. Ha külföldi azonosítót írsz be, betűt is tartalmazhat.`,
      romanCnp: false,
    }
  }
  return { rendben: true, tisztitott, hiba: null, romanCnp: false }
}

/** Maszk a hivatalos számhoz — a hossza SZÁNDÉKOSAN nem árulja el az értékét. */
export const SZEMELYI_SZAM_MASZK = '••••••••••••'

// ── A szerver-műveletek szerződése ──────────────────────────────────────────
// ⚠️ Ezek SZÁNDÉKOSAN itt élnek, nem a 'use server' actions-fájlban: a
// Next.js 16 alatt a 'use server' fájl CSAK async függvényt exportálhat. A
// típus-export ott zölden átmegy a CI-n, és a DEPLOY buildjét bukná el.

export interface SzemelyiSzamAllapot {
  /** Van-e egyáltalán rögzített hivatalos szám. */
  van: boolean
  /** Az érték — CSAK a felfedő hívás adja vissza, a karton betöltése nem. */
  ertek: string | null
  /** Két betűs országkód (alap: RO). */
  orszag: string | null
  /** Mikor rögzítették / módosították utoljára (ISO). */
  modositva: string | null
  /**
   * Ha a mező most nem használható, ez mondja meg, MIÉRT — magyarul.
   * Néma üres állapot SOHA nincs.
   */
  hiba: string | null
}

export interface SzemelyiSzamMentesEredmeny {
  siker: boolean
  /** Magyar hibaüzenet — a felület ezt mutatja, nem nyers Postgres-szöveget. */
  hiba: string | null
  /** Igaz, ha az érték érvényes romániai CNP volt (visszajelzésnek). */
  romanCnp: boolean
  /** Igaz, ha a mentés a szám TÖRLÉSE volt (üres bemenet). */
  torolve: boolean
}
