'use client'

/**
 * Alapértelmezett kezdőfelület választó — a profil oldalon jelenik meg.
 *
 * Multi-role felhasználók (pl. gyülekezeti lelkész + esperes) választhatnak,
 * hogy bejelentkezéskor melyik dashboard nyíljon meg alapból.
 *
 * Értékek:
 *   'auto'          — a rendszer dönt (legmagasabb aktív szerepkör)
 *   'gyulekezet'    — /dashboard
 *   'egyhazmegye'   — /dashboard-egyhazmegye
 *   'egyhazkerulet' — /egyhazkeruleti-dashboard
 *   'admin'         — /admin
 */

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Compass } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import {
  getProfilePreferences,
  updateDefaultDashboard,
  type DefaultDashboard,
} from '@/app/(dashboard)/profile/profile-preferences-actions'

interface Option {
  value: DefaultDashboard
  label: string
  description: string
  available: boolean
}

export function DefaultDashboardSelector({
  hasEsperes,
  hasKeruletiAdmin,
  hasAdmin,
}: {
  hasEsperes: boolean
  hasKeruletiAdmin: boolean
  hasAdmin: boolean
}) {
  const [current, setCurrent] = useState<DefaultDashboard>('auto')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    void getProfilePreferences().then((res) => {
      if (res.data) setCurrent(res.data.default_dashboard)
      setLoading(false)
    })
  }, [])

  const options: Option[] = [
    { value: 'auto', label: '🎯 Automatikus', description: 'A rendszer dönt a legmagasabb aktív szerepköröd alapján.', available: true },
    { value: 'gyulekezet', label: '⛪ Gyülekezeti', description: 'A „Dashboard" (gyülekezeti főoldal) nyílik meg.', available: true },
    { value: 'egyhazmegye', label: '🏛️ Egyházmegyei', description: 'Az egyházmegyei dashboard nyílik meg (esperes/admin szerepkör szükséges).', available: hasEsperes || hasAdmin },
    { value: 'egyhazkerulet', label: '⛪⛪ Egyházkerületi', description: 'Egyházkerületi dashboard nyílik meg (kerületi admin szerepkör szükséges).', available: hasKeruletiAdmin || hasAdmin },
    { value: 'admin', label: '🛡️ Rendszergazda', description: 'Admin felület nyílik meg.', available: hasAdmin },
  ]

  function handleChange(value: DefaultDashboard) {
    startTransition(async () => {
      const res = await updateDefaultDashboard(value)
      if (res.error) {
        toast.error(res.error)
      } else {
        setCurrent(value)
        toast.success('Kezdőfelület beállítva.')
      }
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Beállítás betöltése…</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass className="size-5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Alapértelmezett kezdőfelület</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Ha több szerepköröd van (pl. gyülekezeti lelkész és esperes is), akkor választhatsz,
          hogy bejelentkezéskor melyik dashboard nyíljon meg.
        </p>
        <div className="space-y-2">
          {options.filter((o) => o.available).map((o) => {
            const isActive = current === o.value
            return (
              <label
                key={o.value}
                className={`flex items-start gap-3 min-h-11 rounded-xl border-2 px-3 py-2 cursor-pointer transition ${
                  isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40 bg-card'
                } ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name="default-dashboard"
                  value={o.value}
                  checked={isActive}
                  onChange={() => handleChange(o.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{o.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.description}</p>
                </div>
                {isActive && <CheckCircle2 className="size-4 text-primary mt-1" />}
              </label>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
