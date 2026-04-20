'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { getUserSupportTicketsCompat, sendSupportTicketCompat } from '@/lib/support/messages'
import {
  ALLOWED_IMAGE_TYPES,
  PUBLIC_SITE_MEDIA_BUCKET,
  sanitizeFilename,
} from '@/lib/public-site/storage'

// Support screenshot képek max mérete — tágabb mint a hero/crest limit,
// mert a user-ek gyakran teljes képernyő képeket küldenek.
const MAX_SUPPORT_SCREENSHOT_SIZE = 5 * 1024 * 1024 // 5 MB

export async function getUserTickets() {
  const { supabase, user } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  try {
    const { data } = await getUserSupportTicketsCompat(supabase, user.id)
    return { data }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A support jegyek lekérése sikertelen.' }
  }
}

export async function sendSupportTicket(subject: string, content: string, options?: {
  type?: string
  priority?: string
  screenshotUrl?: string | null
}) {
  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  if (!subject.trim() || !content.trim()) return { error: 'A tárgy és az üzenet kötelező.' }

  // A tartalom elé írjuk a típust és prioritást, ha megadva
  const typeLabel = options?.type ? `[${options.type}]` : ''
  const priorityLabel = options?.priority ? `[${options.priority}]` : ''
  const screenshotNote = options?.screenshotUrl ? `\n\nKépernyőkép: ${options.screenshotUrl}` : ''
  const enrichedContent = `${typeLabel}${priorityLabel} ${content.trim()}${screenshotNote}`

  try {
    await sendSupportTicketCompat(supabase, user, subject.trim(), enrichedContent, {
      congregationId,
      senderName: fullName || user.email || null,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A support jegy mentése sikertelen.' }
  }

  revalidatePath('/support')
  return { success: true }
}

export async function uploadSupportScreenshot(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const { supabase, user } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Nincs fájl.' }

  // MIME validáció — csak képek engedélyezettek (szűr: .js, .exe, .html, .sh, stb.
  // megpróbálkozó feltöltéseket, hogy a publikus bucketbe NE kerüljön
  // végrehajtható vagy phishing tartalom).
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: 'Csak JPG, PNG vagy WebP képek engedélyezettek.' }
  }
  if (file.size > MAX_SUPPORT_SCREENSHOT_SIZE) {
    return { error: `A fájl túl nagy (max ${MAX_SUPPORT_SCREENSHOT_SIZE / 1024 / 1024} MB).` }
  }

  // sanitizeFilename() biztosítja, hogy a fájlnév csak [a-z0-9-] karaktereket
  // tartalmazzon és időbélyeggel legyen elnevezve. Ez megakadályozza a
  // path traversal-t, valamint a felülírási ütközéseket.
  const safeName = sanitizeFilename(file.name)
  const path = `support/${user.id}/${safeName}`

  // Defense in depth: ellenőrzés, hogy a végső path a `support/{user.id}/`
  // prefixszel kezdődik és nem tartalmaz path traversal karaktereket.
  if (!path.startsWith(`support/${user.id}/`) || path.includes('..')) {
    return { error: 'Érvénytelen útvonal.' }
  }

  const { error } = await supabase.storage
    .from(PUBLIC_SITE_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) return { error: `Feltöltési hiba: ${error.message}` }

  const { data: urlData } = supabase.storage.from(PUBLIC_SITE_MEDIA_BUCKET).getPublicUrl(path)
  return { url: urlData.publicUrl }
}
