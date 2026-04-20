// ============================================================
// BELSŐ MOZGÁS MOTOR (kassza↔bank, bank↔bank, valutacsere)
// ============================================================

window.allBelsomozgas = [];
let _currentBmType = 'kassza_bank';

// ── Adatok betöltése ──────────────────────────────────────────
window.loadBelsomozgas = async function() {
    if (!activeCongregationId) return;
    try {
        const { data } = await _supabase
            .from('belsomozgas')
            .select('*')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .gte('datum', `${currentYear}-01-01`)
            .lte('datum', `${currentYear}-12-31`);
        window.allBelsomozgas = data || [];
    } catch (err) {
        console.error('Belső mozgás betöltési hiba:', err);
        window.allBelsomozgas = [];
    }
};

// ── Modal megnyitása ──────────────────────────────────────────
window.openBelsomozgasModal = function() {
    document.getElementById('bm-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('bm-osszeg').value = '';
    document.getElementById('bm-cel-osszeg').value = '';
    document.getElementById('bm-arfolyam').value = '';
    document.getElementById('bm-megjegyzes').value = '';
    document.getElementById('bm-preview').classList.add('d-none');
    window.setBmType('kassza_bank');
    new bootstrap.Modal(document.getElementById('modal-belsomozgas')).show();
};

// ── Típus váltás ──────────────────────────────────────────────
window.setBmType = function(tipus) {
    _currentBmType = tipus;

    // Gombok állapota
    document.querySelectorAll('.bm-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === tipus);
        btn.classList.toggle('btn-purple', btn.dataset.type === tipus);
        btn.classList.toggle('text-white', btn.dataset.type === tipus);
        btn.classList.toggle('btn-outline-secondary', btn.dataset.type !== tipus);
    });

    // Valutacsere extra mezők
    const isCsere = tipus === 'valutacsere';
    document.getElementById('bm-cel-osszeg-col').classList.toggle('d-none', !isCsere);
    document.getElementById('bm-arfolyam-col').classList.toggle('d-none', !isCsere);

    const forrasLabel = document.getElementById('bm-forras-label');
    const celLabel    = document.getElementById('bm-cel-label');
    const valutaEl    = document.getElementById('bm-osszeg-valuta');

    // Forrás/Cél select feltöltése
    const kassza = '<option value="kassza">💰 Kassza (készpénz)</option>';
    const bankOpts = (window.bankAccounts || [])
        .map(b => `<option value="${b.id}">${b.bank_neve} (${b.valuta}) — ${b.iban || 'IBAN n/a'}</option>`)
        .join('');

    const forrasEl = document.getElementById('bm-forras');
    const celEl    = document.getElementById('bm-cel');

    if (tipus === 'kassza_bank') {
        forrasEl.innerHTML = kassza;
        celEl.innerHTML    = bankOpts || '<option value="">— Nincs bankszámla —</option>';
        forrasLabel.textContent = 'Forrás (Kassza)';
        celLabel.textContent    = 'Cél bankszámla';
        valutaEl.textContent    = 'RON';
    } else if (tipus === 'bank_kassza') {
        forrasEl.innerHTML = bankOpts || '<option value="">— Nincs bankszámla —</option>';
        celEl.innerHTML    = kassza;
        forrasLabel.textContent = 'Forrás bankszámla';
        celLabel.textContent    = 'Cél (Kassza)';
        valutaEl.textContent    = 'RON';
    } else if (tipus === 'bank_bank') {
        forrasEl.innerHTML = bankOpts;
        celEl.innerHTML    = bankOpts;
        forrasLabel.textContent = 'Küldő bankszámla';
        celLabel.textContent    = 'Fogadó bankszámla';
        valutaEl.textContent    = 'RON';
    } else if (tipus === 'valutacsere') {
        // Forrás: RON számlák, Cél: EUR számlák (és fordítva)
        const ronOpts = (window.bankAccounts || [])
            .filter(b => b.valuta === 'RON')
            .map(b => `<option value="${b.id}">${b.bank_neve} (RON)</option>`).join('');
        const eurOpts = (window.bankAccounts || [])
            .filter(b => b.valuta === 'EUR')
            .map(b => `<option value="${b.id}">${b.bank_neve} (EUR)</option>`).join('');
        forrasEl.innerHTML = ronOpts || '<option value="">— Nincs RON számla —</option>';
        celEl.innerHTML    = eurOpts || '<option value="">— Nincs EUR számla —</option>';
        forrasLabel.textContent = 'RON forrás számla';
        celLabel.textContent    = 'EUR cél számla';
        valutaEl.textContent    = 'RON';
    }

    _updateBmPreview();
};

// ── Árfolyam kalkulátor ───────────────────────────────────────
window.calcBmArfolyam = function() {
    const osszeg    = parseFloat(document.getElementById('bm-osszeg').value) || 0;
    const celOsszeg = parseFloat(document.getElementById('bm-cel-osszeg').value) || 0;
    if (osszeg > 0 && celOsszeg > 0) {
        document.getElementById('bm-arfolyam').value = (osszeg / celOsszeg).toFixed(4);
    }
    _updateBmPreview();
};

window.calcBmCelOsszeg = function() {
    const osszeg   = parseFloat(document.getElementById('bm-osszeg').value) || 0;
    const arfolyam = parseFloat(document.getElementById('bm-arfolyam').value) || 0;
    if (osszeg > 0 && arfolyam > 0) {
        document.getElementById('bm-cel-osszeg').value = (osszeg / arfolyam).toFixed(2);
    }
    _updateBmPreview();
};

function _updateBmPreview() {
    const preview = document.getElementById('bm-preview');
    const text    = document.getElementById('bm-preview-text');
    const osszeg  = parseFloat(document.getElementById('bm-osszeg')?.value) || 0;
    if (osszeg <= 0) { preview.classList.add('d-none'); return; }

    const forrasEl  = document.getElementById('bm-forras');
    const celEl     = document.getElementById('bm-cel');
    const forrasNev = forrasEl?.options[forrasEl.selectedIndex]?.text || '?';
    const celNev    = celEl?.options[celEl.selectedIndex]?.text || '?';

    let msg = `${forrasNev} → ${celNev} : ${osszeg.toFixed(2)} RON`;
    if (_currentBmType === 'valutacsere') {
        const celOsszeg = parseFloat(document.getElementById('bm-cel-osszeg')?.value) || 0;
        const arfolyam  = parseFloat(document.getElementById('bm-arfolyam')?.value) || 0;
        msg = `${osszeg.toFixed(2)} RON → ${celOsszeg.toFixed(2)} EUR (árfolyam: ${arfolyam.toFixed(4)} RON/EUR)`;
    }
    text.textContent = msg;
    preview.classList.remove('d-none');
}

// ── Mentés ────────────────────────────────────────────────────
window.saveBelsomozgas = async function() {
    const datum   = document.getElementById('bm-datum').value;
    const forras  = document.getElementById('bm-forras').value;
    const cel     = document.getElementById('bm-cel').value;
    const osszeg  = parseFloat(document.getElementById('bm-osszeg').value) || 0;
    const megjegyzes = document.getElementById('bm-megjegyzes').value.trim();

    if (!datum)  { alert('Kérem adja meg a dátumot!'); return; }
    if (!forras) { alert('Kérem válassza ki a forrást!'); return; }
    if (!cel)    { alert('Kérem válassza ki a célt!'); return; }
    if (forras === cel) { alert('A forrás és a cél nem lehet ugyanaz!'); return; }
    if (osszeg <= 0) { alert('Az összeg 0-nál nagyobb kell legyen!'); return; }

    let celOsszeg = null;
    let arfolyam  = null;
    if (_currentBmType === 'valutacsere') {
        celOsszeg = parseFloat(document.getElementById('bm-cel-osszeg').value) || 0;
        arfolyam  = parseFloat(document.getElementById('bm-arfolyam').value) || 0;
        if (celOsszeg <= 0) { alert('Kérem adja meg a cél összeget (EUR)!'); return; }
        if (arfolyam <= 0)  { alert('Kérem adja meg az árfolyamot!'); return; }
    }

    const btn = document.getElementById('btn-save-belsomozgas');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Rögzítés...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { error } = await _supabase.from('belsomozgas').insert({
            congregation_id: activeCongregationId,
            datum:           datum,
            tipus:           _currentBmType,
            forras:          forras,
            cel:             cel,
            osszeg:          osszeg,
            cel_osszeg:      celOsszeg,
            arfolyam:        arfolyam,
            megjegyzes:      megjegyzes || null,
            created_by:      user?.id || null
        });
        if (error) throw error;

        bootstrap.Modal.getInstance(document.getElementById('modal-belsomozgas')).hide();

        // Újratöltés
        await window.loadBelsomozgas();
        if (typeof window.renderKasszaTable === 'function') {
            window.renderKasszaTable(document.getElementById('kassza-month-filter')?.value || 'all');
        }
        if (typeof window.loadBankTransactions === 'function') {
            await window.loadBankTransactions();
        }
        if (typeof window.renderDashboardBalances === 'function') {
            window.renderDashboardBalances();
        }

    } catch (err) {
        alert('Hiba a rögzítés során: ' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// ── Kassza egyenlegbe belső mozgások beleszámítása ─────────────
// Hívandó: renderKasszaTable ELŐTT / loadBankTransactions ELŐTT
window.getBmKasszaDelta = function() {
    let delta = 0;
    (window.allBelsomozgas || []).forEach(m => {
        if (m.cel === 'kassza')    delta += Number(m.osszeg);   // bank→kassza: növeli
        if (m.forras === 'kassza') delta -= Number(m.osszeg);   // kassza→bank: csökkenti
    });
    return delta;
};

window.getBmBankDelta = function(bankId) {
    const id = String(bankId);
    let delta = 0;
    (window.allBelsomozgas || []).forEach(m => {
        if (m.cel === id) {
            // Valutacserénél a cel_osszeg az EUR mennyiség
            delta += Number(_currentBmType === 'valutacsere' && m.cel_osszeg ? m.cel_osszeg : m.osszeg);
        }
        if (m.forras === id) delta -= Number(m.osszeg);
    });
    return delta;
};

// ── Belső mozgás sorok generálása a Kassza táblához ───────────
window.getBmKasszaRows = function() {
    return (window.allBelsomozgas || [])
        .filter(m => m.cel === 'kassza' || m.forras === 'kassza')
        .map(m => {
            const isIncome = m.cel === 'kassza';
            const bankId   = isIncome ? m.forras : m.cel;
            const bank     = (window.bankAccounts || []).find(b => String(b.id) === String(bankId));
            const bankNev  = bank ? `${bank.bank_neve} (${bank.valuta})` : 'Bank';
            const label    = isIncome ? `Bank → Kassza (${bankNev})` : `Kassza → Bank (${bankNev})`;
            return {
                datum: m.datum, isIncome, osszeg: m.osszeg, label,
                megjegyzes: m.megjegyzes, isBm: true
            };
        });
};

// ── Belső mozgás sorok generálása a Bank táblához ─────────────
window.getBmBankRows = function(bankId) {
    const id = String(bankId);
    return (window.allBelsomozgas || [])
        .filter(m => m.cel === id || m.forras === id)
        .map(m => {
            const isIncome = m.cel === id;
            let label, osszeg;
            if (m.tipus === 'kassza_bank' || m.tipus === 'bank_kassza') {
                label   = isIncome ? 'Kassza → Bank (befizetés)' : 'Bank → Kassza (felvétel)';
                osszeg  = m.osszeg;
            } else if (m.tipus === 'bank_bank') {
                const otherBankId = isIncome ? m.forras : m.cel;
                const other = (window.bankAccounts || []).find(b => String(b.id) === String(otherBankId));
                const otherNev = other ? other.bank_neve : 'Másik bank';
                label  = isIncome ? `Átutalás érkezett (${otherNev})` : `Átutalás küldve (${otherNev})`;
                osszeg = m.osszeg;
            } else {
                // valutacsere
                label  = isIncome ? `Valutacsere → EUR (${m.arfolyam} RON/EUR)` : `Valutacsere → EUR (${m.arfolyam} RON/EUR)`;
                osszeg = isIncome ? (m.cel_osszeg || m.osszeg) : m.osszeg;
            }
            return {
                datum: m.datum, isIncome, osszeg, label,
                megjegyzes: m.megjegyzes, isBm: true
            };
        });
};
