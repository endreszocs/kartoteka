@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Kartoteka - Resend email szolgáltató telepítése

echo.
echo ========================================================
echo   KARTOTEKA - Resend email szolgáltató telepítése
echo ========================================================
echo.
echo Ez a script telepíti a Resend csomagot a Kartoteka
echo alkalmazás fejlesztői környezetébe, hogy a broadcast
echo üzenetek email-ben is kézbesíthetők legyenek.
echo.

rem Ellenőrizzük, hogy a Kartoteka mappában vagyunk-e
if not exist package.json (
  echo.
  echo [HIBA] Nem találom a package.json fájlt.
  echo.
  echo Kérem másolja ezt a scriptet a Kartoteka fejlesztői
  echo mappába ^(ott, ahol a package.json fájl található,
  echo pl. D:\Egyházi APP\KARTOTEKA\^), majd futtassa újra.
  echo.
  pause
  exit /b 1
)

rem Ellenőrizzük, hogy ez tényleg a Kartoteka
findstr /C:"kartoteka-app" package.json >nul
if errorlevel 1 (
  echo.
  echo [HIBA] Ez nem a Kartoteka mappa ^(kartoteka-app nem található a package.json-ben^).
  echo.
  pause
  exit /b 1
)

rem Ellenőrizzük a Node.js-t
where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo [HIBA] A Node.js/npm nincs telepítve vagy nincs a PATH-ban.
  echo.
  echo Kérem telepítse a Node.js-t ^(https://nodejs.org/^) majd futtassa újra.
  echo.
  pause
  exit /b 1
)

echo [INFO] A Node.js és npm elérhető.
echo [INFO] Csomag telepítése: resend ^(^^4.0.1^)...
echo.

call npm install resend@^4.0.1

if errorlevel 1 (
  echo.
  echo [HIBA] A telepítés sikertelen.
  echo.
  echo Lehetséges okok:
  echo   - nincs internet kapcsolat
  echo   - az npm proxy rosszul van beállítva
  echo   - nincs jogosultság a node_modules mappához
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo   TELEPÍTÉS SIKERES!
echo ========================================================
echo.
echo Következő lépések:
echo.
echo   1. Hozzon létre egy fiókot a https://resend.com oldalon
echo      ^(EU régiót válasszon a GDPR-nak megfelelően^).
echo.
echo   2. A Resend dashboard-on:
echo      - Igazolja a küldő domaint ^(DKIM, SPF rekordok^)
echo      - Generáljon egy API kulcsot ^(Settings ^> API Keys^)
echo.
echo   3. Szerkessze a .env.local fájlt és adja hozzá:
echo.
echo      RESEND_API_KEY=re_valami_ide
echo      RESEND_FROM=Kartoteka ^<noreply@domain.ro^>
echo.
echo   4. Indítsa újra a fejlesztői szervert:
echo.
echo      npm run dev
echo.
echo Ha email nélkül is jól működik a broadcast ^(csak csengő^),
echo akkor ezt a lépést nyugodtan átugorhatja.
echo.
pause
endlocal
