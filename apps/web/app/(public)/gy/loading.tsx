/**
 * 2026-08-10 — A gyülekezeti oldalak HIDEG betöltésének fallbackje.
 *
 * A `gy/[slug]/layout.tsx` maga is `await`-el (public_site_context RPC), ezért
 * amíg fut, a legközelebbi Suspense-határ jelenik meg. Korábban ez a gyökér
 * `app/loading.tsx` volt → a látogatót a Kartotéka termék-logója fogadta
 * teal/amber kártyán, a gyülekezeti oldal helyett.
 *
 * FIGYELEM: a `loading.tsx` NEM kap paramétert (nincs slug), tehát innen a
 * gyülekezet címere nem tölthető be. Ezért itt egy semleges, krém alapú,
 * pajzs-motívumos képernyő fogad; a gyülekezet SAJÁT címere a layout
 * betöltése után azonnal megjelenik (lásd PublicSiteSplash).
 *
 * A színek szándékosan inline-ok: ez a komponens a `.public-site-root`-on
 * KÍVÜL renderelődik, tehát nincsenek `--public-*` tokenjei, és a gyökér
 * layout sötét módja sem üthet át rajta.
 */
export default function PublicSiteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        colorScheme: 'light',
        backgroundColor: '#faf7f0',
        backgroundImage:
          'radial-gradient(120% 90% at 50% 0%, rgba(20, 81, 75, 0.07), transparent 60%)',
        color: '#2c3a33',
      }}
    >
      {/* Pajzs-körvonal — a gyülekezeti címer helye, nem termék-logó */}
      <svg
        width="76"
        height="92"
        viewBox="0 0 76 92"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <path
          d="M38 3 71 13v33c0 21-14 33-33 43C19 79 5 67 5 46V13L38 3Z"
          fill="#ffffff"
          stroke="rgba(20,81,75,0.28)"
          strokeWidth="1.5"
        />
        <path
          d="M38 27v34M25 40h26"
          stroke="#8a6a24"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <div>
        <p
          style={{
            margin: 0,
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: '#8a6a24',
          }}
        >
          Gyülekezeti oldal
        </p>
        <p
          style={{
            margin: '0.55rem 0 0',
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 'clamp(1.5rem, 1.2rem + 1.3vw, 2.2rem)',
            lineHeight: 1.15,
            color: '#22332c',
          }}
        >
          Betöltés folyamatban
        </p>
      </div>

      <span
        aria-hidden="true"
        style={{
          display: 'block',
          height: '1px',
          width: '10rem',
          overflow: 'hidden',
          borderRadius: '9999px',
          backgroundColor: 'rgba(44, 58, 51, 0.14)',
        }}
      >
        <span className="public-cold-beam" />
      </span>

      <p
        style={{
          margin: 0,
          fontSize: '0.7rem',
          letterSpacing: '0.05em',
          color: 'rgba(44, 58, 51, 0.5)',
        }}
      >
        Működik a Kartotéka rendszerrel
      </p>

      <style>{`
        .public-cold-beam {
          display: block;
          height: 100%;
          width: 34%;
          border-radius: 9999px;
          background: linear-gradient(90deg, transparent, #8a6a24, transparent);
          animation: public-cold-beam 1.4s ease-in-out infinite;
        }
        @keyframes public-cold-beam {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(320%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .public-cold-beam { animation: none; width: 100%; opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
