import { Heart } from 'lucide-react'

const MESSAGES = [
  { text: 'Ma is számítunk rád! Egy megosztott segédanyag vagy egy bátorító szó sokat jelent a közösségnek.', verse: null },
  { text: 'Mert ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük.', verse: 'Mt 18:20' },
  { text: 'Erősítsétek egymást, és építse egyik a másikat.', verse: '1Thessz 5:11' },
  { text: 'Egymás terhét hordozzátok, és így töltsétek be a Krisztus törvényét.', verse: 'Gal 6:2' },
  { text: 'Minden jó fa jó gyümölcsöt terem.', verse: 'Mt 7:17' },
  { text: 'Az Úr erőt ad népének, az Úr megáldja népét békességgel.', verse: 'Zsolt 29:11' },
  { text: 'A te szavad lábam előtt mécses, ösvényem világossága.', verse: 'Zsolt 119:105' },
]

export function MuhelyEncouragement() {
  const today = new Date()
  const dayIndex = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % MESSAGES.length
  const message = MESSAGES[dayIndex]

  return (
    <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-100/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <Heart className="w-4.5 h-4.5 text-amber-600" />
        </div>
        <div>
          <p className="font-heading text-base sm:text-lg text-slate-700 italic leading-relaxed">
            &bdquo;{message.text}&rdquo;
          </p>
          {message.verse && (
            <p className="text-xs text-amber-600/70 font-medium mt-1.5">— {message.verse}</p>
          )}
        </div>
      </div>
    </div>
  )
}
