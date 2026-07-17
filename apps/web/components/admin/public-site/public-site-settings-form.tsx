'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { savePublicSiteSettings } from '@/app/(dashboard)/publikus-oldal/actions'
import type { PublicSiteSettingsInput } from '@/lib/validations/public-site'
import { Save, Palette, Eye, EyeOff, Image as ImageIcon } from 'lucide-react'
import { ImageUploader } from './image-uploader'
import { TiptapEditor } from './tiptap-editor'
import {
  PublicSiteThemePicker,
  type PublicSiteThemeOption,
} from './public-site-theme-picker'

interface Props {
  initial: PublicSiteSettingsInput
  themes: PublicSiteThemeOption[]
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR_PATTERN.test(value) ? value : fallback
}

function relativeLuminance(hex: string): number {
  const normalized = hex.slice(1)
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
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
    if (primaryColorInvalid) {
      toast.error('Az elsődleges szín formátuma vagy kontrasztja nem megfelelő.')
      return
    }
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
  const basePrimary = normalizeHexColor(selectedTheme?.colors.primary, '#14514b')
  const baseAccent = normalizeHexColor(selectedTheme?.colors.accent, '#d4a04a')
  const baseSurface = normalizeHexColor(selectedTheme?.colors.surface, '#fffdf8')
  const previewPrimary = normalizeHexColor(form.custom_primary_color, basePrimary)
  const previewAccent = normalizeHexColor(form.custom_accent_color, baseAccent)
  const primaryColorFormatInvalid = Boolean(
    form.custom_primary_color && !HEX_COLOR_PATTERN.test(form.custom_primary_color),
  )
  const accentColorInvalid = Boolean(
    form.custom_accent_color && !HEX_COLOR_PATTERN.test(form.custom_accent_color),
  )
  const primaryContrast = contrastRatio(previewPrimary, '#ffffff')
  const accentContrast = contrastRatio(previewAccent, baseSurface)
  const primaryContrastInvalid = Boolean(
    form.custom_primary_color
      && !primaryColorFormatInvalid
      && primaryContrast < 4.5,
  )
  const primaryColorInvalid = primaryColorFormatInvalid || primaryContrastInvalid

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Alapadatok */}
      <section className="card-raised p-4 sm:p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Alapadatok</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="public-site-slug" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Slug (URL rész) *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">/gy/</span>
              <input
                id="public-site-slug"
                type="text"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="maroscsapo"
                className="modal-input flex-1"
                aria-describedby="public-site-slug-help"
                required
              />
            </div>
            <p id="public-site-slug-help" className="text-xs text-slate-500 mt-1">Ez a publikus oldal címének része lesz.</p>
          </div>

          <div>
            <label htmlFor="public-site-display-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Megjelenítendő név *
            </label>
            <input
              id="public-site-display-name"
              type="text"
              value={form.display_name}
              onChange={(e) => update('display_name', e.target.value)}
              className="modal-input"
              required
            />
          </div>

          <div>
            <label htmlFor="public-site-tagline" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Alcím / szlogen
            </label>
            <input
              id="public-site-tagline"
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
      <section className="card-raised p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="w-5 h-5 text-emerald-600" aria-hidden="true" />
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
      <section className="card-raised p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          <h2 className="font-heading text-xl text-slate-800">Téma és megjelenés</h2>
        </div>

        <PublicSiteThemePicker
          themes={themes}
          value={form.theme_id}
          onValueChange={(themeId) => update('theme_id', themeId)}
        />

        {/* Színek felülírása */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div>
            <label htmlFor="public-site-primary-color" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Elsődleges szín (opcionális)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="public-site-primary-color-picker"
                type="color"
                value={previewPrimary}
                onChange={(e) => update('custom_primary_color', e.target.value)}
                className="size-11 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                aria-label="Elsődleges szín kiválasztása"
              />
              <input
                id="public-site-primary-color"
                type="text"
                value={form.custom_primary_color || ''}
                onChange={(e) => update('custom_primary_color', e.target.value)}
                placeholder="Alap: preset szerint"
                className="modal-input flex-1"
                pattern="^#[0-9A-Fa-f]{6}$"
                maxLength={7}
                aria-invalid={primaryColorInvalid}
                aria-describedby="public-site-primary-color-help"
              />
            </div>
            <p
              id="public-site-primary-color-help"
              className={`mt-1 text-xs ${primaryColorInvalid ? 'text-red-600' : 'text-slate-500'}`}
            >
              {primaryColorFormatInvalid
                ? 'Használj #RRGGBB formátumot.'
                : primaryContrastInvalid
                  ? 'Válassz sötétebb színt: fehér felirattal legalább 4.5:1 kontraszt szükséges.'
                  : 'Például: #14514b'}
            </p>
          </div>
          <div>
            <label htmlFor="public-site-accent-color" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Akcentus szín (opcionális)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="public-site-accent-color-picker"
                type="color"
                value={previewAccent}
                onChange={(e) => update('custom_accent_color', e.target.value)}
                className="size-11 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                aria-label="Akcentus szín kiválasztása"
              />
              <input
                id="public-site-accent-color"
                type="text"
                value={form.custom_accent_color || ''}
                onChange={(e) => update('custom_accent_color', e.target.value)}
                placeholder="Alap: preset szerint"
                className="modal-input flex-1"
                pattern="^#[0-9A-Fa-f]{6}$"
                maxLength={7}
                aria-invalid={accentColorInvalid}
                aria-describedby="public-site-accent-color-help"
              />
            </div>
            <p
              id="public-site-accent-color-help"
              className={`mt-1 text-xs ${accentColorInvalid ? 'text-red-600' : 'text-slate-500'}`}
            >
              {accentColorInvalid ? 'Használj #RRGGBB formátumot.' : 'Például: #d4a04a'}
            </p>
          </div>
        </div>

        {(form.custom_primary_color || form.custom_accent_color)
          && !primaryColorInvalid
          && !accentColorInvalid
          && accentContrast < 4.5 && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"
          >
            Az akcentusszín kontrasztja gyenge lehet. A jó olvashatósághoz
            válassz erősebb akcentusszínt; a publikus oldal szöveges elemei
            addig automatikusan biztonságos tartalékszínt használnak.
          </div>
        )}
      </section>

      {/* Elérhetőség */}
      <section className="card-raised p-4 sm:p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Elérhetőség</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="public-site-contact-email" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Email
            </label>
            <input
              id="public-site-contact-email"
              type="email"
              value={form.contact_email || ''}
              onChange={(e) => update('contact_email', e.target.value)}
              className="modal-input"
            />
          </div>
          <div>
            <label htmlFor="public-site-contact-phone" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Telefon
            </label>
            <input
              id="public-site-contact-phone"
              type="tel"
              value={form.contact_phone || ''}
              onChange={(e) => update('contact_phone', e.target.value)}
              className="modal-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="public-site-address" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Cím
            </label>
            <input
              id="public-site-address"
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
      <section className="card-raised p-4 sm:p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Rólunk szöveg</h2>
        <TiptapEditor
          content={form.about_html || ''}
          onChange={(html) => update('about_html', html)}
          ariaLabel="Rólunk szöveg"
          placeholder="Rövid bemutatkozó szöveg a gyülekezetről..."
          compact
        />
        <p className="text-xs text-slate-500 mt-2">
          A vizuális szerkesztőben írd meg a gyülekezet bemutatóját. A tartalom automatikusan sanitizálásra kerül.
        </p>
      </section>

      {/* Nyilvános statisztikák */}
      <section className="card-raised p-4 sm:p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-2">Nyilvános statisztikák</h2>
        <p className="text-sm text-slate-500 mb-4">Válaszd ki milyen adatokat jelenítsen meg a publikus oldalon. A számok automatikusan frissülnek, de felülírhatók.</p>
        <div className="space-y-3">
          {[
            { key: 'show_member_count' as const, label: 'Aktív tagok száma', overrideKey: 'override_member_count' as const },
            { key: 'show_presbyter_count' as const, label: 'Presbiterek száma', overrideKey: 'override_presbyter_count' as const },
            { key: 'show_family_count' as const, label: 'Családok száma', overrideKey: 'override_family_count' as const },
          ].map((stat) => {
            const checkboxId = `public-site-${stat.key}`
            const overrideId = `public-site-${stat.overrideKey}`

            return (
              <div key={stat.key} className="flex flex-col gap-3 rounded-xl p-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                <label htmlFor={checkboxId} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={!!form[stat.key]}
                    onChange={(e) => update(stat.key, e.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-700">{stat.label}</span>
                </label>
                {form[stat.key] && (
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <label htmlFor={overrideId} className="text-xs text-slate-500 sm:sr-only">
                      Kézi felülírás
                    </label>
                    <input
                      id={overrideId}
                      type="number"
                      min={0}
                      max={1_000_000}
                      step={1}
                      value={form[stat.overrideKey] ?? ''}
                      onChange={(e) => update(stat.overrideKey, e.target.value ? Number(e.target.value) : null)}
                      placeholder="Automatikus"
                      className="min-h-11 w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                    />
                  </div>
                )}
              </div>
            )
          })}
          <label htmlFor="public-site-show-age-distribution" className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl p-3 hover:bg-slate-50">
            <input
              id="public-site-show-age-distribution"
              type="checkbox"
              checked={!!form.show_age_distribution}
              onChange={(e) => update('show_age_distribution', e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Korosztályok megoszlása</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Csak legalább 25 tag és adatvédelmileg megfelelő csoportméretek esetén jelenik meg.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Publikálás */}
      <section className="card-raised p-4 sm:p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Publikálás</h2>
        <div className="space-y-3">
          <label htmlFor="public-site-is-published" className="flex min-h-11 items-start gap-3 rounded-xl p-3 hover:bg-slate-50 cursor-pointer">
            <input
              id="public-site-is-published"
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => update('is_published', e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-slate-700 flex items-center gap-2">
                {form.is_published ? <Eye className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <EyeOff className="w-4 h-4 text-slate-400" aria-hidden="true" />}
                Publikus oldal élesítése
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ha bekapcsolod, bárki elérheti a /gy/{form.slug} címen.
              </p>
            </div>
          </label>

          <label htmlFor="public-site-robots-index" className="flex min-h-11 items-start gap-3 rounded-xl p-3 hover:bg-slate-50 cursor-pointer">
            <input
              id="public-site-robots-index"
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
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {isPending ? 'Mentés...' : 'Mentés'}
        </button>
      </div>
    </form>
  )
}
