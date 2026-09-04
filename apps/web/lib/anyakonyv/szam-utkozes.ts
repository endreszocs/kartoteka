/**
 * Anyakönyvi sorszám-ütközés — EMBERI HIBAÜZENET (2026-09-04).
 *
 * ELŐZMÉNY: a 2026-09-04-i élő állapotfelmérés kimutatta, hogy az `egyhazi_szam`-on
 * EGYETLEN anyakönyvi táblán sem volt egyediségi index, a generátor pedig zár
 * nélkül dolgozik (MAX+1 kiolvasás). Ugyanaz a sorszám tehát kétszer is bekerülhetett
 * volna. Az index azóta megvan mind a 8 táblán — de ezzel megjelent egy ÚJ tünet:
 * ütközéskor a PostgreSQL nyers, angol hibája jutott a lelkészhez:
 *
 *     Hiba: duplicate key value violates unique constraint "uniq_keresztseg_egyhazi_szam"
 *
 * Ez a modul ezt fordítja le arra, amit tenni kell.
 *
 * ⚠️ A GYAKORI ESET NEM A VERSENYHELYZET. A generátor `MAX(sorszám)+1`-et ad az
 * adott gyülekezet + típus + év halmazára, tehát AUTOMATIKUS számnál ütközés csak
 * két egyidejű mentésből keletkezhet — egy gyülekezetben ez ritka. A valószínű
 * eset a KÉZZEL beírt szám, ami már foglalt. Az üzenet ezért mindkettőt lefedi.
 *
 * ⛔ SZÁNDÉKOSAN NINCS automatikus újrapróbálkozás. Ha a lelkész KÉZZEL írta be a
 * számot, egy csendes újragenerálás FELÜLÍRNÁ a szándékát — és épp egy hivatalos
 * anyakönyvi sorszámnál a néma felülírás rosszabb, mint a hangos hiba.
 *
 * Sima lib (NEM 'use server'): a Next.js 16 alatt a 'use server' fájl CSAK async
 * függvényt exportálhat, ezért a szinkron segédek ide kerülnek.
 */

/** A 8 anyakönyvi tábla magyar neve a hibaüzenethez. */
const TABLA_NEV: Record<string, string> = {
  keresztseg: 'keresztelési',
  konfirmalas: 'konfirmálási',
  hazassag: 'házassági',
  temetes: 'temetési',
  bekoltozott: 'beköltözési',
  elkoltozott: 'elköltözési',
  attert: 'áttérési',
  kitert: 'kitérési',
}

/** Egy PostgREST/Postgres hiba minimális, ellenőrzött alakja. */
type DbHiba = { code?: string | null; message?: string | null; details?: string | null } | null | undefined

/**
 * Sorszám-ütközés-e a hiba? Két jelre nézünk, mert a PostgREST nem mindig adja
 * vissza a `code`-ot: a 23505-ös kódra ÉS az általunk létrehozott index nevére
 * (`uniq_<tábla>_egyhazi_szam`). Bármelyik elég — de a puszta „duplicate key"
 * NEM: az lehet másik megszorítás is (pl. `csalad_id_ferfi_idx`), amit nem
 * szabad sorszám-ütközésnek hazudni.
 */
export function sorszamUtkozesE(error: DbHiba): boolean {
  if (!error) return false
  const uzenet = `${error.message ?? ''} ${error.details ?? ''}`
  const indexNev = /uniq_[a-z]+_egyhazi_szam/.test(uzenet)
  if (!indexNev) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(uzenet)
}

/**
 * A mentési hiba emberi üzenete. Sorszám-ütközésnél megmondja, MIT tegyen a
 * lelkész; minden más hibánál a mai alakot adja vissza (nem nyelünk el semmit).
 *
 * @param tabla a művelettel érintett anyakönyvi tábla (a magyar megnevezéshez)
 * @param sorszam a beküldött sorszám, ha ismert — sokat segít a keresésben
 */
export function anyakonyviHibaUzenet(error: DbHiba, tabla?: string, sorszam?: string | null): string {
  const alap = `Hiba: ${error?.message ?? 'ismeretlen hiba'}`
  if (!sorszamUtkozesE(error)) return alap

  const fajta = tabla && TABLA_NEV[tabla] ? `${TABLA_NEV[tabla]} ` : ''
  const szamResz = sorszam ? ` (${sorszam})` : ''
  return (
    `Ez az egyházi anyakönyvi szám${szamResz} ebben a gyülekezetben MÁR FOGLALT egy másik ` +
    `${fajta}bejegyzésen, ezért a mentés nem történt meg. ` +
    'Ha kézzel írtad be a számot, nézd meg az anyakönyvben, melyik az első szabad sorszám. ' +
    'Ha a rendszer adta automatikusan, valószínűleg valaki ugyanabban a pillanatban rögzített ' +
    'egy másik bejegyzést — hagyd üresen a szám mezőt, és mentsd újra: a rendszer a következő ' +
    'szabad számot adja. A bejegyzés adatai megmaradtak, nem kell újra begépelned.'
  )
}
