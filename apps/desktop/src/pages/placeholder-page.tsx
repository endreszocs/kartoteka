/**
 * PlaceholderPage — a sidebar-menüpontokhoz, amik még nincsenek
 * implementálva a desktopon.
 *
 * Ezzel a lelkész ráklikkelhet bármelyik modul-linkre és egy barátságos
 * "Hamarosan" üzenetet kap, nem üres / 404 screen-t. A chrome (sidebar,
 * header) továbbra is látható, így navigálhat vissza.
 */

import { useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kartoteka/ui'
import { Clock } from 'lucide-react'

import { DesktopShell } from '../lib/shell/desktop-shell'

/**
 * Egyszerű URL-path → magyar modul-név fordítás (a sidebar és a web-app
 * menüi alapján). Ez csak UX kellem — a lelkész tudja, melyik modult
 * várta, és most nem jött.
 */
function getModuleLabel(pathname: string): string {
  const labels: Record<string, string> = {
    '/tagnyilvantartas': 'Tagnyilvántartás',
    '/penzugy': 'Pénzügy',
    '/anyakonyv': 'Anyakönyv',
    '/munkanaplo': 'Munkanapló',
    '/leltar': 'Leltár',
    '/iktato': 'Iktatás',
    '/jegyzokonyvek': 'Jegyzőkönyvek',
    '/sirhelyek': 'Sírhelyek',
    '/misszios-muhely': 'Missziós Műhely',
    '/dashboard-egyhazmegye': 'Egyházmegyei irányítópult',
    '/dashboard-kerulet': 'Egyházkerületi irányítópult',
    '/admin': 'Admin Panel',
    '/profile': 'Profilom',
  }
  // Prefix match — /tagnyilvantartas/123 is 'Tagnyilvántartás'
  for (const [prefix, label] of Object.entries(labels)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return label
  }
  return pathname
}

export function PlaceholderPage() {
  const location = useLocation()
  const label = getModuleLabel(location.pathname)

  return (
    <DesktopShell>
      <div className="mx-auto max-w-3xl space-y-6 pt-8">
        <Card className="card-raised border-0">
          <CardHeader>
            <div className="mb-2 inline-flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 icon-raised">
              <Clock className="size-6" />
            </div>
            <CardTitle className="font-heading text-3xl">{label}</CardTitle>
            <CardDescription className="text-base">
              Ez a modul a webes felületen már elérhető, a desktopon hamarosan.
              Az offline-sync fázisos portolása folyamatban van — a lelkész
              minden modult ugyanazzal a megjelenéssel kapni fog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Addig is a <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/</code>{' '}
              (Irányítópult) oldalon elérhető a gyülekezet-sync és a
              tagnyilvántartás offline listája.
            </p>
          </CardContent>
        </Card>
      </div>
    </DesktopShell>
  )
}
