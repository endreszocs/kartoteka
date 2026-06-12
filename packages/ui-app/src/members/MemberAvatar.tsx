'use client'

/**
 * MemberAvatar — kör-avatar a tagnyilvántartáshoz (2026-06-11).
 *
 * Kép-URL-lel fotót mutat (lágy fade-in betöltéskor), anélkül színes
 * monogram-korongot — a szín a névből determinisztikus, így ugyanaz a
 * személy mindig ugyanazt a színt kapja. Elhunytaknál halk szépia + †.
 * Web és desktop ugyanezt rendereli (pixel-paritás).
 */

import { useState } from 'react'

export interface MemberAvatarProps {
  name: string
  /** Storage public URL (szemely.kep) — null/üres → monogram. */
  kepUrl?: string | null
  /** Méret px-ben (alap 40). */
  size?: number
  meghalt?: boolean
  className?: string
  /** Extra gyűrű (pl. családfő-kiemelés). */
  ring?: boolean
}

/** Determinisztikus, kellemes gradiens-paletta a monogramhoz. */
const PALETTE = [
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-blue-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-lime-400 to-green-600',
  'from-fuchsia-400 to-violet-600',
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function MemberAvatar({ name, kepUrl, size = 40, meghalt, className, ring }: MemberAvatarProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = !!kepUrl && !failed
  const gradient = PALETTE[hashName(name) % PALETTE.length]
  const fontSize = Math.max(10, Math.round(size * 0.38))

  return (
    <span
      className={[
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'shadow-sm transition-transform duration-200 ease-out hover:scale-105',
        ring ? 'ring-2 ring-white ring-offset-2 ring-offset-violet-100' : 'ring-2 ring-white',
        meghalt ? 'grayscale opacity-75' : '',
        className ?? '',
      ].join(' ')}
      style={{ width: size, height: size }}
      title={meghalt ? `${name} †` : name}
    >
      {/* Monogram-alap — kép alatt is renderelve (betöltés-fallback) */}
      <span
        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient} font-semibold text-white`}
        style={{ fontSize }}
        aria-hidden={showImage && loaded}
      >
        {initialsOf(name)}
      </span>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={kepUrl as string}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {meghalt && (
        <span className="absolute bottom-0 right-0 flex size-[38%] items-center justify-center rounded-full bg-slate-700/90 text-[60%] leading-none text-white">
          †
        </span>
      )}
    </span>
  )
}

/**
 * Átfedő avatar-sor (családi kártyához): max `max` látható, a többi „+N".
 */
export function MemberAvatarStack({
  members,
  size = 36,
  max = 5,
}: {
  members: Array<{ name: string; kepUrl?: string | null; meghalt?: boolean }>
  size?: number
  max?: number
}) {
  const visible = members.slice(0, max)
  const rest = members.length - visible.length
  return (
    <span className="flex items-center">
      {visible.map((m, i) => (
        <span
          key={`${m.name}-${i}`}
          className="transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-0.5"
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.32), zIndex: i }}
        >
          <MemberAvatar name={m.name} kepUrl={m.kepUrl} meghalt={m.meghalt} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ring-2 ring-white"
          style={{ width: size, height: size, marginLeft: -Math.round(size * 0.32), fontSize: Math.round(size * 0.34), zIndex: max }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
