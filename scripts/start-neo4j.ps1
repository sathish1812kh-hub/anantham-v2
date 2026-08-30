# Anantham V2 Native Neo4j Startup Helper (Zero Docker)
$neo4jHome = "C:\Users\Sathish\.Neo4jDesktop2\Data\dbmss\dbms-478d0a0c-9ea8-43e0-9012-fc3c2983ccf4"
$neo4jBin = Join-Path $neo4jHome "bin\neo4j.bat"
$cypherShellBin = Join-Path $neo4jHome "bin\cypher-shell.bat"
$neo4jUser = "neo4j"
$neo4jPass = "anantham"

function Test-Neo4jReady {
    $listening = Get-NetTCPConnection -LocalPort 7687 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        return $false
    }
    # Test bolt query
    try {
        & $cypherShellBin -u $neo4jUser -p $neo4jPass "RETURN 1;" | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

if (Test-Neo4jReady) {
    Write-Host "Neo4j is already online and ready at bolt://127.0.0.1:7687" -ForegroundColor Green
    exit 0
}

Write-Host "Starting local Neo4j DBMS in the background..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"`"$neo4jBin`" console`"" -WindowStyle Hidden

Write-Host "Waiting for Neo4j to accept connections on port 7687..." -ForegroundColor Yellow
$maxSeconds = 45
for ($i = 0; $i -lt $maxSeconds; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Neo4jReady) {
        Write-Host "Neo4j is fully online, authenticated, and ready!" -ForegroundColor Green
        exit 0
    }
}

Write-Host "Timed out waiting for Neo4j to become ready." -ForegroundColor Red
exit 1
