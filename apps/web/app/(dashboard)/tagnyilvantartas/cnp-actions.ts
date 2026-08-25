'use server'

// GDPR — a különleges személyes azonosító (személyi szám / CNP) MEGTEKINTÉSE
// naplózott esemény. A felület alapból maszkolja az értéket (CnpRejtett), és
// az első felfedéskor ide szól be. Ez az action SOHA nem dob és semmit nem ad
// vissza: a naplózás best-effort, a felfedést nem blokkolhatja (a logAuditEvent
// maga is lenyeli a hibáit).

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'

export async function logCnpFelfedes(szemelyId: number): Promise<void> {
  try {
    if (!Number.isInteger(szemelyId) || szemelyId <= 0) return

    // Kapu: bejelentkezett, gyülekezeti kontextusú hívó nélkül csendes return —
    // ilyenkor a felület amúgy sem juthatott volna CNP-hez.
    const { user, congregationId } = await getEffectiveCongregationContext()
    if (!user || !congregationId) return

    await logAuditEvent({
      action: 'member.cnp_megtekintve',
      targetTable: 'szemely',
      targetId: String(szemelyId),
    })
  } catch {
    // Csendes — a naplózási hiba nem akadályozhatja a megjelenítést.
  }
}
