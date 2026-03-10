@echo off
chcp 65001 >nul
echo.
echo  ======================================
echo    ZYLETA KARAOKE - Aktualizacja listy
echo  ======================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  BLAD: PowerShell nie jest zainstalowany!
    echo  Ten skrypt wymaga Windows PowerShell.
    echo.
    pause
    exit /b 1
)

REM Check if the .ps1 script exists next to this .bat
if not exist "%~dp0scan-and-upload.ps1" (
    echo  BLAD: Nie znaleziono pliku scan-and-upload.ps1!
    echo  Upewnij sie, ze scan-and-upload.ps1 jest w tym samym folderze co ten plik.
    echo.
    pause
    exit /b 1
)

REM Check if config exists
if not exist "%~dp0scan-config.json" (
    echo  BLAD: Nie znaleziono pliku konfiguracyjnego scan-config.json!
    echo.
    echo  Skopiuj scan-config.example.json jako scan-config.json
    echo  i uzupelnij dane: sciezke do folderu z piosenkami i GitHub token.
    echo.
    pause
    exit /b 1
)

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0scan-and-upload.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo  Aktualizacja nie powiodla sie. Sprawdz komunikaty powyzej.
) else (
    echo.
    echo  Gotowe!
)

echo.
pause
