# Anantham V2 Neo4j Synchronization Script (Zero Docker)
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Synchronizing Neo4j Graph Database            " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$neo4jHome = "C:\Users\Sathish\.Neo4jDesktop2\Data\dbmss\dbms-478d0a0c-9ea8-43e0-9012-fc3c2983ccf4"
$cypherShellBin = Join-Path $neo4jHome "bin\cypher-shell.bat"
$neo4jUser = "neo4j"
$neo4jPass = "anantham"
$port = 7687
$hostName = "127.0.0.1"

if (-not (Test-Path "scripts/neo4j-sync.cypher")) {
    node scripts/export-cypher.mjs
}

function Test-Neo4jOnline {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect($hostName, $port, $null, $null)
        $success = $connect.AsyncWaitHandle.WaitOne(1000, $false)
        if ($success -and $tcp.Connected) {
            $tcp.EndConnect($connect)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

if (-not (Test-Neo4jOnline)) {
    Write-Host "Neo4j is currently offline. Starting local DBMS instance..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File scripts/start-neo4j.ps1
}

if (Test-Neo4jOnline) {
    Write-Host "Neo4j is online at bolt://$hostName`:$port" -ForegroundColor Green
    
    $shellCmd = if (Test-Path $cypherShellBin) { $cypherShellBin } elseif (Get-Command cypher-shell -ErrorAction SilentlyContinue) { "cypher-shell" } else { $null }

    if ($shellCmd) {
        Write-Host "Executing Cypher batch sync into Neo4j (user: $neo4jUser)..." -ForegroundColor Yellow
        Get-Content "scripts/neo4j-sync.cypher" | & $shellCmd -u $neo4jUser -p $neo4jPass --format plain
        Write-Host "Neo4j synchronization complete." -ForegroundColor Green
    } else {
        Write-Host "cypher-shell not found. Cypher statements saved at scripts/neo4j-sync.cypher." -ForegroundColor Yellow
    }
} else {
    Write-Host "Could not connect to Neo4j at bolt://$hostName`:$port" -ForegroundColor Red
    Write-Host "Idempotent Cypher export saved at scripts/neo4j-sync.cypher." -ForegroundColor Cyan
}
