import 'server-only'

/**
 * Resend (legacy) email provider. Megmarad backward-compat miatt,
 * de az új Brevo-t preferáljuk (EU, ingyenes).
 *
 * Env változók:
 *   - RESEND_API_KEY
 *   - RESEND_FROM (pl. "Kartotéka <noreply@kartoteka.ro>")
 */

import type { EmailProvider, EmailSendArgs, EmailSendResult } from '../types'

export const resendProvider: EmailProvider = {
  name: 'resend',

  async send(args: EmailSendArgs): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return {
        success: false,
        provider: 'resend',
        error: 'RESEND_API_KEY env változó nincs beállítva.',
      }
    }

    // Feladó: args.from, vagy RESEND_FROM env var
    let fromString: string | undefined
    if (args.from) {
      fromString = args.from.name
        ? `${args.from.name} <${args.from.email}>`
        : args.from.email
    } else {
      fromString = process.env.RESEND_FROM
    }
    if (!fromString) {
      return {
        success: false,
        provider: 'resend',
        error: 'RESEND_FROM env változó nincs beállítva.',
      }
    }

    const toList = Array.isArray(args.to) ? args.to : [args.to]
    if (toList.length === 0) {
      return { success: true, provider: 'resend' }
    }

    try {
      const resendModule = await import('resend')
      const ResendCtor = (resendModule as { Resend: new (key: string) => ResendClient }).Resend
      const resend = new ResendCtor(apiKey)

      // Resend bulk-ban legfeljebb 50 címzettet fogad — chunkoljuk
      const chunks = chunkArray(
        toList.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
        50,
      )
      let lastId: string | undefined
      for (const chunk of chunks) {
        const result = await resend.emails.send({
          from: fromString,
          to: chunk,
          subject: args.subject,
          text: args.text,
          html: args.html,
          replyTo: args.replyTo?.email,
        })
        if (typeof result === 'object' && result && 'data' in result) {
          const data = (result as { data?: { id?: string } }).data
          if (data?.id) lastId = data.id
        }
      }

      return { success: true, provider: 'resend', messageId: lastId }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ismeretlen'
      return {
        success: false,
        provider: 'resend',
        error: `Resend hívási hiba: ${msg}`,
      }
    }
  },
}

interface ResendClient {
  emails: {
    send: (args: {
      from: string
      to: string[] | string
      subject: string
      text: string
      html: string
      replyTo?: string
    }) => Promise<unknown>
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}
