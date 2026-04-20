'use client'

import { useTransition } from 'react'
import { motion } from 'framer-motion'
import { Clock, LogOut, Mail, Sparkles } from 'lucide-react'

import { signOutFromPending } from '@/app/(auth)/pending/actions'
import { Button } from '@/components/ui/button'

interface PendingApprovalClientProps {
  firstName: string
  fullName: string | null
  email: string
}

/**
 * Pending jóváhagyás várakozó képernyő.
 *
 * A lelkész itt áll, amíg a kerületi SzuperAdmin nem hagyja jóvá.
 * Személyes megszólítással, barátságos animált UI-val — a várakozás
 * ne legyen kietlen.
 */
export function PendingApprovalClient({
  firstName,
  fullName,
  email,
}: PendingApprovalClientProps) {
  const [isPending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      await signOutFromPending()
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 160 }}
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl md:p-10"
    >
      {/* Dekoratív háttér-glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl" />

      <div className="relative space-y-6 text-center">
        {/* Pulzáló óra ikon */}
        <div className="flex justify-center">
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="relative flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 shadow-inner"
          >
            {/* Pulse ring */}
            <motion.div
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-2xl bg-amber-300/40"
            />
            <Clock className="relative size-10 text-amber-700" />
          </motion.div>
        </div>

        {/* Üdvözlés */}
        <div className="space-y-2">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700"
          >
            Várakozás jóváhagyásra
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-heading text-3xl font-bold text-slate-900 md:text-4xl"
          >
            Üdvözlöm,{' '}
            <span className="bg-gradient-to-r from-amber-600 to-teal-700 bg-clip-text text-transparent">
              {firstName}!
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mx-auto max-w-md text-base leading-relaxed text-slate-600"
          >
            A regisztrációja megérkezett. Jelenleg a kerületi SzuperAdmin
            ellenőrzi az adatait, és hamarosan jóvá fogja hagyni a fiókját.
          </motion.p>
        </div>

        {/* Infókártya — email visszajelzés + status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-slate-500" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-slate-900">Értesítés e-mailben</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Amint aktív, értesítést kap erre a címre:
                </p>
                <p className="mt-1 font-mono text-xs text-slate-700">{email}</p>
              </div>
            </div>

            {fullName && (
              <div className="flex items-start gap-3 border-t border-slate-200 pt-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-slate-500" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-slate-900">Regisztrált név</p>
                  <p className="mt-0.5 text-slate-700">{fullName}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Segítség + kijelentkezés */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          <p className="text-xs text-slate-500">
            Ha sürgős a beléptetés, kérem vegye fel a kapcsolatot a kerületi
            irodával: {' '}
            <a
              href="mailto:support@kartoteka.erek.ro"
              className="font-semibold text-primary hover:underline"
            >
              support@kartoteka.erek.ro
            </a>
          </p>

          <div className="flex items-center justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isPending}
              className="gap-2"
            >
              <LogOut className="size-4" />
              {isPending ? 'Kijelentkezés…' : 'Kijelentkezés'}
            </Button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
