import { ShieldCheck } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { BackupPanel } from '@/components/admin/backup/backup-panel'

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
      />
    </>
  )
}
