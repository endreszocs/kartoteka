"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { XIcon } from "lucide-react"

/**
 * 2026-08-11 (K5 #25): ADATVESZTÉS-VÉDELEM — a háttérre koppintás többé NEM zár be.
 *
 * Mi volt a hiba: a `@base-ui/react` (1.3.0) `Dialog.Root` `disablePointerDismissal`
 * propja alapértelmezetten `false`, azaz a dialóguson KÍVÜLI kattintás/koppintás
 * azonnal bezárta az ablakot. Ez a wrapper ezt sosem állította át, és a repóban
 * egyetlen hívó sem adta meg — így a teljes tagfelvételi űrlap, az igazolás-kiállító,
 * a leltári tétel-űrlap és az igehirdetési terv is ELVESZETT egy félrekoppintástól,
 * mindenféle figyelmeztetés nélkül.
 *
 * Mostantól a bezárás az X gombon, az Esc billentyűn és a saját Mégse/Bezárás
 * gombokon át történik. Az Esc-et a base-ui külön nem szabályozza — továbbra is zár.
 * A `modal` (fókusz-csapda + oldal-görgetés zárolása) érintetlen.
 *
 * OPT-OUT: ahol a háttérkattintásos bezárás tényleg kívánatos (pl. egy tartalom
 * nélküli előnézet), a hívó explicit `disablePointerDismissal={false}`-t adhat.
 */
function Dialog({
  disablePointerDismissal = true,
  ...props
}: DialogPrimitive.Root.Props) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      disablePointerDismissal={disablePointerDismissal}
      {...props}
    />
  )
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // 2026-08-11 (K5 #27): MOBIL-ELÉRHETŐSÉG — alapból van max-magasság + görgetés.
        // Mi volt a hiba: az alap popup csak `top-1/2 -translate-y-1/2`-t kapott, sem
        // `max-h`-t, sem görgetést. Mivel a `modal` alapból true (az oldal görgetése
        // zárolva van), egy magasabb dialógus (pl. családlátogatás-rögzítő) kis
        // telefonon fölül-alul kilógott a képernyőből, és a Mentés gomb FIZIKAILAG
        // elérhetetlen volt. A `calc(100dvh-2rem)` a dinamikus viewport-magasságot
        // használja (a mobil böngésző címsora is bele van számolva), 1-1 rem
        // levegővel. Rövid dialógusnál nem jelenik meg görgetősáv (auto).
        // Felülírható: a hívó saját `max-h-*` / `overflow-*` osztálya a
        // tailwind-merge miatt győz (az `overflow` csoport kiüti az `overflow-y`-t).
        className={cn(
          // 2026-08-25: `grid-cols-[minmax(0,1fr)]` — enélkül az implicit auto
          // rács-oszlop a tartalom min-content-jéhez nő: egy hosszú, `truncate`
          // (nowrap) címsor a TELJES egysoros szélességét kényszeríti ki, a
          // dialógus tartalma pedig vízszintesen túlcsordul és levágódik
          // (Endre: „a Szervezeti forma ablakban levágja"). A minmax(0,1fr)
          // oszlopban a truncate/min-w-0 lánc rendeltetés szerint működik.
          "fixed top-1/2 left-1/2 z-50 grid grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
