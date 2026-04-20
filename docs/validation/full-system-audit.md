# Teljes rendszer diagnosztika — 2026-04-07

## Összefoglalás

| Metrika | Érték |
|---------|-------|
| Forrás rendszer | 34 742 sor, 53 modul |
| Next.js implementáció | ~65% funkció kész |
| Build állapot | SIKERES (0 hiba) |
| Kódminőség | Tiszta (0 console.log, 0 as any, 0 TODO) |

---

## Modul-szintű egyezés

### TELJES IMPLEMENTÁCIÓ (90%+)

| Modul | Forrás | Next.js | Egyezés |
|-------|--------|---------|---------|
| Tagnyilvántartás | member_api.js (2185 sor) | actions.ts + 6 tab + 5 modal | 90% |
| Anyakönyv | anyakonyv_api.js (1940 sor) | actions.ts + 9 tab + 5 modal | 95% |
| Munkanapló | worklog_api.js (747 sor) | actions.ts + 3 tab + 1 modal | 95% |
| Leltár | leltar.js (1276 sor) | actions.ts + main + 1 modal | 90% |
| Iktatás | iktato_api.js (336 sor) | actions.ts + main + 1 modal | 95% |
| Sírhelyek | sirhely_api.js (729 sor) | actions.ts + main + 4 modal | 90% |
| AI Asszisztens | ai_chat.js (105 sor) | route.ts + widget | 85% |
| Admin Panel | admin_api.js (1471 sor) | actions.ts + 5 tab | 80% |
| Értesítések | notifications.js (590 sor) | notification-bell.tsx | 85% |

### RÉSZLEGES IMPLEMENTÁCIÓ (40-70%)

| Modul | Forrás sorok | Next.js állapot | Hiányzik |
|-------|:------------:|-----------------|----------|
| Pénzügy | 10 500+ | 7/8 fül kész | Belső mozgás UI, nyomtatás, audit |
| Dashboard | 1437 | 85% | Terv teljesülés widget |

### NEM IMPLEMENTÁLT (0%)

| Modul | Forrás sorok | Megjegyzés |
|-------|:------------:|-----------|
| Missziós Műhely | 4252 (4 fájl) | Placeholder page |
| Offline/PWA | 1117 (4 fájl) | Nincs SW/IndexedDB |
| Nyomtatás rendszer | 956 (3 fájl) | Nincs html2pdf |
| Admin Import | 2653 (2 fájl) | Placeholder tab |
| Presbiteri modul | 1274 | Részben a tagnyilv-ban |

---

## Pénzügyi modul részletes egyezés

### Implementált fülek

| Fül | Forrás funkció | Next.js | Egyezés |
|-----|---------------|---------|---------|
| Áttekintés | KPI + tranzakciók | dashboard-tab.tsx | 80% |
| Kassza | irattipus=Készpénz szűrés, futó egyenleg | cashbook-tab.tsx | 85% |
| Bank | bankszámlák, banki forgalom | bank-tab.tsx | 80% |
| Költségvetés | terv szerkesztés, véglegesítés | budget-tab.tsx | 70% |
| Számadás | terv vs. tény, %-os | accounting-tab.tsx | 60% |
| Tranzakciók | egyesített lista, törlés | transactions-tab.tsx | 60% |
| Tartozások | járulék hátralék | debt-tab.tsx | 70% |
| Monetár | — | placeholder | 0% |

### Hiányzó pénzügyi funkciók

| Funkció | Forrás | Prioritás |
|---------|--------|:---------:|
| Belső mozgás UI (kassza↔bank) | penzugy_belsomozgas.js (278 sor) | MAGAS |
| Költségvetés feloldás kérelem | penzugy_budget.js requestBudgetUnlock() | MAGAS |
| Számadás véglegesítés | penzugy_accounting.js finalizeAccounting() | MAGAS |
| Párosítatlan befizetések audit | penzugy_audit.js (484 sor) | MAGAS |
| Napi pénztárnapló nyomtatás | penzugy_print_engine.js | KÖZEPES |
| Költségvetés PDF | penzugy_print_budget.js (414 sor) | KÖZEPES |
| Számadás PDF | penzugy_print_accounting.js (458 sor) | KÖZEPES |
| Napi csoportosítás tranzakcióknál | penzugy_transactions.js | ALACSONY |
| Valutacsere (EUR↔RON) | penzugy_belsomozgas.js | ALACSONY |

---

## Tagnyilvántartás részletes egyezés

| Funkció | Forrás | Next.js | Státusz |
|---------|--------|---------|---------|
| Személyek CRUD | saveMember, removeMember | ✅ actions.ts | Kész |
| Személy részletek modal | openMemberDetails | ✅ member-details-dialog.tsx | Kész |
| Család kartoték | openFamilyDetails (részletes) | ✅ family-details-dialog.tsx (3 fül) | Kész |
| Presbiterek kártya nézet | — | ✅ presbyters-tab.tsx | Kész |
| Körzetek + család hozzárendelés | — | ✅ districts-tab.tsx | Kész |
| Választói névjegyzék | getVoters + járulék szűrés | ✅ voters-tab.tsx | Kész |
| Szülő keresés (CNP) | searchParent | ✅ actions.ts | Kész |
| Családfa megjelenítés | showFamilyTree | ❌ | Hiányzik |

---

## Dizájn rendszer állapot

| Elem | Állapot |
|------|---------|
| card-raised (domborított kártya) | ✅ Globális |
| icon-raised (domborított ikon) | ✅ Globális |
| ColorTabs (underline fülek) | ✅ 5 modul használja |
| Lucide ikonok | ✅ Sidebar, header, minden tab |
| Reszponzív grid-ek | ✅ Minden form és táblázat |
| Barátságos üres állapotok | ✅ Minden lista/táblázat |
| Mobil drawer (Sheet) | ✅ Sidebar |
| Loading skeleton | ✅ Dashboard + modulok |

---

## Következő lépések (prioritás szerint)

### Sprint A — Pénzügy kiegészítés
1. Belső mozgás modal (kassza↔bank, bank↔bank)
2. Költségvetés véglegesítés + feloldás workflow
3. Számadás véglegesítés workflow

### Sprint B — Nyomtatás rendszer
4. html2pdf integráció
5. Napi pénztárnapló PDF
6. Költségvetés PDF
7. Számadás PDF

### Sprint C — Haladó funkciók
8. Párosítatlan befizetések audit
9. Tranzakciók napi csoportosítás
10. Családfa megjelenítés

### Sprint D — Missziós Műhely
11. Segédanyagok
12. Ötletek + szavazás
13. Gamifikáció
14. Sziget missziók
