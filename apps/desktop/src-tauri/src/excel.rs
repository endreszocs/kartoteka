// Kartotéka Desktop — hivatalos EREK Excel-könyvelés írása/olvasása (E0, 2026-06-11)
//
// A `db_execute` mintájára: a teljes Excel-művelet a Rust-rétegben fut — szűk,
// auditálható felület. A `umya-spreadsheet` (pure Rust) append-eléskor MEGŐRZI a
// többi lap képleteit / definiált neveit / struktúráját (a 3.0 PoC-ban bizonyítva).
//
// FONTOS pénzügyi szabály:
//   - CSAK a D–L oszlopokba írunk (Dátum/Iratszám/Irattíp/Név/Bev.összeg/Bev.kód/
//     Kiad.összeg/Kiad.kód/Megjegyzés). Az M/N (Magyarázat/szám) és minden
//     számolt lap KÉPLET — azokhoz SOHA nem nyúlunk.
//   - Append-only: az utolsó adatsor utáni első ÜRES sorba írunk (a 7. sortól).
//   - Minden írás előtt időbélyeges backup, ideiglenes fájlba írás, majd atomikus
//     átnevezés — egy megszakadt írás nem ronthatja a hivatalos könyvet.
//   - Mentés után `fullCalcOnLoad` patch: az Excel megnyitáskor magától újraszámol.
//
// A `Kassza` (készpénz) és az `A`/`B`/`C`… (bankszámla) lapok oszlop-sémája azonos,
// ezért ugyanaz az append-mechanizmus célozható bármelyik lapra (`sheet` paraméter).

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use umya_spreadsheet::*;

/// Egy Kassza/bank-lap adatsor — a D–L oszlopok. A TS-oldal küldi.
/// A `rows` tömb elemeit a serde közvetlenül olvassa (a Tauri camelCase→snake_case
/// konverzió csak a top-level command-argumentumokra vonatkozik), ezért itt a
/// `rename_all = "camelCase"` adja a TS↔Rust mező-egyezést.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KasszaRow {
    pub datum: String,              // D — Dátum (YYYY-MM-DD)
    pub iratszam: String,           // E — Iratszám
    pub irattip: String,            // F — Irattíp (Chit./Extr/OP/Fact.…)
    pub nev: String,                // G — Név
    pub bev_osszeg: Option<f64>,    // H — Bevétel összeg
    pub bev_kod: Option<String>,    // I — Bevétel kód (szöveges név)
    pub kiad_osszeg: Option<f64>,   // J — Kiadás összeg
    pub kiad_kod: Option<String>,   // K — Kiadás kód (szöveges név)
    pub megjegyzes: String,         // L — Megjegyzés
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendReport {
    /// Hány sort fűztünk hozzá.
    pub appended: usize,
    /// Az első beírt sor indexe (1-alapú Excel-sorszám).
    pub first_row: u32,
    /// A művelet előtti biztonsági másolat útvonala.
    pub backup_path: String,
}

// ───────────────────────────────────────────────────────────────────────────
// Segédfüggvények
// ───────────────────────────────────────────────────────────────────────────

/// Időbélyeges biztonsági másolat a fájlról (`<fájl>.<epoch>.bak`).
fn backup_file(file_path: &str) -> Result<String, String> {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = format!("{file_path}.{epoch}.bak");
    std::fs::copy(file_path, &backup).map_err(|e| format!("Biztonsági másolat hiba: {e}"))?;
    Ok(backup)
}

/// Egy cella nyers (string) értéke — üres, ha nincs.
fn cell_str(sheet: &Worksheet, coord: &str) -> String {
    sheet
        .get_cell(coord)
        .map(|c| c.get_value().to_string())
        .unwrap_or_default()
}

/// Az első ÜRES adatsor a `start` sortól (a D–L oszlopok mind üresek).
/// A B/C/M/N oszlopok előre kitöltött képletek — azokat nem nézzük.
fn find_next_empty_row(sheet: &Worksheet, start: u32) -> u32 {
    let mut r = start;
    loop {
        let mut empty = true;
        for col in ["D", "E", "F", "G", "H", "I", "J", "K", "L"] {
            if !cell_str(sheet, &format!("{col}{r}")).trim().is_empty() {
                empty = false;
                break;
            }
        }
        if empty {
            return r;
        }
        r += 1;
        // Biztonsági korlát — a sablon ~10 000 sornyi képletet tartalmaz.
        if r > 200_000 {
            return r;
        }
    }
}

/// Egy adatsor beírása a D–L oszlopokba (a többi oszlop érintetlen).
fn write_row(sheet: &mut Worksheet, r: u32, row: &KasszaRow) {
    sheet
        .get_cell_mut(&*format!("D{r}"))
        .set_value_string(row.datum.clone());
    sheet
        .get_cell_mut(&*format!("E{r}"))
        .set_value_string(row.iratszam.clone());
    sheet
        .get_cell_mut(&*format!("F{r}"))
        .set_value_string(row.irattip.clone());
    sheet
        .get_cell_mut(&*format!("G{r}"))
        .set_value_string(row.nev.clone());
    if let Some(b) = row.bev_osszeg {
        if b != 0.0 {
            sheet.get_cell_mut(&*format!("H{r}")).set_value_number(b);
        }
    }
    if let Some(ref c) = row.bev_kod {
        if !c.is_empty() {
            sheet
                .get_cell_mut(&*format!("I{r}"))
                .set_value_string(c.clone());
        }
    }
    if let Some(j) = row.kiad_osszeg {
        if j != 0.0 {
            sheet.get_cell_mut(&*format!("J{r}")).set_value_number(j);
        }
    }
    if let Some(ref c) = row.kiad_kod {
        if !c.is_empty() {
            sheet
                .get_cell_mut(&*format!("K{r}"))
                .set_value_string(c.clone());
        }
    }
    sheet
        .get_cell_mut(&*format!("L{r}"))
        .set_value_string(row.megjegyzes.clone());
}

/// `fullCalcOnLoad="1"` beinjektálása a workbook.xml-be (string-szinten).
/// A `<calcPr …/>` elemhez adjuk hozzá; ha nincs, létrehozzuk a `</workbook>` elé.
fn patch_calc_xml(xml: &str) -> String {
    if xml.contains("fullCalcOnLoad") {
        return xml.to_string();
    }
    if let Some(pos) = xml.find("<calcPr") {
        if let Some(rel_gt) = xml[pos..].find('>') {
            let abs_gt = pos + rel_gt;
            // Önzáró `…/>` esetén az attribútumot a `/` elé szúrjuk.
            let insert_at = if xml.as_bytes()[abs_gt - 1] == b'/' {
                abs_gt - 1
            } else {
                abs_gt
            };
            let mut s = String::with_capacity(xml.len() + 24);
            s.push_str(&xml[..insert_at]);
            s.push_str(" fullCalcOnLoad=\"1\" ");
            s.push_str(&xml[insert_at..]);
            return s;
        }
    }
    xml.replace(
        "</workbook>",
        "<calcPr fullCalcOnLoad=\"1\"/></workbook>",
    )
}

/// A `src` xlsx (zip) átmásolása `dst`-be, az `xl/workbook.xml`-t patch-elve.
fn recalc_patch(src: &str, dst: &str) -> Result<(), String> {
    let infile = File::open(src).map_err(|e| format!("Patch olvasási hiba: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(infile).map_err(|e| format!("Zip olvasási hiba: {e}"))?;
    let outfile = File::create(dst).map_err(|e| format!("Patch írási hiba: {e}"))?;
    let mut zw = zip::ZipWriter::new(outfile);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip bejegyzés hiba: {e}"))?;
        let name = entry.name().to_string();
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| format!("Zip bejegyzés olvasás hiba: {e}"))?;
        if name == "xl/workbook.xml" {
            let xml = String::from_utf8_lossy(&bytes).to_string();
            bytes = patch_calc_xml(&xml).into_bytes();
        }
        zw.start_file(name, opts)
            .map_err(|e| format!("Zip írás hiba: {e}"))?;
        zw.write_all(&bytes)
            .map_err(|e| format!("Zip írás hiba: {e}"))?;
    }
    zw.finish().map_err(|e| format!("Zip lezárás hiba: {e}"))?;
    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// Tauri commandok
// ───────────────────────────────────────────────────────────────────────────

/// A munkafüzet lapjainak nevei (a Kassza + A/B/C… bank-lapok felismeréséhez).
#[tauri::command]
pub fn excel_list_sheets(file_path: String) -> Result<Vec<String>, String> {
    let book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;
    Ok(book
        .get_sheet_collection()
        .iter()
        .map(|s| s.get_name().to_string())
        .collect())
}

/// Egy lap metaadata — a bank-mapping (deviza-alapú) automatikus javaslatához.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetMeta {
    pub name: String,
    /// Bankszámla-lap? (egyetlen nagybetűs név: A, B, C…)
    pub is_bank: bool,
    /// A bankszámla devizája (a betű-lap C3 cellájából, pl. „RON"/„EUR") — None, ha üres.
    pub currency: Option<String>,
    /// A következő üres adatsor (1-alapú) — append-céloláshoz.
    pub next_empty_row: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookMeta {
    pub sheets: Vec<SheetMeta>,
}

/// A munkafüzet lapjainak metaadata: melyik bank-lap, milyen devizával, hol a
/// következő üres sor. A bank-mapping (Kartotéka bankszámla ↔ betű-lap)
/// automatikus, deviza-alapú javaslatához. CSAK OLVAS.
#[tauri::command]
pub fn excel_read_meta(file_path: String) -> Result<WorkbookMeta, String> {
    let book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;
    let mut sheets = Vec::new();
    for ws in book.get_sheet_collection() {
        let name = ws.get_name().to_string();
        let is_bank = name.chars().count() == 1
            && name
                .chars()
                .next()
                .map(|c| c.is_ascii_uppercase())
                .unwrap_or(false);
        let currency = if is_bank {
            let c = cell_str(ws, "C3").trim().to_string();
            if c.is_empty() {
                None
            } else {
                Some(c)
            }
        } else {
            None
        };
        let next_empty_row = find_next_empty_row(ws, 7);
        sheets.push(SheetMeta {
            name,
            is_bank,
            currency,
            next_empty_row,
        });
    }
    Ok(WorkbookMeta { sheets })
}

/// Sorok hozzáfűzése a megadott lap (Kassza / A / B …) D–L oszlopaihoz.
///
/// Folyamat: backup → betöltés → első üres sor keresése (a 7. sortól) → sorok
/// beírása → ideiglenes fájlba mentés → `fullCalcOnLoad` patch → atomikus átnevezés.
#[tauri::command]
pub fn excel_append_rows(
    file_path: String,
    sheet: String,
    rows: Vec<KasszaRow>,
) -> Result<AppendReport, String> {
    if rows.is_empty() {
        return Err("Nincs beírandó sor.".to_string());
    }
    if !Path::new(&file_path).exists() {
        return Err(format!("A fájl nem található: {file_path}"));
    }

    // 1. Biztonsági másolat
    let backup_path = backup_file(&file_path)?;

    // 2. Betöltés
    let mut book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;

    // 3. Sorok beírása (csak D–L)
    let first_row;
    {
        let ws = book
            .get_sheet_by_name_mut(&sheet)
            .ok_or_else(|| format!("Nincs '{sheet}' munkalap a fájlban."))?;
        let start = find_next_empty_row(ws, 7);
        first_row = start;
        for (i, row) in rows.iter().enumerate() {
            write_row(ws, start + i as u32, row);
        }
    }

    // 4. Ideiglenes fájlba mentés
    let tmp1 = format!("{file_path}.tmp1");
    writer::xlsx::write(&book, Path::new(&tmp1))
        .map_err(|e| format!("Excel írási hiba: {e}"))?;

    // 5. fullCalcOnLoad patch → tmp2
    let tmp2 = format!("{file_path}.tmp2");
    recalc_patch(&tmp1, &tmp2)?;

    // 6. Atomikus átnevezés (Windows: MoveFileEx REPLACE_EXISTING) + takarítás
    std::fs::rename(&tmp2, &file_path).map_err(|e| format!("Atomikus mentés hiba: {e}"))?;
    let _ = std::fs::remove_file(&tmp1);

    Ok(AppendReport {
        appended: rows.len(),
        first_row,
        backup_path,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// E1.5c — Konkrét cellák kiolvasása (a Koltsegvetes-fejléc állapotához)
// ───────────────────────────────────────────────────────────────────────────

/// Megadott cellák aktuális (nyers szöveges) értéke egy lapról — pl. a
/// `Koltsegvetes!B78/B79` fejléc-cellák állapotának megjelenítéséhez.
/// CSAK OLVAS; a sorrend a kérés sorrendje, hiányzó cella = üres string.
#[tauri::command]
pub fn excel_read_cells(
    file_path: String,
    sheet: String,
    cells: Vec<String>,
) -> Result<Vec<String>, String> {
    let book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;
    let ws = book
        .get_sheet_by_name(&sheet)
        .ok_or_else(|| format!("Nincs '{sheet}' munkalap a fájlban."))?;
    Ok(cells.iter().map(|c| cell_str(ws, c)).collect())
}

// ───────────────────────────────────────────────────────────────────────────
// E4 — Lap-összesítő (egyeztetéshez): adatsorok száma + H/J összegek
// ───────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetSums {
    /// Kitöltött adatsorok száma (a 7. sortól az első üres sorig).
    pub row_count: u32,
    /// A H oszlop (bevétel) összege, 2 tizedesre kerekítve.
    pub bev_sum: f64,
    /// A J oszlop (kiadás) összege, 2 tizedesre kerekítve.
    pub kiad_sum: f64,
}

/// Egy lap adatsorainak összesítése — az E4 egyeztetéshez (DB ↔ Excel).
/// CSAK OLVAS; képletet nem értékel (a nyers H/J értékeket összegzi).
#[tauri::command]
pub fn excel_read_sheet_sums(file_path: String, sheet: String) -> Result<SheetSums, String> {
    let book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;
    let ws = book
        .get_sheet_by_name(&sheet)
        .ok_or_else(|| format!("Nincs '{sheet}' munkalap a fájlban."))?;

    let mut r: u32 = 7;
    let mut row_count: u32 = 0;
    let mut bev_sum: f64 = 0.0;
    let mut kiad_sum: f64 = 0.0;

    loop {
        let empty = ["D", "E", "F", "G", "H", "I", "J", "K", "L"]
            .iter()
            .all(|c| cell_str(ws, &format!("{c}{r}")).trim().is_empty());
        if empty {
            break;
        }
        // A számok ponttal vagy vesszővel is jöhetnek (lokalizált kézi bevitel)
        let h = cell_str(ws, &format!("H{r}")).trim().replace(',', ".");
        let j = cell_str(ws, &format!("J{r}")).trim().replace(',', ".");
        bev_sum += h.parse::<f64>().unwrap_or(0.0);
        kiad_sum += j.parse::<f64>().unwrap_or(0.0);
        row_count += 1;
        r += 1;
        if r > 200_000 {
            break;
        }
    }

    Ok(SheetSums {
        row_count,
        bev_sum: (bev_sum * 100.0).round() / 100.0,
        kiad_sum: (kiad_sum * 100.0).round() / 100.0,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// E1.5b — Bináris fájl mentése lokálisan (pl. a gyülekezeti logó cache-elése)
// ───────────────────────────────────────────────────────────────────────────

/// Egy base64-kódolt bináris tartalom mentése a megadott útvonalra (a szülő
/// mappát létrehozza). A frontend a logót (cimer_url) letölti, base64-be alakítja,
/// és ezzel a commanddal menti lokálisan — „csak letöltés/cache", NEM az Excelbe.
#[tauri::command]
pub fn excel_save_file(dest_path: String, base64_content: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_content.as_bytes())
        .map_err(|e| format!("Base64 dekódolási hiba: {e}"))?;
    if let Some(parent) = Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mappa-létrehozás hiba: {e}"))?;
    }
    std::fs::write(&dest_path, &bytes).map_err(|e| format!("Fájl-írás hiba: {e}"))?;
    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// E1.5 — Auto-konfiguráció: gyülekezeti adatok (egyházmegye) az Excelbe
// ───────────────────────────────────────────────────────────────────────────

/// Egy cella-szerkesztés (lap + cella-hivatkozás + új szöveges érték).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellEdit {
    pub sheet: String,
    /// Cella-hivatkozás, pl. „V3".
    pub cell: String,
    pub value: String,
}

/// Konkrét cellák biztonságos beállítása (pl. `Koltsegvetes!V3` = egyházmegye
/// neve — ettől populálódik a hivatalos 2026-os költségvetési chart).
///
/// A hívó FELELŐSSÉGE, hogy CSAK érték-cellát célozzon (a V3 érték-cella) —
/// képlet-cellát SOHA. Backup → ideiglenes fájl → recalc-patch → atomikus mentés.
#[tauri::command]
pub fn excel_set_cells(file_path: String, edits: Vec<CellEdit>) -> Result<String, String> {
    if edits.is_empty() {
        return Err("Nincs beállítandó cella.".to_string());
    }
    if !Path::new(&file_path).exists() {
        return Err(format!("A fájl nem található: {file_path}"));
    }

    let backup_path = backup_file(&file_path)?;

    let mut book = reader::xlsx::read(Path::new(&file_path))
        .map_err(|e| format!("Excel olvasási hiba: {e}"))?;

    for edit in &edits {
        let ws = book
            .get_sheet_by_name_mut(&edit.sheet)
            .ok_or_else(|| format!("Nincs '{}' munkalap a fájlban.", edit.sheet))?;
        ws.get_cell_mut(&*edit.cell).set_value_string(edit.value.clone());
    }

    let tmp1 = format!("{file_path}.tmp1");
    writer::xlsx::write(&book, Path::new(&tmp1)).map_err(|e| format!("Excel írási hiba: {e}"))?;
    let tmp2 = format!("{file_path}.tmp2");
    recalc_patch(&tmp1, &tmp2)?;
    std::fs::rename(&tmp2, &file_path).map_err(|e| format!("Atomikus mentés hiba: {e}"))?;
    let _ = std::fs::remove_file(&tmp1);

    Ok(backup_path)
}

// ───────────────────────────────────────────────────────────────────────────
// E1 — Könyvelés-mappa kezelése (bundling → másolás → megnyitás)
// ───────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelFolderInfo {
    /// A Könyvelés-mappa teljes útvonala.
    pub folder_path: String,
    /// Az `Adatok_<év>.xlsx` teljes útvonala a mappában (ha megvan).
    pub adatok_path: Option<String>,
    /// Létezik-e a mappa (és benne az Adatok-fájl).
    pub exists: bool,
    /// Most hoztuk-e létre (a becsomagolt sablonból másolva).
    pub created: bool,
}

/// Tartalmaz-e a mappa egy `Adatok_*.xlsx` fájlt?
fn find_adatok_file(folder: &Path) -> Option<PathBuf> {
    let rd = std::fs::read_dir(folder).ok()?;
    for e in rd.flatten() {
        if let Some(name) = e.file_name().to_str() {
            if name.starts_with("Adatok_") && name.ends_with(".xlsx") {
                return Some(e.path());
            }
        }
    }
    None
}

/// A becsomagolt sablon-mappa megkeresése a resource dir-ben (az a mappa, amely
/// `Adatok_*.xlsx`-et tartalmaz). Robusztus a `bundle.resources` pontos
/// útvonal-leképezésére (a fát járjuk be, nem feltételezünk fix mélységet).
fn find_template_dir(root: &Path, depth: usize) -> Option<PathBuf> {
    if depth > 8 {
        return None;
    }
    if find_adatok_file(root).is_some() {
        return Some(root.to_path_buf());
    }
    let rd = std::fs::read_dir(root).ok()?;
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(found) = find_template_dir(&p, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

/// Rekurzív mappa-másolás (a teljes könyvelés-csomag a sablonból a célmappába).
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

/// Az adott évhez tartozó alapértelmezett Könyvelés-mappa:
/// `…\Documents\Kartoteka\Konyveles_<év>_a`.
fn default_folder(app: &tauri::AppHandle, year: u32) -> Result<PathBuf, String> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| format!("A Dokumentumok mappa nem található: {e}"))?;
    Ok(docs
        .join("Kartoteka")
        .join(format!("Konyveles_{year}_a")))
}

/// Az alapértelmezett Könyvelés-mappa útvonala (az adott évre).
#[tauri::command]
pub fn excel_default_folder(app: tauri::AppHandle, year: u32) -> Result<String, String> {
    Ok(default_folder(&app, year)?.to_string_lossy().to_string())
}

/// Egy Könyvelés-mappa állapota (létezik-e + hol az Adatok-fájl) — másolás nélkül.
#[tauri::command]
pub fn excel_folder_info(folder_path: String) -> ExcelFolderInfo {
    let folder = PathBuf::from(&folder_path);
    let adatok = find_adatok_file(&folder);
    ExcelFolderInfo {
        folder_path,
        exists: folder.is_dir() && adatok.is_some(),
        adatok_path: adatok.map(|p| p.to_string_lossy().to_string()),
        created: false,
    }
}

/// A Könyvelés-mappa előkészítése: ha még nincs (vagy üres), a BECSOMAGOLT
/// sablon-csomag teljes tartalmát átmásolja a cél (alapértelmezett vagy megadott)
/// mappába. Idempotens — meglévő mappát nem ír felül.
#[tauri::command]
pub fn excel_setup_folder(
    app: tauri::AppHandle,
    year: u32,
    dest: Option<String>,
) -> Result<ExcelFolderInfo, String> {
    let folder = match dest {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => default_folder(&app, year)?,
    };

    let mut created = false;
    if !folder.is_dir() || find_adatok_file(&folder).is_none() {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("A telepítés resource mappája nem található: {e}"))?;
        let template = find_template_dir(&resource_dir, 0).ok_or_else(|| {
            "A becsomagolt könyvelés-sablon nem található a telepítésben.".to_string()
        })?;
        copy_dir_all(&template, &folder).map_err(|e| format!("Sablon másolási hiba: {e}"))?;
        created = true;
    }

    let adatok = find_adatok_file(&folder);
    Ok(ExcelFolderInfo {
        folder_path: folder.to_string_lossy().to_string(),
        exists: adatok.is_some(),
        adatok_path: adatok.map(|p| p.to_string_lossy().to_string()),
        created,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// Oblio / befogadott e-Factura mappa (2026-06-14)
//
// A böngésző File System Access mappaválasztója sok hibalehetőséget hordoz
// (rossz mappa, megtagadott engedély, felhő-szinkronizált hely). Az asztali
// (offline) appban ehelyett a RENDSZER birtokolja a mappát: egy fix, ismert
// helyen a Dokumentumok-ban (`…\Documents\Kartoteka\Oblio\befogadott`), amit
// a Rust-réteg hoz létre és nyit meg. A lelkész ide teszi az Oblio ZIP-et.
// ───────────────────────────────────────────────────────────────────────────

/// Az Oblio-gyökér: `…\Documents\Kartoteka\Oblio`.
fn oblio_base(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| format!("A Dokumentumok mappa nem található: {e}"))?;
    Ok(docs.join("Kartoteka").join("Oblio"))
}

/// A BEDOBÓ mappa (ide teszi a lelkész a letöltött ZIP-et / fájlokat):
/// `…\Documents\Kartoteka\Oblio\befogadott`. Beolvasás után KIÜRÜL.
fn oblio_folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(oblio_base(app)?.join("befogadott"))
}

/// A FELDOLGOZOTT (belső) tár: ide kerülnek a beolvasott XML/PDF-ek tartósan.
/// `…\Documents\Kartoteka\Oblio\feldolgozott`.
fn oblio_processed(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(oblio_base(app)?.join("feldolgozott"))
}

/// A feldolgozott ZIP-ek archívuma: `…\Documents\Kartoteka\Oblio\zip-arhivum`.
fn oblio_zip_archive(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(oblio_base(app)?.join("zip-arhivum"))
}

/// Egy Oblio-mappa állapota — a UI visszajelzéséhez (létezik-e + mit tartalmaz).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OblioFolderInfo {
    /// A befogadott e-Factura mappa teljes útvonala.
    pub folder_path: String,
    /// Létezik-e már a mappa.
    pub exists: bool,
    /// A mappában talált ZIP/XML/PDF fájlok száma (megerősítés a felhasználónak).
    pub zip_count: u32,
    pub xml_count: u32,
    pub pdf_count: u32,
}

fn count_oblio_files(folder: &Path) -> (u32, u32, u32) {
    let (mut zip, mut xml, mut pdf) = (0u32, 0u32, 0u32);
    if let Ok(rd) = std::fs::read_dir(folder) {
        for e in rd.flatten() {
            if let Some(name) = e.file_name().to_str() {
                let lower = name.to_lowercase();
                if lower.ends_with(".zip") {
                    zip += 1;
                } else if lower.ends_with(".xml") {
                    xml += 1;
                } else if lower.ends_with(".pdf") {
                    pdf += 1;
                }
            }
        }
    }
    (zip, xml, pdf)
}

/// A befogadott e-Factura mappa alapértelmezett útvonala (létrehozás nélkül).
#[tauri::command]
pub fn oblio_default_folder(app: tauri::AppHandle) -> Result<String, String> {
    Ok(oblio_folder(&app)?.to_string_lossy().to_string())
}

/// A befogadott e-Factura mappa állapota (létezik-e + fájl-számok) — másolás nélkül.
#[tauri::command]
pub fn oblio_folder_info(app: tauri::AppHandle) -> Result<OblioFolderInfo, String> {
    let folder = oblio_folder(&app)?;
    let exists = folder.is_dir();
    let (zip_count, xml_count, pdf_count) = if exists {
        count_oblio_files(&folder)
    } else {
        (0, 0, 0)
    };
    Ok(OblioFolderInfo {
        folder_path: folder.to_string_lossy().to_string(),
        exists,
        zip_count,
        xml_count,
        pdf_count,
    })
}

/// A befogadott e-Factura mappa előkészítése: létrehozza (a szülőkkel együtt),
/// ha még nincs. Idempotens — meglévő mappát/tartalmat érintetlenül hagy.
#[tauri::command]
pub fn oblio_setup_folder(app: tauri::AppHandle) -> Result<OblioFolderInfo, String> {
    let folder = oblio_folder(&app)?;
    std::fs::create_dir_all(&folder).map_err(|e| format!("Mappa-létrehozás hiba: {e}"))?;
    let (zip_count, xml_count, pdf_count) = count_oblio_files(&folder);
    Ok(OblioFolderInfo {
        folder_path: folder.to_string_lossy().to_string(),
        exists: true,
        zip_count,
        xml_count,
        pdf_count,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// Oblio beolvasás (ingest): a BEDOBÓ mappa → FELDOLGOZOTT mappa áthelyezés
//
// A lelkész a letöltött Oblio ZIP-et (vagy a kibontott XML/PDF-eket) a
// `befogadott/` mappába teszi. Beolvasáskor:
//   - a ZIP-eket kibontjuk a `feldolgozott/`-ba (1 XML + 1 PDF → a PDF az XML
//     alapnevére átnevezve), majd a ZIP-et a `zip-arhivum/`-ba archiváljuk,
//   - a lazán bedobott XML/PDF-eket áthelyezzük a `feldolgozott/`-ba.
// Így a `befogadott/` mappa beolvasás után KIÜRÜL — a lelkész látja, hogy
// a rendszer már beolvasta a fájlokat, és a mappa tiszta marad.
// ───────────────────────────────────────────────────────────────────────────

/// Egy fájl a feldolgozott tárban (a TS-oldal ebből parse-ol/párosít).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OblioFileEntry {
    pub name: String,
    /// Teljes útvonal (megnyitáshoz).
    pub path: String,
    pub size: u64,
    /// Utolsó módosítás (ms az epoch óta).
    pub mtime_ms: f64,
    /// "xml" | "pdf" | "other".
    pub kind: String,
}

/// A beolvasás összesítője.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OblioIngestReport {
    pub extracted_xml: u32,
    pub extracted_pdf: u32,
    pub moved_xml: u32,
    pub moved_pdf: u32,
    pub archived_zips: u32,
    /// Már korábban beolvasott (kihagyott) fájlok száma.
    pub skipped: u32,
    /// A `befogadott/`-ban maradt (ismeretlen formátumú) fájlok száma.
    pub befogadott_remaining: u32,
    pub errors: Vec<String>,
}

fn count_files(dir: &Path) -> u32 {
    std::fs::read_dir(dir)
        .map(|rd| rd.flatten().filter(|e| e.path().is_file()).count() as u32)
        .unwrap_or(0)
}

/// Egy fájl kiírása a célmappába, CSAK ha még nem létezik (idempotens).
/// Visszaadja, hogy ténylegesen írtunk-e (false = már létezett).
fn write_if_absent(dir: &Path, name: &str, bytes: &[u8]) -> Result<bool, String> {
    let dest = dir.join(name);
    if dest.exists() {
        return Ok(false);
    }
    std::fs::write(&dest, bytes).map_err(|e| format!("Fájl-írás hiba: {e}"))?;
    Ok(true)
}

/// Egy fájl áthelyezése a célmappába. Ha a cél MÁR létezik, NEM írjuk felül
/// (false), a hívó a forrást így is eltávolítja a bedobó mappából.
fn move_into(src: &Path, dst_dir: &Path, name: &str) -> Result<bool, String> {
    let dest = dst_dir.join(name);
    if dest.exists() {
        return Ok(false);
    }
    if std::fs::rename(src, &dest).is_err() {
        // Eltérő meghajtó / kötet — másolás + törlés.
        std::fs::copy(src, &dest).map_err(|e| format!("Másolás hiba: {e}"))?;
        std::fs::remove_file(src).map_err(|e| format!("Forrás törlés hiba: {e}"))?;
    }
    Ok(true)
}

/// Egy ZIP-bejegyzés bájtjainak kiolvasása (a `recalc_patch` mintájára).
fn read_zip_entry(archive: &mut zip::ZipArchive<File>, i: usize) -> Result<Vec<u8>, String> {
    let mut entry = archive
        .by_index(i)
        .map_err(|e| format!("ZIP bejegyzés hiba: {e}"))?;
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| format!("ZIP bejegyzés olvasás hiba: {e}"))?;
    Ok(bytes)
}

/// Egy ZIP kibontása a feldolgozott mappába (aláírás-XML kihagyva, 1+1 esetén
/// a PDF az XML alapnevére átnevezve — biztos pár).
fn ingest_zip(
    zip_path: &Path,
    processed: &Path,
    report: &mut OblioIngestReport,
) -> Result<(), String> {
    let f = File::open(zip_path).map_err(|e| format!("ZIP megnyitás hiba: {e}"))?;
    let mut archive = zip::ZipArchive::new(f).map_err(|e| format!("ZIP olvasás hiba: {e}"))?;

    // 1. lépés: bejegyzés-nevek begyűjtése (aláírás-XML kihagyva).
    let mut xml_entries: Vec<(usize, String)> = Vec::new();
    let mut pdf_entries: Vec<(usize, String)> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP bejegyzés hiba: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let full = entry.name().to_string();
        let base = full
            .rsplit(|c| c == '/' || c == '\\')
            .next()
            .unwrap_or(full.as_str())
            .to_string();
        let lower = base.to_lowercase();
        if lower.starts_with("semnatura_") || lower.starts_with("semnatura-") {
            continue;
        }
        if lower.ends_with(".xml") {
            xml_entries.push((i, base));
        } else if lower.ends_with(".pdf") {
            pdf_entries.push((i, base));
        }
    }

    let single_pair = xml_entries.len() == 1 && pdf_entries.len() == 1;

    // 2. lépés: XML-ek kibontása (eredeti néven).
    for (i, base) in &xml_entries {
        let bytes = read_zip_entry(&mut archive, *i)?;
        if write_if_absent(processed, base, &bytes)? {
            report.extracted_xml += 1;
        } else {
            report.skipped += 1;
        }
    }

    // 3. lépés: PDF-ek kibontása (1+1 esetén az XML alapnevére átnevezve).
    for (i, base) in &pdf_entries {
        let target = if single_pair {
            let xb = &xml_entries[0].1;
            let stem = if xb.to_lowercase().ends_with(".xml") {
                &xb[..xb.len() - 4]
            } else {
                xb.as_str()
            };
            format!("{stem}.pdf")
        } else {
            base.clone()
        };
        let bytes = read_zip_entry(&mut archive, *i)?;
        if write_if_absent(processed, &target, &bytes)? {
            report.extracted_pdf += 1;
        } else {
            report.skipped += 1;
        }
    }

    Ok(())
}

/// A feldolgozott ZIP archiválása (epoch-prefixszel, ütközés-mentesen).
fn archive_zip(zip_path: &Path, archive_dir: &Path) -> Result<(), String> {
    let name = zip_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("export.zip");
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = archive_dir.join(format!("{epoch}_{name}"));
    if std::fs::rename(zip_path, &dest).is_err() {
        std::fs::copy(zip_path, &dest).map_err(|e| format!("ZIP archiválás másolás hiba: {e}"))?;
        std::fs::remove_file(zip_path).map_err(|e| format!("ZIP törlés hiba: {e}"))?;
    }
    Ok(())
}

/// A BEDOBÓ mappa beolvasása: ZIP-ek kibontása + lazán bedobott XML/PDF
/// áthelyezése a feldolgozott mappába, majd a bedobó mappa kiürítése.
#[tauri::command]
pub fn oblio_ingest(app: tauri::AppHandle) -> Result<OblioIngestReport, String> {
    let befogadott = oblio_folder(&app)?;
    let processed = oblio_processed(&app)?;
    let archive = oblio_zip_archive(&app)?;
    std::fs::create_dir_all(&befogadott).map_err(|e| format!("Mappa-létrehozás hiba: {e}"))?;
    std::fs::create_dir_all(&processed).map_err(|e| format!("Mappa-létrehozás hiba: {e}"))?;
    std::fs::create_dir_all(&archive).map_err(|e| format!("Mappa-létrehozás hiba: {e}"))?;

    let mut report = OblioIngestReport {
        extracted_xml: 0,
        extracted_pdf: 0,
        moved_xml: 0,
        moved_pdf: 0,
        archived_zips: 0,
        skipped: 0,
        befogadott_remaining: 0,
        errors: Vec::new(),
    };

    let entries: Vec<PathBuf> = match std::fs::read_dir(&befogadott) {
        Ok(rd) => rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect(),
        Err(e) => return Err(format!("A befogadott mappa olvasása sikertelen: {e}")),
    };

    for path in &entries {
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let lower = name.to_lowercase();

        if lower.ends_with(".zip") {
            match ingest_zip(path, &processed, &mut report) {
                Ok(_) => {
                    if let Err(e) = archive_zip(path, &archive) {
                        report.errors.push(format!("ZIP archiválás hiba ({name}): {e}"));
                    } else {
                        report.archived_zips += 1;
                    }
                }
                Err(e) => report.errors.push(format!("ZIP feldolgozás hiba ({name}): {e}")),
            }
        } else if lower.ends_with(".xml") || lower.ends_with(".pdf") {
            // Aláírás-XML: nem visszük át, csak eltávolítjuk a bedobó mappából.
            if lower.starts_with("semnatura_") || lower.starts_with("semnatura-") {
                let _ = std::fs::remove_file(path);
                continue;
            }
            match move_into(path, &processed, &name) {
                Ok(moved) => {
                    if moved {
                        if lower.ends_with(".xml") {
                            report.moved_xml += 1;
                        } else {
                            report.moved_pdf += 1;
                        }
                    } else {
                        report.skipped += 1;
                    }
                    // A bedobó mappa ürüljön ki akkor is, ha a cél már létezett.
                    let _ = std::fs::remove_file(path);
                }
                Err(e) => report.errors.push(format!("Áthelyezés hiba ({name}): {e}")),
            }
        }
        // Ismeretlen formátumú fájlt NEM törlünk — a lelkész más fájljait nem
        // bántjuk; a befogadott_remaining számláló jelzi, hogy maradt benne valami.
    }

    report.befogadott_remaining = count_files(&befogadott);
    Ok(report)
}

/// A feldolgozott mappa fájljainak listája (a TS-oldal ebből parse-ol/párosít).
#[tauri::command]
pub fn oblio_list_processed(app: tauri::AppHandle) -> Result<Vec<OblioFileEntry>, String> {
    let processed = oblio_processed(&app)?;
    let mut out: Vec<OblioFileEntry> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&processed) {
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_file() {
                continue;
            }
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let lower = name.to_lowercase();
            let kind = if lower.ends_with(".xml") {
                "xml"
            } else if lower.ends_with(".pdf") {
                "pdf"
            } else {
                "other"
            };
            let md = e.metadata().ok();
            let size = md.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime_ms = md
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64)
                .unwrap_or(0.0);
            out.push(OblioFileEntry {
                name,
                path: p.to_string_lossy().to_string(),
                size,
                mtime_ms,
                kind: kind.to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Egy feldolgozott fájl szöveges (UTF-8) tartalma — az UBL XML parse-hoz.
/// Path-traversal védelem: csak egyszerű fájlnevet fogad el.
#[tauri::command]
pub fn oblio_read_text(app: tauri::AppHandle, name: String) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Érvénytelen fájlnév.".to_string());
    }
    let processed = oblio_processed(&app)?;
    let path = processed.join(&name);
    std::fs::read_to_string(&path).map_err(|e| format!("Fájl olvasás hiba: {e}"))
}

/// A mappa megnyitása az operációs rendszer fájlkezelőjében.
#[tauri::command]
pub fn excel_open_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Az útvonal nem létezik: {path}"));
    }
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let spawned = std::process::Command::new("xdg-open").arg(&path).spawn();
    spawned
        .map(|_| ())
        .map_err(|e| format!("A mappa megnyitása nem sikerült: {e}"))
}
