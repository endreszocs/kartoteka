/**
 * Pénzügy súgó letölthető PDF-ek.
 *
 * Három dokumentum:
 *   1. Pénzügyi gyorsreferencia — napi munka áttekintése
 *   2. Nyugtatömb kezelés — kerületi nyugtatömbök életciklusa
 *   3. Év végi zárás checklist — számadás véglegesítéshez
 *
 * A HTML-t a print-engine-v2 generálja PDF-fé a kliens oldalon.
 */

export interface GuidePdf {
  id: 'gyorsreferencia' | 'nyugtatomb' | 'evvegi'
  title: string
  subtitle: string
  description: string
  filename: string
}

export const GUIDE_PDFS: GuidePdf[] = [
  {
    id: 'gyorsreferencia',
    title: 'Pénzügyi gyorsreferencia',
    subtitle: 'Napi munka egy oldalon',
    description:
      'Hova mit rögzíts (bevétel, kiadás, belső mozgás), közös gombok, legfontosabb számadási célok. Ideális kezdéshez vagy új lelkésznek.',
    filename: 'Penzugy_gyorsreferencia.pdf',
  },
  {
    id: 'nyugtatomb',
    title: 'Nyugtatömb kezelés',
    subtitle: 'Gyakorlati útmutató',
    description:
      'A kerülettől vett nyugtatömbök teljes életciklusa: átvétel, rögzítés, kiállítás, éves kimutatás. A lelkész napi munkájához.',
    filename: 'Nyugtatomb_kezeles.pdf',
  },
  {
    id: 'evvegi',
    title: 'Év végi zárás checklist',
    subtitle: 'Számadás véglegesítés előtt',
    description:
      'Ellenőrizendő pontok a számadás lezárása előtt: hiányzó bizonylatok, belső mozgások, kategóriák. Javítási kérelem folyamata is.',
    filename: 'Evvegi_zaras_checklist.pdf',
  },
]

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function wrap(title: string, content: string): string {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1f2937; background: #fff; margin: 0; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 20pt; color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 6px; margin: 0 0 6px 0; }
  h1 .subtitle { display: block; font-size: 11pt; font-style: italic; color: #64748b; margin-top: 4px; font-weight: normal; }
  h2 { font-size: 13pt; color: #0f172a; margin-top: 22px; margin-bottom: 8px; border-left: 3px solid #0f766e; padding-left: 10px; }
  h3 { font-size: 11pt; color: #334155; margin-top: 14px; margin-bottom: 4px; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  .lead { font-size: 11pt; color: #475569; font-style: italic; margin-bottom: 14px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin: 8px 0; background: #f8fafc; }
  .card-emerald { border-color: #a7f3d0; background: #ecfdf5; }
  .card-amber { border-color: #fcd34d; background: #fffbeb; }
  .card-rose { border-color: #fecaca; background: #fff1f2; }
  .card-blue { border-color: #bfdbfe; background: #eff6ff; }
  .card-title { font-weight: bold; color: #0f172a; margin-bottom: 4px; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 10px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; font-weight: bold; }
  code { background: #f1f5f9; padding: 2px 5px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 10pt; color: #0f172a; }
  .checkbox { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #64748b; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; text-align: center; font-style: italic; }
  .tip { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 0 6px 6px 0; margin: 10px 0; font-size: 10pt; }
  .tip-label { font-weight: bold; color: #b45309; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.5px; margin-bottom: 3px; }
  strong { color: #0f172a; }
</style>
</head><body>${content}
<div class="footer">
  Kartotéka — Erdélyi Református Egyházkerület · készült ${esc(new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }))}
</div>
</body></html>`
}

// ─────────────────────────────────────────────────────────────────
// 1. Pénzügyi gyorsreferencia
// ─────────────────────────────────────────────────────────────────

function buildGyorsreferencia(): string {
  const content = `
    <h1>Pénzügyi gyorsreferencia<span class="subtitle">Napi munka egy oldalon — lelkészeknek</span></h1>

    <p class="lead">
      A Kartotéka pénzügyi modul a gyülekezet teljes havi és éves könyvelését kezeli.
      Ez az összefoglaló az alapfogalmakat és a leggyakoribb műveleteket mutatja be.
    </p>

    <h2>🏛️ Hol mit találsz?</h2>
    <table>
      <tr><th>Fül</th><th>Mit tartalmaz</th></tr>
      <tr><td><strong>Áttekintés</strong></td><td>Havi és éves KPI-k, grafikonok. Gyors rátekintés az állapotra.</td></tr>
      <tr><td><strong>Kassza</strong></td><td>Készpénzes bevételek és kiadások. Nyugtatömb kezelés. Nyomtatás.</td></tr>
      <tr><td><strong>Bank</strong></td><td>Banki tranzakciók bankszámlánként. BCR import, FX átértékelés.</td></tr>
      <tr><td><strong>Tranzakciók</strong></td><td>Teljes tranzakciólista (kassza + bank együtt), szűrőkkel.</td></tr>
      <tr><td><strong>Költségvetés</strong></td><td>Éves tervezés, 113 soros hivatalos formátum.</td></tr>
      <tr><td><strong>Számadás</strong></td><td>Terv vs. tény összevetés. Véglegesítés az egyházmegyének.</td></tr>
    </table>

    <h2>➕ Rögzítés gombok</h2>
    <div class="card card-emerald">
      <div class="card-title">+ Bevétel</div>
      Járulék, adomány, perselypénz, bérleti díj és minden pénzbeérkezés.
      Készpénz vagy banki átutalás — mindkettőt ugyanezen a gombon keresztül.
    </div>
    <div class="card card-rose">
      <div class="card-title">+ Kiadás</div>
      Lelkipásztor fizetés, rezsi, karbantartás, missziós támogatás stb.
      Bizonylat kötelező (nyugta / számla).
    </div>
    <div class="card card-blue">
      <div class="card-title">Decont</div>
      Költségtérítés bizonylatokkal (pl. utazás, szolgálati költség).
      A rendszer számolja az egyenleget az előlegtől.
    </div>

    <h2>🔄 Belső mozgás (Kassza ↔ Bank)</h2>
    <p>
      Amikor készpénzt viszel bankba, vagy bankból veszel ki készpénzt, az egy
      <strong>belső mozgás</strong>: egyszerre egy bevétel (ahol érkezik) és egy
      kiadás (ahonnan megy). A rendszer összekapcsolja őket.
    </p>
    <ul>
      <li>Kasszából bankba → <code>Bevétel</code> dialógban válaszd: „Letétel bankba"</li>
      <li>Bankból kasszába → <code>Kiadás</code> dialógban válaszd: „Pénzfelvétel bankból"</li>
    </ul>

    <h2>💰 Legfontosabb számadási célok (kódok)</h2>
    <table>
      <tr><th>Kód</th><th>Cím</th></tr>
      <tr><td><code>101.01</code></td><td>Egyházfenntartói járulék (a legfontosabb — ide a személy kötelező!)</td></tr>
      <tr><td><code>102</code></td><td>Adományok (hívektől, intézményektől)</td></tr>
      <tr><td><code>103</code></td><td>Perselypénz, ajándékok</td></tr>
      <tr><td><code>104</code></td><td>Bérbeadás, használati díjak</td></tr>
      <tr><td><code>201</code></td><td>Személyi kiadások (bér, járulékok)</td></tr>
      <tr><td><code>202</code></td><td>Dologi kiadások (rezsi, fogyóeszköz)</td></tr>
      <tr><td><code>203</code></td><td>Karbantartás, felújítás</td></tr>
    </table>

    <h2>🧾 Nyugta kiállítás</h2>
    <p>
      Készpénzes bevétel rögzítése után a sor végén halvány <strong>nyomtató ikon</strong>
      jelenik meg. Kattintásra a rendszer automatikusan kiállítja és nyomtatja a nyugtát
      a kerülettől kapott nyugtatömbből. Részletek: <em>Nyugtatömb kezelés PDF</em>.
    </p>

    <div class="tip">
      <div class="tip-label">💡 Tipp</div>
      A <strong>Tranzakciók</strong> fül a legjobb, ha egy adott partner vagy kategória
      minden tételét egyben akarod látni. Szűrd a keresésmezővel.
    </div>

    <h2>🖨️ Nyomtatás</h2>
    <p>
      A Pénzügy fülön fent található <strong>Nyomtatási központ</strong> gombbal a hivatalos
      román nyomtatványok készíthetők el: Registru Casa (kasszakönyv), Registru Banca,
      Registrul-Jurnal és Nyugtatömb kimutatás.
    </p>
  `
  return wrap('Pénzügyi gyorsreferencia', content)
}

// ─────────────────────────────────────────────────────────────────
// 2. Nyugtatömb kezelés
// ─────────────────────────────────────────────────────────────────

function buildNyugtatomb(): string {
  const content = `
    <h1>Nyugtatömb kezelés<span class="subtitle">Gyakorlati útmutató — a kerülettől a kiállításig</span></h1>

    <p class="lead">
      A Kartotéka automatikusan követi a kerülettől átvett nyugtatömbök életciklusát.
      Ez az útmutató végigvezet a teljes folyamaton.
    </p>

    <h2>📦 Mi a nyugtatömb?</h2>
    <p>
      A kerületi nyomda által készített, előre számozott nyugtatömb
      (Seria + nyomdai sorszám, pl. <code>EREKC24 0115356</code>).
      Tartalmaz 100 db nyugtát egymás után.
      Egyszerre <strong>csak egy aktív tömb</strong> lehet gyülekezetenként.
    </p>

    <h2>1️⃣ Átvétel</h2>
    <ol>
      <li>Az egyházmegye átadja a tömböt a lelkésznek.</li>
      <li>Ellenőrizd: seria, kezdő szám, záró szám, darabszám.</li>
      <li>Vedd le a vásárlás dátumát és árát (ha volt térítés).</li>
    </ol>

    <h2>2️⃣ Rögzítés a rendszerbe</h2>
    <p>
      <strong>Kassza fül</strong> → <strong>Nyugtatömbök panel</strong> → <strong>+ Új tömb</strong>
    </p>
    <div class="card">
      <div class="card-title">A wizard 6 kötelező mezője</div>
      <ul>
        <li><strong>Seria</strong> (pl. <code>EREKC24</code>)</li>
        <li><strong>Blokk azonosító</strong> (opcionális, pl. <code>23</code>)</li>
        <li><strong>Nyomdai kezdő szám</strong> (pl. <code>115356</code>)</li>
        <li><strong>Nyomdai záró szám</strong> (pl. <code>115455</code>)</li>
        <li><strong>Vásárlás dátuma</strong></li>
        <li><strong>Vásárlás ára</strong> (opcionális)</li>
      </ul>
      A rendszer ellenőrzi: nincs-e átfedés más tömbökkel, max. 100 db/tömb.
    </div>

    <h2>3️⃣ Nyugta kiállítása</h2>
    <p>
      Készpénzes bevétel rögzítése után a sor végén <strong>halvány nyomtató ikon</strong>
      jelenik meg. Kattintás → a rendszer:
    </p>
    <ol>
      <li>Lefoglalja a <strong>következő nyomdai számot</strong> az aktív tömbből.</li>
      <li>Lefoglalja a <strong>gyülekezeti saját számot</strong> (év elején 1-től).</li>
      <li>Rögzíti a nyugtát.</li>
      <li>Automatikusan nyomtat (A4 lap = 2 nyugta: átvevő + irattár).</li>
    </ol>

    <div class="tip">
      <div class="tip-label">💡 Tipp</div>
      Ha elfogy az aktív tömb, a rendszer automatikusan felajánlja, hogy
      rögzíts egy újat. Utána visszatér a félbehagyott nyugtához.
    </div>

    <h2>📊 Éves kimutatás</h2>
    <p>
      <strong>Pénzügy → Nyomtatási központ → Nyugtatömb kimutatás</strong>
    </p>
    <p>
      A Word-minta szerinti hivatalos kimutatás: sorszám, blokk, seria,
      nyomdai tartomány, dátumok, gyülekezeti saját sorszámok, felhasznált
      darabszám. Aláírási blokkokkal (Lelkipásztor, Gondnok, Pénztáros).
    </p>

    <h2>📦 Leltárba vétel</h2>
    <p>
      A nyugtatömbök a <strong>Leltár → Anyagraktár</strong> fülön is megjelennek,
      mint gyorsan fogyó készletek. Ott látszik: összes db, aktív tömbök,
      raktárkészlet (használatlan nyugták), és az összes tömb vásárlási értéke.
    </p>

    <h2>❓ Gyakori kérdések</h2>
    <h3>Mi van, ha elrontom a nyugtát?</h3>
    <p>
      A befizetést <strong>stornózd</strong> (ne töröld). A nyugta automatikusan
      sztornó-pecsétet kap a nyomtatványon, és a gyülekezeti saját sorszám
      nem lesz újra felhasználva.
    </p>

    <h3>Mi van, ha egyszerre több tömböt veszünk?</h3>
    <p>
      Rögzíts mindegyiket. A rendszer mindig a <strong>legkisebb kezdő
      számmal</strong> rendelkező aktív tömbből dolgozik — automatikusan vált
      a következőre, amint az aktuális kifogy.
    </p>

    <h3>Mi van, ha átmegyünk egy új évre?</h3>
    <p>
      A nyomdai sorszámozás folytatódik — az évváltás nem érinti a tömböt.
      A gyülekezeti saját sorszám viszont <strong>január 1-től 1-re vált vissza</strong>.
    </p>
  `
  return wrap('Nyugtatömb kezelés', content)
}

// ─────────────────────────────────────────────────────────────────
// 3. Év végi zárás checklist
// ─────────────────────────────────────────────────────────────────

function buildEvvegi(): string {
  const content = `
    <h1>Év végi zárás checklist<span class="subtitle">Számadás véglegesítés lépésről lépésre</span></h1>

    <p class="lead">
      Az év végi zárás a gyülekezet egyik legfontosabb pénzügyi művelete.
      Ezt a listát kezdd el december közepén, hogy januárban véglegesíthesd.
    </p>

    <h2>🔍 1. Hiánypótlás ellenőrzés</h2>
    <div class="card card-amber">
      <div class="card-title">A Kassza és Bank fülön a figyelmeztetések</div>
      <ul>
        <li><span class="checkbox"></span> Sárga jelzés: nincs költségvetési cél kiválasztva</li>
        <li><span class="checkbox"></span> Sárga jelzés: nincs személy/család (járulék esetén kötelező)</li>
        <li><span class="checkbox"></span> Piros jelzés: nyugtafigyelő — hiányzó vagy duplikált nyugtaszám</li>
      </ul>
      Minden sárga és piros jelet orvosolni kell a véglegesítés előtt.
    </div>

    <h2>🔄 2. Belső mozgások egyeztetése</h2>
    <ul>
      <li><span class="checkbox"></span> Minden kasszából-bankba pénzletétel rögzítve van</li>
      <li><span class="checkbox"></span> Minden bankból-kasszába pénzfelvétel rögzítve van</li>
      <li><span class="checkbox"></span> A Tranzakciók fülön a belső mozgás-szűrővel ellenőrizd: a bevétel és kiadás oldal <strong>ugyanannyi</strong>-e</li>
    </ul>

    <h2>💶 3. Havi banki egyeztetés</h2>
    <p>
      <strong>Bank fül</strong> → minden hónapra a banki kivonat záró egyenlegét
      hasonlítsd össze a rendszer záró egyenlegével.
    </p>
    <table>
      <tr><th>Hónap</th><th>Bank kivonat</th><th>Rendszer</th><th>Eltérés</th><th>Oka</th></tr>
      <tr><td>01</td><td>________</td><td>________</td><td>________</td><td>________________</td></tr>
      <tr><td>02</td><td>________</td><td>________</td><td>________</td><td>________________</td></tr>
      <tr><td>…</td><td>________</td><td>________</td><td>________</td><td>________________</td></tr>
      <tr><td>12</td><td>________</td><td>________</td><td>________</td><td>________________</td></tr>
    </table>

    <h2>💵 4. Készpénzes egyeztetés</h2>
    <ul>
      <li><span class="checkbox"></span> December 31-i kassza záró egyenleg fizikailag megszámolva</li>
      <li><span class="checkbox"></span> A rendszer kassza záró egyenlege <strong>egyezik</strong> a fizikai összeggel</li>
      <li><span class="checkbox"></span> Ha eltérés van → tételes átvizsgálás (melyik tétel maradt ki?)</li>
    </ul>

    <h2>📋 5. Nyugta ellenőrzés</h2>
    <ul>
      <li><span class="checkbox"></span> Minden aktív nyugtatömbből az év végén használt utolsó nyugta száma egyezik</li>
      <li><span class="checkbox"></span> Nincs ugrás vagy duplikáció a gyülekezeti saját sorszámokban</li>
      <li><span class="checkbox"></span> Sztornózott nyugták indoklása megfelelő</li>
    </ul>

    <h2>⚖️ 6. Terv vs Tény elemzés (Számadás fül)</h2>
    <p>
      Az „Élő számadási kép" dobozban láthatod:
    </p>
    <ul>
      <li><strong>Bevételi megvalósulás</strong>: a tervezett bevételhez képest hány %-ot hoztatok be</li>
      <li><strong>Kiadási megvalósulás</strong>: a tervezett kiadáshoz képest hány %-ot költöttetek</li>
    </ul>
    <p>
      <strong>Jelentős eltérést</strong> (pl. &gt; 20%) indokolni kell a presbitériumi
      ülésen. A jegyzőkönyvi számot és a tárgyalás dátumát a véglegesítéskor
      kérdezi a rendszer.
    </p>

    <h2>✅ 7. Véglegesítés</h2>
    <p>
      <strong>Számadás fül → Véglegesítés és beküldés</strong>
    </p>
    <ol>
      <li>Jegyzőkönyvi szám (opcionális, de ajánlott)</li>
      <li>Tárgyalás dátuma</li>
      <li>Megerősítés → az egyházmegye értesítést kap a csengőn</li>
      <li>A számadás zárolt: a tételek a továbbiakban nem szerkeszthetők</li>
    </ol>

    <div class="tip">
      <div class="tip-label">⚠️ Figyelem</div>
      Véglegesítés után a stornó, szerkesztés és új tétel rögzítése az érintett évre
      <strong>letiltva</strong>. Ha utólag hibát találsz → javítási kérelem kell az
      egyházmegyétől.
    </div>

    <h2>🔓 8. Javítási kérelem (ha szükséges)</h2>
    <p>
      <strong>Számadás fül → Javítási kérelem</strong>
    </p>
    <ol>
      <li>Fogalmazd meg röviden, miért szükséges a javítás.</li>
      <li>Az egyházmegyei admin látja a csengőben.</li>
      <li>Jóváhagyás után az évre újra lesz szerkesztés.</li>
      <li>A javítás után a számadást újra véglegesíteni kell.</li>
    </ol>

    <h2>🗂️ 9. Dokumentumtartás</h2>
    <ul>
      <li><span class="checkbox"></span> Kinyomtatott Registru Casa (kasszakönyv) — minden hónap</li>
      <li><span class="checkbox"></span> Kinyomtatott Registru Banca (banki könyv) — minden hónap, bankszámlánként</li>
      <li><span class="checkbox"></span> Kinyomtatott Számadás — teljes éves összevetés</li>
      <li><span class="checkbox"></span> Kinyomtatott Nyugtatömb kimutatás — éves lista</li>
      <li><span class="checkbox"></span> Eredeti bizonylatok (nyugta, számla) irattárban</li>
      <li><span class="checkbox"></span> Presbitériumi jegyzőkönyv (a véglegesítéshez)</li>
    </ul>

    <div class="tip">
      <div class="tip-label">💡 Tipp</div>
      A <strong>Nyomtatási központ</strong>-ban egyszerre kinyomtathatod az egész év
      havonkénti kasszakönyvét — minden hónap külön oldalra, éves pg. számozással.
    </div>
  `
  return wrap('Év végi zárás checklist', content)
}

// ─────────────────────────────────────────────────────────────────
// Fő belépési pont
// ─────────────────────────────────────────────────────────────────

export function buildGuidePdfHtml(id: GuidePdf['id']): string {
  switch (id) {
    case 'gyorsreferencia':
      return buildGyorsreferencia()
    case 'nyugtatomb':
      return buildNyugtatomb()
    case 'evvegi':
      return buildEvvegi()
  }
}

// ─────────────────────────────────────────────────────────────────
// Topic-szintű PDF (a Pénzügyi súgó egy konkrét témája)
// A súgó tetején tényleges 3 letölthető PDF lecserélése helyett
// minden topic kis nyomtató ikonnal rendelkezik: csak az adott
// rész nyomtatható.
// ─────────────────────────────────────────────────────────────────

export interface TopicPdfInput {
  label: string
  intro?: string
  whatItDoes?: string
  howItWorks?: Array<{ text: string; hint?: string }>
  tips?: Array<{ kind: 'tip' | 'warning'; text: string }>
  examples?: Array<{ situation: string; solution: string }>
  sectionLabel?: string
}

export function buildTopicPdfHtml(topic: TopicPdfInput): string {
  const esc = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  const intro = topic.intro
    ? `<p class="lead">${esc(topic.intro)}</p>`
    : ''

  const whatItDoes = topic.whatItDoes
    ? `<section><h2>Mire jó?</h2><p>${esc(topic.whatItDoes)}</p></section>`
    : ''

  const howItWorks = topic.howItWorks && topic.howItWorks.length > 0
    ? `<section><h2>Hogyan működik</h2><ol>
        ${topic.howItWorks
          .map(
            (s, i) => `<li><strong>${i + 1}.</strong> ${esc(s.text)}${
              s.hint ? `<div class="hint">💡 ${esc(s.hint)}</div>` : ''
            }</li>`,
          )
          .join('')}
      </ol></section>`
    : ''

  const tips = topic.tips && topic.tips.length > 0
    ? `<section>
        ${topic.tips
          .map(
            (t) =>
              `<div class="tip ${t.kind}">
                <div class="tip-label">${t.kind === 'warning' ? '⚠️ Figyelmeztetés' : '💡 Tipp'}</div>
                <div class="tip-body">${esc(t.text)}</div>
              </div>`,
          )
          .join('')}
      </section>`
    : ''

  const examples = topic.examples && topic.examples.length > 0
    ? `<section><h2>Példák</h2>
        ${topic.examples
          .map(
            (ex) =>
              `<div class="example">
                <div class="example-label">Helyzet</div>
                <p class="example-text">„${esc(ex.situation)}"</p>
                <div class="example-label solution">Megoldás</div>
                <p class="example-text">${esc(ex.solution)}</p>
              </div>`,
          )
          .join('')}
      </section>`
    : ''

  const content = `
    <h1>${esc(topic.label)}
      ${topic.sectionLabel ? `<span class="subtitle">${esc(topic.sectionLabel)}</span>` : ''}
    </h1>
    ${intro}
    ${whatItDoes}
    ${howItWorks}
    ${tips}
    ${examples}
  `

  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
<title>${esc(topic.label)} — Kartotéka Súgó</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1f2937; margin: 0; font-size: 11pt; line-height: 1.6; background: #fff; }
  h1 { font-size: 22pt; color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin: 0 0 6px; }
  h1 .subtitle { display: block; font-size: 11pt; font-style: italic; color: #64748b; margin-top: 6px; font-weight: normal; }
  h2 { font-size: 13pt; color: #0f172a; margin: 22px 0 8px; border-left: 4px solid #0f766e; padding-left: 12px; }
  p { margin: 6px 0; }
  .lead { font-size: 12pt; color: #475569; font-style: italic; margin: 12px 0 18px; }
  ol { padding-left: 22px; }
  ol li { margin: 8px 0; }
  .hint { font-size: 10pt; color: #0f766e; font-style: italic; margin-top: 3px; margin-left: 4px; }
  .tip { margin: 10px 0; padding: 10px 14px; border-radius: 8px; border-left: 4px solid; }
  .tip.tip { border-color: #0ea5e9; background: #f0f9ff; }
  .tip.warning { border-color: #f59e0b; background: #fffbeb; }
  .tip-label { font-weight: bold; text-transform: uppercase; font-size: 9pt; letter-spacing: 1px; margin-bottom: 3px; }
  .tip.tip .tip-label { color: #0284c7; }
  .tip.warning .tip-label { color: #b45309; }
  .tip-body { font-size: 10pt; color: #334155; }
  .example { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 14px; border-radius: 8px; margin: 10px 0; }
  .example-label { font-weight: bold; text-transform: uppercase; font-size: 9pt; letter-spacing: 1px; color: #64748b; margin-bottom: 2px; }
  .example-label.solution { color: #0f766e; margin-top: 8px; }
  .example-text { font-size: 10pt; margin: 2px 0; font-style: italic; color: #334155; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; text-align: center; font-style: italic; }
</style>
</head><body>
${content}
<div class="footer">Kartotéka — Erdélyi Református Egyházkerület · Pénzügyi súgó — ${new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body></html>`
}
