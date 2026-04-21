'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, type Variants } from 'framer-motion'
import { Loader2 } from 'lucide-react'

import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { signIn } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { OAuthButtons } from './oauth-buttons'

interface LoginFormProps {
  initialError?: string
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.08 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 20, stiffness: 180 },
  },
}

export function LoginForm({ initialError }: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(initialError || null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setServerError(null)
    setLoading(true)

    try {
      const result = await signIn(data)
      // Ha ide ér, hiba történt (siker esetén redirect fut)
      if (result?.error) {
        setServerError(result.error)
      }
    } catch {
      // redirect() throwol — ez nem hiba
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-5"
    >
      <motion.div variants={itemVariants} className="text-center">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Lépjen be a fiókjába
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Jelentkezzen be a regisztrált e-mail címével és jelszavával.
        </p>
      </motion.div>

      {serverError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 200 }}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700"
        >
          {serverError}
        </motion.div>
      )}

      <motion.form
        variants={itemVariants}
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail cím</Label>
          <Input
            id="email"
            type="email"
            placeholder="lelkivalasz@email.com"
            autoComplete="email"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Jelszó</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-slate-500 transition-colors hover:text-primary"
            >
              Elfelejtette a jelszavát?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Ellenőrzés…
            </>
          ) : (
            'Belépés'
          )}
        </Button>
      </motion.form>

      {/* OAuth szeparátor */}
      <motion.div variants={itemVariants} className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-50 px-3 text-xs uppercase tracking-wider text-slate-500">
            vagy
          </span>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <OAuthButtons mode="login" />
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="rounded-xl bg-slate-100/70 py-3 text-center text-sm text-slate-600"
      >
        Még nincs fiókja?{' '}
        <Link href="/hozzaferes-kerese" className="ml-1 font-bold text-primary hover:underline">
          Kérjen hozzáférést!
        </Link>
      </motion.div>
    </motion.div>
  )
}
