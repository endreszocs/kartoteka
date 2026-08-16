import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Handshake, Mail, Phone, Shield, User , ShieldCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DefaultDashboardSelector } from '@/components/profile/default-dashboard-selector'
// 2026-08-11: lelkészi (privát) naptár-feed — a gyülekezet évfordulói a saját naptárban.
import { PastoralCalendarCard } from '@/components/profile/pastoral-calendar-card'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export const metadata = {
  title: 'Profilom · Kartotéka',
  description: 'Felhasználói profil és gyülekezeti kapcsolatok áttekintése.',
}

function roleLabel(role: string): string {
  switch (role) {
    case 'lelkesz':
      return 'Lelkipásztor'
    case 'esperes':
      return 'Esperes'
    case 'egyhazmegyei_admin':
      return 'Egyházmegyei admin'
    case 'egyhazkeruleti_admin':
      return 'Egyházkerületi admin'
    case 'egyhazkeruleti_szamvevo':
      return 'Egyházkerületi számvevő'
    case 'admin':
      return 'Rendszergazda'
    case 'konyvelo':
      return 'Könyvelő'
    case 'egyhazmegyei_szamvevo':
      return 'Egyházmegyei számvevő'
    default:
      return role
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'lelkesz':
      return 'bg-teal-100 text-teal-800'
    case 'esperes':
    case 'egyhazmegyei_admin':
      return 'bg-violet-100 text-violet-800'
    case 'egyhazkeruleti_admin':
    case 'admin':
      return 'bg-indigo-100 text-indigo-800'
    case 'konyvelo':
    case 'egyhazmegyei_szamvevo':
    case 'egyhazkeruleti_szamvevo':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export default async function ProfilePage() {
  const access = await getEffectiveAccessContext()

  if (!access.user || !access.profile) redirect('/login')

  const { profile, role, konyvelo, szamvevo, assignedCongregations } = access
  const isReviewer = konyvelo || szamvevo

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="card-raised relative mb-6 overflow-hidden p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-teal-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
              Profilom
            </p>
            <h1 className="mt-2 font-heading text-3xl text-slate-800 sm:text-4xl">
              {profile.full_name || 'Névtelen felhasználó'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{profile.email || '—'}</p>
          </div>
          <Badge className={`${roleColor(role)} px-3 py-1 text-sm`}>
            <Shield className="mr-1 size-3.5" />
            {roleLabel(role)}
          </Badge>
        </div>
      </div>

      {/* Alapadatok */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kapcsolat</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Mail className="size-4 text-slate-400" />
                <span>{profile.email || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Phone className="size-4 text-slate-400" />
                <span>{profile.phone || 'Nincs megadva'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Szerepkör és hatókör</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User className="size-4 text-slate-400" />
                <span>{roleLabel(role)}</span>
              </div>
              {access.congregationName && (
                <p className="text-sm text-slate-600">
                  Elsődleges gyülekezet:{' '}
                  <span className="font-medium text-slate-800">{access.congregationName}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alapértelmezett kezdőfelület — multi-role felhasználóknak hasznos */}
      <div className="mt-6">
        <DefaultDashboardSelector
          hasEsperes={!!access.esperes}
          hasKeruletiAdmin={!!access.egyhazkeruletiAdmin}
          hasAdmin={!!access.admin || !!access.master}
        />
      </div>

      {/* Lelkészi (privát) naptár — 2026-08-11.
          Csak ott mutatjuk, ahol van értelme: gyülekezeti hatókörben. Az
          esperesi/kerületi/admin munkatér nem egyetlen gyülekezethez kötött,
          ott a feed amúgy is fail-closed módon megtagadná a kiszolgálást. */}
      {access.effectiveCongregationId && (
        <div className="mt-6">
          <PastoralCalendarCard />
        </div>
      )}

      {/* Lelkészi kérések — csak lelkésznek */}
      {/* 2026-08-15 (8. pont): kétlépcsős belépés — minden szerepkörnek. */}
      <Card className="mt-6 border-emerald-200 bg-emerald-50/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-800">Biztonság — kétlépcsős belépés</p>
            <p className="mt-1 text-xs text-slate-600">
              Önkéntes második zár a fiókodon: belépéskor a telefonod hitelesítő appjának 6 jegyű
              kódja is kell. Mentőkódokkal, hogy elveszett telefonnal se zárd ki magad.
            </p>
          </div>
          <Link
            href="/profile/biztonsag"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <ShieldCheck className="size-4" />
            Biztonság kezelése
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {role === 'lelkesz' && (
        <Card className="mt-6 border-teal-200 bg-teal-50/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Hozzáférési kérések</p>
              <p className="mt-1 text-xs text-slate-600">
                A gyülekezet adataihoz kizárólag a Te engedélyeddel férhet hozzá könyvelő vagy számvevő.
              </p>
            </div>
            <Link
              href="/profile/kapcsolatok"
              className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Handshake className="size-4" />
              Kapcsolatok kezelése
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Könyvelő / számvevő — hozzárendelt gyülekezetek */}
      {isReviewer && (
        <div className="mt-6 space-y-3">
          <h2 className="font-heading text-xl text-slate-800">Hozzárendelt gyülekezeteim</h2>
          {assignedCongregations.length === 0 ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-slate-800">Várakozás lelkészi jóváhagyásra</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Még egy gyülekezet lelkésze sem hagyta jóvá a hozzáférésed. Amint valaki engedélyt ad,
                  itt látni fogod a gyülekezeteket, és a Pénzügyi review menüből tudsz majd dolgozni bennük.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {assignedCongregations.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-5">
                    <p className="text-sm font-semibold text-slate-800">
                      {c.nev_hu || c.name || 'Ismeretlen gyülekezet'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.roleScope === 'konyvelo' ? 'Könyvelő' : 'Egyházmegyei számvevő'}
                    </p>
                    {c.approvedAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        Jóváhagyva: {new Date(c.approvedAt).toLocaleDateString('hu-HU')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
