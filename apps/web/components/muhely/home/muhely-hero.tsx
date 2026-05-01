import Link from 'next/link'
import { BookOpen, Lightbulb, Star } from 'lucide-react'
import type { MissionLevel } from '@/lib/missions/gamification'

interface MuhelyHeroProps {
  viewer: { fullName: string }
  level: MissionLevel
  points: number
  percent: number
  nextLevel: MissionLevel | null
}

export function MuhelyHero({ viewer, level, points, percent, nextLevel }: MuhelyHeroProps) {
  const firstName = viewer.fullName.split(' ').pop() || viewer.fullName

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-6 sm:p-8 lg:p-10 text-white"
      style={{ background: 'linear-gradient(135deg, var(--sidebar) 0%, var(--primary) 50%, var(--accent) 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-white/5" />

      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-center">
        {/* Left — Text */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium text-white/80 mb-4">
            <Star className="w-3.5 h-3.5" />
            Missziós Műhely
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-3">
            Üdv újra, {firstName}!
          </h1>

          <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-lg mb-6">
            Örömsziget a szolgálat sűrűjében — itt segédanyagokat találsz, ötleteket cserélhetsz, és együtt építhetjük a közösségünket.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/misszios-muhely/segedanyagok"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-teal-700 text-sm font-semibold shadow-lg shadow-black/10 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <BookOpen className="w-4 h-4" />
              Segédanyag megosztása
            </Link>
            <Link
              href="/misszios-muhely/forum"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 text-white border border-white/20 text-sm font-semibold hover:bg-white/25 transition-all"
            >
              <Lightbulb className="w-4 h-4" />
              Fórum megnyitása
            </Link>
          </div>
        </div>

        {/* Right — Level card */}
        <div className="flex flex-col gap-4">
          {/* Current level */}
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${level.accent} flex items-center justify-center shadow-lg`}>
                <Star className="w-6 h-6 text-white fill-white" />
              </div>
              <div>
                <div className="text-white font-bold text-lg">{level.name}</div>
                <div className="text-white/60 text-sm">{points} pont</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-white/50">
                <span>{level.name}</span>
                <span>{nextLevel?.name || 'Maximum'}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${level.accent} transition-all duration-700`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {nextLevel && (
                <div className="text-xs text-white/50 text-right">
                  {nextLevel.minPoints - points} pont a következő szintig
                </div>
              )}
            </div>
          </div>

          {/* Encouragement */}
          <div className="text-center">
            <p className="text-sm text-white/50 italic font-heading">
              &bdquo;{level.description}&rdquo;
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
