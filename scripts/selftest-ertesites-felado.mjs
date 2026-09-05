// selftest-ertesites-felado.mjs — az értesítések feladó-adatrétegének őrszemei (2026-09-05)
//
// ⛔ MI A KOCKÁZAT
//   Az `ertesitesek` tábla ~30 beszúró helye eddig mind máshogy írt: feladó
//   nélkül, a hibát eldobva vagy try/catch-ben elnyelve. A hírlevél markdown-
//   törzse nyersen jelent meg a csengőben. Egy későbbi refaktor mindhárom
//   javítást NÉMÁN visszaejtheti: (1) valaki visszaír egy közvetlen
//   `from('ertesitesek').insert(`-et — feladó és visszaesés nélkül; (2) a
//   sanitize-lépés kiesik a renderelőből — a hírlevél <script>-je lefut a
//   lelkész munkamenetében; (3) a renderelő kapuja kinyílik — a felhasználói
//   szabad szöveg (elutasítás indoklása) markdownon fut.
//
// ŐRSZEMEK
//   A1   forrás-őr: az apps/web alatt NINCS közvetlen from('ertesitesek').insert(
//        az ertesites-insert.ts-en kívül (kivétel-lista ÜRES)
//   A1n  negatív: egy visszaírt közvetlen insert-tel az őr BUKIK
//   B1–B7 renderUzenetHtml: `## cím` → <h2>; <script> és onerror kiszűrve; img
//        nincs; javascript: link nincs; **a** → <strong>; link rel/target;
//        class kiszűrve
//   B8   markdownSzoveg egysoros, jelek nélkül (a brief T2 példája)
//   B9n  negatív: sanitize NÉLKÜLI mutánson a <script> túléli → az őr BUKIK
//   C1–C8 feladoBontas: a 6 levezetett típus + oszlop-először + alapág
//   D1–D4 insertErtesites: hiányzó oszlop → visszaesés az oszlop nélkül;
//        nem-oszlop hiba → visszaadott error, NINCS ismétlés; feladó nélkül
//        levezetés + felado_levezetett=true; explicit feladó → false
//   E1–E4 forrás-őrök: broadcasts nem ír `'release' ? 'info'`-t; transfer nem
//        ír `user_id: null`-t; admin/actions support_reply; a renderelő hívása
//        az `uzenet_format === 'markdown'` kapu mögött
//   E2n/E4n negatív mutánsok

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText

const NOTIF_DIR = path.join(ROOT, 'apps/web/lib/notifications')
const olvas = (p) => fs.readFileSync(p, 'utf8')

/** Kommentek nélkül — hogy egy kommentbe írt minta ne tévessze meg az őrt. */
function kommentNelkul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((s) => {
      const tr = s.trim()
      return !tr.startsWith('//') && !tr.startsWith('*')
    })
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// A) FORRÁS-ŐR: közvetlen insert az ertesitesek táblába
// ─────────────────────────────────────────────────────────────────────────────

const KOZVETLEN_INSERT = /\.from\(\s*['"]ertesitesek['"]\s*\)\s*\.(?:insert|upsert)\s*\(/

/** Az apps/web alatti .ts/.tsx fájlok (node_modules és .next nélkül). */
function webForrasok() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(path.join(ROOT, 'apps/web'))
  return out
}

/** Az egyetlen engedett hely. A kivétel-lista ezen kívül ÜRES — szándékosan. */
const ENGEDETT = new Set([path.join(NOTIF_DIR, 'ertesites-insert.ts')])

function kozvetlenInsertek(fajlok) {
  const talalatok = []
  for (const [p, src] of fajlok) {
    if (ENGEDETT.has(p)) continue
    if (KOZVETLEN_INSERT.test(kommentNelkul(src))) talalatok.push(path.relative(ROOT, p))
  }
  return talalatok
}

{
  const fajlok = webForrasok().map((p) => [p, olvas(p)])
  const talalatok = kozvetlenInsertek(fajlok)
  assert(
    talalatok.length === 0,
    `A1: az apps/web alatt nincs közvetlen from('ertesitesek').insert( az ertesites-insert.ts-en kívül${
      talalatok.length ? ` — talált: ${talalatok.join(', ')}` : ''
    }`,
  )
  // NEGATÍV: egy visszaírt közvetlen insert (a régi tva-actions mintája)
  const celFajl = path.join(ROOT, 'apps/web/app/(dashboard)/penzugy/tva-actions.ts')
  const mutans = fajlok.map(([p, src]) =>
    p === celFajl
      ? [p, `${src}\nasync function regiVilag(supabase) { await supabase.from('ertesitesek').insert([{ cim: 'x' }]) }\n`]
      : [p, src],
  )
  assert(kozvetlenInsertek(mutans).length === 1, 'A1n: egy visszaírt közvetlen insert-tel az őr BUKIK (a mutánst megtalálja)')
  // Az ENGEDETT fájl maga tartalmazza az insertet — különben az őr üresben járna.
  const helper = fajlok.find(([p]) => ENGEDETT.has(p))
  assert(!!helper && KOZVETLEN_INSERT.test(kommentNelkul(helper[1])), 'A1e: az ertesites-insert.ts MAGA tartalmazza az egyetlen insertet')
}

// ─────────────────────────────────────────────────────────────────────────────
// Betöltő: TS → CJS ideiglenes mappába, a projekt-importok átírásával
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ A `marked` v18 CSAK ESM-ként tölthető be (az UMD-je üres objektumot ad
//    `require()`-ből), ezért a valódi modult ESM-importtal hozzuk be, és a
//    transzpilált CJS-kód egy globálison át kapja meg.
//    (Windowson az abszolút út csak file:// URL-ként importálható.)
globalThis.__kartotekaMarked = await import(pathToFileURL(path.join(ROOT, 'node_modules/marked/lib/marked.esm.js')).href)

function betoltModulokat(renderForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-ertesites-'))
  const ir = (nev, js) => fs.writeFileSync(path.join(tmp, nev), js)
  const stub = path.join(tmp, 'server-only.cjs')
  ir('server-only.cjs', 'module.exports = {}')
  const atir = (js) =>
    js
      .replace(/require\(["']server-only["']\)/g, `require(${JSON.stringify(stub)})`)
      .replace(/require\(["']marked["']\)/g, 'globalThis.__kartotekaMarked')
      .replace(/require\(["']sanitize-html["']\)/g, `require(${JSON.stringify(path.join(ROOT, 'node_modules/sanitize-html'))})`)
      .replace(/require\(["']\.\/felado["']\)/g, `require(${JSON.stringify(path.join(tmp, 'felado.cjs'))})`)
      .replace(/require\(["']\.\/uzenetek-shared["']\)/g, `require(${JSON.stringify(path.join(tmp, 'uzenetek-shared.cjs'))})`)
  ir('felado.cjs', atir(t(olvas(path.join(NOTIF_DIR, 'felado.ts')))))
  ir('uzenetek-shared.cjs', atir(t(olvas(path.join(NOTIF_DIR, 'uzenetek-shared.ts')))))
  ir('ertesites-render.cjs', atir(t(renderForras)))
  ir('ertesites-insert.cjs', atir(t(olvas(path.join(NOTIF_DIR, 'ertesites-insert.ts')))))
  return {
    felado: require_(path.join(tmp, 'felado.cjs')),
    shared: require_(path.join(tmp, 'uzenetek-shared.cjs')),
    render: require_(path.join(tmp, 'ertesites-render.cjs')),
    insert: require_(path.join(tmp, 'ertesites-insert.cjs')),
    tmp,
  }
}

const RENDER_SRC = olvas(path.join(NOTIF_DIR, 'ertesites-render.ts'))
const m = betoltModulokat(RENDER_SRC)

// ─────────────────────────────────────────────────────────────────────────────
// B) renderUzenetHtml + markdownSzoveg
// ─────────────────────────────────────────────────────────────────────────────

{
  const { renderUzenetHtml, markdownSzoveg } = m.render
  assert(/<h2>cím<\/h2>/.test(renderUzenetHtml('## cím')), "B1: '## cím' → <h2>cím</h2>")
  const veszelyes = renderUzenetHtml(
    '## Hír\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[x](javascript:alert(3))\n\n<p class="csali">**a**</p>',
  )
  assert(!/<script/i.test(veszelyes) && !/alert\(1\)/.test(veszelyes), 'B2: a <script> címkéje ÉS tartalma is kiszűrve')
  assert(!/<img/i.test(veszelyes) && !/onerror/i.test(veszelyes), 'B3: az <img> és az onerror kiszűrve')
  assert(!/javascript:/i.test(veszelyes), 'B4: a javascript: séma kiszűrve a linkből')
  assert(/<strong>a<\/strong>/.test(renderUzenetHtml('**a**')), 'B5: **a** → <strong>')
  const link = renderUzenetHtml('[Kartotéka](https://kartoteka.app/x)')
  assert(
    /<a [^>]*href="https:\/\/kartoteka\.app\/x"[^>]*>/.test(link) &&
      /rel="noopener noreferrer"/.test(link) &&
      /target="_blank"/.test(link),
    'B6: https-link href + rel="noopener noreferrer" + target="_blank"',
  )
  assert(!/class=/.test(veszelyes), 'B7: a class attribútum kiszűrve')
  assert(
    markdownSzoveg('## A hírlevélben 2 frissítést küldünk ki:\n\n- **2026-09-03** — X (bugfix)') ===
      'A hírlevélben 2 frissítést küldünk ki: 2026-09-03 — X (bugfix)',
    'B8: markdownSzoveg egysoros, a ##/-/** jelek nélkül',
  )
  assert(!/\n/.test(markdownSzoveg('a\n\nb\n- c')), 'B8b: markdownSzoveg soha nem tartalmaz sortörést')
  assert(typeof renderUzenetHtml('') === 'string', 'B8c: üres törzs nem dob')

  // NEGATÍV: a sanitize-lépés nélkül a <script> túléli — az őrnek buknia kell.
  const mutans = RENDER_SRC.replace(/const tiszta = sanitizeHtml\(nyers, SZABALYOK\)/, 'const tiszta = nyers')
  if (mutans === RENDER_SRC) {
    assert(false, 'B9n: a sanitize-mutáns NEM állítható elő — a horgony elmozdult, az őr vak')
  } else {
    const mm = betoltModulokat(mutans)
    const nyers = mm.render.renderUzenetHtml('<script>alert(1)</script>')
    assert(/<script>alert\(1\)<\/script>/.test(nyers), 'B9n: sanitize NÉLKÜL a <script> túléli — az őr tud pirosra váltani')
    fs.rmSync(mm.tmp, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C) feladoBontas — a 6 típus + oszlop-először + alapág
// ─────────────────────────────────────────────────────────────────────────────

{
  const { feladoBontas, feladoMezok } = m.felado
  const b = (sor) => feladoBontas(sor)
  assert(b({ tipus: 'registration', cim: 'Új regisztráció: Kovács János' }).tipus === 'felhasznalo', 'C1: registration → felhasznalo')
  assert(b({ tipus: 'support_reply' }).tipus === 'rendszergazda', 'C2: support_reply → rendszergazda')
  assert(b({ hivatkozas: 'admin_access:123' }).tipus === 'rendszergazda', 'C3: admin_access: → rendszergazda')
  assert(b({ hivatkozas: '/dashboard-kerulet' }).tipus === 'egyhazkerulet', 'C4: /dashboard-kerulet → egyhazkerulet')
  // 2026-09-05 (brief 3. pont, a beszúró helyek megnyitásával pontosítva):
  // a megyei felület sorainál a gyülekezet MEGLÉTE dönt.
  assert(b({ hivatkozas: '/dashboard-egyhazmegye' }).tipus === 'egyhazkerulet', 'C5: /dashboard-egyhazmegye gyülekezet NÉLKÜL → egyhazkerulet (felterjesztés)')
  const megyei = b({ hivatkozas: '/dashboard-egyhazmegye/koltsegvetes', congregationId: 'c1', congregationNev: 'Barátos' })
  assert(megyei.tipus === 'gyulekezet' && megyei.nev === 'Barátos' && megyei.id === 'c1', 'C5b: /dashboard-egyhazmegye gyülekezettel → a beküldő gyülekezet')
  // Átjelentkezés: a sor congregation_id-ja a CÍMZETT oldala — a küldő a MÁSIK gyülekezet.
  const gy = b({ hivatkozas: '/notifications', congregationNev: 'Barátos' })
  assert(gy.tipus === 'gyulekezet' && gy.nev === 'Másik gyülekezet' && gy.id === null, 'C6: /notifications → gyulekezet, de a nevet nem találjuk ki („Másik gyülekezet")')
  const reg = b({ tipus: 'registration', cim: 'Új regisztráció (Google)', uzenet: 'Kovács János (kovacs@pelda.hu) regisztrált a rendszerbe.' })
  assert(reg.tipus === 'felhasznalo' && reg.nev === 'Kovács János', 'C8: registration → a név a törzs elejéről')
  assert(b({ hivatkozas: '/admin/felhasznalok?x=1' }).tipus === 'rendszer', 'C9: /admin/felhasznalok (gépi, service_role) → rendszer')
  assert(b({ cim: 'Hozzáférése aktiválva', hivatkozas: '' }).tipus === 'rendszergazda', 'C10: hivatkozás nélküli rendszergazdai cím → rendszergazda')
  const jov = b({ cim: 'Hozzáférés jóváhagyva', congregationId: 'c9', congregationNev: 'Zágon' })
  assert(jov.tipus === 'gyulekezet' && jov.nev === 'Zágon', 'C11: „Hozzáférés jóváhagyva" → a jóváhagyó gyülekezet')
  // 2026-09-05 (bírálói P3, egy igazságforrás): a regisztrációs törzsben NINCS „ (" →
  // a TELJES törzs NEM válhat névvé (az SQL split_part ezt tenné); 120 fölött sem név.
  const regNincsZarojel = b({ tipus: 'registration', cim: 'Új regisztráció', uzenet: 'Valaki regisztrált a rendszerbe, ellenőrizd.' })
  assert(regNincsZarojel.tipus === 'felhasznalo' && regNincsZarojel.nev === 'Regisztráló felhasználó', 'C8b: registration „ (" nélkül → tartalék név, NEM a teljes törzs')
  const regHosszu = b({ tipus: 'registration', uzenet: `${'x'.repeat(121)} (a@b.hu) regisztrált.` })
  assert(regHosszu.nev === 'Regisztráló felhasználó', 'C8c: registration 120 fölötti „név" → tartalék név (SQL-tükör)')
  // 2026-09-05 (bírálói P3): a megyei felület RÉGI sorai csak a címből ismerhetők fel → egyházmegye.
  const jav = b({ tipus: 'warning', cim: 'Javítási kérelem elutasítva: Költségvetés (2026.)', hivatkozas: '/penzugy?tab=koltsegvetes', congregationId: 'c1', congregationNev: 'Barátos' })
  assert(jav.tipus === 'egyhazmegye' && jav.nev === 'Egyházmegye' && jav.id === null && jav.levezetett === true, 'C12: „Javítási kérelem elutasítva…" (régi megyei sor) → egyhazmegye')
  const vissza = b({ tipus: 'warning', cim: 'Visszaküldött dokumentum: Zárszámadás (2025.)', hivatkozas: '/dashboard', congregationId: 'c1' })
  assert(vissza.tipus === 'egyhazmegye', 'C12b: „Visszaküldött dokumentum…" → egyhazmegye')
  assert(b({ tipus: 'warning', cim: 'Javítási kérelem elbírálás alatt', hivatkozas: '/dashboard' }).tipus === 'rendszer', 'C12n: negatív — „Javítási kérelem elbírálás alatt" (gyülekezeti oldali állapot) marad rendszer')
  const alap = b({ tipus: 'warning', hivatkozas: '/dashboard?lejarat=2026-W36' })
  assert(alap.tipus === 'rendszer' && alap.levezetett === true, 'C7: minden más → rendszer, levezetett=true')
  const oszlop = b({ tipus: 'info', hivatkozas: '/admin', felado_tipus: 'gyulekezet', felado_nev: 'Kézdi', felado_id: 'abc' })
  assert(
    oszlop.tipus === 'gyulekezet' && oszlop.nev === 'Kézdi' && oszlop.id === 'abc' && oszlop.levezetett === false,
    'C8: OSZLOP-ELŐSZÖR — kitöltött felado_* mellett a hivatkozás nem számít, levezetett=false',
  )
  const mezok = feladoMezok('rendszer')
  assert(
    mezok.felado_tipus === 'rendszer' && mezok.felado_nev === 'Kartotéka rendszer' && mezok.felado_id === null,
    'C9: feladoMezok név nélkül a típus-címkét adja',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// D) insertErtesites — visszaesés, hiba-továbbadás, levezetés
// ─────────────────────────────────────────────────────────────────────────────

/** Ál-Supabase: a hívások sorrendjében adott hibákat ad vissza, és rögzíti a sorokat. */
function alKliens(hibak) {
  const hivasok = []
  return {
    hivasok,
    from(tabla) {
      return {
        insert(sorok) {
          hivasok.push({ tabla, sorok })
          const hiba = hibak.shift() ?? null
          return Promise.resolve({ error: hiba })
        },
      }
    },
  }
}

const csendes = { warn: console.warn }
console.warn = () => {}
try {
  const { insertErtesites, hianyzoOszlopNeve } = m.insert
  const { feladoMezok } = m.felado
  const sor = { user_id: 'u1', cim: 'Teszt', uzenet: 'törzs', ...feladoMezok('gyulekezet', 'Barátos', 'c1') }

  // D1: PostgREST „Could not find the column" → ismétlés az oszlop nélkül
  const k1 = alKliens([
    { code: 'PGRST204', message: "Could not find the 'felado_tipus' column of 'ertesitesek' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'felado_nev' column of 'ertesitesek' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'felado_id' column of 'ertesitesek' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'felado_levezetett' column of 'ertesitesek' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'uzenet_format' column of 'ertesitesek' in the schema cache" },
  ])
  const e1 = await insertErtesites(k1, sor, { forras: 'teszt' })
  const utolso = k1.hivasok[k1.hivasok.length - 1].sorok[0]
  assert(
    e1.error === null && e1.visszaeses === true && k1.hivasok.length === 6,
    'D1: migráció előtti sémán oszloponként visszaesik, végül hiba nélkül bekerül',
  )
  assert(
    !('felado_tipus' in utolso) && !('uzenet_format' in utolso) && utolso.user_id === 'u1' && utolso.cim === 'Teszt',
    'D1b: az utolsó beszúrás az új oszlopok NÉLKÜL, az alap-mezőkkel ment',
  )
  assert(e1.kihagyottOszlopok.length === 5, 'D1c: az eredmény felsorolja a kihagyott oszlopokat')

  // D2: Postgres 42703 alak is felismerhető
  assert(
    hianyzoOszlopNeve({ code: '42703', message: 'column "megjegyzes" of relation "ertesitesek" does not exist' }) === 'megjegyzes' &&
      hianyzoOszlopNeve({ code: '42703', message: 'column ertesitesek.megjegyzes does not exist' }) === 'megjegyzes' &&
      hianyzoOszlopNeve({ code: '23514', message: 'new row violates check constraint' }) === null,
    'D2: hianyzoOszlopNeve a PostgREST és a Postgres alakot is érti, mást nem',
  )

  // D3: NEM oszlop-hiba → visszaadott error, NINCS ismétlés
  const k3 = alKliens([{ code: '42501', message: 'new row violates row-level security policy for table "ertesitesek"' }])
  const e3 = await insertErtesites(k3, sor)
  assert(
    typeof e3.error === 'string' && /row-level security/.test(e3.error) && k3.hivasok.length === 1 && e3.visszaeses === false,
    'D3: RLS-hiba → magyar error a hívónak, egyetlen próbálkozás',
  )

  // D4: feladó nélkül → levezetés + felado_levezetett=true; explicit → false
  const k4 = alKliens([])
  await insertErtesites(k4, [
    { user_id: 'u1', cim: 'Mentés-riasztás', uzenet: 'x', hivatkozas: '/admin/biztonsagi-mentes?x' },
    sor,
  ])
  const [levezetett, explicit] = k4.hivasok[0].sorok
  assert(
    levezetett.felado_tipus === 'rendszer' && levezetett.felado_levezetett === true,
    'D4: feladó nélküli sor a feladoBontas levezetését kapja (mentés-riasztás = rendszer), felado_levezetett=true',
  )
  assert(
    explicit.felado_tipus === 'gyulekezet' && explicit.felado_nev === 'Barátos' && explicit.felado_levezetett === false && explicit.uzenet_format === 'text',
    'D4b: explicit feladó változatlan, felado_levezetett=false, alap formátum text',
  )

  // D5: címzett nélküli sor meg sem próbálkozik
  const k5 = alKliens([])
  const e5 = await insertErtesites(k5, { user_id: '', cim: 'x', uzenet: 'y' })
  assert(typeof e5.error === 'string' && k5.hivasok.length === 0, 'D5: címzett nélkül nincs DB-hívás, van magyar hiba')
} finally {
  console.warn = csendes.warn
}

// ─────────────────────────────────────────────────────────────────────────────
// E) Forrás-őrök a javított beszúró helyeken
// ─────────────────────────────────────────────────────────────────────────────

{
  const broadcasts = kommentNelkul(olvas(path.join(ROOT, 'apps/web/app/(dashboard)/admin/broadcasts-actions.ts')))
  assert(!/'release'\s*\?\s*'info'/.test(broadcasts), "E1: broadcasts-actions NEM írja át a 'release' típust 'info'-ra")
  assert(/uzenet_format:\s*uzenetFormat/.test(broadcasts) && /broadcast_id:\s*inserted\.id/.test(broadcasts), 'E1b: a körlevél sora broadcast_id-t és uzenet_format-ot kap')
  assert(/kuldBroadcast\([\s\S]*?'markdown'\)/.test(broadcasts), "E1c: a hírlevél/changelog ág 'markdown' formátummal küld")

  const transfer = olvas(path.join(ROOT, 'apps/web/lib/notifications/transfer-notifications-actions.ts'))
  const transferKod = kommentNelkul(transfer)
  assert(!/user_id:\s*null/.test(transferKod), 'E2: transfer-notifications NEM ír user_id: null sort')
  assert(/\/notifications\?ful=kerelmek&kerelem=\$\{/.test(transferKod), 'E2b: a döntés-értesítés élő mélylinket kap (?ful=kerelmek&kerelem=)')
  assert(!/\/notifications#\$\{/.test(transferKod), 'E2c: a halott #<id> horgony megszűnt')
  const transferMutans = transferKod.replace(/hivatkozas:\s*kerelemLink,\s*\.\.\.feladoAdat,/, 'hivatkozas: kerelemLink, user_id: null, ...feladoAdat,')
  assert(transferMutans !== transferKod && /user_id:\s*null/.test(transferMutans), 'E2n: egy visszaírt user_id: null-lal az őr BUKIK')

  const admin = kommentNelkul(olvas(path.join(ROOT, 'apps/web/app/(dashboard)/admin/actions.ts')))
  assert(/tipus:\s*'support_reply'/.test(admin), "E3: admin/actions a támogatási válasznál tipus: 'support_reply'")
  assert(/admin_request_id:\s*requestRow\?\.id/.test(admin), 'E3b: a hozzáférés-kérés az admin_request_id oszlopot is tölti')

  const actions = kommentNelkul(olvas(path.join(NOTIF_DIR, 'uzenetek-actions.ts')))
  assert(/uzenet_format === 'markdown'/.test(actions), "E4: a renderelés kapuja az uzenet_format === 'markdown' feltételre épül")
  assert(/=\s*markdown\s*\?\s*renderUzenetHtml\(/.test(actions), 'E4b: a renderUzenetHtml hívása a kapu mögött (ternary), text-sornál null')
  const actionsMutans = actions.replace(/=\s*markdown\s*\?\s*renderUzenetHtml\(uzenet\)\s*:\s*null/, '= renderUzenetHtml(uzenet)')
  assert(
    actionsMutans !== actions && !/=\s*markdown\s*\?\s*renderUzenetHtml\(/.test(actionsMutans),
    'E4n: a kapu nélküli (mindig renderelő) mutánson az őr BUKIK',
  )
  assert(/listFrissErtesitesekAction/.test(actions) && /count:\s*'exact',\s*head:\s*true/.test(actions), 'E5: a csengő-akció valódi count-tal számol')

  const tva = kommentNelkul(olvas(path.join(ROOT, 'apps/web/app/(dashboard)/penzugy/tva-actions.ts')))
  assert(/megjegyzes:\s*dedupKulcs/.test(tva) && /hivatkozas:\s*'\/penzugy'/.test(tva) && !/hivatkozas\s*\}/.test(tva), 'E6: a TVA dedup-kulcs a megjegyzésben, a hivatkozás minden soron /penzugy')

  const desktop = kommentNelkul(olvas(path.join(ROOT, 'apps/desktop/src/components/desktop-budget-tab.tsx')))
  assert(/felado_tipus:\s*'gyulekezet'/.test(desktop) && /felado_nev:\s*congName/.test(desktop), 'E7: az asztali beküldés a 3 feladó-mezőt szó szerint kapja')
}

fs.rmSync(m.tmp, { recursive: true, force: true })

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
process.exit(failedCount > 0 ? 1 : 0)
