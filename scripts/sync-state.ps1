# Anantham V2 State Synchronization Script
Write-Host "Synchronizing Anantham V2 state registers..." -ForegroundColor Cyan

# 1. Get current Git commit
$commit = (git rev-parse --short HEAD).Trim()
$fullCommit = (git rev-parse HEAD).Trim()
$timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "Active Git Commit: $commit" -ForegroundColor Yellow

# 2. Update current-state.md with active commit
if (Test-Path "docs/discovery/current-state.md") {
    $content = Get-Content "docs/discovery/current-state.md" -Raw
    $commitLine = "- **Project Commit**: ``$commit``"
    $timeLine = "- **Generated**: ``$timestamp``"
    $content = $content -replace '- \*\*Project Commit\*\*: `[^`]+`', $commitLine
    $content = $content -replace '- \*\*Generated\*\*: `[^`]+`', $timeLine
    Set-Content -Path "docs/discovery/current-state.md" -Value $content -NoNewline
    Write-Host "Updated docs/discovery/current-state.md" -ForegroundColor Green
}

# 3. Run Quality Certification Scorecard
powershell -ExecutionPolicy Bypass -File scripts/certification-scorecard.ps1 -Quiet
Write-Host "Updated docs/governance/scorecard.json" -ForegroundColor Green

Write-Host "State synchronization complete!" -ForegroundColor Cyan
