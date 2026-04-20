import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kartoteka/ui'

import { getDesktopSupabase } from '../lib/supabase'
import {
  getAllSettings,
  getOutboxStats,
  setSetting,
  type OutboxStats,
  type SettingRow,
} from '../lib/local-db'

/**
 * Placeholder dashboard — M1.5 kezdőverzió, M2.1-ben kiegészítve egy
 * "lokális DB állapot" panellel a Tauri SQL-plugin demonstrálására.
 *
 * Az M2 alfázisok során ez a kártya fokozatosan valódi sync-info lesz
 * (utolsó pull, függő outbox, konfliktusok).
 */
export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [outbox, setOutbox] = useState<OutboxStats | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setUser(data.user)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Lokális DB állapot lekérés — Tauri-ablakon belül működik,
  // böngészőben (npm run desktop:vite) hibára fut, amit itt felfogunk.
  useEffect(() => {
    let mounted = true
    async function loadDb() {
      try {
        const [rows, stats] = await Promise.all([
          getAllSettings(),
          getOutboxStats(),
        ])
        if (!mounted) return
        setSettings(rows)
        setOutbox(stats)
        setDbAvailable(true)
      } catch (err: unknown) {
        if (!mounted) return
        const msg = err instanceof Error ? err.message : 'ismeretlen hiba'
        setDbError(msg)
        setDbAvailable(false)
      }
    }
    loadDb()
    return () => {
      mounted = false
    }
  }, [])

  async function handlePing() {
    setPinging(true)
    setDbError(null)
    try {
      await setSetting('last_ping', new Date().toISOString())
      const rows = await getAllSettings()
      setSettings(rows)
    } catch (err: unknown) {
      setDbError(err instanceof Error ? err.message : 'ismeretlen hiba')
    } finally {
      setPinging(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const supabase = getDesktopSupabase()
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Üdvözöllek a Kartotékában!</CardTitle>
            <CardDescription>
              {user ? `Bejelentkezve: ${user.email}` : 'Felhasználó betöltése…'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ez az M1.5 + M2.1 placeholder képernyő. Az M2 további alfázisaiban
              a tartalom fokozatosan élesedik (tag-nyilvántartás, pénzügy, sync
              állapot), a UI komponensek és a Supabase-kapcsolat azonos a webes
              felülettel.
            </p>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lokális adatbázis</CardTitle>
            <CardDescription>
              M2.1 — SQLite a Tauri-oldalon (később SQLCipher-rel titkosítva)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {dbAvailable === null && (
              <p className="text-muted-foreground">DB állapot lekérése…</p>
            )}

            {dbAvailable === false && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
                <p className="font-medium text-foreground">Lokális DB nem elérhető</p>
                <p className="mt-1 text-xs">
                  Ez akkor normális, ha a frontendet sima böngészőben (Vite dev, port 1420)
                  nyitod meg — a Tauri SQL-plugin csak a natív ablakban aktív.
                  Indítsd úgy: <code>npm run desktop:dev</code>.
                </p>
                {dbError && (
                  <p className="mt-1 font-mono text-xs text-destructive">{dbError}</p>
                )}
              </div>
            )}

            {dbAvailable === true && (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Settings" value={settings.length} />
                  <Stat label="Outbox függő" value={outbox?.pending ?? 0} />
                  <Stat label="Outbox kiküldött" value={outbox?.sent ?? 0} />
                  <Stat label="Outbox hibás" value={outbox?.failed ?? 0} />
                </div>

                {settings.length > 0 && (
                  <div className="rounded-md border border-border">
                    <table className="w-full text-left">
                      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Kulcs</th>
                          <th className="px-3 py-2">Érték</th>
                          <th className="px-3 py-2">Frissítve</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settings.map((s) => (
                          <tr key={s.key} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{s.key}</td>
                            <td className="px-3 py-2 font-mono text-xs">{s.value}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {s.updated_at}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    A „Ping” gomb beír egy <code>last_ping</code> értéket a lokális
                    <code> settings</code> táblába — demonstrálja, hogy a DB
                    olvasható és írható.
                  </p>
                  <Button onClick={handlePing} disabled={pinging}>
                    {pinging ? 'Ping…' : 'Ping local DB'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-heading text-2xl">{value}</div>
    </div>
  )
}
