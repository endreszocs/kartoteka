// --- js/congregation_api.js ---

async function initHeaderData() {
    try {
        // getCachedProfile() — sessionStorage cache, 0 API hívás meleg indításnál
        const cached = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (!cached) return;

        const fullName = cached.full_name || cached.email.split('@')[0];
        const firstName = fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : fullName;
        const pastorNameEl = document.getElementById('header-pastor-name');
        if (pastorNameEl) pastorNameEl.innerText = firstName || 'Lelkipásztor';

        if(fullName && fullName.includes(' ')) {
            const initials = fullName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            const avatarIcon = document.getElementById('header-avatar-icon');
            const miniAvatar = document.getElementById('header-mini-avatar');
            if (avatarIcon) avatarIcon.innerHTML = `<span class="fs-4 fw-bold">${initials}</span>`;
            if (miniAvatar) miniAvatar.innerHTML = `<span class="fw-bold">${initials}</span>`;
        }

        const congId = cached.congregation_id;

        const congNameEl = document.getElementById('header-congregation-name');
        if (congId) {
            const { data: cong } = await _supabase.from('congregations').select('*').eq('id', congId).single();
            if (cong && congNameEl) {
                congNameEl.innerText = cong.nev_hu || cong.name || "Saját Egyházközség";
                const avatarIcon = document.getElementById('header-avatar-icon');
                if (cong.cimer_url && avatarIcon) {
                    avatarIcon.innerHTML = '';
                    avatarIcon.style.backgroundImage = `url('${cong.cimer_url}')`;
                    avatarIcon.style.backgroundSize = 'cover';
                    avatarIcon.style.backgroundPosition = 'center';
                }
            }
        } else {
            if (congNameEl) congNameEl.innerText = "Várakozás a SzuperAdmin jóváhagyására...";
        }
    } catch(err) { console.error("Header hiba:", err); }
}

window.openCongregationModal = async function() {
    try {
        const cached = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (!cached) return;
        const congId = cached.congregation_id;
        
        if (!congId) {
            alert("A kerületi SzuperAdmin még nem hagyta jóvá a regisztrációját, vagy nem rendelt Önhöz gyülekezetet! Kérem, lépjen kapcsolatba az esperesi hivatallal.");
            return;
        }

        const { data: cong, error } = await _supabase.from('congregations').select('*').eq('id', congId).single();
        if (error) throw error;

        // 1. Adatok betöltése
        document.getElementById('c-id').value = cong.id;
        document.getElementById('c-nev_hu').value = cong.nev_hu || cong.name || '';
        document.getElementById('c-nev_ro').value = cong.nev_ro || '';
        document.getElementById('c-nev_en').value = cong.nev_en || '';
        document.getElementById('c-adoszam').value = cong.adoszam || '';
        document.getElementById('c-cim').value = cong.cim || '';
        document.getElementById('c-email').value = cong.email || '';
        document.getElementById('c-telefon').value = cong.telefon || '';
        document.getElementById('c-web').value = cong.web || '';
        document.getElementById('c-eves_jarulek').value = cong.eves_jarulek || 100;
        if (document.getElementById('c-jarulek_kedvezmenyes')) {
            document.getElementById('c-jarulek_kedvezmenyes').value = cong.jarulek_kedvezmenyes || 0;
        }
        if (document.getElementById('c-jarulek_hatarid')) {
            document.getElementById('c-jarulek_hatarid').value = cong.jarulek_hatarid || '07-01';
        }
        document.getElementById('c-iban').value = cong.iban || '';
        document.getElementById('c-bank').value = cong.bank || '';
        var tartozasMod = cong.tartozas_szamitas_mod || 'akkori';
        var tartozasRadio = document.querySelector('input[name="c-tartozas-mod"][value="' + tartozasMod + '"]');
        if (tartozasRadio) tartozasRadio.checked = true;

        if (cong.cimer_url && document.getElementById('c-cimer-preview')) {
            document.getElementById('c-cimer-preview').style.backgroundImage = `url('${cong.cimer_url}')`;
        }

        // 2. Egyházmegyék legördülő lista dinamikus betöltése az adatbázisból
        const selectEl = document.getElementById('c-diocese_id');
        if (selectEl) {
            const { data: dioceses, error: dioErr } = await _supabase.from('dioceses').select('id, name').order('name');
            if (!dioErr && dioceses) {
                let opts = '<option value="">-- Válasszon Egyházmegyét --</option>';
                dioceses.forEach(d => {
                    const isSelected = (cong.diocese_id === d.id) ? 'selected' : '';
                    opts += `<option value="${d.id}" ${isSelected}>${d.name}</option>`;
                });
                selectEl.innerHTML = opts;
            } else {
                selectEl.innerHTML = '<option value="">Hiba a betöltéskor</option>';
            }
        }

        new bootstrap.Modal(document.getElementById('modal-congregation')).show();
    } catch (err) {
        console.error("Hiba az adatok betöltésekor:", err);
        alert("Hiba történt a gyülekezet betöltésekor. " + err.message);
    }
}

async function saveCongregationData(e) {
    e.preventDefault();
    const id = document.getElementById('c-id').value;
    
    const dioceseSelect = document.getElementById('c-diocese_id');
    const selectedDioceseId = dioceseSelect && dioceseSelect.value ? dioceseSelect.value : null;
    const selectedDioceseName = dioceseSelect && dioceseSelect.selectedIndex > 0 ? dioceseSelect.options[dioceseSelect.selectedIndex].text : '';

    const updates = {
        name: document.getElementById('c-nev_hu').value, 
        nev_hu: document.getElementById('c-nev_hu').value,
        nev_ro: document.getElementById('c-nev_ro').value,
        nev_en: document.getElementById('c-nev_en').value,
        diocese_id: selectedDioceseId, // ÚJ: Szabványos azonosító mentése
        egyhazmegye: selectedDioceseName, // Régi oszlop kompatibilitás miatt
        adoszam: document.getElementById('c-adoszam').value,
        cim: document.getElementById('c-cim').value,
        email: document.getElementById('c-email').value,
        telefon: document.getElementById('c-telefon').value,
        web: document.getElementById('c-web').value,
        eves_jarulek: parseFloat(document.getElementById('c-eves_jarulek').value) || 0,
        jarulek_kedvezmenyes: parseFloat((document.getElementById('c-jarulek_kedvezmenyes') || {}).value) || 0,
        jarulek_hatarid: ((document.getElementById('c-jarulek_hatarid') || {}).value || '').trim() || '07-01',
        iban: document.getElementById('c-iban').value,
        bank: document.getElementById('c-bank').value,
        tartozas_szamitas_mod: (document.querySelector('input[name="c-tartozas-mod"]:checked') || {}).value || 'akkori'
    };

    const fileInput = document.getElementById('c-cimer-upload');
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = `cimer_${id}_${Date.now()}.${file.name.split('.').pop()}`;
        const { error: uploadError } = await _supabase.storage.from('logos').upload(fileName, file);
        if (!uploadError) {
            const { data } = _supabase.storage.from('logos').getPublicUrl(fileName);
            updates.cimer_url = data.publicUrl;
        }
    }

    var { error } = await _supabase.from('congregations').update(updates).eq('id', id);
    if (error && error.message && error.message.indexOf('tartozas_szamitas_mod') >= 0) {
        // Oszlop még nem létezik — újra megpróbáljuk nélküle
        delete updates.tartozas_szamitas_mod;
        var retry = await _supabase.from('congregations').update(updates).eq('id', id);
        error = retry.error;
    }
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modal-congregation')).hide();
        initHeaderData();
        await _supabase.auth.updateUser({ data: { congregation_name: updates.nev_hu } });
        alert("Sikeresen frissítve!");
    } else {
        alert("Hiba mentéskor: " + error.message);
    }
}

// Megnyitja a gyülekezeti modalt a pénzügyi fülön
window.openCongregationPenzugyTab = async function() {
    await window.openCongregationModal();
    // Pénzügyi fülre váltás
    var penzugyTab = document.querySelector('a[href="#tab-c-penzugy"]');
    if (penzugyTab) {
        var tabInst = new bootstrap.Tab(penzugyTab);
        tabInst.show();
    }
};

document.addEventListener('DOMContentLoaded', () => { setTimeout(initHeaderData, 800); });