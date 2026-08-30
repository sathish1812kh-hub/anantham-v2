# Anantham V2 Full Platform Verification Pipeline
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Anantham V2 Full Platform Verification Suite  " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$failed = $false

# 1. Type Check
Write-Host "`n[1/4] Running TypeScript Strict Typecheck..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "Typecheck FAILED!" -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "Typecheck PASSED (0 errors)." -ForegroundColor Green
}

# 2. Vitest Test Runner
Write-Host "`n[2/4] Running Automated Test Suites (Vitest)..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "Automated Tests FAILED!" -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "Automated Tests PASSED." -ForegroundColor Green
}

# 3. TypeScript Build
Write-Host "`n[3/4] Running TypeScript Compilation Build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED!" -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "Build PASSED." -ForegroundColor Green
}

# 4. Quality Certification Scorecard
Write-Host "`n[4/4] Evaluating 1000-Point Quality Scorecard..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/certification-scorecard.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Quality Scorecard did not reach 1000/1000!" -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "Quality Scorecard PASSED (1000/1000 Certified Perfect)." -ForegroundColor Green
}

Write-Host "`n=================================================" -ForegroundColor Cyan
if ($failed) {
    Write-Host "   VERIFICATION PIPELINE FAILED                  " -ForegroundColor Red
    Write-Host "=================================================" -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "   VERIFICATION PIPELINE COMPLETED CLEAN (100%)  " -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    exit 0
}
