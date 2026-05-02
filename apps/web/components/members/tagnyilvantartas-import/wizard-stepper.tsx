/**
 * Re-export pajzs — a tényleges WizardStepper komponens kódja a közös
 * `apps/web/components/import-shared/wizard-stepper.tsx` fájlban él.
 *
 * Ez a fájl 2026-05-02-én vált re-exporttá, hogy a pénzügyi import-wizard
 * is használhassa ugyanazt a komponenst. A tagnyilvántartás-import-wizard
 * importjai változatlanok maradnak.
 */

export { WizardStepper, type WizardStep } from '@/components/import-shared/wizard-stepper'
