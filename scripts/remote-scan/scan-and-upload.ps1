# ============================================
# ŻYLETA KARAOKE — Scan & Upload Song List
# ============================================
# This script:
# 1. Reads config from scan-config.json (same folder as this script)
# 2. Scans one or more karaoke folders for media files
# 3. Uploads the file list to GitHub (data/raw-filelist.json)
# 4. GitHub Actions automatically processes it into the final song list
# ============================================

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Logging setup ---
$logFile = Join-Path $scriptDir "scan-log.txt"

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logFile -Value $logLine -Encoding UTF8
    switch ($Level) {
        "ERROR"   { Write-Host "  $Message" -ForegroundColor Red }
        "WARN"    { Write-Host "  $Message" -ForegroundColor Yellow }
        "SUCCESS" { Write-Host "  $Message" -ForegroundColor Green }
        "STEP"    { Write-Host "  $Message" -ForegroundColor Cyan }
        default   { Write-Host "  $Message" }
    }
}

# Start new log session
Add-Content -Path $logFile -Value "" -Encoding UTF8
Add-Content -Path $logFile -Value "============================================" -Encoding UTF8
Write-Log "Rozpoczynam skanowanie i upload"
Write-Log "PowerShell version: $($PSVersionTable.PSVersion)"
Write-Log "OS: $([System.Environment]::OSVersion.VersionString)"

# --- Force TLS 1.2 (older Windows PowerShell defaults to TLS 1.0 which GitHub rejects) ---
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Log "TLS 1.2 wymuszony"
} catch {
    Write-Log "Nie udalo sie wymusic TLS 1.2: $($_.Exception.Message)" "WARN"
}

# --- Load config ---
$configPath = Join-Path $scriptDir "scan-config.json"
if (-not (Test-Path $configPath)) {
    Write-Log "Nie znaleziono pliku konfiguracyjnego: $configPath" "ERROR"
    Write-Log "Skopiuj 'scan-config.example.json' jako 'scan-config.json' i uzupelnij dane." "WARN"
    exit 1
}

try {
    $configRaw = Get-Content $configPath -Raw -Encoding UTF8
    Write-Log "Wczytano config: $configPath"
    $config = $configRaw | ConvertFrom-Json
} catch {
    Write-Log "Blad parsowania scan-config.json: $($_.Exception.Message)" "ERROR"
    Write-Log "Sprawdz czy plik jest poprawnym JSON-em (brak przecinkow na koncu, poprawne cudzyslowy)." "WARN"
    exit 1
}

# --- Resolve folder paths ---
if (-not $config.PSObject.Properties['folderPaths'] -or $config.folderPaths.Count -eq 0) {
    Write-Log "Brak folderPaths w scan-config.json lub tablica jest pusta!" "ERROR"
    Write-Log "Dodaj tablice folderPaths z co najmniej jedna sciezka." "WARN"
    exit 1
}

$folderPaths = @($config.folderPaths)
Write-Log "folderPaths: $($folderPaths.Count) folderow"

$repo = $config.githubRepo
$token = $config.githubToken
$extensions = $config.fileExtensions

foreach ($fp in $folderPaths) {
    Write-Log "  folder: $fp"
}
Write-Log "repo: $repo"
Write-Log "token: $(if ($token) { $token.Substring(0, [Math]::Min(10, $token.Length)) + '...' } else { '(pusty)' })"
Write-Log "extensions: $($extensions -join ', ')"

# --- Validate config ---
if ([string]::IsNullOrWhiteSpace($repo)) {
    Write-Log "githubRepo jest pusty w scan-config.json!" "ERROR"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($token) -or $token -match "^(ghp_x+|github_pat_x+|ghp_XXX|github_pat_XXX)$") {
    Write-Log "Uzupelnij githubToken w scan-config.json!" "ERROR"
    Write-Log "Utworz token: https://github.com/settings/tokens" "WARN"
    exit 1
}

if (-not $extensions -or $extensions.Count -eq 0) {
    Write-Log "fileExtensions jest puste w scan-config.json!" "ERROR"
    exit 1
}

# Validate each folder path exists
$validFolders = @()
foreach ($fp in $folderPaths) {
    if ([string]::IsNullOrWhiteSpace($fp)) {
        Write-Log "Pusta sciezka w folderPaths — pomijam" "WARN"
        continue
    }
    if (-not (Test-Path $fp)) {
        Write-Log "Folder '$fp' nie istnieje — pomijam" "WARN"
        continue
    }
    $validFolders += $fp
}

if ($validFolders.Count -eq 0) {
    Write-Log "Zaden z podanych folderow nie istnieje!" "ERROR"
    Write-Log "Sprawdz sciezki w scan-config.json. Uzyj podwojnych backslashy: D:\\Karaoke\\Songs" "WARN"
    exit 1
}

Write-Log "Poprawnych folderow: $($validFolders.Count) z $($folderPaths.Count)" "STEP"

# --- Scan all folders ---
$files = @()
$totalAllFiles = 0

foreach ($folder in $validFolders) {
    $folderName = Split-Path -Leaf $folder
    Write-Log "Skanuje folder: $folder" "STEP"

    try {
        $allFiles = Get-ChildItem -Path $folder -Recurse -File -ErrorAction Stop
        $totalAllFiles += $allFiles.Count
        Write-Log "  Wszystkich plikow: $($allFiles.Count)"
    } catch {
        Write-Log "Blad skanowania folderu '$folder': $($_.Exception.Message)" "ERROR"
        continue
    }

    $folderFileCount = 0
    $folderRoot = $folder.TrimEnd('\', '/')
    foreach ($f in $allFiles) {
        if ($extensions -contains $f.Extension.ToLower()) {
            $relativePath = $f.FullName.Substring($folderRoot.Length).TrimStart('\', '/')
            $files += @{
                filename     = $f.Name
                relativePath = $relativePath
                sourceFolder = $folderName
                extension    = $f.Extension.ToLower()
                sizeBytes    = $f.Length
            }
            $folderFileCount++
        }
    }

    Write-Log "  Pasujacych plikow muzycznych: $folderFileCount"

    if ($folderFileCount -eq 0) {
        $existingExts = $allFiles | Group-Object { $_.Extension.ToLower() } | Sort-Object Count -Descending | Select-Object -First 5
        foreach ($ext in $existingExts) {
            Write-Log "    Znalezione rozszerzenie: $($ext.Name) - $($ext.Count) plikow"
        }
    }
}

$fileCount = $files.Count

Write-Log "Laczna liczba plikow muzycznych ze wszystkich folderow: $fileCount"

if ($fileCount -eq 0) {
    Write-Log "Nie znaleziono plikow muzycznych w zadnym folderze!" "WARN"
    Write-Log "Sprawdz sciezki i rozszerzenia w scan-config.json" "WARN"
    exit 1
}

Write-Log "Znaleziono $fileCount plikow lacznie" "SUCCESS"

# --- Build JSON payload ---
Write-Log "Buduje JSON payload..." "STEP"

try {
    $payload = @{
        scannedAt    = (Get-Date -Format "o")
        folderPaths  = $validFolders
        totalFiles   = $fileCount
        files        = $files
    } | ConvertTo-Json -Depth 4 -Compress

    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $base64Content = [Convert]::ToBase64String($payloadBytes)

    Write-Log "Payload JSON: $($payloadBytes.Length) bajtow, base64: $($base64Content.Length) znakow"
} catch {
    Write-Log "Blad tworzenia JSON payload: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    exit 1
}

# --- Check if file already exists on GitHub (need SHA for update) ---
Write-Log "Lacze z GitHub..." "STEP"

$apiUrl = "https://api.github.com/repos/$repo/contents/data/raw-filelist.json"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept"        = "application/vnd.github.v3+json"
    "User-Agent"    = "ZyletaKaraoke-Scanner/1.0"
}

Write-Log "API URL: $apiUrl"

$existingSha = $null
try {
    $existing = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get -ErrorAction Stop
    $existingSha = $existing.sha
    Write-Log "Istniejacy plik SHA: $existingSha"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Log "Plik nie istnieje na GitHub (status: $statusCode) — zostanie utworzony"
}

# --- Upload to GitHub ---
Write-Log "Wysylam liste plikow do GitHub..." "STEP"

$body = @{
    message = "chore: update raw file list [$fileCount files]"
    content = $base64Content
    branch  = "master"
}

if ($existingSha) {
    $body.sha = $existingSha
}

$jsonBody = $body | ConvertTo-Json -Compress
Write-Log "Request body: $($jsonBody.Length) znakow"

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Put -Body $jsonBody -ContentType "application/json; charset=utf-8" -ErrorAction Stop
    Write-Log "SUKCES! Lista $fileCount piosenek wyslana do GitHub." "SUCCESS"
    Write-Log "Commit URL: $($response.commit.html_url)"
    Write-Host ""
    Write-Host "  GitHub Actions automatycznie przetworzy liste" -ForegroundColor Gray
    Write-Host "  i zaktualizuje strone w ciagu kilku minut." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Commit: $($response.commit.html_url)" -ForegroundColor Gray
} catch {
    $statusCode = $null
    $responseBody = $null
    try {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $reader.Close()
    } catch {}

    Write-Log "Nie udalo sie wyslac do GitHub!" "ERROR"
    Write-Log "HTTP Status: $statusCode" "ERROR"
    Write-Log "Response: $responseBody" "ERROR"
    Write-Log "Exception: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    Write-Host ""
    Write-Host "  Sprawdz:" -ForegroundColor Yellow
    Write-Host "  - Czy token jest poprawny i nie wygasl?" -ForegroundColor Yellow
    Write-Host "  - Czy token ma uprawnienie Contents: Read and write?" -ForegroundColor Yellow
    Write-Host "  - Czy repo '$repo' istnieje?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Szczegoly bledu w: $logFile" -ForegroundColor Yellow
    exit 1
}

Write-Log "Zakonczono pomyslnie"
