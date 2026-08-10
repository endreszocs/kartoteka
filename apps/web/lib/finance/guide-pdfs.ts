/**
 * Pénzügy súgó — témánkénti letölthető PDF.
 *
 * A Súgó fül minden témája mellett van egy kis nyomtató ikon: az adott
 * rész (mire jó / hogyan működik / tippek / példák) önálló A4-es PDF-be
 * menthető. A HTML-t a print-engine-v2 alakítja PDF-fé a kliens oldalon.
 *
 * 2026-08-11 (K5 P2 #1) — TÖRÖLVE innen 410 sor: a `GuidePdf` / `GUIDE_PDFS`
 * / `buildGuidePdfHtml` hármas és a hozzá tartozó három statikus dokumentum-
 * generátor (gyorsreferencia, nyugtatömb, év végi zárás). Egyetlen hívójuk a
 * `components/finance/finance-pdf-library.tsx` volt, amit egyetlen útvonal sem
 * mountolt — vagyis a lelkész SOHA nem juthatott el hozzájuk a felületen. A
 * Súgó fül (`finance-sugo-tab.tsx`) csak a lentebbi `buildTopicPdfHtml`-t
 * használja, ezért a fájl maga ÉL, csak a halott fele tűnt el.
 */

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
