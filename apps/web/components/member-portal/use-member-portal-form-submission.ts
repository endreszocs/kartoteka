'use client'

import { useTransition, type FormEvent } from 'react'

import type { MemberPortalSubmitHandler } from './types'

export function useMemberPortalFormSubmission(
  onSubmit?: MemberPortalSubmitHandler
) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onSubmit) return

    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      await onSubmit(formData)
    })
  }

  return { handleSubmit, isPending }
}
