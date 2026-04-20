// ============================================================================
// PÁROSÍTATLAN BEFIZETÉSEK AUDIT RENDSZER
// ============================================================================

// Kívülre kattintásra bezárja az összes nyitott találati listát
document.addEventListener('click', function(e) {
    if (!e.target.closest('[id^="link-results-"]') && !e.target.closest('.link-search-input')) {
        _closeAllLinkResults();
    }
});

// --- FORRÁS SZÉTBONTÁSA: "Kovács István - Fő út 12" → { namePart, streetPart }
// A forrasa mező formátuma: "Teljes Név - Utca Házszám"
function _splitForrasaNameStreet(forrasa) {
    if (!forrasa) return { namePart: '', streetPart: '' };
    // Csak az ELSŐ " - " mentén bontunk (a névben is lehet kötőjel)
    const sepIdx = forrasa.indexOf(' - ');
    if (sepIdx === -1) return { namePart: forrasa.trim(), streetPart: '' };
    return {
        namePart:   forrasa.slice(0, sepIdx).trim(),
        streetPart: forrasa.slice(sepIdx + 3).trim()
    };
}

// --- NÉVFELISMERŐ: Magyar asszonynév elemzése ---
// Visszaad: { searchTerms[], husbandFamily, wifeFirst, maidenFull, hint }
function _parseHungarianWomensName(namePart) {
    if (!namePart) return null;
    const clean = namePart.replace(/^Özv\.\s*/i, '').trim();
    const words = clean.split(/\s+/);
    const neIdx = words.findIndex(function(w) { return /né$/.test(w); });
    if (neIdx === -1) return null;

    const husbandFamilyName = words[0];
    const afterNe = words.slice(neIdx + 1);

    if (afterNe.length === 0) {
        return { husbandFamily: husbandFamilyName, wifeFirst: '', maidenFull: '',
                 searchTerms: [husbandFamilyName], hint: '(' + husbandFamilyName + ' felesége)' };
    } else if (afterNe.length === 1) {
        // "Kelemen Istvánné Erzsébet" → Kelemen Erzsébet
        const wifeFirst = afterNe[0];
        return { husbandFamily: husbandFamilyName, wifeFirst: wifeFirst, maidenFull: '',
                 searchTerms: [husbandFamilyName + ' ' + wifeFirst, wifeFirst],
                 hint: '\u2192 ' + husbandFamilyName + ' ' + wifeFirst };
    } else {
        // "Becsek László Richárdné Stefán Beáta" → lánykori: Stefán Beáta
        const maidenFull  = afterNe.join(' ');
        const maidenFamily = afterNe[0];
        const maidenFirst  = afterNe[afterNe.length - 1];
        return { husbandFamily: husbandFamilyName, wifeFirst: maidenFirst,
                 maidenFull: maidenFull, maidenFamily: maidenFamily,
                 searchTerms: [maidenFull, husbandFamilyName + ' ' + maidenFirst, maidenFirst],
                 hint: '\u2192 l\u00e1nykori: ' + maidenFull };
    }
}

// --- NÉVPREFIX NORMALIZÁLÁS (ifj., id., dr., özv.) ---
// Levágja a magyar névprefixeket összehasonlítás előtt,
// hogy "ifj. Kovács István" és "Kovács István" egyformán találjon.
function _normalizeName(name) {
    return (name || '').toLowerCase()
        .replace(/^(ifj\.|ifj\s+|id\.|id\s+|dr\.|dr\s+|özv\.|özv\s+)+/i, '')
        .trim();
}

// --- INTELLIGENS SZEMÉLY-KERESŐ ---
// Minden lehetséges névvariációt kipróbál, pontszámmal rangsorolja.
// Ha csak 1 egyedi magas-pontszámú találat → auto-kijelölhető.
function _findPersonCandidates(namePart, streetPart) {
    const members  = window.allChurchMembers || [];
    const streetQ  = streetPart.toLowerCase().trim();
    // Az utca névpart (házszám nélkül): "Gyár 109" → "gyár"
    const streetName = streetQ.split(/\s+/)[0];

    const clean    = namePart.replace(/^Özv\.\s*/i, '').trim();
    const parsed   = _parseHungarianWomensName(namePart);

    // Keresési stratégiák: [ { q: string, weight: number } ]
    // Magasabb weight = biztosabb egyezés
    var strategies = [];

    if (parsed) {
        // --- ASSZONYNÉV STRATÉGIÁK ---
        if (parsed.maidenFull) {
            // Lánykori teljes név (pl. "Stefán Beáta")
            strategies.push({ q: parsed.maidenFull.toLowerCase(), w: 5 });
            // Lánykori vezetéknév + férj vezetékneve nem garantált, de próbáljuk
            strategies.push({ q: parsed.maidenFamily.toLowerCase() + ' ' + parsed.wifeFirst.toLowerCase(), w: 4 });
        }
        // Férj neve + feleség keresztneve (ha a nyilvántartásban a férj névvel szerepel)
        if (parsed.husbandFamily && parsed.wifeFirst) {
            strategies.push({ q: parsed.husbandFamily.toLowerCase() + ' ' + parsed.wifeFirst.toLowerCase(), w: 4 });
        }
        // Csak a keresztnév (alacsony súly, csak utcával kombinálva biztonságos)
        if (parsed.wifeFirst) {
            strategies.push({ q: parsed.wifeFirst.toLowerCase(), w: 1 });
        }
    } else {
        // --- NORMÁL NÉV STRATÉGIÁK ---
        // Normalizált keresés: prefix (ifj., id., dr.) le van vágva
        const cleanQ = _normalizeName(clean);
        strategies.push({ q: cleanQ, w: 5 });  // teljes névegyezés (prefix nélkül)
        // Próbáljuk az összes szóból a leghosszabb prefixet is
        const words = cleanQ.split(/\s+/);
        if (words.length >= 2) {
            strategies.push({ q: words[0] + ' ' + words[words.length-1], w: 3 }); // 1. és utolsó szó
            strategies.push({ q: words[words.length-1], w: 1 });  // csak keresztnév
        }
    }

    // Minden személyt pontozunk
    var scored = {};
    members.forEach(function(m) {
        // Adatbázisból jövő teljes nevet is normalizáljuk (ha az illető ifj./id. prefixszel van bevive)
        const rawFull = ((m.csaladnev||'') + ' ' + (m.k_nev||'')).toLowerCase().trim();
        const full    = _normalizeName(rawFull);
        const street  = (m.adrstreet?.name || '').toLowerCase();

        var bestW = 0;
        strategies.forEach(function(s) {
            if (s.q.length >= 2 && full.includes(s.q)) {
                if (s.w > bestW) bestW = s.w;
            }
        });

        if (bestW > 0) {
            // Utca-bónusz: ha az utca neve illeszkedik, +3 pont
            const streetBonus = (streetName && street.includes(streetName)) ? 3 : 0;
            scored[m.id] = { member: m, score: bestW + streetBonus };
        }
    });

    return Object.values(scored)
        .sort(function(a, b) { return b.score - a.score; })
        .map(function(s) { return { member: s.member, score: s.score }; });
}

// --- IRATSZÁM / NYUGTASZÁM MEGJELENÍTÉS ---
function _getBizDisplay(b) {
    const irat   = String(b.iratszam || '').trim();
    const nyugta = String(b.nyugta   || '').trim();
    const derivedNyugta = irat.length >= 4 ? irat.slice(-3) : '';

    let html = '';
    if (irat)   html += '<div class="small fw-bold text-primary">' + irat + '</div>';
    if (nyugta) {
        html += '<div class="small text-muted">Ny: <strong>' + nyugta + '</strong></div>';
    } else if (derivedNyugta) {
        html += '<div class="small text-warning" title="Auto-levezetett, még nincs mentve">Ny: <em>' + derivedNyugta + '*</em></div>';
    }
    if (!irat && !nyugta) html = '<span class="text-muted">-</span>';
    return html;
}

// --- FIGYELMEZTETÉS A BEVÉTELI LISTÁN ---
function checkUnlinkedPayments(allBev) {
    const unlinked = (allBev || []).filter(function(b) { return !b.id_szemely && !b.id_csalad; });
    const alertEl  = document.getElementById('unlinked-payments-alert');
    if (!alertEl) return;

    if (unlinked.length === 0) { alertEl.classList.add('d-none'); return; }

    const jarulek101 = unlinked.filter(function(b) {
        const kod = window.bevCelMap ? window.bevCelMap[b.id_befizetescel] : null;
        return kod === '101.01';
    });

    alertEl.classList.remove('d-none');
    document.getElementById('unlinked-count-text').innerHTML =
        '<strong>' + unlinked.length + ' befizetés</strong> nincs személyhez rendelve — ezek nem jelennek meg a tagok vagy a családok kartotékáján!';

    const jarulekEl = document.getElementById('unlinked-jarulek-text');
    jarulekEl.innerHTML = jarulek101.length > 0
        ? '<i class="ti ti-alert-circle me-1 text-danger"></i><strong class="text-danger">' + jarulek101.length + ' db egyházfenntartói járulék (101.01)</strong> érintett — ezek nem számítanak bele a fizetési státuszba!'
        : '';

    window._unlinkedPayments = unlinked;
}

// --- MODAL MEGNYITÁSA ---
window.openPaymentLinkModal = async function() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-payment-link'));
    modal.show();

    const tbody = document.getElementById('payment-link-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Betöltés...</td></tr>';
    document.getElementById('link-summary-text').textContent = '';

    try {
        const { data: unlinked } = await _supabase.from('befizetes')
            .select('id, datum, forrasa, osszeg, nyugta, iratszam, fizetettev, id_befizetescel')
            .eq('congregation_id', activeCongregationId)
            .is('id_szemely', null)
            .is('id_csalad', null)
            .eq('deleted', false)
            .order('datum', { ascending: false });

        window._unlinkedPayments = unlinked || [];
        _renderPaymentLinkTable(window._unlinkedPayments);
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-danger text-center py-3">Hiba: ' + e.message + '</td></tr>';
    }
};

// --- TÁBLÁZAT RAJZOLÁSA ---
function _renderPaymentLinkTable(data) {
    const tbody   = document.getElementById('payment-link-tbody');
    const summary = document.getElementById('link-summary-text');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-success py-4"><i class="ti ti-check-circle me-2 fs-2"></i><br>Minden befizetés személyhez van rendelve!</td></tr>';
        summary.textContent = 'Nincs párosítatlan tétel.';
        return;
    }

    summary.textContent = data.length + ' párosítatlan tétel (auto-párosítás folyamatban...)';

    tbody.innerHTML = data.map(function(b) {
        const kod       = window.bevCelMap ? window.bevCelMap[b.id_befizetescel] : '';
        const celNev    = (window.szamadasiCellek || []).find(function(c) { return c.id === kod; })?.nev || kod || '-';
        const isJarulek = kod === '101.01';
        const irat      = String(b.iratszam || '').trim();
        const nyugta    = String(b.nyugta   || '').trim();
        const derivedNyugta = irat.length >= 4 ? irat.slice(-3) : '';

        const { namePart, streetPart } = _splitForrasaNameStreet(b.forrasa);
        const parsed      = _parseHungarianWomensName(namePart);
        const suggestHint = parsed
            ? '<div class="small text-info mt-1"><i class="ti ti-sparkles me-1"></i>' + parsed.hint + '</div>'
            : '';

        const payIdStr = String(b.id);
        return '<tr id="link-row-' + payIdStr + '"'
            + ' data-forrasa="' + (b.forrasa||'').toLowerCase().replace(/"/g,'') + '"'
            + ' data-irat="' + irat.toLowerCase() + '"'
            + ' data-nyugta="' + nyugta.toLowerCase() + '"'
            + ' data-derived="' + derivedNyugta + '"'
            + ' data-kod="' + kod + '"'
            + ' data-namepart="' + namePart.replace(/"/g,'') + '"'
            + ' data-streetpart="' + streetPart.replace(/"/g,'') + '">'
            + '<td class="small">' + (b.datum ? b.datum.split('T')[0] : '-') + '<br><small class="text-muted">' + (b.fizetettev||'') + '</small></td>'
            + '<td class="small">' + _getBizDisplay(b) + '</td>'
            + '<td><div class="fw-bold">' + (b.forrasa || '<span class="text-muted fst-italic">Nincs név</span>') + '</div>' + suggestHint + '</td>'
            + '<td class="small ' + (isJarulek ? 'text-danger fw-bold' : 'text-muted') + '">' + celNev + '</td>'
            + '<td class="text-end fw-bold text-success small">' + Number(b.osszeg||0).toLocaleString('hu-HU',{minimumFractionDigits:2}) + ' RON</td>'
            + '<td><div class="position-relative">'
            + '<input type="text" class="form-control form-control-sm link-search-input" id="link-input-' + payIdStr + '"'
            + ' value="" placeholder="Keresés..." autocomplete="off"'
            + ' data-pay-id="' + payIdStr + '"'
            + ' oninput="searchPersonForLink(this, this.dataset.payId)"'
            + ' data-selected-id="" data-selected-name="">'
            + '<div class="list-group shadow position-absolute w-100 d-none" id="link-results-' + payIdStr + '" style="z-index:9999;top:100%;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #dee2e6;border-radius:4px;"></div>'
            + '</div>'
            + '<div id="link-auto-badge-' + payIdStr + '" class="d-none mt-1 small text-success"><i class="ti ti-robot me-1"></i><span id="link-auto-text-' + payIdStr + '"></span></div>'
            + '</td>'
            + '<td><button class="btn btn-sm btn-success d-none" id="link-save-' + payIdStr + '" data-pay-id="' + payIdStr + '" onclick="saveOnePaymentLink(this.dataset.payId)" title="Mentés"><i class="ti ti-check"></i></button></td>'
            + '</tr>';
    }).join('');

    // Auto-párosítás minden sorhoz
    var autoCount = 0;
    data.forEach(function(b) {
        const row = document.getElementById('link-row-' + b.id);
        if (!row) return;
        const namePart   = row.dataset.namepart   || '';
        const streetPart = row.dataset.streetpart || '';
        if (!namePart) return;

        const candidates = _findPersonCandidates(namePart, streetPart);
        if (candidates.length === 0) return;

        const top = candidates[0];

        // Auto-kijelölés feltétele: az első találat pontszáma legalább 4
        // ÉS a második találat (ha van) legalább 2 ponttal el van maradva
        const secondScore = candidates.length > 1 ? candidates[1].score : 0;
        const isConfident = top.score >= 4 && (top.score - secondScore) >= 2;

        const topName = ((top.member.csaladnev||'') + ' ' + (top.member.k_nev||'')).trim();

        if (isConfident) {
            // Automatikus kijelölés — zöld pipa megjelenik
            selectPersonForLink(b.id, top.member.id, topName);
            const badge = document.getElementById('link-auto-badge-' + b.id);
            const text  = document.getElementById('link-auto-text-' + b.id);
            if (badge) badge.classList.remove('d-none');
            if (text)  text.textContent = 'Auto: ' + topName;
            autoCount++;
        } else {
            // Több lehetséges egyezés — megmutatjuk a listát, a lelkész választ
            const input = document.getElementById('link-input-' + b.id);
            if (input) {
                input.value = topName;
                _showCandidateList(b.id, candidates.slice(0, 5));
            }
        }
    });

    var remaining = data.length - autoCount;
    summary.textContent = data.length + ' párosítatlan tétel — '
        + autoCount + ' auto-párosítva, '
        + remaining + ' kézi ellenőrzés szükséges';
}

// Minden nyitott találati lista bezárása
function _closeAllLinkResults(exceptPayId) {
    document.querySelectorAll('[id^="link-results-"]').forEach(function(el) {
        if (exceptPayId && el.id === 'link-results-' + exceptPayId) return;
        el.classList.add('d-none');
        el.innerHTML = '';
    });
}

// Jelöltek listájának megjelenítése (több egyező személy esetén)
function _showCandidateList(payId, candidates) {
    _closeAllLinkResults(payId);
    const results = document.getElementById('link-results-' + payId);
    if (!results) return;
    const today = new Date();
    results.innerHTML = candidates.map(function(c) {
        const m = c.member;
        const name = ((m.csaladnev||'') + ' ' + (m.k_nev||'')).trim();
        var ageStr = '';
        if (m.sz_datum) {
            const birth = new Date(m.sz_datum);
            const age = today.getFullYear() - birth.getFullYear()
                - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
            ageStr = age + ' éves';
        }
        const locality = m.adrlocality?.name || '';
        const street   = m.adrstreet?.name   || '';
        const houseNum = m.c_szam            || '';
        const addr = [locality, street, houseNum].filter(Boolean).join(', ');
        const scoreBadge = '<span class="badge bg-blue-lt text-blue ms-1" title="Egyezési pontszám">' + c.score + 'p</span>';
        return '<button type="button" class="list-group-item list-group-item-action py-2 small" style="background:#fff;"'
            + ' data-pay-id="' + payId + '" data-person-id="' + m.id + '" data-person-name="' + name.replace(/"/g,'&quot;') + '"'
            + ' onclick="selectPersonForLink(this.dataset.payId, this.dataset.personId, this.dataset.personName)">'
            + '<div class="d-flex justify-content-between align-items-center">'
            + '<span class="fw-bold text-primary">' + name + '</span>'
            + '<span>' + (ageStr ? '<span class="badge bg-secondary-lt text-dark me-1">' + ageStr + '</span>' : '') + scoreBadge + '</span>'
            + '</div>'
            + (addr ? '<div class="text-muted mt-1"><i class="ti ti-map-pin me-1"></i>' + addr + '</div>' : '')
            + '</button>';
    }).join('');
    results.classList.remove('d-none');
}

// --- SZŰRÉS ---
window.filterPaymentLinkTable = function() {
    const filterText = (document.getElementById('link-filter-input')?.value || '').toLowerCase();
    const filterBiz  = (document.getElementById('link-filter-biz')?.value  || '').toLowerCase();
    const filterCel  =  document.getElementById('link-filter-cel')?.value  || '';

    document.querySelectorAll('#payment-link-tbody tr[id^="link-row-"]').forEach(function(row) {
        const textMatch = !filterText || (row.dataset.forrasa||'').includes(filterText);
        const celMatch  = !filterCel  ||  row.dataset.kod === filterCel;
        const bizMatch  = !filterBiz  || (row.dataset.irat||'').includes(filterBiz)
                                      || (row.dataset.nyugta||'').includes(filterBiz)
                                      || (row.dataset.derived||'').includes(filterBiz);
        row.style.display = (textMatch && celMatch && bizMatch) ? '' : 'none';
    });
};

// --- SZEMÉLYKERESÉS (kézi gépelésre, életkor + cím + pontszám) ---
window.searchPersonForLink = function(input, payId) {
    const raw     = input.value.trim();
    const results = document.getElementById('link-results-' + payId);
    const saveBtn = document.getElementById('link-save-' + payId);
    input.dataset.selectedId = '';
    if (saveBtn) saveBtn.classList.add('d-none');
    _closeAllLinkResults(payId);
    if (raw.length < 2) { results.classList.add('d-none'); results.innerHTML = ''; return; }

    // " - " elválasztó esetén szétbontjuk névre és utcára
    const dashIdx  = raw.indexOf(' - ');
    const nameQ    = (dashIdx !== -1 ? raw.slice(0, dashIdx) : raw).trim();
    const streetQ  = (dashIdx !== -1 ? raw.slice(dashIdx + 3) : '').trim();

    const candidates = _findPersonCandidates(nameQ, streetQ);

    if (candidates.length === 0) {
        results.innerHTML = '<div class="list-group-item text-muted small py-2">Nincs találat</div>';
        results.classList.remove('d-none');
        return;
    }

    _showCandidateList(payId, candidates.slice(0, 10));
};

// --- SZEMÉLY KIVÁLASZTÁSA ---
window.selectPersonForLink = function(payId, personId, personName) {
    const input   = document.getElementById('link-input-' + payId);
    const results = document.getElementById('link-results-' + payId);
    const saveBtn = document.getElementById('link-save-' + payId);
    if (input)   { input.value = personName; input.dataset.selectedId = personId; }
    if (results) { results.classList.add('d-none'); results.innerHTML = ''; }
    if (saveBtn) saveBtn.classList.remove('d-none');
};

// --- EGY TÉTEL MENTÉSE ---
window.saveOnePaymentLink = async function(payId) {
    payId = String(payId);
    const input    = document.getElementById('link-input-' + payId);
    if (!input) { console.error('saveOnePaymentLink: input not found, payId=' + payId); return; }
    const personId = parseInt(input.dataset.selectedId);
    if (!personId || isNaN(personId)) {
        alert('Kérlek előbb válassz személyt a keresőből!');
        return;
    }

    const btn = document.getElementById('link-save-' + payId);
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

    try {
        const { error } = await _supabase.from('befizetes').update({ id_szemely: personId }).eq('id', payId);
        if (error) throw error;
        document.getElementById('link-row-' + payId)?.remove();
        window._unlinkedPayments = (window._unlinkedPayments||[]).filter(function(b) { return String(b.id) !== payId; });
        const summaryEl = document.getElementById('link-summary-text');
        if (summaryEl) summaryEl.textContent = window._unlinkedPayments.length + ' párosítatlan tétel maradt';
        if (typeof loadTranzakciok === 'function') loadTranzakciok();
    } catch(e) {
        if (btn) { btn.innerHTML = '<i class="ti ti-check"></i>'; btn.disabled = false; }
        alert('Hiba a mentésnél: ' + e.message);
    }
};

// --- ÖSSZES MENTÉSE ---
window.saveAllPaymentLinks = async function() {
    const inputs  = document.querySelectorAll('#payment-link-tbody .link-search-input');
    const toSave  = [];
    inputs.forEach(function(inp) {
        const row = inp.closest('tr');
        if (row && row.style.display === 'none') return;
        const payId    = inp.dataset.payId || inp.id.replace('link-input-', '');
        const personId = parseInt(inp.dataset.selectedId);
        if (payId && personId && !isNaN(personId)) toSave.push({ payId: payId, personId: personId });
    });

    if (toSave.length === 0) { alert('Nincs kiválasztott személy egyetlen (látható) tételnél sem!'); return; }
    if (!confirm(toSave.length + ' párosítást ment el?')) return;

    let ok = 0, err = 0;
    for (const item of toSave) {
        const { error } = await _supabase.from('befizetes').update({ id_szemely: item.personId }).eq('id', item.payId);
        if (error) err++; else ok++;
    }
    alert('Mentés kész!\n\u2705 ' + ok + ' sikeres' + (err > 0 ? '\n\u274C ' + err + ' sikertelen' : ''));
    if (typeof loadTranzakciok === 'function') await loadTranzakciok();
    window.openPaymentLinkModal();
};

// --- NYUGTASZÁM AUTO-KITÖLTÉS ---
window.normalizeReceiptNumbers = async function() {
    const { data: toFix } = await _supabase.from('befizetes')
        .select('id, iratszam, nyugta')
        .eq('congregation_id', activeCongregationId)
        .not('iratszam', 'is', null)
        .eq('deleted', false);

    const fixable = (toFix || []).filter(function(b) {
        const irat   = String(b.iratszam || '').trim();
        const nyugta = String(b.nyugta   || '').trim();
        return irat.length >= 4 && !nyugta;
    });

    if (fixable.length === 0) {
        alert('Nincs kitöltendő nyugtaszám — minden tétel rendben!');
        return;
    }

    if (!confirm(fixable.length + ' tételnél hiányzik a nyugtaszám.\nAz iratszám utolsó 3 jegyével kitölti őket?\n\nPl. iratszám 115279 \u2192 nyugtaszám 279')) return;

    let ok = 0, err = 0;
    for (const b of fixable) {
        const derivedNyugta = String(b.iratszam).trim().slice(-3);
        const { error } = await _supabase.from('befizetes')
            .update({ nyugta: derivedNyugta })
            .eq('id', b.id);
        if (error) err++; else ok++;
    }
    alert('K\u00e9sz!\n\u2705 ' + ok + ' nyugtasz\u00e1m kit\u00f6ltve' + (err > 0 ? '\n\u274C ' + err + ' sikertelen' : ''));
    window.openPaymentLinkModal();
};
