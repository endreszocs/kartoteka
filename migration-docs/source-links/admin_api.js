// ═══════════════════════════════════════════════════════════════
//  KARTOTÉKA — Rendszergazda (God Mode) Dashboard API
//  Teljes rendszer-felügyelet: gyülekezetek, felhasználók,
//  support jegyek, adatminőség, távoli import
// ═══════════════════════════════════════════════════════════════

// ── Globális változók ────────────────────────────────────────

let _admin = null; // Supabase kliens — az autentikált _supabase klienst használjuk RLS-sel
let _allCongregations = [];
let _allDioceses = [];
let _allUsers = [];
let _allSupportTickets = [];
let _qualityResults = [];

// ── 1. INICIALIZÁLÁS ─────────────────────────────────────────

/**
 * Biztonsági ellenőrzés: csak a masterAdmin férhet hozzá
 */
async function adminSecurityCheck() {
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) { window.location.href = '../index.html'; return false; }

        if (user.email !== 'endreszocs@gmail.com') {
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:white;flex-direction:column;">' +
                '<i class="ti ti-shield-x text-danger" style="font-size:4rem;"></i>' +
                '<h1 class="mt-3">Hozzáférés megtagadva</h1>' +
                '<p class="text-muted fs-4">Ez az oldal csak a rendszergazda számára elérhető.</p>' +
                '<a href="dashboard.html" class="btn btn-primary mt-3"><i class="ti ti-home me-2"><\/i>Vissza<\/a>' +
                '<\/div>';
            return false;
        }

        // Az autentikált _supabase klienst használjuk
        // Az admin RLS szabályok biztosítják a teljes hozzáférést (migration_admin_rls_policies.sql)
        _admin = _supabase;
        return true;
    } catch (err) {
        console.error('Admin biztonsági ellenőrzés hiba:', err);
        return false;
    }
}

/**
 * Fő inicializáló: KPI-k + Áttekintés fül betöltése
 */
async function loadAdminOverview() {
    try {
        // Párhuzamos lekérdezések
        const [diocesesRes, congsRes, usersRes, membersRes, supportRes] = await Promise.all([
            _admin.from('dioceses').select('*').order('name'),
            _admin.from('congregations').select('id, name, nev_hu, diocese_id').order('name'),
            _admin.from('profiles').select('id, full_name, email, role, status, congregation_id, diocese_id, phone, created_at, congregations(name, nev_hu)').order('full_name'),
            _admin.from('szemely').select('id, congregation_id, meghalt, member_status, cnp, ferfi, sz_datum, c_helysegid', { count: 'exact' }).eq('isvisible', true),
            _admin.from('support_messages').select('*').order('created_at', { ascending: false })
        ]);

        // Hibakezelés — API válaszok ellenőrzése
        if (diocesesRes.error) console.error('[Admin] Egyházmegyék hiba:', diocesesRes.error.message);
        if (congsRes.error) console.error('[Admin] Gyülekezetek hiba:', congsRes.error.message);
        if (usersRes.error) console.error('[Admin] Felhasználók hiba:', usersRes.error.message);
        if (membersRes.error) console.error('[Admin] Tagok hiba:', membersRes.error.message);
        if (supportRes.error) console.error('[Admin] Support hiba:', supportRes.error.message);

        _allDioceses = diocesesRes.data || [];
        _allCongregations = congsRes.data || [];
        _allUsers = usersRes.data || [];
        const allMembers = membersRes.data || [];
        _allSupportTickets = supportRes.data || [];

        console.log('[Admin] Betöltve:', _allDioceses.length, 'egyházmegye,', _allCongregations.length, 'gyülekezet,', _allUsers.length, 'felhasználó,', allMembers.length, 'tag,', _allSupportTickets.length, 'support jegy');

        // Tagszám hozzárendelése gyülekezetekhez
        const memberCounts = {};
        allMembers.forEach(m => {
            if (!m.meghalt && m.member_status !== 'elköltözött' && m.member_status !== 'kitért') {
                memberCounts[m.congregation_id] = (memberCounts[m.congregation_id] || 0) + 1;
            }
        });
        _allCongregations.forEach(c => { c._memberCount = memberCounts[c.id] || 0; });

        // Adatminőségi hibaszám gyors becslés
        let dataErrors = 0;
        allMembers.forEach(m => {
            if (!m.meghalt) {
                if (!m.cnp) dataErrors++;
                if (m.ferfi === null || m.ferfi === undefined) dataErrors++;
                if (!m.sz_datum) dataErrors++;
            }
        });

        // KPI kártyák frissítése
        const openSupport = _allSupportTickets.filter(t => t.status === 'new' || t.status === 'read').length;
        document.getElementById('kpi-congregations').textContent = _allCongregations.length;
        document.getElementById('kpi-users').textContent = _allUsers.filter(u => u.status === 'active').length;
        document.getElementById('kpi-members').textContent = Object.values(memberCounts).reduce((a, b) => a + b, 0);
        document.getElementById('kpi-support').textContent = openSupport;
        document.getElementById('kpi-errors').textContent = dataErrors > 999 ? Math.round(dataErrors / 1000) + 'k' : dataErrors;

        // Support badge a fülön
        if (openSupport > 0) {
            const badge = document.getElementById('support-badge-count');
            badge.textContent = openSupport;
            badge.classList.remove('d-none');
        }

        // Áttekintés fül kitöltése
        renderOverviewDioceses(allMembers);
        renderOverviewUrgent();
        renderOverviewMessages();
        renderTopCongregations();
        renderSystemStatus(allMembers);

        // Gyülekezet szűrő dropdownok feltöltése (több helyütt)
        populateDioceseFilters();
        populateCongregationSelects();

        // Hozzáférés-kérések betöltése
        loadPendingAccessRequests();

    } catch (err) {
        console.error('Admin áttekintés betöltési hiba:', err);
    }
}

// ── 2. ÁTTEKINTÉS FÜL ───────────────────────────────────────

function renderOverviewDioceses(allMembers) {
    const tbody = document.getElementById('overview-dioceses');
    if (_allDioceses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nincs egyházmegye</td></tr>';
        return;
    }

    // Egyházmegyénkénti tagszám
    const dioceseMemberCount = {};
    const dioceseCongCount = {};
    _allCongregations.forEach(c => {
        dioceseCongCount[c.diocese_id] = (dioceseCongCount[c.diocese_id] || 0) + 1;
    });
    allMembers.forEach(m => {
        if (!m.meghalt) {
            const cong = _allCongregations.find(c => c.id === m.congregation_id);
            if (cong) dioceseMemberCount[cong.diocese_id] = (dioceseMemberCount[cong.diocese_id] || 0) + 1;
        }
    });

    tbody.innerHTML = _allDioceses.map(d =>
        '<tr>' +
        '<td class="fw-bold"><i class="ti ti-map-pin me-1 text-indigo"><\/i>' + (d.name || '-') + '<\/td>' +
        '<td class="text-end"><span class="badge bg-blue-lt">' + (dioceseCongCount[d.id] || 0) + '<\/span><\/td>' +
        '<td class="text-end"><span class="badge bg-green-lt">' + (dioceseMemberCount[d.id] || 0) + '<\/span><\/td>' +
        '<\/tr>'
    ).join('');
}

function renderOverviewUrgent() {
    const el = document.getElementById('overview-urgent');
    const items = [];

    // Várakozó regisztrációk
    const pending = _allUsers.filter(u => u.status === 'pending');
    if (pending.length > 0) {
        items.push(
            '<div class="d-flex align-items-center gap-3 p-3 border-bottom">' +
            '<div class="stat-ring bg-warning-lt text-warning" style="width:36px;height:36px;font-size:0.9rem;"><i class="ti ti-user-plus"><\/i><\/div>' +
            '<div class="flex-fill"><div class="fw-bold">' + pending.length + ' várakozó regisztráció<\/div>' +
            '<div class="text-muted small">Jóváhagyásra vár<\/div><\/div>' +
            '<a href="#tab-users" class="btn btn-sm btn-outline-warning" data-bs-toggle="tab" onclick="document.querySelector(\'[href=\\\'#tab-users\\\']\').click(); loadAllUsers();">Megtekintés<\/a>' +
            '<\/div>'
        );
    }

    // Sürgős support jegyek
    const urgentTickets = _allSupportTickets.filter(t => t.urgency === 'surgos' && t.status !== 'closed');
    if (urgentTickets.length > 0) {
        items.push(
            '<div class="d-flex align-items-center gap-3 p-3 border-bottom">' +
            '<div class="stat-ring bg-red-lt text-red" style="width:36px;height:36px;font-size:0.9rem;"><i class="ti ti-alert-triangle"><\/i><\/div>' +
            '<div class="flex-fill"><div class="fw-bold text-danger">' + urgentTickets.length + ' sürgős support jegy<\/div>' +
            '<div class="text-muted small">Azonnali válaszra vár<\/div><\/div>' +
            '<a href="#tab-support" class="btn btn-sm btn-outline-danger" data-bs-toggle="tab" onclick="document.querySelector(\'[href=\\\'#tab-support\\\']\').click(); loadSupportTickets();">Megtekintés<\/a>' +
            '<\/div>'
        );
    }

    // Megválaszolatlan support
    const newTickets = _allSupportTickets.filter(t => t.status === 'new');
    if (newTickets.length > 0) {
        items.push(
            '<div class="d-flex align-items-center gap-3 p-3 border-bottom">' +
            '<div class="stat-ring bg-orange-lt text-orange" style="width:36px;height:36px;font-size:0.9rem;"><i class="ti ti-mail"><\/i><\/div>' +
            '<div class="flex-fill"><div class="fw-bold">' + newTickets.length + ' olvasatlan üzenet<\/div>' +
            '<div class="text-muted small">Válaszra vár<\/div><\/div>' +
            '<\/div>'
        );
    }

    if (items.length === 0) {
        items.push('<div class="text-center py-4 text-success"><i class="ti ti-circle-check" style="font-size:2rem;"><\/i><div class="mt-2 fw-bold">Nincs sürgős teendő<\/div><\/div>');
    }

    el.innerHTML = items.join('');
}

function renderOverviewMessages() {
    const el = document.getElementById('overview-messages');
    const recent = _allSupportTickets.filter(t => t.status !== 'closed').slice(0, 8);

    if (recent.length === 0) {
        el.innerHTML = '<div class="text-center py-4 text-muted">Nincs üzenet<\/div>';
        return;
    }

    el.innerHTML = recent.map(t => {
        const statusIcon = t.status === 'new' ? 'ti-mail text-orange' :
                          t.status === 'read' ? 'ti-mail-opened text-blue' :
                          t.status === 'replied' ? 'ti-check text-green' : 'ti-circle-check text-muted';
        const urgencyClass = t.urgency === 'surgos' ? 'badge-urgency-surgos' :
                            t.urgency === 'kozepes' ? 'badge-urgency-kozepes' : 'badge-urgency-alacsony';
        const date = new Date(t.created_at);
        const dateStr = date.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
        return '<div class="d-flex align-items-start gap-2 p-2 border-bottom" style="cursor:pointer;" onclick="openSupportReply(\'' + t.id + '\')">' +
            '<i class="ti ' + statusIcon + ' mt-1"><\/i>' +
            '<div class="flex-fill" style="min-width:0;">' +
            '<div class="fw-bold text-truncate" style="font-size:0.85rem;">' + (t.subject || 'Nincs tárgy') + '<\/div>' +
            '<div class="text-muted small text-truncate">' + (t.sender_name || 'Ismeretlen') + '<\/div>' +
            '<\/div>' +
            '<div class="text-end flex-shrink-0">' +
            '<div class="text-muted" style="font-size:0.75rem;">' + dateStr + '<\/div>' +
            '<span class="badge ' + urgencyClass + '" style="font-size:0.65rem;">' + (t.urgency || 'alacsony') + '<\/span>' +
            '<\/div><\/div>';
    }).join('');
}

function renderTopCongregations() {
    const tbody = document.getElementById('overview-top-congregations');
    const sorted = [..._allCongregations].sort((a, b) => (b._memberCount || 0) - (a._memberCount || 0));
    const top10 = sorted.slice(0, 10);

    if (top10.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nincs adat<\/td><\/tr>';
        return;
    }

    tbody.innerHTML = top10.map((c, i) => {
        const diocese = _allDioceses.find(d => d.id === c.diocese_id);
        return '<tr>' +
            '<td class="fw-bold text-muted">' + (i + 1) + '.<\/td>' +
            '<td class="fw-bold">' + (c.nev_hu || c.name || '-') + '<\/td>' +
            '<td><span class="badge bg-indigo-lt">' + (diocese ? diocese.name : '-') + '<\/span><\/td>' +
            '<td class="text-end fw-bold text-primary">' + (c._memberCount || 0) + '<\/td>' +
            '<\/tr>';
    }).join('');
}

function renderSystemStatus(allMembers) {
    const el = document.getElementById('overview-system-status');
    const activeUsers = _allUsers.filter(u => u.status === 'active').length;
    const totalMembers = allMembers.filter(m => !m.meghalt).length;
    const congsWithPastor = new Set(_allUsers.filter(u => u.status === 'active' && u.congregation_id).map(u => u.congregation_id)).size;
    const congsWithoutPastor = _allCongregations.length - congsWithPastor;
    const todayStr = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });

    el.innerHTML =
        '<div class="row g-3">' +
        '<div class="col-6">' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-calendar text-muted"><\/i><span class="small text-muted">' + todayStr + '<\/span><\/div>' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-building-church text-indigo"><\/i><span class="small"><strong>' + _allCongregations.length + '<\/strong> rögzített gyülekezet<\/span><\/div>' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-users text-blue"><\/i><span class="small"><strong>' + activeUsers + '<\/strong> aktív felhasználó<\/span><\/div>' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-user-check text-green"><\/i><span class="small"><strong>' + totalMembers + '<\/strong> aktív egyháztag<\/span><\/div>' +
        '<\/div>' +
        '<div class="col-6">' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-map-2 text-purple"><\/i><span class="small"><strong>' + _allDioceses.length + '<\/strong> egyházmegye<\/span><\/div>' +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-user-star text-warning"><\/i><span class="small"><strong>' + congsWithPastor + '<\/strong> gyülekezet lelkésszel<\/span><\/div>' +
        (congsWithoutPastor > 0 ?
            '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-alert-circle text-danger"><\/i><span class="small text-danger"><strong>' + congsWithoutPastor + '<\/strong> gyülekezet lelkész nélkül<\/span><\/div>' : '') +
        '<div class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-headset text-orange"><\/i><span class="small"><strong>' + _allSupportTickets.length + '<\/strong> összes support jegy<\/span><\/div>' +
        '<\/div>' +
        '<\/div>';
}

// ── 3. GYÜLEKEZETEK FÜL ──────────────────────────────────────

function populateDioceseFilters() {
    const options = '<option value="">Minden egyházmegye<\/option>' +
        _allDioceses.map(d => '<option value="' + d.id + '">' + d.name + '<\/option>').join('');
    const el = document.getElementById('cong-diocese-filter');
    if (el) el.innerHTML = options;
}

function populateCongregationSelects() {
    const sorted = [..._allCongregations].sort((a, b) => (a.nev_hu || a.name || '').localeCompare(b.nev_hu || b.name || '', 'hu'));
    const options = '<option value="">-- Válasszon gyülekezetet --<\/option>' +
        sorted.map(c => '<option value="' + c.id + '">' + (c.nev_hu || c.name) + '<\/option>').join('');

    ['quality-cong-select', 'import-cong-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const firstOpt = el.querySelector('option:first-child');
            el.innerHTML = (firstOpt ? firstOpt.outerHTML : '') + sorted.map(c => '<option value="' + c.id + '">' + (c.nev_hu || c.name) + '<\/option>').join('');
        }
    });
}

window.loadCongregations = function() {
    filterCongregations();
};

window.filterCongregations = function() {
    const search = (document.getElementById('cong-search')?.value || '').toLowerCase();
    const dioceseFilter = document.getElementById('cong-diocese-filter')?.value || '';
    const sort = document.getElementById('cong-sort')?.value || 'name';

    let filtered = [..._allCongregations];

    if (search) {
        filtered = filtered.filter(c => {
            const name = ((c.nev_hu || '') + ' ' + (c.name || '')).toLowerCase();
            return name.includes(search);
        });
    }
    if (dioceseFilter) {
        filtered = filtered.filter(c => c.diocese_id === dioceseFilter);
    }

    if (sort === 'members_desc') filtered.sort((a, b) => (b._memberCount || 0) - (a._memberCount || 0));
    else if (sort === 'members_asc') filtered.sort((a, b) => (a._memberCount || 0) - (b._memberCount || 0));
    else filtered.sort((a, b) => (a.nev_hu || a.name || '').localeCompare(b.nev_hu || b.name || '', 'hu'));

    document.getElementById('cong-count-display').textContent = filtered.length + ' gyülekezet';

    const tbody = document.getElementById('cong-tbody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nincs találat<\/td><\/tr>';
        return;
    }

    // Lelkész hozzárendelés
    const pastorMap = {};
    _allUsers.filter(u => u.status === 'active' && u.congregation_id).forEach(u => {
        pastorMap[u.congregation_id] = u.full_name || u.email;
    });

    tbody.innerHTML = filtered.map(c => {
        const diocese = _allDioceses.find(d => d.id === c.diocese_id);
        const pastor = pastorMap[c.id] || '<span class="text-danger">Nincs<\/span>';
        const count = c._memberCount || 0;
        const qualityColor = count === 0 ? 'text-muted' : 'text-success';

        return '<tr class="cong-card">' +
            '<td>' +
            '<div class="fw-bold">' + (c.nev_hu || c.name || '-') + '<\/div>' +
            '<div class="text-muted small">' + (c.name || '') + '<\/div>' +
            '<\/td>' +
            '<td><span class="badge bg-indigo-lt">' + (diocese ? diocese.name : '-') + '<\/span><\/td>' +
            '<td>' + pastor + '<\/td>' +
            '<td class="text-center"><span class="fw-bold fs-4 ' + (count > 0 ? 'text-primary' : 'text-muted') + '">' + count + '<\/span><\/td>' +
            '<td class="text-center"><i class="ti ti-circle-check ' + qualityColor + '"><\/i><\/td>' +
            '<td class="text-end">' +
            '<div class="btn-group">' +
            '<button class="btn btn-sm btn-outline-primary" onclick="openCongDetails(\'' + c.id + '\')" title="Részletek"><i class="ti ti-info-circle"><\/i><\/button>' +
            '<button class="btn btn-sm btn-primary" onclick="enterCongregation(\'' + c.id + '\', \'' + (c.nev_hu || c.name || '').replace(/'/g, "\\'") + '\')" title="Belépés"><i class="ti ti-door-enter"><\/i><\/button>' +
            '<\/div>' +
            '<\/td>' +
            '<\/tr>';
    }).join('');
};

/**
 * Belépés egy gyülekezetbe — engedélykérés a lelkésznek
 * A rendszergazda NEM léphet be közvetlenül — a lelkésznek jóvá kell hagynia.
 */
window.enterCongregation = async function(congId, congName) {
    try {
        // 1. Ellenőrzés: van-e már aktív (jóváhagyott, nem lejárt) engedély?
        const { data: existing } = await _admin.from('admin_access_requests')
            .select('id, status, expires_at')
            .eq('congregation_id', congId)
            .eq('status', 'approved')
            .gt('expires_at', new Date().toISOString())
            .order('approved_at', { ascending: false })
            .limit(1);

        if (existing && existing.length > 0) {
            // Van aktív engedély — közvetlenül beléphet
            const remaining = Math.round((new Date(existing[0].expires_at) - Date.now()) / 60000);
            if (confirm('Van aktív engedélye a(z) "' + congName + '" gyülekezethez (' + remaining + ' perc van hátra).\n\nBelép?')) {
                _executeAdminOverride(congId, congName);
            }
            return;
        }

        // 2. Ellenőrzés: van-e függőben lévő kérés?
        const { data: pending } = await _admin.from('admin_access_requests')
            .select('id, created_at')
            .eq('congregation_id', congId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

        if (pending && pending.length > 0) {
            var pendingAge = Math.round((Date.now() - new Date(pending[0].created_at).getTime()) / 60000);
            var pendingMsg = 'Már van függőben lévő kérése ehhez a gyülekezethez (' + (pendingAge < 60 ? pendingAge + ' perce' : Math.round(pendingAge / 60) + ' órája') + ' küldve).\n\n';
            pendingMsg += 'Várja meg a lelkész jóváhagyását!\n\n';
            pendingMsg += 'Szeretné VISSZAVONNI a korábbi kérést és újat küldeni?';
            if (confirm(pendingMsg)) {
                // Régi kérés visszavonása (expired státuszra állítás)
                await _admin.from('admin_access_requests')
                    .update({ status: 'expired', denied_at: new Date().toISOString() })
                    .eq('id', pending[0].id);
                // Új kérés indítása
                _openAccessRequestModal(congId, congName);
            }
            return;
        }

        // 3. Kérés indítása — modal megnyitása az indokláshoz
        _openAccessRequestModal(congId, congName);

    } catch (err) {
        console.error('Belépési engedély ellenőrzés hiba:', err);
        alert('Hiba történt az engedély ellenőrzésekor: ' + err.message);
    }
};

/**
 * Admin override végrehajtása (csak jóváhagyott engedéllyel!)
 */
function _executeAdminOverride(congId, congName) {
    invalidateProfileCache();
    sessionStorage.setItem('admin_override_congregation', JSON.stringify({ id: congId, name: congName }));
    window.location.href = 'dashboard.html';
}

/**
 * Hozzáférés-kérés modal megnyitása (indoklás megadása)
 */
function _openAccessRequestModal(congId, congName) {
    document.getElementById('access-request-cong-name').textContent = congName;
    document.getElementById('access-request-reason').value = '';
    document.getElementById('access-request-error').classList.add('d-none');

    // A gomb onclick beállítása
    document.getElementById('btn-send-access-request').onclick = function() {
        _sendAccessRequest(congId, congName);
    };

    new bootstrap.Modal(document.getElementById('modal-access-request')).show();
}

/**
 * Hozzáférés-kérés küldése a lelkésznek
 */
async function _sendAccessRequest(congId, congName) {
    const reason = document.getElementById('access-request-reason').value.trim();
    if (!reason || reason.length < 5) {
        document.getElementById('access-request-error').textContent = 'Kérjük, írja le a hozzáférés okát (legalább 5 karakter)!';
        document.getElementById('access-request-error').classList.remove('d-none');
        return;
    }

    const btn = document.getElementById('btn-send-access-request');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"><\/span>Küldés...';

    try {
        // Admin user ID
        const { data: { user } } = await _supabase.auth.getUser();

        // Keressük meg a gyülekezet lelkészét / felelős személyét
        // Minden aktív szerepkört elfogadunk, de kizárjuk magát az admint
        const { data: pastors } = await _admin.from('profiles')
            .select('id, full_name, email, role')
            .eq('congregation_id', congId)
            .eq('status', 'active')
            .neq('id', user.id);

        // Prioritás: lelkész > esperes > egyhazmegyei_admin > bármely aktív tag
        var pastor = null;
        if (pastors && pastors.length > 0) {
            var priority = ['lelkesz', 'esperes', 'egyhazmegyei_admin', 'admin'];
            for (var p = 0; p < priority.length; p++) {
                pastor = pastors.find(function(pr) { return pr.role === priority[p]; });
                if (pastor) break;
            }
            // Ha nincs prioritásos szerepkör, az első aktív tag kapja az értesítést
            if (!pastor) pastor = pastors[0];
        }

        // ── Ha nincs más felhasználó → automatikus jóváhagyás ──
        if (!pastor) {
            var autoExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
            const { error: autoErr } = await _admin.from('admin_access_requests').insert([{
                admin_user_id: user.id,
                congregation_id: congId,
                pastor_user_id: null,
                reason: reason,
                status: 'approved',
                approved_at: new Date().toISOString(),
                expires_at: autoExpiry
            }]);
            if (autoErr) throw autoErr;

            bootstrap.Modal.getInstance(document.getElementById('modal-access-request')).hide();
            alert('Ehhez a gyülekezethez Önön kívül nincs más aktív felhasználó.\n\nAutomatikus jóváhagyás — 2 órás hozzáférés engedélyezve.');
            _executeAdminOverride(congId, congName);
            return;
        }

        // ── Van lelkész/felelős → kérés küldése ──
        const { error: insertErr } = await _admin.from('admin_access_requests').insert([{
            admin_user_id: user.id,
            congregation_id: congId,
            pastor_user_id: pastor.id,
            reason: reason,
            status: 'pending'
        }]);

        if (insertErr) throw insertErr;

        // Értesítés küldése a lelkésznek
        await _admin.from('ertesitesek').insert([{
            user_id: pastor.id,
            congregation_id: congId,
            cim: 'Rendszergazdai hozzáférés kérelem',
            uzenet: 'A rendszergazda (Szőcs Endre) hozzáférést kér a gyülekezet adataihoz.\n\nIndoklás: ' + reason + '\n\nKérjük, hagyja jóvá vagy utasítsa el a kérést a Kartotékán belül.',
            tipus: 'admin_access',
            hivatkozas: 'admin_access_approve'
        }]);

        // Modal bezárása, visszajelzés
        bootstrap.Modal.getInstance(document.getElementById('modal-access-request')).hide();

        var successEl = document.createElement('div');
        successEl.className = 'alert alert-success alert-dismissible position-fixed bottom-0 end-0 m-3 shadow-lg';
        successEl.style.zIndex = '9999';
        successEl.innerHTML = '<div class="d-flex align-items-center gap-2">' +
            '<i class="ti ti-circle-check fs-2"><\/i>' +
            '<div><strong>Hozzáférés-kérés elküldve!<\/strong><br>' +
            'Értesítés elküldve: ' + pastor.full_name + ' (' + pastor.email + ')' +
            '<\/div><\/div>' +
            '<button type="button" class="btn-close" data-bs-dismiss="alert"><\/button>';
        document.body.appendChild(successEl);
        setTimeout(function() { successEl.remove(); }, 8000);

        // Admin Realtime feliratkozás a válaszra
        _subscribeToAccessResponse(congId, congName);

    } catch (err) {
        console.error('Hozzáférés-kérés küldési hiba:', err);
        document.getElementById('access-request-error').textContent = 'Hiba: ' + err.message;
        document.getElementById('access-request-error').classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-send me-1"><\/i>Kérés küldése';
    }
}

/**
 * Realtime feliratkozás — ha a lelkész jóváhagyja, azonnal értesül az admin
 */
function _subscribeToAccessResponse(congId, congName) {
    const channel = _supabase.channel('admin-access-' + congId)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'admin_access_requests', filter: 'congregation_id=eq.' + congId },
            function(payload) {
                const row = payload.new;
                if (row.status === 'approved') {
                    channel.unsubscribe();
                    // Toast értesítés + automatikus belépés ajánlat
                    if (confirm('A lelkész JÓVÁHAGYTA a hozzáférést a(z) "' + congName + '" gyülekezethez!\n\nSzeretnél most belépni?')) {
                        _executeAdminOverride(congId, congName);
                    }
                } else if (row.status === 'denied') {
                    channel.unsubscribe();
                    alert('A lelkész ELUTASÍTOTTA a hozzáférés-kérést a(z) "' + congName + '" gyülekezethez.');
                }
            }
        )
        .subscribe();
}

/**
 * Függőben lévő kérések megjelenítése az admin dashboardon
 */
window.loadPendingAccessRequests = async function() {
    try {
        const { data: requests } = await _admin.from('admin_access_requests')
            .select('id, congregation_id, reason, status, created_at, expires_at, approved_at, denied_at')
            .in('status', ['pending', 'approved'])
            .order('created_at', { ascending: false });

        const container = document.getElementById('access-requests-list');
        if (!container) return;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="ti ti-checks me-1"><\/i>Nincs aktív hozzáférés-kérés<\/div>';
            return;
        }

        container.innerHTML = requests.map(function(r) {
            const cong = _allCongregations.find(function(c) { return c.id === r.congregation_id; });
            const congName = cong ? (cong.nev_hu || cong.name) : 'Ismeretlen';
            const isExpired = r.status === 'approved' && r.expires_at && new Date(r.expires_at) < new Date();

            if (isExpired) return ''; // lejárt, nem mutatjuk

            const statusBadge = r.status === 'pending'
                ? '<span class="badge bg-warning">Várakozik<\/span>'
                : '<span class="badge bg-success">Jóváhagyva<\/span>';

            let timeInfo = '';
            if (r.status === 'approved' && r.expires_at) {
                const remaining = Math.round((new Date(r.expires_at) - Date.now()) / 60000);
                timeInfo = '<span class="text-muted small ms-2">(' + remaining + ' perc van hátra)<\/span>';
            }

            let actionBtn = '';
            if (r.status === 'approved' && r.expires_at && new Date(r.expires_at) > new Date()) {
                actionBtn = '<button class="btn btn-sm btn-primary" onclick="_executeAdminOverride(\'' + r.congregation_id + '\', \'' + congName.replace(/'/g, "\\'") + '\')"><i class="ti ti-door-enter me-1"><\/i>Belépés<\/button>';
            }

            return '<div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">' +
                '<div>' +
                '<span class="fw-bold">' + congName + '<\/span> ' + statusBadge + timeInfo +
                '<div class="text-muted small">' + r.reason + '<\/div>' +
                '<\/div>' +
                actionBtn +
                '<\/div>';
        }).filter(Boolean).join('');

    } catch (err) {
        console.error('Hozzáférés-kérések betöltési hiba:', err);
    }
};

/**
 * Gyülekezet részletek modal megnyitása
 */
window.openCongDetails = async function(congId) {
    const cong = _allCongregations.find(c => c.id === congId);
    if (!cong) return;

    document.getElementById('cong-detail-name').textContent = cong.nev_hu || cong.name || 'Ismeretlen';
    document.getElementById('cong-detail-body').innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"><\/div><\/div>';

    const modal = new bootstrap.Modal(document.getElementById('modal-cong-details'));
    modal.show();

    // Belépés gomb
    document.getElementById('btn-enter-congregation').onclick = function() {
        modal.hide();
        enterCongregation(congId, cong.nev_hu || cong.name || '');
    };

    try {
        // Részletes adatok lekérdezése
        const [congDetails, members, pastor, recentPayments] = await Promise.all([
            _admin.from('congregations').select('*').eq('id', congId).single(),
            _admin.from('szemely').select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt, member_status, cnp').eq('congregation_id', congId).eq('isvisible', true),
            _admin.from('profiles').select('full_name, email, phone, role').eq('congregation_id', congId).eq('status', 'active'),
            _admin.from('befizetes').select('id, osszeg, datum').eq('congregation_id', congId).eq('deleted', false).order('datum', { ascending: false }).limit(5)
        ]);

        const cd = congDetails.data || {};
        const mems = members.data || [];
        const pastors = pastor.data || [];
        const payments = recentPayments.data || [];

        const activeMembers = mems.filter(m => !m.meghalt && m.member_status !== 'elköltözött');
        const men = activeMembers.filter(m => m.ferfi === true).length;
        const women = activeMembers.filter(m => m.ferfi === false).length;
        const unknownGender = activeMembers.filter(m => m.ferfi === null || m.ferfi === undefined).length;
        const missingCnp = activeMembers.filter(m => !m.cnp).length;
        const missingBirth = activeMembers.filter(m => !m.sz_datum).length;
        const diocese = _allDioceses.find(d => d.id === cd.diocese_id);

        let html = '<div class="row g-4">';

        // Alapadatok
        html += '<div class="col-lg-6">' +
            '<h4 class="fw-bold mb-2"><i class="ti ti-building-church me-2 text-indigo"><\/i>Alapadatok<\/h4>' +
            '<table class="table table-sm">' +
            '<tr><td class="text-muted" style="width:120px;">Magyar név<\/td><td class="fw-bold">' + (cd.nev_hu || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">Román név<\/td><td>' + (cd.nev_ro || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">Egyházmegye<\/td><td><span class="badge bg-indigo-lt">' + (diocese ? diocese.name : '-') + '<\/span><\/td><\/tr>' +
            '<tr><td class="text-muted">Cím<\/td><td>' + (cd.cim || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">Email<\/td><td>' + (cd.email || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">Telefon<\/td><td>' + (cd.telefon || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">Adószám<\/td><td>' + (cd.adoszam || '-') + '<\/td><\/tr>' +
            '<tr><td class="text-muted">IBAN<\/td><td><code style="word-break:break-all;">' + (cd.iban || '-') + '<\/code><\/td><\/tr>' +
            '<\/table><\/div>';

        // Statisztikák
        html += '<div class="col-lg-6">' +
            '<h4 class="fw-bold mb-2"><i class="ti ti-chart-pie me-2 text-green"><\/i>Statisztikák<\/h4>' +
            '<div class="row g-2 mb-3">' +
            '<div class="col-4 text-center"><div class="card py-2"><div class="fs-3 fw-bold text-primary">' + activeMembers.length + '<\/div><div class="text-muted small">Aktív tag<\/div><\/div><\/div>' +
            '<div class="col-4 text-center"><div class="card py-2"><div class="fs-3 fw-bold text-blue">' + men + '<\/div><div class="text-muted small">Férfi<\/div><\/div><\/div>' +
            '<div class="col-4 text-center"><div class="card py-2"><div class="fs-3 fw-bold text-pink">' + women + '<\/div><div class="text-muted small">Nő<\/div><\/div><\/div>' +
            '<\/div>';

        // Adatminőség figyelmeztetések
        if (missingCnp > 0 || unknownGender > 0 || missingBirth > 0) {
            html += '<h4 class="fw-bold mb-2"><i class="ti ti-alert-triangle me-2 text-warning"><\/i>Adatminőség<\/h4>' +
                '<div class="alert alert-warning py-2">' +
                (missingCnp > 0 ? '<div><i class="ti ti-id me-1"><\/i>' + missingCnp + ' személy CNP nélkül<\/div>' : '') +
                (unknownGender > 0 ? '<div><i class="ti ti-gender-bigender me-1"><\/i>' + unknownGender + ' személy ismeretlen nem<\/div>' : '') +
                (missingBirth > 0 ? '<div><i class="ti ti-calendar me-1"><\/i>' + missingBirth + ' személy születési dátum nélkül<\/div>' : '') +
                '<\/div>';
        }

        // Lelkészek
        html += '<h4 class="fw-bold mb-2 mt-2"><i class="ti ti-user me-2 text-blue"><\/i>Felhasználók<\/h4>';
        if (pastors.length > 0) {
            pastors.forEach(p => {
                const roleLabel = p.role === 'admin' ? 'Admin' : p.role === 'esperes' ? 'Esperes' : 'Lelkipásztor';
                html += '<div class="d-flex align-items-center gap-2 mb-1">' +
                    '<span class="badge bg-blue-lt">' + roleLabel + '<\/span>' +
                    '<span class="fw-bold">' + p.full_name + '<\/span>' +
                    '<span class="text-muted small">' + p.email + '<\/span><\/div>';
            });
        } else {
            html += '<div class="text-danger small"><i class="ti ti-alert-circle me-1"><\/i>Nincs hozzárendelt felhasználó<\/div>';
        }

        html += '<\/div><\/div>';

        document.getElementById('cong-detail-body').innerHTML = html;

    } catch (err) {
        document.getElementById('cong-detail-body').innerHTML = '<div class="alert alert-danger">Hiba: ' + err.message + '<\/div>';
    }
};

// ── 4. FELHASZNÁLÓK FÜL ─────────────────────────────────────

window.loadAllUsers = function() {
    const pending = _allUsers.filter(u => u.status === 'pending');
    const active = _allUsers.filter(u => u.status === 'active');
    const pastors = active.filter(u => u.role === 'lelkesz');
    const admins = active.filter(u => u.role === 'esperes' || u.role === 'admin' || u.role === 'egyhazmegyei_admin');

    document.getElementById('users-pending-count').textContent = pending.length;
    document.getElementById('users-active-count').textContent = active.length;
    document.getElementById('users-pastor-count').textContent = pastors.length;
    document.getElementById('users-esperes-count').textContent = admins.length;

    // Várakozó regisztrációk
    renderPendingUsers(pending);

    // Aktív felhasználók
    renderActiveUsers(active);
};

function renderPendingUsers(pending) {
    const tbody = document.getElementById('pending-users-tbody');
    if (pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-success py-3"><i class="ti ti-circle-check me-1"><\/i>Nincs várakozó regisztráció<\/td><\/tr>';
        document.getElementById('pending-section').classList.add('border-success');
        return;
    }

    const dioceseOptions = _allDioceses.map(d => '<option value="' + d.id + '">' + d.name + '<\/option>').join('');

    tbody.innerHTML = pending.map(p =>
        '<tr id="pending-' + p.id + '">' +
        '<td><div class="fw-bold">' + (p.full_name || '-') + '<\/div><div class="text-muted small">' + (p.email || '') + '<\/div><\/td>' +
        '<td><span class="badge bg-dark">' + (p.congregation || '-') + '<\/span><\/td>' +
        '<td><select class="form-select form-select-sm diocese-select-pending" data-user-id="' + p.id + '">' +
        '<option value="">-- Egyházmegye --<\/option>' + dioceseOptions + '<\/select><\/td>' +
        '<td class="text-end"><button class="btn btn-sm btn-success" onclick="approveUser(\'' + p.id + '\', \'' + (p.congregation || '').replace(/'/g, "\\'") + '\')"><i class="ti ti-check me-1"><\/i>Jóváhagyás<\/button><\/td>' +
        '<\/tr>'
    ).join('');
}

function renderActiveUsers(active) {
    const tbody = document.getElementById('active-users-tbody');
    const dioceseOptions = _allDioceses.map(d => '<option value="' + d.id + '">' + d.name + '<\/option>').join('');

    tbody.innerHTML = active.map(u => {
        const isMaster = u.email === 'endreszocs@gmail.com';
        const congName = u.congregations ? (u.congregations.nev_hu || u.congregations.name || '-') : '-';
        const diocese = _allDioceses.find(d => d.id === u.diocese_id);

        return '<tr>' +
            '<td>' +
            '<div class="fw-bold ' + (isMaster ? 'text-danger' : '') + '">' + (u.full_name || '-') + '<\/div>' +
            '<div class="text-muted small">' + u.email + '<\/div>' +
            '<\/td>' +
            '<td><span class="badge bg-secondary-lt">' + congName + '<\/span><\/td>' +
            '<td>' +
            (isMaster ? '<span class="badge bg-red px-2 py-1"><i class="ti ti-crown me-1"><\/i>Rendszergazda<\/span>' :
            '<select class="form-select form-select-sm user-role-select" data-user-id="' + u.id + '">' +
            '<option value="lelkesz"' + (u.role === 'lelkesz' ? ' selected' : '') + '>Lelkipásztor<\/option>' +
            '<option value="esperes"' + (u.role === 'esperes' ? ' selected' : '') + '>Esperes<\/option>' +
            '<option value="egyhazmegyei_admin"' + (u.role === 'egyhazmegyei_admin' ? ' selected' : '') + '>Egyházmegyei Admin<\/option>' +
            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>SzuperAdmin<\/option>' +
            '<\/select>') +
            '<\/td>' +
            '<td>' + (diocese ? '<span class="badge bg-indigo-lt">' + diocese.name + '<\/span>' : '<span class="text-muted">-<\/span>') + '<\/td>' +
            '<td class="text-end">' +
            (isMaster ? '' : '<button class="btn btn-sm btn-outline-primary" onclick="saveUserRole(\'' + u.id + '\')"><i class="ti ti-device-floppy me-1"><\/i>Mentés<\/button>') +
            '<\/td><\/tr>';
    }).join('');
}

window.filterUsers = function() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const rows = document.querySelectorAll('#active-users-tbody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
};

window.approveUser = async function(userId, congName) {
    const row = document.getElementById('pending-' + userId);
    const dioceseSelect = row?.querySelector('.diocese-select-pending');
    const dioceseId = dioceseSelect?.value;

    if (!dioceseId) { alert('Kérem válassza ki az egyházmegyét!'); return; }
    if (!confirm('Létrehozza a gyülekezetet és aktiválja a lelkészt?')) return;

    try {
        const { data: newCong } = await _admin.from('congregations').insert([{ name: congName, nev_hu: congName, diocese_id: dioceseId }]).select().single();
        await _admin.from('profiles').update({ status: 'active', role: 'lelkesz', congregation_id: newCong.id, diocese_id: dioceseId }).eq('id', userId);

        alert('Sikeres jóváhagyás! A lelkész mostantól beléphet.');
        // Frissítés
        const { data: refreshed } = await _admin.from('profiles').select('id, full_name, email, role, status, congregation_id, diocese_id, phone, created_at, congregations(name, nev_hu)').order('full_name');
        _allUsers = refreshed || [];
        loadAllUsers();
    } catch (err) {
        alert('Hiba: ' + err.message);
    }
};

window.saveUserRole = async function(userId) {
    const select = document.querySelector('.user-role-select[data-user-id="' + userId + '"]');
    if (!select) return;

    try {
        const { error } = await _admin.from('profiles').update({ role: select.value }).eq('id', userId);
        if (error) throw error;
        alert('Szerepkör sikeresen frissítve!');
    } catch (err) {
        alert('Hiba: ' + err.message);
    }
};

// ── 5. SUPPORT JEGYEK FÜL ───────────────────────────────────

window.loadSupportTickets = function() {
    filterSupportTickets();
};

window.filterSupportTickets = function() {
    const statusFilter = document.getElementById('support-filter-status')?.value || '';
    const urgencyFilter = document.getElementById('support-filter-urgency')?.value || '';
    const categoryFilter = document.getElementById('support-filter-category')?.value || '';
    const search = (document.getElementById('support-search')?.value || '').toLowerCase();

    let filtered = [..._allSupportTickets];

    if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
    if (urgencyFilter) filtered = filtered.filter(t => t.urgency === urgencyFilter);
    if (categoryFilter) filtered = filtered.filter(t => t.category === categoryFilter);
    if (search) {
        filtered = filtered.filter(t =>
            (t.subject || '').toLowerCase().includes(search) ||
            (t.sender_name || '').toLowerCase().includes(search) ||
            (t.message || '').toLowerCase().includes(search)
        );
    }

    document.getElementById('support-count-display').textContent = filtered.length + ' jegy';

    const tbody = document.getElementById('support-tbody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Nincs találat<\/td><\/tr>';
        return;
    }

    const categoryLabels = { hiba: 'Hiba', fejlesztes: 'Fejlesztés', kiegeszites: 'Kiegészítés', kerdes: 'Kérdés', egyeb: 'Egyéb' };
    const categoryColors = { hiba: 'bg-red-lt', fejlesztes: 'bg-green-lt', kiegeszites: 'bg-blue-lt', kerdes: 'bg-cyan-lt', egyeb: 'bg-secondary-lt' };

    tbody.innerHTML = filtered.map(t => {
        const statusIcon = t.status === 'new' ? 'ti-mail text-orange' :
                          t.status === 'read' ? 'ti-mail-opened text-blue' :
                          t.status === 'replied' ? 'ti-check text-green' : 'ti-circle-check text-muted';
        const urgencyBadge = 'badge-urgency-' + (t.urgency || 'alacsony');
        const date = new Date(t.created_at);
        const dateStr = date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });

        return '<tr style="cursor:pointer;" onclick="openSupportReply(\'' + t.id + '\')">' +
            '<td><i class="ti ' + statusIcon + ' fs-3"><\/i><\/td>' +
            '<td>' +
            '<div class="fw-bold">' + (t.subject || 'Nincs tárgy') + '<\/div>' +
            '<div class="text-muted small">' + (t.sender_name || 'Ismeretlen') + ' &mdash; ' + (t.sender_email || '') + '<\/div>' +
            '<\/td>' +
            '<td><span class="badge ' + (categoryColors[t.category] || 'bg-secondary-lt') + '">' + (categoryLabels[t.category] || t.category || '-') + '<\/span><\/td>' +
            '<td><span class="text-muted small">' + (t.module || '-') + '<\/span><\/td>' +
            '<td><span class="badge ' + urgencyBadge + '">' + (t.urgency || 'alacsony') + '<\/span><\/td>' +
            '<td><div class="small">' + dateStr + '<\/div><div class="text-muted" style="font-size:0.75rem;">' + timeStr + '<\/div><\/td>' +
            '<td class="text-end"><button class="btn btn-sm btn-outline-primary"><i class="ti ti-message-reply"><\/i><\/button><\/td>' +
            '<\/tr>';
    }).join('');
};

let _currentTicketId = null;

window.openSupportReply = async function(ticketId) {
    const ticket = _allSupportTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    _currentTicketId = ticketId;

    // Fejléc
    document.getElementById('reply-modal-subtitle').textContent =
        (ticket.sender_name || 'Ismeretlen') + ' — ' + new Date(ticket.created_at).toLocaleDateString('hu-HU');

    // Eredeti üzenet
    const urgencyBadge = 'badge-urgency-' + (ticket.urgency || 'alacsony');
    document.getElementById('reply-original-message').innerHTML =
        '<div class="d-flex justify-content-between mb-2">' +
        '<span class="badge ' + urgencyBadge + '">' + (ticket.urgency || 'alacsony') + '<\/span>' +
        '<span class="badge bg-secondary-lt">' + (ticket.category || '-') + ' / ' + (ticket.module || '-') + '<\/span>' +
        '<\/div>' +
        '<h5 class="fw-bold">' + (ticket.subject || 'Nincs tárgy') + '<\/h5>' +
        '<div class="bg-light rounded p-3 mt-2">' + (ticket.message || '').replace(/\n/g, '<br>') + '<\/div>';

    // Korábbi válasz
    const existingEl = document.getElementById('reply-existing');
    if (ticket.admin_reply) {
        existingEl.innerHTML =
            '<div class="alert alert-success py-2"><strong><i class="ti ti-check me-1"><\/i>Korábbi válasz (' +
            (ticket.replied_at ? new Date(ticket.replied_at).toLocaleDateString('hu-HU') : '-') + '):<\/strong><br>' +
            ticket.admin_reply.replace(/\n/g, '<br>') + '<\/div>';
        existingEl.classList.remove('d-none');
    } else {
        existingEl.classList.add('d-none');
    }

    document.getElementById('reply-text').value = '';

    // Olvasottnak jelölés
    if (ticket.status === 'new') {
        await _admin.from('support_messages').update({ status: 'read' }).eq('id', ticketId);
        ticket.status = 'read';
    }

    new bootstrap.Modal(document.getElementById('modal-support-reply')).show();
};

window.sendSupportReply = async function() {
    if (!_currentTicketId) return;
    const replyText = document.getElementById('reply-text').value.trim();
    if (!replyText) { alert('Kérem írja be a válasz szövegét!'); return; }

    try {
        const ticket = _allSupportTickets.find(t => t.id === _currentTicketId);

        // Support jegy frissítése
        await _admin.from('support_messages').update({
            admin_reply: replyText,
            status: 'replied',
            replied_at: new Date().toISOString()
        }).eq('id', _currentTicketId);

        // Értesítés küldése a felhasználónak
        if (ticket && ticket.user_id) {
            await _admin.from('ertesitesek').insert([{
                user_id: ticket.user_id,
                congregation_id: ticket.congregation_id,
                cim: 'Válasz a támogatási kérelemre',
                uzenet: 'Válasz érkezett a következő ügyéhez: "' + (ticket.subject || '') + '"\n\n' + replyText,
                tipus: 'support_reply'
            }]);
        }

        // Lokális állapot frissítése
        if (ticket) {
            ticket.admin_reply = replyText;
            ticket.status = 'replied';
            ticket.replied_at = new Date().toISOString();
        }

        bootstrap.Modal.getInstance(document.getElementById('modal-support-reply')).hide();
        alert('Válasz sikeresen elküldve!');
        filterSupportTickets();
    } catch (err) {
        alert('Hiba: ' + err.message);
    }
};

window.closeSupportTicket = async function() {
    if (!_currentTicketId) return;
    if (!confirm('Biztosan lezárja ezt a jegyet?')) return;

    try {
        await _admin.from('support_messages').update({ status: 'closed' }).eq('id', _currentTicketId);

        const ticket = _allSupportTickets.find(t => t.id === _currentTicketId);
        if (ticket) ticket.status = 'closed';

        bootstrap.Modal.getInstance(document.getElementById('modal-support-reply')).hide();
        filterSupportTickets();
    } catch (err) {
        alert('Hiba: ' + err.message);
    }
};

// ── 6. ADATMINŐSÉG FÜL ──────────────────────────────────────

// KPI kártyáról navigálás az Adatminőség fülre + automatikus ellenőrzés
window.goToDataQuality = function() {
    var tabEl = document.querySelector('a[href="#tab-quality"]');
    if (tabEl) {
        new bootstrap.Tab(tabEl).show();
        // Kis késleltetés, hogy a tab megjelenjen, majd futtatjuk az ellenőrzést
        setTimeout(function() {
            var sel = document.getElementById('quality-cong-select');
            if (sel && sel.value) {
                runQualityCheck();
            } else if (sel) {
                // Ha nincs kiválasztva gyülekezet, "all" legyen
                sel.value = 'all';
                runQualityCheck();
            }
        }, 200);
    }
};

window.loadDataQuality = function() {
    // A select már feltöltve, várjuk a felhasználó választását
};

window.runQualityCheck = async function() {
    const congId = document.getElementById('quality-cong-select')?.value;
    const tbody = document.getElementById('quality-results-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-primary"><\/div><div class="mt-2 text-muted">Ellenőrzés folyamatban...<\/div><\/td><\/tr>';

    try {
        let query = _admin.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, cnp, c_helysegid, meghalt, member_status, congregation_id')
            .eq('isvisible', true)
            .eq('meghalt', false);

        if (congId && congId !== 'all') {
            query = query.eq('congregation_id', congId);
        }

        const { data: members, error } = await query;
        if (error) throw error;

        _qualityResults = [];

        // Gyülekezet név-map
        const congMap = {};
        _allCongregations.forEach(c => { congMap[c.id] = c.nev_hu || c.name || 'Ismeretlen'; });

        let missingCnp = 0, missingGender = 0, missingBirth = 0, missingAddress = 0, duplicates = 0;

        // Hiányzó CNP
        members.forEach(m => {
            if (!m.cnp || m.cnp.trim() === '') {
                missingCnp++;
                _qualityResults.push({
                    type: 'cnp',
                    person: (m.csaladnev || '') + ' ' + (m.k_nev || ''),
                    congId: m.congregation_id,
                    congName: congMap[m.congregation_id] || '-',
                    detail: 'Hiányzó személyi szám (CNP)',
                    personId: m.id
                });
            }
        });

        // Hiányzó nem
        members.forEach(m => {
            if (m.ferfi === null || m.ferfi === undefined) {
                missingGender++;
                _qualityResults.push({
                    type: 'gender',
                    person: (m.csaladnev || '') + ' ' + (m.k_nev || ''),
                    congId: m.congregation_id,
                    congName: congMap[m.congregation_id] || '-',
                    detail: 'Hiányzó nem (férfi/nő)',
                    personId: m.id
                });
            }
        });

        // Hiányzó születési dátum
        members.forEach(m => {
            if (!m.sz_datum) {
                missingBirth++;
                _qualityResults.push({
                    type: 'birth',
                    person: (m.csaladnev || '') + ' ' + (m.k_nev || ''),
                    congId: m.congregation_id,
                    congName: congMap[m.congregation_id] || '-',
                    detail: 'Hiányzó születési dátum',
                    personId: m.id
                });
            }
        });

        // Hiányzó lakcím
        members.forEach(m => {
            if (!m.c_helysegid) {
                missingAddress++;
                _qualityResults.push({
                    type: 'address',
                    person: (m.csaladnev || '') + ' ' + (m.k_nev || ''),
                    congId: m.congregation_id,
                    congName: congMap[m.congregation_id] || '-',
                    detail: 'Hiányzó helység/lakcím',
                    personId: m.id
                });
            }
        });

        // Duplikátum keresés (név + születési dátum)
        const nameMap = {};
        members.forEach(m => {
            const key = ((m.csaladnev || '') + '|' + (m.k_nev || '') + '|' + (m.sz_datum || '')).toLowerCase();
            if (!nameMap[key]) nameMap[key] = [];
            nameMap[key].push(m);
        });
        Object.values(nameMap).forEach(group => {
            if (group.length > 1 && group[0].sz_datum) {
                duplicates++;
                group.forEach(m => {
                    _qualityResults.push({
                        type: 'duplicate',
                        person: (m.csaladnev || '') + ' ' + (m.k_nev || ''),
                        congId: m.congregation_id,
                        congName: congMap[m.congregation_id] || '-',
                        detail: 'Lehetséges duplikátum (' + group.length + ' egyezés, szül: ' + (m.sz_datum || '-') + ')',
                        personId: m.id
                    });
                });
            }
        });

        // Összesítő kártyák
        const setColor = (elId, val) => {
            const el = document.getElementById(elId);
            el.textContent = val;
            el.className = 'fs-2 fw-bold ' + (val > 0 ? 'text-danger' : 'text-success');
        };
        setColor('q-missing-cnp', missingCnp);
        setColor('q-missing-gender', missingGender);
        setColor('q-missing-birth', missingBirth);
        setColor('q-missing-address', missingAddress);
        setColor('q-duplicates', duplicates);

        // Eredmények renderelése
        filterQualityResults('all');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Hiba: ' + err.message + '<\/td><\/tr>';
    }
};

window.filterQualityResults = function(type, btn) {
    // Aktív gomb stílus
    if (btn) {
        document.querySelectorAll('#quality-type-filter .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const filtered = type === 'all' ? _qualityResults : _qualityResults.filter(r => r.type === type);
    const tbody = document.getElementById('quality-results-tbody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-success"><i class="ti ti-circle-check me-1"><\/i>Nincs probléma' + (type !== 'all' ? ' ebben a kategóriában' : '') + '<\/td><\/tr>';
        return;
    }

    const typeIcons = {
        cnp: 'ti-id text-danger',
        gender: 'ti-gender-bigender text-warning',
        birth: 'ti-calendar text-info',
        address: 'ti-map-pin text-primary',
        duplicate: 'ti-copy text-dark'
    };
    const typeLabels = { cnp: 'CNP', gender: 'Nem', birth: 'Szül.dátum', address: 'Lakcím', duplicate: 'Duplikátum' };

    // Max 200 sor megjelenítése a teljesítmény érdekében
    const display = filtered.slice(0, 200);

    tbody.innerHTML = display.map(r =>
        '<tr>' +
        '<td><i class="ti ' + (typeIcons[r.type] || 'ti-alert-circle') + ' me-1"><\/i><span class="badge bg-secondary-lt">' + (typeLabels[r.type] || r.type) + '<\/span><\/td>' +
        '<td class="fw-bold">' + r.person + '<\/td>' +
        '<td><span class="badge bg-indigo-lt">' + r.congName + '<\/span><\/td>' +
        '<td class="text-muted small">' + r.detail + '<\/td>' +
        '<td class="text-end"><button class="btn btn-sm btn-outline-primary" onclick="goToFixPerson(\'' + r.congId + '\', \'' + (r.congName || '').replace(/'/g, "\\'") + '\')"><i class="ti ti-external-link me-1"><\/i>Javítás<\/button><\/td>' +
        '<\/tr>'
    ).join('') +
    (filtered.length > 200 ? '<tr><td colspan="5" class="text-center text-muted py-2">...és további ' + (filtered.length - 200) + ' tétel<\/td><\/tr>' : '');
};

window.goToFixPerson = function(congId, congName) {
    if (!confirm('Belép a(z) "' + congName + '" gyülekezetbe a javításhoz?')) return;
    invalidateProfileCache();
    sessionStorage.setItem('admin_override_congregation', JSON.stringify({ id: congId, name: congName }));
    window.location.href = 'tagnyilvantartas.html';
};

// ── 7. TÁVOLI IMPORT FÜL ────────────────────────────────────

window.initRemoteImport = function() {
    // File input figyelése
    const fileInput = document.getElementById('import-file');
    const congSelect = document.getElementById('import-cong-select');
    const typeSelect = document.getElementById('import-type-select');
    const btn = document.getElementById('btn-start-import');

    const checkReady = () => {
        btn.disabled = !(fileInput.files.length > 0 && congSelect.value && typeSelect.value);
    };

    fileInput.onchange = function() {
        checkReady();
        if (fileInput.files.length > 0) previewImportFile(fileInput.files[0]);
    };
    congSelect.onchange = checkReady;
    typeSelect.onchange = checkReady;
};

async function previewImportFile(file) {
    const preview = document.getElementById('import-preview');
    preview.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"><\/div><div class="mt-2 text-muted">Fájl olvasása...<\/div><\/div>';

    try {
        // SheetJS betöltése ha még nincs
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length === 0) {
            preview.innerHTML = '<div class="alert alert-warning">A fájl üres.<\/div>';
            return;
        }

        const headers = data[0] || [];
        const rows = data.slice(1, 11); // Első 10 sor

        let html = '<div class="mb-2"><span class="badge bg-primary">' + file.name + '<\/span> — ' +
            '<span class="text-muted">' + wb.SheetNames.length + ' munkalap, ' + (data.length - 1) + ' sor, ' + headers.length + ' oszlop<\/span><\/div>';

        html += '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead class="bg-light"><tr>';
        headers.forEach(h => { html += '<th class="small">' + (h || '-') + '<\/th>'; });
        html += '<\/tr><\/thead><tbody>';
        rows.forEach(row => {
            html += '<tr>';
            headers.forEach((_, i) => { html += '<td class="small">' + (row[i] !== undefined ? row[i] : '') + '<\/td>'; });
            html += '<\/tr>';
        });
        if (data.length > 11) html += '<tr><td colspan="' + headers.length + '" class="text-center text-muted small">...és további ' + (data.length - 11) + ' sor<\/td><\/tr>';
        html += '<\/tbody><\/table><\/div>';

        preview.innerHTML = html;
        document.getElementById('import-status-badge').textContent = 'Kész az importra';
        document.getElementById('import-status-badge').className = 'badge bg-green';

    } catch (err) {
        preview.innerHTML = '<div class="alert alert-danger">Hiba a fájl olvasásakor: ' + err.message + '<\/div>';
    }
}

window.startRemoteImport = async function() {
    const congId = document.getElementById('import-cong-select')?.value;
    const importType = document.getElementById('import-type-select')?.value;
    const fileInput = document.getElementById('import-file');
    const file = fileInput?.files[0];

    if (!congId || !importType || !file) {
        alert('Kérem töltse ki az összes mezőt!');
        return;
    }

    const congName = _allCongregations.find(c => c.id === congId)?.nev_hu || 'Ismeretlen';
    if (!confirm('Importálás a(z) "' + congName + '" gyülekezetbe?\n\nTípus: ' + importType + '\nFájl: ' + file.name)) return;

    const preview = document.getElementById('import-preview');
    const statusBadge = document.getElementById('import-status-badge');
    statusBadge.textContent = 'Import folyamatban...';
    statusBadge.className = 'badge bg-warning';

    try {
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
            alert('A fájl nem tartalmaz adatokat!');
            return;
        }

        let imported = 0;
        let errors = [];
        const batchSize = 50;

        if (importType === 'tagok') {
            imported = await importMembers(data, congId, batchSize, errors);
        } else if (importType === 'befizetes') {
            imported = await importPayments(data, congId, 'befizetes', batchSize, errors);
        } else if (importType === 'kiadas') {
            imported = await importPayments(data, congId, 'kiadas', batchSize, errors);
        } else {
            alert('Ez az import típus még fejlesztés alatt áll.');
            statusBadge.textContent = 'Nem elérhető';
            statusBadge.className = 'badge bg-secondary';
            return;
        }

        // Eredmény kiírása
        let resultHtml = '<div class="alert ' + (errors.length === 0 ? 'alert-success' : 'alert-warning') + '">' +
            '<h4><i class="ti ti-check me-2"><\/i>Import befejezve<\/h4>' +
            '<div>Sikeresen importálva: <strong>' + imported + '<\/strong> rekord<\/div>';
        if (errors.length > 0) {
            resultHtml += '<div class="text-danger mt-2">Hibák: <strong>' + errors.length + '<\/strong><\/div>' +
                '<ul class="mt-1 small">' + errors.slice(0, 10).map(e => '<li>' + e + '<\/li>').join('') + '<\/ul>';
        }
        resultHtml += '<\/div>';
        preview.innerHTML = resultHtml + preview.innerHTML;

        statusBadge.textContent = 'Kész — ' + imported + ' importálva';
        statusBadge.className = 'badge bg-green';

    } catch (err) {
        alert('Import hiba: ' + err.message);
        statusBadge.textContent = 'Hiba';
        statusBadge.className = 'badge bg-red';
    }
};

async function importMembers(data, congId, batchSize, errors) {
    let imported = 0;

    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const records = [];

        batch.forEach((row, idx) => {
            try {
                const rec = {
                    congregation_id: congId,
                    csaladnev: row['Családnév'] || row['csaladnev'] || row['Név'] || '',
                    k_nev: row['Keresztnév'] || row['k_nev'] || row['Utónév'] || '',
                    cnp: row['CNP'] || row['cnp'] || row['Személyi szám'] || null,
                    ferfi: row['Nem'] === 'Férfi' || row['Nem'] === 'F' || row['ferfi'] === true || row['ferfi'] === 1 ? true :
                           row['Nem'] === 'Nő' || row['Nem'] === 'N' || row['ferfi'] === false || row['ferfi'] === 0 ? false : null,
                    sz_datum: parseExcelDate(row['Születési dátum'] || row['sz_datum'] || row['Szül.dátum']),
                    foglalkozas: row['Foglalkozás'] || row['foglalkozas'] || null,
                    telefon: row['Telefon'] || row['telefon'] || null,
                    email: row['Email'] || row['email'] || null,
                    meghalt: false,
                    isvisible: true,
                    member_status: 'aktív'
                };

                if (rec.csaladnev || rec.k_nev) records.push(rec);
                else errors.push('Sor ' + (i + idx + 2) + ': hiányzó név');
            } catch (e) {
                errors.push('Sor ' + (i + idx + 2) + ': ' + e.message);
            }
        });

        if (records.length > 0) {
            const { error } = await _admin.from('szemely').insert(records);
            if (error) errors.push('Batch hiba (sor ' + (i + 1) + '-' + (i + batch.length) + '): ' + error.message);
            else imported += records.length;
        }
    }

    return imported;
}

async function importPayments(data, congId, table, batchSize, errors) {
    let imported = 0;

    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const records = [];

        batch.forEach((row, idx) => {
            try {
                const rec = {
                    congregation_id: congId,
                    osszeg: parseFloat(row['Összeg'] || row['osszeg'] || 0),
                    datum: parseExcelDate(row['Dátum'] || row['datum']),
                    irattipus: row['Bizonylat'] || row['irattipus'] || 'Nyugta',
                    sorszam: row['Sorszám'] || row['sorszam'] || null,
                    megjegyzes: row['Megjegyzés'] || row['megjegyzes'] || null,
                    deleted: false,
                    fizetettev: new Date().getFullYear()
                };

                if (rec.osszeg && rec.datum) records.push(rec);
                else errors.push('Sor ' + (i + idx + 2) + ': hiányzó összeg vagy dátum');
            } catch (e) {
                errors.push('Sor ' + (i + idx + 2) + ': ' + e.message);
            }
        });

        if (records.length > 0) {
            const { error } = await _admin.from(table).insert(records);
            if (error) errors.push('Batch hiba: ' + error.message);
            else imported += records.length;
        }
    }

    return imported;
}

function parseExcelDate(val) {
    if (!val) return null;
    if (typeof val === 'number') {
        // Excel sorszámok (1900-01-01 = 1)
        const d = new Date((val - 25569) * 86400 * 1000);
        return d.toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
        // Próbáljuk többféle formátummal
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
}

// ── 8. SEGÉD FÜGGVÉNYEK ──────────────────────────────────────

async function signOut() {
    // Override törlése kilépéskor
    sessionStorage.removeItem('admin_override_congregation');
    await _supabase.auth.signOut();
    window.location.href = '../index.html';
}
