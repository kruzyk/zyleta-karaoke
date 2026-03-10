# ============================================
# ŻYLETA KARAOKE — Scan & Upload Song List
# ============================================
# This script:
# 1. Reads config from scan-config.json (same folder as this script)
# 2. Scans the karaoke folder for media files
# 3. Uploads the file list to GitHub (data/raw-filelist.json)
# 4. GitHub Actions automatically processes it into the final song list
# ============================================

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Load config ---
$configPath = Join-Path $scriptDir "scan-config.json"
if (-not (Test-Path $configPath)) {
    Write-Host ""
    Write-Host "  BŁĄD: Nie znaleziono pliku konfiguracyjnego!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Skopiuj 'scan-config.example.json' jako 'scan-config.json'" -ForegroundColor Yellow
    Write-Host "  i uzupełnij dane (ścieżka do folderu, GitHub token)." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$folderPath = $config.folderPath
$repo = $config.githubRepo
$token = $config.githubToken
$extensions = $config.fileExtensions

# --- Validate config ---
if (-not (Test-Path $folderPath)) {
    Write-Host "  BŁĄD: Folder '$folderPath' nie istnieje!" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($token) -or $token -match "^(ghp_x+|github_pat_x+|ghp_XXX|github_pat_XXX)$") {
    Write-Host "  BŁĄD: Uzupełnij githubToken w scan-config.json!" -ForegroundColor Red
    Write-Host "  Utwórz token: https://github.com/settings/tokens" -ForegroundColor Yellow
    exit 1
}

# --- Scan folder ---
Write-Host "  Skanuję folder: $folderPath" -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $folderPath -Recurse -File |
    Where-Object { $extensions -contains $_.Extension.ToLower() } |
    ForEach-Object {
        # Get path relative to the scanned folder
        $relativePath = $_.FullName.Substring($folderPath.Length).TrimStart('\', '/')
        @{
            filename = $_.Name
            relativePath = $relativePath
            extension = $_.Extension.ToLower()
            sizeBytes = $_.Length
        }
    }

$fileCount = ($files | Measure-Object).Count

if ($fileCount -eq 0) {
    Write-Host "  UWAGA: Nie znaleziono plików muzycznych w podanym folderze!" -ForegroundColor Yellow
    Write-Host "  Sprawdź ścieżkę w scan-config.json" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Znaleziono $fileCount plików" -ForegroundColor Green
Write-Host ""

# --- Build JSON payload ---
$payload = @{
    scannedAt = (Get-Date -Format "o")
    folderPath = $folderPath
    totalFiles = $fileCount
    files = @($files)
} | ConvertTo-Json -Depth 4 -Compress

$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$base64Content = [Convert]::ToBase64String($payloadBytes)

# --- Check if file already exists on GitHub (need SHA for update) ---
Write-Host "  Łączę z GitHub..." -ForegroundColor Cyan

$apiUrl = "https://api.github.com/repos/$repo/contents/data/raw-filelist.json"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "ZyletaKaraoke-Scanner/1.0"
}

$existingSha = $null
try {
    $existing = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get -ErrorAction SilentlyContinue
    $existingSha = $existing.sha
} catch {
    # File doesn't exist yet — that's fine
}

# --- Upload to GitHub ---
Write-Host "  Wysyłam listę plików do GitHub..." -ForegroundColor Cyan

$body = @{
    message = "chore: update raw file list ($fileCount files)"
    content = $base64Content
    branch = "master"
}

if ($existingSha) {
    $body.sha = $existingSha
}

$jsonBody = $body | ConvertTo-Json -Compress

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Put -Body $jsonBody -ContentType "application/json; charset=utf-8"
    Write-Host ""
    Write-Host "  ✅ SUKCES! Lista $fileCount piosenek wysłana do GitHub." -ForegroundColor Green
    Write-Host ""
    Write-Host "  GitHub Actions automatycznie przetworzy listę" -ForegroundColor Gray
    Write-Host "  i zaktualizuje stronę w ciągu kilku minut." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Commit: $($response.commit.html_url)" -ForegroundColor Gray
} catch {
    Write-Host ""
    Write-Host "  BŁĄD: Nie udało się wysłać do GitHub!" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Sprawdź:" -ForegroundColor Yellow
    Write-Host "  - Czy token jest poprawny?" -ForegroundColor Yellow
    Write-Host "  - Czy token ma uprawnienie 'repo' (Contents: Read and write)?" -ForegroundColor Yellow
    exit 1
}
