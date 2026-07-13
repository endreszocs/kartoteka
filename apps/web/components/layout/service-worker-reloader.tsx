'use client'

/**
 * 2026-07-13 (S12) — Service Worker frissítés-kezelő.
 *
 * A PWA service worker (app/sw.ts) `skipWaiting: true` + `clientsClaim: true`
 * beállítással fut: egy új build (deploy) telepítése után az ÚJ service worker
 * AZONNAL átveszi az irányítást a MÁR NYITOTT fülek felett is. Ilyenkor a fül
 * még a RÉGI JavaScriptet futtatja, de az új SW már az ÚJ build assetjeit
 * szolgálja ki — a régi (deploy által törölt) chunkokat pedig nem találja.
 *
 * TÜNET (a felhasználó bejelentése): „a sidebarban kattintok és nem nyílik meg
 * oldal" — a Next.js kliens-router a régi route-chunkot próbálja betölteni, ami
 * a friss deploy után már nem létezik → ChunkLoadError → a navigáció némán
 * elhal, a jelenlegi oldal viszont még látszik.
 *
 * MEGOLDÁS: amikor egy ÚJ SW veszi át az irányítást (controllerchange), a fület
 * EGYSZER újratöltjük — így a régi/új keveredés helyett tiszta, friss buildre
 * vált. Az ELSŐ regisztrációt (amikor még nem volt controller) NEM töltjük újra
 * (különben minden első látogatás feleslegesen újratöltene), és a `reloading`
 * kapu megakadályozza a végtelen újratöltést.
 */

import { useEffect } from 'react'

export function ServiceWorkerReloader() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Ha a betöltéskor MÁR volt controller, egy KÉSŐBBI controllerchange = ÚJ
    // verzió vette át → újratöltés. Ha nem volt (első telepítés), a clientsClaim
    // okozta első átvételt NEM töltjük újra.
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false

    const onControllerChange = () => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // BIZTONSÁGI HÁLÓ: ha a navigáció mégis ChunkLoadError-ral bukik (a friss
    // deploy törölte a régi chunkot), töltsük újra a fület — de LEGFELJEBB 30
    // másodpercenként egyszer (időbélyeg-kapu), hogy valódi, tartós hiba esetén
    // NE keletkezzen újratöltés-hurok.
    const RELOAD_TS_KEY = 'kartoteka-chunk-reload-ts'
    const looksLikeChunkError = (msg: string, name: string): boolean =>
      name === 'ChunkLoadError' ||
      /Loading chunk [\w-]+ failed/i.test(msg) ||
      /Loading CSS chunk/i.test(msg) ||
      /ChunkLoadError/i.test(msg)
    const maybeReloadForChunkError = (msg: string, name: string) => {
      if (!looksLikeChunkError(msg, name)) return
      try {
        const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || '0')
        if (Date.now() - last < 30_000) return // nemrég már próbáltuk → ne loopoljunk
        sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()))
      } catch {
        // sessionStorage nem elérhető — inkább ne töltsünk újra (hurok-védelem).
        return
      }
      window.location.reload()
    }
    const onError = (e: ErrorEvent) =>
      maybeReloadForChunkError(e?.message || '', (e?.error as { name?: string })?.name || '')
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason as { name?: string; message?: string } | undefined
      maybeReloadForChunkError(reason?.message || String(reason || ''), reason?.name || '')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
