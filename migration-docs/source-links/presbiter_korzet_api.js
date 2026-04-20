// ============================================================
// PRESBITEREK ÉS KÖRZETEK API
// ============================================================

// ==========================================
// KÖRZETEK (csoport ahol iskorzet = true)
// ==========================================

let allKorzetek = [];
let allPresbiterek = [];

window.loadKorzetek = async function() {
    try {
        const congId = await getActiveCongId();
        if (!congId) return;

        const [korzetRes, presbiterRes, csaladRes] = await Promise.all([
            _supabase.from('csoport').select('id, nev, isaktiv').eq('iskorzet', true).order('nev'),
            _supabase.from('presbiter').select('id, id_szemely, tisztseg, id_csoport, szemely(id, csaladnev, k_nev, ferfi)'),
            _supabase.from('csalad').select('id, id_csoport').not('id_csoport', 'is', null)
        ]);

        allKorzetek = korzetRes.data || [];
        const presbiterekData = presbiterRes.data || [];
        const csaladData = csaladRes.data || [];

        // Körzet nélküli családok számolása
        const allFamRes = await _supabase.from('csalad').select('id, id_csoport')
            .eq('congregation_id', congId);
        const allFamilies = allFamRes.data || [];
        const unassignedCount = allFamilies.filter(f => !f.id_csoport).length;

        const unassignedBar = document.getElementById('korzet-unassigned-bar');
        if (unassignedBar) {
            if (unassignedCount > 0) {
                unassignedBar.style.display = '';
                unassignedBar.removeAttribute('style');
                document.getElementById('korzet-unassigned-count').textContent = unassignedCount;
            } else {
                unassignedBar.style.display = 'none';
            }
        }

        const tbody = document.getElementById('korzet-tbody');
        if (!tbody) return;

        if (allKorzetek.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="ti ti-info-circle me-2"></i>Még nincs körzet rögzítve. Hozzon létre egyet az "Új Körzet" gombbal!</td></tr>';
            return;
        }

        tbody.innerHTML = allKorzetek.map(k => {
            const presbs = presbiterekData.filter(p => p.id_csoport === k.id);
            const familyCount = csaladData.filter(c => c.id_csoport === k.id).length;
            const presbNames = presbs.map(p => `<span class="badge bg-blue-lt me-1">${p.szemely?.csaladnev || ''} ${p.szemely?.k_nev || ''} <small class="text-muted">(${p.tisztseg || ''})</small></span>`).join('') || '<span class="text-muted small">Nincs felelős</span>';

            return `<tr>
                <td class="fw-bold"><i class="ti ti-map-pin me-1 text-warning"></i>${k.nev}</td>
                <td>${presbNames}</td>
                <td><span class="badge bg-success-lt fs-5">${familyCount} család</span></td>
                <td>${k.isaktiv ? '<span class="badge bg-success">Aktív</span>' : '<span class="badge bg-secondary">Inaktív</span>'}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="openKorzetModal(${k.id})"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-warning me-1" onclick="openKorzetFamiliesModal(${k.id}, '${k.nev.replace(/'/g, "\\'")}')"><i class="ti ti-home-heart"></i> Családok</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteKorzet(${k.id}, '${k.nev.replace(/'/g, "\\'")}')"><i class="ti ti-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

    } catch(err) { console.error('Hiba a körzetek betöltésekor:', err); }
};

window.openKorzetModal = async function(korzetId = null) {
    const isEdit = !!korzetId;
    document.getElementById('km-id').value = korzetId || '';
    document.getElementById('km-nev').value = '';
    document.getElementById('km-isaktiv').checked = true;
    document.getElementById('korzet-modal-title').innerHTML = isEdit
        ? '<i class="ti ti-pencil me-2"></i>Körzet Szerkesztése'
        : '<i class="ti ti-map-pin me-2"></i>Új Körzet Létrehozása';

    if (isEdit) {
        const k = allKorzetek.find(x => x.id === korzetId);
        if (k) {
            document.getElementById('km-nev').value = k.nev;
            document.getElementById('km-isaktiv').checked = k.isaktiv;
        }
    }
    new bootstrap.Modal(document.getElementById('modal-korzet')).show();
};

window.handleKorzetSubmit = async function(event) {
    event.preventDefault();
    const id = document.getElementById('km-id').value;
    const payload = {
        nev: document.getElementById('km-nev').value.trim(),
        isaktiv: document.getElementById('km-isaktiv').checked,
        iskorzet: true,
        created: new Date().toISOString()
    };
    const { error } = id
        ? await _supabase.from('csoport').update(payload).eq('id', id)
        : await _supabase.from('csoport').insert(payload);
    if (error) { alert('Hiba: ' + error.message); return; }
    bootstrap.Modal.getInstance(document.getElementById('modal-korzet')).hide();
    loadKorzetek();
};

window.deleteKorzet = async function(id, nev) {
    if (!confirm(`Biztosan törli a(z) "${nev}" körzetet?\n\nA hozzárendelt presbiteri bejegyzések és a körzet-família kapcsolatok is törlődnek!`)) return;
    await _supabase.from('presbiter').delete().eq('id_csoport', id);
    await _supabase.from('csalad').update({ id_csoport: null }).eq('id_csoport', id);
    const { error } = await _supabase.from('csoport').delete().eq('id', id);
    if (error) { alert('Hiba: ' + error.message); return; }
    loadKorzetek();
};

// ==========================================
// KÖRZET – FAMÍLIA HOZZÁRENDELÉS
// ==========================================

let currentKorzetFamiliesId = null;

window.openKorzetFamiliesModal = async function(korzetId, korzetNev) {
    currentKorzetFamiliesId = korzetId;
    document.getElementById('kf-modal-title').textContent = `"${korzetNev}" körzet – Hozzárendelt Családok`;
    document.getElementById('kf-family-tbody').innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border text-primary"></div></td></tr>';
    new bootstrap.Modal(document.getElementById('modal-korzet-families')).show();
    await loadKorzetFamilies(korzetId);
};

async function loadKorzetFamilies(korzetId) {
    const [allFamRes, assignedRes, korzetFilterRes] = await Promise.all([
        _supabase.from('csalad').select('id, c_szam, id_csoport, ferfi:szemely!id_ferfi(csaladnev, k_nev), no:szemely!id_no(csaladnev, k_nev), utca:adrstreet!c_utcaid(id, name)'),
        _supabase.from('csalad').select('id').eq('id_csoport', korzetId),
        _supabase.from('korzetfilter').select('*, adrstreet!utcaid(name)').eq('korzetid', korzetId)
    ]);

    const assigned = new Set((assignedRes.data || []).map(f => f.id));
    const allFams = allFamRes.data || [];
    const filters = korzetFilterRes.data || [];

    // Automatikus egyezések keresése (korzetfilter alapján)
    const autoMatches = new Set();
    allFams.forEach(f => {
        filters.forEach(flt => {
            if (flt.utcaid === f.utca?.id) {
                const hszam = parseInt(f.c_szam);
                const kezdo = flt.kezdoszam;
                const vegso = flt.vegsoszam;
                if (!kezdo && !vegso) { autoMatches.add(f.id); return; }
                if (!isNaN(hszam)) {
                    if ((!kezdo || hszam >= kezdo) && (!vegso || hszam <= vegso)) autoMatches.add(f.id);
                }
            }
        });
    });

    // Auto-hozzárendelés ajánlat
    const unassignedAutoMatches = [...autoMatches].filter(id => !assigned.has(id));
    const autoSuggestBar = document.getElementById('kf-auto-suggest');
    if (unassignedAutoMatches.length > 0 && autoSuggestBar) {
        autoSuggestBar.style.display = '';
        autoSuggestBar.innerHTML = `
            <div class="alert alert-info d-flex align-items-center gap-3">
                <i class="ti ti-wand fs-2 text-info"></i>
                <div>
                    <strong>${unassignedAutoMatches.length} család</strong> cím alapján automatikusan ebbe a körzetbe tartozna.
                    <button class="btn btn-sm btn-info ms-3" onclick="autoAssignFamilies([${unassignedAutoMatches.join(',')}], ${korzetId})">
                        <i class="ti ti-check me-1"></i>Igen, rendelje hozzá automatikusan!
                    </button>
                </div>
            </div>`;
    } else if (autoSuggestBar) {
        autoSuggestBar.style.display = 'none';
    }

    const tbody = document.getElementById('kf-family-tbody');
    if (allFams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Nincs rögzített család.</td></tr>';
        return;
    }

    tbody.innerHTML = allFams.map(f => {
        const isAssigned = assigned.has(f.id);
        const isAuto = autoMatches.has(f.id);
        const ferfiNev = f.ferfi ? `${f.ferfi.csaladnev} ${f.ferfi.k_nev}` : '-';
        const noNev = f.no ? `${f.no.csaladnev} ${f.no.k_nev}` : '-';

        return `<tr class="${isAssigned ? 'table-success-lt' : ''}">
            <td>
                <div class="fw-bold">${ferfiNev}</div>
                <div class="text-muted small">${noNev}</div>
            </td>
            <td class="text-muted">${f.utca?.name || ''} ${f.c_szam || ''}</td>
            <td>${isAuto ? '<span class="badge bg-info-lt text-info">Cím alapján ide tartozik</span>' : ''}</td>
            <td class="text-end">
                ${isAssigned
                    ? `<button class="btn btn-sm btn-success disabled"><i class="ti ti-check me-1"></i>Hozzárendelve</button>
                       <button class="btn btn-sm btn-outline-danger ms-1" onclick="removeFamilyFromKorzet(${f.id}, ${korzetId})"><i class="ti ti-x"></i></button>`
                    : `<button class="btn btn-sm btn-outline-success" onclick="assignFamilyToKorzet(${f.id}, ${korzetId})"><i class="ti ti-plus me-1"></i>Hozzárendel</button>`}
            </td>
        </tr>`;
    }).join('');
}

window.autoAssignFamilies = async function(ids, korzetId) {
    if (!ids || ids.length === 0) return;
    const { error } = await _supabase.from('csalad').update({ id_csoport: korzetId }).in('id', ids);
    if (error) { alert('Hiba: ' + error.message); return; }
    loadKorzetFamilies(korzetId);
    loadKorzetek();
};

window.assignFamilyToKorzet = async function(familyId, korzetId) {
    const { error } = await _supabase.from('csalad').update({ id_csoport: korzetId }).eq('id', familyId);
    if (error) { alert('Hiba: ' + error.message); return; }
    loadKorzetFamilies(korzetId);
    loadKorzetek();
};

window.removeFamilyFromKorzet = async function(familyId, korzetId) {
    const { error } = await _supabase.from('csalad').update({ id_csoport: null }).eq('id', familyId);
    if (error) { alert('Hiba: ' + error.message); return; }
    loadKorzetFamilies(korzetId);
    loadKorzetek();
};

// ==========================================
// PRESBITEREK
// ==========================================

window.loadPresbiterek = async function() {
    try {
        const { data, error } = await _supabase
            .from('presbiter')
            .select('id, tisztseg, id_csoport, szemely(id, csaladnev, k_nev, ferfi, sz_datum, telefon), csoport(id, nev)');
        if (error) throw error;

        allPresbiterek = data || [];
        const tbody = document.getElementById('presbiter-tbody');
        if (!tbody) return;

        if (allPresbiterek.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="ti ti-info-circle me-2"></i>Még nincs presbiter rögzítve. Kattintson az "Új Presbiter" gombra!</td></tr>';
            return;
        }

        // Csoportosítás személy szerint
        const byPerson = {};
        allPresbiterek.forEach(p => {
            const key = p.szemely?.id;
            if (!key) return;
            if (!byPerson[key]) byPerson[key] = { szemely: p.szemely, tisztseg: p.tisztseg, korzetek: [], ids: [] };
            byPerson[key].ids.push(p.id);
            if (p.csoport) byPerson[key].korzetek.push(p.csoport);
        });

        tbody.innerHTML = Object.values(byPerson).map(row => {
            const nev = `${row.szemely.csaladnev || ''} ${row.szemely.k_nev || ''}`.trim();
            const korzetBadges = row.korzetek.length > 0
                ? row.korzetek.map(k => `<span class="badge bg-warning-lt text-warning-emphasis me-1"><i class="ti ti-map-pin me-1"></i>${k.nev}</span>`).join('')
                : '<span class="text-muted small">Nincs körzete</span>';
            const age = row.szemely.sz_datum ? `${new Date().getFullYear() - new Date(row.szemely.sz_datum).getFullYear()} év` : '-';

            return `<tr>
                <td>
                    <div class="fw-bold text-primary">${nev} ${row.szemely.ferfi ? '<i class="ti ti-gender-male text-blue"></i>' : '<i class="ti ti-gender-female text-pink"></i>'}</div>
                    <div class="text-muted small">${row.szemely.telefon || 'Nincs telefon'}</div>
                </td>
                <td><span class="badge bg-blue-lt fs-5">${row.tisztseg || '-'}</span></td>
                <td>${korzetBadges}</td>
                <td class="text-muted">${age}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="openPresbiterModal(${row.szemely.id})"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePresbiter(${row.szemely.id}, '${nev.replace(/'/g, "\\'")}')"><i class="ti ti-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

    } catch(err) { console.error('Hiba a presbiterek betöltésekor:', err); }
};

window.openPresbiterModal = async function(szemelId = null) {
    const isEdit = !!szemelId;
    const congId = await getActiveCongId();

    const [membersRes, korzetRes] = await Promise.all([
        _supabase.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
            .eq('congregation_id', congId)
            .eq('isvisible', true)
            .eq('meghalt', false)
            .order('csaladnev'),
        _supabase.from('csoport').select('id, nev').eq('iskorzet', true).order('nev')
    ]);

    const currentYear = new Date().getFullYear();
    const members = membersRes.data || [];

    // Datalist feltöltése gazdag opcióval (név | kor | cím)
    const dl = document.getElementById('dl-presbiter-members');
    dl.innerHTML = members.map(m => {
        const age = m.sz_datum ? (currentYear - new Date(m.sz_datum).getFullYear()) : '?';
        const addr = [m.adrlocality?.name, m.adrstreet?.name, m.c_szam].filter(Boolean).join(', ');
        const label = `${m.csaladnev} ${m.k_nev} | ${age} év | ${addr || 'Cím nincs megadva'}`;
        return `<option data-id="${m.id}" value="${label}"></option>`;
    }).join('');

    // Hidden ID mező és kereső mező reset
    document.getElementById('pm-szemely').value = '';
    document.getElementById('pm-szemely-search').value = '';

    // Körzetek
    const korzetSel = document.getElementById('pm-korzet');
    korzetSel.innerHTML = '<option value="">-- Nincs körzet hozzárendelve --</option>' +
        (korzetRes.data || []).map(k => `<option value="${k.id}">${k.nev}</option>`).join('');

    document.getElementById('pm-tisztseg').value = '';
    document.getElementById('pm-szemely-hidden').value = '';
    document.getElementById('presbiter-modal-title').innerHTML = '<i class="ti ti-user-star me-2"></i>Presbiter Felvétele / Szerkesztése';

    if (isEdit) {
        const existing = allPresbiterek.filter(p => p.szemely?.id === szemelId);
        if (existing.length > 0) {
            const m = members.find(x => x.id === szemelId);
            if (m) {
                const age = m.sz_datum ? (currentYear - new Date(m.sz_datum).getFullYear()) : '?';
                const addr = [m.adrlocality?.name, m.adrstreet?.name, m.c_szam].filter(Boolean).join(', ');
                document.getElementById('pm-szemely-search').value = `${m.csaladnev} ${m.k_nev} | ${age} év | ${addr || 'Cím nincs megadva'}`;
                document.getElementById('pm-szemely').value = szemelId;
            }
            document.getElementById('pm-tisztseg').value = existing[0].tisztseg || '';
            if (existing[0].id_csoport) korzetSel.value = existing[0].id_csoport;
        }
    }

    new bootstrap.Modal(document.getElementById('modal-presbiter')).show();
};

// Datalist-ből ID kinyerése
window.presSelectFromList = function(value) {
    const options = document.getElementById('dl-presbiter-members').options;
    let foundId = '';
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === value) { foundId = options[i].getAttribute('data-id'); break; }
    }
    document.getElementById('pm-szemely').value = foundId;
};

window.handlePresbiterSubmit = async function(event) {
    event.preventDefault();
    const szemelId = parseInt(document.getElementById('pm-szemely').value);
    const tisztseg = document.getElementById('pm-tisztseg').value.trim();
    const korzetId = document.getElementById('pm-korzet').value || null;

    if (!szemelId) { alert('Kérem, válasszon egyháztagot!'); return; }

    // Töröljük a korábbi presbiteri bejegyzéseket ennél a személynél (ezzel szerkesztés is megvalósul)
    await _supabase.from('presbiter').delete().eq('id_szemely', szemelId);

    // Új bejegyzés mentése
    const { error } = await _supabase.from('presbiter').insert({
        id_szemely: szemelId,
        tisztseg: tisztseg || 'Presbiter',
        id_csoport: korzetId ? parseInt(korzetId) : null
    });

    if (error) { alert('Hiba: ' + error.message); return; }
    bootstrap.Modal.getInstance(document.getElementById('modal-presbiter')).hide();
    loadPresbiterek();
};

window.deletePresbiter = async function(szemelId, nev) {
    if (!confirm(`Biztosan törli ${nev} presbiteri bejegyzéseit?`)) return;
    const { error } = await _supabase.from('presbiter').delete().eq('id_szemely', szemelId);
    if (error) { alert('Hiba: ' + error.message); return; }
    loadPresbiterek();
};

// ==========================================
// KÖRZETEK NYOMTATÁSA
// ==========================================

window.printAllKorzetek = async function() {
    const congId = await getActiveCongId();
    if (!congId) return;

    // Gyülekezet neve
    const { data: congData } = await _supabase.from('congregations').select('name').eq('id', congId).single();
    const congName = congData?.name || 'Gyülekezet';

    // Körzetek és hozzárendelt családok
    const [korzetRes, presRes, csaladRes, szemelyRes] = await Promise.all([
        _supabase.from('csoport').select('id, nev, isaktiv').eq('iskorzet', true).order('nev'),
        _supabase.from('presbiter').select('id, id_csoport, tisztseg, szemely(csaladnev, k_nev)'),
        _supabase.from('csalad').select('id, id_csoport, c_szam, ferfi:szemely!id_ferfi(csaladnev, k_nev, telefon), no:szemely!id_no(csaladnev, k_nev, telefon), utca:adrstreet!c_utcaid(name)')
            .eq('congregation_id', congId).not('id_csoport', 'is', null),
        _supabase.from('gyerek').select('id_csalad, szemely:szemely!id_szemely(csaladnev, k_nev, ferfi, sz_datum)')
    ]);

    const korzetek = korzetRes.data || [];
    const presbiters = presRes.data || [];
    const csaladok = csaladRes.data || [];
    const gyerekek = szemelyRes.data || [];
    const now = new Date().toLocaleDateString('hu-HU');
    const currentYear = new Date().getFullYear();

    let printHtml = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
        <title>Körzetek — ${congName}</title>
        <style>
            @page { margin: 15mm; size: A4; }
            body { font-family: 'Segoe UI', 'Inter', sans-serif; font-size: 11pt; color: #333; }
            h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
            h2 { font-size: 13pt; color: #0ca678; border-bottom: 2px solid #0ca678; padding-bottom: 4px; margin-top: 20px; page-break-after: avoid; }
            .meta { text-align: center; color: #888; font-size: 9pt; margin-bottom: 20px; }
            .presb { font-size: 9pt; color: #555; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th { background: #f0f4f8; text-align: left; padding: 4px 8px; font-size: 9pt; border-bottom: 1px solid #ddd; }
            td { padding: 3px 8px; font-size: 10pt; border-bottom: 1px solid #eee; vertical-align: top; }
            .person-list { font-size: 9pt; color: #666; }
            .badge-male { color: #1565C0; } .badge-female { color: #AD1457; }
            @media print { .no-print { display: none; } }
        </style></head><body>
        <h1>Presbiteri Körzetek — ${congName}</h1>
        <div class="meta">Nyomtatva: ${now}</div>
        <button class="no-print" onclick="window.print()" style="padding:8px 16px;cursor:pointer;">🖨️ Nyomtatás</button>`;

    korzetek.forEach(k => {
        const presbs = presbiters.filter(p => p.id_csoport === k.id);
        const fams = csaladok.filter(c => c.id_csoport === k.id);
        const presbNev = presbs.map(p => `${p.szemely?.csaladnev || ''} ${p.szemely?.k_nev || ''} (${p.tisztseg || 'Presbiter'})`).join(', ') || 'Nincs felelős';

        printHtml += `<h2><span style="margin-right:8px;">📍</span>${k.nev}</h2>`;
        printHtml += `<div class="presb"><strong>Felelős:</strong> ${presbNev} | <strong>Családok száma:</strong> ${fams.length}</div>`;

        if (fams.length === 0) {
            printHtml += '<p style="color:#aaa;font-size:9pt;">Nincs hozzárendelt család.</p>';
        } else {
            printHtml += '<table><thead><tr><th>#</th><th>Család</th><th>Cím</th><th>Személyek</th></tr></thead><tbody>';
            fams.forEach((f, idx) => {
                const ferfiNev = f.ferfi ? `${f.ferfi.csaladnev} ${f.ferfi.k_nev}` : '-';
                const noNev = f.no ? `${f.no.csaladnev} ${f.no.k_nev}` : '';
                const cim = [f.utca?.name, f.c_szam].filter(Boolean).join(' ') || '-';
                const children = gyerekek.filter(g => g.id_csalad === f.id);
                const childHtml = children.map(c => {
                    const age = c.szemely?.sz_datum ? `${currentYear - new Date(c.szemely.sz_datum).getFullYear()} é.` : '';
                    const cls = c.szemely?.ferfi ? 'badge-male' : 'badge-female';
                    return `<span class="${cls}">${c.szemely?.ferfi ? '♂' : '♀'} ${c.szemely?.csaladnev || ''} ${c.szemely?.k_nev || ''} ${age}</span>`;
                }).join(', ');

                printHtml += `<tr>
                    <td>${idx + 1}.</td>
                    <td><strong>${ferfiNev}</strong>${noNev ? '<br><span style="color:#888;">' + noNev + '</span>' : ''}</td>
                    <td>${cim}</td>
                    <td class="person-list">${childHtml || '-'}</td>
                </tr>`;
            });
            printHtml += '</tbody></table>';
        }
    });

    printHtml += '</body></html>';

    const printWin = window.open('', '_blank');
    printWin.document.write(printHtml);
    printWin.document.close();
};

// ==========================================
// SEGÉDFÜGGVÉNY: congregation_id lekérés
// ==========================================
async function getActiveCongId() {
    if (window.activeCongregationId) return window.activeCongregationId;
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
    if (profile) window.activeCongregationId = profile.congregation_id;
    return profile?.congregation_id || null;
}

// ==========================================
// KÖRZET NÉLKÜLI CSALÁDOK ÉS SZEMÉLYEK
// ==========================================

window.showUnassignedFamilies = async function() {
    const congId = await getActiveCongId();
    if (!congId) return;

    const [famRes, allCsaladRes, gyerekAllRes, szemelyRes, korzetRes] = await Promise.all([
        _supabase.from('csalad')
            .select('id, c_szam, id_ferfi, id_no, ferfi:szemely!id_ferfi(id, csaladnev, k_nev), no:szemely!id_no(id, csaladnev, k_nev), utca:adrstreet!c_utcaid(name)')
            .eq('congregation_id', congId)
            .is('id_csoport', null)
            .order('id'),
        _supabase.from('csalad').select('id, id_ferfi, id_no').eq('congregation_id', congId),
        _supabase.from('gyerek').select('id_szemely, id_csalad'),
        _supabase.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, adrstreet!c_utcaid(name)')
            .eq('congregation_id', congId)
            .eq('isvisible', true)
            .eq('meghalt', false),
        _supabase.from('csoport').select('id, nev').eq('iskorzet', true).order('nev')
    ]);

    const fams = famRes.data || [];
    const allCsaladok = allCsaladRes.data || [];
    const allGyerekek = gyerekAllRes.data || [];
    const allSzemelyek = szemelyRes.data || [];
    const korzetek = korzetRes.data || [];

    const familyIds = fams.map(f => f.id);
    const gyerekekInUnassigned = allGyerekek.filter(g => familyIds.includes(g.id_csalad));

    const personInFamily = new Set();
    allCsaladok.forEach(c => {
        if (c.id_ferfi) personInFamily.add(c.id_ferfi);
        if (c.id_no) personInFamily.add(c.id_no);
    });
    allGyerekek.forEach(g => { personInFamily.add(g.id_szemely); });

    const orphanPersons = allSzemelyek.filter(s => !personInFamily.has(s.id));
    const totalCount = fams.length + orphanPersons.length;

    // Körzet dropdown opciók
    const korzetOptions = korzetek.map(k => `<option value="${k.id}">${k.nev}</option>`).join('');

    let html = `<div class="modal fade" id="modal-unassigned" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header bg-warning-lt">
                    <h5 class="modal-title"><i class="ti ti-alert-triangle me-2"></i>Körzet nélküli (${totalCount}: ${fams.length} család, ${orphanPersons.length} egyéni személy)</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-0">`;

    if (totalCount === 0) {
        html += '<div class="p-5 text-center text-muted"><i class="ti ti-check-circle fs-1 text-success d-block mb-2"></i>Minden család és személy hozzá van rendelve egy körzethez!</div>';
    } else {
        // Gyors hozzárendelés felső sáv
        if (korzetek.length > 0) {
            html += `<div class="p-3 bg-light border-bottom d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-bold text-muted"><i class="ti ti-wand me-1"></i>Gyors hozzárendelés:</span>
                <select id="ua-korzet-select" class="form-select form-select-sm" style="width:200px;">
                    <option value="">-- Válasszon körzetet --</option>${korzetOptions}
                </select>
                <button class="btn btn-sm btn-success" onclick="assignAllUnassigned()"><i class="ti ti-checks me-1"></i>Mindet ide rendeli</button>
            </div>`;
        }

        // Családok
        if (fams.length > 0) {
            html += '<h6 class="px-3 pt-3 pb-1 mb-0 text-muted"><i class="ti ti-home-heart me-1"></i>Családok (' + fams.length + ')</h6>';
            html += '<table class="table table-sm table-vcenter table-hover mb-0"><thead class="bg-light"><tr><th style="width:40px">#</th><th>Család</th><th>Cím</th><th>Családtagok</th><th style="width:200px">Hozzárendelés</th></tr></thead><tbody>';
            fams.forEach((f, idx) => {
                const ferfiNev = f.ferfi ? `${f.ferfi.csaladnev} ${f.ferfi.k_nev}` : '-';
                const noNev = f.no ? `${f.no.csaladnev} ${f.no.k_nev}` : '';
                const cim = [f.utca?.name, f.c_szam].filter(Boolean).join(' ') || '-';
                const familyPersons = gyerekekInUnassigned.filter(p => p.id_csalad === f.id);
                const childHtml = familyPersons.map(p => {
                    const ch = allSzemelyek.find(s => s.id === p.id_szemely);
                    if (!ch) return '';
                    return `<span class="badge bg-blue-lt me-1 mb-1">${ch.ferfi ? '♂' : '♀'} ${ch.csaladnev || ''} ${ch.k_nev || ''}</span>`;
                }).filter(Boolean).join('') || '<span class="text-muted small">-</span>';

                html += `<tr id="ua-row-${f.id}">
                    <td class="text-muted">${idx + 1}.</td>
                    <td><div class="fw-bold">${ferfiNev}</div>${noNev ? `<div class="text-muted small">${noNev}</div>` : ''}</td>
                    <td class="text-muted">${cim}</td>
                    <td>${childHtml}</td>
                    <td>
                        <select class="form-select form-select-sm ua-korzet-item" data-fam-id="${f.id}" style="font-size:0.8rem;">
                            <option value="">-- Körzet --</option>${korzetOptions}
                        </select>
                        <button class="btn btn-sm btn-outline-success mt-1 w-100" onclick="assignSingleFamily(${f.id})"><i class="ti ti-check me-1"></i>Rendel</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        // Egyéni személyek
        if (orphanPersons.length > 0) {
            html += '<h6 class="px-3 pt-3 pb-1 mb-0 text-muted"><i class="ti ti-user me-1"></i>Családhoz nem tartozó személyek (' + orphanPersons.length + ')</h6>';
            html += '<div class="alert alert-info mx-3 mt-2 small"><i class="ti ti-info-circle me-1"></i>Ezek a személyek semmilyen családhoz nem tartoznak. Körzet-hozzárendeléshez előbb rendelje őket egy családhoz!</div>';
            html += '<table class="table table-sm table-vcenter table-hover mb-0"><thead class="bg-light"><tr><th>#</th><th>Név</th><th>Cím</th></tr></thead><tbody>';
            orphanPersons.forEach((s, idx) => {
                const nev = `${s.csaladnev || ''} ${s.k_nev || ''}`.trim();
                const cim = [s.adrstreet?.name, s.c_szam].filter(Boolean).join(' ') || '-';
                const gIcon = s.ferfi ? '<i class="ti ti-gender-male text-blue me-1"></i>' : '<i class="ti ti-gender-female text-pink me-1"></i>';
                html += `<tr>
                    <td class="text-muted">${idx + 1}.</td>
                    <td class="fw-bold">${gIcon}${nev}</td>
                    <td class="text-muted">${cim}</td>
                </tr>`;
            });
            html += '</tbody></table>';
        }
    }

    html += `</div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Bezárás</button>
                </div>
            </div>
        </div>
    </div>`;

    const existing = document.getElementById('modal-unassigned');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', html);
    new bootstrap.Modal(document.getElementById('modal-unassigned')).show();
};

// Egy család hozzárendelése körzethez a modálból
window.assignSingleFamily = async function(famId) {
    const sel = document.querySelector(`#ua-row-${famId} .ua-korzet-item`);
    const korzetId = sel ? parseInt(sel.value) : null;
    if (!korzetId) { alert('Válasszon körzetet!'); return; }

    const { error } = await _supabase.from('csalad').update({ id_csoport: korzetId }).eq('id', famId);
    if (error) { alert('Hiba: ' + error.message); return; }

    // Sor elhalványítása
    const row = document.getElementById('ua-row-' + famId);
    if (row) { row.style.opacity = '0.3'; row.style.pointerEvents = 'none'; }
    loadKorzetek();
};

// Összes körzet nélküli család hozzárendelése egy körzethez
window.assignAllUnassigned = async function() {
    const korzetId = parseInt(document.getElementById('ua-korzet-select')?.value);
    if (!korzetId) { alert('Válasszon körzetet a legördülőből!'); return; }

    const congId = await getActiveCongId();
    if (!congId) return;

    if (!confirm('Biztosan az összes körzet nélküli családot ebbe a körzetbe rendeli?')) return;

    const { error } = await _supabase.from('csalad')
        .update({ id_csoport: korzetId })
        .eq('congregation_id', congId)
        .is('id_csoport', null);

    if (error) { alert('Hiba: ' + error.message); return; }

    bootstrap.Modal.getInstance(document.getElementById('modal-unassigned'))?.hide();
    loadKorzetek();
};

// ==========================================
// VÁLASZTÓK NÉVJEGYZÉKE
// ==========================================

let allValasztok = [];

window.loadValasztok = async function() {
    const congId = await getActiveCongId();
    if (!congId) return;

    const currentYear = new Date().getFullYear();

    // Személy adatok + konfirmálás + család (körzet info) + település + járulékbefizetés
    const [szemelyRes, konfirmRes, csaladRes, korzetRes, gyerekRes, jarulek101Res, celMapRes] = await Promise.all([
        _supabase.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt, isvisible, foglalkozas, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
            .eq('congregation_id', congId)
            .eq('isvisible', true)
            .eq('meghalt', false)
            .order('csaladnev'),
        _supabase.from('konfirmalas').select('id_szemely'),
        _supabase.from('csalad').select('id, id_csoport, id_ferfi, id_no'),
        _supabase.from('csoport').select('id, nev').eq('iskorzet', true).order('nev'),
        _supabase.from('gyerek').select('id_szemely, id_csalad'),
        // Egyházfenntartói járulék befizetések (befizetes + befizetescel → szamadasicel kód)
        _supabase.from('befizetes')
            .select('id_szemely, fizetettev, befizetescel!id_befizetescel(szamadasicel(kod))')
            .eq('congregation_id', congId),
        // Dummy — nem használt, de a destrukturálás miatt kell
        Promise.resolve({ data: null })
    ]);

    const szemelyek = szemelyRes.data || [];
    const konfirmaltIds = new Set((konfirmRes.data || []).map(k => k.id_szemely));
    const csaladok = csaladRes.data || [];
    const korzetek = korzetRes.data || [];
    const gyerekLinks = gyerekRes.data || [];

    // Járulék-befizetések feldolgozása — személyenként, mely évekre fizetett
    const jarulek101 = jarulek101Res.data || [];
    const prevYear = currentYear - 1;
    const jarulekEvekBySzemely = {}; // { szemely_id: Set([2022, 2023, 2024]) }
    const jarulekFizetoIds = new Set();
    const allJarulekEvek = new Set();

    jarulek101.forEach(function(b) {
        var celKod = b.befizetescel?.szamadasicel?.kod || '';
        if (celKod === '101.01' || celKod.startsWith('101.01')) {
            var ev = parseInt(b.fizetettev);
            if (ev) {
                if (!jarulekEvekBySzemely[b.id_szemely]) jarulekEvekBySzemely[b.id_szemely] = new Set();
                jarulekEvekBySzemely[b.id_szemely].add(ev);
                allJarulekEvek.add(ev);
                if (ev >= prevYear) jarulekFizetoIds.add(b.id_szemely);
            }
        }
    });

    // Év-szűrő dropdown feltöltése
    var evSelect = document.getElementById('val-filter-jarulek-ev');
    if (evSelect) {
        var sortedEvek = Array.from(allJarulekEvek).sort(function(a, b) { return b - a; });
        evSelect.innerHTML = '<option value="">Járulék éve: összes</option>' +
            sortedEvek.map(function(ev) {
                return '<option value="' + ev + '"' + (ev === prevYear ? ' selected' : '') + '>Legalább ' + ev + '-ig fizette</option>';
            }).join('');
    }

    // Családhoz tartozó körzet meghatározása személyenként
    function getKorzet(szemelId) {
        // Először: családfő-ként (ferfi vagy nő)
        let fam = csaladok.find(c => c.id_ferfi === szemelId || c.id_no === szemelId);
        // Ha nem családfő, keressük a gyerek linkben
        if (!fam) {
            const link = gyerekLinks.find(g => g.id_szemely === szemelId);
            if (link) fam = csaladok.find(c => c.id === link.id_csalad);
        }
        if (!fam || !fam.id_csoport) return null;
        return korzetek.find(k => k.id === fam.id_csoport);
    }

    // Választók: 18+ éves, élő, nem rejtett
    allValasztok = szemelyek.filter(m => {
        if (!m.sz_datum) return false;
        const age = currentYear - new Date(m.sz_datum).getFullYear();
        return age >= 18;
    }).map(m => {
        const age = currentYear - new Date(m.sz_datum).getFullYear();
        const korzet = getKorzet(m.id);
        return {
            id: m.id,
            nev: `${m.csaladnev || ''} ${m.k_nev || ''}`.trim(),
            csaladnev: m.csaladnev || '',
            ferfi: m.ferfi,
            age: age,
            foglalkozas: m.foglalkozas || '',
            lakcim: [m.adrstreet?.name, m.c_szam].filter(Boolean).join(' ') || '-',
            lakhely: m.adrlocality?.name || '-',
            konfirmalt: konfirmaltIds.has(m.id),
            jarulekFizeto: jarulekFizetoIds.has(m.id),
            jarulekEvek: jarulekEvekBySzemely[m.id] ? Array.from(jarulekEvekBySzemely[m.id]) : [],
            jarulekMaxEv: jarulekEvekBySzemely[m.id] ? Math.max(...jarulekEvekBySzemely[m.id]) : 0,
            korzet_nev: korzet?.nev || '',
            korzet_id: korzet?.id || null
        };
    });

    // Körzet szűrő feltöltése
    const korzetSelect = document.getElementById('val-filter-korzet');
    if (korzetSelect) {
        korzetSelect.innerHTML = '<option value="">Minden körzet</option>' +
            korzetek.map(k => `<option value="${k.id}">${k.nev}</option>`).join('') +
            '<option value="none">Körzet nélküli</option>';
    }

    // Összefoglaló kártyák
    const jarulekosValasztok = allValasztok.filter(v => v.jarulekFizeto);
    document.getElementById('val-total').textContent = jarulekosValasztok.length;
    document.getElementById('val-male').textContent = jarulekosValasztok.filter(v => v.ferfi).length;
    document.getElementById('val-female').textContent = jarulekosValasztok.filter(v => !v.ferfi).length;
    document.getElementById('val-konfirmalt').textContent = jarulekosValasztok.filter(v => v.konfirmalt).length;

    filterValasztok();
};

window.filterValasztok = function() {
    const search = (document.getElementById('val-search')?.value || '').toLowerCase();
    const korzetFilter = document.getElementById('val-filter-korzet')?.value || '';
    const nemFilter = document.getElementById('val-filter-nem')?.value || '';
    const sortBy = document.getElementById('val-sort')?.value || 'name_asc';
    const jarulekFilter = document.getElementById('val-filter-jarulek')?.value || 'fizeto';
    const jarulekEvFilter = parseInt(document.getElementById('val-filter-jarulek-ev')?.value) || 0;

    let filtered = allValasztok.filter(v => {
        if (search && !v.nev.toLowerCase().includes(search)) return false;
        if (korzetFilter === 'none' && v.korzet_id) return false;
        if (korzetFilter === 'none' && !v.korzet_id) return true;
        if (korzetFilter && v.korzet_id !== parseInt(korzetFilter)) return false;
        if (nemFilter === 'ferfi' && !v.ferfi) return false;
        if (nemFilter === 'no' && v.ferfi) return false;
        // Járulék szűrő
        if (jarulekFilter === 'fizeto') {
            if (jarulekEvFilter) {
                // Legalább a megadott évig fizette
                if (v.jarulekMaxEv < jarulekEvFilter) return false;
            } else {
                if (!v.jarulekFizeto) return false;
            }
        }
        if (jarulekFilter === 'nem_fizeto') {
            if (jarulekEvFilter) {
                if (v.jarulekMaxEv >= jarulekEvFilter) return false;
            } else {
                if (v.jarulekFizeto) return false;
            }
        }
        return true;
    });

    // Rendezés
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'name_desc': return b.nev.localeCompare(a.nev, 'hu');
            case 'age_asc': return a.age - b.age;
            case 'age_desc': return b.age - a.age;
            case 'address': return a.lakcim.localeCompare(b.lakcim, 'hu');
            default: return a.nev.localeCompare(b.nev, 'hu');
        }
    });

    const countBadge = document.getElementById('val-filtered-count');
    if (countBadge) {
        countBadge.textContent = filtered.length === allValasztok.length
            ? `${filtered.length} választó`
            : `${filtered.length} / ${allValasztok.length} választó`;
    }

    const tbody = document.getElementById('val-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><i class="ti ti-mood-empty me-2"></i>Nincs találat a szűrők alapján.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((v, idx) => {
        const genderIcon = v.ferfi ? '<i class="ti ti-gender-male text-blue"></i>' : '<i class="ti ti-gender-female text-pink"></i>';
        const konfBadge = v.konfirmalt ? '<i class="ti ti-check text-green ms-1" title="Konfirmált"></i>' : '';
        const jarulekBadge = v.jarulekFizeto
            ? '<i class="ti ti-coin text-success ms-1" title="Járulékot fizetett"></i>'
            : '<i class="ti ti-coin-off text-danger ms-1" title="Nem fizetett járulékot"></i>';
        return `<tr>
            <td class="text-muted">${idx + 1}.</td>
            <td class="fw-bold">${genderIcon} ${v.nev}${konfBadge}${jarulekBadge}</td>
            <td class="text-muted">${v.foglalkozas}</td>
            <td>${v.lakcim}</td>
            <td>${v.lakhely}</td>
            <td class="text-muted">${v.age} év</td>
            <td>${v.korzet_nev ? `<span class="badge bg-teal-lt">${v.korzet_nev}</span>` : '<span class="text-muted small">-</span>'}</td>
        </tr>`;
    }).join('');
};

// Választók névjegyzéke nyomtatása — hivatalos formátum
window.printValasztok = async function() {
    const congId = await getActiveCongId();
    if (!congId) return;

    // Gyülekezet adatai
    const { data: congData } = await _supabase.from('congregations')
        .select('name, address, phone').eq('id', congId).single();
    const congName = congData?.name || 'Gyülekezet';
    const congAddr = congData?.address || '';
    const congPhone = congData?.phone || '';

    // Profil (lelkipásztor neve)
    const { data: { user } } = await _supabase.auth.getUser();
    const { data: profile } = await _supabase.from('profiles')
        .select('full_name').eq('id', user.id).single();
    const lelkeszNev = profile?.full_name || '________________________';

    const currentYear = new Date().getFullYear();
    const now = new Date().toLocaleDateString('hu-HU');

    // Szűrt lista használata (aktuális szűrők alapján)
    const search = (document.getElementById('val-search')?.value || '').toLowerCase();
    const jarulekFilter = document.getElementById('val-filter-jarulek')?.value || 'fizeto';
    const jarulekEvFilter = parseInt(document.getElementById('val-filter-jarulek-ev')?.value) || 0;
    let list = allValasztok;
    if (jarulekFilter === 'fizeto') {
        if (jarulekEvFilter) list = list.filter(v => v.jarulekMaxEv >= jarulekEvFilter);
        else list = list.filter(v => v.jarulekFizeto);
    } else if (jarulekFilter === 'nem_fizeto') {
        if (jarulekEvFilter) list = list.filter(v => v.jarulekMaxEv < jarulekEvFilter);
        else list = list.filter(v => !v.jarulekFizeto);
    }
    if (search) list = list.filter(v => v.nev.toLowerCase().includes(search));
    // Rendezés név szerint
    list = [...list].sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));

    let printHtml = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
        <title>Választók névjegyzéke — ${congName}</title>
        <style>
            @page { margin: 10mm 12mm; size: A4; }
            body { font-family: 'Times New Roman', serif; font-size: 9pt; color: #000; margin: 0; }
            .header { text-align: center; margin-bottom: 8px; }
            .header h1 { font-size: 13pt; margin: 0; }
            .header .subtitle { font-size: 10pt; color: #555; margin-top: 2px; }
            .header .church-info { font-size: 8pt; color: #333; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { background: #f0f0f0; padding: 2px 4px; font-size: 8pt; border: 1px solid #999; text-align: left; white-space: nowrap; }
            td { padding: 1px 4px; font-size: 8.5pt; border: 1px solid #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
            col.col-nr { width: 28px; }
            col.col-name { width: 25%; }
            col.col-job { width: 16%; }
            col.col-addr { width: 20%; }
            col.col-city { width: 14%; }
            col.col-presb { width: 10%; }
            col.col-esper { width: 10%; }
            .footer-text { font-size: 7.5pt; color: #555; margin-top: 10px; line-height: 1.4; }
            .signatures { margin-top: 25px; display: flex; justify-content: space-between; font-size: 9pt; }
            .sig-block { text-align: center; }
            .sig-line { border-top: 1px solid #000; width: 180px; margin: 0 auto; padding-top: 3px; }
            @media print {
                .no-print { display: none; }
                thead { display: table-header-group; }
            }
        </style></head><body>
        <div class="header">
            <h1>Választók névjegyzéke [ ${currentYear} - ${currentYear + 1} ]</h1>
            <div class="subtitle">${congName}</div>
            <div class="church-info">${congAddr}${congPhone ? ' | Tel: ' + congPhone : ''}</div>
        </div>
        <button class="no-print" onclick="window.print()" style="padding:8px 16px;cursor:pointer;margin-bottom:8px;">🖨️ Nyomtatás</button>
        <table>
            <colgroup>
                <col class="col-nr"><col class="col-name"><col class="col-job"><col class="col-addr"><col class="col-city"><col class="col-presb"><col class="col-esper">
            </colgroup>
            <thead>
                <tr>
                    <th>S.sz.</th>
                    <th>Választó neve</th>
                    <th>Foglalkozás</th>
                    <th>Lakcím</th>
                    <th>Lakhelye</th>
                    <th>Felsz. Presb.</th>
                    <th>Felsz. Esper.</th>
                </tr>
            </thead>
            <tbody>`;

    list.forEach((v, idx) => {
        printHtml += `<tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${v.nev}</td>
            <td>${v.foglalkozas}</td>
            <td>${v.lakcim}</td>
            <td>${v.lakhely}</td>
            <td></td>
            <td></td>
        </tr>`;
    });

    printHtml += `</tbody></table>
        <div class="footer-text">
            A névjegyzék az Erdélyi Református Egyházkerület Kánona értelmében készült.
            A választói névjegyzékbe azok a konfirmált egyháztagok kerültek felvételre,
            akik a ${currentYear}. év január 1-jén betöltötték 18. életévüket,
            az egyházközség területén laknak, és egyházi kötelezettségeiknek eleget tesznek.
            <br>Összes választó: <strong>${list.length} fő</strong>
        </div>
        <div class="signatures">
            <div class="sig-block">
                <div class="sig-line">${lelkeszNev}</div>
                <div>Lelkipásztor</div>
            </div>
            <div class="sig-block">
                <div class="sig-line">________________________</div>
                <div>Gondnok</div>
            </div>
        </div>
        <div style="text-align:center;font-size:8pt;color:#999;margin-top:20px;">
            Készült: ${now} | Kartotéka Rendszer — Erdélyi Református Egyházkerület
        </div>
    </body></html>`;

    const printWin = window.open('', '_blank');
    printWin.document.write(printHtml);
    printWin.document.close();
};

// ==========================================
// VÁLASZTÓK NÉVJEGYZÉKE — HITELESÍTÉS
// ==========================================

window.loadNevjegyzekStatus = async function() {
    var congId = await getActiveCongId();
    if (!congId) return;
    var curYear = new Date().getFullYear().toString();

    var { data: bData } = await _supabase.from('bealitas')
        .select('nevjegyzek_finalized, nevjegyzek_unlock_requested, nevjegyzek_iktatoszam, nevjegyzek_hatarozat_datum, nevjegyzek_hatarozat_szam, nevjegyzek_letszam')
        .eq('id', curYear).eq('congregation_id', congId).maybeSingle();

    var statusBar = document.getElementById('nevjegyzek-status-bar');
    if (!statusBar) return;

    var finalized = bData?.nevjegyzek_finalized || false;
    var unlockReq = bData?.nevjegyzek_unlock_requested || false;

    if (finalized) {
        var meta = [];
        if (bData.nevjegyzek_iktatoszam) meta.push('Iktatószám: ' + bData.nevjegyzek_iktatoszam);
        if (bData.nevjegyzek_hatarozat_szam) meta.push('Határozat: ' + bData.nevjegyzek_hatarozat_szam);
        if (bData.nevjegyzek_hatarozat_datum) meta.push('Dátum: ' + bData.nevjegyzek_hatarozat_datum);
        if (bData.nevjegyzek_letszam) meta.push('Létszám: ' + bData.nevjegyzek_letszam + ' fő');
        var metaHtml = meta.length > 0 ? '<div class="text-muted small mt-1">' + meta.join(' | ') + '</div>' : '';
        statusBar.innerHTML = `<div class="alert alert-success d-flex align-items-center gap-3 mb-3">
            <i class="ti ti-shield-check fs-1 text-success"></i>
            <div class="flex-grow-1">
                <strong>A választók névjegyzéke hitelesítve van.</strong>${metaHtml}
            </div>
            ${unlockReq
                ? '<span class="badge bg-warning">Feloldás kérelmezve</span>'
                : '<button class="btn btn-sm btn-outline-warning" onclick="requestNevjegyzekUnlock()"><i class="ti ti-lock-open me-1"></i>Feloldás kérelmezése</button>'}
        </div>`;
    } else {
        statusBar.innerHTML = `<div class="alert alert-warning d-flex align-items-center gap-3 mb-3">
            <i class="ti ti-shield-x fs-1 text-warning"></i>
            <div class="flex-grow-1">
                <strong>A választók névjegyzéke még nincs hitelesítve.</strong>
                <div class="text-muted small">Hitelesítés után a névjegyzék megjelenik az egyházmegyei felületen és nem módosítható.</div>
            </div>
            <button class="btn btn-sm btn-success" onclick="finalizeNevjegyzek()"><i class="ti ti-shield-check me-1"></i>Hitelesítés</button>
        </div>`;
    }
};

window.finalizeNevjegyzek = async function() {
    var jarulekFilter = document.getElementById('val-filter-jarulek')?.value || 'fizeto';
    var count = allValasztok.filter(function(v) {
        if (jarulekFilter === 'fizeto') return v.jarulekFizeto;
        if (jarulekFilter === 'nem_fizeto') return !v.jarulekFizeto;
        return true;
    }).length;

    if (count === 0) {
        alert('A névjegyzék üres! Nem lehet hitelesíteni üres névjegyzéket.');
        return;
    }

    var iktatoszam = prompt('Egyházközségi iktatószám:');
    if (iktatoszam === null) return;
    var hatSzam = prompt('Presbitériumi határozat száma:');
    if (hatSzam === null) return;
    var hatDatum = prompt('Presbitériumi határozat dátuma (ÉÉÉÉ-HH-NN):');
    if (hatDatum === null) return;

    if (!confirm('Biztosan hitelesíti a választók névjegyzékét?\n\nLétszám: ' + count + ' fő\nIktatószám: ' + iktatoszam + '\nHatározat: ' + hatSzam + '\n\nA hitelesítés után a névjegyzék nem módosítható!')) return;

    var congId = await getActiveCongId();
    var curYear = new Date().getFullYear().toString();

    var { error } = await _supabase.from('bealitas').update({
        nevjegyzek_finalized: true,
        nevjegyzek_iktatoszam: iktatoszam || null,
        nevjegyzek_hatarozat_szam: hatSzam || null,
        nevjegyzek_hatarozat_datum: hatDatum || null,
        nevjegyzek_letszam: count
    }).eq('id', curYear).eq('congregation_id', congId);

    if (error) { alert('Hiba: ' + error.message); return; }
    loadNevjegyzekStatus();
};

window.requestNevjegyzekUnlock = async function() {
    var reason = prompt('Kérem, adja meg a feloldás kérésének indokát:');
    if (reason === null) return;

    var congId = await getActiveCongId();
    var curYear = new Date().getFullYear().toString();

    var { error } = await _supabase.from('bealitas').update({
        nevjegyzek_unlock_requested: true,
        nevjegyzek_unlock_reason: reason || ''
    }).eq('id', curYear).eq('congregation_id', congId);

    if (error) { alert('Hiba: ' + error.message); return; }
    alert('A feloldási kérelem elküldve az egyházmegyének.');
    loadNevjegyzekStatus();
};

// ==========================================
// VÁLASZTÓK NÉVJEGYZÉKE (Electoral Roll)
// ==========================================

window.openElectoralRollModal = async function() {
    const curYear = new Date().getFullYear();
    const yearSel = document.getElementById('er-year');
    yearSel.innerHTML = '';
    for (let y = curYear - 1; y >= curYear - 6; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '. év';
        if (y === curYear - 1) opt.selected = true;
        yearSel.appendChild(opt);
    }

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (user) {
            const { data: prof } = await _supabase.from('profiles').select('nev').eq('id', user.id).single();
            if (prof?.nev) document.getElementById('er-sign-lelkesz').value = prof.nev;
        }
    } catch(e) {}

    document.getElementById('er-preview-container').innerHTML = '';
    document.getElementById('er-btn-print')?.classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-electoral-roll')).show();
};

window.generateElectoralRoll = async function() {
    const year = parseInt(document.getElementById('er-year').value);
    const btn = document.getElementById('er-btn-generate');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Lekérdezés...'; }

    try {
        const { data: payments, error: payErr } = await _supabase
            .from('befizetes')
            .select('id_szemely, id_csalad')
            .eq('fizetettev', year);

        if (payErr) throw payErr;

        const memberIds = new Set();
        const familyIds = new Set();

        (payments || []).forEach(p => {
            if (p.id_szemely) memberIds.add(p.id_szemely);
            if (p.id_csalad) familyIds.add(p.id_csalad);
        });

        if (familyIds.size > 0) {
            const { data: families } = await _supabase
                .from('csalad').select('id_ferfi, id_no').in('id', [...familyIds]);
            (families || []).forEach(f => {
                if (f.id_ferfi) memberIds.add(f.id_ferfi);
                if (f.id_no) memberIds.add(f.id_no);
            });
        }

        if (memberIds.size === 0) {
            document.getElementById('er-preview-container').innerHTML =
                '<div class="alert alert-warning"><i class="ti ti-alert-triangle me-2"></i>Nem találhatók befizetők a(z) ' + year + '. évben.</div>';
            return;
        }

        const { data: members } = await _supabase
            .from('szemely')
            .select('id, namepattern, csaladnev, k_nev, sz_datum, foglalkozas, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, helyseg:c_helysegid(nev), utca:c_utcaid(nev)')
            .in('id', [...memberIds])
            .eq('meghalt', false)
            .order('csaladnev');

        window._erData = {
            members: members || [],
            year: year,
            signatories: {
                lelkesz: document.getElementById('er-sign-lelkesz').value,
                gondnok: document.getElementById('er-sign-gondnok').value,
                presb1: document.getElementById('er-sign-presb1').value,
                presb2: document.getElementById('er-sign-presb2').value
            }
        };

        var tableRows = '';
        (members || []).forEach(function(m, i) {
            var fullName = [m.namepattern, m.csaladnev, m.k_nev].filter(Boolean).join(' ');
            var birth = m.sz_datum ? new Date(m.sz_datum).toLocaleDateString('hu-HU') : '—';
            var addr = [m.helyseg?.nev, m.utca?.nev, m.c_szam,
                m.c_tombhaz, m.c_lepcsohaz ? 'lh.' + m.c_lepcsohaz : null,
                m.c_emelet ? m.c_emelet + '.em.' : null,
                m.c_ajto ? m.c_ajto + '.a.' : null].filter(Boolean).join(' ');
            tableRows += '<tr>' +
                '<td class="text-center text-muted">' + (i + 1) + '.</td>' +
                '<td class="fw-bold">' + (fullName || '—') + '</td>' +
                '<td class="text-muted">' + birth + '</td>' +
                '<td class="small">' + (addr || '—') + '</td>' +
                '<td class="text-muted small">' + (m.foglalkozas || '—') + '</td></tr>';
        });

        document.getElementById('er-preview-container').innerHTML =
            '<div class="alert alert-success border-0 mb-3 py-2">' +
            '<i class="ti ti-check me-2"></i><b>' + (members || []).length + ' személy</b> szerepel a névjegyzékben (' + year + '. évi egyházfenntartói befizetés alapján)</div>' +
            '<div class="table-responsive" style="max-height: 350px; overflow-y: auto;">' +
            '<table class="table table-sm table-bordered table-hover mb-0"><thead class="table-primary sticky-top"><tr>' +
            '<th style="width:35px">#</th><th>Teljes Név</th><th style="width:110px">Születési dátum</th><th>Lakcím</th><th style="width:120px">Foglalkozás</th>' +
            '</tr></thead><tbody>' + tableRows + '</tbody></table></div>';

        document.getElementById('er-btn-print')?.classList.remove('d-none');

    } catch(err) {
        console.error('Névjegyzék hiba:', err);
        document.getElementById('er-preview-container').innerHTML =
            '<div class="alert alert-danger"><i class="ti ti-x me-2"></i>Hiba: ' + err.message + '</div>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-search me-1"></i>Névjegyzék lekérdezése'; }
    }
};

window.printElectoralRoll = function() {
    var data = window._erData;
    if (!data || !data.members) return;

    var congName = (document.getElementById('header-congregation-name')?.textContent?.trim())
                  || (document.title.split('|')[0]?.trim())
                  || 'Református Egyházközség';

    var rows = '';
    data.members.forEach(function(m, i) {
        var fullName = [m.namepattern, m.csaladnev, m.k_nev].filter(Boolean).join(' ');
        var birth = m.sz_datum ? new Date(m.sz_datum).toLocaleDateString('hu-HU') : '';
        var addr = [m.helyseg?.nev, m.utca?.nev, m.c_szam,
            m.c_tombhaz, m.c_lepcsohaz ? 'lh. ' + m.c_lepcsohaz : null,
            m.c_emelet ? m.c_emelet + '. em.' : null,
            m.c_ajto ? m.c_ajto + '. a.' : null].filter(Boolean).join(', ');
        rows += '<tr><td class="center num">' + (i + 1) + '.</td>' +
            '<td class="bold">' + (fullName || '') + '</td>' +
            '<td class="center">' + birth + '</td>' +
            '<td>' + (addr || '') + '</td>' +
            '<td>' + (m.foglalkozas || '') + '</td>' +
            '<td class="center"></td></tr>';
    });

    var s = data.signatories;
    var printDate = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });

    var html = '<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">' +
        '<title>Választók Névjegyzéke – ' + data.year + '<\/title>' +
        '<style>' +
        'body { font-family: "Times New Roman", serif; font-size: 11pt; margin: 0; color: #000; }' +
        '.page { padding: 15mm 18mm; }' +
        'h1 { text-align: center; font-size: 15pt; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 3px; }' +
        'h2 { text-align: center; font-size: 11pt; font-weight: normal; margin-top: 0; margin-bottom: 6px; }' +
        '.subtitle { text-align: center; font-size: 10pt; color: #444; margin-bottom: 18px; }' +
        'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }' +
        'thead th { background: #1a1a2e; color: #fff; padding: 5px 7px; font-size: 10pt; border: 1px solid #1a1a2e; }' +
        'tbody td { padding: 3px 7px; border: 1px solid #bbb; font-size: 10pt; vertical-align: top; }' +
        'tbody tr:nth-child(even) { background: #f5f5f5; }' +
        '.center { text-align: center; } .bold { font-weight: bold; } .num { width: 28px; }' +
        '.sig-section { margin-top: 35px; }' +
        '.sig-grid { display: flex; justify-content: space-around; gap: 20px; margin-top: 10px; }' +
        '.sig-item { flex: 1; text-align: center; }' +
        '.sig-line { border-top: 1px solid #000; margin-top: 45px; padding-top: 5px; font-size: 10pt; min-width: 120px; }' +
        '.sig-label { font-size: 9pt; color: #555; }' +
        '.footer-note { font-size: 9pt; color: #555; text-align: center; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; }' +
        '@media print { body { margin: 0; } @page { margin: 12mm 15mm; size: A4 portrait; } }' +
        '<\/style><\/head><body><div class="page">' +
        '<h1>' + congName + '<\/h1>' +
        '<h2>Egyházfenntartói járulékot fizetők névjegyzéke<\/h2>' +
        '<div class="subtitle">' + data.year + '. évi befizetések alapján &nbsp;|&nbsp; Összeállítva: ' + printDate + ' &nbsp;|&nbsp; ' + data.members.length + ' személy<\/div>' +
        '<table><thead><tr>' +
        '<th class="num center">#<\/th><th>Teljes Név<\/th><th style="width:100px" class="center">Születési dátum<\/th>' +
        '<th>Lakcím<\/th><th style="width:120px">Foglalkozás<\/th><th style="width:70px" class="center">Aláírás<\/th>' +
        '<\/tr><\/thead><tbody>' + rows + '<\/tbody><\/table>' +
        '<div class="sig-section">' +
        '<p style="font-size:10pt; text-align:center;">A névjegyzéket összeállítottuk és aláírásunkkal hitelesítettük.<\/p>' +
        '<div class="sig-grid">' +
        '<div class="sig-item"><div class="sig-line">' + (s.lelkesz || '...........................') + '<\/div><div class="sig-label">lelkész<\/div><\/div>' +
        '<div class="sig-item"><div class="sig-line">' + (s.gondnok || '...........................') + '<\/div><div class="sig-label">gondnok<\/div><\/div>' +
        '<div class="sig-item"><div class="sig-line">' + (s.presb1 || '...........................') + '<\/div><div class="sig-label">presbiter<\/div><\/div>' +
        '<div class="sig-item"><div class="sig-line">' + (s.presb2 || '...........................') + '<\/div><div class="sig-label">presbiter<\/div><\/div>' +
        '<\/div><\/div>' +
        '<div class="footer-note">Ez a névjegyzék kizárólag belső egyházi nyilvántartási célokat szolgál.<\/div>' +
        '<\/div><\/body><\/html>';

    var win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Kérjük engedélyezze a felugró ablakokat!'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 600);
};
