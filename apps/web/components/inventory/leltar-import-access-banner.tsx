'use client'

/**
 * A leltár rendszergazdai importálójának HOZZÁFÉRÉS-SÁVJA (2026-08-27).
 *
 * ⛔ MIÉRT SZÜLETETT: Endre jelezte, hogy a fülön „3 helyre is fel lehet
 * tölteni" a fájlt. A `ModuleAdminImportTabV2` egy egész, saját keretes
 * import-felületet hozott magával (fejléc, cél-gyülekezet doboz, elvárt
 * oszlopok, minta-CSV, majd EGY MÁSIK importáló) — a lelkésznek pedig nem
 * kellett eltalálnia, melyik dobozba húzza a fájlt: EGY varázsló van.
 *
 * Ebből a keretből az az EGY dolog maradt, ami valóban információt hordoz:
 * milyen jogon van nyitva az import, és hogyan lehet a delegált munkamenetet
 * lezárni. A többi (több fájlfeltöltő, elvárt oszlopok kézzel karbantartott
 * listája, minta-CSV) a varázslóba került, ill. megszűnt.
 */

import { useState } from 'react'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { deactivateDelegatedImport } from '@/app/(dashboard)/delegated-import/actions'

function hatralevo(expiresAt?: number | null): string | null {
  if (!expiresAt) return null
  const perc = Math.max(0, Math.round((expiresAt - Date.now()) / 60000))
  if (perc >= 60) return `${Math.floor(perc / 60)} óra ${perc % 60} perc`
  return `${perc} perc`
}

export function LeltarImportAccessBanner({
  isGodMode,
  isDelegatedImport,
  delegatedExpiresAt,
  congregationName,
}: {
  isGodMode: boolean
  isDelegatedImport: boolean
  delegatedExpiresAt?: number | null
  congregationName?: string | null
}) {
  const router = useRouter()
  const [lezaras, setLezaras] = useState(false)
  const ido = hatralevo(delegatedExpiresAt)

  async function handleLezaras() {
    setLezaras(true)
    const result = (await deactivateDelegatedImport('inventory')) as { success?: boolean; error?: string }
    setLezaras(false)
    if (result && 'error' in result && result.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Nem sikerült lezárni a munkamenetet.')
      return
    }
    toast.success('A delegált import munkamenet lezárult.')
    router.refresh()
  }

  return (
    <div
      className={`rounded-2xl border p-4 text-sm leading-relaxed ${
        isGodMode
          ? 'border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
          : 'border-sky-200 bg-sky-50/85 text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200'
      }`}
    >
      <div className="flex items-start gap-2">
        {isGodMode ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">
            {isGodMode
              ? 'A teljes rendszergazdai import engedélyezett ebben a munkamenetben.'
              : 'A helyszíni delegált import engedélyezett ezen az eszközön.'}
          </p>
          <p>
            Minden beolvasott sor a(z) <strong>{congregationName || 'aktuális gyülekezet'}</strong>{' '}
            leltárába kerül.
            {!isGodMode && isDelegatedImport && ido ? ` Hátralévő idő: ${ido}.` : ''}
          </p>
          {isDelegatedImport && !isGodMode && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={() => void handleLezaras()}
              disabled={lezaras}
            >
              {lezaras ? 'Lezárás…' : 'Delegált munkamenet lezárása'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
