'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Clock, HelpCircle, LogOut, Mail, ShieldAlert, Sparkles } from 'lucide-react'

import { signOutFromPending } from '@/app/(auth)/pending/actions'
import { SupportDialog } from '@/components/layout/support-dialog'
import { Button } from '@/components/ui/button'

interface PendingApprovalClientProps {
  firstName: string
  fullName: string | null
  email: string
  waitReason: 'approval' | 'no-role'
}

export function PendingApprovalClient({
  firstName,
  fullName,
  email,
  waitReason,
}: PendingApprovalClientProps) {
  const [isPending, startTransition] = useTransition()
  const [supportOpen, setSupportOpen] = useState(false)
  const isRoleMissing = waitReason === 'no-role'

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
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl" />

      <div className="relative space-y-6 text-center">
        <div className="flex justify-center">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 shadow-inner"
          >
            <motion.div
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-2xl bg-amber-300/40"
            />
            <Clock className="relative size-10 text-amber-700" />
          </motion.div>
        </div>

        <div className="space-y-2">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700"
          >
            {isRoleMissing ? 'Várakozás szerepkörre' : 'Várakozás jóváhagyásra'}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-heading text-3xl font-bold text-slate-900 md:text-4xl"
          >
            Még egy kis türelmet,{' '}
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
            {isRoleMissing
              ? 'A belépése aktív, de a fiókjához jelenleg nincs érvényes szerepkör rendelve. Addig a rendszer biztonsági okból nem enged hozzáférést a modulokhoz, amíg az admin helyre nem állítja a jogosultságot.'
              : 'A regisztrációja megérkezett. Jelenleg a kerületi SzuperAdmin ellenőrzi az adatait, és hamarosan jóvá fogja hagyni a fiókját.'}
          </motion.p>
        </div>

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
                <p className="font-semibold text-slate-900">
                  {isRoleMissing ? 'Kapcsolattartási e-mail' : 'Értesítés e-mailben'}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {isRoleMissing
                    ? 'Ha az admin válaszol vagy pontosítás kell, ezen a címen érjük el:'
                    : 'Amint aktív, értesítést kap erre a címre:'}
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

            {isRoleMissing && (
              <div className="flex items-start gap-3 border-t border-slate-200 pt-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-slate-900">Jelenlegi állapot</p>
                  <p className="mt-0.5 text-slate-700">
                    A fiók bejelentkezhet, de szerepkör nélkül nem használhatja a Kartotéka moduljait.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          <p className="text-xs text-slate-500">
            {isRoleMissing
              ? 'Ha szeretné, a beépített segítségkérővel közvetlenül üzenetet küldhet az adminnak. Sürgős esetben e-mailben is írhat ide: '
              : 'Ha sürgős a beléptetés, a beépített segítségkérővel is üzenhet az adminnak, vagy írhat ide: '}
            <a
              href="mailto:support@kartoteka.erek.ro"
              className="font-semibold text-primary hover:underline"
            >
              support@kartoteka.erek.ro
            </a>
          </p>

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button size="sm" onClick={() => setSupportOpen(true)} className="gap-2">
              <HelpCircle className="size-4" />
              Segítséget kérek
            </Button>
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

          <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
        </motion.div>
      </div>
    </motion.div>
  )
}
