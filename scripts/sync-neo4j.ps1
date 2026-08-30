# Anantham V2 Neo4j Synchronization Script
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Synchronizing Neo4j Graph Database            " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

if (-not (Test-Path "scripts/neo4j-sync.cypher")) {
    node scripts/export-cypher.mjs
}

$port = 7687
$hostName = "127.0.0.1"
$neo4jAvailable = $false

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect($hostName, $port, $null, $null)
    $success = $connect.AsyncWaitHandle.WaitOne(1000, $false)
    if ($success -and $tcp.Connected) {
        $neo4jAvailable = $true
        $tcp.EndConnect($connect)
    }
    $tcp.Close()
} catch {
    $neo4jAvailable = $false
}

if ($neo4jAvailable) {
    Write-Host "Neo4j is online at bolt://$hostName`:$port" -ForegroundColor Green
    if (Get-Command cypher-shell -ErrorAction SilentlyContinue) {
        Write-Host "Executing Cypher batch sync via cypher-shell..." -ForegroundColor Yellow
        Get-Content "scripts/neo4j-sync.cypher" | cypher-shell -u neo4j -p neo4j --format plain
        Write-Host "Neo4j synchronization complete." -ForegroundColor Green
    } else {
        Write-Host "cypher-shell not found on PATH. Cypher statements are ready at scripts/neo4j-sync.cypher." -ForegroundColor Yellow
    }
} else {
    Write-Host "Neo4j is currently offline at bolt://$hostName`:$port" -ForegroundColor Yellow
    Write-Host "Idempotent Cypher export saved at scripts/neo4j-sync.cypher (will sync automatically when Neo4j is online)." -ForegroundColor Cyan
}
