/**
 * KÖZÖS CSV-cellakódolás (2026-08-24, B14).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MINDEN JÖVŐBENI CSV-EXPORT EZT HASZNÁLJA — saját kvótálást NE írj!
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MI VOLT A BAJ (képlet-injekció / „CSV formula injection"):
 * a három exportunk kvótált ugyan (a `"` duplázásával), de ez CSAK annyit ért
 * el, hogy a mező-határ helyes maradjon. A CSV-idézőjel a MEZŐ HATÁRÁT jelöli,
 * NEM azt, hogy a tartalom szöveg. Az Excel/LibreOffice a kvótálás lefejtése
 * UTÁN nézi meg a cella tartalmát — és ha az `=`-lel (vagy `+`, `-`, `@`,
 * TAB, CR karakterrel) kezdődik, KÉPLETKÉNT értékeli ki.
 *
 * Ez élő támadási út volt: a munkanapló `cím`/`alapige`/`megjegyzés`/
 * `szolgálatvezető` mezőit, az audit-napló `user_email` és `metadata` értékeit
 * és az egyházfenntartás-import forrás-mezőit a FELHASZNÁLÓ gépeli be — a CSV-t
 * viszont valaki MÁS (jellemzően a rendszergazda) nyitja meg a saját gépén.
 *
 * A VÉDELEM: ha a NYERS érték első karaktere `=`, `+`, `-`, `@`, TAB vagy CR,
 * egy aposztróf kerül elé. Az Excel/LibreOffice a vezető aposztrófot
 * szöveg-kényszerítésként érti (nem jeleníti meg cellában), és a tartalmat
 * SOHA nem értékeli ki képletként.
 *
 * ⚠️ EGY KIVÉTEL — A TISZTÁN SZÁM ALAKÚ ÉRTÉK ÉRINTETLEN MARAD.
 * A `-500` és a `-1,5` a `-` miatt beleesne a fenti szabályba, pedig ezek NEM
 * képletek: az Excel számként értékeli ki őket, és pontosan ez a kívánt
 * viselkedés. Ha aposztrófot tennénk eléjük, a negatív pénzösszegek SZÖVEGGÉ
 * romlanának a táblázatban (nem lehetne velük összegezni) — vagyis a biztonság
 * kedvéért elrontanánk egy működő funkciót. A kivétel szándékosan szűk: csak
 * az az érték megy át rajta, ami ELEJÉTŐL A VÉGÉIG szám (opcionális előjel,
 * számjegyek, egy tizedesjel). A `-1+1` NEM szám → védve marad.
 *
 * A NORMÁL adat (pl. „Vasárnapi istentisztelet") változatlanul megy át — a
 * védelem csak akkor nyúl a cellához, ha az tényleg képletnek látszana.
 */

/** Az Excel/LibreOffice ezekkel a kezdőkarakterekkel indít képlet-kiértékelést. */
const KEPLET_KEZDET = /^[=+\-@\t\r]/

/** Tisztán szám alakú érték (pl. `1500`, `-500`, `-1,5`, `2.75`) — nem képlet. */
const TISZTA_SZAM = /^[+-]?\d+(?:[.,]\d+)?$/

/**
 * Egy CSV-cella kódolása: képlet-injekció elleni védelem + RFC4180 kvótálás.
 *
 * A visszaadott érték MINDIG idézőjelek közé van zárva — így az elválasztó
 * (`;` vagy `,`), a sortörés és az idézőjel is biztonságosan belefér.
 */
export function csvCella(ertek: unknown): string {
  const nyers = ertek == null ? '' : String(ertek)
  // 1) képlet-kényszerítés kivédése — CSAK utána jön a kvótálás
  const biztonsagos =
    KEPLET_KEZDET.test(nyers) && !TISZTA_SZAM.test(nyers) ? `'${nyers}` : nyers
  // 2) RFC4180 kvótálás: a belső idézőjel duplázódik
  return `"${biztonsagos.replace(/"/g, '""')}"`
}
