/**
 * KÖZÖS HTML-escape az e-mail-sablonokhoz (2026-08-24, B10).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MINDEN e-mail-sablon EZT használja — saját másolatot NE készíts!
 * ════════════════════════════════════════════════════════════════════════════
 * Miért egy helyen: a repóban öt fájl tartotta a SAJÁT, betű szerint azonos
 * `escHtml()` másolatát (access-request, device-revoke, invite, restore/alerts,
 * google-drive/alerts) — a hatodik, a `congregation-transfer.ts` viszont
 * EGYÁLTALÁN nem escape-elt. Így néz ki a széthúzás: öt fájl helyesen csinálta,
 * a hatodikról senkinek nem tűnt fel, hogy kimaradt.
 *
 * MI VOLT A BAJ (a lelkészcsere-értesítő): a távozó lelkész által gépelt
 * „indok" szöveg nyersen került a levél HTML-törzsébe, a levelet pedig a
 * rendszer MINDEN aktív rendszergazdának és az egyházmegyei számvevőnek
 * kiküldte — a SAJÁT domainünkről, hitelesnek látszó levélben. Egy odaírt
 * `<a href="…">` adathalász link már kész támadás volt.
 *
 * A HELYES HASZNÁLAT: minden `${…}` interpoláció a HTML-törzsben menjen át
 * ezen — a beszúrt szöveg, az attribútum-érték (pl. `href`) és a fejléc-cím is.
 * A levél SZÖVEGES (text/plain) változatát NEM kell escape-elni: ott a `<`
 * és a `&` valóban `<` és `&` marad, entitás nélkül.
 *
 * A sorrend KÖTÖTT: az `&` cseréje MINDIG az első — különben a saját magunk
 * által beírt `&lt;` entitások `&amp;lt;`-tá romlanának (dupla escape).
 */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
