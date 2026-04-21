# Kartoteka Desktop - Auto-updater signing key generator (Ed25519)
# ============================================================================
# Az M5 (auto-updater) egy Ed25519 kulcsparral hitelesiti a letoltesi
# manifest-et. A PRIVAT kulcsot csak a build-server (Endre gepe) lathatja,
# a PUBLIKUS kulcs a `tauri.conf.json`-ben van es minden Kartoteka-teleppitessel
# eljut a lelkesz gepere.
#
# Futtatas (egyszeri):
#   .\ops\updater-key-setup.ps1
#
# A script:
#   1. Ellenorzi, hogy a `cargo tauri signer generate` parancs elerheto-e
#   2. Letrehoz egy kulcsparot (privat kulcs password-del vedve)
#   3. A PFX-szeru logikaval: a privat kulcs `ops/updater-private.key`-be,
#      a publikus string `tauri.conf.json` plugins.updater.pubkey-jebe
#   4. Kiirja a kovetkezo lepeseket
# ============================================================================

$ErrorActionPreference = "Stop"

# Feltetelek
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

$privateKeyPath = Join-Path $PSScriptRoot "updater-private.key"
$keyPassword = "kartoteka-updater-dev-2026"  # fejlesztoi; cseréld le production elott

# ----------------------------------------------------------------------------
# 1. Letezik-e mar a kulcs?
# ----------------------------------------------------------------------------
if (Test-Path $privateKeyPath) {
    Write-Host "[!] Privat kulcs mar letezik: $privateKeyPath" -ForegroundColor Yellow
    $reuse = Read-Host "Hasznaljam ezt? (y/n)"
    if ($reuse -ne "n") {
        Write-Host "OK - letezo kulcsot hasznalok." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "A publikus kulcsot lekerdezd ezzel a paranccsal:" -ForegroundColor Cyan
        Write-Host "  cargo tauri signer pubkey --key `"$privateKeyPath`" --password `"$keyPassword`""
        exit 0
    }
    Remove-Item $privateKeyPath -Force
}

# ----------------------------------------------------------------------------
# 2. Kulcspar generalas
#    cargo tauri signer generate -w <path>
#    (a jelszot env-valtoaban adjuk at, hogy ne interaktivan kerdezze)
# ----------------------------------------------------------------------------
Write-Host "Ed25519 kulcspar generalasa..." -ForegroundColor Cyan
Write-Host "  Privat kulcs: $privateKeyPath" -ForegroundColor Gray
Write-Host "  Jelszo: $keyPassword" -ForegroundColor Gray
Write-Host ""

# `cargo tauri signer generate` interaktiv, de environment-bol is megeszi
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $keyPassword
$output = & cargo tauri signer generate -w $privateKeyPath 2>&1
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $null

Write-Host $output
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] cargo tauri signer generate sikertelen" -ForegroundColor Red
    Write-Host "Tipp: telepitve van-e a tauri-cli? Ellenorizd:" -ForegroundColor Yellow
    Write-Host "  cargo install tauri-cli --version '^2' --locked"
    exit 1
}

# ----------------------------------------------------------------------------
# 3. Publikus kulcs kinyeres
# ----------------------------------------------------------------------------
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $keyPassword
$pubKey = & cargo tauri signer sign --key $privateKeyPath --no-confirm --help 2>&1 |
    Select-String -Pattern "dW50cnVzdGVkIGNvbW1lbnQ" | Select-Object -First 1
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $null

# Alternativa: a publikus kulcs a privat kulcs fajl melle, `<name>.pub` neven
$pubKeyPath = "$privateKeyPath.pub"
if (Test-Path $pubKeyPath) {
    $pubKeyContent = Get-Content $pubKeyPath -Raw
    Write-Host ""
    Write-Host "========================================================================" -ForegroundColor Cyan
    Write-Host "Publikus kulcs tartalma ($pubKeyPath):" -ForegroundColor Cyan
    Write-Host "========================================================================" -ForegroundColor Cyan
    Write-Host $pubKeyContent
    Write-Host ""
    Write-Host "Kovetkezo lepes - apps/desktop/src-tauri/tauri.conf.json:" -ForegroundColor Cyan
    Write-Host "  Keresd a 'UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT' stringet,"
    Write-Host "  cserled a fenti pubkey tartalmara (az 'untrusted comment'-es resz"
    Write-Host "  MINDEN soraval egyben, soremelesek NELKUL — egy string-be)."
    Write-Host ""
} else {
    Write-Host "[!] A publikus kulcs fajl ($pubKeyPath) nem jott letre." -ForegroundColor Yellow
    Write-Host "    Futtasd manualisan: cargo tauri signer sign --help"
}

# ----------------------------------------------------------------------------
# 4. Emlekezteto
# ----------------------------------------------------------------------------
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host "BIZTONSAGI JEGYZETEK" -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  - A privat kulcs ($privateKeyPath) SOSEM kerulhet a repoba."
Write-Host "    A .gitignore mar tartalmazza az ops/*.key patterst."
Write-Host ""
Write-Host "  - A privat kulcs JELSZAVA: $keyPassword"
Write-Host "    Cselerd le production elott! Tarold biztonsagos helyen (pl. 1Password)."
Write-Host ""
Write-Host "  - Build-kor a TAURI_SIGNING_PRIVATE_KEY_PASSWORD env-valtozot kell"
Write-Host "    beallitani, hogy a bundler hasznalja a privat kulcsot:"
Write-Host ""
Write-Host '      $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ops\updater-private.key -Raw' -ForegroundColor Gray
Write-Host "      `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = `"$keyPassword`"" -ForegroundColor Gray
Write-Host '      npm run desktop:build' -ForegroundColor Gray
Write-Host ""
Write-Host "  - A MANIFEST-et kezzel epited, pl:"
Write-Host ""
Write-Host '      {'
Write-Host '        "version": "0.2.0",'
Write-Host '        "notes": "...",'
Write-Host '        "pub_date": "2026-05-15T12:00:00Z",'
Write-Host '        "platforms": {'
Write-Host '          "windows-x86_64": {'
Write-Host '            "signature": "<tauri signer sign kimenete>",'
Write-Host '            "url": "https://updates.kartoteka.hu/windows-x86_64/0.2.0"'
Write-Host '          }'
Write-Host '        }'
Write-Host '      }'
