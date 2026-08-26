/**
 * Publikus weboldal — „Tisztségviselőink" és „Közelgő események" szekciók
 * (2026-08-26, 5. kör).
 *
 * Mindkettő tisztán szerver-renderelt; az adat a dedikált, kapuzott RPC-kből
 * jön (üres lista = a szekció nem jelenik meg). Név CSAK személyes
 * hozzájárulással kerülhet ide — a kaput az RPC kényszeríti ki.
 */

import Link from 'next/link'
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react'

import { PublicSectionHeader } from '@/components/public/public-section-header'
import { publikusTisztsegCimke } from '@/lib/tisztsegek/shared'
import { formazIdopont } from '@/lib/public-site/esemeny-format'
import type { PublicTisztseg, PublicEsemeny } from '@/lib/public-site/tisztsegek-events-loader'

export function PublicTisztsegekSection({ tisztsegek }: { tisztsegek: PublicTisztseg[] }) {
  if (tisztsegek.length === 0) return null
  return (
    <section className="public-section">
      <div className="public-container">
        <PublicSectionHeader
          eyebrow="Szolgálattevőink"
          title="Tisztségviselőink"
          subtitle="A gyülekezet választott és megbízott szolgálattevői."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tisztsegek.map((t, idx) => (
            <div
              key={`${t.kod}-${t.nev}-${idx}`}
              className="public-panel flex items-center gap-3 p-4"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: 'color-mix(in srgb, var(--public-primary) 12%, transparent)',
                  color: 'var(--public-primary)',
                }}
              >
                <Users className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" style={{ color: 'var(--public-ink)' }}>
                  {t.nev}
                </span>
                <span className="block text-xs" style={{ color: 'var(--public-muted)' }}>
                  {publikusTisztsegCimke(t.kod)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PublicEsemenyekSection({
  esemenyek,
  slug,
}: {
  esemenyek: PublicEsemeny[]
  /** Ha megvan, a szekció fejlécéből át lehet lépni a teljes éves naptárra. */
  slug?: string
}) {
  if (esemenyek.length === 0) return null
  return (
    <section className="public-section" id="esemenyek">
      <div className="public-container">
        <PublicSectionHeader
          eyebrow="Naptár"
          title="Közelgő események"
          subtitle="A következő hetek gyülekezeti alkalmai és eseményei — szeretettel várunk!"
          linkHref={slug ? `/gy/${slug}/alkalmak` : undefined}
          linkLabel="Teljes éves naptár"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {esemenyek.map((e, idx) => (
            <div key={`${e.cim}-${e.datum}-${idx}`} className="public-panel p-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--public-ink)' }}>
                {e.egyedi_emoji ? `${e.egyedi_emoji} ` : ''}{e.cim}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--public-muted)' }}>
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {formazIdopont(e)}
              </p>
              {e.helyszin && (
                <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--public-muted)' }}>
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {e.helyszin}
                </p>
              )}
              {/* A leírás Endre 2026-08-27-i kérésére látszik — csak a
                  nyilvánosnak JELÖLT programoké jut idáig. */}
              {e.leiras && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--public-muted)' }}>
                  {e.leiras}
                </p>
              )}
            </div>
          ))}
        </div>

        {slug && (
          <div className="mt-7">
            <Link href={`/gy/${slug}/alkalmak`} className="public-btn public-btn-outline">
              A teljes éves program
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
