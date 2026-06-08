'use client'

/**
 * Kivetítő-fogadóoldal — az `/eloadas/[session]` útvonalon fut (publikus, hogy
 * más eszközről / okos-TV-ről is megnyitható legyen). A tartalmat a vezérlőtől
 * (Studio) kapja a valós idejű csatornán; csak megjeleníti az aktuális diát.
 */

import { useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { createPresentationSync, type DeckPayload, type SyncState, type PresentationSync } from '@/lib/presentation/sync'
import { buildDeck, DeckRenderer } from './deck'

export function ProjectionReceiver({ session }: { session: string }) {
  const [payload, setPayload] = useState<DeckPayload | null>(null)
  const [state, setState] = useState<SyncState>({ index: 0, blackout: false })
  const [showHint, setShowHint] = useState(true)
  const syncRef = useRef<PresentationSync | null>(null)

  useEffect(() => {
    const sync = createPresentationSync(session, {
      onDeck: (p) => setPayload(p),
      onState: (s) => setState(s),
    })
    syncRef.current = sync
    sync.sendRequest()
    // Ismételt kérés, amíg meg nem érkezik a tartalom (a vezérlő lehet, hogy később indul)
    const retry = setInterval(() => sync.sendRequest(), 2500)

    // Wake lock — ne aludjon el a kijelző vetítés közben
    let wl: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const acquire = async () => { try { wl = (await nav.wakeLock?.request('screen')) ?? null } catch { /* nincs API */ } }
    void acquire()
    const onVis = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVis)

    const hideHint = setTimeout(() => setShowHint(false), 6000)

    return () => {
      clearInterval(retry)
      clearTimeout(hideHint)
      document.removeEventListener('visibilitychange', onVis)
      try { void wl?.release() } catch { /* ignore */ }
      sync.close()
    }
  }, [session])

  // Amint megjött a tartalom, ne kérjünk tovább
  useEffect(() => {
    if (payload && syncRef.current) {
      // egyszeri állapot-kérés a friss index-hez
      syncRef.current.sendRequest()
    }
  }, [payload])

  const deck = payload ? buildDeck(payload.options) : []
  const item = deck.length ? deck[Math.min(state.index, deck.length - 1)] : null

  function toggleFullscreen() {
    const el = document.documentElement
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }

  return (
    <div className="fixed inset-0 bg-slate-950" onClick={toggleFullscreen}>
      {state.blackout ? (
        <div className="flex h-full w-full items-center justify-center bg-black" />
      ) : !payload || !item ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center text-white">
          <div className="size-14 animate-spin rounded-full border-4 border-white/20 border-t-white/80" />
          <p className="text-xl font-semibold">Várakozás a vezérlőre…</p>
          <p className="text-sm text-white/60">Csatlakozási kód: <span className="font-mono text-2xl tracking-widest text-white">{session}</span></p>
          <p className="max-w-md text-xs text-white/40">
            Indítsd el a vetítést az Éves beszámoló &bdquo;Vetítés&rdquo; menüjéből ugyanezzel a kóddal.
          </p>
        </div>
      ) : (
        <div className="h-screen w-screen">
          <DeckRenderer item={item} data={payload.data} overrides={payload.overrides} projection />
        </div>
      )}

      {showHint && payload && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/70">
          <Maximize2 className="mr-1 inline size-3" /> Kattints a teljes képernyőhöz
        </div>
      )}
    </div>
  )
}
