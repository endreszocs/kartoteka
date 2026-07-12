import { Sprout } from 'lucide-react'

const ENCOURAGING_VERSES = [
  'Szolgálatban egymásért – közösségben az Úrért.',
  'Ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük. — Mt 18,20',
  'Egymás terhét hordozzátok, és így töltsétek be Krisztus törvényét. — Gal 6,2',
  'Erősítsétek egymást, és építse egyik a másikat. — 1Thessz 5,11',
  'Minden jó fa jó gyümölcsöt terem. — Mt 7,17',
  'A szeretet soha el nem múlik. — 1Kor 13,8',
]

export function MuhelyFooter() {
  const verse = ENCOURAGING_VERSES[new Date().getDay() % ENCOURAGING_VERSES.length]

  return (
    <footer className="muhely-footer" aria-label="Missziós Műhely lábléc">
      <div className="muhely-footer-inner">
        <p className="muhely-footer-brand">Missziós Műhely · Kartotéka</p>

        <div className="muhely-footer-verse">
          <Sprout className="muhely-footer-leaf" aria-hidden="true" />
          <p>„{verse}”</p>
          <Sprout className="muhely-footer-leaf" aria-hidden="true" />
        </div>

        <p className="muhely-footer-note">Csendes tér nagy gondolatoknak.</p>
      </div>
    </footer>
  )
}
