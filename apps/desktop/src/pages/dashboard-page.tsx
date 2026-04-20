import { useCallback, useEffect, useState } from 'react'
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
import {
  getLastPullIso,
  getLocalOwnProfile,
  pullOwnProfile,
  type ProfileLocalRow,
} from '../lib/sync'

/**
 * Placeholder dashboard — M1.5 kezdőverzió.
 * M2.1-ben kiegészítve „Lokális adatbázis" panellel (SQLCipher demo).
 * M2.4-ben hozzáadva „Saját profil (offline-cache)" panel az első
 * Supabase → SQLite sync flow-val.
 */
export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [outbox, setOutbox] = useState<OutboxStats | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)

  const [localProfile, setLocalProfile] = useState<ProfileLocalRow | null>(null)
  const [lastPull, setLastPull] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)

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

  // Lokális DB állapot lekérés
  useEffect(() => {
    let mounted = true
    async function loadDb() {
      try {
        const [rows, stats, lastIso] = await Promise.all([
          getAllSettings(),
          getOutboxStats(),
          getLastPullIso(),
        ])
        if (!mounted) return
        setSettings(rows)
        setOutbox(stats)
        setLastPull(lastIso)
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

  // Ha van user + DB: lokális profil betöltése
  useEffect(() => {
    if (!user || !dbAvailable) return
    let mounted = true
    getLocalOwnProfile(user.id)
      .then((row) => {
        if (mounted) setLocalProfile(row)
      })
      .catch(() => {
        // csendes — a pull gomb kezelni fogja
      })
    return () => {
      mounted = false
    }
  }, [user, dbAvailable])

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

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    try {
      const res = await pullOwnProfile(user.id)
      setLastPull(res.lastPullIso)
      const row = await getLocalOwnProfile(user.id)
      setLocalProfile(row)
      // A settings-tábla frissítés (a last_pull kulcs most íródott bele)
      const rows = await getAllSettings()
      setSettings(rows)
    } catch (err: unknown) {
      setPullError(err instanceof Error ? err.message : 'ismeretlen hiba')
    } finally {
      setPulling(false)
    }
  }, [user])

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
              Ez az M1.5–M2.4 placeholder képernyő. Az M2 további alfázisaiban a
              tartalom fokozatosan élesedik (több domain-tábla, push-sync,
              konfliktus-kezelés) — a UI komponensek és a Supabase-kapcsolat
              azonos a webes felülettel.
            </p>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* — Saját profil (offline-cache, M2.4) — */}
        <Card>
          <CardHeader>
            <CardTitle>Saját profil — offline cache</CardTitle>
            <CardDescription>
              M2.4 — Supabase → lokális SQLCipher sync. A „Pull" gomb lehozza a
              saját profil-sort a <code>profiles</code> táblából a lokális{' '}
              <code>profiles_local</code>-ba.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Utolsó sync:{' '}
                {lastPull ? (
                  <span className="font-mono">{lastPull}</span>
                ) : (
                  <em>még nem futott</em>
                )}
              </div>
              <Button onClick={handlePull} disabled={!user || pulling}>
                {pulling ? 'Szinkronizálás…' : 'Pull profil'}
              </Button>
            </div>

            {pullError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {pullError}
              </div>
            )}

            {localProfile ? (
              <div className="rounded-md border border-border">
                <table className="w-full text-left">
                  <tbody>
                    <ProfileRow label="ID" value={localProfile.id} mono />
                    <ProfileRow label="Email" value={localProfile.email} />
                    <ProfileRow label="Teljes név" value={localProfile.full_name} />
                    <ProfileRow label="Telefon" value={localProfile.phone} />
                    <ProfileRow label="Szerepkör" value={localProfile.role} />
                    <ProfileRow label="Státusz" value={localProfile.status} />
                    <ProfileRow label="Gyülekezet (id)" value={localProfile.congregation_id} mono />
                    <ProfileRow label="Egyházmegye (id)" value={localProfile.diocese_id} mono />
                    <ProfileRow label="Egyházkerület (id)" value={localProfile.district_id} mono />
                    <ProfileRow
                      label="Synced at (lokális)"
                      value={localProfile.synced_at}
                      mono
                    />
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Még nincs lokálisan cache-elt profil-sor. Kattints a „Pull profil"
                gombra a szinkronizáláshoz.
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Lokális adatbázis (M2.1 → M2.3 óta SQLCipher) — */}
        <Card>
          <CardHeader>
            <CardTitle>Lokális adatbázis</CardTitle>
            <CardDescription>
              M2.1 → M2.3: SQLCipher-titkosított SQLite, kulcs a Windows Credential
              Manager-ben (DPAPI per-user)
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
                  Ez akkor normális, ha a frontendet sima böngészőben nyitod meg
                  (Vite dev, port 1420) — a Tauri SQL-plugin csak a natív ablakban
                  aktív. Indítsd úgy: <code>npm run desktop:dev</code>.
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
                    A „Ping" gomb beír egy <code>last_ping</code> értéket a lokális
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

function ProfileRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <tr className="border-t border-border first:border-t-0">
      <th className="w-40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {label}
      </th>
      <td
        className={`px-3 py-2 text-xs ${mono ? 'font-mono' : ''} ${
          value ? 'text-foreground' : 'italic text-muted-foreground'
        }`}
      >
        {value ?? '— nincs —'}
      </td>
    </tr>
  )
}
