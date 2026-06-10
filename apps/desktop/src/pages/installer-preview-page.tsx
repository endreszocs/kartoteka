/**
 * Telepítő wizard — desktop preview oldal (Sprint R F6 · v0.8.5).
 *
 * Csak fejlesztői előnézet a `/dev/installer-preview` route-on. A tényleges
 * Tauri-mini installer wrapper-app **Sprint S F2-be** kerül a release pipeline
 * integrációval együtt — most CSAK a UI komponens preview-je.
 *
 * Megnyitható a desktop sidebar Beállítások › Megjelenés alatt link-ből, vagy
 * direkt URL-lel.
 */

import { useNavigate } from 'react-router-dom'
import { InstallerWizard } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'

export function InstallerPreviewPage() {
  const navigate = useNavigate()
  return (
    <DesktopShell>
      <div
        style={{
          minHeight: 'calc(100vh - 140px)',
          background: '#2a2622',
          padding: '40px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,.06)',
              borderRadius: 8,
              color: '#e8e1d2',
              fontSize: 12.5,
              maxWidth: 980,
            }}
          >
            <strong>Telepítő wizard preview</strong> — Sprint R F6 (v0.8.5).
            <br />
            Ez egy fejlesztői előnézet a Windows-telepítőhöz tervezett 980×660 px
            wizard UI-ról. A tényleges Tauri-mini installer wrapper-app a Sprint S F2-be
            kerül, akkor a `release-build.ps1` pipeline-nal együtt. Most CSAK a UI réteg.
          </div>
          <InstallerWizard
            logoSrc="/kartoteka-logo.png"
            version="v0.8.5"
            onCancel={() => navigate('/dev')}
            onFinish={() => navigate('/dev')}
          />
        </div>
      </div>
    </DesktopShell>
  )
}
