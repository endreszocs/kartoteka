'use client'

/**
 * A „Veszélyes zóna" MÁSODIK kártyája: adat-visszaállítás + a hozzá tartozó
 * napló. 2026-08-11.
 *
 * A panel és a napló ugyanazt a frissítés-számlálót osztja: egy lefutott
 * visszaállítás után a napló azonnal újratölt, tehát a rendszergazda LÁTJA a
 * saját műveletét bekerülni. Ez nem kényelem: az önellenőrzés az, ami elárulja,
 * ha valami nem a szándéka szerint történt.
 */

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { RestoreLogList } from './restore-log-list'
import { RestorePanel } from './restore-panel'

export function RestoreTab() {
  const [frissites, setFrissites] = useState(0)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
        <p className="flex items-center gap-1.5 font-semibold text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          A rendszer legveszélyesebb művelete
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A visszaállítás felülírja az élő adatot egy korábbi mentés tartalmával. Minden
          lépés naplózódik, és mielőtt bármi megváltozna, a rendszer menti a mostani
          állapotot. Ez a művelet csak a fő rendszergazdának érhető el.
        </p>
      </div>

      <RestorePanel onFinished={() => setFrissites((v) => v + 1)} />

      <RestoreLogList refreshKey={frissites} />
    </div>
  )
}
