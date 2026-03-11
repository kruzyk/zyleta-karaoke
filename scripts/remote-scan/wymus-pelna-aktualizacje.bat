@echo off
chcp 65001 >nul
echo.
echo  ======================================
echo    ZYLETA KARAOKE - PELNA AKTUALIZACJA
echo  ======================================
echo.
echo  UWAGA: Ten skrypt wymusza ponowne pobranie
echo  danych z MusicBrainz dla WSZYSTKICH piosenek.
echo  Przy duzej bazie moze to potrwac kilka godzin.
echo.
echo  Uzyj tego skryptu TYLKO jesli chcesz odswiezyc
echo  metadane (kraj, rok) istniejacych piosenek.
echo.
echo  Do zwyklej aktualizacji uzyj: aktualizuj-liste.bat
echo.

set /p CONFIRM="Czy na pewno chcesz kontynuowac? (T/N): "
if /i not "%CONFIRM%"=="T" (
    echo  Anulowano.
    pause
    exit /b 0
)

echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  BLAD: PowerShell nie jest zainstalowany!
    pause
    exit /b 1
)

if not exist "%~dp0scan-and-upload.ps1" (
    echo  BLAD: Nie znaleziono pliku scan-and-upload.ps1!
    pause
    exit /b 1
)

if not exist "%~dp0scan-config.json" (
    echo  BLAD: Nie znaleziono pliku scan-config.json!
    pause
    exit /b 1
)

REM Run scan + upload, then trigger force-refresh workflow
powershell -ExecutionPolicy Bypass -File "%~dp0scan-and-upload.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo  Aktualizacja nie powiodla sie.
    echo  Szczegoly bledu w pliku: scan-log.txt
    pause
    exit /b 1
)

echo.
echo  Lista plikow wyslana. Teraz uruchamiam workflow z --force...
echo.

powershell -ExecutionPolicy Bypass -Command ^
  "$token = (Get-Content '%~dp0scan-config.json' -Raw | ConvertFrom-Json).githubToken; " ^
  "$repo = (Get-Content '%~dp0scan-config.json' -Raw | ConvertFrom-Json).githubRepo; " ^
  "$headers = @{ 'Authorization' = \"Bearer $token\"; 'Accept' = 'application/vnd.github.v3+json'; 'User-Agent' = 'ZyletaKaraoke/1.0' }; " ^
  "$body = '{\"ref\":\"master\",\"inputs\":{\"force_refresh\":\"true\"}}'; " ^
  "try { " ^
  "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "  Invoke-RestMethod -Uri \"https://api.github.com/repos/$repo/actions/workflows/update-songs.yml/dispatches\" -Headers $headers -Method Post -Body $body -ContentType 'application/json'; " ^
  "  Write-Host '  Workflow force-refresh uruchomiony!' -ForegroundColor Green; " ^
  "  Write-Host '  Sprawdz postep na: https://github.com/$repo/actions' -ForegroundColor Gray; " ^
  "} catch { " ^
  "  Write-Host '  UWAGA: Nie udalo sie uruchomic workflow.' -ForegroundColor Yellow; " ^
  "  Write-Host '  Workflow uruchomi sie automatycznie po pushu.' -ForegroundColor Yellow; " ^
  "  Write-Host \"  $($_.Exception.Message)\" -ForegroundColor Red; " ^
  "}"

echo.
pause
