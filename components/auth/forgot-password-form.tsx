'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'
import { resetPassword } from '@/app/(auth)/forgot-password/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const result = await resetPassword(data)
      if (result.error) {
        setServerError(result.error)
      } else if (result.success) {
        setSuccess(result.success)
        reset()
      }
    } catch {
      setServerError('Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <CardTitle className="text-2xl font-bold">Jelszó visszaállítása</CardTitle>
        <CardDescription>
          Adja meg e-mail címét, és küldünk egy linket a jelszó cseréjéhez.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
            {serverError}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm text-center">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Regisztrált E-mail cím</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="lelkivalasz@email.com"
              {...register('email')}
            />
            {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
          </div>

          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading ? 'Küldés...' : 'Visszaállító link küldése'}
          </Button>
        </form>

        <Link href="/login">
          <Button variant="ghost" className="w-full">
            Vissza a belépéshez
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
