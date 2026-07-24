import 'server-only'

import { randomUUID } from 'node:crypto'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

const BUCKET = 'access-request-docs'
const MAX_BYTES = 10 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FILE_TYPES = {
  'application/pdf': {
    extension: 'pdf',
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  'image/jpeg': {
    extension: 'jpg',
    signature: [0xff, 0xd8, 0xff],
  },
  'image/png': {
    extension: 'png',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
} as const

type AllowedMimeType = keyof typeof FILE_TYPES

export class AccessRequestDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessRequestDocumentError'
  }
}

function hasSignature(header: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => header[index] === byte)
}

function safeStem(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]*$/, '')
  return (
    withoutExtension
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'igazolas'
  )
}

/**
 * Validates and uploads one optional access-request document. The storage path
 * is generated exclusively on the server and bound to the trusted Auth user.
 */
export async function storeAccessRequestDocument(
  ownerId: string,
  formData?: FormData,
): Promise<string | null> {
  const value = formData?.get('document')
  if (value === null || value === undefined || value === '') return null

  if (!UUID_RE.test(ownerId)) {
    throw new AccessRequestDocumentError('Ervenytelen dokumentumtulajdonos.')
  }
  if (typeof File === 'undefined' || !(value instanceof File)) {
    throw new AccessRequestDocumentError('Ervenytelen dokumentumfeltoltes.')
  }
  if (value.size < 1 || value.size > MAX_BYTES) {
    throw new AccessRequestDocumentError('A dokumentum merete nem megengedett.')
  }

  const type = value.type as AllowedMimeType
  const rule = FILE_TYPES[type]
  if (!rule) {
    throw new AccessRequestDocumentError('A dokumentum fajltipusa nem megengedett.')
  }

  const bytes = new Uint8Array(await value.arrayBuffer())
  if (!hasSignature(bytes.subarray(0, 8), rule.signature)) {
    throw new AccessRequestDocumentError('A dokumentum tartalma nem egyezik a fajltipussal.')
  }

  const path = `requests/${ownerId}/${randomUUID()}-${safeStem(value.name)}.${rule.extension}`
  const adminClient = getSupabaseAdminClient()
  const { error } = await adminClient.storage.from(BUCKET).upload(path, bytes, {
    cacheControl: '0',
    contentType: type,
    upsert: false,
  })

  if (error) {
    throw new AccessRequestDocumentError('A dokumentum tarolasa sikertelen.')
  }

  return path
}

export async function removeAccessRequestDocument(path: string | null): Promise<void> {
  if (!path || !/^requests\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]+\.(?:pdf|jpg|png)$/.test(path)) {
    return
  }

  const adminClient = getSupabaseAdminClient()
  const { error } = await adminClient.storage.from(BUCKET).remove([path])
  if (error) {
    console.error('[access-request-doc] A kompenzacios torles sikertelen:', error.message)
  }
}
