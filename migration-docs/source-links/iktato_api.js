// ========================================
// IKTATÓ API — Iratkezelés
// ========================================

var currentDirection = 'all';
var currentIktatoYear = new Date().getFullYear();
var iktatoSearchQuery = '';

// ── MODAL MEGNYITÁS ──────────────────────────────

function openIktatoModal(existingRecord) {
    var rec = existingRecord || null;

    document.getElementById('ikt-id').value = rec ? rec.id : '';
    document.getElementById('ikt-direction').value = rec ? rec.direction : 'incoming';
    document.getElementById('ikt-kelt').value = rec ? (rec.kelt || '') : new Date().toISOString().split('T')[0];
    document.getElementById('ikt-file-folder').value = rec ? (rec.file_folder || 'F.Á.') : 'F.Á.';
    document.getElementById('ikt-subject').value = rec ? (rec.subject || '') : '';
    document.getElementById('ikt-targykivonat').value = rec ? (rec.targykivonat || '') : '';
    document.getElementById('ikt-sender').value = rec ? (rec.sender_or_recipient || '') : '';
    document.getElementById('ikt-elintezes-ideje').value = rec ? (rec.elintezes_ideje || '') : '';
    document.getElementById('ikt-elintezes-modja').value = rec ? (rec.elintezes_modja || '') : '';
    document.getElementById('ikt-irattarijel').value = rec ? (rec.irattarijel || '') : '';
    document.getElementById('ikt-megjegyzes').value = rec ? (rec.megjegyzes || '') : '';

    // Küldő/Címzett label
    var label = document.getElementById('ikt-sender-label');
    if (label) label.textContent = (rec && rec.direction === 'outgoing') ? 'Címzett *' : 'Küldő / Feladó *';

    // Cím
    var title = document.getElementById('iktato-modal-title');
    if (title) title.innerHTML = rec
        ? '<i class="ti ti-pencil me-2"></i>Iktatás szerkesztése (' + rec.year + '/' + rec.sequence_number + ')'
        : '<i class="ti ti-inbox me-2"></i>Új Iktatás';

    // Törlés gomb
    var delBtn = document.getElementById('ikt-delete-btn');
    if (delBtn) {
        if (rec) { delBtn.classList.remove('d-none'); } else { delBtn.classList.add('d-none'); }
    }

    var modal = new bootstrap.Modal(document.getElementById('modal-iktato'));
    modal.show();
}

// ── MENTÉS ────────────────────────────────────────

async function handleIktatoSubmit(event) {
    event.preventDefault();
    var id = document.getElementById('ikt-id').value;
    var year = currentIktatoYear;

    var payload = {
        direction:           document.getElementById('ikt-direction').value,
        kelt:                document.getElementById('ikt-kelt').value || null,
        file_folder:         document.getElementById('ikt-file-folder').value,
        subject:             document.getElementById('ikt-subject').value.trim(),
        targykivonat:        document.getElementById('ikt-targykivonat').value.trim() || null,
        sender_or_recipient: document.getElementById('ikt-sender').value.trim(),
        elintezes_ideje:     document.getElementById('ikt-elintezes-ideje').value || null,
        elintezes_modja:     document.getElementById('ikt-elintezes-modja').value || null,
        irattarijel:         document.getElementById('ikt-irattarijel').value.trim() || null,
        megjegyzes:          document.getElementById('ikt-megjegyzes').value.trim() || null,
        year:                year
    };

    var error;
    if (id) {
        var res = await _supabase.from('iktato').update(payload).eq('id', id);
        error = res.error;
    } else {
        // Következő sorszám az adott évre
        var lastRes = await _supabase.from('iktato').select('sequence_number')
            .eq('year', year).eq('deleted', false)
            .order('sequence_number', { ascending: false }).limit(1);
        payload.sequence_number = (lastRes.data && lastRes.data.length > 0) ? lastRes.data[0].sequence_number + 1 : 1;
        var insRes = await _supabase.from('iktato').insert(payload);
        error = insRes.error;
    }

    if (error) {
        alert('Hiba történt a mentés során: ' + error.message);
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('modal-iktato'))?.hide();
    loadIktato(currentDirection);
}

// ── TÖRLÉS (soft) ─────────────────────────────────

async function deleteIktato() {
    var id = document.getElementById('ikt-id').value;
    if (!id) return;
    if (!confirm('Biztosan törli ezt az iktatást?')) return;

    var res = await _supabase.from('iktato').update({ deleted: true }).eq('id', id);
    if (res.error) {
        alert('Hiba: ' + res.error.message);
        return;
    }
    bootstrap.Modal.getInstance(document.getElementById('modal-iktato'))?.hide();
    loadIktato(currentDirection);
}

// ── BETÖLTÉS + MEGJELENÍTÉS ───────────────────────

async function loadIktato(dir) {
    if (dir !== undefined) currentDirection = dir;
    var bundle = document.getElementById('filter-bundle') ? document.getElementById('filter-bundle').value : '';
    var yearSel = document.getElementById('iktato-year-select');
    if (yearSel) currentIktatoYear = parseInt(yearSel.value) || new Date().getFullYear();

    var query = _supabase.from('iktato').select('*')
        .eq('year', currentIktatoYear)
        .or('deleted.eq.false,deleted.is.null')
        .order('sequence_number', { ascending: false });

    if (currentDirection !== 'all') query = query.eq('direction', currentDirection);
    if (bundle) query = query.eq('file_folder', bundle);

    var result = await query;
    var data = result.data || [];

    // Keresés szűrés (kliens oldali)
    if (iktatoSearchQuery) {
        var q = iktatoSearchQuery.toLowerCase();
        data = data.filter(function(i) {
            return (i.subject || '').toLowerCase().indexOf(q) >= 0
                || (i.sender_or_recipient || '').toLowerCase().indexOf(q) >= 0
                || (i.targykivonat || '').toLowerCase().indexOf(q) >= 0
                || (i.irattarijel || '').toLowerCase().indexOf(q) >= 0
                || (i.megjegyzes || '').toLowerCase().indexOf(q) >= 0
                || (String(i.sequence_number)).indexOf(q) >= 0;
        });
    }

    // Statisztika frissítés
    _updateIktatoStats(data);

    // Tábla renderelés
    var tbody = document.getElementById('iktato-tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="ti ti-folder-off me-2"></i>Nincs iktatott irat ebben az évben.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(function(i) {
        var dirIcon = i.direction === 'incoming'
            ? '<i class="ti ti-mail-forward text-blue" title="Bejövő"></i>'
            : '<i class="ti ti-mail-share text-green" title="Kimenő"></i>';

        var keltStr = i.kelt ? new Date(i.kelt + 'T00:00:00').toLocaleDateString('hu-HU') : '-';

        var statusBadge = '';
        if (i.elintezes_ideje) {
            statusBadge = '<span class="badge bg-green-lt text-green"><i class="ti ti-check me-1"></i>Elintézve</span>';
        } else {
            statusBadge = '<span class="badge bg-yellow-lt text-yellow"><i class="ti ti-clock me-1"></i>Folyamatban</span>';
        }

        var bundleClass = 'bg-secondary-lt';
        if (i.file_folder === 'É.Á.') bundleClass = 'bg-purple-lt text-purple';
        else if (i.file_folder === 'A.K.') bundleClass = 'bg-blue-lt text-blue';

        var kivonatHtml = i.targykivonat
            ? '<div class="text-muted small mt-1" style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _escHtml(i.targykivonat) + '">' + _escHtml(i.targykivonat) + '</div>'
            : '';

        var megjegyzesHtml = i.megjegyzes
            ? '<i class="ti ti-message text-muted ms-1" title="' + _escHtml(i.megjegyzes) + '"></i>'
            : '';

        return '<tr style="cursor:pointer;" onclick=\'openIktatoModal(' + JSON.stringify(i).replace(/'/g, "\\'") + ')\'>'
            + '<td class="fw-bold text-nowrap">' + dirIcon + ' ' + i.year + '/' + i.sequence_number + '</td>'
            + '<td class="text-nowrap">' + keltStr + '</td>'
            + '<td>'
                + '<div class="fw-medium">' + _escHtml(i.subject) + megjegyzesHtml + '</div>'
                + kivonatHtml
            + '</td>'
            + '<td>' + _escHtml(i.sender_or_recipient || '-') + '</td>'
            + '<td><span class="badge ' + bundleClass + '">' + (i.file_folder || '-') + '</span></td>'
            + '<td>' + statusBadge + '</td>'
            + '<td class="text-muted small">' + (i.irattarijel || '') + '</td>'
            + '</tr>';
    }).join('');
}

// ── STATISZTIKA ───────────────────────────────────

function _updateIktatoStats(data) {
    var totalEl = document.getElementById('iktato-stat-total');
    var inEl = document.getElementById('iktato-stat-incoming');
    var outEl = document.getElementById('iktato-stat-outgoing');
    var pendingEl = document.getElementById('iktato-stat-pending');
    if (!totalEl) return;

    var incoming = 0, outgoing = 0, pending = 0;
    data.forEach(function(i) {
        if (i.direction === 'incoming') incoming++;
        else outgoing++;
        if (!i.elintezes_ideje) pending++;
    });

    totalEl.textContent = data.length;
    if (inEl) inEl.textContent = incoming;
    if (outEl) outEl.textContent = outgoing;
    if (pendingEl) pendingEl.textContent = pending;
}

// ── KERESÉS ───────────────────────────────────────

function iktatoSearch(val) {
    iktatoSearchQuery = (val || '').trim();
    loadIktato();
}

// ── NYOMTATÁS ─────────────────────────────────────

function printIktatokonyv() {
    var yearSel = document.getElementById('iktato-year-select');
    var year = yearSel ? yearSel.value : new Date().getFullYear();

    var rows = document.getElementById('iktato-tbody');
    if (!rows) return;

    var printHtml = '<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">'
        + '<title>Iktatókönyv ' + year + '</title>'
        + '<style>'
        + 'body{font-family:"Times New Roman",serif;font-size:11pt;margin:20mm;}'
        + 'h1{text-align:center;font-size:16pt;margin-bottom:5mm;}'
        + 'table{width:100%;border-collapse:collapse;}'
        + 'th,td{border:1px solid #000;padding:4px 6px;text-align:left;font-size:10pt;}'
        + 'th{background:#eee;font-weight:bold;}'
        + '.text-center{text-align:center;}'
        + '@page{size:A4 landscape;margin:15mm;}'
        + '</style></head><body>'
        + '<h1>IKTATÓKÖNYV — ' + year + '. év</h1>'
        + '<table><thead><tr>'
        + '<th class="text-center" style="width:60px;">Sorszám</th>'
        + '<th style="width:85px;">Kelt</th>'
        + '<th>Tárgy / Tárgykivonat</th>'
        + '<th>Küldő / Címzett</th>'
        + '<th style="width:50px;">Csomó</th>'
        + '<th style="width:85px;">Elintézés</th>'
        + '<th style="width:80px;">Módja</th>'
        + '<th style="width:70px;">Irattári jel</th>'
        + '<th>Megjegyzés</th>'
        + '</tr></thead><tbody>';

    // Adatok újra lekérése szinkronban a DOM-ból nem praktikus, ezért az iktato-tbody-t parsoljuk
    // Egyszerűbb: új lekérés
    _supabase.from('iktato').select('*')
        .eq('year', parseInt(year))
        .or('deleted.eq.false,deleted.is.null')
        .order('sequence_number', { ascending: true })
        .then(function(result) {
            var data = result.data || [];
            data.forEach(function(i) {
                var keltStr = i.kelt ? new Date(i.kelt + 'T00:00:00').toLocaleDateString('hu-HU') : '';
                var elintStr = i.elintezes_ideje ? new Date(i.elintezes_ideje + 'T00:00:00').toLocaleDateString('hu-HU') : '';
                printHtml += '<tr>'
                    + '<td class="text-center">' + i.sequence_number + '</td>'
                    + '<td>' + keltStr + '</td>'
                    + '<td>' + _escHtml(i.subject || '') + (i.targykivonat ? '<br><em>' + _escHtml(i.targykivonat) + '</em>' : '') + '</td>'
                    + '<td>' + _escHtml(i.sender_or_recipient || '') + '</td>'
                    + '<td class="text-center">' + (i.file_folder || '') + '</td>'
                    + '<td>' + elintStr + '</td>'
                    + '<td>' + _escHtml(i.elintezes_modja || '') + '</td>'
                    + '<td>' + _escHtml(i.irattarijel || '') + '</td>'
                    + '<td>' + _escHtml(i.megjegyzes || '') + '</td>'
                    + '</tr>';
            });

            printHtml += '</tbody></table></body></html>';
            var printWin = window.open('', '_blank');
            printWin.document.write(printHtml);
            printWin.document.close();
            printWin.print();
        });
}

// ── ÉV INICIALIZÁLÁS ─────────────────────────────

function _initIktatoYearSelect() {
    var sel = document.getElementById('iktato-year-select');
    if (!sel) return;
    var thisYear = new Date().getFullYear();
    var html = '';
    for (var y = thisYear; y >= thisYear - 10; y--) {
        html += '<option value="' + y + '"' + (y === thisYear ? ' selected' : '') + '>' + y + '</option>';
    }
    sel.innerHTML = html;
}

// ── SEGÉD ─────────────────────────────────────────

function _escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── DOKUMENTUM GENERÁLÁS (SABLON) ─────────────────

async function generateBaptismCert(memberId) {
    var memberRes = await _supabase.from('szemely').select('*, adrlocality(name)').eq('id', memberId).single();
    var m = memberRes.data;
    var kRes = await _supabase.from('keresztseg').select('*').eq('id_szemely', memberId).single();
    var k = kRes.data;

    var church = document.getElementById('header-congregation-name').innerText;
    var pastor = document.getElementById('header-pastor-name').innerText;

    var template = '<div style="padding:50px;font-family:\'Times New Roman\';line-height:1.6;">'
        + '<div style="text-align:left;">Szám: ' + new Date().getFullYear() + '/_____</div>'
        + '<div style="text-align:center;font-weight:bold;font-size:1.2rem;margin-top:20px;">'
        + 'Tárgy: Keresztelési igazolás</div>'
        + '<p style="margin-top:40px;text-indent:50px;">'
        + 'A <b>' + church + '</b> Lelkipásztori Hivatala igazolja, hogy '
        + '<b>' + m.csaladnev + ' ' + m.k_nev + '</b>, ' + m.apjaneve + ' és ' + m.anyjaneve
        + ' református szülők gyermeke ' + m.sz_datum + '-án született, a keresztség sákramentumában részesült '
        + (k ? k.datum : '________') + '-én, konfirmált ___________-án.</p>'
        + '<p style="text-indent:50px;">' + m.csaladnev + ' ' + m.k_nev
        + ' egyházközségünk nyilvántartott tagja, jelen bizonyítványt az ő személyes kérésére állítottuk ki.</p>'
        + '<div style="margin-top:60px;display:flex;justify-content:space-between;">'
        + '<div>' + (m.adrlocality ? m.adrlocality.name : '') + ', ' + new Date().toLocaleDateString() + '</div>'
        + '<div style="text-align:center;">Isten áldásával,<br><br><br>_______________________<br>'
        + pastor + ' lelkipásztor</div></div></div>';

    var printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Igazolás</title></head><body>' + template + '</body></html>');
    printWindow.document.close();
    printWindow.print();
}
