import Image from 'next/image'

interface MuhelyPageIntroProps {
  eyebrow: string
  title: string
  description: string
  imageSrc: string
  imageAlt?: string
  children?: React.ReactNode
}

export function MuhelyPageIntro({
  eyebrow,
  title,
  description,
  imageSrc,
  imageAlt = '',
  children,
}: MuhelyPageIntroProps) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2rem_1.4rem_2.2rem_1.6rem] border border-[#dfd2be] bg-[#fffdf7] px-5 py-7 shadow-[0_18px_50px_-32px_rgba(57,47,34,0.55)] sm:px-8 sm:py-9 lg:min-h-[270px] lg:px-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-65"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 16%, rgba(211,164,94,.16), transparent 26%), radial-gradient(circle at 82% 74%, rgba(100,122,82,.12), transparent 32%), repeating-linear-gradient(0deg, rgba(72,61,44,.025) 0, rgba(72,61,44,.025) 1px, transparent 1px, transparent 5px)',
        }}
      />

      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d9c8ab] bg-[#f4ebdd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#647a52]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d3a45e]" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="font-heading text-3xl leading-[1.06] text-[#26382f] sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5f655d] sm:text-base">
            {description}
          </p>
          {children && <div className="mt-6">{children}</div>}
        </div>

        <div className="pointer-events-none relative hidden h-48 lg:block" aria-hidden="true">
          <div className="absolute inset-2 rounded-[45%] bg-[#e8dcc9]/60 blur-2xl" />
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="280px"
            className="object-contain opacity-90 drop-shadow-[0_16px_20px_rgba(65,56,42,0.12)]"
          />
        </div>
      </div>
    </section>
  )
}
