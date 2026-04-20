// --- pages/js/csalad_api.js ---

let selectedChildrenForNewFamily = [];
window.currentEditingFamilyId = null;
let currentFamilyData = null;
window.isReturningToFamilyDetails = false;
let _familyModalMembers = []; // lakcím auto-töltéshez
let _familyAddressSource = 'ferfi'; // melyik fél lakcíme lett kiválasztva

// 🚨 A HIÁNYZÓ FUNKCIÓ BEÉPÍTVE (Így a Család modul 100% független lesz!) 🚨

window.formatNameWithPrefix = function(member, spouse = null, mode = 'html') {
    if (!member) return '-';
    let prefixes = [];
    
    if (member.allapot === 'elvált') prefixes.push('elv.');
    
    let isOzvegy = (member.allapot === 'özvegy');
    if (!isOzvegy && spouse && spouse.meghalt) isOzvegy = true;
    if (isOzvegy) prefixes.push('özv.');

    // Kőkeményen az adatbázisból olvassuk ki az id. és ifj. prefixeket!
    if (member.namepattern) prefixes.push(member.namepattern);
    
    const prefixText = prefixes.length > 0 ? prefixes.join(' ') + ' ' : '';
    if (mode === 'html' && prefixText) return `<span class="text-danger fw-bold me-1">${prefixText}</span>${member.csaladnev} ${member.k_nev}`;
    if (mode === 'print' && prefixText) return `<b>${prefixText}</b>${member.csaladnev} ${member.k_nev}`;
    return `${prefixText}${member.csaladnev} ${member.k_nev}`;
};

// ==========================================
// CSALÁDOK LISTÁZÁSA ÉS BETÖLTÉSE
// ==========================================

window.allFamiliesData = []; // Új globális tároló a kereséshez

window.loadFamilies = async function() {
    try {
        const { data: families, error } = await _supabase.from('csalad')
            .select(`id, c_szam, isaktiv, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern), no:szemely!id_no(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern), utca:adrstreet!c_utcaid(name)`);
        if (error) throw error;
        
        window.allFamiliesData = families || [];
        sortFamilies(); // Betöltéskor azonnal rendezünk és megjelenítünk
    } catch(err) { console.error("Hiba a családok betöltésekor:", err); }
};

window.displayFamilies = function(familiesToRender) {
    const tbody = document.getElementById('family-list-body');
    if(!familiesToRender || familiesToRender.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Nincs a keresésnek megfelelő család.</td></tr>'; return; }

    tbody.innerHTML = familiesToRender.map(f => `
        <tr class="table-row-hover" style="cursor: pointer;">
            <td onclick="openFamilyDetails(${f.id})">
                <div class="fw-bold text-primary"><i class="ti ti-man me-1"></i>${f.ferfi ? window.formatNameWithPrefix(f.ferfi, f.no, 'html') : '-'}</div>
                <div class="fw-bold text-pink"><i class="ti ti-woman me-1"></i>${f.no ? window.formatNameWithPrefix(f.no, f.ferfi, 'html') : '-'}</div>
            </td>
            <td onclick="openFamilyDetails(${f.id})"><i class="ti ti-map-pin text-muted me-1"></i>${f.utca?.name || ''} ${f.c_szam || ''}</td>
            <td onclick="openFamilyDetails(${f.id})">${f.isaktiv ? '<span class="badge bg-success">Aktív</span>' : '<span class="badge bg-secondary">Inaktív</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary shadow-sm me-1" title="Családfa megtekintése" onclick="event.stopPropagation(); window.showFamilyTree(${f.id})"><i class="ti ti-binary-tree-2"></i></button>
                <button class="btn btn-sm btn-outline-danger shadow-sm ms-2" title="Család Törlése/Felbontása" onclick="window.openDeleteFamilyModal(${f.id}, event)"><i class="ti ti-trash"></i></button>
            </td>
        </tr>
    `).join('');
};

window.filterFamilies = function() {
    const query = document.getElementById('family-search-input').value.toLowerCase();
    const filtered = window.allFamiliesData.filter(f => {
        const ferfiNev = f.ferfi ? `${f.ferfi.csaladnev} ${f.ferfi.k_nev}`.toLowerCase() : '';
        const noNev = f.no ? `${f.no.csaladnev} ${f.no.k_nev}`.toLowerCase() : '';
        const cim = `${f.utca?.name || ''} ${f.c_szam || ''}`.toLowerCase();
        return ferfiNev.includes(query) || noNev.includes(query) || cim.includes(query);
    });
    window.displayFamilies(filtered);
};

window.sortFamilies = function() {
    const sortType = document.getElementById('family-sort-select').value;
    let sorted = [...window.allFamiliesData];

    sorted.sort((a, b) => {
        let valA = '', valB = '';
        if (sortType === 'name_asc' || sortType === 'name_desc') {
            valA = a.ferfi ? `${a.ferfi.csaladnev} ${a.ferfi.k_nev}` : (a.no ? `${a.no.csaladnev} ${a.no.k_nev}` : '');
            valB = b.ferfi ? `${b.ferfi.csaladnev} ${b.ferfi.k_nev}` : (b.no ? `${b.no.csaladnev} ${b.no.k_nev}` : '');
        } else if (sortType === 'address_asc') {
            valA = `${a.utca?.name || ''} ${a.c_szam || ''}`;
            valB = `${b.utca?.name || ''} ${b.c_szam || ''}`;
        }
        
        if (valA < valB) return sortType === 'name_desc' ? 1 : -1;
        if (valA > valB) return sortType === 'name_desc' ? -1 : 1;
        return 0;
    });

    window.displayFamilies(sorted);
    window.filterFamilies(); // Alkalmazzuk a keresőt is a rendezett listára!
};

window.openFamilyModal = async function() {
    selectedChildrenForNewFamily = [];
    window.currentEditingFamilyId = null;
    window.isReturningToFamilyDetails = false;
    _familyAddressSource = 'ferfi';
    updateChildrenUI();
    document.getElementById('f-ferfi-input').value = ''; document.getElementById('f-no-input').value = '';
    document.getElementById('f-id_ferfi').value = ''; document.getElementById('f-id_no').value = '';
    if (document.getElementById('f-child-input')) document.getElementById('f-child-input').value = '';
    const conflictDiv = document.getElementById('f-address-conflict');
    if (conflictDiv) conflictDiv.classList.add('d-none');

    // Badge-ek resetelése
    var ferfiBadge = document.getElementById('f-ferfi-badge');
    var noBadge = document.getElementById('f-no-badge');
    if (ferfiBadge) ferfiBadge.innerHTML = '';
    if (noBadge) noBadge.innerHTML = '';

    // Keresők elrejtése
    ['f-search-ferfi','f-search-no','f-search-gyerek'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    var titleEl = document.getElementById('family-modal-title');
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-home-heart me-2"></i>Új Család Létrehozása';

    await populateFamilySelects();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-add-family')).show();
};

window.populateFamilySelects = async function(editHusbId = null, editWifeId = null) {
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();

        const { data: allMembers } = await _supabase.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
            .eq('congregation_id', profile.congregation_id).eq('meghalt', false).eq('isvisible', true);
        _familyModalMembers = allMembers || [];

        const { data: allFamilies } = await _supabase.from('csalad').select('id_ferfi, id_no');
        const marriedMenIds = allFamilies.filter(f => f.id_ferfi && f.id_ferfi !== editHusbId).map(f => f.id_ferfi);
        const marriedWomenIds = allFamilies.filter(f => f.id_no && f.id_no !== editWifeId).map(f => f.id_no);

        const { data: allChildren } = await _supabase.from('gyerek').select('id_szemely');
        const assignedChildrenIds = allChildren.map(c => c.id_szemely);

        const singleMen = allMembers.filter(m => m.ferfi === true && !marriedMenIds.includes(m.id));
        const singleWomen = allMembers.filter(m => m.ferfi === false && !marriedWomenIds.includes(m.id));
        const freeChildren = allMembers.filter(m => !marriedMenIds.includes(m.id) && !marriedWomenIds.includes(m.id) && (!assignedChildrenIds.includes(m.id) || selectedChildrenForNewFamily.some(sc => sc.id == m.id)));

        const formatOption = (m) => `<option data-id="${m.id}" value="${m.csaladnev} ${m.k_nev} (${m.sz_datum || '?'}) - ${m.adrlocality?.name || '?'}, ${m.adrstreet?.name || ''} ${m.c_szam || ''}"></option>`;
        var dlMen = document.getElementById('dl-single-men');
        var dlWomen = document.getElementById('dl-single-women');
        var dlChildren = document.getElementById('dl-free-children');
        if (dlMen) dlMen.innerHTML = singleMen.map(formatOption).join('');
        if (dlWomen) dlWomen.innerHTML = singleWomen.map(formatOption).join('');
        if (dlChildren) dlChildren.innerHTML = freeChildren.map(formatOption).join('');

        const [locsRes, streetsRes, korzetRes] = await Promise.all([
            _supabase.from('adrlocality').select('id, name').order('name'),
            _supabase.from('adrstreet').select('id, name').order('name'),
            _supabase.from('csoport').select('id, nev').eq('iskorzet', true).eq('isaktiv', true).order('nev')
        ]);
        document.getElementById('f-c_helysegid').innerHTML = (locsRes.data || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        document.getElementById('f-c_utcaid').innerHTML = (streetsRes.data || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        const korzetSel = document.getElementById('f-id_csoport');
        if (korzetSel) {
            korzetSel.innerHTML = '<option value="">-- Nincs körzethez rendelve --</option>' +
                (korzetRes.data || []).map(k => `<option value="${k.id}">${k.nev}</option>`).join('');
        }
    } catch(err) { console.error(err); }
};

// ==========================================
// OKOS KERESŐ — FÉRJ / FELESÉG / GYERMEK
// ==========================================

window.searchFamilyMember = async function(val, role) {
    var resDiv = document.getElementById('f-search-' + role);
    if (!resDiv) return;
    if (val.trim().length < 2) { resDiv.style.display = 'none'; return; }

    var parts = val.trim().split(/\s+/);

    // Alap lekérdezés
    var query = _supabase.from('szemely')
        .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
        .eq('meghalt', false).eq('isvisible', true);

    // Nemre szűrés
    if (role === 'ferfi') query = query.eq('ferfi', true);
    else if (role === 'no') query = query.eq('ferfi', false);

    // Gyülekezetre szűrés
    if (window.activeCongregationId) query = query.eq('congregation_id', window.activeCongregationId);

    // Név keresés (szóköz-tudatos)
    if (parts.length >= 2) {
        query = query.ilike('csaladnev', '%' + parts[0] + '%').ilike('k_nev', '%' + parts.slice(1).join(' ') + '%');
    } else {
        query = query.or('csaladnev.ilike.%' + parts[0] + '%,k_nev.ilike.%' + parts[0] + '%');
    }

    var result = await query.limit(12);
    var data = result.data || [];

    // Kiszűrjük a már kiválasztottakat
    var ferfiId = document.getElementById('f-id_ferfi') ? document.getElementById('f-id_ferfi').value : '';
    var noId = document.getElementById('f-id_no') ? document.getElementById('f-id_no').value : '';
    var gyerekIds = (selectedChildrenForNewFamily || []).map(function(c) { return String(c.id); });
    var kizartIds = [ferfiId, noId].concat(gyerekIds).filter(Boolean);

    data = data.filter(function(m) { return kizartIds.indexOf(String(m.id)) === -1; });

    if (data.length > 0) {
        resDiv.innerHTML = data.map(function(m) {
            var kor = '?';
            if (m.sz_datum) {
                var today = new Date(); var bd = new Date(m.sz_datum);
                kor = today.getFullYear() - bd.getFullYear();
                if (today.getMonth() - bd.getMonth() < 0 || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) kor--;
            }
            var nemIcon = m.ferfi ? '<i class="ti ti-gender-male text-blue me-1"></i>' : '<i class="ti ti-gender-female text-pink me-1"></i>';
            var cim = (m.adrlocality?.name || '') + (m.adrstreet?.name ? ', ' + m.adrstreet.name : '') + (m.c_szam ? ' ' + m.c_szam : '');
            var nemTxt = m.ferfi ? 'Fiú/Férfi' : 'Lány/Nő';

            return '<div class="search-item p-2 border-bottom" style="cursor:pointer;" onclick="selectFamilyMember(' + m.id + ', \'' +
                (m.csaladnev || '').replace(/'/g, "\\'") + ' ' + (m.k_nev || '').replace(/'/g, "\\'") + '\', \'' + role + '\')">' +
                nemIcon + '<b>' + m.csaladnev + ' ' + m.k_nev + '</b> ' +
                '<span class="badge bg-blue-lt ms-1">' + kor + ' éves</span> ' +
                '<span class="badge bg-' + (m.ferfi ? 'blue' : 'pink') + '-lt ms-1">' + nemTxt + '</span>' +
                (cim ? '<div class="text-muted small mt-1"><i class="ti ti-home me-1"></i>' + cim + '</div>' : '') +
                '</div>';
        }).join('');
    } else {
        resDiv.innerHTML = '<div class="p-2 text-center text-muted small">Nincs találat.</div>';
    }
    resDiv.style.display = 'block';
};

window.selectFamilyMember = async function(id, fullName, role) {
    var resDiv = document.getElementById('f-search-' + role);
    if (resDiv) resDiv.style.display = 'none';

    if (role === 'ferfi' || role === 'no') {
        // Név és ID beállítása
        document.getElementById('f-' + role + '-input').value = fullName;
        document.getElementById('f-id_' + (role === 'ferfi' ? 'ferfi' : 'no')).value = id;
        var badge = document.getElementById('f-' + role + '-badge');
        if (badge) badge.innerHTML = '<span class="badge bg-green-lt text-green"><i class="ti ti-check me-1"></i>Kiválasztva</span>';

        // Személy adatainak lekérdezése a cím kitöltéséhez
        var memberRes = await _supabase.from('szemely')
            .select('id, c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
            .eq('id', id).limit(1);
        var member = (memberRes.data && memberRes.data.length > 0) ? memberRes.data[0] : null;

        // Hozzáadjuk a _familyModalMembers tömbhöz ha nincs benne
        if (member) {
            if (!_familyModalMembers.find(function(m) { return m.id === member.id; })) {
                _familyModalMembers.push(member);
            }
        }

        // Cím automatikus kitöltése
        autoFillFamilyAddress();

    } else if (role === 'gyerek') {
        if (selectedChildrenForNewFamily.some(function(c) { return c.id == id; })) return;
        selectedChildrenForNewFamily.push({ id: id, name: fullName });
        updateChildrenUI();
        document.getElementById('f-child-input').value = '';
    }
};

// ==========================================
// LAKCÍM AUTO-TÖLTÉS ÉS SZINKRONIZÁLÁS
// ==========================================

function _getMemberById(id) {
    return _familyModalMembers.find(m => m.id === parseInt(id));
}

function _setFamilyAddressFromMember(m) {
    if (!m) return;
    const helysegSel = document.getElementById('f-c_helysegid');
    const utcaSel = document.getElementById('f-c_utcaid');
    if (helysegSel && m.c_helysegid) helysegSel.value = m.c_helysegid;
    if (utcaSel && m.c_utcaid) utcaSel.value = m.c_utcaid;
    document.getElementById('f-c_szam').value = m.c_szam || '';
    document.getElementById('f-c_tombhaz').value = m.c_tombhaz || '';
    document.getElementById('f-c_lepcsohaz').value = m.c_lepcsohaz || '';
    document.getElementById('f-c_emelet').value = m.c_emelet || '';
    document.getElementById('f-c_ajto').value = m.c_ajto || '';
}

window.autoFillFamilyAddress = function() {
    const ferfiId = document.getElementById('f-id_ferfi').value;
    const noId = document.getElementById('f-id_no').value;
    const conflictDiv = document.getElementById('f-address-conflict');
    const ferfi = ferfiId ? _getMemberById(ferfiId) : null;
    const no = noId ? _getMemberById(noId) : null;

    // Ha csak a férj van kiválasztva → auto-töltés
    if (ferfi && !noId) {
        _setFamilyAddressFromMember(ferfi);
        _familyAddressSource = 'ferfi';
        if (conflictDiv) conflictDiv.classList.add('d-none');
        return;
    }

    // Ha mindkét fél ki van választva
    if (ferfi && no) {
        const sameAddr = ferfi.c_helysegid === no.c_helysegid &&
                         ferfi.c_utcaid === no.c_utcaid &&
                         (ferfi.c_szam || '') === (no.c_szam || '');

        if (sameAddr || (!ferfi.c_helysegid && !no.c_helysegid)) {
            _setFamilyAddressFromMember(ferfi);
            _familyAddressSource = 'ferfi';
            if (conflictDiv) conflictDiv.classList.add('d-none');
        } else {
            // Eltérő lakcím → megkérdezzük
            const ferfiAddr = [ferfi.adrlocality?.name, ferfi.adrstreet?.name, ferfi.c_szam].filter(Boolean).join(', ');
            const noAddr = [no.adrlocality?.name, no.adrstreet?.name, no.c_szam].filter(Boolean).join(', ');
            if (conflictDiv) {
                conflictDiv.innerHTML = `
                    <div class="alert alert-warning border-warning mb-0">
                        <div class="fw-bold mb-2"><i class="ti ti-alert-triangle me-1"></i>A házastársak különböző lakcímen vannak! Melyiken él a család?</div>
                        <div class="d-flex gap-2 flex-wrap">
                            <button type="button" id="btn-addr-ferfi" class="btn btn-sm btn-primary active" onclick="chooseFamilyAddress('ferfi')">
                                <i class="ti ti-gender-male me-1"></i><b>Férj:</b> ${ferfiAddr || 'nincs cím'}
                            </button>
                            <button type="button" id="btn-addr-no" class="btn btn-sm btn-outline-pink" onclick="chooseFamilyAddress('no')">
                                <i class="ti ti-gender-female me-1"></i><b>Feleség:</b> ${noAddr || 'nincs cím'}
                            </button>
                        </div>
                        <div class="text-muted small mt-1">A mentés után a gyerekek és a másik fél lakcíme is erre frissül.</div>
                    </div>`;
                conflictDiv.classList.remove('d-none');
            }
            // Alapértelmezettként a férj lakcíme
            _setFamilyAddressFromMember(ferfi);
            _familyAddressSource = 'ferfi';
        }
    }
};

window.chooseFamilyAddress = function(who) {
    const ferfiId = document.getElementById('f-id_ferfi').value;
    const noId = document.getElementById('f-id_no').value;
    const member = who === 'ferfi' ? _getMemberById(ferfiId) : _getMemberById(noId);
    _familyAddressSource = who;
    _setFamilyAddressFromMember(member);
    // Gombok vizuális visszajelzése
    const btnFerfi = document.getElementById('btn-addr-ferfi');
    const btnNo = document.getElementById('btn-addr-no');
    if (btnFerfi && btnNo) {
        btnFerfi.className = who === 'ferfi' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline-primary';
        btnNo.className = who === 'no' ? 'btn btn-sm btn-pink' : 'btn btn-sm btn-outline-pink';
    }
};

window.addChildToFamily = function() {
    const inputVal = document.getElementById('f-child-input').value;
    if (!inputVal) return;
    let childId = null;
    var dlEl = document.getElementById('dl-free-children');
    if (dlEl) {
        const options = dlEl.options;
        for(let i=0; i<options.length; i++) { if(options[i].value === inputVal) { childId = options[i].getAttribute('data-id'); break; } }
    }

    if (!childId) { alert("Kérem, válasszon a meglévő listából, vagy rögzítsen új gyermeket az 'Új' gombbal!"); return; }
    if (selectedChildrenForNewFamily.some(c => c.id == childId)) { alert("Ez a gyermek már a listán van!"); return; }

    selectedChildrenForNewFamily.push({ id: childId, name: inputVal.split('(')[0] });
    updateChildrenUI();
    document.getElementById('f-child-input').value = ""; 
};

window.removeChildFromFamily = function(childId) {
    selectedChildrenForNewFamily = selectedChildrenForNewFamily.filter(c => c.id != childId);
    updateChildrenUI();
};

window.updateChildrenUI = function() {
    const listDiv = document.getElementById('f-children-list');
    if (selectedChildrenForNewFamily.length === 0) { listDiv.innerHTML = 'Még nincs gyermek hozzárendelve.'; return; }
    listDiv.innerHTML = selectedChildrenForNewFamily.map(c => `<span class="badge bg-success-lt fs-5 p-2 me-2 mb-2 border border-success"><i class="ti ti-mood-kid me-1"></i> ${c.name}<button type="button" class="btn-close ms-2" onclick="removeChildFromFamily('${c.id}')" style="font-size: 0.6rem;"></button></span>`).join('');
};

window.openModalForNew = function(type) {
    const familyModalEl = document.getElementById('modal-add-family');
    const familyModal = bootstrap.Modal.getInstance(familyModalEl);
    if (familyModal) familyModal.hide();
    
    const genderSelect = document.getElementById('m-ferfi');
    if(genderSelect) { if(type === 'ferfi') genderSelect.value = 'true'; if(type === 'no') genderSelect.value = 'false'; }
    
    const memberModalEl = document.getElementById('modal-add-member');
    bootstrap.Modal.getOrCreateInstance(memberModalEl).show();

    const onMemberHidden = function() {
        memberModalEl.removeEventListener('hidden.bs.modal', onMemberHidden);
        setTimeout(() => {
            if (familyModalEl) bootstrap.Modal.getOrCreateInstance(familyModalEl).show();
            populateFamilySelects(document.getElementById('f-id_ferfi').value, document.getElementById('f-id_no').value); 
        }, 300);
    };
    memberModalEl.addEventListener('hidden.bs.modal', onMemberHidden);
};

window.saveFamily = async function(e) {
    e.preventDefault();
    const btn = e.submitter || document.querySelector('#family-form button[type="submit"]');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...';
    btn.disabled = true;

    try {
        const idFerfi = document.getElementById('f-id_ferfi').value;
        const idNo = document.getElementById('f-id_no').value;
        if (!idFerfi && !idNo) { alert("Válasszon ki legalább egy felnőttet a listából!"); return; }

        let orConditions = [];
        if (idFerfi) orConditions.push(`id_ferfi.eq.${idFerfi}`, `id_no.eq.${idFerfi}`); 
        if (idNo) orConditions.push(`id_ferfi.eq.${idNo}`, `id_no.eq.${idNo}`);
        if (orConditions.length > 0) {
            let query = _supabase.from('csalad').select('id').or(orConditions.join(','));
            if (window.currentEditingFamilyId) query = query.neq('id', window.currentEditingFamilyId); 
            const { data: existingFam } = await query;
            if (existingFam && existingFam.length > 0) {
                alert("KRITIKUS HIBA:\nA kiválasztott személy már egy MÁSIK családban szülő!\nEgy személy csak egy helyen alapíthat családot.");
                return; 
            }
        }

        const familyEntry = {
            id_ferfi: idFerfi || null, id_no: idNo || null,
            c_utcaid: document.getElementById('f-c_utcaid').value, c_szam: document.getElementById('f-c_szam').value,
            c_tombhaz: document.getElementById('f-c_tombhaz').value || null, c_lepcsohaz: document.getElementById('f-c_lepcsohaz').value || null,
            c_emelet: document.getElementById('f-c_emelet').value || null, c_ajto: document.getElementById('f-c_ajto').value || null,
            id_csoport: document.getElementById('f-id_csoport').value || null, isaktiv: true
        };

        let familyId = window.currentEditingFamilyId;
        if (familyId) {
            await _supabase.from('csalad').update(familyEntry).eq('id', familyId);
            await _supabase.from('gyerek').delete().eq('id_csalad', familyId); 
        } else {
            const { data: newFamily } = await _supabase.from('csalad').insert([familyEntry]).select().single();
            familyId = newFamily.id;
        }

        if (selectedChildrenForNewFamily.length > 0) {
            const childrenEntries = selectedChildrenForNewFamily.map(c => ({ id_csalad: familyId, id_szemely: parseInt(c.id) }));
            await _supabase.from('gyerek').insert(childrenEntries);
        }

        // Lakcím szinkronizálás: a form értékeivel frissítjük a tagokat
        const formAddr = {
            c_helysegid: parseInt(document.getElementById('f-c_helysegid').value) || null,
            c_utcaid: parseInt(document.getElementById('f-c_utcaid').value) || null,
            c_szam: document.getElementById('f-c_szam').value || null,
            c_tombhaz: document.getElementById('f-c_tombhaz').value || null,
            c_lepcsohaz: document.getElementById('f-c_lepcsohaz').value || null,
            c_emelet: document.getElementById('f-c_emelet').value || null,
            c_ajto: document.getElementById('f-c_ajto').value || null,
        };
        const membersToSync = [];
        if (_familyAddressSource === 'ferfi' && idNo) membersToSync.push(parseInt(idNo));
        if (_familyAddressSource === 'no' && idFerfi) membersToSync.push(parseInt(idFerfi));
        selectedChildrenForNewFamily.forEach(c => membersToSync.push(parseInt(c.id)));
        for (const mId of membersToSync) {
            await _supabase.from('szemely').update(formAddr).eq('id', mId);
        }

        window.isReturningToFamilyDetails = false;
        bootstrap.Modal.getInstance(document.getElementById('modal-add-family')).hide();
        document.getElementById('family-form').reset();
        selectedChildrenForNewFamily = [];
        if (document.getElementById('successToast')) new bootstrap.Toast(document.getElementById('successToast')).show();
        
        loadFamilies(); 
        if (window.currentEditingFamilyId) setTimeout(() => openFamilyDetails(familyId), 500);

    } catch(err) { alert('Hiba a család mentésekor: ' + err.message); 
    } finally { btn.innerHTML = origText; btn.disabled = false; }
};

// ==========================================
// 🚨 CSALÁD TÖRLÉSE ÉS VÁLÁS LOGIKA
// ==========================================
window.openDeleteFamilyModal = function(id, event) {
    if(event) event.stopPropagation();
    document.getElementById('del-fam-id').value = id;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-delete-family')).show();
};

window.executeDeleteFamily = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-exec-del-fam');
    const origText = btn.innerHTML; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Feldolgozás...'; 
    btn.disabled = true;

    try {
        const famId = document.getElementById('del-fam-id').value;
        const reason = document.querySelector('input[name="delete_fam_reason"]:checked').value;
        const { data: fam } = await _supabase.from('csalad').select('id_ferfi, id_no').eq('id', famId).single();
        
        if (reason === 'divorce') {
            if (fam.id_ferfi) await _supabase.from('szemely').update({ allapot: 'elvált' }).eq('id', fam.id_ferfi);
            if (fam.id_no) await _supabase.from('szemely').update({ allapot: 'elvált' }).eq('id', fam.id_no);
        }
        
        await _supabase.from('befizetes').update({ id_csalad: null }).eq('id_csalad', famId);
        await _supabase.from('felmentes').update({ id_csalad: null }).eq('id_csalad', famId);
        await _supabase.from('gyerek').delete().eq('id_csalad', famId);
        
        await _supabase.from('csalad').delete().eq('id', famId);

        bootstrap.Modal.getInstance(document.getElementById('modal-delete-family')).hide();
        
        if(typeof loadMembers === 'function') await loadMembers();
        if(typeof loadFamilies === 'function') await loadFamilies();
        
        alert("A család sikeresen felbontásra/törlésre került!");
    } catch (err) { alert("Hiba a törléskor: " + err.message); 
    } finally { btn.innerHTML = origText; btn.disabled = false; }
};

// ==========================================
// KARTOTÉK MEGNYITÁSA ÉS UI
// ==========================================
window.openFamilyDetails = async function(id) {
    try {
        const { data: family, error: famErr } = await _supabase.from('csalad')
            .select('*, ferfi:szemely!id_ferfi(*), no:szemely!id_no(*), utca:adrstreet!c_utcaid(*)')
            .eq('id', id).single();
        if (famErr || !family) throw new Error("Nem található a család!");

        const { data: childrenLinks } = await _supabase.from('gyerek').select('id_szemely').eq('id_csalad', id);
        const childIds = childrenLinks.map(c => c.id_szemely);
        
        let children = [];
        if (childIds.length > 0) {
            const { data: chData } = await _supabase.from('szemely').select('*').in('id', childIds).eq('isvisible', true);
            children = chData || [];
        }

        const memberIds = [family.id_ferfi, family.id_no, ...childIds].filter(Boolean);

        const [keresztRes, konfirmRes, wedRes, visitsRes, payRes, temetesRes] = await Promise.all([
            _supabase.from('keresztseg').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds),
            _supabase.from('konfirmalas').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds),
            _supabase.from('hazassag').select('datum, adrlocality!helyid(name), lelkeszneve').eq('id_ferfi', family.id_ferfi).eq('id_no', family.id_no).maybeSingle(),
            _supabase.from('csaladlatogatas').select('*').eq('id_csalad', id).order('datum', { ascending: false }),
            _supabase.from('befizetes').select('*, befizetescel(nev), szemely(k_nev, csaladnev)').or(`id_csalad.eq.${id},id_szemely.in.(${memberIds.join(',')})`).neq('deleted', true).order('datum', { ascending: false }),
            _supabase.from('temetes').select('id_szemely, hdatum').in('id_szemely', memberIds)
        ]);

        currentFamilyData = { family, children, kereszt: keresztRes.data, konfirm: konfirmRes.data, hazassag: wedRes.data, payments: payRes.data, temetes: temetesRes.data };

        const getPrintName = (m) => m ? window.formatNameWithPrefix(m, null, 'print') : '-';
        let title = "Családi Kartoték";
        if (family.ferfi && family.no) title = `${window.formatNameWithPrefix(family.ferfi, family.no, 'html')} és ${family.no.k_nev} családja`;
        else if (family.ferfi) title = `${window.formatNameWithPrefix(family.ferfi, family.no, 'html')} családja`;
        else if (family.no) title = `${window.formatNameWithPrefix(family.no, family.ferfi, 'html')} családja`;
        
        document.getElementById('fam-det-title').innerHTML = title;
        document.getElementById('fam-det-status').innerHTML = family.isaktiv ? '<span class="badge bg-success">Aktív Család</span>' : '<span class="badge bg-secondary">Inaktív</span>';
        
        const reszletek = [family.c_tombhaz ? `Bl.${family.c_tombhaz}` : '', family.c_lepcsohaz ? `Sc.${family.c_lepcsohaz}` : '', family.c_ajto ? `Ap.${family.c_ajto}` : ''].filter(Boolean).join(', ');
        document.getElementById('fam-det-address').innerText = `${family.utca?.name || '?'} ${family.c_szam || ''}`;
        document.getElementById('fam-det-full-address').innerText = `${family.utca?.name || '?'} ${family.c_szam || ''}`;
        document.getElementById('fam-det-address-details').innerText = reszletek || 'Nincs további címadat';
        
        let membersHtml = '';
        const buildMemberRow = (m, role, badgeColor, spouse) => {
            if(!m) return '';
            const age = m.sz_datum ? Math.abs(new Date(Date.now() - new Date(m.sz_datum).getTime()).getUTCFullYear() - 1970) + ' éves' : 'Ismeretlen kor';
            return `
            <div class="fam-member-row" onclick="window.openNextModal('modal-family-details', () => openMemberDetails(${m.id}));">
                <div class="me-3"><span class="fam-role-badge bg-${badgeColor}-lt text-${badgeColor} border border-${badgeColor}">${role}</span></div>
                <div class="flex-grow-1"><div class="fw-bold fs-4 text-dark">${window.formatNameWithPrefix(m, spouse, 'html')}</div><div class="text-muted small">${age} | ${m.foglalkozas || 'Nincs foglalkozás rögzítve'}</div></div>
                <div><i class="ti ti-chevron-right text-muted"></i></div>
            </div>`;
        };
        membersHtml += buildMemberRow(family.ferfi, 'Családfő (Férj)', 'blue', family.no);
        membersHtml += buildMemberRow(family.no, 'Feleség', 'pink', family.ferfi);
        children.forEach(c => membersHtml += buildMemberRow(c, 'Gyermek', 'green', null));
        document.getElementById('fam-det-members-list').innerHTML = membersHtml || '<div class="text-muted text-center py-3">Nincsenek tagok.</div>';

        const emptyText = '<span class="text-muted fst-italic">Nincs rögzítve</span>';
        document.getElementById('fam-det-wed-date').innerHTML = wedRes.data?.datum ? wedRes.data.datum.split('T')[0] : emptyText;
        document.getElementById('fam-det-wed-loc').innerHTML = wedRes.data?.adrlocality?.name || emptyText;
        document.getElementById('fam-det-wed-pastor').innerHTML = wedRes.data?.lelkeszneve || emptyText;

        let churchHtml = '';
        [family.ferfi, family.no, ...children].filter(Boolean).forEach(m => {
            const k = keresztRes.data?.find(x => x.id_szemely === m.id);
            const f = konfirmRes.data?.find(x => x.id_szemely === m.id);
            const t = temetesRes.data?.find(x => x.id_szemely === m.id); 
            const spouse = (m.id === family.id_ferfi) ? family.no : (m.id === family.id_no ? family.ferfi : null);

            // Házasságkötés: csak a szülőpárnál mutatjuk (nem gyerekeknél)
            const isParent = (m.id === family.id_ferfi || m.id === family.id_no);
            const wed = isParent ? wedRes.data : null;
            const wedCell = wed?.datum
                ? `<span class="text-warning fw-bold"><i class="ti ti-rings me-1"></i>${wed.datum.split('T')[0]}</span><br><small class="text-muted">${wed.adrlocality?.name || ''}</small>`
                : `<span class="text-muted"><i class="ti ti-minus"></i></span>`;

            churchHtml += `<tr>
                <td class="fw-bold text-dark">${window.formatNameWithPrefix(m, spouse, 'html')}</td>
                <td>${m.sz_datum || '-'}</td>
                <td>${k ? `<span class="text-success fw-bold"><i class="ti ti-check text-success"></i> ${k.datum?.split('T')[0]}</span><br><small class="text-muted">${k.adrlocality?.name||''}</small>` : '<span class="text-muted"><i class="ti ti-x"></i> Nincs</span>'}</td>
                <td>${f ? `<span class="text-success fw-bold"><i class="ti ti-check text-success"></i> ${f.datum?.split('T')[0]}</span><br><small class="text-muted">${f.adrlocality?.name||''}</small>` : '<span class="text-muted"><i class="ti ti-x"></i> Nincs</span>'}</td>
                <td>${wedCell}</td>
                <td>${t ? `<span class="text-dark fw-bold"><i class="ti ti-cross text-dark"></i> ${t.hdatum?.split('T')[0]}</span>` : '<span class="text-muted"><i class="ti ti-minus"></i></span>'}</td>
                <td><span class="badge bg-light text-dark border">${m.vallas || 'Református'}</span></td>
            </tr>`;
        });
        document.getElementById('fam-det-church-list').innerHTML = churchHtml;

        let payTotal = 0;
        if (payRes.data && payRes.data.length > 0) {
            document.getElementById('fam-det-payments-body').innerHTML = payRes.data.map(p => {
                payTotal += Number(p.osszeg || 0);
                const celNev = p.befizetescel?.nev || 'Egyházi befizetés';
                const owner = p.szemely ? `${p.szemely.csaladnev} ${p.szemely.k_nev}` : (p.forrasa ? `<span class="text-warning" title="Nincs személyhez rendelve — párosítás szükséges"><i class="ti ti-alert-triangle me-1"></i>${p.forrasa}</span>` : 'Közös kassza');
                const bizonylat = p.nyugtaszam || p.bizonylatszam || p.iratszam || '-';
                return `<tr>
                    <td class="align-middle">${p.datum ? p.datum.split('T')[0] : '-'}</td>
                    <td class="align-middle fw-bold text-primary">${owner}</td>
                    <td class="align-middle text-dark fw-bold">${bizonylat}</td>
                    <td class="align-middle text-muted">${celNev}</td>
                    <td class="align-middle text-center fw-bold">${p.fizetettev || '-'}</td>
                    <td class="text-end fw-bold align-middle text-success">${Number(p.osszeg || 0).toFixed(2)} RON</td>
                </tr>`;
            }).join('');
        } else {
            document.getElementById('fam-det-payments-body').innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4"><i class="ti ti-info-circle me-2 fs-2 text-success"></i><br>Nincs rögzített befizetés a családhoz vagy a családtagokhoz.</td></tr>`;
        }
        document.getElementById('fam-det-payments-total').innerText = `Összesen: ${payTotal.toFixed(2)} RON`;

        if (visitsRes.data && visitsRes.data.length > 0) {
            document.getElementById('fam-det-visits-list').innerHTML = visitsRes.data.map(v => `
                <div class="card mb-3 border-info shadow-sm">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-info text-white fs-5"><i class="ti ti-calendar me-1"></i>${v.datum?.split('T')[0]}</span>
                            <span class="text-muted fw-bold small"><i class="ti ti-user me-1"></i>Lelkész: ${v.lelkesz}</span>
                        </div>
                        ${v.alapige ? `<div class="text-dark fw-bold mb-2"><i class="ti ti-book me-1"></i>Alapige: <span class="fst-italic">${v.alapige}</span></div>` : ''}
                        <div class="text-secondary" style="white-space: pre-wrap;">${v.megjegyzes || 'Nincs további megjegyzés rögzítve.'}</div>
                    </div>
                </div>
            `).join('');
        } else {
            document.getElementById('fam-det-visits-list').innerHTML = '<div class="text-center text-muted py-4"><i class="ti ti-info-circle fs-2 mb-2 d-block"></i>Még nincs rögzített családlátogatás.</div>';
        }

        const visitBtn = document.getElementById('btn-visit-family'); if(visitBtn) visitBtn.onclick = window.openVisitModal;
        const printBtn = document.getElementById('btn-print-family'); if(printBtn) printBtn.onclick = window.openFamilyPrintSettings;
        const editBtn = document.getElementById('btn-edit-family'); if(editBtn) editBtn.onclick = window.openEditFamily;

        bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-family-details')).show();

    } catch (err) { alert("Hiba a Családi Kartoték betöltésekor: " + err.message); }
};

window.saveFamilyVisit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-visit');
    const origText = btn.innerHTML; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; btn.disabled = true;

    try {
        const idCsalad = document.getElementById('v-csalad-id').value;
        const datum = document.getElementById('v-datum').value;
        const lelkesz = document.getElementById('v-lelkesz').value;
        const alapige = document.getElementById('v-alapige').value;
        const megjegyzes = document.getElementById('v-megjegyzes').value;
        const toMunkanaplo = document.getElementById('v-munkanaplo').checked;

        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();

        let munkanaploId = null;
        if (toMunkanaplo) {
            const famName = document.getElementById('fam-det-title').innerText;
            const { data: mnData, error: mnErr } = await _supabase.from('munkanaplo').insert([{
                idopont: datum, jellege: 'Családlátogatás', alapige: alapige, szolgalt: lelkesz,
                megjegyzes: `Látogatás: ${famName}. ${megjegyzes}`, jelenlet_osszesen: 0,
                kategoria: 'családlátogatás', congregation_id: profile.congregation_id
            }]).select('id').single();
            if (mnErr) throw new Error("Hiba a Munkanapló szinkronizálásakor: " + mnErr.message);
            munkanaploId = mnData.id;
        }

        const { error: visitErr } = await _supabase.from('csaladlatogatas').insert([{
            id_csalad: idCsalad, datum: datum, lelkesz: lelkesz, alapige: alapige,
            megjegyzes: megjegyzes, munkanaplo_id: munkanaploId, congregation_id: profile.congregation_id
        }]);

        if (visitErr) throw new Error("Hiba a látogatás mentésekor: " + visitErr.message);

        window.isReturningToFamilyDetails = false; 
        bootstrap.Modal.getInstance(document.getElementById('modal-add-visit')).hide();
        openFamilyDetails(idCsalad); 
    } catch (err) { alert(err.message); } finally { btn.innerHTML = origText; btn.disabled = false; }
};

window.openFamilyPrintSettings = function() {
    window.isReturningToFamilyDetails = true;
    bootstrap.Modal.getInstance(document.getElementById('modal-family-details')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-print-family-settings')).show();
};

window.executeFamilyPrint = async function() {
    if (!currentFamilyData) return;
    const printBtn = document.querySelector('#modal-print-family-settings .btn-dark');
    const origText = printBtn.innerHTML; printBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Készítés...'; printBtn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id, congregations(name)').eq('id', user.id).single();
        const { data: settings } = await _supabase.from('bealitas').select('intezmenyneve').eq('congregation_id', profile.congregation_id).single();
        let gyulNev = settings?.intezmenyneve || profile?.congregations?.name || "Helyi Gyülekezet";

        const printOption = document.querySelector('input[name="print_finance_years"]:checked').value;
        const currentYear = new Date().getFullYear();
        let filteredPayments = [];
        
        if (printOption === 'all') filteredPayments = currentFamilyData.payments || [];
        else if (printOption === '5') filteredPayments = (currentFamilyData.payments || []).filter(p => p.fizetettev >= (currentYear - 4));

        let financeHtml = '';
        if (printOption !== 'none') {
            if (filteredPayments.length > 0) {
                let trs = filteredPayments.map(p => `
                    <tr>
                        <td>${p.datum ? p.datum.split('T')[0] : '-'}</td>
                        <td>${p.szemely ? `${p.szemely.csaladnev} ${p.szemely.k_nev}` : 'Családi'}</td>
                        <td>${p.nyugtaszam || p.bizonylatszam || p.iratszam || '-'}</td>
                        <td>${p.befizetescel?.nev || 'Egyházi befizetés'}</td>
                        <td style="text-align:center;">${p.fizetettev || '-'}</td>
                        <td style="text-align:right; font-weight:bold;">${Number(p.osszeg).toFixed(2)} RON</td>
                    </tr>
                `).join('');
                financeHtml = `<div class="section-title">BEFIZETÉSI NYILVÁNTARTÁS (${printOption === '5' ? 'Utolsó 5 év' : 'Teljes Történet'})</div><table><tr><th style="width:15%;">Dátum</th><th style="width:25%;">Kinek a nevén</th><th style="width:15%;">Bizonylat</th><th style="width:20%;">Jogcím</th><th style="width:10%;">Év</th><th style="width:15%; text-align:right;">Összeg</th></tr>${trs}</table>`;
            } else { financeHtml = `<div class="section-title">BEFIZETÉSI NYILVÁNTARTÁS</div><p style="text-align:center; font-style:italic;">Nincs rögzített befizetés a kért időszakban.</p>`; }
        }

        let churchHtml = '';
        const allMembers = [currentFamilyData.family.ferfi, currentFamilyData.family.no, ...currentFamilyData.children].filter(Boolean);
        allMembers.forEach(m => {
            const k = currentFamilyData.kereszt?.find(x => x.id_szemely === m.id);
            const f = currentFamilyData.konfirm?.find(x => x.id_szemely === m.id);
            const t = currentFamilyData.temetes?.find(x => x.id_szemely === m.id);
            const spouse = (m.id === currentFamilyData.family.id_ferfi) ? currentFamilyData.family.no : (m.id === currentFamilyData.family.id_no ? currentFamilyData.family.ferfi : null);
            
            churchHtml += `<tr>
                <td><b>${window.formatNameWithPrefix(m, spouse, 'print')}</b></td>
                <td>${m.sz_datum || '-'}</td>
                <td>${k ? k.datum?.split('T')[0] + '<br><small>' + (k.adrlocality?.name||'') + '</small>' : 'Nincs'}</td>
                <td>${f ? f.datum?.split('T')[0] + '<br><small>' + (f.adrlocality?.name||'') + '</small>' : 'Nincs'}</td>
                <td>${t ? t.hdatum?.split('T')[0] : 'Nincs'}</td>
                <td>${m.vallas || 'Református'}</td>
            </tr>`;
        });

        const wDate = currentFamilyData.hazassag ? (currentFamilyData.hazassag.datum?.split('T')[0] || '-') : '-';
        const wLoc = currentFamilyData.hazassag ? (currentFamilyData.hazassag.adrlocality?.name || '-') : '-';
        
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        printWindow.document.write(`
            <html><head><title>Családlap - ${document.getElementById('fam-det-title').innerText}</title>
            <style>
                @page { size: A4 portrait; margin: 15mm; } 
                body { font-family: 'Times New Roman', serif; color: black; font-size: 11pt; line-height: 1.3; }
                h1 { text-align: center; text-transform: uppercase; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px;}
                .section-title { font-weight: bold; background-color: #e2e8f0; border: 1px solid black; padding: 5px; margin-top: 20px; text-transform: uppercase; font-size: 10pt;}
                table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt;}
                th, td { border: 1px solid black; padding: 6px; text-align: left; vertical-align: middle; }
                th { background-color: #f1f5f9; font-weight: bold; text-align: center;}
                @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
            </style></head>
            <body>
                <h1>Családkönyvi Lap</h1>
                <div style="text-align: right; margin-bottom: 20px; font-style: italic;">Nyomtatva a <b>${gyulNev}</b> nyilvántartásából.</div>
                <div class="section-title">I. Család Alapadatai</div>
                <table>
                    <tr><th style="width:20%;">Családfő (Férj)</th><td style="width:30%;"><b>${currentFamilyData.family.ferfi ? window.formatNameWithPrefix(currentFamilyData.family.ferfi, currentFamilyData.family.no, 'print') : '-'}</b></td>
                        <th style="width:20%;">Feleség</th><td style="width:30%;"><b>${currentFamilyData.family.no ? window.formatNameWithPrefix(currentFamilyData.family.no, currentFamilyData.family.ferfi, 'print') : '-'}</b></td></tr>
                    <tr><th>Közös Lakcím</th><td colspan="3">${document.getElementById('fam-det-full-address').innerText} (${document.getElementById('fam-det-address-details').innerText})</td></tr>
                    <tr><th>Házasságkötés</th><td colspan="3"><b>Ideje:</b> ${wDate} &nbsp;&nbsp;&nbsp; <b>Helye:</b> ${wLoc}</td></tr>
                </table>
                <div class="section-title">II. Családtagok és Anyakönyvek</div>
                <table>
                    <tr><th>Név</th><th>Született</th><th>Keresztelés</th><th>Konfirmálás</th><th>Temetés</th><th>Vallás</th></tr>
                    ${churchHtml}
                </table>
                ${financeHtml}
                <div style="margin-top: 50px; text-align: right;">.......................................................<br><b>Lelkipásztor aláírása (P.H.)</b></div>
                <script>setTimeout(() => { window.print(); }, 500);</script>
            </body></html>
        `);
        printWindow.document.close();
        window.isReturningToFamilyDetails = false;
        bootstrap.Modal.getInstance(document.getElementById('modal-print-family-settings')).hide();
        setTimeout(() => openFamilyDetails(currentFamilyData.family.id), 300);
    } catch (err) { console.error(err); alert("Hiba a nyomtatvány generálásakor!"); } finally { printBtn.innerHTML = origText; printBtn.disabled = false; }
};

window.openEditFamily = async function() {
    if (!currentFamilyData) return;
    const fam = currentFamilyData.family;
    window.currentEditingFamilyId = fam.id;
    window.isReturningToFamilyDetails = true; 

    document.querySelector('#modal-add-family .modal-title').innerHTML = '<i class="ti ti-home-edit me-2"></i>Család Módosítása';
    document.querySelector('#family-form button[type="submit"]').innerHTML = '<i class="ti ti-device-floppy me-1"></i> Módosítás Mentése';

    await populateFamilySelects(fam.id_ferfi, fam.id_no);
    document.getElementById('f-id_ferfi').value = fam.id_ferfi || ''; document.getElementById('f-ferfi-input').value = fam.ferfi ? `${fam.ferfi.csaladnev} ${fam.ferfi.k_nev}` : '';
    document.getElementById('f-id_no').value = fam.id_no || ''; document.getElementById('f-no-input').value = fam.no ? `${fam.no.csaladnev} ${fam.no.k_nev}` : '';
    document.getElementById('f-c_helysegid').value = fam.utca?.localityid || ''; document.getElementById('f-c_utcaid').value = fam.c_utcaid || '';
    document.getElementById('f-c_szam').value = fam.c_szam || ''; document.getElementById('f-c_tombhaz').value = fam.c_tombhaz || '';
    document.getElementById('f-c_lepcsohaz').value = fam.c_lepcsohaz || ''; document.getElementById('f-c_emelet').value = fam.c_emelet || '';
    document.getElementById('f-c_ajto').value = fam.c_ajto || ''; document.getElementById('f-id_csoport').value = fam.id_csoport || '';

    selectedChildrenForNewFamily = currentFamilyData.children.map(c => ({ id: c.id, name: `${c.csaladnev} ${c.k_nev}` }));
    updateChildrenUI();

    bootstrap.Modal.getInstance(document.getElementById('modal-family-details')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-add-family')).show();
};

window.openVisitModal = function() {
    if (!currentFamilyData) return;
    window.isReturningToFamilyDetails = true; 
    document.getElementById('v-csalad-id').value = currentFamilyData.family.id;
    document.getElementById('v-lelkesz').value = ''; 
    document.getElementById('v-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('visit-form').reset();
    bootstrap.Modal.getInstance(document.getElementById('modal-family-details')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-add-visit')).show();
};

// ==========================================
// CSALÁDFA MEGJELENÍTÉSE A CSALÁDOK FÜLÖN
// ==========================================

let _ftInstance = null;

window.showFamilyTree = async function(familyId) {
    if (typeof loadLib === 'function') await loadLib('familytree');

    // Letisztult családfa sablonok beállítása (egyszer fut le)
    if (typeof FamilyTree !== 'undefined' && !FamilyTree.templates.ferfi) {
        var nW = 220, nH = 80;
        var maleAvatar = '<circle cx="35" cy="30" r="12" fill="{af}" opacity="0.8"></circle>' +
            '<path d="M18,58 C18,46 26,40 35,40 C44,40 52,46 52,58" fill="{af}" opacity="0.5"></path>';
        var femaleAvatar = '<circle cx="35" cy="30" r="12" fill="{af}" opacity="0.8"></circle>' +
            '<path d="M18,58 C18,46 26,40 35,40 C44,40 52,46 52,58" fill="{af}" opacity="0.5"></path>' +
            '<path d="M23,25 C23,16 28,14 35,14 C42,14 47,16 47,25 L47,30 C47,30 44,28 42,30 C40,28 38,27 35,28 C32,27 30,28 28,30 C26,28 23,30 23,30 Z" fill="{af}" opacity="0.35"></path>';
        function buildNodeSvg(borderColor, bgColor, avatarFill, avatarSvg) {
            var av = avatarSvg.replace(/\{af\}/g, avatarFill);
            return '<rect x="0" y="0" width="' + nW + '" height="' + nH + '" rx="10" ry="10" fill="' + bgColor + '" stroke="' + borderColor + '" stroke-width="1.5"></rect>' +
                '<line x1="68" y1="12" x2="68" y2="' + (nH - 12) + '" stroke="' + borderColor + '" stroke-width="0.5" opacity="0.3"></line>' +
                av;
        }
        var fieldDefs = {
            field_0: '<text x="78" y="30" font-size="13" font-weight="600" font-family="Inter,sans-serif" fill="#1e293b">{val}</text>',
            field_1: '<text x="78" y="47" font-size="10.5" font-family="Inter,sans-serif" fill="#64748b">{val}</text>',
            field_2: '<text x="78" y="62" font-size="9.5" font-family="Inter,sans-serif" fill="#94a3b8">{val}</text>'
        };
        function makeTpl(nodeSvg) {
            var t = Object.assign({}, FamilyTree.templates.hugo);
            t.size = [nW, nH];
            t.node = nodeSvg;
            t.field_0 = fieldDefs.field_0;
            t.field_1 = fieldDefs.field_1;
            t.field_2 = fieldDefs.field_2;
            t.ripple = { radius: 0, color: 'transparent', rect: null };
            return t;
        }
        FamilyTree.templates.ferfi = makeTpl(buildNodeSvg('#3b82f6', '#f0f7ff', '#3b82f6', maleAvatar));
        FamilyTree.templates.no = makeTpl(buildNodeSvg('#ec4899', '#fdf2f8', '#ec4899', femaleAvatar));
        FamilyTree.templates.ferfi_elhunyt = makeTpl('<g opacity="0.45">' + buildNodeSvg('#94a3b8', '#f8fafc', '#94a3b8', maleAvatar) + '</g>');
        FamilyTree.templates.no_elhunyt = makeTpl('<g opacity="0.45">' + buildNodeSvg('#94a3b8', '#f8fafc', '#94a3b8', femaleAvatar) + '</g>');
        FamilyTree.templates.kivalasztott = makeTpl(buildNodeSvg('#0ca678', '#ecfdf5', '#0ca678', maleAvatar));
    }

    const container = document.getElementById('ft-container');
    const view = document.getElementById('family-tree-view');
    const badge = document.getElementById('ft-badge');
    const nameEl = document.getElementById('ft-family-name');
    if (!container || !view) return;

    view.style.display = 'block';
    container.innerHTML = '';
    if (_ftInstance) { try { _ftInstance.destroy?.(); } catch(e) {} _ftInstance = null; }
    if (badge) badge.textContent = 'Betöltés...';

    // Család adatai
    const { data: fam } = await _supabase.from('csalad')
        .select('id, id_ferfi, id_no')
        .eq('id', familyId).single();
    if (!fam) { if (badge) badge.textContent = 'Hiba'; return; }

    const nodes = [];
    const visited = new Set();

    async function fetchById(id) {
        if (!id || visited.has(id)) return null;
        visited.add(id);
        const { data } = await _supabase.from('szemely')
            .select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja')
            .eq('id', id).maybeSingle();
        return data;
    }

    async function fetchByCnp(cnp) {
        if (!cnp || visited.has('cnp_' + cnp)) return null;
        visited.add('cnp_' + cnp);
        const { data } = await _supabase.from('szemely')
            .select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja')
            .eq('cnp', cnp).maybeSingle();
        if (data) visited.add(data.id);
        return data;
    }

    var _ftYear = new Date().getFullYear();
    function toNode(p, fid, mid) {
        var genderTag = p.ferfi ? 'ferfi' : 'no';
        var tag = p.meghalt ? genderTag + '_elhunyt' : genderTag;
        var bornText = '';
        if (p.sz_datum) {
            var bYear = new Date(p.sz_datum).getFullYear();
            var age = _ftYear - bYear;
            bornText = 'sz. ' + bYear + ' (' + age + ' év)';
        }
        return {
            id: p.id,
            pids: [],
            fid: fid || undefined,
            mid: mid || undefined,
            name: `${p.csaladnev || ''} ${p.k_nev || ''}`.trim(),
            born: bornText,
            gender: p.ferfi ? 'male' : 'female',
            deceased: p.meghalt ? '✝ Elhunyt' : '',
            tags: [tag],
            _cnp: p.cnp
        };
    }

    // Családfő(k) betöltése
    const husband = fam.id_ferfi ? await fetchById(fam.id_ferfi) : null;
    const wife = fam.id_no ? await fetchById(fam.id_no) : null;

    if (husband) nodes.push(toNode(husband, null, null));
    if (wife) nodes.push(toNode(wife, null, null));

    // Házaspár összekapcsolása
    if (husband && wife) {
        nodes.find(n => n.id === husband.id).pids = [wife.id];
        nodes.find(n => n.id === wife.id).pids = [husband.id];
    }

    // Családnév
    const familyName = husband ? `${husband.csaladnev} ${husband.k_nev}` : (wife ? `${wife.csaladnev} ${wife.k_nev}` : 'Család');
    if (nameEl) nameEl.textContent = familyName;

    // Gyerekek
    const { data: children } = await _supabase.from('gyerek')
        .select('id_szemely').eq('id_csalad', familyId);
    if (children?.length > 0) {
        for (const c of children) {
            const child = await fetchById(c.id_szemely);
            if (child) {
                nodes.push(toNode(child,
                    husband ? husband.id : undefined,
                    wife ? wife.id : undefined
                ));

                // Gyerek házastársa és unokák (egy szint le)
                const { data: childFam } = await _supabase.from('csalad')
                    .select('id, id_ferfi, id_no')
                    .or(`id_ferfi.eq.${child.id},id_no.eq.${child.id}`)
                    .maybeSingle();
                if (childFam) {
                    const childSpouseId = childFam.id_ferfi === child.id ? childFam.id_no : childFam.id_ferfi;
                    if (childSpouseId) {
                        const childSpouse = await fetchById(childSpouseId);
                        if (childSpouse) {
                            var csNode = toNode(childSpouse, null, null);
                            csNode.pids = [child.id];
                            nodes.find(n => n.id === child.id).pids = [childSpouse.id];
                            nodes.push(csNode);
                        }
                    }
                    // Unokák
                    const { data: grandchildren } = await _supabase.from('gyerek')
                        .select('id_szemely').eq('id_csalad', childFam.id);
                    if (grandchildren?.length > 0) {
                        for (const gc of grandchildren) {
                            const grandchild = await fetchById(gc.id_szemely);
                            if (grandchild) {
                                nodes.push(toNode(grandchild,
                                    child.ferfi ? child.id : (childSpouseId || undefined),
                                    child.ferfi ? (childSpouseId || undefined) : child.id
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    // Szülők (férj és feleség szülei)
    async function addParents(person) {
        if (!person) return;
        let fatherId = null, motherId = null;
        if (person.id_apja) {
            const father = await fetchByCnp(person.id_apja);
            if (father) { fatherId = father.id; nodes.push(toNode(father, null, null)); }
        }
        if (person.id_anyja) {
            const mother = await fetchByCnp(person.id_anyja);
            if (mother) { motherId = mother.id; nodes.push(toNode(mother, null, null)); }
        }
        if (fatherId && motherId) {
            nodes.find(n => n.id === fatherId).pids = [motherId];
            nodes.find(n => n.id === motherId).pids = [fatherId];
        }
        const pNode = nodes.find(n => n.id === person.id);
        if (pNode) {
            if (fatherId) pNode.fid = fatherId;
            if (motherId) pNode.mid = motherId;
        }
    }
    await addParents(husband);
    await addParents(wife);

    if (nodes.length <= 1) {
        container.innerHTML = '<div class="p-5 text-center text-muted"><i class="ti ti-binary-tree fs-1 d-block mb-2 text-warning"></i><h4>Nincs elegendő adat a családfa megjelenítéséhez</h4><p>Rögzítse a családtagok szüleit és családi kapcsolatait!</p></div>';
        if (badge) badge.textContent = 'Nincs adat';
        return;
    }

    if (badge) badge.textContent = `${nodes.length} személy`;

    // Fa megjelenítése
    _ftInstance = new FamilyTree(container, {
        nodes: nodes,
        nodeBinding: {
            field_0: 'name',
            field_1: 'born',
            field_2: 'deceased'
        },
        editForm: { enabled: false },
        toolbar: { zoom: true, fit: true },
        template: 'hugo',
        scaleInitial: FamilyTree.match.boundary,
        enableSearch: false,
        mouseScrool: FamilyTree.action.zoom,
    });

    // Scroll a családfához
    view.scrollIntoView({ behavior: 'smooth', block: 'start' });
};