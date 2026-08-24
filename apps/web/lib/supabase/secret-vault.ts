/**
 * Supabase secret vault — pgcrypto-alapú titkosítás.
 *
 * Az Oblio API secret-et (és más érzékeny adatokat) **soha nem tároljuk
 * plain text-ben** a DB-ben. Ez a modul biztosítja a titkosítást és
 * visszafejtést.
 *
 * A titkosítási kulcs a szerver-oldali env-ből jön (`VAULT_ENCRYPTION_KEY`).
 * Soha nem kerül a kliens-kódba, és SOHA nem kerül naplóba — sem a kulcs,
 * sem a hossza, sem az előtagja.
 *
 * **SECURITY DEFINER függvények nem szükségesek**: a server action-ök
 * közvetlenül hívják ezeket a helper-eket, amelyek SQL-ben futtatják
 * a pgcrypto-t.
 *
 * A pgcrypto extension-t a `2026-04-16-wc2-oblio-integracio.sql`
 * migráció engedélyezte: `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 2026-08-24 BIZTONSÁGI JAVÍTÁS — A 6 JEGYŰ PIN MINT TITKOSÍTÁSI KULCS
 * ════════════════════════════════════════════════════════════════════════════
 * A javítás előtt itt EGYETLEN sor állt:
 *
 *     const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || process.env.GOD_MODE_PIN || ''
 *
 * Két külön baj volt benne:
 *
 *  1) HA a `VAULT_ENCRYPTION_KEY` hiányzik, a széf a god-mode PIN-nel
 *     TITKOSÍT. A PIN a saját kódunk szerint (`god-mode/actions-v4.ts`,
 *     `isValidPin`: /^\d{6}$/) PONTOSAN 6 számjegy → 10^6 = egymillió
 *     lehetőség. Aki hozzájut egy adatbázis-mentéshez, azt offline,
 *     másodpercek alatt végigpróbálja: megkapja az Oblio API-kulcsot ÉS
 *     magát a god-mode PIN-t is, ami a god-mode felület második faktora.
 *
 *  2) A figyelmeztetés HALOTT KÓD volt: az `if (!VAULT_KEY)` csak akkor lépett
 *     be, ha MINDKETTŐ hiányzott — vagyis pont abban az esetben NEM szólalt
 *     meg, amikor a PIN-fallback ténylegesen aktív (VAULT nincs, PIN van).
 *
 * ── MIÉRT NEM TÖRÖLTÜK EGYSZERŰEN A FALLBACKOT ─────────────────────────────
 * A már titkosított sorok CSAK az EREDETI kulccsal fejthetők vissza. Ha a kód
 * többé nem próbálná a régi kulcsot, a meglévő Oblio API-titkok NÉMÁN
 * olvashatatlanná válnának — ez éles ADATVESZTÉS. Ezért aszimmetrikus a
 * megoldás:
 *
 *   · OLVASÁS (visszafejtés): sorra próbáljuk a kulcsokat — előbb az erőset,
 *     utána a régi PIN-fallbackot, legvégül az örökölt ÜRES kulcsot (a régi sor
 *     `|| ''`-re is eshetett, ha a PIN az adatbázisban élt, nem env-ben). A
 *     meglévő adat olvasható marad, sőt: a kulcs beállítása UTÁN is, mielőtt
 *     bárki újramentené a titkokat.
 *   · ÍRÁS (új titok mentése): KIZÁRÓLAG az erős kulccsal. Erős kulcs nélkül
 *     az írás fail-closed módon megáll, beszédes magyar hibaüzenettel.
 *     Új, gyenge kulcsú titok tehát TÖBBÉ NEM KELETKEZIK.
 *
 * ⚠️ AKI VISSZATENNÉ a `vaultKey || pin` egysorost: az `irhato` kapu és a
 *    `pinFallbackAktiv` figyelmeztetés SZÁNDÉKOSAN van szétválasztva. A
 *    `scripts/selftest-titok-szef.mjs` a mai forrásból visszaállítja a régi
 *    világot, és bizonyítja, hogy a mérce elbukik rajta.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ennél rövidebb `VAULT_ENCRYPTION_KEY` gyenge — naplóban jelezzük, de NEM
 * állítjuk meg tőle a rendszert (működő éles rendszert nem törünk el).
 * 32 karakter = az `openssl rand -hex 32` által adott 64 hex karakter fele,
 * vagyis még a „valaki kézzel írt be valamit" eset is átcsúszik, de a
 * 6–12 karakteres tákolmány már szól.
 */
export const MIN_KULCS_HOSSZ = 32

/**
 * ÖRÖKÖLT ÜRES KULCS — a visszafejtés UTOLSÓ próbálkozása.
 *
 * A régi sor `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN || ''` volt. Ha egyik env
 * sem volt beállítva (tipikusan: a rendszergazdai PIN az ADATBÁZISBAN él, nem
 * környezeti változóban), akkor a széf ÜRES jelszóval titkosított — és az
 * ilyen sorok KIZÁRÓLAG az üres kulccsal fejthetők vissza.
 *
 * ⛔ EZT NE VEDD KI. Nélküle a kulcs beállítása után a korábban mentett Oblio
 *    API-titkok némán olvashatatlanná válnának — éles adatvesztés. Írásra
 *    SOHA nem használjuk (az `irhato` kapu tiltja), tehát új, üres kulcsú
 *    titok nem keletkezhet.
 */
export const OROKOLT_URES_KULCS = ''

/** A PIN-fallback aktív: nincs erős kulcs, de van god-mode PIN. */
export const FIGYELMEZTETES_PIN_FALLBACK =
  'A VAULT_ENCRYPTION_KEY nincs beállítva, ezért a titok-széf a god-mode PIN-re esne vissza ' +
  'titkosítási kulcsként. A PIN pontosan 6 számjegy — egymillió lehetőség, egy adatbázis-mentésből ' +
  'másodpercek alatt visszafejthető. ÚJ titkot ezért a rendszer NEM ment el; a már tárolt titkok ' +
  'olvashatók maradnak. TEENDŐ: állítsd be a VAULT_ENCRYPTION_KEY-t (előállítás: openssl rand -hex 32), ' +
  'majd a Pénzügy → Oblio felületen mentsd újra az API-kulcsot, hogy az erős kulccsal titkosítódjon.'

/** Sem erős kulcs, sem PIN: a széf ÚJ titkot nem tud menteni. */
export const FIGYELMEZTETES_NINCS_KULCS =
  'A titok-széfnek nincs kulcsa: sem a VAULT_ENCRYPTION_KEY, sem a GOD_MODE_PIN nincs beállítva. ' +
  'ÚJ titkot ezért a rendszer NEM ment el. A korábban — kulcs nélkül — mentett titkok olvashatók ' +
  'maradnak, de védtelenek. TEENDŐ: állítsd be a VAULT_ENCRYPTION_KEY-t (előállítás: openssl rand -hex 32), ' +
  'majd a Pénzügy → Oblio felületen mentsd újra az API-kulcsot.'

/** Van erős kulcs, de gyanúsan rövid. Csak jelzés — a rendszer megy tovább. */
export const FIGYELMEZTETES_ROVID_KULCS =
  'A VAULT_ENCRYPTION_KEY be van állítva, de 32 karakternél rövidebb — gyenge kulcs. ' +
  'A titkosítás működik, de cseréld le egy erősre (openssl rand -hex 32), és utána mentsd újra ' +
  'a tárolt titkokat.'

/** Az írás fail-closed hibaüzenete (ez jut el a felhasználóig a felületen). */
export const IRAS_TILTVA_UZENET =
  'A titkos érték nem menthető: a VAULT_ENCRYPTION_KEY nincs beállítva a szerveren. ' +
  'A rendszer szándékosan NEM titkosít a 6 jegyű rendszergazdai PIN-nel, mert azt egy ' +
  'adatbázis-mentésből másodpercek alatt visszafejtenék. Kérd meg a rendszergazdát, hogy állítsa be ' +
  'a VAULT_ENCRYPTION_KEY környezeti változót, utána a mentés újra működni fog. ' +
  'A már tárolt titkok addig is használhatók.'

/** A kulcs-választás bemenete — csupa env-érték, semmi mellékhatás. */
export type SzefKulcsBemenet = {
  /** `process.env.VAULT_ENCRYPTION_KEY` */
  vaultKey?: string | null
  /** `process.env.GOD_MODE_PIN` — CSAK örökölt visszafejtésre, írásra soha. */
  godModePin?: string | null
}

/** A kulcs-választás eredménye. */
export type SzefKulcsDontes = {
  /** Szabad-e ÚJ titkot menteni? Csak erős kulccsal igen. */
  irhato: boolean
  /** Az írásra használt kulcs — vagy `null`, ha az írás tiltva van. */
  irasKulcs: string | null
  /**
   * A visszafejtésnél sorra próbálandó kulcsok: az erős kulcs elöl, mögötte az
   * örökölt god-mode PIN, legvégén az örökölt ÜRES kulcs. A lista SOHA nem
   * üres — a legrégebbi sorok üres kulccsal készültek.
   */
  olvasoKulcsok: string[]
  /** Naplóba/felületre való magyar figyelmeztetés, vagy `null`, ha minden rendben. */
  figyelmeztetes: string | null
}

/**
 * A KULCS-VÁLASZTÁS TISZTA MAGJA.
 *
 * Se env, se I/O, se naplózás — így a `scripts/selftest-titok-szef.mjs`
 * mind a négy állapotot végig tudja mérni (van/nincs erős kulcs × van/nincs PIN).
 */
export function szefKulcsDontes(bemenet: SzefKulcsBemenet): SzefKulcsDontes {
  const eros = (bemenet.vaultKey ?? '').trim()
  const pin = (bemenet.godModePin ?? '').trim()

  // ── OLVASÁS: minden ismert kulcs sorra kerül (erős elöl, örökölt PIN mögötte,
  //    legvégén az örökölt ÜRES kulcs). Ez tartja életben a RÉGI, PIN-nel vagy
  //    kulcs nélkül titkosított sorokat is.
  const jeloltek = [eros, pin].filter((k) => k.length > 0)
  const olvasoKulcsok = [...Array.from(new Set(jeloltek)), OROKOLT_URES_KULCS]

  // ── ÍRÁS: a kaput KIZÁRÓLAG az erős kulcs nyitja. (A régi kód itt
  //    `vaultKey || pin` volt — ez a sor a javítás lényege.)
  const irhato = eros.length > 0
  const irasKulcs = irhato ? eros : null

  // ── FIGYELMEZTETÉS: arra szól, ami a VALÓDI baj. A régi feltétel
  //    (`!VAULT_KEY`, azaz mindkettő hiányzik) éppen a veszélyes esetben
  //    hallgatott — ezért van itt külön néven a három állapot.
  const pinFallbackAktiv = !irhato && pin.length > 0
  const nincsSemmilyenKulcs = !irhato && pin.length === 0
  const gyanusanRovid = irhato && eros.length < MIN_KULCS_HOSSZ

  const figyelmeztetes = pinFallbackAktiv
    ? FIGYELMEZTETES_PIN_FALLBACK
    : nincsSemmilyenKulcs
      ? FIGYELMEZTETES_NINCS_KULCS
      : gyanusanRovid
        ? FIGYELMEZTETES_ROVID_KULCS
        : null

  return { irhato, irasKulcs, olvasoKulcsok, figyelmeztetes }
}

/**
 * A széf AKTUÁLIS állapota az env-ből.
 *
 * Minden híváskor újraolvassa a `process.env`-et (nem modul-szintű konstans),
 * hogy az admin felület mindig a valós állapotot mutassa.
 */
export function szefAllapot(): SzefKulcsDontes {
  return szefKulcsDontes({
    vaultKey: process.env.VAULT_ENCRYPTION_KEY,
    godModePin: process.env.GOD_MODE_PIN,
  })
}

/**
 * A figyelmeztetés HANGOS naplózása — induláskor és az első használatkor.
 * Csak egyszer szólal meg futásonként (nem szemeteli tele a naplót).
 */
let figyelmeztetesNaplozva = false
function naplozFigyelmeztetest(allapot: SzefKulcsDontes): void {
  if (figyelmeztetesNaplozva || !allapot.figyelmeztetes) return
  figyelmeztetesNaplozva = true
  console.warn(`[secret-vault] ${allapot.figyelmeztetes}`)
}

// Induláskori napló: a modul betöltésekor azonnal kiderül, ha a széf gyenge.
naplozFigyelmeztetest(szefAllapot())

/**
 * Szöveges adat titkosítása pgcrypto pgp_sym_encrypt-el.
 * Az eredmény egy pgcrypto-kompatibilis bytea → text (armor-olt PGP blokk).
 *
 * ⛔ FAIL-CLOSED: erős kulcs (`VAULT_ENCRYPTION_KEY`) nélkül NEM ír.
 *
 * @returns A titkosított string (PGP armor formátum).
 * @throws Ha nincs erős kulcs, vagy ha a pgcrypto hibázik.
 */
export async function encryptSecret(
  supabase: SupabaseClient,
  plaintext: string,
): Promise<string> {
  const allapot = szefAllapot()
  naplozFigyelmeztetest(allapot)

  if (!allapot.irhato || !allapot.irasKulcs) {
    throw new Error(IRAS_TILTVA_UZENET)
  }

  const { data, error } = await supabase.rpc('vault_encrypt', {
    plaintext_input: plaintext,
    key_input: allapot.irasKulcs,
  })

  if (error) {
    throw new Error(`Titkosítás sikertelen: ${error.message}`)
  }

  return data as string
}

/**
 * Titkosított adat visszafejtése pgcrypto pgp_sym_decrypt-el.
 *
 * A kulcsokat SORRA próbálja: erős kulcs → örökölt god-mode PIN → örökölt ÜRES
 * kulcs. A régebbi sorok még a PIN-nel (vagy kulcs nélkül) készültek; enélkül a
 * kulcs beállítása néma adatvesztést okozna.
 *
 * @returns A visszafejtett plain text.
 * @throws Ha egyik kulccsal sem sikerül (rossz kulcs, sérült adat).
 */
export async function decryptSecret(
  supabase: SupabaseClient,
  encryptedText: string,
): Promise<string> {
  const allapot = szefAllapot()
  naplozFigyelmeztetest(allapot)

  // Védőháló: a lista ma SOHA nem üres (az örökölt üres kulcs mindig a végén
  // áll). Ha valaki mégis kiürítené, itt beszédes hibát kapjon — ne csendes
  // `undefined`-et, mint a javítás előtt.
  if (allapot.olvasoKulcsok.length === 0) {
    throw new Error(
      'Visszafejtés sikertelen: a titok-széfnek nincs kulcsa (a VAULT_ENCRYPTION_KEY nincs beállítva).',
    )
  }

  let utolsoHibaUzenet = 'ismeretlen hiba'

  for (const kulcs of allapot.olvasoKulcsok) {
    const { data, error } = await supabase.rpc('vault_decrypt', {
      encrypted_input: encryptedText,
      key_input: kulcs,
    })

    if (!error && data !== null && data !== undefined) {
      return data as string
    }
    // A hibaüzenet SOHA nem árulja el, melyik kulccsal próbálkoztunk.
    if (error) utolsoHibaUzenet = error.message
  }

  throw new Error(`Visszafejtés sikertelen: ${utolsoHibaUzenet}`)
}
