import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { loadPublicEvProgram } from '@/lib/public-site/tisztsegek-events-loader'
import { PublicServiceTimes } from '@/components/public/public-service-times'
import { PublicSectionHeader } from '@/components/public/public-section-header'
import { PublicEmptyState } from '@/components/public/public-empty-state'
import { PublicEvNaptar } from '@/components/public/public-ev-naptar'
import { PublicProgramLetoltes } from '@/components/public/public-program-letoltes'

/**
 * ALKALMAINK — a gyülekezet rendszeres alkalmai + a TELJES ÉVES program
 * (2026-08-27).
 *
 * Endre kérése: „Legyen egy naptár ott is, ahol látszódnak a
 * határidőnaplóban rögzített nyilvános programok leírással együtt, le is
 * tölthető a teljes éves program."
 *
 * Eddig az „Alkalmaink" csak egy horgony volt a kezdőlapon (`#alkalmak`), és
 * kizárólag a weboldalon külön szerkesztett, ISMÉTLŐDŐ istentiszteleti rendet
 * mutatta. A határidőnaplóban nyilvánosnak jelölt KONKRÉT alkalmakról nem
 * tudott — pedig a látogatót éppen azok érdeklik.
 *
 * A naptár adata a kapuzott `public_site_events_v2` RPC-ből jön: csak az a
 * program jut idáig, amit a gyülekezet TUDATOSAN nyilvánosnak jelölt.
 */

/** Az évválasztó ablaka: az előző évtől a következőig — ennél tovább nincs terv. */
function evAblak(): number[] {
  const most = new Date().getFullYear()
  return [most - 1, most, most + 1]
}

function biztonsagosEv(nyers: string | undefined): number {
  const most = new Date().getFullYear()
  if (!nyers) return most
  const ev = Number.parseInt(nyers, 10)
  if (!Number.isInteger(ev)) return most
  return evAblak().includes(ev) ? ev : most
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) return { title: 'Nincs ilyen oldal' }
  return {
    title: 'Alkalmaink',
    description: `${site.display_name} rendszeres alkalmai és éves programja.`,
    alternates: { canonical: `/gy/${site.slug}/alkalmak` },
  }
}

export default async function AlkalmainkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ev?: string }>
}) {
  const { slug } = await params
  const { ev: evParam } = await searchParams
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const ev = biztonsagosEv(evParam)
  const esemenyek = await loadPublicEvProgram(site.slug, ev)

  return (
    <>
      {/* Rendszeres alkalmak + elérhetőség (a kezdőlapról ismert szekció) */}
      <PublicServiceTimes site={site} />

      <section className="public-section" id="eves-program">
        <div className="public-container">
          <PublicSectionHeader
            eyebrow="Éves program"
            title={`A(z) ${ev}. év alkalmai`}
            subtitle="Gyülekezetünk nyilvános alkalmai hónapról hónapra — nyomtatható és naptárba menthető."
          />

          {/* Évválasztó — sima linkek, JS nélkül is működik */}
          <nav className="public-no-print mb-7 flex flex-wrap gap-2" aria-label="Évválasztó">
            {evAblak().map(e => {
              const aktiv = e === ev
              return (
                <Link
                  key={e}
                  href={`/gy/${site.slug}/alkalmak?ev=${e}`}
                  aria-current={aktiv ? 'page' : undefined}
                  className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition"
                  style={
                    aktiv
                      ? { background: 'var(--public-primary)', color: '#fff' }
                      : {
                          border: '1px solid var(--public-line, rgba(0,0,0,0.14))',
                          color: 'var(--public-ink)',
                        }
                  }
                >
                  {e}
                </Link>
              )
            })}
          </nav>

          {esemenyek.length === 0 ? (
            <PublicEmptyState
              title={`A(z) ${ev}. évre még nincs közzétett alkalom.`}
              description="Amint elkészül az éves program, itt hónapról hónapra megtalálod. Addig is szeretettel várunk rendszeres alkalmainkon."
              actionHref={`/gy/${site.slug}`}
              actionLabel="Vissza a kezdőlapra"
            />
          ) : (
            <>
              <div className="mb-7">
                <PublicProgramLetoltes
                  icsHref={`/gy/${site.slug}/naptar.ics?ev=${ev}`}
                  ev={ev}
                />
              </div>

              {/* Csak nyomtatásban látszó fejléc — a kinyomtatott lapról
                  derüljön ki, melyik gyülekezet melyik évi programja. */}
              <div className="public-print-only mb-6">
                <p className="text-lg font-semibold">{site.display_name}</p>
                <p className="text-sm">{ev}. évi gyülekezeti program</p>
                {site.address && <p className="text-sm">{site.address}</p>}
              </div>

              <PublicEvNaptar esemenyek={esemenyek} ev={ev} />
            </>
          )}
        </div>
      </section>
    </>
  )
}
