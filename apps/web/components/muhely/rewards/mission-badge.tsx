import type { CSSProperties, ReactNode } from 'react'

import type {
  MissionBadgeCode,
  MissionBadgeDefinition,
  MissionBadgeState,
} from '@/lib/missions/badges'

import styles from './rewards.module.css'

interface MissionBadgeProps {
  badge: MissionBadgeDefinition
  state: MissionBadgeState
  /** Egy oldalon ugyanaz a jelvény kabinetben és ceremóniában is szerepelhet. */
  idPrefix?: string
  className?: string
  decorative?: boolean
}

type BadgeCssProperties = CSSProperties & {
  '--badge-enamel': string
  '--badge-enamel-dark': string
  '--badge-accent': string
}

export function MissionBadge({
  badge,
  state,
  idPrefix = `cabinet-${badge.code}`,
  className = '',
  decorative = false,
}: MissionBadgeProps) {
  const bronzeId = `${idPrefix}-bronze`
  const enamelId = `${idPrefix}-enamel`
  const gleamId = `${idPrefix}-gleam`
  const shadowId = `${idPrefix}-shadow`
  const titleId = `${idPrefix}-title`
  const cssProperties: BadgeCssProperties = {
    '--badge-enamel': badge.enamel,
    '--badge-enamel-dark': badge.enamelDark,
    '--badge-accent': badge.color,
  }

  return (
    <span
      className={`${styles.badgeRoot} ${styles[state]} ${className}`}
      style={cssProperties}
      aria-hidden={decorative || undefined}
    >
      <span className={styles.badgeHalo} />
      <svg
        className={styles.badgeSvg}
        viewBox="0 0 144 144"
        role={decorative ? 'presentation' : 'img'}
        aria-hidden={decorative || undefined}
        aria-labelledby={decorative ? undefined : titleId}
        focusable="false"
      >
        {!decorative && <title id={titleId}>{badge.name} jelvény</title>}
        <defs>
          <radialGradient id={bronzeId} cx="34%" cy="25%" r="78%">
            <stop offset="0" stopColor="#fff0b7" />
            <stop offset="0.22" stopColor="#d6a24d" />
            <stop offset="0.52" stopColor="#8c571e" />
            <stop offset="0.78" stopColor="#e0b35d" />
            <stop offset="1" stopColor="#5d3511" />
          </radialGradient>
          <linearGradient id={enamelId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--badge-enamel)" />
            <stop offset="0.62" stopColor="var(--badge-enamel-dark)" />
            <stop offset="1" stopColor="var(--badge-enamel)" />
          </linearGradient>
          <linearGradient id={gleamId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.32" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id={shadowId} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#3d250f" floodOpacity="0.4" />
          </filter>
        </defs>

        <g className={styles.medallion} filter={`url(#${shadowId})`}>
          <circle cx="72" cy="70" r="64" fill="#4a2b0f" opacity="0.34" />
          <circle cx="72" cy="68" r="63" fill={`url(#${bronzeId})`} stroke="#704315" strokeWidth="1.4" />
          <circle cx="72" cy="68" r="58" fill="#7b4816" stroke="#f6d684" strokeWidth="1.2" />
          <circle cx="72" cy="68" r="54" fill={`url(#${enamelId})`} stroke="#49270d" strokeWidth="1.4" />
          <circle cx="72" cy="68" r="50.5" fill="none" stroke="#f2d489" strokeWidth="1.2" opacity="0.9" />
          <circle cx="72" cy="68" r="48.5" fill="none" stroke="#5c3715" strokeWidth="0.7" opacity="0.72" />

          <path
            d="M39 32c10-13 31-20 49-13 9 3 16 9 21 16-21-12-47-13-70-3Z"
            fill={`url(#${gleamId})`}
            opacity="0.62"
          />

          <g className={styles.enamelTexture} aria-hidden="true">
            <circle cx="45" cy="44" r="1" />
            <circle cx="92" cy="35" r="0.8" />
            <circle cx="111" cy="68" r="1.1" />
            <circle cx="36" cy="76" r="0.7" />
            <circle cx="82" cy="96" r="0.9" />
            <circle cx="55" cy="107" r="0.75" />
          </g>

          <g className={styles.motif}>
            <BadgeMotif code={badge.code} />
          </g>

          <Laurel />
        </g>
      </svg>
      <span className={styles.badgeSweep} />
    </span>
  )
}

function BadgeMotif({ code }: { code: MissionBadgeCode }) {
  switch (code) {
    case 'elso_otlet':
      return (
        <>
          <Spark cx={72} cy={35} size={11} />
          <path className={styles.motifStroke} d="M72 91c1-16 0-27-1-39" />
          <path className={styles.motifFill} d="M70 63C56 62 52 54 51 46c13-1 21 4 23 14Z" />
          <path className={styles.motifFill} d="M72 70c14-2 20-10 20-19-13 0-20 6-21 17Z" />
          <path className={styles.motifStroke} d="M59 94c8-4 18-4 26 0" />
        </>
      )
    case 'otletgyaros':
      return (
        <>
          <path className={styles.motifStroke} d="M72 94V61m0 16-16-15m16 6 14-15m-14 3-4-10" />
          <path className={styles.motifStroke} d="M59 95c6-6 19-6 26 0" />
          <Spark cx={50} cy={48} size={7} />
          <Spark cx={68} cy={36} size={8} />
          <Spark cx={88} cy={43} size={7} />
          <Spark cx={99} cy={62} size={6} />
          <Spark cx={44} cy={67} size={6} />
        </>
      )
    case 'tamogato':
      return (
        <>
          <path
            className={styles.motifFill}
            d="M72 65 55 49c-8-8 3-22 13-13l4 4 4-4c10-9 21 5 13 13Z"
          />
          <path className={styles.motifStroke} d="M43 90c7-1 11-7 17-9l15-5c4-1 7 5 3 7l-8 4" />
          <path className={styles.motifStroke} d="M45 101c8-9 15-9 25-8 9 0 14-3 21-10l10-10c4-4 10 1 6 6L94 94c-7 8-14 12-25 11l-12-1" />
        </>
      )
    case 'tamogato_bajnok':
      return (
        <>
          <path className={styles.motifStroke} d="M42 82c8 3 11 12 18 17 4 3 8 1 9-3V76c0-5-7-6-8-1l-1 9-7-15c-2-4-8-2-6 3l5 12-7-9c-3-4-8 0-5 4Z" />
          <path className={styles.motifStroke} d="M102 82c-8 3-11 12-18 17-4 3-8 1-9-3V76c0-5 7-6 8-1l1 9 7-15c2-4 8-2 6 3l-5 12 7-9c3-4 8 0 5 4Z" />
          <path className={styles.motifStroke} d="M46 58c-5-8-5-17-1-25m8 22c-2-8 0-15 5-21m40 24c5-8 5-17 1-25m-8 22c2-8 0-15-5-21" />
          <Leaf x={43} y={38} rotate={-35} />
          <Leaf x={51} y={48} rotate={-55} />
          <Leaf x={101} y={38} rotate={35} />
          <Leaf x={93} y={48} rotate={55} />
        </>
      )
    case 'kozossegi':
      return (
        <>
          <circle className={styles.motifFill} cx="72" cy="43" r="9" />
          <circle className={styles.motifFill} cx="44" cy="58" r="8" />
          <circle className={styles.motifFill} cx="100" cy="58" r="8" />
          <path className={styles.motifStroke} d="M58 66c3-9 8-14 14-14s11 5 14 14" />
          <path className={styles.motifStroke} d="M32 82c1-11 5-17 12-17 6 0 10 5 12 13m56 4c-1-11-5-17-12-17-6 0-10 5-12 13" />
          <path className={styles.motifStroke} d="M43 84c7 13 18 20 29 20s22-7 29-20M55 74l7 5m34-5-7 5" />
          <circle className={styles.motifDot} cx="72" cy="103" r="3" />
        </>
      )
    case 'feltolto':
      return (
        <>
          <path className={styles.motifFill} d="M35 55c14-3 25 0 37 9v37c-12-9-23-12-37-9Zm74 0c-14-3-25 0-37 9v37c12-9 23-12 37-9Z" />
          <path className={styles.motifStroke} d="M72 64v37M40 66c10-1 18 2 27 8m-27 2c10-1 18 2 27 8m37-18c-10-1-18 2-27 8" />
          <path className={styles.motifFill} d="M81 56c2-13 10-21 22-24-1 12-7 22-20 27Z" />
          <path className={styles.motifStroke} d="m82 57 16-19" />
        </>
      )
    case 'siker':
      return (
        <>
          <path className={styles.rockFill} d="m42 98 6-24 15-13 22 3 17 18-7 20-39 4Z" />
          <path className={styles.motifStroke} d="m49 75 17 7 7-18m-17 40 10-22 29 19" />
          <path className={styles.motifStroke} d="M73 64c0-12 0-20-2-28" />
          <path className={styles.motifFill} d="M71 49c-12-1-17-7-18-15 11 0 18 4 20 13Zm2-7c12-1 18-7 19-15-11 0-18 5-20 13Z" />
        </>
      )
    case 'nagy_siker':
      return (
        <>
          <Crown x={72} y={45} scale={1.05} />
          <path className={styles.motifStroke} d="M47 91c7-17 17-25 25-25s18 8 25 25" />
          <circle className={styles.fruitFill} cx="48" cy="92" r="10" />
          <circle className={styles.fruitFill} cx="72" cy="88" r="12" />
          <circle className={styles.fruitFill} cx="96" cy="92" r="10" />
          <path className={styles.motifStroke} d="M47 80c-2-7-1-12 3-16m46 16c2-7 1-12-3-16M72 75V63" />
          <Leaf x={50} y={66} rotate={-25} />
          <Leaf x={94} y={66} rotate={25} />
        </>
      )
    case 'top_ertekelo':
      return (
        <>
          <path className={styles.motifFill} d="m58 32 9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3Z" />
          <path className={styles.motifStroke} d="m47 61 8 8 16-18" />
          <path className={styles.motifFill} d="M89 96c3-17 10-29 21-37 1 17-5 30-18 40Z" />
          <path className={styles.motifStroke} d="m78 106 26-38m-15 22 13-2" />
        </>
      )
    case 'hozzaszolo':
      return (
        <>
          <Crown x={72} y={35} scale={0.72} />
          <path className={styles.motifFill} d="M31 57h55v31H56l-13 11 3-11H31Z" />
          <path className={styles.motifFill} d="M61 70h52v28H94l-12 10 2-10H61Z" />
          <path className={styles.motifStroke} d="M43 69h27m-27 9h19m12 4h27m-27 8h18" />
        </>
      )
    case 'mentor':
      return (
        <>
          <Lantern x={56} y={68} scale={1.1} />
          <Lantern x={94} y={89} scale={0.62} />
          <path className={styles.lightRay} d="M69 48c8-8 17-10 26-7M71 57c9-4 17-4 25-1" />
          <Spark cx={103} cy={45} size={5} />
        </>
      )
    case 'megbizhato':
      return (
        <>
          <path className={styles.motifFill} d="M72 28c12 10 23 14 34 15v25c0 18-11 31-34 40-23-9-34-22-34-40V43c11-1 22-5 34-15Z" />
          <circle className={styles.motifStroke} cx="70" cy="65" r="19" />
          <path className={styles.motifStroke} d="M70 51v15l10 6" />
          <circle className={styles.checkFill} cx="91" cy="91" r="14" />
          <path className={styles.checkStroke} d="m84 91 5 5 10-12" />
        </>
      )
  }
}

function Spark({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  const diagonal = size * 0.58

  return (
    <g className={styles.motifStroke}>
      <path d={`M${cx} ${cy - size}v${size * 2}M${cx - size} ${cy}h${size * 2}`} />
      <path
        d={`M${cx - diagonal} ${cy - diagonal}L${cx + diagonal} ${cy + diagonal}M${cx + diagonal} ${cy - diagonal}L${cx - diagonal} ${cy + diagonal}`}
        opacity="0.72"
      />
    </g>
  )
}

function Leaf({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <path
      className={styles.motifFill}
      d="M0 0c8-5 13-4 17 0-5 6-10 8-17 0Z"
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(.58)`}
    />
  )
}

function Crown({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path className={styles.motifFill} d="m-24 12-4-28 14 13L0-22 14-3l14-13-4 28Z" />
      <path className={styles.motifStroke} d="M-25 18h50M-17 5h34" />
      <circle className={styles.motifDot} cx="-28" cy="-16" r="2.5" />
      <circle className={styles.motifDot} cx="0" cy="-22" r="2.5" />
      <circle className={styles.motifDot} cx="28" cy="-16" r="2.5" />
    </g>
  )
}

function Lantern({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path className={styles.motifStroke} d="M-12-22c0-10 5-15 12-15s12 5 12 15M-18-22h36M-16 20h32M-13-18h26l4 38h-34Z" />
      <path className={styles.lanternGlow} d="M0-10c9 10 8 18 0 24-8-6-9-14 0-24Z" />
      <path className={styles.motifStroke} d="M-11-13 11 13m0-26-22 26" opacity="0.55" />
    </g>
  )
}

function Laurel() {
  return (
    <g className={styles.laurel} aria-hidden="true">
      <path d="M39 94c7 16 17 24 31 27M105 94c-7 16-17 24-31 27" />
      <path d="M45 102c-7-1-10-5-11-10 7 0 11 3 11 10Zm8 9c-7 0-11-4-13-9 7-1 12 2 13 9Zm9 6c-7 1-12-2-14-7 7-2 12 0 14 7Zm37-15c7-1 10-5 11-10-7 0-11 3-11 10Zm-8 9c7 0 11-4 13-9-7-1-12 2-13 9Zm-9 6c7 1 12-2 14-7-7-2-12 0-14 7Z" />
      <path d="M67 121c3-5 7-7 11-7-1 6-4 9-11 7Zm10 0c-3-5-7-7-11-7 1 6 4 9 11 7Z" />
    </g>
  )
}

export function BadgeArtFrame({ children }: { children: ReactNode }) {
  return <span className={styles.badgeArtFrame}>{children}</span>
}
