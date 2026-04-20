import { LoginForm } from '@/components/auth/login-form'

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorFromUrl = params.error === 'pending'
    ? 'Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!'
    : params.error === 'auth'
      ? 'Hiba történt a bejelentkezés során. Kérem, próbálja újra.'
      : undefined

  return <LoginForm initialError={errorFromUrl} />
}
