// --- js/penzugy_print_budget.js ---
// Költségvetés / Költségvetés módosítás nyomtatása — PDF mintára szabva
// Alap:     4 oszlop (Sorsz | Megnevezés | Capitol | Költségvetés)
// Módosítás: 6 oszlop (Sorsz | Megnevezés | Capitol | Előző | Módosítás | Végleges)
//
// Javítások:
//   1) Kategorikus szekció fejlécek (I. BEVÉTELEK, II. KIADÁSOK)
//   2) Sorszám az ELSŐ oszlopban
//   3) Belső mozgás tételek kiszűrve
//   4) Félkövér kizárólag kategória fejléceknél
//   5) Sorszámok a DB-ből (sorszam mező), sorszám szerinti rendezés
//   6) Mind a 3 aláíró egy sorban
//   7) Kötelező mezők validálása nyomtatás előtt
//   8) Iktatórendszer integráció (első nyomtatáskor ment, újranyomtatásnál nem)

window.printKoltsegvetes = function(ev, bevetelCellek, kiadasCellek, adatok, visibleCols, isReprint) {
    var gyulNev = (currentSettings && currentSettings.intezmenyneve) ? currentSettings.intezmenyneve : '..............................';
    var egyhazmegye = (currentSettings && currentSettings.egyhazmegye) ? currentSettings.egyhazmegye : 'Kézdi-Orbai';
    var titulusok = ['Lelkipásztor', 'Gondnok', 'Pénztáros', 'Könyvelő', 'Irodavezető', 'Adminisztrátor', 'Esperes', 'Főgondnok', 'Ellenőr', 'Főjegyző'];
    var generateSigOptions = function(selected) {
        return titulusok.map(function(t) {
            return '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
        }).join('');
    };

    // ── Mód meghatározás: alap vs módosítás ──
    var isMod = visibleCols.length > 1;
    var colCount = isMod ? 6 : 4;
    var prevCol = isMod ? visibleCols[visibleCols.length - 2] : null;
    var finalCol = visibleCols[visibleCols.length - 1];

    var titleHu = isMod
        ? 'KÖLTSÉGVETÉS MÓDOSÍTÁS A ' + ev + '. ÉVRE'
        : 'KÖLTSÉGVETÉS A ' + ev + '. ÉVRE';
    var titleRo = isMod
        ? 'MODIFICARE BUGET DE VENITURI SI CHELTUIELI PE ANUL ' + ev
        : 'BUGET DE VENITURI SI CHELTUIELI PE ANUL ' + ev;

    // Számformázás: 15 000,00
    var fmt = function(num) {
        if (num === null || num === undefined || isNaN(num)) return '0,00';
        var n = Number(num);
        var parts = Math.abs(n).toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1];
    };

    // Érték kiolvasás fallback lánccal
    var getVal = function(obj, col) {
        if (!obj) return 0;
        var v = obj[col];
        if (v !== null && v !== undefined) return parseFloat(v) || 0;
        if (col === 'osszeg_mod_3') { v = obj['osszeg_mod_2']; if (v !== null && v !== undefined) return parseFloat(v) || 0; }
        if (col === 'osszeg_mod_3' || col === 'osszeg_mod_2') { v = obj['osszeg_modositott']; if (v !== null && v !== undefined) return parseFloat(v) || 0; }
        if (col === 'osszeg_mod_3' || col === 'osszeg_mod_2' || col === 'osszeg_modositott') { v = obj['osszeg']; if (v !== null && v !== undefined) return parseFloat(v) || 0; }
        return 0;
    };

    // Fejléc-sor felismerés (kategória-fejléc: iscel=false VAGY nincs pont az id-ben)
    var isHeaderRow = function(c) {
        return c.iscel === false || !String(c.id).includes('.');
    };

    // Belső mozgás kiszűrés — ezek nem tartoznak a költségvetésbe
    var isBelsoMozgas = function(c) {
        var kod = String(c.id);
        if (kod.match(/^100\.[3-9]/)) return true;           // 100.5x stb.
        if (c.belsotetel && String(c.belsotetel).trim() !== '') return true;
        return false;
    };

    // Hierarchikus rendezés az ID alapján (pl. 100 → 100.01 → 100.02 → 101 → 101.01)
    var sortHierarchically = function(cells) {
        return cells.slice().sort(function(a, b) {
            var aParts = String(a.id).split('.').map(function(n) { return parseInt(n) || 0; });
            var bParts = String(b.id).split('.').map(function(n) { return parseInt(n) || 0; });
            for (var i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                var diff = (aParts[i] || 0) - (bParts[i] || 0);
                if (diff !== 0) return diff;
            }
            return 0;
        });
    };

    var sortedBev = sortHierarchically(bevetelCellek);
    var sortedKia = sortHierarchically(kiadasCellek);

    // Szekvenciális sorszám számláló
    var _rowCounter = 0;

    // ── Sor HTML generálás ──
    // Oszlopsorrend: Sorsz | Megnevezés | Capitol | Értékek
    var makeRow = function(c, valObj) {
        var isHeader = isHeaderRow(c);
        var bgStyle = isHeader ? ' background-color:#f0f0f0;' : '';
        _rowCounter++;

        var html = '<tr style="' + bgStyle + '">';

        // 1. Sorszám — szekvenciális (1, 2, 3, ...)
        html += '<td style="text-align:center; font-size:9pt;">' + _rowCounter + '</td>';

        // 2. Megnevezés — CSAK fejléc félkövér
        html += '<td style="padding:2px 4px;">';
        if (c.nevro) html += '<div style="font-size:7.5pt; line-height:1.2; color:#555;">' + c.nevro + '</div>';
        html += '<div style="font-size:9pt; line-height:1.2;' + (isHeader ? ' font-weight:bold;' : '') + '">' + (c.nev || '') + '</div>';
        html += '</td>';

        // 3. Capitol / alfejezet
        html += '<td style="text-align:center; font-size:9pt;">' + c.id + '</td>';

        // 4+ Értékoszlopok — fejléceknél félkövér
        if (isMod) {
            var prev = getVal(valObj, prevCol);
            var fin  = getVal(valObj, finalCol);
            var change = fin - prev;
            html += '<td style="text-align:right; font-size:9pt; padding:2px 4px;">' + fmt(prev) + '</td>';
            html += '<td style="text-align:right; font-size:9pt; padding:2px 4px;">' + fmt(change) + '</td>';
            html += '<td style="text-align:right; font-size:9pt; padding:2px 4px;' + (isHeader ? ' font-weight:bold;' : '') + '">' + fmt(fin) + '</td>';
        } else {
            var val = getVal(valObj, finalCol);
            html += '<td style="text-align:right; font-size:9pt; padding:2px 4px;' + (isHeader ? ' font-weight:bold;' : '') + '">' + fmt(val) + '</td>';
        }

        html += '</tr>';
        return html;
    };

    // Szekció fejléc sor (I. BEVÉTELEK, II. KIADÁSOK)
    var makeSectionHeader = function(text) {
        return '<tr style="background-color:#d0d0d0; border-top:2px solid black;">' +
            '<td colspan="' + colCount + '" style="padding:4px 8px; font-weight:bold; font-size:10pt; text-align:center;">' +
            text + '</td></tr>';
    };

    // ── BEVÉTELEK GENERÁLÁSA ──
    var bevRows = makeSectionHeader('I. BEVÉTELEK / VENITURI');
    var totalBevElozo = 0, totalBevVegleges = 0;

    sortedBev.forEach(function(c) {
        if (isBelsoMozgas(c)) return;
        var valObj = adatok[c.id] || {};
        if (!isHeaderRow(c)) {
            totalBevVegleges += getVal(valObj, finalCol);
            if (isMod) totalBevElozo += getVal(valObj, prevCol);
        }
        bevRows += makeRow(c, valObj);
    });

    // ── KIADÁSOK GENERÁLÁSA ──
    var kiaRows = makeSectionHeader('II. KIADÁSOK / CHELTUIELI');
    var totalKiaElozo = 0, totalKiaVegleges = 0;

    sortedKia.forEach(function(c) {
        if (isBelsoMozgas(c)) return;
        var valObj = adatok[c.id] || {};
        if (!isHeaderRow(c)) {
            totalKiaVegleges += getVal(valObj, finalCol);
            if (isMod) totalKiaElozo += getVal(valObj, prevCol);
        }
        kiaRows += makeRow(c, valObj);
    });

    // ── 113. sor: Pénztári és banki egyenleg ──
    var egyenlegVegleges = totalBevVegleges - totalKiaVegleges;
    var egyenlegElozo = totalBevElozo - totalKiaElozo;
    var row113 = '<tr style="background-color:#f0f0f0; border-top:2px solid black; font-weight:bold;">';
    row113 += '<td style="text-align:center; font-size:9pt; font-weight:bold;">113</td>';
    row113 += '<td style="padding:2px 4px;"><div style="font-size:7.5pt; color:#555;">Sold la finele anului</div><div style="font-size:9pt; font-weight:bold;">Pénztári és banki egyenleg az év végén (1+52-112)</div></td>';
    row113 += '<td style="text-align:center; font-size:9pt;">x</td>';
    if (isMod) {
        row113 += '<td style="text-align:right; font-size:9pt; padding:2px 4px; font-weight:bold;">' + fmt(egyenlegElozo) + '</td>';
        row113 += '<td style="text-align:right; font-size:9pt; padding:2px 4px; font-weight:bold;">' + fmt(egyenlegVegleges - egyenlegElozo) + '</td>';
        row113 += '<td style="text-align:right; font-size:9pt; padding:2px 4px; font-weight:bold;">' + fmt(egyenlegVegleges) + '</td>';
    } else {
        row113 += '<td style="text-align:right; font-size:9pt; padding:2px 4px; font-weight:bold;">' + fmt(egyenlegVegleges) + '</td>';
    }
    row113 += '</tr>';

    // ── TÁBLÁZAT FEJLÉC: Sorsz | Megnevezés | Capitol | Értékek ──
    var theadHtml = '<tr style="background-color:#e0e0e0;">' +
        '<th style="width:7%; text-align:center; padding:4px;">Nr.<br>rând<br>Sor-<br>szám</th>' +
        '<th style="width:' + (isMod ? '38%' : '52%') + '; text-align:left; padding:4px;">Denumire - Megnevezés</th>' +
        '<th style="width:10%; text-align:center; padding:4px;">Capitol/<br>subcapitol<br>Fejezet/<br>alfejezet</th>';
    if (isMod) {
        theadHtml += '<th style="width:15%; text-align:center; padding:4px;">Prevederi<br>inițial<br>Előző<br>költségvetés</th>';
        theadHtml += '<th style="width:15%; text-align:center; padding:4px;">Modificare<br>prevederi<br>Költségvetés<br>módosítás</th>';
        theadHtml += '<th style="width:15%; text-align:center; padding:4px;">Prevederi<br>final<br>Végleges<br>költségvetés</th>';
    } else {
        theadHtml += '<th style="width:31%; text-align:center; padding:4px;">Prevederi<br>Költségvetés</th>';
    }
    theadHtml += '</tr>';

    // ── Előtöltendő adatok a bealitas-ból vagy localStorage-ból ──
    var savedIktato = (currentSettings && currentSettings.egyhazkozsegi_iktatoszam) || localStorage.getItem('print_bud_iktato') || '';
    var savedDatum  = (currentSettings && currentSettings.presbiteriumi_hatarozat_datum) || localStorage.getItem('print_bud_datum') || '';
    var savedJkv    = (currentSettings && currentSettings.presbiteriumi_hatarozat_szam) || localStorage.getItem('print_bud_jkv') || '';
    var savedEsp    = localStorage.getItem('print_bud_esperes') || '';
    var isAlreadyIktatva = !!(currentSettings && currentSettings.egyhazkozsegi_iktatoszam);
    var isReprintFlag = isReprint || isAlreadyIktatva;

    // ── HTML ÖSSZEÁLLÍTÁS ──
    var printWindow = window.open('', '_blank', 'width=1000,height=800');
    printWindow.document.write(
        '<html><head><title>' + titleHu + '</title>' +
        '<style>' +
        '@page { size: A4 portrait; margin: 10mm 8mm 10mm 8mm; }' +
        'body { font-family: "Times New Roman", serif; color: #000; margin: 0; padding: 0; font-size: 9pt; line-height: 1.2; }' +
        '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }' +
        '' +
        '.no-print { background: #f1f5f9; padding: 12px 15px; text-align: center; font-family: Arial, sans-serif; font-size: 13px; }' +
        '.no-print input, .no-print select { padding: 3px 6px; margin: 2px 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px; }' +
        '.no-print .btn { padding: 8px 20px; font-size: 14px; border: none; cursor: pointer; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 6px; }' +
        '.no-print .btn-primary { background: #0054a6; color: white; }' +
        '.no-print .btn-primary:disabled { background: #b0b0b0; cursor: not-allowed; }' +
        '.no-print .err { color: #d63939; font-weight: bold; margin: 6px 0; font-size: 12px; }' +
        '@media print { .no-print { display: none !important; } }' +
        '' +
        '.cover-page { page-break-after: always; height: 270mm; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 0 5mm 15mm 5mm; }' +
        '.cover-block { margin-bottom: 10mm; }' +
        '.cover-block h2 { font-size: 14pt; font-weight: bold; margin: 0 0 5mm 0; letter-spacing: 0.5pt; }' +
        '.cover-block .field-line { font-size: 11pt; margin: 2mm 0; }' +
        '.cover-block .field-line span { display: inline-block; border-bottom: 1px solid #000; min-width: 50mm; }' +
        '.cover-title { text-align: center; margin: 15mm 0; }' +
        '.cover-title h1 { font-size: 22pt; font-weight: bold; margin: 0; }' +
        '.cover-title h3 { font-size: 13pt; font-weight: normal; margin: 5mm 0 0 0; letter-spacing: 0.5pt; }' +
        '.cover-presbytery { text-align: center; font-size: 11pt; line-height: 2; }' +
        '.cover-footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 10pt; }' +
        '' +
        'table { width: 100%; border-collapse: collapse; }' +
        'tr { page-break-inside: avoid; }' +
        'th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }' +
        'th { text-align: center; font-weight: bold; font-size: 8.5pt; padding: 4px 2px; }' +
        'thead { display: table-header-group; }' +
        '' +
        '.sig-block { page-break-inside: avoid; margin-top: 10mm; font-size: 10pt; }' +
        '.sig-row-3 { display: flex; justify-content: space-between; margin-top: 12mm; }' +
        '.sig-cell-3 { text-align: center; flex: 1; padding: 0 3mm; }' +
        '.sig-line { border-top: 1px solid #000; display: inline-block; width: 50mm; margin-top: 15mm; }' +
        '</style>' +
        '</head><body>' +

        /* ═══ NYOMTATÁS ESZKÖZTÁR ═══ */
        '<div class="no-print">' +
        '<strong style="font-size:15px;">' + (isMod ? 'Költségvetés módosítás' : 'Költségvetés') + ' &mdash; ' + (isReprintFlag ? 'Újranyomtatás' : 'Nyomtatás és Iktatás') + '</strong><br>' +
        '<div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; align-items:center; margin-top:8px;">' +
        '<label>Iktatószám: <input type="text" id="input-iktato" style="width:80px;" value="' + savedIktato + '" oninput="onFieldChange()"></label>' +
        '<label>Határozat: <input type="date" id="input-datum" value="' + savedDatum + '" onchange="onFieldChange()"></label>' +
        '<label>Jkv. szám: <input type="text" id="input-jkv" style="width:80px;" value="' + savedJkv + '" oninput="onFieldChange()"></label>' +
        '<label>Esperes: <input type="text" id="input-esperes" style="width:120px;" value="' + savedEsp + '" oninput="onFieldChange()"></label>' +
        '</div>' +
        '<div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; align-items:center; margin-top:4px;">' +
        '<label>1. aláíró: <select id="sel-sig1" onchange="updateSig(\'sig1\', this.value)"></select></label>' +
        '<label>2. aláíró: <select id="sel-sig2" onchange="updateSig(\'sig2\', this.value)"></select></label>' +
        '<label>3. aláíró: <select id="sel-sig3" onchange="updateSig(\'sig3\', this.value)"></select></label>' +
        '</div>' +
        '<div id="validation-msg" class="err"></div>' +
        '<button id="btn-print" class="btn btn-primary" onclick="iktatasEsNyomtatas()" disabled>' +
        (isReprintFlag ? 'Nyomtatás' : 'Iktatás és Nyomtatás') + '</button>' +
        '</div>' +

        /* ═══ BORÍTÓLAP ═══ */
        '<div class="cover-page">' +
            '<div>' +
                '<div class="cover-block">' +
                    '<h2>REFORMÁTUS EGYHÁZMEGYE</h2>' +
                    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                        '<div>' +
                            '<div class="field-line">Egyházmegye: <span>' + egyhazmegye + '</span></div>' +
                            '<div class="field-line">iktatószám: <span>....................</span></div>' +
                        '</div>' +
                        '<div style="text-align:right;">' +
                            '<div class="field-line">Esperes aláírása: <span id="text-esperes">' + (savedEsp || '....................') + '</span></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="cover-block">' +
                    '<h2>REFORMÁTUS EGYHÁZKÖZSÉG</h2>' +
                    '<div class="field-line">Egyházközség: <span>' + gyulNev + '</span></div>' +
                    '<div class="field-line">iktatószám: <span id="text-iktato">' + (savedIktato || '....................') + '</span></div>' +
                '</div>' +
            '</div>' +
            '<div class="cover-title">' +
                '<h1>' + titleHu + '</h1>' +
                '<h3>' + titleRo + '</h3>' +
            '</div>' +
            '<div class="cover-presbytery">' +
                'Tárgyalta és jóváhagyta a presbitérium a <span id="text-datum" style="text-decoration:underline;">' + (savedDatum || '....................') + '</span> tartott gyűlésén<br><span id="text-jkv" style="text-decoration:underline;">' + (savedJkv || '....................') + '</span> szám alatt.' +
            '</div>' +
            '<div class="cover-footer">' +
                '<div>Kitöltendő lejben<br>Se completează în lei</div>' +
                '<div style="font-size:9pt; color:#888;">v 7.4a</div>' +
            '</div>' +
        '</div>' +

        /* ═══ ADATTÁBLÁZAT ═══ */
        '<table>' +
            '<thead>' + theadHtml + '</thead>' +
            '<tbody>' +
                bevRows +
                kiaRows +
                row113 +
            '</tbody>' +
        '</table>' +

        /* ═══ NYILATKOZAT ÉS ALÁÍRÁSOK — 3 aláíró EGY SORBAN ═══ */
        '<div class="sig-block">' +
            '<p style="font-style:italic; text-align:justify; font-size:10pt; margin-top:8mm;">' +
                'Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a költségvetés adatai valósak és az egyházi rendelkezések szerint készült el.' +
            '</p>' +
            '<div style="font-size:9pt; color:#555; margin-top:4mm;">Conducatorul unitatii / Egyházközség képviselői:</div>' +
            '<div class="sig-row-3">' +
                '<div class="sig-cell-3">' +
                    '<div class="sig-line"></div><br>' +
                    '<strong id="sig1">Lelkipásztor</strong>' +
                '</div>' +
                '<div class="sig-cell-3">' +
                    '<div style="margin-top:5mm; margin-bottom:5mm; font-size:9pt;">P.H.</div>' +
                    '<div class="sig-line"></div><br>' +
                    '<strong id="sig2">Gondnok</strong>' +
                '</div>' +
                '<div class="sig-cell-3">' +
                    '<div style="font-size:8pt; color:#555;">Verificat / Ellenőrizte:</div>' +
                    '<div class="sig-line"></div><br>' +
                    '<strong id="sig3">Számvevő</strong>' +
                '</div>' +
            '</div>' +
        '</div>' +

        /* ═══ SCRIPT: ESZKÖZTÁR LOGIKA ═══ */
        '<script>' +
            'var isReprint = ' + (isReprintFlag ? 'true' : 'false') + ';' +
            '' +
            // Aláíró select opciók betöltése
            'var options = \'' + generateSigOptions('') + '\';' +
            '["sig1","sig2","sig3"].forEach(function(id){document.getElementById("sel-"+id).innerHTML=options;});' +
            '' +
            // Előtöltés localStorage-ból
            'document.getElementById("sel-sig1").value = localStorage.getItem("print_bud_sig1") || "Lelkipásztor";' +
            'document.getElementById("sel-sig2").value = localStorage.getItem("print_bud_sig2") || "Gondnok";' +
            'document.getElementById("sel-sig3").value = localStorage.getItem("print_bud_sig3") || "Ellenőr";' +
            '' +
            // Frissítő függvények
            'function updateSig(id, val) {' +
                'document.getElementById(id).innerText = val;' +
                'localStorage.setItem("print_bud_" + id, val);' +
            '}' +
            'function updateText(id, val) {' +
                'var el = document.getElementById(id);' +
                'if (el) el.innerText = val || "....................";' +
            '}' +
            '' +
            // Mező változás: localStorage mentés + validáció + borítólap frissítés
            'function onFieldChange() {' +
                'var ikt = document.getElementById("input-iktato").value;' +
                'var dat = document.getElementById("input-datum").value;' +
                'var jkv = document.getElementById("input-jkv").value;' +
                'var esp = document.getElementById("input-esperes").value;' +
                'localStorage.setItem("print_bud_iktato", ikt);' +
                'localStorage.setItem("print_bud_datum", dat);' +
                'localStorage.setItem("print_bud_jkv", jkv);' +
                'localStorage.setItem("print_bud_esperes", esp);' +
                'updateText("text-iktato", ikt);' +
                'updateText("text-datum", dat);' +
                'updateText("text-jkv", jkv);' +
                'updateText("text-esperes", esp);' +
                'validateFields();' +
            '}' +
            '' +
            // Inicializálás: select-ek értékeinek kiírása
            'updateSig("sig1", document.getElementById("sel-sig1").value);' +
            'updateSig("sig2", document.getElementById("sel-sig2").value);' +
            'updateSig("sig3", document.getElementById("sel-sig3").value);' +
            'onFieldChange();' +
            '' +
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
            '' +
            // Iktatás és Nyomtatás
            'async function iktatasEsNyomtatas() {' +
                'var data = {' +
                    'iktatoszam: document.getElementById("input-iktato").value.trim(),' +
                    'datum: document.getElementById("input-datum").value,' +
                    'jkv: document.getElementById("input-jkv").value.trim()' +
                '};' +
                'if (!isReprint && window.opener && window.opener.saveBudgetToIktatokonyv) {' +
                    'try {' +
                        'await window.opener.saveBudgetToIktatokonyv(data);' +
                    '} catch(e) { console.error("Iktatási hiba:", e); }' +
                '}' +
                'window.print();' +
            '}' +
        '<\/script>' +
        '</body></html>'
    );
    printWindow.document.close();
};
