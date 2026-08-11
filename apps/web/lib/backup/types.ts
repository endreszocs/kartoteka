/**
 * Biztonsági mentés — KÖZÖS TÍPUSOK (2026-08-11).
 *
 * Ez a fájl SZÁNDÉKOSAN nem `'use server'`: a Next.js 16 megszorítása szerint
 * egy `'use server'` fájl KIZÁRÓLAG async függvényt exportálhat, tehát típus,
 * interfész és konstans nem lakhat benne. Minden ilyen ide kerül, és innen
 * importálja a motor, az admin-felület és a Drive-kliens egyaránt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A FÁJL NULLA FUTÁSIDEJŰ IMPORTOT TARTALMAZ. Ez nem véletlen: így az
 * önellenőrző szkript (`scripts/selftest-backup.mjs`) bundler nélkül,
 * önmagában le tudja fordítani és be tudja tölteni.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Alap-fogalmak
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mentés EGYSÉGE. Nincs egyetlen óriási országos fájl:
 *  - `gyulekezet` — egy gyülekezet minden adata (a lelkész is ezt látja),
 *  - `globalis`  — a referencia-adat és a bérlő-váz (csak a rendszergazdáé).
 * A „rendszergazdai teljes mentés" = az adott nap ÖSSZES gyülekezeti fájlja
 * PLUSZ egy `globalis` fájl.
 */
export type BackupScope = 'gyulekezet' | 'globalis'

/** Miért készült a mentés. Az idempotencia-index CSAK a `napi`-ra vonatkozik. */
export type BackupKind = 'napi' | 'kezi' | 'pre_restore'

/**
 * Környezet-címke. A fejlécbe kerül, és a VISSZAÁLLÍTÁS megtagadja az eltérő
 * címkéjű mentést — egy tesztkörnyezetből származó fájl így nem kerülhet élesbe.
 */
export type BackupEnvLabel = 'prod' | 'test'

/** Melyik lépésnél hasalt el a futás. A felület ezt mutatja, nem a stacket. */
export type BackupFailureStage =
  | 'leltar'
  | 'szamlalas'
  | 'dump'
  | 'titkositas'
  | 'feltoltes'
  | 'igazolas'
  | 'nyeses'

// ─────────────────────────────────────────────────────────────────────────────
// Konténer (.kbk) — a fejléc TITKOSÍTATLAN, mert a visszafejtéshez kell
// ─────────────────────────────────────────────────────────────────────────────

/** A DEK szerver-kulccsal burkolt alakja (HKDF + AES-256-GCM). */
export interface WrappedDekServer {
  /** 16 bájt véletlen só, base64 — a HKDF ebből származtatja a burkoló kulcsot. */
  salt: string
  /** 12 bájt GCM nonce, base64. */
  iv: string
  /** 16 bájt GCM auth tag, base64. */
  tag: string
  /** A burkolt 32 bájtos DEK, base64. */
  ct: string
}

/**
 * A DEK MENTÉSI JELSZÓVAL burkolt alakja.
 *
 * A KDF-paraméterek a fájlban vannak, nem a kódban — enélkül egy évekkel
 * későbbi paraméter-emelés OLVASHATATLANNÁ tenné a régi mentéseket.
 */
export interface WrappedDekPassphrase {
  kdf: 'scrypt'
  /** scrypt N (2 hatványa). Éles alap: 2^17 = 131072. */
  N: number
  r: number
  p: number
  salt: string
  iv: string
  tag: string
  ct: string
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HELYREÁLLÍTÓ KULCSPÁR (X25519) — a KULCS-LETÉT (2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 * A PROBLÉMA, amit megold: a felügyelet nélküli napi futás nem ismeri a mentési
 * jelszót, ezért a DEK-et CSAK a szerver-kulccsal tudta beburkolni. Ha a
 * `BACKUP_ENCRYPTION_KEY` elveszne vagy lecserélődne, a felhőben lévő ÖSSZES
 * napi mentés VÉGLEG olvashatatlanná válna — és erről a tulajdonos csak egy
 * visszaállítási kísérletből értesülne.
 *
 * A MEGOLDÁS két, együtt működő mezőből áll, MINDKETTŐ a fájlban:
 *
 *   1) `dek_helyreallito` — a DEK a helyreállító NYILVÁNOS kulcshoz pecsételve.
 *      A cron ehhez NEM ismer titkot: egy nyilvános kulcshoz bárki pecsételhet.
 *
 *   2) `helyreallito_kulcs` — a helyreállító TITKOS kulcs, a MENTÉSI JELSZÓVAL
 *      burkolva (scrypt + AES-256-GCM). A szerver ezt a blobot SZÓ SZERINT
 *      másolja a `backup_settings`-ből: soha nem nyitja ki, tehát a jelszót
 *      továbbra sem ismeri.
 *
 * Együtt: jelszó → titkos kulcs → ECDH → DEK → tartalom. SZERVER-KULCS NÉLKÜL.
 *
 * ⚠️ AMIT EZ ÁRA: a burkolt titkos kulcs a fájlban utazik, tehát aki megszerzi
 *    a fájlt, offline próbálgathatja a jelszót. Ez minden „jelszóval nyitható
 *    fájl" tervnél így van (a `dek_jelszo` mező is ilyen) — ezért N = 2^17
 *    scrypt, és ezért van 12 karakteres minimum a mentési jelszón.
 */
export interface WrappedDekRecovery {
  /** `x25519` — a kulcsegyeztetés algoritmusa. */
  alg: 'x25519'
  /** Az EFEMER nyilvános kulcs (raw, 32 bájt), base64. */
  epk: string
  /** A címzett (helyreállító) nyilvános kulcs SHA-256 ujjlenyomata, hex — csak azonosításra. */
  cimzett: string
  iv: string
  tag: string
  ct: string
}

/**
 * A helyreállító TITKOS kulcs, a mentési jelszóval burkolva.
 * Alakja szándékosan azonos a `WrappedDekPassphrase`-szel: ugyanaz a KDF, ugyanaz
 * a rejtjelező — egy külön séma csak külön hibalehetőség lenne.
 */
export interface WrappedRecoveryPrivateKey {
  kdf: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
  iv: string
  tag: string
  ct: string
  /** A hozzá tartozó NYILVÁNOS kulcs (raw, 32 bájt), base64 — az ECDH-hoz kell. */
  pub: string
}

/**
 * A `.kbk` fájl fejléce.
 *
 * ⛔ A fejlécben NINCS gyülekezetnév, sorszám, e-mail — SEMMILYEN azonosító.
 *    A Drive-fájlnév is átlátszatlan (`kb-<uuid>.kbk`), mert a Google a
 *    METAADATOT LÁTJA, még ha a tartalmat nem is.
 */
export interface KbkHeader {
  v: 1
  /** A fájl saját UUID-ja. Ez megy az AAD-be is — így a keret nem hordozható át. */
  id: string
  /** Melyik szerver-kulcs burkolta a DEK-et (jövőbiztos kulcs-rotációhoz). */
  kulcs_id: string
  cipher: 'AES-256-GCM'
  /** 4 bájt véletlen nonce-előtag, base64. A nonce = előtag ‖ keret-index. */
  nonce_prefix: string
  /** Egy keretbe titkosított (gzip UTÁNI) bájtok száma. Alap: 4 MiB. */
  chunk_plain_bytes: number
  dek_szerver: WrappedDekServer
  /**
   * `null`, ha a tulajdonos még NEM állított be mentési jelszót. A mentés
   * ilyenkor is elkészül (szerver-kulccsal), de a fájl a Kartotéka nélkül nem
   * nyitható meg — ezért a futás figyelmeztetést ír a naplóba.
   */
  dek_jelszo: WrappedDekPassphrase | null
  /**
   * A DEK a helyreállító nyilvános kulcshoz pecsételve. `null`/hiányzó, ha még
   * nincs helyreállító kulcspár (a mentési jelszó beállítása hozza létre).
   *
   * ⚠️ OPCIONÁLIS MEZŐ: a 2026-08-11 ELŐTT készült fájlokban nincs, és ettől a
   *    régi fájlok TOVÁBBRA IS olvashatók maradnak. A `parseHeader` ezért nem
   *    követeli meg.
   */
  dek_helyreallito?: WrappedDekRecovery | null
  /**
   * A helyreállító TITKOS kulcs, a mentési jelszóval burkolva. Ettől lesz a
   * fájl ÖNMAGÁBAN, szerver nélkül megnyitható — csak a jelszóval.
   */
  helyreallito_kulcs?: WrappedRecoveryPrivateKey | null
  env: BackupEnvLabel
  /**
   * MELYIK TÁROLÓBA került a fájl (`google-drive` / `supabase-storage`).
   * A `fileId` értelmezése tárolónként MÁS (Drive: files.id, Supabase: útvonal),
   * ezért az olvasó oldal enélkül rossz tárolóban keresné — és a „nincs ilyen
   * fájl" válaszból nem derülne ki, hogy valójában rossz helyen kerestük.
   */
  tarolo?: string | null
  /** ISO-8601 UTC. */
  keszult: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest — a TITKOSÍTOTT tartalom ELSŐ sora
// ─────────────────────────────────────────────────────────────────────────────

/** Táblánkénti bizonyíték: hány sor és milyen tartalommal. */
export interface BackupTableStat {
  sorok: number
  /** A tábla sorainak kanonikus NDJSON-alakjára számolt SHA-256 (hex). */
  sha256: string
}

/** Amit a mentés SZÁNDÉKOSAN nem tartalmaz — a felület is ezt mondja ki. */
export interface BackupOmissions {
  storage_bucketek: string[]
  auth_users: boolean
  sema: string[]
  tablak: string[]
}

export interface BackupManifest {
  formatum: 1
  keszult: string
  env: BackupEnvLabel
  hatokor: BackupScope
  congregation_id: string | null
  congregation_nev: string | null
  kind: BackupKind
  /** Europe/Bucharest HELYI dátum (YYYY-MM-DD) — ez a napi kulcs. */
  run_date: string
  /** A tábla+oszlop lista SHA-256-ja. Séma-sodródásnál a visszaállítás jelez. */
  sema_ujjlenyomat: string
  tablak: Record<string, BackupTableStat>
  media_fajl: {
    drive_file_id: string | null
    sha256: string | null
    darab: number
  } | null
  kimaradt: BackupOmissions
  figyelmeztetes: string
}

/** A hasznos teher ZÁRÓ sora — enélkül a fájl csonka. */
export interface BackupPayloadFooter {
  vege: true
  sorok: number
  sha256_nyers: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Leltár — a `backup_live_tables()` RPC egy sora
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupLiveTableRow {
  tabla: string
  van_congregation_id: boolean
  /** `null` = BESOROLATLAN → a mentés HANGOS hibával elhasal. */
  hatokor: BackupScope | 'kizart_titok' | 'kizart_egyeb' | null
  /** `null` = mentjük, de a VISSZAÁLLÍTÁS megtagadja. */
  reteg: number | null
  visszaallithato: boolean
  join_predikatum: string | null
  identity_always: string[]
  pk_oszlopok: string[]
  oszlopok: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tároló-port — EZT IMPLEMENTÁLJA A DRIVE-KLIENS
// ─────────────────────────────────────────────────────────────────────────────

/** Egy eltárolt objektum azonosítója, ahogy a tároló visszaadja. */
export interface BackupStorageObject {
  /** Drive: `files.id`. Supabase Storage: a teljes objektum-útvonal. */
  fileId: string
  fileName: string
  bytes: number
}

/**
 * A mentés-motor EGYETLEN kapcsolata a külvilággal.
 *
 * A motor SEMMIT nem tud a Google-ról. A megvalósítások:
 *   · `lib/backup/storage.ts`            → Supabase Storage,
 *   · `lib/google-drive/backup-storage.ts` → Google Drive.
 *
 * ⚠️ A VÁLASZTÁS AUTOMATIKUS (`resolveBackupStorage()`), nem egy külön
 *    „bekötő" hívás dolga: van Drive-kapcsolat → Drive, nincs → Supabase
 *    Storage. A korábbi terv egy egyszeri `setBackupStorageFactory(...)`
 *    hívásra várt, ami SOHA nem született meg — és emiatt minden mentés
 *    ugyanabba a felhő-fiókba került, ahol az adatbázis is van, miközben a
 *    felület Drive-ot mutatott.
 *
 * ⚠️ Minden napló-sor és minden fájl-fejléc RÖGZÍTI, melyik tárolóba került
 *    (`backup_log.storage_nev`, `KbkHeader.tarolo`), mert a `fileId` jelentése
 *    tárolónként MÁS. Az olvasás mindig a rögzített tárolóból történik.
 */
export interface BackupStorage {
  readonly nev: string
  /** Létrehozza (vagy megtalálja) a célmappát, és visszaadja az azonosítóját. */
  ensureFolder(): Promise<string>
  uploadFile(args: {
    fileName: string
    bytes: Buffer
    mimeType?: string
  }): Promise<BackupStorageObject>
  /** A FELTÖLTÖTT bájtok visszaolvasása — ez az IGAZOLÁS alapja. */
  downloadFile(fileId: string): Promise<Buffer>
  /**
   * LÉTEZIK-E MÉG a fájl, és mekkora. `null` = nincs ott.
   *
   * ⚠️ MIÉRT KELL: a média- (fénykép-) fájlra több napi mentés is HIVATKOZHAT.
   *    Ellenőrzés nélkül egy hónapokkal ezelőtti, azóta törölt fájl azonosítója
   *    öröklődne tovább minden új mentésbe — mindegyik „igazolt" lenne, és a
   *    hiány csak egy visszaállítási kísérletnél derülne ki.
   */
  statFile(fileId: string): Promise<BackupStorageObject | null>
  listFiles(): Promise<BackupStorageObject[]>
  /** ⛔ VÉGLEGES törlés. Kukába helyezés TILOS (a 14 napos ígéret 44 nap lenne). */
  deleteFilePermanently(fileId: string): Promise<void>
  testConnection(): Promise<{ ok: boolean; uzenet: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Riasztó-port — EZT IMPLEMENTÁLJA AZ ÉRTESÍTÉSI ÜGYNÖK (`alerts.ts`)
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupFailureAlert {
  scope: BackupScope
  congregationId: string | null
  congregationNev: string | null
  runDate: string
  backupLogId: number | null
  stage: BackupFailureStage | null
  /** CSAK biztonságos szöveg. SOHA nem sorérték, soha nem nyers hibaobjektum. */
  uzenet: string
}

/**
 * A hármas riasztás (e-mail + harang + sáv) belépési pontja.
 * A motor CSAK hívja; hogy hány csatornán megy ki, az az `alerts.ts` dolga.
 *
 * ⚠️ A visszatérési értéket a motor a `backup_log.figyelmeztetesek`-be írja —
 *    különben maga a riasztás veszne el némán (a `sendEmail` SOHA nem dob,
 *    csak `success:false`-t ad).
 */
export type BackupAlerter = (
  alert: BackupFailureAlert,
) => Promise<{ ok: boolean; csatornak: string[]; hiba?: string }>

// ─────────────────────────────────────────────────────────────────────────────
// Eredmény-típusok
// ─────────────────────────────────────────────────────────────────────────────

/** Egy hatókör mentésének kimenete. */
export interface BackupScopeResult {
  scope: BackupScope
  congregationId: string | null
  congregationNev: string | null
  kind: BackupKind
  runDate: string
  ok: boolean
  /** `true`, ha aznap már volt IGAZOLT futás, ezért ez kimaradt. */
  kihagyva: boolean
  backupLogId: number | null
  stage: BackupFailureStage | null
  hiba: string | null
  /** Táblánkénti sorszám — a felület ebből számol napi különbséget. */
  rowCounts: Record<string, number>
  totalRows: number
  ciphertextBytes: number
  sha256: string | null
  fileId: string | null
  fileName: string | null
  mediaFileId: string | null
  mediaSha256: string | null
  mediaBytes: number
  /** Nem végzetes, de KIMONDANDÓ dolgok (pl. nincs mentési jelszó). */
  figyelmeztetesek: string[]
  durationMs: number
}

/** A napi futás összesítése — ez megy vissza a cronnak. */
export interface BackupWorkerResult {
  futott: number
  sikeres: number
  sikertelen: number
  kihagyva: number
  runDate: string
  semaUjjlenyomat: string | null
  /** Nem hatókörhöz köthető, de jelzendő tények (pl. tegnap nem volt mentés). */
  figyelmeztetesek: string[]
  hatokorok: BackupScopeResult[]

  // ── KÖTEGELÉS ÉS FOLYTATÁS (2026-08-11) ──────────────────────────────────
  /** Ennyi hatókört KELLETT volna érinteni (aktív gyülekezetek + globális). */
  osszes: number
  /** Ennyivel dolgoztunk ténylegesen ebben a szeletben (kihagyás nem számít). */
  feldolgozva: number
  /**
   * Ennyihez HOZZÁ SEM ÉRTÜNK az idő- vagy darab-korlát miatt.
   *
   * ⚠️ EZ NEM HIBA, de KIMONDANDÓ. A legrosszabb kimenet az lenne, ha a felület
   *    zöldet mutatna 300 kész mentésre, miközben 484 hatókör érintetlen maradt.
   */
  hatralevo: number
  /**
   * Ennyi hatókört EGY MÁSIK, ÉPPEN FUTÓ mentés tartott a kezében (bérlet).
   *
   * ⚠️ 2026-08-11. A felület és a cron egyszerre indulhat. Bérlet nélkül
   *    mindkettő ugyanazt a gyülekezetet mentette volna le — két fájl kerülne a
   *    Drive-ra ugyanarról a napról, és a `backup_log` csak az UTOLSÓ
   *    `drive_file_id`-t őrzi meg: a másik ÁRVA fájl lesz, amit a nyesés nem
   *    talál meg és soha nem töröl. A tele Drive pedig pont az, amitől az ÚJ
   *    mentés bukik el.
   *
   * ⚠️ EZ NEM KÉSZ MUNKA. A `hatralevo` TARTALMAZZA — a következő szelet
   *    újrapróbálja (addigra vagy igazolt lesz, vagy lejár a bérlet).
   */
  foglalt: number
  /** `true`, ha a futás MINDEN hatókörhöz hozzáért. */
  futottVegig: boolean
  /** A futás lépés-listája — ebből látja a tulajdonos, MEDDIG jutottunk. */
  lepesek: BackupRunStep[]
}

/**
 * EGY LÉPÉS KIMENETELE — ÖT állapot, és egyik sem helyettesíti a másikat.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11 BŐVÍTÉS — MIÉRT NEM ELÉG A `boolean | null`
 * ════════════════════════════════════════════════════════════════════════════
 * A háromértékű szerződés alatt az `ok: false` KÉT, teljesen különböző dolgot
 * jelölt, és mindkettő HAZUDOTT a tulajdonosnak:
 *
 *   (a) „MÉG NEM VÉGEZTÜNK VELE". A 784 hatókörös futás TERVEZETTEN több
 *       szeletben megy; minden köztes szelet után maradt hátra hatókör, és a
 *       „Mentés hatókörönként" lépés emiatt `false`-t kapott. A felület PIROS
 *       KERESZTET rajzolt egy hibátlan, haladó futásra, és a képernyőolvasónak
 *       szó szerint azt mondta: „— ITT HIBÁZOTT" — nulla hiba mellett.
 *
 *   (b) „HIÁNYZIK, DE NEM VÉGZETES". A helyreállító kulcs-letét hiánya és a
 *       takarítás bukása nem állítja meg a mentést, mégis piros keresztet
 *       kapott egy egyébként SIKERES futás jelentésében — egy zöld dobozban.
 *       Két, egymásnak ellentmondó állítás egy dobozban.
 *
 * Ezért az `false` mostantól KIZÁRÓLAG valódi bukást jelent:
 *
 *    `true`            = kész, rendben,
 *    `'figyelmeztetes'`= megtörtént, de hiányosan — NEM állítja meg a futást,
 *    `'folyamatban'`   = elkezdtük, még nem végeztünk vele (több szelet),
 *    `false`           = ITT BUKOTT EL (ez és csak ez a hiba),
 *    `null`            = idáig EL SEM JUTOTTUNK.
 *
 * ⚠️ A felület MINDEGYIKHEZ saját ikont ÉS saját LÁTHATÓ szöveget rendel — a
 *    megkülönböztetés nem lehet pusztán szín- vagy alakbeli (WCAG 1.4.1).
 */
export type BackupStepAllapot = boolean | null | 'figyelmeztetes' | 'folyamatban'

/**
 * A FUTÁS EGY LÉPÉSE — ebből épül a felület állapot-listája (2026-08-11).
 *
 * ⛔ TITOK SOHA nem kerülhet a `reszlet` mezőbe (token, kulcs, jelszó, Google
 *    `code`) — sem értékkel, sem hosszal, sem előtaggal.
 */
export interface BackupRunStep {
  /** Gépi azonosító. A felület EZ alapján párosít — a címke szövege változhat. */
  id: string
  /** Amit a tulajdonos lát. Magyar, ékezetes, tegező. */
  cimke: string
  ok: BackupStepAllapot
  /** Rövid, TITOKMENTES tény. Pl. „784 hatókör", „Google Drive", „157 tábla". */
  reszlet?: string
}
