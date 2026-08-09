import type { PublicSiteData } from '@/lib/public-site/site-loader'

/**
 * Heti ige — teljes szélességű, mély tinta-sáv arany hajszálkerettel.
 *
 * 2026-08-10 két javítás:
 *  - a régi `new Date().getDay() % 6` képlet miatt a 0..6 tartományban a 0-s
 *    index hetente kétszer jött ki (vasárnap ÉS szombat ugyanaz), a 6. vers
 *    pedig sosem jelent meg;
 *  - egy adott napon MINDEN Kartotéka-gyülekezet oldalán ugyanaz az ige
 *    állt. Innentől a kiválasztás a gyülekezet azonosítójából és az aktuális
 *    hétből képzett stabil indexen alapul: gyülekezetenként más ige, egy
 *    héten belül viszont nem ugrál.
 */
const VERSES: ReadonlyArray<{ text: string; ref: string }> = [
  { text: 'Mert ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük.', ref: 'Máté 18:20' },
  { text: 'Szeresd az Urat, a te Istenedet teljes szívedből, felebarátodat pedig, mint magadat.', ref: 'Máté 22:37,39' },
  { text: 'Bátorítsátok egymást, és építse egyik a másikat.', ref: '1Thessz 5:11' },
  { text: 'Bízzatok az Úrban mindenkor, mert az Úr a mi kősziklánk mindörökké.', ref: 'Ézsaiás 26:4' },
  { text: 'Te vagy az én reménységem, Uram, én Istenem, bizodalmam gyermekségemtől fogva.', ref: 'Zsoltárok 71:5' },
  { text: 'Az Úr az én pásztorom, nem szűkölködöm.', ref: 'Zsoltárok 23:1' },
  { text: 'Erős vár a mi Istenünk, jó segítség a nyomorúságban.', ref: 'Zsoltárok 46:2' },
  { text: 'Jöjjetek énhozzám mindnyájan, akik megfáradtatok, és én megnyugvást adok nektek.', ref: 'Máté 11:28' },
  { text: 'Legyen világosságotok az emberek előtt, hogy lássák jó cselekedeteiteket.', ref: 'Máté 5:16' },
  { text: 'Az Úr csendes szóval szól: ez az út, ezen járjatok!', ref: 'Ézsaiás 30:21' },
  { text: 'Én és az én házam népe az Urat szolgáljuk.', ref: 'Józsué 24:15' },
  { text: 'Az Úr irgalma nem fogyott el, minden reggel megújul.', ref: 'Jeremiás sir. 3:22-23' },
  { text: 'Egymás terhét hordozzátok, és így töltsétek be a Krisztus törvényét.', ref: 'Galata 6:2' },
]

/** Stabil, nem kriptográfiai hash a gyülekezet azonosítójából. */
function stableHash(value: string): number {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
  }
  return hash
}

/** ISO-hét sorszáma — hetente pontosan egyszer lép a rotáció. */
function isoWeekIndex(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(utc / (7 * 24 * 60 * 60 * 1000))
}

export function PublicVerseBlock({ site }: { site: PublicSiteData }) {
  const index =
    (stableHash(site.id) + isoWeekIndex(new Date())) % VERSES.length
  const verse = VERSES[index]

  return (
    <section className="public-band public-section relative overflow-hidden">
      <span aria-hidden="true" className="public-band-hairline top-0" />

      <div className="public-container">
        <figure className="mx-auto max-w-3xl text-center">
          <p className="public-eyebrow public-eyebrow-on-dark">A hét igéje</p>

          <blockquote
            className="public-anim-fade-up mt-6 text-[clamp(1.45rem,1.1rem+1.7vw,2.35rem)] italic leading-[1.35] text-white"
            style={{ fontFamily: 'var(--public-heading-font)' }}
          >
            &bdquo;{verse.text}&rdquo;
          </blockquote>

          <span
            aria-hidden="true"
            className="mx-auto mt-7 block h-px w-16"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--public-accent) 80%, transparent)',
            }}
          />

          <figcaption
            className="mt-5 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{
              color: 'color-mix(in srgb, var(--public-accent) 75%, white)',
            }}
          >
            {verse.ref}
          </figcaption>
        </figure>
      </div>

      <span aria-hidden="true" className="public-band-hairline bottom-0" />
    </section>
  )
}
