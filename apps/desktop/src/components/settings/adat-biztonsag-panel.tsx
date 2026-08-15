/**
 * Adat & biztonság panel — a SettingsDialog "Adat & biztonság" tabja.
 *
 * 5 szinoptikus kártya a desktop-kliens sync / DB / eszköz-állapotáról.
 * A KOMPLEX műveletek (retry outbox, teljes device-lista, frissítési flow)
 * a `/dev` route-ra vannak hivatkozva — a Settings-ben csak gyors áttekintés
 * + egyszerű action-ök.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Monitor,
  RefreshCw,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import { Button } from '@kartoteka/ui'

import { errorMessage } from '../../lib/error'
import { getDbStatus, getOutboxStats, type OutboxStats } from '../../lib/local-db'
import { getDesktopSupabase } from '../../lib/supabase'
import { getDesktopUser } from '../../lib/desktop-user'
import {
  flushAllPendingWrites,
  isOnline,
  pullOwnCongregation,
  pullOwnProfile,
  pullMembersOfOwnCongregation,
  pullWorklogOfOwnCongregation,
} from '../../lib/sync'
import { getDeviceInfo, type DeviceInfo } from '../../lib/device'

export function AdatBiztonsagPanel() {
  const [user, setUser] = useState<User | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [dbOpened, setDbOpened] = useState<boolean | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<OutboxStats | null>(null)
  const [device, setDevice] = useState<DeviceInfo | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // 2026-08-15 (desktop-paritás 1. szelet, 8. pont útjelző): a kétlépcsős
  // belépés (2FA) állapota — null = ellenőrzés fut, 'ismeretlen' = PIN-es
  // (offline) munkamenet vagy hiba, ilyenkor NEM állítunk hamis „nincs
  // bekapcsolva"-t.
  const [ketlepcsos, setKetlepcsos] = useState<'aktiv' | 'inaktiv' | 'ismeretlen' | null>(null)

  // Auth + online + DB + outbox + device — egyszerre töltjük be
  useEffect(() => {
    let mounted = true
    getDesktopUser().then((resolvedUser) => {
      if (mounted) setUser(resolvedUser)
    })
    isOnline().then((v) => {
      if (mounted) setOnline(v)
    })
    refreshDbAndOutbox()
    getDeviceInfo()
      .then((d) => {
        if (mounted) setDevice(d)
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // 2026-08-15 (desktop-paritás 1. szelet): 2FA-állapot — CSAK tájékoztató.
  // Ugyanaz az olvasás, mint az auth-gate aal-őrében: a `nextLevel === 'aal2'`
  // jelzi, hogy a fióknak van ellenőrzött 2FA-faktora. Session nélkül (PIN-es
  // offline munkamenet) az állapot nem dönthető el → 'ismeretlen', őszintén
  // kiírva. A be-/kikapcsolás a webes felületen történik (Profil → Biztonság).
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    // Timeout-tal (mint a verified-session): a getSession lejárt tokennél
    // hálózati refresh-t indíthat — a Beállítások panel ne függjön rajta.
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 4000)
    })
    void Promise.race([supabase.auth.getSession(), timeout])
      .then((res) => {
        const session = res && 'data' in res ? res.data.session : null
        if (!session) {
          if (mounted) setKetlepcsos('ismeretlen')
          return null
        }
        return supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      })
      .then((aalRes) => {
        if (!mounted || !aalRes) return
        const aal = 'data' in aalRes ? aalRes.data : null
        if (!aal) {
          setKetlepcsos('ismeretlen')
          return
        }
        setKetlepcsos(aal.nextLevel === 'aal2' ? 'aktiv' : 'inaktiv')
      })
      .catch(() => {
        if (mounted) setKetlepcsos('ismeretlen')
      })
    return () => {
      mounted = false
    }
  }, [])

  const refreshDbAndOutbox = useCallback(async () => {
    try {
      const status = await getDbStatus()
      setDbOpened(status.opened)
      setDbError(status.init_error ?? null)
      if (status.opened) {
        const stats = await getOutboxStats()
        setOutbox(stats)
      }
    } catch (err) {
      setDbError(errorMessage(err))
    }
  }, [])

  // Sync-minden — profil + gyülekezet + tagok + munkanapló sorban, majd
  // MINDEN függő írás felküldése.
  //
  // 2026-08-15 (javítás): a gomb korábban csak a `processOutbox()`-ot hívta.
  // MI VOLT A KÖVETKEZMÉNYE: az offline rögzített befizetés / kiadás / nyugta
  // és az új tagok a dedikált push-erek queue-jában maradtak, a lelkész mégis
  // azt látta, hogy „szinkronizált". A `flushAllPendingWrites` a klasszikus
  // outboxot ÉS a dedikált push-ereket is elindítja.
  const handleSyncAll = useCallback(async () => {
    if (!user) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const results = {
        profile: 0,
        congregation: 0,
        members: 0,
        worklog: 0,
      }
      const profileRes = await pullOwnProfile(user.id)
      results.profile = profileRes.pulledRows
      const congregationRes = await pullOwnCongregation(user.id)
      results.congregation = congregationRes.pulledRows
      const membersRes = await pullMembersOfOwnCongregation(user.id, 'delta')
      results.members = membersRes.pulledRows
      const worklogRes = await pullWorklogOfOwnCongregation(user.id, 'delta')
      results.worklog = worklogRes.pulledRows

      const push = await flushAllPendingWrites(user.id)
      const kikuldve = push.outbox.sent + push.dedikalt.succeeded
      const konfliktus = push.outbox.conflicts + push.dedikalt.conflicts
      const hibas = push.outbox.failed - push.outbox.conflicts

      // Fail-closed: ha bármi nem ment át, azt KI KELL írni — a „kész" üzenet
      // nem takarhatja el a bennmaradt sorokat.
      const alap =
        `Letöltve: ${results.profile} profil, ${results.congregation} gyülekezet, ` +
        `${results.members} tag, ${results.worklog} napló. ` +
        `Feltöltve: ${kikuldve} tétel, ${konfliktus} ütközés, ${hibas} hiba.`
      setSyncMsg(
        push.hibak.length > 0
          ? `${alap}\nNem sikerült mindent feltölteni:\n• ${push.hibak.slice(0, 5).join('\n• ')}`
          : alap,
      )
      await refreshDbAndOutbox()
    } catch (err) {
      setSyncMsg(`Szinkron-hiba: ${errorMessage(err)}`)
    } finally {
      setSyncing(false)
    }
  }, [user, refreshDbAndOutbox])

  return (
    <div className="space-y-4">
      {/* Hálózat + online-badge */}
      <StatusCard
        icon={online ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
        title="Hálózati kapcsolat"
        status={online === null ? 'neutral' : online ? 'ok' : 'warning'}
        statusText={
          online === null ? 'Ellenőrzés…' : online ? 'Online — Supabase elérhető' : 'Offline'
        }
        description={
          online
            ? 'Új adatok szinkronizálása és mentés lehetséges.'
            : 'A kliens offline módban működik. Az írások az outboxban gyűlnek, és a következő online kapcsolatkor kiküldik.'
        }
      />

      {/* Lokális adatbázis */}
      <StatusCard
        icon={<Database className="size-4" />}
        title="Lokális titkosított adatbázis"
        status={dbOpened === null ? 'neutral' : dbOpened ? 'ok' : 'error'}
        statusText={
          dbOpened === null
            ? 'Betöltés…'
            : dbOpened
              ? 'SQLCipher (AES-256) — megnyitva'
              : 'Nincs megnyitva'
        }
        description={
          dbError
            ? dbError
            : 'A lokális adatok AES-256-tal titkosítva tárolódnak. A kulcs a Windows Credential Managerben él, DPAPI-védelem alatt.'
        }
      />

      {/* Szinkronizáció */}
      <StatusCard
        icon={<RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />}
        title="Szinkronizáció"
        status="neutral"
        statusText={syncing ? 'Futás…' : 'Kézi indítás'}
        description="Saját profil, gyülekezet, tagok és munkanapló delta-szinkronja. Az outbox függő írásait is kiküldi."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={handleSyncAll}
            disabled={!user || syncing || online === false}
          >
            {syncing ? 'Szinkron…' : 'Szinkronizálás most'}
          </Button>
        }
        extra={
          syncMsg && (
            <div className="whitespace-pre-line rounded-[0.8rem] border border-border bg-muted/40 px-3 py-2 text-[11px] text-foreground">
              {syncMsg}
            </div>
          )
        }
      />

      {/* Outbox */}
      <StatusCard
        icon={<AlertTriangle className="size-4" />}
        title="Offline írások (outbox)"
        status={outbox?.failed && outbox.failed > 0 ? 'warning' : 'ok'}
        statusText={
          outbox
            ? `${outbox.pending} függő, ${outbox.failed} hibás, ${outbox.sent} kiküldve`
            : 'Betöltés…'
        }
        description={
          outbox?.failed && outbox.failed > 0
            ? 'Van konfliktusos vagy hibás sor. A részletes kezelés az Irányítópult „Outbox" kártyájában érhető el.'
            : 'Minden sor rendben. Az offline írások automatikusan kiküldésre kerülnek a következő szinkronnál.'
        }
      />

      {/* Eszköz */}
      <StatusCard
        icon={<Monitor className="size-4" />}
        title="Ez az eszköz"
        status={device ? 'ok' : 'neutral'}
        statusText={
          device
            ? `${device.platform} — regisztrálva`
            : 'Ellenőrzés…'
        }
        description={
          device
            ? 'Az eszköz Ed25519-aláírással van regisztrálva a Supabase user_devices táblában. A rendszergazda bármikor visszavonhatja.'
            : 'Az eszköz-információ betöltése folyamatban.'
        }
        extra={
          device && (
            <div className="grid gap-1 rounded-[0.8rem] border border-border bg-muted/30 p-2 text-[11px] font-mono text-muted-foreground">
              <div>
                <strong className="text-foreground">Device ID:</strong> {device.id.slice(0, 20)}…
              </div>
              <div>
                <strong className="text-foreground">Fingerprint:</strong>{' '}
                {device.fingerprint.slice(0, 20)}…
              </div>
            </div>
          )
        }
      />

      {/* Kétlépcsős belépés (2FA) — útjelző kártya (8. pont): az állapotot
          mutatja, a kezelés webes. A belépési kód-lépcső magát a login-oldal
          + az auth-gate aal-őre adja (PR #158). */}
      <StatusCard
        icon={<ShieldCheck className="size-4" />}
        title="Kétlépcsős belépés (2FA)"
        status={ketlepcsos === 'aktiv' ? 'ok' : 'neutral'}
        statusText={
          ketlepcsos === null
            ? 'Ellenőrzés…'
            : ketlepcsos === 'aktiv'
              ? 'Aktív a fiókodon'
              : ketlepcsos === 'inaktiv'
                ? 'Nincs bekapcsolva'
                : 'Csak online belépéssel ellenőrizhető'
        }
        description={
          ketlepcsos === 'aktiv'
            ? 'Online belépéskor az asztali alkalmazás is kéri a hitelesítő alkalmazás 6 jegyű kódját (vagy egy mentőkódot) — a fiókod ezzel erősebben védett.'
            : ketlepcsos === 'inaktiv'
              ? 'A fiókod jelenleg csak jelszóval védett. A kétlépcsős belépés bekapcsolása erősen ajánlott — pár perc, és a webes felületen elvégezhető.'
              : ketlepcsos === 'ismeretlen'
                ? 'PIN-es (offline) munkamenetben az állapot nem olvasható ki — online belépés után frissül.'
                : 'Az állapot ellenőrzése folyamatban.'
        }
        extra={
          <div className="rounded-[0.8rem] border border-border bg-muted/40 px-3 py-2 text-[11px] text-foreground">
            A be- és kikapcsolás, a QR-kód és a mentőkódok kezelése a webes felületen
            történik: <strong>kartoteka.app → Profil → Biztonság</strong>.
          </div>
        }
      />

      {/* Biztonsági info-doboz */}
      <div className="rounded-[1rem] border border-slate-100 bg-slate-50/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          <Shield className="size-3.5" />
          Biztonsági szintek
        </div>
        <ul className="space-y-1 text-[11px] text-slate-700">
          <li>
            🔒 <strong>Tárolás</strong>: SQLCipher (AES-256) — Windows
            Credential Managerben tárolt kulccsal
          </li>
          <li>
            🔑 <strong>Auth</strong>: Supabase session JWT — 1 óra érvényes,
            automatikus refresh
          </li>
          <li>
            ✉️ <strong>E-mail</strong>: Brevo (EU, GDPR-konform), access-request
            + device-revoke sablonok
          </li>
          <li>
            📝 <strong>Aláírás</strong>: Authenticode code-sign + Ed25519
            updater manifest
          </li>
        </ul>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// StatusCard — közös kártya-elrendezés
// ──────────────────────────────────────────────────────────────

interface StatusCardProps {
  icon: React.ReactNode
  title: string
  status: 'ok' | 'warning' | 'error' | 'neutral'
  statusText: string
  description: string
  action?: React.ReactNode
  extra?: React.ReactNode
}

function StatusCard({ icon, title, status, statusText, description, action, extra }: StatusCardProps) {
  const statusClass = {
    ok: 'border-emerald-200 bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50',
    error: 'border-destructive/30 bg-destructive/10',
    neutral: 'border-slate-200 bg-slate-50/60',
  }[status]

  const statusIconClass = {
    ok: 'text-emerald-600',
    warning: 'text-amber-600',
    error: 'text-destructive',
    neutral: 'text-slate-500',
  }[status]

  const statusBadge =
    status === 'ok' ? (
      <CheckCircle2 className="size-3.5 text-emerald-600" />
    ) : status === 'warning' ? (
      <AlertTriangle className="size-3.5 text-amber-600" />
    ) : status === 'error' ? (
      <AlertTriangle className="size-3.5 text-destructive" />
    ) : null

  return (
    <div className={`rounded-[1.2rem] border p-4 ${statusClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/70 ${statusIconClass}`}>
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
              {statusBadge}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-700">{statusText}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {extra && <div className="mt-3">{extra}</div>}
    </div>
  )
}
