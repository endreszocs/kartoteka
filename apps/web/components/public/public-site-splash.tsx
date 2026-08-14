import { PublicCrest } from './public-crest'

/**
 * 2026-08-10 — A gyülekezeti oldal saját betöltő-képernyője.
 *
 * Korábban a látogató a Kartotéka termék-logóját látta teal/amber kártyán
 * (app/loading.tsx → RouteLoadingScreen). Itt a GYÜLEKEZET címere és neve
 * fogadja, a választott téma színeivel; ha nincs feltöltött címer, a
 * Kartotéka-jel a tartalék, és ha az is elhasal, a névkezdőbetűs monogram.
 *
 * Feloldási lánc: public_sites.crest_image_url → /kartoteka-logo.png →
 * monogram a téma színátmenetén.
 */
export function PublicSiteSplash({
  crestUrl,
  displayName,
  tagline,
  label = 'Az oldal betöltése folyamatban van',
}: {
  crestUrl?: string | null
  displayName: string
  tagline?: string | null
  label?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-24 text-center"
    >
      <PublicCrest
        src={crestUrl || '/kartoteka-logo.png'}
        name={displayName}
        size={96}
        shape="shield"
        className="public-anim-scale-in"
      />

      <p
        className="mt-7 text-[0.68rem] font-semibold uppercase tracking-[0.26em]"
        style={{ color: 'var(--public-accent-ink, #8a6a24)' }}
      >
        Gyülekezeti oldal
      </p>
      <p
        className="mt-2 max-w-xl text-[clamp(1.35rem,1.1rem+1.1vw,2rem)] leading-tight"
        style={{
          color: 'var(--public-ink, #294853)',
          fontFamily: 'var(--public-heading-font, Georgia, serif)',
        }}
      >
        {displayName}
      </p>
      {tagline && (
        <p
          className="mt-3 max-w-md text-sm italic"
          style={{ color: 'var(--public-muted, #66848c)' }}
        >
          &bdquo;{tagline}&rdquo;
        </p>
      )}

      {/* Hajszálvékony, végtelen töltősáv — nem ugráló pöttyök */}
      <span
        aria-hidden="true"
        className="public-splash-track mt-8 block h-px w-40 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--public-line, rgba(0,0,0,0.12))' }}
      >
        <span className="public-splash-beam block h-full w-1/3" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}
