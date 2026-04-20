'use client'

/**
 * Üres kategóriák CTA — bevétel / kiadás dialog-ban megjelenik, ha a
 * `befizetescel` vagy `kiadascel` tábla üres.
 *
 * A pénzügyi kategóriák (befizetescel, kiadascel) GLOBÁLIS reference
 * táblák — minden gyülekezet ugyanazt használja. Ha ezek üresek, akkor
 * a dialog-okban nincs kategória a legördülőben, és a felhasználó nem
 * tud tételt rögzíteni.
 *
 * Ez a komponens egy egyszerű „generálja a kategóriákat a standard
 * EREK számadási táblából" akciót kínál fel.
 */

import { useState } from 'react'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { seedFinanceCategories } from '@/app/(dashboard)/penzugy/actions'

interface Props {
  /** Mi a neve annak, amihez kategóriák hiányoznak — pl. „bevétel" vagy „kiadás". */
  tipus: 'bevétel' | 'kiadás'
  /** Callback sikeres seed után — a parent új adatokat fetchelhet. */
  onSeeded?: () => void | Promise<void>
}

export function EmptyCategoriesCta({ tipus, onSeeded }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleSeed() {
    setLoading(true)
    const result = await seedFinanceCategories()
    setLoading(false)

    if (result.error) {
      toast.error(`Kategória generálás sikertelen: ${result.error}`)
      return
    }

    const total = result.seededBev + result.seededKia
    if (total === 0) {
      toast.info(
        `A kategóriák már létre vannak hozva (${result.totalBev} bevétel + ${result.totalKia} kiadás). Töltsd újra az oldalt.`,
      )
    } else {
      toast.success(
        `${total} új kategória létrehozva (${result.seededBev} bevétel + ${result.seededKia} kiadás). Az oldal frissítés után használhatóak.`,
      )
    }

    if (onSeeded) await onSeeded()

    // Utolsó opcióként: oldal újratöltés (server komponens újrafuttatás)
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
          <AlertTriangle className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-amber-900 text-sm">Még nincsenek {tipus} kategóriák</h4>
          <p className="text-xs text-amber-800/80 leading-relaxed mt-1">
            Úgy tűnik, a pénzügyi kategóriák még nem vannak beállítva a rendszerben. A standard
            EREK számadási táblát (szamadasicel) egy kattintással létrehozhatod.
          </p>
          <Button
            type="button"
            onClick={handleSeed}
            disabled={loading}
            size="sm"
            className="mt-3 rounded-lg bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Kategóriák generálása…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 size-3.5" /> Kategóriák létrehozása
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
