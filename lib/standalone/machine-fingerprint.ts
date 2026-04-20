/**
 * Machine Fingerprint — Level 2 DEEP
 *
 * Egy gép-egyedi azonosító, amit a licensz-token tartalmaz.
 * Ha a license.dat fájlt másik gépre másolják, a fingerprint eltér,
 * és a kliens validátor REJECT-eli.
 *
 * Összetevők (SHA-256 hash):
 *   1. Windows MachineGuid  (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid)
 *   2. CPU ProcessorId      (wmic cpu get ProcessorId)
 *   3. BIOS Serial          (wmic bios get SerialNumber)
 *   4. C: Volume Serial     (wmic logicaldisk where caption="C:" get VolumeSerialNumber)
 *   5. Windows USERNAME     (process.env.USERNAME / USERPROFILE végén)
 *
 * Fallback-ek: ha egy komponens nem elérhető, a hiányzó helyén 'UNAVAILABLE'.
 * A fingerprint mindig egy ugyanolyan gépen ugyanaz lesz.
 *
 * FIGYELEM:
 *  - A `wmic` Windows 11-en deprecated, de 2025-ig elérhető
 *  - Pozitív oldal: a fingerprint akkor is stabil marad, ha a Node.js verziót
 *    frissítjük — csak hardveres változás (pl. HDD csere) változtatja meg
 */

import crypto from 'crypto'
import { execSync } from 'child_process'
import os from 'os'

import { machineIdSync } from 'node-machine-id'

// ─────────────────────────────────────────────────────────────────
// Egyes komponensek lekérdezése
// ─────────────────────────────────────────────────────────────────

function getMachineGuid(): string {
  try {
    // A node-machine-id a HKLM\MachineGuid-ot adja Windows-on,
    // Linuxon az /etc/machine-id, macOS-en a IOPlatformUUID-ot.
    // Az `true` flag biztosítja, hogy ne hash-eljen az NMI maga.
    return machineIdSync(true)
  } catch {
    return 'UNAVAILABLE_MACHINE_GUID'
  }
}

function runWmic(cmd: string, field: string): string {
  try {
    const output = execSync(cmd, {
      timeout: 5000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString('utf8')

    // wmic output: 'FieldName=value\r\n\r\n'
    const lines = output.split(/\r?\n/)
    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx < 0) continue
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (key.toLowerCase() === field.toLowerCase() && val) {
        return val
      }
    }
    return 'UNAVAILABLE_' + field.toUpperCase()
  } catch {
    return 'UNAVAILABLE_' + field.toUpperCase()
  }
}

function getCpuId(): string {
  if (os.platform() !== 'win32') return 'NON_WINDOWS'
  return runWmic('wmic cpu get ProcessorId /value', 'ProcessorId')
}

function getBiosSerial(): string {
  if (os.platform() !== 'win32') return 'NON_WINDOWS'
  return runWmic('wmic bios get SerialNumber /value', 'SerialNumber')
}

function getVolumeSerial(): string {
  if (os.platform() !== 'win32') return 'NON_WINDOWS'
  return runWmic(
    'wmic logicaldisk where Caption="C:" get VolumeSerialNumber /value',
    'VolumeSerialNumber',
  )
}

function getWindowsUsername(): string {
  return (
    process.env.USERNAME ||
    process.env.USER ||
    os.userInfo().username ||
    'UNKNOWN_USER'
  ).toLowerCase()
}

// ─────────────────────────────────────────────────────────────────
// Fő export: Level 2 DEEP fingerprint
// ─────────────────────────────────────────────────────────────────

export interface FingerprintComponents {
  machineGuid: string
  cpuId: string
  biosSerial: string
  volumeSerial: string
  username: string
}

/**
 * Kiszámítja a teljes fingerprint komponenseit.
 * Diagnosztikához / debug-hoz hasznos.
 */
export function getFingerprintComponents(): FingerprintComponents {
  return {
    machineGuid: getMachineGuid(),
    cpuId: getCpuId(),
    biosSerial: getBiosSerial(),
    volumeSerial: getVolumeSerial(),
    username: getWindowsUsername(),
  }
}

/**
 * A teljes machine fingerprint SHA-256 hash-je (hex).
 *
 * Ez kerül a JWT `fp` claim-jébe, és minden indításkor ellenőrizzük.
 */
let cachedFingerprint: string | null = null

export function getMachineFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint

  const comp = getFingerprintComponents()
  const combined = [
    comp.machineGuid,
    comp.cpuId,
    comp.biosSerial,
    comp.volumeSerial,
    comp.username,
  ]
    .map(v => v.trim())
    .join('|')

  cachedFingerprint = crypto
    .createHash('sha256')
    .update(combined, 'utf8')
    .digest('hex')

  return cachedFingerprint
}

/**
 * Csak tesztekhez — a cache resetje
 */
export function _resetFingerprintCache(): void {
  cachedFingerprint = null
}

/**
 * Debug info — a fingerprint állapotát írja le.
 * Használjuk a license-status card-on, hogy a user lássa mi van.
 */
export function describeFingerprint(): {
  fingerprint: string
  components: FingerprintComponents
  allAvailable: boolean
} {
  const components = getFingerprintComponents()
  const allAvailable = !Object.values(components).some(v =>
    v.startsWith('UNAVAILABLE_') || v === 'NON_WINDOWS' || v === 'UNKNOWN_USER',
  )
  return {
    fingerprint: getMachineFingerprint(),
    components,
    allAvailable,
  }
}
