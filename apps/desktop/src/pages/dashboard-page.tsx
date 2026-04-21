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
  Input,
  Label,
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
  isOnline,
  processOutbox,
  pullOwnProfile,
  updateOwnProfile,
  type ProfileLocalRow,
} from '../lib/sync'

/**
 * Dashboard — M2.5-tel bővítve push-sync demóval:
 *   - „Saját profil" kártya: telefon/név frissítés (optimistic + outbox)
 *   - „Outbox" státusz + manual „Szinkronizálás most" gomb
 *   - Auto-drain login után (egyszer mount-kor)
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

  const [phoneDraft, setPhoneDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [onlineState, setOnlineState] = useState<boolean | null>(null)

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
  const refreshLocalDb = useCallback(async () => {
    const [rows, stats, lastIso] = await Promise.all([
      getAllSettings(),
      getOutboxStats(),
      getLastPullIso(),
    ])
    setSettings(rows)
    setOutbox(stats)
    setLastPull(lastIso)
    setDbAvailable(true)
  }, [])

  useEffect(() => {
    let mounted = true
    refreshLocalDb().catch((err: unknown) => {
      if (!mounted) return
      const msg = err instanceof Error ? err.message : 'ismeretlen hiba'
      setDbError(msg)
      setDbAvailable(false)
    })
    return () => {
      mounted = false
    }
  }, [refreshLocalDb])

  // Online/offline detektor
  useEffect(() => {
    let mounted = true
    isOnline().then((v) => {
      if (mounted) setOnlineState(v)
    })
    const handleOnline = () => setOnlineState(true)
    const handleOffline = () => setOnlineState(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      mounted = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Ha van user + DB: lokális profil betöltése + initial outbox-drain
  useEffect(() => {
    if (!user || !dbAvailable) return
    let mounted = true

    getLocalOwnProfile(user.id)
      .then((row) => {
        if (!mounted) return
        setLocalProfile(row)
        setPhoneDraft(row?.phone ?? '')
        setNameDraft(row?.full_name ?? '')
      })
      .catch(() => {
        // csendes
      })

    // Auto-drain: mount-kor egyszer
    processOutbox()
      .then((stats) => {
        if (!mounted) return
        if (stats.attempted > 0) {
          setSyncResult(
            `Auto-sync: ${stats.sent} kiküldve, ${stats.failed} hiba, ${stats.attempted} próba.`,
          )
          refreshLocalDb()
        }
      })
      .catch(() => {
        // csendes
      })

    return () => {
      mounted = false
    }
  }, [user, dbAvailable, refreshLocalDb])

  async function handlePing() {
    setPinging(true)
    setDbError(null)
    try {
      await setSetting('last_ping', new Date().toISOString())
      await refreshLocalDb()
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
      setPhoneDraft(row?.phone ?? '')
      setNameDraft(row?.full_name ?? '')
      await refreshLocalDb()
    } catch (err: unknown) {
      setPullError(err instanceof Error ? err.message : 'ismeretlen hiba')
    } finally {
      setPulling(false)
    }
  }, [user, refreshLocalDb])

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!user) return
      setSaving(true)
      setSaveMsg(null)
      setSaveError(null)
      try {
        const patch: { phone?: string | null; full_name?: string | null } = {}
        if (phoneDraft !== (localProfile?.phone ?? '')) patch.phone = phoneDraft || null
        if (nameDraft !== (localProfile?.full_name ?? '')) patch.full_name = nameDraft || null

        if (Object.keys(patch).length === 0) {
          setSaveMsg('Nincs változás a mezőkben.')
          return
        }

        const { queuedToOutbox } = await updateOwnProfile(user.id, patch)
        const row = await getLocalOwnProfile(user.id)
        setLocalProfile(row)
        await refreshLocalDb()
        setSaveMsg(
          queuedToOutbox
            ? 'Elmentve offline — a szerverrel a következő online-csatlakozáskor szinkronizálódik.'
            : 'Elmentve a szerverre és lokálisan.',
        )
      } catch (err: unknown) {
        setSaveError(err instanceof Error ? err.message : 'ismeretlen hiba')
      } finally {
        setSaving(false)
      }
    },
    [user, phoneDraft, nameDraft, localProfile, refreshLocalDb],
  )

  const handleManualSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const stats = await processOutbox()
      setSyncResult(
        stats.attempted === 0
          ? 'Nincs függő outbox-sor (vagy offline vagy).'
          : `${stats.sent} kiküldve, ${stats.failed} hiba, ${stats.attempted} próba.`,
      )
      await refreshLocalDb()
    } finally {
      setSyncing(false)
    }
  }, [refreshLocalDb])

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
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Üdvözöllek a Kartotékában!</CardTitle>
                <CardDescription>
                  {user ? `Bejelentkezve: ${user.email}` : 'Felhasználó betöltése…'}
                </CardDescription>
              </div>
              <OnlineBadge online={onlineState} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              M1.5–M2.5 fejlesztői verzió. Pull+push sync a saját profilra, lokális
              SQLCipher tárolással és OS-szintű kulcs-kezeléssel.
            </p>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* — Saját profil + szerkesztés (M2.4 pull + M2.5 push) — */}
        <Card>
          <CardHeader>
            <CardTitle>Saját profil — offline-first</CardTitle>
            <CardDescription>
              Pull: Supabase → lokális cache. Save: optimisztikus lokális írás + azonnali
              Supabase-update (online) vagy outbox (offline).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Utolsó pull:{' '}
                {lastPull ? (
                  <span className="font-mono">{lastPull}</span>
                ) : (
                  <em>még nem futott</em>
                )}
              </div>
              <Button variant="outline" onClick={handlePull} disabled={!user || pulling}>
                {pulling ? 'Pull…' : 'Pull profil'}
              </Button>
            </div>

            {pullError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                Pull hiba: {pullError}
              </div>
            )}

            {localProfile ? (
              <>
                <div className="rounded-md border border-border">
                  <table className="w-full text-left">
                    <tbody>
                      <ProfileRow label="ID" value={localProfile.id} mono />
                      <ProfileRow label="Email" value={localProfile.email} />
                      <ProfileRow label="Szerepkör" value={localProfile.role} />
                      <ProfileRow label="Státusz" value={localProfile.status} />
                      <ProfileRow
                        label="Gyülekezet (id)"
                        value={localProfile.congregation_id}
                        mono
                      />
                      <ProfileRow
                        label="Synced at (lokális)"
                        value={localProfile.synced_at}
                        mono
                      />
                    </tbody>
                  </table>
                </div>

                <form onSubmit={handleSave} className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-foreground">Szerkeszthető mezők</p>

                  <div className="space-y-1">
                    <Label htmlFor="name-input">Teljes név</Label>
                    <Input
                      id="name-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.currentTarget.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="phone-input">Telefonszám</Label>
                    <Input
                      id="phone-input"
                      type="tel"
                      value={phoneDraft}
                      onChange={(e) => setPhoneDraft(e.currentTarget.value)}
                      disabled={saving}
                      placeholder="+40…"
                    />
                  </div>

                  {saveMsg && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                      {saveMsg}
                    </div>
                  )}
                  {saveError && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      Mentési hiba: {saveError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Mentés…' : 'Mentés'}
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Még nincs lokálisan cache-elt profil-sor. Kattints a „Pull profil" gombra a
                szinkronizáláshoz.
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Outbox + manuális sync (M2.5) — */}
        <Card>
          <CardHeader>
            <CardTitle>Outbox — offline írások</CardTitle>
            <CardDescription>
              Ha a mentés offline futott, itt várnak a sorok a következő szinkronra.
              Bejelentkezéskor automatikusan fut egy drain, manuálisan is elindítható.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Függő" value={outbox?.pending ?? 0} />
              <Stat label="Kiküldött" value={outbox?.sent ?? 0} />
              <Stat label="Hibás" value={outbox?.failed ?? 0} />
              <Stat label="Összes" value={outbox?.total ?? 0} />
            </div>

            {syncResult && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                {syncResult}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleManualSync} disabled={syncing}>
                {syncing ? 'Szinkronizálás…' : 'Szinkronizálás most'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* — Lokális adatbázis (M2.1 → M2.3 óta SQLCipher) — */}
        <Card>
          <CardHeader>
            <CardTitle>Lokális adatbázis</CardTitle>
            <CardDescription>
              SQLCipher-titkosított SQLite, kulcs a Windows Credential Manager-ben
              (DPAPI per-user)
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
                  (Vite dev, port 1420). A Rust-oldali plugin csak a natív ablakban
                  aktív. Indítsd úgy: <code>npm run desktop:dev</code>.
                </p>
                {dbError && (
                  <p className="mt-1 font-mono text-xs text-destructive">{dbError}</p>
                )}
              </div>
            )}

            {dbAvailable === true && (
              <>
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
                            <td
                              className="max-w-xs truncate px-3 py-2 font-mono text-xs"
                              title={s.value}
                            >
                              {s.value}
                            </td>
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
                  <Button variant="outline" onClick={handlePing} disabled={pinging}>
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

function OnlineBadge({ online }: { online: boolean | null }) {
  if (online === null) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        online
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
      title={online ? 'Kapcsolat él' : 'Nincs internet'}
    >
      <span
        className={`size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
