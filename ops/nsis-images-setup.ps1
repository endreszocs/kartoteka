# Kartoteka Desktop — NSIS installer banner-kepek generalasa
# ============================================================================
# Az NSIS MUI (Modern UI) installer ket grafikai elemet var:
#   - headerImage (150 x 57 BMP)    — a telepito tetejen, minden lapon latszik
#   - sidebarImage (164 x 314 BMP)  — a welcome es finish lapon, bal oldalt
#
# Mindkettotnek BMP formatum, 24-bit szin, fekete hatter kivetelevel.
#
# Ez a script a KARTOTEKA_V3.png forras-ikonbol generalja le mindkettotet,
# beleilleszve a fekete KARTOTEKA-szin hatterbe.
#
# Futtatas (egyszeri, vagy ha uj logo jon):
#   cd "C:\Users\endre\Documents\APPS\Egyhazi APP\KARTOTEKA"
#   .\ops\nsis-images-setup.ps1
#
# A generalt fajlok:
#   apps\desktop\src-tauri\icons\nsis-header.bmp
#   apps\desktop\src-tauri\icons\nsis-sidebar.bmp
# ============================================================================

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sourceIcon = Join-Path $PSScriptRoot "..\icon\KARTOTEKA_V3.png"
$iconsDir = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\icons"
$headerBmp = Join-Path $iconsDir "nsis-header.bmp"
$sidebarBmp = Join-Path $iconsDir "nsis-sidebar.bmp"

if (-not (Test-Path $sourceIcon)) {
    Write-Host "[!] Forras-ikon nem talalhato: $sourceIcon" -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
# Szín-schéma a KARTOTEKA design-rendszer alapjan
# ----------------------------------------------------------------------------
# Háttér: sötét indigo (a Tauri splash + theme-color alapja)
#   - theme_color a manifest.json-ben: #1e1b4b
# Logó-szín: fehér áttetsző overlay (a logó már violet színű)

$bgColor = [System.Drawing.ColorTranslator]::FromHtml("#1e1b4b")  # indigo-950

# ----------------------------------------------------------------------------
# Segéd fv: BMP elokészítés megadott mérettel + center-elhelyezett logóval
# ----------------------------------------------------------------------------
function Create-NsisImage {
    param(
        [int]$Width,
        [int]$Height,
        [string]$OutputPath,
        [int]$LogoHeight
    )

    $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Háttér kitöltés
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $graphics.FillRectangle($brush, 0, 0, $Width, $Height)
    $brush.Dispose()

    # Logó betöltés
    $logo = [System.Drawing.Image]::FromFile((Resolve-Path $sourceIcon))
    $logoRatio = $logo.Width / $logo.Height
    $logoW = [int]($LogoHeight * $logoRatio)
    $logoX = [int](($Width - $logoW) / 2)
    $logoY = [int](($Height - $LogoHeight) / 2)

    $graphics.DrawImage($logo, $logoX, $logoY, $logoW, $LogoHeight)
    $logo.Dispose()

    # BMP 24-bit mentés (az NSIS nem szereti az alpha-t)
    $bmp24 = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g24 = [System.Drawing.Graphics]::FromImage($bmp24)
    $g24.DrawImage($bmp, 0, 0, $Width, $Height)
    $bmp24.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

    $graphics.Dispose()
    $bmp.Dispose()
    $g24.Dispose()
    $bmp24.Dispose()

    Write-Host "[OK] Letrehozva: $OutputPath ($Width x $Height BMP)" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# Header: 150 x 57 BMP (minden telepito-lapon latszik)
# ----------------------------------------------------------------------------
Write-Host "Header image generalasa..." -ForegroundColor Cyan
Create-NsisImage -Width 150 -Height 57 -OutputPath $headerBmp -LogoHeight 50

# ----------------------------------------------------------------------------
# Sidebar: 164 x 314 BMP (welcome + finish lapon, bal oldal)
# ----------------------------------------------------------------------------
Write-Host "Sidebar image generalasa..." -ForegroundColor Cyan
Create-NsisImage -Width 164 -Height 314 -OutputPath $sidebarBmp -LogoHeight 150

Write-Host ""
Write-Host "===================================================================="
Write-Host "Kesz. Kovetkezo: npm run desktop:build" -ForegroundColor Green
Write-Host "===================================================================="
