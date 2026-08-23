# KARTOTEKA

KARTOTEKA egy pásztori nyilvántartó rendszer református lelkipásztorok számára Erdélyben.
A cél nem csak az adminisztráció digitalizálása, hanem egy olyan felület építése, amelyet jó érzés használni: meleg, emberközpontú, nyugodt és bizalmat keltő.

## Fő fókusz

- tagnyilvántartás és családkezelés
- anyakönyvi események kezelése
- pénzügyi adminisztráció és gyülekezeti elszámolás
- munkanapló, iktatás, leltár és sírhelykezelés
- support és Missziós Műhely
- jogosultságkezelt admin és gyülekezeti működés

## Technológiai alap

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- shadcn/ui
- Supabase SSR
- Zod és React Hook Form

## Fejlesztői indítás

1. Függőségek telepítése:

```bash
npm install
```

2. Környezeti változók előkészítése:

- másold a `.env.example` tartalmát `.env.local` fájlba
- töltsd ki a Supabase és admin kulcsokat
- AI használathoz legalább egy provider kulcs szükséges

3. Fejlesztői szerver indítása:

```bash
npm run dev
```

4. Minőségellenőrzés:

```bash
npm run lint
```

## Környezeti változók

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase projekt URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publikus Supabase anon kulcs
- `MASTER_ADMIN_EMAIL`: master admin azonosítás
- `GOD_MODE_PIN`: God Mode szerveroldali PIN

> **2026-08-23:** az „Aladár" AI-csevegőasszisztens **megszűnt** (Endre döntése, GDPR-indokból:
> így nem kerül semmilyen begépelt szöveg EU-n kívüli szolgáltatóhoz). A hozzá tartozó
> `OPENROUTER_API_KEY`, `GROQ_API_KEY` és `GEMINI_API_KEY` változókra **nincs többé szükség** —
> ha még be vannak állítva az üzemeltetői környezetben, törölhetők. Visszaállításuk előtt
> az adatvédelmi tájékoztatót is újra kellene írni (lásd `scripts/selftest-adatvedelmi-fedezet.mjs`).

## Fontos projektfájlok

- adatbázis referencia: `migration-docs/Database_schema.sql`
- projekt napló: `docs/project-tracking/KARTOTEKA-project-log.md`
- diagnosztikai dokumentum: `docs/project-tracking/KARTOTEKA-diagnosztikai-dokumentum-2026-04-07.md`

## Jelenlegi állapot

- a gyülekezeti szintű modulmag erős és több területen használható
- több kritikus jogosultsági javítás már elkészült
- a repo-higiénia és a teljes lint-konszolidáció folyamatban van
- a `Database_schema.sql` fontos referencia, de nem mindenhol egyezik a kódban látható aktuális adattal

## Következő fókusz

- repo-higiénia véglegesítése
- séma-drift audit a kód és az adatbázis között
- felsőbb szintű dashboardok és hiányzó modulok befejezése
- a vizuális rendszer melegebb, emberközpontúbb finomhangolása
