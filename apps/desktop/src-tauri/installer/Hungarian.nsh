; Kartotéka — Tauri NSIS magyar fordítás (v0.5.3, 2026-04-25).
;
; A Tauri-bundler a saját PageReinstall + WebView2-installer + uninstaller-CheckBox
; oldalain saját LangString-eket használ ($(addOrReinstall), $(deleteAppData) stb.),
; amelyek a kichik/nsis Hungarian.nsh-ban nincsenek lefordítva. Emiatt eddig egyes
; ablakok címkéi (telepítő 2. oldal: rádiógomb-feliratok, telepítő 3. oldal:
; eltávolító-checkbox „Felhasználói adatok törlése") **üresen** jelentek meg.
;
; Ezt a fájlt a `tauri.conf.json > bundle > windows > nsis > customLanguageFiles`
; mezőben kell hivatkozni, és a Tauri MUI_LANGUAGE betöltés UTÁN tölti be —
; tehát az itt definiált string-ek a default-okat felülírják.
;
; UTF-8 (with BOM) — különben az ékezetek el-kódolódnak.

; ──────────────────────────────────────────────────────────────────────────
; PageReinstall — telepítő 2. oldal (verzió-eltérés esetén)
; ──────────────────────────────────────────────────────────────────────────
LangString alreadyInstalled         ${LANG_HUNGARIAN} "Már telepítve van"
LangString alreadyInstalledLong     ${LANG_HUNGARIAN} "A ${PRODUCTNAME} ${VERSION} már telepítve van. Mit szeretnél tenni?"
LangString chooseMaintenanceOption  ${LANG_HUNGARIAN} "Válassz karbantartási műveletet — vagy zárd be a telepítőt."
LangString choowHowToInstall        ${LANG_HUNGARIAN} "Válaszd ki, hogyan telepítsd."
LangString addOrReinstall           ${LANG_HUNGARIAN} "Komponensek hozzáadása vagy újratelepítése"
LangString uninstallApp             ${LANG_HUNGARIAN} "Alkalmazás eltávolítása"
LangString uninstallBeforeInstalling ${LANG_HUNGARIAN} "A telepítés előtt eltávolítja a régi verziót"
LangString dontUninstall            ${LANG_HUNGARIAN} "Felülírás eltávolítás nélkül (gyorsabb)"
LangString dontUninstallDowngrade   ${LANG_HUNGARIAN} "Felülírás eltávolítás nélkül (visszafelé verzióra váltás nem támogatott)"
LangString olderOrUnknownVersionInstalled ${LANG_HUNGARIAN} "Régebbi vagy ismeretlen verzió van telepítve."
LangString newerVersionInstalled    ${LANG_HUNGARIAN} "Újabb verzió van már telepítve a számítógépen."
LangString older                    ${LANG_HUNGARIAN} "régebbi"
LangString unknown                  ${LANG_HUNGARIAN} "ismeretlen"
LangString silentDowngrades         ${LANG_HUNGARIAN} "A csendes telepítés nem támogatja a visszafelé verzióra váltást."
LangString unableToUninstall        ${LANG_HUNGARIAN} "Nem sikerült eltávolítani a régi verziót."

; ──────────────────────────────────────────────────────────────────────────
; Telepítési opciók — Asztali parancsikon
; ──────────────────────────────────────────────────────────────────────────
LangString createDesktop            ${LANG_HUNGARIAN} "Asztali parancsikon létrehozása"

; ──────────────────────────────────────────────────────────────────────────
; WebView2 telepítő (függőség)
; ──────────────────────────────────────────────────────────────────────────
LangString installingWebview2       ${LANG_HUNGARIAN} "WebView2 telepítése folyamatban — kérlek várj…"
LangString webview2Downloading      ${LANG_HUNGARIAN} "WebView2 telepítő letöltése…"
LangString webview2DownloadSuccess  ${LANG_HUNGARIAN} "WebView2 telepítő letöltése sikeres."
LangString webview2DownloadError    ${LANG_HUNGARIAN} "Hiba a WebView2 telepítő letöltése közben."
LangString webview2InstallSuccess   ${LANG_HUNGARIAN} "WebView2 sikeresen telepítve."
LangString webview2InstallError     ${LANG_HUNGARIAN} "Hiba a WebView2 telepítése közben."
LangString webview2AbortError       ${LANG_HUNGARIAN} "A WebView2 telepítése nem sikerült — megszakítás."

; ──────────────────────────────────────────────────────────────────────────
; Eltávolító — telepítő 3. oldal (uninstaller)
; ──────────────────────────────────────────────────────────────────────────
LangString deleteAppData            ${LANG_HUNGARIAN} "Felhasználói adatok törlése (lokális adatbázis, beállítások)"

; ──────────────────────────────────────────────────────────────────────────
; Futó alkalmazás detektálás
; ──────────────────────────────────────────────────────────────────────────
LangString appRunning               ${LANG_HUNGARIAN} "A ${PRODUCTNAME} jelenleg fut. Zárd be a folytatáshoz."
LangString appRunningOkKill         ${LANG_HUNGARIAN} "A ${PRODUCTNAME} jelenleg fut. Bezárhatja a telepítő automatikusan?"
LangString failedToKillApp          ${LANG_HUNGARIAN} "Nem sikerült bezárni a ${PRODUCTNAME} alkalmazást. Zárd be kézzel és próbáld újra."
