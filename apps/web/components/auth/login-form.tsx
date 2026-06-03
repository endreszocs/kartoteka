'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, type Variants } from 'framer-motion'
import { ArrowRight, Cloud, Eye, EyeOff, Loader2, Lock, Mail, UserPlus } from 'lucide-react'
import Link from 'next/link'

import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { signIn } from '@/app/(auth)/login/actions'
import { OAuthButtons } from './oauth-buttons'

interface LoginFormProps {
  initialError?: string
  /** Nem-hiba értesítés (pl. "E-mail cím megerősítve") — zöld dobozban jelenik meg. */
  initialNotice?: string
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.06 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 22, stiffness: 200 },
  },
}

export function LoginForm({ initialError, initialNotice }: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(initialError || null)
  const [notice, setNotice] = useState<string | null>(initialNotice || null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: true,
    },
  })

  // Bfcache-guard: ha a böngésző a /login-t a vissza-gombbal a bfcache-ből
  // állítja vissza (tipikusan a Google OAuth-ról visszalépve), a framer-motion
  // belépő animáció NEM játszódik le újra, és a form `opacity:0`-n ragadhat
  // (üres kártya). Ilyenkor friss betöltést kérünk, hogy a felület biztosan
  // megjelenjen.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  async function onSubmit(data: LoginInput) {
    setServerError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await signIn(data)
      if (result?.error) setServerError(result.error)
    } catch (err) {
      // A redirect() egy speciális NEXT_REDIRECT "hibát" dob — ez NEM valódi
      // hiba, hanem a sikeres bejelentkezés utáni navigáció. Minden mást valódi
      // hibaként kezelünk, hogy a felhasználó ne maradjon néma képernyővel.
      const digest =
        err && typeof err === 'object' && 'digest' in err
          ? (err as { digest?: unknown }).digest
          : undefined
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        return // a navigáció megtörténik, a finally lefut
      }
      setServerError('Váratlan hiba történt a bejelentkezés során. Kérjük, próbálja újra.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants}>
      {/* Tabok: Bejelentkezés (active) / Regisztráció (link) */}
      <motion.div variants={itemVariants} className="kt-auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="kt-auth-tab is-active"
        >
          Bejelentkezés
        </button>
        <Link
          href="/hozzaferes-kerese"
          role="tab"
          aria-selected="false"
          className="kt-auth-tab"
        >
          Regisztráció
        </Link>
        <span className="kt-auth-tab-indicator" aria-hidden />
      </motion.div>

      {notice && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 200 }}
          className="kt-auth-server-notice"
        >
          {notice}
        </motion.div>
      )}

      {serverError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 200 }}
          className="kt-auth-server-error"
        >
          {serverError}
        </motion.div>
      )}

      <motion.form
        variants={itemVariants}
        onSubmit={handleSubmit(onSubmit)}
        className="kt-auth-form"
        noValidate
      >
        <div className="kt-auth-field">
          <label className="kt-auth-field-label" htmlFor="email">
            Email cím
          </label>
          <div className={`kt-auth-input-wrap ${errors.email ? 'is-error' : ''}`}>
            <span className="kt-auth-input-ico">
              <Mail className="size-[18px]" strokeWidth={1.6} />
            </span>
            <input
              id="email"
              type="email"
              placeholder="pelda@gyulekezet.hu"
              autoComplete="email"
              spellCheck={false}
              {...register('email')}
            />
          </div>
          {errors.email && <div className="kt-auth-field-msg">{errors.email.message}</div>}
        </div>

        <div className="kt-auth-field">
          <label className="kt-auth-field-label" htmlFor="password">
            Jelszó
          </label>
          <div className={`kt-auth-input-wrap ${errors.password ? 'is-error' : ''}`}>
            <span className="kt-auth-input-ico">
              <Lock className="size-[18px]" strokeWidth={1.6} />
            </span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              autoComplete="current-password"
              spellCheck={false}
              {...register('password')}
            />
            <button
              type="button"
              className="kt-auth-reveal"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" strokeWidth={1.6} />
              ) : (
                <Eye className="size-[18px]" strokeWidth={1.6} />
              )}
            </button>
          </div>
          {errors.password && <div className="kt-auth-field-msg">{errors.password.message}</div>}
        </div>

        <div className="kt-auth-row-between">
          <label className="kt-auth-check">
            <input type="checkbox" {...register('rememberMe')} />
            <span className="kt-auth-check-box" aria-hidden>
              <svg viewBox="0 0 12 12" fill="none">
                <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>Emlékezz rám</span>
          </label>
          <Link href="/forgot-password" className="kt-auth-link">
            Elfelejtett jelszó?
          </Link>
        </div>

        <button type="submit" className="kt-auth-btn-primary" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-[18px] animate-spin" />
              Belépés folyamatban…
            </>
          ) : (
            <>
              <ArrowRight className="size-[18px]" strokeWidth={2} />
              Belépés
            </>
          )}
        </button>
      </motion.form>

      <motion.div variants={itemVariants}>
        <OAuthButtons mode="login" />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Link href="/hozzaferes-kerese" className="kt-auth-btn-secondary">
          <UserPlus className="size-[18px]" strokeWidth={1.7} />
          Új fiók létrehozása
        </Link>
      </motion.div>

      <motion.div variants={itemVariants} className="kt-auth-badge-row">
        <div className="kt-auth-badge">
          <Cloud className="size-[14px]" strokeWidth={1.6} />
          Szinkronizálható offline módban
        </div>
      </motion.div>

      <motion.p variants={itemVariants} className="kt-auth-fineprint">
        A regisztráció egyházkerületi illetve egyházmegyei jóváhagyáshoz kötött.
      </motion.p>
    </motion.div>
  )
}
