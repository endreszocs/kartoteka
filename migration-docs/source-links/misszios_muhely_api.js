// ═══════════════════════════════════════════════════════════════════════════
// Missziós Műhely — Fő API modul
// Init, felhasználó, kategóriák, segédanyag CRUD, keresés/szűrés, renderelés
// Közös projektek fül, ranglista fül, tab váltás
// ═══════════════════════════════════════════════════════════════════════════

var MmApi = (function() {
    'use strict';

    // ── Belső állapot ──
    var _user = null;           // { id, nev, gyulekezet, role }
    var _kategoriak = [];       // mm_kategoriak tábla
    var _segedanyagok = [];     // betöltött segédanyagok
    var _filteredSeg = [];      // szűrt segédanyagok
    var _selectedSegKat = '';   // kiválasztott kategória ID ('' = mind)
    var _currentTab = 'segedanyagok';

    // ══════════════════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════════════════

    async function init() {
        try {
            await _loadUser();
            await _loadKategoriak();
            _renderKategoriaChips();
            _setupLeirasCounter();
            await Promise.all([
                loadSegedanyagok(),
                MmOtletek.init(_user, _kategoriak),
                MmGamification.init(_user, _kategoriak)
            ]);
            _updateStats();
        } catch (err) {
            console.error('MmApi.init hiba:', err);
        }
    }

    // ── Felhasználó betöltése ──
    async function _loadUser() {
        var session = await window._supabase.auth.getSession();
        if (!session.data.session) {
            window.location.href = '../index.html';
            return;
        }
        var uid = session.data.session.user.id;
        var { data: profile } = await window._supabase
            .from('profiles')
            .select('id, full_name, role, congregation_id')
            .eq('id', uid)
            .single();

        var gyulNev = '';
        if (profile && profile.congregation_id) {
            var { data: cong } = await window._supabase
                .from('congregations')
                .select('nev_hu')
                .eq('id', profile.congregation_id)
                .single();
            if (cong) gyulNev = cong.nev_hu;
        }

        _user = {
            id: uid,
            nev: profile ? profile.full_name : 'Ismeretlen',
            gyulekezet: gyulNev,
            role: profile ? profile.role : 'lelkesz',
            congregation_id: profile ? profile.congregation_id : null
        };
    }

    // ── Kategóriák betöltése ──
    async function _loadKategoriak() {
        var { data, error } = await window._supabase
            .from('mm_kategoriak')
            .select('*')
            .order('sorrend');
        if (error) {
            console.error('Kategóriák betöltési hiba:', error);
            return;
        }
        _kategoriak = data || [];
    }

    // ── Kategória chip-ek renderelése ──
    function _renderKategoriaChips() {
        // Segédanyag fül
        var segContainer = document.getElementById('mm-seg-kategoriak');
        if (segContainer) {
            var html = '<span class="mm-chip active" data-kat-id="" onclick="MmApi.selectSegKategoria(this)"><i class="ti ti-apps"></i> Mind</span>';
            _kategoriak.forEach(function(k) {
                html += '<span class="mm-chip" data-kat-id="' + k.id + '" onclick="MmApi.selectSegKategoria(this)">' +
                    '<i class="' + k.ikon + '"></i> ' + k.nev + '</span>';
            });
            segContainer.innerHTML = html;
        }

        // Segédanyag modal kategória választó
        var segKatSelect = document.getElementById('mm-seg-kat-select');
        if (segKatSelect) {
            var html2 = '';
            _kategoriak.forEach(function(k) {
                html2 += '<label class="form-check form-check-inline">' +
                    '<input class="form-check-input" type="checkbox" value="' + k.id + '" name="mm-seg-kat">' +
                    '<span class="form-check-label"><i class="' + k.ikon + ' me-1" style="color:' + k.szin + '"></i>' + k.nev + '</span>' +
                    '</label>';
            });
            segKatSelect.innerHTML = html2;
        }
    }

    // ── Leírás karakter számláló ──
    function _setupLeirasCounter() {
        var ta = document.getElementById('mm-seg-leiras');
        if (ta) {
            ta.addEventListener('input', function() {});
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDANYAG CRUD
    // ══════════════════════════════════════════════════════════════════════

    async function loadSegedanyagok() {
        var { data, error } = await window._supabase
            .from('mm_segedanyagok')
            .select('*, mm_segedanyag_kategoriak(kategoria_id)')
            .eq('aktiv', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Segédanyagok betöltési hiba:', error);
            return;
        }
        _segedanyagok = data || [];
        _filteredSeg = _segedanyagok.slice();
        _renderSegedanyagGrid();
        _updateTabCounts();
    }

    function _renderSegedanyagGrid() {
        var grid = document.getElementById('mm-seg-grid');
        var empty = document.getElementById('mm-seg-empty');
        var talalat = document.getElementById('mm-seg-talalat');

        if (!grid) return;

        if (_filteredSeg.length === 0) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('d-none');
            if (talalat) talalat.textContent = '0 segédanyag';
            return;
        }

        if (empty) empty.classList.add('d-none');
        if (talalat) talalat.textContent = _filteredSeg.length + ' segédanyag';

        var html = '';
        _filteredSeg.forEach(function(s) {
            var fmtIcon = _getFormatumIcon(s.formatum);
            var stars = _renderStars(s.atlag_ertekeles);
            var katBadges = _getKategoriaBadges(s.mm_segedanyag_kategoriak);
            var datum = _formatDate(s.created_at);

            html += '<div class="col-12 col-md-6 col-lg-4">' +
                '<div class="card mm-card h-100" onclick="MmApi.openSegedanyagDetail(\'' + s.id + '\')">' +
                '<div class="card-body">' +
                '<div class="d-flex align-items-start justify-content-between mb-2">' +
                '<span class="' + fmtIcon.class + '"><i class="' + fmtIcon.icon + '" style="font-size:1.3rem;"></i></span>' +
                '<div class="mm-stars">' + stars + '</div>' +
                '</div>' +
                '<h3 class="card-title mb-1" style="font-size:0.95rem;">' + _escHtml(s.cim) + '</h3>' +
                '<p class="text-muted small mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
                    _escHtml((s.leiras || '').replace(/^MISSZIÓS MŰHELY\s*\|\s*Kidolgozott bibliaóra vázlat\s*/i, '').replace(/^MISSZIÓS MŰHELY\s*\|\s*/i, '')) + '</p>' +
                '<div class="mb-2">' + katBadges + '</div>' +
                '<div class="d-flex justify-content-between align-items-center small text-muted">' +
                '<span><i class="ti ti-user me-1"></i>' + _escHtml(s.feltolto_nev || 'Ismeretlen') + '</span>' +
                '<span><i class="ti ti-download me-1"></i>' + (s.letoltes_szam || 0) + '</span>' +
                '</div>' +
                '<div class="text-muted small mt-1">' + datum + '</div>' +
                '</div></div></div>';
        });
        grid.innerHTML = html;
    }

    // ── Segédanyag modal megnyitása ──
    function openSegedanyagModal(editId) {
        var modal = document.getElementById('modal-mm-segedanyag');
        if (!modal) return;

        // Form resetelés
        var form = document.getElementById('mm-seg-form');
        if (form) form.reset();
        document.getElementById('mm-seg-edit-id').value = '';
        document.getElementById('mm-seg-modal-title').innerHTML = '<i class="ti ti-upload me-2"></i>Új segédanyag feltöltése';
        document.getElementById('btn-mm-seg-submit').innerHTML = '<i class="ti ti-check me-2"></i>Feltöltés';

        // Szerkesztés mód
        if (editId) {
            var seg = _segedanyagok.find(function(s) { return s.id === editId; });
            if (seg) {
                document.getElementById('mm-seg-edit-id').value = editId;
                document.getElementById('mm-seg-cim').value = seg.cim;
                document.getElementById('mm-seg-leiras').value = seg.leiras || '';
                document.getElementById('mm-seg-formatum').value = seg.formatum;
                document.getElementById('mm-seg-forras-nev').value = seg.forras_nev || '';
                document.getElementById('mm-seg-forras-url').value = seg.forras_url || '';
                document.getElementById('mm-seg-modal-title').innerHTML = '<i class="ti ti-edit me-2"></i>Segédanyag szerkesztése';
                document.getElementById('btn-mm-seg-submit').innerHTML = '<i class="ti ti-check me-2"></i>Mentés';

                // Kategóriák kijelölése
                if (seg.mm_segedanyag_kategoriak) {
                    seg.mm_segedanyag_kategoriak.forEach(function(sk) {
                        var cb = document.querySelector('input[name="mm-seg-kat"][value="' + sk.kategoria_id + '"]');
                        if (cb) cb.checked = true;
                    });
                }
            }
        }

        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    // ── Segédanyag mentés ──
    async function handleSegedanyagSubmit() {
        var cim = document.getElementById('mm-seg-cim').value.trim();
        if (!cim) { alert('A cím megadása kötelező!'); return; }

        var selectedKats = [];
        document.querySelectorAll('input[name="mm-seg-kat"]:checked').forEach(function(cb) {
            selectedKats.push(parseInt(cb.value));
        });
        if (selectedKats.length === 0) { alert('Legalább egy kategória kiválasztása kötelező!'); return; }

        var editId = document.getElementById('mm-seg-edit-id').value;
        var btn = document.getElementById('btn-mm-seg-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="ti ti-loader-2 ti-spin me-2"></i>Mentés...';

        try {
            // Fájl feltöltés (ha van)
            var csatolmanyUrl = null;
            var fileInput = document.getElementById('mm-seg-fajl');
            if (fileInput && fileInput.files.length > 0) {
                var file = fileInput.files[0];
                if (file.size > 20 * 1024 * 1024) {
                    alert('A fájl mérete nem haladhatja meg a 20 MB-ot!');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ti ti-check me-2"></i>Feltöltés';
                    return;
                }
                var filePath = 'segedanyagok/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                var { data: uploadData, error: uploadError } = await window._supabase.storage
                    .from('misszios-muhely')
                    .upload(filePath, file);
                if (uploadError) throw uploadError;
                var { data: urlData } = window._supabase.storage.from('misszios-muhely').getPublicUrl(filePath);
                csatolmanyUrl = urlData.publicUrl;
            }

            var payload = {
                cim: cim,
                leiras: document.getElementById('mm-seg-leiras').value.trim() || null,
                formatum: document.getElementById('mm-seg-formatum').value,
                forras_nev: document.getElementById('mm-seg-forras-nev').value.trim() || null,
                forras_url: document.getElementById('mm-seg-forras-url').value.trim() || null,
                updated_at: new Date().toISOString()
            };

            if (csatolmanyUrl) payload.csatolmany_url = csatolmanyUrl;

            if (editId) {
                // Szerkesztés
                var { error } = await window._supabase
                    .from('mm_segedanyagok')
                    .update(payload)
                    .eq('id', editId);
                if (error) throw error;

                // Kategóriák frissítése
                await window._supabase.from('mm_segedanyag_kategoriak').delete().eq('segedanyag_id', editId);
                var katRows = selectedKats.map(function(kid) { return { segedanyag_id: editId, kategoria_id: kid }; });
                await window._supabase.from('mm_segedanyag_kategoriak').insert(katRows);

            } else {
                // Új létrehozás
                payload.feltolto_id = _user.id;
                payload.feltolto_nev = _user.nev;
                payload.feltolto_gyulekezet = _user.gyulekezet;

                var { data: newSeg, error: insertError } = await window._supabase
                    .from('mm_segedanyagok')
                    .insert(payload)
                    .select()
                    .single();
                if (insertError) throw insertError;

                // Kategóriák hozzárendelése
                var katRows2 = selectedKats.map(function(kid) { return { segedanyag_id: newSeg.id, kategoria_id: kid }; });
                await window._supabase.from('mm_segedanyag_kategoriak').insert(katRows2);

                // Gamifikáció: pont segédanyag feltöltésért
                await MmGamification.addPoints('segedanyag_feltoltes', _user.id);
            }

            // Modal bezárás + újratöltés
            var modalEl = document.getElementById('modal-mm-segedanyag');
            bootstrap.Modal.getInstance(modalEl).hide();
            await loadSegedanyagok();
            _updateStats();

        } catch (err) {
            console.error('Segédanyag mentési hiba:', err);
            alert('Hiba történt a mentés során: ' + (err.message || err));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ti ti-check me-2"></i>' + (editId ? 'Mentés' : 'Feltöltés');
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDANYAG RÉSZLETES NÉZET
    // ══════════════════════════════════════════════════════════════════════

    async function openSegedanyagDetail(segId) {
        var seg = _segedanyagok.find(function(s) { return s.id === segId; });
        if (!seg) return;

        document.getElementById('mm-seg-detail-title').textContent = seg.cim;
        document.getElementById('mm-seg-detail-meta').innerHTML =
            '<i class="ti ti-user me-1"></i>' + _escHtml(seg.feltolto_nev || '') +
            (seg.feltolto_gyulekezet ? ' — ' + _escHtml(seg.feltolto_gyulekezet) : '') +
            ' | <i class="ti ti-calendar me-1"></i>' + _formatDate(seg.created_at);

        // Értékelések betöltése
        var { data: ertekelesek } = await window._supabase
            .from('mm_segedanyag_ertekelesek')
            .select('*')
            .eq('segedanyag_id', segId)
            .order('created_at', { ascending: false });

        var myRating = 0;
        if (ertekelesek) {
            var myErt = ertekelesek.find(function(e) { return e.user_id === _user.id; });
            if (myErt) myRating = myErt.pontszam;
        }

        var fmtIcon = _getFormatumIcon(seg.formatum);
        var katBadges = _getKategoriaBadges(seg.mm_segedanyag_kategoriak);

        var body = '<div class="row g-3">' +
            '<div class="col-12">' +
            '<div class="d-flex align-items-center gap-3 mb-3">' +
            '<span class="avatar avatar-lg rounded" style="background:' + fmtIcon.bg + '"><i class="' + fmtIcon.icon + ' text-white" style="font-size:1.5rem;"></i></span>' +
            '<div>' +
            '<div class="fw-bold">' + seg.formatum + '</div>' +
            (seg.forras_nev ? '<div class="text-muted small">Forrás: ' + _escHtml(seg.forras_nev) + '</div>' : '') +
            '<div class="text-muted small"><i class="ti ti-download me-1"></i>' + (seg.letoltes_szam || 0) + ' letöltés | ' +
            '<i class="ti ti-star me-1"></i>' + (parseFloat(seg.atlag_ertekeles) || 0).toFixed(1) + ' (' + (seg.ertekelesek_szama || 0) + ' értékelés)</div>' +
            '</div></div></div>';

        if (seg.leiras) {
            body += '<div class="col-12"><div class="border rounded p-3 bg-light-subtle">' +
                '<h4 class="mb-3"><i class="ti ti-file-text me-2"></i>Tartalom</h4>' +
                _formatLeiras(seg.leiras) + '</div></div>';
        }

        body += '<div class="col-12">' + katBadges + '</div>';

        // Saját értékelés
        body += '<div class="col-12"><hr><h4>Értékelés</h4>' +
            '<div class="d-flex align-items-center gap-3">' +
            '<div class="mm-stars" id="mm-seg-rate-stars">';
        for (var i = 1; i <= 5; i++) {
            var cls = i <= myRating ? 'ti ti-star-filled' : 'ti ti-star empty';
            body += '<i class="' + cls + '" style="font-size:24px;cursor:pointer;" onclick="MmApi.rateSegedanyag(\'' + segId + '\',' + i + ')"></i>';
        }
        body += '</div>';
        if (myRating > 0) {
            body += '<span class="text-muted small">Értékelésed: ' + myRating + '/5</span>';
        } else {
            body += '<span class="text-muted small">Kattints a csillagokra az értékeléshez</span>';
        }
        body += '</div></div>';

        // Értékelések listája
        if (ertekelesek && ertekelesek.length > 0) {
            body += '<div class="col-12"><h5 class="mt-2">Vélemények (' + ertekelesek.length + ')</h5>';
            ertekelesek.forEach(function(e) {
                if (e.velemeny) {
                    body += '<div class="border-bottom py-2">' +
                        '<div class="mm-stars">' + _renderStars(e.pontszam) + '</div>' +
                        '<p class="mb-0 small">' + _escHtml(e.velemeny) + '</p>' +
                        '<div class="text-muted small">' + _formatDate(e.created_at) + '</div>' +
                        '</div>';
                }
            });
            body += '</div>';
        }

        body += '</div>';
        document.getElementById('mm-seg-detail-body').innerHTML = body;

        // Footer gombok
        var footer = '<button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Bezárás</button>';
        if (seg.forras_url) {
            footer += '<a href="' + _escHtml(seg.forras_url) + '" target="_blank" class="btn btn-outline-primary" onclick="MmApi.incrementLetoltes(\'' + segId + '\')">' +
                '<i class="ti ti-external-link me-1"></i>Megnyitás</a>';
        }
        if (seg.csatolmany_url) {
            footer += '<a href="https://docs.google.com/gview?url=' + encodeURIComponent(seg.csatolmany_url) + '" target="_blank" class="btn btn-outline-primary" onclick="MmApi.incrementLetoltes(\'' + segId + '\')">' +
                '<i class="ti ti-eye me-1"></i>Megtekintés</a>';
            footer += '<a href="' + _escHtml(seg.csatolmany_url) + '" target="_blank" class="btn btn-primary" onclick="MmApi.incrementLetoltes(\'' + segId + '\')">' +
                '<i class="ti ti-download me-1"></i>Letöltés</a>';
        }
        var isAdmin = seg.feltolto_id === _user.id || _user.role === 'admin' || _user.role === 'superadmin' || _user.role === 'god_mode';
        if (isAdmin) {
            footer += '<button class="btn btn-outline-danger" onclick="MmApi.deleteSegedanyag(\'' + segId + '\')">' +
                '<i class="ti ti-trash me-1"></i>Törlés</button>';
            footer += '<button class="btn btn-outline-warning" onclick="bootstrap.Modal.getInstance(document.getElementById(\'modal-mm-seg-detail\')).hide(); MmApi.openSegedanyagModal(\'' + segId + '\')">' +
                '<i class="ti ti-edit me-1"></i>Szerkesztés</button>';
        }
        document.getElementById('mm-seg-detail-footer').innerHTML = footer;

        var bsModal = new bootstrap.Modal(document.getElementById('modal-mm-seg-detail'));
        bsModal.show();
    }

    // ── Értékelés ──
    async function rateSegedanyag(segId, pontszam) {
        try {
            var { data: existing } = await window._supabase
                .from('mm_segedanyag_ertekelesek')
                .select('id')
                .eq('segedanyag_id', segId)
                .eq('user_id', _user.id)
                .maybeSingle();

            if (existing) {
                await window._supabase
                    .from('mm_segedanyag_ertekelesek')
                    .update({ pontszam: pontszam })
                    .eq('id', existing.id);
            } else {
                await window._supabase
                    .from('mm_segedanyag_ertekelesek')
                    .insert({
                        segedanyag_id: segId,
                        user_id: _user.id,
                        pontszam: pontszam
                    });
                await MmGamification.addPoints('ertekeles_adva', _user.id);
            }

            // Átlag frissítése
            var { data: allErt } = await window._supabase
                .from('mm_segedanyag_ertekelesek')
                .select('pontszam')
                .eq('segedanyag_id', segId);

            if (allErt && allErt.length > 0) {
                var sum = allErt.reduce(function(a, b) { return a + b.pontszam; }, 0);
                var avg = sum / allErt.length;
                await window._supabase
                    .from('mm_segedanyagok')
                    .update({
                        atlag_ertekeles: avg.toFixed(2),
                        ertekelesek_szama: allErt.length
                    })
                    .eq('id', segId);

                // 5 csillagos bonus
                if (pontszam === 5) {
                    var seg = _segedanyagok.find(function(s) { return s.id === segId; });
                    if (seg && seg.feltolto_id !== _user.id) {
                        await MmGamification.addPoints('ot_csillag_kapott', seg.feltolto_id);
                    }
                }
            }

            // Frissítés
            await loadSegedanyagok();
            // Detail modal frissítése
            openSegedanyagDetail(segId);

        } catch (err) {
            console.error('Értékelés hiba:', err);
        }
    }

    // ── Letöltés számlálás ──
    async function incrementLetoltes(segId) {
        try {
            var seg = _segedanyagok.find(function(s) { return s.id === segId; });
            var currentCount = seg ? (seg.letoltes_szam || 0) : 0;
            await window._supabase
                .from('mm_segedanyagok')
                .update({ letoltes_szam: currentCount + 1 })
                .eq('id', segId);

            // 50 letöltés bonus
            if (currentCount + 1 === 50 && seg) {
                await MmGamification.addPoints('50_letoltes', seg.feltolto_id);
                // Értesítés
                await _sendNotification(seg.feltolto_id, 'success',
                    'Segédanyag 50 letöltés!',
                    'A(z) "' + seg.cim + '" segédanyagodat 50-en töltötték le!');
            }
        } catch (err) {
            console.error('Letöltés számláló hiba:', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // KERESÉS ÉS SZŰRÉS
    // ══════════════════════════════════════════════════════════════════════

    function selectSegKategoria(chipEl) {
        // Aktív chip váltás
        document.querySelectorAll('#mm-seg-kategoriak .mm-chip').forEach(function(c) { c.classList.remove('active'); });
        chipEl.classList.add('active');
        _selectedSegKat = chipEl.getAttribute('data-kat-id');
        filterSegedanyagok();
    }

    function filterSegedanyagok() {
        var kereses = (document.getElementById('mm-seg-kereses').value || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        var formatum = document.getElementById('mm-seg-formatum').value;
        var rendezes = document.getElementById('mm-seg-rendezes').value;

        _filteredSeg = _segedanyagok.filter(function(s) {
            // Kategória szűrés
            if (_selectedSegKat) {
                var hasKat = s.mm_segedanyag_kategoriak && s.mm_segedanyag_kategoriak.some(function(sk) {
                    return sk.kategoria_id === parseInt(_selectedSegKat);
                });
                if (!hasKat) return false;
            }

            // Formátum szűrés
            if (formatum && s.formatum !== formatum) return false;

            // Szöveges keresés
            if (kereses) {
                var searchable = ((s.cim || '') + ' ' + (s.leiras || '') + ' ' + (s.feltolto_nev || '') + ' ' + (s.feltolto_gyulekezet || ''))
                    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (searchable.indexOf(kereses) === -1) return false;
            }

            return true;
        });

        // Rendezés
        _filteredSeg.sort(function(a, b) {
            if (rendezes === 'legujabb') return new Date(b.created_at) - new Date(a.created_at);
            if (rendezes === 'legregibb') return new Date(a.created_at) - new Date(b.created_at);
            if (rendezes === 'legjobb') return (b.atlag_ertekeles || 0) - (a.atlag_ertekeles || 0);
            if (rendezes === 'legtobb_letoltes') return (b.letoltes_szam || 0) - (a.letoltes_szam || 0);
            return 0;
        });

        _renderSegedanyagGrid();
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAB VÁLTÁS
    // ══════════════════════════════════════════════════════════════════════

    function switchTab(tab) {
        _currentTab = tab;
        if (tab === 'kozos') {
            renderKozosProjects();
        } else if (tab === 'ranglista') {
            renderRanglista();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // KÖZÖS PROJEKTEK FÜL
    // ══════════════════════════════════════════════════════════════════════

    async function renderKozosProjects() {
        var container = document.getElementById('mm-kozos-munka-content');
        if (!container) return;

        var { data: projektek, error } = await window._supabase
            .from('mm_otletek')
            .select('*, mm_otlet_kategoriak(kategoria_id)')
            .eq('statusz', 'kozos_munka')
            .eq('aktiv', true)
            .order('updated_at', { ascending: false });

        if (error || !projektek || projektek.length === 0) {
            container.innerHTML = '<div class="text-center py-5">' +
                '<i class="ti ti-users-group text-muted" style="font-size:3rem;"></i>' +
                '<h3 class="text-muted mt-3">Még nincsenek aktív közös projektek</h3>' +
                '<p class="text-muted">Amikor egy ötlet eléri az 5 támogató szavazatot, közös munka fázisba kerül.</p>' +
                '</div>';
            return;
        }

        var html = '<div class="row g-3">';
        projektek.forEach(function(p) {
            var katBadges = _getKategoriaBadgesFromIds(p.mm_otlet_kategoriak);
            var progress = p.kidolgozottsag || 0;
            var progressColor = progress < 30 ? 'bg-danger' : progress < 70 ? 'bg-warning' : 'bg-success';

            html += '<div class="col-12 col-md-6">' +
                '<div class="card mm-card" onclick="MmOtletek.openKozosMunka(\'' + p.id + '\')">' +
                '<div class="card-body">' +
                '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<h3 class="card-title mb-0" style="font-size:1rem;">' + _escHtml(p.cim) + '</h3>' +
                '<span class="badge bg-success">' + progress + '%</span>' +
                '</div>' +
                '<div class="progress mm-progress-bar mb-2"><div class="progress-bar ' + progressColor + '" style="width:' + progress + '%"></div></div>' +
                '<p class="text-muted small mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
                    _escHtml(p.leiras) + '</p>' +
                '<div class="mb-2">' + katBadges + '</div>' +
                '<div class="d-flex justify-content-between small text-muted">' +
                '<span><i class="ti ti-user me-1"></i>' + _escHtml(p.otletgazda_nev || '') + '</span>' +
                '<span><i class="ti ti-users me-1"></i>' + (p.csatlakozok_szama || 0) + ' csatlakozó</span>' +
                '</div>' +
                '</div></div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // RANGLISTA FÜL
    // ══════════════════════════════════════════════════════════════════════

    async function renderRanglista() {
        var container = document.getElementById('mm-ranglista-content');
        if (!container) return;

        var { data: stats, error } = await window._supabase
            .from('mm_felhasznalo_statisztika')
            .select('*')
            .order('osszpontszam', { ascending: false })
            .limit(20);

        if (error || !stats || stats.length === 0) {
            container.innerHTML = '<div class="text-center py-5">' +
                '<i class="ti ti-trophy text-muted" style="font-size:3rem;"></i>' +
                '<h3 class="text-muted mt-3">Még nincs ranglista</h3>' +
                '<p class="text-muted">Legyél aktív a Missziós Műhelyben, hogy felkerülj a ranglistára!</p>' +
                '</div>';
            return;
        }

        // User nevek betöltése
        var userIds = stats.map(function(s) { return s.user_id; });
        var { data: profiles } = await window._supabase
            .from('profiles')
            .select('id, full_name, congregation_id')
            .in('id', userIds);

        var congIds = (profiles || []).filter(function(p) { return p.congregation_id; }).map(function(p) { return p.congregation_id; });
        var congregations = {};
        if (congIds.length > 0) {
            var { data: congs } = await window._supabase.from('congregations').select('id, nev_hu').in('id', congIds);
            if (congs) congs.forEach(function(c) { congregations[c.id] = c.nev_hu; });
        }

        var profileMap = {};
        if (profiles) profiles.forEach(function(p) {
            profileMap[p.id] = { nev: p.full_name, gyulekezet: congregations[p.congregation_id] || '' };
        });

        var html = '<div class="table-responsive"><table class="table table-vcenter">' +
            '<thead><tr><th class="w-1">#</th><th>Név</th><th>Gyülekezet</th><th>Szint</th>' +
            '<th class="text-center">Jelvények</th><th class="text-end">Pontszám</th></tr></thead><tbody>';

        stats.forEach(function(s, idx) {
            var p = profileMap[s.user_id] || { nev: 'Ismeretlen', gyulekezet: '' };
            var szint = MmGamification.getSzintInfo(s.osszpontszam);
            var helyezesIcon = idx === 0 ? '<i class="ti ti-trophy text-warning"></i>' :
                               idx === 1 ? '<i class="ti ti-medal text-secondary"></i>' :
                               idx === 2 ? '<i class="ti ti-medal" style="color:#cd7f32;"></i>' : (idx + 1);
            var isMe = s.user_id === _user.id;

            html += '<tr' + (isMe ? ' class="table-active"' : '') + '>' +
                '<td class="fw-bold">' + helyezesIcon + '</td>' +
                '<td>' + _escHtml(p.nev) + (isMe ? ' <span class="badge bg-primary">Én</span>' : '') + '</td>' +
                '<td class="text-muted">' + _escHtml(p.gyulekezet) + '</td>' +
                '<td><i class="' + szint.ikon + ' me-1" style="color:' + szint.szin + ';"></i>' + szint.nev + '</td>' +
                '<td class="text-center">' + (s.jelveny_count || '-') + '</td>' +
                '<td class="text-end fw-bold">' + (s.osszpontszam || 0) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // STATISZTIKÁK FRISSÍTÉSE
    // ══════════════════════════════════════════════════════════════════════

    async function _updateStats() {
        // Segédanyagok száma
        var el1 = document.getElementById('mm-stat-segedanyag');
        if (el1) el1.textContent = _segedanyagok.length;

        // Aktív ötletek
        try {
            var { count: otletCount } = await window._supabase
                .from('mm_otletek')
                .select('id', { count: 'exact', head: true })
                .in('statusz', ['uj', 'szavazas', 'kozos_munka'])
                .eq('aktiv', true);
            var el2 = document.getElementById('mm-stat-otlet');
            if (el2) el2.textContent = otletCount || 0;

            // Közös projektek
            var { count: kozosCount } = await window._supabase
                .from('mm_otletek')
                .select('id', { count: 'exact', head: true })
                .eq('statusz', 'kozos_munka')
                .eq('aktiv', true);
            var el3 = document.getElementById('mm-stat-kozos');
            if (el3) el3.textContent = kozosCount || 0;
        } catch (e) { /* silent */ }

        // Saját pontszám
        try {
            var { data: myStat } = await window._supabase
                .from('mm_felhasznalo_statisztika')
                .select('osszpontszam')
                .eq('user_id', _user.id)
                .maybeSingle();
            var el4 = document.getElementById('mm-stat-pont');
            if (el4) el4.textContent = myStat ? myStat.osszpontszam : 0;
        } catch (e) { /* silent */ }
    }

    function _updateTabCounts() {
        var el = document.getElementById('mm-tab-count-seg');
        if (el) el.textContent = _segedanyagok.length;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÉRTESÍTÉS KÜLDÉS (belső segédfüggvény)
    // ══════════════════════════════════════════════════════════════════════

    async function _sendNotification(userId, tipus, cim, uzenet) {
        try {
            await window._supabase.from('ertesitesek').insert({
                user_id: userId,
                tipus: tipus,
                cim: cim,
                uzenet: uzenet,
                hivatkozas: 'misszios_muhely.html'
            });
        } catch (e) { console.error('Értesítés küldési hiba:', e); }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDFÜGGVÉNYEK
    // ══════════════════════════════════════════════════════════════════════

    function _escHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function _renderStars(rating) {
        var r = parseFloat(rating) || 0;
        var html = '';
        for (var i = 1; i <= 5; i++) {
            if (i <= Math.round(r)) {
                html += '<i class="ti ti-star-filled"></i>';
            } else {
                html += '<i class="ti ti-star empty"></i>';
            }
        }
        return html;
    }

    function _getFormatumIcon(formatum) {
        var map = {
            'PDF':   { icon: 'ti ti-file-type-pdf', class: 'fmt-pdf', bg: '#d63939' },
            'DOCX':  { icon: 'ti ti-file-type-doc', class: 'fmt-docx', bg: '#206bc4' },
            'PPTX':  { icon: 'ti ti-file-type-ppt', class: 'fmt-pptx', bg: '#f76707' },
            'video': { icon: 'ti ti-video', class: 'fmt-video', bg: '#ae3ec9' },
            'link':  { icon: 'ti ti-link', class: 'fmt-link', bg: '#0ca678' },
            'csomag':{ icon: 'ti ti-package', class: 'fmt-csomag', bg: '#f59f00' }
        };
        return map[formatum] || map['link'];
    }

    function _getKategoriaBadges(katJunction) {
        if (!katJunction || katJunction.length === 0) return '';
        var html = '';
        katJunction.forEach(function(sk) {
            var kat = _kategoriak.find(function(k) { return k.id === sk.kategoria_id; });
            if (kat) {
                html += '<span class="badge me-1" style="background:' + kat.szin + ';font-size:0.7rem;">' +
                    '<i class="' + kat.ikon + ' me-1"></i>' + kat.nev + '</span>';
            }
        });
        return html;
    }

    function _getKategoriaBadgesFromIds(katJunction) {
        return _getKategoriaBadges(katJunction);
    }

    // ── Segédanyag leírás formázása (intelligens tördelés) ──
    function _formatLeiras(text) {
        if (!text) return '<p class="text-muted fst-italic">Nincs leírás.</p>';

        var escaped = _escHtml(text);

        // Ha vannak sortörések az adatban, használjuk azokat
        var lines;
        if (escaped.indexOf('\n') !== -1) {
            lines = escaped.split('\n');
        } else {
            // Nincs sortörés — intelligens tördelés a szekció-jelzők mentén
            // Szekció fejlécek előtt sortörés
            escaped = escaped
                .replace(/\s+(Cél:)/g, '\n$1')
                .replace(/\s+(Missziós kategória:)/g, '\n$1')
                .replace(/\s+(Egyházi ünnepkör:)/g, '\n$1')
                .replace(/\s+(Módszertan:)/g, '\n$1')
                .replace(/\s+(Korosztály:)/g, '\n$1')
                .replace(/\s+(Nehézségi szint:)/g, '\n$1')
                .replace(/\s+(Időtartam:)/g, '\n$1')
                .replace(/\s+(Szükséges kellékek)/g, '\n$1')
                .replace(/\s+(Előkészületek:)/g, '\n$1')
                .replace(/\s+(Bevezető\s*[–\-])/g, '\n$1')
                .replace(/\s+(Alapige)/g, '\n$1')
                .replace(/\s+(Igemagyarázat)/g, '\n$1')
                .replace(/\s+(Összefoglalás)/g, '\n$1')
                .replace(/\s+(Záró ima)/g, '\n$1')
                .replace(/\s+(Záró ének)/g, '\n$1')
                .replace(/\s+(Házi feladat)/g, '\n$1')
                .replace(/\s+(Befejezés)/g, '\n$1')
                .replace(/\s+(Alkalmazás)/g, '\n$1')
                .replace(/\s+(Ráhangolódás)/g, '\n$1')
                .replace(/\s+(Feldolgozás)/g, '\n$1')
                .replace(/\s+(Közös megbeszélés)/g, '\n$1')
                .replace(/\s+(Kérdések)/g, '\n$1')
                .replace(/\s+(Csoportmunka)/g, '\n$1');

            // Felsorolás jelek előtt sortörés
            escaped = escaped.replace(/\s*•\s*/g, '\n• ');

            // Emoji szekció-jelzők előtt sortörés (📋🚌🎲📖📎🎯🙏✝️💡🔑 stb.)
            escaped = escaped.replace(/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2702}-\u{27B0}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2B50}\u{270F}\u{271D}\u{2764}\u{1F4CB}\u{1F4D6}\u{1F4CE}\u{1F3B2}\u{1F68C}\u{1F3AF}\u{1F4A1}\u{1F511}\u{1F64F}])/gu, '\n$1');

            // Számozott elemek előtt sortörés (1. 2. 3. stb. de nem dátumok)
            escaped = escaped.replace(/\s+(\d+\.\s+(?:játék|feladat|lépés|kérdés|rész|századi|Názáret|Közép))/g, '\n$1');

            lines = escaped.split('\n');
        }

        // Szekció fejléc kulcsszavak
        var sectionHeaders = [
            'Cél:', 'Missziós kategória:', 'Egyházi ünnepkör:', 'Módszertan:',
            'Korosztály:', 'Nehézségi szint:', 'Időtartam:', 'Szükséges kellékek',
            'Előkészületek:', 'Bevezető', 'Alapige', 'Igemagyarázat',
            'Összefoglalás', 'Záró ima', 'Záró ének', 'Házi feladat',
            'Befejezés', 'Alkalmazás', 'Ráhangolódás', 'Feldolgozás',
            'Közös megbeszélés', 'Kérdések', 'Csoportmunka'
        ];

        var html = '';
        var inBulletList = false;

        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;

            var isBullet = line.charAt(0) === '•' || line.charAt(0) === '-' || line.charAt(0) === '–';

            // Ha bullet list-ből kilépünk
            if (!isBullet && inBulletList) {
                html += '</ul>';
                inBulletList = false;
            }

            if (isBullet) {
                // Felsorolás elem
                if (!inBulletList) {
                    html += '<ul class="mb-2" style="padding-left:1.2rem;">';
                    inBulletList = true;
                }
                html += '<li style="margin-bottom:0.3rem;">' + line.substring(1).trim() + '</li>';
                return;
            }

            // MISSZIÓS MŰHELY fejléc sor
            if (line.indexOf('MISSZIÓS MŰHELY') === 0 || line.indexOf('MISSZIÓ MŰHELY') === 0) {
                html += '<div class="alert alert-primary py-2 px-3 mb-3" style="font-size:0.85rem;">' +
                    '<i class="ti ti-book me-1"></i>' + line + '</div>';
                return;
            }

            // Szekció fejléc (kulcsszó: érték)
            var isSection = false;
            for (var i = 0; i < sectionHeaders.length; i++) {
                if (line.indexOf(sectionHeaders[i]) === 0 ||
                    (line.length > 1 && line.substring(1).trim().indexOf(sectionHeaders[i]) === 0) ||
                    (line.length > 2 && line.substring(2).trim().indexOf(sectionHeaders[i]) === 0)) {
                    isSection = true;
                    break;
                }
            }

            if (isSection) {
                var colonIdx = line.indexOf(':');
                if (colonIdx > 0 && colonIdx < line.length - 1) {
                    var label = line.substring(0, colonIdx + 1);
                    var value = line.substring(colonIdx + 1).trim();
                    html += '<p style="margin-bottom:0.5rem;line-height:1.6;">' +
                        '<strong class="text-primary">' + label + '</strong> ' + value + '</p>';
                } else {
                    // Fejléc kettőspont nélkül (pl. "Bevezető – Ráhangolódás")
                    html += '<h5 class="mt-3 mb-2 text-primary" style="font-size:0.95rem;">' +
                        '<i class="ti ti-chevron-right me-1"></i>' + line + '</h5>';
                }
                return;
            }

            // Emoji-val kezdődő szekció fejléc
            var firstChar = line.codePointAt(0);
            if (firstChar > 255) {
                html += '<h5 class="mt-3 mb-2" style="font-size:0.95rem;">' + line + '</h5>';
                return;
            }

            // Számozott szekció (pl. "0. játék: Szegénység összevetése")
            if (/^\d+\.\s+(játék|feladat|lépés|kérdés|rész)/.test(line)) {
                html += '<h5 class="mt-3 mb-2 text-dark" style="font-size:0.95rem;">' +
                    '<i class="ti ti-hash me-1"></i>' + line + '</h5>';
                return;
            }

            // Normál bekezdés
            html += '<p style="text-align:justify;line-height:1.7;margin-bottom:0.6rem;">' + line + '</p>';
        });

        if (inBulletList) html += '</ul>';

        return html;
    }

    async function deleteSegedanyag(segId) {
        if (!confirm('Biztosan törölni szeretnéd ezt a segédanyagot? Ez a művelet nem vonható vissza!')) return;

        try {
            // Kategória kapcsolatok törlése
            await window._supabase.from('mm_segedanyag_kategoriak').delete().eq('segedanyag_id', segId);
            // Értékelések törlése
            await window._supabase.from('mm_segedanyag_ertekelesek').delete().eq('segedanyag_id', segId);
            // Segédanyag törlése
            var { error } = await window._supabase.from('mm_segedanyagok').delete().eq('id', segId);
            if (error) throw error;

            // Modal bezárás + újratöltés
            var modalEl = document.getElementById('modal-mm-seg-detail');
            var bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();

            await loadSegedanyagok();
            _updateStats();
            alert('Segédanyag sikeresen törölve.');
        } catch (err) {
            console.error('Törlési hiba:', err);
            alert('Hiba történt a törlés során: ' + (err.message || err));
        }
    }

    function getUser() { return _user; }
    function getKategoriak() { return _kategoriak; }
    function sendNotification(userId, tipus, cim, uzenet) { return _sendNotification(userId, tipus, cim, uzenet); }

    // ── Publikus API ──
    return {
        init: init,
        loadSegedanyagok: loadSegedanyagok,
        openSegedanyagModal: openSegedanyagModal,
        handleSegedanyagSubmit: handleSegedanyagSubmit,
        openSegedanyagDetail: openSegedanyagDetail,
        rateSegedanyag: rateSegedanyag,
        incrementLetoltes: incrementLetoltes,
        selectSegKategoria: selectSegKategoria,
        filterSegedanyagok: filterSegedanyagok,
        switchTab: switchTab,
        renderKozosProjects: renderKozosProjects,
        renderRanglista: renderRanglista,
        getUser: getUser,
        getKategoriak: getKategoriak,
        sendNotification: sendNotification,
        deleteSegedanyag: deleteSegedanyag,
        escHtml: _escHtml,
        formatDate: _formatDate,
        renderStars: _renderStars,
        getFormatumIcon: _getFormatumIcon,
        getKategoriaBadges: _getKategoriaBadges
    };
})();
