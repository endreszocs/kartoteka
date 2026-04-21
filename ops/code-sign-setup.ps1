# Kartoteka Desktop - Self-signed code-sign cert bootstrap
# ============================================================================
# MVP celra: sajat fejlesztoi gepen egy code-sign certet generalunk,
# majd a PFX fajlt a projekt-rootban taroljuk (git-ignore-olt).
#
# Futtatas (Administrator PowerShell ajanlott, bar Current User-be megy):
#   .\ops\code-sign-setup.ps1
#
# Ez egy EGYSZERI lepes. Utana a Tauri tauri.conf.json-ben a
# `windows.certificateThumbprint` megkapja az uj cert thumbprint-jet,
# es a `tauri build` automatikusan alairja az MSI + EXE bundle-t.
#
# MEGJEGYZES a Windows SmartScreen-rol:
#   A self-signed cert "Unknown publisher" jelzest kap.
#   Az elso telepiteskor a SmartScreen kek figyelmeztetest mutat
#   (Windows protected your PC -> More info -> Run anyway).
#
#   Ez elfogadhato belso / beta tesztelesre. Az EREK elnoksegi
#   szetosztas ELOTT erdemes atallni Azure Trusted Signing-re
#   ($9.99/ho, kb 30 perc setup) vagy SignPath-ra (OSS projektre ingyenes).
#
# MEGJEGYZES az ekezetekrol:
#   A script pure-ASCII karakteres, mert a Windows PowerShell 5.1
#   BOM nelkuli UTF-8 fajlokat CP1250-nek olvassa, es az ekezetek
#   szethullanak (pl. "szukseges" -> "szu~ksu~ges"). PowerShell 7-en
#   (pwsh.exe) ez mar nem probs, de a 5.1-gyel is mukodjon.
# ============================================================================

$ErrorActionPreference = "Stop"

$certSubject = "CN=EREK Kartoteka Developer, O=Baratosi Reformatus Egyhazkozseg, C=RO"
$pfxPath     = "$PSScriptRoot\..\ops\kartoteka-codesign.pfx"
$pfxPassword = "kartoteka-dev-2026"  # fejlesztoi; ne kerulon production-be
$validYears  = 3

# ----------------------------------------------------------------------------
# 1. Letezik-e mar cert?
# ----------------------------------------------------------------------------
$existing = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $certSubject }

if ($existing) {
    Write-Host "[!] Cert mar letezik - thumbprint: $($existing.Thumbprint)" -ForegroundColor Yellow
    $reuse = Read-Host "Hasznaljam ezt? (y/n)"
    if ($reuse -ne "n") {
        $cert = $existing
    } else {
        Write-Host "Uj cert generalasa..." -ForegroundColor Cyan
        $existing | Remove-Item
        $cert = $null
    }
} else {
    $cert = $null
}

# ----------------------------------------------------------------------------
# 2. Uj self-signed cert generalas
# ----------------------------------------------------------------------------
if (-not $cert) {
    Write-Host "Self-signed code-sign cert generalasa (ervenyes $validYears evig)..." -ForegroundColor Cyan

    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -KeyUsage DigitalSignature `
        -KeyExportPolicy Exportable `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears($validYears)

    Write-Host "[OK] Cert generalva: $($cert.Thumbprint)" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# 3. PFX export (a Tauri-bundler PFX fajlt var)
# ----------------------------------------------------------------------------
if (-not (Test-Path (Split-Path $pfxPath))) {
    New-Item -ItemType Directory -Path (Split-Path $pfxPath) -Force | Out-Null
}

$securePwd = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
Export-PfxCertificate `
    -Cert $cert `
    -FilePath $pfxPath `
    -Password $securePwd | Out-Null

Write-Host "[OK] PFX exportalva: $pfxPath" -ForegroundColor Green

# ----------------------------------------------------------------------------
# 4. Installalas a Trusted Publishers + Trusted Root store-okba (sajat gep)
#    - TrustedPublisher: SmartScreen Unknown-publisher NEM jelenik meg
#    - Root: a Get-AuthenticodeSignature "Valid" statuszt ad (helyi trust)
#    Mindket store a CurrentUser scope-ban van - nem kell elevation.
#    Fejlesztoi risk: onmagunknak aláírt kódhoz megbizunk. Self-signed cert
#    -et SOHA ne tegyunk éles lelkesz-géppre a Rootba!
# ----------------------------------------------------------------------------
Write-Host "Installalas Trusted Publishers store-ba (sajat gepre)..." -ForegroundColor Cyan
$store = Get-Item Cert:\CurrentUser\TrustedPublisher
$store.Open("ReadWrite")
$store.Add($cert)
$store.Close()
Write-Host "[OK] Hozzaadva a Trusted Publishers-hez." -ForegroundColor Green

Write-Host "Installalas Trusted Root CA store-ba (sajat gepre, helyi signature-validation-hoz)..." -ForegroundColor Cyan
try {
    $rootStore = Get-Item Cert:\CurrentUser\Root
    $rootStore.Open("ReadWrite")
    $rootStore.Add($cert)
    $rootStore.Close()
    Write-Host "[OK] Hozzaadva a Trusted Root CA-hoz (CurrentUser). Get-AuthenticodeSignature ezutan 'Valid' lesz." -ForegroundColor Green
} catch {
    Write-Host "[!] Trusted Root install sikertelen: $_" -ForegroundColor Yellow
    Write-Host "    Ez opcionalis, az alairas maga mukodik." -ForegroundColor Yellow
}

# ----------------------------------------------------------------------------
# 5. Tauri.conf.json frissites - instrukcio
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Kovetkezo lepes - apps/desktop/src-tauri/tauri.conf.json:" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host 'A "bundle" objektumba vedd fel a "windows" reszt:' -ForegroundColor White
Write-Host ""
Write-Host '  "windows": {' -ForegroundColor Gray
Write-Host "    `"certificateThumbprint`": `"$($cert.Thumbprint)`"," -ForegroundColor Green
Write-Host '    "digestAlgorithm": "sha256",' -ForegroundColor Gray
Write-Host '    "timestampUrl": "http://timestamp.digicert.com"' -ForegroundColor Gray
Write-Host '  }' -ForegroundColor Gray
Write-Host ""
Write-Host "Utana futtasd: npm run desktop:build" -ForegroundColor White
Write-Host "=> az MSI + NSIS bundle mar ala van irva (signtool.exe automatikus)." -ForegroundColor White
Write-Host ""
Write-Host "BIZTONSAGI JEGYZET:" -ForegroundColor Yellow
Write-Host "  - A PFX jelszo: '$pfxPassword' - CSAK fejlesztoi, csereld le production elott."
Write-Host "  - A PFX fajl az ops/ alatt van; mar gitignore-olt."
Write-Host "  - A self-signed cert SmartScreen-warning-ot eredmenyez eles telepiteskor"
Write-Host "    (Unknown publisher). EV vagy OV cert (Azure Trusted Signing / SignPath)"
Write-Host "    szukseges a 'Verified publisher' statuszhoz."
Write-Host ""
Write-Host "THUMBPRINT (egyben, copy-pasztre keszen):" -ForegroundColor Cyan
Write-Host "  $($cert.Thumbprint)" -ForegroundColor Green
