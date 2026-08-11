/**
 * Google Drive mentés-tároló — KÖZÖS TÍPUSOK (2026-08-11).
 *
 * SZÁNDÉKOSAN nincs benne `server-only`: ezeket a típusokat a kliens-oldali
 * admin komponensek is importálják (csak típus, futásidőben nulla kód).
 * Titkot (refresh token, jelszó, kulcs) EGYETLEN típus sem hordoz.
 */

/** A Drive-fájl azon mezői, amelyekre a rendszernek szüksége van. */
export interface DriveFile {
  id: string
  name: string
  /** Bájt. A Drive stringként adja vissza — itt már szám. */
  size: number | null
  createdTime: string | null
  modifiedTime: string | null
  mimeType: string | null
}

/** A Drive-kapcsolat állapota — ez megy a felületre. Titok NINCS benne. */
export interface DriveConnectionStatus {
  /** Van eltárolt (titkosított) refresh token ÉS mappa-azonosító. */
  osszekotve: boolean
  /** A mentéseket fogadó Google-fiók címe (a felület kiírja — a tulajdonosé). */
  fiokEmail: string | null
  /** A célmappa Drive-azonosítója (nem titok: önmagában használhatatlan). */
  mappaId: string | null
  osszekotveAt: string | null
  /** 'nincs' | 'ok' | 'hiba' — a legutóbbi token-frissítés kimenetele. */
  tokenAllapot: 'nincs' | 'ok' | 'hiba'
  /**
   * A token-hiba EMBERI szövege. SOHA nem tartalmazza a tokent, a client
   * secretet, vagy azok hosszát/előtagját.
   */
  tokenHiba: string | null
}

/** A megőrzési szabály — a felületen szerkeszthető. */
export interface RetentionConfig {
  napi: number
  heti: number
  havi: number
}

/** Egy mentési futás sora a listához (titkosítatlan, mert CSAK SZÁMOK). */
export interface BackupLogRow {
  id: number
  scope: 'gyulekezet' | 'globalis'
  congregationId: string | null
  congregationNev: string | null
  kind: 'napi' | 'kezi' | 'pre_restore'
  runDate: string
  startedAt: string
  finishedAt: string | null
  status: 'fut' | 'ok' | 'hiba'
  failureStage: string | null
  failureMessage: string | null
  /** Táblánkénti sorszám — a részletek-dialógus ebből él, JELSZÓ NÉLKÜL. */
  rowCounts: Record<string, number>
  rowCountsDelta: Record<string, number> | null
  totalRows: number
  ciphertextBytes: number | null
  sha256: string | null
  env: 'prod' | 'test'
  driveFileId: string | null
  driveFileName: string | null
  /** ⚠️ CSAK EZ jelenti, hogy a mentés IGAZOLT. A `status='ok'` önmagában NEM elég. */
  driveVerifiedAt: string | null
  mediaDriveFileId: string | null
  mediaBytes: number | null
  figyelmeztetesek: string[]
  prunedAt: string | null
}

/**
 * A rendszer egészségi állapota. A felület EBBŐL színez.
 *
 * ⚠️ A `friss` (zöld) állapot CSAK akkor állítható elő, ha van olyan sor,
 * amelyben `status='ok'` ÉS `drive_verified_at IS NOT NULL`. Bizonyítatlan
 * zöld nincs — ez a modul legfontosabb szabálya.
 */
export type BackupHealthState =
  | 'sql_hianyzik' // a migráció még nem futott le — nem tudunk semmit
  | 'nincs_mentes' // fut a rendszer, de EGYETLEN igazolt mentés sincs
  | 'kritikus' // >96 óra
  | 'elavult' // 48–96 óra
  | 'friss' // <48 óra, igazoltan

export interface BackupHealth {
  allapot: BackupHealthState
  /** A legutóbbi IGAZOLT (drive_verified_at) mentés befejezése. */
  utolsoIgazoltAt: string | null
  /** Órában, a legutóbbi igazolt mentés óta. null = még sosem volt. */
  oraSzam: number | null
  /** Ha a Drive-kapcsolat elszakadt, ez külön mondatot kap a felületen. */
  driveHiba: string | null
  /** Emberi mondat — ezt írja ki a sáv és az áttekintő kártya. */
  mondat: string
}

/** „Tegnap valódi volt-e a mentés?" — a kérdés közvetlen válasza. */
export interface DailyCoverage {
  /** A vizsgált nap (Europe/Bucharest helyi dátum, YYYY-MM-DD). */
  nap: string
  /** Hány hatókörnek KELLETT volna mentés (aktív gyülekezetek + globális). */
  varhato: number
  /** Ebből hány IGAZOLT (ok + drive_verified_at). */
  igazolt: number
  /** Hány futott le hibával. */
  hibas: number
  /** Hány indult el, de nem fejeződött be (lezáratlan „fut" sor). */
  befejezetlen: number
  /** Hány hatókörről NINCS SEMMILYEN sor — ez a legcsendesebb hiba. */
  hianyzik: number
  /** A hiányzó/hibás gyülekezetek nevei (max 20, a felület kiírja). */
  problemasNevek: string[]
}

/** Egy nap a 14 napos pulzus-csíkon. */
export interface PulseDay {
  nap: string
  igazolt: number
  hibas: number
  varhato: number
}

/** A Drive-egyeztetés: a napló szerint N fájl kell, a Drive-on M van. */
export interface DriveReconciliation {
  futott: boolean
  naploSzerint: number
  driveOn: number
  /** A naplóban szereplő, de a tárolóban NEM található fájlok száma. */
  hianyzo: number
  /**
   * Ebből HÁNY a FÉNYKÉPFÁJL. Külön szám, mert más a következménye: a mentés a
   * felületen zöld marad (a fő fájl megvan), a visszaállítás viszont — helyesen —
   * MEG FOG TAGADNI, nehogy a gyülekezet összes arcképét kitörölje. Egy hiányzó
   * média-fájl tehát „tökéletesnek látszó" mentéseket tesz visszaállíthatatlanná.
   */
  hianyzoMedia?: number
  /**
   * Régebbi, MÁSIK tárolóba (pl. Supabase Storage) írt mentések száma. Ezek
   * hiánya az aktuális tárolóból NEM hiba — de tudni kell róluk.
   */
  masTaroloban?: number
  /** A tárolóban lévő, de a naplóban ismeretlen fájlok száma (SOHA nem töröljük). */
  ismeretlen: number
  hiba: string | null
}

/** A teljes admin-áttekintő — egyetlen szerver-hívásban. */
export interface BackupOverview {
  needsSql?: boolean
  error?: string
  health: BackupHealth
  tegnap: DailyCoverage
  ma: DailyCoverage
  pulzus: PulseDay[]
  drive: DriveConnectionStatus
  /**
   * A TÉNYLEGESEN használt tároló neve (`google-drive` / `supabase-storage`).
   *
   * ⚠️ MIÉRT KÜLÖN MEZŐ: a `drive.osszekotve` csak annyit mond, hogy VAN
   *    OAuth-token. Korábban a felület ebből következtetett arra, hogy a
   *    mentések a Drive-ra mennek — miközben a motor a Supabase Storage-ba
   *    írt, mert a Drive-gyár bekötése elmaradt. A felület nem állíthat olyat,
   *    amit nem a valóságból olvasott ki.
   */
  taroloNev: string
  egyeztetes: DriveReconciliation
  /** A mentési jelszó BE VAN-E állítva. A jelszó maga SOHA nem jön vissza. */
  jelszoBeallitva: boolean
  jelszoBeallitvaAt: string | null
  /**
   * VAN-E HELYREÁLLÍTÓ KULCSPÁR (kulcs-letét). `false` esetén a napi mentések
   * KIZÁRÓLAG a szerver `BACKUP_ENCRYPTION_KEY`-ével nyithatók — a kulcs
   * elvesztése az egész archívumot olvashatatlanná tenné.
   */
  helyreallitoKulcs: boolean
  retention: RetentionConfig
  maxFileMb: number
  riasztasEmail: string | null
  /** true = master (fő rendszergazda): övé a Drive-kapcsolat és a visszaállítás. */
  master: boolean
  accessLevel: 'master' | 'admin' | 'district_admin'
}

/** A nyesés (retention) eredménye — a felület ezt írja ki. */
export interface PruneResult {
  success: boolean
  error?: string
  /** Hány Drive-fájl törlődött VÉGLEGESEN. */
  torolt: number
  /** Hány mentés maradt meg. */
  megtartott: number
  /** Besorolhatatlan Drive-fájlok — ezeket SOHA nem töröljük, csak jelentjük. */
  ismeretlenFajlok: string[]
  /** Emberi magyarázat, ha a nyesés szándékosan nem törölt semmit. */
  megjegyzes?: string
}

export const RETENTION_DEFAULT: RetentionConfig = { napi: 14, heti: 8, havi: 6 }

/** A `pre_restore` mentés MINIMÁLIS megőrzése — a nyesés nem nyúl hozzá. */
export const PRE_RESTORE_MEGORZES_NAP = 90

/** A `kezi` mentés megőrzése. */
export const KEZI_MEGORZES_NAP = 30

/**
 * Ennyi IGAZOLT mentés alá a nyesés SOHA nem megy. Ha a törlés után kevesebb
 * maradna, inkább nem törlünk semmit — a hely olcsóbb, mint az adat.
 */
export const MINIMUM_MEGTARTOTT = 7

/** 48 óra: innen figyelmeztet a sáv (borostyán). */
export const ELAVULT_ORA = 48
/** 96 óra: innen destruktív tónus. */
export const KRITIKUS_ORA = 96
