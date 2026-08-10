'use client'

/**
 * Kivetítő-fogadóoldal — sötét „színpadi" vételi nézet (Claude Design, 2026-06-08).
 * Az `/eloadas/[session]` útvonalon fut (publikus, más eszközről is megnyitható).
 * Állapotok: csatlakozás folyamatban (QR + nagy kód) · csatlakozva (élő, óra-jelző) ·
 * megszakadt (halványított dia + overlay) · elsötétített (fekete) · vége (utolsó dia).
 * Wake-lock + teljes képernyő kattintásra.
 */

import { useEffect, useRef, useState } from 'react'
import { createPresentationSync, type DeckPayload, type SyncState, type PresentationSync } from '@/lib/presentation/sync'
import { buildDeck, DeckRenderer, type DeckItem } from './deck'

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtClock(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

// Valós dia 1280×720-on renderelve, a dobozhoz skálázva
function ScaledSlide({ item, payload, dim }: { item: DeckItem; payload: DeckPayload; dim?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / 1280)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0a0f1a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {/* 2026-08-10: az `options` is átadva — a következtetés-diák innen tudják,
            mely kategóriák vannak kipipálva a vezérlőn. */}
        <DeckRenderer item={item} data={payload.data} overrides={payload.overrides} options={payload.options} projection />
      </div>
      {dim && <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,8,14,0.55)' }} />}
    </div>
  )
}

/**
 * BIZTONSÁGI FIX 2026-08-11 (#12): a párosító URL SOHA nem mehet ki külső
 * szolgáltatóhoz.
 *
 * Ami rossz volt: a QR-kódot az `api.qrserver.com` rajzolta, és a teljes
 * `/eloadas/<kód>/vezerlo` cím a GET query-stringben ment ki. Ez az útvonal
 * hitelesítés NÉLKÜLI (lib/supabase/middleware.ts), a munkamenet-kód pedig az
 * EGYETLEN kulcs ahhoz az adáshoz, amely a gyülekezet taglétszám- és
 * pénzügyi adatait viszi. Így a külső szolgáltató (és minden útközbeni napló,
 * proxy, CDN) megkapta az élő kulcsot, amivel a 12 órás élettartam alatt
 * bárki vezérlőként rácsatlakozhatott volna.
 *
 * Miért jó a javítás: a kódot helyben, a böngészőben rajzoljuk (`uqr`), pont
 * úgy, ahogy a components/filing/csatolmany-panel.tsx teszi a telefonos
 * feltöltő tokennel. Semmilyen hálózati kérés nem keletkezik.
 */
function DecorQR({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { renderSVG } = await import('uqr')
        const markup = renderSVG(url, {
          ecc: 'M',
          border: 2,
          pixelSize: 8,
          whiteColor: '#ffffff',
          blackColor: '#111827',
        })
        if (!cancelled) setSvg(markup)
      } catch {
        // A QR csak kényelmi funkció — a nagy párosító kód mellette olvasható.
        if (!cancelled) setSvg(null)
      }
    })()
    return () => { cancelled = true }
  }, [url])

  if (!svg) return null

  return (
    <div
      role="img"
      aria-label="QR-kód a vezérlőhöz"
      className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      style={{ width: 150, maxWidth: '40vw', borderRadius: 14, background: '#fff', padding: 10 }}
      /* A QR-SVG a saját, épp legenerált kódunk (uqr) — nem külső tartalom. */
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function ProjectionReceiver({ session }: { session: string }) {
  const [payload, setPayload] = useState<DeckPayload | null>(null)
  const [state, setState] = useState<SyncState>({ index: 0, blackout: false })
  const [now, setNow] = useState<Date>(() => new Date())
  const [lastSeen, setLastSeen] = useState(0)
  const [showHint, setShowHint] = useState(true)
  const syncRef = useRef<PresentationSync | null>(null)

  useEffect(() => {
    const sync = createPresentationSync(session, {
      onDeck: (p) => { setPayload(p); setLastSeen(Date.now()) },
      onState: (s) => { setState(s); setLastSeen(Date.now()) },
    })
    syncRef.current = sync
    sync.sendRequest()
    const hb = setInterval(() => sync.sendRequest(), 5000)
    const timer = setInterval(() => { setNow(new Date()) }, 1000)

    // Wake lock
    let wl: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const acquire = async () => { try { wl = (await nav.wakeLock?.request('screen')) ?? null } catch { /* nincs API */ } }
    void acquire()
    const onVis = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVis)
    const hideHint = setTimeout(() => setShowHint(false), 6000)

    return () => {
      clearInterval(hb); clearInterval(timer); clearTimeout(hideHint)
      document.removeEventListener('visibilitychange', onVis)
      try { void wl?.release() } catch { /* ignore */ }
      sync.close()
    }
  }, [session])

  const deck: DeckItem[] = payload ? buildDeck(payload.options, payload.data) : []
  const count = deck.length
  const item = count ? deck[Math.min(state.index, count - 1)] : null
  const connection: 'connecting' | 'connected' | 'disconnected' =
    !payload ? 'connecting' : (now.getTime() - lastSeen < 14000 ? 'connected' : 'disconnected')

  function toggleFullscreen() {
    const el = document.documentElement
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const remoteUrl = `${origin}/eloadas/${session}/vezerlo`

  return (
    <div className="kt-stage" onClick={toggleFullscreen} style={{ position: 'fixed', inset: 0, background: 'var(--stage-0)' }}>
      {/* A „képernyő" — 16:9, középre, a sötét stage-en */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', background: '#000', overflow: 'hidden' }}>
          {/* tartalom állapot szerint */}
          {connection === 'connecting' || !item ? (
            <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4vh', textAlign: 'center', padding: '4vh 4vw' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--gold)' }}>
                <span className="kt-spin" style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent' }} />
                <span style={{ fontSize: 'clamp(16px, 2.4vw, 26px)', fontWeight: 700, letterSpacing: '0.04em' }}>Várakozás a vezérlőre…</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4vw', flexWrap: 'wrap', justifyContent: 'center' }}>
                <DecorQR url={remoteUrl} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 'clamp(11px,1.2vw,15px)', color: 'var(--ink-faint)', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Párosító kód</div>
                  <div className="tnum" style={{ fontSize: 'clamp(40px,7vw,76px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.05, letterSpacing: '0.06em' }}>{session}</div>
                  <div style={{ fontSize: 'clamp(12px,1.3vw,17px)', color: 'var(--ink-dim)', maxWidth: 360, marginTop: 8 }}>
                    Olvasd be a QR-kódot, vagy írd be a kódot a telefon vezérlőjén.
                  </div>
                </div>
              </div>
            </div>
          ) : state.blackout ? (
            <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '8vw', color: 'rgba(255,255,255,0.05)' }}>✝</span>
            </div>
          ) : (
            <>
              <ScaledSlide item={item} payload={payload!} dim={connection === 'disconnected'} />
              {connection === 'disconnected' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(5,8,14,0.55)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'var(--danger)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--danger)' }} />
                    <span style={{ fontSize: 'clamp(16px,2.2vw,24px)', fontWeight: 800 }}>Kapcsolat megszakadt</span>
                  </div>
                  <span style={{ fontSize: 'clamp(12px,1.4vw,16px)', color: 'var(--ink-dim)' }}>Újracsatlakozás folyamatban… a dia változatlan marad.</span>
                </div>
              )}
              {connection === 'connected' && (
                <div style={{ position: 'absolute', bottom: '2.2%', right: '2%', display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 99, background: 'rgba(6,10,18,0.5)', backdropFilter: 'blur(4px)' }}>
                  <span className="kt-live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                  <span className="tnum" style={{ fontSize: 'clamp(10px,1vw,13px)', color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{fmtClock(now)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* finom alsó tipp (eltűnik) */}
      {showHint && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: 99, background: 'rgba(255,255,255,0.07)', color: 'var(--ink-dim)', fontSize: 12, fontWeight: 600 }}>
          Kattints a teljes képernyőhöz · a kijelző nem alszik el
        </div>
      )}
    </div>
  )
}
