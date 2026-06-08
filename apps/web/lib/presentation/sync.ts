'use client'

/**
 * Prezentáció-szinkron — a vezérlő (Studio), a kivetítő-fogadóoldal és a
 * prezenter ablak között.
 *
 * Két szállítóréteg, automatikusan kombinálva:
 *   1. BroadcastChannel — azonos böngésző (pl. második ablak / monitor) között.
 *   2. Supabase Realtime broadcast — más eszköz (telefon/tablet/okos-TV) felé,
 *      a `session` kóddal mint csatorna-azonosítóval.
 *
 * Üzenetek:
 *   - deck:    a teljes tartalom (adat + felülírások + opciók) — új csatlakozónak
 *   - state:   az aktuális dia index + elsötétítés
 *   - request: új csatlakozó kéri az aktuális állapotot
 */

import { createClient } from '@/lib/supabase/client'
import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import type { PresentationOptions, TextOverrides } from '@/components/presentation/deck'

export interface DeckPayload {
  year: number
  data: PresentationData
  overrides: TextOverrides
  options: PresentationOptions
}

export interface SyncState {
  index: number
  blackout: boolean
}

type SyncMessage =
  | { kind: 'deck'; payload: DeckPayload; senderId: string }
  | { kind: 'state'; state: SyncState; senderId: string }
  | { kind: 'request'; senderId: string }

export interface SyncHandlers {
  onDeck?: (payload: DeckPayload) => void
  onState?: (state: SyncState) => void
  onRequest?: () => void
}

export interface PresentationSync {
  sendDeck: (payload: DeckPayload) => void
  sendState: (state: SyncState) => void
  sendRequest: () => void
  close: () => void
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* ignore */ }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function createPresentationSync(session: string | null, handlers: SyncHandlers): PresentationSync {
  const senderId = newId()

  // ── BroadcastChannel (azonos böngésző) ──
  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(`kartoteka-presentation${session ? `:${session}` : ''}`)
  } catch { bc = null }

  function dispatch(msg: SyncMessage | null) {
    if (!msg || msg.senderId === senderId) return
    if (msg.kind === 'deck') handlers.onDeck?.(msg.payload)
    else if (msg.kind === 'state') handlers.onState?.(msg.state)
    else if (msg.kind === 'request') handlers.onRequest?.()
  }

  if (bc) bc.onmessage = (e: MessageEvent) => dispatch(e.data as SyncMessage)

  // ── Supabase Realtime (cross-device), csak ha van session ──
  // A supabase-js `.on('broadcast')` / `.send` túlterhelés-tipizálása szigorú,
  // ezért a broadcast-specifikus hívásokat szűk cast-tal kötjük be.
  type BroadcastChannelApi = {
    on: (type: 'broadcast', filter: { event: string }, cb: (msg: { payload?: SyncMessage }) => void) => unknown
    send: (args: { type: 'broadcast'; event: string; payload: SyncMessage }) => unknown
  }
  let supabase: ReturnType<typeof createClient> | null = null
  let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
  if (session) {
    try {
      supabase = createClient()
      channel = supabase.channel(`presentation:${session}`, { config: { broadcast: { self: false } } })
      ;(channel as unknown as BroadcastChannelApi).on('broadcast', { event: 'msg' }, (p) => dispatch(p.payload ?? null))
      channel.subscribe()
    } catch { channel = null }
  }

  function post(msg: SyncMessage) {
    try { bc?.postMessage(msg) } catch { /* ignore */ }
    try { (channel as unknown as BroadcastChannelApi | null)?.send({ type: 'broadcast', event: 'msg', payload: msg }) } catch { /* ignore */ }
  }

  return {
    sendDeck: (payload) => post({ kind: 'deck', payload, senderId }),
    sendState: (state) => post({ kind: 'state', state, senderId }),
    sendRequest: () => post({ kind: 'request', senderId }),
    close: () => {
      try { bc?.close() } catch { /* ignore */ }
      try { if (supabase && channel) supabase.removeChannel(channel) } catch { /* ignore */ }
    },
  }
}

/** Rövid, ember-barát session-kód a párosításhoz. */
export function generateSessionCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000)
  return String(n)
}
