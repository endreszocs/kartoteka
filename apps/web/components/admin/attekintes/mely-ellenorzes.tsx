'use client'

/**
 * Mélyebb ellenőrzés — CSAK GOMBRA fut (2026-08-12).
 *
 * ⚠️ MIÉRT NEM FUT OLDALBETÖLTÉSKOR. A `runQualityCheck` a TELJES `szemely`
 * állományt lapozza végig (1000-es lapok, 40-es gyülekezet-kötegek). Ha ez
 * minden admin-belépéskor elindulna, az áttekintő percekig töltene, vagy
 * időtúllépéssel bukna — telefonon biztosan. Ezért a lelkész maga dönti el,
 * mikor van rá ideje, és a gomb KIMONDJA, hogy sokáig tarthat.
 */

import { useState, useTransition } from 'react'
import { ClipboardCheck, Loader2 } from 'lucide-react'

import { runQualityCheck } from '@/app/(dashboard)/admin/actions'
import { huOraPercBukarest } from '@/lib/utils/idopont-bukarest'

interface Sor {
  congName: string
  missingCnp: number
  missingGender: number
  missingBirthdate: number
}

export function MelyEllenorzes() {
  const [pending, startTransition] = useTransition()
  const [sorok, setSorok] = useState<Sor[] | null>(null)
  const [osszesen, setOsszesen] = useState<{ cnp: number; nem: number; szul: number } | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [futottAt, setFutottAt] = useState<string | null>(null)

  function indit() {
    setHiba(null)
    startTransition(async () => {
      try {
        const r = await runQualityCheck()
        setSorok(r.data)
        setOsszesen({
          cnp: r.totals.missingCnp,
          nem: r.totals.missingGender,
          szul: r.totals.missingBirthdate,
        })
        // 2026-08-12: a KÖZÖS, Europe/Bucharest-re szögezett formázó. A böngésző
        // zónája a lelkész gépén rendszerint stimmel, de nem garantált — az
        // egész rendszerben egyetlen zóna szerint írjuk ki az időt.
        setFutottAt(huOraPercBukarest(new Date()))
      } catch (e) {
        // ⚠️ Időtúllépésnél SEM írunk „0 hibát" — kimondjuk, hogy nem futott le.
        setSorok(null)
        setOsszesen(null)
        setHiba(
          e instanceof Error
            ? `Az ellenőrzés nem futott le: ${e.message}`
            : 'Az ellenőrzés nem futott le. Próbáld meg később.',
        )
      }
    })
  }

  return (
    <section className="card-raised p-4">
      {/* 2026-08-12: alacsony LÁBLÉC-SÁV lett belőle. A cím, a magyarázat és a
          gomb széles képernyőn EGY sorban fut — korábban három sor magas,
          teljes szélességű kártya volt a lap alján, ~170 px-ért. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-base text-foreground">Mélyebb ellenőrzés</h2>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            A teljes tagnyilvántartást átnézi, ezért percekig is eltarthat. Nem indul el magától —
            akkor futtasd, amikor van rá időd.
          </p>
        </div>

        <button
          type="button"
          onClick={indit}
          disabled={pending}
          className="kt-fokusz inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-60"
          aria-label="Tagnyilvántartási adatminőség ellenőrzésének indítása"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ClipboardCheck className="size-4" aria-hidden />
          )}
          {pending ? 'Ellenőrzés folyamatban… (akár 1-2 perc)' : 'Adatminőség ellenőrzése'}
        </button>
      </div>

      {hiba && (
        <p
          role="alert"
          className="mt-3 rounded-xl border-2 border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-sm text-foreground"
        >
          {hiba}
        </p>
      )}

      {sorok && osszesen && (
        <div className="mt-4">
          <p className="text-sm text-foreground">
            Ellenőrizve{futottAt ? `: ma ${futottAt}` : ''} — hiányzó CNP:{' '}
            <strong className="tabular-nums">{osszesen.cnp.toLocaleString('hu-HU')}</strong>, hiányzó
            nem: <strong className="tabular-nums">{osszesen.nem.toLocaleString('hu-HU')}</strong>,
            hiányzó születési dátum:{' '}
            <strong className="tabular-nums">{osszesen.szul.toLocaleString('hu-HU')}</strong>.
          </p>
          {sorok.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Egyetlen gyülekezetnél sem találtam hiányzó mezőt.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Gyülekezet</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">CNP</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Nem</th>
                    <th scope="col" className="py-2 text-right font-semibold">Szül. dátum</th>
                  </tr>
                </thead>
                <tbody>
                  {sorok.slice(0, 25).map((s) => (
                    <tr key={s.congName} className="border-b border-border/60">
                      <td className="py-2 pr-3 text-foreground">{s.congName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{s.missingCnp}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{s.missingGender}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">{s.missingBirthdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sorok.length > 25 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  +{sorok.length - 25} további gyülekezet — a teljes lista a Gyülekezetek oldalon
                  nézhető át.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
