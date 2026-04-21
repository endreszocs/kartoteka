# Kartoteka Desktop - Auto-updater signing key generator (Ed25519)
# ============================================================================
# Az M5 (auto-updater) egy Ed25519 kulcsparral hitelesiti a letoltesi
# manifest-et. A PRIVAT kulcsot csak a build-server (Endre gepe) lathatja,
# a PUBLIKUS kulcs a `tauri.conf.json`-ben van es minden Kartoteka-teleppitessel
# eljut a lelkesz gepere.
#
# Futtatas (egyszeri):
#   cd "D:\Egyházi APP\KARTOTEKA"
#   .\ops\updater-key-setup.ps1
#
# A script:
#   1. Ellenorzi, van-e mar kulcs (ha igen, felajanlja az ujrahasznalast)
#   2. Letrehoz egy kulcsparot (a Tauri CLI signer-en keresztul)
#   3. A privat kulcs `ops/updater-private.key`-be kerul (gitignore-olt)
#   4. A publikus kulcs `ops/updater-private.key.pub`-ba + kiirva konzolra
#   5. Endre kimasolja a pubkey-t es elkuldi Claude-nak, aki a
#      tauri.conf.json-t frissiti.
# ============================================================================

$ErrorActionPreference = "Stop"

$privateKeyPath = Join-Path $PSScriptRoot "updater-private.key"
$pubKeyPath = "$privateKeyPath.pub"
$keyPassword = "kartoteka-updater-dev-2026"  # fejlesztoi; cseréld le production elott
$desktopDir = Resolve-Path (Join-Path $PSScriptRoot "..\apps\desktop")

# ----------------------------------------------------------------------------
# 1. Letezik-e mar a kulcs?
# ----------------------------------------------------------------------------
if (Test-Path $privateKeyPath) {
    Write-Host "[!] Privat kulcs mar letezik: $privateKeyPath" -ForegroundColor Yellow
    if (Test-Path $pubKeyPath) {
        Write-Host ""
        Write-Host "Meglevo pubkey tartalma:" -ForegroundColor Cyan
        Write-Host "========================================================================"
        Get-Content $pubKeyPath -Raw
        Write-Host "========================================================================"
        Write-Host ""
    }
    $reuse = Read-Host "Ujrahasznalom? (y = igen / n = ujat generaljak)"
    if ($reuse -eq "n") {
        Write-Host "Uj kulcs generalasa..." -ForegroundColor Cyan
        Remove-Item $privateKeyPath -Force
        if (Test-Path $pubKeyPath) { Remove-Item $pubKeyPath -Force }
    } else {
        Write-Host "OK - Meglevo kulcsot hasznalok. A pubkey fent van kiirva." -ForegroundColor Green
        exit 0
    }
}

# ----------------------------------------------------------------------------
# 2. Kulcspar generalas a Tauri CLI-vel
#    `npx @tauri-apps/cli signer generate` a parancs. Environment-bol adjuk
#    at a jelszot a `TAURI_KEY_PASSWORD`-ben, hogy interaktivitast elkerulok.
# ----------------------------------------------------------------------------
Write-Host "Ed25519 kulcspar generalasa..." -ForegroundColor Cyan
Write-Host "  Privat kulcs helye: $privateKeyPath" -ForegroundColor Gray
Write-Host "  Jelszo: $keyPassword" -ForegroundColor Gray
Write-Host ""

# Explicit `--password` — ezzel a Tauri signer biztosan ezt a jelszot hasznalja
# encrypting/decrypting-hez, es nem ker interaktiv confirmation-t.
Push-Location $desktopDir
try {
    & npx --yes @tauri-apps/cli signer generate -w $privateKeyPath --password $keyPassword
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[FAIL] A signer generate sikertelen (exit $exitCode)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tippek:" -ForegroundColor Yellow
    Write-Host "  1. A @tauri-apps/cli telepitett-e?" -ForegroundColor Yellow
    Write-Host "     cd apps\desktop; npx @tauri-apps/cli --version"
    Write-Host ""
    Write-Host "  2. Probald a --ci flag nelkul (interaktiv modban):" -ForegroundColor Yellow
    Write-Host "     cd apps\desktop"
    Write-Host "     npx @tauri-apps/cli signer generate -w ..\..\ops\updater-private.key"
    Write-Host ""
    exit 1
}

# ----------------------------------------------------------------------------
# 3. Publikus kulcs ellenorzes + kiiras
# ----------------------------------------------------------------------------
if (-not (Test-Path $pubKeyPath)) {
    Write-Host "[FAIL] A publikus kulcs fajl ($pubKeyPath) nem jott letre." -ForegroundColor Red
    exit 1
}

$pubKeyContent = Get-Content $pubKeyPath -Raw

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "GENERALAS SIKERES" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Privat kulcs: $privateKeyPath" -ForegroundColor Gray
Write-Host "Publikus kulcs: $pubKeyPath" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "PUBLIKUS KULCS (kuld el Claude-nak, a tauri.conf.json-be keruI):" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host $pubKeyContent
Write-Host "========================================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "BIZTONSAGI JEGYZETEK:" -ForegroundColor Yellow
Write-Host "  - A privat kulcs ($privateKeyPath) SOSEM kerulhet a repoba."
Write-Host "    (ops/*.key pattern mar gitignore-olt)"
Write-Host "  - Privat kulcs JELSZAVA: $keyPassword"
Write-Host "    Cselerd le production elott! Tarold biztonsagos helyen (pl. 1Password)."
Write-Host "  - Release build-kor az env-valtozok kellenek:"
Write-Host "      `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $privateKeyPath -Raw"
Write-Host "      `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = `"$keyPassword`""
