import { LoginForm } from '@/components/auth/login-form'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reason?: string; confirmed?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorFromUrl = params.error === 'pending'
    ? 'Fiókja még jóváhagyásra vár — a rendszergazda értesítve van. Türelmét kérjük.'
    // Google-belépés ismeretlen e-mail-lel: a fiók nincs regisztrálva (Endre, 2026-07-01).
    : params.error === 'not_registered'
      ? 'Ez az e-mail cím nincs regisztrálva a rendszerben. Google-fiókkal csak már regisztrált felhasználó léphet be — kérjük, először igényeljen hozzáférést a Regisztráció oldalon.'
      : params.error === 'auth'
        ? 'Hiba történt a bejelentkezés során. Kérem, próbálja újra.'
        : params.reason === 'session-expired'
          ? 'A bejelentkezésed lejárt — biztonsági okokból egy nap után újra be kell jelentkezned. Ha szeretnéd, hogy ne kelljen, pipáld be a "Maradjak bejelentkezve" mezőt.'
          : undefined

  // Az access-request flow e-mail-megerősítő linkje ide irányít (?confirmed=1).
  // A fiók ettől még jóváhagyásra vár — ezt jelezzük is.
  const noticeFromUrl = params.confirmed === '1'
    ? 'E-mail címét sikeresen megerősítette. A fiókja a rendszergazda jóváhagyására vár — a jóváhagyásról értesítést kap.'
    : undefined

  return <LoginForm initialError={errorFromUrl} initialNotice={noticeFromUrl} />
}
