'use client'

import { useId, useTransition, useRef } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { uploadPublicSiteImage } from '@/app/(dashboard)/publikus-oldal/upload-actions'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
} from '@/lib/public-site/storage'
import { safePublicHttpsUrl } from '@/lib/public-site/safe-url'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

type UploadTarget =
  | { kind: 'hero' }
  | { kind: 'crest' }
  | { kind: 'post-cover'; postSlug: string }

interface Props {
  value: string | null
  onChange: (url: string | null) => void
  target: UploadTarget
  label: string
  aspectRatio?: 'square' | '3:2' | '16:9'
  placeholder?: string
}

const ASPECT_CLASSES: Record<string, string> = {
  square: 'aspect-square',
  '3:2': 'aspect-[3/2]',
  '16:9': 'aspect-[16/9]',
}

export function ImageUploader({
  value,
  onChange,
  target,
  label,
  aspectRatio = '3:2',
  placeholder = 'Válassz képet',
}: Props) {
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const safeValue = safePublicHttpsUrl(value)
  const hasUnsafeValue = Boolean(value && !safeValue)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Méret ellenőrzés a kliensen is
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error('A fájl túl nagy. Maximum 2 MB engedélyezett.')
      e.currentTarget.value = ''
      return
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error('Csak JPG, PNG vagy WebP engedélyezett.')
      e.currentTarget.value = ''
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('target', JSON.stringify(target))

    startTransition(async () => {
      const result = await uploadPublicSiteImage(formData)
      if (result.error) {
        toast.error(result.error)
      } else if (result.url) {
        toast.success('Kép feltöltve')
        onChange(result.url)
      }
      // Input reset, hogy ugyanazt a fájlt újra választhassuk
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5"
      >
        {label}
      </label>
      <div
        className={`relative ${ASPECT_CLASSES[aspectRatio]} rounded-xl border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50/60`}
      >
        {safeValue ? (
          <>
            <Image
              src={safeValue}
              alt={label}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              unoptimized={shouldBypassPublicImageOptimization(safeValue)}
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              aria-label={`${label} eltávolítása`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50/40 transition-colors disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-8 w-8" aria-hidden="true" />
            )}
            <span className="text-sm font-medium">{isPending ? 'Feltöltés...' : placeholder}</span>
            <span className="text-xs">JPG, PNG, WebP — max 2 MB</span>
          </button>
        )}
      </div>

      {hasUnsafeValue ? (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
        >
          A korábbi kép hivatkozása nem biztonságos. Tölts fel új képet, vagy{' '}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 rounded-md px-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            távolítsd el a hivatkozást
          </button>
          .
        </div>
      ) : null}

      {/* Kicserélés gomb */}
      {value && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          {isPending ? 'Feltöltés...' : 'Kép cseréje'}
        </button>
      )}

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}
