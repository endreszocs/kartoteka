#!/usr/bin/env node
/**
 * Az Oblio-átvilágítási jelentések olvasható oldalává alakítása.
 *
 * A markdown FORDÍTÁSI IDŐBEN renderelődik (a repó `markdown-it`-jével), így a
 * kész oldalnak nincs futásidejű függősége — nem tud némán üres maradni.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(process.argv[2] + '/package.json')
const MarkdownIt = require_('markdown-it')
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

const REPO = process.argv[2]
const OUT = process.argv[3]

const JELENTESEK = [
  {
    id: 'oblio',
    cimke: 'Oblio-lánc',
    alcim: 'mappa-alapú e-Factura egyeztetés — a fő lánc',
    fajl: 'docs/project-tracking/KARTOTEKA-oblio-lanc-audit-2026-09-03.md',
  },
  {
    id: 'feltoltes',
    cimke: 'Feltöltés-első lánc',
    alcim: 'Dokumentumtár ⇄ Oblio ⇄ Pénzügy',
    fajl: 'docs/project-tracking/KARTOTEKA-szamla-feltoltes-lanc-audit-2026-09-03.md',
  },
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slug = (s, n) =>
  's' + n + '-' + String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

/** A `## 4. P0 — azonnali` alakú szakasz-címsorból kiolvasott súlyosság. */
function szakaszSulyossag(szoveg) {
  const m = /^\s*\d+\.\s*(P[0-3])\b/.exec(szoveg)
  return m ? m[1] : null
}

let sorszam = 0
const dokumentumok = []

for (const j of JELENTESEK) {
  const teljes = path.join(REPO, j.fajl)
  if (!fs.existsSync(teljes)) { console.error('KIMARAD (nincs meg): ' + j.fajl); continue }
  const forras = fs.readFileSync(teljes, 'utf8')
  const tokenek = md.parse(forras, {})
  const tartalomjegyzek = []

  // A VALÓS darabszámok a gépi találat-fájlból jönnek — a szövegből olvasott
  // szám félrevezetne (a szintézis összevont és átsorolt találatokat).
  const gepi = teljes.replace(/\.md$/, '-talalatok.json')
  const szamlalo = { P0: 0, P1: 0, P2: 0, P3: 0 }
  if (fs.existsSync(gepi)) {
    for (const t of JSON.parse(fs.readFileSync(gepi, 'utf8'))) {
      if (szamlalo[t.severity] != null) szamlalo[t.severity]++
    }
  }

  // Minden felső szintű blokk megkapja az AKTUÁLIS SZAKASZ súlyosságát —
  // így a szűrő egész fejezeteket rejt, nem cím-töredékeket.
  let aktualis = null
  let melyseg = 0
  for (let i = 0; i < tokenek.length; i++) {
    const t = tokenek[i]
    if (t.level === 0 && t.nesting >= 0) {
      if (t.type === 'heading_open' && t.tag === 'h2') {
        aktualis = szakaszSulyossag((tokenek[i + 1] && tokenek[i + 1].content) || '')
      }
      if (aktualis) t.attrSet('data-sev', aktualis)
    }
    if (t.type !== 'heading_open') continue
    const szint = Number(t.tag.slice(1))
    if (szint > 3) continue
    const cim = (tokenek[i + 1] && tokenek[i + 1].content) || ''
    const azonosito = slug(cim, ++sorszam)
    t.attrSet('id', azonosito)
    const sev = t.tag === 'h2' ? aktualis : aktualis
    if (sev) t.attrJoin('class', 'sev-' + sev)
    tartalomjegyzek.push({ szint, cim, azonosito, sev })
    melyseg++
  }

  dokumentumok.push({ ...j, html: md.renderer.render(tokenek, md.options, {}), toc: tartalomjegyzek, szamlalo })
}

if (dokumentumok.length === 0) {
  console.error('Egyetlen jelentés sem található — nincs mit publikálni.')
  process.exit(1)
}

const tocHtml = (d) =>
  d.toc
    .map(
      (h) =>
        `<a class="toc-${h.szint}${h.sev ? ' toc-sev' : ''}" href="#${h.azonosito}"${h.sev ? ` data-sev="${h.sev}"` : ''}>` +
        (h.sev ? `<i class="pont sev-${h.sev}"></i>` : '') +
        `<span>${esc(h.cim.replace(/^\s*P[0-3]\s*[-–—·]\s*/, ''))}</span></a>`,
    )
    .join('\n')

const osszSzam = dokumentumok.reduce(
  (a, d) => {
    for (const k of ['P0', 'P1', 'P2', 'P3']) a[k] += d.szamlalo[k]
    return a
  },
  { P0: 0, P1: 0, P2: 0, P3: 0 },
)

const html = `<title>Kartotéka számla-lánc átvilágítás</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{
  --papir:#fbfbf8; --lap:#ffffff; --tinta:#191c16; --halvany:#6c7268; --vonal:#e3e6df;
  --kiemeles:#5f7f45; --kiemeles-halk:#eef2e8;
  --p0:#9d2b2b; --p1:#a2660f; --p2:#43647f; --p3:#6c7268;
  --p0-halk:#fbeeee; --p1-halk:#fbf3e6; --p2-halk:#edf2f6; --p3-halk:#f1f2ef;
  --mertek:70ch;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --papir:#12140f; --lap:#181b14; --tinta:#e7eae1; --halvany:#99a191; --vonal:#282c22;
    --kiemeles:#a3c383; --kiemeles-halk:#1d2418;
    --p0:#e88b8b; --p1:#dfab5e; --p2:#8fb4cf; --p3:#99a191;
    --p0-halk:#241614; --p1-halk:#241d10; --p2-halk:#141d24; --p3-halk:#1b1e18;
  }
}
:root[data-theme="dark"]{
  --papir:#12140f; --lap:#181b14; --tinta:#e7eae1; --halvany:#99a191; --vonal:#282c22;
  --kiemeles:#a3c383; --kiemeles-halk:#1d2418;
  --p0:#e88b8b; --p1:#dfab5e; --p2:#8fb4cf; --p3:#99a191;
  --p0-halk:#241614; --p1-halk:#241d10; --p2-halk:#141d24; --p3-halk:#1b1e18;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--papir); color:var(--tinta);
  font-family:"Source Sans 3","Segoe UI",system-ui,sans-serif;
  font-size:16.5px; line-height:1.65; -webkit-font-smoothing:antialiased;
}
.keret{display:grid; grid-template-columns:1fr; max-width:1400px; margin:0 auto}
@media(min-width:1060px){ .keret{grid-template-columns:266px minmax(0,1fr); gap:0} }

/* ── Bal sáv ───────────────────────────────────────────────── */
.sav{border-bottom:1px solid var(--vonal); background:var(--lap)}
@media(min-width:1060px){
  .sav{
    position:sticky; top:0; align-self:start; height:100dvh; overflow-y:auto;
    border-bottom:0; border-right:1px solid var(--vonal); padding:26px 20px 40px;
  }
}
@media(max-width:1059px){ .sav{padding:16px} }
.marka{font-family:Spectral,Georgia,serif; font-weight:700; font-size:19px; line-height:1.25; letter-spacing:-.01em; margin:0}
.marka span{display:block; font-family:"JetBrains Mono",ui-monospace,monospace; font-size:10px; font-weight:400;
  letter-spacing:.14em; text-transform:uppercase; color:var(--halvany); margin-top:7px}

.valto{display:flex; flex-direction:column; gap:2px; margin:22px 0 6px}
.valto button{
  display:flex; flex-direction:column; gap:2px; text-align:left; cursor:pointer;
  background:none; border:0; border-left:2px solid transparent; padding:8px 10px;
  color:var(--halvany); font:inherit; font-size:14.5px; border-radius:0 4px 4px 0;
}
.valto button:hover{background:var(--kiemeles-halk); color:var(--tinta)}
.valto button[aria-current="true"]{border-left-color:var(--kiemeles); color:var(--tinta); font-weight:600; background:var(--kiemeles-halk)}
.valto small{font-family:"JetBrains Mono",monospace; font-size:10.5px; font-weight:400; color:var(--halvany); letter-spacing:.02em}

.szuro{display:flex; flex-wrap:wrap; gap:5px; margin:18px 0 4px}
.szuro button{
  font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.04em; cursor:pointer;
  border:1px solid var(--vonal); background:var(--lap); color:var(--halvany);
  padding:4px 8px; border-radius:3px;
}
.szuro button[aria-pressed="true"]{border-color:currentColor; font-weight:600}
.szuro button.f-P0[aria-pressed="true"]{color:var(--p0); background:var(--p0-halk)}
.szuro button.f-P1[aria-pressed="true"]{color:var(--p1); background:var(--p1-halk)}
.szuro button.f-P2[aria-pressed="true"]{color:var(--p2); background:var(--p2-halk)}
.szuro button.f-P3[aria-pressed="true"]{color:var(--p3); background:var(--p3-halk)}

.cimke{font-family:"JetBrains Mono",monospace; font-size:10px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--halvany); margin:22px 0 8px}
nav{display:flex; flex-direction:column; gap:1px; font-size:13.5px; line-height:1.4}
nav a{color:var(--halvany); text-decoration:none; padding:4px 8px; border-radius:3px;
  display:flex; gap:7px; align-items:baseline; border-left:2px solid transparent}
nav a:hover{background:var(--kiemeles-halk); color:var(--tinta)}
nav a.aktiv{color:var(--tinta); border-left-color:var(--kiemeles); background:var(--kiemeles-halk)}
nav a.toc-3{padding-left:18px; font-size:12.5px}
.pont{width:6px; height:6px; border-radius:50%; flex:0 0 auto; margin-top:.42em}
.pont.sev-P0{background:var(--p0)} .pont.sev-P1{background:var(--p1)}
.pont.sev-P2{background:var(--p2)} .pont.sev-P3{background:var(--p3)}

/* ── Törzs ─────────────────────────────────────────────────── */
main{padding:34px 20px 90px; min-width:0}
@media(min-width:1060px){ main{padding:52px 56px 120px} }
.dok{display:none} .dok.aktiv{display:block}
.dok > *{max-width:var(--mertek)}
.dok h1{font-family:Spectral,Georgia,serif; font-weight:700; font-size:clamp(27px,4vw,38px);
  line-height:1.15; letter-spacing:-.015em; margin:0 0 18px; text-wrap:balance}
.dok h2{font-family:Spectral,Georgia,serif; font-weight:600; font-size:clamp(21px,2.6vw,26px);
  line-height:1.25; margin:52px 0 14px; padding-top:20px; border-top:1px solid var(--vonal); text-wrap:balance}
.dok h3{font-family:Spectral,Georgia,serif; font-weight:600; font-size:18.5px; line-height:1.3;
  margin:32px 0 10px; text-wrap:balance}
.dok h3.talalat-cim{
  padding:10px 0 10px 14px; border-left:3px solid var(--halvany); margin-top:38px;
}
.dok h3.sev-P0{border-left-color:var(--p0)} .dok h3.sev-P1{border-left-color:var(--p1)}
.dok h3.sev-P2{border-left-color:var(--p2)} .dok h3.sev-P3{border-left-color:var(--p3)}
.dok p{margin:0 0 14px}
.dok strong{font-weight:600}
.dok ul,.dok ol{margin:0 0 14px; padding-left:22px}
.dok li{margin-bottom:6px}
.dok li::marker{color:var(--halvany)}
.dok a{color:var(--kiemeles); text-underline-offset:2px}
.dok hr{border:0; border-top:1px solid var(--vonal); margin:38px 0; max-width:var(--mertek)}
.dok blockquote{
  margin:20px 0; padding:14px 18px; border-left:3px solid var(--p1);
  background:var(--p1-halk); border-radius:0 4px 4px 0;
}
.dok blockquote p:last-child{margin-bottom:0}
.dok code{
  font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.86em;
  background:var(--kiemeles-halk); padding:1px 5px; border-radius:3px;
  overflow-wrap:anywhere;
}
.dok pre{background:var(--lap); border:1px solid var(--vonal); border-radius:5px;
  padding:14px 16px; overflow-x:auto; max-width:100%}
.dok pre code{background:none; padding:0; font-size:13px}
.dok > .tabla-doboz{max-width:min(100%,104ch)}
.tabla-doboz{overflow-x:auto; margin:0 0 18px; border:1px solid var(--vonal); border-radius:5px}
.dok table{border-collapse:collapse; width:100%; font-size:14.5px; background:var(--lap)}
.dok th,.dok td{text-align:left; padding:8px 12px; border-bottom:1px solid var(--vonal); vertical-align:top}
.dok th{font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--halvany); font-weight:600; white-space:nowrap}
.dok tr:last-child td{border-bottom:0}
.dok td{font-variant-numeric:tabular-nums}
.rejtve{display:none !important}

.ures{color:var(--halvany); font-style:italic; padding:20px 0}
:focus-visible{outline:2px solid var(--kiemeles); outline-offset:2px; border-radius:2px}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto !important}}
html{scroll-behavior:smooth}
.dok h2,.dok h3{scroll-margin-top:20px}
@media(max-width:1059px){ .dok h2,.dok h3{scroll-margin-top:12px} }
</style>

<div class="keret">
  <aside class="sav">
    <h1 class="marka">Számla-lánc átvilágítás<span>Kartotéka · 2026-09-03</span></h1>

    <div class="valto" role="tablist" aria-label="Jelentés választása">
      ${dokumentumok
        .map(
          (d, i) => `<button role="tab" data-dok="${d.id}" aria-current="${i === 0}">
        ${esc(d.cimke)}
        <small>${d.szamlalo.P0} P0 · ${d.szamlalo.P1} P1 · ${d.szamlalo.P2} P2 · ${d.szamlalo.P3} P3</small>
      </button>`,
        )
        .join('\n      ')}
    </div>

    <p class="cimke">Súlyosság szerint</p>
    <div class="szuro">
      ${['P0', 'P1', 'P2', 'P3']
        .map((s) => `<button class="f-${s}" data-sev="${s}" aria-pressed="false">${s} · ${osszSzam[s]}</button>`)
        .join('\n      ')}
      <button data-sev="mind" aria-pressed="true">mind</button>
    </div>

    <p class="cimke">Tartalom</p>
    ${dokumentumok.map((d) => `<nav data-toc="${d.id}">\n${tocHtml(d)}\n</nav>`).join('\n    ')}
  </aside>

  <main>
    ${dokumentumok
      .map((d, i) => `<article class="dok${i === 0 ? ' aktiv' : ''}" data-dok="${d.id}">${d.html}</article>`)
      .join('\n    ')}
  </main>
</div>

<script>
(function(){
  // A táblákat saját görgető dobozba tesszük — a lap teste sosem görög oldalra.
  document.querySelectorAll('.dok table').forEach(function(t){
    var d=document.createElement('div'); d.className='tabla-doboz';
    // A szakasz súlyosságát ÁT KELL VINNI a burkolóra, különben a szűrő
    // a táblát bent hagyná a rejtett fejezetből.
    if(t.dataset.sev) d.dataset.sev=t.dataset.sev;
    t.parentNode.insertBefore(d,t); d.appendChild(t);
  });

  var gombok=[].slice.call(document.querySelectorAll('.valto button'));
  var dokok=[].slice.call(document.querySelectorAll('.dok'));
  var navok=[].slice.call(document.querySelectorAll('nav[data-toc]'));

  function valt(id){
    gombok.forEach(function(g){ g.setAttribute('aria-current', String(g.dataset.dok===id)); });
    dokok.forEach(function(d){ d.classList.toggle('aktiv', d.dataset.dok===id); });
    navok.forEach(function(n){ n.style.display = n.dataset.toc===id ? '' : 'none'; });
    window.scrollTo({top:0});
  }
  gombok.forEach(function(g){ g.addEventListener('click', function(){ valt(g.dataset.dok); }); });
  if(navok.length) valt(gombok[0].dataset.dok);

  // ── Súlyosság-szűrő: a nem illő találatokat elrejti (a keretszöveg marad).
  var szurok=[].slice.call(document.querySelectorAll('.szuro button'));
  // A szűrő SZAKASZ-szintű: a jelentés a P0-t külön címsorokkal, a P1–P3-at
  // táblákban és listákban hozza, ezért találatonként nem lehet szűrni — a
  // fejezet viszont pontosan annyit rejt, amennyit kell. A keretszöveg
  // (összefoglaló, adatfolyam, cselekvési sorrend, fenntartások) mindig marad:
  // súlyosság nélküli blokkot sosem rejtünk el.
  function szur(sev){
    szurok.forEach(function(s){ s.setAttribute('aria-pressed', String(s.dataset.sev===sev)); });
    dokok.forEach(function(dok){
      [].slice.call(dok.children).forEach(function(el){
        var s=el.dataset.sev||null;
        el.classList.toggle('rejtve', sev!=='mind' && !!s && s!==sev);
      });
    });
    navok.forEach(function(n){
      [].slice.call(n.querySelectorAll('a')).forEach(function(a){
        var s=a.dataset.sev||null;
        a.classList.toggle('rejtve', sev!=='mind' && !!s && s!==sev);
      });
    });
  }
  szurok.forEach(function(s){ s.addEventListener('click', function(){ szur(s.dataset.sev); }); });

  // ── Olvasás-jelölő a tartalomjegyzékben.
  var figyelo=new IntersectionObserver(function(be){
    be.forEach(function(e){
      if(!e.isIntersecting) return;
      var id=e.target.id; if(!id) return;
      navok.forEach(function(n){
        [].slice.call(n.querySelectorAll('a')).forEach(function(a){
          a.classList.toggle('aktiv', a.getAttribute('href')==='#'+id);
        });
      });
    });
  },{rootMargin:'0px 0px -78% 0px'});
  document.querySelectorAll('.dok h2[id], .dok h3[id]').forEach(function(h){ figyelo.observe(h); });
})();
</script>
`

fs.writeFileSync(OUT, html, 'utf8')
console.log('oldal kiírva:', OUT, '·', (html.length / 1024).toFixed(0), 'kB')
for (const d of dokumentumok) {
  console.log(`  ${d.cimke}: ${d.toc.length} címsor · P0 ${d.szamlalo.P0} · P1 ${d.szamlalo.P1} · P2 ${d.szamlalo.P2} · P3 ${d.szamlalo.P3}`)
}
