// ========================================
// SÍRHELYEK API — Temetői nyilvántartás
// ========================================

var _sirhelyView = 'table';
var _temetok = [];
var _sirhelyek = [];
var _berlesek = [];
var _elhunytakMap = {}; // sirhelyid → [{...}]
var _berlesekMap = {}; // sirhelyid → [{...}]

// ═══════════════════════════════════════
// TEMETŐK KEZELÉSE
// ═══════════════════════════════════════

async function loadTemetok() {
    var res = await _supabase.from('sirhelytemeto').select('*')
        .eq('congregation_id', activeCongregationId)
        .or('deleted.eq.false,deleted.is.null')
        .order('nev');
    _temetok = res.data || [];

    // Szűrő dropdown feltöltése
    var sel = document.getElementById('sh-filter-temeto');
    if (sel) {
        var html = '<option value="">Összes temető</option>';
        _temetok.forEach(function(t) {
            html += '<option value="' + t.id + '">' + _shEsc(t.nev) + '</option>';
        });
        sel.innerHTML = html;
    }
}

function openTemetoModal() {
    var modal = document.getElementById('modal-temeto');
    if (!modal) return;
    _renderTemetoList();
    new bootstrap.Modal(modal).show();
}

function _renderTemetoList() {
    var container = document.getElementById('temeto-list');
    if (!container) return;

    if (_temetok.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Még nincs temető rögzítve.</div>';
        return;
    }

    container.innerHTML = _temetok.map(function(t) {
        return '<div class="d-flex align-items-center justify-content-between p-2 border-bottom">'
            + '<div>'
            + '<div class="fw-medium">' + _shEsc(t.nev) + '</div>'
            + (t.cim ? '<div class="text-muted small">' + _shEsc(t.cim) + '</div>' : '')
            + (t.megjegyzes ? '<div class="text-muted small fst-italic">' + _shEsc(t.megjegyzes) + '</div>' : '')
            + '</div>'
            + '<div class="d-flex gap-1">'
            + '<button class="btn btn-sm btn-ghost-primary" onclick="editTemeto(' + t.id + ')" title="Szerkesztés"><i class="ti ti-pencil"></i></button>'
            + '<button class="btn btn-sm btn-ghost-danger" onclick="deleteTemeto(' + t.id + ')" title="Törlés"><i class="ti ti-trash"></i></button>'
            + '</div></div>';
    }).join('');
}

async function saveTemeto() {
    var id = document.getElementById('temeto-id').value;
    var nev = document.getElementById('temeto-nev').value.trim();
    if (!nev) { alert('A temető neve kötelező!'); return; }

    var payload = {
        nev: nev,
        cim: document.getElementById('temeto-cim').value.trim() || null,
        megjegyzes: document.getElementById('temeto-megjegyzes').value.trim() || null,
        congregation_id: activeCongregationId
    };

    var error;
    if (id) {
        var res = await _supabase.from('sirhelytemeto').update(payload).eq('id', parseInt(id));
        error = res.error;
    } else {
        var res = await _supabase.from('sirhelytemeto').insert(payload);
        error = res.error;
    }

    if (error) { alert('Hiba: ' + error.message); return; }

    // Mezők törlése
    document.getElementById('temeto-id').value = '';
    document.getElementById('temeto-nev').value = '';
    document.getElementById('temeto-cim').value = '';
    document.getElementById('temeto-megjegyzes').value = '';

    await loadTemetok();
    _renderTemetoList();
}

function editTemeto(id) {
    var t = _temetok.find(function(x) { return x.id === id; });
    if (!t) return;
    document.getElementById('temeto-id').value = t.id;
    document.getElementById('temeto-nev').value = t.nev || '';
    document.getElementById('temeto-cim').value = t.cim || '';
    document.getElementById('temeto-megjegyzes').value = t.megjegyzes || '';
}

async function deleteTemeto(id) {
    if (!confirm('Biztosan törli ezt a temetőt?')) return;
    await _supabase.from('sirhelytemeto').update({ deleted: true }).eq('id', id);
    await loadTemetok();
    _renderTemetoList();
}

// ═══════════════════════════════════════
// SÍRHELYEK BETÖLTÉSE
// ═══════════════════════════════════════

async function loadSirhelyek() {
    // Temető ID-k listája (szűréshez)
    var temetoIds = _temetok.map(function(t) { return t.id; });
    if (temetoIds.length === 0) {
        _renderEmptyState();
        return;
    }

    // Párhuzamos lekérdezések
    var shRes = await _supabase.from('sirhely').select('*')
        .in('temetoid', temetoIds)
        .or('deleted.eq.false,deleted.is.null')
        .order('parcella').order('sor').order('szam');

    _sirhelyek = shRes.data || [];

    // Bérlések és elhunytok betöltése
    var sirhelyIds = _sirhelyek.map(function(s) { return s.id; });
    if (sirhelyIds.length > 0) {
        var berlesRes = await _supabase.from('sirhelyberles').select('*')
            .in('sirhelyid', sirhelyIds)
            .or('deleted.eq.false,deleted.is.null')
            .order('megvaltas', { ascending: false });

        var elhunytRes = await _supabase.from('sirhelyelhunyt').select('*')
            .in('sirhelyid', sirhelyIds)
            .or('deleted.eq.false,deleted.is.null');

        _berlesek = berlesRes.data || [];
        _elhunytakMap = {};
        _berlesekMap = {};

        (elhunytRes.data || []).forEach(function(e) {
            if (!_elhunytakMap[e.sirhelyid]) _elhunytakMap[e.sirhelyid] = [];
            _elhunytakMap[e.sirhelyid].push(e);
        });

        _berlesek.forEach(function(b) {
            if (!_berlesekMap[b.sirhelyid]) _berlesekMap[b.sirhelyid] = [];
            _berlesekMap[b.sirhelyid].push(b);
        });
    }

    // Szűrés alkalmazása
    var filtered = _applyFilters(_sirhelyek);

    // Statisztika frissítés
    _updateSirhelyStats(filtered);

    // Megjelenítés
    if (_sirhelyView === 'table') {
        _renderSirhelyTable(filtered);
    } else {
        _renderSirhelyCards(filtered);
    }
}

function _applyFilters(data) {
    var temetoFilter = document.getElementById('sh-filter-temeto') ? document.getElementById('sh-filter-temeto').value : '';
    var allapotFilter = document.getElementById('sh-filter-allapot') ? document.getElementById('sh-filter-allapot').value : '';
    var searchVal = document.getElementById('sh-search') ? document.getElementById('sh-search').value.trim().toLowerCase() : '';

    return data.filter(function(s) {
        if (temetoFilter && String(s.temetoid) !== String(temetoFilter)) return false;
        if (allapotFilter && s.allapot !== allapotFilter) return false;
        if (searchVal) {
            var temetoNev = _getTemetoNev(s.temetoid).toLowerCase();
            var elhunytNevek = (_elhunytakMap[s.id] || []).map(function(e) { return (e.nev || '').toLowerCase(); }).join(' ');
            var berloNevek = (_berlesekMap[s.id] || []).map(function(b) { return (b.berlo || '').toLowerCase(); }).join(' ');
            var combined = temetoNev + ' ' + (s.parcella || '') + ' ' + (s.szam || '') + ' ' + elhunytNevek + ' ' + berloNevek + ' ' + (s.megjegyzes || '');
            if (combined.toLowerCase().indexOf(searchVal) < 0) return false;
        }
        return true;
    });
}

function _updateSirhelyStats(data) {
    var total = data.length;
    var szabad = 0, foglalt = 0, lejart = 0;
    data.forEach(function(s) {
        if (s.allapot === 'szabad') szabad++;
        else if (s.allapot === 'foglalt') foglalt++;
        else if (s.allapot === 'lejart') lejart++;
    });

    var el = document.getElementById('sh-stat-total');
    if (el) el.textContent = total + ' sírhely';
    el = document.getElementById('sh-stat-szabad');
    if (el) el.textContent = szabad + ' szabad';
    el = document.getElementById('sh-stat-foglalt');
    if (el) el.textContent = foglalt + ' foglalt';
    el = document.getElementById('sh-stat-lejart');
    if (el) el.textContent = lejart + ' lejárt';
}

// ═══════════════════════════════════════
// TÁBLÁZAT NÉZET
// ═══════════════════════════════════════

function _renderSirhelyTable(data) {
    var tbody = document.getElementById('sh-tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="ti ti-cross-off me-2"></i>Nincs találat.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(function(s) {
        var temetoNev = _getTemetoNev(s.temetoid);
        var allapotBadge = _allapotBadge(s.allapot);
        var tipusTxt = s.tipus || '-';

        // Bérlő / Elhunyt
        var elhunytList = _elhunytakMap[s.id] || [];
        var berlesList = _berlesekMap[s.id] || [];
        var personHtml = '';
        if (elhunytList.length > 0) {
            personHtml = elhunytList.map(function(e) {
                var tdatum = e.tdatum ? ' (' + new Date(e.tdatum).getFullYear() + ')' : '';
                return '<div class="small"><i class="ti ti-cross text-muted me-1"></i>' + _shEsc(e.nev || 'Ismeretlen') + tdatum + '</div>';
            }).join('');
        }
        if (berlesList.length > 0 && berlesList[0].berlo) {
            personHtml += '<div class="small text-blue"><i class="ti ti-user me-1"></i>' + _shEsc(berlesList[0].berlo) + '</div>';
        }
        if (!personHtml) personHtml = '<span class="text-muted small">—</span>';

        // Lejárat
        var lejaratHtml = '-';
        if (berlesList.length > 0 && berlesList[0].lejarata) {
            var lejDatum = new Date(berlesList[0].lejarata);
            var now = new Date();
            var lejStr = lejDatum.toLocaleDateString('hu-HU');
            if (lejDatum < now) {
                lejaratHtml = '<span class="text-danger fw-bold">' + lejStr + '</span>';
            } else {
                var diffDays = Math.round((lejDatum - now) / 86400000);
                if (diffDays < 365) {
                    lejaratHtml = '<span class="text-warning">' + lejStr + '</span>';
                } else {
                    lejaratHtml = lejStr;
                }
            }
        }

        return '<tr class="sirhely-card" onclick="openSirhelyModal(' + s.id + ')">'
            + '<td class="small">' + _shEsc(temetoNev) + '</td>'
            + '<td class="fw-bold">' + _shEsc(s.parcella) + ' / ' + s.sor + ' / ' + _shEsc(s.szam) + '</td>'
            + '<td class="small">' + _shEsc(tipusTxt) + '</td>'
            + '<td>' + allapotBadge + '</td>'
            + '<td>' + personHtml + '</td>'
            + '<td class="small">' + lejaratHtml + '</td>'
            + '<td class="d-print-none"><button class="btn btn-sm btn-ghost-secondary" onclick="event.stopPropagation();openSirhelyModal(' + s.id + ')"><i class="ti ti-eye"></i></button></td>'
            + '</tr>';
    }).join('');
}

// ═══════════════════════════════════════
// KÁRTYA NÉZET
// ═══════════════════════════════════════

function _renderSirhelyCards(data) {
    var container = document.getElementById('sh-cards-container');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-4"><i class="ti ti-cross-off me-2"></i>Nincs találat.</div>';
        return;
    }

    container.innerHTML = data.map(function(s) {
        var temetoNev = _getTemetoNev(s.temetoid);
        var allapotBadge = _allapotBadge(s.allapot);
        var elhunytList = _elhunytakMap[s.id] || [];
        var berlesList = _berlesekMap[s.id] || [];

        var elhunytHtml = elhunytList.map(function(e) {
            return '<div class="small"><i class="ti ti-cross text-muted me-1"></i>' + _shEsc(e.nev || 'Ismeretlen') + '</div>';
        }).join('');

        var berloHtml = (berlesList.length > 0 && berlesList[0].berlo)
            ? '<div class="small text-blue"><i class="ti ti-user me-1"></i>' + _shEsc(berlesList[0].berlo) + '</div>'
            : '';

        return '<div class="col-md-4 col-lg-3">'
            + '<div class="card sirhely-card status-' + (s.allapot || 'szabad') + '" onclick="openSirhelyModal(' + s.id + ')">'
            + '<div class="card-body p-3">'
            + '<div class="d-flex justify-content-between align-items-start mb-2">'
            + '<div class="fw-bold">' + _shEsc(s.parcella) + '/' + s.sor + '/' + _shEsc(s.szam) + '</div>'
            + allapotBadge
            + '</div>'
            + '<div class="text-muted small mb-1">' + _shEsc(temetoNev) + '</div>'
            + (s.tipus ? '<div class="text-muted small mb-1">' + _shEsc(s.tipus) + '</div>' : '')
            + elhunytHtml + berloHtml
            + '</div></div></div>';
    }).join('');
}

function _renderEmptyState() {
    var tbody = document.getElementById('sh-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">'
            + '<div class="text-muted mb-2"><i class="ti ti-map-pin-off" style="font-size:2rem;"></i></div>'
            + '<div class="text-muted mb-2">Még nincs temető rögzítve.</div>'
            + '<button class="btn btn-outline-primary btn-sm" onclick="openTemetoModal()"><i class="ti ti-plus me-1"></i>Temető hozzáadása</button>'
            + '</td></tr>';
    }
}

// ═══════════════════════════════════════
// NÉZET VÁLTÁS
// ═══════════════════════════════════════

function setSirhelyView(view) {
    _sirhelyView = view;
    var tableView = document.getElementById('sh-table-view');
    var cardsView = document.getElementById('sh-cards-view');
    if (view === 'table') {
        if (tableView) tableView.classList.remove('d-none');
        if (cardsView) cardsView.classList.add('d-none');
    } else {
        if (tableView) tableView.classList.add('d-none');
        if (cardsView) cardsView.classList.remove('d-none');
    }
    loadSirhelyek();
}

// ═══════════════════════════════════════
// SÍRHELY MODAL
// ═══════════════════════════════════════

function openSirhelyModal(sirhelyId) {
    var modal = document.getElementById('modal-sirhely');
    if (!modal) return;

    // Temető dropdown feltöltés
    var temetoSel = document.getElementById('sh-temetoid');
    if (temetoSel) {
        temetoSel.innerHTML = _temetok.map(function(t) {
            return '<option value="' + t.id + '">' + _shEsc(t.nev) + '</option>';
        }).join('');
    }

    var titleEl = document.getElementById('sirhely-modal-title');
    var deleteBtn = document.getElementById('sh-delete-btn');

    if (sirhelyId) {
        var s = _sirhelyek.find(function(x) { return x.id === sirhelyId; });
        if (!s) return;

        document.getElementById('sh-id').value = s.id;
        if (temetoSel) temetoSel.value = s.temetoid;
        document.getElementById('sh-parcella').value = s.parcella || '';
        document.getElementById('sh-sor').value = s.sor || '';
        document.getElementById('sh-szam').value = s.szam || '';
        document.getElementById('sh-tipus').value = s.tipus || '';
        document.getElementById('sh-meret').value = s.meret || '';
        document.getElementById('sh-allapot').value = s.allapot || 'szabad';
        document.getElementById('sh-megjegyzes').value = s.megjegyzes || '';

        if (titleEl) titleEl.innerHTML = '<i class="ti ti-pencil me-2"></i>Sírhely: ' + s.parcella + '/' + s.sor + '/' + s.szam;
        if (deleteBtn) deleteBtn.classList.remove('d-none');

        // Bérlések és elhunytok megjelenítése
        _renderSirhelyBerlesek(sirhelyId);
        _renderSirhelyElhunytok(sirhelyId);
    } else {
        document.getElementById('sh-id').value = '';
        document.getElementById('sh-parcella').value = '';
        document.getElementById('sh-sor').value = '';
        document.getElementById('sh-szam').value = '';
        document.getElementById('sh-tipus').value = '';
        document.getElementById('sh-meret').value = '';
        document.getElementById('sh-allapot').value = 'szabad';
        document.getElementById('sh-megjegyzes').value = '';

        if (titleEl) titleEl.innerHTML = '<i class="ti ti-plus me-2"></i>Új sírhely';
        if (deleteBtn) deleteBtn.classList.add('d-none');

        var berlesDiv = document.getElementById('sh-berlesek-list');
        if (berlesDiv) berlesDiv.innerHTML = '<div class="text-muted small">Mentés után adhat hozzá bérléseket.</div>';
        var elhunytDiv = document.getElementById('sh-elhunytok-list');
        if (elhunytDiv) elhunytDiv.innerHTML = '<div class="text-muted small">Mentés után adhat hozzá elhunytakat.</div>';
    }

    new bootstrap.Modal(modal).show();
}

async function saveSirhely(event) {
    if (event) event.preventDefault();

    var id = document.getElementById('sh-id').value;
    var payload = {
        temetoid:    parseInt(document.getElementById('sh-temetoid').value),
        parcella:    document.getElementById('sh-parcella').value.trim(),
        sor:         parseInt(document.getElementById('sh-sor').value) || 0,
        szam:        document.getElementById('sh-szam').value.trim(),
        tipus:       document.getElementById('sh-tipus').value || null,
        meret:       document.getElementById('sh-meret').value.trim() || null,
        allapot:     document.getElementById('sh-allapot').value || 'szabad',
        megjegyzes:  document.getElementById('sh-megjegyzes').value.trim() || null
    };

    if (!payload.parcella || !payload.szam) {
        alert('A parcella és szám mezők kötelezőek!');
        return;
    }

    var error;
    if (id) {
        var res = await _supabase.from('sirhely').update(payload).eq('id', parseInt(id));
        error = res.error;
    } else {
        var res = await _supabase.from('sirhely').insert(payload).select();
        error = res.error;
        if (!error && res.data && res.data[0]) {
            document.getElementById('sh-id').value = res.data[0].id;
        }
    }

    if (error) { alert('Hiba: ' + error.message); return; }

    bootstrap.Modal.getInstance(document.getElementById('modal-sirhely'))?.hide();
    await loadSirhelyek();
}

async function deleteSirhely() {
    var id = document.getElementById('sh-id').value;
    if (!id) return;
    if (!confirm('Biztosan törli ezt a sírhelyet?')) return;

    await _supabase.from('sirhely').update({ deleted: true }).eq('id', parseInt(id));
    bootstrap.Modal.getInstance(document.getElementById('modal-sirhely'))?.hide();
    await loadSirhelyek();
}

// ═══════════════════════════════════════
// BÉRLÉSEK KEZELÉSE (sírhely modalon belül)
// ═══════════════════════════════════════

function _renderSirhelyBerlesek(sirhelyId) {
    var container = document.getElementById('sh-berlesek-list');
    if (!container) return;

    var berlesek = _berlesekMap[sirhelyId] || [];
    if (berlesek.length === 0) {
        container.innerHTML = '<div class="text-muted small">Nincs bérlés rögzítve.</div>';
        return;
    }

    container.innerHTML = berlesek.map(function(b) {
        var megvStr = b.megvaltas ? new Date(b.megvaltas).toLocaleDateString('hu-HU') : '-';
        var lejStr = b.lejarata ? new Date(b.lejarata).toLocaleDateString('hu-HU') : 'határozatlan';
        var now = new Date();
        var lejClass = '';
        if (b.lejarata && new Date(b.lejarata) < now) lejClass = 'text-danger fw-bold';

        return '<div class="d-flex align-items-center justify-content-between p-2 border-bottom">'
            + '<div>'
            + '<div class="fw-medium">' + _shEsc(b.berlo || 'Ismeretlen bérlő') + '</div>'
            + '<div class="small text-muted">' + megvStr + ' → <span class="' + lejClass + '">' + lejStr + '</span></div>'
            + (b.osszeg ? '<div class="small text-success">' + Number(b.osszeg).toLocaleString('hu') + ' RON</div>' : '')
            + '</div>'
            + '<button class="btn btn-sm btn-ghost-danger" onclick="deleteBerles(' + b.id + ',' + sirhelyId + ')"><i class="ti ti-trash"></i></button>'
            + '</div>';
    }).join('');
}

function openBerlesModal(sirhelyId) {
    var shId = sirhelyId || document.getElementById('sh-id').value;
    if (!shId) { alert('Először mentse a sírhelyet!'); return; }

    document.getElementById('berles-sirhelyid').value = shId;
    document.getElementById('berles-id').value = '';
    document.getElementById('berles-berlo').value = '';
    document.getElementById('berles-berloid').value = '';
    document.getElementById('berles-berlocim').value = '';
    document.getElementById('berles-berloelerhetoseg').value = '';
    document.getElementById('berles-megvaltas').value = new Date().toISOString().split('T')[0];
    document.getElementById('berles-lejarata').value = '';
    document.getElementById('berles-tipus').value = 'berles';
    document.getElementById('berles-osszeg').value = '';
    document.getElementById('berles-megjegyzes').value = '';

    // Lejárat automatikus: +25 év (szokásos)
    var lej = new Date();
    lej.setFullYear(lej.getFullYear() + 25);
    document.getElementById('berles-lejarata').value = lej.toISOString().split('T')[0];

    new bootstrap.Modal(document.getElementById('modal-berles')).show();
}

async function saveBerles(event) {
    if (event) event.preventDefault();
    var sirhelyId = parseInt(document.getElementById('berles-sirhelyid').value);
    var id = document.getElementById('berles-id').value;

    var payload = {
        sirhelyid:         sirhelyId,
        berlo:             document.getElementById('berles-berlo').value.trim(),
        berloid:           parseInt(document.getElementById('berles-berloid').value) || null,
        berlocim:          document.getElementById('berles-berlocim').value.trim() || null,
        berloelerhetoseg:  document.getElementById('berles-berloelerhetoseg').value.trim() || null,
        megvaltas:         document.getElementById('berles-megvaltas').value,
        lejarata:          document.getElementById('berles-lejarata').value || null,
        tipus:             document.getElementById('berles-tipus').value || 'berles',
        osszeg:            parseFloat(document.getElementById('berles-osszeg').value) || null,
        megjegyzes:        document.getElementById('berles-megjegyzes').value.trim() || null,
        befizetesid:       1 // placeholder — valós befizetés ID-t kell majd összekapcsolni
    };

    if (!payload.berlo || !payload.megvaltas) {
        alert('A bérlő neve és a megváltás dátuma kötelező!');
        return;
    }

    var error;
    if (id) {
        var res = await _supabase.from('sirhelyberles').update(payload).eq('id', parseInt(id));
        error = res.error;
    } else {
        var res = await _supabase.from('sirhelyberles').insert(payload);
        error = res.error;
    }

    if (error) { alert('Hiba: ' + error.message); return; }

    // Sírhely állapot frissítés → foglalt
    await _supabase.from('sirhely').update({ allapot: 'foglalt', aktivberlesid: null }).eq('id', sirhelyId);

    bootstrap.Modal.getInstance(document.getElementById('modal-berles'))?.hide();
    await loadSirhelyek();

    // Sírhely modal frissítés
    var shModal = document.getElementById('modal-sirhely');
    if (shModal && shModal.classList.contains('show')) {
        _renderSirhelyBerlesek(sirhelyId);
    }
}

async function deleteBerles(berlesId, sirhelyId) {
    if (!confirm('Biztosan törli ezt a bérlést?')) return;
    await _supabase.from('sirhelyberles').update({ deleted: true }).eq('id', berlesId);
    await loadSirhelyek();
    _renderSirhelyBerlesek(sirhelyId);
}

// ═══════════════════════════════════════
// ELHUNYTOK KEZELÉSE (sírhely modalon belül)
// ═══════════════════════════════════════

function _renderSirhelyElhunytok(sirhelyId) {
    var container = document.getElementById('sh-elhunytok-list');
    if (!container) return;

    var elhunytok = _elhunytakMap[sirhelyId] || [];
    if (elhunytok.length === 0) {
        container.innerHTML = '<div class="text-muted small">Nincs elhunyt rögzítve.</div>';
        return;
    }

    container.innerHTML = elhunytok.map(function(e) {
        var szDatum = e.sz_datum ? new Date(e.sz_datum).toLocaleDateString('hu-HU') : '?';
        var hDatum = e.hdatum ? new Date(e.hdatum).toLocaleDateString('hu-HU') : '?';
        var tDatum = e.tdatum ? new Date(e.tdatum).toLocaleDateString('hu-HU') : '';

        return '<div class="d-flex align-items-center justify-content-between p-2 border-bottom">'
            + '<div>'
            + '<div class="fw-medium"><i class="ti ti-cross text-muted me-1"></i>' + _shEsc(e.nev || 'Ismeretlen') + (e.sznev ? ' (sz. ' + _shEsc(e.sznev) + ')' : '') + '</div>'
            + '<div class="small text-muted">* ' + szDatum + ' — † ' + hDatum + (tDatum ? ' — temetés: ' + tDatum : '') + '</div>'
            + (e.ttipus ? '<div class="small text-muted">' + _shEsc(e.ttipus) + (e.tmodja ? ', ' + _shEsc(e.tmodja) : '') + '</div>' : '')
            + '</div>'
            + '<button class="btn btn-sm btn-ghost-danger" onclick="deleteElhunyt(' + e.id + ',' + sirhelyId + ')"><i class="ti ti-trash"></i></button>'
            + '</div>';
    }).join('');
}

function openElhunytModal(sirhelyId) {
    var shId = sirhelyId || document.getElementById('sh-id').value;
    if (!shId) { alert('Először mentse a sírhelyet!'); return; }

    document.getElementById('elhunyt-sirhelyid').value = shId;
    document.getElementById('elhunyt-id').value = '';
    document.getElementById('elhunyt-nev').value = '';
    document.getElementById('elhunyt-sznev').value = '';
    document.getElementById('elhunyt-anyjaneve').value = '';
    document.getElementById('elhunyt-ferfi').value = 'true';
    document.getElementById('elhunyt-sz-datum').value = '';
    document.getElementById('elhunyt-sz-hely').value = '';
    document.getElementById('elhunyt-hdatum').value = '';
    document.getElementById('elhunyt-hhely').value = '';
    document.getElementById('elhunyt-tdatum').value = '';
    document.getElementById('elhunyt-ttipus').value = '';
    document.getElementById('elhunyt-tmodja').value = '';
    document.getElementById('elhunyt-temetteto').value = '';
    document.getElementById('elhunyt-szolgaltato').value = '';
    document.getElementById('elhunyt-megjegyzes').value = '';

    new bootstrap.Modal(document.getElementById('modal-elhunyt')).show();
}

async function saveElhunyt(event) {
    if (event) event.preventDefault();
    var sirhelyId = parseInt(document.getElementById('elhunyt-sirhelyid').value);
    var id = document.getElementById('elhunyt-id').value;

    var payload = {
        sirhelyid:     sirhelyId,
        nev:           document.getElementById('elhunyt-nev').value.trim(),
        sznev:         document.getElementById('elhunyt-sznev').value.trim() || null,
        anyjaneve:     document.getElementById('elhunyt-anyjaneve').value.trim() || null,
        ferfi:         document.getElementById('elhunyt-ferfi').value === 'true',
        sz_datum:      document.getElementById('elhunyt-sz-datum').value || null,
        sz_hely:       document.getElementById('elhunyt-sz-hely').value.trim() || null,
        hdatum:        document.getElementById('elhunyt-hdatum').value || null,
        hhely:         document.getElementById('elhunyt-hhely').value.trim() || null,
        tdatum:        document.getElementById('elhunyt-tdatum').value || null,
        ttipus:        document.getElementById('elhunyt-ttipus').value || null,
        tmodja:        document.getElementById('elhunyt-tmodja').value || null,
        temetteto:     document.getElementById('elhunyt-temetteto').value.trim() || null,
        szolgaltato:   document.getElementById('elhunyt-szolgaltato').value.trim() || null,
        megjegyzes:    document.getElementById('elhunyt-megjegyzes').value.trim() || null,
        temetesid:     1 // placeholder — ha van temetes rekord, összekapcsoljuk
    };

    if (!payload.nev) {
        alert('Az elhunyt neve kötelező!');
        return;
    }

    var error;
    if (id) {
        var res = await _supabase.from('sirhelyelhunyt').update(payload).eq('id', parseInt(id));
        error = res.error;
    } else {
        var res = await _supabase.from('sirhelyelhunyt').insert(payload);
        error = res.error;
    }

    if (error) { alert('Hiba: ' + error.message); return; }

    // Sírhely állapot → foglalt
    await _supabase.from('sirhely').update({ allapot: 'foglalt' }).eq('id', sirhelyId);

    bootstrap.Modal.getInstance(document.getElementById('modal-elhunyt'))?.hide();
    await loadSirhelyek();

    var shModal = document.getElementById('modal-sirhely');
    if (shModal && shModal.classList.contains('show')) {
        _renderSirhelyElhunytok(sirhelyId);
    }
}

async function deleteElhunyt(elhunytId, sirhelyId) {
    if (!confirm('Biztosan törli ezt a bejegyzést?')) return;
    await _supabase.from('sirhelyelhunyt').update({ deleted: true }).eq('id', elhunytId);
    await loadSirhelyek();
    _renderSirhelyElhunytok(sirhelyId);
}

// ═══════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════

function exportSirhelyek() {
    var filtered = _applyFilters(_sirhelyek);
    var csv = 'Temető;Parcella;Sor;Szám;Típus;Állapot;Méret;Elhunyt;Bérlő;Bérlés kezdete;Lejárat;Megjegyzés\n';

    filtered.forEach(function(s) {
        var temetoNev = _getTemetoNev(s.temetoid);
        var elhunytList = (_elhunytakMap[s.id] || []).map(function(e) { return e.nev || ''; }).join(', ');
        var berlesList = _berlesekMap[s.id] || [];
        var berlo = berlesList.length > 0 ? (berlesList[0].berlo || '') : '';
        var megv = berlesList.length > 0 ? (berlesList[0].megvaltas || '') : '';
        var lej = berlesList.length > 0 ? (berlesList[0].lejarata || '') : '';

        csv += [temetoNev, s.parcella, s.sor, s.szam, s.tipus || '', s.allapot || '', s.meret || '',
                elhunytList, berlo, megv, lej, (s.megjegyzes || '').replace(/;/g, ',')]
            .map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';') + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sirhelyek_export_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
}

// ═══════════════════════════════════════
// SEGÉD FÜGGVÉNYEK
// ═══════════════════════════════════════

function _getTemetoNev(temetoId) {
    var t = _temetok.find(function(x) { return x.id === temetoId; });
    return t ? t.nev : 'Ismeretlen';
}

function _allapotBadge(allapot) {
    var map = {
        'szabad':      '<span class="badge bg-green-lt text-green">Szabad</span>',
        'foglalt':     '<span class="badge bg-blue-lt text-blue">Foglalt</span>',
        'lejart':      '<span class="badge bg-orange-lt text-orange">Lejárt</span>',
        'zart':        '<span class="badge bg-red-lt text-red">Zárt</span>',
        'fenntartott': '<span class="badge bg-purple-lt text-purple">Fenntartott</span>'
    };
    return map[allapot] || '<span class="badge bg-secondary-lt">Ismeretlen</span>';
}

function _shEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
