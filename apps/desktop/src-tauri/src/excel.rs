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
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
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
