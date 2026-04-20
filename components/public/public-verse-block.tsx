import { Quote } from 'lucide-react'

// Egy egyszerű igehirdetés-szerű blokk — rotálódhat heti alapon, de most fix
const VERSES = [
  { text: 'Mert ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük.', ref: 'Máté 18:20' },
  { text: 'Szeresd az Urat, a te Istenedet, teljes szívedből; felebarátodat pedig, mint magadat.', ref: 'Máté 22:37,39' },
  { text: 'Erősítsétek egymást, és építse egyik a másikat.', ref: '1Thessz 5:11' },
  { text: 'Bízzatok az Úrban mindenkor, mert az Úr a mi kősziklánk mindörökké.', ref: 'Ézs 26:4' },
  { text: 'Legyetek azért ti tökéletesek, miként mennyei Atyátok tökéletes.', ref: 'Máté 5:48' },
  { text: 'Te vagy az én reménységem, Uram, én Istenem; bizodalmam gyermekségemtől fogva.', ref: 'Zsolt 71:5' },
]

export function PublicVerseBlock() {
  // A hét napja alapján választunk verset
  const verse = VERSES[new Date().getDay() % VERSES.length]

  return (
    <section
      className="public-section relative overflow-hidden"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, var(--public-soft) 40%, transparent) 0%, transparent 100%)`,
      }}
    >
      {/* Dekoratív elemek */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(60rem,100vw)] h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--public-accent) 50%, transparent) 50%, transparent 100%)`,
        }}
      />

      <div className="public-container">
        <figure className="max-w-3xl mx-auto text-center public-anim-fade-up">
          <Quote
            className="w-10 h-10 mx-auto mb-6 opacity-40"
            style={{ color: 'var(--public-accent)' }}
            strokeWidth={1.5}
          />
          <blockquote
            className="font-serif text-[1.5rem] sm:text-[1.9rem] lg:text-[2.2rem] leading-[1.4] italic"
            style={{ color: 'var(--public-ink)' }}
          >
            &bdquo;{verse.text}&rdquo;
          </blockquote>
          <figcaption
            className="mt-6 text-sm font-semibold tracking-wider uppercase"
            style={{ color: 'var(--public-accent)' }}
          >
            — {verse.ref} —
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
