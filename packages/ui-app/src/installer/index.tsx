'use client'

/**
 * Telepítő wizard UI — Sprint R F6 (v0.8.5).
 *
 * Származás: a `Kartoteka.html` design-handoff `screens.jsx` `InstallerWizard`
 * komponensének TSX portja. **Csak UI réteg** — a tényleges telepítési flow
 * (NSIS futtatás, fájlok kicsomagolása, sign verifikáció) ehhez nem kötött.
 *
 * Architekturális döntés (Sprint R F6 kompromisszum):
 *   - Most CSAK a UI komponens készül el a `packages/ui-app`-ban.
 *   - Demo preview a desktop appon `/dev/installer-preview` route-on.
 *   - A teljes Tauri-mini installer wrapper-app (Rust + Vite + ezen UI)
 *     SPRINT S F2-be kerül, akkor együtt a build-pipeline integrációval
 *     (`ops/release-build.ps1` bővítés, sign-flow, Supabase Storage).
 *
 * Méret: 980×660 fix (a design-spec szerint). Windows 11 stílus (Segoe UI,
 * fehér háttér, mély kékeszöld banner, lapos ikonok).
 */

import { useState, type ReactNode } from 'react'

// ──────────────────────────────────────────────────────────────────────
// Konstansok
// ──────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, name: 'Üdvözlés' },
  { id: 1, name: 'Licencszerződés' },
  { id: 2, name: 'Telepítés helye' },
  { id: 3, name: 'Komponensek' },
  { id: 4, name: 'Telepítés' },
  { id: 5, name: 'Befejezés' },
] as const

const BANNER_BG = '#1f3a3a'
const BANNER_FG = '#f4ecd8'
const APP_VERSION = 'v0.8.5'

// ──────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────

export interface InstallerWizardProps {
  /** Kezdő lépés (0-5). Default: 0. */
  initialStep?: number
  /** Width — fix 980 a design szerint. */
  width?: number
  /** Height — fix 660 a design szerint. */
  height?: number
  /** Logo asset path. Default: `/icon.png`. */
  logoSrc?: string
  /** Megjelenítendő verzió (a banner alatt). */
  version?: string
  /** „Befejezés" gomb callback-je. */
  onFinish?: () => void
  /** „Mégse" gomb callback-je. */
  onCancel?: () => void
}

// ──────────────────────────────────────────────────────────────────────
// Fő komponens
// ──────────────────────────────────────────────────────────────────────

export function InstallerWizard({
  initialStep = 0,
  width = 980,
  height = 660,
  logoSrc = '/icon.png',
  version = APP_VERSION,
  onFinish,
  onCancel,
}: InstallerWizardProps) {
  const [step, setStep] = useState(initialStep)
  const [accept, setAccept] = useState(true)

  const next = () => {
    if (step < 5) setStep(step + 1)
    else onFinish?.()
  }
  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        background: '#f3f3f3',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        boxShadow: '0 30px 80px rgba(0,0,0,.2)',
      }}
    >
      {/* Title bar — Windows 11 stílus */}
      <div
        style={{
          height: 36,
          background: '#fafafa',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          flexShrink: 0,
        }}
      >
        <img
          src={logoSrc}
          alt=""
          style={{ width: 16, height: 16, objectFit: 'contain', marginRight: 8 }}
        />
        <div style={{ fontSize: 12, color: '#202020' }}>Kartotéka — Telepítővarázsló</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 0 }}>
          {['—', '☐', '✕'].map((g, i) => (
            <span
              key={g}
              style={{
                width: 46,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: i === 2 ? '#202020' : '#444',
                cursor: 'pointer',
              }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {step === 0 ? (
          <InstallerWelcome logoSrc={logoSrc} />
        ) : step === 5 ? (
          <InstallerFinish />
        ) : (
          <>
            <SidebarBanner logoSrc={logoSrc} version={version} />
            <div
              style={{
                flex: 1,
                padding: '28px 32px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#202020', marginBottom: 4 }}>
                {STEPS[step].name}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
                {step === 1 && 'Olvassa el a licencszerződést, mielőtt telepítené a Kartotékát.'}
                {step === 2 && 'Válassza ki, melyik mappába telepíti a Kartotékát.'}
                {step === 3 && 'Válassza ki a telepíteni kívánt összetevőket.'}
                {step === 4 && 'Kérjük, várjon, amíg a telepítő dolgozik.'}
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#fff',
                  border: '1px solid #d4d4d4',
                  padding: 18,
                  fontSize: 12,
                  color: '#333',
                  overflow: 'hidden',
                }}
              >
                {step === 1 && <LicenceBody accept={accept} setAccept={setAccept} />}
                {step === 2 && <DestinationBody />}
                {step === 3 && <ComponentsBody />}
                {step === 4 && <ProgressBody />}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          height: 56,
          background: '#fafafa',
          borderTop: '1px solid #e5e5e5',
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, fontSize: 11, color: '#888' }}>
          Lépés {step + 1} / {STEPS.length}: {STEPS[step].name}
        </div>
        <WinButton onClick={prev} disabled={step === 0}>
          ‹ Előző
        </WinButton>
        {step < 5 ? (
          <WinButton primary onClick={next} disabled={step === 1 && !accept}>
            {step === 3 ? 'Telepítés' : 'Tovább ›'}
          </WinButton>
        ) : (
          <WinButton primary onClick={onFinish}>
            Befejezés
          </WinButton>
        )}
        <WinButton onClick={onCancel}>Mégse</WinButton>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SidebarBanner — bal oldali sáv (logó + verzió)
// ──────────────────────────────────────────────────────────────────────

function SidebarBanner({ logoSrc, version }: { logoSrc: string; version: string }) {
  return (
    <div
      style={{
        width: 164,
        background: BANNER_BG,
        color: BANNER_FG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: '30px 16px',
      }}
    >
      <img
        src={logoSrc}
        alt=""
        style={{ width: 84, height: 84, objectFit: 'contain' }}
      />
      <div style={{ fontSize: 12, textAlign: 'center', opacity: 0.8, lineHeight: 1.5 }}>
        Kartotéka
        <br />
        Setup Wizard
        <br />
        {version}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WinButton — Windows 11 stílusú gomb
// ──────────────────────────────────────────────────────────────────────

interface WinButtonProps {
  children: ReactNode
  primary?: boolean
  disabled?: boolean
  onClick?: () => void
}

function WinButton({ children, primary, disabled, onClick }: WinButtonProps) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 18px',
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1px solid #d4d4d4',
        background: primary
          ? disabled
            ? '#94b7b7'
            : hover
              ? '#16302e'
              : '#1f3a3a'
          : hover
            ? '#f0f0f0'
            : '#fff',
        color: primary ? '#fff' : '#202020',
        opacity: disabled ? 0.6 : 1,
        borderRadius: 4,
        fontWeight: primary ? 600 : 400,
        minWidth: 88,
        transition: 'background .15s',
      }}
    >
      {children}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 0. Üdvözlés
// ──────────────────────────────────────────────────────────────────────

function InstallerWelcome({ logoSrc }: { logoSrc: string }) {
  return (
    <>
      <div
        style={{
          width: 164,
          background: BANNER_BG,
          color: BANNER_FG,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 24,
        }}
      >
        <img
          src={logoSrc}
          alt=""
          style={{ width: 96, height: 96, objectFit: 'contain' }}
        />
        <div style={{ fontSize: 12.5, textAlign: 'center', opacity: 0.85, lineHeight: 1.5 }}>
          Kartotéka
          <br />
          Setup Wizard
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: '40px 50px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 500, color: '#202020' }}>
          Üdvözli a Kartotéka telepítője
        </div>
        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>
          Ez a varázsló végigvezeti a Kartotéka {APP_VERSION} verziójának telepítésén a
          számítógépén.
          <br />
          <br />
          Telepítés előtt ajánlatos minden más programot bezárni. Így a telepítő képes lesz
          frissíteni a fontos rendszerfájlokat újraindítás nélkül.
          <br />
          <br />
          A folytatáshoz kattintson a <strong>Tovább</strong> gombra.
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 1. Licenc
// ──────────────────────────────────────────────────────────────────────

function LicenceBody({ accept, setAccept }: { accept: boolean; setAccept: (v: boolean) => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          flex: 1,
          background: '#fafafa',
          border: '1px solid #d4d4d4',
          padding: 14,
          fontSize: 11.5,
          lineHeight: 1.6,
          color: '#333',
          overflow: 'auto',
        }}
      >
        <strong>KARTOTÉKA — VÉGFELHASZNÁLÓI LICENCSZERZŐDÉS</strong>
        <br />
        <br />
        A jelen szerződés érvényes a Kartotéka egyházi nyilvántartó rendszerre, amelyet az
        Erdélyi Református Egyházkerület keretein belül fejleszt és terjeszt.
        <br />
        <br />
        1. <strong>A LICENC TÁRGYA.</strong> A Licencbe vevő nem-kizárólagos, át nem
        ruházható jogot kap a szoftver használatára a regisztrált gyülekezet keretein
        belül.
        <br />
        <br />
        2. <strong>ADATKEZELÉS.</strong> A szoftver kizárólag a regisztrált gyülekezet
        helyi szerverén és felhasználói gépein tárolja az adatokat. A Kartotéka nem
        továbbít személyes adatokat harmadik fél részére.
        <br />
        <br />
        3. <strong>FELELŐSSÉG KORLÁTOZÁSA.</strong> A szoftvert „adott állapotában"
        biztosítjuk. A fejlesztő nem vállal felelősséget az adatvesztésért, a hibákért,
        vagy a szoftver használatából eredő közvetett károkért.
        <br />
        <br />
        4. <strong>TÁMOGATÁS.</strong> A támogatás a vásárlástól számított 12 hónapig
        ingyenes. Ezután éves díj ellenében meghosszabbítható.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          style={{ accentColor: BANNER_BG }}
        />
        Elfogadom a licencszerződés feltételeit
      </label>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 2. Telepítési hely
// ──────────────────────────────────────────────────────────────────────

function DestinationBody() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6 }}>
        A Setup ezt a Kartotékát az alábbi mappába telepíti. Másik mappához kattintson a{' '}
        <strong>Tallózás</strong> gombra.
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6, fontWeight: 600 }}>
          Célmappa
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value="C:\Program Files\Kartoteka"
            readOnly
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 12,
              border: '1px solid #b4b4b4',
              background: '#fff',
              fontFamily: 'inherit',
            }}
          />
          <WinButton>Tallózás…</WinButton>
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: '#fafafa',
          border: '1px solid #e5e5e5',
          fontSize: 11.5,
          color: '#444',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Szükséges hely: <strong>284 MB</strong>
        </span>
        <span>
          Szabad hely: <strong style={{ color: '#1a7a3a' }}>128.4 GB</strong>
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: '#666',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke={BANNER_BG}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5 V8 L10 9.5" />
        </svg>
        Az adatbázis és a beállítások külön mappában tárolódnak: <code>%AppData%\Kartoteka</code>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 3. Komponensek
// ──────────────────────────────────────────────────────────────────────

function ComponentsBody() {
  const opts = [
    { id: 'core', label: 'Kartotéka mag (kötelező)', size: '184 MB', on: true, locked: true },
    { id: 'tools', label: 'Anyakönyvi sablon-csomag', size: '24 MB', on: true, locked: false },
    { id: 'sync', label: 'Egyházkerületi szinkron-modul', size: '12 MB', on: true, locked: false },
    { id: 'pdf', label: 'PDF-export és nyomtatás (Ghostscript)', size: '38 MB', on: true, locked: false },
    { id: 'demo', label: 'Példa adatbázis (oktatáshoz)', size: '8 MB', on: false, locked: false },
    { id: 'doc', label: 'Felhasználói kézikönyv (offline)', size: '18 MB', on: true, locked: false },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <div style={{ color: '#666', marginBottom: 6 }}>
        Jelölje be a telepíteni kívánt összetevőket:
      </div>
      {opts.map((o) => (
        <label
          key={o.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 4px',
            cursor: o.locked ? 'default' : 'pointer',
            opacity: o.locked ? 0.7 : 1,
          }}
        >
          <input type="checkbox" checked={o.on} readOnly style={{ accentColor: BANNER_BG }} />
          <span style={{ flex: 1 }}>{o.label}</span>
          <span style={{ color: '#888', fontSize: 11 }}>{o.size}</span>
        </label>
      ))}
      <div
        style={{
          marginTop: 14,
          padding: '8px 12px',
          background: '#fafafa',
          border: '1px solid #e5e5e5',
          fontSize: 11.5,
          color: '#444',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Választott komponensek: <strong>5</strong>
        </span>
        <span>
          Teljes méret: <strong>276 MB</strong>
        </span>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 4. Telepítés folyamat
// ──────────────────────────────────────────────────────────────────────

function ProgressBody() {
  const lines = [
    'Fájlok kicsomagolása…',
    'Telepítés: C:\\Program Files\\Kartoteka\\bin\\kartoteka.exe',
    'Telepítés: C:\\Program Files\\Kartoteka\\share\\templates\\anyakonyv.json',
    'Telepítés: C:\\Program Files\\Kartoteka\\share\\templates\\penzugy.json',
    'Telepítés: C:\\Program Files\\Kartoteka\\db\\schema.sql',
    'Adatbázis inicializálása…',
    'Indító parancsikon létrehozása',
    'Tűzfalszabály regisztrálása (port 8911)',
    'Szolgáltatás regisztrálása: Kartoteka Sync Agent',
  ]
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 6 }}>
          <span style={{ color: '#444' }}>Telepítés folyamatban — komponensek 4 / 6</span>
          <span style={{ color: BANNER_BG, fontWeight: 600 }}>62%</span>
        </div>
        <div style={{ height: 14, background: '#e5e5e5', border: '1px solid #c4c4c4', position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: '62%',
              background: 'repeating-linear-gradient(45deg, #1f3a3a 0 8px, #2c5050 8px 16px)',
              transition: 'width .3s',
            }}
          />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          background: '#1c1c1c',
          color: '#a8d4d4',
          padding: 12,
          fontSize: 11,
          fontFamily: 'Consolas, monospace',
          overflow: 'hidden',
          border: '1px solid #444',
          lineHeight: 1.6,
        }}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ opacity: i < 6 ? 0.7 : 1, color: i === 6 ? '#fff' : 'inherit' }}>
            {i < 6 ? '✓' : i === 6 ? '›' : ' '} {l}
            {i === 6 && (
              <span
                style={{
                  display: 'inline-block',
                  marginLeft: 4,
                  animation: 'kt-caret 1s steps(1) infinite',
                }}
              >
                _
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 5. Befejezés
// ──────────────────────────────────────────────────────────────────────

function InstallerFinish() {
  return (
    <>
      <div
        style={{
          width: 164,
          background: BANNER_BG,
          color: BANNER_FG,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 24,
        }}
      >
        <div
          className="kt-pop"
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            background: 'rgba(255,255,255,.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke={BANNER_FG} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12 L10 17 L19 7" />
          </svg>
        </div>
        <div style={{ fontSize: 12.5, textAlign: 'center', opacity: 0.85, lineHeight: 1.5 }}>
          Telepítés
          <br />
          befejezve
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: '40px 50px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 500, color: '#202020' }}>
          A telepítés sikeresen befejeződött
        </div>
        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>
          A Kartotéka {APP_VERSION} verziója telepítve van a számítógépére.
          <br />
          <br />
          Az első indításkor a beállítóvarázsló végigvezeti a gyülekezet adatainak
          megadásán és az első felhasználó létrehozásán.
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Kartotéka indítása most', defaultChecked: true },
            { label: 'Olvasásra megnyitja a Bevezetést (PDF)', defaultChecked: false },
            { label: 'Parancsikon létrehozása az asztalon', defaultChecked: true },
          ].map((item) => (
            <label
              key={item.label}
              style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, cursor: 'pointer' }}
            >
              <input type="checkbox" defaultChecked={item.defaultChecked} style={{ accentColor: BANNER_BG }} />
              {item.label}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
