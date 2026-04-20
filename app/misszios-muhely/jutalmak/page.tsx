import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadRewardsPage } from '../community-actions'
import { getMissionProgress, MISSION_LEVELS } from '@/lib/missions/gamification'
import { Trophy, Star, Award, Lock, BookOpen, Lightbulb, MessageCircle, Heart, Crown } from 'lucide-react'

export default async function JutalmakPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadRewardsPage()
  if ('error' in data) redirect('/login')

  const progress = getMissionProgress(data.myStats.osszpontszam || 0)
  const earnedBadgeIds = new Set(data.myBadges.map((b) => b.mm_jelveny_tipusok?.id).filter(Boolean))

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl text-slate-800">Jutalmak</h1>
          <p className="text-sm text-slate-500">Az utad a szolgálat közösségében — minden hozzájárulás számít</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Left — Level progress */}
        <div className="space-y-4">
          {/* Current level card */}
          <div className={`rounded-2xl bg-gradient-to-br ${progress.current.accent} p-6 text-white shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Star className="w-7 h-7 text-white fill-white" />
              </div>
              <div>
                <div className="text-2xl font-bold font-heading">{progress.current.name}</div>
                <div className="text-white/70 text-sm">{data.myStats.osszpontszam || 0} pont</div>
              </div>
            </div>
            <p className="text-white/80 text-sm italic mb-4">{progress.current.description}</p>

            {progress.next && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-white/60">
                  <span>{progress.current.name}</span>
                  <span>{progress.next.name}</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/80 transition-all duration-700"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="text-xs text-white/60 text-right">
                  {progress.next.minPoints - (data.myStats.osszpontszam || 0)} pont a következő szintig
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 text-sm mb-3">Hozzájárulásaid</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Lightbulb, label: 'Ötlet', value: data.myStats.otletek_szama || 0 },
                { icon: BookOpen, label: 'Segédanyag', value: data.myStats.segedanyagok_feltoltve || 0 },
                { icon: MessageCircle, label: 'Hozzászólás', value: data.myStats.hozzaszolasok_szama || 0 },
                { icon: Heart, label: 'Támogatás', value: data.myStats.tamogatasok_adva || 0 },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/80">
                  <stat.icon className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="text-lg font-bold text-slate-800">{stat.value}</div>
                    <div className="text-xs text-slate-500">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All levels */}
          <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 text-sm mb-3">Szintrendszer</h3>
            <div className="space-y-2">
              {MISSION_LEVELS.map((level) => {
                const isCurrentOrBelow = (data.myStats.osszpontszam || 0) >= level.minPoints
                return (
                  <div
                    key={level.name}
                    className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                      level.name === progress.current.name ? 'bg-slate-50 ring-1 ring-slate-200' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${level.accent} flex items-center justify-center ${isCurrentOrBelow ? '' : 'opacity-30'}`}>
                      <Star className="w-4 h-4 text-white fill-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{level.name}</div>
                      <div className="text-xs text-slate-400">{level.minPoints}+ pont</div>
                    </div>
                    {level.name === progress.current.name && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Jelenlegi</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right — Badges + Leaderboard */}
        <div className="space-y-6">
          {/* Badge collection */}
          <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-700">Jelvénygyűjtemény</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.badgeCatalog.map((badge) => {
                const earned = earnedBadgeIds.has(badge.id)
                return (
                  <div
                    key={badge.id}
                    className={`relative flex flex-col items-center p-4 rounded-xl text-center transition-all ${
                      earned
                        ? 'bg-amber-50/80 border border-amber-200/60 shadow-sm shadow-amber-100'
                        : 'bg-slate-50/60 border border-slate-100 opacity-50'
                    }`}
                  >
                    {!earned && (
                      <div className="absolute top-2 right-2">
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                      earned ? 'bg-amber-100' : 'bg-slate-100'
                    }`}>
                      <span className="text-lg">{badge.ikon || '🏅'}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mb-0.5">{badge.nev}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{badge.feltetel}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Community celebration board */}
          <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-700">Közösségi Ünneptár</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">Akik a legtöbbet hozták a közösségbe</p>
            <div className="space-y-2">
              {data.leaderboard.map((entry, index) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    entry.userId === user.id ? 'bg-emerald-50/80 ring-1 ring-emerald-200' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-amber-100 text-amber-700' :
                    index === 1 ? 'bg-slate-100 text-slate-600' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-50 text-slate-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {entry.fullName}
                      {entry.userId === user.id && <span className="text-emerald-600 text-xs ml-1">(te)</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{entry.congregationName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-700">{entry.score} p</div>
                    <div className="text-[10px] text-slate-400">{entry.level}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
