# Anantham V2 Graphify Synchronization Script
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Synchronizing Graphify Knowledge Graph        " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

try {
    Write-Host "Re-extracting code and updating knowledge graph..." -ForegroundColor Yellow
    graphify update .
    
    Write-Host "Exporting Neo4j Cypher definitions..." -ForegroundColor Yellow
    node scripts/export-cypher.mjs

    Write-Host "Graphify synchronization complete." -ForegroundColor Green
} catch {
    Write-Host "Warning: Graphify synchronization encountered an exception: $_" -ForegroundColor Yellow
}
