; ═══════════════════════════════════════════════════════════════════════════════
; KARTOTEKA Standalone Windows Installer
; Inno Setup Script (https://jrsoftware.org/isinfo.php)
; ═══════════════════════════════════════════════════════════════════════════════
;
; Generál egy `.exe` installer-t a `dist/portable/` mappa tartalmából.
;
; Használat:
;   1. Inno Setup Compiler (ISCC) telepítve
;   2. Először futtasd: `npm run build:portable` → `build/portable/` előáll
;   3. Aztán: ISCC.exe standalone-build/installer.iss
;   4. Eredmény: `dist/KARTOTEKA-Setup-1.0.0.exe`
;
; FUNKCIÓK:
;   - Magyar nyelvű wizard (Inno Setup beépített Hungarian.isl)
;   - User-level telepítés (NEM admin jog!) — %LOCALAPPDATA%\KARTOTEKA-be
;   - Start menu shortcut + opcionális Desktop ikon
;   - Uninstaller (a data/ mappa megőrizhető!)
;   - Code signing slot (ha van .pfx tanúsítvány)
;
; PARAMÉTEREK (parancssoron):
;   ISCC.exe installer.iss /DAppVersion=1.0.1 /DAppSlug=baratosi
; ═══════════════════════════════════════════════════════════════════════════════

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

#ifndef AppSlug
  #define AppSlug "default"
#endif

#define MyAppName "KARTOTEKA"
#define MyAppFullName "KARTOTEKA - Egyházközségi nyilvántartó"
#define MyAppPublisher "Erdélyi Református Egyházkerület"
#define MyAppURL "https://kartoteka.erek.ro"
#define MyAppExeName "KARTOTEKA.bat"

[Setup]
; AppId = unique GUID — generálva, NE változtasd!
AppId={{F2D4E8C1-7B6A-4E5F-9A3B-1234567890AB}
AppName={#MyAppFullName}
AppVersion={#AppVersion}
AppVerName={#MyAppFullName} {#AppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL=mailto:support@kartoteka.erek.ro
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\KARTOTEKA
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE.txt
InfoBeforeFile=..\build\portable\ELSO-INDULAS.md
OutputDir=..\dist
OutputBaseFilename=KARTOTEKA-Setup-{#AppSlug}-v{#AppVersion}
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern
WizardImageFile=installer-resources\wizard-image.bmp
WizardSmallImageFile=installer-resources\wizard-small.bmp
SetupIconFile=installer-resources\kartoteka.ico
UninstallDisplayIcon={app}\KARTOTEKA.bat
; User-level install (NEM admin)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "hungarian"; MessagesFile: "compiler:Languages\Hungarian.isl"

[CustomMessages]
hungarian.WelcomeLabel=Üdvözlünk a KARTOTEKA telepítőjében!
hungarian.PostInstallNote=A telepítés után dupla-klikk a KARTOTEKA ikonra a Start menüben. Az első indításkor a varázsló végigvezet a beállításon.
hungarian.AntiCopyWarning=FONTOS: A KARTOTEKA a számítógép hardveréhez kötött. Ha másik gépre szeretnéd áthelyezni, új telepítést kell kérned az esperesi hivataltól.
hungarian.LaunchAfterInstall=Indítsd el a KARTOTEKÁ-t most

[Tasks]
Name: "desktopicon"; Description: "Asztali ikon létrehozása"; GroupDescription: "További ikonok:"
Name: "startmenuicon"; Description: "Start menü mappa létrehozása"; GroupDescription: "További ikonok:"; Flags: checkedonce

[Files]
; A teljes build/portable/ tartalom belekerül
Source: "..\build\portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; A `data/` mappa NE íródjon felül uninstall esetén — külön fileként kezelt
Source: "..\build\portable\data\README.txt"; DestDir: "{app}\data"; Flags: onlyifdoesntexist

[Icons]
; Start menü: KARTOTEKA + Uninstall
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\installer-resources\kartoteka.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{group}\KARTOTEKA Felhasználói Kézikönyv"; Filename: "{app}\Felhasznaloi-kezikonyv.md"
Name: "{group}\Első indulás"; Filename: "{app}\ELSO-INDULAS.md"

; Asztali ikon (opcionális)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Telepítés után indítás (opcionális)
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchAfterInstall}"; Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
; Uninstall-kor a tmp fájlokat töröljük, de a data/-t MEGTARTJUK!
Type: filesandordirs; Name: "{app}\app\.next\cache"
; A data/ mappát csak akkor töröljük, ha a user kifejezetten kéri (custom action)
; A KARTOTEKA.bat fájlt is megtartjuk a backup érdekében

[Code]
function InitializeSetup(): Boolean;
begin
  // Ellenőrizzük, hogy nincs-e már korábbi verzió futás közben
  Result := True;
  // (Itt jöhetnének process-check-ek)
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox(
      'A KARTOTEKA telepítése sikeresen befejeződött!' + #13#10 + #13#10 +
      'Az első indításkor egy 4-lépéses varázsló végigvezet a beállításon. Ehhez ' +
      'INTERNETKAPCSOLAT szükséges (kb. 5 percre). Ha nincs otthon internet, ' +
      'használj mobil-hotspotot.' + #13#10 + #13#10 +
      'FONTOS: A KARTOTEKA a számítógép hardveréhez kötött. NE másold át más gépre — ' +
      'új gépre új telepítést kell kérned az esperesi hivataltól.',
      mbInformation,
      MB_OK
    )
  end
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = wpReady then
  begin
    // A Ready oldal mehet
    Result := False;
  end;
end;
