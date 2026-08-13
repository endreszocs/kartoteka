'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, CalendarDays, Camera, Church, Globe, Landmark, Mail, MapPin, Phone, ShieldCheck, Sparkles, UserRound } from 'lucide-react'

import { getProfileDialogData, saveProfileDetails } from '@/app/(dashboard)/profile/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types/auth'
import { toast } from 'sonner'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
}

interface ProfileDialogData {
  id: string
  email: string | null
  fullName: string | null
  phone: string | null
  birthDate: string | null
  role: string | null
  status: string
  createdAt: string | null
  congregationName: string | null
  dioceseName: string | null
  districtName: string | null
  avatarUrl: string | null
  extensionReady: boolean
  extensionMessage: string | null
  pastorProfile: {
    displayTitle: string
    address: string
    emergencyPhone: string
    serviceStartedAt: string
    previousServicePlaces: string[]
    previousRoles: string[]
    bio: string
    ministryNotes: string
  }
  /** Multi-role szerepkörök — hierarchia szerint rendezve (2026-04-18) */
  profileRoles?: Array<{
    id: string
    scope: 'system' | 'district' | 'diocese' | 'congregation'
    scopeId: string | null
    scopeName: string
    role: string
    customLabel: string | null
    grantedAt: string
    approvedAt: string | null
  }>
}

const PROFILE_ROLE_LABELS: Record<string, string> = {
  admin: 'Rendszergazda',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  esperes: 'Esperes',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  lelkesz: 'Lelkipásztor',
  konyvelo: 'Könyvelő',
  custom: 'Egyedi szerep',
}

const SCOPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

const SCOPE_COLORS: Record<string, string> = {
  system: 'bg-rose-50 text-rose-700 border-rose-200',
  district: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  diocese: 'bg-violet-50 text-violet-700 border-violet-200',
  congregation: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function getPrimaryRoleLabel(role: string | null | undefined) {
  if (!role) return 'Nincs hozzárendelt szerepkör'
  return PROFILE_ROLE_LABELS[role] || role
}

export function ProfileDialog({ open, onOpenChange, profile }: ProfileDialogProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [data, setData] = useState<ProfileDialogData | null>(null)
  const [form, setForm] = useState({
    fullName: profile.full_name || '',
    phone: profile.phone || '',
    birthDate: profile.birth_date || '',
    photoUrl: '',
    displayTitle: '',
    address: '',
    emergencyPhone: '',
    serviceStartedAt: '',
    previousServicePlaces: '',
    previousRoles: '',
    bio: '',
    ministryNotes: '',
  })

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)

    queueMicrotask(() => {
      void (async () => {
        const result = await getProfileDialogData()
        if (cancelled) return

        if ('error' in result && result.error) {
          toast.error(result.error)
          setLoading(false)
          return
        }

        if (!('data' in result) || !result.data) {
          toast.error('A profil adatai nem érkeztek meg.')
          setLoading(false)
          return
        }

        const nextData = result.data
        setData(nextData)
        setForm({
          fullName: nextData.fullName || '',
          phone: nextData.phone || '',
          birthDate: nextData.birthDate || '',
          photoUrl: nextData.avatarUrl || '',
          displayTitle: nextData.pastorProfile.displayTitle || '',
          address: nextData.pastorProfile.address || '',
          emergencyPhone: nextData.pastorProfile.emergencyPhone || '',
          serviceStartedAt: nextData.pastorProfile.serviceStartedAt || '',
          previousServicePlaces: nextData.pastorProfile.previousServicePlaces.join(', '),
          previousRoles: nextData.pastorProfile.previousRoles.join(', '),
          bio: nextData.pastorProfile.bio || '',
          ministryNotes: nextData.pastorProfile.ministryNotes || '',
        })
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
    }
  }, [open])

  const initials = useMemo(() => {
    const source = data?.fullName || profile.full_name || profile.email || 'Lelkipásztor'
    return source
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [data?.fullName, profile.full_name, profile.email])
  const primaryRoleLabel = getPrimaryRoleLabel(data?.role)

  async function handlePhotoUpload(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `profiles/${profile.id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
      if (error) throw error

      const { data: publicUrl } = supabase.storage.from('logos').getPublicUrl(path)
      if (!publicUrl?.publicUrl) throw new Error('A feltöltött kép nyilvános URL-je nem hozható létre.')

      setForm(prev => ({ ...prev, photoUrl: publicUrl.publicUrl }))
      setData(prev => (prev ? { ...prev, avatarUrl: publicUrl.publicUrl } : prev))
      toast.success('A profilkép feltöltése sikerült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A profilkép feltöltése sikertelen.')
    }
    setUploading(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)

    const result = await saveProfileDetails({
      fullName: form.fullName,
      phone: form.phone,
      birthDate: form.birthDate || undefined,
      photoUrl: form.photoUrl || undefined,
      displayTitle: form.displayTitle,
      address: form.address,
      emergencyPhone: form.emergencyPhone,
      serviceStartedAt: form.serviceStartedAt || undefined,
      previousServicePlaces: form.previousServicePlaces.split(',').map(item => item.trim()).filter(Boolean),
      previousRoles: form.previousRoles.split(',').map(item => item.trim()).filter(Boolean),
      bio: form.bio,
      ministryNotes: form.ministryNotes,
    })

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    toast.success(result.success)
    if ('data' in result && result.data) {
      const nextData = result.data
      setData(nextData)
      setForm({
        fullName: nextData.fullName || '',
        phone: nextData.phone || '',
        birthDate: nextData.birthDate || '',
        photoUrl: nextData.avatarUrl || '',
        displayTitle: nextData.pastorProfile.displayTitle || '',
        address: nextData.pastorProfile.address || '',
        emergencyPhone: nextData.pastorProfile.emergencyPhone || '',
        serviceStartedAt: nextData.pastorProfile.serviceStartedAt || '',
        previousServicePlaces: nextData.pastorProfile.previousServicePlaces.join(', '),
        previousRoles: nextData.pastorProfile.previousRoles.join(', '),
        bio: nextData.pastorProfile.bio || '',
        ministryNotes: nextData.pastorProfile.ministryNotes || '',
      })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Profil</DialogTitle>
        </DialogHeader>

        {loading && !data ? (
          <div className="py-10 text-center text-sm text-muted-foreground">A profil betöltése folyamatban van...</div>
        ) : (
          <div className="space-y-5">
            <div className="card-raised relative overflow-hidden p-5 sm:p-6">
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/30 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/25 blur-3xl" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Avatar className="h-28 w-28 border-4 border-white/80 shadow-[0_24px_45px_-28px_rgba(15,23,42,0.35)]">
                      <AvatarImage src={data?.avatarUrl || undefined} alt={data?.fullName || 'Profil'} />
                      <AvatarFallback className="bg-gradient-to-br from-teal-500 via-cyan-500 to-amber-400 text-2xl font-bold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <label className="absolute bottom-1 right-1 flex cursor-pointer items-center gap-1 rounded-full border border-white/80 bg-white/92 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white">
                      <Camera className="size-3.5" />
                      {uploading ? 'Feltöltés...' : 'Kép'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={event => {
                          const file = event.target.files?.[0]
                          if (file) void handlePhotoUpload(file)
                        }}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Lelkipásztori profil</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-heading text-3xl text-slate-800">{data?.fullName || 'Lelkipásztor'}</h2>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        {data?.pastorProfile.displayTitle || primaryRoleLabel || 'Szolgálattevő'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                      <InfoPill icon={<Church className="size-4" />} label={data?.congregationName || 'Gyülekezet nincs hozzárendelve'} />
                      <InfoPill icon={<ShieldCheck className="size-4" />} label={primaryRoleLabel} />
                      <InfoPill icon={<CalendarDays className="size-4" />} label={data?.createdAt ? `Kartotéka tag ${new Date(data.createdAt).toLocaleDateString('hu-HU')}` : 'Kartotéka profil'} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
                  <StatCard label="E-mail" value={data?.email || 'Nincs rögzítve'} />
                  <StatCard label="Telefon" value={data?.phone || 'Nincs rögzítve'} />
                  <StatCard label="Egyházmegye" value={data?.dioceseName || 'Nincs hozzárendelve'} />
                  <StatCard label="Státusz" value={data?.status === 'active' ? 'Aktív' : 'Várakozik'} />
                </div>
              </div>
            </div>

            {!data?.extensionReady && (
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-800">
                {data?.extensionMessage || 'A bővített lelkipásztori profil mezőihez még futtatni kell a mellékelt SQL-bővítést. Az alap profiladatok ettől függetlenül már most is menthetők.'}
              </div>
            )}

            <Tabs defaultValue="attekintes" className="w-full">
              <TabsList className="grid w-full grid-cols-1 gap-2 rounded-[1.4rem] bg-slate-50 p-2 sm:grid-cols-3">
                <TabsTrigger value="attekintes">Áttekintés</TabsTrigger>
                <TabsTrigger value="szolgalat">Szolgálati háttér</TabsTrigger>
                <TabsTrigger value="szerkesztes">Szerkesztés</TabsTrigger>
              </TabsList>

              <TabsContent value="attekintes" className="space-y-4 pt-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ProfileCard title="Személyes adatok" icon={<UserRound className="size-4" />}>
                    <ProfileRow label="Teljes név" value={data?.fullName || 'Nincs rögzítve'} />
                    <ProfileRow label="Születési dátum" value={data?.birthDate ? new Date(data.birthDate).toLocaleDateString('hu-HU') : 'Nincs rögzítve'} />
                    <ProfileRow label="E-mail" value={data?.email || 'Nincs rögzítve'} />
                    <ProfileRow label="Telefon" value={data?.phone || 'Nincs rögzítve'} />
                  </ProfileCard>

                  <ProfileCard title="Elérhetőségek és szolgálat" icon={<Sparkles className="size-4" />}>
                    <ProfileRow label="Cím / lakhely" value={data?.pastorProfile.address || 'Nincs rögzítve'} />
                    <ProfileRow label="Sürgősségi telefon" value={data?.pastorProfile.emergencyPhone || 'Nincs rögzítve'} />
                    <ProfileRow label="Gyülekezet" value={data?.congregationName || 'Nincs hozzárendelve'} />
                    <ProfileRow label="Egyházmegye" value={data?.dioceseName || 'Nincs hozzárendelve'} />
                  </ProfileCard>
                </div>

                <ProfileCard title="Bemutatkozás" icon={<Mail className="size-4" />}>
                  <p className="text-sm leading-7 text-slate-600">
                    {data?.pastorProfile.bio || 'Még nincs bemutatkozás rögzítve ehhez a profilhoz.'}
                  </p>
                </ProfileCard>

                {/* Multi-role szerepkörök — hierarchia szerint (2026-04-18) */}
                {data?.profileRoles && data.profileRoles.length > 0 && (
                  <ProfileCard title="Szerepköreim az egyházi nyilvántartó rendszerben" icon={<ShieldCheck className="size-4" />}>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">
                      Az alábbi szerepkörök aktívak a fiókodhoz. A fejléc avatar-jára kattintva
                      válthatsz közöttük.
                    </p>
                    <div className="space-y-2">
                      {data.profileRoles.map((r) => {
                        const Icon = SCOPE_ICONS[r.scope] || Church
                        const label = r.role === 'custom' ? r.customLabel || 'Egyedi szerep' : PROFILE_ROLE_LABELS[r.role] || r.role
                        const chipColor = SCOPE_COLORS[r.scope] || SCOPE_COLORS.congregation
                        return (
                          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/60 p-3">
                            <div className={`rounded-lg border px-2 py-1.5 ${chipColor}`}>
                              <Icon className="size-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{label}</p>
                              <p className="text-xs text-slate-500 truncate">{r.scopeName}</p>
                            </div>
                            {r.approvedAt && (
                              <span className="text-[10px] text-slate-400">
                                {new Date(r.approvedAt).toLocaleDateString('hu-HU')} óta
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </ProfileCard>
                )}
              </TabsContent>

              <TabsContent value="szolgalat" className="space-y-4 pt-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ProfileCard title="Szolgálati idő és megjegyzések" icon={<Church className="size-4" />}>
                    <ProfileRow label="Szolgálat kezdete" value={data?.pastorProfile.serviceStartedAt ? new Date(data.pastorProfile.serviceStartedAt).toLocaleDateString('hu-HU') : 'Nincs rögzítve'} />
                    <ProfileRow label="Szolgálati megjegyzések" value={data?.pastorProfile.ministryNotes || 'Nincs rögzítve'} multiline />
                  </ProfileCard>

                  <ProfileCard title="Korábbi helyek és szerepek" icon={<MapPin className="size-4" />}>
                    <TagGroup title="Korábbi szolgálati helyek" items={data?.pastorProfile.previousServicePlaces || []} emptyText="Még nincs rögzítve szolgálati előzmény." />
                    <div className="mt-4" />
                    <TagGroup title="Korábbi szerepkörök" items={data?.pastorProfile.previousRoles || []} emptyText="Még nincs rögzítve szerepkör-előzmény." />
                  </ProfileCard>
                </div>
              </TabsContent>

              <TabsContent value="szerkesztes" className="pt-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ProfileCard title="Alapadatok" icon={<UserRound className="size-4" />}>
                      <FormField label="Teljes név">
                        <Input value={form.fullName} onChange={event => setForm(prev => ({ ...prev, fullName: event.target.value }))} required />
                      </FormField>
                      <FormField label="Telefon">
                        <Input value={form.phone} onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))} />
                      </FormField>
                      <FormField label="Születési dátum">
                        <Input type="date" value={form.birthDate} onChange={event => setForm(prev => ({ ...prev, birthDate: event.target.value }))} />
                      </FormField>
                      <FormField label="Megjelenített szolgálati cím">
                        <Input value={form.displayTitle} onChange={event => setForm(prev => ({ ...prev, displayTitle: event.target.value }))} placeholder="pl. lelkipásztor, esperes" />
                      </FormField>
                    </ProfileCard>

                    <ProfileCard title="Kapcsolat és előzmények" icon={<Phone className="size-4" />}>
                      <FormField label="Lakhely / cím">
                        <Input value={form.address} onChange={event => setForm(prev => ({ ...prev, address: event.target.value }))} />
                      </FormField>
                      <FormField label="Sürgősségi telefonszám">
                        <Input value={form.emergencyPhone} onChange={event => setForm(prev => ({ ...prev, emergencyPhone: event.target.value }))} />
                      </FormField>
                      <FormField label="Szolgálat kezdete">
                        <Input type="date" value={form.serviceStartedAt} onChange={event => setForm(prev => ({ ...prev, serviceStartedAt: event.target.value }))} />
                      </FormField>
                      <FormField label="Korábbi szolgálati helyek">
                        <Input value={form.previousServicePlaces} onChange={event => setForm(prev => ({ ...prev, previousServicePlaces: event.target.value }))} placeholder="pl. Kolozsvár, Szék" />
                      </FormField>
                      <FormField label="Korábbi szerepkörök">
                        <Input value={form.previousRoles} onChange={event => setForm(prev => ({ ...prev, previousRoles: event.target.value }))} placeholder="pl. segédlelkész, missziói előadó" />
                      </FormField>
                    </ProfileCard>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ProfileCard title="Bemutatkozás" icon={<Sparkles className="size-4" />}>
                      <Textarea value={form.bio} onChange={event => setForm(prev => ({ ...prev, bio: event.target.value }))} rows={5} placeholder="Rövid bemutatkozás, szolgálati fókusz, fontos tudnivalók..." />
                    </ProfileCard>
                    <ProfileCard title="Szolgálati megjegyzések" icon={<Church className="size-4" />}>
                      <Textarea value={form.ministryNotes} onChange={event => setForm(prev => ({ ...prev, ministryNotes: event.target.value }))} rows={5} placeholder="Korábbi gyülekezetek, szolgálati hangsúlyok, fontos emlékeztetők..." />
                    </ProfileCard>
                  </div>

                  <div className="flex justify-end gap-2 border-t pt-3">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                      Bezárás
                    </Button>
                    <Button type="submit" disabled={loading || uploading}>
                      {loading ? 'Mentés...' : 'Mentés'}
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

function InfoPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
      <span className="text-teal-600">{icon}</span>
      {label}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-white/80 bg-white/86 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.22)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}

function ProfileCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-raised p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="flex size-8 items-center justify-center rounded-full bg-teal-50 text-teal-600">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ProfileRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-[1rem] bg-slate-50/90 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm text-slate-700 ${multiline ? 'whitespace-pre-wrap leading-6' : ''}`}>{value}</p>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function TagGroup({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map(item => (
            <span key={item} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  )
}
