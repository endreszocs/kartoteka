// --- js/penzugy_init.js ---
let currentYear = new Date().getFullYear().toString();
let activeCongregationId = null;
let currentSettings = null;

// KÖZÖS MEMÓRIA
window.szamadasiCellek = []; 
window.autoCarryoverCash = 0;
window.autoCarryoverBank = 0;
window.allChurchMembers = []; 

async function initPenzugy() {
    try {
        const modalResponse = await fetch('components/modal_elszamolas.html');
        if (modalResponse.ok) {
            document.getElementById('elszamolas-container').innerHTML = await modalResponse.text();
        }
        const linkModalRes = await fetch('components/modal_payment_link.html');
        if (linkModalRes.ok) {
            document.getElementById('modal-payment-link-placeholder').innerHTML = await linkModalRes.text();
        }

        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) return;

        // FIX: congregations(name, nev_hu, nev_ro, eves_jarulek) - mindkét mezőnév lekérve
        const { data: profile } = await _supabase.from('profiles')
            .select('congregation_id, role, congregations(name, nev_hu, nev_ro, eves_jarulek)')
            .eq('id', user.id).single();
        if (!profile || !profile.congregation_id) return;
        activeCongregationId = profile.congregation_id;

        // Szuperadmin gomb megjelenítése
        const isSuperAdmin = profile.role === 'szuperadmin' || user.email === 'endreszocs@gmail.com';
        if (isSuperAdmin) {
            document.getElementById('btn-admin-link-payments')?.classList.remove('d-none');
        }

        // FIX: cong kezelése array és objektum esetén is
        const cong = Array.isArray(profile.congregations) ? profile.congregations[0] : profile.congregations;
        window.evesJarulek = cong?.eves_jarulek ? parseFloat(cong.eves_jarulek) : 0;
        // FIX: gyülekezet neve - nev_hu elsőbbség, majd name fallback
        window._congNev = cong?.nev_hu || cong?.name || '';

        const { data: settings } = await _supabase.from('bealitas').select('*')
            .eq('id', currentYear).eq('congregation_id', activeCongregationId).maybeSingle();
        currentSettings = settings;

        if (!settings) {
            // FIX: Ha nincs éves beállítás, felugró ablak kéri be az adatokat
            _showBealitasCreationModal(window._congNev);
            return;
        }

        // FIX: cong-ot használja profile.congregations helyett
        document.getElementById('finance-year-info').innerText =
            `${window._congNev} | ${currentYear}. Költségvetési Év`;

        await _initPenzugyWithSettings();
        _updateJarulekHeaderDisplay();

        // Évenkénti járulék betöltése globálisan (batch mód többéves al-sorokhoz)
        var bealitasRes = await _supabase.from('bealitas').select('id, eves_jarulek')
            .eq('congregation_id', activeCongregationId);
        window._jarulekPerYear = {};
        (bealitasRes.data || []).forEach(function(b) {
            window._jarulekPerYear[b.id] = parseFloat(b.eves_jarulek) || 0;
        });

        // Kedvezmények betöltése globálisan (batch mód kedvezmény-jelzőhöz)
        window._jarulekKedvezmenyek = [];
        try {
            var kedvRes = await _supabase.from('jarulek_kedvezmeny').select('*')
                .eq('congregation_id', activeCongregationId).eq('aktiv', true);
            window._jarulekKedvezmenyek = kedvRes.data || [];
        } catch(e) { /* tábla még nem létezik */ }

        // Cégek/szervezetek betöltése (bérleti szerződésekből) — kereséshez
        window._savedCompanies = [];
        try {
            var cegRes = await _supabase.from('berleti_szerzodes').select('ceg_nev, ceg_adoszam, berlo_nev')
                .eq('congregation_id', activeCongregationId).eq('deleted', false);
            var cegMap = {};
            (cegRes.data || []).forEach(function(sz) {
                var nev = sz.ceg_nev || sz.berlo_nev || '';
                if (nev && !cegMap[nev]) {
                    cegMap[nev] = { nev: nev, adoszam: sz.ceg_adoszam || '' };
                }
            });
            window._savedCompanies = Object.values(cegMap);
        } catch(e) {}

    } catch (err) { console.error("Rendszerhiba az inicializáláskor:", err); }
}

// Belső helper: inicializáció amikor már van beállítás
async function _initPenzugyWithSettings() {
    // Bankszámlák betöltése ELŐSZÖR — a dropdown belső mozgás opciókhoz szükséges
    if (typeof window.loadBankAccounts === 'function') await window.loadBankAccounts();

    await populateTransactionModals();
    await loadMembersDatalist();

    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('b-datum')) document.getElementById('b-datum').value = today;
    if (document.getElementById('k-datum')) document.getElementById('k-datum').value = today;

    // Egységes bevétel/kiadás gomb engedélyezése
    if(document.getElementById('btn-new-transaction')) document.getElementById('btn-new-transaction').disabled = false;

    await calculateAndSetCarryover();

    if (typeof loadKoltsegvetes === 'function') await loadKoltsegvetes();
    if (typeof loadTranzakciok === 'function') await loadTranzakciok();

    // Kassza adatok betöltése az oldal indításakor
    if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
}

// FIX: Bealitas létrehozás modal megjelenítése
function _showBealitasCreationModal(congNev) {
    const evDisplay = document.getElementById('bealitas-ev-display');
    const evInput = document.getElementById('bealitas-ev-input');
    const intezInput = document.getElementById('bealitas-intezmenyneve');
    const jarulekInput = document.getElementById('bealitas-eves-jarulek');

    if (evDisplay) evDisplay.textContent = currentYear;
    if (evInput) evInput.value = currentYear;
    if (intezInput && congNev) intezInput.value = congNev;
    if (jarulekInput && window.evesJarulek > 0) jarulekInput.value = window.evesJarulek;

    // Oldal tartalmát blokkoljuk
    const mainContent = document.getElementById('main-page-content');
    if (mainContent) mainContent.classList.add('blur-background');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-create-bealitas')).show();
}

// FIX: Bealitas rekord mentése
window.createBealitasRecord = async function() {
    const intezmenyneve = document.getElementById('bealitas-intezmenyneve').value.trim();
    const egyhazmegye = document.getElementById('bealitas-egyhazmegye').value.trim();
    const evesJarulek = parseFloat(document.getElementById('bealitas-eves-jarulek').value) || 0;
    const nyitoKeszpenz = parseFloat(document.getElementById('bealitas-nyito-keszpenz')?.value) || 0;
    const nyitoBank = parseFloat(document.getElementById('bealitas-nyito-bank')?.value) || 0;

    if (!intezmenyneve) {
        alert('Az egyházközség neve kötelező mező!');
        document.getElementById('bealitas-intezmenyneve').focus();
        return;
    }
    if (!egyhazmegye) {
        alert('Az egyházmegye neve kötelező mező!');
        document.getElementById('bealitas-egyhazmegye').focus();
        return;
    }

    const btn = document.getElementById('btn-save-bealitas');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Létrehozás...';
    btn.disabled = true;

    try {
        // Congregation eves_jarulek frissítése ha megadták
        if (evesJarulek > 0) {
            await _supabase.from('congregations')
                .update({ eves_jarulek: evesJarulek })
                .eq('id', activeCongregationId);
            window.evesJarulek = evesJarulek;
        }

        const { error } = await _supabase.from('bealitas').insert({
            id: currentYear,
            congregation_id: activeCongregationId,
            intezmenyneve: intezmenyneve,
            egyhazmegye: egyhazmegye,
            budget_finalized: false,
            accounting_finalized: false,
            nyito_keszpenz: nyitoKeszpenz,
            nyito_bank: nyitoBank,
            eves_jarulek: evesJarulek
        });
        if (error) throw error;

        // Sikeres mentés: modal bezárása, blokkolás feloldása
        const modalEl = document.getElementById('modal-create-bealitas');
        bootstrap.Modal.getInstance(modalEl)?.hide();
        const mainContent = document.getElementById('main-page-content');
        if (mainContent) mainContent.classList.remove('blur-background');

        // Beállítások újratöltése és inicializálás folytatása
        const { data: newSettings } = await _supabase.from('bealitas').select('*')
            .eq('id', currentYear).eq('congregation_id', activeCongregationId).single();
        currentSettings = newSettings;

        document.getElementById('finance-year-info').innerText =
            `${intezmenyneve} | ${currentYear}. Költségvetési Év`;
        window._congNev = intezmenyneve;

        await _initPenzugyWithSettings();
        _updateJarulekHeaderDisplay();

    } catch (err) {
        alert('Hiba a létrehozás során: ' + err.message);
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};

// ── Járulék kezelő ──────────────────────────────────────────────────────────
window._jarulekPerYear = {};

// ============================================================================
// JÁRULÉKKEZELŐ — KEDVEZMÉNY-RENDSZER (időszaki, kor, jövedelem alapú)
// ============================================================================

var _jkCurrentEv = '';
var _jkBealitasData = {};
var _jkKedvezmenyek = [];
var _jkRowCounter = 0;

window.openJarulekManager = async function() {
    var evSelect = document.getElementById('jk-ev-select');
    if (!evSelect) return;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-jarulek-manager')).show();

    // Bealitas + kedvezmények betöltése
    var [bRes, kRes] = await Promise.all([
        _supabase.from('bealitas').select('id, eves_jarulek')
            .eq('congregation_id', activeCongregationId).order('id', { ascending: false }),
        _supabase.from('jarulek_kedvezmeny').select('*')
            .eq('congregation_id', activeCongregationId).eq('aktiv', true).order('sorrend')
            .then(function(r) { return r; })
            .catch(function() { return { data: [] }; })
    ]);

    var bealitasok = bRes.data || [];
    _jkKedvezmenyek = (kRes && kRes.data) ? kRes.data : [];
    _jkBealitasData = {};
    window._jarulekPerYear = {};

    bealitasok.forEach(function(b) {
        _jkBealitasData[b.id] = parseFloat(b.eves_jarulek) || 0;
        window._jarulekPerYear[b.id] = parseFloat(b.eves_jarulek) || 0;
    });

    // Évek dropdown feltöltése
    var html = '';
    bealitasok.forEach(function(b) {
        html += '<option value="' + b.id + '">' + b.id + '</option>';
    });
    if (!html) {
        html = '<option value="' + currentYear + '">' + currentYear + '</option>';
        _jkBealitasData[currentYear] = window.evesJarulek || 0;
    }
    evSelect.innerHTML = html;
    evSelect.value = currentYear;
    window._jkLoadYear(currentYear);
};

window._jkLoadYear = function(ev) {
    _jkCurrentEv = ev;
    _jkRowCounter = 0;
    document.getElementById('jk-alap-osszeg').value = _jkBealitasData[ev] || window.evesJarulek || 0;

    // Időszaki kedvezmények
    var idoszakCont = document.getElementById('jk-idoszak-rows');
    var idoszakRows = _jkKedvezmenyek.filter(function(k) { return k.ev === ev && k.tipus === 'idoszak'; });
    if (idoszakRows.length > 0) {
        idoszakCont.innerHTML = '';
        idoszakRows.forEach(function(k) { idoszakCont.insertAdjacentHTML('beforeend', _jkIdoszakRow(k)); });
        document.getElementById('jk-idoszak-empty')?.remove();
    } else {
        idoszakCont.innerHTML = '<p class="text-muted small mb-0" id="jk-idoszak-empty">Nincs időszaki kedvezmény beállítva.</p>';
    }

    // Kor alapú kedvezmények
    var korCont = document.getElementById('jk-kor-rows');
    var korRows = _jkKedvezmenyek.filter(function(k) { return k.ev === ev && k.tipus === 'kor'; });
    if (korRows.length > 0) {
        korCont.innerHTML = '';
        korRows.forEach(function(k) { korCont.insertAdjacentHTML('beforeend', _jkKorRow(k)); });
    } else {
        korCont.innerHTML = '<p class="text-muted small mb-0" id="jk-kor-empty">Nincs életkor alapú kedvezmény beállítva.</p>';
    }

    // Jövedelem alapú kedvezmények
    var jovCont = document.getElementById('jk-jov-rows');
    var jovRows = _jkKedvezmenyek.filter(function(k) { return k.ev === ev && k.tipus === 'jovedelem'; });
    if (jovRows.length > 0) {
        jovCont.innerHTML = '';
        jovRows.forEach(function(k) { jovCont.insertAdjacentHTML('beforeend', _jkJovedelemRow(k)); });
    } else {
        jovCont.innerHTML = '<p class="text-muted small mb-0" id="jk-jov-empty">Nincs jövedelem alapú kedvezmény beállítva.</p>';
    }

    window._jkUpdateOsszesito();
};

// ── Időszaki kedvezmény sor ──
function _jkIdoszakRow(k) {
    var rid = ++_jkRowCounter;
    var hatarid = (k && k.hatarid) || '07-01';
    var osszeg = (k && k.kedv_osszeg) || '';
    var dbId = (k && k.id) || '';
    // Teljes dátum összeállítás a dátum választóhoz (az aktuális kiválasztott évvel)
    var evSel = document.getElementById('jk-ev-select');
    var ev = evSel ? evSel.value : new Date().getFullYear();
    var fullDate = ev + '-' + hatarid;
    return '<div class="d-flex align-items-center gap-2 mb-2 jk-row" data-jk-rid="' + rid + '" data-jk-tipus="idoszak" data-jk-dbid="' + dbId + '">'
        + '<span class="text-muted small text-nowrap">Ha</span>'
        + '<input type="date" class="form-control form-control-sm jk-hatarid" value="' + fullDate + '" style="width:150px;" title="Kedvezményes határidő">'
        + '<span class="text-muted small text-nowrap">előtt fizet →</span>'
        + '<div class="input-group input-group-sm" style="width:130px;">'
        + '<input type="number" class="form-control text-end fw-bold jk-kedv-osszeg" value="' + osszeg + '" min="0" step="1" placeholder="0" oninput="window._jkUpdateOsszesito()">'
        + '<span class="input-group-text">RON</span></div>'
        + '<button type="button" class="btn btn-sm btn-icon btn-outline-danger py-0" onclick="this.closest(\'.jk-row\').remove();window._jkUpdateOsszesito()"><i class="ti ti-x"></i></button>'
        + '</div>';
}

window._jkAddIdoszak = function() {
    var cont = document.getElementById('jk-idoszak-rows');
    document.getElementById('jk-idoszak-empty')?.remove();
    cont.insertAdjacentHTML('beforeend', _jkIdoszakRow(null));
};

// ── Kor alapú kedvezmény sor ──
function _jkKorRow(k) {
    var rid = ++_jkRowCounter;
    var korTol = (k && k.kor_tol) || 70;
    var szazalek = (k && k.szazalek) || 50;
    var fixOsszeg = (k && k.fix_osszeg) || '';
    var dbId = (k && k.id) || '';
    return '<div class="d-flex align-items-center gap-2 mb-2 jk-row" data-jk-rid="' + rid + '" data-jk-tipus="kor" data-jk-dbid="' + dbId + '">'
        + '<input type="number" class="form-control form-control-sm text-center fw-bold jk-kor-tol" value="' + korTol + '" min="1" max="120" style="width:55px;" title="Minimális életkor">'
        + '<span class="text-muted small text-nowrap">év felett →</span>'
        + '<span class="text-muted small text-nowrap">az alap</span>'
        + '<input type="number" class="form-control form-control-sm text-center jk-szazalek" value="' + szazalek + '" min="0" max="100" style="width:60px;" oninput="window._jkUpdateOsszesito()">'
        + '<span class="text-muted small text-nowrap">%-a</span>'
        + '<span class="text-muted small text-nowrap ms-1">vagy fix:</span>'
        + '<div class="input-group input-group-sm" style="width:110px;">'
        + '<input type="number" class="form-control text-end jk-fix-osszeg" value="' + fixOsszeg + '" min="0" step="1" placeholder="—" oninput="window._jkUpdateOsszesito()">'
        + '<span class="input-group-text">RON</span></div>'
        + '<button type="button" class="btn btn-sm btn-icon btn-outline-danger py-0" onclick="this.closest(\'.jk-row\').remove();window._jkUpdateOsszesito()"><i class="ti ti-x"></i></button>'
        + '</div>';
}

window._jkAddKor = function() {
    var cont = document.getElementById('jk-kor-rows');
    document.getElementById('jk-kor-empty')?.remove();
    cont.insertAdjacentHTML('beforeend', _jkKorRow(null));
};

// ── Jövedelem alapú kedvezmény sor ──
function _jkJovedelemRow(k) {
    var rid = ++_jkRowCounter;
    var leiras = (k && k.jov_leiras) || 'Nyugdíjas';
    var szazalek = (k && k.szazalek) || 75;
    var fixOsszeg = (k && k.fix_osszeg) || '';
    var dbId = (k && k.id) || '';
    return '<div class="d-flex align-items-center gap-2 mb-2 jk-row" data-jk-rid="' + rid + '" data-jk-tipus="jovedelem" data-jk-dbid="' + dbId + '">'
        + '<input type="text" class="form-control form-control-sm jk-jov-leiras" value="' + leiras.replace(/"/g, '&quot;') + '" style="width:120px;" placeholder="Pl. Nyugdíjas">'
        + '<span class="text-muted small text-nowrap">→ az alap</span>'
        + '<input type="number" class="form-control form-control-sm text-center jk-szazalek" value="' + szazalek + '" min="0" max="100" style="width:60px;" oninput="window._jkUpdateOsszesito()">'
        + '<span class="text-muted small text-nowrap">%-a</span>'
        + '<span class="text-muted small text-nowrap ms-1">vagy fix:</span>'
        + '<div class="input-group input-group-sm" style="width:110px;">'
        + '<input type="number" class="form-control text-end jk-fix-osszeg" value="' + fixOsszeg + '" min="0" step="1" placeholder="—" oninput="window._jkUpdateOsszesito()">'
        + '<span class="input-group-text">RON</span></div>'
        + '<button type="button" class="btn btn-sm btn-icon btn-outline-danger py-0" onclick="this.closest(\'.jk-row\').remove();window._jkUpdateOsszesito()"><i class="ti ti-x"></i></button>'
        + '</div>';
}

window._jkAddJovedelem = function() {
    var cont = document.getElementById('jk-jov-rows');
    document.getElementById('jk-jov-empty')?.remove();
    cont.insertAdjacentHTML('beforeend', _jkJovedelemRow(null));
};

// ── Korábbi év hozzáadása ──
window._jkAddYear = function() {
    var evSelect = document.getElementById('jk-ev-select');
    if (!evSelect) return;
    var minEv = 9999;
    Array.from(evSelect.options).forEach(function(o) {
        var e = parseInt(o.value);
        if (e < minEv) minEv = e;
    });
    var newEv = (minEv < 9999) ? (minEv - 1) : new Date().getFullYear();
    var newEvStr = String(newEv);
    evSelect.add(new Option(newEvStr, newEvStr));
    _jkBealitasData[newEvStr] = window.evesJarulek || 0;
    evSelect.value = newEvStr;
    window._jkLoadYear(newEvStr);
};

// ── Összesítő frissítése ──
window._jkUpdateOsszesito = function() {
    var cont = document.getElementById('jk-osszesito');
    if (!cont) return;
    var alap = parseFloat(document.getElementById('jk-alap-osszeg').value) || 0;
    var html = '<table class="table table-sm table-bordered mb-0"><tbody>';
    html += '<tr class="table-success"><td class="fw-bold">Alap járulék</td><td class="text-end fw-bold">' + alap.toFixed(0) + ' RON</td></tr>';

    // Időszaki kedvezmények
    document.querySelectorAll('#jk-idoszak-rows .jk-row').forEach(function(row) {
        var hataridFull = (row.querySelector('.jk-hatarid') || {}).value || '';
        var osszeg = parseFloat((row.querySelector('.jk-kedv-osszeg') || {}).value) || 0;
        if (hataridFull && osszeg > 0) {
            // Date input: YYYY-MM-DD → hónap-nap kinyerése
            var parts = hataridFull.split('-');
            var honap = parts.length >= 3 ? parts[1] : (parts.length === 2 ? parts[0] : '');
            var nap = parts.length >= 3 ? parts[2] : (parts.length === 2 ? parts[1] : '');
            var honapNev = ['jan.', 'feb.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
            var label = (parseInt(honap) >= 1 && parseInt(honap) <= 12)
                ? honapNev[parseInt(honap) - 1] + ' ' + parseInt(nap) + '. előtt'
                : hataridFull + ' előtt';
            html += '<tr class="table-warning"><td>' + label + '</td><td class="text-end fw-bold">' + osszeg.toFixed(0) + ' RON</td></tr>';
        }
    });

    // Kor alapú
    document.querySelectorAll('#jk-kor-rows .jk-row').forEach(function(row) {
        var kor = parseInt((row.querySelector('.jk-kor-tol') || {}).value) || 0;
        var szaz = parseFloat((row.querySelector('.jk-szazalek') || {}).value) || 0;
        var fix = parseFloat((row.querySelector('.jk-fix-osszeg') || {}).value) || 0;
        var osszeg = fix > 0 ? fix : Math.round(alap * szaz / 100);
        html += '<tr class="table-info"><td>' + kor + '+ éves</td><td class="text-end fw-bold">' + osszeg + ' RON (' + (fix > 0 ? 'fix' : szaz + '%') + ')</td></tr>';
    });

    // Jövedelem alapú
    document.querySelectorAll('#jk-jov-rows .jk-row').forEach(function(row) {
        var leiras = (row.querySelector('.jk-jov-leiras') || {}).value || '?';
        var szaz = parseFloat((row.querySelector('.jk-szazalek') || {}).value) || 0;
        var fix = parseFloat((row.querySelector('.jk-fix-osszeg') || {}).value) || 0;
        var osszeg = fix > 0 ? fix : Math.round(alap * szaz / 100);
        html += '<tr><td><i class="ti ti-wallet me-1 text-purple"></i>' + leiras + '</td><td class="text-end fw-bold">' + osszeg + ' RON (' + (fix > 0 ? 'fix' : szaz + '%') + ')</td></tr>';
    });

    html += '</tbody></table>';
    cont.innerHTML = html;
};

// ── Mentés ──
window.saveJarulekSettings = async function() {
    try {
        // 1. Minden megjelenített év alap járulékát mentjük a bealitas-ba
        var evSelect = document.getElementById('jk-ev-select');
        var evek = [];
        Array.from(evSelect.options).forEach(function(o) { evek.push(o.value); });

        // Az aktuálisan szerkesztett évet kimentjük
        _jkBealitasData[_jkCurrentEv] = parseFloat(document.getElementById('jk-alap-osszeg').value) || 0;

        for (var e = 0; e < evek.length; e++) {
            var ev = evek[e];
            var osszeg = _jkBealitasData[ev] || 0;
            var { data: existing } = await _supabase.from('bealitas').select('id')
                .eq('id', ev).eq('congregation_id', activeCongregationId).maybeSingle();

            if (existing) {
                await _supabase.from('bealitas')
                    .update({ eves_jarulek: osszeg })
                    .eq('id', ev).eq('congregation_id', activeCongregationId);
            }

            if (ev === currentYear) {
                window.evesJarulek = osszeg;
                await _supabase.from('congregations')
                    .update({ eves_jarulek: osszeg })
                    .eq('id', activeCongregationId);
            }

            window._jarulekPerYear[ev] = osszeg;
        }

        // 2. Kedvezmények mentése — aktuális év összes kedvezményét frissítjük
        var ev = _jkCurrentEv;

        // Először töröljük (deaktiváljuk) a régi kedvezményeket ehhez az évhez
        await _supabase.from('jarulek_kedvezmeny')
            .update({ aktiv: false })
            .eq('congregation_id', activeCongregationId)
            .eq('ev', ev);

        // Meglévő sorok frissítése vagy új sorok beszúrása
        var allRows = document.querySelectorAll('#jk-idoszak-rows .jk-row, #jk-kor-rows .jk-row, #jk-jov-rows .jk-row');
        var sorrend = 0;
        for (var r = 0; r < allRows.length; r++) {
            var row = allRows[r];
            var tipus = row.dataset.jkTipus;
            var dbId = row.dataset.jkDbid || null;
            sorrend++;

            var rec = {
                congregation_id: activeCongregationId,
                ev: ev,
                tipus: tipus,
                sorrend: sorrend,
                aktiv: true
            };

            if (tipus === 'idoszak') {
                // Date input értéke YYYY-MM-DD → MM-DD formátumra konvertálás
                var hataridFull = (row.querySelector('.jk-hatarid') || {}).value || '';
                var hParts = hataridFull.split('-');
                rec.hatarid = hParts.length >= 3 ? (hParts[1] + '-' + hParts[2]) : (hataridFull || '07-01');
                rec.kedv_osszeg = parseFloat((row.querySelector('.jk-kedv-osszeg') || {}).value) || 0;
            } else if (tipus === 'kor') {
                rec.kor_tol = parseInt((row.querySelector('.jk-kor-tol') || {}).value) || 0;
                rec.szazalek = parseFloat((row.querySelector('.jk-szazalek') || {}).value) || 0;
                rec.fix_osszeg = parseFloat((row.querySelector('.jk-fix-osszeg') || {}).value) || null;
            } else if (tipus === 'jovedelem') {
                rec.jov_leiras = (row.querySelector('.jk-jov-leiras') || {}).value || '';
                rec.szazalek = parseFloat((row.querySelector('.jk-szazalek') || {}).value) || 0;
                rec.fix_osszeg = parseFloat((row.querySelector('.jk-fix-osszeg') || {}).value) || null;
            }

            if (dbId) {
                await _supabase.from('jarulek_kedvezmeny').update(rec).eq('id', dbId);
            } else {
                await _supabase.from('jarulek_kedvezmeny').insert(rec);
            }
        }

        _updateJarulekHeaderDisplay();
        bootstrap.Modal.getInstance(document.getElementById('modal-jarulek-manager'))?.hide();
        alert('Járulék beállítások mentve!');

        if (typeof _tartozasokLoaded !== 'undefined' && _tartozasokLoaded && typeof window.loadTartozasok === 'function') {
            window.loadTartozasok();
        }
    } catch (err) {
        alert('Hiba a mentéskor: ' + err.message);
    }
};

function _updateJarulekHeaderDisplay() {
    var el = document.getElementById('jarulek-header-display');
    if (el) {
        el.textContent = 'Aktuális évi egyházfenntartó járulék: ' + (window.evesJarulek || 0) + ' RON';
    }
}

window.bevCelMap = {};
window.kiaCelMap = {};

async function populateTransactionModals() {
    try {
        const bSelect = document.getElementById('b-id_befizetescel');
        const kSelect = document.getElementById('k-id_kiadascel');

        var _q = typeof cachedQuery === 'function' ? cachedQuery : function(_k, fn) { return fn(); };
        const { data: cells, error: cellsErr } = await _q('szamadasicel_all', () => _supabase.from('szamadasicel').select('*').order('sorszam'), 600000);
        if (cellsErr) alert("Adatbázis hiba a kódoknál: " + cellsErr.message);

        window.szamadasiCellek = cells || [];

        const { data: bevCells } = await _q('befizetescel_all', () => _supabase.from('befizetescel').select('id, id_szamadasicel'), 600000);
        const { data: kiaCells } = await _q('kiadascel_all', () => _supabase.from('kiadascel').select('id, id_szamadasicel'), 600000);

        const bevMapByKOD = {};
        const kiaMapByKOD = {};

        bevCells?.forEach(c => { if (c.id_szamadasicel) { window.bevCelMap[c.id] = c.id_szamadasicel.trim(); bevMapByKOD[c.id_szamadasicel.trim()] = c.id; } });
        kiaCells?.forEach(c => { if (c.id_szamadasicel) { window.kiaCelMap[c.id] = c.id_szamadasicel.trim(); kiaMapByKOD[c.id_szamadasicel.trim()] = c.id; } });

        // Belső mozgás befizetescel/kiadascel integer ID-k mentése (a save logikának kell)
        window._bmBevCelIds = {
            keszpenz: bevMapByKOD['100.01'] || null,  // kassza jóváírás
            banki:    bevMapByKOD['100.02'] || null    // bank jóváírás
        };
        window._bmKiaCelIds = {
            keszpenz: kiaMapByKOD['100.51'] || null,  // kassza terhelés
            banki:    kiaMapByKOD['100.52'] || null    // bank terhelés
        };

        // 100.xx kódok rendszerszintűek — nem jelennek meg a normál legördülőben
        const isSystemRow = (kod) => !kod || kod.startsWith('100.');

        // Egyházmegyei szintű tételek — egyházközségi szinten NEM jelennek meg
        // (101.07 'Központi járulékok - egyházmegyei bevétel', 101.08 'Egyházközségek fizetésalapja')
        // FONTOS: 'központi' NEM szűrjük, mert a 203.06/203.07 kiadások gyülekezeti szintűek!
        const isDiocesan = (kod, nev) => {
            const n = (nev || '').toLowerCase();
            return n.includes('fizetésalapja') || n.includes('egyházmegyei');
        };

        const makeOption = (c, mapByKOD) => {
            const intId = mapByKOD[c.id.trim()];
            return intId ? `<option value="${intId}">${c.id} - ${c.nev}</option>` : '';
        };

        // Normál kategóriák csoportosítása fejezetek szerint
        const groupByChapter = (items, mapByKOD) => {
            const chapters = {};
            items.forEach(c => {
                const chapter = c.id.split('.')[0]; // '101', '102', stb.
                if (!chapters[chapter]) chapters[chapter] = [];
                chapters[chapter].push(c);
            });
            let html = '';
            // Fejezet fejléc a szamadasiCellek-ből
            for (const ch of Object.keys(chapters).sort()) {
                const headerCell = window.szamadasiCellek.find(x => x.id === ch);
                const label = headerCell ? (ch + ' — ' + headerCell.nev) : ch;
                const opts = chapters[ch].map(c => makeOption(c, mapByKOD)).filter(o => o).join('');
                if (opts) {
                    html += '<optgroup label="' + label + '">' + opts + '</optgroup>';
                }
            }
            return html;
        };

        // Dinamikus belső mozgás opciók a bankszámlák alapján
        const banks = window.bankAccounts || [];
        const makeBmLabel = (bank) => bank.bank_neve + ' (' + bank.valuta + ')';

        if (bSelect) {
            const bevCels = window.szamadasiCellek.filter(c =>
                c.type === 'B' && c.iscel === true && c.id.includes('.') &&
                !isSystemRow(c.id) && !isDiocesan(c.id, c.nev));
            const normalHtml = groupByChapter(bevCels, bevMapByKOD);

            // Belső mozgás opciók — bevétel oldalon (pénz érkezik)
            let bmOpts = '';
            banks.forEach(b => {
                // Készpénzfelvétel bankból → kassza kap pénzt
                bmOpts += '<option value="_BM:bank_kassza:' + b.id + '">' +
                    '\u25B6 Készpénzfelvétel a ' + makeBmLabel(b) + ' számláról</option>';
            });
            if (banks.length >= 2) {
                // Banki átutalás — bevételi oldal (cél bank kap)
                for (let i = 0; i < banks.length; i++) {
                    for (let j = 0; j < banks.length; j++) {
                        if (i === j) continue;
                        bmOpts += '<option value="_BM:bank_bank:' + banks[j].id + ':' + banks[i].id + '">' +
                            '\u25B6 Banki átutalás a ' + makeBmLabel(banks[j]) + ' számláról → ' + makeBmLabel(banks[i]) + '</option>';
                    }
                }
                // Valutacsere (csak ha különböző valuták vannak)
                const currencies = [...new Set(banks.map(b => b.valuta))];
                if (currencies.length > 1) {
                    bmOpts += '<option value="_BM:valutacsere">\u25B6 Valutacsere bankszámlák között</option>';
                }
            }

            bSelect.innerHTML = '<option value="">-- Válasszon bevételi tételt --</option>' + normalHtml +
                (bmOpts ? '<optgroup label="\u25B6 Belső Mozgások (kassza/bank)">' + bmOpts + '</optgroup>' : '');
        }

        if (kSelect) {
            const kiaCels = window.szamadasiCellek.filter(c =>
                c.type === 'K' && c.iscel === true && c.id.includes('.') &&
                !isSystemRow(c.id) && !isDiocesan(c.id, c.nev));
            const normalHtml = groupByChapter(kiaCels, kiaMapByKOD);

            // Belső mozgás opciók — kiadás oldalon (pénz megy)
            let bmOpts = '';
            banks.forEach(b => {
                // Készpénzletétel bankba → kasszából megy
                bmOpts += '<option value="_BM:kassza_bank:' + b.id + '">' +
                    '\u25B6 Készpénzletétel a ' + makeBmLabel(b) + ' számlára</option>';
            });
            if (banks.length >= 2) {
                // Banki átutalás — kiadás oldal (forrás bank veszít)
                for (let i = 0; i < banks.length; i++) {
                    for (let j = 0; j < banks.length; j++) {
                        if (i === j) continue;
                        bmOpts += '<option value="_BM:bank_bank:' + banks[i].id + ':' + banks[j].id + '">' +
                            '\u25B6 Banki átutalás a ' + makeBmLabel(banks[i]) + ' számláról → ' + makeBmLabel(banks[j]) + '</option>';
                    }
                }
                const currencies = [...new Set(banks.map(b => b.valuta))];
                if (currencies.length > 1) {
                    bmOpts += '<option value="_BM:valutacsere">\u25B6 Valutacsere bankszámlák között</option>';
                }
            }

            kSelect.innerHTML = '<option value="">-- Válasszon kiadási tételt --</option>' + normalHtml +
                (bmOpts ? '<optgroup label="\u25B6 Belső Mozgások (kassza/bank)">' + bmOpts + '</optgroup>' : '');
        }
    } catch (err) { console.error("Hiba a tételek betöltésekor:", err); }
}

async function calculateAndSetCarryover() {
    // FIX: Bevételeknél fizetettev alapú szűrés (pénzügyi év szerinti hozzárendelés)
    // Kiadásoknál datum alapú szűrés (fizikai dátum)
    const [bevRes, kiaRes] = await Promise.all([
        _supabase.from('befizetes').select('osszeg, irattipus')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .lt('fizetettev', parseInt(currentYear)),
        _supabase.from('kiadas').select('osszeg, irattipus')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .lt('datum', `${currentYear}-01-01`)
    ]);
    let cashIn = 0, bankIn = 0, cashOut = 0, bankOut = 0;
    bevRes.data?.forEach(i => {
        if (i.irattipus === 'Készpénz') cashIn += Number(i.osszeg);
        else bankIn += Number(i.osszeg);
    });
    kiaRes.data?.forEach(i => {
        if (i.irattipus === 'Készpénz') cashOut += Number(i.osszeg);
        else bankOut += Number(i.osszeg);
    });
    // Ha van nyitóegyenleg a beállításban (első év indulása), hozzáadjuk
    const nyitoKeszpenz = Number(currentSettings?.nyito_keszpenz || 0);
    const nyitoBank = Number(currentSettings?.nyito_bank || 0);
    window.autoCarryoverCash = (cashIn - cashOut) + nyitoKeszpenz;
    window.autoCarryoverBank = (bankIn - bankOut) + nyitoBank;
}

async function loadMembersDatalist() {
    if (!activeCongregationId) return;
    var _q = typeof cachedQuery === 'function' ? cachedQuery : function(_k, fn) { return fn(); };
    const { data: members } = await _q('penzugy_members_' + activeCongregationId, () =>
        _supabase.from('szemely')
            .select('id, csaladnev, k_nev, sz_datum, c_szam, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)')
            .eq('congregation_id', activeCongregationId)
            .eq('isvisible', true),
        300000);
    if (members) window.allChurchMembers = members;
}