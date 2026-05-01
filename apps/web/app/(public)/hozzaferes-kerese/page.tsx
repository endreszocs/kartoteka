import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ClipboardCheck, Hourglass, KeyRound } from 'lucide-react'

import { AccessRequestForm } from '@/components/public/access-request-form'
import { AuthFooterLinks } from '@/components/auth/auth-footer-links'

export const metadata = {
  title: 'Hozzáférés kérése — Kartotéka',
  description:
    'Hozzáférés-kérelem az Erdélyi Református Egyházkerület Kartotéka rendszeréhez. Lelkészek, esperesek, egyházmegyei vezetők számára.',
}

const STEPS = [
  {
    Icon: ClipboardCheck,
    title: 'Töltse ki az űrlapot',
    desc: 'Adja meg az adatait, gyülekezetét és szolgálati szerepkörét — mindössze pár perc.',
  },
  {
    Icon: Hourglass,
    title: 'Várja meg a jóváhagyást',
    desc: 'A kerületi rendszergazda 1–3 munkanapon belül átnézi és e-mailen válaszol.',
  },
  {
    Icon: KeyRound,
    title: 'Lépjen be a rendszerbe',
    desc: 'Jóváhagyás után belépési linket kap — beállítja jelszavát és kezdheti is.',
  },
]

export default function AccessRequestPage() {
  return (
    <div className="kt-auth-page">
      <div aria-hidden className="kt-auth-vignette" />

      <div className="kt-auth-shell">
        {/* Brand top-left + "← Belépés" link a jobbra */}
        <header className="kt-auth-brand-row">
          <div className="kt-auth-brand">
            <div className="kt-auth-brand-logo">
              <Image
                src="/KARTOTEKA_V3.png"
                alt="Kartotéka logó"
                width={56}
                height={56}
                priority
              />
            </div>
            <div className="kt-auth-brand-text">
              <span className="kt-auth-brand-name">KARTOTÉKA</span>
              <span className="kt-auth-brand-tag">Egyházi nyilvántartó rendszer</span>
            </div>
          </div>

          <Link href="/login" className="kt-auth-back-link">
            <ArrowLeft className="size-4" strokeWidth={1.7} />
            Vissza a bejelentkezéshez
          </Link>
        </header>

        {/* Main 2-column */}
        <main className="kt-auth-main">
          {/* Bal oldal — kreatív bemutatás */}
          <div className="kt-auth-left">
            <h1 className="kt-auth-greeting">Csatlakozzon hozzánk!</h1>
            <p className="kt-auth-lede">
              A Kartotéka rendszerhez új felhasználókat az egyházkerületi rendszergazda
              hagy jóvá — biztonságos és átlátható módon. A folyamat egyszerű:
            </p>

            <div className="kt-auth-features">
              {STEPS.map(({ Icon, title, desc }, i) => (
                <div
                  key={title}
                  className="kt-auth-feature"
                  style={{ animationDelay: `${0.3 + i * 0.12}s` }}
                >
                  <div className="kt-auth-feat-ico kt-auth-step-num" aria-hidden>
                    <Icon className="size-[22px]" strokeWidth={1.6} />
                    <span className="kt-auth-step-badge">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="kt-auth-feat-title">{title}</h3>
                    <p className="kt-auth-feat-desc">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="kt-auth-verse">
              <p className="kt-auth-verse-text">
                <BookOpen className="kt-auth-verse-ico" strokeWidth={1.5} aria-hidden />
                „Mert ahol ketten vagy hárman összegyűlnek az én nevemben, ott vagyok közöttük."
              </p>
              <span className="kt-auth-verse-ref">Máté 18,20</span>
            </div>
          </div>

          {/* Jobb oldal — Hozzáférés-kérő card */}
          <div className="kt-auth-right">
            <div className="kt-auth-card">
              <div className="kt-auth-card-header">
                <p className="kt-auth-card-eyebrow">Hozzáférés kérelme</p>
                <h2 className="kt-auth-card-title">Adatok megadása</h2>
                <p className="kt-auth-card-desc">
                  Az alábbi mezőket kérjük kitölteni — kérdés esetén keressen meg
                  minket bizalommal a fórumon vagy email-ben.
                </p>
              </div>
              <AccessRequestForm />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="kt-auth-footer">
          <AuthFooterLinks
            extraLeading={
              <Link href="/login" className="kt-auth-footer-link">Belépés</Link>
            }
          />
          <div>© {new Date().getFullYear()} Kartotéka — Erdélyi Református Egyházkerület</div>
        </footer>
      </div>
    </div>
  )
}
