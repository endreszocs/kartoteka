import { CalendarDays, MapPin } from 'lucide-react'

import { HU_HONAPOK, bontDatum, formazIdo, formazIdopont, hetNapja } from '@/lib/public-site/esemeny-format'
import type { PublicEsemeny } from '@/lib/public-site/tisztsegek-events-loader'

/**
 * A gyülekezet ÉVES programja — hónapokra bontva (2026-08-27).
 *
 * Endre kérése: „Legyen egy naptár ott is, ahol látszódnak a
 * határidőnaplóban rögzített nyilvános programok leírással együtt."
 *
 * MIÉRT HÓNAP SZERINTI LISTA, NEM 12 HAVI RÁCS
 * ────────────────────────────────────────────
 * Egy hónaprács cellájába a cím sem fér ki, a leírás pedig végképp nem — és
 * a látogatók többsége telefonon nyitja meg (a projekt mobil-first
 * követelménye). A hónapokra bontott, dátum-horgonyos lista telefonon
 * olvasható, nyomtatásban pedig valódi éves programfüzetet ad.
 *
 * Tisztán szerver-renderelt: az adat a kapuzott RPC-ből jön, kliens-JS nélkül.
 */

/** A hétvégi alkalmakat halványan kiemeljük — vasárnap a gyülekezet napja. */
function vasarnap(iso: string): boolean {
  return hetNapja(iso) === 0
}

function honapSzerint(esemenyek: PublicEsemeny[]): Array<{ honap: number; sorok: PublicEsemeny[] }> {
  const vodrok = new Map<number, PublicEsemeny[]>()
  for (const e of esemenyek) {
    const r = bontDatum(e.datum)
    if (!r) continue
    const lista = vodrok.get(r[1])
    if (lista) lista.push(e)
    else vodrok.set(r[1], [e])
  }
  return [...vodrok.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([honap, sorok]) => ({
      honap,
      sorok: sorok.slice().sort((a, b) => {
        if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
        return (a.ido_kezdes || '').localeCompare(b.ido_kezdes || '')
      }),
    }))
}

export function PublicEvNaptar({
  esemenyek,
  ev,
}: {
  esemenyek: PublicEsemeny[]
  ev: number
}) {
  const honapok = honapSzerint(esemenyek)

  if (honapok.length === 0) return null

  return (
    <div className="public-ev-naptar grid gap-6">
      {honapok.map(({ honap, sorok }) => (
        <section key={honap} className="public-panel overflow-hidden">
          <header
            className="flex items-baseline justify-between gap-3 px-5 py-3.5 sm:px-7"
            style={{
              background: 'color-mix(in srgb, var(--public-primary) 8%, transparent)',
              borderBottom: '1px solid var(--public-line, rgba(0,0,0,0.08))',
            }}
          >
            <h3
              className="text-lg sm:text-xl"
              style={{ color: 'var(--public-ink)', fontFamily: 'var(--public-heading-font)' }}
            >
              {HU_HONAPOK[honap - 1]}
            </h3>
            <span className="text-xs tabular-nums" style={{ color: 'var(--public-muted)' }}>
              {ev} · {sorok.length} alkalom
            </span>
          </header>

          <ul>
            {sorok.map((e, idx) => {
              const r = bontDatum(e.datum)
              const nap = r ? r[2] : 0
              const ido = formazIdo(e.ido_kezdes, e.ido_befejezes)
              const tobbnapos = e.datum_vege && e.datum_vege !== e.datum
              const zaroNap = tobbnapos ? bontDatum(e.datum_vege as string) : null

              return (
                <li
                  key={`${e.cim}-${e.datum}-${idx}`}
                  className="flex gap-4 px-5 py-4 sm:gap-5 sm:px-7"
                  style={{
                    borderTop: idx === 0 ? 'none' : '1px solid var(--public-line, rgba(0,0,0,0.07))',
                  }}
                >
                  {/* Dátum-horgony — a lista bal szélén végigfutó ritmus */}
                  <span
                    className="flex w-11 shrink-0 flex-col items-center rounded-xl px-1 py-1.5 text-center sm:w-12"
                    style={{
                      background: vasarnap(e.datum)
                        ? 'color-mix(in srgb, var(--public-accent, #8a6a24) 14%, transparent)'
                        : 'color-mix(in srgb, var(--public-primary) 7%, transparent)',
                    }}
                    aria-hidden="true"
                  >
                    <span
                      className="text-lg font-semibold leading-none tabular-nums sm:text-xl"
                      style={{ color: 'var(--public-ink)' }}
                    >
                      {nap}
                    </span>
                    {zaroNap && (
                      <span
                        className="mt-0.5 text-[0.6rem] leading-none tabular-nums"
                        style={{ color: 'var(--public-muted)' }}
                      >
                        –{zaroNap[2]}.
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[1.02rem] leading-snug"
                      style={{ color: 'var(--public-ink)', fontFamily: 'var(--public-heading-font)' }}
                    >
                      {e.egyedi_emoji ? `${e.egyedi_emoji} ` : ''}
                      {e.cim}
                    </p>

                    <p
                      className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                      style={{ color: 'var(--public-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                        {/* ⚠️ A bal oldali nagy szám `aria-hidden`, tehát a
                            képernyőolvasó KÜLÖN kell megkapja a teljes
                            dátumot — enélkül csak az időt hallaná, dátum
                            nélkül. A látó felhasználónak a horgony elég. */}
                        <time dateTime={e.datum} className="sr-only">
                          {formazIdopont(e)}
                        </time>
                        <span aria-hidden="true">{ido || 'egész napos'}</span>
                      </span>
                      {e.helyszin && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                          {e.helyszin}
                        </span>
                      )}
                    </p>

                    {e.leiras && (
                      <p
                        className="mt-2 text-sm leading-relaxed"
                        style={{ color: 'var(--public-muted)' }}
                      >
                        {e.leiras}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
