// --- js/penzugy_accounting.js ---

// Biztonságos, egyedi nevű formázó, hogy ne ütközzön semmivel a rendszerben!
window.formatPenzugy = function(num) {
    if (num === null || num === undefined || isNaN(num)) return "0,00";
    let parts = Number(num).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts[0] + ',' + parts[1];
};

async function loadSzamadas() {
    try {
        const container = document.getElementById('tab-szamadas');
        if (!container) return;

        const accMessages = {
            positive: ["Isten kegyelméből gyarapodik a gyülekezet, szép az egyenleg!", "Bölcs gazdálkodás, megnyugtató tartalék a jövőre nézve!", "A magvetés meghozta gyümölcsét, stabilak a pénzügyek.", "Hála Istennek, van miből építkezni és tervezni a jövőt!", "Dicséretes a presbitérium és a lelkipásztor gondossága!", "Nyugodt szívvel tekinthetünk a jövőbe, a kassza rendben van.", "Az adakozó kedv és a jó sáfárkodás szép eredménye ez az egyenleg.", "Stabil lábakon állunk, folytassuk a jó és hűséges munkát!", "Áldás van a gyülekezet életén és pénzügyein is.", "Jó látni, hogy a gyülekezet anyagi háttere ilyen biztos."],
            neutral: ["Patikamérlegen egyensúlyozunk, minden lejnek megvan a helye.", "Kiegyensúlyozott az állapot, de egy kis tartalék még jól jönne.", "Nullszaldós a helyzet: amennyi jött, annyi ment. Vigyázzunk a kiadásokra!", "Stabilak vagyunk, de a váratlan kiadásokra még fel kell készülnünk.", "Isten gondviselése megtart, de legyünk óvatosak a további költésekkel."],
            negative: ["Vigyázat, a kiadások túllépték a bevételeket! Ideje szorosabbra húzni a nadrágszíjat.", "Imádkozzunk és cselekedjünk: a jelenlegi egyenlegünk sajnos mínuszban van.", "Figyelmeztető jel: a gyülekezet anyagi tartalékai apadnak, faragjunk a kiadásokból!", "Kérjük Isten bölcsességét a kiadások átgondolásához, mert deficitünk van.", "Nehéz időszak ez anyagilag, de Isten megsegít, ha azonnal bölcsen sáfárkodunk."]
        };
        
        const { data: budget } = await _supabase.from('koltsegvetes').select('*').eq('bealitasid', currentYear).eq('congregation_id', activeCongregationId);
        
        // 🚨 JAVÍTÁS: Lekérjük az "irattipus" oszlopot is a Készpénz/Bank felismeréséhez!
        const { data: bev } = await _supabase.from('befizetes').select('osszeg, id_befizetescel, datum, irattipus').eq('congregation_id', activeCongregationId).eq('fizetettev', currentYear).eq('deleted', false);
        const { data: kia } = await _supabase.from('kiadas').select('osszeg, id_kiadascel, datum, irattipus').eq('congregation_id', activeCongregationId).eq('deleted', false).gte('datum', `${currentYear}-01-01`).lte('datum', `${currentYear}-12-31`);

        const { data: bealitasRow } = await _supabase.from('bealitas').select('szamadas_zaro_adatok').eq('id', currentYear).eq('congregation_id', activeCongregationId).single();
        window.savedZaroAdatok = bealitasRow?.szamadas_zaro_adatok || {};

        window.rawBefizetesek = bev || [];
        window.rawKiadasok = kia || [];

        const actuals = {};
        bev?.forEach(i => {
            const kod = window.bevCelMap[i.id_befizetescel];
            if (kod) actuals[kod] = (actuals[kod] || 0) + Number(i.osszeg);
        });
        kia?.forEach(i => {
            const kod = window.kiaCelMap[i.id_kiadascel];
            if (kod) actuals[kod] = (actuals[kod] || 0) + Number(i.osszeg);
        });

        const startCash = window.autoCarryoverCash || 0;
        const startBank = window.autoCarryoverBank || 0;

        // 🚨 JAVÍTÁS: Aktuális Készpénz és Bank kiszámítása a tranzakciókból!
        let currentCash = startCash;
        let currentBank = startBank;
        
        bev?.forEach(i => {
            if (i.irattipus === 'Készpénz') currentCash += Number(i.osszeg);
            else currentBank += Number(i.osszeg);
        });
        
        kia?.forEach(i => {
            if (i.irattipus === 'Készpénz') currentCash -= Number(i.osszeg);
            else currentBank -= Number(i.osszeg);
        });

        if (startCash) actuals['100.01'] = (actuals['100.01'] || 0) + startCash;
        if (startBank) actuals['100.02'] = (actuals['100.02'] || 0) + startBank;

        const safeSzamadasiCellek = window.szamadasiCellek || [];
        const bevetelCellek = safeSzamadasiCellek.filter(c => c.type === 'B');
        const kiadasCellek = safeSzamadasiCellek.filter(c => c.type === 'K');

        const totalIn = (bev?.reduce((s, i) => s + Number(i.osszeg), 0) || 0) + startCash + startBank;
        const totalOut = kia?.reduce((s, i) => s + Number(i.osszeg), 0) || 0;
        const currentBalance = totalIn - totalOut;

        let messageToDisplay = "";
        let alertColor = "";
        if (currentBalance > 0) {
            messageToDisplay = accMessages.positive[Math.floor(Math.random() * accMessages.positive.length)];
            alertColor = "text-success";
        } else if (currentBalance === 0) {
            messageToDisplay = accMessages.neutral[Math.floor(Math.random() * accMessages.neutral.length)];
            alertColor = "text-dark";
        } else {
            messageToDisplay = accMessages.negative[Math.floor(Math.random() * accMessages.negative.length)];
            alertColor = "text-danger";
        }

        const isAccFinalized = currentSettings?.accounting_finalized;
        const accUnlockReq = currentSettings?.accounting_unlock_requested;

        let accActionAreaHtml = '';
        if (!isAccFinalized) {
            accActionAreaHtml = `
            <div class="row g-2 mt-4">
                <div class="col-md-6">
                    <button type="button" class="btn btn-purple w-100 py-3 fs-3 fw-bold shadow" onclick="openZaroLeltarModal()"><i class="ti ti-checklist me-2"></i> 1. Lépés: Év végi Záró Leltár Kitöltése</button>
                </div>
                <div class="col-md-6">
                    <button type="button" id="btn-save-accounting" class="btn btn-success w-100 py-3 fs-3 fw-bold shadow" onclick="finalizeAccounting()"><i class="ti ti-device-floppy me-2"></i> 2. Lépés: Zárszámadás Véglegesítése</button>
                </div>
                <div class="col-12 mt-2 text-center">
                    <button type="button" class="btn btn-ghost-dark py-2 fw-bold" onclick="openSzamadasPrintModal()"><i class="ti ti-printer me-2"></i> Időközi / Résszámadás Nyomtatása (Nem hivatalos)</button>
                </div>
            </div>`;
        } else {
            const unlockBtnHtml = accUnlockReq 
                ? `<button type="button" class="btn btn-warning w-100 py-3 fs-3 fw-bold shadow" disabled><i class="ti ti-clock me-2"></i> Várakozás az elbírálásra...</button>`
                : `<button type="button" class="btn btn-outline-warning w-100 py-3 fs-3 fw-bold shadow" onclick="requestAccountingUnlock()"><i class="ti ti-lock-open me-2"></i> Számadás feloldása</button>`;
            
            accActionAreaHtml = `
            <div class="row g-2 mt-4">
                <div class="col-md-6">
                    <button type="button" class="btn btn-dark w-100 py-3 fs-3 fw-bold shadow" onclick="executeSzamadasPrint(true)"><i class="ti ti-printer me-2"></i> Zárszámadás Újranyomtatása</button>
                </div>
                <div class="col-md-6">
                    ${unlockBtnHtml}
                </div>
            </div>`;
        }

        let html = `
            <div class="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h3>Élő Számadás (Terv vs. Tény) - ${currentYear}</h3>
                ${isAccFinalized ? '<span class="badge bg-success p-2 fs-4 shadow-sm"><i class="ti ti-check me-2"></i> Véglegesítve és Leadva</span>' : ''}
            </div>
            <div class="row g-4">
                <div class="col-lg-6">
                    <div class="card border-success border-top-wide shadow-sm">
                        <div class="card-header bg-success-lt"><h3 class="card-title text-success fw-bold"><i class="ti ti-arrow-down-circle me-2"></i> Bevételek Teljesülése</h3></div>
                        <div class="table-responsive"><table class="table table-sm table-vcenter table-hover mb-0">
                            <thead class="bg-dark text-white"><tr><th style="width:10%;">Kód</th><th>Megnevezés</th><th class="text-end" style="width: 110px;">Terv</th><th class="text-end" style="width: 110px;">Tény</th><th class="text-center"> % </th></tr></thead>
                            <tbody>${generateAccountingRows(bevetelCellek, budget, actuals)}</tbody>
                        </table></div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card border-danger border-top-wide shadow-sm">
                        <div class="card-header bg-danger-lt"><h3 class="card-title text-danger fw-bold"><i class="ti ti-arrow-up-circle me-2"></i> Kiadások Teljesülése</h3></div>
                        <div class="table-responsive"><table class="table table-sm table-vcenter table-hover mb-0">
                            <thead class="bg-dark text-white"><tr><th style="width:10%;">Kód</th><th>Megnevezés</th><th class="text-end" style="width: 110px;">Terv</th><th class="text-end" style="width: 110px;">Tény</th><th class="text-center"> % </th></tr></thead>
                            <tbody>${generateAccountingRows(kiadasCellek, budget, actuals)}</tbody>
                        </table></div>
                    </div>
                </div>
            </div>
            
            <div class="card mt-4 border-primary shadow-sm bg-primary-lt">
                <div class="card-body">
                    <h3 class="card-title text-primary fw-bold mb-3"><i class="ti ti-wallet me-2"></i> Jelenlegi Pénzügyi Állapot Összegzése</h3>
                    
                    <div class="row text-center align-items-center">
                        <div class="col-md-4 mb-3 mb-md-0 border-end border-primary-subtle">
                            <div class="text-muted text-uppercase fw-bold mb-3" style="font-size: 0.8rem;"><i class="ti ti-cash me-1"></i> Készpénz</div>
                            <div class="row">
                                <div class="col-6 border-end border-primary-subtle">
                                    <div class="small text-muted">Nyitó</div>
                                    <div class="fw-bold text-dark fs-4">${window.formatPenzugy(startCash)}</div>
                                </div>
                                <div class="col-6">
                                    <div class="small text-primary fw-bold">Aktuális</div>
                                    <div class="fs-3 fw-bold text-primary">${window.formatPenzugy(currentCash)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4 mb-3 mb-md-0 border-end border-primary-subtle">
                            <div class="text-muted text-uppercase fw-bold mb-3" style="font-size: 0.8rem;"><i class="ti ti-building-bank me-1"></i> Bank</div>
                            <div class="row">
                                <div class="col-6 border-end border-primary-subtle">
                                    <div class="small text-muted">Nyitó</div>
                                    <div class="fw-bold text-dark fs-4">${window.formatPenzugy(startBank)}</div>
                                </div>
                                <div class="col-6">
                                    <div class="small text-primary fw-bold">Aktuális</div>
                                    <div class="fs-3 fw-bold text-primary">${window.formatPenzugy(currentBank)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4">
                            <div class="text-primary text-uppercase fw-bold" style="font-size: 0.85rem;">Aktuális Összesített Egyenleg</div>
                            <h1 class="mb-0 mt-2 text-primary" style="font-size: 2.2rem;">${window.formatPenzugy(currentBalance)} RON</h1>
                        </div>
                    </div>
                    
                    <div class="text-center mt-4">
                        <h3 class="${alertColor} fst-italic mb-0"><i class="ti ti-quote me-1"></i> "${messageToDisplay}"</h3>
                    </div>
                </div>
            </div>

            <div id="accounting-action-area">${accActionAreaHtml}</div>
            
            <div class="modal modal-blur fade" id="modal-zaro-leltar" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header bg-purple text-white"><h5 class="modal-title">Év végi Záró Leltár Kitöltése</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body p-4"><form id="zaro-leltar-form">
                            <h4 class="text-danger border-bottom pb-2 mt-4">Tartozások (Datorii)</h4><div id="zaro-tartozasok-container"></div>
                            <h4 class="text-success border-bottom pb-2 mt-4">Kintlévőségek (Creanțe)</h4><div id="zaro-kintlevosegek-container"></div>
                        </form></div>
                        <div class="modal-footer"><button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Mégse</button><button type="button" class="btn btn-purple fw-bold" onclick="saveZaroLeltar()">Leltár Mentése</button></div>
                    </div>
                </div>
            </div>

            <div class="modal modal-blur fade" id="modal-szamadas-print-settings" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header bg-dark text-white"><h5 class="modal-title"><i class="ti ti-printer me-2"></i> Nyomtatási Beállítások</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body p-4">
                            <div class="mb-3">
                                <label class="form-label fw-bold">Mit szeretne nyomtatni?</label>
                                <select class="form-select" id="szamadas-print-type" onchange="togglePartialDates()">
                                    <option value="partial">Résszámadás (Időszaki, Terv oszlop és Leltár nélkül)</option>
                                    <option value="full" disabled>Éves Zárszámadás (Kérem a Véglegesítés gombot használja!)</option>
                                </select>
                            </div>
                            <div id="partial-dates" class="row bg-light p-3 rounded border">
                                <div class="col-6 mb-3">
                                    <label class="form-label text-primary fw-bold">Kezdő dátum (Tól)</label>
                                    <input type="date" class="form-control" id="szamadas-date-from" value="${currentYear}-01-01">
                                </div>
                                <div class="col-6 mb-3">
                                    <label class="form-label text-danger fw-bold">Záró dátum (Ig)</label>
                                    <input type="date" class="form-control" id="szamadas-date-to" value="${currentYear}-12-31">
                                </div>
                                <div class="col-12 text-muted small"><i class="ti ti-info-circle"></i> A gép automatikusan kiszámolja a Kezdő dátumra vonatkozó pontos nyitóegyenleget!</div>
                            </div>
                        </div>
                        <div class="modal-footer"><button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Mégse</button><button type="button" class="btn btn-dark fw-bold" onclick="executeSzamadasPrint(false)">Tovább a PDF-hez</button></div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        const tooltipTriggerList = [].slice.call(container.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(t => new bootstrap.Tooltip(t, { trigger: 'hover focus click' }));

        window.szamadasActuals = actuals;
        window.szamadasBudget = budget || [];

        const dashIn = document.getElementById('dash-total-in');
        const dashOut = document.getElementById('dash-total-out');
        const dashBal = document.getElementById('dash-balance');
        
        if (dashIn) dashIn.innerText = window.formatPenzugy(totalIn) + " RON";
        if (dashOut) dashOut.innerText = window.formatPenzugy(totalOut) + " RON";
        if (dashBal) dashBal.innerText = window.formatPenzugy(totalIn - totalOut) + " RON";
        
        if (typeof initMonetar === 'function') initMonetar(totalIn - totalOut);

    } catch (err) {
        console.error("Hiba a Számadás betöltésekor:", err);
        alert("Rendszerhiba történt a Számadás betöltése közben. Kérem ellenőrizze a konzolt (F12)!");
    }
}

function generateAccountingRows(cells, budget, actuals) {
    let html = '';

    if (!budget || budget.length === 0) {
        return `<tr><td colspan="5" class="text-center text-danger fw-bold py-3"><i class="ti ti-alert-triangle me-2"></i>Figyelem: A Költségvetés (Terv) adatai nincsenek betöltve az adatbázisból!</td></tr>`;
    }

    // Numerikus hierarchikus rendezés (DB sorszam nem mindig helyes sorrendű)
    const sortedCells = cells.slice().sort((a, b) => {
        const aParts = String(a.id).split('.').map(n => parseInt(n) || 0);
        const bParts = String(b.id).split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const diff = (aParts[i] || 0) - (bParts[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });

    sortedCells.forEach(c => {
        const safeCId = String(c.id).trim();
        
        let b = budget.find(x => {
            const possibleIds = [x.szamadasicelid, x.id_szamadasicel, x.cel_id, x.kod].map(v => String(v || '').trim());
            return possibleIds.includes(safeCId) || Object.values(x).some(v => String(v).trim() === safeCId);
        });

        let terv = 0;
        if (b) {
            terv = b.osszeg_mod_3 ?? b.osszeg_mod_2 ?? b.osszeg_modositott ?? b.osszeg ?? b.terv ?? b.eloiranyzat ?? b.eredeti_eloiranyzat ?? b.terv_osszeg ?? 0;
            if (Number(terv) === 0) {
                 const numericVals = Object.entries(b)
                      .filter(([k, v]) => typeof v === 'number' && v > 0 && !k.includes('id') && k !== 'bealitasid' && k !== 'congregation_id')
                      .map(([k, v]) => v);
                 if (numericVals.length > 0) terv = numericVals[0];
            }
        }

        const teny = actuals[c.id] || 0;
        const szazalek = Number(terv) > 0 ? Math.round((teny / terv) * 100) : (teny > 0 ? '∞' : '0');
        
        // BIZTONSÁGI JAVÍTÁS 2: Főcsoport felismerése (Ha iscel = false, VAGY nincs pont a kódjában, pl. 101)
        const isCategoryHeader = c.iscel === false || !safeCId.includes('.');

        if (isCategoryHeader) {
            html += `<tr class="category-header">
                        <td colspan="5" class="py-2 text-dark fw-bold text-uppercase" style="background-color: #e2e8f0; border-top: 2px solid #cbd5e1; font-size: 0.85rem;">
                            <i class="ti ti-folder-open me-2"></i>${c.id} - ${c.nev}
                        </td>
                     </tr>`;
        } else {
            const romanianText = c.nevro ? c.nevro.replace(/"/g, '&quot;') : '';
            let badgeClass = 'bg-secondary-lt text-secondary border border-secondary';
            if (szazalek !== '∞') {
                if (szazalek >= 100) badgeClass = 'bg-success-lt text-success border border-success';
                else if (szazalek >= 50) badgeClass = 'bg-warning-lt text-warning border border-warning';
                else if (szazalek > 0) badgeClass = 'bg-danger-lt text-danger border border-danger';
            } else { badgeClass = 'bg-info-lt text-info border border-info'; }

            // BIZTONSÁGI JAVÍTÁS 1: "text-nowrap" beállítása a Terv és Tény oszlopokra, fix 110px minimum szélességgel!
            html += `<tr class="budget-row">
                <td class="text-muted small fw-bold align-middle">${c.id}</td>
                <td class="align-middle"><span class="romanian-hint" data-bs-toggle="tooltip" title="${romanianText}">${c.nev}</span></td>
                <td class="text-end text-muted align-middle text-nowrap" style="white-space: nowrap; min-width: 110px;">${window.formatPenzugy(terv)}</td>
                <td class="text-end fw-bold align-middle text-nowrap" style="white-space: nowrap; min-width: 110px;">${window.formatPenzugy(teny)}</td>
                <td class="text-center align-middle"><span class="badge ${badgeClass} shadow-sm" style="font-size: 0.85rem; width: 50px;">${szazalek}%</span></td>
            </tr>`;
        }
    });
    return html;
}

window.openZaroLeltarModal = function() {
    const tartozasContainer = document.getElementById('zaro-tartozasok-container');
    const kintlevosegContainer = document.getElementById('zaro-kintlevosegek-container');
    tartozasContainer.innerHTML = ''; kintlevosegContainer.innerHTML = '';

    const safeCellek = window.szamadasiCellek || [];
    safeCellek.filter(c => c.type === 'Z').forEach(c => {
        const value = window.savedZaroAdatok[c.id] || 0;
        const inputHtml = `<div class="row align-items-center mb-2 pb-2 border-bottom"><div class="col-8"><div class="fw-bold">${c.id}. ${c.nev}</div><div class="small text-muted fst-italic">${c.nevro}</div></div><div class="col-4"><div class="input-group input-group-sm"><input type="number" class="form-control text-end zaro-input" data-id="${c.id}" value="${value}"><span class="input-group-text">RON</span></div></div></div>`;
        if (parseInt(c.sorszam) < 128) tartozasContainer.innerHTML += inputHtml; else kintlevosegContainer.innerHTML += inputHtml;
    });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-zaro-leltar')).show();
}

window.saveZaroLeltar = async function() {
    const btn = document.querySelector('#modal-zaro-leltar .btn-purple');
    btn.innerHTML = 'Mentés...'; btn.disabled = true;
    const payloadJSON = {};
    document.querySelectorAll('.zaro-input').forEach(inp => payloadJSON[inp.dataset.id] = parseFloat(inp.value) || 0);

    try {
        const { error } = await _supabase.from('bealitas').update({ szamadas_zaro_adatok: payloadJSON }).eq('id', currentYear).eq('congregation_id', activeCongregationId);
        if (error) throw error;
        window.savedZaroAdatok = payloadJSON;
        bootstrap.Modal.getInstance(document.getElementById('modal-zaro-leltar')).hide();
        alert("Záró Leltár elmentve!");
    } catch (err) { alert("Hiba: " + err.message); } finally { btn.innerHTML = 'Leltár Mentése'; btn.disabled = false; }
}

// --- Számadás véglegesítése és Snapshot mentése ---
window.finalizeAccounting = async function() {
    // ── ELŐFELTÉTEL-ELLENŐRZÉSEK ──
    if (!currentSettings || !currentSettings.budget_finalized) {
        alert('A Számadás véglegesítése előtt először a Költségvetést kell véglegesíteni!\n\nLépjen a „Terv" fülre és véglegesítse a költségvetést.');
        return;
    }

    var zaroAdatok = window.savedZaroAdatok || {};
    var zaroKitoltve = Object.keys(zaroAdatok).length > 0;
    if (!zaroKitoltve) {
        alert('A Számadás véglegesítése előtt először az 1. lépést kell végrehajtani:\n\n→ „Év végi Záró Leltár Kitöltése"\n\nKérem töltse ki a tartozások és kintlévőségek adatait!');
        return;
    }

    // Egyenleg figyelmeztetés (nem blokkoló)
    var totalIn = 0, totalOut = 0;
    var safeCellek = window.szamadasiCellek || [];
    safeCellek.forEach(function(c) {
        if (c.iscel === false || !String(c.id).includes('.')) return;
        var val = (window.szamadasActuals || {})[c.id] || 0;
        if (c.type === 'B') totalIn += Number(val) || 0;
        if (c.type === 'K') totalOut += Number(val) || 0;
    });
    var balance = totalIn - totalOut;
    if (balance < 0) {
        if (!confirm('Figyelem: Az egyenleg negatív (' + window.formatPenzugy(balance) + ' RON)!\n\nKérem ellenőrizze, hogy minden bevétel rögzítve van-e.\n\nBiztosan folytatja a véglegesítést?')) return;
    }

    if (!confirm('Biztosan véglegesíti az Éves Zárszámadást?\n\nEzt követően az adatok az Egyházmegye számára is láthatóvá válnak, és a rendszer pillanatképet készít!')) return;

    var btn = document.getElementById('btn-save-accounting');
    var origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...';
    btn.disabled = true;

    var payload = [];
    window.szamadasiCellek.forEach(function(c) {
        if (c.iscel === false || c.type === 'Z') return;

        var tenyVal = (window.szamadasActuals || {})[c.id] || 0;
        var existingRow = (window.szamadasBudget || []).find(function(b) { return b.szamadasicelid === c.id; });

        if (existingRow || tenyVal !== 0) {
            payload.push({
                bealitasid: currentYear,
                szamadasicelid: c.id,
                congregation_id: activeCongregationId,
                osszeg: existingRow ? existingRow.osszeg : 0,
                osszeg_modositott: existingRow ? existingRow.osszeg_modositott : null,
                osszeg_teny: tenyVal
            });
        }
    });

    try {
        if (payload.length > 0) {
            var upsertRes = await _supabase.from('koltsegvetes').upsert(payload, { onConflict: 'bealitasid, szamadasicelid, congregation_id' });
            if (upsertRes.error) throw upsertRes.error;
        }

        var flagRes = await _supabase.from('bealitas').update({ accounting_finalized: true }).eq('id', currentYear).eq('congregation_id', activeCongregationId);
        if (flagRes.error) throw flagRes.error;

        currentSettings.accounting_finalized = true;

        await loadSzamadas();
        executeSzamadasPrint(true);

    } catch (err) {
        alert('Mentési hiba: ' + err.message);
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

// --- Számadás metaadatok mentése (a nyomtatási ablakból hívódik) ---
window.saveAccountingMetadata = async function(data) {
    if (!data || !data.iktatoszam) return;

    // Ha már iktatva van, ne mentsük újra
    if (currentSettings.szamadas_iktatoszam) {
        console.log('Számadás már iktatva:', currentSettings.szamadas_iktatoszam);
        return;
    }

    try {
        // 1) Metaadatok mentése a bealitas táblába
        var updatePayload = {
            szamadas_iktatoszam: data.iktatoszam,
            szamadas_hatarozat_datum: data.datum || null,
            szamadas_hatarozat_szam: data.jkv || null
        };

        var updateRes = await _supabase.from('bealitas')
            .update(updatePayload)
            .eq('id', currentYear)
            .eq('congregation_id', activeCongregationId);

        if (updateRes.error) throw updateRes.error;

        currentSettings.szamadas_iktatoszam = data.iktatoszam;
        currentSettings.szamadas_hatarozat_datum = data.datum;
        currentSettings.szamadas_hatarozat_szam = data.jkv;

        // 2) Iktató táblába mentés
        await saveToIktatokonyv(data.iktatoszam, false, currentYear + '-01-01', currentYear + '-12-31');

        console.log('Számadás metaadatok sikeresen mentve:', data.iktatoszam);
    } catch (err) {
        console.error('Számadás iktatás kivétel:', err);
    }
}

// --- ÚJ: Feloldási kérelem ---
window.requestAccountingUnlock = async function() {
    if(!confirm("Kérelmezi az Egyházmegyétől a számadás feloldását javítás céljából?")) return;
    try {
        const { error } = await _supabase.from('bealitas').update({ accounting_unlock_requested: true }).eq('id', currentYear).eq('congregation_id', activeCongregationId);
        if (error) throw error;
        currentSettings.accounting_unlock_requested = true;
        loadSzamadas();
    } catch(err) { alert("Hiba: " + err.message); }
}

window.openSzamadasPrintModal = function() {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-szamadas-print-settings')).show();
}

window.togglePartialDates = function() {} // Ezt kikapcsoltuk, mert a modalból már csak a résszámadást lehet kérni

// Nyomtató hívó: forceFull = true → teljes zárszámadás, false → modal beállítások
window.executeSzamadasPrint = function(forceFull) {
    if (forceFull === undefined) forceFull = false;
    var pType = 'full';
    var dFrom = currentYear + '-01-01';
    var dTo = currentYear + '-12-31';

    if (forceFull === false) {
        pType = document.getElementById('szamadas-print-type').value;
        dFrom = document.getElementById('szamadas-date-from').value;
        dTo = document.getElementById('szamadas-date-to').value;
        var modalEl = document.getElementById('modal-szamadas-print-settings');
        if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
    }

    var printActuals = {};
    var openingBalance = 0;

    if (pType === 'partial') {
        var preIn = (window.autoCarryoverCash || 0) + (window.autoCarryoverBank || 0);
        var preOut = 0;

        (window.rawBefizetesek || []).forEach(function(i) {
            if (i.datum < dFrom) preIn += Number(i.osszeg);
            else if (i.datum >= dFrom && i.datum <= dTo) {
                var kod = window.bevCelMap[i.id_befizetescel];
                if (kod) printActuals[kod] = (printActuals[kod] || 0) + Number(i.osszeg);
            }
        });

        (window.rawKiadasok || []).forEach(function(i) {
            if (i.datum < dFrom) preOut += Number(i.osszeg);
            else if (i.datum >= dFrom && i.datum <= dTo) {
                var kod = window.kiaCelMap[i.id_kiadascel];
                if (kod) printActuals[kod] = (printActuals[kod] || 0) + Number(i.osszeg);
            }
        });

        openingBalance = preIn - preOut;
        printActuals['100'] = openingBalance;

    } else {
        printActuals = window.szamadasActuals;
        openingBalance = (window.autoCarryoverCash || 0) + (window.autoCarryoverBank || 0);
    }

    // isReprint: ha már van mentett iktatószám a számadáshoz
    var isReprint = !!(currentSettings && currentSettings.szamadas_iktatoszam);

    if (typeof printSzamadas === 'function') {
        printSzamadas(currentYear, window.szamadasiCellek, window.szamadasBudget, printActuals, window.savedZaroAdatok, pType, dFrom, dTo, openingBalance, isReprint);
    } else {
        alert('Hiba: A nyomtató modul nem található!');
    }
}

window.saveToIktatokonyv = async function(iktatoszam, isPartial, dFrom, dTo) {
    if (!iktatoszam) return;

    var gyulNev = (currentSettings && currentSettings.intezmenyneve) || window._congNev || 'Ismeretlen';
    var egyhazmegye = (currentSettings && currentSettings.egyhazmegye) || 'Kézdi-Orbai';
    var targy = isPartial
        ? 'Résszámadás (' + dFrom + ' - ' + dTo + ')'
        : currentYear + '. évi Zárszámadás';

    var today = new Date().toISOString().split('T')[0];
    var year = currentYear;

    try {
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
            subject: targy,
            sender_or_recipient: egyhazmegye + ' Református Egyházmegye',
            file_folder: 'F.Á.',
            targykivonat: gyulNev + ' Ref. Egyházközség pénzügyi ' + (isPartial ? 'résszámadás' : 'zárszámadás') + ' — iktatva a véglegesítés során',
            elintezes_ideje: today,
            elintezes_modja: 'Nyomtatva és Irattározva',
            megjegyzes: 'Iktatószám: ' + iktatoszam + '. Automatikusan iktatva a ' + (isPartial ? 'résszámadás' : 'zárszámadás') + ' véglegesítésekor.'
        };

        var insertRes = await _supabase.from('iktato').insert([payload]);
        if (insertRes.error) {
            console.error('Iktatási hiba:', insertRes.error.message);
        } else {
            console.log('Számadás sikeresen iktatva:', iktatoszam, '(sorszám: ' + nextSeqNum + ')');
        }
    } catch (err) {
        console.error('Iktatás kivétel:', err);
    }
};