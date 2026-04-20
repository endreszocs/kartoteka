// ═══════════════════════════════════════════════════════════════════════════
// Missziós Műhely — Ötletek modul
// Ötlet CRUD, szavazás, hozzászólás, közös munka workspace
// Szavazási határidők kezelése, feladatok, mérföldkövek, dokumentumok
// ═══════════════════════════════════════════════════════════════════════════

var MmOtletek = (function() {
    'use strict';

    var _user = null;
    var _kategoriak = [];
    var _otletek = [];
    var _filteredOtletek = [];
    var _selectedOtletKat = '';
    var _selectedStatusz = '';
    var _wizardStep = 1;
    var _currentKmOtletId = null;  // aktuális közös munka ötlet ID

    // ══════════════════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════════════════

    async function init(user, kategoriak) {
        _user = user;
        _kategoriak = kategoriak;
        _renderOtletKategoriaChips();
        await loadOtletek();
        await checkSzavazasDeadlines();
    }

    // ── Kategória chip-ek ──
    function _renderOtletKategoriaChips() {
        var container = document.getElementById('mm-otlet-kategoriak');
        if (!container) return;

        var html = '<span class="mm-chip active" data-kat-id="" onclick="MmOtletek.selectOtletKategoria(this)"><i class="ti ti-apps"></i> Mind</span>';
        _kategoriak.forEach(function(k) {
            html += '<span class="mm-chip" data-kat-id="' + k.id + '" onclick="MmOtletek.selectOtletKategoria(this)">' +
                '<i class="' + k.ikon + '"></i> ' + k.nev + '</span>';
        });
        container.innerHTML = html;

        // Ötlet modal kategória választó
        var katSelect = document.getElementById('mm-otlet-kat-select');
        if (katSelect) {
            var html2 = '';
            _kategoriak.forEach(function(k) {
                html2 += '<label class="form-check form-check-inline">' +
                    '<input class="form-check-input" type="checkbox" value="' + k.id + '" name="mm-otlet-kat">' +
                    '<span class="form-check-label"><i class="' + k.ikon + ' me-1" style="color:' + k.szin + '"></i>' + k.nev + '</span>' +
                    '</label>';
            });
            katSelect.innerHTML = html2;
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÖTLET BETÖLTÉS ÉS RENDERELÉS
    // ══════════════════════════════════════════════════════════════════════

    async function loadOtletek() {
        var { data, error } = await window._supabase
            .from('mm_otletek')
            .select('*, mm_otlet_kategoriak(kategoria_id)')
            .eq('aktiv', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ötletek betöltési hiba:', error);
            return;
        }
        _otletek = data || [];
        _filteredOtletek = _otletek.slice();
        _renderOtletGrid();
        _updateOtletTabCount();
    }

    function _renderOtletGrid() {
        var grid = document.getElementById('mm-otlet-grid');
        var empty = document.getElementById('mm-otlet-empty');
        var talalat = document.getElementById('mm-otlet-talalat');

        if (!grid) return;

        if (_filteredOtletek.length === 0) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('d-none');
            if (talalat) talalat.textContent = '0 ötlet';
            return;
        }

        if (empty) empty.classList.add('d-none');
        if (talalat) talalat.textContent = _filteredOtletek.length + ' ötlet';

        var html = '';
        _filteredOtletek.forEach(function(o) {
            var statuszBadge = _getStatuszBadge(o.statusz);
            var katBadges = MmApi.getKategoriaBadges(o.mm_otlet_kategoriak);
            var datum = MmApi.formatDate(o.created_at);
            var hataridoInfo = _getSzavazasHataridoInfo(o);

            html += '<div class="col-12 col-md-6 col-lg-4">' +
                '<div class="card mm-card h-100" onclick="MmOtletek.openOtletDetail(\'' + o.id + '\')">' +
                '<div class="card-body">' +
                '<div class="d-flex justify-content-between align-items-start mb-2">' +
                statuszBadge +
                '<span class="text-muted small">' + datum + '</span>' +
                '</div>' +
                '<h3 class="card-title mb-1" style="font-size:0.95rem;">' + MmApi.escHtml(o.cim) + '</h3>' +
                '<p class="text-muted small mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
                    MmApi.escHtml(o.leiras) + '</p>' +
                '<div class="mb-2">' + katBadges + '</div>' +
                '<div class="d-flex justify-content-between align-items-center small">' +
                '<span class="text-muted"><i class="ti ti-user me-1"></i>' + MmApi.escHtml(o.otletgazda_nev || '') + '</span>' +
                '<div class="d-flex gap-3">' +
                '<span class="text-primary"><i class="ti ti-thumb-up me-1"></i>' + (o.tamogatasok_szama || 0) + '</span>' +
                '<span class="text-success"><i class="ti ti-users me-1"></i>' + (o.csatlakozok_szama || 0) + '</span>' +
                '<span class="text-muted"><i class="ti ti-message me-1"></i>' + (o.hozzaszolasok_szama || 0) + '</span>' +
                '</div></div>' +
                (hataridoInfo ? '<div class="mt-2 small ' + hataridoInfo.class + '">' + hataridoInfo.text + '</div>' : '') +
                '</div></div></div>';
        });
        grid.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÖTLET WIZARD (3 lépéses)
    // ══════════════════════════════════════════════════════════════════════

    function openOtletModal() {
        _wizardStep = 1;
        _updateWizardUI();

        var form = document.getElementById('mm-otlet-form');
        if (form) form.reset();
        document.getElementById('mm-otlet-edit-id').value = '';

        var modal = new bootstrap.Modal(document.getElementById('modal-mm-otlet'));
        modal.show();
    }

    function wizardNext() {
        if (_wizardStep === 1) {
            // Validálás
            var cim = document.getElementById('mm-otlet-cim').value.trim();
            var leiras = document.getElementById('mm-otlet-leiras').value.trim();
            var selectedKats = document.querySelectorAll('input[name="mm-otlet-kat"]:checked');
            if (!cim) { alert('Az ötlet címe kötelező!'); return; }
            if (!leiras) { alert('A leírás megadása kötelező!'); return; }
            if (selectedKats.length === 0) { alert('Legalább egy kategória kiválasztása kötelező!'); return; }
            _wizardStep = 2;
        } else if (_wizardStep === 2) {
            _wizardStep = 3;
            _renderOtletPreview();
        }
        _updateWizardUI();
    }

    function wizardPrev() {
        if (_wizardStep > 1) _wizardStep--;
        _updateWizardUI();
    }

    function _updateWizardUI() {
        // Lépések elrejtése/megjelenítése
        document.getElementById('mm-otlet-wizard-1').classList.toggle('d-none', _wizardStep !== 1);
        document.getElementById('mm-otlet-wizard-2').classList.toggle('d-none', _wizardStep !== 2);
        document.getElementById('mm-otlet-wizard-3').classList.toggle('d-none', _wizardStep !== 3);

        // Lépés indikátorok
        for (var i = 1; i <= 3; i++) {
            var badge = document.getElementById('mm-otlet-step-' + i);
            if (badge) {
                badge.className = i <= _wizardStep ? 'badge bg-primary rounded-circle p-2' : 'badge bg-muted rounded-circle p-2';
            }
        }

        // Gombok
        document.getElementById('btn-mm-otlet-prev').classList.toggle('d-none', _wizardStep === 1);
        document.getElementById('btn-mm-otlet-next').classList.toggle('d-none', _wizardStep === 3);
        document.getElementById('btn-mm-otlet-submit').classList.toggle('d-none', _wizardStep !== 3);
    }

    function _renderOtletPreview() {
        var preview = document.getElementById('mm-otlet-preview');
        if (!preview) return;

        var cim = document.getElementById('mm-otlet-cim').value;
        var leiras = document.getElementById('mm-otlet-leiras').value;
        var celcsoport = document.getElementById('mm-otlet-celcsoport').value;
        var becsultIdo = document.getElementById('mm-otlet-becsult-ido').value;
        var cimkek = document.getElementById('mm-otlet-cimkek').value;

        var selectedKats = [];
        document.querySelectorAll('input[name="mm-otlet-kat"]:checked').forEach(function(cb) {
            var kat = _kategoriak.find(function(k) { return k.id === parseInt(cb.value); });
            if (kat) selectedKats.push(kat);
        });

        var katHtml = selectedKats.map(function(k) {
            return '<span class="badge me-1" style="background:' + k.szin + '"><i class="' + k.ikon + ' me-1"></i>' + k.nev + '</span>';
        }).join('');

        var cimkeHtml = '';
        if (cimkek) {
            cimkeHtml = cimkek.split(',').map(function(c) {
                return '<span class="badge bg-secondary me-1">' + MmApi.escHtml(c.trim()) + '</span>';
            }).join('');
        }

        preview.innerHTML = '<div class="card-body">' +
            '<h3>' + MmApi.escHtml(cim) + '</h3>' +
            '<p>' + MmApi.escHtml(leiras) + '</p>' +
            '<div class="mb-2">' + katHtml + '</div>' +
            '<div class="d-flex gap-3 text-muted small">' +
            '<span><i class="ti ti-users me-1"></i>Célcsoport: ' + celcsoport + '</span>' +
            '<span><i class="ti ti-clock me-1"></i>Becsült idő: ' + becsultIdo + '</span>' +
            '</div>' +
            (cimkeHtml ? '<div class="mt-2">' + cimkeHtml + '</div>' : '') +
            '</div>';
    }

    // ── Ötlet beküldése ──
    async function handleOtletSubmit() {
        var btn = document.getElementById('btn-mm-otlet-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="ti ti-loader-2 ti-spin me-2"></i>Beküldés...';

        try {
            var cim = document.getElementById('mm-otlet-cim').value.trim();
            var leiras = document.getElementById('mm-otlet-leiras').value.trim();
            var celcsoport = document.getElementById('mm-otlet-celcsoport').value;
            var becsultIdo = document.getElementById('mm-otlet-becsult-ido').value;
            var cimkek = document.getElementById('mm-otlet-cimkek').value.trim();

            var selectedKats = [];
            document.querySelectorAll('input[name="mm-otlet-kat"]:checked').forEach(function(cb) {
                selectedKats.push(parseInt(cb.value));
            });

            // Fájl feltöltés
            var csatolmanyUrl = null;
            var fileInput = document.getElementById('mm-otlet-fajl');
            if (fileInput && fileInput.files.length > 0) {
                var file = fileInput.files[0];
                if (file.size > 20 * 1024 * 1024) {
                    alert('A fájl mérete nem haladhatja meg a 20 MB-ot!');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ti ti-send me-2"></i>Ötlet beküldése';
                    return;
                }
                var filePath = 'otletek/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                var { error: uploadError } = await window._supabase.storage
                    .from('misszios-muhely')
                    .upload(filePath, file);
                if (uploadError) throw uploadError;
                var { data: urlData } = window._supabase.storage.from('misszios-muhely').getPublicUrl(filePath);
                csatolmanyUrl = urlData.publicUrl;
            }

            var now = new Date();
            var vege = new Date(now);
            vege.setDate(vege.getDate() + 30);

            var payload = {
                cim: cim,
                leiras: leiras,
                celcsoport: celcsoport,
                becsult_ido: becsultIdo,
                statusz: 'szavazas',
                szavazas_kezdete: now.toISOString(),
                szavazas_vege: vege.toISOString(),
                otletgazda_id: _user.id,
                otletgazda_nev: _user.nev,
                otletgazda_gyulekezet: _user.gyulekezet,
                csatolmany_url: csatolmanyUrl
            };

            var { data: newOtlet, error: insertError } = await window._supabase
                .from('mm_otletek')
                .insert(payload)
                .select()
                .single();
            if (insertError) throw insertError;

            // Kategóriák
            var katRows = selectedKats.map(function(kid) { return { otlet_id: newOtlet.id, kategoria_id: kid }; });
            await window._supabase.from('mm_otlet_kategoriak').insert(katRows);

            // Címkék
            if (cimkek) {
                var cimkeArr = cimkek.split(',').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
                if (cimkeArr.length > 0) {
                    var cimkeRows = cimkeArr.map(function(c) { return { otlet_id: newOtlet.id, cimke: c }; });
                    await window._supabase.from('mm_otlet_cimkek').insert(cimkeRows);
                }
            }

            // Gamifikáció
            await MmGamification.addPoints('otlet_bekuldve', _user.id);

            // Modal bezárás
            bootstrap.Modal.getInstance(document.getElementById('modal-mm-otlet')).hide();
            await loadOtletek();

        } catch (err) {
            console.error('Ötlet beküldési hiba:', err);
            alert('Hiba történt: ' + (err.message || err));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ti ti-send me-2"></i>Ötlet beküldése';
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÖTLET RÉSZLETES NÉZET
    // ══════════════════════════════════════════════════════════════════════

    async function openOtletDetail(otletId) {
        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (!otlet) return;

        document.getElementById('mm-otlet-detail-title').textContent = otlet.cim;
        document.getElementById('mm-otlet-detail-statusz').className = 'badge badge-' + otlet.statusz;
        document.getElementById('mm-otlet-detail-statusz').textContent = _getStatuszLabel(otlet.statusz);
        document.getElementById('mm-otlet-detail-meta').innerHTML =
            '<i class="ti ti-user me-1"></i>' + MmApi.escHtml(otlet.otletgazda_nev || '') +
            (otlet.otletgazda_gyulekezet ? ' — ' + MmApi.escHtml(otlet.otletgazda_gyulekezet) : '') +
            ' | <i class="ti ti-calendar me-1"></i>' + MmApi.formatDate(otlet.created_at);

        // Szavazatok betöltése
        var { data: szavazatok } = await window._supabase
            .from('mm_szavazatok')
            .select('*')
            .eq('otlet_id', otletId);

        var myTamogatas = false;
        var myCsatlakozas = false;
        if (szavazatok) {
            myTamogatas = szavazatok.some(function(sz) { return sz.user_id === _user.id && sz.tipus === 'tamogatas'; });
            myCsatlakozas = szavazatok.some(function(sz) { return sz.user_id === _user.id && sz.tipus === 'csatlakozas'; });
        }

        // Hozzászólások betöltése
        var { data: hozzaszolasok } = await window._supabase
            .from('mm_hozzaszolasok')
            .select('*')
            .eq('otlet_id', otletId)
            .order('created_at', { ascending: true });

        var katBadges = MmApi.getKategoriaBadges(otlet.mm_otlet_kategoriak);
        var hataridoInfo = _getSzavazasHataridoInfo(otlet);

        var body = '<div class="row g-3">';

        // Leírás
        body += '<div class="col-12"><p>' + MmApi.escHtml(otlet.leiras) + '</p></div>';

        // Kategóriák
        body += '<div class="col-12">' + katBadges + '</div>';

        // Információk
        body += '<div class="col-12"><div class="row g-2">' +
            '<div class="col-6 col-md-3"><div class="text-muted small">Célcsoport</div><div class="fw-bold">' + (otlet.celcsoport || 'Mindenki') + '</div></div>' +
            '<div class="col-6 col-md-3"><div class="text-muted small">Becsült idő</div><div class="fw-bold">' + (otlet.becsult_ido || '2-3 hónap') + '</div></div>' +
            '<div class="col-6 col-md-3"><div class="text-muted small">Támogatások</div><div class="fw-bold text-primary">' + (otlet.tamogatasok_szama || 0) + '</div></div>' +
            '<div class="col-6 col-md-3"><div class="text-muted small">Csatlakozók</div><div class="fw-bold text-success">' + (otlet.csatlakozok_szama || 0) + '</div></div>' +
            '</div></div>';

        // Szavazási határidő
        if (hataridoInfo && otlet.statusz === 'szavazas') {
            body += '<div class="col-12"><div class="alert ' + (hataridoInfo.urgent ? 'alert-warning' : 'alert-info') + ' py-2">' +
                '<i class="ti ti-clock me-1"></i>' + hataridoInfo.text + '</div></div>';
        }

        // Szavazás gombok (csak szavazás státuszban)
        if (otlet.statusz === 'szavazas' && otlet.otletgazda_id !== _user.id) {
            body += '<div class="col-12"><hr>' +
                '<div class="d-flex gap-2">' +
                '<button class="btn mm-vote-btn ' + (myTamogatas ? 'btn-primary voted' : 'btn-outline-primary') + '" onclick="MmOtletek.toggleTamogatas(\'' + otletId + '\')">' +
                '<i class="ti ti-thumb-up me-1"></i>' + (myTamogatas ? 'Támogatom' : 'Támogatás') + '</button>' +
                '<button class="btn mm-vote-btn ' + (myCsatlakozas ? 'btn-success voted' : 'btn-outline-success') + '" onclick="MmOtletek.toggleCsatlakozas(\'' + otletId + '\')">' +
                '<i class="ti ti-users me-1"></i>' + (myCsatlakozas ? 'Csatlakozom' : 'Csatlakozás') + '</button>' +
                '</div></div>';
        }

        // Közös munka gomb
        if (otlet.statusz === 'kozos_munka') {
            body += '<div class="col-12"><hr>' +
                '<button class="btn btn-success" onclick="bootstrap.Modal.getInstance(document.getElementById(\'modal-mm-otlet-detail\')).hide(); MmOtletek.openKozosMunka(\'' + otletId + '\')">' +
                '<i class="ti ti-users-group me-2"></i>Közös munka megnyitása</button></div>';
        }

        // Javaslatok (hasonló segédanyagok/ötletek)
        var suggestions = _getSuggestions(otlet);
        if (suggestions.length > 0) {
            body += '<div class="col-12"><hr><h4><i class="ti ti-sparkles me-2"></i>Kapcsolódó segédanyagok</h4>' +
                '<div class="list-group">';
            suggestions.forEach(function(s) {
                body += '<a href="#" class="list-group-item list-group-item-action" onclick="event.preventDefault(); bootstrap.Modal.getInstance(document.getElementById(\'modal-mm-otlet-detail\')).hide(); MmApi.openSegedanyagDetail(\'' + s.id + '\')">' +
                    '<div class="fw-bold">' + MmApi.escHtml(s.cim) + '</div>' +
                    '<div class="text-muted small">' + MmApi.escHtml(s.leiras || '').substring(0, 100) + '</div>' +
                    '</a>';
            });
            body += '</div></div>';
        }

        // Hozzászólások
        body += '<div class="col-12"><hr><h4><i class="ti ti-messages me-2"></i>Hozzászólások (' + (hozzaszolasok ? hozzaszolasok.length : 0) + ')</h4>';

        if (hozzaszolasok && hozzaszolasok.length > 0) {
            hozzaszolasok.forEach(function(h) {
                var isOwn = h.user_id === _user.id;
                body += '<div class="d-flex gap-2 mb-3">' +
                    '<div class="avatar avatar-sm rounded" style="background:' + (isOwn ? '#206bc4' : '#e6e8eb') + ';">' +
                    '<span class="avatar-text' + (isOwn ? '' : ' text-dark') + '">' + (h.user_nev || '?').charAt(0).toUpperCase() + '</span></div>' +
                    '<div class="flex-fill">' +
                    '<div class="fw-bold small">' + MmApi.escHtml(h.user_nev || 'Ismeretlen') +
                    (h.user_gyulekezet ? ' <span class="text-muted fw-normal">— ' + MmApi.escHtml(h.user_gyulekezet) + '</span>' : '') +
                    '</div>' +
                    '<p class="mb-0 small">' + MmApi.escHtml(h.szoveg) + '</p>' +
                    '<div class="text-muted" style="font-size:0.7rem;">' + MmApi.formatDate(h.created_at) + '</div>' +
                    '</div></div>';
            });
        }

        // Hozzászólás form
        body += '<div class="input-group mt-2">' +
            '<input type="text" id="mm-hozzaszolas-input" class="form-control" placeholder="Hozzászólás írása...">' +
            '<button class="btn btn-primary" onclick="MmOtletek.submitHozzaszolas(\'' + otletId + '\')">' +
            '<i class="ti ti-send"></i></button></div>';

        body += '</div></div>';

        document.getElementById('mm-otlet-detail-body').innerHTML = body;

        // Footer
        var footer = '<button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Bezárás</button>';
        if (otlet.csatolmany_url) {
            footer += '<a href="' + MmApi.escHtml(otlet.csatolmany_url) + '" target="_blank" class="btn btn-outline-primary"><i class="ti ti-download me-1"></i>Csatolmány</a>';
        }
        document.getElementById('mm-otlet-detail-footer').innerHTML = footer;

        var bsModal = new bootstrap.Modal(document.getElementById('modal-mm-otlet-detail'));
        bsModal.show();
    }

    // ══════════════════════════════════════════════════════════════════════
    // SZAVAZÁS
    // ══════════════════════════════════════════════════════════════════════

    async function toggleTamogatas(otletId) {
        try {
            var { data: existing } = await window._supabase
                .from('mm_szavazatok')
                .select('id')
                .eq('otlet_id', otletId)
                .eq('user_id', _user.id)
                .eq('tipus', 'tamogatas')
                .maybeSingle();

            var otlet = _otletek.find(function(o) { return o.id === otletId; });

            if (existing) {
                // Visszavonás
                await window._supabase.from('mm_szavazatok').delete().eq('id', existing.id);
                await window._supabase.from('mm_otletek')
                    .update({ tamogatasok_szama: Math.max(0, (otlet.tamogatasok_szama || 0) - 1) })
                    .eq('id', otletId);
            } else {
                // Szavazás
                await window._supabase.from('mm_szavazatok').insert({
                    otlet_id: otletId,
                    user_id: _user.id,
                    tipus: 'tamogatas'
                });
                var newCount = (otlet.tamogatasok_szama || 0) + 1;
                await window._supabase.from('mm_otletek')
                    .update({ tamogatasok_szama: newCount })
                    .eq('id', otletId);

                // Gamifikáció
                await MmGamification.addPoints('szavazat_adva', _user.id);

                // Értesítés az ötletgazdának
                if (otlet.otletgazda_id !== _user.id) {
                    await MmApi.sendNotification(otlet.otletgazda_id, 'info',
                        'Új támogatás!',
                        _user.nev + ' támogatja az ötleted: "' + otlet.cim + '"');
                }

                // 5 támogatás → közös munka
                if (newCount >= 5 && otlet.statusz === 'szavazas') {
                    await _promoteToKozosMunka(otletId);
                }
            }

            await loadOtletek();
            openOtletDetail(otletId);

        } catch (err) {
            console.error('Szavazás hiba:', err);
        }
    }

    async function toggleCsatlakozas(otletId) {
        try {
            var { data: existing } = await window._supabase
                .from('mm_szavazatok')
                .select('id')
                .eq('otlet_id', otletId)
                .eq('user_id', _user.id)
                .eq('tipus', 'csatlakozas')
                .maybeSingle();

            var otlet = _otletek.find(function(o) { return o.id === otletId; });

            if (existing) {
                await window._supabase.from('mm_szavazatok').delete().eq('id', existing.id);
                await window._supabase.from('mm_otletek')
                    .update({ csatlakozok_szama: Math.max(0, (otlet.csatlakozok_szama || 0) - 1) })
                    .eq('id', otletId);
            } else {
                await window._supabase.from('mm_szavazatok').insert({
                    otlet_id: otletId,
                    user_id: _user.id,
                    tipus: 'csatlakozas'
                });
                await window._supabase.from('mm_otletek')
                    .update({ csatlakozok_szama: (otlet.csatlakozok_szama || 0) + 1 })
                    .eq('id', otletId);

                await MmGamification.addPoints('csatlakozas', _user.id);

                if (otlet.otletgazda_id !== _user.id) {
                    await MmApi.sendNotification(otlet.otletgazda_id, 'info',
                        'Új csatlakozó!',
                        _user.nev + ' csatlakozni szeretne: "' + otlet.cim + '"');
                }
            }

            await loadOtletek();
            openOtletDetail(otletId);

        } catch (err) {
            console.error('Csatlakozás hiba:', err);
        }
    }

    // ── 5 szavazat → közös munka ──
    async function _promoteToKozosMunka(otletId) {
        await window._supabase.from('mm_otletek')
            .update({ statusz: 'kozos_munka', updated_at: new Date().toISOString() })
            .eq('id', otletId);

        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (otlet) {
            await MmGamification.addPoints('otlet_tovabbjutott', otlet.otletgazda_id);
            await MmApi.sendNotification(otlet.otletgazda_id, 'success',
                'Ötleted továbbjutott!',
                'A(z) "' + otlet.cim + '" ötleted elérte az 5 támogatást és átkerült a közös munka fázisba!');
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // HOZZÁSZÓLÁS
    // ══════════════════════════════════════════════════════════════════════

    async function submitHozzaszolas(otletId) {
        var input = document.getElementById('mm-hozzaszolas-input');
        if (!input) return;
        var szoveg = input.value.trim();
        if (!szoveg) return;

        try {
            await window._supabase.from('mm_hozzaszolasok').insert({
                otlet_id: otletId,
                user_id: _user.id,
                user_nev: _user.nev,
                user_gyulekezet: _user.gyulekezet,
                szoveg: szoveg
            });

            // Hozzászólás szám frissítés
            var otlet = _otletek.find(function(o) { return o.id === otletId; });
            if (otlet) {
                await window._supabase.from('mm_otletek')
                    .update({ hozzaszolasok_szama: (otlet.hozzaszolasok_szama || 0) + 1 })
                    .eq('id', otletId);
            }

            await MmGamification.addPoints('hozzaszolas', _user.id);

            // Értesítés
            if (otlet && otlet.otletgazda_id !== _user.id) {
                await MmApi.sendNotification(otlet.otletgazda_id, 'info',
                    'Új hozzászólás',
                    _user.nev + ' hozzászólt az ötletedhez: "' + otlet.cim + '"');
            }

            await loadOtletek();
            openOtletDetail(otletId);

        } catch (err) {
            console.error('Hozzászólás hiba:', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SZAVAZÁSI HATÁRIDŐK
    // ══════════════════════════════════════════════════════════════════════

    async function checkSzavazasDeadlines() {
        var now = new Date();
        var { data: lejartOtletek } = await window._supabase
            .from('mm_otletek')
            .select('*')
            .eq('statusz', 'szavazas')
            .lt('szavazas_vege', now.toISOString());

        if (!lejartOtletek || lejartOtletek.length === 0) return;

        for (var i = 0; i < lejartOtletek.length; i++) {
            var o = lejartOtletek[i];
            if ((o.tamogatasok_szama || 0) < 5) {
                // Archivált
                await window._supabase.from('mm_otletek')
                    .update({ statusz: 'archivalt', updated_at: now.toISOString() })
                    .eq('id', o.id);
                await MmApi.sendNotification(o.otletgazda_id, 'warning',
                    'Szavazási időszak lejárt',
                    'A(z) "' + o.cim + '" ötleted nem érte el az 5 támogató szavazatot, ezért archiválva lett.');
            } else {
                // Közös munka
                await _promoteToKozosMunka(o.id);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // KÖZÖS MUNKA WORKSPACE
    // ══════════════════════════════════════════════════════════════════════

    async function openKozosMunka(otletId) {
        _currentKmOtletId = otletId;

        var { data: otlet } = await window._supabase
            .from('mm_otletek')
            .select('*')
            .eq('id', otletId)
            .single();

        if (!otlet) return;

        document.getElementById('mm-km-title').innerHTML = '<i class="ti ti-users-group me-2"></i>' + MmApi.escHtml(otlet.cim);
        document.getElementById('mm-km-subtitle').textContent = otlet.otletgazda_nev + ' — ' + (otlet.otletgazda_gyulekezet || '');
        document.getElementById('mm-km-progress-badge').textContent = (otlet.kidolgozottsag || 0) + '%';
        document.getElementById('mm-km-progress-bar').style.width = (otlet.kidolgozottsag || 0) + '%';

        // Megvalósult gomb láthatósága (csak ötletgazda vagy admin)
        var megvBtn = document.getElementById('btn-mm-km-megvalosult');
        if (megvBtn) {
            megvBtn.classList.toggle('d-none',
                otlet.otletgazda_id !== _user.id && _user.role !== 'admin' && _user.role !== 'superadmin');
        }

        await Promise.all([
            _loadFeladatok(otletId),
            _loadMerfoldkovek(otletId),
            _loadDokumentumok(otletId),
            _loadCsapat(otletId)
        ]);

        var bsModal = new bootstrap.Modal(document.getElementById('modal-mm-kozos-munka'));
        bsModal.show();
    }

    // ── Feladatok ──
    async function _loadFeladatok(otletId) {
        var { data: feladatok } = await window._supabase
            .from('mm_feladatok')
            .select('*')
            .eq('otlet_id', otletId)
            .order('sorrend');

        var container = document.getElementById('mm-km-feladatok-list');
        var countEl = document.getElementById('mm-km-feladat-count');
        if (countEl) countEl.textContent = feladatok ? feladatok.length : 0;

        if (!feladatok || feladatok.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="ti ti-checklist" style="font-size:2rem;"></i><div class="mt-2">Még nincsenek feladatok</div></div>';
            return;
        }

        var html = '<div class="list-group">';
        feladatok.forEach(function(f) {
            var checked = f.statusz === 'kesz' ? 'checked' : '';
            var strikeClass = f.statusz === 'kesz' ? 'text-decoration-line-through text-muted' : '';
            var statuszBadge = f.statusz === 'kesz' ? '<span class="badge bg-success">Kész</span>' :
                              f.statusz === 'folyamatban' ? '<span class="badge bg-primary">Folyamatban</span>' :
                              '<span class="badge bg-secondary">Függőben</span>';

            html += '<div class="list-group-item">' +
                '<div class="d-flex align-items-center">' +
                '<input type="checkbox" class="form-check-input me-3" ' + checked + ' onchange="MmOtletek.toggleFeladatStatus(\'' + f.id + '\', this.checked)">' +
                '<div class="flex-fill">' +
                '<div class="fw-bold ' + strikeClass + '">' + MmApi.escHtml(f.cim) + '</div>' +
                (f.leiras ? '<div class="text-muted small">' + MmApi.escHtml(f.leiras) + '</div>' : '') +
                '</div>' +
                '<div class="d-flex align-items-center gap-2">' +
                (f.felelos_nev ? '<span class="text-muted small"><i class="ti ti-user me-1"></i>' + MmApi.escHtml(f.felelos_nev) + '</span>' : '') +
                (f.hatarido ? '<span class="text-muted small"><i class="ti ti-calendar me-1"></i>' + f.hatarido + '</span>' : '') +
                statuszBadge +
                '</div></div></div>';
        });
        html += '</div>';
        container.innerHTML = html;

        // Kidolgozottság frissítése
        _updateKidolgozottsag(otletId, feladatok);
    }

    async function _updateKidolgozottsag(otletId, feladatok) {
        if (!feladatok || feladatok.length === 0) return;
        var kesz = feladatok.filter(function(f) { return f.statusz === 'kesz'; }).length;
        var percent = Math.round((kesz / feladatok.length) * 100);

        await window._supabase.from('mm_otletek')
            .update({ kidolgozottsag: percent })
            .eq('id', otletId);

        document.getElementById('mm-km-progress-badge').textContent = percent + '%';
        document.getElementById('mm-km-progress-bar').style.width = percent + '%';
    }

    async function toggleFeladatStatus(feladatId, isKesz) {
        var newStatusz = isKesz ? 'kesz' : 'fuggeben';
        await window._supabase.from('mm_feladatok')
            .update({ statusz: newStatusz })
            .eq('id', feladatId);

        if (isKesz) {
            await MmGamification.addPoints('feladat_teljesitve', _user.id);
        }

        if (_currentKmOtletId) await _loadFeladatok(_currentKmOtletId);
    }

    function addFeladat() {
        document.getElementById('mm-feladat-cim').value = '';
        document.getElementById('mm-feladat-leiras').value = '';
        document.getElementById('mm-feladat-hatarido').value = '';
        var modal = new bootstrap.Modal(document.getElementById('modal-mm-feladat'));
        modal.show();
    }

    async function saveFeladat() {
        var cim = document.getElementById('mm-feladat-cim').value.trim();
        if (!cim) { alert('A feladat címe kötelező!'); return; }

        await window._supabase.from('mm_feladatok').insert({
            otlet_id: _currentKmOtletId,
            cim: cim,
            leiras: document.getElementById('mm-feladat-leiras').value.trim() || null,
            hatarido: document.getElementById('mm-feladat-hatarido').value || null
        });

        bootstrap.Modal.getInstance(document.getElementById('modal-mm-feladat')).hide();
        await _loadFeladatok(_currentKmOtletId);
    }

    // ── Mérföldkövek ──
    async function _loadMerfoldkovek(otletId) {
        var { data: merfoldkovek } = await window._supabase
            .from('mm_merfoldkovek')
            .select('*')
            .eq('otlet_id', otletId)
            .order('sorrend');

        var container = document.getElementById('mm-km-merfoldkovek-list');
        if (!merfoldkovek || merfoldkovek.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="ti ti-flag" style="font-size:2rem;"></i><div class="mt-2">Még nincsenek mérföldkövek</div></div>';
            return;
        }

        var html = '<div class="list-group">';
        merfoldkovek.forEach(function(m) {
            var icon = m.teljesitve ? '<i class="ti ti-circle-check text-success me-2" style="font-size:1.3rem;"></i>' :
                                      '<i class="ti ti-circle-dashed text-muted me-2" style="font-size:1.3rem;"></i>';
            html += '<div class="list-group-item">' +
                '<div class="d-flex align-items-center">' +
                icon +
                '<div class="flex-fill">' +
                '<div class="fw-bold' + (m.teljesitve ? ' text-success' : '') + '">' + MmApi.escHtml(m.cim) + '</div>' +
                (m.leiras ? '<div class="text-muted small">' + MmApi.escHtml(m.leiras) + '</div>' : '') +
                '</div>' +
                (m.hatarido ? '<span class="text-muted small"><i class="ti ti-calendar me-1"></i>' + m.hatarido + '</span>' : '') +
                (!m.teljesitve ? '<button class="btn btn-sm btn-outline-success ms-2" onclick="MmOtletek.toggleMerfoldko(\'' + m.id + '\')"><i class="ti ti-check"></i></button>' : '') +
                '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async function toggleMerfoldko(merfoldkoId) {
        await window._supabase.from('mm_merfoldkovek')
            .update({ teljesitve: true, teljesitve_datum: new Date().toISOString() })
            .eq('id', merfoldkoId);
        if (_currentKmOtletId) await _loadMerfoldkovek(_currentKmOtletId);
    }

    function addMerfoldko() {
        document.getElementById('mm-merfoldko-cim').value = '';
        document.getElementById('mm-merfoldko-leiras').value = '';
        document.getElementById('mm-merfoldko-hatarido').value = '';
        var modal = new bootstrap.Modal(document.getElementById('modal-mm-merfoldko'));
        modal.show();
    }

    async function saveMerfoldko() {
        var cim = document.getElementById('mm-merfoldko-cim').value.trim();
        if (!cim) { alert('A mérföldkő címe kötelező!'); return; }

        await window._supabase.from('mm_merfoldkovek').insert({
            otlet_id: _currentKmOtletId,
            cim: cim,
            leiras: document.getElementById('mm-merfoldko-leiras').value.trim() || null,
            hatarido: document.getElementById('mm-merfoldko-hatarido').value || null
        });

        bootstrap.Modal.getInstance(document.getElementById('modal-mm-merfoldko')).hide();
        await _loadMerfoldkovek(_currentKmOtletId);
    }

    // ── Dokumentumok ──
    async function _loadDokumentumok(otletId) {
        var { data: docs } = await window._supabase
            .from('mm_dokumentumok')
            .select('*')
            .eq('otlet_id', otletId)
            .order('created_at', { ascending: false });

        var container = document.getElementById('mm-km-dokumentumok-list');
        var countEl = document.getElementById('mm-km-dok-count');
        if (countEl) countEl.textContent = docs ? docs.length : 0;

        if (!docs || docs.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="ti ti-files" style="font-size:2rem;"></i><div class="mt-2">Még nincsenek dokumentumok</div></div>';
            return;
        }

        var html = '<div class="list-group">';
        docs.forEach(function(d) {
            html += '<div class="list-group-item d-flex align-items-center">' +
                '<i class="ti ti-file me-3 text-primary" style="font-size:1.3rem;"></i>' +
                '<div class="flex-fill">' +
                '<div class="fw-bold">' + MmApi.escHtml(d.nev) + '</div>' +
                '<div class="text-muted small">' + MmApi.escHtml(d.feltolto_nev || '') + ' — ' + MmApi.formatDate(d.created_at) + '</div>' +
                '</div>' +
                '<a href="' + MmApi.escHtml(d.url) + '" target="_blank" class="btn btn-sm btn-outline-primary"><i class="ti ti-download"></i></a>' +
                '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async function uploadDokumentum() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.ppt,.pptx,.zip,.jpg,.png,.xlsx';
        input.onchange = async function() {
            if (!input.files.length) return;
            var file = input.files[0];
            if (file.size > 20 * 1024 * 1024) { alert('Max. 20 MB!'); return; }

            try {
                var filePath = 'projektek/' + _currentKmOtletId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                var { error: uploadError } = await window._supabase.storage
                    .from('misszios-muhely')
                    .upload(filePath, file);
                if (uploadError) throw uploadError;

                var { data: urlData } = window._supabase.storage.from('misszios-muhely').getPublicUrl(filePath);

                await window._supabase.from('mm_dokumentumok').insert({
                    otlet_id: _currentKmOtletId,
                    nev: file.name,
                    url: urlData.publicUrl,
                    meret: file.size,
                    tipus: file.type,
                    feltolto_id: _user.id,
                    feltolto_nev: _user.nev
                });

                await _loadDokumentumok(_currentKmOtletId);
            } catch (err) {
                console.error('Dokumentum feltöltési hiba:', err);
                alert('Hiba: ' + (err.message || err));
            }
        };
        input.click();
    }

    // ── Csapat ──
    async function _loadCsapat(otletId) {
        var { data: csatlakozok } = await window._supabase
            .from('mm_szavazatok')
            .select('user_id')
            .eq('otlet_id', otletId)
            .eq('tipus', 'csatlakozas');

        var { data: otlet } = await window._supabase
            .from('mm_otletek')
            .select('otletgazda_id, otletgazda_nev, otletgazda_gyulekezet')
            .eq('id', otletId)
            .single();

        var container = document.getElementById('mm-km-csapat-list');
        var countEl = document.getElementById('mm-km-csapat-count');

        var members = [];
        if (otlet) {
            members.push({ id: otlet.otletgazda_id, nev: otlet.otletgazda_nev, gyulekezet: otlet.otletgazda_gyulekezet, role: 'Ötletgazda' });
        }

        if (csatlakozok && csatlakozok.length > 0) {
            var userIds = csatlakozok.map(function(c) { return c.user_id; }).filter(function(id) { return otlet && id !== otlet.otletgazda_id; });
            if (userIds.length > 0) {
                var { data: profiles } = await window._supabase
                    .from('profiles')
                    .select('id, full_name, congregation_id')
                    .in('id', userIds);

                var congIds = (profiles || []).filter(function(p) { return p.congregation_id; }).map(function(p) { return p.congregation_id; });
                var congMap = {};
                if (congIds.length > 0) {
                    var { data: congs } = await window._supabase.from('congregations').select('id, nev_hu').in('id', congIds);
                    if (congs) congs.forEach(function(c) { congMap[c.id] = c.nev_hu; });
                }

                (profiles || []).forEach(function(p) {
                    members.push({ id: p.id, nev: p.full_name, gyulekezet: congMap[p.congregation_id] || '', role: 'Csapattag' });
                });
            }
        }

        if (countEl) countEl.textContent = members.length;

        var html = '<div class="list-group">';
        members.forEach(function(m) {
            var isOwner = m.role === 'Ötletgazda';
            html += '<div class="list-group-item d-flex align-items-center">' +
                '<div class="avatar avatar-sm me-3" style="background:' + (isOwner ? '#f59f00' : '#206bc4') + ';">' +
                '<span class="avatar-text text-white">' + (m.nev || '?').charAt(0).toUpperCase() + '</span></div>' +
                '<div class="flex-fill">' +
                '<div class="fw-bold">' + MmApi.escHtml(m.nev || 'Ismeretlen') + '</div>' +
                '<div class="text-muted small">' + MmApi.escHtml(m.gyulekezet || '') + '</div>' +
                '</div>' +
                '<span class="badge ' + (isOwner ? 'bg-warning text-dark' : 'bg-primary') + '">' + m.role + '</span>' +
                '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // ── Projekt megvalósult ──
    async function markAsMegvalosult() {
        if (!_currentKmOtletId) return;
        if (!confirm('Biztosan megvalósultnak jelölöd ezt a projektet?')) return;

        try {
            await window._supabase.from('mm_otletek')
                .update({ statusz: 'megvalosult', kidolgozottsag: 100, updated_at: new Date().toISOString() })
                .eq('id', _currentKmOtletId);

            var { data: otlet } = await window._supabase
                .from('mm_otletek')
                .select('otletgazda_id, cim')
                .eq('id', _currentKmOtletId)
                .single();

            if (otlet) {
                await MmGamification.addPoints('otlet_megvalosult', otlet.otletgazda_id);

                // Értesítés minden csapattagnak
                var { data: csapat } = await window._supabase
                    .from('mm_szavazatok')
                    .select('user_id')
                    .eq('otlet_id', _currentKmOtletId)
                    .eq('tipus', 'csatlakozas');

                var allMembers = [otlet.otletgazda_id];
                if (csapat) csapat.forEach(function(c) { if (allMembers.indexOf(c.user_id) === -1) allMembers.push(c.user_id); });

                for (var i = 0; i < allMembers.length; i++) {
                    await MmApi.sendNotification(allMembers[i], 'success',
                        'Projekt megvalósult!',
                        'A(z) "' + otlet.cim + '" projekt sikeresen megvalósult!');
                }
            }

            bootstrap.Modal.getInstance(document.getElementById('modal-mm-kozos-munka')).hide();
            await loadOtletek();

        } catch (err) {
            console.error('Megvalósult jelölés hiba:', err);
            alert('Hiba: ' + (err.message || err));
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SZŰRÉS
    // ══════════════════════════════════════════════════════════════════════

    function filterStatusz(statusz) {
        _selectedStatusz = statusz;

        // Gombok frissítése
        document.querySelectorAll('[id^="mm-otlet-filter-"]').forEach(function(btn) {
            btn.className = btn.className.replace(/btn-(primary|outline-primary|outline-success|outline-secondary)/g, '');
        });
        var activeBtn = document.getElementById('mm-otlet-filter-' + (statusz || 'mind'));
        if (activeBtn) {
            activeBtn.className = activeBtn.className.replace('btn-outline-', 'btn-');
            if (activeBtn.className.indexOf('btn-primary') === -1 &&
                activeBtn.className.indexOf('btn-success') === -1 &&
                activeBtn.className.indexOf('btn-secondary') === -1) {
                activeBtn.classList.add('btn-primary');
            }
        }

        filterOtletek();
    }

    function selectOtletKategoria(chipEl) {
        document.querySelectorAll('#mm-otlet-kategoriak .mm-chip').forEach(function(c) { c.classList.remove('active'); });
        chipEl.classList.add('active');
        _selectedOtletKat = chipEl.getAttribute('data-kat-id');
        filterOtletek();
    }

    function filterOtletek() {
        var kereses = (document.getElementById('mm-otlet-kereses').value || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        var celcsoport = document.getElementById('mm-otlet-celcsoport').value;
        var rendezes = document.getElementById('mm-otlet-rendezes').value;

        _filteredOtletek = _otletek.filter(function(o) {
            // Státusz
            if (_selectedStatusz && o.statusz !== _selectedStatusz) return false;

            // Kategória
            if (_selectedOtletKat) {
                var hasKat = o.mm_otlet_kategoriak && o.mm_otlet_kategoriak.some(function(ok) {
                    return ok.kategoria_id === parseInt(_selectedOtletKat);
                });
                if (!hasKat) return false;
            }

            // Célcsoport
            if (celcsoport && o.celcsoport !== celcsoport) return false;

            // Keresés
            if (kereses) {
                var searchable = ((o.cim || '') + ' ' + (o.leiras || '') + ' ' + (o.otletgazda_nev || ''))
                    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (searchable.indexOf(kereses) === -1) return false;
            }

            return true;
        });

        // Rendezés
        _filteredOtletek.sort(function(a, b) {
            if (rendezes === 'legujabb') return new Date(b.created_at) - new Date(a.created_at);
            if (rendezes === 'legtobb_tamogatas') return (b.tamogatasok_szama || 0) - (a.tamogatasok_szama || 0);
            if (rendezes === 'legtobb_csatlakozo') return (b.csatlakozok_szama || 0) - (a.csatlakozok_szama || 0);
            if (rendezes === 'hamarosan_lejar') {
                var va = a.szavazas_vege ? new Date(a.szavazas_vege) : new Date('2099-01-01');
                var vb = b.szavazas_vege ? new Date(b.szavazas_vege) : new Date('2099-01-01');
                return va - vb;
            }
            return 0;
        });

        _renderOtletGrid();
    }

    // ══════════════════════════════════════════════════════════════════════
    // JAVASLATI RENDSZER (7. fázis)
    // ══════════════════════════════════════════════════════════════════════

    function _getSuggestions(otlet) {
        // Kategória egyezés alapú javaslatok
        if (!otlet.mm_otlet_kategoriak || otlet.mm_otlet_kategoriak.length === 0) return [];

        var otletKatIds = otlet.mm_otlet_kategoriak.map(function(ok) { return ok.kategoria_id; });

        // Keresés a segédanyagok között
        try {
            var segedanyagok = MmApi.loadSegedanyagok ? [] : []; // fallback
            // Nem tudjuk közvetlenül elérni a _segedanyagok-at, ezért az init-ben tároljuk
        } catch(e) {}

        return []; // A teljes javaslati logika a MmApi.init után elérhető
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDFÜGGVÉNYEK
    // ══════════════════════════════════════════════════════════════════════

    function _getStatuszBadge(statusz) {
        var labels = {
            'uj': 'Új', 'szavazas': 'Szavazás alatt', 'kozos_munka': 'Közös munka',
            'megvalosult': 'Megvalósult', 'archivalt': 'Archivált', 'piszkozat': 'Piszkozat'
        };
        return '<span class="badge badge-' + statusz + '">' + (labels[statusz] || statusz) + '</span>';
    }

    function _getStatuszLabel(statusz) {
        var labels = {
            'uj': 'Új', 'szavazas': 'Szavazás alatt', 'kozos_munka': 'Közös munka',
            'megvalosult': 'Megvalósult', 'archivalt': 'Archivált', 'piszkozat': 'Piszkozat'
        };
        return labels[statusz] || statusz;
    }

    function _getSzavazasHataridoInfo(otlet) {
        if (otlet.statusz !== 'szavazas' || !otlet.szavazas_vege) return null;
        var now = new Date();
        var vege = new Date(otlet.szavazas_vege);
        var diff = Math.ceil((vege - now) / (1000 * 60 * 60 * 24));

        if (diff < 0) return { text: 'Lejárt', class: 'text-danger', urgent: true };
        if (diff <= 3) return { text: diff + ' nap maradt!', class: 'text-danger', urgent: true };
        if (diff <= 7) return { text: diff + ' nap maradt', class: 'text-warning', urgent: true };
        return { text: diff + ' nap van hátra a szavazásból', class: 'text-muted', urgent: false };
    }

    function _updateOtletTabCount() {
        var el = document.getElementById('mm-tab-count-otlet');
        if (el) el.textContent = _otletek.filter(function(o) { return o.statusz === 'szavazas' || o.statusz === 'uj'; }).length;

        var el2 = document.getElementById('mm-tab-count-kozos');
        if (el2) el2.textContent = _otletek.filter(function(o) { return o.statusz === 'kozos_munka'; }).length;
    }

    // ── Publikus API ──
    return {
        init: init,
        loadOtletek: loadOtletek,
        openOtletModal: openOtletModal,
        wizardNext: wizardNext,
        wizardPrev: wizardPrev,
        handleOtletSubmit: handleOtletSubmit,
        openOtletDetail: openOtletDetail,
        toggleTamogatas: toggleTamogatas,
        toggleCsatlakozas: toggleCsatlakozas,
        submitHozzaszolas: submitHozzaszolas,
        filterStatusz: filterStatusz,
        selectOtletKategoria: selectOtletKategoria,
        filterOtletek: filterOtletek,
        openKozosMunka: openKozosMunka,
        addFeladat: addFeladat,
        saveFeladat: saveFeladat,
        toggleFeladatStatus: toggleFeladatStatus,
        addMerfoldko: addMerfoldko,
        saveMerfoldko: saveMerfoldko,
        toggleMerfoldko: toggleMerfoldko,
        uploadDokumentum: uploadDokumentum,
        markAsMegvalosult: markAsMegvalosult
    };
})();
