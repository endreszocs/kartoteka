# Modulok fontossági sorrendje

## Rendezési szempontok

Minden modult 4 szempont alapján értékeltem (1-5 skála):

| Szempont | Mit jelent |
| -------- | ---------- |
| **Függőség** | Hány másik modul épít rá? (5 = mindenki függ tőle) |
| **Komplexitás** | Kódsorok, üzleti logika bonyolultsága (5 = nagyon komplex) |
| **Használati gyakoriság** | Milyen gyakran használják a lelkészek? (5 = naponta) |
| **Biztonsági kockázat** | Mennyire sürgős a migráció biztonsági szempontból? (5 = kritikus) |

---

## Fontossági sorrend

### SZINT 1 — ALAPOZÁS (ezek nélkül semmi nem működik)

#### 1. Core (Auth + Layout)
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★★★★ — MINDEN modul függ tőle |
| Komplexitás | ★★★☆☆ |
| Használat | ★★★★★ — minden oldalbetöltésnél |
| Biztonság | ★★★★★ — API kulcsok, auth guard, session kezelés |

**Tartalmazza:**
- Supabase kliens inicializálás (szerverre kerül)
- Auth guard (middleware-ré válik)
- Bejelentkezés / regisztráció / jelszó reset / OAuth
- Session cache → React Context + Server Session
- Layout (sidebar, header, profil dropdown)
- Szerepkör-kezelés (RBAC: lelkész, esperes, admin, God Mode)
- Gyülekezet-választó

**Jelenlegi fájlok:** supabase_config.js, session_cache.js, auth_roles.js, profile_api.js, congregation_api.js, component_cache.js
**DB táblák:** profiles, congregations, dioceses, districts, admin_access_requests

**Miért első?** Amíg nincs auth és layout, egyetlen oldal sem tölthető be. Ez az alap amire minden épül.

---

#### 2. Dashboard (Irányítópult)
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★★★☆ — belépés utáni első oldal |
| Komplexitás | ★★★☆☆ |
| Használat | ★★★★★ — minden bejelentkezéskor |
| Biztonság | ★★☆☆☆ |

**Tartalmazza:**
- KPI kártyák (tagok, családok, bevétel, kiadás)
- Születésnapi és névnapi emlékeztetők
- Pénzügyi diagramok (havi trend)
- Gyülekezeti programok naptára
- Legutóbbi tevékenységek
- Gyors műveleti gombok

**Jelenlegi fájlok:** dashboard_api.js
**DB táblák:** szemely, csalad, befizetes, kiadas, nevnap, munkanaplo, gyulekezeti_programok

**Miért második?** Ez a „belépési pont" — ha ez működik, a lelkész azonnal látja, hogy a rendszer él. A többi modult innen nyitja meg.

---

### SZINT 2 — TÖRZSADATOK (ezekre épül a többi modul)

#### 3. Tagnyilvántartás (Személyek + Családok)
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★★★★ — pénzügy, anyakönyv, munkanapló mind függ tőle |
| Komplexitás | ★★★★☆ |
| Használat | ★★★★☆ — hetente többször |
| Biztonság | ★★★★☆ — személyes adatok (GDPR) |

**Tartalmazza:**
- Személyek CRUD (2185 sor!)
- Családok kezelése (férj, feleség, gyerekek, cím)
- Okos kereső (szóköz-tudatos, kor, cím)
- Presbiterek és körzetek
- Tömeges importálás (Excel)
- Szülő-gyerek összekötés (családfa alap)
- Választói névjegyzék
- Elhunytak, elköltözöttek, áttértek kezelése

**Jelenlegi fájlok:** member_api.js, csalad_api.js, presbiter_korzet_api.js, mass_import_api.js, lookup_api.js, sync_api.js
**DB táblák:** szemely, csalad, gyerek, elkoltozott, presbiter, felmentes, adrlocality, adrstreet, adrcounty, csoport, nevjegyzek

**Miért harmadik?** A szemely tábla a rendszer gerince — a pénzügyi modul személyeket keres benne, az anyakönyv személyekhez köt bejegyzéseket, a munkanapló személyeket/családokat hivatkozik.

---

### SZINT 3 — FŐ ÜZLETI MODULOK

#### 4. Pénzügyi modul
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★★☆☆ — dashboard és leltár függ tőle |
| Komplexitás | ★★★★★ — a LEGKOMPLEXEBB modul (10.500 sor, 16 fájl!) |
| Használat | ★★★★★ — naponta, minden pénzmozgásnál |
| Biztonság | ★★★★★ — pénzügyi adatok, dupla könyvelés |

**Tartalmazza:**
- Bevételek (járulékok, adományok, egyéb) — batch mód, többéves
- Kiadások (számlák, kifizetések) — leltár-összekötéssel
- Költségvetés (éves terv, zárolás, egyházmegyei feloldás)
- Számadás (éves zárás, leltár, esperesi ellenőrzés)
- Bankszámlák kezelése (BCR import)
- Belső mozgások (kassza↔bank, bank↔bank, valutacsere)
- Pénztárkönyv nyomtatás (PDF)
- Tartozások nyilvántartása
- Audit (sorszám-ellenőrzés)

**Jelenlegi fájlok:** penzugy_init.js, penzugy_income.js, penzugy_expense.js, penzugy_budget.js, penzugy_accounting.js, penzugy_bank_api.js, penzugy_belsomozgas.js, penzugy_transactions.js, penzugy_tranzakciok.js, penzugy_unified_modal.js, penzugy_monetary.js, penzugy_audit.js, penzugy_tartozasok.js, penzugy_print_engine.js, penzugy_print_budget.js, penzugy_print_accounting.js
**DB táblák:** befizetes, kiadas, befizetescel, kiadascel, szamadasicel, bankszamlak, belsomozgas, koltsegvetes, bealitas, berleti_szerzodes

**Miért negyedik?** Ez a legkomplexebb modul — 16 fájl, 10.500 sor. De a tagnyilvántartás kell hozzá (személy keresés bevételhez/kiadáshoz). Érdemes külön alfázisokra bontani.

---

#### 5. Anyakönyv (Egyházi Nyilvántartás)
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★☆☆☆ — család-automatizmus épít rá |
| Komplexitás | ★★★★☆ |
| Használat | ★★★☆☆ — hetente 1-2× |
| Biztonság | ★★★★☆ — jogi dokumentumok |

**Tartalmazza:**
- Keresztelés (szülő-összekötés, okirat szám, emléklap nyomtatás)
- Konfirmáció (tömeges rögzítés, korosztály szűrő, wizard)
- Házasság (vőlegény + menyasszony, tanúk)
- Temetés (halál dátum/ok, temetés dátum/hely)
- Beköltözés, elköltözés, áttérés, kitérés
- Család automatikus létrehozás/gyerek hozzárendelés
- Év szűrő, kereső, rendezés minden fülön
- Munkanapló integráció

**Jelenlegi fájlok:** anyakonyv_api.js (1940 sor)
**DB táblák:** keresztseg, konfirmalas, hazassag, temetes, bekoltozott, elkoltozott, attert, kitert

**Miért ötödik?** Függ a tagnyilvántartástól (személy keresés), de önálló üzleti logikával bír. A cross-referencia a családokkal fontos.

---

### SZINT 4 — KIEGÉSZÍTŐ MODULOK

#### 6. Munkanapló
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ |
| Komplexitás | ★★☆☆☆ |
| Használat | ★★★★☆ — naponta |
| Biztonság | ★☆☆☆☆ |

**Jelenlegi fájlok:** worklog_api.js (747 sor)
**DB táblák:** munkanaplo

---

#### 7. Leltár
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★☆☆☆ — pénzügy linkel rá (penzugy_xkey) |
| Komplexitás | ★★★☆☆ |
| Használat | ★★☆☆☆ — évente 1-2× teljes leltár |
| Biztonság | ★★☆☆☆ |

**Jelenlegi fájlok:** leltar.js (1276 sor), leltar_print_jelentes.js
**DB táblák:** leltar_tetelek, leltar_katalogus

---

#### 8. Iktatás
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ — költségvetés auto-iktat |
| Komplexitás | ★★☆☆☆ |
| Használat | ★★★☆☆ |
| Biztonság | ★☆☆☆☆ |

**Jelenlegi fájlok:** iktato_api.js
**DB táblák:** iktato

---

#### 9. Sírhelyek
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ |
| Komplexitás | ★★☆☆☆ |
| Használat | ★★☆☆☆ |
| Biztonság | ★☆☆☆☆ |

**Jelenlegi fájlok:** sirhely_api.js (729 sor)
**DB táblák:** sirhelyek, sirhely_sorok, sirhely_parcellak, berleti_szerzodes

---

### SZINT 5 — KÖZÖSSÉGI ÉS TÁMOGATÓ MODULOK

#### 10. Missziós Műhely
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ |
| Komplexitás | ★★★☆☆ |
| Használat | ★★☆☆☆ |
| Biztonság | ★★☆☆☆ — R2 fájlok |

**Jelenlegi fájlok:** misszios_muhely_api.js, misszios_muhely_otletek.js, misszios_muhely_gamification.js, misszios_muhely_sziget.js, r2_config.js
**DB táblák:** mm_kategoriak, mm_segedanyagok, mm_otletek, mm_szavazatok, mm_hozzaszolasok, mm_feladatok, mm_merfoldkovek, mm_jelveny_tipusok, mm_felhasznalo_statisztika, stb.

---

#### 11. Értesítések (Realtime)
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★★☆☆☆ — admin access request, support |
| Komplexitás | ★★☆☆☆ |
| Használat | ★★★★☆ — folyamatosan aktív |
| Biztonság | ★☆☆☆☆ |

**Jelenlegi fájlok:** notifications.js
**DB táblák:** ertesitesek

---

#### 12. Aladár AI Asszisztens
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ |
| Komplexitás | ★★☆☆☆ |
| Használat | ★★★☆☆ |
| Biztonság | ★★★★☆ — API kulcsok kliens kódban! |

**Jelenlegi fájlok:** ai_chat.js, ai_config.js
**Integrációk:** OpenRouter, Groq, Gemini

---

#### 13. Admin Panel
| Szempont | Érték |
| -------- | ----- |
| Függőség | ★☆☆☆☆ |
| Komplexitás | ★★★☆☆ |
| Használat | ★☆☆☆☆ — csak rendszergazda |
| Biztonság | ★★★★★ — God Mode, tömeges műveletek |

**Jelenlegi fájlok:** admin_api.js (1471 sor), superadmin_import_api.js
**DB táblák:** profiles, congregations, dioceses, support_messages

---

## Migrációs sorrend összefoglalva

```
Fázis 1: Core (Auth + Layout)
    │     ↓ ALAP — e nélkül semmi nem indul
Fázis 2: Dashboard
    │     ↓ ELSŐ MŰKÖDŐ OLDAL — a lelkész azonnal látja
Fázis 3: Tagnyilvántartás
    │     ↓ TÖRZSADATOK — erre épül minden
Fázis 4: Pénzügyi modul (alfázisokra bontva!)
    │     ├── 4a: Bevételek + Kiadások
    │     ├── 4b: Költségvetés + Számadás
    │     ├── 4c: Bank + Belső mozgás
    │     └── 4d: Nyomtatás + Audit
Fázis 5: Anyakönyv
    │     ↓
Fázis 6: Munkanapló + Leltár + Iktatás
    │     ↓
Fázis 7: Sírhelyek + Missziós Műhely + Értesítések
    │     ↓
Fázis 8: AI Asszisztens + Admin Panel
    │     ↓
Fázis 9: Véglegesítés (tesztelés, PWA, offline, deploy)
```

## Becsült időigény

| Fázis | Becsült idő | Kumulatív |
| ----- | ----------- | --------- |
| 1. Core | 3-5 nap | 5 nap |
| 2. Dashboard | 2-3 nap | 8 nap |
| 3. Tagnyilvántartás | 5-7 nap | 15 nap |
| 4. Pénzügy | 10-14 nap | 29 nap |
| 5. Anyakönyv | 4-5 nap | 34 nap |
| 6. Munkanapló+Leltár+Iktatás | 4-5 nap | 39 nap |
| 7. Sírhelyek+Misszió+Értesítések | 4-5 nap | 44 nap |
| 8. AI+Admin | 3-4 nap | 48 nap |
| 9. Véglegesítés | 5-7 nap | 55 nap |
| **Összesen** | **~55 munkanap** | **~2.5-3 hónap** |

## Szabály: párhuzamos működés

A régi rendszer (`D:\Egyházi APP\project`) **tovább működik** a migráció alatt. A Supabase adatbázis **közös** — mindkét rendszer ugyanazt az adatbázist használja. A lelkészek a régi rendszert használják, amíg az új rendszer teljesen kész.
