'use client'

/**
 * 2026-08-11 (P2 #26) — fókuszcsapda a saját portálos (`kt-modal`) modálokhoz.
 *
 * ## Mi volt a hiba
 *
 * A `program-dialog.tsx` és a `batch-program-dialog.tsx` `role="dialog"` +
 * `aria-modal="true"` attribútumot állít, DE sehol nem volt fókuszcsapda, nem
 * volt fókusz-visszaadás a triggerre, és a háttér tartalma sem kapott
 * `inert`/`aria-hidden`-t — csak Esc-kezelő és body-scroll-lock. Így a Tab
 * azonnal kivándorolt a modál MÖGÉ (a menübe, a fejlécbe, a listákba),
 * miközben a felhasználó — és a képernyőolvasó — azt hitte, modális ablakban
 * van. Az `aria-modal="true"` ilyenkor kifejezetten HAZUDIK.
 *
 * A repó összes többi modálja a base-ui fókuszcsapdás `Dialog`-ját használja
 * (`packages/ui/src/components/dialog.tsx`) — ez a két fájl volt a kivétel.
 * Teljes átállás helyett (ami a `kt-modal` design-osztályokat is átírná) itt
 * pótoljuk azt, amit a base-ui `modal` módja ad: csapda + visszaadás + inert.
 *
 * ## Amit csinál
 *
 * 1. Tab / Shift+Tab körbe-fut a modálon belül, nem tud kilépni belőle.
 * 2. Nyitáskor az első értelmes elemre fókuszál (ha még senki nem tette).
 * 3. Záráskor a fókusz visszakerül arra a gombra, ahonnan a modál nyílt.
 * 4. A háttér `inert` + `aria-hidden` lesz, így a felolvasó sem bóklászik el.
 *    A sonner toast-konténert (`[data-sonner-toaster]`) KIHAGYJUK: a modálból
 *    indított mentés hibaüzenete toastként jön, azt hallania kell.
 * 5. Esc zár (a hívó `onClose`-át hívja).
 * 6. Body-görgetés zárolás, az eredeti érték visszaállításával.
 */

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Csak a ténylegesen látható (elrendezésben szereplő) elemek fókuszálhatók. */
function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement
  )
}

/** A háttérből kihagyandó elemek: nem-vizuális tagek és a toast-konténer. */
function shouldSkipBackgroundElement(el: Element): boolean {
  if (el.hasAttribute('data-sonner-toaster')) return true
  return ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NEXT-ROUTE-ANNOUNCER'].includes(el.tagName)
}

export function useModalFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  // FONTOS: az `onClose` referenciáját ref-ben tartjuk, és a fő effekt CSAK az
  // `open`-től függ. A hívó (`program-scheduler.tsx:458,464`) sima
  // függvény-deklarációt ad át, ami minden renderben új identitás — ha az
  // effekt tőle függne, minden billentyűleütés után lefutna a takarítás
  // (fókusz vissza a triggerre!) és az újra-felépítés. Ez pontosan az a fajta
  // „a mező elveszti a fókuszt gépelés közben" hiba, ami telefonon
  // használhatatlanná teszi az űrlapot.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    // ── 1) Háttér kitakarása (inert + aria-hidden), az eredeti állapot megőrzésével
    const restore: Array<{ el: HTMLElement; ariaHidden: string | null; inert: boolean }> = []
    for (const child of Array.from(document.body.children)) {
      const el = child as HTMLElement
      if (shouldSkipBackgroundElement(el)) continue
      if (containerRef.current && el.contains(containerRef.current)) continue
      restore.push({ el, ariaHidden: el.getAttribute('aria-hidden'), inert: el.inert === true })
      el.setAttribute('aria-hidden', 'true')
      el.inert = true
    }

    // ── 2) Kezdő fókusz a modálon belülre (ha a tartalom nem vitte el magának)
    const root = containerRef.current
    if (root && !root.contains(document.activeElement)) {
      const focusables = visibleFocusables(root)
      if (focusables.length > 0) focusables[0].focus()
      else root.focus()
    }

    // ── 3) Tab-csapda + Esc
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusables = visibleFocusables(container)
      if (focusables.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      const inside = active !== null && container.contains(active)
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // capture fázis: a modálon belüli mezők saját kezelői elé kerülünk
    document.addEventListener('keydown', onKeyDown, true)

    // ── 4) Body-görgetés zárolás
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      for (const entry of restore) {
        if (entry.ariaHidden === null) entry.el.removeAttribute('aria-hidden')
        else entry.el.setAttribute('aria-hidden', entry.ariaHidden)
        entry.el.inert = entry.inert
      }
      // A fókusz visszakerül a triggerre — enélkül a Tab a dokumentum elejéről
      // indulna újra, és a lelkész elveszne a menüben.
      previouslyFocused?.focus?.()
    }
    // Szándékosan CSAK `open` (+ a stabil ref) — lásd a fenti megjegyzést.
  }, [open, containerRef])
}
