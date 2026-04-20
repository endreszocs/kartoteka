# Kartotéka — Next.js + Supabase Migráció

## Kontextus

A Kartotéka (Vanilla JS + Supabase) egyházi nyilvántartási rendszert **Next.js + Supabase** stack-re migráljuk. A döntés okai:

- 1000 lelkész egyidejű kiszolgálása szükséges
- A jelenlegi rendszer 35.000 sor Vanilla JS, 428 globális változóval, nehezen karbantartható
- Új funkciók fejlesztése egyre lassabb a keretrendszer hiánya miatt
- API kulcsok kliensoldali kódban (biztonsági kockázat)
- Szerver-oldali számítások szükségesek (költségvetés, statisztikák)

**Forrás rendszer:** `D:\Egyházi APP\project`
**Cél rendszer:** `D:\Egyházi APP\KARTOTEKA`

## Rendszer áttekintés (jelenlegi)

- **51 JS forrásfájl**, 35.000 sor kód
- **87 adatbázis tábla** (PostgreSQL / Supabase)
- **16 HTML oldal**, 45 modal komponens
- **11 esbuild bundle**
- **643 Supabase lekérdezés**
- **6 külső integráció** (Supabase, OpenRouter, Groq, Gemini, Cloudflare R2, SW)
- **428 window.* globális változó**

## Mappastruktúra

```
D:\KARTOTEKA\migration-docs\
├── 00-migration-plan.md          ← EZ A FÁJL
├── 01-priority-order.md          ← Modulok fontossági sorrendje
├── rules\                        ← Migrációs szabályok
├── workflows\                    ← Üzleti folyamatok
├── modules\                      ← Modulonkénti elemzés
└── todo\                         ← Fázisonkénti feladatlisták
```
