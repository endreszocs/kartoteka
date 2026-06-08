'use client'

/**
 * Prezenter vezérlő — telefonon/tableten nyitva (`/eloadas/[session]/vezerlo`).
 * Mutatja az aktuális és a következő diát + a lelkészi jegyzetet, és nagy
 * gombokkal lapoz; a vezérlést a valós idejű csatornán küldi a kivetítőnek.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MonitorX, Monitor, List } from 'lucide-react'
import { createPresentationSync, type DeckPayload, type SyncState, type PresentationSync } from '@/lib/presentation/sync'
import { buildDeck, DeckRenderer, type DeckItem } from './deck'

export function PresenterRemote({ session }: { session: string }) {
  const [payload, setPayload] = useState<DeckPayload | null>(null)
  const [state, setState] = useState<SyncState>({ index: 0, blackout: false })
  const [listOpen, setListOpen] = useState(false)
  const syncRef = useRef<PresentationSync | null>(null)

  useEffect(() => {
    const sync = createPresentationSync(session, {
      onDeck: (p) => setPayload(p),
      onState: (s) => setState(s),
      onRequest: () => {
        // ha a kivetítő kér, a prezenter nem küld decket (azt a vezérlő teszi)
      },
    })
    syncRef.current = sync
    sync.sendRequest()
    const retry = setInterval(() => { if (!payload) sync.sendRequest() }, 2500)
    return () => { clearInterval(retry); sync.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const deck: DeckItem[] = payload ? buildDeck(payload.options) : []
  const count = deck.length
  const idx = Math.min(state.index, Math.max(0, count - 1))
  const current = deck[idx] || null
  const next = deck[idx + 1] || null

  function applyState(s: SyncState) {
    setState(s)
    syncRef.current?.sendState(s)
  }
  function go(delta: number) {
    if (!count) return
    const nextIdx = Math.max(0, Math.min(count - 1, idx + delta))
    applyState({ ...state, index: nextIdx })
  }
  function toggleBlackout() { applyState({ ...state, blackout: !state.blackout }) }

  function titleOf(item: DeckItem): string {
    if (item.kind === 'custom') return item.slide.title
    const o = payload?.overrides[item.key]
    return o?.title || item.def.resolveTitle?.(payload!.data) || item.def.defaultTitle
  }
  const commentary = current && current.kind === 'builtin' ? payload?.overrides[current.key]?.commentary : undefined

  if (!payload || !current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-white">
        <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white/80" />
        <p className="text-lg font-semibold">Csatlakozás a prezentációhoz…</p>
        <p className="text-sm text-white/60">Kód: <span className="font-mono text-xl tracking-widest">{session}</span></p>
        <p className="max-w-xs text-xs text-white/40">Nyisd meg az Éves beszámolót a számítógépen, és indítsd a vetítést ezzel a kóddal.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      {/* Fejléc */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-white/80">Prezenter</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{idx + 1} / {count}</span>
        <button type="button" onClick={() => setListOpen((v) => !v)} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Diák listája">
          <List className="size-4" />
        </button>
      </div>

      {listOpen ? (
        <div className="flex-1 overflow-y-auto p-3">
          {deck.map((item, i) => (
            <button key={item.key} type="button"
              onClick={() => { applyState({ ...state, index: i }); setListOpen(false) }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${i === idx ? 'bg-violet-600' : 'bg-white/5 hover:bg-white/10'}`}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{i + 1}</span>
              <span className="truncate text-sm">{titleOf(item)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* Aktuális dia előnézet */}
          <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10">
            <div className="aspect-[16/9] w-full">
              <DeckRenderer item={current} data={payload.data} overrides={payload.overrides} />
            </div>
          </div>

          {/* Jegyzet / lelkészi gondolat */}
          {commentary && (
            <div className="rounded-2xl bg-white/5 p-3 text-sm leading-relaxed text-white/80">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Jegyzet</p>
              {commentary}
            </div>
          )}

          {/* Következő dia */}
          <div className="rounded-2xl bg-white/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Következik</p>
            <p className="mt-0.5 truncate text-sm font-medium text-white/80">{next ? titleOf(next) : '— vége —'}</p>
          </div>
        </div>
      )}

      {/* Vezérlő gombsor */}
      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <button type="button" onClick={() => go(-1)} disabled={idx === 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-5 text-lg font-semibold hover:bg-white/20 disabled:opacity-30">
          <ChevronLeft className="size-6" /> Előző
        </button>
        <button type="button" onClick={toggleBlackout}
          className={`flex items-center justify-center rounded-2xl py-5 px-5 ${state.blackout ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
          aria-label="Elsötétítés">
          {state.blackout ? <Monitor className="size-6" /> : <MonitorX className="size-6" />}
        </button>
        <button type="button" onClick={() => go(1)} disabled={idx === count - 1}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 py-5 text-lg font-semibold hover:bg-violet-500 disabled:opacity-30">
          Következő <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  )
}
