import Link from 'next/link'
import { Archive, ArrowRight, ClipboardList } from 'lucide-react'

/**
 * A megyei kezdőoldal BELÉPŐ KÁRTYÁI (2026-08-15, S5–S6).
 *
 * MIÉRT: az irat-archívum és az összesítő ÖNÁLLÓ alútvonalak lettek (a
 * „szint = útvonal" elv szerint), de a fülek közé rejtett link ott a
 * legkevésbé feltűnő, ahol a legfontosabb: az esperes napi két munkája
 * pontosan ez a kettő. Ezért a kezdőoldal tetején, a hero alatt, két nagy,
 * ujjal is kényelmesen célozható kártya vezet beléjük.
 *
 * Design: a gyülekezeti felület nyelve (card-raised, rounded-2xl,
 * emerald/teal), mobilon egymás alatt, teljes szélességben.
 */
export function DioceseBelepoKartyak({ ev }: { ev: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <BelepoKartya
        href="/dashboard-egyhazmegye/iratok"
        ikon={<Archive className="size-5" />}
        cim="Beküldött iratok archívuma"
        leiras="A gyülekezetek véglegesített iratai — mind a hat típus, gyülekezetenként és évekre visszamenőleg."
        szin="emerald"
      />
      <BelepoKartya
        href="/dashboard-egyhazmegye/osszesito"
        ikon={<ClipboardList className="size-5" />}
        cim="Egyházmegyei összesítő"
        leiras={`A(z) ${ev}. évi beküldések megyei összesítése, és a felküldés az egyházkerületnek.`}
        szin="teal"
      />
    </div>
  )
}

function BelepoKartya({
  href,
  ikon,
  cim,
  leiras,
  szin,
}: {
  href: string
  ikon: React.ReactNode
  cim: string
  leiras: string
  szin: 'emerald' | 'teal'
}) {
  const szinek =
    szin === 'emerald'
      ? 'border-emerald-200 hover:border-emerald-300 dark:border-emerald-400/25'
      : 'border-teal-200 hover:border-teal-300 dark:border-teal-400/25'
  const ikonSzin =
    szin === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
      : 'bg-teal-50 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300'
  return (
    <Link
      href={href}
      className={`card-raised group flex items-start gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md ${szinek}`}
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${ikonSzin}`}>
        {ikon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-base text-foreground">{cim}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{leiras}</p>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  )
}
