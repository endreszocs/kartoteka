import Link from 'next/link'
import { ArrowRight, BookOpen, MessageCircle, Crown } from 'lucide-react'
import { getMissionLevel } from '@/lib/missions/gamification'

interface RecentMaterial {
  id: string
  cim: string
  feltolto_nev: string | null
  feltolto_gyulekezet: string | null
  created_at: string
  mm_segedanyag_kategoriak: { mm_kategoriak: { nev: string; szin: string } | null }[]
}

interface RecentIdea {
  id: string
  cim: string
  hozzaszolasok_szama: number | null
  tamogatasok_szama: number | null
  otletgazda_nev: string | null
  created_at: string
}

interface TopContributor {
  userId: string
  fullName: string
  congregationName: string
  score: number
  level: string
}

interface MuhelyRecentActivityProps {
  materials: RecentMaterial[]
  ideas: RecentIdea[]
  topContributors: TopContributor[]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  if (diffH < 1) return 'most'
  if (diffH < 24) return `${diffH} órája`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} napja`
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
}

export function MuhelyRecentActivity({ materials, ideas, topContributors }: MuhelyRecentActivityProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Recent materials */}
      <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Friss segédanyagok</h3>
          </div>
          <Link
            href="/misszios-muhely/segedanyagok"
            className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 font-medium"
          >
            Összes <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {materials.length === 0 && (
            <p className="text-xs text-slate-400 italic py-4 text-center">Még nincsenek segédanyagok</p>
          )}
          {materials.map((m) => (
            <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50/80 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{m.cim}</p>
                <p className="text-xs text-slate-400">
                  {m.feltolto_nev || 'Ismeretlen'} · {formatDate(m.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active conversations */}
      <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-violet-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Futó beszélgetések</h3>
          </div>
          <Link
            href="/misszios-muhely/forum"
            className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1 font-medium"
          >
            Összes <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {ideas.length === 0 && (
            <p className="text-xs text-slate-400 italic py-4 text-center">Még nincsenek fórum témák</p>
          )}
          {ideas.map((i) => (
            <Link
              key={i.id}
              href={`/misszios-muhely/forum/${i.id}`}
              className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50/80 transition-colors block"
            >
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-violet-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{i.cim}</p>
                <p className="text-xs text-slate-400">
                  {i.hozzaszolasok_szama || 0} hozzászólás · {i.tamogatasok_szama || 0} támogatás
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Top contributors this week */}
      <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Akik a legtöbbet hozták</h3>
        </div>
        <div className="space-y-3">
          {topContributors.length === 0 && (
            <p className="text-xs text-slate-400 italic py-4 text-center">Még nincs adat</p>
          )}
          {topContributors.map((c, index) => {
            const lvl = getMissionLevel(c.score)
            return (
              <div key={c.userId} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50/80 transition-colors">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0 text-sm font-bold text-amber-600">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 truncate">{c.fullName}</p>
                  <p className="text-xs text-slate-400">{c.congregationName}</p>
                </div>
                <div className={`px-2 py-0.5 rounded-full bg-gradient-to-r ${lvl.accent} text-[10px] font-semibold text-white`}>
                  {c.score} p
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
