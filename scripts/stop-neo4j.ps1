# Anantham V2 Native Neo4j Stop Helper (Zero Docker)
Write-Host "Stopping local Neo4j database..." -ForegroundColor Yellow

$conns = Get-NetTCPConnection -LocalPort 7687 -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
    foreach ($p in $pids) {
        Write-Host "Terminating Neo4j process (PID: $p)..." -ForegroundColor Cyan
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No active Neo4j process detected on port 7687." -ForegroundColor Yellow
}

# Verify no process is listening on port 7687
$listening = Get-NetTCPConnection -LocalPort 7687 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Write-Host "Neo4j is successfully stopped (No listeners on port 7687)." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Warning: Port 7687 is still being listened to by PID $($listening.OwningProcess)." -ForegroundColor Red
    exit 1
}
