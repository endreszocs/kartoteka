/**
 * Közös email-küldési típusok. NEM 'use server' fájl — szabadon importálható
 * kliensből és szerverből egyaránt (a types csak build-time-ban léteznek).
 */

export interface EmailRecipient {
  email: string
  name?: string
}

export interface EmailSendArgs {
  /** Címzett(ek). Egy vagy több. */
  to: EmailRecipient | EmailRecipient[]
  /** Tárgy */
  subject: string
  /** Text-változat (plain) */
  text: string
  /** HTML-változat */
  html: string
  /** Ha nincs megadva, az env default FROM-ot használja */
  from?: EmailRecipient
  /** Opcionális reply-to */
  replyTo?: EmailRecipient
  /** Tag-elhetjük a provider-specifikus analytics-hoz */
  tags?: string[]
}

export interface EmailSendResult {
  success: boolean
  /** Provider-specifikus message ID (ha van) */
  messageId?: string
  /** Provider neve, amit használtunk */
  provider: 'brevo' | 'resend' | 'disabled'
  /** Hibaüzenet, ha success=false */
  error?: string
}

export interface EmailProvider {
  readonly name: 'brevo' | 'resend'
  send(args: EmailSendArgs): Promise<EmailSendResult>
}
