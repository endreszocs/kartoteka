import { Heart } from 'lucide-react'

const ENCOURAGING_VERSES = [
  'Szolgálatban egymásért – közösségben az Úrért.',
  'Mert ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük. — Mt 18:20',
  'Egymás terhét hordozzátok, és így töltsétek be a Krisztus törvényét. — Gal 6:2',
  'Erősítsétek egymást, és építse egyik a másikat. — 1Thessz 5:11',
  'Minden jó fa jó gyümölcsöt terem. — Mt 7:17',
  'A szeretet soha el nem múlik. — 1Kor 13:8',
]

export function MuhelyFooter() {
  const verse = ENCOURAGING_VERSES[new Date().getDay() % ENCOURAGING_VERSES.length]

  return (
    <footer className="mt-auto border-t border-emerald-100/40 bg-gradient-to-b from-transparent to-emerald-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Heart className="w-5 h-5 text-emerald-400" />
          <p className="font-heading text-lg text-slate-600 italic max-w-lg">
            &bdquo;{verse}&rdquo;
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Missziós Műhely — Kartotéka © 2024–2026
          </p>
        </div>
      </div>
      {/* Mobile bottom nav spacer */}
      <div className="lg:hidden h-16" />
    </footer>
  )
}
