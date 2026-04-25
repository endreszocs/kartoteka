/**
 * ModalField — re-export a `@kartoteka/ui-app/form` rétegből.
 *
 * 2026-04-25-től a komponens fizikai forrása a `packages/ui-app/src/form/ModalField.tsx`.
 * Ez a fájl **backward-compat re-export** a 22 web modal/dialog számára,
 * amelyek az `@/components/ui/modal-field` import-ra építenek. Új kódban
 * közvetlenül a `@kartoteka/ui-app`-ból importálj.
 */
export { ModalField, type ModalFieldProps } from '@kartoteka/ui-app'
