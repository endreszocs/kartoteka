import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { AccessRequestForm } from '@/components/public/access-request-form'

export const metadata = {
  title: 'Hozzáférés kérése — Kartotéka',
  description:
    'Hozzáférés-kérelem az Erdélyi Református Egyházkerület Kartotéka rendszeréhez. Lelkészek, esperesek, egyházmegyei vezetők számára.',
}

export default function AccessRequestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-amber-50/30">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
          >
            <ArrowLeft className="size-4" />
            Belépés
          </Link>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700/80">
              Kartotéka
            </p>
            <p className="text-[10px] text-slate-500">Erdélyi Református Egyházkerület</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-700">
            Hozzáférés kérelme
          </p>
          <h1 className="mt-3 font-heading text-3xl md:text-4xl font-bold text-slate-900">
            Csatlakozzon a Kartotéka rendszerhez
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 max-w-2xl mx-auto">
            A rendszer új felhasználóit az egyházkerületi rendszergazda hagyja jóvá. Kérjük,
            töltse ki az alábbi űrlapot — válaszra általában 1-3 munkanap alatt számíthat.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          {/* Űrlap */}
          <div className="rounded-2xl bg-white p-6 md:p-8 shadow-sm ring-1 ring-slate-200/60">
            <AccessRequestForm />
          </div>

          {/* Magyarázó oldalsáv */}
          <aside className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-teal-50/60 p-5 ring-1 ring-teal-200/60">
              <h3 className="font-heading text-base font-semibold text-teal-900">
                Mit várhat a jóváhagyás után?
              </h3>
              <ol className="mt-3 space-y-2 list-decimal list-inside text-[13px] text-teal-900/80 leading-relaxed">
                <li>A rendszergazda átnézi a kérelmét</li>
                <li>Email-ben kap választ (1-3 munkanap)</li>
                <li>Ha elfogadott, kap egy belépési linket</li>
                <li>Beállítja jelszavát, és használhatja</li>
              </ol>
            </div>

            <div className="rounded-2xl bg-amber-50/60 p-5 ring-1 ring-amber-200/60">
              <h3 className="font-heading text-base font-semibold text-amber-900">
                Miért nem lehet közvetlenül regisztrálni?
              </h3>
              <p className="mt-2 text-[13px] text-amber-900/80 leading-relaxed">
                A Kartotéka érzékeny gyülekezeti adatokat kezel. A rendszergazda ellenőrzi, hogy
                a kérelmezőt valóban a megjelölt gyülekezet/egyházmegye delegálja. Ez
                biztonsági és szervezeti követelmény.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/60">
              <h3 className="font-heading text-base font-semibold text-slate-900">
                Már van fiókja?
              </h3>
              <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">
                Lépjen be közvetlenül:
              </p>
              <Link
                href="/login"
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                Belépés →
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          Erdélyi Református Egyházkerület · Kartotéka rendszer ·{' '}
          <Link href="/login" className="hover:text-slate-700 underline">
            Bejelentkezés
          </Link>
        </p>
      </main>
    </div>
  )
}
