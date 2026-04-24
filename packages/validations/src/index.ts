/**
 * @kartoteka/validations — közös zod validációs sémák.
 *
 * M6.1 skeleton (2026-04-21). A domain-sémák az M7+ modul-hullámokban érkeznek:
 *   - finance/       (chitanta, bank-import, tva, oblio, budget, jarulek)
 *   - members/       (szemely, csalad, presbyter, voter)
 *   - anyakonyv/     (kereszteles, hazassag, temetes)
 *   - minutes/, inventory/, filing/, annual-report/, programs/, sirhelyek/, muhely/
 *
 * Minden domain séma két dolgot exportál:
 *   export const xxxSchema = z.object({ ... })
 *   export type XxxInput = z.infer<typeof xxxSchema>
 *
 * A @kartoteka/core use-case-ek ezeket használják input-paraméterként.
 * A web Server Action wrapper-ek ezeket futtatják le a FormData parser után.
 * A desktop kliens-oldali form-ok is ezeket validálják (react-hook-form + zod resolver).
 *
 * Jelenlegi domain-sémák:
 *   - finance/chitanta-tomb  → ChitantaTombRow, createChitantaTombInputSchema    [A-M7.1a/b]
 *   - finance/chitanta-issue → chitantaIssueInputSchema, ChitantaIssueResult     [A-M7.2b]
 *   - finance/chitanta-row   → ChitantaListRow, listChitantasInputSchema,        [A-M7.2e]
 *                              stornoChitantaInputSchema
 */

export * from './finance/chitanta-tomb'
export * from './finance/chitanta-issue'
export * from './finance/chitanta-row'
export * from './finance/chitanta-print'
export * from './finance/befizetes-list'
export * from './finance/befizetes-save'
export * from './finance/befizetes-delete'
export * from './finance/befizetescel-list'
export * from './finance/kiadas-list'
export * from './finance/kiadas-save'
export * from './finance/kiadas-delete'
export * from './finance/belsomozgas'
export * from './finance/bank-import'
export * from './members/szemely-list'
export * from './members/szemely-save'
export * from './members/szemely-create'
export * from './members/csalad-list'
export * from './members/csalad-save'
