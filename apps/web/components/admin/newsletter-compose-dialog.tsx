'use client'

/**
 * Fejlesztési hírlevél szerkesztő — több CHANGELOG bejegyzést EGY e-mailben.
 *
 * Lépések:
 *   1. Válaszd ki a hírlevélbe kerülő bejegyzéseket (multi-select)
 *   2. Írj rövid bevezetőt (opcionális, de ajánlott)
 *   3. Állítsd be a célcsoportot (mindenki / szerepkör)
 *   4. Előnézet — élőben frissül a kijelölés/cím/bevezető változására
 *   5. Küldés: körüzenet + opcionális e-mail
 *
 * 2026-07-11 admin-redesign:
 *   - a zsákutca-célzások (konkrét gyülekezet/megye/kerület) kikerültek a
 *     dialógusból — ezekhez sosem ment id-lista, a küldés mindig hibával
 *     bukott; finomabb célzáshoz a „Fejlesztések kiküldése" értesítés-küldő
 *     való;
 *   - az előnézet élő: a kijelölés/cím/bevezető változására automatikusan
 *     újragenerálódik (nem kell kézzel frissíteni);
 *   - token-alapú, dark-safe színek; mobil-biztos elrendezés és gombsor;
 *   - a szolgáltató-név (Resend) eltűnt a felületi szövegekből.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Eye,
  FlaskConical,
  Inbox,
  Loader2,
  Mail,
  Monitor,
  Send,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'

import { sendNewsletter, sendNewsletterTest } from '@/app/(dashboard)/admin/broadcasts-actions'
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
  /** Az összes aktív bejegyzés (a már elküldöttekkel együtt) — az újraküldéshez. */
  allEntries?: ChangelogEntry[]
  onSent?: () => void | Promise<void>
}

/** A hírlevél egyszerűsített célzása — csak ezekhez van teljes UI-támogatás. */
const NEWSLETTER_SCOPES: BroadcastTargetScope[] = ['all', 'role']

export function NewsletterComposeDialog({
  open,
  onOpenChange,
  unsentEntries,
  allEntries,
  onSent,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [isTestPending, startTestTransition] = useTransition()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [headerTitle, setHeaderTitle] = useState('')
  const [introText, setIntroText] = useState('')
  const [targetScope, setTargetScope] = useState<BroadcastTargetScope>('all')
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>('lelkesz')
  const [sendEmail, setSendEmail] = useState(true)
  const [resendMode, setResendMode] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  // 2026-06-13 (Endre): a Gmail ~102 kB felett LEVÁGJA a levelet — a végén
  // lévő DicsHub-ajánló + lábléc tűnik el elsőként („nem egyezik az
  // előnézettel"). Méret-őr: kétszintű jelzés 80/100 kB-nál.
  const [previewBytes, setPreviewBytes] = useState<number | null>(null)
  const GMAIL_RECOMMEND_BYTES = 80 * 1024
  const GMAIL_CLIP_BYTES = 100 * 1024
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
    setResendMode(false)
    setShowPreview(false)
    setPreviewHtml(null)
    setPreviewBytes(null)
  }, [open, unsentEntries])

  // A listában megjelenő bejegyzések: alap módban a még el nem küldöttek,
  // újraküldés módban az összes aktív bejegyzés (a már kiküldöttek is).
  const sourceEntries = resendMode && allEntries ? allEntries : unsentEntries

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelectedKeys(new Set(sourceEntries.map((e) => e.key)))
  }

  function selectNone() {
    setSelectedKeys(new Set())
  }

  const selectedCount = selectedKeys.size

  const selectedEntries = useMemo(
    () => sourceEntries.filter((e) => selectedKeys.has(e.key)),
    [sourceEntries, selectedKeys],
  )

  // Első előnézet-generálás (kliens oldalon — a template importálható kliensre)
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
      setPreviewBytes(new TextEncoder().encode(html).length)
      setShowPreview(true)
    } finally {
      setLoadingPreview(false)
    }
  }

  // ÉLŐ előnézet (2026-07-11 fix): ha az előnézet már látszik, a kijelölés /
  // cím / bevezető változására debounce-olva automatikusan újragenerálódik —
  // nem lehet elavult előnézet alapján küldeni.
  useEffect(() => {
    if (!open || !showPreview) return
    if (selectedEntries.length === 0) return
    const timer = setTimeout(async () => {
      const { buildNewsletterHtml } = await import('@/lib/broadcasts/newsletter-template')
      const html = buildNewsletterHtml({
        entries: selectedEntries,
        introText: introText.trim() || undefined,
        headerTitle: headerTitle.trim() || undefined,
      })
      setPreviewHtml(html)
      setPreviewBytes(new TextEncoder().encode(html).length)
    }, 350)
    return () => clearTimeout(timer)
  }, [open, showPreview, selectedEntries, headerTitle, introText])

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
        force: resendMode,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Hírlevél elküldve: ${result.markedSent} frissítés, ${result.recipientCount} címzett${sendEmail ? ' · e-mail is ment' : ''}.`,
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
          flex flex-col gap-0
          overflow-hidden rounded-2xl bg-card p-0
        "
      >
        <DialogHeader className="shrink-0 border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-3">
            <div
              className="icon-raised size-10"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
            >
              <Sparkles className="size-5 text-[var(--primary-foreground)]" aria-hidden />
            </div>
            <div>
              <span className="font-heading text-lg text-foreground">Fejlesztési hírlevél</span>
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                Több frissítést egybe csomagolva, egy szép formátumú e-mailben
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* BAL: SZERKESZTŐ */}
          <div className="min-w-0 space-y-5 overflow-y-auto border-b border-border px-4 py-4 sm:px-6 lg:border-b-0 lg:border-r">
            {/* Frissítés-kiválasztó */}
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-semibold">
                  Frissítések a hírlevélbe
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({selectedCount} / {sourceEntries.length} kiválasztva)
                  </span>
                </Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="xs" onClick={selectAll}>
                    Mind
                  </Button>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <Button type="button" variant="ghost" size="xs" onClick={selectNone}>
                    Egyiket sem
                  </Button>
                </div>
              </div>

              {/* Újraküldés mód — a már kiküldött frissítések is választhatók */}
              {allEntries && allEntries.length > unsentEntries.length && (
                <label className="mb-2 flex cursor-pointer select-none items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/40">
                  <input
                    type="checkbox"
                    checked={resendMode}
                    onChange={(e) => {
                      setResendMode(e.target.checked)
                      setSelectedKeys(new Set())
                    }}
                    className="mt-0.5 size-4 rounded border-input accent-amber-600"
                  />
                  <span className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Újraküldés mód</span> — a már korábban
                    kiküldött frissítések is megjelennek és újraküldhetők (pl. ha valami lemaradt
                    a hírlevélről). A korábbi címzettek ismét megkapják.
                  </span>
                </label>
              )}
              <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
                {sourceEntries.length === 0 ? (
                  <AdminEmptyState
                    icon={Inbox}
                    title="Nincs kiküldetlen frissítés"
                    hint="Új CHANGELOG-bejegyzés után itt jelenik meg."
                    className="py-6"
                  />
                ) : (
                  sourceEntries.map((e) => {
                    const checked = selectedKeys.has(e.key)
                    return (
                      <label
                        key={e.key}
                        className={`flex min-h-11 cursor-pointer items-start gap-3 p-3 ${
                          checked ? 'bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleKey(e.key)}
                          className="mt-1 size-4 rounded border-input accent-[var(--primary)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-foreground">
                            {e.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              {e.date}
                            </span>
                            {e.version && (
                              <Badge variant="outline" className="border-border py-0 text-[11px]">
                                v{e.version}
                              </Badge>
                            )}
                            {e.category && (
                              <Badge className="border-transparent bg-primary/10 py-0 text-[11px] text-primary">
                                {RELEASE_CATEGORY_LABELS[e.category]}
                              </Badge>
                            )}
                            {e.alreadySent && (
                              <StatusBadge intent="warning" className="py-0 text-[11px]">
                                már elküldve
                              </StatusBadge>
                            )}
                          </div>
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
                <Label htmlFor="newsletter-title" className="text-sm font-semibold">
                  Cím (opcionális)
                </Label>
                <Input
                  id="newsletter-title"
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  placeholder="Pl. Kartotéka — 2026. április fejlesztések"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Üresen hagyva: &bdquo;Kartotéka — Fejlesztési hírlevél&rdquo;
                </p>
              </div>

              <div>
                <Label htmlFor="newsletter-intro" className="text-sm font-semibold">
                  Bevezető (opcionális)
                </Label>
                <Textarea
                  id="newsletter-intro"
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  placeholder="Rövid személyes bevezetés a hírlevélhez — ezzel kezdi az e-mail a kategóriás listák előtt."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </section>

            {/* Célcsoport */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" aria-hidden />
                <Label className="mb-0 text-sm font-semibold">Címzettek</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {NEWSLETTER_SCOPES.map((s) => {
                  const active = targetScope === s
                  return (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      onClick={() => setTargetScope(s)}
                      aria-pressed={active}
                      className={`min-h-11 rounded-xl px-3 ${
                        active
                          ? 'border-transparent bg-primary/10 font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {BROADCAST_TARGET_SCOPE_LABELS[s]}
                    </Button>
                  )
                })}
              </div>
              {targetScope === 'role' && (
                <div className="mt-2">
                  <Label htmlFor="newsletter-role" className="text-xs">
                    Szerepkör
                  </Label>
                  <select
                    id="newsletter-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as BroadcastTargetRole)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                A hírlevél mindenkinek vagy egy szerepkörnek megy. Ha konkrét gyülekezetet,
                egyházmegyét vagy kerületet céloznál, a „Fejlesztések kiküldése” szekció
                értesítés-küldőjét használd.
              </p>
            </section>

            {/* E-mail kapcsoló */}
            <section>
              <label className="flex min-h-11 cursor-pointer select-none items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                />
                <span className="text-sm text-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Mail className="size-3.5" aria-hidden />
                    E-mailben is menjen a hírlevél
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    A címzettek a csengőben is látják a listát, emellett e-mailben megkapják a
                    szép hírlevél-változatot.
                  </span>
                </span>
              </label>
            </section>
          </div>

          {/* JOBB: ELŐNÉZET */}
          <div className="min-h-[50vh] min-w-0 overflow-y-auto bg-muted/30 px-4 py-4 lg:min-h-0">
            {!showPreview || !previewHtml ? (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-md">
                  <Eye className="mx-auto mb-3 size-12 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm font-medium text-foreground">Előnézet</p>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">
                    Generáld le az előnézetet — utána élőben frissül, ahogy változtatod a
                    kijelölést, a címet vagy a bevezetőt.
                  </p>
                  <Button
                    onClick={handlePreview}
                    disabled={loadingPreview || selectedCount === 0}
                    variant="outline"
                  >
                    {loadingPreview ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                    ) : (
                      <Eye className="mr-1.5 size-4" aria-hidden />
                    )}
                    Előnézet generálása
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {previewBytes != null && previewBytes > GMAIL_RECOMMEND_BYTES && (
                  <div
                    className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                      previewBytes > GMAIL_CLIP_BYTES
                        ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                        : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                    role="alert"
                  >
                    {previewBytes > GMAIL_CLIP_BYTES ? (
                      <>
                        <strong>
                          A levél {Math.round(previewBytes / 1024)} kB — a Gmail szinte biztosan
                          levágja!
                        </strong>{' '}
                        A levél VÉGE tűnik el elsőként (a DicsHub-ajánló és a lábléc), a címzett
                        csak „Üzenet csonkítva / Teljes üzenet megtekintése” linket lát. Jelölj ki
                        kevesebb frissítést, vagy küldd két-három részletben — így minden látszik.
                      </>
                    ) : (
                      <>
                        <strong>
                          A levél {Math.round(previewBytes / 1024)} kB — közelíted a Gmail
                          határát.
                        </strong>{' '}
                        A biztos megjelenéshez (a DicsHub-ajánlóval együtt) maradj 80 kB alatt;
                        sok bejegyzésnél érdemes két levélre osztani.
                      </>
                    )}
                  </div>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">Élő előnézet</span>
                  {previewBytes != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        previewBytes > GMAIL_CLIP_BYTES
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : previewBytes > GMAIL_RECOMMEND_BYTES
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                      title="A levél mérete — a Gmail ~102 kB felett csonkol; ajánlott 80 kB alatt maradni."
                    >
                      {Math.round(previewBytes / 1024)} kB
                    </span>
                  )}
                  {/* Asztali / mobil nézet-váltó — a reszponzivitás ellenőrzéséhez */}
                  <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setPreviewMode('desktop')}
                      aria-pressed={previewMode === 'desktop'}
                      className={`gap-1 ${
                        previewMode === 'desktop'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                      title="Asztali nézet"
                    >
                      <Monitor className="size-3.5" aria-hidden />
                      Asztali
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setPreviewMode('mobile')}
                      aria-pressed={previewMode === 'mobile'}
                      className={`gap-1 ${
                        previewMode === 'mobile'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                      title="Mobil nézet"
                    >
                      <Smartphone className="size-3.5" aria-hidden />
                      Mobil
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleDownload}
                    className="ml-auto text-muted-foreground"
                  >
                    HTML letöltése
                  </Button>
                </div>
                <div className="flex min-h-0 flex-1 justify-center overflow-y-auto rounded-xl border border-border bg-muted/50 shadow-inner">
                  <iframe
                    title="Hírlevél előnézet"
                    srcDoc={previewHtml}
                    className={`h-full bg-white transition-all duration-300 ${
                      previewMode === 'mobile'
                        ? 'w-[390px] max-w-full border-x border-border shadow-lg'
                        : 'w-full'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} frissítés a hírlevélben`
              : 'Válassz legalább egyet'}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isTestPending}
            >
              Mégse
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestSend}
              disabled={isPending || isTestPending || selectedCount === 0}
              className="text-primary"
              title="A hírlevelet CSAK a saját e-mail-címedre küldi ki, próbaként. Senki más nem kapja meg."
            >
              {isTestPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              ) : (
                <FlaskConical className="mr-1 size-4" aria-hidden />
              )}
              Teszt magamnak
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={isPending || isTestPending || selectedCount === 0}
            >
              {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
              <Send className="mr-1 size-4" aria-hidden />
              {resendMode ? 'Hírlevél újraküldése' : 'Hírlevél elküldése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
