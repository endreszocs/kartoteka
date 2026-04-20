# Inno Setup Installer Resources

Ez a mappa az `installer.iss` Inno Setup script-hez tartozó **vizuális** és **brand** asseteket tartalmazza.

## Szükséges fájlok

### `kartoteka.ico` (ikon, 256x256 ICO)

A telepített alkalmazás ikonja a Start menüben, asztali shortcuton és a Vezérlőpult → Programok eltávolítása listában.

**Generálás**:
```powershell
# Pl. egy 1024x1024 PNG-ből konvertálás:
# Online: https://convertio.co/png-ico/
# Vagy: ImageMagick: magick convert kartoteka.png -define icon:auto-resize=256,128,64,48,32,16 kartoteka.ico
```

### `wizard-image.bmp` (164x314 BMP)

A telepítő wizard oldalsáv-képe (24-bit BMP, NEM PNG!).

**Generálás**:
- Egy 164x314 pixel képet készíts (Photoshop, GIMP, Figma)
- Mentés mint `wizard-image.bmp` (24-bit, no compression)

**Tartalma javasolt**:
- Felül: KARTOTEKA logo + felirat
- Középen: ima/templom motívum (csendes, nem disztraktáló)
- Alul: "Erdélyi Református Egyházkerület"

### `wizard-small.bmp` (55x58 BMP)

A wizard fejlécében megjelenő kis ikon. 55x58 pixel, 24-bit BMP.

**Generálás**:
- Az `kartoteka.ico` 48x48 vagy 32x32 verziójának BMP-vé konvertálása
- 55x58-ra méretezve, fehér háttérrel középen

## Build folyamat

A `installer.iss` ezeket az asseteket olvassa be a build során:

```iss
WizardImageFile=installer-resources\wizard-image.bmp
WizardSmallImageFile=installer-resources\wizard-small.bmp
SetupIconFile=installer-resources\kartoteka.ico
```

Ha a fájlok hiányoznak, az ISCC.exe error-t ad. A jelenlegi MVP-ben **placeholder** fájlok szükségesek (akár csak egyszín képek).

## Code Signing (opcionális)

Ha Microsoft authenticode tanúsítványod van (`.pfx` fájl):

```iss
; Az [Setup] szekcióhoz add hozzá:
SignTool=mysigner sign /f "C:\path\to\cert.pfx" /p "PASSWORD" /t http://timestamp.digicert.com $f
```

Tanúsítvány-szolgáltatók:
- DigiCert (~$300/év)
- Sectigo (~$200/év)
- Egyházi/non-profit kedvezmények: kérdezd meg!

A code signing előnyei:
- A Windows nem jelez "Unknown Publisher" warningot
- A SmartScreen filter nem blokkolja
- A felhasználók megbíznak benne

---

**Készítette**: KARTOTEKA Devops Team
