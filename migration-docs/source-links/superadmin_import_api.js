// === js/superadmin_import_api.js ===
// Tömeges importálás: Bevétel (Kassza), Munkanapló, Keresztelési Anyakönyv

// ==========================================
// SUPABASE KLIENS FALLBACK
// Ha az _admin service_role kulcsa érvényes → azt használja.
// Ha placeholder (IDE_MASOLJA...) → anon kulccsal dolgozik (RLS kikapcsolt táblákon működik).
// ==========================================
(function() {
    var adminKeyOk = typeof _admin !== 'undefined' &&
        typeof _admin.from === 'function' &&
        !String(window.S_ADMIN_KEY || '').includes('IDE_MASOLJA');
    // Ha van _admin (service role) → azt használjuk; különben a már bejelentkezett _supabase klienst
    // FONTOS: NEM hozunk létre új anon klienst, mert annak nincs auth session → RLS blokkolja az INSERT-et!
    window._importDb = adminKeyOk ? _admin : (window._supabase || null);
    if (!window._importDb) {
        console.warn('[Import] Nincs elérhető Supabase kliens! Importálás nem fog működni.');
    }
})();

// ==========================================
// KÖZÖS STATE & HELPERS
// ==========================================
let _bevImportData = [], _bevImportHeaders = [];
let _mnImportData = [], _mnImportHeaders = [];
let _akImportData = [], _akImportHeaders = [];
let _akMatchedRows = [];
let _akAllMembers = [];

// Gyülekezet ID megbízható kinyerése — több forrásból próbálkozik
async function _getActiveCongregationId() {
    // 1. window.activeCongregationId (ha az oldal beállította)
    if (window.activeCongregationId) return window.activeCongregationId;

    // 2. localStorage (ha korábban el lett mentve)
    var fromStorage = localStorage.getItem('congregation_id') || localStorage.getItem('activeCongregationId');
    if (fromStorage) return fromStorage;

    // 3. Supabase profilból lekérdezés
    try {
        var db = window._importDb || window._supabase;
        if (!db) return null;
        var userRes = await db.auth.getUser();
        if (userRes.data && userRes.data.user) {
            var profRes = await db.from('profiles').select('congregation_id').eq('id', userRes.data.user.id).single();
            if (profRes.data && profRes.data.congregation_id) {
                window.activeCongregationId = profRes.data.congregation_id;
                return profRes.data.congregation_id;
            }
        }
    } catch(e) { console.warn('Gyülekezet ID lekérdezési hiba:', e); }

    return null;
}

function _parseExcelDate(val) {
    if (!val && val !== 0) return null;
    // JS Date objektum (XLSX cellDates:true esetén)
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        var y = val.getFullYear(), m = String(val.getMonth() + 1).padStart(2, '0'), d = String(val.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
    // Excel sorszám (serial date)
    if (typeof val === 'number' && val > 10000) {
        var dt = new Date((val - 25569) * 86400 * 1000);
        return dt.toISOString().split('T')[0];
    }
    var s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s.replace(/\./g, '-');
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
        var parts = s.split('.');
        return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    // dd/MM/yyyy vagy dd-MM-yyyy
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
        var p = s.split(/[\/\-]/);
        return p[2] + '-' + p[1] + '-' + p[0];
    }
    var dt2 = new Date(s);
    if (!isNaN(dt2.getTime())) return dt2.toISOString().split('T')[0];
    return null;
}

function _parseAmount(val) {
    if (!val && val !== 0) return 0;
    const s = String(val).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    return parseFloat(s) || 0;
}

// Minden importtab gyülekezet-választójának feltöltése
// Auto-detektálja a bejelentkezett felhasználó gyülekezetét és előre kiválasztja
async function loadImportCongregations() {
    const { data, error } = await _importDb.from('congregations').select('id, nev_hu, name').order('nev_hu');
    if (error) { console.error('Gyülekezetek betöltési hiba:', error); alert('Gyülekezetek betöltése sikertelen:\n' + error.message); return; }
    if (!data || data.length === 0) { alert('Nem tölthetők be a gyülekezetek. Ellenőrizze a Supabase kapcsolatot és az RLS beállításokat a congregations táblán.'); return; }

    // Bejelentkezett felhasználó gyülekezetének auto-detektálása
    let userCongId = null;
    try {
        const { data: { user } } = await _importDb.auth.getUser();
        if (user) {
            const { data: prof } = await _importDb.from('profiles').select('congregation_id').eq('id', user.id).single();
            userCongId = prof?.congregation_id || null;
        }
    } catch(e) { /* Nincs aktív session – kézi választás szükséges */ }

    ['imp-bev-cong', 'imp-ak-cong', 'imp-ikt-cong'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel || sel.options.length > 1) return;
        data.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nev_hu || c.name;
            if (userCongId && c.id === userCongId) opt.selected = true;
            sel.appendChild(opt);
        });
        // Ha auto-detektált a Kassza-tab gyülekezete → töltsük be a számlasorokat is
        if (userCongId && selId === 'imp-bev-cong') onBevCongChange();
    });
}

// ==========================================
// TAB 4: BEVÉTEL (KASSZA/KÉSZPÉNZ) IMPORT
// ==========================================

window.onBevCongChange = async function() {
    const congId = document.getElementById('imp-bev-cong').value;
    if (!congId) return;

    const [{ data: bevCells }, { data: szCellek }] = await Promise.all([
        _importDb.from('befizetescel').select('id, id_szamadasicel').order('id'),
        _importDb.from('szamadasicel').select('id, nev').order('sorszam')
    ]);

    const szMap = {};
    szCellek?.forEach(c => { szMap[c.id] = c.nev; });

    const sel = document.getElementById('imp-bev-default-cell');
    sel.innerHTML = '<option value="">-- Válasszon alapértelmezett bevételi tételt --</option>';
    bevCells?.forEach(c => {
        if (!c.id_szamadasicel) return;
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.id_szamadasicel} – ${szMap[c.id_szamadasicel] || ''}`;
        sel.appendChild(opt);
    });

    document.getElementById('imp-bev-step1').classList.remove('d-none');
    document.getElementById('imp-bev-upload').classList.remove('d-none');
};

window.handleBevExcel = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        _bevImportHeaders = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []).filter(Boolean);
        _bevImportData = XLSX.utils.sheet_to_json(ws);
        if (_bevImportData.length === 0) { alert('Az Excel fájl üres!'); return; }
        _generateBevMapping();
    };
    reader.readAsArrayBuffer(file);
};

function _generateBevMapping() {
    const fields = [
        { val: '', label: '-- Kihagyás --' },
        { val: 'datum', label: 'Dátum (ÉÉÉÉ-HH-NN) *' },
        { val: 'osszeg', label: 'Összeg (RON) *' },
        { val: 'fizetettev', label: 'Pénzügyi év (pl. 2024)' },
        { val: 'iratszam', label: 'Bizonylat / Iratszám' },
        { val: 'megjegyzes', label: 'Megjegyzés' },
        { val: 'forrasa', label: 'Befizető neve (szöveg)' },
        { val: 'szemely_nev', label: 'Egyháztag neve (személyhozzárendeléshez)' },
        { val: 'celkod', label: 'Számlakód (pl. 101.01) – soronként más ha kell' },
    ];
    let html = '';
    _bevImportHeaders.forEach(header => {
        const lh = String(header).toLowerCase();
        let auto = '';
        if (lh.includes('dátum') || lh.includes('datum') || lh === 'date') auto = 'datum';
        if (lh.includes('összeg') || lh.includes('osszeg') || lh.includes('amount') || lh.includes('ron')) auto = 'osszeg';
        if (lh.includes('iratszám') || lh.includes('bizonylat') || lh.includes('nyugta') || lh.includes('sorszám')) auto = 'iratszam';
        if (lh.includes('megjegyzés') || lh.includes('megjegyzes')) auto = 'megjegyzes';
        if (lh.includes('befizető') || lh.includes('fizető')) auto = 'forrasa';
        if ((lh.includes('pénzügyi') && lh.includes('év')) || lh.includes('fizetett') || lh === 'ev' || lh === 'year') auto = 'fizetettev';
        if (lh.includes('tag neve') || lh.includes('személy') || lh.includes('egyháztag')) auto = 'szemely_nev';
        if (lh.includes('kód') || lh.includes('cél') || lh.includes('tétel') || lh.includes('cel')) auto = 'celkod';
        const opts = fields.map(f => `<option value="${f.val}" ${f.val === auto ? 'selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td>
            <td><select class="form-select form-select-sm bev-map-sel" data-col="${header}">${opts}</select></td></tr>`;
    });
    document.getElementById('bev-mapping-tbody').innerHTML = html;
    document.getElementById('bev-row-count').textContent = `${_bevImportData.length} sor importálásra kész`;
    document.getElementById('imp-bev-step2').classList.remove('d-none');
}

window.executeBevImport = async function() {
    const congId = document.getElementById('imp-bev-cong').value;
    const defaultCell = document.getElementById('imp-bev-default-cell').value;
    if (!congId) { alert('Válasszon gyülekezetet!'); return; }

    const btn = document.getElementById('btn-execute-bev-import');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importálás folyamatban...';
    btn.disabled = true;

    try {
        const mapping = {};
        document.querySelectorAll('.bev-map-sel').forEach(s => { if (s.value) mapping[s.dataset.col] = s.value; });

        const [{ data: bevCells }, { data: tagok }] = await Promise.all([
            _importDb.from('befizetescel').select('id, id_szamadasicel'),
            _importDb.from('szemely').select('id, csaladnev, k_nev').eq('congregation_id', congId).eq('isvisible', true)
        ]);

        const celByKod = {};
        bevCells?.forEach(c => { if (c.id_szamadasicel) celByKod[c.id_szamadasicel.trim()] = c.id; });

        const toInsert = [];
        let skipped = 0;
        const ts = Date.now();

        for (let i = 0; i < _bevImportData.length; i++) {
            const row = _bevImportData[i];
            const get = (field) => {
                const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
                return col !== undefined ? (row[col] ?? null) : null;
            };

            const osszeg = _parseAmount(get('osszeg'));
            if (osszeg <= 0) { skipped++; continue; }

            const datum = _parseExcelDate(get('datum')) || new Date().toISOString().split('T')[0];

            // Számlakód meghatározása
            let celId = defaultCell || null;
            const celKodRaw = get('celkod');
            if (celKodRaw) {
                const lookup = celByKod[String(celKodRaw).trim()];
                if (lookup) celId = lookup;
            }
            if (!celId) { skipped++; continue; }

            // Személy opcionális párosítás névből
            let szemelyId = null;
            const szNev = get('szemely_nev') || get('forrasa');
            if (szNev && tagok) {
                const normNev = String(szNev).trim().toLowerCase();
                const found = tagok.find(t =>
                    `${t.csaladnev || ''} ${t.k_nev || ''}`.trim().toLowerCase() === normNev
                );
                if (found) szemelyId = found.id;
            }

            const evRaw = get('fizetettev');
            const fizetettev = evRaw ? parseInt(evRaw) : parseInt(datum.substring(0, 4));

            toInsert.push({
                xkey: `B-${ts}-${i}`,
                congregation_id: congId,
                id_befizetescel: parseInt(celId),
                datum: datum,
                irattipus: 'Készpénz',
                iratszam: get('iratszam') ? String(get('iratszam')) : null,
                megjegyzes: get('megjegyzes') ? String(get('megjegyzes')) : null,
                forrasa: get('forrasa') ? String(get('forrasa')) : (get('szemely_nev') ? String(get('szemely_nev')) : null),
                fizetettev: fizetettev,
                osszeg: osszeg,
                id_szemely: szemelyId,
                deleted: false,
                is_potlas: false
            });
        }

        if (toInsert.length === 0) {
            alert(`Nem volt importálható sor.\nKihagyott: ${skipped} (összeg=0 vagy hiányzó számlakód)\n\nEllenőrizze: összeget tartalmazó oszlop, számlakód vagy alapértelmezett tétel megadva?`);
            return;
        }

        // Kötegelt beillesztés (100 soronként)
        for (let b = 0; b < toInsert.length; b += 100) {
            const { error } = await _importDb.from('befizetes').insert(toInsert.slice(b, b + 100));
            if (error) throw error;
        }

        alert(`✅ Import sikeres!\n\nBevitt: ${toInsert.length} bevételi tétel\nEbből személyhez rendelve: ${toInsert.filter(r => r.id_szemely).length}\nKihagyott (összeg=0 / kód hiányzik): ${skipped}`);
        document.getElementById('imp-bev-step2').classList.add('d-none');
        document.getElementById('imp-bev-file').value = '';
        _bevImportData = []; _bevImportHeaders = [];

    } catch (err) {
        alert('Hiba az importálás során:\n' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// ==========================================
// TAB 5: MUNKANAPLÓ IMPORT
// A hivatalos EREK Munkanapló sablon 3 munkalappal rendelkezik:
//   Szolgalati_alkalmak → kategoria = 'szolgalat'
//   Katekezis            → kategoria = 'katekezis'
//   Csaladlatogatas      → kategoria = 'latogatas'
// Egyéb (nem-hivatalos) Excel fájlokból is importálható oszlop-párosítással.
// ==========================================

var _mnWorkbook = null;
var _mnIsOfficial = false; // Hivatalos EREK sablon-e?
var _mnSheetData = {};     // { sheetName: { kategoria, rows[], enabled } }
var _mnCustomData = [];    // Nem-hivatalos: egyedi mapping adatok
var _mnCustomHeaders = []; // Nem-hivatalos: fejléc nevek
var _mnAllRows = [];       // Nem-hivatalos: nyers sorok

// A hivatalos sablon munkalapjainak felismerése
var _mnOfficialSheets = {
    'Szolgalati_alkalmak': 'szolgalat',
    'Szolgálati_alkalmak': 'szolgalat',
    'Katekezis': 'katekezis',
    'Katekézis': 'katekezis',
    'Csaladlatogatas': 'latogatas',
    'Családlátogatás': 'latogatas',
    'Csaladlatogatas': 'latogatas'
};

// A hivatalos sablon oszlop-pozíciói (0-alapú index, D=3, E=4, ...)
var _mnOfficialCols = {
    szolgalat: {
        // D=sorszám(skip), E=Dátum, F=Jellege, G=Du, H=Férfi, I=Nő, J=Bibliaolvasás, K=Alapige, L-Q=Ének1-6, R=Szolgált, S=Persely, T=Megjegyzés
        datum: 4, jellege: 5, du: 6, ferfi: 7, no: 8, bibliaolvasas: 9, alapige: 10,
        enek1: 11, enek2: 12, enek3: 13, enek4: 14, enek5: 15, enek6: 16,
        szolgalt: 17, persely: 18, megjegyzes: 19,
        headerRow: 2 // 0-alapú: 3. sor az Excelben
    },
    katekezis: {
        // D=sorszám(skip), E=Dátum, F=Jellege, G=Részt vett, H=Tananyag, I=Persely, J=Tartotta, K=Megjegyzés
        datum: 4, jellege: 5, osszesen: 6, tananyag: 7, persely: 8, szolgalt: 9, megjegyzes: 10,
        headerRow: 2
    },
    latogatas: {
        // D=sorszám(skip), E=Dátum, F=CsL/BL, G=Család neve, H=Család címe, I=Jelen volt, J=Jegyzet
        datum: 4, jellege: 5, csalad_nev: 6, cim: 7, osszesen: 8, megjegyzes: 9,
        headerRow: 2
    }
};

window.handleMnExcel = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        _mnWorkbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        _mnSheetData = {};
        _mnCustomData = [];
        _mnCustomHeaders = [];
        _mnIsOfficial = false;

        // Hivatalos sablon felismerés: legalább 2 ismert munkalap neve egyezik
        var matchedSheets = 0;
        _mnWorkbook.SheetNames.forEach(function(name) {
            var kat = _mnOfficialSheets[name] || _mnOfficialSheets[name.replace(/\s+/g, '_')];
            if (kat) matchedSheets++;
        });
        _mnIsOfficial = matchedSheets >= 2;

        if (_mnIsOfficial) {
            _processMnOfficialWorkbook();
        } else {
            _processMnCustomWorkbook();
        }
    };
    reader.readAsArrayBuffer(file);
};

// --- HIVATALOS EREK SABLON FELDOLGOZÁSA ---

function _processMnOfficialWorkbook() {
    var panel = document.getElementById('imp-mn-sheets-panel');
    var listEl = document.getElementById('imp-mn-sheets-list');
    // Ha a modal elemek nem léteznek, fallback egyedi importra
    if (!panel || !listEl) { _mnIsOfficial = false; _processMnCustomWorkbook(); return; }
    var html = '';

    _mnWorkbook.SheetNames.forEach(function(name) {
        var kat = _mnOfficialSheets[name] || _mnOfficialSheets[name.replace(/\s+/g, '_')];
        if (!kat) return;

        var ws = _mnWorkbook.Sheets[name];
        var allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        var colDef = _mnOfficialCols[kat];
        var headerIdx = colDef.headerRow;

        // Adat sorok kiszűrése: fejléc sor után, van dátum (E oszlop)
        var dataRows = [];
        for (var r = headerIdx + 1; r < allRows.length; r++) {
            var row = allRows[r];
            if (!row) continue;
            var datumVal = row[colDef.datum];
            if (!datumVal && datumVal !== 0) continue;
            var parsedDate = _parseExcelDate(datumVal);
            if (!parsedDate) continue;
            // Legalább a dátum és jellege legyen kitöltve (vagy csak a dátum)
            dataRows.push({ raw: row, datum: parsedDate });
        }

        _mnSheetData[name] = { kategoria: kat, rows: dataRows, enabled: dataRows.length > 0 };

        var icons = { szolgalat: 'ti-church', katekezis: 'ti-school', latogatas: 'ti-home-heart' };
        var colors = { szolgalat: 'green', katekezis: 'blue', latogatas: 'orange' };
        var labels = { szolgalat: 'Szolgálati alkalmak', katekezis: 'Katekézis', latogatas: 'Családlátogatás' };

        html += '<div class="d-flex align-items-center gap-2 mb-2 p-2 rounded border">' +
            '<input type="checkbox" class="form-check-input mn-sheet-chk" data-sheet="' + name + '" ' + (dataRows.length > 0 ? 'checked' : 'disabled') + ' onchange="_mnUpdateSummary()">' +
            '<i class="ti ' + (icons[kat] || 'ti-file') + ' text-' + (colors[kat] || 'muted') + ' fs-2"></i>' +
            '<div class="flex-fill">' +
                '<div class="fw-bold">' + (labels[kat] || name) + '</div>' +
                '<div class="text-muted small">' + name + ' — <b>' + dataRows.length + '</b> importálható sor</div>' +
            '</div>' +
            '<span class="badge bg-' + (colors[kat] || 'secondary') + '-lt">' + (labels[kat] || kat) + '</span>' +
        '</div>';
    });

    if (!html) {
        alert('A fájl nem tartalmaz felismerhető munkalapokat!');
        return;
    }

    listEl.innerHTML = html;
    var hrEl = document.getElementById('imp-mn-header-row');
    var cmEl = document.getElementById('imp-mn-custom-mapping');
    if (hrEl) hrEl.classList.add('d-none');
    if (cmEl) cmEl.classList.add('d-none');
    panel.classList.remove('d-none');
    _mnUpdateSummary();
}

window._mnUpdateSummary = function() {
    var totalRows = 0;
    var parts = [];
    document.querySelectorAll('.mn-sheet-chk').forEach(function(chk) {
        if (!chk.checked) return;
        var sheetName = chk.dataset.sheet;
        var sd = _mnSheetData[sheetName];
        if (!sd) return;
        totalRows += sd.rows.length;
        var labels = { szolgalat: 'Szolgálat', katekezis: 'Katekézis', latogatas: 'Látogatás' };
        parts.push('<div class="col"><div class="fw-bold fs-3">' + sd.rows.length + '</div><div class="text-muted small">' + (labels[sd.kategoria] || sd.kategoria) + '</div></div>');
    });
    var scEl = document.getElementById('imp-mn-summary-counts');
    var rcEl = document.getElementById('mn-row-count');
    var smEl = document.getElementById('imp-mn-summary');
    if (scEl) scEl.innerHTML = parts.join('');
    if (rcEl) rcEl.textContent = totalRows + ' sor importálásra kész';
    if (smEl) smEl.classList.toggle('d-none', totalRows === 0);
};

// --- NEM-HIVATALOS / EGYEDI EXCEL FELDOLGOZÁSA ---

function _processMnCustomWorkbook() {
    _mnIsOfficial = false;
    var panel = document.getElementById('imp-mn-sheets-panel');
    var listEl = document.getElementById('imp-mn-sheets-list');
    // Fallback: régi oldalak imp-mn-step2 eleme (ha létezik)
    var legacyStep2 = document.getElementById('imp-mn-step2');

    // Ha több munkalap van, kiválasztó
    if (_mnWorkbook.SheetNames.length > 1 && listEl) {
        var html = '<div class="mb-3"><label class="form-label fw-bold"><i class="ti ti-table me-1"></i>Munkalap kiválasztása</label>' +
            '<select id="imp-mn-sheet" class="form-select" style="border-color:#ae3ec9;" onchange="_onMnSheetChange()">';
        _mnWorkbook.SheetNames.forEach(function(n, i) {
            html += '<option value="' + i + '">' + n + '</option>';
        });
        html += '</select></div>';
        listEl.innerHTML = html;
    } else if (listEl) {
        listEl.innerHTML = '';
    }

    var hrEl = document.getElementById('imp-mn-header-row');
    var cmEl = document.getElementById('imp-mn-custom-mapping');
    var smEl = document.getElementById('imp-mn-summary');
    if (hrEl) hrEl.classList.remove('d-none');
    if (cmEl) cmEl.classList.remove('d-none');
    if (smEl) smEl.classList.add('d-none');
    if (panel) panel.classList.remove('d-none');
    _processMnCustomSheet(0);
}

window._onMnSheetChange = function() {
    _processMnCustomSheet(parseInt(document.getElementById('imp-mn-sheet').value) || 0);
};

window._onMnHeaderRowChange = function() {
    var hRow = parseInt(document.getElementById('imp-mn-hrow').value) || 1;
    _parseMnCustomFromRow(hRow - 1);
};

function _processMnCustomSheet(idx) {
    var ws = _mnWorkbook.Sheets[_mnWorkbook.SheetNames[idx]];
    _mnAllRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Fejléc automatikus keresés
    var headerIdx = 0;
    for (var i = 0; i < Math.min(_mnAllRows.length, 15); i++) {
        var nonEmpty = (_mnAllRows[i] || []).filter(function(c) { return c !== null && c !== undefined && String(c).trim() !== ''; });
        if (nonEmpty.length >= 3) { headerIdx = i; break; }
    }

    var hrowEl = document.getElementById('imp-mn-hrow');
    if (hrowEl) hrowEl.value = headerIdx + 1;
    _parseMnCustomFromRow(headerIdx);
}

function _parseMnCustomFromRow(headerIdx) {
    _mnCustomHeaders = (_mnAllRows[headerIdx] || []).map(function(h, i) { return h ? String(h).trim() : null; }).filter(Boolean);

    var minCols = Math.max(2, Math.floor(_mnCustomHeaders.length * 0.25));
    var dataRows = _mnAllRows.slice(headerIdx + 1).filter(function(row) {
        var nonEmpty = (row || []).filter(function(c) { return c !== null && c !== undefined && String(c).trim() !== ''; });
        return nonEmpty.length >= minCols;
    });
    _mnCustomData = dataRows.map(function(row) {
        var obj = {};
        _mnCustomHeaders.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : null; });
        return obj;
    });

    var headerPreview = _mnCustomHeaders.slice(0, 4).join(', ');
    var hinfoEl = document.getElementById('imp-mn-hrow-info');
    if (hinfoEl) hinfoEl.textContent = '→ ' + headerPreview + (_mnCustomHeaders.length > 4 ? ', ...' : '');

    if (_mnCustomData.length === 0) { alert('Nincs adat a fejléc sor után!'); return; }
    _generateMnCustomMapping();
}

function _generateMnCustomMapping() {
    var fields = [
        { val: '', label: '-- Kihagyás --' },
        { val: 'idopont', label: 'Dátum / Időpont (kötelező)' },
        { val: 'kategoria', label: 'Kategória (szolgálat / látogatás / katekézis)' },
        { val: 'jellege', label: 'Jellege / Alkalma' },
        { val: 'du', label: 'Délutáni alkalom (Du.)' },
        { val: 'alapige', label: 'Alapige / Textus' },
        { val: 'bibliaolvasas', label: 'Bibliaolvasás' },
        { val: 'enekek', label: 'Énekek (egy cellában)' },
        { val: 'enek_1', label: '1. ének' }, { val: 'enek_2', label: '2. ének' },
        { val: 'enek_3', label: '3. ének' }, { val: 'enek_4', label: '4. ének' },
        { val: 'enek_5', label: '5. ének' }, { val: 'enek_6', label: '6. ének' },
        { val: 'cim', label: 'Helyszín / Cím / Család neve' },
        { val: 'jelenlet_ferfi', label: 'Jelenlévők – Férfi' },
        { val: 'jelenlet_no', label: 'Jelenlévők – Nő' },
        { val: 'jelenlet_gyermek', label: 'Jelenlévők – Gyermek' },
        { val: 'jelenlet_osszesen', label: 'Jelenlévők – Összesen' },
        { val: 'persely', label: 'Persely (RON)' },
        { val: 'szolgalt', label: 'Szolgáló lelkész neve' },
        { val: 'megjegyzes', label: 'Megjegyzés' }
    ];

    var html = '';
    _mnCustomHeaders.forEach(function(header) {
        var lh = String(header).toLowerCase().replace(/\s+/g, ' ');
        var auto = '';
        if (lh.includes('dátum') || lh.includes('datum') || lh.includes('időpont') || lh.includes('idopont') || lh === 'date') auto = 'idopont';
        else if (lh.includes('kategória') || lh.includes('kateg') || lh.includes('típus')) auto = 'kategoria';
        else if (lh.includes('jellege') || lh.includes('alkalm') || lh.includes('szolgálat jellege') || lh.includes('istentiszt')) auto = 'jellege';
        else if (lh === 'du' || lh === 'du.' || lh.includes('délután') || lh.includes('delutan')) auto = 'du';
        else if (lh.includes('alapige') || lh.includes('textus') || (lh.includes('ige') && !lh.includes('bibliaolvas'))) auto = 'alapige';
        else if (lh.includes('bibliaolvas') || lh.includes('olvasás')) auto = 'bibliaolvasas';
        else if (/^1\.?\s*[eé]nek/.test(lh)) auto = 'enek_1';
        else if (/^2\.?\s*[eé]nek/.test(lh)) auto = 'enek_2';
        else if (/^3\.?\s*[eé]nek/.test(lh)) auto = 'enek_3';
        else if (/^4\.?\s*[eé]nek/.test(lh)) auto = 'enek_4';
        else if (/^5\.?\s*[eé]nek/.test(lh)) auto = 'enek_5';
        else if (/^6\.?\s*[eé]nek/.test(lh)) auto = 'enek_6';
        else if (lh.includes('ének') || lh.includes('zsoltár')) auto = 'enekek';
        else if (lh.includes('helyszín') || lh.includes('cím') || lh.includes('család') || (lh.includes('hely') && !lh.includes('jelenlét'))) auto = 'cim';
        else if ((lh.includes('férfi') || lh === 'f.' || lh === 'f') && !lh.includes('össz')) auto = 'jelenlet_ferfi';
        else if ((lh.includes('nő') || lh === 'nő' || lh.includes('asszony')) && !lh.includes('össz')) auto = 'jelenlet_no';
        else if (lh.includes('gyerm') || lh.includes('ifjú') || lh === 'gy.' || lh === 'gy') auto = 'jelenlet_gyermek';
        else if (lh.includes('összesen') || lh.includes('részt vett') || lh.includes('jelen volt')) auto = 'jelenlet_osszesen';
        else if (lh.includes('persely') || lh.includes('gyűjtés')) auto = 'persely';
        else if (lh.includes('lelkész') || lh.includes('szolgáló') || lh.includes('tartotta') || lh.includes('pásztor')) auto = 'szolgalt';
        else if (lh.includes('megjegy') || lh.includes('jegyzet') || lh.includes('tananyag')) auto = 'megjegyzes';
        var opts = fields.map(function(f) { return '<option value="' + f.val + '" ' + (f.val === auto ? 'selected' : '') + '>' + f.label + '</option>'; }).join('');
        html += '<tr><td class="fw-bold align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>' + header + '</td>' +
            '<td><select class="form-select form-select-sm mn-map-sel" data-col="' + header + '">' + opts + '</select></td></tr>';
    });
    var tbEl = document.getElementById('mn-mapping-tbody');
    var rcEl = document.getElementById('mn-row-count');
    var cmEl = document.getElementById('imp-mn-custom-mapping');
    var s2El = document.getElementById('imp-mn-step2');
    if (tbEl) tbEl.innerHTML = html;
    if (rcEl) rcEl.textContent = _mnCustomData.length + ' sor importálásra kész';
    if (cmEl) cmEl.classList.remove('d-none');
    // Fallback: régi oldalak imp-mn-step2 eleme
    if (s2El) s2El.classList.remove('d-none');
}

// --- IMPORTÁLÁS VÉGREHAJTÁSA ---

// Du. mező értelmezése
function _parseDu(val) {
    if (val === null || val === undefined) return false;
    var s = String(val).toLowerCase().trim();
    if (s === 'du' || s === 'du.' || s === 'du.2') return true;
    if (s === 'igen' || s === 'yes' || s === 'true' || s === '1' || s === 'x' || s === '✓') return true;
    return false;
}

// Énekek összefűzése 6 külön oszlopból
function _buildEnekek(row, colDef) {
    var parts = [];
    for (var i = 1; i <= 6; i++) {
        var colIdx = colDef['enek' + i];
        if (colIdx === undefined) continue;
        var v = row[colIdx];
        if (v !== null && v !== undefined && String(v).trim() !== '') parts.push(String(v).trim());
    }
    return parts.length > 0 ? parts.join(', ') : null;
}

// Kategória normalizálás — MINDIG ékezet nélküli értéket ad vissza
function _normKategoria(val) {
    if (!val) return 'szolgalat';
    var lv = String(val).toLowerCase();
    if (lv.includes('látogat') || lv.includes('latogat') || lv.includes('csal') || lv === 'bl') return 'latogatas';
    if (lv.includes('katekéz') || lv.includes('katekezis') || lv.includes('konfirm') || lv.includes('hittan') || lv.includes('vallás')) return 'katekezis';
    return 'szolgalat';
}

window.executeMnImport = async function() {
    var congId = await _getActiveCongregationId();
    if (!congId) { alert('Nincs aktív gyülekezet! Jelentkezzen be újra.'); return; }

    var btn = document.getElementById('btn-execute-mn-import');
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importálás folyamatban...';
    btn.disabled = true;

    try {
        var toInsert = [];
        var skipped = 0;

        if (_mnIsOfficial) {
            // --- HIVATALOS SABLON: 3 munkalap feldolgozása ---
            document.querySelectorAll('.mn-sheet-chk').forEach(function(chk) {
                if (!chk.checked) return;
                var sheetName = chk.dataset.sheet;
                var sd = _mnSheetData[sheetName];
                if (!sd || !sd.rows.length) return;

                var colDef = _mnOfficialCols[sd.kategoria];

                sd.rows.forEach(function(rowObj) {
                    var row = rowObj.raw;
                    var idopont = rowObj.datum;
                    if (!idopont) { skipped++; return; }

                    var rec = {
                        congregation_id: congId,
                        idopont: idopont,
                        kategoria: sd.kategoria,
                        jellege: row[colDef.jellege] ? String(row[colDef.jellege]).trim() : null,
                        du: colDef.du !== undefined ? _parseDu(row[colDef.du]) : false,
                        jelenlet_osszesen: 0
                    };

                    // Szolgálati alkalmak — teljes adatsor
                    if (sd.kategoria === 'szolgalat') {
                        var ferfi = parseInt(row[colDef.ferfi]) || 0;
                        var no = parseInt(row[colDef.no]) || 0;
                        rec.jelenlet_ferfi = ferfi;
                        rec.jelenlet_no = no;
                        rec.jelenlet_osszesen = ferfi + no;
                        rec.bibliaolvasas = row[colDef.bibliaolvasas] ? String(row[colDef.bibliaolvasas]).trim() : null;
                        rec.alapige = row[colDef.alapige] ? String(row[colDef.alapige]).trim() : null;
                        rec.enekek = _buildEnekek(row, colDef);
                        rec.szolgalt = row[colDef.szolgalt] ? String(row[colDef.szolgalt]).trim() : null;
                        rec.persely = _parseAmount(row[colDef.persely]);
                        rec.megjegyzes = row[colDef.megjegyzes] ? String(row[colDef.megjegyzes]).trim() : null;
                    }
                    // Katekézis
                    else if (sd.kategoria === 'katekezis') {
                        var ossz = parseInt(row[colDef.osszesen]) || 0;
                        rec.jelenlet_osszesen = ossz;
                        rec.alapige = row[colDef.tananyag] ? String(row[colDef.tananyag]).trim() : null;
                        rec.persely = _parseAmount(row[colDef.persely]);
                        rec.szolgalt = row[colDef.szolgalt] ? String(row[colDef.szolgalt]).trim() : null;
                        rec.megjegyzes = row[colDef.megjegyzes] ? String(row[colDef.megjegyzes]).trim() : null;
                    }
                    // Családlátogatás
                    else if (sd.kategoria === 'latogatas') {
                        var csNev = row[colDef.csalad_nev] ? String(row[colDef.csalad_nev]).trim() : null;
                        var csAddr = row[colDef.cim] ? String(row[colDef.cim]).trim() : null;
                        rec.cim = csNev ? (csAddr ? csNev + ' — ' + csAddr : csNev) : csAddr;
                        var jelenVolt = parseInt(row[colDef.osszesen]) || 0;
                        rec.jelenlet_osszesen = jelenVolt;
                        rec.megjegyzes = row[colDef.megjegyzes] ? String(row[colDef.megjegyzes]).trim() : null;
                    }

                    toInsert.push(rec);
                });
            });
        } else {
            // --- NEM-HIVATALOS: egyedi mapping ---
            var mapping = {};
            document.querySelectorAll('.mn-map-sel').forEach(function(s) { if (s.value) mapping[s.dataset.col] = s.value; });

            for (var i = 0; i < _mnCustomData.length; i++) {
                var row = _mnCustomData[i];
                var get = function(field) {
                    var found = null;
                    Object.keys(mapping).forEach(function(col) { if (mapping[col] === field) found = col; });
                    return found !== null ? (row[found] !== undefined ? row[found] : null) : null;
                };

                var idopont = _parseExcelDate(get('idopont'));
                if (!idopont) { skipped++; continue; }

                var ferfi = parseInt(get('jelenlet_ferfi')) || 0;
                var no = parseInt(get('jelenlet_no')) || 0;
                var gyermek = parseInt(get('jelenlet_gyermek')) || 0;
                var osszesenRaw = get('jelenlet_osszesen');
                var osszesen = osszesenRaw ? (parseInt(osszesenRaw) || (ferfi + no + gyermek)) : (ferfi + no + gyermek);

                // Énekek összefűzése
                var enekek = null;
                var egybenEnek = get('enekek');
                if (egybenEnek) {
                    enekek = String(egybenEnek);
                } else {
                    var enekParts = [];
                    for (var ei = 1; ei <= 6; ei++) {
                        var ev = get('enek_' + ei);
                        if (ev !== null && ev !== undefined && String(ev).trim() !== '') enekParts.push(String(ev).trim());
                    }
                    if (enekParts.length > 0) enekek = enekParts.join(', ');
                }

                toInsert.push({
                    congregation_id: congId,
                    idopont: idopont,
                    kategoria: _normKategoria(get('kategoria')),
                    jellege: get('jellege') ? String(get('jellege')) : null,
                    du: _parseDu(get('du')),
                    bibliaolvasas: get('bibliaolvasas') ? String(get('bibliaolvasas')) : null,
                    alapige: get('alapige') ? String(get('alapige')) : null,
                    enekek: enekek,
                    cim: get('cim') ? String(get('cim')) : null,
                    jelenlet_ferfi: ferfi,
                    jelenlet_no: no,
                    jelenlet_gyermek: gyermek,
                    jelenlet_osszesen: osszesen,
                    persely: _parseAmount(get('persely')),
                    szolgalt: get('szolgalt') ? String(get('szolgalt')) : null,
                    megjegyzes: get('megjegyzes') ? String(get('megjegyzes')) : null
                });
            }
        }

        if (toInsert.length === 0) {
            alert('Nem volt importálható sor.' + (skipped > 0 ? '\nKihagyott: ' + skipped + ' (nincs dátum)' : '') + '\n\nEllenőrizze a fájlt és a dátum oszlopokat!');
            return;
        }

        // Dátum szerinti rendezés
        toInsert.sort(function(a, b) { return a.idopont < b.idopont ? -1 : a.idopont > b.idopont ? 1 : 0; });

        // Batch insert (max 100 soronként)
        for (var b = 0; b < toInsert.length; b += 100) {
            var result = await _importDb.from('munkanaplo').insert(toInsert.slice(b, b + 100));
            if (result.error) throw result.error;
        }

        // Összesítés kategóriánként
        var stats = { szolgalat: 0, katekezis: 0, latogatas: 0 };
        toInsert.forEach(function(r) { if (stats[r.kategoria] !== undefined) stats[r.kategoria]++; });
        var statMsg = '';
        if (stats.szolgalat > 0) statMsg += '\n  Szolgálati alkalmak: ' + stats.szolgalat;
        if (stats.katekezis > 0) statMsg += '\n  Katekézis: ' + stats.katekezis;
        if (stats.latogatas > 0) statMsg += '\n  Családlátogatás: ' + stats.latogatas;

        alert('✅ Import sikeres!\n\nBevitt munkanapló bejegyzések: ' + toInsert.length + statMsg + (skipped > 0 ? '\nKihagyott: ' + skipped : ''));
        var spEl = document.getElementById('imp-mn-sheets-panel');
        var s2El = document.getElementById('imp-mn-step2');
        if (spEl) spEl.classList.add('d-none');
        if (s2El) s2El.classList.add('d-none');
        document.getElementById('imp-mn-file').value = '';
        _mnSheetData = {};
        _mnCustomData = [];

    } catch (err) {
        console.error('[MN Import] Hiba:', err);
        alert('Hiba az importálás során:\n' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// ==========================================
// TAB 6: KERESZTELÉSI ANYAKÖNYV IMPORT
// ==========================================

let _akWorkbook = null;
let _akAllRows = [];

window.handleKeresztsegExcel = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        _akWorkbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        document.getElementById('imp-ak-step2').classList.add('d-none');
        document.getElementById('imp-ak-step3').classList.add('d-none');
        if (_akWorkbook.SheetNames.length > 1) {
            const sel = document.getElementById('imp-ak-sheet');
            sel.innerHTML = _akWorkbook.SheetNames.map((n, i) => `<option value="${i}">${n}</option>`).join('');
            document.getElementById('imp-ak-sheet-sel').classList.remove('d-none');
        } else {
            document.getElementById('imp-ak-sheet-sel').classList.add('d-none');
        }
        _processAkSheet(0);
    };
    reader.readAsArrayBuffer(file);
};

window._onAkSheetChange = function() {
    document.getElementById('imp-ak-step3').classList.add('d-none');
    _processAkSheet(parseInt(document.getElementById('imp-ak-sheet').value) || 0);
};

window._onAkHeaderRowChange = function() {
    document.getElementById('imp-ak-step3').classList.add('d-none');
    const hRow = parseInt(document.getElementById('imp-ak-hrow').value) || 1;
    _parseAkFromRow(hRow - 1);
};

function _processAkSheet(idx) {
    const ws = _akWorkbook.Sheets[_akWorkbook.SheetNames[idx]];
    _akAllRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Fejléc automatikus keresés
    let headerIdx = 0;
    for (let i = 0; i < Math.min(_akAllRows.length, 15); i++) {
        const nonEmpty = (_akAllRows[i] || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
        if (nonEmpty.length >= 3) { headerIdx = i; break; }
    }

    document.getElementById('imp-ak-hrow').value = headerIdx + 1;
    const headerPreview = (_akAllRows[headerIdx] || []).filter(Boolean).slice(0, 4).join(', ');
    document.getElementById('imp-ak-hrow-info').textContent = '→ ' + headerPreview + ((_akAllRows[headerIdx] || []).filter(Boolean).length > 4 ? ', ...' : '');
    document.getElementById('imp-ak-header-row').classList.remove('d-none');

    _parseAkFromRow(headerIdx);
}

function _parseAkFromRow(headerIdx) {
    _akImportHeaders = (_akAllRows[headerIdx] || []).map((h, i) => h ? String(h).trim() : ('Oszlop_' + (i + 1))).filter(Boolean);

    const dataRows = _akAllRows.slice(headerIdx + 1).filter(row => {
        const nonEmpty = (row || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
        return nonEmpty.length >= 1;
    });
    _akImportData = dataRows.map(row => {
        const obj = {};
        _akImportHeaders.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : null; });
        return obj;
    });

    const headerPreview = _akImportHeaders.slice(0, 4).join(', ');
    document.getElementById('imp-ak-hrow-info').textContent = '→ ' + headerPreview + (_akImportHeaders.length > 4 ? ', ...' : '');

    if (_akImportData.length === 0) { alert('Nincs adat a fejléc sor után!'); return; }
    _generateAkMapping();
}

function _generateAkMapping() {
    const fields = [
        { val: '', label: '-- Kihagyás --' },
        { val: 'gyermek_nev', label: 'Gyermek neve (személyhozzárendeléshez)' },
        { val: 'sz_datum', label: 'Gyermek születési dátuma (személyhozzárendeléshez)' },
        { val: 'datum', label: 'Keresztelés dátuma (kötelező)' },
        { val: 'okirat', label: 'Okirat / Anyakönyvi sorszám' },
        { val: 'lelkeszneve', label: 'Szolgáló lelkész neve' },
        { val: 'keresztszulok', label: 'Keresztszülők neve(i)' },
        { val: 'apjaneve', label: 'Apa neve' },
        { val: 'anyjaneve', label: 'Anya neve' },
        { val: 'megjegyzes', label: 'Megjegyzés' },
    ];

    let html = '';
    _akImportHeaders.forEach(header => {
        const lh = String(header).toLowerCase();
        let auto = '';
        if ((lh.includes('gyermek') || lh.includes('gyerek')) && (lh.includes('neve') || lh.includes('nev'))) auto = 'gyermek_nev';
        else if (lh === 'neve' || lh === 'teljes neve' || lh === 'név' || lh === 'nev') auto = 'gyermek_nev';
        if (lh.includes('születési') || (lh.includes('szül') && lh.includes('dátum'))) auto = 'sz_datum';
        if (lh.includes('keresztelés') && lh.includes('dátum')) auto = 'datum';
        else if (!auto && (lh.includes('dátum') || lh.includes('datum'))) auto = 'datum';
        if (lh.includes('okirat') || lh.includes('sorszám') || lh === 'szám' || lh.includes('bejegyzés')) auto = 'okirat';
        if (lh.includes('lelkész') || lh.includes('pásztor')) auto = 'lelkeszneve';
        if (lh.includes('keresztszülő') || lh.includes('keresztszulo') || lh.includes('komasszony') || lh.includes('koma')) auto = 'keresztszulok';
        if (lh.includes('apa') || lh === 'apja neve' || lh.includes('atya')) auto = 'apjaneve';
        if (lh.includes('anya') || lh === 'anyja neve') auto = 'anyjaneve';
        if (lh.includes('megjegyzés') || lh.includes('megjegyzes')) auto = 'megjegyzes';
        const opts = fields.map(f => `<option value="${f.val}" ${f.val === auto ? 'selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td>
            <td><select class="form-select form-select-sm ak-map-sel" data-col="${header}">${opts}</select></td></tr>`;
    });
    document.getElementById('ak-mapping-tbody').innerHTML = html;
    document.getElementById('ak-row-count').textContent = `${_akImportData.length} sor importálásra kész`;
    document.getElementById('imp-ak-step2').classList.remove('d-none');
    document.getElementById('imp-ak-step3').classList.add('d-none');
}

window.runPersonMatching = async function() {
    const congId = await _getActiveCongregationId();
    if (!congId) { alert('Nincs aktív gyülekezet! Jelentkezzen be újra.'); return; }

    const btn = document.getElementById('btn-run-matching');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Párosítás folyamatban...';
    btn.disabled = true;

    try {
        const { data: tagok, error } = await _importDb.from('szemely')
            .select('id, csaladnev, k_nev, sz_datum')
            .eq('congregation_id', congId);
        if (error) throw error;
        _akAllMembers = tagok || [];

        const mapping = {};
        document.querySelectorAll('.ak-map-sel').forEach(s => { if (s.value) mapping[s.dataset.col] = s.value; });

        _akMatchedRows = _akImportData.map((row, i) => {
            const get = (field) => {
                const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
                return col !== undefined ? (row[col] ?? null) : null;
            };

            const gyermekNev = get('gyermek_nev') ? String(get('gyermek_nev')).trim() : null;
            const szDatum = _parseExcelDate(get('sz_datum'));
            const datum = _parseExcelDate(get('datum'));

            let szemelyId = null, status = 'not_found', szemelyNev = '';

            if (gyermekNev) {
                const nameParts = gyermekNev.trim().split(/\s+/);
                const cs = nameParts[0].toLowerCase();
                const kn = nameParts.slice(1).join(' ').toLowerCase();

                // Pontos egyezés: név + születési dátum
                if (szDatum) {
                    const exact = _akAllMembers.find(m =>
                        (m.csaladnev || '').toLowerCase() === cs &&
                        (m.k_nev || '').toLowerCase() === kn &&
                        m.sz_datum === szDatum
                    );
                    if (exact) {
                        szemelyId = exact.id;
                        status = 'matched';
                        szemelyNev = `${exact.csaladnev} ${exact.k_nev}`;
                    }
                }

                // Csak névegyezés (ha nincs pontos)
                if (!szemelyId) {
                    const byName = _akAllMembers.filter(m =>
                        (m.csaladnev || '').toLowerCase() === cs &&
                        (m.k_nev || '').toLowerCase() === kn
                    );
                    if (byName.length === 1) {
                        szemelyId = byName[0].id;
                        status = 'matched_name';
                        szemelyNev = `${byName[0].csaladnev} ${byName[0].k_nev}`;
                    } else if (byName.length > 1) {
                        status = 'ambiguous';
                    }
                }
            }

            return { rowIdx: i, row, gyermekNev, szDatum, datum, szemelyId, status, szemelyNev, _mapping: mapping };
        });

        _renderMatchingReview();
        document.getElementById('imp-ak-step3').classList.remove('d-none');

    } catch (err) {
        alert('Hiba a párosítás során:\n' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

function _renderMatchingReview() {
    const matched = _akMatchedRows.filter(r => r.szemelyId).length;
    const notFound = _akMatchedRows.filter(r => !r.szemelyId).length;

    document.getElementById('ak-match-summary').innerHTML = `
        <span class="badge bg-success me-2"><i class="ti ti-check me-1"></i>${matched} párosítva</span>
        <span class="badge bg-danger me-2"><i class="ti ti-x me-1"></i>${notFound} nem találva</span>
        <span class="text-muted small ms-2">A nem párosítottakat kézzel rendelheti hozzá, vagy személy nélkül kerülnek be.</span>`;

    const tbody = document.getElementById('ak-match-tbody');
    tbody.innerHTML = _akMatchedRows.map((r, i) => {
        let badge = '';
        if (r.status === 'matched') badge = '<span class="badge bg-success">✓ Pontos egyezés</span>';
        else if (r.status === 'matched_name') badge = '<span class="badge bg-warning text-dark">≈ Névegyezés</span>';
        else if (r.status === 'ambiguous') badge = '<span class="badge bg-orange text-white">⚠ Többes egyezés</span>';
        else badge = '<span class="badge bg-danger">✗ Nem találva</span>';

        const personCell = r.szemelyId
            ? `<span class="text-success fw-bold"><i class="ti ti-user-check me-1"></i>${r.szemelyNev}</span>`
            : `<select class="form-select form-select-sm ak-person-override" data-row="${i}" style="min-width:220px;">
                <option value="">-- Kézzel hozzárendelés --</option>
                ${_akAllMembers
                    .sort((a, b) => (a.csaladnev || '').localeCompare(b.csaladnev || ''))
                    .map(m => `<option value="${m.id}">${m.csaladnev || ''} ${m.k_nev || ''}${m.sz_datum ? ' (' + m.sz_datum + ')' : ''}</option>`)
                    .join('')}
               </select>`;

        return `<tr class="${!r.szemelyId ? 'table-warning' : ''}">
            <td class="text-muted">${i + 1}</td>
            <td class="fw-bold">${r.gyermekNev || '<em class="text-muted">—</em>'}</td>
            <td class="text-muted">${r.szDatum || '—'}</td>
            <td>${r.datum ? `<span class="badge bg-blue-lt text-blue">${r.datum}</span>` : '<span class="text-danger fw-bold">Hiányzik!</span>'}</td>
            <td>${badge}</td>
            <td>${personCell}</td>
        </tr>`;
    }).join('');

    // Kézi hozzárendelés eseménykezelő
    document.querySelectorAll('.ak-person-override').forEach(sel => {
        sel.addEventListener('change', function() {
            const idx = parseInt(this.dataset.row);
            _akMatchedRows[idx].szemelyId = this.value || null;
        });
    });
}

window.executeKeresztsegImport = async function() {
    const congId = await _getActiveCongregationId();
    if (!congId) { alert('Nincs aktív gyülekezet! Jelentkezzen be újra.'); return; }

    const btn = document.getElementById('btn-execute-ak-import');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importálás folyamatban...';
    btn.disabled = true;

    try {
        const mapping = {};
        document.querySelectorAll('.ak-map-sel').forEach(s => { if (s.value) mapping[s.dataset.col] = s.value; });

        const toInsert = [];
        let skipped = 0;

        for (const r of _akMatchedRows) {
            const row = r.row;
            const get = (field) => {
                const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
                return col !== undefined ? (row[col] ?? null) : null;
            };

            if (!r.datum) { skipped++; continue; }

            toInsert.push({
                congregation_id: congId,
                id_szemely: r.szemelyId ? parseInt(r.szemelyId) : null,
                datum: r.datum,
                okirat: get('okirat') ? String(get('okirat')) : null,
                lelkeszneve: get('lelkeszneve') ? String(get('lelkeszneve')) : null,
                keresztszulok: get('keresztszulok') ? String(get('keresztszulok')) : null,
                apjaneve: get('apjaneve') ? String(get('apjaneve')) : null,
                anyjaneve: get('anyjaneve') ? String(get('anyjaneve')) : null,
                megjegyzes: get('megjegyzes') ? String(get('megjegyzes')) : null,
                munkanaploba: false
            });
        }

        if (toInsert.length === 0) {
            alert(`Nincs importálható sor.\nKihagyott (nincs keresztelési dátum): ${skipped}`);
            return;
        }

        for (let b = 0; b < toInsert.length; b += 100) {
            const { error } = await _importDb.from('keresztseg').insert(toInsert.slice(b, b + 100));
            if (error) throw error;
        }

        const withPerson = toInsert.filter(r => r.id_szemely).length;
        alert(`✅ Import sikeres!\n\nBevitt anyakönyvi bejegyzések: ${toInsert.length}\nEbből személyhez rendelve: ${withPerson}\nSzemély nélkül mentve: ${toInsert.length - withPerson}\nKihagyott (nincs dátum): ${skipped}`);

        document.getElementById('imp-ak-step2').classList.add('d-none');
        document.getElementById('imp-ak-step3').classList.add('d-none');
        document.getElementById('imp-ak-file').value = '';
        _akImportData = []; _akImportHeaders = []; _akMatchedRows = [];

    } catch (err) {
        alert('Hiba az importálás során:\n' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// ==========================================
// TAB 7: IKTATÓ (IKTATÓKÖNYV) IMPORT
// ==========================================

let _iktImportData = [], _iktImportHeaders = [];
let _iktWorkbook = null;
let _iktAllRows = [];

window.handleIktatoExcel = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        _iktWorkbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        document.getElementById('imp-ikt-step2').classList.add('d-none');
        if (_iktWorkbook.SheetNames.length > 1) {
            const sel = document.getElementById('imp-ikt-sheet');
            sel.innerHTML = _iktWorkbook.SheetNames.map((n, i) => `<option value="${i}">${n}</option>`).join('');
            document.getElementById('imp-ikt-sheet-sel').classList.remove('d-none');
        } else {
            document.getElementById('imp-ikt-sheet-sel').classList.add('d-none');
        }
        _processIktSheet(0);
    };
    reader.readAsArrayBuffer(file);
};

window._onIktSheetChange = function() {
    _processIktSheet(parseInt(document.getElementById('imp-ikt-sheet').value) || 0);
};

window._onIktHeaderRowChange = function() {
    const hRow = parseInt(document.getElementById('imp-ikt-hrow').value) || 1;
    _parseIktFromRow(hRow - 1);
};

function _processIktSheet(idx) {
    const ws = _iktWorkbook.Sheets[_iktWorkbook.SheetNames[idx]];
    _iktAllRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Fejléc automatikus keresés: első sor amelyben legalább 3 nem-üres cella van
    let headerIdx = 0;
    for (let i = 0; i < Math.min(_iktAllRows.length, 15); i++) {
        const nonEmpty = (_iktAllRows[i] || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
        if (nonEmpty.length >= 3) { headerIdx = i; break; }
    }

    document.getElementById('imp-ikt-hrow').value = headerIdx + 1;
    const headerPreview = (_iktAllRows[headerIdx] || []).filter(Boolean).slice(0, 4).join(', ');
    document.getElementById('imp-ikt-hrow-info').textContent = '→ ' + headerPreview + ((_iktAllRows[headerIdx] || []).filter(Boolean).length > 4 ? ', ...' : '');
    document.getElementById('imp-ikt-header-row').classList.remove('d-none');

    _parseIktFromRow(headerIdx);
}

function _parseIktFromRow(headerIdx) {
    _iktImportHeaders = (_iktAllRows[headerIdx] || []).map((h, i) => h ? String(h).trim() : ('Oszlop_' + (i + 1))).filter(Boolean);

    const dataRows = _iktAllRows.slice(headerIdx + 1).filter(row => {
        const nonEmpty = (row || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
        return nonEmpty.length >= 2;
    });
    _iktImportData = dataRows.map(row => {
        const obj = {};
        _iktImportHeaders.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : null; });
        return obj;
    });

    const headerPreview = _iktImportHeaders.slice(0, 4).join(', ');
    document.getElementById('imp-ikt-hrow-info').textContent = '→ ' + headerPreview + (_iktImportHeaders.length > 4 ? ', ...' : '');

    if (_iktImportData.length === 0) { alert('Nincs adat a fejléc sor után!'); return; }
    _generateIktMapping();
}

function _generateIktMapping() {
    const fields = [
        { val: '', label: '-- Kihagyás --' },
        { val: 'iktatoszam', label: 'Iktatószám (pl. "1 - 2024" vagy sorszám)' },
        { val: 'kelt', label: 'Érkezés / küldés dátuma *' },
        { val: 'direction', label: 'Irány (bejövő/kimenő)' },
        { val: 'sender_or_recipient', label: 'Küldő / Címzett' },
        { val: 'subject', label: 'Tárgy / Beadvány megnevezése' },
        { val: 'targykivonat', label: 'Tárgykivonat (részletes leírás)' },
        { val: 'file_folder', label: 'Iratgyűjtő / Iratcsomó' },
        { val: 'oldalszam', label: 'Lapok / oldalak száma' },
        { val: 'elintezes_modja', label: 'Elintézés módja' },
        { val: 'irattarijel', label: 'Irattári jel' },
        { val: 'megjegyzes', label: 'Megjegyzés' },
        { val: 'kuldo_iktatoszam', label: 'Küldő iktatószáma (→ megjegyzésbe)' },
        { val: 'hivatkozas', label: 'Hivatkozás (→ megjegyzésbe)' },
    ];

    let html = '';
    _iktImportHeaders.forEach(header => {
        const lh = String(header).toLowerCase();
        let auto = '';
        if (lh.includes('iktatószám') || lh.includes('iktatoszam') || lh === 'szám' || lh === 'helyi iktatószám' || lh === 'sorszám') auto = 'iktatoszam';
        if (lh.includes('érkezés') || lh.includes('küldés dát') || lh.includes('dátum') || lh.includes('kelt')) auto = 'kelt';
        if (lh.includes('irány') || lh.includes('direction') || lh.includes('bejövő') || lh.includes('kimenő')) auto = 'direction';
        if (lh.includes('címzett') || lh.includes('kinek') || lh.includes('kit/kinek') || lh.includes('küldő neve') || lh.includes('feladó')) auto = 'sender_or_recipient';
        if (lh.includes('tárgy') && !lh.includes('kivonat')) auto = 'subject';
        if (lh.includes('tárgykivonat') || lh.includes('kivonat')) auto = 'targykivonat';
        if (lh.includes('iratgyűjtő') || lh.includes('irattartó') || lh.includes('csomó') || lh.includes('gyűjtő')) auto = 'file_folder';
        if (lh.includes('lapok') || lh.includes('oldalszám') || lh.includes('oldal') || lh === 'lap') auto = 'oldalszam';
        if (lh.includes('elintézés') && lh.includes('módja')) auto = 'elintezes_modja';
        if (lh.includes('irattári') || lh.includes('irattár')) auto = 'irattarijel';
        if (lh.includes('megjegyzés') || lh.includes('megjegyzes')) auto = 'megjegyzes';
        if (lh.includes('küldő iktatószám') || lh.includes('küldő iktatósz') || lh.includes('feladó ikt')) auto = 'kuldo_iktatoszam';
        if (lh.includes('hivatkozás') || lh.includes('hivatkozas') || lh.includes('ha válasz') || lh.includes('válasz')) auto = 'hivatkozas';
        // Ha a tárgy és a tárgykivonat is van, a "Tárgykivonat" oszlop kap prioritást
        if (!auto && (lh.includes('tárgy') || lh.includes('targy'))) auto = 'targykivonat';
        const opts = fields.map(f => `<option value="${f.val}" ${f.val === auto ? 'selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td>
            <td><select class="form-select form-select-sm ikt-map-sel" data-col="${header}">${opts}</select></td></tr>`;
    });
    document.getElementById('ikt-mapping-tbody').innerHTML = html;
    document.getElementById('ikt-row-count').textContent = `${_iktImportData.length} sor importálásra kész`;
    document.getElementById('imp-ikt-step2').classList.remove('d-none');
}

function _parseIktatoszam(val) {
    // Formátumok: "1 - 2024", "1/2024", "1", 1
    if (!val && val !== 0) return { seq: null, year: null };
    const s = String(val).trim();
    // "1 - 2024" vagy "1-2024"
    let m = s.match(/^(\d+)\s*[-–]\s*(\d{4})$/);
    if (m) return { seq: parseInt(m[1]), year: parseInt(m[2]) };
    // "1/2024"
    m = s.match(/^(\d+)\s*\/\s*(\d{4})$/);
    if (m) return { seq: parseInt(m[1]), year: parseInt(m[2]) };
    // Csak szám
    m = s.match(/^(\d+)$/);
    if (m) return { seq: parseInt(m[1]), year: null };
    return { seq: null, year: null };
}

window.executeIktatoImport = async function() {
    const congId = await _getActiveCongregationId();
    if (!congId) { alert('Nincs aktív gyülekezet! Jelentkezzen be újra.'); return; }

    const btn = document.getElementById('btn-execute-ikt-import');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importálás folyamatban...';
    btn.disabled = true;

    try {
        const mapping = {};
        document.querySelectorAll('.ikt-map-sel').forEach(s => { if (s.value) mapping[s.dataset.col] = s.value; });

        const toInsert = [];
        let skipped = 0;

        for (let i = 0; i < _iktImportData.length; i++) {
            const row = _iktImportData[i];
            const get = (field) => {
                const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
                return col !== undefined ? (row[col] ?? null) : null;
            };

            // Iktatószám és év kinyerése
            const iktatoRaw = get('iktatoszam');
            const parsed = _parseIktatoszam(iktatoRaw);
            const keltDate = _parseExcelDate(get('kelt'));

            // Év meghatározása: iktatószámból → dátumból → aktuális év
            let year = parsed.year;
            if (!year && keltDate) year = parseInt(keltDate.substring(0, 4));
            if (!year) year = new Date().getFullYear();

            // Sorszám: ha nincs az Excelben → automatikus (i+1)
            const seqNum = parsed.seq || (i + 1);

            // Irány meghatározása
            let direction = null;
            const dirRaw = get('direction');
            if (dirRaw) {
                const ld = String(dirRaw).toLowerCase();
                if (ld.includes('bejövő') || ld.includes('bejovo') || ld.includes('érkez') || ld.includes('in')) direction = 'incoming';
                else if (ld.includes('kimenő') || ld.includes('kimeno') || ld.includes('küldés') || ld.includes('out')) direction = 'outgoing';
            }

            // Tárgy: kötelező — ha nincs, próbáljuk a tárgykivonatot
            let subject = get('subject') ? String(get('subject')).trim() : null;
            const targykivonat = get('targykivonat') ? String(get('targykivonat')).trim() : null;
            if (!subject && targykivonat) {
                subject = targykivonat.length > 100 ? targykivonat.substring(0, 100) + '...' : targykivonat;
            }
            if (!subject) { skipped++; continue; }

            // Megjegyzés összeállítása extra mezőkből
            const megjegyzesParts = [];
            const megjRaw = get('megjegyzes');
            if (megjRaw) megjegyzesParts.push(String(megjRaw).trim());
            const kuldoIkt = get('kuldo_iktatoszam');
            if (kuldoIkt) megjegyzesParts.push('Küldő iktatószáma: ' + String(kuldoIkt).trim());
            const hivatkozas = get('hivatkozas');
            if (hivatkozas) megjegyzesParts.push('Hivatkozás: ' + String(hivatkozas).trim());

            toInsert.push({
                congregation_id: congId,
                year: year,
                sequence_number: seqNum,
                direction: direction,
                subject: subject,
                targykivonat: targykivonat,
                sender_or_recipient: get('sender_or_recipient') ? String(get('sender_or_recipient')).trim() : null,
                file_folder: get('file_folder') ? String(get('file_folder')).trim() : null,
                kelt: keltDate,
                oldalszam: get('oldalszam') ? (parseInt(get('oldalszam')) || null) : null,
                elintezes_modja: get('elintezes_modja') ? String(get('elintezes_modja')).trim() : null,
                irattarijel: get('irattarijel') ? String(get('irattarijel')).trim() : null,
                megjegyzes: megjegyzesParts.length > 0 ? megjegyzesParts.join(' | ') : null,
                deleted: false
            });
        }

        if (toInsert.length === 0) {
            alert(`Nem volt importálható sor.\nKihagyott: ${skipped} (nincs tárgy/tárgykivonat)\n\nEllenőrizze a tárgy vagy tárgykivonat oszlop hozzárendelését!`);
            return;
        }

        // Kötegelt beillesztés (50 soronként)
        for (let b = 0; b < toInsert.length; b += 50) {
            const { error } = await _importDb.from('iktato').insert(toInsert.slice(b, b + 50));
            if (error) throw error;
        }

        alert(`✅ Import sikeres!\n\nBevitt iktatókönyvi bejegyzések: ${toInsert.length}\nÉv: ${toInsert[0].year}\nKihagyott (nincs tárgy): ${skipped}`);
        document.getElementById('imp-ikt-step2').classList.add('d-none');
        document.getElementById('imp-ikt-file').value = '';
        _iktImportData = []; _iktImportHeaders = [];

    } catch (err) {
        alert('Hiba az importálás során:\n' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};
