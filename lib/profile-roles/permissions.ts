/**
 * Permissions katalógus + szerepkör-sablonok.
 *
 * A `ROLE_TEMPLATES` minden standard szerephez egy alapértelmezett permissions
 * objektumot definiál. A `custom` szereppel az admin/kerületi admin szabadon
 * állíthat össze permissions-t (x-eléssel).
 */

import type { ActionKey, ModuleKey, Permissions, ProfileRoleType } from './types'

// ---------------------------------------------------------------------------
// Modulok katalógusa — UI megjelenítéshez
// ---------------------------------------------------------------------------

export interface ModuleDescriptor {
  key: ModuleKey
  label: string
  /** Milyen action-öknek van értelme ennél a modulnál */
  actions: ActionKey[]
  /** Milyen scope-okra értelmezhető (gyülekezeti, egyházmegyei, kerületi, rendszer) */
  scopes: ('system' | 'district' | 'diocese' | 'congregation')[]
  emoji?: string
}

export const MODULES: ModuleDescriptor[] = [
  {
    key: 'penzugy',
    label: 'Pénzügy',
    actions: ['read', 'write', 'delete', 'finalize', 'export', 'import'],
    scopes: ['congregation', 'diocese', 'district', 'system'],
    emoji: '💰',
  },
  {
    key: 'tagnyilvantartas',
    label: 'Tagnyilvántartás',
    actions: ['read', 'write', 'delete', 'export', 'import'],
    scopes: ['congregation'],
    emoji: '👥',
  },
  {
    key: 'anyakonyv',
    label: 'Anyakönyv',
    actions: ['read', 'write', 'delete', 'export', 'import'],
    scopes: ['congregation'],
    emoji: '📖',
  },
  {
    key: 'munkanaplo',
    label: 'Munkanapló',
    actions: ['read', 'write', 'delete', 'export'],
    scopes: ['congregation'],
    emoji: '📝',
  },
  {
    key: 'iktato',
    label: 'Iktató',
    actions: ['read', 'write', 'delete', 'export'],
    scopes: ['congregation', 'diocese', 'district'],
    emoji: '📂',
  },
  {
    key: 'leltar',
    label: 'Leltár',
    actions: ['read', 'write', 'delete', 'finalize', 'export', 'import'],
    scopes: ['congregation', 'diocese', 'district'],
    emoji: '📦',
  },
  {
    key: 'sirhelyek',
    label: 'Sírhelyek',
    actions: ['read', 'write', 'delete', 'export'],
    scopes: ['congregation'],
    emoji: '🕯️',
  },
  {
    key: 'mm',
    label: 'Missziós Műhely',
    actions: ['read', 'write', 'delete'],
    scopes: ['congregation', 'diocese', 'district', 'system'],
    emoji: '🌱',
  },
  {
    key: 'publikus_oldal',
    label: 'Publikus oldal',
    actions: ['read', 'write'],
    scopes: ['congregation'],
    emoji: '🌐',
  },
  {
    key: 'jegyzokonyvek',
    label: 'Jegyzőkönyvek',
    actions: ['read', 'write', 'delete', 'finalize', 'export'],
    scopes: ['congregation', 'diocese'],
    emoji: '📜',
  },
  {
    key: 'eves_jelentes',
    label: 'Éves jelentés',
    actions: ['read', 'write', 'finalize', 'export'],
    scopes: ['congregation', 'diocese'],
    emoji: '📊',
  },
  {
    key: 'admin',
    label: 'Adminisztráció',
    actions: ['read', 'write'],
    scopes: ['system', 'district'],
    emoji: '⚙️',
  },
]

export const ACTION_LABELS: Record<ActionKey, string> = {
  read: 'Olvasás',
  write: 'Szerkesztés',
  delete: 'Törlés',
  finalize: 'Véglegesítés',
  export: 'Exportálás',
  import: 'Importálás',
}

// ---------------------------------------------------------------------------
// Szerepkör-sablonok — alapértelmezett permissions-ok
// ---------------------------------------------------------------------------

/** Minden action a modulra, amihez a modulnak van action-je */
function fullAccess(moduleKey: ModuleKey): Record<string, boolean> {
  const mod = MODULES.find((m) => m.key === moduleKey)
  if (!mod) return {}
  return Object.fromEntries(mod.actions.map((a) => [a, true]))
}

/** Csak olvasás */
function readOnly(): Record<string, boolean> {
  return { read: true }
}

/** Olvasás + szerkesztés (de nem törlés / véglegesítés) */
function readWrite(): Record<string, boolean> {
  return { read: true, write: true }
}

export const ROLE_TEMPLATES: Record<ProfileRoleType, Permissions> = {
  // --- Lelkész: MINDEN a saját gyülekezetén belül ---
  lelkesz: {
    penzugy: fullAccess('penzugy'),
    tagnyilvantartas: fullAccess('tagnyilvantartas'),
    anyakonyv: fullAccess('anyakonyv'),
    munkanaplo: fullAccess('munkanaplo'),
    iktato: fullAccess('iktato'),
    leltar: fullAccess('leltar'),
    sirhelyek: fullAccess('sirhelyek'),
    mm: fullAccess('mm'),
    publikus_oldal: fullAccess('publikus_oldal'),
    jegyzokonyvek: fullAccess('jegyzokonyvek'),
    eves_jelentes: fullAccess('eves_jelentes'),
  },

  // --- Könyvelő: csak pénzügy, teljes (lelkészi jóváhagyással) ---
  konyvelo: {
    penzugy: fullAccess('penzugy'),
  },

  // --- Esperes: egyházmegyei szint, dokumentum-bírálat + kérelmek ---
  esperes: {
    jegyzokonyvek: fullAccess('jegyzokonyvek'),
    eves_jelentes: readWrite(),
    mm: readOnly(),
    // NEM kaphat direkt pénzügyi / tagnyilvántartási hozzáférést
    // (alapelv 3: egyházmegye csak a leadott dokumentumokat látja)
  },

  // --- Egyházmegyei admin: mint az esperes + saját egyházmegye admin funkciók ---
  egyhazmegyei_admin: {
    jegyzokonyvek: fullAccess('jegyzokonyvek'),
    eves_jelentes: fullAccess('eves_jelentes'),
    mm: readWrite(),
    iktato: readWrite(),
    leltar: readWrite(),
    // penzugy: jövőbeli profilváltás-os egyházmegyei pénzügyhez
  },

  // --- Egyházmegyei számvevő: csak pénzügyi dokumentum-ellenőrzés ---
  egyhazmegyei_szamvevo: {
    penzugy: readOnly(), // a beküldött snapshot-okon
    eves_jelentes: readOnly(),
  },

  // --- Egyházkerületi admin: szerepkör-kiosztás + kerületi dashboard ---
  egyhazkeruleti_admin: {
    admin: fullAccess('admin'),
    jegyzokonyvek: fullAccess('jegyzokonyvek'),
    eves_jelentes: fullAccess('eves_jelentes'),
    mm: readWrite(),
    iktato: fullAccess('iktato'),
    leltar: fullAccess('leltar'),
  },

  // --- Rendszergazda: mindent ---
  admin: {
    admin: fullAccess('admin'),
    penzugy: fullAccess('penzugy'),
    tagnyilvantartas: fullAccess('tagnyilvantartas'),
    anyakonyv: fullAccess('anyakonyv'),
    munkanaplo: fullAccess('munkanaplo'),
    iktato: fullAccess('iktato'),
    leltar: fullAccess('leltar'),
    sirhelyek: fullAccess('sirhelyek'),
    mm: fullAccess('mm'),
    publikus_oldal: fullAccess('publikus_oldal'),
    jegyzokonyvek: fullAccess('jegyzokonyvek'),
    eves_jelentes: fullAccess('eves_jelentes'),
  },

  // --- Custom: alapértelmezetten üres, x-eléssel tölthető ---
  custom: {},
}

// ---------------------------------------------------------------------------
// Helper függvények — permission ellenőrzés
// ---------------------------------------------------------------------------

/**
 * Eldönti, hogy egy permissions objektum megengedi-e a megadott műveletet.
 */
export function hasPermission(
  perms: Permissions,
  moduleKey: ModuleKey,
  action: ActionKey,
): boolean {
  return !!perms[moduleKey]?.[action]
}

/**
 * Egyesít két permissions objektumot (OR — ha bármelyikben engedélyezett, engedélyezett).
 * Hasznos, ha egy user több profile_roles-lel rendelkezik.
 */
export function mergePermissions(a: Permissions, b: Permissions): Permissions {
  const result: Permissions = { ...a }
  for (const [moduleKey, actions] of Object.entries(b) as Array<[ModuleKey, Record<string, boolean>]>) {
    if (!result[moduleKey]) {
      result[moduleKey] = { ...actions }
    } else {
      result[moduleKey] = { ...result[moduleKey], ...actions }
    }
  }
  return result
}

/**
 * A custom permissions UI-hoz — minden modul + action párost felsorol.
 * Visszaadja, hogy jelenleg engedélyezett-e (checked).
 */
export function flattenPermissions(perms: Permissions): Array<{
  moduleKey: ModuleKey
  action: ActionKey
  checked: boolean
}> {
  const rows: Array<{ moduleKey: ModuleKey; action: ActionKey; checked: boolean }> = []
  for (const mod of MODULES) {
    for (const action of mod.actions) {
      rows.push({
        moduleKey: mod.key,
        action,
        checked: hasPermission(perms, mod.key, action),
      })
    }
  }
  return rows
}

/**
 * A custom permissions toggle eredménye — egy új permissions object.
 */
export function togglePermission(
  perms: Permissions,
  moduleKey: ModuleKey,
  action: ActionKey,
): Permissions {
  const moduleperms = { ...(perms[moduleKey] || {}) }
  if (moduleperms[action]) {
    delete moduleperms[action]
  } else {
    moduleperms[action] = true
  }
  const next = { ...perms }
  if (Object.keys(moduleperms).length === 0) {
    delete next[moduleKey]
  } else {
    next[moduleKey] = moduleperms
  }
  return next
}
