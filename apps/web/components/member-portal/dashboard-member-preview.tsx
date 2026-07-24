'use client'

import Image from 'next/image'
import {
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Church,
  Clock3,
  Home,
  LockKeyhole,
  Mail,
  MapPin,
  Network,
  Phone,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'

import styles from './dashboard-member-preview.module.css'

const DASHBOARD_THEMES = [
  {
    key: 'elo-kert',
    label: 'Élő kert',
    image: '/public-site/themes/elo-kert/hero.png',
  },
  {
    key: 'csendes-parokia',
    label: 'Csendes parókia',
    image: '/public-site/themes/csendes-parokia/hero.png',
  },
  {
    key: 'zsoltaros-orokseg',
    label: 'Zsoltáros örökség',
    image: '/public-site/themes/zsoltaros-orokseg/hero.png',
  },
] as const

type DashboardThemeKey = (typeof DASHBOARD_THEMES)[number]['key']

const NAV_ITEMS = [
  { href: '#attekintes', label: 'Kezdőlap', shortLabel: 'Kezdőlap', icon: Home },
  { href: '#adataim', label: 'Saját adataim', shortLabel: 'Adataim', icon: UserRound },
  { href: '#csalad', label: 'Családi kapcsolatok', shortLabel: 'Család', icon: Network },
  { href: '#befizetesek', label: 'Saját befizetéseim', shortLabel: 'Befizetés', icon: ReceiptText },
  { href: '#beallitasok', label: 'Beállítások', shortLabel: 'Beállítás', icon: BellRing },
] as const

const PAYMENTS = [
  { date: '2026. június 14.', purpose: 'Egyházfenntartói járulék', amount: '300 lej', status: 'Könyvelve' },
  { date: '2026. április 7.', purpose: 'Egyházfenntartói járulék', amount: '300 lej', status: 'Könyvelve' },
  { date: '2026. február 18.', purpose: 'Szeretetszolgálati adomány', amount: '120 lej', status: 'Könyvelve' },
] as const

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Church />
    </span>
  )
}

function Navigation({ compact = false }: { compact?: boolean }) {
  return (
    <nav
      className={compact ? styles.compactNav : styles.sideNav}
      aria-label={compact ? 'Tagi portál mobil navigáció' : 'Tagi portál navigáció'}
    >
      {!compact && (
        <div className={styles.sideBrand}>
          <BrandMark />
          <div>
            <strong>Tagi portál</strong>
            <span>Kertvárosi Református Egyházközség</span>
          </div>
        </div>
      )}

      <ul>
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon
          return (
            <li key={item.href}>
              <a href={item.href} aria-current={index === 0 ? 'page' : undefined}>
                <Icon aria-hidden="true" />
                <span>{compact ? item.shortLabel : item.label}</span>
                {!compact && <ChevronRight className={styles.navChevron} aria-hidden="true" />}
              </a>
            </li>
          )
        })}
      </ul>

      {!compact && (
        <div className={styles.sidePrivacy}>
          <LockKeyhole aria-hidden="true" />
          <p>
            A portál személyes terület. Csak a saját, jóváhagyott adatai jelennek meg.
          </p>
        </div>
      )}
    </nav>
  )
}

function ThemeSwitcher({
  activeTheme,
  onThemeChange,
}: {
  activeTheme: DashboardThemeKey
  onThemeChange: (theme: DashboardThemeKey) => void
}) {
  return (
    <fieldset className={styles.themeSwitcher}>
      <legend>Fejlesztői téma-előnézet</legend>
      <div className={styles.themeOptions}>
        {DASHBOARD_THEMES.map((theme) => (
          <button
            key={theme.key}
            type="button"
            className={styles.themeButton}
            data-active={activeTheme === theme.key ? '' : undefined}
            aria-pressed={activeTheme === theme.key}
            onClick={() => onThemeChange(theme.key)}
          >
            <span className={styles.themeSwatch} data-swatch={theme.key} aria-hidden="true" />
            <span>{theme.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ProfileSummary() {
  return (
    <section id="adataim" className={`${styles.card} ${styles.profileCard}`} aria-labelledby="profile-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Személyes adatlap</p>
          <h2 id="profile-title">Saját adataim</h2>
        </div>
        <span className={styles.verifiedBadge}>
          <ShieldCheck aria-hidden="true" /> Ellenőrzött
        </span>
      </div>

      <div className={styles.profileIdentity}>
        <span className={styles.avatar} aria-hidden="true">KA</span>
        <div>
          <strong>Kovács Anna</strong>
          <span>Nyilvántartási azonosító: KT–2148</span>
        </div>
      </div>

      <dl className={styles.detailList}>
        <div>
          <dt><Mail aria-hidden="true" /> E-mail-cím</dt>
          <dd>anna.kovacs@example.com</dd>
        </div>
        <div>
          <dt><Phone aria-hidden="true" /> Telefonszám</dt>
          <dd>+40 712 345 678</dd>
        </div>
        <div>
          <dt><MapPin aria-hidden="true" /> Lakcím</dt>
          <dd>Kolozsvár, Minta utca 12.</dd>
        </div>
        <div>
          <dt><CalendarDays aria-hidden="true" /> Születési év</dt>
          <dd>1988</dd>
        </div>
      </dl>

      <button type="button" className={styles.secondaryButton}>
        Adatmódosítás kezdeményezése
        <ChevronRight aria-hidden="true" />
      </button>
      <p className={styles.previewDisclaimer}>Előnézeti gomb — nem indít valódi módosítást.</p>
    </section>
  )
}

function ChangeRequestStatus() {
  return (
    <section className={`${styles.card} ${styles.requestCard}`} aria-labelledby="request-title">
      <div className={styles.requestTopline}>
        <span className={styles.statusIcon}><Clock3 aria-hidden="true" /></span>
        <div>
          <p className={styles.eyebrow}>Beküldött módosítás</p>
          <h2 id="request-title">Lelkipásztori ellenőrzésre vár</h2>
        </div>
      </div>

      <p className={styles.requestSummary}>
        A telefonszám és a lakcím frissítését 2026. július 15-én küldte be.
      </p>

      <ol className={styles.requestSteps} aria-label="Adatmódosítás folyamata">
        <li data-state="complete">
          <span><Check aria-hidden="true" /></span>
          <div><strong>Beküldve</strong><small>2026. július 15.</small></div>
        </li>
        <li data-state="current" aria-current="step">
          <span><Clock3 aria-hidden="true" /></span>
          <div><strong>Ellenőrzés alatt</strong><small>A lelkipásztor átnézi.</small></div>
        </li>
        <li>
          <span>3</span>
          <div><strong>Jóváhagyva</strong><small>Ezután frissül a nyilvántartás.</small></div>
        </li>
      </ol>
      <div className={styles.statusNote} role="status">
        <ShieldCheck aria-hidden="true" />
        <span>A jelenlegi nyilvántartási adatok a jóváhagyásig változatlanok.</span>
      </div>
    </section>
  )
}

function FamilyPreview() {
  return (
    <section id="csalad" className={`${styles.card} ${styles.familyCard}`} aria-labelledby="family-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Kapcsolati előnézet</p>
          <h2 id="family-title">Családi kapcsolatok</h2>
        </div>
        <span className={styles.countBadge}><UsersRound aria-hidden="true" /> 6 személy</span>
      </div>

      <div className={styles.familyTree} role="group" aria-label="Kovács Anna családi kapcsolatainak előnézete">
        <div className={styles.familyGeneration}>
          <article className={styles.familyPerson}>
            <span aria-hidden="true">KS</span><div><strong>Kovács Sándor</strong><small>Édesapa</small></div>
          </article>
          <article className={styles.familyPerson}>
            <span aria-hidden="true">NE</span><div><strong>Nagy Erzsébet</strong><small>Édesanya</small></div>
          </article>
        </div>
        <div className={styles.familyConnector} aria-hidden="true" />
        <div className={`${styles.familyGeneration} ${styles.currentGeneration}`}>
          <article className={styles.familyPerson} data-current>
            <span aria-hidden="true">KA</span><div><strong>Kovács Anna</strong><small>Ön</small></div>
          </article>
          <article className={styles.familyPerson}>
            <span aria-hidden="true">NM</span><div><strong>Nagy Márton</strong><small>Házastárs</small></div>
          </article>
        </div>
        <div className={styles.familyConnector} aria-hidden="true" />
        <div className={styles.familyGeneration}>
          <article className={styles.familyPerson}>
            <span aria-hidden="true">NL</span><div><strong>Nagy Luca</strong><small>Gyermek</small></div>
          </article>
          <article className={styles.familyPerson}>
            <span aria-hidden="true">NB</span><div><strong>Nagy Bence</strong><small>Gyermek</small></div>
          </article>
        </div>
      </div>

      <button type="button" className={styles.textButton}>
        Teljes családfa megtekintése <ChevronRight aria-hidden="true" />
      </button>
      <p className={styles.previewDisclaimer}>Előnézeti gomb — nem nyit meg valódi családfát.</p>
    </section>
  )
}

function PaymentHistory() {
  return (
    <section id="befizetesek" className={`${styles.card} ${styles.paymentsCard}`} aria-labelledby="payments-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Pénzügyi saját nézet</p>
          <h2 id="payments-title">Saját befizetéseim</h2>
        </div>
        <span className={styles.privateBadge}><LockKeyhole aria-hidden="true" /> Csak Ön látja</span>
      </div>

      <div className={styles.paymentSummary}>
        <div><span>2026-ban befizetve</span><strong>720 lej</strong></div>
        <div><span>Utolsó befizetés</span><strong>június 14.</strong></div>
      </div>

      <ul className={styles.paymentList} aria-label="Legutóbbi saját befizetések">
        {PAYMENTS.map((payment) => (
          <li key={`${payment.date}-${payment.purpose}`}>
            <span className={styles.paymentIcon} aria-hidden="true"><ReceiptText /></span>
            <div className={styles.paymentPurpose}>
              <strong>{payment.purpose}</strong>
              <span>{payment.date}</span>
            </div>
            <span className={styles.paymentStatus}><Check aria-hidden="true" /> {payment.status}</span>
            <strong className={styles.paymentAmount}>{payment.amount}</strong>
          </li>
        ))}
      </ul>
      <p className={styles.paymentPrivacy}>
        <ShieldCheck aria-hidden="true" /> A családtagok és más gyülekezeti tagok befizetései ezen a felületen nem jelennek meg.
      </p>
    </section>
  )
}

function NewsletterSettings() {
  const [newsletterEnabled, setNewsletterEnabled] = useState(true)

  return (
    <section id="beallitasok" className={`${styles.card} ${styles.newsletterCard}`} aria-labelledby="newsletter-title">
      <div className={styles.newsletterIcon}><BellRing aria-hidden="true" /></div>
      <div className={styles.newsletterCopy}>
        <p className={styles.eyebrow}>Kapcsolattartás</p>
        <h2 id="newsletter-title">Gyülekezeti hírlevél</h2>
        <p>
          Kérjen értesítést a gyülekezeti alkalmakról, hírekről és fontos közösségi tudnivalókról.
        </p>
        <span className={styles.newsletterAddress}><Mail aria-hidden="true" /> anna.kovacs@example.com</span>
      </div>
      <label className={styles.switchLabel}>
        <span className={styles.switchCopy}>
          <strong>Hírlevél fogadása</strong>
          <small aria-live="polite">{newsletterEnabled ? 'Előnézetben bekapcsolva' : 'Előnézetben kikapcsolva'}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={newsletterEnabled}
          onChange={(event) => setNewsletterEnabled(event.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true"><span /></span>
      </label>
      <p className={styles.previewDisclaimer}>A kapcsoló csak a látványtervben működik, a beállítást nem mentjük.</p>
    </section>
  )
}

export function DashboardMemberPreview() {
  const [activeTheme, setActiveTheme] = useState<DashboardThemeKey>('elo-kert')
  const theme = DASHBOARD_THEMES.find((item) => item.key === activeTheme) ?? DASHBOARD_THEMES[0]

  return (
    <div className={styles.dashboardPage} data-dashboard-theme={activeTheme}>
      <a className={styles.skipLink} href="#dashboard-main">Ugrás a tartalomhoz</a>
      <Navigation />

      <div className={styles.pageColumn}>
        <header className={styles.topBar}>
          <div className={styles.mobileBrand}>
            <BrandMark />
            <div><strong>Tagi portál</strong><span>Kertvárosi Református Egyházközség</span></div>
          </div>
          <span className={styles.previewBadge}>Fejlesztői előnézet • mintaadatok</span>
          <ThemeSwitcher activeTheme={activeTheme} onThemeChange={setActiveTheme} />
        </header>

        <Navigation compact />

        <main id="dashboard-main" className={styles.main} tabIndex={-1}>
          <section id="attekintes" className={styles.heroCard} aria-labelledby="dashboard-title">
            <Image
              key={theme.image}
              className={styles.heroImage}
              src={theme.image}
              alt=""
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 76vw"
              aria-hidden="true"
            />
            <div className={styles.heroOverlay} />
            <div className={styles.heroContent}>
              <p className={styles.heroEyebrow}>Békesség Istentől!</p>
              <h1 id="dashboard-title">Jó reggelt, Anna!</h1>
              <p>Itt egy helyen követheti a személyes gyülekezeti adatait és ügyeit.</p>
              <div className={styles.heroMeta}>
                <span><ShieldCheck aria-hidden="true" /> Jóváhagyott tagi fiók</span>
                <span><CalendarDays aria-hidden="true" /> 2026. július 17., péntek</span>
              </div>
            </div>
          </section>

          <div className={styles.dashboardGrid}>
            <ProfileSummary />
            <ChangeRequestStatus />
            <FamilyPreview />
            <PaymentHistory />
            <NewsletterSettings />
          </div>

          <aside className={styles.privacyBanner} aria-labelledby="privacy-title">
            <span className={styles.privacyIcon}><LockKeyhole aria-hidden="true" /></span>
            <div>
              <h2 id="privacy-title">Az adatai elkülönítve és védetten jelennek meg</h2>
              <p>
                Ezen a személyes felületen kizárólag az Önhöz kapcsolt adatok láthatók. A beküldött módosítás csak lelkipásztori jóváhagyás után kerül a nyilvántartásba.
              </p>
            </div>
          </aside>
        </main>

        <footer className={styles.footer}>
          <span>Kertvárosi Református Egyházközség</span>
          <span>Tagi portál • fejlesztői látványterv</span>
        </footer>
      </div>
    </div>
  )
}
