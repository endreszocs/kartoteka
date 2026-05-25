import Image from 'next/image'
import { LogOut } from 'lucide-react'

import { signOut } from '@/app/(dashboard)/actions'

export default function ValasszProfiltLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-amber-50 via-white to-teal-50">
      {/* Dekoratív háttér-foltok */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 size-72 rounded-full bg-amber-200/40 blur-3xl sm:size-96" />
        <div className="absolute -right-32 top-1/3 size-72 rounded-full bg-indigo-200/30 blur-3xl sm:size-96" />
        <div className="absolute -bottom-32 left-1/4 size-72 rounded-full bg-teal-200/30 blur-3xl sm:size-96" />
      </div>

      {/* Header */}
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-md sm:size-11">
              <Image
                src="/KARTOTEKA_V3.png"
                alt="Kartotéka logó"
                width={36}
                height={36}
                priority
                className="size-7 sm:size-9"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70 sm:text-[11px] sm:tracking-[0.24em]">
                Kartotéka
              </p>
              <h1 className="font-heading text-base text-slate-800 sm:text-xl">
                Profil választás
              </h1>
            </div>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-white/80 px-2.5 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50 sm:px-3"
              title="Kijelentkezés"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Kijelentkezés</span>
            </button>
          </form>
        </div>
      </header>

      {/* Fő tartalom */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 md:py-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/60 bg-white/50 py-5 text-center text-xs text-slate-500 backdrop-blur-sm sm:py-6">
        <p>KARTOTEKA · EREK · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
