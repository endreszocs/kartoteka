# Kartotéka v0.6.1

## 🚨 KRITIKUS hibajavítás — admin Veszélyes zóna

A v0.6.0 wipe RPC `keep_tables` listájából **kimaradt a `profiles` tábla**, ami miatt a wipe **véletlenül törölte a felhasználó saját profilját** is.

**Javítás**: `migration-docs/sql/2026-04-25-FIX-wipe-restore-profile.sql`
- Recovery DO blokk a profil újra létrehozására
- `wipe_congregation_data` RPC bővített `keep_tables`: `profiles`, `profile_roles`, `user_devices`, `user_login_attempts`

## 🏗️ Pénzügyi modul Fázis 2 — DebtTab port

A `@kartoteka/ui-app/finance/` package bővült a `DebtTab` komponenssel:
- 100% pure-UI, props-driven
- KPI-kártyák, járulék-státusz tagonként, bérleti hátralék
- Web és desktop egyaránt használhatja

## 📋 Hátralévő (v0.6.2+)

8 további finance-tab (Cashbook, Bank, Budget, Accounting, Transactions, Monetary, Rental, Oblio-Ellenőrzés) — callback-abstraction-nel.

A frissítés adat-vesztés nélkül és automatikusan települ.

---

Részletek: `docs/CHANGELOG.md`
