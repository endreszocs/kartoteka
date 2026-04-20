import Image from 'next/image'
import { SplashScreen } from '@/components/ui/splash-screen'

/**
 * Auth layout — modern split-panel onboarding dizájn.
 *
 * Desktop (lg+): bal oldal a form (max-w-md, center), jobb oldal egy vizuális
 * hero-panel gradient háttérrel, EREK logóval és biblia idézettel.
 *
 * Mobile: csak a form, a hero panel rejtve (helyhiány miatt).
 *
 * Képek: jelenleg gradient + dekoratív orbok (offline-ready). A user később
 * cserélheti templom-fotókra a `public/images/onboarding/` alá.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-slate-50">
      <SplashScreen />

      <div className="lg:grid lg:grid-cols-2 lg:min-h-screen">
        {/* ─── BAL OLDAL — Form ─── */}
        <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:min-h-0">
          <div className="w-full max-w-md space-y-6">
            {/* Mobil logo (csak mobilon látszik, mert desktop-on a jobb panelen van) */}
            <div className="text-center lg:hidden">
              <Image
                src="/EREK.png"
                alt="Kartotéka"
                width={64}
                height={64}
                className="mx-auto mb-3 object-contain drop-shadow-md"
              />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Kartotéka
              </h1>
              <p className="text-xs text-slate-500">
                Erdélyi Református Egyházkerület
              </p>
            </div>

            {children}
          </div>
        </div>

        {/* ─── JOBB OLDAL — Hero panel (csak desktop) ─── */}
        <div className="relative hidden overflow-hidden lg:block">
          {/* Alap gradient */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 20% 30%, rgba(255, 206, 145, 0.25), transparent 40%),
                radial-gradient(circle at 80% 70%, rgba(88, 172, 161, 0.28), transparent 45%),
                linear-gradient(140deg, #0f3f3d 0%, #1a5a55 40%, #103745 100%)
              `,
            }}
          />

          {/* Dekoratív orbok */}
          <div className="absolute left-1/4 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 translate-x-1/2 rounded-full bg-teal-300/10 blur-3xl" />

          {/* Subtle grain texture (SVG inline data URI) */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\'/></filter><rect width=\'100\' height=\'100\' filter=\'url(%23n)\' opacity=\'0.5\'/></svg>")',
            }}
          />

          {/* Tartalom */}
          <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
            {/* Felső: logó + név */}
            <div className="flex items-center gap-3">
              <Image
                src="/EREK.png"
                alt="Kartotéka"
                width={52}
                height={52}
                className="object-contain drop-shadow-lg"
              />
              <div>
                <p className="font-heading text-xl font-semibold">Kartotéka</p>
                <p className="text-xs text-white/60">Pásztori nyilvántartás</p>
              </div>
            </div>

            {/* Középen: biblia idézet */}
            <blockquote className="max-w-md space-y-4">
              <p className="font-heading text-2xl leading-snug text-white/95 xl:text-3xl">
                &bdquo;Az Úr a pásztorom; nem szűkölködöm.
                <br />
                Fűvellő mezőkön legeltet engem, s csendes vizekhez terelget engem.&rdquo;
              </p>
              <footer className="flex items-center gap-3 text-sm text-white/70">
                <div className="h-px w-8 bg-white/40" />
                <span>Zsoltárok 23:1–2</span>
              </footer>
            </blockquote>

            {/* Alján: kerület info */}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Erdélyi Református Egyházkerület
              </p>
              <p className="mt-1 text-sm text-white/70">
                Digitális pásztori nyilvántartás · Áldás kísérje szolgálatodat
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
