import 'server-only'

/**
 * A MENTÉS-MOTOR RIASZTÓJA — 2026-08-11.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 3. döntése MIND A HÁROM csatornát megkövetelte egy bukott
 * mentésnél:
 *   1) azonnali e-mail (Brevo),
 *   2) harang-értesítés (`ertesitesek` sor),
 *   3) figyelmeztető sáv az admin felületen.
 *
 * A sáv régóta megvolt (`lib/google-drive/health.ts` + `backup-stale-banner.tsx`),
 * a másik kettőt viszont egy soha meg nem hívott `setBackupAlerter(...)` mögé
 * tervezték. A hívás elmaradt: a motor minden bukásnál csak annyit írt a
 * NAPLÓ-SORBA, hogy „NINCS BEKÖTVE riasztó" — annak a sornak a mezőjébe,
 * amelyik éppen bukott, egy olyan felületen, ahová senki nem nézett.
 *
 * Ez a fájl az a hiányzó kapocs, és MOSTANTÓL A MOTOR ALAPÉRTELMEZÉSE
 * (`worker.ts → aktivRiaszto()`), nem egy elfelejthető bekötés.
 *
 * ⛔ AMI SOHA NEM MEGY BELE: mentett adat, sorérték, gyülekezeti névsor,
 *    letöltési link, kulcs, jelszó, token. Csak a TÉNY és a hely, ahol
 *    megnézhető.
 */

import { sendDriveFailureAlert } from '@/lib/google-drive/alerts'

import type { BackupAlerter, BackupFailureAlert } from './types'

/** Emberi mondat abból, MELYIK lépésnél hasalt el a futás. */
const LEPES_SZOVEG: Record<string, string> = {
  leltar: 'a tábla-leltár ellenőrzésénél',
  szamlalas: 'a sorok megszámolásánál',
  dump: 'az adatok kiolvasásánál',
  titkositas: 'a titkosításnál',
  feltoltes: 'a feltöltésnél',
  igazolas: 'a visszaolvasásnál (igazolás)',
  nyeses: 'a régi mentések takarításánál',
}

/**
 * A motor `BackupAlerter` portjának megvalósítása.
 *
 * SOHA NEM DOB: egy elhasalt riasztás nem boríthatja a mentési futást (a
 * következő gyülekezetnek akkor is el kell készülnie). A kimenetelt viszont
 * VISSZAADJA, és a motor beírja a `backup_log.figyelmeztetesek`-be — így maga
 * a riasztás sem veszhet el némán.
 */
export const sendBackupFailureAlert: BackupAlerter = async (alert: BackupFailureAlert) => {
  const hol = alert.stage ? (LEPES_SZOVEG[alert.stage] ?? `a(z) „${alert.stage}" lépésnél`) : null
  const kiről =
    alert.scope === 'globalis'
      ? 'a rendszerszintű (globális) mentés'
      : `a(z) „${alert.congregationNev ?? 'ismeretlen gyülekezet'}" gyülekezet mentése`

  const reszlet =
    `A(z) ${alert.runDate} napi futásban ${kiről} SIKERTELEN` +
    (hol ? ` — ${hol}` : '') +
    `. Ok: ${alert.uzenet.slice(0, 400)}` +
    (alert.backupLogId ? ` (napló-azonosító: ${alert.backupLogId})` : '')

  try {
    const eredmeny = await sendDriveFailureAlert({
      // A „drive_kapcsolat" nem illik ide; a mentés-hiba a legközelebb az
      // „elavult" címhez áll: nincs friss, ellenőrzött mentés erre a hatókörre.
      kind: 'elavult',
      reszlet,
      congregationId: alert.congregationId,
      congregationNev: alert.congregationNev,
      // Dedup HATÓKÖRÖNKÉNT ÉS NAPONKÉNT: 60 gyülekezetnél egy elszállt futás
      // különben 60 levelet küldene, és a postafiók maga válna a hiba részévé.
      // A kulcs egyben érvényes útvonal is (a harang csak így teszi kattinthatóvá).
      dedupKulcs:
        `/admin/biztonsagi-mentes?mentes-hiba=${alert.runDate}-${alert.scope}-` +
        `${alert.congregationId ?? 'globalis'}`,
    })

    const csatornak: string[] = []
    if (eredmeny.emailKuldve) csatornak.push('e-mail')
    if (eredmeny.harangSorok > 0) csatornak.push(`harang (${eredmeny.harangSorok} címzett)`)
    if (eredmeny.kihagyva) csatornak.push('kihagyva (ma már ment ilyen értesítés)')

    const bajok: string[] = []
    if (eredmeny.emailHiba) bajok.push(`e-mail: ${eredmeny.emailHiba}`)
    if (eredmeny.harangHiba) bajok.push(`harang: ${eredmeny.harangHiba}`)

    return {
      // A „kihagyva" SIKER: ma már elment ugyanez az értesítés.
      ok: eredmeny.kihagyva || (eredmeny.emailKuldve && !eredmeny.harangHiba),
      csatornak,
      hiba: bajok.length > 0 ? bajok.join('; ') : undefined,
    }
  } catch (e: unknown) {
    return {
      ok: false,
      csatornak: [],
      hiba: e instanceof Error ? e.message : 'ismeretlen hiba a riasztás közben',
    }
  }
}
