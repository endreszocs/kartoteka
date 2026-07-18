'use client'

import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import styles from './member-portal-auth.module.css'
import { MemberPortalFieldError } from './member-portal-field-error'

interface MemberPortalPasswordFieldProps {
  id: string
  name: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  error?: string
  errorId: string
  hint?: string
  hintId?: string
  defaultValue?: string
}

function joinIds(...ids: Array<string | false | null | undefined>) {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

export function MemberPortalPasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
  errorId,
  hint,
  hintId,
  defaultValue,
}: MemberPortalPasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className={styles.fieldGroup}>
      <Label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </Label>
      <div className={styles.inputWithAction}>
        <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
        <Input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          minLength={8}
          required
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={joinIds(hint && hintId, error && errorId)}
          className={cn(
            styles.input,
            styles.inputWithLeadingIcon,
            styles.passwordInput
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={styles.passwordToggle}
          aria-label={showPassword ? `${label} elrejtése` : `${label} megjelenítése`}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((current) => !current)}
        >
          {showPassword ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className={styles.fieldHint}>
          {hint}
        </p>
      ) : null}
      <MemberPortalFieldError id={errorId} message={error} />
    </div>
  )
}
