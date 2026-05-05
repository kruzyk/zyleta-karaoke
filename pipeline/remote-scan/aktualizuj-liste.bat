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
    echo  Aktualizacja nie powiodla sie.
    echo  Szczegoly bledu znajdziesz w pliku: scan-log.txt
    echo  (w tym samym folderze co ten skrypt)
    echo.
    pause
    exit /b 1
)

echo.
echo  Lista plikow wyslana. Uruchamiam workflow Process Song List...
echo.

powershell -ExecutionPolicy Bypass -Command ^
  "$token = (Get-Content '%~dp0scan-config.json' -Raw | ConvertFrom-Json).githubToken; " ^
  "$repo = (Get-Content '%~dp0scan-config.json' -Raw | ConvertFrom-Json).githubRepo; " ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "$headers = @{ 'Authorization' = \"Bearer $token\"; 'Accept' = 'application/vnd.github.v3+json'; 'User-Agent' = 'ZyletaKaraoke/1.0' }; " ^
  "$body = '{\"ref\":\"master\",\"inputs\":{\"force_refresh\":\"false\"}}'; " ^
  "try { " ^
  "  Invoke-RestMethod -Uri \"https://api.github.com/repos/$repo/actions/workflows/update-songs.yml/dispatches\" -Headers $headers -Method Post -Body $body -ContentType 'application/json'; " ^
  "  Write-Host '  Workflow uruchomiony!' -ForegroundColor Green; " ^
  "  Write-Host '  Postep: https://github.com/$repo/actions' -ForegroundColor Gray; " ^
  "} catch { " ^
  "  Write-Host '  UWAGA: Nie udalo sie uruchomic workflow automatycznie.' -ForegroundColor Yellow; " ^
  "  Write-Host '  Sprawdz czy token ma uprawnienie Actions: Read and write.' -ForegroundColor Yellow; " ^
  "  Write-Host \"  $($_.Exception.Message)\" -ForegroundColor Red; " ^
  "}"

echo.
echo  Gotowe!
echo.
pause
