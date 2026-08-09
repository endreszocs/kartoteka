import Link from 'next/link'

/**
 * 2026-08-10 — Gyülekezeti oldal 404.
 *
 * Ez a képernyő a `gy/[slug]/layout.tsx` ELŐTT renderelődik (a layout maga
 * dobja a notFound()-ot), tehát NINCSENEK `--public-*` tokenjei. Ezért minden
 * szín inline, fix érték.
 *
 * Amit javít: a régi változat `bg-emerald-50/30` + `text-slate-800` volt, és
 * a `/30` átlátszóság miatt sötét OS-preferenciánál a gyökér layout sötét
 * (#21343a) háttere ütött át — sáros sötétzöld alapon sötétszürke szöveg.
 * A 🕊️ emoji helyett pajzs-motívum, a rendszer többi felületével egy nyelven.
 */
export default function PublicSiteNotFound() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        colorScheme: 'light',
        backgroundColor: '#faf7f0',
        backgroundImage:
          'radial-gradient(120% 90% at 50% 0%, rgba(20, 81, 75, 0.08), transparent 62%)',
        color: '#2c3a33',
      }}
    >
      <div style={{ maxWidth: '30rem', textAlign: 'center' }}>
        <svg
          width="62"
          height="76"
          viewBox="0 0 62 76"
          fill="none"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto 1.5rem' }}
        >
          <path
            d="M31 2 59 10v27c0 17.5-11.6 27.5-28 35C14.6 64.5 3 54.5 3 37V10L31 2Z"
            fill="#ffffff"
            stroke="rgba(20,81,75,0.26)"
            strokeWidth="1.5"
          />
          <path
            d="M31 22v30M20 33h22"
            stroke="#8a6a24"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <p
          style={{
            margin: 0,
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: '#8a6a24',
          }}
        >
          404
        </p>

        <h1
          style={{
            margin: '0.75rem 0 0',
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 'clamp(1.75rem, 1.4rem + 1.8vw, 2.6rem)',
            lineHeight: 1.15,
            fontWeight: 600,
            color: '#22332c',
          }}
        >
          Nincs ilyen gyülekezeti oldal
        </h1>

        <p
          style={{
            margin: '1rem 0 2rem',
            fontSize: '0.98rem',
            lineHeight: 1.7,
            color: 'rgba(44, 58, 51, 0.72)',
          }}
        >
          A keresett oldal nem létezik, vagy még nincs közzétéve. Kérjük,
          ellenőrizze a címet, vagy látogasson el a főoldalra.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '44px',
            padding: '0.8rem 1.6rem',
            borderRadius: '9999px',
            backgroundColor: '#14514b',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.95rem',
            boxShadow: '0 14px 30px -18px rgba(20, 81, 75, 0.9)',
          }}
        >
          Vissza a főoldalra
        </Link>
      </div>
    </div>
  )
}
