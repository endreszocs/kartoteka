'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { savePublicSiteSettings } from '@/app/(dashboard)/publikus-oldal/actions'
import type {
  PublicServiceTime,
  PublicSiteSettingsInput,
} from '@/lib/validations/public-site'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Palette,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
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
  const serviceTimesSupported = initial.service_times !== undefined

  function update<K extends keyof PublicSiteSettingsInput>(key: K, value: PublicSiteSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addServiceTime() {
    const current = form.service_times ?? []
    if (current.length >= 12) {
      toast.error('Legfeljebb 12 rendszeres alkalom adható meg.')
      return
    }

    update('service_times', [
      ...current,
      {
        id: globalThis.crypto.randomUUID(),
        day: '',
        time: '',
        title: '',
        location: '',
        note: '',
      },
    ])
  }

  function updateServiceTime<K extends keyof PublicServiceTime>(
    id: string,
    key: K,
    value: PublicServiceTime[K],
  ) {
    update(
      'service_times',
      (form.service_times ?? []).map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    )
  }

  function removeServiceTime(id: string) {
    update(
      'service_times',
      (form.service_times ?? []).filter((item) => item.id !== id),
    )
  }

  function moveServiceTime(index: number, direction: -1 | 1) {
    const current = [...(form.service_times ?? [])]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= current.length) return

    const [item] = current.splice(index, 1)
    if (!item) return
    current.splice(targetIndex, 0, item)
    update('service_times', current)
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
        {/* 2026-08-27 — Endre: „a gyülekezet címere látszódjon". A címer eddig
            CSAK innen jöhetett; ha itt üres volt, a weboldalon a Kartotéka
            termék-logója jelent meg. Mostantól a gyülekezeti adatoknál mentett
            címer a tartalék — ezt itt is kiírjuk, hogy ne tűnjön hibának, ha
            a mező üres, de az oldalon mégis ott a címer. */}
        {!form.crest_image_url && (
          <p className="mt-3 text-xs text-slate-500">
            Ha ezt üresen hagyod, a weboldalon a <strong>Gyülekezetünk adatai</strong> alatt
            mentett címer jelenik meg. Itt csak akkor tölts fel képet, ha a weboldalon
            <em> mást</em> szeretnél mutatni.
          </p>
        )}
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
        {/* 2026-08-27 — Endre: „Az elérhetőségek látszódjanak, amik le vannak
            mentve a gyülekezeti adatoknál." Ugyanaz a hibaosztály, mint a
            címernél: ez a három mező a `public_sites` SAJÁT adata volt, és
            üresen a weboldalon a „hamarosan felkerülnek" szöveg állt. */}
        <p className="mb-4 text-xs text-slate-500">
          Üresen hagyva a <strong>Gyülekezetünk adatai</strong> alatt mentett e-mail-cím,
          telefonszám és cím jelenik meg a weboldalon. Itt csak akkor írj be adatot, ha a
          nyilvános oldalon <em>más</em> elérhetőséget szeretnél közölni.
        </p>
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

      {/* Rendszeres alkalmak */}
      <section className="card-raised p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CalendarClock className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl text-slate-800">Rendszeres alkalmak</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Csak a valóban állandó időpontokat add meg. A sorrend itt és a
                nyilvános oldalon is ugyanaz lesz.
              </p>
            </div>
          </div>
          {serviceTimesSupported && (
            <button
              type="button"
              onClick={addServiceTime}
              disabled={(form.service_times?.length ?? 0) >= 12}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Plus className="size-4" aria-hidden="true" />
              Alkalom hozzáadása
            </button>
          )}
        </div>

        {!serviceTimesSupported ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
          >
            Az alkalmak szerkesztése az adatbázis-frissítés után válik elérhetővé.
            A többi weboldal-beállítást addig is biztonságosan mentheted.
          </div>
        ) : (form.service_times?.length ?? 0) === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center sm:p-8">
            <CalendarClock className="mx-auto size-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-medium text-slate-700">Még nincs közzétett rendszeres alkalom.</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              A nyilvános oldal ilyenkor nem talál ki időpontot, hanem erről egyértelmű
              tájékoztatást mutat.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {(form.service_times ?? []).map((serviceTime, index) => {
              const prefix = `public-site-service-${serviceTime.id}`

              return (
                <fieldset
                  key={serviceTime.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <legend className="sr-only">{index + 1}. rendszeres alkalom</legend>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="inline-flex min-h-8 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {index + 1}. alkalom
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveServiceTime(index, -1)}
                        disabled={index === 0}
                        className="inline-flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/20 disabled:opacity-30"
                        aria-label={`${index + 1}. alkalom feljebb mozgatása`}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveServiceTime(index, 1)}
                        disabled={index === (form.service_times?.length ?? 0) - 1}
                        className="inline-flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/20 disabled:opacity-30"
                        aria-label={`${index + 1}. alkalom lejjebb mozgatása`}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeServiceTime(serviceTime.id)}
                        className="inline-flex size-11 items-center justify-center rounded-xl text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20"
                        aria-label={`${index + 1}. alkalom törlése`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(9rem,0.65fr)]">
                    <div>
                      <label htmlFor={`${prefix}-day`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Nap vagy ismétlődés *
                      </label>
                      <input
                        id={`${prefix}-day`}
                        type="text"
                        required
                        maxLength={80}
                        value={serviceTime.day}
                        onChange={(event) => updateServiceTime(serviceTime.id, 'day', event.target.value)}
                        placeholder="pl. Vasárnap vagy minden hónap első péntekén"
                        className="modal-input"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${prefix}-time`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Kezdés *
                      </label>
                      <input
                        id={`${prefix}-time`}
                        type="time"
                        required
                        value={serviceTime.time}
                        onChange={(event) => updateServiceTime(serviceTime.id, 'time', event.target.value)}
                        className="modal-input"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${prefix}-title`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Alkalom neve *
                      </label>
                      <input
                        id={`${prefix}-title`}
                        type="text"
                        required
                        maxLength={80}
                        value={serviceTime.title}
                        onChange={(event) => updateServiceTime(serviceTime.id, 'title', event.target.value)}
                        placeholder="pl. Istentisztelet, bibliaóra vagy ifjúsági alkalom"
                        className="modal-input"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${prefix}-location`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Helyszín
                      </label>
                      <input
                        id={`${prefix}-location`}
                        type="text"
                        maxLength={120}
                        value={serviceTime.location || ''}
                        onChange={(event) => updateServiceTime(serviceTime.id, 'location', event.target.value)}
                        placeholder="Opcionális"
                        className="modal-input"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${prefix}-note`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Rövid megjegyzés
                      </label>
                      <input
                        id={`${prefix}-note`}
                        type="text"
                        maxLength={160}
                        value={serviceTime.note || ''}
                        onChange={(event) => updateServiceTime(serviceTime.id, 'note', event.target.value)}
                        placeholder="Opcionális"
                        className="modal-input"
                      />
                    </div>
                  </div>
                </fieldset>
              )
            })}
            <p className="text-right text-xs text-slate-500">
              {form.service_times?.length ?? 0} / 12 alkalom
            </p>
          </div>
        )}
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
          {/* 2026-08-26 (5. kör): tisztségviselők + közelgő események szekció. */}
          <label htmlFor="public-site-show-tisztsegek" className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl p-3 hover:bg-slate-50">
            <input
              id="public-site-show-tisztsegek"
              type="checkbox"
              checked={!!form.show_tisztsegek}
              onChange={(e) => update('show_tisztsegek', e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Tisztségviselőink</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                A Tagnyilvántartás → Tisztségek fülön publikusra jelölt tisztségviselők neve és
                tisztsége. Egy név CSAK akkor jelenik meg, ha a személyi kartonon a név-publikálási
                hozzájárulás is rögzítve van (GDPR).
              </span>
            </span>
          </label>
          <label htmlFor="public-site-show-events" className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl p-3 hover:bg-slate-50">
            <input
              id="public-site-show-events"
              type="checkbox"
              checked={!!form.show_events}
              onChange={(e) => update('show_events', e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Közelgő események</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                A határidőnaplóban publikusra jelölt események (cím, időpont, helyszín) a következő
                90 napból — a leírás és a megjegyzés sosem kerül ki.
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
