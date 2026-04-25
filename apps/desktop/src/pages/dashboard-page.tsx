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

import { DesktopShell } from '../lib/shell/desktop-shell'

import {
  checkDeviceRevokeState,
  ensureDeviceRegistered,
  getDeviceInfo,
  getMyDevices,
  type DeviceInfo,
  type RegisteredDevice,
} from '../lib/device'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import {
  checkForUpdates,
  downloadAndInstall,
  type UpdateCheckResult,
} from '../lib/updater'
import {
  getAllSettings,
  getDbStatus,
  getOutboxStats,
  setSetting,
  type DbStatus,
  type OutboxStats,
  type SettingRow,
} from '../lib/local-db'
import {
  dismissOutboxRow,
  getAllLocalProfiles,
  getFailedOutboxRows,
  getLastPullAllIso,
  getLastPullCongregationIso,
  getLastPullIso,
  getLastPullMembersIso,
  getLocalMemberCounts,
  getLocalMembersOfOwnCongregation,
  getLocalOwnCongregation,
  getLocalOwnProfile,
  isOnline,
  processOutbox,
  pullAllProfiles,
  pullMembersOfOwnCongregation,
  pullOwnCongregation,
  pullOwnProfile,
  retryOutboxRow,
  updateOwnProfile,
  type CongregationLocalRow,
  type MemberLocalRow,
  type OutboxRow,
  type ProfileLocalRow,
} from '../lib/sync'

/**
 * Dashboard — M2.5 + M2.6 push-sync + konfliktus-kezelés demo.
 */
export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)

  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [outbox, setOutbox] = useState<OutboxStats | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)

  const [localProfile, setLocalProfile] = useState<ProfileLocalRow | null>(null)
  const [lastPull, setLastPull] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)

  // M6 — congregations sync state
  const [localCongregation, setLocalCongregation] = useState<CongregationLocalRow | null>(null)
  const [lastPullCongregation, setLastPullCongregation] = useState<string | null>(null)
  const [pullingCongregation, setPullingCongregation] = useState(false)
  const [pullCongregationError, setPullCongregationError] = useState<string | null>(null)

  // M7 — szemely (members) sync state
  const [members, setMembers] = useState<MemberLocalRow[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberIncludeDeceased, setMemberIncludeDeceased] = useState(false)
  const [memberOnlyVisible, setMemberOnlyVisible] = useState(false)
  const [memberCounts, setMemberCounts] = useState<{
    total: number
    living: number
    visible: number
  } | null>(null)
  const [lastPullMembers, setLastPullMembers] = useState<string | null>(null)
  const [pullingMembers, setPullingMembers] = useState(false)
  const [pullMembersError, setPullMembersError] = useState<string | null>(null)
  const [pullMembersResult, setPullMembersResult] = useState<string | null>(null)

  const [phoneDraft, setPhoneDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflictNotice, setConflictNotice] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [failedRows, setFailedRows] = useState<OutboxRow[]>([])
  const [onlineState, setOnlineState] = useState<boolean | null>(null)

  const [allProfiles, setAllProfiles] = useState<ProfileLocalRow[]>([])
  const [lastPullAll, setLastPullAll] = useState<string | null>(null)
  const [pullingAll, setPullingAll] = useState(false)
  const [pullAllResult, setPullAllResult] = useState<string | null>(null)
  const [pullAllError, setPullAllError] = useState<string | null>(null)

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [myDevices, setMyDevices] = useState<RegisteredDevice[]>([])
  const [deviceRegMsg, setDeviceRegMsg] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

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

  const refreshLocalDb = useCallback(async () => {
    // A DB-státuszt MINDIG lekérjük — akkor is, ha a setup hibázott, mert a
    // db_status command nem függ a Connection-től (csak a state-et olvassa).
    const status = await getDbStatus().catch(() => null)
    setDbStatus(status)

    if (status && !status.opened) {
      // Nincs értelme settings-et / outbox-ot kérni, mindkét command hibára futna.
      setDbAvailable(false)
      setDbError(status.init_error ?? 'A DB még nincs megnyitva')
      return
    }

    const [rows, stats, lastIso, lastAllIso, lastCgIso, failed, all] = await Promise.all([
      getAllSettings(),
      getOutboxStats(),
      getLastPullIso(),
      getLastPullAllIso(),
      getLastPullCongregationIso(),
      getFailedOutboxRows(),
      getAllLocalProfiles(),
    ])
    setSettings(rows)
    setOutbox(stats)
    setLastPull(lastIso)
    setLastPullAll(lastAllIso)
    setLastPullCongregation(lastCgIso)
    setFailedRows(failed)
    setAllProfiles(all)
    setDbAvailable(true)
  }, [])

  useEffect(() => {
    let mounted = true
    refreshLocalDb().catch((err: unknown) => {
      if (!mounted) return
      const msg = errorMessage(err)
      setDbError(msg)
      setDbAvailable(false)
    })
    return () => {
      mounted = false
    }
  }, [refreshLocalDb])

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

  // DB-függő műveletek: csak akkor futnak, ha a lokális SQLCipher nyitva van
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

    // M6 — saját gyülekezet lokális betöltése (ha cache-elve van)
    getLocalOwnCongregation(user.id)
      .then((row) => {
        if (!mounted) return
        setLocalCongregation(row)
      })
      .catch(() => {
        // csendes
      })

    // M7 — lokális member-lista + last_pull betöltése
    getLastPullMembersIso(user.id)
      .then((iso) => {
        if (mounted) setLastPullMembers(iso)
      })
      .catch(() => {
        // csendes
      })

    processOutbox()
      .then((stats) => {
        if (!mounted) return
        if (stats.attempted > 0) {
          setSyncResult(
            `Auto-sync: ${stats.sent} kiküldve, ${stats.conflicts} konfliktus, ${stats.failed - stats.conflicts} egyéb hiba, ${stats.attempted} próba.`,
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

  // M7 — member-lista refresh: user vagy keresés/szűrő változás
  useEffect(() => {
    if (!user || !dbAvailable) return
    let mounted = true
    Promise.all([
      getLocalMembersOfOwnCongregation(user.id, {
        search: memberSearch.trim() || undefined,
        includeDeceased: memberIncludeDeceased,
        onlyVisible: memberOnlyVisible,
      }),
      getLocalMemberCounts(user.id),
    ])
      .then(([rows, counts]) => {
        if (!mounted) return
        setMembers(rows)
        setMemberCounts(counts)
      })
      .catch(() => {
        // csendes
      })
    return () => {
      mounted = false
    }
  }, [user, dbAvailable, memberSearch, memberIncludeDeceased, memberOnlyVisible])

  // M3.3 — eszköz-bind: FÜGGETLEN a lokális DB állapotától.
  useEffect(() => {
    if (!user) return
    let mounted = true

    getDeviceInfo()
      .then((info) => {
        if (!mounted) return
        setDeviceInfo(info)
        return ensureDeviceRegistered(user.id)
      })
      .then((res) => {
        if (!mounted || !res) return
        if (res.error) {
          setDeviceError(res.error)
        } else if (res.registered) {
          setDeviceRegMsg('Eszköz regisztrálva a rendszerben.')
        }
        return getMyDevices(user.id)
      })
      .then((devices) => {
        if (!mounted || !devices) return
        setMyDevices(devices)
      })
      .catch((err: unknown) => {
        if (mounted) setDeviceError(errorMessage(err))
      })

    return () => {
      mounted = false
    }
  }, [user])

  // M4 — revoke-detektor: ha az admin web-oldalról visszavonja az eszközt,
  // a kliens észleli, üzenetet mutat és automatikus kijelentkezés.
  // 30 sec periodikus ellenőrzés + mount-induláskor egy azonnali.
  useEffect(() => {
    if (!user) return
    let mounted = true
    let interval: number | null = null

    async function check() {
      const status = await checkDeviceRevokeState(user!.id)
      if (!mounted || !status.known) return

      if (status.revoked) {
        const reason = status.reason ?? 'A rendszergazda nem adott meg indokot.'
        alert(
          'Ezt az eszközt a rendszergazda visszavonta.\n\n' +
            'Indok: ' +
            reason +
            '\n\nA kliens automatikusan kijelentkezik.',
        )
        try {
          const supabase = getDesktopSupabase()
          await supabase.auth.signOut()
        } catch {
          // csendes: akkor is redirect
        }
        navigate('/login', { replace: true })
      }
    }

    // Azonnali ellenőrzés (bejelentkezés után rögtön)
    void check()

    // 30 mp-es periodikus ellenőrzés
    interval = window.setInterval(() => {
      void check()
    }, 30_000)

    return () => {
      mounted = false
      if (interval !== null) window.clearInterval(interval)
    }
  }, [user, navigate])

  async function handlePing() {
    setPinging(true)
    setDbError(null)
    try {
      await setSetting('last_ping', new Date().toISOString())
      await refreshLocalDb()
    } catch (err: unknown) {
      setDbError(errorMessage(err))
    } finally {
      setPinging(false)
    }
  }

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setConflictNotice(null)
    try {
      const res = await pullOwnProfile(user.id)
      setLastPull(res.lastPullIso)
      const row = await getLocalOwnProfile(user.id)
      setLocalProfile(row)
      setPhoneDraft(row?.phone ?? '')
      setNameDraft(row?.full_name ?? '')
      await refreshLocalDb()
    } catch (err: unknown) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user, refreshLocalDb])

  // M6 — saját gyülekezet pull (Supabase → congregations_local)
  const handlePullCongregation = useCallback(async () => {
    if (!user) return
    setPullingCongregation(true)
    setPullCongregationError(null)
    try {
      const res = await pullOwnCongregation(user.id)
      setLastPullCongregation(res.lastPullIso)
      const row = await getLocalOwnCongregation(user.id)
      setLocalCongregation(row)
      await refreshLocalDb()
    } catch (err: unknown) {
      setPullCongregationError(errorMessage(err))
    } finally {
      setPullingCongregation(false)
    }
  }, [user, refreshLocalDb])

  // M7 — members pull (delta vagy full)
  const handlePullMembers = useCallback(
    async (mode: 'delta' | 'full') => {
      if (!user) return
      setPullingMembers(true)
      setPullMembersError(null)
      setPullMembersResult(null)
      try {
        const res = await pullMembersOfOwnCongregation(user.id, mode)
        setLastPullMembers(res.lastPullIso)
        if (res.mode === 'no-congregation') {
          setPullMembersResult(
            'Nincs gyülekezet hozzárendelve a profilhoz (pl. super-admin vagy). Nincs mit pull-olni.',
          )
        } else {
          const modeLabel =
            res.mode === 'delta'
              ? 'Delta'
              : res.mode === 'full-initial'
                ? 'Full (első futás)'
                : 'Full'
          setPullMembersResult(
            res.pulledRows === 0
              ? `${modeLabel} pull: nincs új / változott tag.`
              : `${modeLabel} pull: ${res.pulledRows} tag frissítve.`,
          )
        }
        const [rows, counts] = await Promise.all([
          getLocalMembersOfOwnCongregation(user.id, {
            search: memberSearch.trim() || undefined,
            includeDeceased: memberIncludeDeceased,
            onlyVisible: memberOnlyVisible,
          }),
          getLocalMemberCounts(user.id),
        ])
        setMembers(rows)
        setMemberCounts(counts)
      } catch (err: unknown) {
        setPullMembersError(errorMessage(err))
      } finally {
        setPullingMembers(false)
      }
    },
    [user, memberSearch, memberIncludeDeceased, memberOnlyVisible],
  )

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!user) return
      setSaving(true)
      setSaveMsg(null)
      setSaveError(null)
      setConflictNotice(null)
      try {
        const patch: { phone?: string | null; full_name?: string | null } = {}
        if (phoneDraft !== (localProfile?.phone ?? '')) patch.phone = phoneDraft || null
        if (nameDraft !== (localProfile?.full_name ?? '')) patch.full_name = nameDraft || null

        if (Object.keys(patch).length === 0) {
          setSaveMsg('Nincs változás a mezőkben.')
          return
        }

        const res = await updateOwnProfile(user.id, patch)
        const row = await getLocalOwnProfile(user.id)
        setLocalProfile(row)
        setPhoneDraft(row?.phone ?? '')
        setNameDraft(row?.full_name ?? '')
        await refreshLocalDb()

        if (res.conflict) {
          setConflictNotice(
            'Konfliktus: a szerveren időközben megváltozott a profil (másik eszközről vagy a webes felületről). A lokális cache-t frissítettük a szerver-változattal. Ellenőrizd a mezőket, és ha szeretnéd, mentsd újra.',
          )
        } else if (res.queuedToOutbox) {
          setSaveMsg(
            'Elmentve offline — a szerverrel a következő online-csatlakozáskor szinkronizálódik.',
          )
        } else {
          setSaveMsg(
            `Elmentve a szerverre és lokálisan${
              res.newRevision !== undefined ? ` (új revision: ${res.newRevision})` : ''
            }.`,
          )
        }
      } catch (err: unknown) {
        setSaveError(errorMessage(err))
      } finally {
        setSaving(false)
      }
    },
    [user, phoneDraft, nameDraft, localProfile, refreshLocalDb],
  )

  const handlePullAll = useCallback(
    async (mode: 'delta' | 'full') => {
      setPullingAll(true)
      setPullAllError(null)
      setPullAllResult(null)
      try {
        const res = await pullAllProfiles(mode)
        setPullAllResult(
          res.pulledRows === 0
            ? `${res.mode === 'delta' ? 'Delta' : 'Full'} pull: nincs új / változott sor (${res.mode}).`
            : `${res.mode === 'delta' ? 'Delta' : res.mode === 'full-initial' ? 'Full (első futás)' : 'Full'} pull: ${res.pulledRows} sor frissítve.`,
        )
        await refreshLocalDb()
      } catch (err: unknown) {
        setPullAllError(errorMessage(err))
      } finally {
        setPullingAll(false)
      }
    },
    [refreshLocalDb],
  )

  const handleManualSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const stats = await processOutbox()
      setSyncResult(
        stats.attempted === 0
          ? 'Nincs függő outbox-sor (vagy offline vagy).'
          : `${stats.sent} kiküldve, ${stats.conflicts} konfliktus, ${stats.failed - stats.conflicts} egyéb hiba, ${stats.attempted} próba.`,
      )
      await refreshLocalDb()
      if (user) {
        const row = await getLocalOwnProfile(user.id)
        setLocalProfile(row)
      }
    } finally {
      setSyncing(false)
    }
  }, [refreshLocalDb, user])

  const handleRetry = useCallback(
    async (id: number) => {
      await retryOutboxRow(id)
      await refreshLocalDb()
    },
    [refreshLocalDb],
  )

  const handleDismiss = useCallback(
    async (id: number) => {
      await dismissOutboxRow(id)
      await refreshLocalDb()
    },
    [refreshLocalDb],
  )

  const handleCheckUpdate = useCallback(async () => {
    setUpdateMsg(null)
    setUpdateProgress(null)
    const res = await checkForUpdates()
    setUpdateCheck(res)
    if (res.error) {
      setUpdateMsg(`Ellenőrzés hiba: ${res.error}`)
    } else if (!res.available) {
      setUpdateMsg('A legfrissebb verzió fut.')
    }
  }, [])

  const handleInstallUpdate = useCallback(async () => {
    if (!updateCheck?.handle) return
    setUpdating(true)
    setUpdateProgress(0)
    setUpdateMsg('Letöltés…')
    const res = await downloadAndInstall(updateCheck.handle, (downloaded, total) => {
      if (total) {
        setUpdateProgress(Math.round((downloaded / total) * 100))
      }
    })
    if (res.success) {
      setUpdateMsg('Telepítve — az app most újraindul.')
    } else {
      setUpdateMsg(`Telepítési hiba: ${res.error}`)
      setUpdating(false)
    }
  }, [updateCheck])

  return (
    <DesktopShell>
      <div className="space-y-4">
        <Card className="card-raised border-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="font-heading text-2xl">
                  Üdvözöllek a Kartotékában!
                </CardTitle>
                <CardDescription>
                  {user ? `Bejelentkezve: ${user.email}` : 'Felhasználó betöltése…'}
                </CardDescription>
              </div>
              <OnlineBadge online={onlineState} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fejlesztői dashboard (M2.4–M7): pull + push sync, konfliktus-kezelés,
              SQLCipher titkosítás, eszköz-regisztráció, updater, gyülekezet és
              tag-szinkron. A UI a közös `@kartoteka/ui` design-rendszert használja,
              ugyanazzal a megjelenéssel, mint a webes kliens.
            </p>
          </CardContent>
        </Card>

        {/* — Saját profil + szerkesztés (M2.4 + M2.5 + M2.6) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Saját profil — offline-first</CardTitle>
            <CardDescription>
              Pull + mentés (optimistic) + konfliktus-kezelés (revision-check). Próbáld
              ki: módosítsd webes felületen, majd próbálj innen is menteni ugyanarra
              az adatra — konfliktust kapsz.
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
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
                      <ProfileRow label="Gyülekezet (id)" value={localProfile.congregation_id} mono />
                      <ProfileRow label="Revision" value={String(localProfile.revision)} mono />
                      <ProfileRow label="Updated at" value={localProfile.updated_at} mono />
                      <ProfileRow label="Synced at" value={localProfile.synced_at} mono />
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

                  {conflictNotice && (
                    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      ⚠ {conflictNotice}
                    </div>
                  )}

                  {saveMsg && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                      {saveMsg}
                    </div>
                  )}
                  {saveError && (
                    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
                Még nincs lokálisan cache-elt profil-sor. Kattints a „Pull profil" gombra.
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Saját gyülekezet (M6 — első domain-tábla sync) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Saját gyülekezet — offline nézet</CardTitle>
            <CardDescription>
              Az M6 fázis az első domain-tábla szinkronizáció a profil után.
              A gyülekezet-adatokat (név, IBAN, járulék, elérhetőség, logó)
              a kliens Supabase-ből tölti le, és SQLCipher-rel titkosítva
              eltárolja. Offline is látható. A módosítás admin-privilégium —
              későbbi fázisban.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Utolsó pull:{' '}
                {lastPullCongregation ? (
                  <span className="font-mono">{lastPullCongregation}</span>
                ) : (
                  <em>még nem futott</em>
                )}
              </div>
              <Button
                variant="outline"
                onClick={handlePullCongregation}
                disabled={!user || pullingCongregation}
              >
                {pullingCongregation ? 'Pull…' : 'Pull gyülekezet'}
              </Button>
            </div>

            {pullCongregationError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                Pull hiba: {pullCongregationError}
              </div>
            )}

            {localCongregation ? (
              <div className="space-y-3">
                {/* Logó, ha van */}
                {localCongregation.cimer_url && (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <img
                      src={localCongregation.cimer_url}
                      alt="Gyülekezet címer"
                      className="h-16 w-16 rounded-md object-contain bg-white"
                      onError={(e) => {
                        // Ha a logó-URL nem érhető el (offline, 404), rejtsük el
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <div>
                      <p className="font-heading text-lg text-foreground">
                        {localCongregation.nev_hu ?? localCongregation.name}
                      </p>
                      {localCongregation.nev_ro && localCongregation.nev_ro !== localCongregation.nev_hu && (
                        <p className="text-xs text-muted-foreground">
                          {localCongregation.nev_ro}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Alapadatok */}
                <div className="rounded-md border border-border">
                  <table className="w-full text-left">
                    <tbody>
                      <ProfileRow label="ID" value={localCongregation.id} mono />
                      <ProfileRow label="Név (kánoni)" value={localCongregation.name} />
                      <ProfileRow label="Név (magyar)" value={localCongregation.nev_hu} />
                      <ProfileRow label="Név (román)" value={localCongregation.nev_ro} />
                      <ProfileRow label="Egyházkerület" value={localCongregation.district} />
                      <ProfileRow label="Egyházmegye" value={localCongregation.egyhazmegye} />
                      <ProfileRow label="Adószám" value={localCongregation.adoszam} mono />
                    </tbody>
                  </table>
                </div>

                {/* Elérhetőség */}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Elérhetőség
                  </p>
                  <div className="rounded-md border border-border">
                    <table className="w-full text-left">
                      <tbody>
                        <ProfileRow label="Cím" value={localCongregation.cim} />
                        <ProfileRow label="Város" value={localCongregation.varos} />
                        <ProfileRow label="Megye" value={localCongregation.megye} />
                        <ProfileRow label="Irányítószám" value={localCongregation.iranyitoszam} mono />
                        <ProfileRow label="E-mail" value={localCongregation.email} />
                        <ProfileRow label="Telefon" value={localCongregation.telefon} />
                        <ProfileRow label="Weboldal" value={localCongregation.web} />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pénzügyi */}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Pénzügyi adatok
                  </p>
                  <div className="rounded-md border border-border">
                    <table className="w-full text-left">
                      <tbody>
                        <ProfileRow label="IBAN" value={localCongregation.iban} mono />
                        <ProfileRow label="Bank" value={localCongregation.bank} />
                        <ProfileRow
                          label="Éves járulék"
                          value={
                            localCongregation.eves_jarulek !== null
                              ? `${localCongregation.eves_jarulek} RON`
                              : null
                          }
                        />
                        <ProfileRow
                          label="Kedvezményes járulék"
                          value={
                            localCongregation.jarulek_kedvezmenyes !== null
                              ? `${localCongregation.jarulek_kedvezmenyes} RON`
                              : null
                          }
                        />
                        <ProfileRow
                          label="Járulék-határidő"
                          value={localCongregation.jarulek_hatarid}
                          mono
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Publikus oldal */}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Publikus gyülekezeti oldal
                  </p>
                  <div className="rounded-md border border-border">
                    <table className="w-full text-left">
                      <tbody>
                        <ProfileRow
                          label="Aktív"
                          value={
                            localCongregation.public_site_enabled === 1
                              ? '✅ Igen'
                              : '— Nem —'
                          }
                        />
                        <ProfileRow
                          label="Slug (URL)"
                          value={
                            localCongregation.public_slug
                              ? `/gy/${localCongregation.public_slug}`
                              : null
                          }
                          mono
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sync-metadata */}
                <div className="rounded-md border border-border bg-muted/20">
                  <table className="w-full text-left">
                    <tbody>
                      <ProfileRow
                        label="Revision"
                        value={String(localCongregation.revision)}
                        mono
                      />
                      <ProfileRow
                        label="Supabase updated_at"
                        value={localCongregation.updated_at}
                        mono
                      />
                      <ProfileRow
                        label="Lokálisan synced"
                        value={localCongregation.synced_at}
                        mono
                      />
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Még nincs lokálisan cache-elt gyülekezet-sor. Kattints a
                „Pull gyülekezet" gombra az első letöltéshez. (Ha a profilodhoz
                nincs gyülekezet hozzárendelve — pl. super-admin vagy —, ez a
                mező üresen marad.)
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Gyülekezet tagjai (M7 — szemely sync) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Gyülekezet tagjai — offline lista</CardTitle>
            <CardDescription>
              Az M7 fázis az első sok-rekordos domain-tábla sync. A saját
              gyülekezet tagjai letöltődnek a Supabase-ből, titkosítva
              tárolódnak a lokális SQLCipher-ben, és offline is kereshetők.
              A Delta pull csak a legutolsó szinkron óta változott tagokat
              hozza. Az írás (új tag, módosítás) későbbi fázisban.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Utolsó pull:{' '}
                {lastPullMembers ? (
                  <span className="font-mono">{lastPullMembers}</span>
                ) : (
                  <em>még nem futott</em>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePullMembers('delta')}
                  disabled={!user || pullingMembers}
                >
                  {pullingMembers ? 'Pull…' : 'Delta Pull'}
                </Button>
                <Button
                  onClick={() => handlePullMembers('full')}
                  disabled={!user || pullingMembers}
                >
                  {pullingMembers ? 'Pull…' : 'Full Pull'}
                </Button>
              </div>
            </div>

            {pullMembersResult && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                {pullMembersResult}
              </div>
            )}
            {pullMembersError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                Pull hiba: {pullMembersError}
              </div>
            )}

            {/* Kereső + szűrők */}
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1 space-y-1">
                  <Label htmlFor="member-search">Keresés (név vagy CNP)</Label>
                  <Input
                    id="member-search"
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.currentTarget.value)}
                    placeholder="pl. Kovács vagy 1850..."
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={memberIncludeDeceased}
                      onChange={(e) => setMemberIncludeDeceased(e.currentTarget.checked)}
                      className="size-4"
                    />
                    Elhunytakat is mutassa
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={memberOnlyVisible}
                      onChange={(e) => setMemberOnlyVisible(e.currentTarget.checked)}
                      className="size-4"
                    />
                    Csak nyilvántartásban láthatók (<code>isvisible=1</code>)
                  </label>
                </div>
              </div>

              {/* Diagnosztikai sáv — látjuk, hogy melyik szűrő mit tesz */}
              {memberCounts && (
                <div className="flex flex-wrap items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>
                    Lokálisan cache-elve:{' '}
                    <strong className="text-foreground">{memberCounts.total}</strong>
                  </span>
                  <span>
                    Élő (<code>meghalt=0</code>):{' '}
                    <strong className="text-foreground">{memberCounts.living}</strong>
                  </span>
                  <span>
                    Élő + látható:{' '}
                    <strong className="text-foreground">{memberCounts.visible}</strong>
                  </span>
                  <span className="ml-auto">
                    Listában most:{' '}
                    <strong className="text-foreground">{members.length}</strong>
                  </span>
                </div>
              )}
            </div>

            {members.length > 0 ? (
              <div className="rounded-md border border-border">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Név</th>
                      <th className="px-3 py-2">CNP</th>
                      <th className="px-3 py-2">Szül.</th>
                      <th className="px-3 py-2">Telefon</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.slice(0, 100).map((m) => (
                      <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs">
                          <div className="font-medium text-foreground">
                            {formatMemberName(m)}
                          </div>
                          {m.ferjk_nev && m.ferjk_nev !== m.csaladnev && (
                            <div className="text-muted-foreground">
                              leánykori: {m.szcs_nev ?? m.csaladnev}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{m.cnp}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {m.sz_datum ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.telefon ?? '—'}
                        </td>
                        <td
                          className="max-w-[180px] truncate px-3 py-2 font-mono text-xs"
                          title={m.email ?? ''}
                        >
                          {m.email ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.meghalt === 1 ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                              elhunyt
                            </span>
                          ) : m.csaladfo === 1 ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                              családfő
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {members.length > 100 && (
                  <div className="border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Az első 100 tag látható. Szűkítsd a keresést a többiért.
                    (Összesen lokálisan: {members.length})
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {lastPullMembers
                  ? 'Nincs találat a jelenlegi szűrőkkel. Próbálj mást keresni vagy engedd be az elhunytakat.'
                  : 'Még nincs lokálisan cache-elt tag. Kattints a „Full Pull" gombra az első letöltéshez.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Minden profil (M2.7 delta-sync demo) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Összes profil — delta-sync</CardTitle>
            <CardDescription>
              M2.7 — delta-pull a Supabase <code>profiles</code> táblára.
              A „Delta" gomb csak az utolsó pull óta változott sorokat hozza
              (<code>updated_at &gt; last_pull</code>), így sávszélesség-
              takarékos. A „Full" gomb az összeset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Utolsó delta-pull:{' '}
                {lastPullAll ? (
                  <span className="font-mono">{lastPullAll}</span>
                ) : (
                  <em>még nem futott</em>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePullAll('delta')}
                  disabled={pullingAll}
                >
                  {pullingAll ? 'Pull…' : 'Delta Pull'}
                </Button>
                <Button onClick={() => handlePullAll('full')} disabled={pullingAll}>
                  {pullingAll ? 'Pull…' : 'Full Pull'}
                </Button>
              </div>
            </div>

            {pullAllResult && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                {pullAllResult}
              </div>
            )}
            {pullAllError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                Pull hiba: {pullAllError}
              </div>
            )}

            {allProfiles.length > 0 ? (
              <div className="rounded-md border border-border">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Név</th>
                      <th className="px-3 py-2">Szerepkör</th>
                      <th className="px-3 py-2">Rev</th>
                      <th className="px-3 py-2">Updated at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProfiles.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td
                          className="max-w-xs truncate px-3 py-2 font-mono text-xs"
                          title={p.email ?? ''}
                        >
                          {p.email ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.full_name ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">{p.role ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.revision}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {p.updated_at ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Még nincs lokálisan cache-elt profil-sor. Kattints a „Full Pull"
                gombra az első letöltéshez.
              </p>
            )}
          </CardContent>
        </Card>

        {/* — Outbox + konfliktusok (M2.5 + M2.6) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Outbox — offline írások + konfliktusok</CardTitle>
            <CardDescription>
              A függő sorokat bejelentkezéskor és manuálisan is elküldjük. A
              konfliktusos (failed) sorok alatt külön listában láthatók — retry vagy
              elvetés lehetőségekkel.
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

            {failedRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Hibás / konfliktusos sorok ({failedRows.length})
                </p>
                <div className="rounded-md border border-border">
                  <table className="w-full text-left">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Op</th>
                        <th className="px-3 py-2">Tábla</th>
                        <th className="px-3 py-2">Hiba</th>
                        <th className="px-3 py-2">Retry</th>
                        <th className="px-3 py-2">Műveletek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedRows.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">{r.op}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.target_table}</td>
                          <td
                            className="max-w-xs truncate px-3 py-2 text-xs text-destructive"
                            title={r.last_error ?? ''}
                          >
                            {r.last_error ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.retry_count}</td>
                          <td className="px-3 py-2 text-xs">
                            <div className="flex gap-1">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleRetry(r.id)}
                              >
                                Újrapróba
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() => handleDismiss(r.id)}
                              >
                                Elvetés
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* — Frissítés (M5) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Frissítés</CardTitle>
            <CardDescription>
              Tauri auto-updater. A kliens Ed25519-aláírt manifesttel hitelesíti
              az új verziót, mielőtt letölti. M5-ben a pubkey még placeholder —
              éles release előtt a <code>ops/updater-key-setup.ps1</code> script
              generálja a kulcsot, és a pubkey a <code>tauri.conf.json</code>-be
              kerül.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                {updateCheck?.available ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Új verzió: {updateCheck.version}
                    </p>
                    {updateCheck.releaseDate && (
                      <p className="text-xs text-muted-foreground">
                        Kiadás dátuma: {updateCheck.releaseDate}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ellenőrzéssel tudod megnézni, van-e új verzió.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCheckUpdate} disabled={updating}>
                  Ellenőrzés
                </Button>
                {updateCheck?.available && (
                  <Button onClick={handleInstallUpdate} disabled={updating}>
                    {updating
                      ? updateProgress !== null
                        ? `Letöltés ${updateProgress}%`
                        : 'Letöltés…'
                      : 'Letöltés és telepítés'}
                  </Button>
                )}
              </div>
            </div>

            {updateCheck?.notes && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-medium text-foreground">Release notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {updateCheck.notes}
                </p>
              </div>
            )}

            {updateMsg && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                {updateMsg}
              </div>
            )}
          </CardContent>
        </Card>

        {/* — Eszköz-bind (M3.3) — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Ez az eszköz</CardTitle>
            <CardDescription>
              Első indításkor a kliens egy Ed25519 kulcspárt és egy gép-fingerprintet
              generál. A privát kulcs az OS-szintű keyringben marad (DPAPI védett).
              A publikus kulcs a Supabase <code>user_devices</code> táblába kerül —
              a rendszergazda később bármikor revoke-olhatja ezt az eszközt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {deviceError && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Eszköz-regisztráció hiba: {deviceError}
              </div>
            )}
            {deviceRegMsg && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                ✅ {deviceRegMsg}
              </div>
            )}

            {deviceInfo ? (
              <div className="rounded-md border border-border">
                <table className="w-full text-left">
                  <tbody>
                    <ProfileRow label="Device ID" value={deviceInfo.id} mono />
                    <ProfileRow label="Hardware fingerprint" value={deviceInfo.fingerprint} mono />
                    <ProfileRow
                      label="Publikus kulcs (base64)"
                      value={deviceInfo.public_key_b64}
                      mono
                    />
                    <ProfileRow label="Platform" value={deviceInfo.platform} />
                    <ProfileRow
                      label="Keypair generálva"
                      value={deviceInfo.created_now ? 'most (első indítás)' : 'korábban (keyringből olvasva)'}
                    />
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Eszköz-info betöltése…</p>
            )}

            {myDevices.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Összes regisztrált eszközöm ({myDevices.length})
                </p>
                <div className="rounded-md border border-border">
                  <table className="w-full text-left">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Platform</th>
                        <th className="px-3 py-2">Név</th>
                        <th className="px-3 py-2">Regisztrálva</th>
                        <th className="px-3 py-2">Utolsó aktivitás</th>
                        <th className="px-3 py-2">Státusz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myDevices.map((d) => (
                        <tr key={d.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">{d.platform}</td>
                          <td className="px-3 py-2 text-xs">{d.device_name ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {d.registered_at}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {d.last_seen ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {d.revoked ? (
                              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                                visszavonva
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                aktív
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* — Lokális adatbázis — */}
        <Card className="card-raised border-0">
          <CardHeader>
            <CardTitle>Lokális adatbázis</CardTitle>
            <CardDescription>
              SQLCipher + Credential Manager (DPAPI per-user)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {dbAvailable === null && (
              <p className="text-muted-foreground">DB állapot lekérése…</p>
            )}

            {dbAvailable === false && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-foreground">
                <p className="font-medium">Lokális DB nem elérhető</p>
                {dbStatus?.init_error ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A Rust-oldali inicializálás hibája:
                    </p>
                    <p className="mt-1 rounded bg-background/60 p-2 font-mono text-xs text-destructive">
                      {dbStatus.init_error}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Tipikus ok: régi M2.2-es DB-fájl új kulccsal. Megoldás PowerShell-ből:
                    </p>
                    <pre className="mt-1 rounded bg-background/60 p-2 font-mono text-xs">
{`Remove-Item "$env:APPDATA\\com.erek.kartoteka\\kartoteka.db" -ErrorAction SilentlyContinue`}
                    </pre>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Majd: zárd be a Kartotéka-ablakot és indítsd újra (<code>npm run desktop:dev</code>).
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A Rust-plugin csak natív Tauri-ablakban aktív. Indítsd:{' '}
                      <code>npm run desktop:dev</code>.
                    </p>
                    {dbError && (
                      <p className="mt-1 font-mono text-xs text-destructive">{dbError}</p>
                    )}
                  </>
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
                    A „Ping" gomb beír egy <code>last_ping</code> értéket, demonstrálja
                    az írást.
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
    </DesktopShell>
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

/**
 * Tag neve megjelenítésre — ABC-sorrendhez alkalmas + férjezett név kezelése.
 * Formátum: "Csaladnev K_nev" — ha ferjk_nev van (nő, férjezett), az.
 */
function formatMemberName(m: MemberLocalRow): string {
  const lastName = m.ferjk_nev ?? m.csaladnev ?? ''
  const firstName = m.k_nev ?? ''
  const name = `${lastName} ${firstName}`.trim()
  return name || '(névtelen)'
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
      <span className={`size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
