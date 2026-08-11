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
