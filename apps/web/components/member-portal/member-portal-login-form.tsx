'use client'

import { useId } from 'react'
import { ArrowRight, LoaderCircle, Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import styles from './member-portal-auth.module.css'
import { MemberPortalFieldError } from './member-portal-field-error'
import { MemberPortalFormErrorSlot } from './member-portal-form-error-slot'
import { MemberPortalPasswordField } from './member-portal-password-field'
import type { MemberPortalLoginOptions } from './types'
import { useMemberPortalFormSubmission } from './use-member-portal-form-submission'

interface MemberPortalLoginFormProps extends MemberPortalLoginOptions {
  onRegister: () => void
}

export function MemberPortalLoginForm({
  defaultValues,
  errors,
  isPending: isExternallyPending = false,
  onSubmit,
  onForgotPassword,
  onRegister,
  showRememberMe = true,
}: MemberPortalLoginFormProps) {
  const formId = useId()
  const { handleSubmit, isPending } = useMemberPortalFormSubmission(onSubmit)
  const pending = isExternallyPending || isPending
  const emailId = `${formId}-login-email`
  const emailErrorId = `${emailId}-error`
  const passwordId = `${formId}-login-password`
  const passwordErrorId = `${passwordId}-error`
  const rememberId = `${formId}-login-remember`

  return (
    <div className={styles.panelBody}>
      <div className={styles.panelHeading}>
        <p className={styles.panelEyebrow}>Személyes tagi fiók</p>
        <h1 id="member-portal-login-heading">Örülünk, hogy újra itt van</h1>
        <p>Lépjen be a gyülekezet által jóváhagyott e-mail-címével.</p>
      </div>

      <MemberPortalFormErrorSlot message={errors?.form} />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.fieldGroup}>
          <Label htmlFor={emailId} className={styles.fieldLabel}>
            E-mail-cím
          </Label>
          <div className={styles.inputWithAction}>
            <Mail className={styles.inputIcon} aria-hidden="true" />
            <Input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              defaultValue={defaultValues?.email}
              placeholder="nev@pelda.hu"
              required
              spellCheck={false}
              aria-invalid={Boolean(errors?.email)}
              aria-describedby={errors?.email ? emailErrorId : undefined}
              className={cn(styles.input, styles.inputWithLeadingIcon)}
            />
          </div>
          <MemberPortalFieldError id={emailErrorId} message={errors?.email} />
        </div>

        <MemberPortalPasswordField
          id={passwordId}
          name="password"
          label="Jelszó"
          autoComplete="current-password"
          error={errors?.password}
          errorId={passwordErrorId}
        />

        {showRememberMe || onForgotPassword ? (
          <div className={styles.formUtilities}>
            {showRememberMe ? (
              <label htmlFor={rememberId} className={styles.checkboxLabel}>
                <input
                  id={rememberId}
                  type="checkbox"
                  name="rememberMe"
                  value="true"
                  defaultChecked={defaultValues?.rememberMe ?? false}
                />
                <span>Emlékezzen rám ezen az eszközön</span>
              </label>
            ) : null}
            {onForgotPassword ? (
              <button
                type="button"
                className={styles.textButton}
                onClick={onForgotPassword}
              >
                Elfelejtett jelszó
              </button>
            ) : null}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className={styles.primaryAction}
          disabled={pending}
        >
          {pending ? (
            <>
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
              Belépés folyamatban…
            </>
          ) : (
            <>
              Belépés
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <div className={styles.switchPrompt}>
        <span>Még nincs tagi fiókja?</span>
        <button type="button" className={styles.textButton} onClick={onRegister}>
          Regisztráció indítása
        </button>
      </div>
    </div>
  )
}
