import Link from 'next/link'
import { Archive, ArrowRight, ClipboardList, Inbox } from 'lucide-react'

/**
 * A kerületi kezdőoldal BELÉPŐ KÁRTYÁI (2026-08-17, S3–S4).
 *
 * MIÉRT: a megyei párja (diocese-belepo-kartyak.tsx) ugyanezt az indokot hordja
 * — a fülek közé rejtett link ott a legkevésbé feltűnő, ahol a legfontosabb.
 * A kerületi hivatal napi három munkája pontosan ez a három út, ezért a
 * kezdőoldal tetején, a hero alatt, nagy, ujjal is kényelmesen célozható
 * kártyák vezetnek beléjük.
 *
 * ⚠️ MIÉRT KÜLÖN KOMPONENS ÉS NEM A MEGYEI PARAMÉTEREZÉSE: a két szint
 * kártyái NEM ugyanazok. A megyénél kettő van (archívum + összesítő), itt
 * három (a felterjesztés-fogadó a harmadik), a feliratok pedig más jogi
 * tartalmat írnak le: a megye a GYÜLEKEZETEK iratait gyűjti, a kerület a
 * MEGYÉK felterjesztéseit ÉS a gyülekezetek továbbított iratait. Egy közös,
 * parametrizált komponens itt csak látszat-megtakarítás lenne, cserébe a két
 * szint feliratai némán összecsúszhatnának.
 *
 * Design: azonos design-nyelv a megyeivel (card-raised, rounded-2xl), de a
 * kerületi szint LILA/indigó színkészletével — a profilválasztó SCOPE_COLOR-ja
 * és a kerületi hero ugyanezt használja.
 */
export function DistrictBelepoKartyak({ ev }: { ev: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <BelepoKartya
        href="/dashboard-kerulet/felterjesztesek"
        ikon={<Inbox className="size-5" />}
        cim="Felterjesztések"
        leiras="Az egyházmegyék hivatalos iratai: átvétel, visszaküldés javításra, és a feloldás-kérelmek elbírálása."
        szin="violet"
      />
      <BelepoKartya
        href="/dashboard-kerulet/iratok"
        ikon={<Archive className="size-5" />}
        cim="Iratok archívuma"
        leiras="A gyülekezetek továbbított iratai és a megyék felterjesztései — évekre visszamenőleg."
        szin="indigo"
      />
      <BelepoKartya
        href="/dashboard-kerulet/osszesito"
        ikon={<ClipboardList className="size-5" />}
        cim="Egyházkerületi összesítő"
        leiras={`A(z) ${ev}. évi megyei felterjesztések kerületi összesítése, nyomtatható ívvel.`}
        szin="purple"
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
  szin: 'violet' | 'indigo' | 'purple'
}) {
  const szinek: Record<typeof szin, string> = {
    violet: 'border-violet-200 hover:border-violet-300 dark:border-violet-400/25',
    indigo: 'border-indigo-200 hover:border-indigo-300 dark:border-indigo-400/25',
    purple: 'border-purple-200 hover:border-purple-300 dark:border-purple-400/25',
  }
  const ikonSzin: Record<typeof szin, string> = {
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300',
  }
  return (
    <Link
      href={href}
      className={`card-raised group flex items-start gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md ${szinek[szin]}`}
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${ikonSzin[szin]}`}>
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
