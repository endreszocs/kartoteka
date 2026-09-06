// --- js/leltar.js ---

window.allLeltarTetelek = [];
window.currentSettings = {}; 
window.isEditingPendingItem = false; 

window.leltarKatalogus = [
    { kod: "1.6.2", nev: "Egyházi, tanügyi épületek", minEv: 40, maxEv: 60, defEv: 50 },
    { kod: "2.1.16.5", nev: "Hőközpontok (Kazánok)", minEv: 8, maxEv: 12, defEv: 10 },
    { kod: "2.2.9", nev: "Számítógépek, nyomtatók, pénztárgépek", minEv: 2, maxEv: 4, defEv: 3 },
    { kod: "2.3.2.1.1", nev: "Személyszállító gépkocsi", minEv: 4, maxEv: 6, defEv: 5 },
    { kod: "2.3.2.1.2", nev: "Mikrobusz", minEv: 4, maxEv: 8, defEv: 6 },
    { kod: "2.3.2.2.1", nev: "Áruszállító gépkocsi 4.5 t-ig", minEv: 4, maxEv: 6, defEv: 5 },
    { kod: "3.1.1", nev: "Bútorok (Általános)", minEv: 9, maxEv: 15, defEv: 12 },
    { kod: "3.1.1.1", nev: "Irodai bútor", minEv: 3, maxEv: 5, defEv: 4 },
    { kod: "3.1.5", nev: "Hangszerek (Orgonán kívül)", minEv: 4, maxEv: 6, defEv: 5 },
    { kod: "3.2.1", nev: "Irodai gépek (Kivéve számítógép)", minEv: 4, maxEv: 6, defEv: 5 }
];

window.populateKatalogus = function() {
    const select = document.getElementById('l-katalogus');
    if (select && select.options.length <= 1) {
        select.innerHTML = '<option value="">-- Válasszon a 2139/2004 katalógusból --</option>' + 
            window.leltarKatalogus.map(k => `<option value="${k.kod}">${k.kod} - ${k.nev} (${k.minEv}-${k.maxEv} év)</option>`).join('');
    }
};

const fmt = (num) => Number(num).toLocaleString('hu-HU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).replace(/\u202f/g, ' ');

window.generateNextLeltariSzam = function(kategoria) {
    const prefixMap = { 'Alapeszközök': 'AE', 'Csekély értékű': 'CS', 'Telkek_Földek': 'T', 'Könyvek': 'K', 'Kegyszerek': 'KG', 'Bizományi': 'B', 'Kárpótlási': 'KR' };
    const prefix = prefixMap[kategoria] || 'L';
    const relevantTetelek = window.allLeltarTetelek.filter(t => t.kategoria === kategoria && t.leltari_szam && t.leltari_szam.startsWith(prefix + '-'));
    let maxNum = 0;
    relevantTetelek.forEach(t => {
        const num = parseInt(t.leltari_szam.split('-')[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return `${prefix}-${maxNum + 1}`;
};

window.UniversalSmartSearch = function(query, resultsContainerId, onSelectFunctionName) {
    const resultsContainer = document.getElementById(resultsContainerId);
    if (query.trim().length < 2) { resultsContainer.classList.add('d-none'); return; }
    if (!window.allChurchMembers || window.allChurchMembers.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-light">Nincs betöltve!</div>`;
        resultsContainer.classList.remove('d-none'); return;
    }
    const normalizeStr = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const qNorm = normalizeStr(query.trim());
    const matches = window.allChurchMembers.filter(m => normalizeStr(`${m.csaladnev || ''} ${m.k_nev || ''}`).includes(qNorm)).slice(0, 10); 
    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-white fw-bold border-bottom"><i class="ti ti-user-off me-2"></i>Nincs találat!</div>`;
    } else {
        resultsContainer.innerHTML = matches.map(m => `<button type="button" class="list-group-item list-group-item-action py-2 bg-white" onclick="window.${onSelectFunctionName}(${m.id}, '${`${m.csaladnev || ''} ${m.k_nev || ''}`.replace(/'/g, "\\'")}')"><div class="fw-bold text-primary">${m.csaladnev} ${m.k_nev}</div></button>`).join('');
    }
    resultsContainer.classList.remove('d-none');
};

window.initLeltar = async function() {
    const tbody = document.getElementById('leltar-list-body');
    if (!activeCongregationId) activeCongregationId = localStorage.getItem('activeCongregationId');
    if (!activeCongregationId) return;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        
        // 🚨 ÚJ: Közvetlen Szuperadmin Ellenőrzés az Adatbázisból!
        if (user) {
            const { data: profile } = await _supabase.from('profiles').select('role').eq('id', user.id).single();
            if (profile && profile.role === 'szuperadmin') {
                const auditBtn = document.getElementById('btn-leltar-audit');
                if (auditBtn) auditBtn.classList.remove('d-none');
            }
        }
        
        // Szuperadmin fallback (ha lokálisan van aktiválva a God Mode)
        if (localStorage.getItem('godMode') === 'true') {
            document.getElementById('btn-leltar-audit')?.classList.remove('d-none');
        }

        const currentYear = new Date().getFullYear().toString();
        const { data: bealData } = await _supabase.from('bealitas').select('*').eq('id', currentYear).eq('congregation_id', activeCongregationId).single();
        if (bealData) window.currentSettings = bealData;

        const { data, error } = await _supabase.from('leltar_tetelek').select('*').eq('congregation_id', activeCongregationId).eq('is_deleted', false).order('created_at', { ascending: false });
        if (error) throw error;
        
        window.allLeltarTetelek = data || [];
        const varolista = window.allLeltarTetelek.filter(t => t.kategoria === 'Várólista');
        
        const banner = document.getElementById('leltar-varolista-banner');
        if (banner) {
            if (varolista.length > 0) {
                banner.innerHTML = `<div class="alert alert-danger shadow-sm border-danger d-flex align-items-center justify-content-between">
                    <div><i class="ti ti-alert-triangle fs-2 me-2"></i><strong class="fs-3">Figyelem!</strong> Önnek <b>${varolista.length} db</b> pénztárból kifizetett vagyontárgya vár leltározásra! <span class="ms-2 fw-normal">(A táblázat legtetején találja őket piros jelzéssel!)</span></div>
                </div>`;
                banner.classList.remove('d-none');
            } else banner.classList.add('d-none');
        }
        
        const uniqueHelyszinek = [...new Set(window.allLeltarTetelek.map(t => t.helyszin).filter(h => h && h !== ''))].sort();
        const selectEl = document.getElementById('l-helyszin-select');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Válasszon helyszínt --</option>' + uniqueHelyszinek.map(h => `<option value="${h}">${h}</option>`).join('') + '<option value="OTHER" class="text-primary fw-bold">+ Egyéb (Új helyszín)</option>';
        }
        const filterEl = document.getElementById('leltar-filter-helyszin');
        if (filterEl) filterEl.innerHTML = '<option value="all">-- Minden Helyszín --</option>' + uniqueHelyszinek.map(h => `<option value="${h}">${h}</option>`).join('');
        
        window.renderLeltarStats(); window.renderLeltarTable('all', 'all');

        // Véglegesítés állapotának ellenőrzése — gombok frissítése
        if (typeof window._updateLeltarActionButtons === 'function') {
            window._updateLeltarActionButtons();
        }
    } catch (err) { console.error("Leltár hiba:", err); }
};

// 🚨 ÚJ: Helyszín váltó funkció
window.toggleHelyszinInput = function() {
    const sel = document.getElementById('l-helyszin-select');
    const inp = document.getElementById('l-helyszin-input');
    if (sel.value === 'OTHER') {
        inp.classList.remove('d-none');
        inp.focus();
    } else {
        inp.classList.add('d-none');
        inp.value = '';
    }
};

window.renderLeltarStats = function() {
    let totalDb = window.allLeltarTetelek.length; let totalErtek = 0; let maxErtek = 0; let topTargy = "-"; let nullaDb = 0;
    const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1;

    window.allLeltarTetelek.forEach(t => {
        let bErtek = parseFloat(t.beszerzesi_ertek) || 0; let qty = parseFloat(t.mennyiseg) || 1;
        totalErtek += bErtek * qty;
        if (bErtek * qty > maxErtek) { maxErtek = bErtek * qty; topTargy = t.megnevezes; }
        if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0 && t.beszerzes_datuma) {
            const bDate = new Date(t.beszerzes_datuma);
            let elteltHonapok = (currentYear - bDate.getFullYear()) * 12 + (currentMonth - (bDate.getMonth() + 1));
            if (elteltHonapok < 0) elteltHonapok = 0;
            if ((bErtek - (elteltHonapok * (bErtek / (t.hasznalati_ido_ev * 12)))) <= 0) nullaDb++;
        }
    });

    document.getElementById('stat-db').innerText = `${totalDb} db`;
    document.getElementById('stat-ertek').innerText = `${fmt(totalErtek)} RON`;
    document.getElementById('stat-top').innerText = topTargy;
    document.getElementById('stat-top').title = `${fmt(maxErtek)} RON`;
    document.getElementById('stat-nulla').innerText = `${nullaDb} db`;
};

window.filterLeltarList = function() { 
    window.renderLeltarTable(document.getElementById('leltar-filter-kategoria').value, document.getElementById('leltar-filter-helyszin').value); 
};

window.renderLeltarTable = function(kategoriaFilter, helyszinFilter) {
    const tbody = document.getElementById('leltar-list-body');
    const searchVal = document.getElementById('leltar-search') ? document.getElementById('leltar-search').value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
    if (!tbody) return;

    let filtered = window.allLeltarTetelek;
    if (kategoriaFilter !== 'all') filtered = filtered.filter(t => t.kategoria === kategoriaFilter);
    if (helyszinFilter !== 'all') filtered = filtered.filter(t => t.helyszin === helyszinFilter);

    // 🚨 Kereső Motor
    if (searchVal) {
        filtered = filtered.filter(t => {
            const normText = `${t.megnevezes || ''} ${t.leltari_szam || ''} ${t.szerzo || ''} ${t.beszerzes_bizonylat || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return normText.includes(searchVal);
        });
    }

    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center p-5 text-muted"><i class="ti ti-search fs-1 d-block mb-2"></i>Nincs a keresésnek megfelelő vagyontárgy.</td></tr>'; return; }

    // Rendezzük úgy, hogy a FÜGGŐ (Várólista) mindig legfelül legyen!
    filtered.sort((a, b) => {
        if (a.kategoria === 'Várólista' && b.kategoria !== 'Várólista') return -1;
        if (b.kategoria === 'Várólista' && a.kategoria !== 'Várólista') return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1;
    let html = '';

    filtered.forEach(t => {
        const isVaro = t.kategoria === 'Várólista';
        const rowBg = isVaro ? 'background-color: #fff5f5; border-left: 4px solid #d63939;' : '';

        let nevKiiras = t.megnevezes;
        if (t.kategoria === 'Könyvek') nevKiiras = `<i class="ti ti-book me-1"></i> <span class="text-muted">${t.szerzo || 'Ismeretlen'}:</span> ${t.megnevezes} <br><small class="text-muted">ISBN: ${t.megjegyzes?.includes('ISBN:') ? t.megjegyzes.split('|')[0] : '-'}</small>`;
        else if (t.kategoria === 'Telkek_Földek') nevKiiras = `<i class="ti ti-map me-1"></i> ${t.megnevezes}`;
        else if (isVaro) nevKiiras = `<i class="ti ti-alert-triangle text-danger me-1"></i> ${t.megnevezes}`;

        let szamKiiras = `<span class="fw-bold ${t.leltari_szam === 'FÜGGŐ' ? 'text-danger' : 'text-dark'}">${t.leltari_szam}</span>`;
        if (t.regi_leltari_szam && t.regi_leltari_szam !== '-') szamKiiras += `<br><small class="text-muted" title="Régi leltári szám">(Régi: ${t.regi_leltari_szam})</small>`;

        let beszerzesiErtek = parseFloat(t.beszerzesi_ertek) || 0; let maradvanyErtek = beszerzesiErtek;
        let amortInfo = ''; let hasAmort = false;

        if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0 && t.beszerzes_datuma) {
            hasAmort = true; const bDate = new Date(t.beszerzes_datuma);
            let elteltHonapok = (currentYear - bDate.getFullYear()) * 12 + (currentMonth - (bDate.getMonth() + 1));
            if (elteltHonapok < 0) elteltHonapok = 0;
            maradvanyErtek = beszerzesiErtek - (elteltHonapok * (beszerzesiErtek / (t.hasznalati_ido_ev * 12)));
            if (maradvanyErtek < 0) maradvanyErtek = 0; 
            amortInfo = `<div class="small text-muted" style="font-size:0.7rem;">Amortizáció: ${t.hasznalati_ido_ev} év</div>`;
        }

        html += `<tr style="cursor:pointer; ${rowBg}" onmouseover="this.style.backgroundColor='#f1f5f9'" onmouseout="this.style.backgroundColor='${isVaro ? '#fff5f5' : 'transparent'}'" onclick="window.editLeltarTetel('${t.id}')">
                <td class="align-middle text-center">${szamKiiras}</td>
                <td class="align-middle"><div class="fw-bold ${isVaro ? 'text-danger' : 'text-primary'}">${nevKiiras}</div><div class="small text-muted">${t.kategoria}</div></td>
                <td class="align-middle"><div class="fw-bold text-dark"><i class="ti ti-map-pin me-1 text-muted"></i>${t.helyszin || '-'}</div></td>
                <td class="align-middle"><div class="fw-bold">${t.beszerzes_datuma || '-'}</div></td>
                <td class="align-middle text-end fw-bold text-dark">${fmt(beszerzesiErtek)} RON<div class="small text-muted fw-normal">${t.mennyiseg} ${t.mertekegyseg}</div></td>
                <td class="align-middle text-end fw-bold ${maradvanyErtek === 0 && beszerzesiErtek > 0 ? 'text-danger' : 'text-success'}">${fmt(maradvanyErtek)} RON${amortInfo}</td>
                <td class="align-middle text-end text-nowrap">${hasAmort ? `<button class="btn btn-sm btn-icon btn-ghost-info me-1" onclick="event.stopPropagation(); window.showAmortInfo('${t.id}')" title="Értékcsökkenés"><i class="ti ti-info-circle"></i></button>` : ''}<button class="btn btn-sm btn-icon btn-ghost-danger" onclick="event.stopPropagation(); window.deleteLeltarTetel('${t.id}')" title="Törlés"><i class="ti ti-trash"></i></button></td>
            </tr>`;
    });
    tbody.innerHTML = html;
};

window.showAmortInfo = function(id) {
    const t = window.allLeltarTetelek.find(x => x.id === id);
    if (!t) return;
    const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1;
    const bDate = new Date(t.beszerzes_datuma); const osszesHonap = t.hasznalati_ido_ev * 12;
    let elteltHonapok = (currentYear - bDate.getFullYear()) * 12 + (currentMonth - (bDate.getMonth() + 1));
    if (elteltHonapok < 0) elteltHonapok = 0;
    const haviAmort = parseFloat(t.beszerzesi_ertek) / osszesHonap;
    let eddigiAmort = elteltHonapok * haviAmort;
    let maradvany = parseFloat(t.beszerzesi_ertek) - eddigiAmort;
    if (maradvany <= 0) { maradvany = 0; eddigiAmort = parseFloat(t.beszerzesi_ertek); }

    document.getElementById('amort-info-body').innerHTML = `
        <div class="p-3 bg-light rounded border"><div class="d-flex justify-content-between mb-2 pb-2 border-bottom"><span class="text-muted fw-bold">Beszerzési érték:</span><span class="fw-bold text-dark">${fmt(t.beszerzesi_ertek)} RON</span></div><div class="d-flex justify-content-between mb-2 pb-2 border-bottom"><span class="text-muted fw-bold">Eltelt idő:</span><span class="fw-bold text-info">${elteltHonapok} hónap</span></div><div class="d-flex justify-content-between mb-2 pb-2 border-bottom"><span class="text-muted fw-bold">Havi leírás:</span><span class="fw-bold text-danger">-${fmt(haviAmort)} RON/hó</span></div><div class="d-flex justify-content-between mt-3 pt-2"><span class="text-dark fw-bolder fs-3">Maradványérték:</span><span class="fw-bolder fs-2 ${maradvany === 0 ? 'text-danger' : 'text-success'}">${fmt(maradvany)} RON</span></div></div>`;
    new bootstrap.Modal(document.getElementById('modal-amort-info')).show();
};

window.openNewLeltarModal = function() {
    document.getElementById('form-leltar').reset();
    document.getElementById('l-id').value = '';
    
    // 🚨 JAVÍTÁS: A gyülekezeti beállításokból automatikusan betöltjük a Lelkész nevét!
    const lelkeszNeve = window.currentSettings?.lelkesz || '';
    document.getElementById('l-felelos-id').value = ''; 
    document.getElementById('l-felelos-nev').value = lelkeszNeve;
    
    document.getElementById('l-helyszin-select').value = '';
    document.getElementById('l-helyszin-input').classList.add('d-none');
    
    window.isEditingPendingItem = false; 
    window.bypassDupCheck = false;
    
    const banner = document.getElementById('pending-action-banner');
    if (banner) banner.classList.add('d-none');
    
    window.populateKatalogus(); 
    window.handleKategoriaChange();
    new bootstrap.Modal(document.getElementById('modal-leltar')).show();
};

// =====================================================================
// 🚨 ÚJ KÖNYVTÁR ÉS AUDIT MODULOK (Felülírják az előző funkciókat)
// =====================================================================

window.handleKategoriaChange = function() {
    const kat = document.getElementById('l-kategoria').value;
    const leltarInput = document.getElementById('l-leltariszam');
    const currentEditId = document.getElementById('l-id').value;
    
    if (kat && leltarInput && (!currentEditId || leltarInput.value === 'FÜGGŐ' || window.isEditingPendingItem)) {
        leltarInput.value = window.generateNextLeltariSzam(kat);
    }
    
    const dKonyvExtra = document.getElementById('div-konyv-extra');
    const dMegnev = document.getElementById('div-megnevezes');
    
    if (kat === 'Könyvek') {
        if(dKonyvExtra) {
            dKonyvExtra.classList.remove('d-none');
            // 🚨 VARÁZSLAT: Bepakoljuk a Címet a kék dobozba, a fejléc alá!
            const header = dKonyvExtra.querySelector('.border-bottom');
            if (header && dMegnev) header.after(dMegnev);
        }
        document.getElementById('lbl-megnevezes').innerHTML = 'Könyv Címe (és Alcíme) <span class="text-danger">*</span>';
    } else {
        if(dKonyvExtra) {
            dKonyvExtra.classList.add('d-none');
            // 🚨 VARÁZSLAT: Visszatesszük a Címet az eredeti helyére (a kék doboz alá)
            if (dMegnev) dKonyvExtra.after(dMegnev);
        }
        document.getElementById('lbl-megnevezes').innerHTML = 'Vagyontárgy Megnevezése <span class="text-danger">*</span>';
    }
    
    const amortDiv = document.getElementById('div-amortizacio');
    if (kat === 'Alapeszközök') amortDiv?.classList.remove('d-none'); else amortDiv?.classList.add('d-none');
};

window.handleKatalogusChange = function() {
    const elem = window.leltarKatalogus.find(k => k.kod === document.getElementById('l-katalogus').value);
    if (elem) document.getElementById('l-hasznalati-ido').value = elem.defEv;
};

window.selectLeltarFelelos = function(id, nev) {
    document.getElementById('l-felelos-id').value = id; document.getElementById('l-felelos-nev').value = nev;
    document.getElementById('leltar-search-res').classList.add('d-none');
};

window.saveLeltarTetel = async function(e) {
    if (e) e.preventDefault();
    const editId = document.getElementById('l-id').value;
    const megnevezesInput = document.getElementById('l-megnevezes').value.trim();
    
    if (!window.bypassDupCheck) {
        const dup = window.allLeltarTetelek.find(t => t.id !== editId && t.kategoria !== 'Várólista' && t.megnevezes.toLowerCase() === megnevezesInput.toLowerCase());
        if (dup) {
            window.potentialDupItem = dup; window.pendingSaveEvent = e;
            document.getElementById('dup-name-display').innerText = dup.megnevezes;
            document.getElementById('dup-szam-display').innerText = dup.leltari_szam;
            document.getElementById('dup-val-display').innerText = fmt(dup.beszerzesi_ertek) + ' RON';
            bootstrap.Modal.getInstance(document.getElementById('modal-leltar')).hide();
            new bootstrap.Modal(document.getElementById('modal-duplicate-warning')).show();
            return;
        }
    }

    const btn = document.getElementById('btn-save-leltar');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mentés...'; btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const selHelyszin = document.getElementById('l-helyszin-select').value;
        const veglegesHelyszin = (selHelyszin === 'OTHER') ? document.getElementById('l-helyszin-input').value : selHelyszin;

        const payload = {
            congregation_id: activeCongregationId,
            kategoria: document.getElementById('l-kategoria').value,
            szerzo: document.getElementById('l-szerzo') ? document.getElementById('l-szerzo').value || null : null,
            megnevezes: megnevezesInput,
            leltari_szam: document.getElementById('l-leltariszam').value,
            regi_leltari_szam: document.getElementById('l-regi-leltariszam') ? document.getElementById('l-regi-leltariszam').value || null : null,
            helyszin: veglegesHelyszin,
            felelos_szemely_id: document.getElementById('l-felelos-id').value || null,
            felelos_neve: document.getElementById('l-felelos-nev').value || null,
            beszerzes_datuma: document.getElementById('l-besz-datum').value || null,
            beszerzes_bizonylat: document.getElementById('l-besz-biz').value || null,
            beszerzesi_ertek: parseFloat(document.getElementById('l-ertek').value) || 0,
            mennyiseg: parseFloat(document.getElementById('l-mennyiseg').value) || 1,
            mertekegyseg: document.getElementById('l-mertekegyseg').value,
            megjegyzes: document.getElementById('l-megjegyzes').value || '',
            katalogus_kod: document.getElementById('l-kategoria').value === 'Alapeszközök' ? document.getElementById('l-katalogus').value : null,
            hasznalati_ido_ev: document.getElementById('l-kategoria').value === 'Alapeszközök' ? (parseInt(document.getElementById('l-hasznalati-ido').value, 10) || null) : null,
            
            // 🚨 ÚJ KÖNYVTÁR OSZLOPOK
            konyv_isbn: document.getElementById('l-konyv-isbn') ? document.getElementById('l-konyv-isbn').value : null,
            konyv_kiado: document.getElementById('l-konyv-kiado') ? document.getElementById('l-konyv-kiado').value : null,
            konyv_kiadas_helye: document.getElementById('l-konyv-hely') ? document.getElementById('l-konyv-hely').value : null,
            konyv_kiadas_eve: document.getElementById('l-konyv-ev') ? (parseInt(document.getElementById('l-konyv-ev').value, 10) || null) : null,
            konyv_terjedelem: document.getElementById('l-konyv-oldal') ? document.getElementById('l-konyv-oldal').value : null,
            konyv_sorozatcim: document.getElementById('l-konyv-sorozat') ? document.getElementById('l-konyv-sorozat').value : null,
            userid: user.id
        };

        const editId = document.getElementById('l-id').value;
        if (editId) await _supabase.from('leltar_tetelek').update(payload).eq('id', editId);
        else await _supabase.from('leltar_tetelek').insert([payload]);

        bootstrap.Modal.getInstance(document.getElementById('modal-leltar')).hide();
        await window.initLeltar();
    } catch (err) { alert("Hiba: " + err.message); } 
    finally { btn.innerHTML = '<i class="ti ti-device-floppy me-2"></i>Leltári Tétel Mentése'; btn.disabled = false; }
};

window.deleteLeltarTetel = async function(id) {
    if (!confirm("Biztosan törli ezt a vagyontárgyat? (A Pénztári kiadás, ha volt, megmarad!)")) return;
    await _supabase.from('leltar_tetelek').update({ is_deleted: true }).eq('id', id);
    await window.initLeltar();
};

window.editLeltarTetel = function(id) {
    const t = window.allLeltarTetelek.find(x => x.id === id);
    if (!t) return;
    
    window.isEditingPendingItem = (t.leltari_szam === 'FÜGGŐ'); window.bypassDupCheck = false;
    const banner = document.getElementById('pending-action-banner');
    if (banner) { if (window.isEditingPendingItem) banner.classList.remove('d-none'); else banner.classList.add('d-none'); }
    
    window.populateKatalogus(); 
    
    document.getElementById('l-id').value = t.id;
    document.getElementById('l-kategoria').value = (t.kategoria === 'Várólista') ? '' : t.kategoria;
    
    // Könyvtár adatok betöltése
    if(document.getElementById('l-szerzo')) document.getElementById('l-szerzo').value = t.szerzo || '';
    if(document.getElementById('l-konyv-isbn')) document.getElementById('l-konyv-isbn').value = t.konyv_isbn || '';
    if(document.getElementById('l-konyv-kiado')) document.getElementById('l-konyv-kiado').value = t.konyv_kiado || '';
    if(document.getElementById('l-konyv-hely')) document.getElementById('l-konyv-hely').value = t.konyv_kiadas_helye || '';
    if(document.getElementById('l-konyv-ev')) document.getElementById('l-konyv-ev').value = t.konyv_kiadas_eve || '';
    if(document.getElementById('l-konyv-oldal')) document.getElementById('l-konyv-oldal').value = t.konyv_terjedelem || '';
    if(document.getElementById('l-konyv-sorozat')) document.getElementById('l-konyv-sorozat').value = t.konyv_sorozatcim || '';
    
    document.getElementById('l-leltariszam').value = t.leltari_szam;
    if(document.getElementById('l-regi-leltariszam')) document.getElementById('l-regi-leltariszam').value = t.regi_leltari_szam || '';
    document.getElementById('l-megnevezes').value = t.megnevezes;
    
    const sel = document.getElementById('l-helyszin-select'); const inp = document.getElementById('l-helyszin-input');
    let optionExists = Array.from(sel.options).some(opt => opt.value === t.helyszin);
    if (t.helyszin && optionExists) { sel.value = t.helyszin; inp.classList.add('d-none'); } 
    else if (t.helyszin) { sel.value = 'OTHER'; inp.value = t.helyszin; inp.classList.remove('d-none'); } 
    else { sel.value = ''; inp.classList.add('d-none'); }
    
    document.getElementById('l-felelos-id').value = t.felelos_szemely_id || '';
    document.getElementById('l-felelos-nev').value = t.felelos_neve || '';
    
    document.getElementById('l-besz-datum').value = t.beszerzes_datuma || '';
    document.getElementById('l-ertek').value = t.beszerzesi_ertek || 0;
    document.getElementById('l-mennyiseg').value = t.mennyiseg || 1;
    document.getElementById('l-mertekegyseg').value = t.mertekegyseg || 'db';
    document.getElementById('l-besz-biz').value = t.beszerzes_bizonylat || '';
    document.getElementById('l-megjegyzes').value = t.megjegyzes || '';
    
    window.handleKategoriaChange();
    if (t.kategoria === 'Alapeszközök') { document.getElementById('l-katalogus').value = t.katalogus_kod || ''; document.getElementById('l-hasznalati-ido').value = t.hasznalati_ido_ev || ''; }
    new bootstrap.Modal(document.getElementById('modal-leltar')).show();
};

// ==========================================
// 🚨 ÚJ, CÉLZOTT VONALKÓD OLVASÓ MOTOR (ZXing Live Video)
// ==========================================
let zxingReader = null;
let zxingControls = null;

window.startBarcodeScanner = async function() {
    if (typeof loadLib === 'function') await loadLib('zxing');
    document.getElementById('reader-container').classList.remove('d-none');
    document.getElementById('btn-start-scanner').innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Indítás...';
    document.getElementById('btn-start-scanner').disabled = true;

    // Ha még nem hoztuk létre a célkeresztet (piros keretet) a HTML-ben, most megtesszük
    const readerDiv = document.getElementById('qr-reader');
    if (!document.getElementById('zxing-overlay')) {
        readerDiv.style.position = 'relative';
        readerDiv.innerHTML = `
            <video id="zxing-video" style="width: 100%; max-width: 400px; border-radius: 8px; margin: 0 auto; display: block;"></video>
            <div id="zxing-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; box-sizing: border-box; border: 40px solid rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
                <div style="width: 80%; height: 60px; border: 4px solid #d63939; border-radius: 4px; box-shadow: 0 0 15px rgba(214, 57, 57, 0.5); position: relative;">
                    <div style="position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: #d63939; transform: translateY(-50%); box-shadow: 0 0 10px rgba(214, 57, 57, 0.8);"></div>
                </div>
                <div style="position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); color: white; background: rgba(0,0,0,0.7); padding: 2px 10px; border-radius: 4px; font-size: 0.8rem; width: max-content;">Tartsa ide a vonalkódot</div>
            </div>`;
    }

    if (!zxingReader) zxingReader = new ZXing.BrowserMultiFormatReader();

    // Specifikusan csak az EAN-13 (ISBN) formátumra "vadászunk"!
    const hints = new Map();
    const formats = [ZXing.BarcodeFormat.EAN_13];
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
    zxingReader.hints = hints;

    try {
        const videoInputDevices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
        
        // Megpróbáljuk kiválasztani a hátlapi kamerát (Androidon)
        let selectedDeviceId = videoInputDevices[0].deviceId;
        if (videoInputDevices.length > 1) {
            const backCamera = videoInputDevices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('hát'));
            if (backCamera) selectedDeviceId = backCamera.deviceId;
            else selectedDeviceId = videoInputDevices[videoInputDevices.length - 1].deviceId; // Utolsó kamera (általában hátlapi)
        }

        zxingControls = await zxingReader.decodeFromVideoDevice(selectedDeviceId, 'zxing-video', (result, err) => {
            if (result) {
                // SIKERES BEOLVASÁS!
                const decodedText = result.getText();
                document.getElementById('l-konyv-isbn').value = decodedText;
                
                // Vizuális és hang visszajelzés (ha a böngésző engedi)
                if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(200);
                
                window.stopBarcodeScanner();
                alert("✅ Vonalkód (ISBN) sikeresen beolvasva: " + decodedText);
                window.fetchBookDataFromInput(); // Azonnali internetes keresés!
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                // Csak a valódi hibákat logoljuk, a "nem találta" kivételt nem.
            }
        });
        
    } catch (err) {
        alert("Hiba a kamera indításakor!\n\nOka: Vagy nem engedélyezte a kamerát, VAGY titkosítatlan (http://) hálózatról próbálja használni. A böngészők biztonsági okokból blokkolják az élő videót. Kérem, használja a kék 'Fényképezés' gombot!");
        window.stopBarcodeScanner();
    } finally {
        document.getElementById('btn-start-scanner').innerHTML = '<i class="ti ti-video me-1"></i> Élő Kamera';
        document.getElementById('btn-start-scanner').disabled = false;
    }
};

window.stopBarcodeScanner = function() {
    if (zxingControls) {
        zxingControls.stop();
        zxingControls = null;
    }
    document.getElementById('reader-container').classList.add('d-none');
    document.getElementById('zxing-video').srcObject = null; // Kamera leállítása véglegesen
}; 

// =====================================================================
// 🚨 SZUPERADMIN AUDIT VARÁZSLÓ (Duplikáció szűrő)
// =====================================================================
window.auditList = [];
window.auditCurrentIndex = 0;

window.startLeltarAudit = function() {
    // Összegyűjtjük a duplikált nevű tételeket!
    const nameMap = {};
    window.allLeltarTetelek.forEach(t => {
        if (t.kategoria === 'Várólista') return; // Várólistát nem az auditon át szűrjük
        const n = t.megnevezes.toLowerCase().trim();
        if (!nameMap[n]) nameMap[n] = [];
        nameMap[n].push(t);
    });
    
    window.auditList = [];
    Object.values(nameMap).forEach(group => {
        if (group.length > 1) {
            // A legelsőt kinevezzük eredetinek, a többit "gyanúsnak"
            const orig = group[group.length - 1]; // Mivel fordított időrendben vannak, a legutolsó a legrégebbi rögzítés!
            for (let i = 0; i < group.length - 1; i++) {
                window.auditList.push({ orig: orig, dup: group[i] });
            }
        }
    });
    
    if (window.auditList.length === 0) {
        alert("A Nyilvántartás tökéletes! Nem találtunk gyanús, duplikált tételeket.");
        return;
    }
    
    window.auditCurrentIndex = 0;
    window.showNextAuditItem();
    new bootstrap.Modal(document.getElementById('modal-audit-wizard')).show();
};

window.showNextAuditItem = function() {
    if (window.auditCurrentIndex >= window.auditList.length) {
        bootstrap.Modal.getInstance(document.getElementById('modal-audit-wizard')).hide();
        alert("Az Audit vizsgálat sikeresen befejeződött!");
        window.initLeltar();
        return;
    }
    
    const pair = window.auditList[window.auditCurrentIndex];
    document.getElementById('audit-progress').innerText = `${window.auditCurrentIndex + 1} / ${window.auditList.length}. gyanús tétel`;
    
    document.getElementById('audit-orig-name').innerText = pair.orig.megnevezes;
    document.getElementById('audit-orig-szam').innerText = pair.orig.leltari_szam;
    document.getElementById('audit-orig-val').innerText = fmt(pair.orig.beszerzesi_ertek) + ' RON';
    document.getElementById('audit-orig-date').innerText = `Beszerzés: ${pair.orig.beszerzes_datuma || '-'}`;
    
    document.getElementById('audit-dup-name').innerText = pair.dup.megnevezes;
    document.getElementById('audit-dup-szam').innerText = pair.dup.leltari_szam;
    document.getElementById('audit-dup-val').innerText = fmt(pair.dup.beszerzesi_ertek) + ' RON';
    document.getElementById('audit-dup-date').innerText = `Bizonylat: ${pair.dup.beszerzes_bizonylat || '-'}`;
};

window.auditAction = async function(action) {
    const pair = window.auditList[window.auditCurrentIndex];
    
    try {
        if (action === 'capitalization') {
            const addedVal = parseFloat(pair.dup.beszerzesi_ertek) || 0;
            const ujErtek = (parseFloat(pair.orig.beszerzesi_ertek) || 0) + addedVal;
            const ujMegjegyzes = (pair.orig.megjegyzes || '') + ` | Ráfordítás: +${addedVal} RON (${pair.dup.beszerzes_datuma}, Biz: ${pair.dup.beszerzes_bizonylat})`;
            
            await _supabase.from('leltar_tetelek').update({ beszerzesi_ertek: ujErtek, megjegyzes: ujMegjegyzes }).eq('id', pair.orig.id);
            await _supabase.from('leltar_tetelek').update({ is_deleted: true }).eq('id', pair.dup.id);
        } 
        else if (action === 'delete') {
            await _supabase.from('leltar_tetelek').update({ is_deleted: true }).eq('id', pair.dup.id);
        }
        // Ha 'ignore', nem csinálunk semmit, marad a kettő külön
        
        window.auditCurrentIndex++;
        window.showNextAuditItem();
        
    } catch (err) {
        alert("Hiba a művelet során: " + err.message);
    }
};

window.closeAuditWizard = function() {
    bootstrap.Modal.getInstance(document.getElementById('modal-audit-wizard')).hide();
    window.initLeltar();
};

window.openNyomtatoKozpont = function() {
    const d = new Date(); document.getElementById('l-print-year').value = d.getFullYear();
    document.getElementById('l-print-date').value = d.toISOString().split('T')[0];
    if (typeof currentSettings !== 'undefined' && currentSettings.lelkesz) document.getElementById('l-print-lelkesz').value = currentSettings.lelkesz;
    document.getElementById('l-print-elnok').value = localStorage.getItem('leltar_elnok') || '';
    document.getElementById('l-print-tag1').value = localStorage.getItem('leltar_tag1') || ''; document.getElementById('l-print-tag2').value = localStorage.getItem('leltar_tag2') || '';
    
    const uniqueHelyszinek = [...new Set(window.allLeltarTetelek.map(t => t.helyszin).filter(h => h))].sort();
    document.getElementById('l-print-helyszin').innerHTML = '<option value="all">-- Minden Helyszín --</option>' + uniqueHelyszinek.map(h => `<option value="${h}">${h}</option>`).join('');
    const fisaTetelek = window.allLeltarTetelek.filter(t => t.kategoria !== 'Várólista');
    document.getElementById('l-print-fisa-id').innerHTML = '<option value="">-- Válasszon (keresés: gépeljen) --</option>' + fisaTetelek.map(a => `<option value="${a.id}">[${a.kategoria}] ${a.leltari_szam} - ${a.megnevezes}</option>`).join('');
    // Keresés az alapeszköz dropdown-ban
    var fisaSelect = document.getElementById('l-print-fisa-id');
    var fisaSearchInput = document.getElementById('l-print-fisa-search');
    if (!fisaSearchInput) {
        var searchDiv = document.createElement('div');
        searchDiv.className = 'mt-1';
        searchDiv.innerHTML = '<input type="text" class="form-control form-control-sm" id="l-print-fisa-search" placeholder="Keresés név, leltári szám vagy kategória alapján...">';
        fisaSelect.parentNode.insertBefore(searchDiv, fisaSelect.nextSibling);
        fisaSearchInput = document.getElementById('l-print-fisa-search');
    }
    fisaSearchInput.oninput = function() {
        var q = this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var filtered = fisaTetelek.filter(function(t) {
            var txt = ((t.kategoria || '') + ' ' + (t.leltari_szam || '') + ' ' + (t.megnevezes || '') + ' ' + (t.szerzo || '')).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return txt.includes(q);
        });
        fisaSelect.innerHTML = '<option value="">-- Válasszon (' + filtered.length + ' találat) --</option>' + filtered.map(function(a) {
            return '<option value="' + a.id + '">[' + a.kategoria + '] ' + a.leltari_szam + ' - ' + a.megnevezes + '</option>';
        }).join('');
    };
    
    window.handleLeltarPrintTypeChange();
    new bootstrap.Modal(document.getElementById('modal-leltar-print')).show();
};

window.handleLeltarPrintTypeChange = function() {
    const tipus = document.getElementById('l-print-type').value;
    document.getElementById('print-opt-helyszin').classList.add('d-none'); document.getElementById('print-opt-fisa').classList.add('d-none'); document.getElementById('print-opt-alairok').classList.add('d-none'); document.getElementById('print-opt-kateg').classList.add('d-none');
    if (tipus === 'lista_inv') { document.getElementById('print-opt-helyszin').classList.remove('d-none'); document.getElementById('print-opt-kateg').classList.remove('d-none'); document.getElementById('print-opt-alairok').classList.remove('d-none'); } 
    else if (tipus === 'vagyon_jelentes' || tipus === 'reg_inv') { document.getElementById('print-opt-alairok').classList.remove('d-none'); } 
    else if (tipus === 'fisa_fix') { document.getElementById('print-opt-fisa').classList.remove('d-none'); }
};

window.generateLeltarPDF = function() {
    localStorage.setItem('leltar_elnok', document.getElementById('l-print-elnok').value); localStorage.setItem('leltar_tag1', document.getElementById('l-print-tag1').value); localStorage.setItem('leltar_tag2', document.getElementById('l-print-tag2').value);
    const tipus = document.getElementById('l-print-type').value;
    const p = {
        ev: parseInt(document.getElementById('l-print-year').value, 10), datum: document.getElementById('l-print-date').value,
        gyulNevHu: currentSettings?.intezmenyneve || "..............................", gyulNevRo: currentSettings?.intezmenyneve_ro || "..............................",
        egyhazmegye: currentSettings?.egyhazmegye || "..............................", lelkesz: document.getElementById('l-print-lelkesz').value || "..............................",
        elnok: document.getElementById('l-print-elnok').value || "..............................", tag1: document.getElementById('l-print-tag1').value || "..............................", tag2: document.getElementById('l-print-tag2').value || ".............................."
    };

    const calcMaradvany = (t) => {
        let bErtek = parseFloat(t.beszerzesi_ertek) || 0;
        if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0 && t.beszerzes_datuma) {
            const bDate = new Date(t.beszerzes_datuma); let elteltHonapok = (p.ev - bDate.getFullYear()) * 12 + (12 - (bDate.getMonth() + 1));
            if (elteltHonapok < 0) elteltHonapok = 0; let mErtek = bErtek - (elteltHonapok * (bErtek / (t.hasznalati_ido_ev * 12))); return mErtek < 0 ? 0 : mErtek;
        }
        return bErtek; 
    };

    let htmlContent = '';
    if (tipus === 'vagyon_jelentes' || tipus === 'reg_inv') {
        const kats = [{ id: 1, nameHu: 'Alapeszközök', nameRo: 'Mijloace fixe', filter: 'Alapeszközök' }, { id: 2, nameHu: 'Telkek, földek, erdők', nameRo: 'Terenuri si amplasamenturi', filter: 'Telkek_Földek' }, { id: 3, nameHu: 'Csekély értékű tárgyak', nameRo: 'Obiecte de inventar', filter: 'Csekély értékű' }, { id: 4, nameHu: 'Könyvek', nameRo: 'Cărţi', filter: 'Könyvek' }, { id: 5, nameHu: 'Kegyszerek', nameRo: 'Obiecte de cult', filter: 'Kegyszerek' }, { id: 6, nameHu: 'Részvények, Kárpótlási', nameRo: 'Acțiuni și titluri', filter: 'Kárpótlási' }, { id: 7, nameHu: 'Bizományi', nameRo: 'Custodie', filter: 'Bizományi' }];
        let rowsHtml = ''; let totalBesz = 0; let totalMaradvany = 0;
        kats.forEach(k => {
            const tetelek = window.allLeltarTetelek.filter(t => t.kategoria === k.filter);
            let sumBesz = 0; let sumMaradvany = 0;
            tetelek.forEach(t => { const qty = parseFloat(t.mennyiseg) || 1; sumBesz += (parseFloat(t.beszerzesi_ertek) || 0) * qty; sumMaradvany += calcMaradvany(t) * qty; });
            totalBesz += sumBesz; totalMaradvany += sumMaradvany;
            rowsHtml += `<tr><td style="text-align:center;">${k.id}</td><td><strong>${k.nameRo}</strong><br><span style="font-size:0.85em; color:#555;">${k.nameHu}</span></td><td style="text-align:right;">${fmt(sumBesz)}</td><td style="text-align:right; font-weight:bold;">${fmt(sumMaradvany)}</td></tr>`;
        });
        htmlContent = `<!DOCTYPE html><html><head><title>Vagyonleltári Jelentés</title><style>body { font-family: 'Times New Roman', serif; color: black; margin: 0; padding: 20px 40px; } .no-print { background: #f1f5f9; padding: 15px; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #cbd5e1; } .no-print button { padding: 10px 25px; font-size: 16px; background: #0054a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 0 5px; } .no-print .btn-back { background: #6c757d; } @media print { .no-print { display: none !important; } } h2 { text-align: center; font-size: 18pt; margin-bottom: 5px; } h4 { text-align: center; font-weight: normal; margin-top: 0; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 11pt; } th, td { border: 1px solid black; padding: 10px; } th { background-color: #f4f4f4; text-align: center; font-weight: bold; } .right { text-align: right; font-weight: bold; }</style></head><body><div class="no-print"><button onclick="window.print()">🖨️ Nyomtatás Indítása</button><button class="btn-back" onclick="window.close()">Vissza / Bezárás</button></div><div style="margin-bottom: 20px;">Erdélyi Református Egyházkerület<br>Egyházmegye: <strong>${p.egyhazmegye}</strong><br>Unitate / Egység: <strong>${p.gyulNevHu} / ${p.gyulNevRo}</strong></div><h2>REGISTRU INVENTAR / VAGYONLELTÁRI JELENTÉS</h2><h4>la data de / lezárva: 31.12.${p.ev}</h4><table><thead><tr><th style="width: 10%;">Nr.<br>Sz.</th><th style="width: 50%;">Recapitulatia elementelor inventariate<br>Vagyonelemek összesítője</th><th style="width: 20%;">Valoare contabilă<br>(Könyv szerinti érték)</th><th style="width: 20%;">Valoare de inventar<br>(Leltári maradványérték)</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr style="background-color: #f9f9f9;"><td colspan="2" class="right">TOTAL / ÖSSZESEN (RON):</td><td class="right">${fmt(totalBesz)}</td><td class="right" style="font-size: 13pt; color: #1a569d;">${fmt(totalMaradvany)}</td></tr></tfoot></table><div style="display:flex; justify-content: space-around; margin-top: 60px; text-align:center;"><div>Lelkipásztor<br><br>.........................<br><strong>${p.lelkesz}</strong></div><div>Elnök<br><br>.........................<br><strong>${p.elnok}</strong></div><div>Bizottság<br><br>.........................<br><strong>${p.tag1}</strong><br><br>.........................<br><strong>${p.tag2}</strong></div></div></body></html>`;
    } else if (tipus === 'lista_inv') {
        const helyszin = document.getElementById('l-print-helyszin').value; const printKateg = document.getElementById('l-print-kategoria').value;
        let tetelek = window.allLeltarTetelek; if (helyszin !== 'all') tetelek = tetelek.filter(t => t.helyszin === helyszin);
        let katGroups = printKateg === 'all' ? [...new Set(tetelek.map(t=>t.kategoria))] : [printKateg];
        let rowsHtml = ''; let idx = 1;
        katGroups.forEach(k => {
            const groupItems = tetelek.filter(t => t.kategoria === k);
            if (groupItems.length === 0) return;
            if (printKateg === 'all') rowsHtml += `<tr><td colspan="10" style="background-color:#e2e8f0; font-weight:bold; font-size:11pt; padding:10px;">${k.toUpperCase()}</td></tr>`;
            groupItems.forEach(t => {
                const bErtek = parseFloat(t.beszerzesi_ertek) || 0; const mErtek = calcMaradvany(t); const deprec = bErtek - mErtek; const qty = parseFloat(t.mennyiseg) || 1;
                let nev = t.kategoria === 'Könyvek' ? `${t.szerzo || ''}: ${t.megnevezes}` : t.megnevezes;
                let szamPDF = t.leltari_szam;
                if (t.regi_leltari_szam && t.regi_leltari_szam !== '-') szamPDF += `<br><span style="font-size:0.8em; color:#666;">(${t.regi_leltari_szam})</span>`;
                // Magyarázat oszlop — értékcsökkenés indoklása
                let magyarazat = '';
                if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0) {
                    let haviAmort = bErtek / (t.hasznalati_ido_ev * 12);
                    magyarazat = `Amort.: ${t.hasznalati_ido_ev} év (${fmt(haviAmort)} RON/hó)`;
                    if (mErtek <= 0 && bErtek > 0) magyarazat += ' — Teljesen leírt';
                    if (t.katalogus_kod) magyarazat += ` | Kód: ${t.katalogus_kod}`;
                } else if (t.kategoria === 'Telkek_Földek') {
                    magyarazat = 'Nem amortizálható vagyonelem';
                } else if (t.kategoria === 'Csekély értékű') {
                    magyarazat = 'Csekély értékű leltári tárgy';
                } else if (t.kategoria === 'Könyvek') {
                    magyarazat = 'Könyvtári nyilvántartás';
                } else if (t.kategoria === 'Kegyszerek') {
                    magyarazat = 'Egyházi kegyszer';
                } else if (t.kategoria === 'Bizományi') {
                    magyarazat = 'Bizományi kezelésben';
                } else if (t.kategoria === 'Kárpótlási') {
                    magyarazat = 'Kárpótlási jegy / Részvény';
                }
                if (t.megjegyzes) {
                    let megj = t.megjegyzes.length > 60 ? t.megjegyzes.substring(0, 57) + '...' : t.megjegyzes;
                    magyarazat += (magyarazat ? ' | ' : '') + megj;
                }
                rowsHtml += `<tr><td style="text-align:center;">${idx++}</td><td style="text-align:center;">${szamPDF}</td><td><strong>${nev}</strong></td><td style="text-align:center;">${t.mertekegyseg || 'db'}</td><td style="text-align:center;">${qty}</td><td style="text-align:right;">${fmt(bErtek)}</td><td style="text-align:right;">${fmt(bErtek * qty)}</td><td style="text-align:right;">${fmt(mErtek * qty)}</td><td style="text-align:right; color:#d63939;">${fmt(deprec * qty)}</td><td style="font-size:0.85em;">${magyarazat}</td></tr>`;
            });
        });
        htmlContent = `<!DOCTYPE html><html><head><title>Lista de Inventariere - ${p.ev}</title><style>body { font-family: Arial, sans-serif; color: black; margin: 0; padding: 20px 40px; font-size: 10pt; } .no-print { background: #f1f5f9; padding: 15px; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #cbd5e1; } .no-print button { padding: 10px 25px; font-size: 16px; background: #0054a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 0 5px; } .no-print .btn-back { background: #6c757d; } @media print { .no-print { display: none !important; } @page { size: landscape; margin: 1cm; } } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 9pt; } th, td { border: 1px solid black; padding: 6px; vertical-align: middle; } th { background-color: #f4f4f4; text-align: center; font-weight: bold; } .text-right { text-align: right; }</style></head><body><div class="no-print"><button onclick="window.print()">🖨️ Nyomtatás Indítása</button><button class="btn-back" onclick="window.close()">Vissza / Bezárás</button></div><div style="display:flex; justify-content: space-between;"><div>Erdélyi Református Egyházkerület<br><strong>${p.gyulNevHu} / ${p.gyulNevRo}</strong></div><div class="text-right">Gestiunea / Vagyonkezelő: <strong>${p.lelkesz}</strong><br>Loc de depozitare / Helyszín: <strong>${helyszin === 'all' ? 'Minden helyszín' : helyszin}</strong></div></div><h2 style="text-align:center; margin: 15px 0 5px 0;">LISTA DE INVENTARIERE<br>LELTÁRÍV</h2><div style="text-align:center; margin-bottom: 15px;">Dátum / Data: <strong>${p.datum}</strong></div><table><thead><tr><th style="width: 4%;">Nr.<br>S.sz.</th><th style="width: 8%;">Cod<br>Leltári sz.</th><th style="width: 28%;">Denumirea bunurilor inventariate<br>Felleltározott tárgyak elnevezése</th><th style="width: 5%;">U.M.<br>M.E.</th><th style="width: 5%;">Cant.<br>Menny.</th><th style="width: 10%;">Pret u. contabil<br>Egységár</th><th style="width: 10%;">Val. contabilă<br>Könyvelési érték</th><th style="width: 10%;">Valoare inventar<br>Leltári érték</th><th style="width: 10%;">Deprecierea<br>Értékcsökkenés</th><th style="width: 10%;">Motivul / Explicații<br>Magyarázat</th></tr></thead><tbody>${rowsHtml}</tbody></table><div style="display:flex; justify-content: space-around; margin-top: 60px; text-align:center;"><div>Președinte / Elnök<br><br>.........................<br><strong>${p.elnok}</strong></div><div>Membri / Tagok<br><br>.........................<br><strong>${p.tag1}</strong><br><br>.........................<br><strong>${p.tag2}</strong></div><div>Gestionar / Vagyonkezelő<br><br>.........................<br><strong>${p.lelkesz}</strong></div></div></body></html>`;
    } else if (tipus === 'fisa_fix') {
        const id = document.getElementById('l-print-fisa-id').value; if (!id) { alert("Válasszon ki egy alapeszközt!"); return; }
        const t = window.allLeltarTetelek.find(x => x.id === id); const bErtek = parseFloat(t.beszerzesi_ertek) || 0; const haviAmort = t.hasznalati_ido_ev > 0 ? (bErtek / (t.hasznalati_ido_ev * 12)) : 0; const maradvany = calcMaradvany(t);
        let szamPDF = t.leltari_szam; if (t.regi_leltari_szam && t.regi_leltari_szam !== '-') szamPDF += ` (Régi: ${t.regi_leltari_szam})`;
        htmlContent = `<!DOCTYPE html><html><head><title>Fișa Mijlocului Fix - ${t.leltari_szam}</title><style>body { font-family: 'Times New Roman', serif; color: black; margin: 0; padding: 20px 40px; } .no-print { background: #f1f5f9; padding: 15px; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #cbd5e1; } .no-print button { padding: 10px 25px; font-size: 16px; background: #0054a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 0 5px; } .no-print .btn-back { background: #6c757d; } @media print { .no-print { display: none !important; } } table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12pt; } th, td { border: 1px solid black; padding: 10px; } .bg-gray { background-color: #f4f4f4; font-weight: bold; }</style></head><body><div class="no-print"><button onclick="window.print()">🖨️ Nyomtatás Indítása</button><button class="btn-back" onclick="window.close()">Vissza / Bezárás</button></div><div style="margin-bottom: 20px;">Unitate / Egység: <strong>${p.gyulNevHu}</strong></div><h2 style="text-align:center; text-decoration: underline;">FIȘA MIJLOCULUI FIX<br>ALAPESZKÖZ NYILVÁNTARTÁSI KARTON</h2><table><tr><td class="bg-gray" style="width:40%;">Leltári szám / Număr de inventar:</td><td style="font-size:1.2em;"><strong>${szamPDF}</strong></td></tr><tr><td class="bg-gray">Megnevezés / Denumire:</td><td><strong>${t.megnevezes}</strong></td></tr><tr><td class="bg-gray">Katalóguskód / Cod de clasificare:</td><td>${t.katalogus_kod || '-'}</td></tr><tr><td class="bg-gray">Helyszín / Gestiune (Locație):</td><td>${t.helyszin || '-'}</td></tr><tr><td class="bg-gray">Beszerzés Dátuma / Data PIF:</td><td>${t.beszerzes_datuma || '-'} (Biz: ${t.beszerzes_bizonylat || '-'})</td></tr><tr><td class="bg-gray">Beszerzési érték / Valoare de intrare:</td><td><strong>${fmt(bErtek)} RON</strong></td></tr><tr><td class="bg-gray">Normál használati idő / Durata normală (ani):</td><td>${t.hasznalati_ido_ev || '-'} év</td></tr><tr><td class="bg-gray">Havi értékcsökkenés / Amortizare lunară:</td><td>${fmt(haviAmort)} RON / hónap</td></tr><tr><td class="bg-gray">Jelenlegi Maradványérték / Valoare rămasă (31.12.${p.ev}):</td><td style="font-size:1.3em; color:green;"><strong>${fmt(maradvany)} RON</strong></td></tr><tr><td class="bg-gray">Megjegyzés / Observații:</td><td>${t.megjegyzes || '-'}</td></tr></table></body></html>`;
    }
    const printWindow = window.open('', '_blank'); printWindow.document.write(htmlContent); printWindow.document.close();
    bootstrap.Modal.getInstance(document.getElementById('modal-leltar-print')).hide();
};

window.finalizeLeltar = async function() {
    if (!confirm("Biztosan véglegesíti a vagyonleltárt? Ezzel lezárja a szerkesztést, és az adatok beküldésre kerülnek az Egyházmegyéhez!")) return;
    try {
        var btn = document.getElementById('btn-leltar-veglegesit');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Zárás...';
        btn.disabled = true;

        var { error } = await _supabase.from('bealitas')
            .update({ leltar_finalized: true })
            .eq('id', String(new Date().getFullYear()))
            .eq('congregation_id', activeCongregationId);
        if (error) throw error;

        currentSettings.leltar_finalized = true;

        // Nyomtatási kép megnyitása
        var isReprint = !!(currentSettings && currentSettings.leltar_iktatoszam);
        if (typeof window.printVagyonleltarJelentes === 'function') {
            window.printVagyonleltarJelentes(new Date().getFullYear(), isReprint);
        }

        // UI frissítés
        window._updateLeltarActionButtons();
    } catch(err) {
        alert("Hiba: " + err.message);
        btn.disabled = false;
    }
};

window._updateLeltarActionButtons = function() {
    var btn = document.getElementById('btn-leltar-veglegesit');
    var feloldasBtn = document.getElementById('btn-leltar-feloldas');
    if (currentSettings && currentSettings.leltar_finalized) {
        btn.innerHTML = '<i class="ti ti-printer me-2"></i>Leltár Újranyomtatása';
        btn.className = 'btn btn-dark fw-bold shadow-sm';
        btn.onclick = function() { window.triggerLeltarReprint(); };
        btn.disabled = false;
        if (feloldasBtn) {
            feloldasBtn.classList.remove('d-none');
            // Ha már el lett küldve a feloldás kérelem → Várakozás állapot
            if (currentSettings.leltar_unlock_requested) {
                feloldasBtn.innerHTML = '<i class="ti ti-clock me-2"></i>Várakozás az elbírálásra...';
                feloldasBtn.className = 'btn btn-outline-secondary fw-bold shadow-sm';
                feloldasBtn.disabled = true;
                feloldasBtn.title = 'A feloldási kérelem elküldve. Cél: ' + (currentSettings.leltar_unlock_reason || '');
            }
        }
        // Új tétel gomb letiltása
        var ujTetelBtn = document.getElementById('btn-uj-tetel');
        if (ujTetelBtn) { ujTetelBtn.disabled = true; ujTetelBtn.title = 'A leltár véglegesítve — szerkesztés nem lehetséges'; }
    }
};

window.triggerLeltarReprint = function() {
    var isReprint = !!(currentSettings && currentSettings.leltar_iktatoszam);
    if (typeof window.printVagyonleltarJelentes === 'function') {
        window.printVagyonleltarJelentes(new Date().getFullYear(), isReprint);
    } else {
        alert("A nyomtató modul nem található!");
    }
};

window.requestLeltarUnlock = function() {
    // Feloldás kérelem modal megjelenítése cél-választóval
    var existingModal = document.getElementById('modal-leltar-unlock');
    if (existingModal) existingModal.remove();

    var modalHtml = '<div class="modal modal-blur fade" id="modal-leltar-unlock" tabindex="-1">' +
        '<div class="modal-dialog modal-sm modal-dialog-centered">' +
        '<div class="modal-content">' +
        '<div class="modal-header"><h5 class="modal-title"><i class="ti ti-lock-open me-2"></i>Feloldás Kérése</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
        '<div class="modal-body">' +
        '<p class="text-muted mb-3">Kérelmezi az Egyházmegyétől a leltár feloldását?</p>' +
        '<label class="form-label fw-bold">Feloldás célja:</label>' +
        '<select class="form-select mb-3" id="unlock-cel">' +
        '<option value="">-- Válassza ki a célt --</option>' +
        '<option value="Adatjavítás">Adatjavítás (hibás adat kijavítása)</option>' +
        '<option value="Új tétel hozzáadása">Új tétel hozzáadása</option>' +
        '<option value="Tétel törlése/selejtezése">Tétel törlése / selejtezése</option>' +
        '<option value="Értékmódosítás">Értékmódosítás (felújítás, értéknövelés)</option>' +
        '<option value="Kategória módosítás">Kategória vagy besorolás módosítása</option>' +
        '<option value="Egyéb">Egyéb (kérjük írja le alább)</option>' +
        '</select>' +
        '<label class="form-label fw-bold">Részletes indoklás:</label>' +
        '<textarea class="form-control" id="unlock-indoklas" rows="3" placeholder="Írja le röviden a feloldás okát..."></textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-link" data-bs-dismiss="modal">Mégsem</button>' +
        '<button class="btn btn-warning fw-bold" id="btn-unlock-send" onclick="window._sendLeltarUnlockRequest()"><i class="ti ti-send me-1"></i>Kérelem Elküldése</button>' +
        '</div></div></div></div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(document.getElementById('modal-leltar-unlock')).show();
};

window._sendLeltarUnlockRequest = async function() {
    var cel = document.getElementById('unlock-cel').value;
    var indoklas = document.getElementById('unlock-indoklas').value.trim();
    if (!cel) { alert('Válassza ki a feloldás célját!'); return; }

    var fullReason = cel + (indoklas ? ': ' + indoklas : '');

    var btn = document.getElementById('btn-unlock-send');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Küldés...';
    btn.disabled = true;

    try {
        var { error } = await _supabase.from('bealitas')
            .update({ leltar_unlock_requested: true, leltar_unlock_reason: fullReason })
            .eq('id', String(new Date().getFullYear()))
            .eq('congregation_id', activeCongregationId);
        if (error) throw error;

        // Modal bezárása
        bootstrap.Modal.getInstance(document.getElementById('modal-leltar-unlock')).hide();

        // Gomb állapotának frissítése — Várakozás az elbírálásra
        var feloldasBtn = document.getElementById('btn-leltar-feloldas');
        if (feloldasBtn) {
            feloldasBtn.innerHTML = '<i class="ti ti-clock me-2"></i>Várakozás az elbírálásra...';
            feloldasBtn.className = 'btn btn-outline-secondary fw-bold shadow-sm';
            feloldasBtn.disabled = true;
            feloldasBtn.title = 'A feloldási kérelem elküldve az Egyházmegye felé. Cél: ' + cel;
        }

        alert('Kérelem sikeresen elküldve! Az Egyházmegye fogja elbírálni.');
    } catch(err) {
        alert('Hiba: ' + err.message);
        btn.innerHTML = '<i class="ti ti-send me-1"></i>Kérelem Elküldése';
        btn.disabled = false;
    }
};

// =====================================================================
// ÉLŐ VAGYONLELTÁR — összesítő nézet
// =====================================================================

window.renderEloVagyonleltar = function() {
    // Év dropdown feltöltése ha üres
    var evSelect = document.getElementById('elo-leltar-ev');
    if (evSelect && evSelect.options.length === 0) {
        var currentYear = new Date().getFullYear();
        for (var y = currentYear; y >= 2020; y--) {
            var opt = document.createElement('option');
            opt.value = y; opt.text = y;
            evSelect.appendChild(opt);
        }
        // Dátum mező alapértelmezése
        var datumEl = document.getElementById('elo-leltar-datum');
        if (datumEl && !datumEl.value) {
            datumEl.value = currentYear + '-12-31';
        }
    }

    var ev = parseInt((evSelect && evSelect.value) || new Date().getFullYear());
    var datumStr = (document.getElementById('elo-leltar-datum') || {}).value || (ev + '-12-31');
    var refDate = new Date(datumStr);
    var refYear = refDate.getFullYear();
    var refMonth = refDate.getMonth() + 1;

    var kategoriak = [
        { id: 1, nevHu: 'Alapeszközök', nevRo: 'Mijloace fixe', filter: 'Alapeszközök' },
        { id: 2, nevHu: 'Telkek, földek, erdők', nevRo: 'Terenuri', filter: 'Telkek_Földek' },
        { id: 3, nevHu: 'Csekély értékű tárgyak', nevRo: 'Obiecte de inventar', filter: 'Csekély értékű' },
        { id: 4, nevHu: 'Könyvek', nevRo: 'Cărți', filter: 'Könyvek' },
        { id: 5, nevHu: 'Kegyszerek', nevRo: 'Obiecte de cult', filter: 'Kegyszerek' },
        { id: 6, nevHu: 'Részvények, Kárpótlási', nevRo: 'Acțiuni', filter: 'Kárpótlási' },
        { id: 7, nevHu: 'Bizományi', nevRo: 'Custodie', filter: 'Bizományi' }
    ];

    var calcMaradvany = function(t) {
        var bErtek = parseFloat(t.beszerzesi_ertek) || 0;
        if (t.kategoria === 'Alapeszközök' && t.hasznalati_ido_ev > 0 && t.beszerzes_datuma) {
            var bDate = new Date(t.beszerzes_datuma);
            var elteltHonapok = (refYear - bDate.getFullYear()) * 12 + (refMonth - (bDate.getMonth() + 1));
            if (elteltHonapok < 0) elteltHonapok = 0;
            var mErtek = bErtek - (elteltHonapok * (bErtek / (t.hasznalati_ido_ev * 12)));
            return mErtek < 0 ? 0 : mErtek;
        }
        return bErtek;
    };

    var tetelek = (window.allLeltarTetelek || []).filter(function(t) { return t.kategoria !== 'Várólista'; });
    var totalBesz = 0;
    var totalMaradvany = 0;
    var totalDb = 0;
    var tbodyHtml = '';
    var reszletekHtml = '';

    kategoriak.forEach(function(k) {
        var katTetelek = tetelek.filter(function(t) { return t.kategoria === k.filter; });
        var sumBesz = 0;
        var sumMaradvany = 0;
        katTetelek.forEach(function(t) {
            var qty = parseFloat(t.mennyiseg) || 1;
            sumBesz += (parseFloat(t.beszerzesi_ertek) || 0) * qty;
            sumMaradvany += calcMaradvany(t) * qty;
        });
        totalBesz += sumBesz;
        totalMaradvany += sumMaradvany;
        totalDb += katTetelek.length;

        var rowClass = katTetelek.length === 0 ? ' class="text-muted"' : '';
        tbodyHtml += '<tr' + rowClass + '>' +
            '<td class="text-center">' + k.id + '</td>' +
            '<td><strong>' + k.nevHu + '</strong><br><small class="text-muted">' + k.nevRo + '</small></td>' +
            '<td class="text-center">' + katTetelek.length + ' db</td>' +
            '<td class="text-end">' + fmt(sumBesz) + ' RON</td>' +
            '<td class="text-end fw-bold">' + fmt(sumMaradvany) + ' RON</td>' +
            '</tr>';

        // Részletes lista — collapse
        if (katTetelek.length > 0) {
            var collapseId = 'collapse-kat-' + k.id;
            reszletekHtml += '<div class="card shadow-sm border-0 mb-2">' +
                '<div class="card-header py-2" style="cursor:pointer;" data-bs-toggle="collapse" data-bs-target="#' + collapseId + '">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<span class="fw-bold"><i class="ti ti-chevron-down me-1"></i>' + k.nevHu + ' (' + katTetelek.length + ' db)</span>' +
                '<span class="fw-bold text-success">' + fmt(sumMaradvany) + ' RON</span>' +
                '</div></div>' +
                '<div class="collapse" id="' + collapseId + '">' +
                '<div class="table-responsive"><table class="table table-sm table-striped mb-0">' +
                '<thead><tr><th>Leltári sz.</th><th>Megnevezés</th><th class="text-end">Beszerzési érték</th><th class="text-center">Amort. idő</th><th class="text-end">Maradványérték</th></tr></thead><tbody>';

            katTetelek.forEach(function(t) {
                var bErtek = parseFloat(t.beszerzesi_ertek) || 0;
                var mErtek = calcMaradvany(t);
                var qty = parseFloat(t.mennyiseg) || 1;
                var nev = t.kategoria === 'Könyvek' ? ((t.szerzo || '') + ': ' + t.megnevezes) : t.megnevezes;
                var amortStr = t.hasznalati_ido_ev ? (t.hasznalati_ido_ev + ' év') : '-';
                reszletekHtml += '<tr>' +
                    '<td class="fw-bold">' + (t.leltari_szam || '-') + '</td>' +
                    '<td>' + nev + (qty > 1 ? ' <small class="text-muted">(' + qty + ' ' + (t.mertekegyseg || 'db') + ')</small>' : '') + '</td>' +
                    '<td class="text-end">' + fmt(bErtek * qty) + '</td>' +
                    '<td class="text-center">' + amortStr + '</td>' +
                    '<td class="text-end fw-bold ' + (mErtek === 0 && bErtek > 0 ? 'text-danger' : 'text-success') + '">' + fmt(mErtek * qty) + '</td>' +
                    '</tr>';
            });

            reszletekHtml += '</tbody></table></div></div></div>';
        }
    });

    // Táblázat frissítése
    var tbody = document.getElementById('elo-leltar-tbody');
    if (tbody) tbody.innerHTML = tbodyHtml;

    var tfoot = document.getElementById('elo-leltar-tfoot');
    if (tfoot) {
        tfoot.innerHTML = '<tr class="bg-light">' +
            '<td colspan="2" class="text-end fw-bold">ÖSSZESEN:</td>' +
            '<td class="text-center fw-bold">' + totalDb + ' db</td>' +
            '<td class="text-end fw-bold">' + fmt(totalBesz) + ' RON</td>' +
            '<td class="text-end fw-bold text-primary" style="font-size:1.1em;">' + fmt(totalMaradvany) + ' RON</td>' +
            '</tr>';
    }

    // Összesítő kártyák frissítése
    var beszEl = document.getElementById('elo-total-besz');
    if (beszEl) beszEl.innerText = fmt(totalBesz) + ' RON';
    var marEl = document.getElementById('elo-total-maradvany');
    if (marEl) marEl.innerText = fmt(totalMaradvany) + ' RON';

    // Részletek renderelése
    var reszletekDiv = document.getElementById('elo-leltar-reszletek');
    if (reszletekDiv) reszletekDiv.innerHTML = reszletekHtml;
};

window.printEloVagyonleltar = function() {
    // Nyomtatóközpontra irányít a vagyon_jelentes típussal
    if (typeof window.openNyomtatoKozpont === 'function') {
        window.openNyomtatoKozpont();
        // Pre-select vagyon_jelentes
        setTimeout(function() {
            var typeSelect = document.getElementById('l-print-type');
            if (typeSelect) {
                typeSelect.value = 'vagyon_jelentes';
                window.handleLeltarPrintTypeChange();
            }
        }, 300);
    }
};

// =====================================================================
// ÉRTÉKNÖVELÉS ÉS SEGÉDFUNKCIÓK
// =====================================================================

window.openErteknovelesModal = function(itemId) {
    // Duplikátum modal bezárása
    var dupModal = bootstrap.Modal.getInstance(document.getElementById('modal-duplicate-warning'));
    if (dupModal) dupModal.hide();

    // Alapeszközök dropdown feltöltése
    var alapeszkozok = window.allLeltarTetelek.filter(function(t) { return t.kategoria === 'Alapeszközök'; });
    var selectEl = document.getElementById('en-cel-eszkoz');
    selectEl.innerHTML = alapeszkozok.map(function(a) {
        return '<option value="' + a.id + '">' + a.leltari_szam + ' - ' + a.megnevezes + ' (' + fmt(a.beszerzesi_ertek) + ' RON)</option>';
    }).join('');

    // Ha van itemId → pre-select
    if (itemId) selectEl.value = itemId;

    // Összeg és dátum kitöltése a form-leltar-ból
    var osszeg = document.getElementById('l-beszerzesi-ertek') ? document.getElementById('l-beszerzesi-ertek').value : '0';
    var datum = document.getElementById('l-beszerzes-datuma') ? document.getElementById('l-beszerzes-datuma').value : '';
    document.getElementById('en-osszeg').value = fmt(parseFloat(osszeg) || 0) + ' RON';
    document.getElementById('en-datum').value = datum;

    // Növelendő adatok tárolása
    window._erteknovelesData = { osszeg: parseFloat(osszeg) || 0, datum: datum };

    new bootstrap.Modal(document.getElementById('modal-erteknoveles')).show();
};

window.executeErteknoveles = async function() {
    var celEszkozId = document.getElementById('en-cel-eszkoz').value;
    if (!celEszkozId) { alert('Válasszon ki egy alapeszközt!'); return; }

    var celTetel = window.allLeltarTetelek.find(function(t) { return t.id === celEszkozId; });
    if (!celTetel) { alert('A kiválasztott eszköz nem található!'); return; }

    var noveloOsszeg = window._erteknovelesData ? window._erteknovelesData.osszeg : 0;
    if (noveloOsszeg <= 0) { alert('Érvénytelen összeg!'); return; }

    var ujErtek = (parseFloat(celTetel.beszerzesi_ertek) || 0) + noveloOsszeg;

    if (!confirm('A(z) "' + celTetel.megnevezes + '" beszerzési értékét ' + fmt(celTetel.beszerzesi_ertek) + ' RON-ról ' + fmt(ujErtek) + ' RON-ra növeli. Folytatja?')) return;

    try {
        // Cél eszköz értékének növelése
        var megjegyzes = (celTetel.megjegyzes || '') + ' | Értéknövelés: +' + fmt(noveloOsszeg) + ' RON (' + (window._erteknovelesData ? window._erteknovelesData.datum : '') + ')';
        var { error: updErr } = await _supabase.from('leltar_tetelek')
            .update({ beszerzesi_ertek: ujErtek, megjegyzes: megjegyzes })
            .eq('id', celEszkozId);
        if (updErr) throw updErr;

        // Ha van Várólista tétel (potentialDupItem) → soft delete
        if (window.potentialDupItem && window.potentialDupItem.id) {
            await _supabase.from('leltar_tetelek')
                .update({ is_deleted: true })
                .eq('id', window.potentialDupItem.id);
        }

        // Modalok bezárása + frissítés
        var enModal = bootstrap.Modal.getInstance(document.getElementById('modal-erteknoveles'));
        if (enModal) enModal.hide();
        var leltarModal = bootstrap.Modal.getInstance(document.getElementById('modal-leltar'));
        if (leltarModal) leltarModal.hide();
        alert('Értéknövelés sikeresen végrehajtva!');
        window.initLeltar();
    } catch(err) {
        alert('Hiba: ' + err.message);
    }
};

window.forceSaveNew = function() {
    // Duplikátum modal bezárása
    var dupModal = bootstrap.Modal.getInstance(document.getElementById('modal-duplicate-warning'));
    if (dupModal) dupModal.hide();

    // Bypass flag beállítása és mentés újraindítása
    window.bypassDupCheck = true;
    document.getElementById('form-leltar').dispatchEvent(new Event('submit'));
};

window.triggerExcelImport = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        alert('Excel import funkció fejlesztés alatt.\n\nA fájl: ' + file.name + '\n\nHasználja a Python sync agent-et (penzugyek/sync_agent.py) az importáláshoz.');
    };
    input.click();
};

// =====================================================================
// KÖNYVTÁR MODULOK
// =====================================================================

// BIZTONSÁGI FOTÓ-DEKÓDOLÓ (ZXing motor)
window.scanBarcodeFromImage = async function(event) {
    if (typeof loadLib === 'function') await loadLib('zxing');
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    
    // Vizuális jelzés
    const btnScanner = document.getElementById('btn-start-scanner');
    const origHtml = btnScanner.innerHTML;
    btnScanner.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Kép elemzése...';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            if (!zxingReader) zxingReader = new ZXing.BrowserMultiFormatReader();
            
            try {
                const result = await zxingReader.decodeFromImageElement(img);
                document.getElementById('l-konyv-isbn').value = result.getText();
                alert("✅ Vonalkód (ISBN) sikeresen beolvasva: " + result.getText());
                window.fetchBookDataFromInput(); // Indítja a könyvkeresőt
            } catch(err) {
                alert("❌ Nem sikerült vonalkódot találni ezen a fotón! Kérem, ügyeljen rá, hogy a kód éles és jól olvasható legyen a képen, vagy gépelje be kézzel az ISBN számot.");
            } finally {
                btnScanner.innerHTML = origHtml;
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    
    event.target.value = '';
};

// ==========================================
// 🚨 MESTERSÉGES INTELLIGENCIA (Élő Google Kereső + Golyóálló Adatkinyerő)
// ==========================================

window.fetchBookDataFromInput = async function() {
    const isbnRaw = document.getElementById('l-konyv-isbn').value.replace(/[^0-9X]/gi, '');
    if (isbnRaw.length < 10) { alert("Érvénytelen ISBN szám!"); return; }
    
    const GEMINI_API_KEY = "<GEMINI_API_KEY>";
    
    const btn = document.querySelector('#div-konyv-extra button[title]');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 
    btn.disabled = true;
    
    try {
        // 1. Google Books (Hagyományos adatbázis)
        try {
            const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbnRaw}`);
            if (gRes.ok) {
                const gData = await gRes.json();
                if (gData.items && gData.items.length > 0) {
                    const vol = gData.items[0].volumeInfo;
                    document.getElementById('l-szerzo').value = vol.authors ? vol.authors.join(', ') : '';
                    document.getElementById('l-megnevezes').value = vol.title + (vol.subtitle ? `: ${vol.subtitle}` : '');
                    document.getElementById('l-konyv-kiado').value = vol.publisher || '';
                    document.getElementById('l-konyv-ev').value = vol.publishedDate ? vol.publishedDate.substring(0,4) : '';
                    document.getElementById('l-konyv-oldal').value = vol.pageCount ? `${vol.pageCount} oldal` : ''; // Új!
                    btn.innerHTML = `<i class="ti ti-check text-white"></i>`; btn.classList.replace('btn-primary', 'btn-success');
                    setTimeout(() => { btn.innerHTML = origHtml; btn.classList.replace('btn-success', 'btn-primary'); btn.disabled = false; }, 2000);
                    return; 
                }
            }
        } catch(e) {} 

        // 🚨 2. MESTERSÉGES INTELLIGENCIA BEVETÉSE
        const modelRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const modelData = await modelRes.json();
        if (modelData.error) throw new Error(modelData.error.message);

        let selectedModelName = "models/gemini-2.0-flash";
        if (modelData.models && modelData.models.length > 0) {
            const validModels = modelData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'));
            if (validModels.length > 0) {
                const flashModel = validModels.find(m => m.name.includes('flash'));
                selectedModelName = flashModel ? flashModel.name : validModels[0].name;
            }
        }

        // 🚨 KIBŐVÍTETT PROMPT (Most már kéri a Várost és az Oldalszámot is)
        const promptText = `Keresd meg a ${isbnRaw} ISBN számú könyv adatait. Használd az internetes keresőt és a belső tudásodat is! (Ez valószínűleg egy magyar nyelvű könyv vagy Biblia).
Ha a könyv egy Biblia, a Szerző mezőbe írd be, hogy "Különböző szerzők" vagy hagyd üresen.
Válaszolj KIZÁRÓLAG egy érvényes JSON objektummal, ami tartalmazza a kiadás helyét (város) és a terjedelmét (oldalszám vagy sorozatcím) is:
{"szerzo": "...", "cim": "...", "kiado": "...", "ev": "...", "hely": "...", "terjedelem": "..."}`;

        const requestBody = {
            contents: [{ parts: [{ text: promptText }] }],
            tools: [{ google_search: {} }] 
        };

        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModelName}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const aiData = await aiRes.json();

        let aiText = "";
        if (aiData.error) {
            delete requestBody.tools;
            const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModelName}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.error) throw new Error(fallbackData.error.message);
            aiText = fallbackData.candidates[0].content.parts[0].text;
        } else {
            aiText = aiData.candidates[0].content.parts[0].text;
        }

        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Az AI nem találta meg a könyvet, vagy nem tudta értelmezni az adatokat.");
        
        const cleanJsonText = jsonMatch[0]; 
        const parsedData = JSON.parse(cleanJsonText);

        if (parsedData.szerzo) document.getElementById('l-szerzo').value = parsedData.szerzo;
        if (parsedData.cim) document.getElementById('l-megnevezes').value = parsedData.cim;
        if (parsedData.kiado) document.getElementById('l-konyv-kiado').value = parsedData.kiado;
        if (parsedData.ev) {
            const tisztaEv = String(parsedData.ev).replace(/\D/g, '').substring(0, 4);
            if (tisztaEv.length === 4) document.getElementById('l-konyv-ev').value = tisztaEv;
        }
        // 🚨 KIBŐVÍTETT ADATOK BETÖLTÉSE AZ ŰRLAPRA
        if (parsedData.hely) document.getElementById('l-konyv-hely').value = parsedData.hely;
        if (parsedData.terjedelem) document.getElementById('l-konyv-oldal').value = parsedData.terjedelem;

        btn.innerHTML = `<i class="ti ti-check text-white"></i>`;
        btn.classList.replace('btn-primary', 'btn-success');
        
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.classList.replace('btn-success', 'btn-primary');
            btn.disabled = false;
        }, 2500);

    } catch (e) {
        alert("🚨 AI HIBA TÖRTÉNT:\n\n" + e.message + "\n\nKérem, töltse ki manuálisan az adatokat.");
        console.error("AI Keresési Hiba:", e);
    } finally {
        btn.innerHTML = origHtml; 
        btn.disabled = false;
    }
};

// ==========================================
// 🚨 AI ÉS OKOS KERESŐ ASSZISZTENS FUNKCIÓK
// ==========================================
window.openSmartSearch = function(type) {
    const isbn = document.getElementById('l-konyv-isbn').value.replace(/[^0-9X]/gi, '');
    if (!isbn) { alert("Előbb adja meg a vonalkódot!"); return; }
    
    let url = '';
    if (type === 'google') url = `https://www.google.com/search?q=ISBN+${isbn}`;
    if (type === 'libri') url = `https://www.libri.hu/kereses/?q=${isbn}`;
    if (type === 'kereszteny') url = `https://keresztenykonyvek.hu/kereses?q=${isbn}`;
    
    // Új lapon megnyitja a keresést
    window.open(url, '_blank');
};

