# Kartotéka Desktop — Self-signed code-sign cert bootstrap
# ============================================================================
# MVP-célra: Endre saját fejlesztői gépén egy CA-t és egy code-sign certet
# generál, majd a PFX fájlt a projekt-rootban tárolja (git-ignore-olt).
#
# Futtatás (Administrator PowerShell ajánlott — bár Current User-be megy):
#   .\ops\code-sign-setup.ps1
#
# Ez egy EGYSZERI lépés. Utána a Tauri tauri.conf.json-ben lévő
# `windows.certificateThumbprint` megkapja az új cert thumbprint-jét,
# és a `tauri build` automatikusan aláírja az MSI + EXE bundle-t.
#
# MEGJEGYZÉS a Windows SmartScreen-ről:
#   A self-signed cert megjelöli a fájlt mint "Unknown publisher".
#   Az első telepítéskor a SmartScreen mutat egy kék figyelmeztetést
#   ("Windows protected your PC" → More info → Run anyway).
#
#   Ez elfogadható a belső / béta tesztelésre. Az EREK elnökségi
#   szétosztás ELŐTT érdemes lesz átállni Azure Trusted Signing-re
#   ($9.99/hó, ~30 perc setup) vagy SignPath-ra (OSS projektekre ingyenes).
# ============================================================================

$ErrorActionPreference = "Stop"

$certSubject = "CN=EREK Kartotéka Developer, O=Barátosi Református Egyházközség, C=RO"
$pfxPath     = "$PSScriptRoot\..\ops\kartoteka-codesign.pfx"
$pfxPassword = "kartoteka-dev-2026"  # fejlesztői; ne kerüljön production-be
$validYears  = 3

# ────────────────────────────────────────────────────────────────────────────
# 1. Létezik-e már cert?
# ────────────────────────────────────────────────────────────────────────────
$existing = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $certSubject }

if ($existing) {
    Write-Host "⚠ Cert már létezik — thumbprint: $($existing.Thumbprint)" -ForegroundColor Yellow
    $reuse = Read-Host "Használjam ezt? (y/n)"
    if ($reuse -ne "n") {
        $cert = $existing
    } else {
        Write-Host "Új cert generálása…" -ForegroundColor Cyan
        $existing | Remove-Item
        $cert = $null
    }
} else {
    $cert = $null
}

# ────────────────────────────────────────────────────────────────────────────
# 2. Új self-signed cert generálás
# ────────────────────────────────────────────────────────────────────────────
if (-not $cert) {
    Write-Host "Self-signed code-sign cert generálása (érvényes $validYears évig)…" -ForegroundColor Cyan

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

    Write-Host "✅ Cert generálva: $($cert.Thumbprint)" -ForegroundColor Green
}

# ────────────────────────────────────────────────────────────────────────────
# 3. PFX export (a Tauri-bundler PFX fájlt vár)
# ────────────────────────────────────────────────────────────────────────────
if (-not (Test-Path (Split-Path $pfxPath))) {
    New-Item -ItemType Directory -Path (Split-Path $pfxPath) -Force | Out-Null
}

$securePwd = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
Export-PfxCertificate `
    -Cert $cert `
    -FilePath $pfxPath `
    -Password $securePwd | Out-Null

Write-Host "✅ PFX exportálva: $pfxPath" -ForegroundColor Green

# ────────────────────────────────────────────────────────────────────────────
# 4. Installálás a Trusted Root / Trusted Publishers store-ba
#    (enélkül a SmartScreen 'Unknown publisher'-t mutat a saját gépünkön is)
# ────────────────────────────────────────────────────────────────────────────
Write-Host "Installálás Trusted Publishers store-ba (a saját gépre)…" -ForegroundColor Cyan
$store = Get-Item Cert:\CurrentUser\TrustedPublisher
$store.Open("ReadWrite")
$store.Add($cert)
$store.Close()
Write-Host "✅ Hozzáadva a Trusted Publishers-hez." -ForegroundColor Green

# ────────────────────────────────────────────────────────────────────────────
# 5. Tauri.conf.json frissítés — instrukció
# ────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Következő lépés — apps/desktop/src-tauri/tauri.conf.json:" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host 'A "bundle" objektumba vedd fel:' -ForegroundColor White
Write-Host ""
Write-Host '  "windows": {' -ForegroundColor Gray
Write-Host "    `"certificateThumbprint`": `"$($cert.Thumbprint)`"," -ForegroundColor Green
Write-Host '    "digestAlgorithm": "sha256",' -ForegroundColor Gray
Write-Host '    "timestampUrl": "http://timestamp.digicert.com"' -ForegroundColor Gray
Write-Host '  }' -ForegroundColor Gray
Write-Host ""
Write-Host "Utána futtasd: npm run desktop:build — az MSI már alá van írva." -ForegroundColor White
Write-Host ""
Write-Host "⚠ Biztonsági jegyzet:" -ForegroundColor Yellow
Write-Host "  - A PFX jelszó '$pfxPassword' — CSAK fejlesztői, cseréld le production előtt."
Write-Host "  - A PFX fájl az ops/ alatt van; adjunk .gitignore-ba."
Write-Host "  - A self-signed cert SmartScreen-warning-ot eredményez éles"
Write-Host "    telepítésnél. EV vagy OV cert (Azure Trusted Signing / SignPath)"
Write-Host "    szükséges a 'Verified publisher' státuszhoz."
