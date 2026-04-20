// --- js/penzugy_budget.js ---
let isRevisionMode = false;

const positiveMessages = [
    "Bölcs sáfárkodás! Szép tartalék marad az évre.",
    "Kiváló tervezet! Lesz miből építkezni és fejlődni.",
    "Nyugodt évünk lesz ezzel a tervvel, szép munka!",
    "Stabil lábakon áll a gyülekezet, a persely is mosolyog!",
    "Példás gazdálkodás! Remek kilátások a jövő évre.",
    "Ilyen számokkal tiszta öröm lesz majd a zárszámadás!",
    "Biztonságos, megnyugtató tartalékkal számolt!",
    "Bátran belevághatunk a tervek megvalósításába!",
    "Kiegyensúlyozott, okos tervezet. Gratulálok a Presbitériumnak!",
    "Bőséges áldás várható ezzel a gondos tervezéssel!",
    "Remek arányok! Van miből adakozni és gyarapodni.",
    "Dicséretes előrelátás, ez egy kikezdhetetlen költségvetés!"
];

async function loadKoltsegvetes() {
    const container = document.getElementById('tab-koltsegvetes');
    const { data: budgetData } = await _supabase.from('koltsegvetes').select('*').eq('bealitasid', currentYear).eq('congregation_id', activeCongregationId);
    
    window.savedBudgetValues = {};
    if (budgetData) budgetData.forEach(b => window.savedBudgetValues[b.szamadasicelid] = b);

    const isFinalized = currentSettings.budget_finalized;

    window.bevetelCellek = window.szamadasiCellek.filter(c => c.id.startsWith('1') || c.id === '100');
    window.kiadasCellek = window.szamadasiCellek.filter(c => c.id.startsWith('2'));

    let actionAreaHtml = '';
    if (!isFinalized || isRevisionMode) {
        actionAreaHtml = `<button type="submit" id="btn-save-budget" class="btn btn-purple w-100 py-3 fs-3 fw-bold shadow"><i class="ti ti-device-floppy me-2"></i> Költségvetés Véglegesítése és Nyomtatása</button>`;
    } else {
        const unlockRequested = currentSettings.unlock_requested;
        const unlockBtnHtml = unlockRequested 
            ? `<button type="button" class="btn btn-warning w-100 py-3 fs-3 fw-bold shadow" disabled><i class="ti ti-clock me-2"></i> Várakozás az elbírálásra...</button>`
            : `<button type="button" class="btn btn-outline-warning w-100 py-3 fs-3 fw-bold shadow" onclick="requestBudgetUnlock()"><i class="ti ti-lock-open me-2"></i> Költségvetés feloldása</button>`;
        
        actionAreaHtml = `
        <div class="row g-2">
            <div class="col-md-6">
                <button type="button" class="btn btn-dark w-100 py-3 fs-3 fw-bold shadow" onclick="triggerBudgetPrint()"><i class="ti ti-printer me-2"></i> Költségvetés Újranyomtatása</button>
            </div>
            <div class="col-md-6">
                ${unlockBtnHtml}
            </div>
        </div>`;
    }

    // 🚨 JAVÍTÁS: A th (fejléc) oszlopok szigorú összehúzása (width: 1%; white-space: nowrap;)
    let html = `
    <div class="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h3>${currentYear}. évi Költségvetési Terv</h3>
        ${isFinalized && !currentSettings.unlock_requested ? '<button type="button" class="btn btn-outline-primary btn-sm fw-bold shadow-sm" onclick="toggleRevision()"><i class="ti ti-edit me-2"></i>Módosítás Aktiválása</button>' : ''}
    </div>
    <form id="budget-form" onsubmit="saveBudgetPlan(event)">
        <div class="row g-4">
            <div class="col-lg-6">
                <div class="card border-success border-top-wide shadow-sm">
                    <div class="card-header bg-success-lt"><h3 class="card-title text-success fw-bold"><i class="ti ti-arrow-down-circle me-2"></i> Tervezett Bevételek</h3></div>
                    <div class="table-responsive" style="overflow-x: visible;">
                        <table class="table table-sm table-vcenter table-hover mb-0">
                            <thead class="bg-dark text-white">
                                <tr>
                                    <th style="width: 10%;">Kód</th>
                                    <th>Megnevezés</th>
                                    <th class="text-end" style="width: 1%; white-space: nowrap;">Terv (RON)</th>
                                    ${isRevisionMode ? '<th class="text-end text-warning" style="width: 1%; white-space: nowrap;">Módosítás</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>${generateBudgetRows(window.bevetelCellek, window.savedBudgetValues, isFinalized, '1')}</tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-lg-6">
                <div class="card border-danger border-top-wide shadow-sm">
                    <div class="card-header bg-danger-lt"><h3 class="card-title text-danger fw-bold"><i class="ti ti-arrow-up-circle me-2"></i> Tervezett Kiadások</h3></div>
                    <div class="table-responsive" style="overflow-x: visible;">
                        <table class="table table-sm table-vcenter table-hover mb-0">
                            <thead class="bg-dark text-white">
                                <tr>
                                    <th style="width: 10%;">Kód</th>
                                    <th>Megnevezés</th>
                                    <th class="text-end" style="width: 1%; white-space: nowrap;">Terv (RON)</th>
                                    ${isRevisionMode ? '<th class="text-end text-warning" style="width: 1%; white-space: nowrap;">Módosítás</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>${generateBudgetRows(window.kiadasCellek, window.savedBudgetValues, isFinalized, '2')}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card mt-4 border-primary shadow-sm bg-primary-lt">
            <div class="card-body text-center py-4">
                <h3 class="card-title text-primary fw-bold mb-2"><i class="ti ti-scale me-2"></i> Tervezett Egyenleg Összegzése</h3>
                <h1 class="mb-1 text-primary" style="font-size: 2.8rem;"><strong id="budget-live-balance">0 RON</strong></h1>
                <div id="budget-live-message" class="fs-4 text-muted fst-italic mt-2">Kérem, kezdje el beírni a számokat!</div>
            </div>
        </div>

        <div id="budget-action-area" class="mt-4">
            ${actionAreaHtml}
        </div>
    </form>`;

    container.innerHTML = html;

    const tooltipTriggerList = [].slice.call(container.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(t => new bootstrap.Tooltip(t, { trigger: 'hover focus click' }));

    calculateLiveBalance();
}

function formatNumberWithSpaces(num) {
    if (num === null || num === undefined) return '';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

window.formatKoltsegvetesInput = function(el) {
    let rawVal = el.value.replace(/[^\d]/g, '');
    if (rawVal !== '') {
        el.value = rawVal.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    } else {
        el.value = '';
    }
    calculateLiveBalance();
}

// Numerikus rendezés: "101" < "101.01" < "101.02" < "102" stb.
// Szükséges mert a DB sorszam mezője nem mindig tartja a helyes hierarchikus sorrendet.
function _sortCellsHierarchically(cells) {
    return cells.slice().sort((a, b) => {
        const aParts = String(a.id).split('.').map(n => parseInt(n) || 0);
        const bParts = String(b.id).split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const diff = (aParts[i] || 0) - (bParts[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });
}

function generateBudgetRows(cells, savedValues, isFinalized, typePrefix) {
    let html = '';
    _sortCellsHierarchically(cells).forEach(c => {
        const safeCId = String(c.id).trim();
        const isHeader = c.iscel === false || !safeCId.includes('.');
        const val = savedValues[c.id] || { osszeg: 0, osszeg_modositott: null };
        
        let displayVal = val.osszeg;
        if (!isFinalized) {
            if (safeCId === '100.01' && window.autoCarryoverCash !== undefined) displayVal = window.autoCarryoverCash;
            if (safeCId === '100.02' && window.autoCarryoverBank !== undefined) displayVal = window.autoCarryoverBank;
        }

        if (isHeader) {
            html += `<tr class="category-header">
                        <td colspan="${isRevisionMode ? 4 : 3}" class="py-2 text-dark fw-bold text-uppercase" style="background-color: #e2e8f0; border-top: 2px solid #cbd5e1; font-size: 0.85rem;">
                            <i class="ti ti-folder-open me-2"></i>${c.id} - ${c.nev}
                        </td>
                     </tr>`;
        } else {
            const romanianText = c.nevro ? c.nevro.replace(/"/g, '&quot;') : 'Nincs román fordítás';
            
            // 🚨 JAVÍTÁS: Szigorú dobozméret a td-n (width: 1%) és az inputon (width: 120px; display: inline-block)
            html += `<tr class="budget-row">
                <td class="text-muted small fw-bold align-middle">${c.id}</td>
                <td class="align-middle"><span class="romanian-hint" data-bs-toggle="tooltip" data-bs-placement="top" title="${romanianText}">${c.nev}</span></td>
                <td class="align-middle text-end" style="width: 1%; white-space: nowrap;">
                    <input type="text" inputmode="numeric" class="form-control form-control-sm text-end budget-input fw-bold shadow-none" style="width: 120px; display: inline-block;" data-type="${typePrefix}" data-id="${c.id}" data-col="osszeg" value="${formatNumberWithSpaces(displayVal)}" oninput="formatKoltsegvetesInput(this)" ${isFinalized ? 'disabled' : ''}>
                </td>
                ${isRevisionMode ? `<td class="align-middle text-end" style="width: 1%; white-space: nowrap;">
                    <input type="text" inputmode="numeric" class="form-control form-control-sm text-end border-warning budget-input fw-bold text-warning shadow-none" style="width: 120px; display: inline-block;" data-type="${typePrefix}" data-id="${c.id}" data-col="osszeg_modositott" value="${formatNumberWithSpaces(val.osszeg_modositott !== null ? val.osszeg_modositott : displayVal)}" oninput="formatKoltsegvetesInput(this)">
                </td>` : ''}
            </tr>`;
        }
    });
    return html;
}

function calculateLiveBalance() {
    let sumIn = 0;
    let sumOut = 0;

    const targetCol = isRevisionMode ? 'osszeg_modositott' : 'osszeg';
    const parseValue = (val) => parseInt(val.replace(/\s/g, ''), 10) || 0;

    document.querySelectorAll(`.budget-input[data-type="1"][data-col="${targetCol}"]`).forEach(i => sumIn += parseValue(i.value));
    document.querySelectorAll(`.budget-input[data-type="2"][data-col="${targetCol}"]`).forEach(i => sumOut += parseValue(i.value));

    const diff = sumIn - sumOut;
    const balanceEl = document.getElementById('budget-live-balance');
    const msgEl = document.getElementById('budget-live-message');

    balanceEl.innerText = formatNumberWithSpaces(diff) + ' RON';

    if (diff > 0) {
        balanceEl.className = "text-success";
        const randomIndex = Math.floor(Math.random() * positiveMessages.length);
        msgEl.innerHTML = `<span class="text-success fw-bold"><i class="ti ti-mood-smile me-1"></i> ${positiveMessages[randomIndex]}</span>`;
    } else if (diff === 0) {
        balanceEl.className = "text-dark";
        msgEl.innerHTML = `<span class="text-dark fw-bold"><i class="ti ti-scale me-1"></i> Patikamérlegen kiszámolt terv! Pontosan nullszaldós, de egy kis tartalék nem ártana...</span>`;
    } else {
        balanceEl.className = "text-danger";
        msgEl.innerHTML = `<span class="text-danger fw-bold"><i class="ti ti-alert-octagon me-1"></i> VIGYÁZAT! A tervezet mínuszban van! Kérjük, faragjon a kiadásokból, nehogy csődbe menjen a gyülekezet!</span>`;
    }
}

function toggleRevision() { isRevisionMode = !isRevisionMode; loadKoltsegvetes(); }

async function saveBudgetPlan(e) {
    e.preventDefault();
    
    const diffText = document.getElementById('budget-live-balance').innerText;
    if (diffText.includes('-')) {
        const confirmSave = confirm("A tervezet jelenleg MÍNUSZOS! Biztosan véglegesíteni akarja ezt a költségvetést?");
        if (!confirmSave) return;
    }

    const btn = document.getElementById('btn-save-budget');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; 
    btn.disabled = true;

    // FIX: Csak az 'osszeg' oszlop inputjait iteráljuk (revision módban ne kerüljön be kétszer ugyanaz a szamadasicelid)
    const inputs = document.querySelectorAll('.budget-input[data-col="osszeg"]');
    const payload = [];

    window.savedBudgetValues = {};

    inputs.forEach(i => {
        const id = i.dataset.id;
        const osszeg = parseInt(i.value.replace(/\s/g, ''), 10) || 0;
        const row = {
            bealitasid: currentYear,
            szamadasicelid: id,
            congregation_id: activeCongregationId,
            osszeg: osszeg
        };
        if (isRevisionMode) {
            // FIX: osszeg_modositott input külön lekérve, nem a forEach iterációból
            const modInput = document.querySelector(`.budget-input[data-id="${id}"][data-col="osszeg_modositott"]`);
            row.osszeg_modositott = modInput ? (parseInt(modInput.value.replace(/\s/g, ''), 10) || osszeg) : osszeg;
        }
        payload.push(row);
        window.savedBudgetValues[id] = row;
    });

    try {
        const { error } = await _supabase.from('koltsegvetes').upsert(payload, { onConflict: 'bealitasid, szamadasicelid, congregation_id' });
        if (error) throw error;

        if (!isRevisionMode) {
            await _supabase.from('bealitas').update({ budget_finalized: true }).eq('id', currentYear).eq('congregation_id', activeCongregationId);
            currentSettings.budget_finalized = true; 
        }
        
        const actionArea = document.getElementById('budget-action-area');
        actionArea.innerHTML = `
        <div class="row g-2">
            <div class="col-md-6">
                <button type="button" class="btn btn-dark w-100 py-3 fs-3 fw-bold shadow" onclick="triggerBudgetPrint()"><i class="ti ti-printer me-2"></i> Költségvetés Újranyomtatása</button>
            </div>
            <div class="col-md-6">
                <button type="button" class="btn btn-outline-warning w-100 py-3 fs-3 fw-bold shadow" onclick="requestBudgetUnlock()"><i class="ti ti-lock-open me-2"></i> Költségvetés feloldása</button>
            </div>
        </div>`;
        
        document.querySelectorAll('.budget-input').forEach(inp => inp.disabled = true);
        triggerBudgetPrint();

        if (typeof loadSzamadas === 'function') await loadSzamadas();

    } catch(err) {
        alert("Mentési hiba: " + err.message);
        btn.innerHTML = origText; 
        btn.disabled = false; 
    }
}

window.triggerBudgetPrint = function() {
    if (typeof printKoltsegvetes === 'function') {
        const cols = isRevisionMode ? ['osszeg', 'osszeg_modositott'] : ['osszeg'];
        const isReprint = !!(currentSettings && currentSettings.egyhazkozsegi_iktatoszam);
        printKoltsegvetes(currentYear, window.bevetelCellek, window.kiadasCellek, window.savedBudgetValues, cols, isReprint);
    } else {
        alert("Hiba: A nyomtató modul nem található!");
    }
}

// Költségvetés iktatása — mentés a bealitas táblába + iktató táblába
// Első nyomtatáskor hívódik; újranyomtatásnál a print ablak nem hívja
window.saveBudgetToIktatokonyv = async function(data) {
    if (!data || !data.iktatoszam) return;

    // Ha már iktatva van, ne mentsük újra
    if (currentSettings.egyhazkozsegi_iktatoszam) {
        console.log('Költségvetés már iktatva:', currentSettings.egyhazkozsegi_iktatoszam);
        return;
    }

    try {
        // 1) Metaadatok mentése a bealitas táblába
        var updatePayload = {
            egyhazkozsegi_iktatoszam: data.iktatoszam,
            presbiteriumi_hatarozat_datum: data.datum || null,
            presbiteriumi_hatarozat_szam: data.jkv || null
        };

        var updateRes = await _supabase.from('bealitas')
            .update(updatePayload)
            .eq('id', currentYear)
            .eq('congregation_id', activeCongregationId);

        if (updateRes.error) throw updateRes.error;

        // currentSettings frissítés (hogy a következő triggerBudgetPrint isReprint=true legyen)
        currentSettings.egyhazkozsegi_iktatoszam = data.iktatoszam;
        currentSettings.presbiteriumi_hatarozat_datum = data.datum;
        currentSettings.presbiteriumi_hatarozat_szam = data.jkv;

        // 2) Iktató táblába mentés (az iktató oldalon is megjelenik)
        var gyulNev = currentSettings.intezmenyneve || 'Ismeretlen';
        var egyhazmegye = currentSettings.egyhazmegye || 'Kézdi-Orbai';
        var today = data.datum || new Date().toISOString().split('T')[0];
        var year = currentYear;

        // Következő sorszám lekérdezése az adott évre
        var lastRes = await _supabase.from('iktato').select('sequence_number')
            .eq('year', year).eq('congregation_id', activeCongregationId).eq('deleted', false)
            .order('sequence_number', { ascending: false }).limit(1);
        var nextSeqNum = (lastRes.data && lastRes.data.length > 0) ? lastRes.data[0].sequence_number + 1 : 1;

        var payload = {
            congregation_id: activeCongregationId,
            year: year,
            sequence_number: nextSeqNum,
            direction: 'outgoing',
            kelt: today,
            subject: year + '. évi Költségvetés',
            sender_or_recipient: egyhazmegye + ' Református Egyházmegye',
            file_folder: 'F.Á.',
            targykivonat: gyulNev + ' Ref. Egyházközség ' + year + '. évi költségvetés. Jkv: ' + (data.jkv || ''),
            elintezes_ideje: today,
            elintezes_modja: 'Nyomtatva és Irattározva',
            megjegyzes: 'Iktatószám: ' + data.iktatoszam + '. Automatikusan iktatva a költségvetés véglegesítésekor.'
        };

        var insertRes = await _supabase.from('iktato').insert([payload]);
        if (insertRes.error) {
            console.error('Iktatási hiba:', insertRes.error.message);
        } else {
            console.log('Költségvetés sikeresen iktatva:', data.iktatoszam, '(sorszám: ' + nextSeqNum + ')');
        }
    } catch (err) {
        console.error('Iktatás kivétel:', err);
    }
};

window.requestBudgetUnlock = async function() {
    if(!confirm("Kérelmezi az Egyházmegyétől a költségvetés feloldását javítás céljából?")) return;
    try {
        const { error } = await _supabase.from('bealitas').update({ unlock_requested: true }).eq('id', currentYear).eq('congregation_id', activeCongregationId);
        if (error) throw error;
        currentSettings.unlock_requested = true;
        loadKoltsegvetes(); 
    } catch(err) { alert("Hiba a kérelem küldésekor: " + err.message); }
}