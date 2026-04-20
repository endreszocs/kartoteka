import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

/**
 * Kartotéka desktop — M1.2 bootstrap állapot.
 *
 * Ez egy PLACEHOLDER. Az M1.3-tól a `@kartoteka/supabase-client` közös csomag
 * használatával kerül bevezetésre az auth + a Supabase-kapcsolat. Az M1.4-től
 * a `@kartoteka/ui` shadcn-komponens-könyvtár tölti fel tartalommal az oldalt.
 */
function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('Endre')

  async function greet(e: React.FormEvent) {
    e.preventDefault()
    const res = await invoke<string>('greet', { name })
    setGreetMsg(res)
  }

  return (
    <main className="container">
      <h1>Kartotéka Desktop</h1>
      <p className="subtitle">
        M1.2 — Tauri 2 + React + Vite projekt sikeresen elindult.
      </p>

      <section className="hello-rust">
        <p className="muted">
          A Rust-oldali <code>greet</code> command tesztelése:
        </p>
        <form className="row" onSubmit={greet}>
          <input
            aria-label="Név"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Név"
          />
          <button type="submit">Üdvözlés</button>
        </form>
        {greetMsg && <p className="result">{greetMsg}</p>}
      </section>

      <footer className="footnote">
        <p>Következő lépés: M1.3 — közös Supabase-kliens + auth.</p>
      </footer>
    </main>
  )
}

export default App
