'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { savePublicPost, deletePublicPost } from '@/app/(dashboard)/publikus-oldal/actions'
import type { PublicPostInput } from '@/lib/validations/public-site'
import { suggestSlug } from '@/lib/public-site/slug'
import { Save, Trash2, Send, FileText } from 'lucide-react'
import { ImageUploader } from './image-uploader'
import { TiptapEditor } from './tiptap-editor'

interface Props {
  initial: PublicPostInput
}

export function PostEditor({ initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PublicPostInput>(initial)

  function update<K extends keyof PublicPostInput>(key: K, value: PublicPostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleTitleChange(title: string) {
    update('title', title)
    // Ha a slug üres vagy auto-generált, automatikusan frissítsük
    if (!form.id && (!form.slug || form.slug === suggestSlug(form.title))) {
      update('slug', suggestSlug(title))
    }
  }

  function handleSave(status: 'draft' | 'published') {
    startTransition(async () => {
      const result = await savePublicPost({ ...form, status })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(status === 'published' ? 'Publikálva!' : 'Mentve piszkozatként')
        router.push('/publikus-oldal/bejegyzesek')
      }
    })
  }

  function handleDelete() {
    if (!form.id) return
    if (!confirm('Biztosan törlöd a bejegyzést? Ez végleges!')) return
    startTransition(async () => {
      const result = await deletePublicPost(form.id!)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Törölve')
        router.push('/publikus-oldal/bejegyzesek')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Alapmezők */}
      <section className="card-raised p-6">
        <div className="grid gap-4">
          <div>
            <label
              htmlFor="public-post-title"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5"
            >
              Cím *
            </label>
            <input
              id="public-post-title"
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="modal-input text-lg font-semibold"
              placeholder="pl. Húsvéti ünnepi istentisztelet"
              required
            />
          </div>

          <div>
            <label
              htmlFor="public-post-slug"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5"
            >
              Slug (URL rész) *
            </label>
            <input
              id="public-post-slug"
              type="text"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="modal-input font-mono text-sm"
              placeholder="pl. husveti-istentisztelet"
              required
            />
          </div>

          <div>
            <label
              htmlFor="public-post-excerpt"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5"
            >
              Rövid kivonat (excerpt)
            </label>
            <textarea
              id="public-post-excerpt"
              value={form.excerpt || ''}
              onChange={(e) => update('excerpt', e.target.value)}
              rows={2}
              className="modal-input"
              placeholder="Rövid bevezető, ami a listában és Google keresőben látszik"
            />
          </div>

          {form.slug ? (
            <ImageUploader
              label="Borítókép"
              value={form.cover_image_url || null}
              onChange={(url) => update('cover_image_url', url || '')}
              target={{ kind: 'post-cover', postSlug: form.slug }}
              aspectRatio="16:9"
              placeholder="Tölts fel egy borítóképet (opcionális)"
            />
          ) : (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Borítókép
              </label>
              <div className="p-4 rounded-xl bg-slate-50 text-sm text-slate-500 italic text-center">
                Először add meg a címet — a slug-hoz képest tudjuk elmenteni a képet.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Vizuális szerkesztő (TipTap WYSIWYG) */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-emerald-600" />
          Tartalom
        </h2>

        <TiptapEditor
          content={form.body_markdown}
          onChange={(html) => update('body_markdown', html)}
          ariaLabel="Bejegyzés tartalma"
          placeholder="Kezdj el írni... Használd a felső eszköztárat a formázáshoz."
        />
      </section>

      {/* Műveletek */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {form.id && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-600/25 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              Törlés
            </button>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => handleSave('draft')}
            disabled={isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/25 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto"
          >
            <Save className="w-4 h-4" />
            Mentés piszkozatként
          </button>
          <button
            type="button"
            onClick={() => handleSave('published')}
            disabled={isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-2.5 font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto"
          >
            <Send className="w-4 h-4" />
            {form.status === 'published' ? 'Módosítás publikálása' : 'Publikálás'}
          </button>
        </div>
      </div>
    </div>
  )
}
