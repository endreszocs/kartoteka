'use client'

/**
 * Prezenter vezérlő — sötét „színpadi" felület (Claude Design, 2026-06-08).
 * Telefonon álló kézi vezérlő, tableten/fekvőben igazi presenter-view:
 * nagy aktuális dia + lapozó-zónák, következő-dia előnézet, görgethető
 * lelkészi jegyzet (A−/A+), eltelt-idő stopper + óra + cél-mérő, folyamatjelző,
 * élő kapcsolat-jelzés, elsötétítés. A valós diákat a DeckRenderer adja.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, EyeOff, List, X } from 'lucide-react'
import { createPresentationSync, type DeckPayload, type SyncState, type PresentationSync } from '@/lib/presentation/sync'
import { buildDeck, DeckRenderer, type DeckItem } from './deck'

// ── Formázók ──
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDur(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
}
function fmtClock(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

const panel: CSSProperties = {
  background: 'var(--stage-2)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-panel)',
}

// ── Valós dia-előnézet 1280×720-on renderelve, a dobozhoz skálázva ──
function ScaledSlide({ item, payload }: { item: DeckItem; payload: DeckPayload }) {
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
    <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: '#0a0f1a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <DeckRenderer item={item} data={payload.data} overrides={payload.overrides} projection />
      </div>
    </div>
  )
}

function titleOf(item: DeckItem, payload: DeckPayload): string {
  if (item.kind === 'custom') return item.slide.title
  const o = payload.overrides[item.key]
  return o?.title || item.def.resolveTitle?.(payload.data) || item.def.defaultTitle
}

export function PresenterRemote({ session }: { session: string }) {
  const [payload, setPayload] = useState<DeckPayload | null>(null)
  const [state, setState] = useState<SyncState>({ index: 0, blackout: false })
  const [elapsed, setElapsed] = useState(0)
  const [now, setNow] = useState<Date>(() => new Date())
  const [fontScale, setFontScale] = useState(1)
  const [listOpen, setListOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState(0)
  const syncRef = useRef<PresentationSync | null>(null)

  useEffect(() => {
    const sync = createPresentationSync(session, {
      onDeck: (p) => { setPayload(p); setLastSeen(Date.now()) },
      onState: (s) => { setState(s); setLastSeen(Date.now()) },
    })
    syncRef.current = sync
    sync.sendRequest()
    // Heartbeat: kérünk frissítést → a vezérlő válaszol → élő kapcsolat-jelzés
    const hb = setInterval(() => sync.sendRequest(), 5000)
    // Idő: stopper + óra + kapcsolat-frissesség újraszámítás
    const timer = setInterval(() => { setElapsed((e) => e + 1); setNow(new Date()) }, 1000)
    return () => { clearInterval(hb); clearInterval(timer); sync.close() }
  }, [session])

  const deck: DeckItem[] = payload ? buildDeck(payload.options) : []
  const count = deck.length
  const idx = Math.min(state.index, Math.max(0, count - 1))
  const current = deck[idx] || null
  const next = deck[idx + 1] || null
  const targetMin = 30
  const commentary = current && current.kind === 'builtin' ? payload?.overrides[current.key]?.commentary : undefined

  // Kapcsolat-állapot a friss üzenetekből
  const connection: 'connecting' | 'connected' | 'disconnected' =
    !payload ? 'connecting' : (now.getTime() - lastSeen < 12000 ? 'connected' : 'disconnected')

  function applyState(s: SyncState) { setState(s); syncRef.current?.sendState(s) }
  function go(delta: number) {
    if (!count) return
    applyState({ ...state, index: Math.max(0, Math.min(count - 1, idx + delta)) })
  }
  function toggleBlackout() { applyState({ ...state, blackout: !state.blackout }) }

  // ── Csatlakozás folyamatban / nincs tartalom ──
  if (!payload || !current) {
    return (
      <div className="kt-stage" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <span className="kt-spin" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--line-strong)', borderTopColor: 'var(--gold)' }} />
        <p style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Csatlakozás a prezentációhoz…</p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-dim)' }}>Párosító kód:
          <span className="tnum" style={{ marginLeft: 8, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink)', fontSize: 22 }}>{session}</span>
        </p>
        <p style={{ margin: 0, maxWidth: 320, fontSize: 12.5, color: 'var(--ink-faint)' }}>
          Nyisd meg az Éves beszámolót a számítógépen, és indítsd a vetítést ezzel a kóddal.
        </p>
      </div>
    )
  }

  return (
    <div className="kt-stage" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Felső sáv: márka + idő + kapcsolat ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', background: 'linear-gradient(150deg,#2fb6a4,#1f7d72)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#04221d', fontWeight: 800 }}>✝</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Prezenter</span>
            <span className="tnum" style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 600 }}>Kód · {session}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Metric label="Eltelt idő" value={fmtDur(elapsed)} big color={timerColor(elapsed, targetMin)} />
          <span style={{ width: 1, height: 34, background: 'var(--line)' }} />
          <Metric label="Óra" value={fmtClock(now)} color="var(--ink-dim)" />
        </div>
        <ConnectionPill connection={connection} />
      </div>

      {/* ── Fő terület: telefon = stacked; tablet/fekvő = grid ── */}
      <div className="kt-presenter-body" style={{ flex: 1, minHeight: 0 }}>
        {/* BAL / FŐ: aktuális dia + lapozó-zónák */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: '#0a0f1a', boxShadow: '0 14px 40px rgba(0,0,0,0.5)' }}>
            <ScaledSlide item={current} payload={payload} />
            {!state.blackout && (
              <div className="tnum" style={{ position: 'absolute', top: 10, right: 10, padding: '5px 11px', borderRadius: 99, background: 'rgba(6,10,18,0.78)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 13, fontWeight: 800, border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' }}>
                {idx + 1} / {count}
              </div>
            )}
            {/* lapozó-zónák (érintés) */}
            <button aria-label="Előző" onClick={() => go(-1)} disabled={idx === 0}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '32%', border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer' }} />
            <button aria-label="Következő" onClick={() => go(1)} disabled={idx >= count - 1}
              style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '32%', border: 'none', background: 'transparent', cursor: idx >= count - 1 ? 'default' : 'pointer' }} />
            {state.blackout && <BlackoutOverlay />}
          </div>
          <div style={{ ...panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <ProgressBar index={idx} total={count} />
            <NavControls onPrev={() => go(-1)} onNext={() => go(1)} onBlackout={toggleBlackout} blackout={state.blackout} atStart={idx === 0} atEnd={idx >= count - 1} />
          </div>
        </div>

        {/* JOBB: cél-mérő + következik + jegyzet + lista-gomb */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ ...panel, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <TargetMeter elapsed={elapsed} targetMin={targetMin} />
            <button onClick={() => setListOpen(true)} aria-label="Diák listája" style={{ width: 46, height: 46, flex: 'none', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-strong)', background: 'var(--stage-3)', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <List size={20} />
            </button>
          </div>
          <NextUp next={next} index={idx} payload={payload} />
          <div style={{ flex: 1, minHeight: 120, display: 'flex' }}>
            <NotePanel note={commentary} fontScale={fontScale} onDec={() => setFontScale((f) => Math.max(0.85, +(f - 0.15).toFixed(2)))} onInc={() => setFontScale((f) => Math.min(1.6, +(f + 0.15).toFixed(2)))} />
          </div>
        </div>
      </div>

      {/* Dia-lista sheet */}
      {listOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setListOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(4,7,12,0.6)' }} />
          <div style={{ marginTop: 'auto', position: 'relative', background: 'var(--stage-1)', borderTopLeftRadius: 'var(--r-xl)', borderTopRightRadius: 'var(--r-xl)', borderTop: '1px solid var(--line-strong)', padding: 16, height: '78%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line-strong)', margin: '0 auto' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Diák — ugrás</span>
              <button onClick={() => setListOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>Bezár <X size={15} /></button>
            </div>
            <div className="scroll-thin" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {deck.map((sl, i) => {
                const active = i === idx
                return (
                  <button key={sl.key} onClick={() => { applyState({ ...state, index: i }); setListOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                      background: active ? 'var(--teal-soft)' : 'var(--stage-2)', border: '1px solid ' + (active ? 'var(--teal-line)' : 'var(--line)') }}>
                    <span className="tnum" style={{ width: 30, flex: 'none', textAlign: 'center', fontSize: 13, fontWeight: 800, color: active ? 'var(--teal)' : 'var(--ink-faint)' }}>{pad(i + 1)}</span>
                    <span style={{ fontSize: 14, fontWeight: active ? 800 : 600, color: active ? 'var(--ink)' : 'var(--ink-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(sl, payload)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .kt-presenter-body { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
        @media (min-width: 920px) and (orientation: landscape) {
          .kt-presenter-body { display: grid; grid-template-columns: 1.62fr 1fr; gap: 14px; padding: 16px; }
        }
      `}</style>
    </div>
  )
}

// ── Idő-szín ──
function timerColor(elapsed: number, targetMin: number): string {
  const t = targetMin * 60
  if (elapsed > t) return 'var(--danger)'
  if (elapsed > t * 0.85) return 'var(--gold)'
  return 'var(--ink)'
}

function Metric({ label, value, big, color }: { label: string; value: string; big?: boolean; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700 }}>{label}</span>
      <span className="tnum" style={{ fontSize: big ? 30 : 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
    </div>
  )
}

function ConnectionPill({ connection }: { connection: 'connecting' | 'connected' | 'disconnected' }) {
  const cfg = {
    connected: { c: 'var(--teal)', t: 'Csatlakozva', live: true, spin: false },
    connecting: { c: 'var(--gold)', t: 'Csatlakozás…', live: false, spin: true },
    disconnected: { c: 'var(--danger)', t: 'Megszakadt', live: false, spin: false },
  }[connection]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 13px', borderRadius: 999,
      background: `color-mix(in srgb, ${cfg.c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${cfg.c} 38%, transparent)` }}>
      <span className={cfg.live ? 'kt-live-dot' : cfg.spin ? 'kt-spin' : ''} style={{ width: 10, height: 10, borderRadius: '50%', flex: 'none',
        background: cfg.spin ? 'transparent' : cfg.c, border: cfg.spin ? `2px solid ${cfg.c}` : undefined, borderTopColor: cfg.spin ? 'transparent' : undefined }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: cfg.c }}>{cfg.t}</span>
    </div>
  )
}

function TargetMeter({ elapsed, targetMin }: { elapsed: number; targetMin: number }) {
  const t = targetMin * 60
  const remain = t - elapsed
  const pct = Math.max(0, Math.min(100, (elapsed / t) * 100))
  const over = remain < 0
  const fill = over ? 'var(--danger)' : pct > 85 ? 'var(--gold)' : 'var(--teal)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700 }}>Cél {targetMin}:00</span>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: fill }}>{over ? '+' + fmtDur(-remain) : fmtDur(remain)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--stage-4)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: fill, transition: 'width 1s linear, background .3s' }} />
      </div>
    </div>
  )
}

function ProgressBar({ index, total }: { index: number; total: number }) {
  const pct = total > 0 ? ((index + 1) / total) * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 600 }}>Haladás</span>
        <span className="tnum" style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{index + 1} <span style={{ color: 'var(--ink-faint)', fontWeight: 600 }}>/ {total}</span></span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: 'var(--stage-4)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,var(--teal),var(--gold))', transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

function NextUp({ next, index, payload }: { next: DeckItem | null; index: number; payload: DeckPayload }) {
  return (
    <div style={{ ...panel, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 800 }}>Következik</span>
      {!next ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', borderRadius: 'var(--r-md)', border: '1px dashed var(--line-strong)', color: 'var(--ink-faint)', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: 10 }}>
          Ez az utolsó dia — a prezentáció vége
        </div>
      ) : (
        <>
          <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}><ScaledSlide item={next} payload={payload} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 700 }}>{index + 2}. dia</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(next, payload)}</span>
          </div>
        </>
      )}
    </div>
  )
}

function NotePanel({ note, fontScale, onDec, onInc }: { note?: string; fontScale: number; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ ...panel, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--teal)', fontWeight: 800 }}>Lelkészi jegyzet</span>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <FontBtn label="A−" onClick={onDec} disabled={fontScale <= 0.85} />
          <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 700, minWidth: 34, textAlign: 'center' }}>{Math.round(fontScale * 100)}%</span>
          <FontBtn label="A+" onClick={onInc} disabled={fontScale >= 1.6} />
        </div>
      </div>
      <div className="scroll-thin" style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: 6 }}>
        {note && note.trim() ? (
          <p style={{ margin: 0, fontSize: 17 * fontScale, lineHeight: 1.5, color: 'var(--ink)', fontWeight: 450, whiteSpace: 'pre-wrap' }}>{note}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Ehhez a diához nincs jegyzet. (A Stúdióban a dia „Szerkesztés”-énél írhatsz lelkészi gondolatot.)</p>
        )}
      </div>
    </div>
  )
}

function FontBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ minWidth: 40, height: 40, padding: '0 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-strong)', background: 'var(--stage-3)', color: 'var(--ink)', fontSize: 15, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1 }}>{label}</button>
  )
}

function NavControls({ onPrev, onNext, onBlackout, blackout, atStart, atEnd }: { onPrev: () => void; onNext: () => void; onBlackout: () => void; blackout: boolean; atStart: boolean; atEnd: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr', gap: 10 }}>
      <NavBtn onClick={onPrev} disabled={atStart} variant="ghost"><ChevronLeft size={20} /> Előző</NavBtn>
      <NavBtn onClick={onBlackout} variant={blackout ? 'danger-on' : 'danger'}><EyeOff size={19} /> {blackout ? 'Kivetít' : 'Elsötétít'}</NavBtn>
      <NavBtn onClick={onNext} disabled={atEnd} variant="primary">Következő <ChevronLeft size={20} style={{ transform: 'rotate(180deg)' }} /></NavBtn>
    </div>
  )
}

function NavBtn({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant: 'ghost' | 'primary' | 'danger' | 'danger-on' }) {
  const styles = {
    ghost: { bg: 'var(--stage-3)', bd: 'var(--line-strong)', fg: 'var(--ink)' },
    primary: { bg: 'linear-gradient(180deg,#2fb6a4,#1f8b7e)', bd: 'transparent', fg: '#04221d' },
    danger: { bg: 'var(--danger-soft)', bd: 'color-mix(in srgb,var(--danger) 45%,transparent)', fg: 'var(--danger)' },
    'danger-on': { bg: 'linear-gradient(180deg,#e8694f,#c8432d)', bd: 'transparent', fg: '#fff' },
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled} style={{ minHeight: 'var(--hit)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 'var(--r-md)', cursor: disabled ? 'not-allowed' : 'pointer', background: styles.bg, border: '1px solid ' + styles.bd, color: styles.fg,
      fontSize: 16, fontWeight: 800, opacity: disabled ? 0.4 : 1, boxShadow: variant === 'primary' ? '0 8px 20px rgba(47,182,164,0.3)' : 'none' }}>
      {children}
    </button>
  )
}

function BlackoutOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,7,12,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, backdropFilter: 'blur(2px)' }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', border: '2px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}><EyeOff size={22} /></div>
      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)' }}>Kivetítő elsötétítve</span>
      <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>A közönség fekete képet lát</span>
    </div>
  )
}
