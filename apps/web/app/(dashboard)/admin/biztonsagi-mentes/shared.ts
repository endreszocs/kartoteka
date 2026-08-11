/**
 * Biztonsági mentés admin-felület — MEGOSZTOTT TÍPUSOK (2026-08-11).
 *
 * Külön fájl, mert a Next.js 16 szabálya szerint egy `'use server'` modul
 * KIZÁRÓLAG async függvényt exportálhat — típust és konstanst nem.
 */

export type {
  BackupHealth,
  BackupHealthState,
  BackupLogRow,
  BackupOverview,
  DailyCoverage,
  DriveConnectionStatus,
  DriveReconciliation,
  PruneResult,
  PulseDay,
  RetentionConfig,
} from '@/lib/google-drive/types'

// A mentés-rendszer kora (telepítés napja + a bejáratás lejárata). A kliens-
// oldali kártyák is kiírják, ezért innen is elérhető. ⚠️ A modul TISZTA
// (nulla futásidejű import), tehát a böngészőbe is bekerülhet.
export type { MentesSzuletes, NapEletkor, SzuletesForras } from '@/lib/backup/mentes-kora'
export { huNap, napEletkora, napEltol } from '@/lib/backup/mentes-kora'

/** A lista szűrője. */
export interface BackupListFilter {
  /** Csak ehhez a gyülekezethez. `null` = mind (a hatókörön belül). */
  congregationId?: string | null
  /** Csak ezen a napon (YYYY-MM-DD). */
  nap?: string | null
  /** Csak ilyen kimenetelűek. */
  csakHibas?: boolean
  /** Hány sort kérünk. Alap: 100, max: 500. */
  limit?: number
}

export interface BackupListResult {
  rows?: import('@/lib/google-drive/types').BackupLogRow[]
  needsSql?: boolean
  error?: string
  /** A hatókör gyülekezetei — a szűrő legördülőjéhez. */
  gyulekezetek?: Array<{ id: string; nev: string }>
}

export interface EgyszeruEredmeny {
  success: boolean
  error?: string
  uzenet?: string
}

/**
 * EGY LÉPÉS a mentés-futásban — a felület ebből rajzolja az állapot-listát.
 *
 * ⚠️ AZ ÖT ÁLLAPOT KÜLÖNBÖZIK, és ez nem kozmetika (2026-08-11):
 *      `true`             = kész, rendben,
 *      `'figyelmeztetes'` = megtörtént, de hiányosan — NEM állítja meg a futást,
 *      `'folyamatban'`    = elkezdtük, még nem végeztünk vele (több szelet),
 *      `false`            = ITT BUKOTT EL — ez és KIZÁRÓLAG ez a hiba,
 *      `null`             = idáig EL SEM JUTOTTUNK.
 *
 *    Korábban az `false` a „még nem végeztünk" és a „hiányzik, de nem végzetes"
 *    esetet is jelölte: a felület egy hibátlan, haladó futásra rajzolt piros
 *    keresztet „ITT HIBÁZOTT" képernyőolvasó-szöveggel. Ez a kanonikus típus a
 *    `lib/backup/types.ts` `BackupStepAllapot`-jával — a kettő EGYEZZEN.
 */
export type MentesLepesAllapot = boolean | null | 'figyelmeztetes' | 'folyamatban'

export interface MentesLepes {
  id: string
  cimke: string
  ok: MentesLepesAllapot
  reszlet?: string
}

/**
 * A „MENTÉS MOST" BESZÉDES EREDMÉNYE (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT NEM ELÉG AZ `EgyszeruEredmeny`
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 2026-08-11-én ennyit látott: „A biztonsági mentés futása
 * sikertelen." Se lépés, se ok, se teendő. A szerver közben PONTOSAN tudta a
 * hibát, és a `reszlet` mezőben el is küldte — csak a szerver-akció típusa nem
 * ismerte ezt a mezőt, ezért a `response.json()` után némán elveszett.
 *
 * Ez a típus az a hiányzó kapocs. Minden mezője TITOKMENTES: tábla-nevek,
 * darabszámok, lépés-nevek, gyülekezet-NEVEK (nem azonosítók) — token, kulcs,
 * jelszó, Google `code` SOHA.
 */
export interface MentesFutasEredmeny extends EgyszeruEredmeny {
  /** Meddig jutott a futás. Az első `ok: false` a bukás helye. */
  lepesek?: MentesLepes[]
  /** EGY magyar mondat arról, MIT TEGYEN a tulajdonos. */
  teendo?: string
  /** A pontos technikai ok — összecsukható „Részletek" blokkban. */
  reszlet?: string
  /** Ha a megoldás egy SQL lefuttatása: a fájl útvonala. */
  sqlFajl?: string | null

  // ── HALADÁS ───────────────────────────────────────────────────────────────
  /** Ennyi hatókörnek KELLENE mentés (aktív gyülekezetek + globális). */
  osszes?: number
  sikeres?: number
  sikertelen?: number
  kihagyva?: number
  /** Ennyihez ez a szelet hozzá sem ért. `> 0` esetén FOLYTATNI kell. */
  hatralevo?: number
  /** `false` = a futás NEM végzett mindennel. */
  futottVegig?: boolean
  /**
   * `false` = volt bukott hatókör.
   *
   * ⚠️ NEM ugyanaz, mint a `success`. A `success` azt mondja meg, hogy a SZELET
   *    lefutott-e (ebből dönt a felület a folytatásról); a `mindenSikeres` azt,
   *    hogy minden hatókör sikerült-e (ebből lesz a piros jelentés). A kettő
   *    összemosása miatt állította meg korábban EGYETLEN bukott gyülekezet a
   *    maradék ~700 mentését.
   */
  mindenSikeres?: boolean

  /** Futás-szintű, nem végzetes, de kimondandó tények. */
  figyelmeztetesek?: string[]
  /** A bukott hatókörök NÉVVEL, lépés-listával. */
  bukottak?: Array<{
    scope: string
    nev: string | null
    stage: string | null
    hiba: string | null
    teendo: string | null
    lepesek?: MentesLepes[]
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// A HÁTTÉRBEN FUTÓ MENTÉS ÁLLAPOTA (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Miért ért véget a futás.
 *
 * ⚠️ MIÉRT NEM ELÉG EGY `boolean`. A tulajdonos 2026-08-11-én egy olyan mondatot
 *    kapott, hogy „a mentés állapota ISMERETLEN — lehet, hogy a szerveren tovább
 *    fut". Egy mentés-felület nem tippelhet. Ez az öt érték MEGMONDJA, mi
 *    történt, és mindegyikhez más teendő tartozik.
 */
export type MentesBefejezesOka =
  /** Minden hatókörnek van mai, ellenőrzött mentése. */
  | 'kesz'
  /** A tulajdonos leállította. Az elkészült mentések megmaradtak. */
  | 'leallitva'
  /** A futás nem tudott továbblépni (tartós bukás vagy másik futás tartja a maradékot). */
  | 'nem_halad'
  /** Elfogyott a szelet- vagy idő-korlát, de maradt hátra. */
  | 'korlat'
  /** Az előkészítő fázis vagy a motor hibára futott. */
  | 'hiba'

/** A mai haladás a `backup_log`-ból — ez az EGYETLEN igazság-forrás. */
export interface MentesHaladas {
  /** A nap kulcsa (Europe/Bucharest). */
  nap: string
  varhato: number
  /** Feltöltve, VISSZAOLVASVA, ellenőrző összeg egyezett. Csak ez a „kész". */
  igazolt: number
  hibas: number
  /** Épp fut, vagy „ok" igazolás nélkül — NEM kész. */
  fut: number
  erintetlen: number
}

/**
 * A „Mentés most" ÚJ szerződése (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A KÉRÉS CSAK ELINDÍTJA — A FUTÁS A SZERVEREN ÉL
 * ════════════════════════════════════════════════════════════════════════════
 * Korábban a gomb egy olyan szerver-akciót hívott, ami a MUNKÁT is elvégezte, és
 * a böngésző végig nyitva tartotta a kérést. A Railway edge-proxyja viszont
 * 300 másodperc után elvágja azt a kérést, amiben nem mozog adat — 15 hatókör
 * után a futás elvágódott, és a maradék 768-hoz ~52 kézi kattintás kellett volna.
 *
 * Mostantól az indítás EZREDMÁSODPERCEK alatt visszatér, a futás pedig a
 * szerveren folytatódik. A felület csak NÉZI: másodpercenként lekérdezi ezt az
 * állapotot. A böngésző bezárása, a hálózat megszakadása, a telefon lezárása
 * NEM állítja meg a mentést.
 */
export interface MentesFutasAllapot {
  /** Fut-e MOST mentés a szerveren. */
  fut: boolean
  /** Indított-e ez a folyamat egyáltalán futást (ebből tudja a felület, van-e mit mutatni). */
  voltFutas: boolean
  /** Mikor indult (ISO). */
  indultAt?: string | null
  /** Mikor ért véget (ISO). */
  vegzettAt?: string | null
  /** Hányadik szeletnél tart. */
  szelet?: number
  /** Kérték-e a leállítást (a futó hatókör még befejeződik). */
  megallitasKerve?: boolean
  befejezesOka?: MentesBefejezesOka | null
  /** A mai haladás a naplóból. */
  haladas?: MentesHaladas
  /** A mentés adatbázis-része nincs telepítve. */
  needsSql?: boolean
  /** A felületnek szánt, kész jelentés (szöveg + haladás + lépések + hibák). */
  jelentes?: MentesFutasEredmeny | null
  /** Ha maga az állapot-lekérdezés bukott el. */
  error?: string
}

/**
 * A FIGYELMEZTETŐ SÁV állapota (2026-08-11).
 *
 * ⚠️ MIÉRT NEM ELÉG A `null`. A sáv korábban ÖT, gyökeresen különböző esetre
 * adott ugyanolyan `null`-t: nincs jogosultság, nincs telepítve az SQL, hiba a
 * lekérdezésben, üres hatókör, minden rendben. A felület mindet ugyanúgy
 * jelenítette meg: SEMMIKÉNT. Ezért nem lehetett eldönteni, hogy a hiányzó sáv
 * jó hír vagy néma bukás — ez maga a hibaosztály („egy őrszem, ami hiba esetén
 * elnémul, nem őrszem").
 *
 * Mostantól a `ok` mező MEGMONDJA, miért hallgat.
 */
export type BackupBannerOk =
  /** Van mit mutatni — a `health` ki van töltve. */
  | 'allapot'
  /** Nem admin (vagy a bekapcsolt profil hatóköre üres) → nincs sáv, ez rendben van. */
  | 'nincs_jog'
  /** A mentés adatbázis-része nincs telepítve → külön teendő, nem napi riadó. */
  | 'nincs_sql'
  /** A lekérdezés elhasalt → a felület LÁTHATÓAN jelzi, hogy nem tudja. */
  | 'hiba'

export interface BackupBannerState {
  ok: BackupBannerOk
  health?: import('@/lib/google-drive/types').BackupHealth
  /** Hova visz a „Megnézem, mi a baj" gomb. `null`, ha nincs elérhető felület. */
  ut?: string | null
  /** Csak `ok: 'hiba'` esetén — rövid, felhasználónak is mutatható indok. */
  hibaUzenet?: string
}

export interface DriveTestEredmeny extends EgyszeruEredmeny {
  fiokEmail?: string | null
  szabadBajt?: number | null
  lepesek?: Array<{ lepes: string; ok: boolean }>
}

export interface RiasztasTesztEredmeny extends EgyszeruEredmeny {
  emailKuldve?: boolean
  emailHiba?: string | null
  harangSorok?: number
  harangHiba?: string | null
}

/**
 * A Google-visszatérés kódjainak EMBERI fordítása. A kódok azért rövidek,
 * mert URL-be kerülnek — a részletes szöveg SOHA nem megy query stringbe.
 */
export const GOOGLE_VISSZATERES_UZENETEK: Record<string, string> = {
  ok: 'A Google Drive kapcsolat létrejött, és a próbafájl oda-vissza rendben ment.',
  'nincs-jogosultsag': 'Ehhez a művelethez fő rendszergazdai jogosultság szükséges.',
  'nincs-kulcs':
    'Hiányzik a BACKUP_ENCRYPTION_KEY beállítás, ezért a Google-hozzáférést nem tudnánk titkosítva tárolni. A kapcsolat el sem indult.',
  'nincs-konfiguracio':
    'Hiányzik a GOOGLE_DRIVE_CLIENT_ID vagy a GOOGLE_DRIVE_CLIENT_SECRET beállítás. Nézd meg a Google Cloud útmutató 11. lépését.',
  megszakitva: 'A Google engedélyezést megszakítottad — nem történt változás.',
  'ervenytelen-allapot':
    'Lejárt vagy érvénytelen engedélyezési kérés (10 percnél régebbi). Indítsd újra az összekötést.',
  'nincs-kod': 'A Google nem küldött vissza engedélyezési kódot. Próbáld újra.',
  'token-csere':
    'A Google nem adott tartós hozzáférést. Ha a fiók már korábban engedélyezte az alkalmazást, előbb vond vissza a hozzáférést a Google-fiók biztonsági beállításaiban, majd kösd össze újra.',
  mappa:
    'A mentési mappát nem sikerült létrehozni a Drive-on. Ellenőrizd, hogy van-e szabad tárhely a fiókban.',
  proba:
    'A próbafájl feltöltése vagy visszaolvasása nem sikerült. A kapcsolat NEM megbízható, ezért nem mentettük el.',
  mentes: 'A kapcsolat létrejött, de az adatbázisba nem sikerült elmenteni. Próbáld újra.',
}

/** Emberi bájt-formázás — a felület több helyen használja. */
export function formatBajt(bajt: number | null | undefined): string {
  if (bajt === null || bajt === undefined || !Number.isFinite(bajt)) return '—'
  if (bajt < 1024) return `${bajt} B`
  const egysegek = ['kB', 'MB', 'GB', 'TB']
  let ertek = bajt / 1024
  let i = 0
  while (ertek >= 1024 && i < egysegek.length - 1) {
    ertek /= 1024
    i += 1
  }
  return `${ertek.toLocaleString('hu-HU', { maximumFractionDigits: ertek < 10 ? 1 : 0 })} ${egysegek[i]}`
}
