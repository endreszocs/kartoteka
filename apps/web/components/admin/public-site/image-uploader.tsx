'use client'

import { useState, useTransition, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { uploadPublicSiteImage } from '@/app/(dashboard)/publikus-oldal/upload-actions'

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Méret ellenőrzés a kliensen is
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A fájl túl nagy. Maximum 2 MB engedélyezett.')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Csak JPG, PNG vagy WebP engedélyezett.')
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
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      <div
        className={`relative ${ASPECT_CLASSES[aspectRatio]} rounded-xl border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50/60`}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 text-slate-600 hover:text-red-500 shadow-sm"
              title="Eltávolítás"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/40 transition-colors disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <ImageIcon className="w-8 h-8" />
            )}
            <span className="text-sm font-medium">{isPending ? 'Feltöltés...' : placeholder}</span>
            <span className="text-xs">JPG, PNG, WebP — max 2 MB</span>
          </button>
        )}
      </div>

      {/* Kicserélés gomb */}
      {value && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-60"
        >
          <Upload className="w-3.5 h-3.5" />
          {isPending ? 'Feltöltés...' : 'Kép cseréje'}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}
