'use client'

/**
 * PROFIL-DIALÓGUS (2026-09-05, profil-kör — Endre 4. pontja: pontosság,
 * levágások, sötét mód).
 *
 * MI VOLT A BAJ (a felmérés P1-ei), ÉS MI A SZABÁLY MOSTANTÓL:
 *  · Levágás: a StatCard MINDEN értékre `break-all`-t tett, ezért az
 *    egyházmegye neve („Kézdi-Orbai Refor|mátus Egyházmeg|ye") szó közepén tört.
 *    Mostantól `break-words` + `min-w-0`; az `overflow-wrap:anywhere` CSAK az
 *    e-mail kártyán (a @ előtti törhetetlen felhasználónév miatt). A `truncate`
 *    helyett tördelés vagy `title`.
 *  · Sötét mód: a fedetlen opacitás-osztályok (`bg-white/86`, `bg-slate-50/90`,
 *    `bg-amber-50/85`, `text-teal-700/70`) világos kártyán világos szöveget
 *    adtak (1,03:1). Mostantól CSAK téma-tokenek (bg-card, text-foreground,
 *    border-border, text-muted-foreground, bg-muted); a színes chipek `dark:`
 *    párral.
 *  · Pontosság: a felület igazsága az AKTÍV kontextus (a bal chip igazsága),
 *    nem a legacy `profiles.role` skalár és nem a szabadszöveges `display_title`.
 *    Az egyházmegye/kerület a gyülekezet láncából jön, eltérésnél ⚠️.
 *  · A napló 'kezdeti' sora a migráció napja, nem a szolgálat kezdete —
 *    a felirat ezt őszintén mondja („A napló indulása"), adatot nem írunk át.
 *  · Szerkesztés: a strukturált `pastor_service_history` a kanonikus; a legacy
 *    vesszős lista csak olvasható „Régi (szöveges) bejegyzés".
 *  · Profilkép: szerver-akció, fix objektumnév, „Kép eltávolítása" és
 *    „Google-fotó használata" — az explicit feltöltés győz.
 *
 * Mobil-first: a 3 fül egy sorban, vízszintesen görgethetően; minden
 * érintőfelület legalább 44 px; a hero 375 px-en is rendezett.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Camera,
  Check,
  Church,
  Globe,
  ImageOff,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getProfileDialogData,
  removeProfilePhoto,
  saveProfileDetails,
  uploadProfilePhoto,
  applyGooglePhoto,
} from '@/app/(dashboard)/profile/actions'
import { switchActiveProfileRole } from '@/app/(dashboard)/profile/switch-context-action'
import {
  jovobeliDatumHibak,
  maiNapKulcs,
  profileSaveSchema,
  zodHibakMezonkent,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MIME,
  type ProfileDialogData,
  type ProfileSaveInput,
} from '@/app/(dashboard)/profile/profile-dialog-shared'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  ServiceHistoryEditor,
  createEmptyServiceHistory,
  type ServiceHistorySlot,
} from '@/components/profile/service-history-editor'
import { getProfileEyebrow, getProfileStatusLabel, getRoleLabel, getScopeLabel } from '@/lib/profile-roles/labels'
import { formatDateOnlyHu, formatTimestampHu } from '@/lib/utils/date'
import { getInitials } from '@/lib/utils/name'
import type { Profile } from '@/lib/types/auth'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
}

const SCOPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

// Színes hatókör-chipek — MINDIG `dark:` párral (a pastoral-calendar-card mintája).
const SCOPE_TONE: Record<string, string> = {
  system: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
  district: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200',
  diocese: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
  congregation: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
}

type FormState = {
  fullName: string
  phone: string
  birthDate: string
  displayTitle: string
  address: string
  emergencyPhone: string
  serviceStartedAt: string
  previousRoles: string
  bio: string
  ministryNotes: string
}

function formFromData(d: ProfileDialogData): FormState {
  return {
    fullName: d.fullName || '',
    phone: d.phone || '',
    birthDate: d.birthDate || '',
    displayTitle: d.pastorProfile.displayTitle || '',
    address: d.pastorProfile.address || '',
    emergencyPhone: d.pastorProfile.emergencyPhone || '',
    serviceStartedAt: d.pastorProfile.serviceStartedAt || '',
    previousRoles: d.pastorProfile.previousRoles.join(', '),
    bio: d.pastorProfile.bio || '',
    ministryNotes: d.pastorProfile.ministryNotes || '',
  }
}

function slotsFromData(d: ProfileDialogData): ServiceHistorySlot[] {
  // A kulcs a gyárból jön (nem gépelt tartalomból) — sorrend: ahogy a szerver adta.
  return d.serviceHistory.map((sh) => ({
    ...createEmptyServiceHistory(),
    hely: sh.hely,
    szerep: sh.szerep || '',
    ev_tol: sh.evTol,
    ev_ig: sh.evIg,
    megjegyzes: sh.megjegyzes || '',
  }))
}

const norm = (s: string) => s.trim().toLowerCase()
const nagyKezdo = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * Egy DOBOTT hiba emberi szövege. MIÉRT kell: a szerver-akció hívása maga is
 * elutasulhat (hálózat, lejárt munkamenet, élesben MASZKOLT szerver-hiba) — a
 * `result.error` ág ezt nem éri el. Catch nélkül a promise némán elutasult:
 * a betöltő örökre pörgött, a mentés/fotó gombja üzenet nélkül állt vissza.
 */
function hibaSzoveg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return 'ismeretlen hiba'
}

export function ProfileDialog({ open, onOpenChange, profile }: ProfileDialogProps) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Az „Újra" gomb ezt lépteti — az effekt újrafut, nem kell bezárni-kinyitni.
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [data, setData] = useState<ProfileDialogData | null>(null)
  const [form, setForm] = useState<FormState>({
    fullName: profile.full_name || '',
    phone: profile.phone || '',
    birthDate: profile.birth_date || '',
    displayTitle: '',
    address: '',
    emergencyPhone: '',
    serviceStartedAt: '',
    previousRoles: '',
    bio: '',
    ministryNotes: '',
  })
  const [slots, setSlots] = useState<ServiceHistorySlot[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [switchPending, startSwitch] = useTransition()
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // A setState NEM az effekt törzsében fut (CI lint: react-hooks/set-state-in-effect),
    // hanem a mikrotaszkban — a betöltés-jelző így is az első festés előtt megjelenik.
    queueMicrotask(() => {
      void (async () => {
        if (cancelled) return
        setLoading(true)
        setLoadError(null)
        try {
          const result = await getProfileDialogData()
          if (cancelled) return
          if ('error' in result) {
            // A hiba a dialógus TÖRZSÉBEN marad (nem csak egy eltűnő toastban),
            // az „Újra" gombbal — a felhasználó látja, mi történt és mit tehet.
            setLoadError(result.error)
            toast.error(result.error)
            return
          }
          setData(result.data)
          setForm(formFromData(result.data))
          setSlots(slotsFromData(result.data))
          setFieldErrors({})
        } catch (e) {
          if (cancelled) return
          const uzenet = `A profil betöltése nem sikerült: ${hibaSzoveg(e)}`
          setLoadError(uzenet)
          toast.error(uzenet)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    })
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])

  const initials = useMemo(
    () => getInitials(data?.fullName || profile.full_name || profile.email, 'K'),
    [data?.fullName, profile.full_name, profile.email],
  )

  const aktiv = data?.aktiv ?? null
  const aktivRoleLabel = aktiv ? getRoleLabel(aktiv.role, aktiv.customLabel) : getRoleLabel(data?.role)
  const eyebrow = getProfileEyebrow(aktiv?.role ?? data?.role)
  const statusz = getProfileStatusLabel(data?.status)
  const isLelkesz = aktiv ? aktiv.role === 'lelkesz' : data?.role === 'lelkesz'

  // Legacy szöveges helyek, amelyek NINCSENEK a strukturált sorok között.
  const legacyHelyek = useMemo(() => {
    if (!data) return []
    const strukturalt = new Set(data.serviceHistory.map((sh) => norm(sh.hely)))
    return data.pastorProfile.previousServicePlaces.filter((p) => p.trim() && !strukturalt.has(norm(p)))
  }, [data])

  function alkalmazEredmeny(next: ProfileDialogData) {
    setData(next)
    setForm(formFromData(next))
    setSlots(slotsFromData(next))
  }

  // ── Profilkép ──────────────────────────────────────────────────────────────
  async function handlePhotoUpload(file: File) {
    // Kliens-oldali előszűrés — a szerver ugyanezt ellenőrzi (egy szabály).
    if (!PROFILE_PHOTO_MIME[file.type]) {
      toast.error('Csak JPG, PNG vagy WEBP formátum engedélyezett (a HEIC/HEIF nem).')
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      toast.error('A kép mérete nem lehet több, mint 2 MB.')
      return
    }
    setPhotoBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadProfilePhoto(fd)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setData((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl ?? null, avatarSource: res.avatarSource ?? null } : prev))
      toast.success('A profilkép feltöltése sikerült.')
      if (res.warning) toast.warning(res.warning, { duration: 12000 })
    } catch (e) {
      toast.error(`A profilkép feltöltése nem sikerült: ${hibaSzoveg(e)}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handlePhotoRemove() {
    if (!window.confirm('Eltávolítod a profilképet? A helyén a monogramod jelenik meg.')) return
    setPhotoBusy(true)
    try {
      const res = await removeProfilePhoto()
      if (res.error) {
        toast.error(res.error)
        return
      }
      setData((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl ?? null, avatarSource: res.avatarSource ?? null } : prev))
      toast.success('A profilkép eltávolítva.')
      if (res.warning) toast.warning(res.warning, { duration: 12000 })
    } catch (e) {
      toast.error(`A profilkép eltávolítása nem sikerült: ${hibaSzoveg(e)}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleGooglePhoto() {
    setPhotoBusy(true)
    try {
      const res = await applyGooglePhoto()
      if (res.error) {
        toast.error(res.error)
        return
      }
      setData((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl ?? null, avatarSource: res.avatarSource ?? null } : prev))
      toast.success('A Google-fiókod képe lett a profilképed.')
      if (res.warning) toast.warning(res.warning, { duration: 12000 })
    } catch (e) {
      toast.error(`A Google-fotó beállítása nem sikerült: ${hibaSzoveg(e)}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  // ── Szerepkör-váltás (a bal chip / ProfileSwitcher mintája) ───────────────
  function handleSwitch(profileRoleId: string) {
    if (!aktiv || profileRoleId === aktiv.id || switchPending) return
    setPendingRoleId(profileRoleId)
    // A sikeres váltás server-side redirect — a dialógus a layoutban él, ezért
    // MAGUNK zárjuk be, különben az új oldalon is nyitva maradna.
    onOpenChange(false)
    startSwitch(async () => {
      const result = await switchActiveProfileRole(profileRoleId)
      if (result && 'error' in result && result.error) {
        setPendingRoleId(null)
        toast.error(result.error)
      }
    })
  }

  // ── Mentés ─────────────────────────────────────────────────────────────────
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!data) return

    const payload: ProfileSaveInput = {
      fullName: form.fullName,
      phone: form.phone,
      birthDate: form.birthDate,
      displayTitle: form.displayTitle,
      address: form.address,
      emergencyPhone: form.emergencyPhone,
      serviceStartedAt: form.serviceStartedAt,
      previousRoles: form.previousRoles.split(',').map((s) => s.trim()).filter(Boolean),
      bio: form.bio,
      ministryNotes: form.ministryNotes,
      serviceHistory: slots.map((s) => ({
        hely: s.hely,
        szerep: s.szerep,
        evTol: s.ev_tol,
        evIg: s.ev_ig,
        megjegyzes: s.megjegyzes,
      })),
      expectedRevision: data.revision,
      betoltottAlap: { fullName: data.fullName, phone: data.phone, birthDate: data.birthDate },
    }

    // Kliens-oldali ELŐ-ellenőrzés UGYANAZZAL a sémával, amit a szerver számon
    // kér — a hiba a mező alatt jelenik meg, nem egy néma „semmi sem történt".
    const parsed = profileSaveSchema.safeParse(payload)
    if (!parsed.success) {
      const { fieldErrors: fe, elso } = zodHibakMezonkent(parsed.error)
      setFieldErrors(fe)
      toast.error(elso)
      return
    }
    const jovo = jovobeliDatumHibak(parsed.data, maiNapKulcs())
    if (Object.keys(jovo).length > 0) {
      setFieldErrors(jovo)
      toast.error(Object.values(jovo)[0])
      return
    }

    setSaving(true)
    setFieldErrors({})
    try {
      const result = await saveProfileDetails(parsed.data)
      if (result.error) {
        setFieldErrors(result.fieldErrors || {})
        toast.error(result.error)
        return
      }
      toast.success(result.success || 'A profil sikeresen frissült.')
      if (result.warning) toast.warning(result.warning, { duration: 12000 })
      if (result.data) alkalmazEredmeny(result.data)
    } catch (e) {
      // A beírt mezők MEGMARADNAK — a felhasználó a hiba után újra próbálhat.
      toast.error(`A mentés nem sikerült: ${hibaSzoveg(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const setField = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const kartotekaTag = data?.createdAt ? formatTimestampHu(data.createdAt) : ''
  const closeAndGo = () => onOpenChange(false)

  // Lánc-hibánál a hiányzó név NEM „nincs hozzárendelve" (az hamis tény lenne),
  // hanem „nem olvasható" — a ⚠️ sor mondja meg, miért.
  const nemOlvashato = '— (most nem olvasható)'
  const nincsGyulekezet = data?.lancHiba ? nemOlvashato : 'Gyülekezet nincs hozzárendelve'
  const nincsEgyhazmegye = data?.lancHiba ? nemOlvashato : 'Nincs hozzárendelve'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Profil</DialogTitle>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> A profil betöltése folyamatban van…
          </div>
        ) : !data ? (
          <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
            {loadError ? (
              <Figyelmeztetes>{loadError}</Figyelmeztetes>
            ) : (
              <p>A profil adatai nem érkeztek meg.</p>
            )}
            <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={() => setReloadKey((k) => k + 1)}>
              Újra
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── HERO ─────────────────────────────────────────────────────── */}
            <div className="card-raised relative overflow-hidden p-4 sm:p-6">
              <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-24 rounded-full bg-accent/15 blur-3xl" />
              <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  {/* Avatár + kép-műveletek */}
                  <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
                    <Avatar className="h-24 w-24 border-4 border-card shadow-md sm:h-28 sm:w-28">
                      <AvatarImage src={data.avatarUrl || undefined} alt={data.fullName || 'Profil'} />
                      <AvatarFallback
                        className="text-2xl font-bold"
                        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                      <label
                        className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted ${photoBusy ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                        {photoBusy ? 'Dolgozom…' : 'Kép feltöltése'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={photoBusy}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) void handlePhotoUpload(file)
                          }}
                        />
                      </label>
                      {data.avatarUrl && (
                        <Button type="button" variant="ghost" className="min-h-11 gap-1.5 text-xs" disabled={photoBusy} onClick={handlePhotoRemove}>
                          <ImageOff className="size-3.5" /> Eltávolítás
                        </Button>
                      )}
                      {data.googlePictureElerheto && data.avatarSource !== 'google' && (
                        <Button type="button" variant="ghost" className="min-h-11 text-xs" disabled={photoBusy} onClick={handleGooglePhoto}>
                          Google-fotó használata
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">{eyebrow}</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className="min-w-0 break-words font-heading text-2xl text-foreground sm:text-3xl" title={data.fullName || undefined}>
                        {data.fullName || 'Névtelen felhasználó'}
                      </h2>
                      {/* A jelvény = az AKTÍV szerep (nem a gépelt display_title). */}
                      <Badge variant="secondary" className="h-auto max-w-full whitespace-normal px-2.5 py-1 text-xs">
                        <ShieldCheck className="size-3" />
                        <span className="min-w-0 break-words">{aktivRoleLabel}</span>
                      </Badge>
                      {data.pastorProfile.displayTitle && (
                        <Badge
                          variant="outline"
                          className="h-auto max-w-full whitespace-normal px-2.5 py-1 text-xs font-normal"
                          title="Megjelenített szolgálati cím (a Szerkesztés fülön adható meg)"
                        >
                          <span className="min-w-0 break-words">{nagyKezdo(data.pastorProfile.displayTitle)}</span>
                        </Badge>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2 text-sm">
                      {aktiv ? (
                        <InfoPill
                          icon={<Church className="size-4" />}
                          label={aktiv.scopeName || getScopeLabel(aktiv.scope)}
                          title={data.congregationOfficialName || undefined}
                        />
                      ) : (
                        <InfoPill icon={<Church className="size-4" />} label={data.congregationName || nincsGyulekezet} />
                      )}
                      {aktiv && <InfoPill icon={<ShieldCheck className="size-4" />} label={getScopeLabel(aktiv.scope)} />}
                      {kartotekaTag && <InfoPill icon={<CalendarDays className="size-4" />} label={`Kartotéka-tag: ${kartotekaTag}`} />}
                    </div>

                    {/* ⚠️ eltérés-sorok — a rendszer nem hallgat el ellentmondást */}
                    {data.lancHiba && (
                      <Figyelmeztetes>
                        A gyülekezet és egyházmegye adatai most nem olvashatók: {data.lancHiba}. A megjelenített nevek a
                        fejléc gyorstárából jönnek (vagy hiányoznak), az egyházmegye-eltérés ellenőrzése nem futott le. Próbáld
                        újra később; ha marad, jelezd a rendszergazdának.
                      </Figyelmeztetes>
                    )}
                    {!data.profileRolesFeloldhato && (
                      <Figyelmeztetes>
                        A szerepköreid most nem olvashatók az adatbázisból — az itt látott adatok a nyilvántartott elsődleges
                        szerepből jönnek. Próbáld újra később; ha marad, jelezd a rendszergazdának.
                      </Figyelmeztetes>
                    )}
                    {data.dioceseElteres && (
                      <Figyelmeztetes>
                        A nyilvántartott egyházmegyéd ({data.dioceseNyilvantartott || 'ismeretlen'}) eltér a gyülekezetedétől
                        ({data.dioceseName || '—'}) — jelezd a rendszergazdának, a felület a gyülekezet láncát mutatja.
                      </Figyelmeztetes>
                    )}
                    {data.emailElteres && (
                      <Figyelmeztetes>
                        A nyilvántartott e-mail ({data.emailNyilvantartott}) eltér a bejelentkezésitől ({data.email}) — jelezd a
                        rendszergazdának.
                      </Figyelmeztetes>
                    )}
                    {data.nyilvantartottCongregationName && aktiv?.scope === 'congregation' && (
                      <Figyelmeztetes>
                        A nyilvántartott elsődleges gyülekezeted ({data.nyilvantartottCongregationName}) nem az, amelyikben most dolgozol.
                        A felület az aktív gyülekezetet mutatja.
                      </Figyelmeztetes>
                    )}
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[30rem] lg:shrink-0 xl:w-[34rem]">
                  <StatCard label="E-mail" value={data.email || 'Nincs rögzítve'} wrap="anywhere" />
                  <StatCard label="Telefon" value={data.phone || 'Nincs rögzítve'} />
                  <StatCard
                    label="Egyházmegye"
                    value={data.dioceseName || (aktiv?.scope === 'district' || aktiv?.scope === 'system' ? '—' : nincsEgyhazmegye)}
                    sub={data.districtName ? `Egyházkerület: ${data.districtName}` : undefined}
                  />
                  <StatCard
                    label="Aktív szolgálat"
                    value={aktiv ? aktivRoleLabel : data.profileRolesFeloldhato ? getRoleLabel(data.role) : '⚠️ nem olvasható'}
                    sub={
                      aktiv
                        ? `${getScopeLabel(aktiv.scope)} · ${aktiv.scopeName}${statusz.label !== 'Aktív' ? ` · ${statusz.ismeretlen ? '⚠️ ' : ''}${statusz.label}` : ''}`
                        : `Nyilvántartott szerep${statusz.label !== 'Aktív' ? ` · ${statusz.ismeretlen ? '⚠️ ' : ''}${statusz.label}` : ''}`
                    }
                  />
                </div>
              </div>
            </div>

            {!data.extensionReady && (
              <Figyelmeztetes>
                {data.extensionMessage ||
                  'A bővített lelkipásztori profil mezőihez még futtatni kell a mellékelt SQL-bővítést. Az alap profiladatok ettől függetlenül már most is menthetők.'}
              </Figyelmeztetes>
            )}

            {/* ── FÜLEK — mobilon egy sorban, görgethetően ─────────────────── */}
            <Tabs defaultValue="attekintes" className="w-full">
              <TabsList className="flex w-full snap-x justify-start gap-1 overflow-x-auto rounded-[1.4rem] border-border bg-muted/60 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger value="attekintes" className="min-h-10 shrink-0 snap-start px-3 text-sm">Áttekintés</TabsTrigger>
                <TabsTrigger value="szolgalat" className="min-h-10 shrink-0 snap-start px-3 text-sm">Szolgálat</TabsTrigger>
                <TabsTrigger value="szerkesztes" className="min-h-10 shrink-0 snap-start px-3 text-sm">Szerkesztés</TabsTrigger>
              </TabsList>

              {/* ── ÁTTEKINTÉS ────────────────────────────────────────────── */}
              <TabsContent value="attekintes" className="space-y-4 pt-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ProfileCard title="Személyes adatok" icon={<UserRound className="size-4" />}>
                    <ProfileRow label="Teljes név" value={data.fullName || 'Nincs rögzítve'} />
                    <ProfileRow label="Születési dátum" value={formatDateOnlyHu(data.birthDate) || 'Nincs rögzítve'} />
                    <ProfileRow label="E-mail (bejelentkezési)" value={data.email || 'Nincs rögzítve'} wrap="anywhere" />
                    <ProfileRow label="Telefon" value={data.phone || 'Nincs rögzítve'} />
                  </ProfileCard>

                  <ProfileCard title="Elérhetőségek és szolgálat" icon={<Sparkles className="size-4" />}>
                    <ProfileRow label="Cím / lakhely" value={data.pastorProfile.address || 'Nincs rögzítve'} />
                    <ProfileRow label="Sürgősségi telefon" value={data.pastorProfile.emergencyPhone || 'Nincs rögzítve'} />
                    <ProfileRow
                      label="Gyülekezet"
                      value={data.congregationName || (aktiv && aktiv.scope !== 'congregation' ? `— (${getScopeLabel(aktiv.scope)}: ${aktiv.scopeName})` : nincsGyulekezet)}
                      title={data.congregationOfficialName || undefined}
                    />
                    <ProfileRow label="Egyházmegye" value={data.dioceseName || nincsEgyhazmegye} />
                    <ProfileRow label="Egyházkerület" value={data.districtName || (data.lancHiba ? nemOlvashato : 'Nincs hozzárendelve')} />
                    <ProfileRow label="Nyilvántartott elsődleges szerep" value={getRoleLabel(data.role)} small />
                  </ProfileCard>
                </div>

                <ProfileCard title="Bemutatkozás" icon={<Mail className="size-4" />}>
                  <p className="break-words text-sm leading-7 text-foreground/90">
                    {data.pastorProfile.bio || 'Még nincs bemutatkozás rögzítve ehhez a profilhoz.'}
                  </p>
                </ProfileCard>

                {data.profileRoles.length > 0 && (
                  <ProfileCard title="Szerepköreim az egyházi nyilvántartó rendszerben" icon={<ShieldCheck className="size-4" />}>
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                      Az alábbi szerepkörök aktívak a fiókodhoz.
                      {data.profileRoles.length > 1
                        ? ' A bal felső gyülekezet-gombbal vagy az alábbi sorra kattintva válthatsz közöttük.'
                        : ''}
                    </p>
                    <div className="space-y-2">
                      {data.profileRoles.map((r) => {
                        const Icon = SCOPE_ICONS[r.scope] || Church
                        const label = getRoleLabel(r.role, r.customLabel)
                        const tone = SCOPE_TONE[r.scope] || SCOPE_TONE.congregation
                        const datumFelirat = r.orokolt
                          ? 'a fiókkal együtt kapott (örökölt) szerepkör'
                          : r.approvedBy && r.approvedAt
                            ? `jóváhagyva: ${formatTimestampHu(r.approvedAt)}`
                            : `kiosztva: ${formatTimestampHu(r.grantedAt)}`
                        const kattinthato = data.profileRoles.length > 1 && !r.aktiv
                        const inner = (
                          <>
                            <div className={`shrink-0 rounded-lg border px-2 py-1.5 ${tone}`}>
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-semibold text-foreground" title={label}>
                                {label}
                              </p>
                              <p className="break-words text-xs text-muted-foreground" title={r.scopeName}>
                                {getScopeLabel(r.scope)} · {r.scopeName}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground/80">{datumFelirat}</p>
                            </div>
                            {r.aktiv ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                <Check className="size-3" /> aktív
                              </span>
                            ) : pendingRoleId === r.id ? (
                              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                            ) : null}
                          </>
                        )
                        return kattinthato ? (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleSwitch(r.id)}
                            disabled={switchPending}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:bg-muted/60 disabled:opacity-60"
                          >
                            {inner}
                          </button>
                        ) : (
                          <div
                            key={r.id}
                            className={`flex min-h-11 items-center gap-3 rounded-xl border p-3 ${r.aktiv ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}
                          >
                            {inner}
                          </div>
                        )
                      })}
                    </div>
                  </ProfileCard>
                )}

                <ProfilLinksor isLelkesz={isLelkesz} onNavigate={closeAndGo} />
              </TabsContent>

              {/* ── SZOLGÁLAT ─────────────────────────────────────────────── */}
              <TabsContent value="szolgalat" className="space-y-4 pt-4">
                <ProfileCard title="Szolgálati hely — automatikus napló" icon={<MapPin className="size-4" />}>
                  <div className="space-y-2">
                    {/* A kézzel megadott szolgálat-kezdet — külön sor, a naplótól függetlenül. */}
                    <ProfileRow
                      label="Szolgálat kezdete"
                      value={formatDateOnlyHu(data.pastorProfile.serviceStartedAt) || 'Nincs rögzítve — a Szerkesztés fülön adhatod meg.'}
                    />
                    {data.helyNaplo.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">
                        A rendszer még nem naplózott áthelyezést. Áthelyezéskor automatikusan ír egy sort és értesítést küld.
                      </p>
                    ) : (
                      data.helyNaplo.map((n, i) => {
                        // D4: a 'kezdeti' sor a NAPLÓ INDULÁSA (a migráció napja), nem a
                        // szolgálat kezdete; az első hozzárendelés nem „áthelyezés".
                        let cim: string
                        let felirat: string
                        if (n.jelleg === 'kezdeti') {
                          cim = n.congregationNev || '—'
                          felirat = `A napló indulása: ${formatTimestampHu(n.createdAt)}`
                        } else if (n.congregationNev && !n.elozoCongregationNev) {
                          cim = n.congregationNev
                          felirat = `Első hozzárendelés: ${formatTimestampHu(n.createdAt)}`
                        } else if (n.congregationNev) {
                          cim = `${n.elozoCongregationNev} → ${n.congregationNev}`
                          felirat = `Áthelyezés: ${formatTimestampHu(n.createdAt)}`
                        } else {
                          cim = `${n.elozoCongregationNev || '—'} → hozzárendelés megszűnt`
                          felirat = `Megszűnt: ${formatTimestampHu(n.createdAt)}`
                        }
                        return (
                          <div key={n.id} className="min-w-0 rounded-[1rem] border border-border bg-muted/50 px-4 py-3">
                            <p className="break-words text-sm font-semibold text-foreground">
                              {cim}
                              {i === 0 && n.congregationNev && (
                                <span className="ml-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">jelenlegi</span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{felirat}</p>
                          </div>
                        )
                      })
                    )}
                    <p className="px-1 text-[11px] text-muted-foreground/80">
                      A naplót a rendszer írja áthelyezéskor; a korábbi, kézzel vezetett előzményeket alább rögzítheted.
                    </p>
                  </div>
                </ProfileCard>

                <div className="grid gap-4 lg:grid-cols-2">
                  <ProfileCard title="Szolgálati megjegyzések" icon={<Church className="size-4" />}>
                    <ProfileRow label="Szolgálati megjegyzések" value={data.pastorProfile.ministryNotes || 'Nincs rögzítve'} multiline />
                  </ProfileCard>

                  <ProfileCard title="Korábbi helyek és szerepek" icon={<MapPin className="size-4" />}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Korábbi szolgálati helyek</p>
                    {data.serviceHistory.length === 0 && legacyHelyek.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Még nincs rögzítve szolgálati előzmény — a Szerkesztés fülön veheted fel.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.serviceHistory.map((sh) => (
                          <div key={sh.id} className="min-w-0 rounded-[1rem] border border-border bg-muted/50 px-4 py-3">
                            <p className="break-words text-sm font-semibold text-foreground">{sh.hely}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[sh.szerep, sh.evTol != null ? `${sh.evTol}–${sh.evIg ?? 'jelenleg'}` : null].filter(Boolean).join(' · ') || '—'}
                            </p>
                            {sh.megjegyzes && <p className="mt-1 break-words text-xs text-muted-foreground">{sh.megjegyzes}</p>}
                          </div>
                        ))}
                        {legacyHelyek.length > 0 && (
                          <div className="min-w-0 rounded-[1rem] border border-dashed border-border px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Régi (szöveges) bejegyzés</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {legacyHelyek.map((item) => (
                                <span key={item} className="max-w-full break-words rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                                  {item}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground/80">
                              Ezeket a régi szöveges mezőből olvassuk; ha felveszed őket a Szerkesztés fülön, innen eltűnnek.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-4" />
                    <TagGroup title="Korábbi szerepkörök" items={data.pastorProfile.previousRoles} emptyText="Még nincs rögzítve szerepkör-előzmény." />
                  </ProfileCard>
                </div>
              </TabsContent>

              {/* ── SZERKESZTÉS ───────────────────────────────────────────── */}
              <TabsContent value="szerkesztes" className="pt-4">
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ProfileCard title="Alapadatok" icon={<UserRound className="size-4" />}>
                      <FormField label="Teljes név" hint="Magyar sorrendben: vezetéknév, keresztnév (pl. Kovács János)." error={fieldErrors.fullName}>
                        <Input value={form.fullName} onChange={setField('fullName')} required aria-invalid={Boolean(fieldErrors.fullName)} />
                      </FormField>
                      <FormField label="Telefon" error={fieldErrors.phone}>
                        <Input value={form.phone} onChange={setField('phone')} inputMode="tel" placeholder="pl. +40 7xx xxx xxx" aria-invalid={Boolean(fieldErrors.phone)} />
                      </FormField>
                      <FormField label="Születési dátum" error={fieldErrors.birthDate}>
                        <Input type="date" value={form.birthDate} onChange={setField('birthDate')} max={maiNapKulcs()} aria-invalid={Boolean(fieldErrors.birthDate)} />
                      </FormField>
                      <FormField label="Megjelenített szolgálati cím (opcionális)" hint="Kis címke a neved mellett; a szerepkörödet nem ez adja." error={fieldErrors.displayTitle}>
                        <Input value={form.displayTitle} onChange={setField('displayTitle')} placeholder="pl. lelkipásztor, esperes" aria-invalid={Boolean(fieldErrors.displayTitle)} />
                      </FormField>
                    </ProfileCard>

                    <ProfileCard title="Kapcsolat és szolgálat" icon={<Phone className="size-4" />}>
                      <FormField label="Lakhely / cím" error={fieldErrors.address}>
                        <Input value={form.address} onChange={setField('address')} aria-invalid={Boolean(fieldErrors.address)} />
                      </FormField>
                      <FormField label="Sürgősségi telefonszám" hint="Egy MÁSIK elérhető személy száma — nem a sajátod." error={fieldErrors.emergencyPhone}>
                        <Input value={form.emergencyPhone} onChange={setField('emergencyPhone')} inputMode="tel" aria-invalid={Boolean(fieldErrors.emergencyPhone)} />
                      </FormField>
                      <FormField label="Szolgálat kezdete" error={fieldErrors.serviceStartedAt}>
                        <Input type="date" value={form.serviceStartedAt} onChange={setField('serviceStartedAt')} max={maiNapKulcs()} aria-invalid={Boolean(fieldErrors.serviceStartedAt)} />
                      </FormField>
                      <FormField label="Korábbi szerepkörök" hint="Vesszővel elválasztva (pl. segédlelkész, missziói előadó)." error={fieldErrors.previousRoles}>
                        <Input value={form.previousRoles} onChange={setField('previousRoles')} placeholder="pl. segédlelkész, missziói előadó" aria-invalid={Boolean(fieldErrors.previousRoles)} />
                      </FormField>
                    </ProfileCard>
                  </div>

                  <ProfileCard title="Korábbi szolgálati helyek" icon={<MapPin className="size-4" />}>
                    <ServiceHistoryEditor items={slots} onChange={setSlots} errors={fieldErrors} disabled={saving} />
                  </ProfileCard>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ProfileCard title="Bemutatkozás" icon={<Sparkles className="size-4" />}>
                      <Textarea value={form.bio} onChange={setField('bio')} rows={5} placeholder="Rövid bemutatkozás, szolgálati fókusz, fontos tudnivalók…" aria-invalid={Boolean(fieldErrors.bio)} />
                      {fieldErrors.bio && <p className="text-xs text-destructive">{fieldErrors.bio}</p>}
                    </ProfileCard>
                    <ProfileCard title="Szolgálati megjegyzések" icon={<Church className="size-4" />}>
                      <Textarea value={form.ministryNotes} onChange={setField('ministryNotes')} rows={5} placeholder="Szolgálati hangsúlyok, fontos emlékeztetők…" aria-invalid={Boolean(fieldErrors.ministryNotes)} />
                      {fieldErrors.ministryNotes && <p className="text-xs text-destructive">{fieldErrors.ministryNotes}</p>}
                    </ProfileCard>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
                      Bezárás
                    </Button>
                    <Button type="submit" className="min-h-11" disabled={saving || photoBusy}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                      {saving ? 'Mentés…' : 'Mentés'}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Építőelemek — CSAK téma-tokenek ─────────────────────────────────────────

function Figyelmeztetes({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function InfoPill({ icon, label, title }: { icon: React.ReactNode; label: string; title?: string }) {
  // `rounded-xl` + `max-w-full min-w-0` + belső `break-words`: a hosszú
  // gyülekezetnév szó-határon törik, nem lesz többsoros lekerekített tömb.
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
      title={title}
    >
      <span className="shrink-0 text-primary">{icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </span>
  )
}

function StatCard({ label, value, sub, wrap = 'words' }: { label: string; value: string; sub?: string; wrap?: 'words' | 'anywhere' }) {
  // `break-words` (overflow-wrap: break-word) + `min-w-0`: a szóközös nevek
  // szóhatáron törnek. Az `overflow-wrap: anywhere` CSAK az e-mailnek — ott a
  // @ előtti hosszú felhasználónév törhetetlen.
  return (
    <div className="min-w-0 rounded-[1.3rem] border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className={`mt-2 min-w-0 break-words text-sm font-semibold text-foreground ${wrap === 'anywhere' ? '[overflow-wrap:anywhere]' : ''}`} title={value}>
        {value}
      </p>
      {sub && <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ProfileCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-raised min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
        <span className="min-w-0 break-words">{title}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ProfileRow({
  label,
  value,
  multiline = false,
  wrap = 'words',
  title,
  small = false,
}: {
  label: string
  value: string
  multiline?: boolean
  wrap?: 'words' | 'anywhere'
  title?: string
  small?: boolean
}) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-border bg-muted/50 px-4 py-3" title={title}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 min-w-0 break-words ${small ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'} ${wrap === 'anywhere' ? '[overflow-wrap:anywhere]' : ''} ${multiline ? 'whitespace-pre-wrap leading-6' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function TagGroup({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="max-w-full break-words rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

/** D10: átjárás a /profile oldal részei felé — a két felület nem sziget. */
function ProfilLinksor({ isLelkesz, onNavigate }: { isLelkesz: boolean; onNavigate: () => void }) {
  const linkClass =
    'inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-primary underline-offset-4 transition hover:bg-muted hover:underline'
  return (
    <nav aria-label="További profil-beállítások" className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border pt-3 text-sm">
      <Link href="/profile/biztonsag" className={linkClass} onClick={onNavigate}>Biztonság</Link>
      <span className="text-muted-foreground">·</span>
      <Link href="/profile/adatvedelem" className={linkClass} onClick={onNavigate}>Adatvédelem</Link>
      {isLelkesz && (
        <>
          <span className="text-muted-foreground">·</span>
          <Link href="/profile/kapcsolatok" className={linkClass} onClick={onNavigate}>Kapcsolatok</Link>
        </>
      )}
      <span className="text-muted-foreground">·</span>
      <Link href="/profile" className={linkClass} onClick={onNavigate}>Kezdőfelület</Link>
    </nav>
  )
}
