'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { savePublicSiteSettings } from '@/app/(dashboard)/publikus-oldal/actions'
import type { PublicSiteSettingsInput } from '@/lib/validations/public-site'
import { Save, Palette, Eye, EyeOff, Image as ImageIcon } from 'lucide-react'
import { ImageUploader } from './image-uploader'
import { TiptapEditor } from './tiptap-editor'

interface ThemePreset {
  id: string
  preset_key: string
  display_name: string
  description: string | null
  colors: { primary: string; accent: string; surface: string; ink: string; muted: string; soft: string }
  typography: { heading_font: string; body_font: string }
  hero_style: string
}

interface Props {
  initial: PublicSiteSettingsInput
  themes: ThemePreset[]
}

export function PublicSiteSettingsForm({ initial, themes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PublicSiteSettingsInput>(initial)

  function update<K extends keyof PublicSiteSettingsInput>(key: K, value: PublicSiteSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await savePublicSiteSettings(form)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Beállítások elmentve!')
        router.refresh()
      }
    })
  }

  const selectedTheme = themes.find((t) => t.id === form.theme_id)
  const previewPrimary = form.custom_primary_color || selectedTheme?.colors.primary || '#14514b'
  const previewAccent = form.custom_accent_color || selectedTheme?.colors.accent || '#d4a04a'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Alapadatok */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Alapadatok</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Slug (URL rész) *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">/gy/</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="maroscsapo"
                className="modal-input flex-1"
                required
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Ez a publikus oldal címének része lesz.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Megjelenítendő név *
            </label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => update('display_name', e.target.value)}
              className="modal-input"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Alcím / szlogen
            </label>
            <input
              type="text"
              value={form.tagline || ''}
              onChange={(e) => update('tagline', e.target.value)}
              placeholder="pl. Reformátusok az Olt mentén"
              className="modal-input"
            />
          </div>
        </div>
      </section>

      {/* Képek */}
      <section className="card-raised p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="w-5 h-5 text-emerald-600" />
          <h2 className="font-heading text-xl text-slate-800">Képek</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploader
            label="Hero / borítókép"
            value={form.hero_image_url || null}
            onChange={(url) => update('hero_image_url', url || '')}
            target={{ kind: 'hero' }}
            aspectRatio="16:9"
            placeholder="Borítókép a kezdőlapra"
          />
          <ImageUploader
            label="Címer / logó"
            value={form.crest_image_url || null}
            onChange={(url) => update('crest_image_url', url || '')}
            target={{ kind: 'crest' }}
            aspectRatio="square"
            placeholder="Gyülekezet címere"
          />
        </div>
      </section>

      {/* Téma */}
      <section className="card-raised p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-emerald-600" />
          <h2 className="font-heading text-xl text-slate-800">Téma és megjelenés</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((theme) => (
            <button
              type="button"
              key={theme.id}
              onClick={() => update('theme_id', theme.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                form.theme_id === theme.id
                  ? 'border-emerald-500 shadow-sm shadow-emerald-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              style={{
                background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.soft} 100%)`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: theme.colors.accent }}
                />
                <span className="font-semibold text-sm" style={{ color: theme.colors.ink }}>
                  {theme.display_name}
                </span>
              </div>
              <p className="text-xs" style={{ color: theme.colors.muted }}>
                {theme.description}
              </p>
            </button>
          ))}
        </div>

        {/* Színek felülírása */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Elsődleges szín (opcionális)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.custom_primary_color || previewPrimary}
                onChange={(e) => update('custom_primary_color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200"
              />
              <input
                type="text"
                value={form.custom_primary_color || ''}
                onChange={(e) => update('custom_primary_color', e.target.value)}
                placeholder="Alap: preset szerint"
                className="modal-input flex-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Akcentus szín (opcionális)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.custom_accent_color || previewAccent}
                onChange={(e) => update('custom_accent_color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200"
              />
              <input
                type="text"
                value={form.custom_accent_color || ''}
                onChange={(e) => update('custom_accent_color', e.target.value)}
                placeholder="Alap: preset szerint"
                className="modal-input flex-1"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Elérhetőség */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Elérhetőség</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={form.contact_email || ''}
              onChange={(e) => update('contact_email', e.target.value)}
              className="modal-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Telefon
            </label>
            <input
              type="tel"
              value={form.contact_phone || ''}
              onChange={(e) => update('contact_phone', e.target.value)}
              className="modal-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Cím
            </label>
            <input
              type="text"
              value={form.address || ''}
              onChange={(e) => update('address', e.target.value)}
              placeholder="pl. 537 350 Maroscsapó, Fő út 1."
              className="modal-input"
            />
          </div>
        </div>
      </section>

      {/* Rólunk szöveg */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Rólunk szöveg</h2>
        <TiptapEditor
          content={form.about_html || ''}
          onChange={(html) => update('about_html', html)}
          placeholder="Rövid bemutatkozó szöveg a gyülekezetről..."
          compact
        />
        <p className="text-xs text-slate-400 mt-2">
          A vizuális szerkesztőben írd meg a gyülekezet bemutatóját. A tartalom automatikusan sanitizálásra kerül.
        </p>
      </section>

      {/* Nyilvános statisztikák */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-2">Nyilvános statisztikák</h2>
        <p className="text-sm text-slate-500 mb-4">Válaszd ki milyen adatokat jelenítsen meg a publikus oldalon. A számok automatikusan frissülnek, de felülírhatók.</p>
        <div className="space-y-3">
          {[
            { key: 'show_member_count' as const, label: 'Aktív tagok száma', overrideKey: 'override_member_count' as const },
            { key: 'show_presbyter_count' as const, label: 'Presbiterek száma', overrideKey: 'override_presbyter_count' as const },
            { key: 'show_family_count' as const, label: 'Családok száma', overrideKey: 'override_family_count' as const },
          ].map((stat) => (
            <div key={stat.key} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={!!form[stat.key]}
                  onChange={(e) => update(stat.key, e.target.checked)}
                />
                <span className="text-sm font-medium text-slate-700">{stat.label}</span>
              </label>
              {form[stat.key] && (
                <input
                  type="number"
                  value={form[stat.overrideKey] ?? ''}
                  onChange={(e) => update(stat.overrideKey, e.target.value ? Number(e.target.value) : null)}
                  placeholder="Automatikus"
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right"
                />
              )}
            </div>
          ))}
          <label className="flex items-center gap-2 p-3 rounded-xl hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.show_age_distribution}
              onChange={(e) => update('show_age_distribution', e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-700">Életkor eloszlás</span>
          </label>
        </div>
      </section>

      {/* Publikálás */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Publikálás</h2>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => update('is_published', e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-slate-700 flex items-center gap-2">
                {form.is_published ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                Publikus oldal élesítése
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ha bekapcsolod, bárki elérheti a /gy/{form.slug} címen.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={form.robots_index}
              onChange={(e) => update('robots_index', e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-slate-700">
                Google és más keresők indexelhetik
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ha bekapcsolod, a keresők megtalálják az oldalt. Alapértelmezésben kikapcsolva.
              </p>
            </div>
          </label>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Mentés...' : 'Mentés'}
        </button>
      </div>
    </form>
  )
}
