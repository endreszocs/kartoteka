import { ShieldCheck } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { BackupPanel } from '@/components/admin/backup/backup-panel'
import { bontMentesHibaKulcs } from '@/lib/backup/alerts'

/**
 * BIZTONSÁGI MENTÉS — ADMIN ALOLDAL (2026-08-11).
 *
 * A jogosultságot az admin layout (`requireAdminAccess`-sel egyenértékű guard)
 * ÉS minden egyes szerver-akció SAJÁT kapuja adja. Az, hogy az oldal itt van,
 * önmagában nem véd semmit — a `'use server'` exportok élő POST-végpontok.
 *
 * Az oldal célja EGY kérdés megválaszolása egy pillantás alatt:
 * „TEGNAP VALÓDI VOLT-E A MENTÉS?"
 */

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function egyErtek(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  const google = egyErtek(params.google)
  const kod = egyErtek(params.ok)

  /**
   * ⚠️ A `mentes-hiba` PARAMÉTER 2026-08-11-ig ÜRES ÍGÉRET VOLT.
   *
   * A harang-értesítés `hivatkozas` mezője
   * (`/admin/biztonsagi-mentes?mentes-hiba=<nap>-<scope>-<id>`) egyszerre
   * dedup-kulcs ÉS link — de ez az oldal KIZÁRÓLAG a `google` és az `ok`
   * paramétert olvasta. A „Megnyitás" gomb tehát ide hozott, és nem történt
   * semmi: se kiemelés, se szűrés, se magyarázat.
   *
   * Mostantól a paraméter EL VAN OLVASVA, és a panel megnevezi az érintett
   * hatókört + rászűr az előzmény-listára. Ugyanaz a bontó függvény olvassa,
   * amelyik a kulcsot előállítja (`lib/backup/alerts.ts`) — külön parser előbb-
   * utóbb széthúzna a kulcs-formátummal.
   */
  const mentesHibaKulcs = egyErtek(params['mentes-hiba'])
  const mentesHiba = mentesHibaKulcs
    ? bontMentesHibaKulcs(`?mentes-hiba=${mentesHibaKulcs}`)
    : null

  return (
    <>
      <AdminPageHeader
        title="Biztonsági mentés"
        description="Napi, titkosított mentés a Google Drive-ra — és a bizonyíték, hogy tényleg elkészült. Egy mentés, amit sosem próbáltak ki, nem mentés, hanem remény."
        icon={ShieldCheck}
        eyebrow="Rendszerszint"
      />
      <BackupPanel
        googleAllapot={google === 'ok' ? 'ok' : google === 'hiba' ? 'hiba' : null}
        googleKod={kod}
        mentesHiba={mentesHiba}
      />
    </>
  )
}
