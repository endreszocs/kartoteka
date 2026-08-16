/**
 * A kerületi felterjesztés-fogadó KÖZÖS (kliens + szerver) konstansai.
 *
 * MIÉRT KÜLÖN FÁJL: a `felterjesztes-actions.ts` `'use server'` fájl, abból a
 * Next.js 16 szabálya szerint CSAK async függvényt lehet exportálni — konstans
 * vagy típus nem hozható ki belőle. A repó bevett mintája erre a `*-shared.ts`
 * (lásd dashboard-egyhazmegye/osszesito-shared.ts, document-shared.ts).
 *
 * TÜNET, AMI MIATT LÉTREJÖTT (2026-08-16): a visszaküldés 10 karakteres
 * indoklás-küszöbe CSAK a szerveren élt, a felület viszont már az ÜRES indokot
 * is átengedte volna a szervernek. A lelkész/adminisztrátor tehát beírta, hogy
 * „nem jó", megnyomta a gombot, és utána kapott hibát — pedig ezt a felület
 * előre tudhatta volna. Innentől mindkét oldal EBBŐL a fájlból dolgozik, így
 * nem tud széthúzni: ha a küszöb változik, egyetlen helyen változik, és a két
 * oldal UGYANAZT a magyar mondatot mondja.
 */

/**
 * Az indoklás alsó hossz-küszöbe (trim UTÁN).
 *
 * Egy „ok" vagy „nem jó" a megyének használhatatlan: nem tudja, mit javítson,
 * tehát vagy változatlanul küldi vissza, vagy telefonálni kezd.
 */
export const INDOK_MIN_HOSSZ = 10

/** Üres indoklás — a visszaküldés indoklása KÖTELEZŐ (Endre K5 döntése). */
export const INDOK_URES_UZENET =
  'A visszaküldéshez kötelező indoklást írni az egyházmegyének — enélkül nem tudják, mit ' +
  'kell javítaniuk.'

/** Túl rövid indoklás — a küszöb a szövegbe is BELE van fűzve, hogy ne húzhasson szét. */
export const INDOK_TUL_ROVID_UZENET =
  `Az indoklás túl rövid (legalább ${INDOK_MIN_HOSSZ} karakter kell). Írd le egy mondatban, ` +
  'mi a hiba, és mit várnál a javítástól — ezt olvassa majd az esperes.'

/**
 * A visszaküldés indoklásának ellenőrzése — EGYETLEN forrás a két oldalnak.
 *
 * Visszatérés: `null`, ha az indok rendben van; egyébként a kész, lelkész-barát
 * magyar hibaüzenet. A kliens ezzel tiltja/magyarázza a gombot, a szerver akció
 * pedig ugyanezzel utasít el — így nem fordulhat elő, hogy a felület átenged
 * valamit, amit a szerver utána mégis visszadob (vagy fordítva).
 */
export function ellenorizdAVisszakuldesIndokot(indok: string | null | undefined): string | null {
  const tiszta = (indok || '').trim()
  if (!tiszta) return INDOK_URES_UZENET
  if (tiszta.length < INDOK_MIN_HOSSZ) return INDOK_TUL_ROVID_UZENET
  return null
}
