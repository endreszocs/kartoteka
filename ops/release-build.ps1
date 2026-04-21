# Kartoteka Desktop - Release build + Supabase Storage upload
# ============================================================================
# Teljes release-workflow egy lepesben:
#   1. `apps/desktop/src-tauri/tauri.conf.json` version + Cargo.toml ellenorzes
#   2. Environment variables beallitasa (signing keys)
#   3. `npm run desktop:build` - Tauri bundle + .nsis.zip + signature
#   4. latest.json manifest generalas
#   5. Upload a Supabase Storage `updater` bucket-be
#
# Futtatas:
#   .\ops\release-build.ps1 -Version "0.2.0" -Notes "..." [-SkipUpload]
#
# Prerequisites:
#   - ops/updater-private.key letezik (updater-key-setup.ps1 futott)
#   - apps/desktop/.env-ben (vagy environmentben) SUPABASE_SERVICE_ROLE_KEY
#     (a Storage-feltoltes REST API-n megy service_role kulccsal)
#   - tauri.conf.json es Cargo.toml a megadott verziora van beallitva
#
# A script ellenorzi a verziot, es figyelmeztet ha nem egyezik.
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Notes = "",

    [Parameter(Mandatory = $false)]
    [switch]$SkipUpload,

    [Parameter(Mandatory = $false)]
    [string]$Target = "windows-x86_64"
)

$ErrorActionPreference = "Stop"

# ----------------------------------------------------------------------------
# Konstansok + utvonalak
# ----------------------------------------------------------------------------
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$desktopDir = Join-Path $repoRoot "apps\desktop"
$tauriConf = Join-Path $desktopDir "src-tauri\tauri.conf.json"
$cargoToml = Join-Path $desktopDir "src-tauri\Cargo.toml"
$privateKeyPath = Join-Path $PSScriptRoot "updater-private.key"
$bundleBase = "C:\kartoteka-target\release\bundle"
$supabaseProjectRef = "bjytiawckbibqmtlezfl"
$supabaseBucket = "updater"
# A dev-kulcs `updater-key-setup.ps1`-ben a kovetkezo passworddel generalva:
$keyPassword = "kartoteka-updater-dev-2026"

# ----------------------------------------------------------------------------
# 1. Preflight: fajlok ellenorzese
# ----------------------------------------------------------------------------
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "KARTOTEKA RELEASE BUILD - v$Version" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $privateKeyPath)) {
    Write-Host "[FAIL] Privat kulcs nem talalhato: $privateKeyPath" -ForegroundColor Red
    Write-Host "       Futtasd elobb: .\ops\updater-key-setup.ps1"
    exit 1
}

# Verzio-ellenorzes (tauri.conf.json)
# FONTOS: explicit UTF-8 olvasas/iras, mert a PS 5.1 Get-Content default-ja
# Windows-1252 (CP1250), ami a magyar karaktereket (é, á, ü stb.) mojibake-re
# tori. A Tauri/WiX azutan nem tudja felismerni a productName-t.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$confContent = [System.IO.File]::ReadAllText($tauriConf, $utf8NoBom)
if ($confContent -notmatch "`"version`":\s*`"$Version`"") {
    Write-Host "[!] tauri.conf.json version-je nem egyezik a megadottal ($Version)." -ForegroundColor Yellow
    $answer = Read-Host "Frissitsem most? (y/n)"
    if ($answer -eq "y") {
        $newContent = $confContent -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
        [System.IO.File]::WriteAllText($tauriConf, $newContent, $utf8NoBom)
        Write-Host "    tauri.conf.json version = $Version" -ForegroundColor Green
    } else {
        Write-Host "[ABORT] Futtasd ujra a helyes verzio-szammal, vagy engedelyezd a frissitest." -ForegroundColor Red
        exit 1
    }
}

# Verzio-ellenorzes (Cargo.toml) — a Cargo.toml tisztan ASCII, de a konzisztencia
# kedveert szinten UTF-8-kent kezeljuk
$cargoContent = [System.IO.File]::ReadAllText($cargoToml, $utf8NoBom)
if ($cargoContent -notmatch "(?m)^version\s*=\s*`"$Version`"") {
    Write-Host "[!] Cargo.toml version-je nem egyezik a megadottal ($Version)." -ForegroundColor Yellow
    $answer = Read-Host "Frissitsem most? (y/n)"
    if ($answer -eq "y") {
        $newContent = $cargoContent -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`""
        [System.IO.File]::WriteAllText($cargoToml, $newContent, $utf8NoBom)
        Write-Host "    Cargo.toml version = $Version" -ForegroundColor Green
    } else {
        Write-Host "[ABORT] Futtasd ujra a helyes verzio-szammal." -ForegroundColor Red
        exit 1
    }
}

# ----------------------------------------------------------------------------
# 2. Environment variables
# ----------------------------------------------------------------------------
Write-Host "Environment variables beallitasa..." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $privateKeyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $keyPassword
# PATH: Perl + NASM + Cargo a cross-build-hez (az M2.2 tanulsag miatt)
$env:PATH = "$env:USERPROFILE\.cargo\bin;C:\Strawberry\perl\bin;C:\Strawberry\c\bin;$env:PATH"

# ----------------------------------------------------------------------------
# 3. Build
# ----------------------------------------------------------------------------
Write-Host "Release build indul... (~1-5 perc inkrementalisan)" -ForegroundColor Cyan
Push-Location $repoRoot
try {
    & npm run desktop:build
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
    $env:TAURI_SIGNING_PRIVATE_KEY = $null
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $null
}

if ($exitCode -ne 0) {
    Write-Host "[FAIL] desktop:build hibara futott (exit $exitCode)" -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
# 4. Build-artifactok lokalizalas
#    A Tauri v2 kozvetlenul a *-setup.exe + *.exe.sig -et generalja a nsis/
#    mappaba (nincs .nsis.zip-wrapping az ujabb verziokban). A Windows-updater
#    ezzel megy.
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "Build-artifactok ellenorzese..." -ForegroundColor Cyan

# Verzio-specifikusan keressuk, mert a bundle-mappaban tobb build output
# (0.1.0, 0.2.0, …) maradhat egymas mellett.
$nsisExePath = Get-ChildItem "$bundleBase\nsis\*_${Version}_*-setup.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*.sig" } | Select-Object -First 1
$nsisSigPath = Get-ChildItem "$bundleBase\nsis\*_${Version}_*-setup.exe.sig" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $nsisExePath) {
    Write-Host "[FAIL] *-setup.exe nem talalhato a $bundleBase\nsis\ alatt" -ForegroundColor Red
    exit 1
}
if (-not $nsisSigPath) {
    Write-Host "[FAIL] *-setup.exe.sig (Ed25519 signature) nem talalhato" -ForegroundColor Red
    Write-Host "       Ellenorizd: TAURI_SIGNING_PRIVATE_KEY env-valt beallitva volt-e" -ForegroundColor Yellow
    exit 1
}

$uploadSizeMb = [math]::Round($nsisExePath.Length / 1MB, 2)
Write-Host "    setup.exe: $($nsisExePath.FullName) ($uploadSizeMb MB)" -ForegroundColor Green
Write-Host "    setup.exe.sig: $($nsisSigPath.FullName)" -ForegroundColor Green

$signatureContent = (Get-Content $nsisSigPath.FullName -Raw).Trim()

# ----------------------------------------------------------------------------
# 5. Manifest generalas
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "latest.json manifest generalasa..." -ForegroundColor Cyan

# A filename-t ASCII-safe verzioba konvertaljuk. A magyar "é" tauri.conf.json
# productName-bol oroklodott, de a Supabase Storage az object-key-ben
# "Invalid key"-t dob a non-ASCII karakterekre. Atnevezzuk: Kartoteka_* (ASCII).
function ConvertTo-Ascii {
    param([string]$InputString)
    $normalized = $InputString.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $normalized.ToCharArray()) {
        $uc = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($c)
        if ($uc -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            # Magyar "ő" es "ű" nem FormD-decomposable — kulon kezeljuk
            $code = [int]$c
            if ($code -eq 0x0151) { [void]$sb.Append('o'); continue }  # ő
            if ($code -eq 0x0171) { [void]$sb.Append('u'); continue }  # ű
            if ($code -eq 0x0150) { [void]$sb.Append('O'); continue }  # Ő
            if ($code -eq 0x0170) { [void]$sb.Append('U'); continue }  # Ű
            if ($code -lt 128) { [void]$sb.Append($c) }
        }
    }
    return $sb.ToString()
}

$uploadName = ConvertTo-Ascii -InputString $nsisExePath.Name
$uploadedUrl = "https://$supabaseProjectRef.supabase.co/storage/v1/object/public/$supabaseBucket/$Target/$uploadName"

Write-Host "    Upload name: $uploadName (ASCII-convertalt az eredetibol: $($nsisExePath.Name))" -ForegroundColor Gray

$manifest = @{
    version = $Version
    notes = $Notes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        $Target = @{
            signature = $signatureContent
            url = $uploadedUrl
        }
    }
} | ConvertTo-Json -Depth 5 -Compress

$manifestPath = Join-Path $bundleBase "nsis\latest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8NoBom)
Write-Host "    $manifestPath" -ForegroundColor Green
Write-Host ""
Write-Host "Manifest tartalom:" -ForegroundColor Gray
Write-Host $manifest -ForegroundColor Gray

# ----------------------------------------------------------------------------
# 6. Upload (opcionalis, -SkipUpload kihagyja)
# ----------------------------------------------------------------------------
if ($SkipUpload) {
    Write-Host ""
    Write-Host "[SKIP] Upload kihagyva (-SkipUpload flag)." -ForegroundColor Yellow
    Write-Host "      Kezi feltoltes: Supabase Studio > Storage > $supabaseBucket > $Target/"
    Write-Host "      Fajlok: $($nsisZipPath.Name), latest.json"
    exit 0
}

# SUPABASE_SERVICE_ROLE_KEY betolt a env.local-bol
$envFile = Join-Path $desktopDir ".env"
$serviceRoleKey = $null
if (Test-Path $envFile) {
    $envLines = Get-Content $envFile
    foreach ($line in $envLines) {
        if ($line -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$') {
            $serviceRoleKey = $Matches[1].Trim()
            break
        }
    }
}
# Fallback: apps/web/.env.local
if (-not $serviceRoleKey) {
    $webEnvFile = Join-Path $repoRoot "apps\web\.env.local"
    if (Test-Path $webEnvFile) {
        $envLines = Get-Content $webEnvFile
        foreach ($line in $envLines) {
            if ($line -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$') {
                $serviceRoleKey = $Matches[1].Trim()
                break
            }
        }
    }
}

if (-not $serviceRoleKey) {
    Write-Host ""
    Write-Host "[FAIL] SUPABASE_SERVICE_ROLE_KEY nem talalhato." -ForegroundColor Red
    Write-Host "       Allitsd be apps/desktop/.env vagy apps/web/.env.local-ban."
    exit 1
}

Write-Host ""
Write-Host "Supabase Storage feltoltes..." -ForegroundColor Cyan

$supabaseUrl = "https://$supabaseProjectRef.supabase.co"

function Upload-File {
    param (
        [string]$LocalPath,
        [string]$RemotePath,
        [string]$ContentType
    )
    $apiUrl = "$supabaseUrl/storage/v1/object/$supabaseBucket/$RemotePath"
    $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
    $headers = @{
        "Authorization" = "Bearer $serviceRoleKey"
        "Content-Type" = $ContentType
        "x-upsert" = "true"  # override if exists
    }
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $bytes
        Write-Host "    OK: $RemotePath ($([math]::Round($bytes.Length / 1MB, 2)) MB)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "    FAIL: $RemotePath -> $_" -ForegroundColor Red
        return $false
    }
}

$okBinary = Upload-File -LocalPath $nsisExePath.FullName `
                       -RemotePath "$Target/$uploadName" `
                       -ContentType "application/octet-stream"

$okJson = Upload-File -LocalPath $manifestPath `
                     -RemotePath "$Target/latest.json" `
                     -ContentType "application/json"

if ($okBinary -and $okJson) {
    Write-Host ""
    Write-Host "=============================================================" -ForegroundColor Green
    Write-Host "RELEASE FELTOLTVE!" -ForegroundColor Green
    Write-Host "=============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Manifest elerheto:" -ForegroundColor Cyan
    Write-Host "  $supabaseUrl/storage/v1/object/public/$supabaseBucket/$Target/latest.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Kliens-teszt:" -ForegroundColor Cyan
    Write-Host "  1. Inditsd egy regebbi verziot (pl. a mar telepitett 0.1.0 MSI-t)"
    Write-Host "  2. Dashboard > Frissites > Ellenorzes"
    Write-Host "  3. Uj verzio: $Version - Letoltes es telepites"
} else {
    Write-Host ""
    Write-Host "[FAIL] Feltoltes reszben sikertelen. Ellenorizd a hibauzeneteket." -ForegroundColor Red
    exit 1
}
