/**
 * Publikus weboldal — „Tisztségviselőink" és „Közelgő események" szekciók
 * (2026-08-26, 5. kör).
 *
 * Mindkettő tisztán szerver-renderelt; az adat a dedikált, kapuzott RPC-kből
 * jön (üres lista = a szekció nem jelenik meg). Név CSAK személyes
 * hozzájárulással kerülhet ide — a kaput az RPC kényszeríti ki.
 */

import { CalendarDays, MapPin, Users } from 'lucide-react'

import { PublicSectionHeader } from '@/components/public/public-section-header'
import { publikusTisztsegCimke } from '@/lib/tisztsegek/shared'
import type { PublicTisztseg, PublicEsemeny } from '@/lib/public-site/tisztsegek-events-loader'

const HU_HONAPOK = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]
const HU_NAPOK = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']

function formazDatum(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const [, y, mo, d] = m
  const nap = HU_NAPOK[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()]
  return `${y}. ${HU_HONAPOK[Number(mo) - 1]} ${Number(d)}. (${nap})`
}

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

export function PublicEsemenyekSection({ esemenyek }: { esemenyek: PublicEsemeny[] }) {
  if (esemenyek.length === 0) return null
  return (
    <section className="public-section" id="esemenyek">
      <div className="public-container">
        <PublicSectionHeader
          eyebrow="Naptár"
          title="Közelgő események"
          subtitle="A következő hetek gyülekezeti alkalmai és eseményei — szeretettel várunk!"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {esemenyek.map((e, idx) => (
            <div key={`${e.cim}-${e.datum}-${idx}`} className="public-panel p-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--public-ink)' }}>
                {e.egyedi_emoji ? `${e.egyedi_emoji} ` : ''}{e.cim}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--public-muted)' }}>
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {formazDatum(e.datum)}
                {e.datum_vege && e.datum_vege !== e.datum ? ` – ${formazDatum(e.datum_vege)}` : ''}
                {e.ido_kezdes ? ` · ${e.ido_kezdes.slice(0, 5)}` : ''}
                {e.ido_befejezes ? `–${e.ido_befejezes.slice(0, 5)}` : ''}
              </p>
              {e.helyszin && (
                <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--public-muted)' }}>
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {e.helyszin}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
