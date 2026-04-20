// --- js/penzugy_print_engine.js ---
function openPrintModal() { new bootstrap.Modal(document.getElementById('modal-print-info')).show(); }

async function processPrint() {
    if (typeof loadLib === 'function') await loadLib('html2pdf');
    const info = {
        iktato: document.getElementById('p-iktatoszam').value,
        em_iktato: document.getElementById('p-em-iktatoszam').value,
        datum: document.getElementById('p-datum').value,
        szam: document.getElementById('p-szam').value
    };
    
    if (!info.iktato || !info.datum) { alert("Iktatószám és Dátum kötelező!"); return; }

    const isAccounting = document.querySelector('#finance-tabs .active').getAttribute('href') === '#tab-szamadas';

    // 1. Borítóoldal
    const template = await fetch('components/print_template.html').then(r => r.text());
    let printHtml = template
        .replace(/{{CONGREGATION}}/g, currentSettings.intezmenyneve)
        .replace(/{{IKTATOSZAM}}/g, info.iktato)
        .replace(/{{EM_IKTATOSZAM}}/g, info.em_iktato)
        .replace(/{{YEAR}}/g, currentYear)
        .replace(/{{DATUM}}/g, info.datum)
        .replace(/{{SZAM}}/g, info.szam);

    // 2. Táblázatok összeállítása a memóriában lévő szamadasicel és koltsegvetes alapján
    const { data: budget } = await _supabase.from('koltsegvetes').select('*').eq('bealitasid', currentYear).eq('congregation_id', activeCongregationId);
    
    // Tényadatok letöltése a számadáshoz
    let actuals = {};
    if (isAccounting) {
        const { data: bev } = await _supabase.from('befizetes').select('osszeg, id_befizetescel').eq('congregation_id', activeCongregationId).eq('fizetettev', currentYear).eq('deleted', false);
        const { data: kia } = await _supabase.from('kiadas').select('osszeg, id_kiadascel').eq('congregation_id', activeCongregationId).eq('deleted', false);
        bev?.forEach(i => actuals[i.id_befizetescel] = (actuals[i.id_befizetescel] || 0) + Number(i.osszeg));
        kia?.forEach(i => actuals[i.id_kiadascel] = (actuals[i.id_kiadascel] || 0) + Number(i.osszeg));
    }

    let tableHtml = `<table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:10pt;">
        <thead>
            <tr style="background:#eee;">
                <th style="border:1px solid black; padding:5px;">Denumire - Megnevezés</th>
                <th style="border:1px solid black; padding:5px; text-align:center;">Nr.<br>Sor-szám</th>
                <th style="border:1px solid black; padding:5px; text-align:center;">Capitol/<br>subcapitol</th>
                <th style="border:1px solid black; padding:5px; text-align:right;">Prevederi<br>Költségvetés</th>
                ${isAccounting ? '<th style="border:1px solid black; padding:5px; text-align:right;">Executie<br>Számadás</th>' : ''}
            </tr>
        </thead><tbody>`;

    szamadasiCellek.forEach(c => {
        const b = budget?.find(x => x.szamadasicelid === c.id);
        const terv = b?.osszeg_modositott || b?.osszeg || 0;
        const teny = actuals[c.id] || 0;
        
        const boldStyle = !c.id.includes('.') ? 'font-weight:bold; background:#f9f9f9;' : '';
        
        tableHtml += `<tr style="${boldStyle}">
            <td style="border:1px solid black; padding:4px;">${c.nevro}<br><small>${c.nev}</small></td>
            <td style="border:1px solid black; padding:4px; text-align:center;">${c.sorszam || ''}</td>
            <td style="border:1px solid black; padding:4px; text-align:center;">${c.id}</td>
            <td style="border:1px solid black; padding:4px; text-align:right;">${terv.toFixed(2)}</td>
            ${isAccounting ? `<td style="border:1px solid black; padding:4px; text-align:right;">${teny.toFixed(2)}</td>` : ''}
        </tr>`;
    });
    
    tableHtml += `</tbody></table>`;

    const container = document.getElementById('print-container');
    container.innerHTML = printHtml + tableHtml;
    container.style.display = 'block';

    const opt = {
        margin: [10, 10],
        filename: `Szamadas_${currentYear}_${currentSettings.intezmenyneve}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save().then(() => {
        window.print();
        container.style.display = 'none';
        bootstrap.Modal.getInstance(document.getElementById('modal-print-info')).hide();
    });
}