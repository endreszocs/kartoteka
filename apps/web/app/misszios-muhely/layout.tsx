import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { MuhelyFooter } from '@/components/muhely/layout/muhely-footer'
import { MuhelyNavbar } from '@/components/muhely/layout/muhely-navbar'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMissionProgress } from '@/lib/missions/gamification'
import './muhely.css'

export const metadata: Metadata = {
  title: {
    default: 'Missziós Műhely',
    template: '%s · Missziós Műhely',
  },
  description:
    'Napfényes, közös alkotótér lelkipásztoroknak: ötletek, segédanyagok és szolgálati inspiráció.',
}

export const viewport: Viewport = {
  themeColor: '#f4ebdd',
}

export default async function MuhelyLayout({ children }: { children: React.ReactNode }) {
  const { user, fullName, profile, master, supabase } = await getEffectiveAccessContext()

  if (!user || !profile) redirect('/login')
  if (profile.status !== 'active' && !master) redirect('/login')

  const { data: stats } = await supabase
    .from('mm_felhasznalo_statisztika')
    .select('osszpontszam')
    .eq('user_id', user.id)
    .maybeSingle()

  const points = stats?.osszpontszam ?? 0
  const progress = getMissionProgress(points)

  return (
    <div className="muhely-site">
      <a className="muhely-skip-link" href="#muhely-main">
        Ugrás a tartalomhoz
      </a>

      <div className="muhely-atmosphere" aria-hidden="true">
        <span className="muhely-sun-haze" />
        <svg
          className="muhely-botanical muhely-botanical--left"
          viewBox="0 0 210 520"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M28 510C52 405 73 285 116 70" />
          <path d="M75 310C37 289 20 260 15 225C53 235 78 260 75 310Z" />
          <path d="M94 220C134 198 151 168 153 133C116 145 92 174 94 220Z" />
          <path d="M53 405C23 390 8 366 5 337C37 345 56 368 53 405Z" />
          <path d="M112 113C141 96 157 72 162 45C132 54 113 77 112 113Z" />
        </svg>
        <svg
          className="muhely-botanical muhely-botanical--right"
          viewBox="0 0 250 430"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M229 420C198 322 170 236 113 36" />
          <path d="M176 282C214 264 233 237 239 204C201 211 177 238 176 282Z" />
          <path d="M146 175C105 160 84 135 76 102C115 108 142 132 146 175Z" />
          <path d="M207 360C235 344 248 321 249 295C221 304 205 326 207 360Z" />
        </svg>
      </div>

      <MuhelyNavbar
        viewer={{
          fullName: fullName || 'Felhasználó',
          level: progress.current,
          points,
          percent: progress.percent,
        }}
      />

      <main id="muhely-main" className="muhely-main" tabIndex={-1}>
        <div className="muhely-content">{children}</div>
      </main>

      <MuhelyFooter />
    </div>
  )
}
