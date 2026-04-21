import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadProfilePage } from '../community-actions'
import { getMissionProgress } from '@/lib/missions/gamification'
import { User, Star, BookOpen, Lightbulb, Award, MessageCircle, Heart } from 'lucide-react'
import Link from 'next/link'

export default async function ProfilPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadProfilePage()
  if ('error' in data) redirect('/login')

  const progress = getMissionProgress(data.myStats.osszpontszam || 0)

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="space-y-8">
      {/* Profile header */}
      <div className="rounded-2xl bg-white/90 border border-white/60 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {data.viewer.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-heading text-2xl text-slate-800">{data.viewer.fullName}</h1>
            <p className="text-sm text-slate-500">{data.viewer.congregationName}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <div className={`px-2.5 py-0.5 rounded-full bg-gradient-to-r ${progress.current.accent} text-[11px] font-semibold text-white`}>
                <Star className="w-3 h-3 inline mr-1" />
                {progress.current.name}
              </div>
              <span className="text-xs text-slate-400">{data.myStats.osszpontszam || 0} pont</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Lightbulb, label: 'Ötleteid', value: data.myIdeas.length, color: 'text-violet-600 bg-violet-50' },
          { icon: BookOpen, label: 'Segédanyagaid', value: data.myMaterials.length, color: 'text-emerald-600 bg-emerald-50' },
          { icon: Heart, label: 'Támogatásaid', value: data.myStats.tamogatasok_adva || 0, color: 'text-rose-600 bg-rose-50' },
          { icon: Award, label: 'Jelvényeid', value: data.myBadges.length, color: 'text-amber-600 bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.color.split(' ')[1]} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color.split(' ')[0]}`} />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My ideas */}
        <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-violet-500" />
            <h3 className="font-semibold text-slate-700 text-sm">Ötleteim</h3>
          </div>
          {data.myIdeas.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Még nincs ötleted — indíts el egyet a Fórumon!</p>
          ) : (
            <div className="space-y-2">
              {data.myIdeas.slice(0, 5).map((idea) => (
                <Link
                  key={idea.id}
                  href={`/misszios-muhely/forum/${idea.id}`}
                  className="block p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-700 truncate">{idea.cim}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {idea.tamogatasok_szama || 0} támogatás · {idea.hozzaszolasok_szama || 0} hozzászólás
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* My materials */}
        <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <h3 className="font-semibold text-slate-700 text-sm">Segédanyagaim</h3>
          </div>
          {data.myMaterials.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Még nincs segédanyagod — oszd meg az elsőt!</p>
          ) : (
            <div className="space-y-2">
              {data.myMaterials.slice(0, 5).map((m) => (
                <div key={m.id} className="p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="text-sm font-medium text-slate-700 truncate">{m.cim}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{formatDate(m.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Badge showcase */}
      {data.myBadges.length > 0 && (
        <div className="rounded-2xl bg-white/80 border border-white/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-slate-700">Elnyert jelvényeid</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.myBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200/60"
              >
                <span className="text-lg">{badge.mm_jelveny_tipusok?.ikon || '🏅'}</span>
                <div>
                  <div className="text-xs font-semibold text-slate-700">{badge.mm_jelveny_tipusok?.nev}</div>
                  <div className="text-[10px] text-slate-400">{badge.mm_jelveny_tipusok?.leiras}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
