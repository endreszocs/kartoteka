'use client'

/**
 * Fejlesztési hírlevél szerkesztő — több CHANGELOG bejegyzést EGY emailben.
 *
 * Lépések:
 *   1. Válaszd ki a hírlevélbe kerülő bejegyzéseket (multi-select)
 *   2. Írj rövid bevezetőt (opcionális, de ajánlott)
 *   3. Állítsd be a célcsoportot (szerepkör, gyülekezet, stb.)
 *   4. Előnézet — nyisd ki az iframe-ben az email HTML-t
 *   5. Küldés: broadcast + opcionális email Resenden keresztül
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Eye, FlaskConical, Loader2, Mail, Monitor, Send, Smartphone, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

import {
  sendNewsletter,
  sendNewsletterTest,
} from '@/app/(dashboard)/admin/broadcasts-actions'
import {
  BROADCAST_TARGET_SCOPE_LABELS,
  RELEASE_CATEGORY_LABELS,
  ROLE_OPTIONS,
  type BroadcastTargetRole,
  type BroadcastTargetScope,
  type ChangelogEntry,
} from '@/lib/broadcasts/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Az elküldhető (még nem elküldött) CHANGELOG bejegyzések. */
  unsentEntries: ChangelogEntry[]
  onSent?: () => void | Promise<void>
}

export function NewsletterComposeDialog({ open, onOpenChange, unsentEntries, onSent }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isTestPending, startTestTransition] = useTransition()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [headerTitle, setHeaderTitle] = useState('')
  const [introText, setIntroText] = useState('')
  const [targetScope, setTargetScope] = useState<BroadcastTargetScope>('all')
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>('lelkesz')
  const [sendEmail, setSendEmail] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  // Reset a megnyitáskor
  useEffect(() => {
    if (!open) return
    // Alapértelmezetten minden unsent bejegyzés kiválasztva
    setSelectedKeys(new Set(unsentEntries.map((e) => e.key)))
    setHeaderTitle('')
    setIntroText('')
    setTargetScope('all')
    setTargetRole('lelkesz')
    setSendEmail(true)
    setShowPreview(false)
    setPreviewHtml(null)
  }, [open, unsentEntries])

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelectedKeys(new Set(unsentEntries.map((e) => e.key)))
  }

  function selectNone() {
    setSelectedKeys(new Set())
  }

  const selectedCount = selectedKeys.size

  const selectedEntries = useMemo(
    () => unsentEntries.filter((e) => selectedKeys.has(e.key)),
    [unsentEntries, selectedKeys],
  )

  // Előnézet generálás kliens oldalon (a template import-olható kliensre is)
  async function handlePreview() {
    if (selectedCount === 0) {
      toast.error('Válassz ki legalább egy frissítést.')
      return
    }
    setLoadingPreview(true)
    try {
      const { buildNewsletterHtml } = await import('@/lib/broadcasts/newsletter-template')
      const html = buildNewsletterHtml({
        entries: selectedEntries,
        introText: introText.trim() || undefined,
        headerTitle: headerTitle.trim() || undefined,
      })
      setPreviewHtml(html)
      setShowPreview(true)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleDownload() {
    if (selectedCount === 0) {
      toast.error('Válassz ki legalább egy frissítést.')
      return
    }
    const { buildNewsletterHtml } = await import('@/lib/broadcasts/newsletter-template')
    const html = buildNewsletterHtml({
      entries: selectedEntries,
      introText: introText.trim() || undefined,
      headerTitle: headerTitle.trim() || undefined,
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date().toISOString().slice(0, 10)
    a.download = `Kartoteka_hirlevel_${today}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Hírlevél HTML letöltve.')
  }

  function handleTestSend() {
    if (selectedCount === 0) {
      toast.error('Válassz ki legalább egy frissítést.')
      return
    }
    startTestTransition(async () => {
      const result = await sendNewsletterTest({
        changelogKeys: Array.from(selectedKeys),
        headerTitle: headerTitle.trim() || undefined,
        introText: introText.trim() || undefined,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Teszt-hírlevél elküldve a saját címedre: ${result.email}. Ez senki másnak nem ment ki.`,
        { duration: 6000 },
      )
    })
  }

  function handleSend() {
    if (selectedCount === 0) {
      toast.error('Válassz ki legalább egy frissítést.')
      return
    }
    startTransition(async () => {
      const result = await sendNewsletter({
        changelogKeys: Array.from(selectedKeys),
        headerTitle: headerTitle.trim() || undefined,
        introText: introText.trim() || undefined,
        targetScope,
        targetRole: targetScope === 'role' ? targetRole : null,
        sendEmail,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Hírlevél elküldve: ${result.markedSent} frissítés, ${result.recipientCount} címzett${sendEmail ? ' · email is ment' : ''}.`,
        { duration: 6000 },
      )
      onOpenChange(false)
      if (onSent) await onSent()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[min(1280px,96vw)]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden p-0 gap-0
          border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50/20
          rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-zinc-100 px-6 py-4 bg-gradient-to-br from-indigo-50/60 to-white">
          <DialogTitle className="flex items-center gap-3">
            <div className="icon-raised w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-heading text-lg">Fejlesztési hírlevél</span>
              <p className="text-xs text-zinc-400 mt-0.5 font-normal">
                Több frissítést egybe csomagolva, egy szép formátumú email-ben
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* BAL: SZERKESZTŐ */}
          <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-5 border-b lg:border-b-0 lg:border-r border-zinc-100 min-w-0">
            {/* Frissítés-kiválasztó */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Frissítések a hírlevélbe
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({selectedCount} / {unsentEntries.length} kiválasztva)
                  </span>
                </Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Mind
                  </button>
                  <span className="text-xs text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Egyiket sem
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white max-h-80 overflow-y-auto divide-y divide-slate-100">
                {unsentEntries.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500 italic">
                    Nincs el nem küldött frissítés. Új CHANGELOG bejegyzés esetén itt megjelenik.
                  </p>
                ) : (
                  unsentEntries.map((e) => {
                    const checked = selectedKeys.has(e.key)
                    return (
                      <label
                        key={e.key}
                        className={`flex items-start gap-3 p-3 cursor-pointer ${checked ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleKey(e.key)}
                          className="mt-1 size-4 rounded border-slate-300 accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono text-[10px] text-slate-400">{e.date}</span>
                            {e.version && (
                              <Badge variant="outline" className="border-slate-200 text-[10px] py-0">
                                v{e.version}
                              </Badge>
                            )}
                            {e.category && (
                              <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] py-0">
                                {RELEASE_CATEGORY_LABELS[e.category]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-800 leading-snug mt-0.5">
                            {e.title}
                          </p>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </section>

            {/* Hírlevél cím + bevezető */}
            <section className="space-y-3">
              <div>
                <Label className="text-sm font-semibold text-slate-700">
                  Cím (opcionális)
                </Label>
                <Input
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  placeholder="Pl. Kartotéka — 2026. április fejlesztések"
                  className="mt-1"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Üresen hagyva: &bdquo;Kartotéka — Fejlesztési hírlevél&rdquo;
                </p>
              </div>

              <div>
                <Label className="text-sm font-semibold text-slate-700">
                  Bevezető (opcionális)
                </Label>
                <Textarea
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  placeholder="Rövid személyes bevezetés a hírlevélhez — ezzel kezdi az email a kategóriás listák előtt."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </section>

            {/* Célcsoport */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Users className="size-4 text-slate-600" />
                <Label className="text-sm font-semibold text-slate-700 mb-0">Címzettek</Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(['all', 'role', 'congregation', 'diocese', 'district'] as BroadcastTargetScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTargetScope(s)}
                    className={`rounded-xl border px-3 py-2 text-xs transition ${
                      targetScope === s
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                    }`}
                  >
                    {BROADCAST_TARGET_SCOPE_LABELS[s]}
                  </button>
                ))}
              </div>
              {targetScope === 'role' && (
                <div className="mt-2">
                  <Label className="text-xs">Szerepkör</Label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as BroadcastTargetRole)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {(targetScope === 'congregation' || targetScope === 'diocese' || targetScope === 'district') && (
                <p className="mt-2 text-xs text-amber-700 italic">
                  Konkrét gyülekezet/egyházmegye/kerület kiválasztásához használja a
                  hagyományos Broadcast felületet (ez a hírlevél most csak a fenti
                  egyszerűsített szűrésekkel megy).
                </p>
              )}
            </section>

            {/* Email toggle */}
            <section>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-1 size-4 rounded border-slate-300 accent-indigo-600"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    Email kiküldése (Resend)
                  </span>
                  <span className="block text-xs text-slate-500">
                    A címzettek a csengőben is látják a listát, emellett email-ben
                    megkapják a szép hírlevél verziót.
                  </span>
                </span>
              </label>
            </section>
          </div>

          {/* JOBB: ELŐNÉZET */}
          <div className="overflow-y-auto bg-slate-100/60 px-4 py-4 min-h-[50vh] lg:min-h-0 min-w-0">
            {!showPreview || !previewHtml ? (
              <div className="h-full flex items-center justify-center text-center">
                <div className="max-w-md">
                  <Eye className="size-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700">Előnézet</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Kattints az Előnézet gombra alul, hogy megnézd, hogyan fog kinézni
                    a hírlevél.
                  </p>
                  <Button
                    onClick={handlePreview}
                    disabled={loadingPreview || selectedCount === 0}
                    variant="outline"
                    className="rounded-xl"
                  >
                    {loadingPreview ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Eye className="mr-1.5 size-4" />
                    )}
                    Előnézet generálása
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-700">Élő előnézet</span>
                  {/* Desktop / Mobil nézet-váltó — a reszponzivitás ellenőrzéséhez */}
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('desktop')}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        previewMode === 'desktop'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Asztali nézet"
                    >
                      <Monitor className="size-3.5" />
                      Asztali
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('mobile')}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        previewMode === 'mobile'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Mobil nézet"
                    >
                      <Smartphone className="size-3.5" />
                      Mobil
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="text-xs text-indigo-600 hover:underline ml-auto"
                  >
                    Frissít
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    HTML letöltés
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-slate-200/50 shadow-inner border border-slate-200 flex justify-center">
                  <iframe
                    title="Hírlevél előnézet"
                    srcDoc={previewHtml}
                    className={`h-full bg-white transition-all duration-300 ${
                      previewMode === 'mobile'
                        ? 'w-[390px] max-w-full border-x border-slate-300 shadow-lg'
                        : 'w-full'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {selectedCount > 0 ? `${selectedCount} frissítés a hírlevélben` : 'Válassz legalább egyet'}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isTestPending}
              className="rounded-xl"
            >
              Mégse
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestSend}
              disabled={isPending || isTestPending || selectedCount === 0}
              className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              title="A hírlevelet CSAK a saját email-címedre küldi ki, próbaként. Senki más nem kapja meg."
            >
              {isTestPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <FlaskConical className="mr-1 size-4" />
              )}
              Teszt magamnak
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={isPending || isTestPending || selectedCount === 0}
              className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              <Send className="mr-1 size-4" />
              Hírlevél elküldése
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
