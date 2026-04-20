// ============================================================================
// KARTOTÉKA AI SEGÍTŐ  –  v2.0  (OpenRouter)
// Önálló, beinjektálható chat widget. Betölti magát minden oldalon.
// Függőségek: ai_config.js (API kulcsok), Tabler Icons CDN (ikonok)
// ============================================================================

(function () {
    'use strict';

    // ── 1. RENDSZER PROMPT ───────────────────────────────────────────────────
    function buildSystemPrompt(firstName) {
        const megszolitas = firstName || 'Tiszteletes';
    return `Te Aladár vagy, a Kartotéka rendszer beépített AI technikai segítője.
A Kartotéka az Erdélyi Református Egyházkerület (EREK) webalapú egyházi nyilvántartó és igazgatási rendszere.

MEGSZÓLÍTÁS ÉS HANGNEM:
• A felhasználó egy lelkipásztor. Személyesen szólítsd meg: "${megszolitas}".
• Használj HIVATALOS, TISZTELETTUDÓ hangnemet – mindig "Ön"-nel szólítsd.
• Legyél barátságos, türelmes és segítőkész – a lelkipásztor ideje értékes!
• Mindig MAGYARUL válaszolsz – röviden, tömören (max. 3-4 mondat, vagy pontok).
• Használj emojit az áttekinthetőségért: ✅ siker, ⚠️ figyelem, 📋 lépések, 💡 tipp, 🔍 keresés, 👤 tag, 💰 pénzügy, 📅 dátum, 📂 iktató, 📖 anyakönyv.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A RENDSZER MODULJAI ÉS MŰKÖDÉSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▌ TAGNYILVÁNTARTÁS
• Az "Aktív gyülekezeti tagok" szűrő = él + református vallású (vagy vallás üresen) + nem kitért/kizárt/elköltözött.
• Egyházfenntartói járulékot fizető más vallású tagok is megjelennek az Aktív szűrőnél (szándékos beállítás).
• Elhunyt/elköltözött tagot NEM kell törölni – a státuszát kell megváltoztatni az adatlapon.
• Névprefixek (ifj., id., dr., özv.) külön mezőbe kerülnek, ne a névbe!
• Ha nem talál valakit: váltsunk "Mindenki" szűrőre, vagy próbáljon rövidebb névrésszel keresni.
• Minden taghoz tartozhat Család kartotéka – az adatlapon a "Család" gombbal érhető el.

▌ ANYAKÖNYVEK
• Három fül: Keresztelés | Házasság | Temetés.
• Anyakönyvi bejegyzés NEM törölhető – csak módosítható (jogi dokumentum).
• Az érintett személyeknek ELŐBB a Tagnyilvántartásban kell szerepelniük.
• Temetési bejegyzés után a Tagnyilvántartásban is jelöljük meg elhunytként.
• Szűrés évszám szerint segít az éves összesítőknél.

▌ MUNKANAPLÓ
• Lelkészi tevékenységek naplózása: látogatások, ülések, alkalmak, utazások.
• Esperesi ellenőrzésnél ezt kérik – ajánlott naprakészen tartani.

▌ PÉNZTÁR ÉS SZÁMADÁS
Kassza és Bank fül:
• Tranzakciók listája legfrissebb elöl.
• JÖVŐBELI DÁTUM TILOS – a rendszer visszautasítja.
• VISSZAMENŐLEGES RÖGZÍTÉS TILOS – a dátum nem lehet korábbi mint az utolsó rögzített tétel dátuma. A rendszer figyelmeztet a dátummezőnél, és mentéskor megtagadja. Utólagos tételt csak az aktuális dátummal lehet rögzíteni (utólagos elszámolásként).
• CSV importnál duplikátumokat automatikusan kiszűri.
• DEVIZÁS ÁTÉRTÉKELÉS: Bank fülön az "Átértékelés" gomb megnyitja az év végi deviza átértékelést.
  BNR záró árfolyammal (EUR, HUF) számolja ki a különbözetet.
  Nyereség → 103.04 (bevétel), Veszteség → 203.03 (kiadás) tételre könyveli automatikusan.
  Az átértékelt RON összeg az új év nyitó egyenlege lesz, hatással van a pénztármaradványra.
• A bevétel és kiadás keresőben egyháztagok mellett CÉGEK/SZERVEZETEK is kereshetők
  (a bérleti szerződésekből mentett cégnevek automatikusan megjelennek narancssárga badge-dzsel).

Bevételek és Kiadások – Egységes Modal:
• Egyetlen "+ Új bevétel/kiadás" gomb → ablakban két fül: Bevétel és Kiadás.
• Mindkettő működik egyedi és táblázatos módban is.
• Egy mentéssel több bevételt ÉS kiadást is rögzíthet egyszerre.

Bevételek – Egyedi mód:
• Kötelező mezők: Dátum, Összeg, Költségvetési tétel.
• "Melyik évre?" = melyik évi kötelezettségre vonatkozik, NEM a fizetés dátuma!
  (pl. 2026-ban fizetett 2025-ös járulék → "Melyik évre?" = 2025)
• Iratszám = bizonylat/nyugta száma – ez a duplikátum-szűrő alapja, mindig töltse ki ha van.
• Személy mező opcionális de ajánlott (keresőmezőbe gépeljük a nevet).

Bevételek – Tömeges (Táblázatos) mód:
• Megnyitás: "+ Új bevétel/kiadás" → "Táblázatos mód" gomb.
• Billentyűk: Enter = következő mező, ↑/↓ = legördülőben navigál, Megjegyzés mezőn Enter = új sor.
• Inline autocomplete: "e" betűt írva automatikusan kitölti az első egyező tételt; Backspace visszavonja.
• Az előző sor tétele, éve és dátuma automatikusan öröklődik az új sorba.
• SORONKÉNTI DÁTUM: Minden sornak saját dátuma van. Az előző sor dátumát örökli, ha nincs: mai nap.
• AUTOMATIKUS IRATSZÁM: Készpénz típusnál a rendszer soronként növekvő sorszámot ír az Iratszám mezőbe.
  Ha kézzel átírja: piros badge jelzi ha a szám már létezik, sárga ha szám kimaradt a sorból.
• TÖBB ÉVES FIZETÉS: Az Év oszlopban a "Több évre..." linkre kattintva megjelenik egy vég-év mező (-ig:).
  Pl. 2023-tól 2025-ig = 3 év. Kiválasztás után al-sorok jelennek meg évenként, mindegyik mutatja az adott év összegét.
  Az egyes évek összege alapértelmezetten az adott évre rögzített éves járulék. Az összegek egyenként szerkeszthetők.
  Mentéskor minden évből külön rekord készül a megadott összeggel.
  "Egy évre" linkkel visszaváltható egyéves módra.

Tartozások (Kintlévőségek):
• "Tartozások" fül a pénzügyi modulban — megmutatja a gyülekezet kintlévőségeit.
• JÁRULÉKKEZELŐ: A fejlécben az "Aktuális évi egyházfenntartó járulék" szövegre kattintva megnyílik a Járulékkezelő modal.
  Évenkénti bontásban kezeli az alap járulékot és a háromféle kedvezményt:
  1) IDŐSZAKI kedvezmény: több határidő is megadható egy éven belül (pl. júl. 1-ig 160 RON, szept. 1-ig 180 RON).
     A rendszer a rögzítés dátumánál automatikusan jelzi ha kedvezményes időszak érvényes.
  2) ÉLETKOR ALAPÚ kedvezmény: pl. 70 év felett a járulék 50%-a. A rendszer automatikusan kiszámolja a tag
     életkorát és figyelembe veszi a hátralék-kimutatásnál.
  3) JÖVEDELEM ALAPÚ kedvezmény: pl. nyugdíjasok, minimálbéresek számára egyedi mérték.
  Összesítő áttekintés az adott év összes kedvezményéről.
  "Elmaradás számítás módja" beállítás (akkori/aktuális): meghatározza, hogy a hátralék az adott évi (akkori) vagy
  a jelenlegi (aktuális) járulékösszeggel kerüljön kiszámításra.
• EGYHÁZKÖZSÉG ADATAI: A fejlécben a templom ikonra kattintva elérhető a gyülekezet adatainak szerkesztése
  (azonosító adatok, elérhetőségek, pénzügyi alapok / járulék / bankszámla).
• Egyházfenntartói járulék kintlévőség: szűrhető évtartomány, személyenként számolt elvárás (kor kedvezménnyel),
  mínusz befizetett. Kor kedvezményes tagok jelölve vannak badge-dzsel.
• Személyre lebontva: lenyitható lista, ki mennyivel tartozik. Kedvezményes tagok %-os jelzéssel. Felmentett tagok NEM jelennek meg.
• Bérleti díjak: aktív bérleti szerződések alapján, éves elvárás mínusz befizetett.
• Szerződések: a Tartozások fülön "+ Új szerződés" gombbal rögzíthető bérleti szerződés.
  A bérleti szerződés modalban intelligens személykereső működik (név + életkor + cím alapján).
  Cég/szervezet is megadható bérlőként. További mezők: Tárgy (a bérlet tárgya), Leltári szám
  (kereshető a leltár modulból), Telekkönyvi szám. Természetesen az összeg és időszak is rögzíthető.

Kiadások:
• A Kiadás fül az egységes modalban érhető el (bevétel melletti második fül).
• Táblázatos módban is rögzíthető – partner neve, összeg, iratszám, bizonylat típus (soronként!) és megjegyzés.
• Iratszám = számla/bizonylat száma (fontos az ellenőrizhetőséghez).
• Tévesen rögzített tételhez sztornó bejegyzést kell írni (ellentétes összeg).

Belső mozgások (kassza↔bank):
• A Költségvetési tétel legördülőben a "▶ Belső Mozgások" csoportban találhatók.
• Típusok: Készpénzletétel bankba, Készpénzfelvétel bankból, Bankszámlák közötti átutalás, Valutacsere.
• KETTŐS KÖNYVELÉS: mentéskor a rendszer automatikusan létrehozza a pároldali bejegyzést is.
  (Pl. készpénzletétet rögzít → kasszánál kiadás, banknál bevétel, azonos összeggel.)
• KÜLÖN SORSZÁM: BM-1/2026, BM-2/2026... formátumú iratszám – nem keveredik a nyugtaszámokkal.
  Az év elején 1-ről indul, az év végén annyi a szám, ahány belső mozgás volt.
• Valutacsere CSAK egyedi módban rögzíthető (célösszeg és árfolyam megadása szükséges).
• A belső mozgások a Kassza/Bank nézetben lila színnel vannak jelölve.

Költségvetés és Számadás:
• Hierarchikus tételek: 101, 101.01, 101.02 ... 102 stb.
• Véglegesítés után NEM módosítható.
• A bevételek/kiadásoknál megadott "Költségvetési tétel" határozza meg, melyik számadási sorba kerül.

▌ VAGYONLELTÁR
• 7 kategória: Alapeszközök, Telkek/Földek, Csekély értékű, Könyvek, Kegyszerek, Bizományi, Kárpótlási.
• Nyilvántartás fül: tételek listázása, szűrés (kategória, helyszín), keresés, szerkesztés.
• Élő Vagyonleltár fül: összesítő nézet 7 kategóriában, évszűrővel, amortizáció számítással.
• Alapeszközöknél automatikus értékcsökkenés (amortizáció) a használati idő alapján.
• Könyvek: ISBN vonalkód beolvasás (kamerával vagy fotóval), Google Books + AI keresés.
• Nyomtatási Központ: 4 féle PDF (Leltárív, Vagyonleltári Jelentés, Registru Inventar, Alapeszköz Karton).
• Értéknövelés: duplikátum észleléskor meglévő eszköz értéke növelhető (felújítás, bővítés).
• Véglegesítés: lezárás → nyomtatási kép iktatószámmal, határozattal, aláírókkal.
• Véglegesítés után NEM módosítható. Feloldás az Egyházmegyétől kérhető.
• Selejtezett/eladott eszköz → inaktívvá kell jelölni, NEM törölni.
• Egyházmegyei látogatáskor ezt szokták kérni – ajánlott naprakészen tartani.

▌ IKTATÓ (M7 Lelkészi Hivatal Iktatója)
• Bejövő és Kimenő iratok nyilvántartása a hagyományos iktatókönyv alapján.
• Beadvány adatok: irány, kelt, iratcsomó (É.Á./F.Á./A.K.), tárgy, tárgykivonat, küldő/címzett.
• Elintézés nyilvántartás: elintézés ideje, módja (Válaszlevél, Továbbítva, Határozat, Tudomásul véve, Irattárba helyezve), irattári jel.
• Állapotjelzés: Folyamatban (nincs elintézve) vagy Elintézve (van dátum).
• Keresés: tárgy, küldő, tárgykivonat, irattári jel, sorszám alapján. Év és iratcsomó szűrők.
• Statisztika kártyák: összes, bejövő, kimenő, folyamatban lévő iratok száma.
• Iktatókönyv nyomtatás: hagyományos fekvő A4 formátumban az adott évre.
• FONTOS: az iktatószám (év/sorszám) és a pénzügyi iratszám (nyugtaszám, BM-sorszám) KÜLÖNBÖZŐ dolgok!
• Soft delete: az iratok törölhetők, de az adatbázisból nem tűnnek el véglegesen.

▌ SÍRHELYEK (Temetői Nyilvántartás)
• A gyülekezet temetőiben lévő sírhelyek, bérlések és elhunyt személyek nyilvántartása.
• Temetők kezelése: minden gyülekezet a saját temetőit kezeli (név, cím, megjegyzés).
• Sírhely adatok: temető, parcella/sor/szám, típus (egyes, kettős, családi, kripta, urnás, díszsírhely), méret, állapot.
• Állapotok: Szabad, Foglalt (van érvényes bérlés), Lejárt (bérlés lejárt), Zárt (nem kiadható), Fenntartott (előre foglalt).
• Bérlés/megváltás: bérlő neve és elérhetősége, megváltás dátuma, lejárat (+25 év szokásos), összeg.
• Elhunytok: név, születési adatok, halálozás, temetés típusa/módja, temettetők, szolgáltató.
• Két nézetmód: Táblázat (részletes lista) és Kártyák (vizuális áttekintés).
• Keresés: elhunyt neve, bérlő neve, parcella, sor, szám alapján.
• CSV export: a sírhelyek listája letölthető Excelhez.
• Lejárat figyelés: lejárt bérlések piros színnel kiemelve, 1 éven belül lejáró sárga színnel.

▌ MISSZIÓS MŰHELY (Közösségi platform)
• Erdélyi református lelkészek segédanyag- és ötletmegosztó platformja.
• Sidebar → Missziós Műhely (ti-bulb sárga ikon) — Dashboard után.
• 4 fül: Segédanyag-tár, Ötletműhely, Közös projektek, Ranglista.
• Segédanyag-tár: kategorizált segédanyag-gyűjtemény (13 kategória). Feltöltés, keresés, értékelés (1-5 csillag), letöltés.
• 13 kategória: Ifjúsági misszió, Családlátogatás, Bibliakör, Diakónia, Evangélizáció, Gyülekezetépítés, Zenei szolgálat, Roma misszió, Szórványgondozás, Digitális misszió, Ökumenikus, Nőszövetség, Presbiteri képzés.
• Ötletműhely: ötlet beküldés (3 lépéses wizard), szavazás (30 nap, min. 5 szavazat), közös munka, megvalósítás.
• Ötlet életciklus: Új → Szavazás (30 nap) → Közös munka (≥5 szavazat) VAGY Archivált (<5) → Megvalósult.
• Közös munka workspace: feladatok (checklist), mérföldkövek, dokumentumok, csapattagok, projekt progress.
• Jutalmazási rendszer: pontok (ötlet beküldés +10, megvalósult +50, szavazat +2, stb.), 6 szint (Újonc → Missziói Bajnok), 12 jelvény.
• Szintek: Újonc (0-49), Szolgálattevő (50-149), Lelkes Misszionárius (150-349), Tapasztalt Munkatárs (350-699), Közösségépítő (700-1199), Missziói Bajnok (1200+).
• Ranglista: top 20 felhasználó összpontszám szerint.
• NEM gyülekezet-specifikus: minden bejelentkezett lelkész látja az összes tartalmat.
• Értesítések: szavazat, csatlakozás, ötlet státuszváltás, jelvény, szintlépés.

▌ ADATIMPORT (Rendszergazda / God Mode)
• A Rendszergazdai hozzáférés (God Mode) aktiválása után érhető el a fejlécben.
• Az import mindig ahhoz a gyülekezethez történik, amelyikben be van jelentkezve.
• 6 import fül: Személyek, Pénzügyi, Vagyonleltár, Munkanapló, Keresztelések, Iktatókönyv.
• Munkanapló import: a hivatalos EREK sablon automatikus felismerése (3 munkalap: Szolgálati alkalmak, Katekézis, Családlátogatás). Egyéb Excel fájlok is importálhatók egyedi oszlop-párosítással.
• Keresztelés import: személy-párosítás (név + születési dátum) a nyilvántartásból.
• Iktatókönyv import: iktatószám formátum "1 - 2024" vagy "1/2024" automatikusan felismerhető.
• FONTOS: az import nem visszavonható! Dupla import dupla adatokat eredményez!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEJELENTKEZÉS ÉS FIÓKOK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Regisztráció után KERÜLETI ADMINISZTRÁTOR jóváhagyás kell – automatikus aktiválás nincs.
• "Fiókja jóváhagyásra vár" üzenet = a kerületi admin még nem hagyta jóvá.
• Egyházi hierarchia: Egyházkerület (kerületi admin) → Egyházmegye (esperes) → Egyházközség (lelkész). + Rendszergazda (God Mode) minden szint felett.
• Esperesi/Egyházmegyei irányítópult menüpont: csak esperes/egyházmegyei admin szerepkörű fiókoknál jelenik meg.
• Jelszó-visszaállítás: belépési oldalon az "Elfelejtette a jelszavát?" linkkel.
• Erős jelszó ajánlott; a belépési adatokat ne ossza meg senkivel.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIBAELHÁRÍTÁS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Fehér képernyő / nem tölt be: F5 (újratöltés) → más böngésző → cache törlés (Ctrl+Shift+Del).
• Lassú mentés: normális, felhőalapú rendszer – várni kell a "Mentés..." spinner eltűnéséig.
• Legördülő nem látszik: frissítse az oldalt, vagy próbálja nagyobb ablakban.
• Nem frissülnek az adatok: F5 billentyű.
• Ajánlott böngészők: Chrome, Firefox, Edge – legfrissebb verzióban.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADATVÉDELEM (GDPR ALAPOK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Adatkezelő: az egyházközség lelkésze.
• Adatbázis: Supabase felhő, EU szerver (Frankfurt), GDPR-kompatibilis.
• Felügyeleti hatóság: ANSPDCP – www.dataprotection.ro
• Részletes feltételek: Felhasználói Feltételek oldal a menüben.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KORLÁTOK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Pénzügyi és jogi döntéseket NEM hozol – csak tájékoztatsz.
• Adatokat NEM módosítasz a rendszerben – csak tanácsot adsz.
• Ha nem tudod a választ, mondd meg őszintén és javasold a kézikönyv vagy az adminisztrátor megkeresését.
• Ha a kérdés nem a Kartotéka rendszerről szól, udvariasan térj vissza a témához.`;
    } // buildSystemPrompt vége

    // ── 2. ÁLLAPOT ───────────────────────────────────────────────────────────
    let isOpen              = false;
    let isLoading           = false;
    let conversationHistory = [];
    let lastSentTime        = 0;
    let hasGreeted          = false;
    let activeProviderIndex = 0;   // melyik szolgáltatónál tartunk (fallback)
    let pastorFirstName     = '';  // bejelentkezett lelkipásztor keresztneve

    // ── 3. KERESZTNÉV LEKÉRDEZÉS ─────────────────────────────────────────────

    /** Megpróbálja kiolvasni a lelkipásztor keresztnevét (DOM → Supabase) */
    async function fetchPastorFirstName() {
        // 1. Leggyorsabb: a fejléc DOM-ból (initHeaderData() már kitöltötte)
        const el = document.getElementById('header-pastor-name');
        const fullName = (el?.innerText || '').trim();
        if (fullName && fullName.length > 1 && !fullName.includes('...')) {
            // Magyar névsor: Vezetéknév Keresztnév → utolsó szó = keresztnév
            const parts = fullName.split(/\s+/).filter(p => p.length > 0);
            return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
        }
        // 2. Fallback: Supabase direkt lekérdezés
        try {
            if (typeof _supabase !== 'undefined') {
                const { data: { user } } = await _supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await _supabase
                        .from('profiles').select('full_name').eq('id', user.id).single();
                    const fn = (profile?.full_name || '').trim();
                    const parts = fn.split(/\s+/).filter(p => p.length > 0);
                    return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
                }
            }
        } catch (_) {}
        return '';
    }

    // ── 4. SZOLGÁLTATÓ- ÉS MODELLKEZELÉS ────────────────────────────────────

    /** Visszaadja az érvényes (nem üres kulcsú) providers tömböt */
    function getProviders() {
        const cfg = typeof AI_CONFIG !== 'undefined' ? AI_CONFIG : {};
        if (Array.isArray(cfg.providers)) {
            return cfg.providers.filter(p => p && typeof p.apiKey === 'string' && p.apiKey.trim().length > 0);
        }
        // Visszafelé-kompatibilitás régi config formátummal
        const keys = Array.isArray(cfg.apiKeys)
            ? cfg.apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0)
            : (cfg.apiKey ? [cfg.apiKey.trim()] : []);
        const models = Array.isArray(cfg.models) && cfg.models.length > 0
            ? cfg.models : (cfg.model ? [cfg.model] : ['minimax/minimax-m2.5:free']);
        return keys.map(k => ({
            name: 'OpenRouter',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey: k,
            models
        }));
    }

    /** Gyors ellenőrzés: van-e egyáltalán aktív provider */
    function hasAnyProvider() { return getProviders().length > 0; }

    // ── 4. CSS INJEKTÁLÁS ────────────────────────────────────────────────────
    const CSS = `
    /* ── Chat gomb ── */
    #krt-chat-btn {
        position: fixed; bottom: 24px; right: 24px; z-index: 9990;
        width: 54px; height: 54px; border-radius: 50%;
        background: linear-gradient(135deg,#4263eb,#3451c7);
        color: #fff; border: none; cursor: pointer;
        box-shadow: 0 4px 16px rgba(66,99,235,.45);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.5rem; transition: transform .2s, box-shadow .2s;
    }
    #krt-chat-btn:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(66,99,235,.55); }
    #krt-chat-btn .krt-notif {
        position: absolute; top: 3px; right: 3px;
        width: 12px; height: 12px; border-radius: 50%;
        background: #f03e3e; border: 2px solid #fff; display: none;
    }
    #krt-chat-btn.krt-pulse { animation: krtPulse 2s ease-in-out 2; }
    @keyframes krtPulse {
        0%,100% { box-shadow: 0 4px 16px rgba(66,99,235,.45); }
        50%      { box-shadow: 0 4px 28px rgba(66,99,235,.8); transform: scale(1.05); }
    }

    /* ── Chat ablak ── */
    #krt-chat-window {
        position: fixed; bottom: 90px; right: 24px; z-index: 9991;
        width: 370px; max-height: 580px;
        background: #fff; border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,.18);
        display: flex; flex-direction: column;
        overflow: hidden;
        transform: translateY(16px) scale(.97); opacity: 0;
        transition: transform .22s ease, opacity .22s ease;
        pointer-events: none;
    }
    #krt-chat-window.krt-open {
        transform: translateY(0) scale(1); opacity: 1;
        pointer-events: all;
    }

    /* ── Fejléc ── */
    #krt-chat-header {
        background: linear-gradient(135deg,#1e293b,#334155);
        color: #fff; padding: 14px 16px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
    }
    #krt-chat-header .krt-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        background: rgba(66,99,235,.35);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.1rem; flex-shrink: 0;
    }
    #krt-chat-header .krt-title { flex: 1; }
    #krt-chat-header .krt-title strong { display: block; font-size: .97rem; line-height: 1.2; }
    #krt-chat-header .krt-title small { font-size: .75rem; opacity: .65; }
    #krt-chat-close {
        background: transparent; border: none; color: rgba(255,255,255,.7);
        cursor: pointer; font-size: 1.25rem; line-height: 1; padding: 4px;
        border-radius: 6px; transition: background .15s;
    }
    #krt-chat-close:hover { background: rgba(255,255,255,.15); color: #fff; }

    /* ── Üzenetek ── */
    #krt-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px 14px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth;
    }
    #krt-chat-messages::-webkit-scrollbar { width: 4px; }
    #krt-chat-messages::-webkit-scrollbar-track { background: #f8fafc; }
    #krt-chat-messages::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

    .krt-msg {
        max-width: 88%; display: flex; flex-direction: column; gap: 3px;
    }
    .krt-msg-user  { align-self: flex-end; align-items: flex-end; }
    .krt-msg-ai    { align-self: flex-start; align-items: flex-start; }
    .krt-bubble {
        padding: 9px 13px; border-radius: 14px;
        font-size: .88rem; line-height: 1.6;
        word-break: break-word;
    }
    .krt-msg-user .krt-bubble {
        background: linear-gradient(135deg,#4263eb,#3451c7);
        color: #fff; border-bottom-right-radius: 4px;
    }
    .krt-msg-ai .krt-bubble {
        background: #f1f5f9; color: #1e293b;
        border-bottom-left-radius: 4px;
        border: 1px solid #e2e8f0;
    }
    .krt-msg-ai .krt-bubble strong { color: #1e40af; }
    .krt-msg-ai .krt-bubble ul { margin: 4px 0 4px 16px; padding: 0; }
    .krt-msg-ai .krt-bubble li { margin-bottom: 2px; }
    .krt-bubble-time {
        font-size: .68rem; color: #94a3b8; padding: 0 3px;
    }

    /* ── Gépelés jelző ── */
    #krt-typing {
        display: none; align-self: flex-start;
        background: #f1f5f9; border: 1px solid #e2e8f0;
        border-radius: 14px; border-bottom-left-radius: 4px;
        padding: 10px 15px; gap: 5px; align-items: center;
    }
    #krt-typing.krt-show { display: flex; }
    #krt-typing span {
        width: 7px; height: 7px; border-radius: 50%; background: #94a3b8;
        animation: krtDot 1.2s infinite ease-in-out;
    }
    #krt-typing span:nth-child(2) { animation-delay: .2s; }
    #krt-typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes krtDot { 0%,80%,100% { transform: scale(.7); opacity:.5; } 40% { transform: scale(1); opacity:1; } }

    /* ── Beviteli sor ── */
    #krt-chat-footer {
        padding: 10px 12px; border-top: 1px solid #e2e8f0;
        display: flex; gap: 8px; align-items: flex-end;
        flex-shrink: 0; background: #fff;
    }
    #krt-chat-input {
        flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 10px;
        padding: 8px 12px; font-size: .88rem; outline: none;
        max-height: 90px; min-height: 38px; line-height: 1.5;
        font-family: inherit; transition: border-color .15s;
        overflow-y: auto;
    }
    #krt-chat-input:focus { border-color: #4263eb; }
    #krt-chat-input::placeholder { color: #9ca3af; }
    #krt-chat-send {
        width: 38px; height: 38px; border-radius: 10px;
        background: #4263eb; color: #fff; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.1rem; flex-shrink: 0; transition: background .15s;
    }
    #krt-chat-send:hover:not(:disabled) { background: #3451c7; }
    #krt-chat-send:disabled { background: #cbd5e1; cursor: not-allowed; }

    /* ── Üres konfig figyelmeztetés ── */
    #krt-no-key-banner {
        background: #fff8e1; border-top: 1px solid #fde68a;
        padding: 8px 14px; font-size: .8rem; color: #92400e;
        text-align: center; display: none; flex-shrink: 0;
    }

    /* ── Aladár gondolatfelhő figyelemfelhívó ── */
    #krt-thought-bubble {
        position: fixed; bottom: 92px; right: 8px; z-index: 9992;
        background: #fff; border: 2px solid #4263eb; border-radius: 18px;
        padding: 10px 16px; font-size: .875rem; font-weight: 600; color: #1e293b;
        white-space: nowrap; cursor: pointer; user-select: none;
        box-shadow: 0 4px 20px rgba(66,99,235,.28);
        opacity: 0; transform: translateY(10px) scale(.9); pointer-events: none;
        transition: opacity .35s ease, transform .35s ease;
    }
    #krt-thought-bubble.krt-thought-visible {
        opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;
    }
    #krt-thought-bubble:hover { background: #f0f4ff; }
    /* Gondolatfelhő farok – 3 csökkenő kör */
    #krt-thought-bubble::after {
        content: ''; position: absolute;
        bottom: -11px; right: 22px;
        width: 9px; height: 9px;
        background: #4263eb; border-radius: 50%;
        box-shadow: 3px 13px 0 -2px #4263eb, 5px 24px 0 -3px #4263eb;
    }

    /* ── Robot integetés (gomb) ── */
    @keyframes krtBtnFloat {
        0%,100% { box-shadow: 0 4px 16px rgba(66,99,235,.45); transform: scale(1); }
        50%      { box-shadow: 0 8px 28px rgba(66,99,235,.65); transform: scale(1.1) translateY(-3px); }
    }
    @keyframes krtIconWave {
        0%,100% { transform: rotate(0deg); }
        25%     { transform: rotate(-22deg); }
        75%     { transform: rotate(22deg); }
    }
    #krt-chat-btn.krt-wave { animation: krtBtnFloat 1s ease-in-out infinite; }
    #krt-chat-btn.krt-wave i { display: inline-block; animation: krtIconWave .8s ease-in-out infinite; }

    /* ── Mobil (≤ 600px) ── */
    @media (max-width: 600px) {
        #krt-chat-window {
            width: 100vw; max-height: 100dvh;
            bottom: 0; right: 0; border-radius: 16px 16px 0 0;
        }
        #krt-chat-btn { bottom: 16px; right: 16px; }
        #krt-chat-messages { max-height: calc(100dvh - 180px); }
    }
    `;

    // ── 5. HTML STRUKTÚRA ────────────────────────────────────────────────────
    function buildWidget() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'krt-chat-root';
        root.innerHTML = `
        <!-- Aladár gondolatfelhő -->
        <div id="krt-thought-bubble" role="button" aria-label="Aladár megnyitása" tabindex="0"></div>

        <!-- Lebegő gomb -->
        <button id="krt-chat-btn" title="Aladár AI Segítő megnyitása" aria-label="Aladár AI Segítő">
            <i class="ti ti-message-chatbot"></i>
            <span class="krt-notif" id="krt-notif"></span>
        </button>

        <!-- Chat ablak -->
        <div id="krt-chat-window" role="dialog" aria-label="Aladár AI Segítő">
            <!-- Fejléc -->
            <div id="krt-chat-header">
                <div class="krt-avatar"><i class="ti ti-robot"></i></div>
                <div class="krt-title">
                    <strong>Aladár</strong>
                    <small>AI Segítő &nbsp;·&nbsp; Kartotéka</small>
                </div>
                <button id="krt-chat-close" title="Bezárás" aria-label="Chat bezárása">
                    <i class="ti ti-x"></i>
                </button>
            </div>

            <!-- Üzenetek területe -->
            <div id="krt-chat-messages" role="log" aria-live="polite">
                <div id="krt-typing">
                    <span></span><span></span><span></span>
                </div>
            </div>

            <!-- API kulcs hiány banner -->
            <div id="krt-no-key-banner">
                ⚠️ Az AI Segítő aktiválásához API kulcs szükséges az <code>ai_config.js</code> fájlban.
            </div>

            <!-- Bevitel -->
            <div id="krt-chat-footer">
                <textarea id="krt-chat-input"
                    placeholder="Írja be kérdését… (Enter = küld)"
                    rows="1" aria-label="Üzenet írása"></textarea>
                <button id="krt-chat-send" title="Küldés" aria-label="Küldés" disabled>
                    <i class="ti ti-send"></i>
                </button>
            </div>
        </div>`;

        document.body.appendChild(root);
    }

    // ── 6. SEGÉDFÜGGVÉNYEK ───────────────────────────────────────────────────

    /** Egyszerű Markdown → HTML (bold, lista, kódblokk, sortörés) */
    function mdToHtml(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/`([^`]+)`/g, '<code style="background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:.85em;">$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/(?:^|\n)[•\-\*] (.+)/g, (_, item) => `<li>${item.trim()}</li>`)
            .replace(/(<li>[\s\S]*?<\/li>)+/g, match => `<ul>${match}</ul>`)
            .replace(/\n{2,}/g, '</p><p style="margin:.4em 0">')
            .replace(/\n/g, '<br>');
    }

    function timeNow() {
        return new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    }

    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 90) + 'px';
    }

    // ── 7. ÜZENET MEGJELENÍTÉS ───────────────────────────────────────────────
    function appendMessage(role, text) {
        const messages = document.getElementById('krt-chat-messages');
        const typing   = document.getElementById('krt-typing');

        const wrap   = document.createElement('div');
        wrap.className = `krt-msg krt-msg-${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'krt-bubble';
        bubble.innerHTML = role === 'ai'
            ? `<p style="margin:0">${mdToHtml(text)}</p>`
            : mdToHtml(text);

        const time = document.createElement('span');
        time.className   = 'krt-bubble-time';
        time.textContent = timeNow();

        wrap.appendChild(bubble);
        wrap.appendChild(time);
        messages.insertBefore(wrap, typing);
        messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
        document.getElementById('krt-typing').classList.add('krt-show');
        document.getElementById('krt-chat-messages').scrollTop = 9999;
    }
    function hideTyping() {
        document.getElementById('krt-typing').classList.remove('krt-show');
    }

    // ── 8. API HÍVÁS (egyetlen provider + modell, OpenAI-kompatibilis) ─────────
    async function callProvider(userText, endpoint, apiKey, model) {
        const cfg = typeof AI_CONFIG !== 'undefined' ? AI_CONFIG : {};
        const maxHist = cfg.maxHistoryMessages || 10;

        // Az előzmények másolata (ne a globálist módosítsuk sikertelen hívásnál)
        const history = conversationHistory.slice(-maxHist);

        const messages = [
            { role: 'system', content: buildSystemPrompt(pastorFirstName) },
            ...history,
            { role: 'user', content: userText }
        ];

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({
                model:      model,
                max_tokens: cfg.maxTokens || 900,
                messages:   messages
            })
        });

        // Hibaállapot: dobja el a státuszkóddal együtt
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const e   = new Error(err?.error?.message || `HTTP ${response.status}`);
            e.status  = response.status;
            throw e;
        }

        const data   = await response.json();

        // Néhány modell hibát küld 200-as válaszban
        if (data?.error) {
            const e = new Error(data.error.message || 'API hiba a válaszban');
            e.status = data.error.code || 500;
            throw e;
        }

        const content = data?.choices?.[0]?.message?.content;
        if (!content || content.trim() === '') {
            console.warn('[KRT AI] Üres válasz – teljes adat:', JSON.stringify(data));
            // Üres tartalom → próbáljuk a következő kulccsal/modellel
            const e = new Error('Üres válasz a modelltől');
            e.status = 204;
            throw e;
        }
        return content.trim();
    }

    // ── 9. FALLBACK HÍVÁS (provider × modell kombináció próba) ──────────────
    async function callWithFallback(userText) {
        const providers = getProviders();
        if (providers.length === 0) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });

        for (let pi = activeProviderIndex; pi < providers.length; pi++) {
            const prov   = providers[pi];
            const models = Array.isArray(prov.models) && prov.models.length > 0
                ? prov.models : ['minimax/minimax-m2.5:free'];

            for (let mi = 0; mi < models.length; mi++) {
                try {
                    const aiText = await callProvider(userText, prov.endpoint, prov.apiKey, models[mi]);
                    activeProviderIndex = pi;
                    conversationHistory.push({ role: 'user',      content: userText });
                    conversationHistory.push({ role: 'assistant', content: aiText   });
                    saveSession();
                    return aiText;
                } catch (err) {
                    const isEmptyOrMissing = err.status === 204 || err.status === 404;
                    const isCredits        = err.status === 402 || err.status === 429;
                    const isNetwork        = !err.status;

                    if (isEmptyOrMissing && mi + 1 < models.length) {
                        // Üres/hiányzó modell → következő modell, ugyanaz a provider
                        console.warn(`[KRT AI] Modell sikertelen (${prov.name}): ${models[mi]} (${err.status}), váltás...`);
                        continue;
                    }
                    if ((isEmptyOrMissing || isCredits || isNetwork) && pi + 1 < providers.length) {
                        // Keret elfogy / hálózat hiba / minden modell kimerült → következő provider
                        console.warn(`[KRT AI] Provider sikertelen: ${prov.name} (${err.status || err.message}), következő provider...`);
                        activeProviderIndex = pi + 1;
                        break; // belső ciklus vége → külső next
                    }
                    // 401 (érvénytelen kulcs) vagy nem kezelhető → azonnal dob
                    throw err;
                }
            }
        }

        throw Object.assign(new Error('ALL_KEYS_EXHAUSTED'), { code: 'ALL_KEYS_EXHAUSTED' });
    }

    // ── 10. KÉRDÉS OSZTÁLYOZÓ (helyi, API nélkül) ────────────────────────────
    const SYSTEM_KEYWORDS = [
        // Modulok
        'tagnyilvántartás','tagnyilvantartas','tag','tagok','tag-lista','taglista',
        'anyakönyv','anyakonyv','keresztelés','kereszteles','konfirmáció','konfirmacio',
        'esketés','esketes','temetés','temetes','születés','szuletes','halálozás','halatozas',
        'pénzügy','penzugy','bevétel','bevetel','kiadás','kiadas','kassza','pénztár','penztár',
        'leltár','leltar','vagyon','vagyonleltár','eszköz','eszkoz','berendezés','berendezés',
        'munkanapló','munkanapl','napló','naplo','esemény','esemeny',
        'iktatás','iktatas','iktató','iktato','irat','iratozás',
        'család','csaladfak','famílie','familiak','hozzátartozó',
        'felhasználó','felhasznalo','szerepkör','szerepkor','jogosultság','jogosultsag',
        'gyülekezet','gyulekezet','gyülekezeti','gyulekezetj',
        'bejelentkezés','bejelentkezes','jelszó','jelszo','kilépés','kilepés',
        // Technikai
        'hiba','hibaüzenet','hibauzenet','nem működik','nem mukodik','nem jelenik','eltűnt','eltunt',
        'mentés','mentes','feltöltés','feltoltes','importál','import','exportál','export',
        'nyomtat','nyomtatás','pdf','excel','xlsx',
        'kereső','kereso','szűrő','szuro','szűrés','szures',
        'adat','adatok','adatbázis','adatbazis','táblázat','tablazat',
        'telefon','e-mail','email','cím','lakcím','lakcim','kontakt',
        'megjegyzés','megjegyzes','megjegyzést',
        'hogyan','hol találom','hol van','mit jelent','mire való','mire valo',
        'lehet-e','lehet e','lehetséges','lehetseg','lehet azt','miért','miert',
        'beállítás','beallitas','konfiguráció','konfiguracio','mentési','mentesi',
        'kartotéka','kartoteka','rendszer','modul','oldal','menü','menu',
        'szinkron','frissítés','frissites','frissül',
        'qr','vonalkód','vonalkod','szkennelés','szkennel',
    ];

    const GREETING_PATTERNS = [
        /^(szia|helló|hello|jó\s*napot|jónapot|üdv|üdvözlöm|üdvözlet|szervusz|szervusz|hey|hi)[!.,\s]*$/i,
        /^(köszönöm|köszi|kösz|köszön|thx|thank)[!.,\s]*/i,
        /^(viszlát|viszontlátásra|bye|jó\s*éjt|jóéjt|jó\s*estét)[!.,\s]*$/i,
        /^(ok|oké|rendben|értem|aha|igen|nem)[!.,\s]*$/i,
    ];

    function classifyQuestion(text) {
        const t = text.trim().toLowerCase();

        // Üdvözlés / köszönés / rövid social üzenet
        for (const pat of GREETING_PATTERNS) {
            if (pat.test(t)) return 'greeting';
        }

        // Nagyon rövid (≤3 szó) → valószínűleg rendszerkérdés, engedjük át
        const wordCount = t.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount <= 3) return 'system';

        // Rendszer-kulcsszó egyezés
        for (const kw of SYSTEM_KEYWORDS) {
            if (t.includes(kw)) return 'system';
        }

        // Nincs találat → témán kívüli
        return 'offtopic';
    }

    // ── 11. ÜZENET KÜLDÉSE ───────────────────────────────────────────────────
    async function sendMessage() {
        const input   = document.getElementById('krt-chat-input');
        const sendBtn = document.getElementById('krt-chat-send');
        const text    = input.value.trim();

        if (!text || isLoading) return;

        // Rate limit
        const cfg = typeof AI_CONFIG !== 'undefined' ? AI_CONFIG : {};
        const now = Date.now();
        if (now - lastSentTime < (cfg.rateLimit || 2500)) return;
        lastSentTime = now;

        // API kulcs ellenőrzés
        if (!hasAnyProvider()) {
            appendMessage('ai', '⚠️ Az AI Segítő nincs aktiválva. Kérjük adja meg az API kulcsot az **ai_config.js** fájlban.');
            return;
        }

        isLoading = true;
        sendBtn.disabled = true;
        input.value = '';
        input.style.height = 'auto';

        appendMessage('user', text);

        // Helyi osztályozás – minimalizálja az API hívásokat
        const category = classifyQuestion(text);

        if (category === 'greeting') {
            const greetReplies = [
                '😊 Üdvözlöm! Hogyan segíthetek a Kartotéka rendszerrel kapcsolatban?',
                '🙏 Szívesen! Ha van Kartotéka-kérdése, bátran kérdezzen!',
                '👋 Jó napot! Kartotéka rendszerrel kapcsolatos kérdésekben állok rendelkezésére.',
            ];
            const pick = greetReplies[Math.floor(Math.random() * greetReplies.length)];
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: pick });
            saveSession();
            isLoading = false;
            sendBtn.disabled = false;
            input.focus();
            appendMessage('ai', pick);
            return;
        }

        if (category === 'offtopic') {
            const offMsg = '🤖 Én csak a **Kartotéka rendszerrel** kapcsolatos kérdésekben tudok segíteni (tagnyilvántartás, anyakönyv, pénzügy, leltár, stb.).\n\nEz a kérdés nem tartozik a rendszer témakörébe – kérem, keressen rá más felületen (pl. Google, ChatGPT).';
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: offMsg });
            saveSession();
            isLoading = false;
            sendBtn.disabled = false;
            input.focus();
            appendMessage('ai', offMsg);
            return;
        }

        // Rendszerkérdés → API hívás
        showTyping();

        try {
            const reply = await callWithFallback(text);
            hideTyping();
            appendMessage('ai', reply);
        } catch (err) {
            hideTyping();
            let errMsg = '⚠️ Hiba történt a kapcsolódás során.';

            if (err.code === 'NO_KEY') {
                errMsg = '🔑 Nincs megadva API kulcs. Kérjük töltse ki az **ai_config.js** fájlt.';
            } else if (err.code === 'ALL_KEYS_EXHAUSTED') {
                errMsg = '💳 Minden API kulcs ingyenes kerete elfogyott. Kérjük adjon meg új kulcsot az **ai_config.js** fájlban, vagy töltse fel a krediteket az openrouter.ai oldalon.';
            } else if (err.status === 404) {
                const m = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.model) || '';
                errMsg = `🤖 A modell nem található: \`${m}\`\n\nKérjük nyissa meg az **openrouter.ai/models** oldalt, szűrjön "Free" modellekre, és másolja be a modell azonosítóját az **ai_config.js** fájl \`model\` mezőjébe.`;
            } else if (err.status === 401 || (err.message && err.message.toLowerCase().includes('auth'))) {
                errMsg = '🔑 Érvénytelen API kulcs. Kérjük ellenőrizze az **ai_config.js** fájlt.';
            } else if (err.status === 402) {
                errMsg = '💳 Az OpenRouter keret elfogyott. Töltse fel a krediteket az **openrouter.ai** oldalon, vagy adjon meg tartalék kulcsot.';
            } else if (err.status === 429) {
                errMsg = '⏳ Túl sok kérés – kérjük várjon 30 másodpercet, majd próbálja újra.';
            } else if (!navigator.onLine) {
                errMsg = '🌐 Nincs internetkapcsolat. Csatlakozzon a hálózathoz, majd próbálja újra.';
            } else {
                // Ismeretlen / CORS / hálózati hiba – mutassuk a nyers hibaüzenetet
                const detail = err.message || 'ismeretlen hiba';
                errMsg = `⚠️ Kapcsolódási hiba: _${detail}_\n\nLehetséges okok: érvénytelen API kulcs, CORS blokkolás, vagy a modell nem elérhető. Nyissa meg a böngésző konzolt (F12 → Console) a részletekért.`;
            }

            appendMessage('ai', errMsg);
            console.error('[KRT AI] Hiba részletei:', { message: err.message, status: err.status, code: err.code, err });
        } finally {
            isLoading = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // ── 12. ABLAK MEGNYITÁS / ZÁRÁS ──────────────────────────────────────────
    async function openChat() {
        hideAttentionAnimation();
        clearTimeout(attentionTimer);
        isOpen = true;
        document.getElementById('krt-chat-window').classList.add('krt-open');
        document.getElementById('krt-notif').style.display = 'none';
        saveSession();

        if (!hasGreeted) {
            hasGreeted = true;
            // Keresztnév lekérése (ha még nem volt meg)
            if (!pastorFirstName) {
                pastorFirstName = await fetchPastorFirstName();
            }
            const nev = pastorFirstName || 'Tiszteletes';
            if (!hasAnyProvider()) {
                document.getElementById('krt-no-key-banner').style.display = 'block';
                appendMessage('ai', `🙏 Üdvözlöm, ${nev}!\n\n**Aladár** vagyok, a Kartotéka AI segítője. Az aktiváláshoz kérjük adja meg az API kulcsot az \`ai_config.js\` fájlban.\n\n💡 Segítségért olvassa el a Használati Útmutatót.`);
            } else {
                appendMessage('ai', `🙏 Üdvözlöm, ${nev}!\n\n**Aladár** vagyok, a Kartotéka beépített AI segítője — örömmel állok rendelkezésére a rendszer használatával kapcsolatos kérdésekben.\n\n💬 Miben segíthetek Önnek?`);
            }
        }

        setTimeout(() => document.getElementById('krt-chat-input').focus(), 250);
    }

    function closeChat() {
        isOpen = false;
        document.getElementById('krt-chat-window').classList.remove('krt-open');
        saveSession();
    }

    // ── 11b. SESSION MEGŐRZÉS (lapváltáskor) ─────────────────────────────────

    const SESSION_KEY_HIST = 'krt_aladar_history';
    const SESSION_KEY_OPEN = 'krt_aladar_open';
    const SESSION_KEY_NAME = 'krt_aladar_pastor';

    /** Elmenti az aktuális állapotot sessionStorage-ba */
    function saveSession() {
        try {
            sessionStorage.setItem(SESSION_KEY_HIST, JSON.stringify(conversationHistory.slice(-30)));
            sessionStorage.setItem(SESSION_KEY_OPEN, isOpen ? '1' : '0');
            if (pastorFirstName) sessionStorage.setItem(SESSION_KEY_NAME, pastorFirstName);
        } catch(_) {}
    }

    /** Visszatölti az előző állapotot. Visszatér: volt-e nyitva a chat. */
    function loadSession() {
        try {
            const h = sessionStorage.getItem(SESSION_KEY_HIST);
            if (h) conversationHistory = JSON.parse(h);
            const savedName = sessionStorage.getItem(SESSION_KEY_NAME);
            if (savedName) pastorFirstName = savedName;
            return sessionStorage.getItem(SESSION_KEY_OPEN) === '1';
        } catch(_) { return false; }
    }

    /** Visszaállítja az előzményeket a chat UI-ba */
    function restoreMessagesToUI() {
        conversationHistory.forEach(msg => {
            if (msg.role === 'user')      appendMessage('user', msg.content);
            else if (msg.role === 'assistant') appendMessage('ai', msg.content);
        });
    }

    // ── 12. ESEMÉNYKEZELŐK ───────────────────────────────────────────────────
    // ── ALADÁR FIGYELEMFELHÍVÓ ────────────────────────────────────────────────
    // ── GONDOLATFELHŐ KÖZÖS MEGJELENÍTŐ ─────────────────────────────────────
    const ATTENTION_STORE_KEY = 'krt_aladar_attention_ts';
    const ATTENTION_INTERVAL  = 3_600_000;  // 1 óra ms-ban
    let   attentionTimer      = null;
    let   attentionHideTimer  = null;

    // Munkamenet mérföldkövek (sessionStorage – lapnav. közt megmarad, zárásnál törlődik)
    const SS_SESSION_START = 'krt_aladar_session_start';
    const SS_SHOWN_ENTRY   = 'krt_aladar_shown_entry';
    const SS_SHOWN_1H      = 'krt_aladar_shown_1h';
    const SS_SHOWN_2H      = 'krt_aladar_shown_2h';

    /** Általános buborék megjelenítő – minden animáció ezt hívja */
    function showBubble(text, durationMs) {
        clearTimeout(attentionHideTimer);
        const bubble = document.getElementById('krt-thought-bubble');
        const btn    = document.getElementById('krt-chat-btn');
        if (!bubble || !btn) return;

        bubble.textContent = text;
        bubble.classList.add('krt-thought-visible');
        btn.classList.add('krt-wave');
        btn.classList.remove('krt-pulse');

        attentionHideTimer = setTimeout(hideAttentionAnimation, durationMs || 10_000);
    }

    function hideAttentionAnimation() {
        clearTimeout(attentionHideTimer);
        const bubble = document.getElementById('krt-thought-bubble');
        const btn    = document.getElementById('krt-chat-btn');
        if (bubble) bubble.classList.remove('krt-thought-visible');
        if (btn)    btn.classList.remove('krt-wave');
    }

    function shouldShowAttention() {
        const last = parseInt(localStorage.getItem(ATTENTION_STORE_KEY) || '0', 10);
        return (Date.now() - last) >= ATTENTION_INTERVAL;
    }

    /** "Miben segíthetek?" – 3 perces inaktivitás után */
    function showAttentionAnimation() {
        if (isOpen) return;
        const name = pastorFirstName || 'Tiszteletes';
        showBubble(`Miben segíthetek, ${name}? 💬`, 10_000);
        localStorage.setItem(ATTENTION_STORE_KEY, String(Date.now()));
    }

    /** Belépési üdvözlés – 10 másodperccel az első megnyitás után */
    function showEntryGreeting() {
        if (sessionStorage.getItem(SS_SHOWN_ENTRY)) return;
        sessionStorage.setItem(SS_SHOWN_ENTRY, '1');
        if (isOpen) return;
        const name = pastorFirstName || 'Tiszteletes';
        showBubble(
            `🙏 Üdvözlöm, ${name}! Jó munkát kívánok! Ha bármivel elakad, én itt vagyok. 😊`,
            10_000
        );
    }

    /** 1 órás mérföldkő – bátorítás */
    function showMilestone1h() {
        if (sessionStorage.getItem(SS_SHOWN_1H)) return;
        sessionStorage.setItem(SS_SHOWN_1H, '1');
        if (isOpen) return;
        const name = pastorFirstName || 'Tiszteletes';
        showBubble(
            `☕ Egy óra telt el, ${name}! Szép munka – kívánom, hogy minden zökkenőmentesen haladjon! 💪`,
            10_000
        );
    }

    /** 2 órás mérföldkő – elismerés */
    function showMilestone2h() {
        if (sessionStorage.getItem(SS_SHOWN_2H)) return;
        sessionStorage.setItem(SS_SHOWN_2H, '1');
        if (isOpen) return;
        const name = pastorFirstName || 'Tiszteletes';
        showBubble(
            `🌟 Már két órája dolgozik, ${name}! Csodálatos elkötelezettség – biztos vagyok benne, hogy az egyházközségnél minden a legjobb kezekben van! 🙏`,
            10_000
        );
    }

    function bindEvents() {
        document.getElementById('krt-chat-btn').addEventListener('click', () => {
            isOpen ? closeChat() : openChat();
        });
        // Gondolatfelhőre kattintva is nyisson chat-et
        document.getElementById('krt-thought-bubble').addEventListener('click', () => {
            hideAttentionAnimation();
            openChat();
        });
        document.getElementById('krt-chat-close').addEventListener('click', closeChat);

        const input   = document.getElementById('krt-chat-input');
        const sendBtn = document.getElementById('krt-chat-send');

        input.addEventListener('input', () => {
            autoResize(input);
            sendBtn.disabled = input.value.trim().length === 0;
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) closeChat();
        });
    }

    // ── 13. INICIALIZÁLÁS ────────────────────────────────────────────────────
    function init() {
        buildWidget();
        bindEvents();

        // Előző session visszatöltése
        const wasOpen = loadSession();

        if (conversationHistory.length > 0) {
            hasGreeted = true;          // ne köszönjön újra
            restoreMessagesToUI();      // üzenetek visszarakása a DOM-ba
        }

        // Keresztnév előre lekérése – gondolatfelhőhöz kell (3 perc előtt meglesz)
        if (!pastorFirstName) {
            fetchPastorFirstName()
                .then(name => { if (name) { pastorFirstName = name; saveSession(); } })
                .catch(() => {});
        }

        // ── Munkamenet időmérés ──────────────────────────────────────────────
        // Lapnavigáció esetén a session megmarad, ezért az eltelt időt újraszámoljuk
        const nowMs = Date.now();
        let sessionStart = parseInt(sessionStorage.getItem(SS_SESSION_START) || '0', 10);
        if (!sessionStart) {
            sessionStart = nowMs;
            sessionStorage.setItem(SS_SESSION_START, String(sessionStart));
        }
        const elapsed = nowMs - sessionStart;

        // Belépési üdvözlés (10 mp-cel az első oldalnyitás után, egyszer)
        if (!sessionStorage.getItem(SS_SHOWN_ENTRY)) {
            setTimeout(showEntryGreeting, Math.max(0, 10_000 - elapsed));
        }
        // 1 órás mérföldkő
        if (!sessionStorage.getItem(SS_SHOWN_1H)) {
            setTimeout(showMilestone1h, Math.max(0, 3_600_000 - elapsed));
        }
        // 2 órás mérföldkő
        if (!sessionStorage.getItem(SS_SHOWN_2H)) {
            setTimeout(showMilestone2h, Math.max(0, 7_200_000 - elapsed));
        }

        if (wasOpen) {
            // Chat volt nyitva → azonnal nyissuk meg (üdvözlés nélkül)
            isOpen = true;
            document.getElementById('krt-chat-window').classList.add('krt-open');
            document.getElementById('krt-notif').style.display = 'none';
            setTimeout(() => document.getElementById('krt-chat-input').focus(), 250);
        } else {
            // Chat zárt volt → pulzálás 3 mp után (gyors jelzés)
            setTimeout(() => {
                const btn = document.getElementById('krt-chat-btn');
                if (btn && !isOpen) {
                    btn.classList.add('krt-pulse');
                    document.getElementById('krt-notif').style.display = 'block';
                }
            }, 3000);

            // Aladár figyelemfelhívó animáció 3 perc után (csak 1. belépéskor és 1 óránként)
            if (shouldShowAttention()) {
                attentionTimer = setTimeout(showAttentionAnimation, 3 * 60 * 1000);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
