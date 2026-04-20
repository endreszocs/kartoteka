// ============================================================
// TAGNYILVÁNTARTÁS EXCEL SZINKRONIZÁLÁS
// Supabase Storage alapú, eszközfüggetlen megoldás
// ============================================================

const SYNC_BUCKET = 'szinkronizalt-fajlok';

window.syncTagnyilvantartas = async function() {
    const btn = document.getElementById('btn-sync-excel');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Szinkronizálás...'; }

    try {
        const congId = await getActiveCongIdForSync();
        if (!congId) { alert('Nem sikerült azonosítani az egyházközséget!'); return; }

        // 1. Összes tag lekérdezése
        const { data: members, error: membErr } = await _supabase
            .from('szemely')
            .select(`id, cnp, csaladnev, k_nev, szcs_nev, ferfi, sz_datum, allapot, apjaneve, anyjaneve,
                     foglalkozas, vallas, telefon, email, meghalt, member_status, megjegyzes,
                     adrlocality!c_helysegid(name), adrstreet!c_utcaid(name), c_szam, c_tombhaz, c_lepcsohaz, c_ajto`)
            .eq('congregation_id', congId)
            .eq('isvisible', true)
            .order('csaladnev');

        if (membErr) throw membErr;

        // 2. XLSX fájl összeállítása SheetJS-sel
        const header = [
            'ID', 'Személyi szám (CNP)', 'Családnév', 'Keresztnév', 'Születési név',
            'Nem', 'Születési dátum', 'Állapot', 'Édesapa neve', 'Édesanya neve',
            'Foglalkozás', 'Vallás', 'Telefon', 'E-mail',
            'Elhunyt', 'Tagság státusza', 'Megjegyzés',
            'Helység', 'Utca', 'Házszám', 'Tömbház', 'Lépcsőház', 'Ajtó'
        ];

        const rows = (members || []).map(m => [
            m.id,
            m.cnp || '',
            m.csaladnev || '',
            m.k_nev || '',
            m.szcs_nev || '',
            m.ferfi ? 'Férfi' : 'Nő',
            m.sz_datum || '',
            m.allapot || '',
            m.apjaneve || '',
            m.anyjaneve || '',
            m.foglalkozas || '',
            m.vallas || 'Református',
            m.telefon || '',
            m.email || '',
            m.meghalt ? 'Igen' : 'Nem',
            m.member_status || 'aktív',
            m.megjegyzes || '',
            m.adrlocality?.name || '',
            m.adrstreet?.name || '',
            m.c_szam || '',
            m.c_tombhaz || '',
            m.c_lepcsohaz || '',
            m.c_ajto || ''
        ]);

        const wsData = [header, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Oszlopszélességek
        ws['!cols'] = [
            {wch:6},{wch:16},{wch:16},{wch:14},{wch:14},{wch:8},{wch:14},{wch:12},
            {wch:18},{wch:18},{wch:14},{wch:12},{wch:14},{wch:22},{wch:8},{wch:14},
            {wch:30},{wch:16},{wch:20},{wch:8},{wch:8},{wch:10},{wch:8}
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tagnyilvántartás');

        // Metaadatok lap
        const metaWs = XLSX.utils.aoa_to_sheet([
            ['Szinkronizálás dátuma', new Date().toLocaleString('hu-HU')],
            ['Tagok száma', rows.length],
            ['Egyházközség ID', congId],
            ['Generálta', 'Kartotéka rendszer']
        ]);
        XLSX.utils.book_append_sheet(wb, metaWs, 'Metaadatok');

        // 3. XLSX fájl bájt-tömbként
        const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // 4. Feltöltés Supabase Storage-ba
        const filePath = `${congId}/tagnyilvantartas.xlsx`;
        const { error: uploadErr } = await _supabase.storage
            .from(SYNC_BUCKET)
            .upload(filePath, blob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        if (uploadErr) {
            // Ha a bucket nem létezik, próbáljunk közvetlen letöltéssel
            if (uploadErr.message?.includes('bucket') || uploadErr.statusCode === 404) {
                downloadXlsxDirectly(wb);
                return;
            }
            throw uploadErr;
        }

        // 5. Letöltési link generálása
        const { data: urlData } = _supabase.storage.from(SYNC_BUCKET).getPublicUrl(filePath);

        // 6. Sikeres értesítés
        showSyncSuccess(rows.length, urlData?.publicUrl);

    } catch (err) {
        console.error('Szinkronizálás hiba:', err);
        alert('Hiba a szinkronizálás során:\n' + err.message + '\n\nKözvetlen letöltés indul...');
        // Fallback: közvetlen letöltés
        try { await syncTagnyilvantartas_fallback(); } catch(e) {}
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh me-1"></i>Excel Szinkronizálás'; }
    }
};

// Közvetlen letöltés (ha Supabase Storage nem elérhető)
function downloadXlsxDirectly(wb) {
    XLSX.writeFile(wb, 'tagnyilvantartas.xlsx');
    alert('A Supabase Storage nem érhető el (valószínűleg nincs létrehozva a bucket).\n\nA fájl közvetlenül letöltve a böngészőből.');
}

function showSyncSuccess(count, downloadUrl) {
    const container = document.getElementById('sync-success-alert');
    if (container) {
        container.style.display = '';
        container.innerHTML = `
            <div class="alert alert-success d-flex align-items-center justify-content-between">
                <div>
                    <i class="ti ti-check me-2"></i>
                    <strong>Szinkronizálás sikeres!</strong> ${count} tag exportálva.
                    <span class="text-muted ms-2 small">${new Date().toLocaleString('hu-HU')}</span>
                </div>
                ${downloadUrl ? `<a href="${downloadUrl}" target="_blank" class="btn btn-sm btn-success ms-3">
                    <i class="ti ti-download me-1"></i>Letöltés
                </a>` : ''}
            </div>`;
        setTimeout(() => { container.style.display = 'none'; }, 10000);
    }
}

async function getActiveCongIdForSync() {
    if (window.activeCongregationId) return window.activeCongregationId;
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
    return profile?.congregation_id || null;
}
