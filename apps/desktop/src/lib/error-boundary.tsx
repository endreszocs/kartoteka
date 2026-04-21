import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * Root-szintű Error Boundary.
 *
 * Tauri ablakban a WebView2 renderelési-hibát alapértelmezetten **fehér
 * képernyőként** mutatja (nincs DevTools-ablak default). Az M1.5-tel
 * felállítottunk egy React SPA-t, aminek a kezdő hívása (`getDesktopSupabase`)
 * dobhat — pl. ha nincs `.env` beállítva. Ez boundary nélkül crash → fehér.
 *
 * Ez a komponens elkapja a hibát, és olvasható fallback UI-t renderel,
 * amelyben az üzenet + stack explicit látható, és van „Újratöltés" gomb.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info })
    // eslint-disable-next-line no-console
    console.error('[Kartotéka Desktop] Render crash:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <main
        style={{
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#fdfcfa',
          color: '#1f2937',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '.25rem' }}>
            Valami elromlott a Kartotéka indításakor
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            A részletek alább — ezt küldd el a fejlesztőnek (Endre).
          </p>

          <section
            style={{
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontWeight: 600, margin: 0 }}>{error.name}</p>
            <p style={{ margin: '.25rem 0 0' }}>{error.message}</p>
          </section>

          {error.stack && (
            <details style={{ marginBottom: '1rem' }}>
              <summary
                style={{ cursor: 'pointer', color: '#6b7280', fontSize: '.85rem' }}
              >
                Stack trace
              </summary>
              <pre
                style={{
                  fontSize: '.75rem',
                  background: '#f3f4f6',
                  padding: '.75rem',
                  borderRadius: 6,
                  overflow: 'auto',
                  marginTop: '.5rem',
                }}
              >
                {error.stack}
              </pre>
            </details>
          )}

          {info?.componentStack && (
            <details style={{ marginBottom: '1.5rem' }}>
              <summary
                style={{ cursor: 'pointer', color: '#6b7280', fontSize: '.85rem' }}
              >
                Komponens-stack
              </summary>
              <pre
                style={{
                  fontSize: '.75rem',
                  background: '#f3f4f6',
                  padding: '.75rem',
                  borderRadius: 6,
                  overflow: 'auto',
                  marginTop: '.5rem',
                }}
              >
                {info.componentStack}
              </pre>
            </details>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: '#15544a',
              color: 'white',
              border: 'none',
              padding: '.6rem 1.1rem',
              borderRadius: 8,
              fontSize: '.95rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Újratöltés
          </button>

          <p style={{ marginTop: '1.5rem', fontSize: '.85rem', color: '#6b7280' }}>
            Ha a hiba a Supabase környezeti változókat említi, hozz létre egy
            <code>apps/desktop/.env</code> fájlt a <code>.env.example</code>{' '}
            alapján, majd indítsd újra: <code>npm run desktop:dev</code>.
          </p>
        </div>
      </main>
    )
  }
}
