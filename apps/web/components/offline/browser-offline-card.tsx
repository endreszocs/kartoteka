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
 * Ha a lelkész nem tudja (vagy nem akarja) a desktop appot használni, a
 * webapp maga is működik böngésző-offline módban (PWA + Service Worker +
 * IndexedDB/Dexie réteg). Ez a kártya röviden elmagyarázza, mit tud és
 * mit nem.
 *
 * A jelenlegi online/offline állapotot a `navigator.onLine` mutatja.
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
            <CardTitle className="text-base text-slate-900">
              Böngésző is tud offline dolgozni
            </CardTitle>
            <CardDescription className="text-sm">
              Ha maradsz a böngészőben, a Kartotéka webapp akkor is elérhető,
              ha épp megszűnik az internet.
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
        <ul className="space-y-1.5 text-sm text-slate-700">
          <li>
            <span className="mr-1 font-semibold">Látható:</span> az utoljára
            szinkronizált tagok, munkanapló, pénzügyi adatok.
          </li>
          <li>
            <span className="mr-1 font-semibold">Szerkeszthető:</span> új
            tételek, új tag, módosítás — mind „feltöltésre váró" állapotban
            marad, amíg visszatér az internet.
          </li>
          <li>
            <span className="mr-1 font-semibold">Automatikus szinkron:</span>
            amint újra elérhető a kapcsolat, a rendszer a háttérben feltölti
            a változtatásaidat a szerverre.
          </li>
        </ul>

        <div className="rounded-md border border-sky-100 bg-sky-50/50 px-3 py-2 text-xs text-sky-900">
          <span className="font-semibold">Tipp:</span> a böngészős verzió kényelmes, de
          ha napokig dolgoznál offline (pl. hálózat nélküli utazás), akkor az
          asztali alkalmazás jobban illik a feladathoz — ott a teljes
          adatbázisod tartósan elérhető, titkosítva a gépeden.
        </div>
      </CardContent>
    </Card>
  )
}
