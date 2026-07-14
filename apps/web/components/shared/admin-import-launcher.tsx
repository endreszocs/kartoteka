'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Church, DatabaseZap, ShieldCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface AdminImportLauncherProps {
  moduleLabel: string
  congregationName?: string | null
  title?: string
  description?: string
  children: ReactNode
  className?: string
  triggerClassName?: string
}

/**
 * Egységes belépési pont a modulok védett importálóihoz.
 *
 * A komponens kizárólag a megjelenítési keretet kezeli. Az átadott importáló
 * állapota, validációja és szerveroldali műveletei változatlanul a gyermek
 * komponensben maradnak.
 */
export function AdminImportLauncher({
  moduleLabel,
  congregationName,
  title = `${moduleLabel} importálása`,
  description = 'Ellenőrzött adatimport a meglévő feldolgozási és naplózási szabályokkal.',
  children,
  className,
  triggerClassName,
}: AdminImportLauncherProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('shrink-0', className)}>
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(nextOpen, eventDetails) => {
          if (!nextOpen) {
            // A varázsló állapota és egy esetleg futó művelet eredménye bezáráskor is megmarad.
            eventDetails.preventUnmountOnClose()
          }
          setOpen(nextOpen)
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              className={cn(
                'min-h-11 w-full rounded-xl px-4 shadow-sm sm:w-auto',
                triggerClassName,
              )}
            />
          }
        >
          <DatabaseZap className="size-4" aria-hidden="true" />
          Rendszergazdai import
        </DialogTrigger>

        <DialogContent
          showCloseButton={false}
          initialFocus={titleRef}
          className="left-0 top-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 ring-0 motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none sm:left-1/2 sm:top-1/2 sm:h-[min(92dvh,60rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border/70 sm:ring-1 sm:ring-foreground/10 [@media(max-height:700px)]:sm:h-[calc(100dvh-1rem)]"
        >
          <DialogHeader className="relative shrink-0 gap-3 border-b border-border/70 bg-background/95 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(4rem,calc(3rem+env(safe-area-inset-right)))] text-left backdrop-blur-sm sm:px-6 sm:pb-5 sm:pt-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-11">
                <DatabaseZap className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Védett rendszergazdai művelet
                </p>
                <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg leading-tight sm:text-xl">{title}</DialogTitle>
                <DialogDescription className="max-w-3xl leading-relaxed">
                  {description}
                </DialogDescription>
              </div>
            </div>

            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] min-h-11 min-w-11 sm:right-4 sm:top-4"
                />
              }
            >
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Importáló bezárása</span>
            </DialogClose>
          </DialogHeader>

          <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 bg-muted/30 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <Church className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Célgyülekezet
                </span>
                <strong className="block truncate font-medium text-foreground">
                  {congregationName || 'Aktív gyülekezet'}
                </strong>
              </div>
            </div>
            <div className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-medium text-foreground">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
              Jogosultság ellenőrizve
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable] sm:px-6 sm:py-5">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
