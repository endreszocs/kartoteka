/**
 * Adományozók fül — típusok.
 *
 * ⚠️ KÜLÖN FÁJL, NEM az actionben: egy `'use server'` modul KIZÁRÓLAG async
 * függvényeket exportálhat (Next.js 16). Egy itt hagyott típus-export a build-et
 * buktatná — ez a repóban már megégett.
 */

import type { AdomanyozokOsszesito } from '@kartoteka/core'

export type AdomanyozokValasz =
  | { osszesito: AdomanyozokOsszesito; error?: undefined }
  | { error: string; osszesito?: undefined }
