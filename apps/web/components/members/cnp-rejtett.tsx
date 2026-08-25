'use client'

/**
 * CnpRejtett — a személyi szám (CNP / országfüggő személyi azonosító) a
 * felületen MINDIG rejtve jelenik meg, mint egy jelszó (GDPR-szellemű
 * megjelenítési szabály, Endre kérése 2026-08-25).
 *
 * - Alapállapot: fix hosszú „••••••••••••" maszk — a maszk hossza SZÁNDÉKOSAN
 *   nem egyezik az érték hosszával (a hossz maga is információ lenne).
 * - A szem-ikonnal fedhető fel, újra elrejthető; a dialógus/nézet bezárásakor
 *   az állapot elvész (nem perzisztens).
 * - Az ELSŐ felfedéskor (komponens-életciklusonként egyszer) fire-and-forget
 *   naplózás megy a szerverre (member.cnp_megtekintve audit-esemény), ha van
 *   szemelyId. A naplózás sosem blokkolja a felfedést.
 * - A GENERÁLT egyházi azonosítók (pl. „EC-…") is UGYANÚGY maszkolódnak — nem
 *   különböztetjük meg őket a valódi személyi számoktól (egyszerűség + a
 *   megjelenés se árulja el, melyik).
 */

import { useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { logCnpFelfedes } from '@/app/(dashboard)/tagnyilvantartas/cnp-actions'

/** Fix hosszú maszk — nem árulja el a tárolt érték hosszát. */
const CNP_MASZK = '••••••••••••'

export function CnpRejtett({
  cnp,
  szemelyId,
  kompakt,
}: {
  cnp: string | null | undefined
  szemelyId?: number
  kompakt?: boolean
}) {
  const [mutat, setMutat] = useState(false)
  // Életciklusonként EGY naplóbejegyzés — az ide-oda kapcsolgatás nem spammel.
  const naplozva = useRef(false)

  if (!cnp || !cnp.trim()) {
    return (
      <span className="text-muted-foreground/70" title="Nincs rögzítve">
        —<span className="sr-only"> nincs rögzítve</span>
      </span>
    )
  }

  const valt = () => {
    const kovetkezo = !mutat
    if (kovetkezo && !naplozva.current && szemelyId) {
      naplozva.current = true
      // Fire-and-forget: az action sosem dob, az eredményt nem várjuk meg.
      void logCnpFelfedes(szemelyId)
    }
    setMutat(kovetkezo)
  }

  return (
    <span className={`inline-flex items-center ${kompakt ? 'gap-0.5' : 'gap-1'}`}>
      <span className="break-all font-mono tabular-nums">
        {mutat ? (
          cnp
        ) : (
          <>
            <span aria-hidden>{CNP_MASZK}</span>
            <span className="sr-only">személyi szám elrejtve</span>
          </>
        )}
      </span>
      {/* min. 36px-es koppintási cél (size-9) — mobile-first követelmény */}
      <button
        type="button"
        onClick={(event) => {
          // Listasorba ágyazva a felfedés NE váltson ki sor-kattintást.
          event.stopPropagation()
          valt()
        }}
        aria-label={mutat ? 'Személyi szám elrejtése' : 'Személyi szám megjelenítése'}
        aria-pressed={mutat}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800"
      >
        {mutat ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </span>
  )
}
