import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Eye, Handshake, Mail, Phone, Shield, User, ShieldCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DefaultDashboardSelector } from '@/components/profile/default-dashboard-selector'
import { OpenProfileDialogButton } from '@/components/profile/open-profile-dialog-button'
// 2026-08-11: lelkészi (privát) naptár-feed — a gyülekezet évfordulói a saját naptárban.
import { PastoralCalendarCard } from '@/components/profile/pastoral-calendar-card'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { lelkesziSzerepbenE } from '@/lib/profile-roles/aktiv-szerep'
import { getRoleLabel, getScopeLabel } from '@/lib/profile-roles/labels'
import { formatTimestampHu } from '@/lib/utils/date'

export const metadata = {
  title: 'Profilom · Kartotéka',
  description: 'Felhasználói profil és gyülekezeti kapcsolatok áttekintése.',
}

/**
 * 2026-09-05 (profil-kör): a saját `roleLabel()` switch (amiből hiányzott a
 * `custom` és a legacy kulcsok) és a `roleColor()` hardkódolt `bg-*-100 text-*-800`
 * párja (sötétben világos szöveg világos chipen) MEGSZŰNT — a címke a közös
 * `labels.ts`-ből, a jelvény a tokenes `Badge variant="secondary"`-ből jön. A
 * szerep forrása az AKTÍV kontextus (a fejléc bal chipjével azonos), a legacy
 * `profiles.role` csak akkor, ha nincs profile_roles sor.
 */
export default async function ProfilePage() {
  const access = await getEffectiveAccessContext()

  if (!access.user || !access.profile) redirect('/login')

  const { profile, role, konyvelo, szamvevo, assignedCongregations, activeProfileRole } = access
  const isReviewer = konyvelo || szamvevo
  const aktivRoleLabel = activeProfileRole
    ? getRoleLabel(activeProfileRole.role, activeProfileRole.customLabel)
    : getRoleLabel(role)
  // Az e-mail az AUTH-ból kanonikus (D14); a profiles.email csak jelzés.
  const email = access.user.email || profile.email || null
  // 2026-09-05 (P3): a „Kapcsolatok" kártya UGYANABBÓL a feloldóból dönt, mint a
  // /profile/kapcsolatok oldal, annak akciói és a dialógus linkje — eddig a
  // legacy skalárból (`role === 'lelkesz'`), a többi hely az aktív szerepből.
  const kapcsolatokElerheto = lelkesziSzerepbenE(access)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero — tokenes blobok (az élő akcent olívazöld, nem arany/teal) */}
      <div className="card-raised relative mb-6 overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-24 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              Profilom
            </p>
            <h1 className="mt-2 min-w-0 break-words font-heading text-3xl text-foreground sm:text-4xl" title={profile.full_name || undefined}>
              {profile.full_name || 'Névtelen felhasználó'}
            </h1>
            <p className="mt-1 min-w-0 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{email || '—'}</p>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Badge variant="secondary" className="h-auto max-w-full whitespace-normal px-3 py-1 text-sm">
              <Shield className="size-3.5" />
              <span className="min-w-0 break-words">{aktivRoleLabel}</span>
            </Badge>
            <OpenProfileDialogButton />
          </div>
        </div>
      </div>

      {/* Alapadatok */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kapcsolat</p>
            <div className="mt-3 space-y-2">
              <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{email || '—'}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words">{profile.phone || 'Nincs megadva'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktív szolgálat</p>
            <div className="mt-3 space-y-2">
              <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words">{aktivRoleLabel}</span>
              </div>
              {activeProfileRole && activeProfileRole.scope !== 'congregation' && (
                <p className="min-w-0 break-words text-sm text-muted-foreground">
                  Hatókör: <span className="font-medium text-foreground">{getScopeLabel(activeProfileRole.scope)}</span>
                </p>
              )}
              {access.congregationName && (
                <p className="min-w-0 break-words text-sm text-muted-foreground">
                  Gyülekezet:{' '}
                  <span className="font-medium text-foreground">{access.congregationName}</span>
                  {access.congregationDioceseName ? <> · {access.congregationDioceseName}</> : null}
                </p>
              )}
              {activeProfileRole && activeProfileRole.role !== role && (
                <p className="text-xs text-muted-foreground">Nyilvántartott elsődleges szerep: {getRoleLabel(role)}</p>
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

      {/* 2026-08-15 (8. pont): kétlépcsős belépés — minden szerepkörnek. */}
      <Card className="mt-6 border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Biztonság — kétlépcsős belépés</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Önkéntes második zár a fiókodon: belépéskor a telefonod hitelesítő appjának 6 jegyű
              kódja is kell. Mentőkódokkal, hogy elveszett telefonnal se zárd ki magad.
            </p>
          </div>
          <Link
            href="/profile/biztonsag"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ShieldCheck className="size-4" />
            Biztonság kezelése
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Adataim és adatvédelem — 2026-08-23.
          A jogi dokumentumok két konkrét ígérete: betekintés-kimutatás
          (Adatvédelmi tájékoztató 18. szakasz) és géppel olvasható adatexport
          (9. szakasz + ÁSZF 12. pont). A hatókör-ellenőrzés a panelekben fut,
          fail-closed módon — ezért a belépő itt minden szerepkörnek látszik. */}
      <Card className="mt-6 border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Adataim és adatvédelem</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nézd meg, ki és mikor nyúlt a gyülekezet adataihoz, és töltsd le a gyülekezet teljes
              adatállományát géppel olvasható formában.
            </p>
          </div>
          <Link
            href="/profile/adatvedelem"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Eye className="size-4" />
            Adataim megnyitása
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {kapcsolatokElerheto && (
        <Card className="mt-6 border-border bg-muted/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Hozzáférési kérések</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A gyülekezet adataihoz kizárólag a Te engedélyeddel férhet hozzá könyvelő vagy számvevő.
              </p>
            </div>
            <Link
              href="/profile/kapcsolatok"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
          <h2 className="font-heading text-xl text-foreground">Hozzárendelt gyülekezeteim</h2>
          {assignedCongregations.length === 0 ? (
            <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Várakozás lelkészi jóváhagyásra</p>
                <p className="mt-1 text-sm leading-6 text-amber-900/90 dark:text-amber-100/90">
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
                    <p className="min-w-0 break-words text-sm font-semibold text-foreground">
                      {c.nev_hu || c.name || 'Ismeretlen gyülekezet'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.roleScope === 'konyvelo' ? 'Könyvelő' : 'Egyházmegyei számvevő'}
                    </p>
                    {c.approvedAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Jóváhagyva: {formatTimestampHu(c.approvedAt)}
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
