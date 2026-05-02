import { ResetPasswordForm } from '@/components/auth/reset-password-form'

// 2026-05-02 (v0.9.44) — Új oldal: a Supabase reset-password magic-linkének
// célja. A user a /forgot-password-en kéri a reset-emailt, abban kattint a
// linkre → ide érkezik (?code=...&type=recovery) → új jelszót adhat meg.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
