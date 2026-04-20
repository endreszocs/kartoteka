'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, type Variants } from 'framer-motion'
import { CheckCircle2, Circle, Church, Loader2, Mail, UserCircle2 } from 'lucide-react'

import { registerSchema, type RegisterInput } from '@/lib/validations/auth'
import { signUp } from '@/app/(auth)/register/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { OAuthButtons } from './oauth-buttons'
import { TermsDialog } from './terms-dialog'

// ─────────────────────────────────────────────────────────────────────
// Az erdélyi egyházmegyék hardcoded listája — offline-ready.
// Ugyanazok a nevek, amik a dioceses táblába be lettek seedelve
// (2026-04-20-wizard-onboarding-schema.sql). A regisztrációs form a
// `name`-et menti a profiles.congregation-be; a Master Admin a jóváhagyáskor
// rendeli el a pontos diocese_id FK-t.
// ─────────────────────────────────────────────────────────────────────
const ERDELYI_DIOCESES = [
  'Brassói Református Egyházmegye',
  'Dési Református Egyházmegye',
  'Erdővidéki Református Egyházmegye',
  'Görgényi Református Egyházmegye',
  'Hunyad-Zarándi Református Egyházmegye',
  'Kalotaszegi Református Egyházmegye',
  'Kézdi-Orbai Református Egyházmegye',
  'Kolozsvári Református Egyházmegye',
  'Küküllői Református Egyházmegye',
  'Maros-Mezőségi Református Egyházmegye',
  'Nagyenyedi Református Egyházmegye',
  'Nagysajói Református Egyházmegye',
  'Sepsi Református Egyházmegye',
  'Székelyudvarhelyi Református Egyházmegye',
  'Tordai Református Egyházmegye',
]

// Framer-motion stagger variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
}

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 18, stiffness: 160 },
  },
}

export function RegisterForm() {
  const [termsOpen, setTermsOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDiocese, setSelectedDiocese] = useState<string>('')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      termsAccepted: false as unknown as true,
      birthDate: '',
      dioceseId: '',
      serviceStartedAt: '',
    },
  })

  // Szekció-komplettség követése (checklist visual)
  const watched = watch()
  const section1Complete = !!(
    watched.fullName &&
    watched.fullName.trim().length >= 2 &&
    watched.phone &&
    watched.phone.trim().length >= 5
  )
  const section2Complete = !!(
    watched.congregation && watched.congregation.trim().length >= 2
  )
  const section3Complete = !!(
    watched.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watched.email) &&
    watched.password &&
    watched.password.length >= 6 &&
    watched.termsAccepted
  )

  async function onSubmit(data: RegisterInput) {
    setServerError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const result = await signUp(data)
      if (result.error) {
        setServerError(result.error)
      } else if (result.success) {
        setSuccess(result.success)
        reset()
        setSelectedDiocese('')
      }
    } catch {
      setServerError('Ismeretlen hiba történt.')
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
      <motion.div variants={sectionVariants} className="text-center">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Lelkészi Regisztráció
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Három rövid szakasz — kb. 2 percet vesz igénybe.
        </p>
      </motion.div>

      {serverError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700"
        >
          {serverError}
        </motion.div>
      )}
      {success && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800"
        >
          {success}
        </motion.div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* ─────────── SZEKCIÓ 1: Személyes adatok ─────────── */}
        <SectionCard
          variants={sectionVariants}
          icon={<UserCircle2 className="size-5" />}
          title="Személyes adatok"
          subtitle="Aki a fiókot használja."
          complete={section1Complete}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Teljes név (Lelkipásztor) *</Label>
              <Input
                id="fullName"
                placeholder="pl. Nt. Kovács János"
                {...register('fullName')}
              />
              {errors.fullName && (
                <p className="text-xs text-red-500">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefonszám *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+40 7..."
                  {...register('phone')}
                />
                {errors.phone && (
                  <p className="text-xs text-red-500">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="birthDate">Születési dátum</Label>
                <Input
                  id="birthDate"
                  type="date"
                  {...register('birthDate')}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ─────────── SZEKCIÓ 2: Szolgálat ─────────── */}
        <SectionCard
          variants={sectionVariants}
          icon={<Church className="size-5" />}
          title="Szolgálat"
          subtitle="Gyülekezet és egyházmegye."
          complete={section2Complete}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="congregation">Egyházközség *</Label>
              <Input
                id="congregation"
                placeholder="pl. Barátosi Református Egyházközség"
                {...register('congregation')}
              />
              {errors.congregation && (
                <p className="text-xs text-red-500">{errors.congregation.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diocese">Egyházmegye</Label>
              <select
                id="diocese"
                value={selectedDiocese}
                onChange={e => {
                  setSelectedDiocese(e.target.value)
                  // A dioceseId-t NEM töltjük ki UUID-vel a kliens oldalon —
                  // csak a nevet használjuk vizuális célra. Az admin a
                  // jóváhagyáskor rendeli el a tényleges FK-t.
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— Válaszd ki —</option>
                {ERDELYI_DIOCESES.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Az egyházmegyei hozzárendelést a rendszergazda véglegesíti a jóváhagyáskor.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="serviceStartedAt">Szolgálati kezdés (itt)</Label>
              <Input
                id="serviceStartedAt"
                type="date"
                {...register('serviceStartedAt')}
              />
            </div>
          </div>
        </SectionCard>

        {/* ─────────── SZEKCIÓ 3: Fiók ─────────── */}
        <SectionCard
          variants={sectionVariants}
          icon={<Mail className="size-5" />}
          title="Fiók"
          subtitle="A belépéshez szükséges adatok."
          complete={section3Complete}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">E-mail cím *</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="lelkivalasz@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Jelszó *</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="Minimum 6 karakter"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="terms"
                className="mt-1 shrink-0"
                {...register('termsAccepted')}
              />
              <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed">
                Elolvastam és elfogadom a{' '}
                <span
                  className="cursor-pointer font-semibold text-primary hover:underline"
                  onClick={e => {
                    e.preventDefault()
                    setTermsOpen(true)
                  }}
                >
                  Felhasználói Feltételeket és Adatvédelmi Tájékoztatót
                </span>{' '}
                <span className="text-slate-400">(GDPR · Románia 190/2018)</span>
              </label>
            </div>
            {errors.termsAccepted && (
              <p className="text-xs text-red-500">{errors.termsAccepted.message}</p>
            )}
          </div>
        </SectionCard>

        {/* Akció gomb */}
        <motion.div variants={sectionVariants}>
          <Button
            type="submit"
            size="lg"
            className="w-full font-semibold"
            disabled={loading || !(section1Complete && section2Complete && section3Complete)}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Feldolgozás…
              </>
            ) : (
              'Regisztráció elküldése'
            )}
          </Button>
        </motion.div>
      </form>

      {/* OAuth szeparátor */}
      <motion.div variants={sectionVariants} className="relative pt-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-50 px-3 text-xs uppercase tracking-wider text-slate-500">
            vagy
          </span>
        </div>
      </motion.div>

      <motion.div variants={sectionVariants}>
        <OAuthButtons mode="register" />
      </motion.div>

      {/* Login CTA */}
      <motion.div
        variants={sectionVariants}
        className="rounded-xl bg-slate-100/70 py-3 text-center text-sm text-slate-600"
      >
        Már van fiókja?{' '}
        <Link href="/login" className="ml-1 font-bold text-primary hover:underline">
          Lépjen be!
        </Link>
      </motion.div>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Szekció kártya — vizuális checklist-hatás
// Komplett szekció: zöld keret + zöld pipa (CheckCircle2)
// Inkomplett: szürke keret + körvonal (Circle)
// ─────────────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  complete: boolean
  children: React.ReactNode
  variants: Variants
}

function SectionCard({ icon, title, subtitle, complete, children, variants }: SectionCardProps) {
  return (
    <motion.div
      variants={variants}
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 ${
        complete
          ? 'border-emerald-300 shadow-emerald-100/50'
          : 'border-slate-200'
      }`}
    >
      {/* Háttér-glow komplett állapotnál */}
      {complete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/60 via-transparent to-transparent"
        />
      )}

      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-base font-semibold text-slate-900">
              {title}
            </h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          {/* Complete indikátor — spring animáció */}
          <motion.div
            key={complete ? 'done' : 'todo'}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 240 }}
          >
            {complete ? (
              <CheckCircle2 className="size-6 text-emerald-600" />
            ) : (
              <Circle className="size-6 text-slate-300" />
            )}
          </motion.div>
        </div>

        {children}
      </div>
    </motion.div>
  )
}
