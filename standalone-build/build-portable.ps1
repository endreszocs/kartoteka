# =============================================================================
# KARTOTEKA Standalone Portable Build Script
# =============================================================================
#
# Generál egy `KARTOTEKA-<slug>-v<version>.zip` csomagot, amely tartalmaz:
#   - portable Node.js runtime (Windows x64)
#   - Next.js standalone build (.next/standalone)
#   - SQLite migrációk
#   - KARTOTEKA.bat launcher
#   - Felhasználói dokumentáció (markdown)
#
# Használat:
#   .\standalone-build\build-portable.ps1 -Slug "default" -Version "1.0.0"
#   .\standalone-build\build-portable.ps1 -Slug "baratosi" -Version "1.0.1"
#
# A kimeneti ZIP a `dist/` mappába kerül.
# =============================================================================

param(
  [string]$Slug = "default",
  [string]$Version = "1.0.0",
  [string]$NodeVersion = "20.18.0",
  [switch]$SkipBuild = $false,
  [switch]$SkipNodeDownload = $false
)

$ErrorActionPreference = "Stop"

# Paths
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$BuildDir = Join-Path $RepoRoot "build\portable"
$DistDir = Join-Path $RepoRoot "dist"
$CacheDir = Join-Path $RepoRoot "build\.cache"
$NodeArchive = "node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchive"
$OutputZip = Join-Path $DistDir "KARTOTEKA-$Slug-v$Version.zip"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " KARTOTEKA Standalone Portable Build" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Slug:    $Slug"
Write-Host "  Version: $Version"
Write-Host "  Node:    v$NodeVersion (win-x64)"
Write-Host "  Output:  $OutputZip"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Tisztítás
# ---------------------------------------------------------------------------
Write-Host "[1/7] Build mappa tisztítása..." -ForegroundColor Yellow
if (Test-Path $BuildDir) {
  Remove-Item -Recurse -Force $BuildDir
}
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null

# ---------------------------------------------------------------------------
# 2. Next.js standalone build (ha nincs SkipBuild)
# ---------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Host "[2/7] Next.js standalone build..." -ForegroundColor Yellow
  Push-Location $RepoRoot
  $env:KARTOTEKA_STANDALONE = "true"
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Build sikertelen!" -ForegroundColor Red
    exit 1
  }
  Pop-Location
} else {
  Write-Host "[2/7] Next.js build kihagyva (-SkipBuild)" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# 3. Standalone fájlok másolása
# ---------------------------------------------------------------------------
Write-Host "[3/7] Standalone fájlok másolása..." -ForegroundColor Yellow

$AppDir = Join-Path $BuildDir "app"
$StandaloneSrc = Join-Path $RepoRoot ".next\standalone"
$StaticSrc = Join-Path $RepoRoot ".next\static"
$PublicSrc = Join-Path $RepoRoot "public"

if (-not (Test-Path $StandaloneSrc)) {
  Write-Host "ERROR: .next/standalone nem létezik. Futtass elősőre 'npm run build'-et." -ForegroundColor Red
  exit 1
}

# Standalone tartalmak
Copy-Item -Recurse $StandaloneSrc -Destination $AppDir
# .next/static külön kell
$StaticDest = Join-Path $AppDir ".next\static"
if (-not (Test-Path $StaticDest)) {
  New-Item -ItemType Directory -Path (Split-Path $StaticDest) -Force | Out-Null
}
Copy-Item -Recurse $StaticSrc -Destination $StaticDest -Force
# Public
Copy-Item -Recurse $PublicSrc -Destination (Join-Path $AppDir "public") -Force

# SQLite migrations (ha NFT trace nem hozta volna)
$MigrationsDest = Join-Path $AppDir "lib\standalone\sqlite-migrations"
if (-not (Test-Path $MigrationsDest)) {
  New-Item -ItemType Directory -Path $MigrationsDest -Force | Out-Null
  Copy-Item -Recurse (Join-Path $RepoRoot "lib\standalone\sqlite-migrations\*") -Destination $MigrationsDest -Force
}

# ---------------------------------------------------------------------------
# 4. Portable Node.js letöltés és kicsomagolás
# ---------------------------------------------------------------------------
Write-Host "[4/7] Portable Node.js előkészítése..." -ForegroundColor Yellow

$NodeCache = Join-Path $CacheDir $NodeArchive
$RuntimeDir = Join-Path $BuildDir "runtime"
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

if (-not $SkipNodeDownload) {
  if (-not (Test-Path $NodeCache)) {
    Write-Host "  Letöltés: $NodeUrl"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeCache
  } else {
    Write-Host "  Cache hit: $NodeCache"
  }

  Write-Host "  Kicsomagolás..."
  Expand-Archive -Path $NodeCache -DestinationPath $RuntimeDir -Force
}

# ---------------------------------------------------------------------------
# 5. KARTOTEKA.bat launcher
# ---------------------------------------------------------------------------
Write-Host "[5/7] Launcher BAT generálása..." -ForegroundColor Yellow

$BatContent = @"
@echo off
title KARTOTEKA - $Slug v$Version
chcp 65001 >nul
cd /d "%~dp0"
set KARTOTEKA_STANDALONE=true
set NODE_ENV=production
set PORT=3000
set HOSTNAME=127.0.0.1

echo.
echo  ===================================================
echo   KARTOTEKA - Egyhazkozsegi nyilvantarto rendszer
echo   Verzio: $Version
echo  ===================================================
echo.
echo   Bongeszo automatikusan megnyilik.
echo   NE ZARD BE EZT AZ ABLAKOT amig hasznalod!
echo.
echo   Probleme eseten:
echo     support@kartoteka.erek.ro
echo.
echo  ===================================================
echo.

REM Bongeszo megnyitasa 3 masodperc varakozas utan (Node induljon eloszor)
start /b "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

REM Node.js futtatas
runtime\node-v$NodeVersion-win-x64\node.exe app\server.js

echo.
echo  KARTOTEKA leallt. Bezarhatod ezt az ablakot.
pause
"@

$BatPath = Join-Path $BuildDir "KARTOTEKA.bat"
[System.IO.File]::WriteAllText($BatPath, $BatContent, [System.Text.Encoding]::Default)

# ---------------------------------------------------------------------------
# 6. Dokumentumok másolása
# ---------------------------------------------------------------------------
Write-Host "[6/7] Dokumentumok másolása..." -ForegroundColor Yellow

$DocsSrc = Join-Path $RepoRoot "docs\user-guide"
if (Test-Path $DocsSrc) {
  Copy-Item -Recurse $DocsSrc -Destination (Join-Path $BuildDir "docs") -Force

  # Top-level shortcut a fontos dokumentumokra
  Copy-Item (Join-Path $DocsSrc "KARTOTEKA-elso-indulas.md") -Destination (Join-Path $BuildDir "ELSO-INDULAS.md") -Force
  Copy-Item (Join-Path $DocsSrc "KARTOTEKA-felhasznaloi-kezikonyv.md") -Destination (Join-Path $BuildDir "Felhasznaloi-kezikonyv.md") -Force
  Copy-Item (Join-Path $DocsSrc "KARTOTEKA-gyorsreferencia-kartya.md") -Destination (Join-Path $BuildDir "Gyorsreferencia.md") -Force
}

# Default .env (üres, a wizard tölti ki)
$EnvContent = @"
# KARTOTEKA Standalone konfiguráció
# Ezeket a változókat a wizard tölti ki — NE módosítsd kézzel!

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
"@
$EnvPath = Join-Path $BuildDir "app\.env.production"
if (-not (Test-Path $EnvPath)) {
  [System.IO.File]::WriteAllText($EnvPath, $EnvContent, [System.Text.Encoding]::UTF8)
}

# Üres data mappa (a wizard ide tölti az adatbázist)
$DataDir = Join-Path $BuildDir "data"
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DataDir "backups\daily") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DataDir "backups\monthly") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DataDir "backups\pre-sync") -Force | Out-Null
"# Itt tárolódnak a gyülekezeti adataid. NE töröld ezt a mappát!" | Out-File -FilePath (Join-Path $DataDir "README.txt") -Encoding UTF8

# ---------------------------------------------------------------------------
# 7. ZIP csomagolás
# ---------------------------------------------------------------------------
Write-Host "[7/7] ZIP csomagolás..." -ForegroundColor Yellow

if (Test-Path $OutputZip) {
  Remove-Item $OutputZip -Force
}

# Compress-Archive: a build mappa TARTALMÁT csomagolja (* glob)
Compress-Archive -Path "$BuildDir\*" -DestinationPath $OutputZip -CompressionLevel Optimal

$Size = (Get-Item $OutputZip).Length / 1MB

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host " ✅ Build kész!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Fájl:  $OutputZip"
Write-Host "  Méret: $([math]::Round($Size, 2)) MB"
Write-Host ""
Write-Host "Telepítés lelkésznél:"
Write-Host "  1. ZIP kicsomagolása egy mappába (pl. C:\KARTOTEKA)"
Write-Host "  2. Internet csatlakozás (egyszer az aktivációhoz)"
Write-Host "  3. Dupla-klikk: KARTOTEKA.bat"
Write-Host "  4. A wizard végigvezet a beállításon"
Write-Host ""
