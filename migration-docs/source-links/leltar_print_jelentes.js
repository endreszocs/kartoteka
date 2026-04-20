// --- js/leltar_print_jelentes.js ---
// Vagyonleltári Jelentés nyomtatása — iktatás és metaadat kezeléssel
// Minta: penzugy_print_accounting.js toolbar + iktatás logika

window.printVagyonleltarJelentes = function(ev, isReprint) {
    var gyulNev = (currentSettings && currentSettings.intezmenyneve) ? currentSettings.intezmenyneve : '..............................';
    var gyulNevRo = (currentSettings && currentSettings.intezmenyneve_ro) ? currentSettings.intezmenyneve_ro : '..............................';
    var egyhazmegye = (currentSettings && currentSettings.egyhazmegye) ? currentSettings.egyhazmegye : '..............................';
    var lelkesz = (currentSettings && currentSettings.lelkesz) ? currentSettings.lelkesz : '..............................';

    var titulusok = ['Lelkipásztor', 'Gondnok', 'Pénztáros', 'Könyvelő', 'Irodavezető', 'Adminisztrátor', 'Esperes', 'Főgondnok', 'Ellenőr', 'Főjegyző'];
    var generateSigOptions = function(selected) {
        return titulusok.map(function(t) {
            return '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
        }).join('');
    };

    var fmt = function(num) {
        if (num === null || num === undefined || isNaN(num)) return '0,00';
        var n = Number(num);
        var parts = Math.abs(n).toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1];
    };

    // Amortizáció számítás
    var calcMaradvany = function(t) {
        var bErtek = parseFloat(t.beszerzesi_ertek) || 0;
        if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0 && t.beszerzes_datuma) {
            var bDate = new Date(t.beszerzes_datuma);
            var elteltHonapok = (ev - bDate.getFullYear()) * 12 + (12 - (bDate.getMonth() + 1));
            if (elteltHonapok < 0) elteltHonapok = 0;
            var mErtek = bErtek - (elteltHonapok * (bErtek / (t.hasznalati_ido_ev * 12)));
            return mErtek < 0 ? 0 : mErtek;
        }
        return bErtek;
    };

    // 7 kategória definíció
    var kategoriak = [
        { id: 1, nevHu: 'Alapeszközök', nevRo: 'Mijloace fixe', filter: 'Alapeszközök' },
        { id: 2, nevHu: 'Telkek, földek, erdők', nevRo: 'Terenuri si amplasamenturi', filter: 'Telkek_Földek' },
        { id: 3, nevHu: 'Csekély értékű tárgyak', nevRo: 'Obiecte de inventar', filter: 'Csekély értékű' },
        { id: 4, nevHu: 'Könyvek', nevRo: 'Cărţi', filter: 'Könyvek' },
        { id: 5, nevHu: 'Kegyszerek', nevRo: 'Obiecte de cult', filter: 'Kegyszerek' },
        { id: 6, nevHu: 'Részvények, Kárpótlási', nevRo: 'Acțiuni și titluri', filter: 'Kárpótlási' },
        { id: 7, nevHu: 'Bizományi', nevRo: 'Custodie', filter: 'Bizományi' }
    ];

    // Táblázat sorok generálása
    var rowsHtml = '';
    var totalBesz = 0;
    var totalMaradvany = 0;
    var tetelek = window.allLeltarTetelek || [];

    kategoriak.forEach(function(k) {
        var katTetelek = tetelek.filter(function(t) { return t.kategoria === k.filter; });
        var sumBesz = 0;
        var sumMaradvany = 0;
        katTetelek.forEach(function(t) {
            var qty = parseFloat(t.mennyiseg) || 1;
            sumBesz += (parseFloat(t.beszerzesi_ertek) || 0) * qty;
            sumMaradvany += calcMaradvany(t) * qty;
        });
        totalBesz += sumBesz;
        totalMaradvany += sumMaradvany;
        rowsHtml += '<tr>' +
            '<td style="text-align:center;">' + k.id + '</td>' +
            '<td><strong>' + k.nevRo + '</strong><br><span style="font-size:0.85em; color:#555;">' + k.nevHu + '</span></td>' +
            '<td style="text-align:center;">' + katTetelek.length + ' db</td>' +
            '<td style="text-align:right;">' + fmt(sumBesz) + '</td>' +
            '<td style="text-align:right; font-weight:bold;">' + fmt(sumMaradvany) + '</td>' +
            '</tr>';
    });

    // Mentett metaadatok előtöltése
    var savedIktato = (currentSettings && currentSettings.leltar_iktatoszam) || localStorage.getItem('print_leltar_iktato') || '';
    var savedDatum = (currentSettings && currentSettings.leltar_hatarozat_datum) || localStorage.getItem('print_leltar_datum') || '';
    var savedJkv = (currentSettings && currentSettings.leltar_hatarozat_szam) || localStorage.getItem('print_leltar_jkv') || '';
    var savedEsp = localStorage.getItem('print_leltar_esperes') || '';
    var isAlreadyIktatva = !!(currentSettings && currentSettings.leltar_iktatoszam);
    var isReprintFlag = isReprint || isAlreadyIktatva;

    // Nyomtatás dátuma (mai nap alapértelmezett)
    var today = new Date().toISOString().split('T')[0];

    // Év opciók generálása (visszamenőleges nyomtatáshoz)
    var currentYear = new Date().getFullYear();
    var evOptionsHtml = '';
    for (var y = currentYear; y >= 2020; y--) {
        evOptionsHtml += '<option value="' + y + '"' + (y === ev ? ' selected' : '') + '>' + y + '</option>';
    }

    // Nyomtatási ablak megnyitása
    var printWindow = window.open('', '_blank', 'width=1000,height=800');
    printWindow.document.write(
        '<html><head><title>Vagyonleltári Jelentés ' + ev + '</title>' +
        '<style>' +
        '@page { size: A4 portrait; margin: 10mm 8mm 10mm 8mm; }' +
        'body { font-family: "Times New Roman", serif; color: #000; margin: 0; padding: 0; font-size: 11pt; }' +
        '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }' +
        '.no-print { background: #f1f5f9; padding: 12px 15px; text-align: center; font-family: Arial, sans-serif; font-size: 13px; }' +
        '.no-print input, .no-print select { padding: 3px 6px; margin: 2px 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px; }' +
        '.no-print .btn { padding: 8px 20px; font-size: 14px; border: none; cursor: pointer; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 6px; }' +
        '.no-print .btn-primary { background: #0054a6; color: white; }' +
        '.no-print .btn-primary:disabled { background: #b0b0b0; cursor: not-allowed; }' +
        '.no-print .btn-secondary { background: #6c757d; color: white; margin-left: 8px; }' +
        '.no-print .err { color: #d63939; font-weight: bold; margin: 6px 0; font-size: 12px; }' +
        '@media print { .no-print { display: none !important; } }' +
        'table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 11pt; }' +
        'th, td { border: 1px solid black; padding: 10px; }' +
        'th { background-color: #f4f4f4; text-align: center; font-weight: bold; }' +
        '</style></head><body>' +

        // ═══ TOOLBAR ═══
        '<div class="no-print">' +
        '<strong style="font-size:15px;">Vagyonleltári Jelentés &mdash; ' + (isReprintFlag ? 'Újranyomtatás' : 'Nyomtatás és Iktatás') + '</strong><br>' +
        '<div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; align-items:center; margin-top:8px;">' +
        '<label>Leltár éve: <select id="input-ev" onchange="onEvChange()">' + evOptionsHtml + '</select></label>' +
        '<label>Nyomtatás dátuma: <input type="date" id="input-print-date" value="' + today + '" onchange="onPrintDateChange()"></label>' +
        '<label>Iktatószám: <input type="text" id="input-iktato" style="width:80px;" value="' + savedIktato + '" oninput="onFieldChange()"></label>' +
        '<label>Határozat: <input type="date" id="input-datum" value="' + savedDatum + '" onchange="onFieldChange()"></label>' +
        '<label>Jkv. szám: <input type="text" id="input-jkv" style="width:80px;" value="' + savedJkv + '" oninput="onFieldChange()"></label>' +
        '<label>Esperes: <input type="text" id="input-esperes" style="width:120px;" value="' + savedEsp + '" oninput="onFieldChange()"></label>' +
        '</div>' +
        '<div style="margin-top:8px;">' +
        '<label>1. aláíró: <select id="sel-sig1" onchange="updateSig(\'sig1\',this.value)"></select></label>' +
        '<label>2. aláíró: <select id="sel-sig2" onchange="updateSig(\'sig2\',this.value)"></select></label>' +
        '<label>3. aláíró: <select id="sel-sig3" onchange="updateSig(\'sig3\',this.value)"></select></label>' +
        '</div>' +
        '<div id="validation-msg" class="err"></div>' +
        '<button id="btn-print" class="btn btn-primary" onclick="iktatasEsNyomtatas()" disabled>' +
        (isReprintFlag ? 'Nyomtatás' : 'Iktatás és Nyomtatás') + '</button>' +
        '<button class="btn btn-secondary" onclick="window.close()">Vissza / Bezárás</button>' +
        '</div>' +

        // ═══ BORÍTÓLAP ═══
        '<div style="page-break-after: always; height: 270mm; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 0 5mm 15mm 5mm;">' +
            '<div style="margin-bottom: 10mm;">' +
                '<h2 style="font-size: 14pt; font-weight: bold; margin: 0 0 5mm 0;">Erdélyi Református Egyházkerület</h2>' +
                '<div style="font-size: 11pt; margin: 2mm 0;">Egyházmegye: <span style="display: inline-block; border-bottom: 1px solid #000; min-width: 50mm;">' + egyhazmegye + '</span></div>' +
                '<div style="font-size: 11pt; margin: 2mm 0;">Gyülekezet: <span style="display: inline-block; border-bottom: 1px solid #000; min-width: 50mm;">' + gyulNev + '</span></div>' +
            '</div>' +
            '<div style="text-align: center; margin: 15mm 0;">' +
                '<h1 style="font-size: 22pt; font-weight: bold; margin: 0;">REGISTRU INVENTAR</h1>' +
                '<h1 style="font-size: 20pt; font-weight: bold; margin: 5mm 0 0 0;">VAGYONLELTÁRI JELENTÉS</h1>' +
                '<p id="text-lezarva" style="font-size: 14pt; margin-top: 10mm;">Lezárva: 31.12.' + ev + '</p>' +
                '<p id="text-print-date" style="font-size: 11pt; margin-top: 3mm; color: #555;">Nyomtatva: ' + today + '</p>' +
            '</div>' +
            '<div style="font-size: 11pt; margin-top: 10mm;">' +
                '<div style="margin: 3mm 0;">Iktatószám: <span id="text-iktato" style="display: inline-block; border-bottom: 1px solid #000; min-width: 40mm;">' + (savedIktato || '....................') + '</span></div>' +
                '<div style="margin: 3mm 0;">Határozat dátuma: <span id="text-datum" style="display: inline-block; border-bottom: 1px solid #000; min-width: 40mm;">' + (savedDatum || '....................') + '</span></div>' +
                '<div style="margin: 3mm 0;">Jegyzőkönyvi szám: <span id="text-jkv" style="display: inline-block; border-bottom: 1px solid #000; min-width: 40mm;">' + (savedJkv || '....................') + '</span></div>' +
                '<div style="margin: 3mm 0;">Esperes: <span id="text-esperes" style="display: inline-block; border-bottom: 1px solid #000; min-width: 40mm;">' + (savedEsp || '....................') + '</span></div>' +
            '</div>' +
        '</div>' +

        // ═══ TARTALOM ═══
        '<div style="padding: 20px 40px;">' +
        '<div style="margin-bottom: 20px;">' +
            'Erdélyi Református Egyházkerület<br>' +
            'Egyházmegye: <strong>' + egyhazmegye + '</strong><br>' +
            'Unitate / Egység: <strong>' + gyulNev + ' / ' + gyulNevRo + '</strong>' +
        '</div>' +
        '<h2 style="text-align: center; font-size: 18pt; margin-bottom: 5px;">REGISTRU INVENTAR / VAGYONLELTÁRI JELENTÉS</h2>' +
        '<h4 id="text-content-lezarva" style="text-align: center; font-weight: normal; margin-top: 0; margin-bottom: 30px;">la data de / lezárva: 31.12.' + ev + '</h4>' +
        '<table>' +
        '<thead><tr>' +
            '<th style="width: 8%;">Nr.<br>Sz.</th>' +
            '<th style="width: 42%;">Recapitulatia elementelor inventariate<br>Vagyonelemek összesítője</th>' +
            '<th style="width: 10%;">Tételszám</th>' +
            '<th style="width: 20%;">Valoare contabilă<br>(Könyv szerinti érték)</th>' +
            '<th style="width: 20%;">Valoare de inventar<br>(Leltári maradványérték)</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '<tfoot><tr style="background-color: #f9f9f9;">' +
            '<td colspan="3" style="text-align: right; font-weight: bold;">TOTAL / ÖSSZESEN (RON):</td>' +
            '<td style="text-align: right; font-weight: bold;">' + fmt(totalBesz) + '</td>' +
            '<td style="text-align: right; font-weight: bold; font-size: 13pt; color: #1a569d;">' + fmt(totalMaradvany) + '</td>' +
        '</tr></tfoot></table>' +

        // Aláírók
        '<div style="display:flex; justify-content: space-around; margin-top: 60px; text-align:center;">' +
            '<div><span id="sig1">Lelkipásztor</span><br><br>.........................<br><strong>' + lelkesz + '</strong></div>' +
            '<div><span id="sig2">Gondnok</span><br><br>.........................<br><strong>.........................</strong></div>' +
            '<div><span id="sig3">Ellenőr</span><br><br>.........................<br><strong>.........................</strong></div>' +
        '</div>' +
        '</div>' +

        // ═══ SCRIPT: ESZKÖZTÁR LOGIKA ═══
        '<script>' +
            'var isReprint = ' + (isReprintFlag ? 'true' : 'false') + ';' +

            // Aláíró select opciók betöltése
            'var options = \'' + generateSigOptions('') + '\';' +
            '["sig1","sig2","sig3"].forEach(function(id){document.getElementById("sel-"+id).innerHTML=options;});' +

            // Előtöltés localStorage-ból
            'document.getElementById("sel-sig1").value = localStorage.getItem("print_leltar_sig1") || "Lelkipásztor";' +
            'document.getElementById("sel-sig2").value = localStorage.getItem("print_leltar_sig2") || "Gondnok";' +
            'document.getElementById("sel-sig3").value = localStorage.getItem("print_leltar_sig3") || "Ellenőr";' +

            // Frissítő függvények
            'function updateSig(id, val) {' +
                'document.getElementById(id).innerText = val;' +
                'localStorage.setItem("print_leltar_" + id, val);' +
            '}' +
            'function updateText(id, val) {' +
                'var el = document.getElementById(id);' +
                'if (el) el.innerText = val || "....................";' +
            '}' +

            // Nyomtatás dátuma változás
            'function onPrintDateChange() {' +
                'var pd = document.getElementById("input-print-date").value;' +
                'var el = document.getElementById("text-print-date");' +
                'if (el) el.innerText = "Nyomtatva: " + pd;' +
            '}' +

            // Év változás — lezárási dátum frissítése
            'function onEvChange() {' +
                'var selEv = document.getElementById("input-ev").value;' +
                'var el1 = document.getElementById("text-lezarva");' +
                'if (el1) el1.innerText = "Lezárva: 31.12." + selEv;' +
                'var el2 = document.getElementById("text-content-lezarva");' +
                'if (el2) el2.innerText = "la data de / lezárva: 31.12." + selEv;' +
            '}' +

            // Mező változás
            'function onFieldChange() {' +
                'var ikt = document.getElementById("input-iktato").value;' +
                'var dat = document.getElementById("input-datum").value;' +
                'var jkv = document.getElementById("input-jkv").value;' +
                'var esp = document.getElementById("input-esperes").value;' +
                'localStorage.setItem("print_leltar_iktato", ikt);' +
                'localStorage.setItem("print_leltar_datum", dat);' +
                'localStorage.setItem("print_leltar_jkv", jkv);' +
                'localStorage.setItem("print_leltar_esperes", esp);' +
                'updateText("text-iktato", ikt);' +
                'updateText("text-datum", dat);' +
                'updateText("text-jkv", jkv);' +
                'updateText("text-esperes", esp);' +
                'validateFields();' +
            '}' +

            // Inicializálás
            'updateSig("sig1", document.getElementById("sel-sig1").value);' +
            'updateSig("sig2", document.getElementById("sel-sig2").value);' +
            'updateSig("sig3", document.getElementById("sel-sig3").value);' +
            'onFieldChange();' +

            // Kötelező mezők validálása
            'function validateFields() {' +
                'var ikt = document.getElementById("input-iktato").value.trim();' +
                'var dat = document.getElementById("input-datum").value;' +
                'var jkv = document.getElementById("input-jkv").value.trim();' +
                'var msg = document.getElementById("validation-msg");' +
                'var btn = document.getElementById("btn-print");' +
                'var missing = [];' +
                'if (!ikt) missing.push("Iktatószám");' +
                'if (!dat) missing.push("Határozat dátuma");' +
                'if (!jkv) missing.push("Jkv. szám");' +
                'if (missing.length > 0) {' +
                    'msg.innerText = "Kötelező mezők: " + missing.join(", ");' +
                    'btn.disabled = true;' +
                '} else {' +
                    'msg.innerText = "";' +
                    'btn.disabled = false;' +
                '}' +
            '}' +

            // Iktatás és Nyomtatás
            'async function iktatasEsNyomtatas() {' +
                'var data = {' +
                    'iktatoszam: document.getElementById("input-iktato").value.trim(),' +
                    'datum: document.getElementById("input-datum").value,' +
                    'jkv: document.getElementById("input-jkv").value.trim()' +
                '};' +
                'if (!isReprint && window.opener && window.opener.saveLeltarMetadata) {' +
                    'try {' +
                        'await window.opener.saveLeltarMetadata(data);' +
                        'isReprint = true;' +
                    '} catch(e) { console.error("Leltár iktatási hiba:", e); }' +
                '}' +
                'window.print();' +
            '}' +
        '<\/script>' +
        '</body></html>'
    );
    printWindow.document.close();
};

// Leltár metaadatok mentése — bealitas + iktato tábla
window.saveLeltarMetadata = async function(data) {
    if (!data || !data.iktatoszam) return;

    // Ha már iktatva van, ne mentsük újra
    if (currentSettings.leltar_iktatoszam) {
        console.log('Leltár már iktatva:', currentSettings.leltar_iktatoszam);
        return;
    }

    try {
        var year = String(new Date().getFullYear());

        // 1) Metaadatok mentése a bealitas táblába
        var updatePayload = {
            leltar_iktatoszam: data.iktatoszam,
            leltar_hatarozat_datum: data.datum || null,
            leltar_hatarozat_szam: data.jkv || null
        };

        var updateRes = await _supabase.from('bealitas')
            .update(updatePayload)
            .eq('id', year)
            .eq('congregation_id', activeCongregationId);

        if (updateRes.error) throw updateRes.error;

        currentSettings.leltar_iktatoszam = data.iktatoszam;
        currentSettings.leltar_hatarozat_datum = data.datum;
        currentSettings.leltar_hatarozat_szam = data.jkv;

        // 2) Iktató táblába mentés
        var lastRes = await _supabase.from('iktato')
            .select('sequence_number')
            .eq('year', parseInt(year))
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .order('sequence_number', { ascending: false })
            .limit(1);

        var nextSeqNum = (lastRes.data && lastRes.data.length > 0) ? lastRes.data[0].sequence_number + 1 : 1;

        var gyulNev = (currentSettings && currentSettings.intezmenyneve) || 'Ismeretlen';
        var egyhazmegye = (currentSettings && currentSettings.egyhazmegye) || '';
        var today = data.datum || new Date().toISOString().split('T')[0];

        var iktatoPayload = {
            congregation_id: activeCongregationId,
            year: parseInt(year),
            sequence_number: nextSeqNum,
            direction: 'outgoing',
            kelt: today,
            subject: year + '. évi Vagyonleltári Jelentés',
            sender_or_recipient: egyhazmegye + ' Református Egyházmegye',
            file_folder: 'F.Á.',
            targykivonat: gyulNev + ' Ref. Egyházközség ' + year + '. évi vagyonleltár. Jkv: ' + (data.jkv || ''),
            elintezes_ideje: today,
            elintezes_modja: 'Nyomtatva és Irattározva',
            megjegyzes: 'Iktatószám: ' + data.iktatoszam + '. Automatikusan iktatva a leltár véglegesítésekor.'
        };

        var insertRes = await _supabase.from('iktato').insert(iktatoPayload);
        if (insertRes.error) console.error('Iktató mentés hiba:', insertRes.error);

        console.log('Leltár metaadatok sikeresen mentve:', data.iktatoszam);
    } catch (err) {
        console.error('Leltár iktatás kivétel:', err);
    }
};
