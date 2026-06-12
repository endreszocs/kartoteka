'use client'

/**
 * AvatarEditorBody — kép társítása egy személyhez (2026-06-11, Endre).
 *
 * Két út, őszinte UX-szel:
 *   1. KÖZÖSSÉGI LINK (kényelmi): Facebook/Instagram profil-link megadása →
 *      a platform-wrapper megpróbálja letölteni a nyilvános profilképet
 *      (`onFetchFromSocial`). A `facebook.com/profile.php?id=…` formátum a
 *      megbízható; username-es linkeknél best-effort — ha nem jön kép, a
 *      felület megmondja, és a kézi utat ajánlja. A link mentésre kerül
 *      (kapcsolattartási érték), a kép SAJÁT tárhelyre töltődik (a közösségi
 *      kép-URL-ek lejárnak, ezért sosem hivatkozunk rájuk közvetlenül).
 *   2. KÉZI FELTÖLTÉS (mindig működik): képfájl tallózása a gépről —
 *      kliens-oldali átméretezés (max 512px, JPEG) után töltődik fel.
 *
 * Platform-független törzs: a tényleges hálózat/Storage a callback-propokban.
 */

import { useEffect, useRef, useState } from 'react'
import { Camera, Download, Link2, Loader2, Trash2, Upload } from 'lucide-react'

import { MemberAvatar } from './MemberAvatar'
import { parseSocialProfileUrl } from './social-avatar'

export interface AvatarEditorBodyProps {
  personName: string
  /** Aktuális kép (szemely.kep) — előnézethez. */
  currentKepUrl?: string | null
  /** Mentett közösségi link (szemely.social_profil_url). */
  currentSocialUrl?: string | null

  /**
   * Profilkép-letöltés a közösségi linkből (platform-specifikus hálózat).
   * Siker: a kép base64-e (data nélküli nyers base64) + mime. Hiba: error.
   */
  onFetchFromSocial: (
    normalizedUrl: string,
  ) => Promise<{ base64: string; mime: string } | { error: string }>

  /**
   * Mentés: kép (ha van új) + a közösségi link. A wrapper tölti a Storage-ba
   * és frissíti a személyt. `kep: null` = kép törlése; `kep: undefined` =
   * a kép nem változik (csak a link mentődik).
   */
  onSave: (params: {
    kep?: { base64: string; mime: string } | null
    socialUrl: string | null
  }) => Promise<{ success?: boolean; error?: string | null }>

  onSaved?: () => void | Promise<void>
  onToast?: (msg: string, kind: 'success' | 'error' | 'info' | 'warning') => void
}

/** Kliens-oldali átméretezés canvas-szal (max él, JPEG ~0.85). */
async function resizeImageFile(file: File, maxEdge = 512): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('A fájl nem olvasható.'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('A kép nem dekódolható.'))
    el.src = dataUrl
  })
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nem érhető el.')
  ctx.drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: out.split(',')[1] ?? '', mime: 'image/jpeg' }
}

export function AvatarEditorBody({
  personName,
  currentKepUrl,
  currentSocialUrl,
  onFetchFromSocial,
  onSave,
  onSaved,
  onToast,
}: AvatarEditorBodyProps) {
  const [socialUrl, setSocialUrl] = useState(currentSocialUrl ?? '')
  const [pending, setPending] = useState<{ base64: string; mime: string } | null>(null)
  const [removeKep, setRemoveKep] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSocialUrl(currentSocialUrl ?? '')
    setPending(null)
    setRemoveKep(false)
    setNote(null)
  }, [currentSocialUrl, currentKepUrl])

  const parsed = parseSocialProfileUrl(socialUrl)
  const previewUrl = pending
    ? `data:${pending.mime};base64,${pending.base64}`
    : removeKep
      ? null
      : currentKepUrl ?? null

  async function handleFetch() {
    if (!socialUrl.trim()) return
    setFetching(true)
    setNote(null)
    try {
      const r = await onFetchFromSocial(parsed.normalizedUrl)
      if ('error' in r) {
        setNote(r.error)
        return
      }
      setPending({ base64: r.base64, mime: r.mime })
      setRemoveKep(false)
      setNote('Kép letöltve — a Mentés gombbal véglegesítsd.')
    } finally {
      setFetching(false)
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNote('Képfájlt válassz (JPG/PNG/WebP).')
      return
    }
    try {
      const resized = await resizeImageFile(file)
      setPending(resized)
      setRemoveKep(false)
      setNote('Kép kiválasztva — a Mentés gombbal véglegesítsd.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'A kép feldolgozása nem sikerült.')
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const r = await onSave({
        kep: pending ?? (removeKep ? null : undefined),
        socialUrl: socialUrl.trim() || null,
      })
      if (r.error) {
        onToast?.(r.error, 'error')
        return
      }
      onToast?.('Kép és kapcsolat mentve.', 'success')
      setPending(null)
      setRemoveKep(false)
      if (onSaved) await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const dirty = pending !== null || removeKep || (socialUrl.trim() || null) !== (currentSocialUrl ?? null)

  return (
    <div className="space-y-4">
      {/* Előnézet */}
      <div className="flex items-center gap-4">
        {previewUrl ? (
          <span className="relative inline-flex size-20 shrink-0 overflow-hidden rounded-full shadow-md ring-4 ring-violet-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={personName} className="h-full w-full object-cover" />
          </span>
        ) : (
          <MemberAvatar name={personName} size={80} />
        )}
        <div className="min-w-0">
          <p className="font-medium text-slate-700">{personName}</p>
          <p className="text-xs text-slate-400">
            {pending ? 'Új kép kiválasztva (még nincs mentve)' : currentKepUrl && !removeKep ? 'Van mentett kép' : 'Még nincs kép — monogram látszik'}
          </p>
          {(currentKepUrl || pending) && !removeKep && (
            <button
              type="button"
              onClick={() => {
                setPending(null)
                setRemoveKep(!!currentKepUrl)
                setNote(currentKepUrl ? 'A mentett kép a Mentésnél törlődik.' : null)
              }}
              className="mt-1 inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600"
            >
              <Trash2 className="size-3" /> Kép eltávolítása
            </button>
          )}
        </div>
      </div>

      {/* 1. út: közösségi link */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Link2 className="size-3.5" />
          Facebook / Instagram profil-link
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="pl. https://www.facebook.com/profile.php?id=1000… vagy instagram.com/nev"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleFetch()}
            disabled={fetching || !socialUrl.trim() || parsed.provider === 'unknown'}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-white px-3 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-50"
          >
            {fetching ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            Kép letöltése
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {parsed.provider === 'facebook-id' && 'Számos Facebook-link (profile.php?id=…) — ez a legmegbízhatóbb forma.'}
          {parsed.provider === 'facebook-username' && 'Felhasználóneves Facebook-link — a letöltés nem mindig sikerül; ha nem megy, használd a kézi feltöltést.'}
          {parsed.provider === 'instagram' && 'Instagram-link — a letöltés nem mindig sikerül; ha nem megy, használd a kézi feltöltést.'}
          {parsed.provider === 'unknown' && 'A link mentésre kerül a kapcsolatokhoz; képletöltéshez Facebook/Instagram profil-linket adj meg.'}
          {' '}A kép a Kartotéka saját tárhelyére kerül — nyilvános profilkép, amit az érintett maga tett közzé.
        </p>
      </div>

      {/* 2. út: kézi feltöltés */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Camera className="size-3.5" />
          Kép a saját gépről
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-emerald-200 bg-white px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          <Upload className="mr-1.5 size-4" />
          Képfájl kiválasztása…
        </button>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Tipp: ha a link-letöltés nem megy, nyisd meg a profilját a böngészőben,
          mentsd le a képet, és töltsd fel itt — 10 másodperc.
        </p>
      </div>

      {note && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800" role="status">
          {note}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !dirty}
        className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
        Mentés
      </button>
    </div>
  )
}
