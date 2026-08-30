# Anantham V2 CodeGraph Synchronization Script
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Synchronizing CodeGraph Symbol Knowledge Graph" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

try {
    if (-not (Test-Path ".codegraph")) {
        Write-Host "CodeGraph index not found. Initializing CodeGraph..." -ForegroundColor Yellow
        codegraph init . --no-color
    } else {
        Write-Host "Syncing CodeGraph changes..." -ForegroundColor Yellow
        codegraph sync . --no-color
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "CodeGraph successfully synchronized." -ForegroundColor Green
    } else {
        Write-Host "CodeGraph sync completed with warnings (Exit code: $LASTEXITCODE)." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Warning: CodeGraph synchronization encountered an exception: $_" -ForegroundColor Yellow
}
