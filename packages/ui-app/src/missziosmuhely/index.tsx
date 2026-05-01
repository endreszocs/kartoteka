'use client'

/**
 * Missziós Műhely — közös home oldal (Sprint R · Vizuális megújulás · v0.8.2).
 *
 * A `Kartoteka.html` design-handoff `mission.jsx` (688 sor) TSX portja, a
 * `packages/ui-app` body-pattern szabályai szerint:
 *   - pure UI, semmi `next/*` / `react-router-dom` dep
 *   - `assetBase` prop = a kép-mappa relatív útja (`/misszios-muhely` mindkét appon)
 *   - `onNavigate?(href)` callback — a webes kliensoldal Next.js router-rel,
 *     a desktop react-router-dom `useNavigate`-tel kapcsolja össze
 *
 * A meglévő `apps/web/components/muhely/` aloldal-komponenseket (segédanyagok,
 * fórum, jutalmak, profil) NEM érintjük — a felhasználó kifejezett kérése
 * szerint a táblázatos szerkezet változatlan marad. Itt CSAK a home (landing)
 * oldal készül el a design szerint.
 */

import { useMemo, type ReactNode } from 'react'

// ──────────────────────────────────────────────────────────────────────
// Paletta — meleg krém, lelkipásztori (a design `MM_PALETTE` alapján)
// ──────────────────────────────────────────────────────────────────────

export const MM_PALETTE = {
  bg: '#F6EFE2',
  bgWarm: '#FBF6EB',
  card: '#FBF7EE',
  cardLine: 'rgba(143,118,82,.18)',
  cardShadow:
    '0 1px 0 rgba(255,255,255,.7) inset, 0 6px 18px rgba(120,90,40,.07), 0 1px 3px rgba(120,90,40,.06)',
  ink: '#1F2A1A',
  inkSoft: '#3a4a32',
  muted: '#6B6253',
  divider: 'rgba(120,90,40,.14)',
  green: '#3D6A2C',
  greenDark: '#2E5421',
  greenSoft: '#E8EFDF',
  serif: '"Cormorant Garamond", "Fraunces", Georgia, serif',
  sans: 'Inter, system-ui, sans-serif',
} as const

// ──────────────────────────────────────────────────────────────────────
// Közös props
// ──────────────────────────────────────────────────────────────────────

export interface MissionWorkshopProps {
  /** Asset mappa relatív path-ja. Default: `/misszios-muhely`. */
  assetBase?: string
  /** Navigációs callback a CTA gombokhoz / kategóriákhoz. */
  onNavigate?: (href: string) => void
}

// ──────────────────────────────────────────────────────────────────────
// MissionWorkshop — összeszerelt home oldal
// ──────────────────────────────────────────────────────────────────────

export function MissionWorkshop({
  assetBase = '/misszios-muhely',
  onNavigate,
}: MissionWorkshopProps) {
  const t = MM_PALETTE
  return (
    <div
      style={{
        minHeight: 1000,
        background: t.bg,
        color: t.ink,
        fontFamily: t.sans,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <MMBackground assetBase={assetBase} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <MMHero t={t} assetBase={assetBase} onNavigate={onNavigate} />

        <div
          style={{
            padding: '0 40px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <MMFeaturedCollections t={t} assetBase={assetBase} onNavigate={onNavigate} />
          <MMMidRow t={t} onNavigate={onNavigate} />
          <MMCategoryBrowse t={t} assetBase={assetBase} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMBackground — finom watermark-ok (templom + levél-sarkok + hills)
// ──────────────────────────────────────────────────────────────────────

interface MMBackgroundProps {
  assetBase: string
}

export function MMBackground({ assetBase }: MMBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <img
        src={`${assetBase}/27-church.png`}
        alt=""
        style={{
          position: 'absolute',
          top: 60,
          left: '46%',
          width: 360,
          height: 360,
          opacity: 0.12,
          mixBlendMode: 'multiply',
        }}
      />
      <img
        src={`${assetBase}/32-corner.png`}
        alt=""
        style={{
          position: 'absolute',
          top: -40,
          left: -30,
          width: 320,
          height: 320,
          opacity: 0.55,
          mixBlendMode: 'multiply',
        }}
      />
      <img
        src={`${assetBase}/32-corner.png`}
        alt=""
        style={{
          position: 'absolute',
          bottom: -60,
          right: -40,
          width: 360,
          height: 360,
          opacity: 0.45,
          mixBlendMode: 'multiply',
          transform: 'scaleX(-1)',
        }}
      />
      <img
        src={`${assetBase}/30-leaves1.png`}
        alt=""
        style={{
          position: 'absolute',
          top: 380,
          left: -80,
          width: 280,
          height: 280,
          opacity: 0.4,
          mixBlendMode: 'multiply',
          transform: 'rotate(-15deg)',
        }}
      />
      <img
        src={`${assetBase}/31-leaves2.png`}
        alt=""
        style={{
          position: 'absolute',
          top: 540,
          right: -60,
          width: 260,
          height: 260,
          opacity: 0.35,
          mixBlendMode: 'multiply',
          transform: 'scaleX(-1) rotate(-10deg)',
        }}
      />
      <img
        src={`${assetBase}/33-hills.png`}
        alt=""
        style={{
          position: 'absolute',
          bottom: 280,
          left: '20%',
          width: 600,
          height: 200,
          opacity: 0.5,
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMHero — bal cím + közép ige + jobb hero-mug
// ──────────────────────────────────────────────────────────────────────

interface MMHeroProps {
  t: typeof MM_PALETTE
  assetBase: string
  onNavigate?: (href: string) => void
}

export function MMHero({ t, assetBase, onNavigate }: MMHeroProps) {
  return (
    <div
      style={{
        padding: '40px 40px 36px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) minmax(220px,260px) minmax(0,0.95fr)',
        columnGap: 28,
        alignItems: 'start',
        minHeight: 380,
        position: 'relative',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontFamily: t.serif,
            fontSize: 60,
            fontWeight: 500,
            letterSpacing: -1.5,
            color: '#1B2F1B',
            lineHeight: 1,
          }}
        >
          Missziós műhely
        </h1>
        <p
          style={{
            margin: '18px 0 26px',
            fontSize: 16,
            color: t.inkSoft,
            maxWidth: 460,
            lineHeight: 1.5,
          }}
        >
          Ötletek, segédanyagok és közösségi inspiráció a szolgálathoz.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onNavigate?.('/misszios-muhely/segedanyagok')}
            style={{
              padding: '13px 18px',
              borderRadius: 10,
              border: 'none',
              background: t.green,
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 12px rgba(45,90,30,.25)',
            }}
          >
            Felfedezés indítása
            <ArrowRightIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('/misszios-muhely/forum')}
            style={{
              padding: '13px 18px',
              borderRadius: 10,
              background: '#fff',
              color: t.ink,
              border: `1px solid ${t.cardLine}`,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            Újdonságok
            <SparkIcon color={t.green} />
          </button>
        </div>
      </div>

      {/* Közép — Máté 28,19–20 */}
      <div
        style={{
          alignSelf: 'center',
          padding: '14px 0',
          opacity: 0.98,
          fontFamily: t.serif,
          fontSize: 16,
          fontStyle: 'italic',
          color: t.inkSoft,
          lineHeight: 1.5,
        }}
      >
        <span
          style={{
            display: 'block',
            fontFamily: t.serif,
            fontSize: 34,
            color: t.green,
            opacity: 0.55,
            lineHeight: 0.7,
            fontStyle: 'normal',
            marginBottom: 4,
          }}
        >
          „
        </span>
        <p style={{ margin: 0 }}>
          Menjetek el tehát, tegyetek tanítvánnyá minden népet… és íme, én veletek vagyok minden napon a világ végezetéig.”
        </p>
        <div
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: t.muted,
            fontStyle: 'normal',
            fontFamily: t.sans,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            letterSpacing: 0.4,
          }}
        >
          <span style={{ width: 18, height: 1, background: t.muted, opacity: 0.5 }} />
          Máté 28,19–20
        </div>
      </div>

      {/* Jobb — hero-mug */}
      <div style={{ position: 'relative', height: 320 }}>
        <img
          src={`${assetBase}/hero-mug.png`}
          alt=""
          style={{
            position: 'absolute',
            right: -10,
            top: -30,
            width: 460,
            height: 360,
            objectFit: 'contain',
            filter: 'drop-shadow(0 8px 28px rgba(80,60,30,.18))',
            zIndex: 3,
          }}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMFeaturedCollections — 4 kép-kártya
// ──────────────────────────────────────────────────────────────────────

interface MMFeaturedCollectionsProps {
  t: typeof MM_PALETTE
  assetBase: string
  onNavigate?: (href: string) => void
}

export function MMFeaturedCollections({ t, assetBase, onNavigate }: MMFeaturedCollectionsProps) {
  const items = [
    {
      img: 'coll-sprouts.jpg',
      title: 'Kezdő lépések',
      desc: 'Ötletek új csoportok, alkalmak és szolgálatok elindításához.',
      count: 18,
      href: '/misszios-muhely/segedanyagok?coll=kezdo',
    },
    {
      img: 'coll-hands.png',
      title: 'Közösségépítés',
      desc: 'Kapcsolódás, befogadás és tartós közösségek építése.',
      count: 24,
      href: '/misszios-muhely/segedanyagok?coll=kozosseg',
    },
    {
      img: 'coll-lantern.jpg',
      title: 'Hit megélése',
      desc: 'Gyakorlati eszközök a mindennapi hiteles élet támogatásához.',
      count: 31,
      href: '/misszios-muhely/segedanyagok?coll=hit',
    },
    {
      img: 'coll-bible.jpg',
      title: 'Evangelizáció',
      desc: 'Kreatív ötletek és segédanyagok az evangélium megosztásához.',
      count: 22,
      href: '/misszios-muhely/segedanyagok?coll=evang',
    },
  ]
  return (
    <SectionPanel
      t={t}
      icon={<CalendarIcon />}
      title="Kiemelt gyűjtemények"
      action={
        <SectionLink
          t={t}
          label="Összes gyűjtemény megtekintése"
          onClick={() => onNavigate?.('/misszios-muhely/segedanyagok')}
        />
      }
      style={{ marginTop: -56, position: 'relative', zIndex: 2 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {items.map((it) => (
          <button
            key={it.title}
            type="button"
            onClick={() => onNavigate?.(it.href)}
            style={{
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${t.cardLine}`,
              boxShadow: '0 1px 2px rgba(120,90,40,.05)',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              padding: 0,
            }}
          >
            <div style={{ height: 132, overflow: 'hidden', position: 'relative', background: '#eee' }}>
              <img
                src={`${assetBase}/${it.img}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div
              style={{
                padding: '12px 14px 14px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3
                style={{
                  margin: '2px 0 4px',
                  fontFamily: t.serif,
                  fontSize: 19,
                  fontWeight: 600,
                  color: t.ink,
                }}
              >
                {it.title}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: t.muted, lineHeight: 1.45, flex: 1 }}>
                {it.desc}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: t.greenSoft,
                    color: t.greenDark,
                    fontSize: 11.5,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  + {it.count} anyag
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </SectionPanel>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMMidRow — Témák · Csomagok · Ajánlások
// ──────────────────────────────────────────────────────────────────────

interface MMMidRowProps {
  t: typeof MM_PALETTE
  onNavigate?: (href: string) => void
}

export function MMMidRow({ t, onNavigate }: MMMidRowProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 1fr', gap: 14 }}>
      <MMThemes t={t} onNavigate={onNavigate} />
      <MMDownloads t={t} />
      <MMRecommendations t={t} onNavigate={onNavigate} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMThemes — 5 témás lista
// ──────────────────────────────────────────────────────────────────────

interface MMThemesProps {
  t: typeof MM_PALETTE
  onNavigate?: (href: string) => void
}

export function MMThemes({ t, onNavigate }: MMThemesProps) {
  const themes: { kind: ThemeDotKind; name: string; n: number; href: string }[] = [
    { kind: 'users', name: 'Ifjúság', n: 42, href: '/misszios-muhely/segedanyagok?tema=ifjusag' },
    { kind: 'sprout', name: 'Gyermekek', n: 37, href: '/misszios-muhely/segedanyagok?tema=gyermek' },
    { kind: 'family', name: 'Család', n: 28, href: '/misszios-muhely/segedanyagok?tema=csalad' },
    { kind: 'elder', name: 'Idősek', n: 19, href: '/misszios-muhely/segedanyagok?tema=idos' },
    { kind: 'music', name: 'Dicsőítés és Zene', n: 26, href: '/misszios-muhely/segedanyagok?tema=zene' },
  ]
  return (
    <SectionPanel t={t} icon={<UsersIcon />} title="Témák" compact>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {themes.map((th, i) => (
          <button
            key={th.name}
            type="button"
            onClick={() => onNavigate?.(th.href)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 4px',
              borderTop: i === 0 ? 'none' : `1px solid ${t.divider}`,
              cursor: 'pointer',
              background: 'transparent',
              border: 0,
              textAlign: 'left',
              fontFamily: 'inherit',
              width: '100%',
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: t.greenSoft,
                color: t.green,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ThemeDot kind={th.kind} />
            </span>
            <span style={{ flex: 1, fontSize: 14, color: t.ink, fontWeight: 500 }}>{th.name}</span>
            <span
              style={{
                fontSize: 13,
                color: t.muted,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}
            >
              {th.n}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <SectionLink
          t={t}
          label="Összes téma"
          onClick={() => onNavigate?.('/misszios-muhely/segedanyagok')}
        />
      </div>
    </SectionPanel>
  )
}

type ThemeDotKind = 'users' | 'sprout' | 'family' | 'elder' | 'music'

function ThemeDot({ kind }: { kind: ThemeDotKind }) {
  const map: Record<ThemeDotKind, ReactNode> = {
    users: (
      <>
        <circle cx="9" cy="9" r="2.5" />
        <circle cx="15" cy="10" r="2" />
        <path d="M4 18c.4-2.4 2.4-3.8 5-3.8s4.6 1.4 5 3.8M14 18c.3-1.6 1.6-2.8 3.4-2.8s3 1 3.4 2.4" />
      </>
    ),
    sprout: (
      <>
        <path d="M12 19v-7" />
        <path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5z" />
        <path d="M12 13c0-2-1.5-3.5-4-3.5 0 2 1.5 3.5 4 3.5z" />
      </>
    ),
    family: (
      <>
        <circle cx="8" cy="8" r="2.2" />
        <circle cx="16" cy="8" r="2.2" />
        <circle cx="12" cy="14" r="1.6" />
        <path d="M4 19c0-2.4 1.8-4 4-4s4 1.6 4 4M12 19c0-1.6 1.4-2.8 3-2.8s3 1.2 3 2.8" />
      </>
    ),
    elder: (
      <>
        <circle cx="12" cy="7" r="2.3" />
        <path d="M9 18v-4l-2-2M15 18v-4l2-2M10 14h4" />
      </>
    ),
    music: (
      <>
        <path d="M9 17V7l9-2v10" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="16" cy="15.5" r="1.8" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {map[kind]}
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMDownloads — 3 letölthető csomag
// ──────────────────────────────────────────────────────────────────────

interface MMDownloadsProps {
  t: typeof MM_PALETTE
}

export function MMDownloads({ t }: MMDownloadsProps) {
  const files = [
    {
      ext: 'PPTX',
      name: 'Húsvéti alkalomcsomag',
      meta: '6 segédlet · PDF, PPTX',
      size: '12.4 MB',
      color: '#C2410C',
    },
    {
      ext: 'DOCX',
      name: 'Nyári tábori csomag',
      meta: '8 segédlet · PDF, DOCX',
      size: '18.7 MB',
      color: '#0E7490',
    },
    {
      ext: 'PDF',
      name: 'Ifjúsági alkalomvázlatok',
      meta: '12 segédlet · PDF',
      size: '9.8 MB',
      color: t.green,
    },
  ]
  return (
    <SectionPanel t={t} icon={<DownloadIcon />} title="Letölthető csomagok" compact>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map((f) => (
          <div
            key={f.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 12px',
              background: '#fff',
              borderRadius: 10,
              border: `1px solid ${t.cardLine}`,
            }}
          >
            <FileIcon color={f.color} />
            <div style={{ flex: 1, lineHeight: 1.3 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{f.name}</div>
              <div style={{ fontSize: 11.5, color: t.muted, marginTop: 1 }}>{f.meta}</div>
            </div>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 11,
                color: t.muted,
                background: t.bgWarm,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}
            >
              {f.size}
            </span>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${t.cardLine}`,
                background: '#fff',
                color: t.green,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              <DownloadArrowIcon />
            </span>
          </div>
        ))}
      </div>
    </SectionPanel>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMRecommendations — közösségi idézet + avatar-stack
// ──────────────────────────────────────────────────────────────────────

interface MMRecommendationsProps {
  t: typeof MM_PALETTE
  onNavigate?: (href: string) => void
}

export function MMRecommendations({ t, onNavigate }: MMRecommendationsProps) {
  const avatars = [
    { initials: 'NE', color: '#7FB069' },
    { initials: 'TZ', color: '#C7956D' },
    { initials: 'GA', color: '#5B7B7A' },
    { initials: 'KS', color: '#9C6B5C' },
  ]
  return (
    <SectionPanel
      t={t}
      icon={<CommunityIcon />}
      title="Közösségi ajánlások"
      compact
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <blockquote
        style={{
          margin: '0 0 14px',
          padding: '0 0 0 16px',
          position: 'relative',
          fontFamily: t.serif,
          fontSize: 15.5,
          fontStyle: 'italic',
          color: t.inkSoft,
          lineHeight: 1.45,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: -4,
            fontFamily: t.serif,
            fontSize: 30,
            color: t.green,
            opacity: 0.6,
            lineHeight: 1,
            fontStyle: 'normal',
          }}
        >
          „
        </span>
        <p style={{ margin: 0 }}>
          Az imaest sorozathoz készült vázlatok fantasztikusak, hálásak vagyunk értük!”
        </p>
        <footer
          style={{
            fontStyle: 'normal',
            fontFamily: t.sans,
            fontSize: 11.5,
            color: t.muted,
            marginTop: 8,
          }}
        >
          — Nagy Emma Lili
        </footer>
      </blockquote>

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex' }}>
          {avatars.map((a, i) => (
            <span
              key={a.initials}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: a.color,
                border: `2px solid ${t.card}`,
                marginLeft: i === 0 ? 0 : -10,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: t.serif,
              }}
            >
              {a.initials}
            </span>
          ))}
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: t.greenSoft,
              border: `2px solid ${t.card}`,
              marginLeft: -10,
              color: t.greenDark,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            +32
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <SectionLink
          t={t}
          label="További ajánlások"
          onClick={() => onNavigate?.('/misszios-muhely/forum')}
        />
      </div>
    </SectionPanel>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MMCategoryBrowse — 6 csempés rács
// ──────────────────────────────────────────────────────────────────────

interface MMCategoryBrowseProps {
  t: typeof MM_PALETTE
  assetBase: string
  onNavigate?: (href: string) => void
}

export function MMCategoryBrowse({ t, assetBase, onNavigate }: MMCategoryBrowseProps) {
  const cats = [
    { img: '26-sprout.png', title: 'Alkalmak', sub: 'több mint 120 ötlet', href: '/misszios-muhely/segedanyagok?kat=alkalmak' },
    { img: '25-book.png', title: 'Tanulmányok', sub: 'több mint 90 anyag', href: '/misszios-muhely/segedanyagok?kat=tanulmanyok' },
    { img: '24-craft.png', title: 'Kézműves & Kreatív', sub: 'több mint 60 ötlet', href: '/misszios-muhely/segedanyagok?kat=kezmuves' },
    { img: '22-media.png', title: 'Média & Prezentáció', sub: 'több mint 80 anyag', href: '/misszios-muhely/segedanyagok?kat=media' },
    { img: '23-pray.png', title: 'Imádság', sub: 'több mint 50 segédlet', href: '/misszios-muhely/segedanyagok?kat=imadsag' },
    { img: '21-hands-heart.png', title: 'Szolgálat & Misszió', sub: 'több mint 70 ötlet', href: '/misszios-muhely/segedanyagok?kat=szolgalat' },
  ]
  return (
    <section>
      <header style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: t.serif,
            fontSize: 22,
            fontWeight: 600,
            color: t.ink,
          }}
        >
          Böngészés kategóriák szerint
        </h2>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {cats.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={() => onNavigate?.(c.href)}
            style={{
              padding: '14px 12px 16px',
              background: t.card,
              borderRadius: 14,
              border: `1px solid ${t.cardLine}`,
              boxShadow: t.cardShadow,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              textAlign: 'center',
              minHeight: 168,
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={`${assetBase}/${c.img}`}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  mixBlendMode: 'multiply',
                }}
              />
            </div>
            <h3
              style={{
                margin: '4px 0 2px',
                fontFamily: t.serif,
                fontSize: 16,
                fontWeight: 600,
                color: t.ink,
                lineHeight: 1.2,
              }}
            >
              {c.title}
            </h3>
            <p style={{ margin: 0, fontSize: 11.5, color: t.muted, lineHeight: 1.3 }}>{c.sub}</p>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <SectionLink
          t={t}
          label="Összes kategória felfedezése"
          onClick={() => onNavigate?.('/misszios-muhely/segedanyagok')}
        />
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Közös szekció-kártya (header + body + opcionális action)
// ──────────────────────────────────────────────────────────────────────

interface SectionPanelProps {
  t: typeof MM_PALETTE
  icon: ReactNode
  title: string
  action?: ReactNode
  children: ReactNode
  compact?: boolean
  style?: React.CSSProperties
}

function SectionPanel({ t, icon, title, action, children, compact, style }: SectionPanelProps) {
  const padding = compact ? '18px 20px 16px' : '20px 22px 22px'
  const fontSize = compact ? 20 : 22
  return (
    <section
      style={{
        padding,
        background: t.card,
        borderRadius: 16,
        border: `1px solid ${t.cardLine}`,
        boxShadow: t.cardShadow,
        ...style,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 12 : 16 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: t.greenSoft,
            color: t.green,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
        <h2 style={{ margin: 0, fontFamily: t.serif, fontSize, fontWeight: 600, color: t.ink }}>
          {title}
        </h2>
        {action && (
          <>
            <div style={{ flex: 1 }} />
            {action}
          </>
        )}
      </header>
      {children}
    </section>
  )
}

interface SectionLinkProps {
  t: typeof MM_PALETTE
  label: string
  onClick?: () => void
}

function SectionLink({ t, label, onClick }: SectionLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        fontSize: 12.5,
        color: t.green,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'inherit',
      }}
    >
      {label}
      <ArrowRightIcon size={12} />
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SVG ikonok (a `lucide-react`-tel itt nem dolgozunk, hogy konzisztens
// design-keresztmetszet maradjon a `mission.jsx`-ből)
// ──────────────────────────────────────────────────────────────────────

function ArrowRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function SparkIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={color} stroke="none">
      <path d="M12 3l1.4 7.6L21 12l-7.6 1.4L12 21l-1.4-7.6L3 12l7.6-1.4z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 4v4M16 4v4" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3.4" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M14.5 19c.4-2 2-3.4 4-3.4 1.6 0 3 .9 3.5 2.4" />
    </svg>
  )
}

function CommunityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3.4" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 19c0-7 4-13 14-13-1 9-6 13-13 13" />
    </svg>
  )
}

function DownloadArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  )
}

function FileIcon({ color }: { color: string }) {
  // useMemo a háttér + fő szín közös számítására
  const bg = useMemo(() => color + '14', [color])
  return (
    <span
      style={{
        width: 36,
        height: 40,
        borderRadius: 6,
        background: bg,
        color,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3h8l5 5v12.5a.5.5 0 0 1-.5.5H6.5a.5.5 0 0 1-.5-.5z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
  )
}
