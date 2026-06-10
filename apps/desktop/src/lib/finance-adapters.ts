/**
 * Desktop finance adat-adapterek (2026-06-10, desktop↔web paritás — A-hullám).
 *
 * Leképezi a lokális SQLite sorokat (`LocalBefizetesRow` / `LocalKiadasRow`) a
 * megosztott `@kartoteka/ui-app` típusokra (`BefitetesRow` / `KiadasRow`), hogy
 * a desktop UGYANAZOKAT a finance-komponenseket renderelhesse, mint a web —
 * azonos komponens = azonos megjelenés.
 *
 * Megjegyzés: a lokális cache a `belso_mozgas_xkey` mezőt nem szinkronizálja
 * (a read-only nézethez nem szükséges), így itt `null`. A boolean mezőket
 * (deleted/stornozott) a SQLite 0/1 integerből alakítjuk.
 */

import type { BefitetesRow, KiadasRow } from '@kartoteka/ui-app'

import type { LocalBefizetesRow, LocalKiadasRow } from './finance-sync'

export function toBefitetesRow(r: LocalBefizetesRow): BefitetesRow {
  return {
    id: r.id,
    osszeg: r.osszeg,
    datum: r.datum,
    id_befizetescel: r.id_befizetescel ?? null,
    id_szemely: r.id_szemely ?? null,
    id_csalad: r.id_csalad ?? null,
    forrasa: r.forrasa ?? null,
    nyugta: r.nyugta ?? null,
    iratszam: r.iratszam ?? null,
    irattipus: r.irattipus ?? null,
    fizetettev: r.fizetettev ?? null,
    megjegyzes: r.megjegyzes ?? null,
    belso_mozgas_xkey: null,
    deleted: r.deleted === 1,
    stornozott: r.stornozott === 1,
    stornozott_indok: r.stornozott_indok ?? null,
    stornozott_at: r.stornozott_at ?? null,
  }
}

export function toKiadasRow(r: LocalKiadasRow): KiadasRow {
  return {
    id: r.id,
    osszeg: r.osszeg,
    datum: r.datum,
    id_kiadascel: r.id_kiadascel ?? null,
    kedvezmenyzett: null,
    atvevo: r.atvevo ?? null,
    id_szemely: null,
    atvevoid: r.atvevoid ?? null,
    nyugta: r.nyugta ?? null,
    iratszam: r.iratszam ?? null,
    bizonylatszam: null,
    irattipus: r.irattipus ?? null,
    megjegyzes: r.megjegyzes ?? null,
    belso_mozgas_xkey: null,
    deleted: r.deleted === 1,
    stornozott: r.stornozott === 1,
    stornozott_indok: r.stornozott_indok ?? null,
    stornozott_at: r.stornozott_at ?? null,
  }
}
