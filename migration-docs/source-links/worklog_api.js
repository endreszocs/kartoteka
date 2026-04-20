let allWorklogs = [];
let currentCategory = 'szolgalat'; // Alapértelmezett fül

// Gyülekezet ID helper (megbízható, profil-táblából)
async function getWorklogCongId() {
    if (window.activeCongregationId) return window.activeCongregationId;
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
    if (profile?.congregation_id) window.activeCongregationId = profile.congregation_id;
    return profile?.congregation_id || null;
}

// --- 1. ADATOK BETÖLTÉSE ---
async function loadWorklogs() {
    try {
        const monthFilter = document.getElementById('filter-month').value; // pl. "2026-03" vagy üres
        const congId = await getWorklogCongId();
        if (!congId) {
            console.warn('[Munkanapló] Nincs congregation_id — nem tudunk lekérdezni!');
            document.getElementById('worklog-count').innerText = 'Nincs aktív gyülekezet!';
            return;
        }

        let query = _supabase.from('munkanaplo')
            .select('*')
            .eq('congregation_id', congId)
            .order('idopont', { ascending: false });

        if (monthFilter) {
            const start = `${monthFilter}-01`;
            const end = `${monthFilter}-31`;
            query = query.gte('idopont', start).lte('idopont', end);
        }

        const { data, error } = await query;
        if (error) throw error;

        allWorklogs = data || [];

        console.log('[Munkanapló] Lekérdezés: congId=' + congId + ', hónap=' + (monthFilter || 'ÖSSZES') + ', találat=' + allWorklogs.length);
        if (allWorklogs.length > 0) {
            var kats = {};
            allWorklogs.forEach(function(w) { kats[w.kategoria] = (kats[w.kategoria] || 0) + 1; });
            console.log('[Munkanapló] Kategóriák:', kats);
        }

        // Auto-detektálás: ha az első rekordban van bibliaolvasas oszlop, akkor létezik a tábla bővítés
        if (allWorklogs.length > 0 && 'bibliaolvasas' in allWorklogs[0]) {
            window._munkanaplo_extra_cols = true;
        }

        renderTable();
    } catch (err) {
        console.error("Munkanapló hiba:", err);
        document.getElementById('worklog-count').innerText = 'Hiba: ' + err.message;
    }
}

// --- 2. TÁBLÁZAT MEGJELENÍTÉSE ---
function renderTable() {
    // Csak a kiválasztott fülnek megfelelő adatokat mutatjuk
    const filteredData = allWorklogs.filter(w => w.kategoria === currentCategory);
    const body = document.getElementById('worklog-table-body');
    if (!body) return;

    body.innerHTML = filteredData.map(w => `
        <tr class="table-row-hover">
            <td>
                <div class="fw-bold text-primary">${w.idopont || '-'}</div>
                <div class="text-muted small">${w.jellege || ''}</div>
            </td>
            <td>
                <div class="fw-bold">${w.alapige || w.megjegyzes || '-'}</div>
            </td>
            <td>${w.cim || '-'}</td>
            <td>
                <span class="badge bg-blue-lt" title="Férfi/Nő/Gyerek" data-bs-toggle="tooltip">
                    <i class="ti ti-users me-1"></i>${w.jelenlet_osszesen} (F:${w.jelenlet_ferfi} N:${w.jelenlet_no} Gy:${w.jelenlet_gyermek})
                </span>
            </td>
            <td>${w.kategoria === 'szolgalat' ? `<span class="badge bg-green-lt">${w.persely || 0} RON</span>` : '-'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-ghost-primary" onclick="editWorklog(${w.id})"><i class="ti ti-edit"></i></button>
                <button class="btn btn-sm btn-ghost-danger" onclick="deleteWorklog(${w.id})"><i class="ti ti-trash"></i></button>
            </td>
        </tr>
    `).join('');

    const monthLabel = document.getElementById('filter-month').value
        ? 'a hónapban'
        : 'összesen';
    document.getElementById('worklog-count').innerText = `${filteredData.length} bejegyzés ${monthLabel}`;
}

// --- 3. ŰRLAP MEGJELENÍTÉSE / ELREJTÉSE ---
function adaptWorklogForm() {
    const cat = document.getElementById('w-kategoria').value;
    const szFields = document.querySelectorAll('.field-szolgalat');
    const labelCim = document.getElementById('label-cim');
    
    if (cat === 'szolgalat') {
        szFields.forEach(f => f.classList.remove('d-none'));
        labelCim.innerText = "Helyszín";
    } else {
        szFields.forEach(f => f.classList.add('d-none'));
        labelCim.innerText = cat === 'latogatas' ? "Család neve / Címe" : "Csoport / Helyszín";
    }
}

function openWorklogModal() {
    document.getElementById('worklog-form').reset();
    document.getElementById('w-id').value = '';
    document.getElementById('w-kategoria').value = currentCategory;
    document.getElementById('w-idopont').value = new Date().toISOString().split('T')[0];
    adaptWorklogForm();
    new bootstrap.Modal(document.getElementById('modal-worklog')).show();
}

async function editWorklog(id) {
    const entry = allWorklogs.find(w => w.id === id);
    if (!entry) return;

    document.getElementById('w-id').value = entry.id;
    document.getElementById('w-kategoria').value = entry.kategoria;
    document.getElementById('w-idopont').value = entry.idopont;
    adaptWorklogForm(); // Előbb adaptáljuk, hogy a select fel legyen töltve
    document.getElementById('w-jellege').value = entry.jellege || '';
    if (document.getElementById('w-bibliaolvasas')) document.getElementById('w-bibliaolvasas').value = entry.bibliaolvasas || '';
    if (document.getElementById('w-alapige')) document.getElementById('w-alapige').value = entry.alapige || '';
    if (document.getElementById('w-enekek')) document.getElementById('w-enekek').value = entry.enekek || '';
    if (document.getElementById('w-du')) document.getElementById('w-du').checked = entry.du || false;
    if (document.getElementById('w-cim')) document.getElementById('w-cim').value = entry.cim || '';
    document.getElementById('w-jelenlet_ferfi').value = entry.jelenlet_ferfi || 0;
    document.getElementById('w-jelenlet_no').value = entry.jelenlet_no || 0;
    document.getElementById('w-jelenlet_gyermek').value = entry.jelenlet_gyermek || 0;
    if (document.getElementById('w-persely')) document.getElementById('w-persely').value = entry.persely || 0;
    if (document.getElementById('w-szolgalt')) document.getElementById('w-szolgalt').value = entry.szolgalt || '';
    document.getElementById('w-megjegyzes').value = entry.megjegyzes || '';

    new bootstrap.Modal(document.getElementById('modal-worklog')).show();
}

// --- 4. MENTÉS (Insert / Update) ---
async function handleWorklogSubmit(e) {
    e.preventDefault();
    const congId = await getWorklogCongId();
    if (!congId) { alert('Nincs aktív gyülekezet! Jelentkezzen be újra.'); return; }

    const id = document.getElementById('w-id').value;
    const ferfi = parseInt(document.getElementById('w-jelenlet_ferfi').value) || 0;
    const no = parseInt(document.getElementById('w-jelenlet_no').value) || 0;
    const gyerek = parseInt(document.getElementById('w-jelenlet_gyermek').value) || 0;

    const entry = {
        kategoria: document.getElementById('w-kategoria').value,
        idopont: document.getElementById('w-idopont').value,
        jellege: document.getElementById('w-jellege').value,
        du: document.getElementById('w-du') ? document.getElementById('w-du').checked : false,
        bibliaolvasas: document.getElementById('w-bibliaolvasas') ? document.getElementById('w-bibliaolvasas').value : null,
        alapige: document.getElementById('w-alapige').value,
        enekek: document.getElementById('w-enekek').value,
        cim: document.getElementById('w-cim').value,
        jelenlet_ferfi: ferfi,
        jelenlet_no: no,
        jelenlet_gyermek: gyerek,
        jelenlet_osszesen: ferfi + no + gyerek,
        persely: parseFloat(document.getElementById('w-persely').value) || 0,
        szolgalt: document.getElementById('w-szolgalt') ? document.getElementById('w-szolgalt').value : null,
        megjegyzes: document.getElementById('w-megjegyzes').value,
        congregation_id: congId
    };

    let error;
    if (id) {
        ({ error } = await _supabase.from('munkanaplo').update(entry).eq('id', id));
    } else {
        ({ error } = await _supabase.from('munkanaplo').insert([entry]));
    }

    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modal-worklog')).hide();
        loadWorklogs();
    } else {
        alert("Hiba mentéskor: " + error.message);
    }
}

// --- 5. TÖRLÉS ---
async function deleteWorklog(id) {
    if (confirm("Biztosan törli ezt a bejegyzést?")) {
        await _supabase.from('munkanaplo').delete().eq('id', id);
        loadWorklogs();
    }
}

// --- 6. LELKÉSZI JELENTÉS GENERÁLÁSA (Excel sablon alapján) ---
function generateReport() {
    const monthVal = document.getElementById('filter-month').value || '';
    const periodLabel = monthVal
        ? new Date(monthVal + '-01').toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' })
        : 'Teljes időszak';

    const szolgalatok = allWorklogs.filter(w => w.kategoria === 'szolgalat');
    const latogatasok = allWorklogs.filter(w => w.kategoria === 'latogatas');
    const katekezisLista = allWorklogs.filter(w => w.kategoria === 'katekezis');

    // Összes számítás
    const totalPersely = szolgalatok.reduce((sum, w) => sum + Number(w.persely || 0), 0);

    // Alkalom típusonkénti bontás (II. fejezet - Istentiszteleti élet)
    const szAtkum = {};
    szolgalatok.forEach(w => { const j = w.jellege || 'Egyéb'; szAtkum[j] = (szAtkum[j] || {count:0,ferfi:0,no:0,du:0}); szAtkum[j].count++; szAtkum[j].ferfi += Number(w.jelenlet_ferfi||0); szAtkum[j].no += Number(w.jelenlet_no||0); if(w.du) szAtkum[j].du++; });

    // Katekézis típusonkénti bontás (V. fejezet)
    const katAtkum = {};
    katekezisLista.forEach(w => { const j = w.jellege || 'Egyéb'; katAtkum[j] = (katAtkum[j] || {count:0,jelenlet:0}); katAtkum[j].count++; katAtkum[j].jelenlet += Number(w.jelenlet_osszesen||0); });

    // CsL / BL bontás
    const csl = latogatasok.filter(w => (w.jellege||'').includes('CsL'));
    const bl = latogatasok.filter(w => (w.jellege||'').includes('BL'));

    const alkalmakTabla = Object.entries(szAtkum).map(([j, d]) => `
        <tr>
            <td class="fw-bold">${j}</td>
            <td class="text-center">${d.count}</td>
            <td class="text-center">${d.ferfi}</td>
            <td class="text-center">${d.no}</td>
            <td class="text-center fw-bold">${d.ferfi + d.no}</td>
        </tr>`).join('');

    const katTabla = Object.entries(katAtkum).map(([j, d]) => `
        <tr>
            <td class="fw-bold">${j}</td>
            <td class="text-center">${d.count}</td>
            <td class="text-center">${d.jelenlet}</td>
        </tr>`).join('');

    const html = `
        <!-- Fejléc -->
        <div class="col-12 mb-3">
            <div class="alert alert-info d-flex justify-content-between align-items-center">
                <div><i class="ti ti-report-analytics me-2"></i><strong>Lelkészi Jelentés — ${periodLabel}</strong></div>
                <button class="btn btn-sm btn-outline-secondary" onclick="window.print()"><i class="ti ti-printer me-1"></i>Nyomtatás</button>
            </div>
        </div>

        <!-- II. ISTENTISZTELETI ÉLET -->
        <div class="col-12">
            <div class="card shadow-sm border-0 border-top-wide border-primary">
                <div class="card-header"><h3 class="card-title text-primary"><span class="badge bg-primary me-2">II.</span>Istentiszteleti Élet</h3></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-vcenter table-sm mb-0">
                            <thead class="bg-light"><tr><th>Alkalom típusa</th><th class="text-center">Db</th><th class="text-center">Férfi</th><th class="text-center">Nő</th><th class="text-center">Összesen</th></tr></thead>
                            <tbody>${alkalmakTabla || '<tr><td colspan="5" class="text-muted text-center">Nincs adat</td></tr>'}</tbody>
                            <tfoot class="bg-light fw-bold">
                                <tr>
                                    <td>ÖSSZESEN</td>
                                    <td class="text-center">${szolgalatok.length}</td>
                                    <td class="text-center">${szolgalatok.reduce((s,w)=>s+Number(w.jelenlet_ferfi||0),0)}</td>
                                    <td class="text-center">${szolgalatok.reduce((s,w)=>s+Number(w.jelenlet_no||0),0)}</td>
                                    <td class="text-center">${szolgalatok.reduce((s,w)=>s+Number(w.jelenlet_osszesen||0),0)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- IV. BELMISSZIÓS TEVÉKENYSÉGEK / LÁTOGATÁS -->
        <div class="col-md-6">
            <div class="card shadow-sm border-0 border-top-wide border-success h-100">
                <div class="card-header"><h3 class="card-title text-success"><span class="badge bg-success me-2">IV.</span>Látogatói Szolgálat</h3></div>
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-6">
                            <div class="text-uppercase text-muted small fw-bold">Családlátogatás (CsL)</div>
                            <div class="h1 text-success">${csl.length}</div>
                        </div>
                        <div class="col-6">
                            <div class="text-uppercase text-muted small fw-bold">Beteglátogatás (BL)</div>
                            <div class="h1 text-warning">${bl.length}</div>
                        </div>
                    </div>
                    <div class="mt-3 text-center text-muted">
                        Összes látogatás: <strong>${latogatasok.length} alkalom</strong>
                    </div>
                </div>
            </div>
        </div>

        <!-- VII. ANYAGI HELYZET -->
        <div class="col-md-6">
            <div class="card shadow-sm border-0 border-top-wide border-warning h-100">
                <div class="card-header"><h3 class="card-title text-warning"><span class="badge bg-warning text-dark me-2">VII.</span>Anyagi Helyzet</h3></div>
                <div class="card-body">
                    <div class="text-center">
                        <div class="text-uppercase text-muted small fw-bold">Összes perselypénz</div>
                        <div class="h1 text-warning">${totalPersely.toFixed(2)} RON</div>
                    </div>
                    <div class="mt-2">
                        ${Object.entries(szAtkum).filter(([,d])=>d).map(([j,d])=>`<div class="d-flex justify-content-between"><span class="text-muted small">${j}</span><span class="fw-bold small">${(allWorklogs.filter(w=>w.jellege===j).reduce((s,w)=>s+Number(w.persely||0),0)).toFixed(2)} RON</span></div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- V. VALLÁSOKTATÁS / KATEKÉZIS -->
        <div class="col-12">
            <div class="card shadow-sm border-0 border-top-wide border-info">
                <div class="card-header"><h3 class="card-title text-info"><span class="badge bg-info me-2">V.</span>Vallásoktatás / Katekézis</h3></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-vcenter table-sm mb-0">
                            <thead class="bg-light"><tr><th>Katekézis típusa</th><th class="text-center">Alkalmak</th><th class="text-center">Összes részt vett</th></tr></thead>
                            <tbody>${katTabla || '<tr><td colspan="3" class="text-muted text-center">Nincs adat</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Lábléc -->
        <div class="col-12 mt-3">
            <div class="card bg-light border-0">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4 text-center">
                            <div class="text-muted small mb-3">Kelt: ${new Date().toLocaleDateString('hu-HU')}</div>
                            <div style="border-top: 1px solid #666; padding-top: 5px;">Lelkipásztor aláírása</div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="text-muted small mb-3">&nbsp;</div>
                            <div style="border-top: 1px solid #666; padding-top: 5px;">PH.</div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="text-muted small mb-3">&nbsp;</div>
                            <div style="border-top: 1px solid #666; padding-top: 5px;">Főgondnok / Gondnok aláírása</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('report-content').innerHTML = html;
}

// --- 7. EXCEL (CSV) EXPORT ---
function exportToExcel() {
    const filteredData = allWorklogs.filter(w => w.kategoria === currentCategory);
    if (filteredData.length === 0) { alert("Nincs adat az exportáláshoz!"); return; }

    const headers = ["Dátum", "Jellege", "Alapige", "Cím", "Férfi", "Nő", "Gyermek", "Összesen", "Persely", "Megjegyzés"];
    const csvRows = [headers.join(',')];

    filteredData.forEach(w => {
        const row = [
            w.idopont,
            `"${w.jellege || ''}"`,
            `"${w.alapige || ''}"`,
            `"${w.cim || ''}"`,
            w.jelenlet_ferfi,
            w.jelenlet_no,
            w.jelenlet_gyermek,
            w.jelenlet_osszesen,
            w.persely || 0,
            `"${w.megjegyzes || ''}"`
        ];
        csvRows.push(row.join(','));
    });

    const csvData = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvData);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Munkanaplo_${currentCategory}_${document.getElementById('filter-month').value}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// 🚨 ANYAKÖNYV - MUNKANAPLÓ HÍD (INTEGRÁCIÓ)
// ==========================================

// Ez a változó tárolja, ha a Munkanaplót egy Anyakönyvi esemény hívta meg
let pendingRegistryLink = null; 

/**
 * Ezt a funkciót az Anyakönyv (Keresztelés, Esküvő, Temetés) hívja meg mentés után!
 * @param {string} sourceTable - pl. 'keresztseg', 'hazassag', 'temetes'
 * @param {number} sourceId - Az anyakönyvi bejegyzés azonosítója
 * @param {string} date - Az esemény dátuma (YYYY-MM-DD)
 * @param {string} jellege - pl. 'Keresztelési szolgálat'
 * @param {string} alapige - A textus
 */
window.triggerWorklogFromRegistry = function(sourceTable, sourceId, date, jellege, alapige) {
    // 1. Eltároljuk a kapcsolatot
    pendingRegistryLink = { table: sourceTable, id: sourceId };

    // 2. Űrlap alaphelyzetbe állítása és előtöltése
    document.getElementById('worklog-form').reset();
    document.getElementById('w-id').value = '';
    
    // Alapértelmezett értékek betöltése az Anyakönyvből
    document.getElementById('w-kategoria').value = 'szolgalat'; // Mert ez egy szolgálat
    document.getElementById('w-idopont').value = date ? date.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('w-jellege').value = jellege || '';
    document.getElementById('w-alapige').value = alapige || '';
    
    // Mezők vizuális beállítása
    adaptWorklogForm();
    
    // Figyelmeztető sáv megjelenítése a Munkanapló űrlap tetején
    const alertDiv = document.getElementById('worklog-link-alert') || createLinkAlert();
    alertDiv.innerHTML = `<i class="ti ti-link me-2"></i> Ez a munkanapló bejegyzés automatikusan hozzá lesz kapcsolva a <b>${sourceTable}</b> anyakönyvhöz!`;
    alertDiv.classList.remove('d-none');

    // 3. Modális ablak megnyitása
    new bootstrap.Modal(document.getElementById('modal-worklog')).show();
};

// Segédfunkció a figyelmeztető sáv létrehozásához
function createLinkAlert() {
    const form = document.getElementById('worklog-form');
    const alert = document.createElement('div');
    alert.id = 'worklog-link-alert';
    alert.className = 'alert alert-info shadow-sm mb-3 fw-bold text-dark';
    form.insertBefore(alert, form.firstChild);
    return alert;
}

// 🚨 A MENTÉS FUNKCIÓ FELÜLÍRÁSA AZ ÖSSZEKÖTÉSHEZ
// (Ez felülírja a fájlban lévő handleWorklogSubmit funkciót!)
window.handleWorklogSubmit = async function(e) {
    e.preventDefault();
    const congId = await getWorklogCongId();
    if (!congId) { alert('Nem sikerült azonosítani a gyülekezetet!'); return; }

    const id = document.getElementById('w-id').value;
    const ferfi = parseInt(document.getElementById('w-jelenlet_ferfi').value) || 0;
    const no = parseInt(document.getElementById('w-jelenlet_no').value) || 0;
    const gyerek = parseInt(document.getElementById('w-jelenlet_gyermek').value) || 0;

    // Alap mezők (biztosan léteznek az adatbázisban)
    const entry = {
        kategoria: document.getElementById('w-kategoria').value,
        idopont: document.getElementById('w-idopont').value,
        jellege: document.getElementById('w-jellege').value,
        alapige: document.getElementById('w-alapige')?.value || null,
        enekek: document.getElementById('w-enekek')?.value || null,
        cim: document.getElementById('w-cim')?.value || null,
        jelenlet_ferfi: ferfi,
        jelenlet_no: no,
        jelenlet_gyermek: gyerek,
        jelenlet_osszesen: ferfi + no + gyerek,
        persely: parseFloat(document.getElementById('w-persely')?.value) || 0,
        megjegyzes: document.getElementById('w-megjegyzes')?.value || null,
        congregation_id: congId
    };

    // Opcionális mezők (csak ha léteznek az adatbázisban — lásd SQL migráció)
    const bibliaolvasas = document.getElementById('w-bibliaolvasas')?.value || null;
    const szolgalt = document.getElementById('w-szolgalt')?.value || null;
    const du = document.getElementById('w-du')?.checked || false;
    if (window._munkanaplo_extra_cols) {
        if (bibliaolvasas !== null) entry.bibliaolvasas = bibliaolvasas;
        if (szolgalt !== null) entry.szolgalt = szolgalt;
        entry.du = du;
    }

    try {
        let worklogId;

        // 1. Munkanapló mentése
        if (id) {
            const { error } = await _supabase.from('munkanaplo').update(entry).eq('id', id);
            if (error) throw error;
            worklogId = id;
        } else {
            const { data, error } = await _supabase.from('munkanaplo').insert([entry]).select('id').single();
            if (error) throw error;
            worklogId = data.id;
        }

        // 🚨 2. HA VOLT FÜGGŐBEN LÉVŐ ANYAKÖNYVI KAPCSOLAT, FRISSÍTJÜK AZ ANYAKÖNYVET!
        if (pendingRegistryLink && worklogId) {
            const { error: linkErr } = await _supabase
                .from(pendingRegistryLink.table)
                .update({ munkanaplo_id: worklogId, munkanaploba: true })
                .eq('id', pendingRegistryLink.id);
            
            if (linkErr) console.error("Hiba az Anyakönyv összekötésekor:", linkErr);
            else console.log("✅ Anyakönyv és Munkanapló sikeresen összekötve!");
            
            pendingRegistryLink = null; // Kapcsolat törlése
            const alertDiv = document.getElementById('worklog-link-alert');
            if(alertDiv) alertDiv.classList.add('d-none');
        }

        // 3. Ablak bezárása és frissítés
        bootstrap.Modal.getInstance(document.getElementById('modal-worklog')).hide();
        loadWorklogs();

    } catch (error) {
        alert("Hiba mentéskor: " + error.message);
    }
};

// ==========================================
// 🚨 MUNKANAPLÓ 2.0 - DINAMIKUS VEZÉRLŐ ÉS OKOS KERESŐ
// ==========================================

// A Hivatalos Súgó alapján kőbe vésett kategóriák
const WORKLOG_CATEGORIES = {
    'szolgalat': ["Vasárnapi i.t.", "Ünnepi i.t.", "Bűnbánati i.t.", "Úrvacsorai i.t.", "Hétköznapi i.t.", "Keresztelő", "Esküvő", "Temetés", "Bibliaóra", "Ifjúsági óra", "Imaóra", "Nőszövetség"],
    'katekezis': ["Elsőéves konf. felkészítő", "Másodéves konf. felkészítő", "Gyermekistentisztelet", "Vasárnapi iskola", "Vallásóra 1. csoport", "Vallásóra 2. csoport", "Vallásóra 3. csoport", "Vallásóra 4. csoport", "Vallásóra 5. csoport", "VBH - Vakációs Bibliahét"],
    'latogatas': ["CsL (Családlátogatás)", "BL (Beteglátogatás)"]
};

// Űrlap adaptálása a kiválasztott fül szerint
window.adaptWorklogForm = function() {
    const kategoria = document.getElementById('w-kategoria').value;
    const jellegeSelect = document.getElementById('w-jellege');
    
    // 1. Kategóriák feltöltése a hivatalos listából
    jellegeSelect.innerHTML = '<option value="">-- Válasszon a hivatalos listából --</option>';
    if (WORKLOG_CATEGORIES[kategoria]) {
        WORKLOG_CATEGORIES[kategoria].forEach(cat => {
            jellegeSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    }

    // 2. Mezők elrejtése/megjelenítése a kategória szerint
    // (Feltételezem, hogy a HTML-ben a mezők div-jei megkapják pl. az id="box-w-alapige" azonosítókat)
    const toggleBox = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };

    if (kategoria === 'szolgalat') {
        toggleBox('box-w-bibliaolvasas', true);
        toggleBox('box-w-alapige', true);
        toggleBox('box-w-enekek', true);
        toggleBox('box-w-cim', false); // Család neve itt nem kell
        toggleBox('box-w-persely', true);
    } 
    else if (kategoria === 'katekezis') {
        toggleBox('box-w-bibliaolvasas', false);
        toggleBox('box-w-alapige', true); // Ezt használjuk "Tananyag" gyanánt
        toggleBox('box-w-enekek', false);
        toggleBox('box-w-cim', false);
        toggleBox('box-w-persely', true);
        
        // Címke csere
        const lbl = document.querySelector('label[for="w-alapige"]');
        if (lbl) lbl.innerText = "Tananyag";
    } 
    else if (kategoria === 'latogatas') {
        toggleBox('box-w-bibliaolvasas', true); // Ezt használjuk "Család címe" gyanánt
        toggleBox('box-w-alapige', false);
        toggleBox('box-w-enekek', false);
        toggleBox('box-w-cim', true); // Család neve
        toggleBox('box-w-persely', false);
        
        // Címkék cseréje
        const lblCim = document.querySelector('label[for="w-cim"]');
        if (lblCim) lblCim.innerHTML = 'A meglátogatott család neve <span class="text-primary">(Okos Kereső)</span>';
        const lblBiblia = document.querySelector('label[for="w-bibliaolvasas"]');
        if (lblBiblia) lblBiblia.innerText = "A meglátogatott család címe";
        
        // Okos kereső esemény rákötése a Cím mezőre
        const cimInput = document.getElementById('w-cim');
        if (cimInput) {
            cimInput.setAttribute('onkeyup', 'searchFamilyForWorklog(this.value)');
            cimInput.setAttribute('placeholder', 'Kezdje el gépelni a család nevét...');
            
            // Kereső eredmények dobozának létrehozása, ha még nincs
            if (!document.getElementById('worklog-family-search-results')) {
                const searchBox = document.createElement('div');
                searchBox.id = 'worklog-family-search-results';
                searchBox.className = 'search-results card shadow-sm border-0';
                searchBox.style.position = 'absolute'; searchBox.style.zIndex = '1000'; searchBox.style.width = '95%'; searchBox.style.display = 'none';
                cimInput.parentNode.appendChild(searchBox);
            }
        }
    }
};

// 🚨 OKOS KERESŐ A TAGNYILVÁNTARTÁSBÓL
window.searchFamilyForWorklog = async function(val) {
    const resDiv = document.getElementById('worklog-family-search-results');
    if (val.length < 3) { resDiv.style.display = 'none'; return; }
    
    // Keresés a személyek között, akik családfők vagy relevánsak
    const { data, error } = await _supabase.from('szemely')
        .select('id, csaladnev, k_nev, c_szam, c_utcaid')
        .ilike('csaladnev', `%${val}%`)
        .limit(10);
        
    if (data && data.length > 0) {
        resDiv.innerHTML = data.map(m => `
            <div class="search-item p-2 border-bottom" onclick="selectFamilyForWorklog('${m.csaladnev} ${m.k_nev}', '${m.c_szam || ''}', ${m.id})">
                <i class="ti ti-users me-2 text-primary"></i><b>${m.csaladnev} ${m.k_nev}</b> <span class="text-muted small">(${m.c_szam || 'Nincs cím'})</span>
            </div>
        `).join('');
        resDiv.style.display = 'block';
    } else {
        resDiv.innerHTML = '<div class="p-2 text-muted small">Nincs találat a tagnyilvántartásban. (Kézzel is beírhatja!)</div>';
        resDiv.style.display = 'block';
    }
};

window.selectFamilyForWorklog = function(name, address, id) {
    document.getElementById('w-cim').value = name;
    document.getElementById('w-bibliaolvasas').value = address;
    document.getElementById('worklog-family-search-results').style.display = 'none';
    
    // Megjegyzésbe finoman beleírjuk a ID-t a statisztikához
    const megj = document.getElementById('w-megjegyzes');
    if (megj && !megj.value.includes(`[ID:${id}]`)) {
        megj.value += ` [ID:${id}]`;
    }
};

// ==========================================
// 🚨 MUNKANAPLÓ HIVATALOS NYOMTATÁSI KÉP
// ==========================================

window.printWorklog = function() {
    const filteredData = allWorklogs.filter(w => w.kategoria === currentCategory);
    if (filteredData.length === 0) { alert("Nincs megjeleníthető adat a nyomtatáshoz ebben az időszakban!"); return; }

    const year = document.getElementById('filter-month').value ? document.getElementById('filter-month').value.substring(0,4) : new Date().getFullYear();
    
    // 1. Nyomtatási ablak (Vagy iframe) megnyitása
    const printWindow = window.open('', '_blank');
    
    // 2. Hivatalos Fejléc összeállítása
    let html = `
    <html>
    <head>
        <title>Munkanapló Nyomtatás - ${year}</title>
        <style>
            body { font-family: 'Times New Roman', Times, serif; color: black; font-size: 12px; margin: 20px; }
            h1 { text-align: center; font-size: 18px; text-transform: uppercase; margin-bottom: 5px; }
            h2 { text-align: center; font-size: 14px; font-weight: normal; margin-top: 0; margin-bottom: 20px;}
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid black; padding: 5px; text-align: center; vertical-align: middle; }
            th { font-weight: bold; background-color: #f2f2f2; }
            .text-left { text-align: left; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-weight: bold; }
            @media print {
                @page { size: A4 landscape; margin: 10mm; }
                body { margin: 0; }
                button { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="header-info">
            <span>Református Egyházközség</span>
            <span>Évszám: ${year}</span>
        </div>
        <h1>Szolgálati Munkanapló - ${year}</h1>
        <h2>(Kinyomtatva a Digitális Kartotéka Rendszerből)</h2>
        
        <button onclick="window.print()" style="padding: 10px 20px; background: #206bc4; color: white; border: none; cursor: pointer; margin-bottom: 20px; font-weight: bold; font-size: 14px; border-radius: 4px;">🖨️ PDF Mentés / Nyomtatás</button>
        <p style="color: red; font-weight: bold; font-family: Arial;">FIGYELEM: A nyomtató beállításainál válassza a Tájolás: FEKVŐ (Landscape) lehetőséget!</p>
        
        <table>
    `;

    // 3. Oszlopok összeállítása Kategória szerint (A Gyermekek összevonásával!)
    if (currentCategory === 'szolgalat') {
        html += `
            <tr>
                <th rowspan="2">Sz.</th>
                <th rowspan="2">Dátum</th>
                <th rowspan="2">Szolgálat jellege</th>
                <th rowspan="2">Bibliaolvasás</th>
                <th rowspan="2">Alapige</th>
                <th rowspan="2">Énekek</th>
                <th colspan="2">Részt vett</th>
                <th rowspan="2">Szolgált</th>
                <th rowspan="2">P. pénz</th>
                <th rowspan="2">Jegyzet</th>
            </tr>
            <tr>
                <th>Férfi</th>
                <th>Nő</th>
            </tr>
        `;
        filteredData.forEach((w, index) => {
            // 🚨 GYERMEKEK MATEMATIKAI BEOLVASZTÁSA A NŐKHÖZ ÉS FÉRFIAKHOZ (Fele-fele arányban)
            let printFerfi = (w.jelenlet_ferfi || 0) + Math.floor((w.jelenlet_gyermek || 0) / 2);
            let printNo = (w.jelenlet_no || 0) + Math.ceil((w.jelenlet_gyermek || 0) / 2);

            html += `
                <tr>
                    <td>${filteredData.length - index}</td>
                    <td>${w.idopont}</td>
                    <td class="text-left">${w.jellege || ''}</td>
                    <td>${w.bibliaolvasas || ''}</td>
                    <td>${w.alapige || ''}</td>
                    <td>${w.enekek || ''}</td>
                    <td>${printFerfi}</td>
                    <td>${printNo}</td>
                    <td>${w.szolgalt || ''}</td>
                    <td>${w.persely || 0}</td>
                    <td class="text-left">${w.megjegyzes || ''}</td>
                </tr>
            `;
        });
    } else if (currentCategory === 'katekezis') {
        // ... Katekézis oszlopok a PDF minta alapján ...
        html += `
            <tr>
                <th>Sor szám</th><th>Dátum</th><th>Katekézis jellege</th><th>Részt vett</th><th>Tananyag</th><th>Persely pénz</th><th>A katekézist tartotta</th><th>Megjegyzés</th>
            </tr>
        `;
        filteredData.forEach((w, index) => {
            html += `<tr><td>${filteredData.length - index}</td><td>${w.idopont}</td><td>${w.jellege || ''}</td><td>${w.jelenlet_osszesen || 0}</td><td>${w.alapige || ''}</td><td>${w.persely || 0}</td><td>${w.szolgalt || ''}</td><td>${w.megjegyzes || ''}</td></tr>`;
        });
    } else if (currentCategory === 'latogatas') {
        // ... Látogatás oszlopok ...
        html += `
            <tr>
                <th>Sor szám</th><th>Dátum</th><th>CsL / BL</th><th>A meglátogatott család neve</th><th>Címe</th><th>Jelen volt</th><th>Jegyzet</th>
            </tr>
        `;
        filteredData.forEach((w, index) => {
            html += `<tr><td>${filteredData.length - index}</td><td>${w.idopont}</td><td>${w.jellege || ''}</td><td>${w.cim || ''}</td><td>${w.bibliaolvasas || ''}</td><td>${w.jelenlet_osszesen || 0}</td><td>${w.megjegyzes || ''}</td></tr>`;
        });
    }

    html += `
        </table>
        <div style="margin-top: 50px; display: flex; justify-content: space-between;">
            <div style="text-align: center;">Készítette:<br><br>___________________</div>
            <div style="text-align: center;">PH.</div>
            <div style="text-align: center;">Ellenőrizte:<br><br>___________________</div>
        </div>
    </body>
    </html>`;

    printWindow.document.write(html);
    printWindow.document.close();
};