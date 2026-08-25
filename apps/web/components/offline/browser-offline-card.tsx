'use client'

import { useEffect, useState } from 'react'
import { Globe, WifiOff } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Böngésző-offline mód magyarázó kártyája a /offline oldalon.
 *
 * A jelenlegi online/offline állapotot a `navigator.onLine` mutatja.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-25 — A KÁRTYA TÖBBET ÍGÉRT, MINT AMIT A KÓD AD
 * ════════════════════════════════════════════════════════════════════════════
 * A korábbi szöveg ezt állította:
 *
 *   „Látható: az utoljára szinkronizált tagok, munkanapló, pénzügyi adatok."
 *   „Szerkeszthető: új tételek, új tag, módosítás — mind »feltöltésre váró«
 *    állapotban marad, amíg visszatér az internet."
 *
 * EGYIK SEM IGAZ a böngészős verzióra:
 *  · A tagnyilvántartás, a munkanapló, a pénzügy és az anyakönyv képernyőit
 *    SZERVER-oldali komponensek állítják össze — kapcsolat nélkül be sem
 *    töltődnek. (A Dexie-tükör megvan a készüléken, de ezek a modulok nem
 *    abból rajzolnak: a `useSyncQuery`-t az egész alkalmazásban csak a Kuka
 *    és maguk az offline-képernyők használják.)
 *  · Az adatrögzítés szerver-akciókkal megy, azok offline elbuknak. A
 *    feltöltésre váró sor VALÓBAN megmarad és magától felkerül — de azt nem
 *    a modulok töltik meg.
 *  · 2026-08-24 óta ráadásul a hitelesített oldalak HTML/RSC-válasza sem megy
 *    lemezre (adatvédelmi javítás: közös gépen kiolvasható volt), tehát még a
 *    korábban meglátogatott oldal sem nyílik meg offline.
 *
 * Ez ugyanaz a hibaosztály, mint a jogi dokumentum „az adat sosem hagyja el az
 * EU-t" mondata: a FELÜLET NE ÍGÉRJEN TÖBBET, MINT AMIT A KÓD AD. Az alábbi
 * szöveg ezért pontosan hármat állít, és mind a három visszamérhető:
 *   (1) offline a Kartotéka saját tartalék lapja fogad
 *       (`public/nincs-internet.html`, `app/sw.ts` → `fallbacks`),
 *   (2) a feltöltésre váró sor megmarad és magától felkerül
 *       (`lib/offline/mutation-queue.ts` + `sync-orchestrator`),
 *   (3) az adatok MEGNYITÁSÁHOZ kapcsolat kell — szándékosan.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function BrowserOfflineCard() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    function update() {
      setOnline(typeof navigator !== 'undefined' ? navigator.onLine : null)
    }
    update()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
      return () => {
        window.removeEventListener('online', update)
        window.removeEventListener('offline', update)
      }
    }
  }, [])

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <Globe className="size-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base text-foreground">
              Mi történik, ha elmegy az internet
            </CardTitle>
            <CardDescription className="text-sm">
              A böngészős verzió a kapcsolat kihagyásait viseli el jól: nem hagy
              magadra, és nem veszít el semmit.
            </CardDescription>
          </div>
          {online !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {online ? 'Online' : <><WifiOff className="size-3" /> Offline</>}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-foreground/80">
          <li>
            <span className="mr-1 font-semibold">Nem a böngésző hibaoldala fogad:</span>
            internet nélkül a Kartotéka saját lapja jelenik meg, és elmondja,
            mi a teendő.
          </li>
          <li>
            <span className="mr-1 font-semibold">Megmarad, ami feltöltésre vár:</span>
            a készülékeden várakozó módosítások nem vesznek el, és maguktól
            felkerülnek, amint újra van kapcsolat.
          </li>
          <li>
            <span className="mr-1 font-semibold">Az adatok megnyitásához internet kell:</span>
            a tagnyilvántartás, a munkanapló, a pénzügy és az anyakönyv
            képernyőit a szerver állítja össze. A Kartotéka szándékosan nem hagy
            belőlük olvasható másolatot a gép lemezén — közös vagy hivatali gépen
            így a következő felhasználó nem tudja kiolvasni őket.
          </li>
        </ul>

        <div className="rounded-md border border-border bg-accent/10 px-3 py-2 text-xs text-foreground/80">
          <span className="font-semibold">Tipp:</span> ha tényleg hálózat nélkül
          dolgoznál (kiszállás, utazás, gyenge lefedettségű parókia), arra az
          asztali alkalmazás való — ott a teljes adatbázisod tartósan elérhető,
          titkosítva a gépeden. A böngészős verzió a rövid kimaradásokra készült.
        </div>
      </CardContent>
    </Card>
  )
}
