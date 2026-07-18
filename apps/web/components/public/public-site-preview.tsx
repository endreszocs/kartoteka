'use client'

import Link from 'next/link'
import {
  Church,
  Clock3,
  HandHeart,
  Sparkles,
} from 'lucide-react'
import { useState, type CSSProperties, type MouseEvent } from 'react'

import type {
  PublicPostListItem,
  PublicSiteData,
} from '@/lib/public-site/site-loader'
import {
  resolveThemeColors,
  type PublicSiteTheme,
} from '@/lib/public-site/theme-presets'
import {
  PUBLIC_VISUAL_THEMES,
  type PublicVisualThemeKey,
} from '@/lib/public-site/visual-theme-registry'

import { PublicHero } from './public-hero'
import { PublicHomeHighlights } from './public-home-highlights'
import { PublicHomeVisualStory } from './public-home-visual-story'
import { PublicPostCard } from './public-post-card'
import { PublicSectionHeader } from './public-section-header'
import { PublicServiceTimes } from './public-service-times'
import { PublicSiteCinematicPreview } from './public-site-cinematic-preview'
import { PublicSiteFooter } from './public-site-footer'
import { PublicSiteHeader } from './public-site-header'
import { PublicThemeRoot } from './public-theme-root'
import styles from './public-site-preview.module.css'

const PREVIEW_SLUG = 'dev-preview/public-site'
const CINEMATIC_MODE = 'baratosi-cinematic' as const

type PreviewMode = typeof CINEMATIC_MODE | PublicVisualThemeKey

const PREVIEW_MODE_OPTIONS: readonly {
  key: PreviewMode
  displayName: string
  eyebrow: string
  image: string
  featured?: boolean
}[] = [
  {
    key: CINEMATIC_MODE,
    displayName: 'Barátosi film',
    eyebrow: 'Új · elsődleges koncepció',
    image: '/public-site/themes/elo-kert/baratosi-hero-v2.png',
    featured: true,
  },
  {
    key: 'elo-kert',
    displayName: PUBLIC_VISUAL_THEMES['elo-kert'].displayName,
    eyebrow: PUBLIC_VISUAL_THEMES['elo-kert'].adminPreview.eyebrow,
    image: PUBLIC_VISUAL_THEMES['elo-kert'].assets.hero,
  },
  {
    key: 'csendes-parokia',
    displayName: PUBLIC_VISUAL_THEMES['csendes-parokia'].displayName,
    eyebrow: PUBLIC_VISUAL_THEMES['csendes-parokia'].adminPreview.eyebrow,
    image: PUBLIC_VISUAL_THEMES['csendes-parokia'].assets.hero,
  },
  {
    key: 'zsoltaros-orokseg',
    displayName: PUBLIC_VISUAL_THEMES['zsoltaros-orokseg'].displayName,
    eyebrow: PUBLIC_VISUAL_THEMES['zsoltaros-orokseg'].adminPreview.eyebrow,
    image: PUBLIC_VISUAL_THEMES['zsoltaros-orokseg'].assets.hero,
  },
]

const PREVIEW_THEMES: Readonly<Record<PublicVisualThemeKey, PublicSiteTheme>> = {
  'elo-kert': {
    id: 'preview-elo-kert',
    preset_key: 'elo-kert',
    display_name: 'Élő kert',
    description: 'Friss, közösségi és eseményközpontú megjelenés.',
    colors: {
      primary: '#1f6b4f',
      accent: '#e5a64a',
      surface: '#fbfdf8',
      ink: '#17352b',
      muted: '#60756b',
      soft: '#edf5ee',
    },
    typography: { heading_font: 'Fraunces', body_font: 'Inter' },
    hero_style: 'photo',
    border_radius: '1.5rem',
    sort_order: 5,
    is_active: true,
  },
  'csendes-parokia': {
    id: 'preview-csendes-parokia',
    preset_key: 'csendes-parokia',
    display_name: 'Csendes parókia',
    description: 'Nyugodt, emberközeli felület finom, otthonos részletekkel.',
    colors: {
      primary: '#6d5542',
      accent: '#c7925b',
      surface: '#fffbf4',
      ink: '#35281f',
      muted: '#7f7165',
      soft: '#f4ebdd',
    },
    typography: {
      heading_font: 'Cormorant Garamond',
      body_font: 'Inter',
    },
    hero_style: 'photo',
    border_radius: '1.125rem',
    sort_order: 6,
    is_active: true,
  },
  'zsoltaros-orokseg': {
    id: 'preview-zsoltaros-orokseg',
    preset_key: 'zsoltaros-orokseg',
    display_name: 'Zsoltáros örökség',
    description: 'Szerkesztőségi ritmusú, elegáns és örökségközpontú stílus.',
    colors: {
      primary: '#1f344a',
      accent: '#b7985f',
      surface: '#fcfaf5',
      ink: '#1d2832',
      muted: '#66717c',
      soft: '#ece8dd',
    },
    typography: {
      heading_font: 'Cormorant Garamond',
      body_font: 'Inter',
    },
    hero_style: 'photo',
    border_radius: '0.5rem',
    sort_order: 7,
    is_active: true,
  },
}

const PREVIEW_POSTS: readonly PublicPostListItem[] = [
  {
    id: 'preview-family-day',
    slug: 'nyari-csaladi-nap',
    title: 'Nyári családi nap a gyülekezetben',
    excerpt:
      'Közös énekléssel, gyermekprogramokkal és szeretetvendégséggel várunk minden korosztályt.',
    cover_image_url: null,
    published_at: '2026-07-14T09:00:00.000Z',
    author_name: null,
  },
  {
    id: 'preview-thanksgiving',
    slug: 'halaadas-szolgalatainkert',
    title: 'Hálaadás az elmúlt szolgálatokért',
    excerpt:
      'Együtt tekintünk vissza közösségünk tavaszi alkalmaira, és megköszönjük önkénteseink szolgálatát.',
    cover_image_url: null,
    published_at: '2026-07-09T09:00:00.000Z',
    author_name: null,
  },
  {
    id: 'preview-bible-week',
    slug: 'gyermek-bibliahet',
    title: 'Gyermek-bibliahét: együtt növekedünk',
    excerpt:
      'Öt délelőtt történetekkel, játékkal és alkotással — biztonságos, szeretetteljes közösségben.',
    cover_image_url: null,
    published_at: '2026-07-03T09:00:00.000Z',
    author_name: null,
  },
]

type PublicThemeStyle = CSSProperties & Record<`--public-${string}`, string>

function buildPreviewThemeStyle(theme: PublicSiteTheme): PublicThemeStyle {
  const colors = resolveThemeColors(theme)
  const headingFont =
    theme.typography.heading_font === 'Fraunces'
      ? '"Fraunces", Georgia, serif'
      : '"Cormorant Garamond", Georgia, serif'

  return {
    '--public-primary': colors.primary,
    '--public-primary-on-surface': colors.primaryOnSurface,
    '--public-accent': colors.accent,
    '--public-accent-on-surface': colors.accentOnSurface,
    '--public-accent-strong': colors.accentStrong,
    '--public-surface': colors.surface,
    '--public-ink': colors.ink,
    '--public-muted': colors.muted,
    '--public-muted-on-surface': colors.mutedOnSurface,
    '--public-soft': colors.soft,
    '--public-heading-font': headingFont,
    '--public-body-font': '"Inter", "Geist Variable", system-ui, sans-serif',
    '--public-radius': theme.border_radius,
  }
}

function buildPreviewSite(theme: PublicSiteTheme): PublicSiteData {
  return {
    id: 'preview-public-site',
    congregation_id: 'preview-congregation',
    slug: PREVIEW_SLUG,
    display_name: 'Barátosi Református Egyházközség',
    tagline: 'Hitben, reménységben, közösségben.',
    hero_image_url: null,
    crest_image_url: null,
    theme,
    custom_primary_color: null,
    custom_accent_color: null,
    contact_email: 'kapcsolat@pelda.hu',
    contact_phone: '+40 000 000 000',
    address: 'Barátos · bemutató címadat',
    about_html: null,
    service_times: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        day: 'Vasárnap',
        time: '10:00',
        title: 'Főistentisztelet',
        location: 'Református templom',
        note: 'Gyermekekkel együtt is szeretettel várunk.',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        day: 'Szerda',
        time: '18:00',
        title: 'Bibliaóra',
        location: 'Gyülekezeti terem',
        note: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        day: 'Péntek',
        time: '19:00',
        title: 'Ifjúsági alkalom',
        location: 'Gyülekezeti terem',
        note: null,
      },
    ],
    robots_index: false,
    show_member_count: true,
    show_presbyter_count: true,
    show_family_count: true,
    show_age_distribution: true,
    override_member_count: null,
    override_presbyter_count: null,
    override_family_count: null,
  }
}

function keepPreviewNavigationLocal(event: MouseEvent<HTMLDivElement>) {
  const target = event.target
  if (!(target instanceof Element)) return

  const link = target.closest('a')
  const href = link?.getAttribute('href')
  if (!href || href.startsWith('#')) return

  event.preventDefault()
}

export function PublicSitePreview() {
  const [activeMode, setActiveMode] = useState<PreviewMode>(CINEMATIC_MODE)
  const isCinematic = activeMode === CINEMATIC_MODE
  const activeTheme: PublicVisualThemeKey = isCinematic ? 'elo-kert' : activeMode
  const theme = PREVIEW_THEMES[activeTheme]
  const site = buildPreviewSite(theme)
  const activeModeLabel = PREVIEW_MODE_OPTIONS.find(
    (option) => option.key === activeMode,
  )?.displayName

  return (
    <div className={styles.previewPage}>
      <aside className={styles.previewToolbar} aria-label="Látványterv vezérlőpult">
        <div className={styles.toolbarInner}>
          <div className={styles.toolbarIntro}>
            <span className={styles.previewBadge}>Fejlesztői előnézet</span>
            <div>
              <p className={styles.toolbarTitle}>Nyilvános gyülekezeti weboldal</p>
              <p className={styles.toolbarNote}>
                Mintaadatok · a navigáció nem aktív · nincs adatbázis-művelet
              </p>
            </div>
          </div>

          <div className={styles.themePicker} role="group" aria-label="Látványterv kiválasztása">
            {PREVIEW_MODE_OPTIONS.map((option) => {
              const selected = activeMode === option.key

              return (
                <button
                  key={option.key}
                  type="button"
                  className={styles.themeButton}
                  data-active={selected || undefined}
                  data-featured={option.featured || undefined}
                  aria-pressed={selected}
                  onClick={() => setActiveMode(option.key)}
                >
                  <span
                    className={styles.themeThumbnail}
                    style={{ backgroundImage: `url(${option.image})` }}
                    aria-hidden="true"
                  />
                  <span className={styles.themeButtonCopy}>
                    <strong>{option.displayName}</strong>
                    <small>{option.eyebrow}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <div
        className={styles.themeBoundary}
        style={buildPreviewThemeStyle(theme)}
        onClickCapture={keepPreviewNavigationLocal}
      >
        {isCinematic ? (
          <PublicSiteCinematicPreview site={site} />
        ) : (
          <PublicThemeRoot presetKey={activeTheme}>
          <a className={styles.skipLink} href="#public-preview-main">
            Ugrás a fő tartalomra
          </a>

          <PublicSiteHeader site={site} memberPortalEnabled />

          <main id="public-preview-main" tabIndex={-1} className="flex-1 focus:outline-none">
            <PublicHero site={site} />
            <PublicHomeHighlights site={site} />

            <section className="public-section" id="hirek">
              <div className="public-container">
                <PublicSectionHeader
                  eyebrow="Közösségünk életéből"
                  title="Legfrissebb hírek"
                  subtitle="A nyilvános oldal legfontosabb hírei mobilon gyorsan áttekinthetők, nagyobb képernyőn pedig kényelmes kártyarácsba rendeződnek."
                />

                <div className={styles.postGrid}>
                  {PREVIEW_POSTS.map((post) => (
                    <PublicPostCard
                      key={post.id}
                      post={post}
                      slug={PREVIEW_SLUG}
                      themeKey={activeTheme}
                    />
                  ))}
                </div>
              </div>
            </section>

            <PublicHomeVisualStory site={site} />

            <section className={styles.invitationSection} id="bemutatkozas">
              <div className="public-container">
                <div className={styles.invitationCard}>
                  <div className={styles.invitationIcon} aria-hidden="true">
                    <Church />
                  </div>
                  <div className={styles.invitationCopy}>
                    <p className={styles.invitationEyebrow}>Első alkalommal látogatsz hozzánk?</p>
                    <h2>Van helyed közöttünk.</h2>
                    <p>
                      Ismerd meg gyülekezetünk életét, alkalmait és szolgálatait. A nyilvános
                      oldal minden érdeklődőnek elérhető — bejelentkezés nélkül.
                    </p>
                  </div>
                  <div className={styles.invitationActions}>
                    <Link className="public-btn public-btn-primary" href="#bemutatkozas">
                      <HandHeart aria-hidden="true" />
                      Rólunk
                    </Link>
                    <a className="public-btn public-btn-outline" href="#alkalmak">
                      <Clock3 aria-hidden="true" />
                      Alkalmaink
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <PublicServiceTimes site={site} />

            <section className={styles.previewNotice} aria-label="Előnézeti tájékoztató">
              <Sparkles aria-hidden="true" />
              <p>
                A hero-kép és a hírek képi háttere a kiválasztott, generált témaképet használja.
                A megjelenített címek és elérhetőségek kizárólag bemutató adatok.
              </p>
            </section>
          </main>

          <PublicSiteFooter site={site} />
          </PublicThemeRoot>
        )}
      </div>

      <p className={styles.activeThemeAnnouncement} aria-live="polite">
        Aktív látványterv: {activeModeLabel}
      </p>
    </div>
  )
}
