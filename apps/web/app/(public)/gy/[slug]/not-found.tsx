import Link from 'next/link'

export default function PublicSiteNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-emerald-50/30">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🕊️</div>
        <h1 className="text-3xl font-serif text-slate-800 mb-3">
          Nincs ilyen gyülekezeti oldal
        </h1>
        <p className="text-slate-600 mb-6">
          A keresett oldal nem létezik, vagy még nincs közzétéve.
          Kérjük, ellenőrizze a címet, vagy látogasson el a főoldalra.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
        >
          Vissza a főoldalra
        </Link>
      </div>
    </div>
  )
}
