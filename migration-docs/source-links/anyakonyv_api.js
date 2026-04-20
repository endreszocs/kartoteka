let currentAkTab = 'keresztseg';
let allAkData = [];
let cachedCsaladfaAdatok = null;
let _akCongregationId = null; // Gyülekezet ID cache – biztonsági szűrőhöz

// ==========================================
// 🚨 ADATBETÖLTŐ ÉS GOMB-VEZÉRLŐ (Javított)
// ==========================================
async function loadAkData(tabName) {
    currentAkTab = tabName;
    const tContainer = document.getElementById('ak-table-container');
    const dContainer = document.getElementById('ak-dashboard-container');
    const fContainer = document.getElementById('ak-familytree-container');
    const btnUj = document.getElementById('btn-dinamikus-uj');
    const title = document.getElementById('ak-section-title');

    tContainer.classList.add('d-none'); dContainer.classList.add('d-none'); fContainer.classList.add('d-none');
    if(btnUj) btnUj.classList.add('d-none');

    document.querySelectorAll('.page-header-tab .nav-link').forEach(el => el.classList.remove('active'));
    document.querySelector(`.page-header-tab .nav-link[onclick="loadAkData('${tabName}')"]`)?.classList.add('active');

    try {
        if (tabName === 'attekinto') {
            title.innerHTML = '<i class="ti ti-dashboard me-2"></i>Áttekintő és Statisztika';
            dContainer.classList.remove('d-none'); await renderAkDashboard(); return;
        } 
        if (tabName === 'csaladfa') {
            title.innerHTML = '<i class="ti ti-binary-tree me-2 text-purple"></i>Interaktív Családfakutató';
            fContainer.classList.remove('d-none'); await renderFamilyTree(); return;
        }

        tContainer.classList.remove('d-none');
        if (btnUj) {
            btnUj.classList.remove('d-none'); btnUj.className = 'btn text-nowrap shadow-sm text-white '; 
            
            // A gombot letiltjuk az automata nyitásról, az onclick-et a switch-ben állítjuk be
            btnUj.removeAttribute('data-bs-toggle');
            btnUj.removeAttribute('data-bs-target');
            btnUj.removeAttribute('onclick');
            btnUj.onclick = null;

            switch(currentAkTab) {
                case 'keresztseg': btnUj.classList.add('btn-primary'); btnUj.innerHTML = '<i class="ti ti-droplet me-2"></i>Keresztelés Rögzítése'; title.innerText = 'Kereszteltek Anyakönyve'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'hazassag': btnUj.classList.add('bg-warning', 'text-dark'); btnUj.innerHTML = '<i class="ti ti-rings me-2"></i>Házasságkötés Rögzítése'; title.innerText = 'Házasultak Anyakönyve'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'konfirmalas': btnUj.classList.add('bg-purple'); btnUj.innerHTML = '<i class="ti ti-cross me-2"></i>Konfirmandusok Rögzítése'; title.innerText = 'Konfirmáltak Anyakönyve'; btnUj.onclick = function(e) { e.preventDefault(); _openKonfirmacioModal(); }; break;
                case 'temetes': btnUj.classList.add('bg-dark'); btnUj.innerHTML = '<i class="ti ti-coffin me-2"></i>Haláleset Rögzítése'; title.innerText = 'Eltemetettek Anyakönyve'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'bekoltozott': btnUj.classList.add('bg-teal'); btnUj.innerHTML = '<i class="ti ti-arrow-right-tail me-2"></i>Beköltözés Rögzítése'; title.innerText = 'Beköltözöttek'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'elkoltozott': btnUj.classList.add('bg-orange'); btnUj.innerHTML = '<i class="ti ti-arrow-left-tail me-2"></i>Elköltözés Rögzítése'; title.innerText = 'Elköltözöttek'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'attert': btnUj.classList.add('btn-success'); btnUj.innerHTML = '<i class="ti ti-user-check me-2"></i>Áttérés Rögzítése'; title.innerText = 'Áttértek'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
                case 'kitert': btnUj.classList.add('btn-danger'); btnUj.innerHTML = '<i class="ti ti-user-x me-2"></i>Kitérés Rögzítése'; title.innerText = 'Kitértek'; btnUj.onclick = function(e) { e.preventDefault(); openAkModal(); }; break;
            }
        }

        // Gyülekezet ID lekérése ha még nem cachelt – defense in depth szűrőhöz
        if (!_akCongregationId) {
            const { data: { user } } = await _supabase.auth.getUser();
            const { data: prof } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
            _akCongregationId = prof?.congregation_id || null;
        }

        // JAVÍTÁS: Supabase v2-ben .eq() csak .select() UTÁN hívható,
        // ezért a congregation_id szűrőt a select/order UTÁN adjuk hozzá.
        let query;
        if (currentAkTab === 'keresztseg') {
            query = _supabase.from(currentAkTab).select(`
                *,
                szemely!id_szemely (csaladnev, k_nev, sz_datum, vallas, apjaneve, anyjaneve, id_apja, id_anyja, adrlocality!sz_helyid (name)),
                congregations!congregation_id (name)
            `).order('datum', { ascending: false });
        } else if (currentAkTab === 'hazassag') {
            query = _supabase.from(currentAkTab).select('*, ferfi:szemely!id_ferfi(csaladnev, k_nev), no:szemely!id_no(csaladnev, k_nev)').order('datum', { ascending: false });
        } else if (currentAkTab === 'konfirmalas') {
            query = _supabase.from(currentAkTab).select('*, szemely!id_szemely(csaladnev, k_nev, sz_datum, ferfi)').order('datum', { ascending: false });
        } else {
            query = _supabase.from(currentAkTab).select('*, szemely!id_szemely(csaladnev, k_nev)').order('datum', { ascending: false });
        }
        if (_akCongregationId) query = query.eq('congregation_id', _akCongregationId);

        const { data, error } = await query;
        if (error) throw error;
        
        allAkData = data || [];
        // Szűrők reset
        _akSortCol = null; _akSortAsc = true; _akFilterYear = ''; _akSearchText = '';

        // Szűrő sáv megjelenítése
        _showAkFilters();

        renderAkTable();

        // Darabszám kiírása
        var countDiv = document.getElementById('ak-count');
        if (countDiv && currentAkTab !== 'attekinto') {
            countDiv.textContent = allAkData.length + ' bejegyzés';
        } else if (countDiv) {
            countDiv.textContent = '';
        }

    } catch (err) { console.error("Anyakönyv betöltési hiba:", err); }
}

async function renderAkDashboard() { /* Hely megtartva */ }

// ==========================================
// SZŰRÉS, KERESÉS, RENDEZÉS
// ==========================================
var _akSortCol = null;
var _akSortAsc = true;
var _akFilterYear = '';
var _akSearchText = '';

// Szűrő + kereső sáv megjelenítése/elrejtése
function _showAkFilters() {
    var filterBar = document.getElementById('ak-filter-bar');
    if (filterBar) { filterBar.remove(); }

    if (currentAkTab === 'attekinto') return;

    // Évek kiszűrése az adatokból (dátum mező tábla-függő)
    var evek = {};
    allAkData.forEach(function(d) {
        var datum = d.datum || d.mikor || d.hdatum || d.tdatum || '';
        var ev = datum.substring(0, 4);
        if (ev && ev.length === 4) evek[ev] = true;
    });
    var evLista = Object.keys(evek).sort().reverse();

    var bar = document.createElement('div');
    bar.id = 'ak-filter-bar';
    bar.className = 'mb-3 d-flex flex-wrap gap-2 align-items-center';
    bar.innerHTML =
        '<div class="input-icon flex-grow-1" style="max-width:280px;">' +
            '<span class="input-icon-addon"><i class="ti ti-search"></i></span>' +
            '<input type="text" class="form-control" placeholder="Keresés név, lelkész..." id="ak-live-search" oninput="_applyAkFilters()">' +
        '</div>' +
        '<select class="form-select" style="width:auto;min-width:120px;" id="ak-year-filter" onchange="_applyAkFilters()">' +
            '<option value="">Minden év</option>' +
            evLista.map(function(ev) { return '<option value="' + ev + '">' + ev + '</option>'; }).join('') +
        '</select>' +
        '<span class="text-muted small" id="ak-filter-count"></span>';

    var tableContainer = document.getElementById('ak-table-container');
    if (tableContainer) tableContainer.insertBefore(bar, tableContainer.firstChild);
}

window._applyAkFilters = function() {
    _akFilterYear = (document.getElementById('ak-year-filter') || {}).value || '';
    _akSearchText = ((document.getElementById('ak-live-search') || {}).value || '').toLowerCase().trim();
    renderAkTable();
};

function _getFilteredAkData() {
    var data = allAkData;

    // Év szűrő (dátum mező tábla-függő)
    if (_akFilterYear) {
        data = data.filter(function(d) {
            var datum = d.datum || d.mikor || d.tdatum || d.hdatum || '';
            return datum.substring(0, 4) === _akFilterYear;
        });
    }

    // Keresés (minden releváns mezőben)
    if (_akSearchText) {
        data = data.filter(function(d) {
            var nev = ((d.szemely?.csaladnev || d.ferfi?.csaladnev || '') + ' ' + (d.szemely?.k_nev || d.ferfi?.k_nev || '')).toLowerCase();
            var nev2 = currentAkTab === 'hazassag' ? ((d.no?.csaladnev || '') + ' ' + (d.no?.k_nev || '')).toLowerCase() : '';
            var lelkesz = (d.lelkeszneve || '').toLowerCase();
            var okirat = (d.okirat || '').toString().toLowerCase();
            var megj = (d.megjegyzes || '').toLowerCase();
            var tanuk = (d.tanuk || '').toLowerCase();
            var igazolas = (d.igazolas || '').toLowerCase();
            var felekezet = (d.felekezet || '').toLowerCase();
            var hoka = (d.hoka || '').toLowerCase();
            return nev.indexOf(_akSearchText) !== -1 || nev2.indexOf(_akSearchText) !== -1 ||
                   lelkesz.indexOf(_akSearchText) !== -1 || okirat.indexOf(_akSearchText) !== -1 ||
                   megj.indexOf(_akSearchText) !== -1 || tanuk.indexOf(_akSearchText) !== -1 ||
                   igazolas.indexOf(_akSearchText) !== -1 || felekezet.indexOf(_akSearchText) !== -1 ||
                   hoka.indexOf(_akSearchText) !== -1;
        });
    }

    // Rendezés
    if (_akSortCol) {
        data = data.slice().sort(function(a, b) {
            var va, vb;
            switch (_akSortCol) {
                case 'nev': va = (a.szemely?.csaladnev || a.ferfi?.csaladnev || '') + (a.szemely?.k_nev || a.ferfi?.k_nev || ''); vb = (b.szemely?.csaladnev || b.ferfi?.csaladnev || '') + (b.szemely?.k_nev || b.ferfi?.k_nev || ''); break;
                case 'nev2': va = (a.no?.csaladnev || '') + (a.no?.k_nev || ''); vb = (b.no?.csaladnev || '') + (b.no?.k_nev || ''); break;
                case 'datum': va = a.datum || a.mikor || ''; vb = b.datum || b.mikor || ''; break;
                case 'hdatum': va = a.hdatum || ''; vb = b.hdatum || ''; break;
                case 'tdatum': va = a.tdatum || ''; vb = b.tdatum || ''; break;
                case 'okirat': va = a.okirat || ''; vb = b.okirat || ''; break;
                case 'lelkesz': va = a.lelkeszneve || ''; vb = b.lelkeszneve || ''; break;
                case 'sz_datum': va = a.szemely?.sz_datum || ''; vb = b.szemely?.sz_datum || ''; break;
                case 'kereszteles': va = a.keresztelesideje || ''; vb = b.keresztelesideje || ''; break;
                case 'tanuk': va = a.tanuk || ''; vb = b.tanuk || ''; break;
                case 'felekezet': va = a.felekezet || ''; vb = b.felekezet || ''; break;
                case 'megj': va = a.megjegyzes || ''; vb = b.megjegyzes || ''; break;
                default: va = ''; vb = '';
            }
            if (va < vb) return _akSortAsc ? -1 : 1;
            if (va > vb) return _akSortAsc ? 1 : -1;
            return 0;
        });
    }

    return data;
}

window._sortAkBy = function(col) {
    if (_akSortCol === col) { _akSortAsc = !_akSortAsc; }
    else { _akSortCol = col; _akSortAsc = true; }
    renderAkTable();
};

function _sortIcon(col) {
    if (_akSortCol !== col) return '<i class="ti ti-arrows-sort ms-1 text-muted" style="font-size:0.75rem;"></i>';
    return _akSortAsc
        ? '<i class="ti ti-sort-ascending ms-1 text-primary" style="font-size:0.75rem;"></i>'
        : '<i class="ti ti-sort-descending ms-1 text-primary" style="font-size:0.75rem;"></i>';
}

// ==========================================
// TÁBLÁZAT GENERÁLÓ
// ==========================================
function renderAkTable() {
    const thead = document.getElementById('ak-thead');
    const tbody = document.getElementById('ak-tbody');
    let headHTML = ''; let bodyHTML = '';
    const trClass = "cursor-pointer table-hover-row";

    var filteredData = _getFilteredAkData();

    // Szűrő számláló frissítése
    var countEl = document.getElementById('ak-filter-count');
    if (countEl) {
        if (_akFilterYear || _akSearchText) {
            countEl.textContent = filteredData.length + ' / ' + allAkData.length + ' találat';
        } else {
            countEl.textContent = filteredData.length + ' bejegyzés';
        }
    }

    switch(currentAkTab) {
        case 'keresztseg':
            headHTML = '<tr>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'okirat\')">Sorszám' + _sortIcon('okirat') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev\')">Gyermek Neve' + _sortIcon('nev') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'datum\')">Keresztelés Dátuma' + _sortIcon('datum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'lelkesz\')">Szolgáló Lelkész' + _sortIcon('lelkesz') + '</th>' +
                '<th class="text-center" style="width:100px;">Műveletek</th></tr>';
            bodyHTML = filteredData.map(d => `
                <tr>
                    <td onclick="openAkModal(${d.id})" class="${trClass}"><span class="badge bg-danger-lt fs-6 fw-bold">${d.okirat || '-'}</span></td>
                    <td onclick="openAkModal(${d.id})" class="${trClass} fw-bold text-blue">${d.szemely?.csaladnev || ''} ${d.szemely?.k_nev || ''}</td>
                    <td onclick="openAkModal(${d.id})" class="${trClass}">${d.datum?.split('T')[0] || '-'}</td>
                    <td onclick="openAkModal(${d.id})" class="${trClass}">${d.lelkeszneve || '-'}</td>
                    <td class="text-center">
                        <button type="button" class="btn btn-sm btn-icon btn-outline-primary me-1" onclick="generateBaptismCertificate(${d.id})" title="Emléklap nyomtatása"><i class="ti ti-printer"></i></button>
                        <button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteKereszteles(${d.id})" title="Törlés"><i class="ti ti-trash"></i></button>
                    </td>
                </tr>`).join('');
            break;
        case 'hazassag':
            headHTML = '<tr>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev\')">Vőlegény' + _sortIcon('nev') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev2\')">Menyasszony' + _sortIcon('nev2') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'datum\')">Házasság Dátuma' + _sortIcon('datum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'lelkesz\')">Szolgáló Lelkész' + _sortIcon('lelkesz') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'tanuk\')">Tanúk' + _sortIcon('tanuk') + '</th>' +
                '<th class="text-center" style="width:50px;"></th></tr>';
            bodyHTML = filteredData.map(d => `<tr>
                <td onclick="openAkModal(${d.id})" class="${trClass} fw-bold text-blue">${d.ferfi?.csaladnev || ''} ${d.ferfi?.k_nev || ''}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass} fw-bold text-pink">${d.no?.csaladnev || ''} ${d.no?.k_nev || ''}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${d.datum?.split('T')[0] || '-'}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${d.lelkeszneve || '-'}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass} small text-muted">${d.tanuk || '-'}</td>
                <td class="text-center"><button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteAkEntry('hazassag',${d.id})" title="Törlés"><i class="ti ti-trash"></i></button></td>
            </tr>`).join('');
            break;
        case 'konfirmalas':
            headHTML = '<tr>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev\')">Konfirmandus Neve' + _sortIcon('nev') + '</th>' +
                '<th class="text-center" style="width:50px;">Nem</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'sz_datum\')">Születési dátum' + _sortIcon('sz_datum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'kereszteles\')">Keresztelés dátuma' + _sortIcon('kereszteles') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'datum\')">Konfirmáció dátuma' + _sortIcon('datum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'lelkesz\')">Konfirmáló lelkész' + _sortIcon('lelkesz') + '</th></tr>';
            bodyHTML = filteredData.map(d => {
                var nemIcon = d.szemely?.ferfi === true
                    ? '<span class="badge bg-blue-lt"><i class="ti ti-gender-male"></i></span>'
                    : d.szemely?.ferfi === false
                        ? '<span class="badge bg-pink-lt"><i class="ti ti-gender-female"></i></span>'
                        : '<span class="text-muted">—</span>';
                return `<tr data-konf-id="${d.id}" class="${trClass}" style="cursor:pointer;"><td class="fw-bold text-purple">${d.szemely?.csaladnev || ''} ${d.szemely?.k_nev || ''}</td><td class="text-center">${nemIcon}</td><td>${d.szemely?.sz_datum || '-'}</td><td>${d.keresztelesideje || '-'}</td><td><span class="badge bg-purple-lt fs-6">${d.datum || '-'}</span></td><td>${d.lelkeszneve || '-'}</td></tr>`;
            }).join('');
            break;
        case 'temetes':
            headHTML = '<tr>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev\')">Elhunyt Neve' + _sortIcon('nev') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'hdatum\')">Halál Dátuma / Oka' + _sortIcon('hdatum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'tdatum\')">Temetés Dátuma' + _sortIcon('tdatum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'lelkesz\')">Szolgáló Lelkész' + _sortIcon('lelkesz') + '</th>' +
                '<th class="text-center" style="width:50px;"></th></tr>';
            bodyHTML = filteredData.map(d => `<tr>
                <td onclick="openAkModal(${d.id})" class="${trClass} fw-bold text-dark">${d.szemely?.csaladnev || ''} ${d.szemely?.k_nev || ''}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${d.hdatum?.split('T')[0] || '-'}<br><small class="text-muted">${d.hoka || '-'}</small></td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${d.tdatum?.split('T')[0] || '-'}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${d.lelkeszneve || '-'}</td>
                <td class="text-center"><button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteAkEntry('temetes',${d.id})" title="Törlés"><i class="ti ti-trash"></i></button></td>
            </tr>`).join('');
            break;
        default:
            // Beköltözött, Elköltözött, Áttért, Kitért
            headHTML = '<tr>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'nev\')">Személy Neve' + _sortIcon('nev') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'datum\')">Dátum' + _sortIcon('datum') + '</th>' +
                '<th style="cursor:pointer;" onclick="_sortAkBy(\'megj\')">Megjegyzés' + _sortIcon('megj') + '</th>' +
                '<th class="text-center" style="width:50px;"></th></tr>';
            bodyHTML = filteredData.map(d => `<tr>
                <td onclick="openAkModal(${d.id})" class="${trClass} fw-bold">${d.szemely?.csaladnev || ''} ${d.szemely?.k_nev || ''}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass}">${(d.datum || d.mikor || d.hdatum || '').split('T')[0] || '-'}</td>
                <td onclick="openAkModal(${d.id})" class="${trClass} small text-muted">${d.megjegyzes || '-'}</td>
                <td class="text-center"><button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteAkEntry('${currentAkTab}',${d.id})" title="Törlés"><i class="ti ti-trash"></i></button></td>
            </tr>`).join('');
            break;
    }
    thead.innerHTML = headHTML;
    tbody.innerHTML = bodyHTML || `<tr><td colspan="6" class="text-center text-muted">Nincs még bejegyzés.</td></tr>`;

    // Event delegation — konfirmáltak soraira kattintás
    if (currentAkTab === 'konfirmalas') {
        tbody.querySelectorAll('tr[data-konf-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                var konfId = parseInt(this.getAttribute('data-konf-id'));
                if (konfId && typeof window.openKonfEditModal === 'function') {
                    window.openKonfEditModal(konfId);
                }
            });
        });
    }
}

window.searchMemberForAk = async function(val, type) {
    const resDiv = document.getElementById(`ak-search-${type}`);
    if (val.trim().length < 2) { resDiv.style.display = 'none'; return; }

    var parts = val.trim().split(/\s+/);
    var query = _supabase.from('szemely').select('id, csaladnev, k_nev, sz_datum, c_szam');
    if (parts.length >= 2) {
        query = query.ilike('csaladnev', '%' + parts[0] + '%').ilike('k_nev', '%' + parts.slice(1).join(' ') + '%');
    } else {
        query = query.or('csaladnev.ilike.%' + parts[0] + '%,k_nev.ilike.%' + parts[0] + '%');
    }
    const { data, error } = await query.limit(10);

    if (data && data.length > 0) {
        resDiv.innerHTML = data.map(m => {
            let kor = '?';
            if (m.sz_datum) {
                const today = new Date(); const birthDate = new Date(m.sz_datum);
                let age = today.getFullYear() - birthDate.getFullYear();
                if (today.getMonth() - birthDate.getMonth() < 0 || (today.getMonth() - birthDate.getMonth() === 0 && today.getDate() < birthDate.getDate())) age--;
                kor = age;
            }
            const cim = m.c_szam ? `Házszám: ${m.c_szam}` : 'Nincs pontos cím megadva';

            return `
            <div class="search-item p-2 border-bottom" onclick="selectMemberForAk('${m.id}', '${m.csaladnev} ${m.k_nev}', '${type}')">
                <i class="ti ti-user me-2 text-primary"></i><b>${m.csaladnev} ${m.k_nev}</b> <span class="badge bg-blue-lt ms-2">${kor} éves</span>
                <div class="text-muted small mt-1"><i class="ti ti-home me-1"></i>${cim}</div>
            </div>`;
        }).join('');
    } else {
        resDiv.innerHTML = `
            <div class="p-3 text-center bg-light">
                <p class="small text-danger fw-bold mb-2">A személy nincs az M1 Kartotékban!</p>
                <button type="button" class="btn btn-sm btn-success w-100 shadow-sm" onclick="openMemberModalFromAk('${val}')">
                    <i class="ti ti-user-plus me-1"></i>Új Tag (Gyermek) Felvétele
                </button>
            </div>`;
    }
    resDiv.style.display = 'block';
};

window.selectMemberForAk = async function(id, name, type) {
    document.getElementById(`ak-${type}-kereso`).value = name;
    document.getElementById(`ak-id_${type}`).value = id;
    document.getElementById(`ak-search-${type}`).style.display = 'none';

    if (currentAkTab === 'keresztseg' && type === 'szemely') {
        try {
            const { data: childData } = await _supabase.from('szemely')
                .select('id_apja, id_anyja, apjaneve, anyjaneve')
                .eq('id', id).limit(1);

            if (childData && childData.length > 0) {
                const child = childData[0];

                // ── APA betöltése és automatikus összekötés ──
                let apaNev = child.apjaneve || ''; let apaVallas = ''; var apaLinkedCnp = child.id_apja || '';

                if (apaLinkedCnp) {
                    // Már összekötve ID-vel → lekérjük a nevet
                    const { data: apaData } = await _supabase.from('szemely').select('csaladnev, k_nev, vallas').eq('cnp', apaLinkedCnp).limit(1);
                    if (apaData && apaData.length > 0) { apaNev = `${apaData[0].csaladnev} ${apaData[0].k_nev}`; apaVallas = apaData[0].vallas || ''; }
                } else if (apaNev) {
                    // Nincs ID → próbáljuk megkeresni név alapján és automatikusan összekötni
                    const parts = apaNev.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        var apaQuery = _supabase.from('szemely').select('id, cnp, csaladnev, k_nev, vallas')
                            .ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`).eq('ferfi', true).eq('meghalt', false);
                        if (_akCongregationId) apaQuery = apaQuery.eq('congregation_id', _akCongregationId);
                        const { data: aData } = await apaQuery.limit(2);
                        if (aData && aData.length === 1) {
                            // Egyértelmű találat → automatikus összekötés
                            apaLinkedCnp = aData[0].cnp || '';
                            apaNev = `${aData[0].csaladnev} ${aData[0].k_nev}`;
                            apaVallas = aData[0].vallas || '';
                            // Frissítjük az adatbázisban is
                            if (apaLinkedCnp) {
                                await _supabase.from('szemely').update({ id_apja: apaLinkedCnp }).eq('id', id);
                            }
                        } else if (aData && aData.length > 0) {
                            apaVallas = aData[0].vallas || '';
                        }
                    }
                }

                var apaNeveEl = document.getElementById('ak-apa-neve');
                var apaVallasEl = document.getElementById('ak-apa-vallas');
                if (apaNeveEl) apaNeveEl.value = apaNev;
                if (apaVallasEl) apaVallasEl.value = apaVallas;

                var apaBadge = document.getElementById('ak-apa-link-badge');
                if (apaLinkedCnp) {
                    if (document.getElementById('ak-apa-id')) document.getElementById('ak-apa-id').value = apaLinkedCnp;
                    if (apaBadge) apaBadge.innerHTML = '<span class="badge bg-green-lt text-green"><i class="ti ti-link me-1"></i>Összekötve</span>';
                    if (apaNeveEl) { apaNeveEl.readOnly = true; apaNeveEl.classList.add('bg-green-lt'); apaNeveEl.removeAttribute('onkeyup'); }
                    if (apaVallasEl && apaVallas) { apaVallasEl.readOnly = true; apaVallasEl.classList.add('bg-green-lt'); }
                } else if (apaNev) {
                    if (apaBadge) apaBadge.innerHTML = '<span class="badge bg-red-lt text-red" title="A családfa és a családi automatizmusok működéséhez fontos az összekapcsolás!"><i class="ti ti-alert-triangle me-1"></i>Nincs összekötve — válassza ki a listából!</span>';
                }

                // ── ANYA betöltése és automatikus összekötés ──
                let anyaNev = child.anyjaneve || ''; let anyaVallas = ''; var anyaLinkedCnp = child.id_anyja || '';

                if (anyaLinkedCnp) {
                    const { data: anyaData } = await _supabase.from('szemely').select('csaladnev, k_nev, vallas').eq('cnp', anyaLinkedCnp).limit(1);
                    if (anyaData && anyaData.length > 0) { anyaNev = `${anyaData[0].csaladnev} ${anyaData[0].k_nev}`; anyaVallas = anyaData[0].vallas || ''; }
                } else if (anyaNev) {
                    const parts = anyaNev.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        var anyaQuery = _supabase.from('szemely').select('id, cnp, csaladnev, k_nev, vallas')
                            .ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`).eq('ferfi', false).eq('meghalt', false);
                        if (_akCongregationId) anyaQuery = anyaQuery.eq('congregation_id', _akCongregationId);
                        const { data: mData } = await anyaQuery.limit(2);
                        if (mData && mData.length === 1) {
                            anyaLinkedCnp = mData[0].cnp || '';
                            anyaNev = `${mData[0].csaladnev} ${mData[0].k_nev}`;
                            anyaVallas = mData[0].vallas || '';
                            if (anyaLinkedCnp) {
                                await _supabase.from('szemely').update({ id_anyja: anyaLinkedCnp }).eq('id', id);
                            }
                        } else if (mData && mData.length > 0) {
                            anyaVallas = mData[0].vallas || '';
                        }
                    }
                }

                var anyaNeveEl = document.getElementById('ak-anya-neve');
                var anyaVallasEl = document.getElementById('ak-anya-vallas');
                var anyaLeanyEl = document.getElementById('ak-anya-leanyneve');
                if (anyaNeveEl) anyaNeveEl.value = anyaNev;
                if (anyaVallasEl) anyaVallasEl.value = anyaVallas;

                var anyaBadge = document.getElementById('ak-anya-link-badge');
                if (anyaLinkedCnp) {
                    if (document.getElementById('ak-anya-id')) document.getElementById('ak-anya-id').value = anyaLinkedCnp;
                    if (anyaBadge) anyaBadge.innerHTML = '<span class="badge bg-green-lt text-green"><i class="ti ti-link me-1"></i>Összekötve</span>';
                    if (anyaNeveEl) { anyaNeveEl.readOnly = true; anyaNeveEl.classList.add('bg-green-lt'); anyaNeveEl.removeAttribute('onkeyup'); }
                    if (anyaVallasEl && anyaVallas) { anyaVallasEl.readOnly = true; anyaVallasEl.classList.add('bg-green-lt'); }
                    // Leánykori név
                    if (anyaLeanyEl) {
                        var anyaSrc = await _supabase.from('szemely').select('csaladnev').eq('cnp', anyaLinkedCnp).limit(1);
                        if (anyaSrc.data && anyaSrc.data.length > 0 && anyaSrc.data[0].csaladnev) {
                            anyaLeanyEl.value = anyaSrc.data[0].csaladnev;
                        }
                    }
                } else if (anyaNev) {
                    if (anyaBadge) anyaBadge.innerHTML = '<span class="badge bg-red-lt text-red" title="A családfa és a családi automatizmusok működéséhez fontos az összekapcsolás!"><i class="ti ti-alert-triangle me-1"></i>Nincs összekötve — válassza ki a listából!</span>';
                }
            }
        } catch (err) { console.error("Hiba a szülők betöltésekor:", err); }
    }
};

// ═══════════════════════════════════════════════════════════════
// SZÜLŐ KERESŐ — APA/ANYA HOZZÁRENDELÉS SZEMÉLY ID-VEL
// ═══════════════════════════════════════════════════════════════

window.searchParentForAk = async function(val, parentType) {
    var resDiv = document.getElementById('ak-search-' + parentType);
    if (val.trim().length < 2) { resDiv.style.display = 'none'; return; }

    var isFerfi = (parentType === 'apa');
    var parts = val.trim().split(/\s+/);
    var query = _supabase.from('szemely')
        .select('id, cnp, csaladnev, k_nev, sz_datum, ferfi, vallas, anyjaneve')
        .eq('ferfi', isFerfi)
        .eq('meghalt', false);

    if (parts.length >= 2) {
        query = query.ilike('csaladnev', '%' + parts[0] + '%').ilike('k_nev', '%' + parts.slice(1).join(' ') + '%');
    } else {
        query = query.or('csaladnev.ilike.%' + parts[0] + '%,k_nev.ilike.%' + parts[0] + '%');
    }

    if (_akCongregationId) query = query.eq('congregation_id', _akCongregationId);
    query = query.limit(10);

    var result = await query;
    var data = result.data || [];

    if (data.length > 0) {
        resDiv.innerHTML = data.map(function(m) {
            var kor = '?';
            if (m.sz_datum) {
                var today = new Date(); var bd = new Date(m.sz_datum);
                kor = today.getFullYear() - bd.getFullYear();
                if (today.getMonth() - bd.getMonth() < 0 || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) kor--;
            }
            var cnpStr = m.cnp || '';
            var csaladnevStr = (m.csaladnev || '').replace(/'/g, "\\'");
            return '<div class="search-item p-2 border-bottom" style="cursor:pointer;" ' +
                'onclick="selectParentForAk(\'' + m.id + '\', \'' + cnpStr.replace(/'/g, "\\'") + '\', \'' +
                csaladnevStr + ' ' + (m.k_nev || '').replace(/'/g, "\\'") + '\', \'' +
                parentType + '\', \'' + (m.vallas || '').replace(/'/g, "\\'") + '\', \'' +
                csaladnevStr + '\')">' +
                '<i class="ti ti-user me-2 text-' + (isFerfi ? 'blue' : 'pink') + '"></i>' +
                '<b>' + m.csaladnev + ' ' + m.k_nev + '</b> ' +
                '<span class="badge bg-blue-lt ms-1">' + kor + ' éves</span>' +
                (cnpStr ? ' <span class="badge bg-green-lt ms-1"><i class="ti ti-link me-1"></i>Összeköthető</span>' : '') +
                '</div>';
        }).join('');
    } else {
        resDiv.innerHTML = '<div class="p-2 text-center text-muted small">Nincs találat — a nevet kézzel is beírhatja.</div>';
    }
    resDiv.style.display = 'block';
};

window.selectParentForAk = function(personId, cnp, fullName, parentType, vallas, csaladnev) {
    var nameInput = document.getElementById('ak-' + parentType + '-neve');
    var idInput = document.getElementById('ak-' + parentType + '-id');
    var resDiv = document.getElementById('ak-search-' + parentType);
    var badge = document.getElementById('ak-' + parentType + '-link-badge');

    if (nameInput) nameInput.value = fullName;
    if (idInput) idInput.value = cnp || personId;
    if (resDiv) resDiv.style.display = 'none';
    if (badge) badge.innerHTML = '<span class="badge bg-green-lt text-green"><i class="ti ti-link me-1"></i>Összekötve</span>';

    // Vallás automatikus kitöltése
    var vallasInput = document.getElementById('ak-' + parentType + '-vallas');
    if (vallasInput && vallas) vallasInput.value = vallas;

    // Anya leánykori neve = az anya családneve (születési neve)
    if (parentType === 'anya' && csaladnev) {
        var leanyInput = document.getElementById('ak-anya-leanyneve');
        if (leanyInput) leanyInput.value = csaladnev;
    }
};

// ═══════════════════════════════════════════════════════════════
// ANYAKÖNYVI SZÁM REAL-TIME FRISSÍTÉSE DÁTUMVÁLTOZÁSKOR
// ═══════════════════════════════════════════════════════════════

window.recalcOkiratByDate = async function() {
    if (currentAkTab !== 'keresztseg') return;

    var akId = document.getElementById('ak-id').value;
    if (akId) return; // Módosításnál nem változtatjuk az okirat számot

    var datumInput = document.getElementById('ak-datum');
    var okiratInput = document.getElementById('ak-okirat');
    if (!datumInput || !okiratInput || !datumInput.value) return;

    var selectedYear = datumInput.value.substring(0, 4);

    try {
        // Az adott év összes keresztelési bejegyzését lekérdezzük
        var query = _supabase.from('keresztseg')
            .select('okirat')
            .gte('datum', selectedYear + '-01-01')
            .lte('datum', selectedYear + '-12-31');

        if (_akCongregationId) query = query.eq('congregation_id', _akCongregationId);

        var result = await query;
        var entries = result.data || [];

        var nextNum = selectedYear + '01001';

        if (entries.length > 0) {
            // Az adott év okirat számaiból a legnagyobbat keressük
            var okiratok = entries
                .map(function(e) { return String(e.okirat || ''); })
                .filter(function(o) { return o.startsWith(selectedYear); });

            if (okiratok.length > 0) {
                okiratok.sort(function(a, b) { return b.localeCompare(a); });
                var lastOkirat = okiratok[0];
                var lastPart = lastOkirat.substring(4);
                if (!isNaN(lastPart)) {
                    var incremented = parseInt(lastPart, 10) + 1;
                    nextNum = selectedYear + incremented.toString().padStart(5, '0');
                }
            }
        }

        okiratInput.value = nextNum;
        console.log('[Okirat] Dátum: ' + datumInput.value + ' → Anyakönyvi szám: ' + nextNum);

    } catch (err) {
        console.error('[Okirat] Hiba az anyakönyvi szám újraszámításakor:', err);
    }
};

window.openMemberModalFromAk = function(searchedName) {
    document.getElementById('ak-search-szemely').style.display = 'none';
    window.isReturningToAnyakonyv = true; 

    if (typeof window.openNextModal === 'function') {
        window.openNextModal('modal-anyakonyv', () => {
            if (typeof resetToPreScreen === 'function') resetToPreScreen();
            const form = document.getElementById('member-registration-form');
            if (form) form.reset();
            if (document.getElementById('m-id')) document.getElementById('m-id').value = '';
            
            const parts = searchedName.trim().split(' ');
            if (document.getElementById('m-csaladnev')) document.getElementById('m-csaladnev').value = parts[0] || '';
            if (document.getElementById('m-k_nev')) document.getElementById('m-k_nev').value = parts.slice(1).join(' ') || '';
            
            const modalEl = document.getElementById('modal-add-member');
            new bootstrap.Modal(modalEl).show();

            setTimeout(() => {
                const clickables = modalEl.querySelectorAll('[onclick]');
                let cardClicked = false;
                clickables.forEach(el => {
                    if (el.innerHTML.includes('Születés') || el.innerHTML.includes('Adatbázis')) { el.click(); cardClicked = true; }
                });

                if (!cardClicked) {
                    const preScreen1 = document.getElementById('m-pre-screen'); const preScreen2 = document.querySelector('.pre-screen-container');
                    const formScreen1 = document.getElementById('m-form-screen'); const formScreen2 = document.querySelector('.form-container');
                    if (preScreen1) preScreen1.style.setProperty('display', 'none', 'important'); if (preScreen2) preScreen2.style.setProperty('display', 'none', 'important');
                    if (formScreen1) formScreen1.style.setProperty('display', 'block', 'important'); if (formScreen2) formScreen2.style.setProperty('display', 'block', 'important');
                    if (document.getElementById('m-type')) document.getElementById('m-type').value = 'E';
                    if (document.getElementById('m-member_status')) document.getElementById('m-member_status').value = 'aktív';
                    if (document.getElementById('m-bekerules_oka')) document.getElementById('m-bekerules_oka').value = 'Születés'; 
                }

                const modalTitle = modalEl.querySelector('.modal-title');
                if (modalTitle) modalTitle.innerHTML = '<i class="ti ti-baby me-2"></i>Új Gyermek (Születés) Rögzítése';
                const tabFin = document.querySelector('.nav-link.tab-fin'); const tabReg = document.querySelector('.nav-link.tab-reg'); const tabPers = document.querySelector('.nav-link.tab-pers');
                if (tabFin) tabFin.parentElement.style.display = 'none'; if (tabReg) tabReg.parentElement.style.display = 'none';
                if (tabPers) { tabPers.click(); tabPers.innerHTML = '<i class="ti ti-baby me-2"></i>Gyermek Adatai'; }
            }, 150); 
        });
    } else { alert("A Tagnyilvántartás modul jelenleg nem érhető el!"); }
};

// ==========================================
// 🚨 ABLAK MEGNYITÓ: AUTOMATIKUS SORSZÁM BEÍRÁSSAL
// ==========================================
window.openAkModal = async function(id = null) {
    const form = document.getElementById('ak-form');
    if (form) form.reset();
    
    document.getElementById('ak-id').value = id || ''; 
    document.getElementById('ak-type').value = currentAkTab;
    document.getElementById('ak-id_szemely').value = '';
    
    const fields = ['ak-szemely-kereso','ak-okirat','ak-apa-neve','ak-anya-neve','ak-anya-leanyneve','ak-keresztszulok','ak-lelkeszneve','ak-datum','ak-megjegyzes','ak-apa-id','ak-anya-id'];

    // Szülő mezők readOnly és stílus resetelése
    ['ak-apa-neve','ak-anya-neve','ak-apa-vallas','ak-anya-vallas'].forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el) { el.readOnly = false; el.classList.remove('bg-green-lt'); }
    });
    var apaNevEl = document.getElementById('ak-apa-neve');
    if (apaNevEl) apaNevEl.setAttribute('onkeyup', "searchParentForAk(this.value, 'apa')");
    var anyaNevEl = document.getElementById('ak-anya-neve');
    if (anyaNevEl) anyaNevEl.setAttribute('onkeyup', "searchParentForAk(this.value, 'anya')");

    // Szülő badge-ek törlése
    var apaBadge = document.getElementById('ak-apa-link-badge');
    var anyaBadge = document.getElementById('ak-anya-link-badge');
    if (apaBadge) apaBadge.innerHTML = '';
    if (anyaBadge) anyaBadge.innerHTML = '';
    fields.forEach(f => { if(document.getElementById(f)) document.getElementById(f).value = ''; });
    if(document.getElementById('ak-apa-vallas')) document.getElementById('ak-apa-vallas').value = '';
    if(document.getElementById('ak-anya-vallas')) document.getElementById('ak-anya-vallas').value = '';
    if(document.getElementById('ak-munkanaploba')) document.getElementById('ak-munkanaploba').checked = true;
    
    const crossBlock = document.getElementById('ak-block-keresztseg');
    if(crossBlock) crossBlock.classList.add('d-none');

    if (currentAkTab === 'keresztseg') {
        const modalTitle = document.getElementById('ak-modal-title');
        if (modalTitle) modalTitle.innerHTML = id ? '<i class="ti ti-droplet me-2 text-primary"></i>Keresztelés Módosítása' : '<i class="ti ti-droplet me-2"></i>Új Keresztelés Rögzítése';
        
        const datumInput = document.getElementById('ak-datum');
        if (datumInput && !id) datumInput.value = new Date().toISOString().split('T')[0]; 
        
        // 🚨 AUTOMATIKUS SORSZÁM GENERÁTOR ÉS BEÍRÓ!
        if (!id) {
            const currentYear = new Date().getFullYear().toString();
            // Biztosítjuk, hogy kőkemény String-ként olvasson mindent!
            const thisYearEntries = allAkData.filter(d => d.okirat && String(d.okirat).startsWith(currentYear));
            let nextNum = currentYear + "01001"; 
            
            if (thisYearEntries.length > 0) {
                thisYearEntries.sort((a, b) => String(b.okirat).localeCompare(String(a.okirat)));
                const lastOkirat = String(thisYearEntries[0].okirat);
                const lastPart = lastOkirat.substring(4); 
                if (!isNaN(lastPart)) {
                    const incremented = parseInt(lastPart, 10) + 1; 
                    nextNum = currentYear + incremented.toString().padStart(5, '0');
                }
            }
            
            // 🚨 BEÍRJUK FIZIKAILAG A MEZŐBE!
            const okiratInput = document.getElementById('ak-okirat');
            if (okiratInput) {
                okiratInput.value = nextNum;
            } else {
                console.error("Nem találom az ak-okirat mezőt a HTML-ben!");
            }
        }
        
        if(crossBlock) crossBlock.classList.remove('d-none');
    }

    // HA MÓDOSÍTUNK
    if (id) {
        const entry = allAkData.find(d => d.id === id);
        if (entry) {
            if (entry.datum) document.getElementById('ak-datum').value = entry.datum.split('T')[0];
            if (document.getElementById('ak-okirat')) document.getElementById('ak-okirat').value = entry.okirat || '';
            if (document.getElementById('ak-lelkeszneve')) document.getElementById('ak-lelkeszneve').value = entry.lelkeszneve || '';
            if (document.getElementById('ak-munkanaploba')) document.getElementById('ak-munkanaploba').checked = entry.munkanaploba || false;
            
            if (currentAkTab === 'keresztseg') {
                if (document.getElementById('ak-keresztszulok')) document.getElementById('ak-keresztszulok').value = entry.keresztszulok || '';
                
                let tisztaMegjegyzes = entry.megjegyzes || '';
                if (tisztaMegjegyzes.includes('|sablon:')) {
                    try {
                        const parts = tisztaMegjegyzes.split('|sablon:');
                        tisztaMegjegyzes = parts[0];
                        const sablonData = JSON.parse(parts[1]);
                        if (document.getElementById('ak-anya-leanyneve')) document.getElementById('ak-anya-leanyneve').value = sablonData.anya_leanyneve || '';
                        if (document.getElementById('ak-apa-vallas')) document.getElementById('ak-apa-vallas').value = sablonData.apa_vallas || '';
                        if (document.getElementById('ak-anya-vallas')) document.getElementById('ak-anya-vallas').value = sablonData.anya_vallas || '';
                    } catch(e) {}
                }
                if (document.getElementById('ak-megjegyzes')) document.getElementById('ak-megjegyzes').value = tisztaMegjegyzes;

                if (entry.id_szemely && entry.szemely) {
                    await selectMemberForAk(entry.id_szemely, `${entry.szemely.csaladnev} ${entry.szemely.k_nev}`, 'szemely');
                }
            } else {
                if (document.getElementById('ak-megjegyzes')) document.getElementById('ak-megjegyzes').value = entry.megjegyzes || '';
            }
        }
    }

    const modalEl = document.getElementById('modal-anyakonyv');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

window.handleAkSubmit = async function(e) {
    e.preventDefault();
    const btn = e.submitter;
    const origText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; btn.disabled = true; }

    try {
        const akId = document.getElementById('ak-id').value; 
        const type = document.getElementById('ak-type').value; 
        const idSzemely = document.getElementById('ak-id_szemely').value;
        const datum = document.getElementById('ak-datum').value;

        if (!idSzemely) { alert("Kérem, válassza ki a személyt a listából!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
        if (!datum) { alert("Kérem, adja meg a dátumot!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }

        // Keresztelésnél kötelező mezők validálása
        if (type === 'keresztseg') {
            var apaVallas = document.getElementById('ak-apa-vallas') ? document.getElementById('ak-apa-vallas').value.trim() : '';
            var anyaVallas = document.getElementById('ak-anya-vallas') ? document.getElementById('ak-anya-vallas').value.trim() : '';
            var keresztszulok = document.getElementById('ak-keresztszulok') ? document.getElementById('ak-keresztszulok').value.trim() : '';
            var alapige = document.getElementById('ak-alapige') ? document.getElementById('ak-alapige').value.trim() : '';
            var okirat = document.getElementById('ak-okirat') ? document.getElementById('ak-okirat').value.trim() : '';

            if (!okirat) { alert("Kérem, adja meg az anyakönyvi számot!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
            if (!apaVallas) { alert("Kérem, adja meg az apa vallását!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
            if (!anyaVallas) { alert("Kérem, adja meg az anya vallását!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
            if (!keresztszulok) { alert("Kérem, adja meg a keresztszülők nevét!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
            if (!alapige) { alert("Kérem, adja meg a keresztelési igét (textust)!"); if (btn) { btn.innerHTML = origText; btn.disabled = false; } return; }
        }

        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profileArray } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).limit(1);
        const profile = profileArray[0];

        const isMunkanaplo = document.getElementById('ak-munkanaploba') ? document.getElementById('ak-munkanaploba').checked : false;

        let finalMegjegyzes = document.getElementById('ak-megjegyzes')?.value || '';
        let entry = {
            id_szemely: idSzemely, 
            datum: datum, 
            okirat: document.getElementById('ak-okirat')?.value || '',
            lelkeszneve: document.getElementById('ak-lelkeszneve')?.value || '', 
            megjegyzes: finalMegjegyzes,
            congregation_id: profile.congregation_id,
            munkanaploba: isMunkanaplo 
        };

        let alapigeTxt = "";

        if (type === 'keresztseg') {
            entry.keresztszulok = document.getElementById('ak-keresztszulok')?.value || '';
            alapigeTxt = document.getElementById('ak-alapige')?.value || '';

            const apaNeve = document.getElementById('ak-apa-neve')?.value || '';
            const anyaNeve = document.getElementById('ak-anya-neve')?.value || '';
            const apaId = document.getElementById('ak-apa-id')?.value || '';
            const anyaId = document.getElementById('ak-anya-id')?.value || '';

            // Szülők nevét és ID-jét is mentjük a szemely táblába (családfa!)
            var szemelyUpdate = { apjaneve: apaNeve, anyjaneve: anyaNeve };
            if (apaId) szemelyUpdate.id_apja = apaId;
            if (anyaId) szemelyUpdate.id_anyja = anyaId;
            await _supabase.from('szemely').update(szemelyUpdate).eq('id', idSzemely);
        }

        let dbResponse;
        if (akId) { dbResponse = await _supabase.from(type).update(entry).eq('id', akId).select('id').single(); } 
        else { dbResponse = await _supabase.from(type).insert([entry]).select('id').single(); }

        const { data, error } = dbResponse;
        if (error) throw new Error(error.message);

        const modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-anyakonyv'));
        if (modalInst) modalInst.hide();

        // ── Család ellenőrzés és létrehozás (keresztelésnél) ──
        if (type === 'keresztseg' && !akId) {
            var apaIdVal = document.getElementById('ak-apa-id')?.value || '';
            var anyaIdVal = document.getElementById('ak-anya-id')?.value || '';
            await _checkAndCreateFamily(parseInt(idSzemely), apaIdVal, anyaIdVal, profile.congregation_id);
        }

        if (!akId && type === 'keresztseg' && isMunkanaplo) {
            if (typeof window.triggerWorklogFromRegistry === 'function') { window.triggerWorklogFromRegistry('keresztseg', data.id, datum, 'Keresztelő', alapigeTxt); }
            else { alert("A bejegyzés mentve, de a Munkanapló modul jelenleg nem érhető el."); loadAkData(type); }
        } else {
            loadAkData(type);
            alert(akId ? "✅ Anyakönyvi bejegyzés sikeresen módosítva!" : "✅ Anyakönyvi bejegyzés sikeresen mentve!");
        }

    } catch (err) {
        console.error("Hiba az Anyakönyvi mentéskor:", err);
        alert("Hiba mentéskor: " + err.message);
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    }
};

// ═══════════════════════════════════════════════════════════════
// CSALÁD ELLENŐRZÉS ÉS AUTOMATIKUS LÉTREHOZÁS KERESZTELÉSKOR
// ═══════════════════════════════════════════════════════════════

async function _checkAndCreateFamily(gyerekId, apaIdCnp, anyaIdCnp, congregationId) {
    try {
        var msgs = [];

        // Ha nincs szülő összekötve → figyelmeztetés
        if (!apaIdCnp && !anyaIdCnp) {
            alert('⚠️ Családi kapcsolat figyelmeztetés\n\n' +
                  'A szülők nincsenek összekötve a gyermekkel.\n' +
                  'A családfa, a családi nyilvántartás és az automatizmusok (pl. járulék, családlátogatás) NEM tudnak működni.\n\n' +
                  'Javasoljuk a szülők összekapcsolását:\n' +
                  '• Az Édesapa/Édesanya mező melletti keresővel válassza ki a szülőt a tagok közül.\n' +
                  '• Vagy a Tagnyilvántartás → Családok fülön rendelje össze őket.');
            return;
        }

        // Szülő szemely.id-k lekérése CNP alapján
        var apaPersonId = null, anyaPersonId = null;
        var apaCimAdatok = null, anyaCimAdatok = null;

        if (apaIdCnp) {
            var apaRes = await _supabase.from('szemely').select('id, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto').eq('cnp', apaIdCnp).limit(1);
            if (apaRes.data && apaRes.data.length > 0) { apaPersonId = apaRes.data[0].id; apaCimAdatok = apaRes.data[0]; }
        }
        if (anyaIdCnp) {
            var anyaRes = await _supabase.from('szemely').select('id, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto').eq('cnp', anyaIdCnp).limit(1);
            if (anyaRes.data && anyaRes.data.length > 0) { anyaPersonId = anyaRes.data[0].id; anyaCimAdatok = anyaRes.data[0]; }
        }

        // Van-e már család ezzel a szülőpárossal?
        var csaladId = null;
        var meglevoQuery = _supabase.from('csalad').select('id, id_ferfi, id_no');

        if (apaPersonId && anyaPersonId) {
            meglevoQuery = meglevoQuery.eq('id_ferfi', apaPersonId).eq('id_no', anyaPersonId);
        } else if (apaPersonId) {
            meglevoQuery = meglevoQuery.eq('id_ferfi', apaPersonId);
        } else if (anyaPersonId) {
            meglevoQuery = meglevoQuery.eq('id_no', anyaPersonId);
        }

        var meglevoResult = await meglevoQuery.limit(1);
        if (meglevoResult.data && meglevoResult.data.length > 0) {
            csaladId = meglevoResult.data[0].id;
            msgs.push('✅ A szülők családja már létezik a rendszerben.');
        } else {
            // NINCS CSALÁD — megpróbáljuk automatikusan létrehozni
            var cimForras = apaCimAdatok || anyaCimAdatok;

            if (cimForras && cimForras.c_utcaid && cimForras.c_szam) {
                // Van cím a szülőnél — felajánljuk az automatikus létrehozást
                var valasz = confirm(
                    '📋 Családi nyilvántartás\n\n' +
                    'A szülőkhöz még nincs család létrehozva.\n\n' +
                    'Szeretné most automatikusan létrehozni a családot a szülők címadataival?\n' +
                    '(Házszám: ' + cimForras.c_szam + ')\n\n' +
                    'A gyermek is automatikusan hozzárendelődik.\n\n' +
                    'OK = Igen, hozza létre\nMégse = Később, kézzel a Családok fülön'
                );

                if (valasz) {
                    var familyEntry = {
                        id_ferfi: apaPersonId || null,
                        id_no: anyaPersonId || null,
                        c_utcaid: cimForras.c_utcaid,
                        c_szam: cimForras.c_szam,
                        c_tombhaz: cimForras.c_tombhaz || null,
                        c_lepcsohaz: cimForras.c_lepcsohaz || null,
                        c_emelet: cimForras.c_emelet || null,
                        c_ajto: cimForras.c_ajto || null,
                        isaktiv: true
                    };

                    var insertRes = await _supabase.from('csalad').insert([familyEntry]).select('id').single();
                    if (insertRes.error) {
                        msgs.push('⚠️ A család létrehozása sikertelen: ' + insertRes.error.message);
                    } else {
                        csaladId = insertRes.data.id;
                        msgs.push('✅ Család sikeresen létrehozva! (#' + csaladId + ')');
                    }
                } else {
                    msgs.push('ℹ️ A család létrehozását kihagyta.\nA Tagnyilvántartás → Családok fülön bármikor megteheti.');
                }
            } else {
                // Nincs cím a szülőknél
                msgs.push('⚠️ A szülőkhöz nincs család létrehozva, és a címadataik hiányosak.\n' +
                           'A család automatikus létrehozásához szükséges az utca és házszám.\n\n' +
                           'Javasolt lépés:\n' +
                           '1. Tagnyilvántartás → szülők címadatainak kitöltése\n' +
                           '2. Tagnyilvántartás → Családok fülön család létrehozása');
            }
        }

        // Gyerek hozzárendelés a családhoz
        if (csaladId) {
            var gyerekRes = await _supabase.from('gyerek')
                .select('id')
                .eq('id_csalad', csaladId)
                .eq('id_szemely', gyerekId)
                .limit(1);

            if (gyerekRes.data && gyerekRes.data.length > 0) {
                msgs.push('✅ A gyermek már szerepel a család tagjai között.');
            } else {
                var gyerekInsert = await _supabase.from('gyerek').insert([{
                    id_csalad: csaladId,
                    id_szemely: gyerekId
                }]);
                if (gyerekInsert.error) {
                    msgs.push('⚠️ A gyermeket nem sikerült a családhoz rendelni: ' + gyerekInsert.error.message);
                } else {
                    msgs.push('✅ A gyermek automatikusan hozzáadva a családhoz!');
                }
            }
        }

        // Összegző üzenet
        if (msgs.length > 0) {
            alert('Család-ellenőrzés eredménye:\n\n' + msgs.join('\n\n'));
        }

    } catch (err) {
        console.error('[Család ellenőrzés] Hiba:', err);
    }
}
// ==========================================
// 🚨 ÚJ MOTOR: OKOS SZÜLŐ-KERESŐS EMLÉKLAP STÚDIÓ (V17 FINAL)
// ==========================================
window.generateBaptismCertificate = async function(id) {
    const entry = allAkData.find(d => d.id === id);
    if (!entry || currentAkTab !== 'keresztseg') { alert("A bejegyzés nem található."); return; }
    if (!entry.id_szemely || !entry.szemely) { alert("A gyermek adatai hiányoznak."); return; }

    const formatDate = (dateStr) => {
        if (!dateStr) return '.......................';
        const d = new Date(dateStr);
        if (isNaN(d)) return '.......................';
        return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')}.`;
    };

    const gyulNev = entry.congregations?.name || '.......................';
    const keltHely = gyulNev.split(' ')[0] || '.......................';

    let sablonData = { anya_leanyneve: '', apa_vallas: 'Református', anya_vallas: 'Református' };
    if (entry.megjegyzes && entry.megjegyzes.includes('|sablon:')) {
        try { sablonData = JSON.parse(entry.megjegyzes.split('|sablon:')[1]); } catch(e) {}
    }

    // 🚨 DINAMIKUS SZÜLŐ-KERESŐ MOTOR (Ha CNP-vel vannak összekötve, lehúzza az élő nevet!)
    let kinyertApa = entry.szemely?.apjaneve || entry.apjaneve || '';
    let kinyertAnya = entry.szemely?.anyjaneve || entry.anyjaneve || '';
    
    if (entry.szemely) {
        if (entry.szemely.id_apja) {
            const { data: apaData } = await _supabase.from('szemely').select('csaladnev, k_nev').eq('cnp', entry.szemely.id_apja).limit(1);
            if (apaData && apaData.length > 0) kinyertApa = `${apaData[0].csaladnev} ${apaData[0].k_nev}`;
        }
        if (entry.szemely.id_anyja) {
            const { data: anyaData } = await _supabase.from('szemely').select('csaladnev, k_nev').eq('cnp', entry.szemely.id_anyja).limit(1);
            if (anyaData && anyaData.length > 0) kinyertAnya = `${anyaData[0].csaladnev} ${anyaData[0].k_nev}`;
        }
    }

    // Ha még ezek után is üres lenne, akkor kipontozzuk
    if (!kinyertApa || kinyertApa.trim() === '') kinyertApa = '.......................';
    if (!kinyertAnya || kinyertAnya.trim() === '') kinyertAnya = '.......................';
    
    // Leánykori név hozzáfűzése, ha van
    if (sablonData.anya_leanyneve && kinyertAnya !== '.......................') {
        kinyertAnya += ` (szül: ${sablonData.anya_leanyneve})`;
    }

    const data = {
        gyermek_neve: `${entry.szemely.csaladnev} ${entry.szemely.k_nev}`,
        szuletesi_hely: entry.szemely.adrlocality?.name || '.......................',
        szuletesi_ido: formatDate(entry.szemely.sz_datum),
        
        // 🚨 Itt már a kőkeményen kinyomozott nevek szerepelnek!
        apa_neve: kinyertApa,
        anya_neve: kinyertAnya,
        
        kereszteles_ido: formatDate(entry.datum),
        gyulekezet_neve: gyulNev,
        lelkesz_neve: entry.lelkeszneve || '.......................',
        kelt_hely: keltHely,
        gondnok_neve: '.......................', 
        anyakonyvi_szam: entry.okirat || entry.datum?.split('-')[0] + '/...'
    };

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <title>Emléklap Szerkesztő - ${data.gyermek_neve}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    
    <style>
        body { margin: 0; padding: 0; background: #1e1e24; display: flex; height: 100vh; overflow: hidden; font-family: 'Inter', sans-serif; }
        .sidebar { width: 320px; background: #111115; color: #fff; padding: 40px 30px; box-shadow: 2px 0 20px rgba(0,0,0,0.5); display: flex; flex-direction: column; z-index: 1000; }
        .sidebar h2 { margin: 0 0 10px 0; font-family: 'Cinzel', serif; font-size: 22px; color: #e5b369; letter-spacing: 1px;}
        .sidebar p { color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 40px; }
        .action-btn { background: #0d6efd; color: white; border: none; padding: 15px 20px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.3s ease; margin-bottom: 15px; }
        .action-btn:hover { background: #0b5ed7; transform: translateY(-2px); }
        .btn-outline { background: transparent; border: 1px solid #444; color: #ccc; }
        .btn-outline:hover { background: #222; color: #fff; border-color: #666; transform: none; }
        .workspace { flex: 1; display: flex; justify-content: center; align-items: center; overflow: auto; padding: 40px; background: radial-gradient(circle, #2a2a32 0%, #1e1e24 100%); }

        .a4-page {
            width: 210mm; height: 297mm; 
            background-color: white;
            background-image: url('components/Keresztelői emléklap1.jpg'); 
            background-size: cover; background-position: center; background-repeat: no-repeat;
            position: relative; flex-shrink: 0;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6); 
            transform: scale(0.9); transform-origin: top center;
        }

        .editable-field { 
            position: absolute; font-family: 'Playfair Display', serif; color: #111; cursor: pointer;
            padding: 4px 8px; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s ease;
        }
        .editable-field:hover { background: rgba(13, 110, 253, 0.05); border: 1px dashed #0d6efd; }
        .editable-field:focus { outline: none; background: rgba(255, 255, 255, 0.95); border: 1px solid #0d6efd; box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.2); cursor: text; z-index: 100;}

        /* KOORDINÁTÁK ÉS SZÍNEK */
        #data-gyulekezet-top { top: 22%; left: 10%; width: 80%; text-align: center; color: #C69C6D; font-size: 16pt; font-weight: 700; font-family: 'Cinzel', serif; letter-spacing: 1px; }
        #data-gyermek { top: 43%; left: 10%; width: 80%; text-align: center; color: #000; font-size: 38pt; font-weight: 700; font-family: 'Cinzel', serif; }
        #data-testverunket { top: 51%; left: 10%; width: 80%; text-align: center; font-size: 18pt; font-style: italic; color: #222; }
        #data-szoveg { top: 57%; left: 15%; width: 70%; text-align: justify; font-size: 16pt; line-height: 1.9; color: #222; }
        #data-lelkesz { top: 82%; left: 15%; width: 25%; text-align: center; font-style: italic; font-size: 16pt; font-weight: bold; color: #222; }
        #data-kelt-center { top: 85%; left: 40%; width: 20%; text-align: center; font-size: 14pt; font-style: italic; color: #222; }
        #data-okirat { top: 92%; left: 10%; width: 80%; text-align: center; font-size: 11pt; color: #333; font-family: 'Inter', sans-serif; font-weight: 700; }
        #data-gondnok { top: 82%; right: 15%; width: 25%; text-align: center; font-style: italic; font-size: 16pt; font-weight: bold; color: #222; }

        @media print {
            body { background: white !important; display: block; height: auto; overflow: visible; }
            .sidebar { display: none !important; }
            .workspace { padding: 0; background: transparent; display: block; }
            .a4-page { box-shadow: none !important; transform: scale(1) !important; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .editable-field { border: none !important; background: transparent !important; box-shadow: none !important; }
            @page { size: A4 portrait; margin: 0; } 
        }
    </style>
</head>
<body>
    <div class="sidebar no-print">
        <h2>Emléklap Stúdió</h2>
        <p>A szövegmezőkbe kattintva bármit átírhat nyomtatás előtt.</p>
        <div style="flex-grow: 1;"></div>
        <button class="action-btn" onclick="window.print()">🖨️ Nyomtatás Indítása</button>
        <button class="action-btn btn-outline" onclick="window.close()">Bezárás</button>
    </div>

    <div class="workspace">
        <div class="a4-page">
            <div id="data-gyulekezet-top" class="editable-field" contenteditable="true" spellcheck="false">${data.gyulekezet_neve}</div>
            <div id="data-gyermek" class="editable-field" contenteditable="true" spellcheck="false">${data.gyermek_neve}</div>
            <div id="data-testverunket" class="editable-field" contenteditable="true" spellcheck="false">testvérünket</div>
            
            <div id="data-szoveg" class="editable-field" contenteditable="true" spellcheck="false">
                <b>${data.apa_neve}</b> és <b>${data.anya_neve}</b> gyermekét, aki <b>${data.szuletesi_hely}</b> helységében született <b>${data.szuletesi_ido}</b>-én, és akit a gyülekezetünkben <b>${data.kereszteles_ido}</b>-én a szent keresztség által az Atya, Fiú, Szentlélek Isten szövetségébe, a keresztyén Anyaszentegyházba befogadtunk.
            </div>
            
            <div id="data-lelkesz" class="editable-field" contenteditable="true" spellcheck="false">${data.lelkesz_neve}</div>
            <div id="data-kelt-center" class="editable-field" contenteditable="true" spellcheck="false">Kelt: ${data.kelt_hely}, ${data.kereszteles_ido}</div>
            <div id="data-gondnok" class="editable-field" contenteditable="true" spellcheck="false">${data.gondnok_neve}</div>
            <div id="data-okirat" class="editable-field" contenteditable="true" spellcheck="false">Anyakönyvi szám: <b>${data.anyakonyvi_szam}</b></div>
        </div>
    </div>
</body>
</html>
    `);
    printWindow.document.close();
};

// ═══════════════════════════════════════════════════════════════
// KONFIRMÁLTAK — TÖMEGES RÖGZÍTÉS ÉS OKOS KERESŐ
// ═══════════════════════════════════════════════════════════════

// Kiválasztott konfirmandusok listája
var _konfirmandusok = [];

// ── Konfirmáció modal megnyitása (felülírja az alap openAkModal-t konfirmalásnál) ──
window._openKonfirmacioModal = function() {
    _konfirmandusok = [];
    _renderKonfirmandusTable();

    // Dátum alapértelmezett: ma
    var datumInput = document.getElementById('konf-datum');
    if (datumInput) datumInput.value = new Date().toISOString().split('T')[0];

    // Lelkésznév: profil nevéből
    var lelkeszInput = document.getElementById('konf-lelkeszneve');
    if (lelkeszInput && !lelkeszInput.value) {
        var cachedName = sessionStorage.getItem('krt_profile_full_name');
        if (cachedName) lelkeszInput.value = cachedName;
    }

    var modalEl = document.getElementById('modal-konfirmalas');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

// ── Konfirmandus keresés (név alapján) ──
window.searchKonfirmandus = async function(val) {
    var resDiv = document.getElementById('konf-search-results');
    if (val.trim().length < 2) { resDiv.style.display = 'none'; return; }

    // Szóközök kezelése: ha több szó van, családnév + keresztnév külön keresés
    var parts = val.trim().split(/\s+/);
    var query = _supabase.from('szemely')
        .select('id, csaladnev, k_nev, sz_datum, ferfi')
        .eq('meghalt', false);

    if (parts.length >= 2) {
        // "Kovács Já" → csaladnev ILIKE %Kovács% ÉS k_nev ILIKE %Já%
        query = query.ilike('csaladnev', '%' + parts[0] + '%')
                     .ilike('k_nev', '%' + parts.slice(1).join(' ') + '%');
    } else {
        query = query.or('csaladnev.ilike.%' + parts[0] + '%,k_nev.ilike.%' + parts[0] + '%');
    }

    if (_akCongregationId) query = query.eq('congregation_id', _akCongregationId);
    query = query.limit(15);

    var result = await query;
    var data = result.data || [];

    if (data.length > 0) {
        // Kiszűrjük a már konfirmáltakat (akik a konfirmalas táblában vannak)
        var szemIds = data.map(function(m) { return m.id; });
        var konfResult = await _supabase.from('konfirmalas')
            .select('id_szemely')
            .in('id_szemely', szemIds);
        var konfSzemIds = (konfResult.data || []).map(function(k) { return k.id_szemely; });

        // Kiszűrjük a már konfirmáltakat ÉS a már kiválasztottakat
        var meglevoIds = _konfirmandusok.map(function(k) { return k.id; });
        var filteredData = data.filter(function(m) {
            return konfSzemIds.indexOf(m.id) === -1 && meglevoIds.indexOf(m.id) === -1;
        });

        if (filteredData.length === 0) {
            resDiv.innerHTML = '<div class="p-3 text-center text-muted"><i class="ti ti-check me-1"></i>Mindenki hozzá van már adva a listából!</div>';
        } else {
            resDiv.innerHTML = filteredData.map(function(m) {
                var kor = '?';
                if (m.sz_datum) {
                    var today = new Date(); var bd = new Date(m.sz_datum);
                    var age = today.getFullYear() - bd.getFullYear();
                    if (today.getMonth() - bd.getMonth() < 0 || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
                    kor = age;
                }
                var nemIcon = m.ferfi ? '<i class="ti ti-gender-male text-blue"></i>' : '<i class="ti ti-gender-female text-pink"></i>';
                var nemTxt = m.ferfi ? 'Fiú' : 'Lány';
                return '<div class="search-item p-2 border-bottom" style="cursor:pointer;" onclick="addKonfirmandus(' + m.id + ', \'' + (m.csaladnev || '').replace(/'/g, "\\'") + '\', \'' + (m.k_nev || '').replace(/'/g, "\\'") + '\', \'' + (m.sz_datum || '') + '\', ' + (m.ferfi ? 'true' : 'false') + ')">' +
                    nemIcon + ' <b>' + m.csaladnev + ' ' + m.k_nev + '</b> <span class="badge bg-blue-lt ms-2">' + kor + ' éves</span> <span class="badge bg-' + (m.ferfi ? 'blue' : 'pink') + '-lt ms-1">' + nemTxt + '</span>' +
                    '</div>';
            }).join('');
        }
    } else {
        resDiv.innerHTML = '<div class="p-3 text-center text-muted">Nincs találat.</div>';
    }
    resDiv.style.display = 'block';
};

// ── Korosztály keresés (tipikus konfirmációs kor: 13-15 év) ──
window.searchKonfirmandusokByAge = async function() {
    var today = new Date();
    var minDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate()).toISOString().split('T')[0];
    var maxDate = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate()).toISOString().split('T')[0];

    var query = _supabase.from('szemely')
        .select('id, csaladnev, k_nev, sz_datum, ferfi')
        .eq('meghalt', false)
        .gte('sz_datum', minDate)
        .lte('sz_datum', maxDate)
        .order('csaladnev', { ascending: true });

    if (_akCongregationId) query = query.eq('congregation_id', _akCongregationId);

    var result = await query;
    var data = result.data || [];

    // Kiszűrjük a már konfirmáltakat (akik már szerepelnek a konfirmalas táblában)
    if (data.length > 0) {
        var szemIds = data.map(function(m) { return m.id; });
        var konfResult = await _supabase.from('konfirmalas')
            .select('id_szemely')
            .in('id_szemely', szemIds);
        var konfSzemIds = (konfResult.data || []).map(function(k) { return k.id_szemely; });
        // Szűrjük a már konfirmáltakat ÉS a már kiválasztottakat
        var meglevoIds = _konfirmandusok.map(function(k) { return k.id; });
        data = data.filter(function(m) {
            return konfSzemIds.indexOf(m.id) === -1 && meglevoIds.indexOf(m.id) === -1;
        });
    }

    var resDiv = document.getElementById('konf-search-results');
    if (data.length > 0) {
        resDiv.innerHTML = '<div class="p-2 bg-purple-lt text-purple fw-bold small"><i class="ti ti-filter me-1"></i>' + data.length + ' fő a 13-15 éves korosztályból (még nem konfirmált)</div>' +
            data.map(function(m) {
                var kor = '?';
                if (m.sz_datum) {
                    var today2 = new Date(); var bd2 = new Date(m.sz_datum);
                    kor = today2.getFullYear() - bd2.getFullYear();
                    if (today2.getMonth() - bd2.getMonth() < 0 || (today2.getMonth() === bd2.getMonth() && today2.getDate() < bd2.getDate())) kor--;
                }
                var nemIcon = m.ferfi ? '<i class="ti ti-gender-male text-blue"></i>' : '<i class="ti ti-gender-female text-pink"></i>';
                return '<div class="search-item p-2 border-bottom" style="cursor:pointer;" onclick="addKonfirmandus(' + m.id + ', \'' + (m.csaladnev || '').replace(/'/g, "\\'") + '\', \'' + (m.k_nev || '').replace(/'/g, "\\'") + '\', \'' + (m.sz_datum || '') + '\', ' + (m.ferfi ? 'true' : 'false') + ')">' +
                    nemIcon + ' <b>' + m.csaladnev + ' ' + m.k_nev + '</b> <span class="badge bg-blue-lt ms-2">' + kor + ' éves</span>' +
                    '</div>';
            }).join('');
    } else {
        resDiv.innerHTML = '<div class="p-3 text-center text-muted"><i class="ti ti-mood-happy me-1"></i>A 13-15 éves korosztályból mindenki konfirmált, vagy nincs ilyen korú tag.</div>';
    }
    resDiv.style.display = 'block';
};

// ── Konfirmandus hozzáadása a listához ──
window.addKonfirmandus = async function(id, csaladnev, k_nev, sz_datum, ferfi) {
    // Duplikátum ellenőrzés
    if (_konfirmandusok.find(function(k) { return k.id === id; })) return;

    // Keresztelés dátumának lekérdezése
    var keresztDatum = '';
    var kResult = await _supabase.from('keresztseg')
        .select('datum')
        .eq('id_szemely', id)
        .limit(1);
    if (kResult.data && kResult.data.length > 0) {
        keresztDatum = (kResult.data[0].datum || '').split('T')[0];
    }

    _konfirmandusok.push({
        id: id,
        csaladnev: csaladnev,
        k_nev: k_nev,
        sz_datum: sz_datum,
        ferfi: ferfi,
        kereszteles_datum: keresztDatum
    });

    _renderKonfirmandusTable();

    // Keresőmező ürítés
    document.getElementById('konf-kereso').value = '';
    document.getElementById('konf-search-results').style.display = 'none';
};

// ── Konfirmandus eltávolítása ──
window.removeKonfirmandus = function(id) {
    _konfirmandusok = _konfirmandusok.filter(function(k) { return k.id !== id; });
    _renderKonfirmandusTable();
};

// ── Konfirmandus lista kiürítése ──
window.clearKonfirmandusok = function() {
    if (!confirm('Biztosan törli az összes kiválasztott konfirmandust?')) return;
    _konfirmandusok = [];
    _renderKonfirmandusTable();
};

// ── Táblázat renderelése ──
function _renderKonfirmandusTable() {
    var tbody = document.getElementById('konf-tbody');
    var countBadge = document.getElementById('konf-count');
    var saveBtn = document.getElementById('konf-save-btn');
    var saveCount = document.getElementById('konf-save-count');
    var clearBtn = document.getElementById('konf-clear-btn');
    var emptyRow = document.getElementById('konf-empty-row');

    if (!tbody) return;

    if (_konfirmandusok.length === 0) {
        tbody.innerHTML = '<tr id="konf-empty-row"><td colspan="6" class="text-center text-muted py-4"><i class="ti ti-user-search" style="font-size:2rem;opacity:0.3;"></i><p class="mt-2 mb-0">Keressen a gyülekezeti tagok között, és adja hozzá a konfirmandusokat.</p></td></tr>';
        if (countBadge) countBadge.textContent = '0';
        if (saveBtn) saveBtn.disabled = true;
        if (saveCount) saveCount.textContent = '0';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    var html = '';
    for (var i = 0; i < _konfirmandusok.length; i++) {
        var k = _konfirmandusok[i];
        var nemIcon = k.ferfi
            ? '<span class="badge bg-blue-lt"><i class="ti ti-gender-male me-1"></i>Fiú</span>'
            : '<span class="badge bg-pink-lt"><i class="ti ti-gender-female me-1"></i>Lány</span>';

        html += '<tr>' +
            '<td class="text-center text-muted">' + (i + 1) + '</td>' +
            '<td class="fw-bold text-purple">' + k.csaladnev + ' ' + k.k_nev + '</td>' +
            '<td class="text-center">' + nemIcon + '</td>' +
            '<td>' + (k.sz_datum || '<span class="text-muted">—</span>') + '</td>' +
            '<td>' + (k.kereszteles_datum || '<span class="badge bg-warning-lt text-warning"><i class="ti ti-alert-triangle me-1"></i>Hiányzik!</span>') + '</td>' +
            '<td><button type="button" class="btn btn-sm btn-icon btn-ghost-danger" onclick="removeKonfirmandus(' + k.id + ')" title="Eltávolítás"><i class="ti ti-x"></i></button></td>' +
            '</tr>';
    }
    tbody.innerHTML = html;

    if (countBadge) countBadge.textContent = _konfirmandusok.length;
    if (saveBtn) saveBtn.disabled = false;
    if (saveCount) saveCount.textContent = _konfirmandusok.length;
    if (clearBtn) clearBtn.style.display = '';
}

// ── Keresztelés nélküli konfirmandusok wizard-je ──
var _konfWizardQueue = [];      // Akik keresztelés nélkül vannak
var _konfWizardCallback = null; // Sikeres wizard után mit csináljon

// Wizard indítás: végigmegy a keresztelés nélküli konfirmandusokon
async function _startKeresztelesWizard(hianyosak, onComplete) {
    _konfWizardQueue = hianyosak.slice(); // másolat
    _konfWizardCallback = onComplete;

    // Konfirmáció modalt elrejtjük amíg a wizard fut
    var konfModal = bootstrap.Modal.getInstance(document.getElementById('modal-konfirmalas'));
    if (konfModal) konfModal.hide();

    // Kis késleltetés hogy a modal bezáródjon
    setTimeout(function() { _processNextWizardItem(); }, 400);
}

async function _processNextWizardItem() {
    if (_konfWizardQueue.length === 0) {
        // Wizard kész — visszatérünk a konfirmáció mentéséhez
        if (_konfWizardCallback) {
            // Kis késleltetés
            setTimeout(function() { _konfWizardCallback(); }, 300);
        }
        return;
    }

    var current = _konfWizardQueue[0];
    var remaining = _konfWizardQueue.length;
    var total = _konfirmandusok.filter(function(k) { return !k.kereszteles_datum; }).length;

    // Státusz üzenet
    alert('📋 Keresztelési bejegyzés szükséges!\n\n' +
          'Konfirmandus: ' + current.csaladnev + ' ' + current.k_nev + '\n' +
          '(' + remaining + ' fő vár még rögzítésre)\n\n' +
          'A következő ablakban rögzítse a keresztelési adatokat.');

    // Átkapcsoljuk a currentAkTab-ot keresztségre hogy a modal jól működjön
    var savedTab = currentAkTab;
    currentAkTab = 'keresztseg';

    // Betöltjük az allAkData-t a keresztelésekhez (sorszámgeneráláshoz)
    var kQuery = _supabase.from('keresztseg').select('*').order('datum', { ascending: false });
    if (_akCongregationId) kQuery = kQuery.eq('congregation_id', _akCongregationId);
    var kResult = await kQuery;
    allAkData = kResult.data || [];

    // Megnyitjuk a keresztelési modalt az adott személyre
    await openAkModal();

    // Beírjuk a személy nevét
    var kereso = document.getElementById('ak-szemely-kereso');
    var idInput = document.getElementById('ak-id_szemely');
    if (kereso) kereso.value = current.csaladnev + ' ' + current.k_nev;
    if (idInput) idInput.value = current.id;

    // Szülők automatikus betöltése (a selectMemberForAk hívja)
    if (typeof selectMemberForAk === 'function') {
        await selectMemberForAk(current.id, current.csaladnev + ' ' + current.k_nev, 'szemely');
    }

    // Modal cím módosítása wizard-módra
    var modalTitle = document.getElementById('ak-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="ti ti-wand me-2 text-warning"></i>Keresztelés Rögzítése — ' +
            '<span class="text-primary">' + current.csaladnev + ' ' + current.k_nev + '</span>' +
            ' <span class="badge bg-purple ms-2">' + remaining + ' fő hátra</span>';
    }

    // Felülírjuk a mentés gombot: sikeres mentés után a következőre lép
    window._origHandleAkSubmit = window.handleAkSubmit;
    window.handleAkSubmit = async function(e) {
        e.preventDefault();
        var btn = e.submitter;
        var origBtnText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; btn.disabled = true; }

        try {
            var idSzemely = document.getElementById('ak-id_szemely').value;
            var datum = document.getElementById('ak-datum').value;

            if (!idSzemely) { alert('Kérem, válassza ki a személyt!'); return; }
            if (!datum) { alert('Kérem, adja meg a keresztelés dátumát!'); return; }

            var userResult = await _supabase.auth.getUser();
            var profResult = await _supabase.from('profiles').select('congregation_id').eq('id', userResult.data.user.id).limit(1);
            var profile = profResult.data[0];

            var keresztszulok = document.getElementById('ak-keresztszulok') ? document.getElementById('ak-keresztszulok').value : '';
            var alapige = document.getElementById('ak-alapige') ? document.getElementById('ak-alapige').value : '';

            var finalMegjegyzes = document.getElementById('ak-megjegyzes') ? document.getElementById('ak-megjegyzes').value : '';
            // Sablon adatok mentése a megjegyzésbe
            var anyaLeanyneve = document.getElementById('ak-anya-leanyneve') ? document.getElementById('ak-anya-leanyneve').value : '';
            var apaVallas = document.getElementById('ak-apa-vallas') ? document.getElementById('ak-apa-vallas').value : '';
            var anyaVallas = document.getElementById('ak-anya-vallas') ? document.getElementById('ak-anya-vallas').value : '';
            if (anyaLeanyneve || apaVallas || anyaVallas) {
                finalMegjegyzes += '|sablon:' + JSON.stringify({ anya_leanyneve: anyaLeanyneve, apa_vallas: apaVallas, anya_vallas: anyaVallas });
            }

            var entry = {
                id_szemely: idSzemely,
                datum: datum,
                okirat: document.getElementById('ak-okirat') ? document.getElementById('ak-okirat').value : '',
                lelkeszneve: document.getElementById('ak-lelkeszneve') ? document.getElementById('ak-lelkeszneve').value : '',
                keresztszulok: keresztszulok,
                megjegyzes: finalMegjegyzes,
                congregation_id: profile.congregation_id,
                munkanaploba: document.getElementById('ak-munkanaploba') ? document.getElementById('ak-munkanaploba').checked : false
            };

            // Szülők mentése a szemely táblába (névvel ÉS ID-vel)
            var apaNeve = document.getElementById('ak-apa-neve') ? document.getElementById('ak-apa-neve').value : '';
            var anyaNeve = document.getElementById('ak-anya-neve') ? document.getElementById('ak-anya-neve').value : '';
            var wizApaId = document.getElementById('ak-apa-id') ? document.getElementById('ak-apa-id').value : '';
            var wizAnyaId = document.getElementById('ak-anya-id') ? document.getElementById('ak-anya-id').value : '';

            var wizSzemelyUpdate = { apjaneve: apaNeve, anyjaneve: anyaNeve };
            if (wizApaId) wizSzemelyUpdate.id_apja = wizApaId;
            if (wizAnyaId) wizSzemelyUpdate.id_anyja = wizAnyaId;
            await _supabase.from('szemely').update(wizSzemelyUpdate).eq('id', idSzemely);

            // Beszúrás
            var dbResult = await _supabase.from('keresztseg').insert([entry]).select('id').single();
            if (dbResult.error) throw new Error(dbResult.error.message);

            // Család ellenőrzés és létrehozás
            await _checkAndCreateFamily(parseInt(idSzemely), wizApaId, wizAnyaId, profile.congregation_id);

            // Sikeres mentés — frissítjük a konfirmandus keresztelési dátumát
            var konfIdx = _konfirmandusok.findIndex(function(k) { return k.id === parseInt(idSzemely); });
            if (konfIdx !== -1) {
                _konfirmandusok[konfIdx].kereszteles_datum = datum.split('T')[0];
            }

            // Munkanapló
            if (entry.munkanaploba && typeof window.triggerWorklogFromRegistry === 'function') {
                window.triggerWorklogFromRegistry('keresztseg', dbResult.data.id, datum, 'Keresztelő', alapige);
            }

            // Modal bezárás
            var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-anyakonyv'));
            if (modalInst) modalInst.hide();

            // Visszaállítjuk az eredeti handleAkSubmit-et
            window.handleAkSubmit = window._origHandleAkSubmit;

            // Eltávolítjuk a feldolgozott személyt a wizard sorból
            _konfWizardQueue.shift();

            // Visszaállítjuk a tab-ot
            currentAkTab = savedTab;

            // Következő
            setTimeout(function() { _processNextWizardItem(); }, 400);

        } catch (err) {
            console.error('Keresztelés wizard mentési hiba:', err);
            alert('Hiba mentéskor: ' + err.message);
        } finally {
            if (btn) { btn.innerHTML = origBtnText; btn.disabled = false; }
        }
    };
}

// ── Tömeges mentés (keresztelés-ellenőrzéssel) ──
window.saveKonfirmacioTomegesen = async function() {
    if (_konfirmandusok.length === 0) { alert('Kérem, válasszon ki legalább egy konfirmandust!'); return; }

    var datum = document.getElementById('konf-datum').value;
    var lelkeszneve = document.getElementById('konf-lelkeszneve').value;
    var megjegyzes = document.getElementById('konf-megjegyzes').value || '';

    if (!datum) { alert('Kérem, adja meg a konfirmáció dátumát!'); return; }
    if (!lelkeszneve) { alert('Kérem, adja meg a konfirmáló lelkész nevét!'); return; }

    // Ellenőrizzük, kinek hiányzik a keresztelési bejegyzése
    var hianyosak = _konfirmandusok.filter(function(k) { return !k.kereszteles_datum; });

    if (hianyosak.length > 0) {
        var nevsor = hianyosak.map(function(k) { return '  • ' + k.csaladnev + ' ' + k.k_nev; }).join('\n');
        var valasz = confirm(
            '⚠️ ' + hianyosak.length + ' konfirmandusnak nincs rögzítve a keresztelése!\n\n' +
            nevsor + '\n\n' +
            'A konfirmáció rögzítéséhez szükséges a keresztelési bejegyzés.\n' +
            'Szeretné most rögzíteni a hiányzó kereszteléseket?\n\n' +
            '(OK = Igen, végigvezetjük / Mégse = Kihagyás, mentés nélkülük)'
        );

        if (valasz) {
            // Wizard indítása — a callback a tényleges mentés
            _startKeresztelesWizard(hianyosak, function() {
                // Wizard kész — újra megnyitjuk a konfirmáció modalt és mentünk
                var konfModalEl = document.getElementById('modal-konfirmalas');
                if (konfModalEl) new bootstrap.Modal(konfModalEl).show();

                // Frissítjük a táblázatot
                _renderKonfirmandusTable();

                // Üzenet
                var megMaradt = _konfirmandusok.filter(function(k) { return !k.kereszteles_datum; });
                if (megMaradt.length > 0) {
                    alert('⚠️ Még ' + megMaradt.length + ' konfirmandusnak hiányzik a keresztelése.\nŐk nem lesznek mentve a konfirmáltak közé.');
                } else {
                    alert('✅ Minden keresztelési bejegyzés rögzítve!\nMost már mentheti a konfirmációt.');
                }
            });
            return; // Wizard fut, nem mentünk most
        } else {
            // Kihagyjuk a hiányosakat
            _konfirmandusok = _konfirmandusok.filter(function(k) { return !!k.kereszteles_datum; });
            if (_konfirmandusok.length === 0) {
                alert('Nincs konfirmandus akinek van keresztelési bejegyzése. Kérem, először rögzítse a kereszteléseket!');
                return;
            }
        }
    }

    // ── Tényleges mentés ──
    _doKonfirmacioSave(datum, lelkeszneve, megjegyzes);
};

// Tényleges konfirmáció mentés (wizard után is ide jut)
async function _doKonfirmacioSave(datum, lelkeszneve, megjegyzes) {
    var saveBtn = document.getElementById('konf-save-btn');
    var origText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) { saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; saveBtn.disabled = true; }

    try {
        // Congregation ID
        if (!_akCongregationId) {
            var userResult = await _supabase.auth.getUser();
            var user = userResult.data.user;
            var profResult = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
            _akCongregationId = profResult.data ? profResult.data.congregation_id : null;
        }

        // Csak azokat mentjük akiknek van keresztelésük
        var menthetok = _konfirmandusok.filter(function(k) { return !!k.kereszteles_datum; });

        if (menthetok.length === 0) {
            alert('Nincs menthető konfirmandus (mindegyiknek hiányzik a keresztelése).');
            return;
        }

        // Bejegyzések összeállítása
        var entries = menthetok.map(function(k) {
            return {
                id_szemely: k.id,
                datum: datum,
                lelkeszneve: lelkeszneve,
                keresztelesideje: k.kereszteles_datum || null,
                megjegyzes: megjegyzes,
                congregation_id: _akCongregationId
            };
        });

        // Tömeges beszúrás
        var insertResult = await _supabase.from('konfirmalas').insert(entries);
        if (insertResult.error) throw new Error(insertResult.error.message);

        // Munkanapló rögzítés (opcionális)
        var isMunkanaplo = document.getElementById('konf-munkanaploba') ? document.getElementById('konf-munkanaploba').checked : false;
        if (isMunkanaplo && typeof window.triggerWorklogFromRegistry === 'function') {
            window.triggerWorklogFromRegistry('konfirmalas', null, datum, 'Konfirmáció (' + menthetok.length + ' fő)', '');
        }

        // Modal bezárás
        var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-konfirmalas'));
        if (modalInst) modalInst.hide();

        alert('✅ Konfirmáció sikeresen mentve! (' + menthetok.length + ' fő)');
        _konfirmandusok = [];

        // Lista frissítés
        loadAkData('konfirmalas');

    } catch (err) {
        console.error('Konfirmáció mentési hiba:', err);
        alert('Hiba mentéskor: ' + err.message);
    } finally {
        if (saveBtn) { saveBtn.innerHTML = origText; saveBtn.disabled = false; }
    }
}

// ═══════════════════════════════════════════════════════════════
// KONFIRMÁLT SZERKESZTÉSE / TÖRLÉSE
// ═══════════════════════════════════════════════════════════════

window.openKonfEditModal = function(id) {
    try {
        var entry = allAkData.find(function(d) { return d.id === id; });
        if (!entry) { alert('A bejegyzés nem található! (ID: ' + id + ')'); return; }

        // Ellenőrizzük, hogy a modal betöltődött-e
        var modalEl = document.getElementById('modal-konf-edit');
        if (!modalEl) {
            console.error('[KonfEdit] A modal-konf-edit elem nem található a DOM-ban!');
            alert('A szerkesztő ablak nem töltődött be. Kérem, frissítse az oldalt (Ctrl+Shift+R).');
            return;
        }

        // ID beállítás
        var idInput = document.getElementById('konf-edit-id');
        if (idInput) idInput.value = id;

        // Név és info
        var nev = (entry.szemely ? entry.szemely.csaladnev + ' ' + entry.szemely.k_nev : 'Ismeretlen');
        var nevEl = document.getElementById('konf-edit-nev');
        if (nevEl) nevEl.textContent = nev;

        var nemIcon = '';
        var infoTxt = '';
        if (entry.szemely) {
            if (entry.szemely.ferfi === true) {
                nemIcon = '<span class="badge bg-blue-lt p-2"><i class="ti ti-gender-male fs-3"></i></span>';
            } else if (entry.szemely.ferfi === false) {
                nemIcon = '<span class="badge bg-pink-lt p-2"><i class="ti ti-gender-female fs-3"></i></span>';
            }
            if (entry.szemely.sz_datum) {
                var bd = new Date(entry.szemely.sz_datum);
                var age = new Date().getFullYear() - bd.getFullYear();
                infoTxt = 'Született: ' + entry.szemely.sz_datum + ' (' + age + ' éves)';
            }
        }
        var nemEl = document.getElementById('konf-edit-nem-icon');
        if (nemEl) nemEl.innerHTML = nemIcon;
        var infoEl = document.getElementById('konf-edit-info');
        if (infoEl) infoEl.textContent = infoTxt;

        // Mezők kitöltése
        var datumEl = document.getElementById('konf-edit-datum');
        if (datumEl) datumEl.value = entry.datum || '';
        var lelkeszEl = document.getElementById('konf-edit-lelkesz');
        if (lelkeszEl) lelkeszEl.value = entry.lelkeszneve || '';
        var keresztEl = document.getElementById('konf-edit-kereszteles');
        if (keresztEl) keresztEl.value = entry.keresztelesideje || '';
        var megjEl = document.getElementById('konf-edit-megjegyzes');
        if (megjEl) megjEl.value = entry.megjegyzes || '';
        var helyEl = document.getElementById('konf-edit-hely');
        if (helyEl) helyEl.value = '';

        new bootstrap.Modal(modalEl).show();
        console.log('[KonfEdit] Modal megnyitva — ' + nev + ' (ID: ' + id + ')');

    } catch (err) {
        console.error('[KonfEdit] Hiba a modal megnyitásakor:', err);
        alert('Hiba a szerkesztő megnyitásakor: ' + err.message);
    }
};

// ── Konfirmált mentés (szerkesztés) ──
window.saveKonfirmaltEdit = async function() {
    var id = document.getElementById('konf-edit-id').value;
    if (!id) return;

    var datum = document.getElementById('konf-edit-datum').value;
    var lelkeszneve = document.getElementById('konf-edit-lelkesz').value;
    var keresztelesideje = document.getElementById('konf-edit-kereszteles').value || null;
    var megjegyzes = document.getElementById('konf-edit-megjegyzes').value || '';

    if (!datum) { alert('Kérem, adja meg a konfirmáció dátumát!'); return; }
    if (!lelkeszneve) { alert('Kérem, adja meg a lelkész nevét!'); return; }

    try {
        var updateData = {
            datum: datum,
            lelkeszneve: lelkeszneve,
            keresztelesideje: keresztelesideje,
            megjegyzes: megjegyzes
        };

        var result = await _supabase.from('konfirmalas').update(updateData).eq('id', id);
        if (result.error) throw new Error(result.error.message);

        var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-konf-edit'));
        if (modalInst) modalInst.hide();

        alert('✅ Konfirmálási bejegyzés sikeresen módosítva!');
        loadAkData('konfirmalas');

    } catch (err) {
        console.error('Konfirmált szerkesztési hiba:', err);
        alert('Hiba mentéskor: ' + err.message);
    }
};

// ── Konfirmált törlése ──
window.deleteKonfirmalt = async function() {
    var id = document.getElementById('konf-edit-id').value;
    if (!id) return;

    var entry = allAkData.find(function(d) { return d.id === parseInt(id); });
    var nev = entry && entry.szemely ? entry.szemely.csaladnev + ' ' + entry.szemely.k_nev : 'a bejegyzést';

    if (!confirm('Biztosan törölni szeretné ' + nev + ' konfirmálási bejegyzését?\n\nEz a művelet nem vonható vissza!')) return;

    try {
        var result = await _supabase.from('konfirmalas').delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);

        var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-konf-edit'));
        if (modalInst) modalInst.hide();

        alert('🗑️ Konfirmálási bejegyzés törölve.');
        loadAkData('konfirmalas');

    } catch (err) {
        console.error('Konfirmált törlési hiba:', err);
        alert('Hiba törléskor: ' + err.message);
    }
};

// ═══════════════════════════════════════════════════════════════
// KERESZTELÉS TÖRLÉSE
// ═══════════════════════════════════════════════════════════════

window.deleteKereszteles = async function(id) {
    window.deleteAkEntry('keresztseg', id);
};

// Univerzális anyakönyvi bejegyzés törlése
window.deleteAkEntry = async function(tabla, id) {
    var entry = allAkData.find(function(d) { return d.id === id; });
    var nev = '';
    if (entry) {
        if (entry.szemely) nev = entry.szemely.csaladnev + ' ' + entry.szemely.k_nev;
        else if (entry.ferfi) nev = entry.ferfi.csaladnev + ' ' + entry.ferfi.k_nev;
    }
    nev = nev || 'a bejegyzést';

    var tablanevek = {
        'keresztseg': 'keresztelési', 'konfirmalas': 'konfirmálási', 'hazassag': 'házassági',
        'temetes': 'temetési', 'bekoltozott': 'beköltözési', 'elkoltozott': 'elköltözési',
        'attert': 'áttérési', 'kitert': 'kitérési'
    };
    var tablaNev = tablanevek[tabla] || 'anyakönyvi';

    if (!confirm('Biztosan törölni szeretné ' + nev + ' ' + tablaNev + ' bejegyzését?\n\n' +
                 '⚠️ Ez a művelet nem vonható vissza!\n' +
                 'A személy adatai NEM törlődnek, csak az anyakönyvi bejegyzés.')) return;

    try {
        var result = await _supabase.from(tabla).delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);

        alert('🗑️ ' + tablaNev.charAt(0).toUpperCase() + tablaNev.slice(1) + ' bejegyzés törölve: ' + nev);
        loadAkData(tabla);

    } catch (err) {
        console.error(tablaNev + ' törlési hiba:', err);
        alert('Hiba törléskor: ' + err.message);
    }
};

// ═══════════════════════════════════════════════════════════════
// GLOBÁLIS KERESŐ ÉS EXPORT (oldal fejlécéből hívott)
// ═══════════════════════════════════════════════════════════════

window.filterAk = function() {
    var searchInput = document.getElementById('search-ak');
    if (searchInput) {
        _akSearchText = searchInput.value.toLowerCase().trim();
        // Szinkronizáljuk a beépített kereső mezővel is
        var liveSearch = document.getElementById('ak-live-search');
        if (liveSearch) liveSearch.value = searchInput.value;
        renderAkTable();
    }
};

window.exportAkToExcel = function() {
    if (typeof XLSX === 'undefined') {
        alert('Az Excel export betöltése folyamatban... Kérem, próbálja újra néhány másodperc múlva.');
        if (typeof loadLib === 'function') loadLib('xlsx');
        return;
    }

    var data = _getFilteredAkData();
    if (data.length === 0) { alert('Nincs exportálható adat!'); return; }

    var rows = [];
    switch (currentAkTab) {
        case 'keresztseg':
            rows = data.map(function(d) {
                return {
                    'Anyakönyvi szám': d.okirat || '',
                    'Gyermek neve': (d.szemely?.csaladnev || '') + ' ' + (d.szemely?.k_nev || ''),
                    'Keresztelés dátuma': (d.datum || '').split('T')[0],
                    'Lelkész': d.lelkeszneve || '',
                    'Keresztszülők': d.keresztszulok || '',
                    'Megjegyzés': (d.megjegyzes || '').split('|sablon:')[0]
                };
            });
            break;
        case 'konfirmalas':
            rows = data.map(function(d) {
                return {
                    'Konfirmandus neve': (d.szemely?.csaladnev || '') + ' ' + (d.szemely?.k_nev || ''),
                    'Nem': d.szemely?.ferfi === true ? 'Fiú' : d.szemely?.ferfi === false ? 'Lány' : '',
                    'Születési dátum': d.szemely?.sz_datum || '',
                    'Keresztelés dátuma': d.keresztelesideje || '',
                    'Konfirmáció dátuma': d.datum || '',
                    'Lelkész': d.lelkeszneve || ''
                };
            });
            break;
        case 'hazassag':
            rows = data.map(function(d) {
                return {
                    'Vőlegény': (d.ferfi?.csaladnev || '') + ' ' + (d.ferfi?.k_nev || ''),
                    'Menyasszony': (d.no?.csaladnev || '') + ' ' + (d.no?.k_nev || ''),
                    'Házasság dátuma': (d.datum || '').split('T')[0],
                    'Lelkész': d.lelkeszneve || '',
                    'Tanúk': d.tanuk || '',
                    'Megjegyzés': d.megjegyzes || ''
                };
            });
            break;
        case 'temetes':
            rows = data.map(function(d) {
                return {
                    'Elhunyt neve': (d.szemely?.csaladnev || '') + ' ' + (d.szemely?.k_nev || ''),
                    'Halál dátuma': (d.hdatum || '').split('T')[0],
                    'Halál oka': d.hoka || '',
                    'Temetés dátuma': (d.tdatum || '').split('T')[0],
                    'Lelkész': d.lelkeszneve || '',
                    'Megjegyzés': d.megjegyzes || ''
                };
            });
            break;
        default:
            rows = data.map(function(d) {
                return {
                    'Név': (d.szemely?.csaladnev || '') + ' ' + (d.szemely?.k_nev || ''),
                    'Dátum': (d.datum || d.mikor || d.hdatum || '').split('T')[0],
                    'Megjegyzés': d.megjegyzes || '',
                    'Igazolás': d.igazolas || '',
                    'Felekezet': d.felekezet || ''
                };
            });
    }

    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentAkTab);
    XLSX.writeFile(wb, 'anyakonyv_' + currentAkTab + '_' + new Date().toISOString().split('T')[0] + '.xlsx');
};